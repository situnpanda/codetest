"""Alerts HTTP route slice (consolidated).

Web/routing layer for the ``/api/AlertRules/*`` endpoints and the alert-manager /
maintenance operational endpoints. Business logic lives in ``domains.alerts``
and ``domains.metrics.infrastructure``; this module only wires HTTP requests to
those functions and returns the uniform success/error envelope.
"""
import json
import threading
from datetime import datetime

from flask import Blueprint, request
from markupsafe import escape

from shared.dataBase import (
    connectToDw_AADpwd,
    connectToDw_AADpwd_Write,
    connectToDw_SqlServerPwd,
    queryDw,
    openConnection,
    insert_data,
)
from shared.auth import validateToken
from shared.appinsightsLogger import error_response
from shared.userActivityLogging import log_user_activity
from domains.alerts.alertRulesSupport import updateRecord
from domains.alerts.alertRulesRead import readAlertRule
from domains.alerts.alertRulesUpdate import (
    updateVmAlerts_main,
    updateMaintenanceTag,
    updateVmDb_main,
    updateServices_main,
    updateFilestorageDb_main,
)
from domains.metrics.infrastructure.infrastructureTelemetry import (
    userfilterAlertManager,
    find_servers_by_name,
    alertfilterdf,
)

alerts_bp = Blueprint("alerts", __name__)


@alerts_bp.route("/api/AlertRules/AcknowledgeAlert", methods=["GET"])
def AcknowledgeAlert():
    id = request.args.get("id", "")
    resourceId = request.args.get("resourceId", "")
    metricType = request.args.get("metricType", "")
    print(id, resourceId, metricType)
    # return "Acknowledged"
    try:
        updateRecord(str(id))
        return f"The alert has been successfully acknowledged. The team will no longer receive alerts for resource {escape(str(resourceId))} concerning the {escape(str(metricType))} metric in the next half an hour."
    except Exception as ex:
        print(ex)
        # Call the function to insert exception
        return f"Failed"


@alerts_bp.route("/api/AlertRules/ReadAlertRules", methods=["POST"])
def readAlertRules():
    try:
        data = request.get_json()
        appFamily = data.get("applicationFamily", "")
        print(appFamily)
    except Exception as ex:
        # Call the function to insert exception
        print("Data Fetched failed")

    connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    alertData, status = readAlertRule(appFamily, connectionString)

    return {"status": status, "Data": alertData, "meta": {}, "error": None}


@alerts_bp.route("/api/AlertRules/UpdateAlertRules", methods=["POST"])
def updateAlertRules():
    emailId = ""
    try:
        auth = request.headers.get("Authorization")
        if not (auth and len(auth.split(" ")) == 2 and auth.split(" ")[0] == "Bearer"):
            return error_response(501, "Invalid Session Token")

        token = auth.split(" ")[1]
        res, emailId = validateToken(token)
        if not res:
            return error_response(501, "Invalid Session Token")

    except Exception as e:
        print(f"Auth error: {e}")
        return error_response(501, "Invalid Session Token", exc=e)

    print("Valid Token")

    data = request.get_json()
    appFamily = data.get("applicationFamily", "")
    alertData = data.get("data", {})
    exceptionLogs = {}
    activityLog = {
        "data": json.dumps(data),
        "emailID": emailId,
        "featureName": "Alert Rules Update",
        "exception": ""
    }
    connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    connectionString_write = connectToDw_AADpwd_Write("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")

    # alertDataRead = readAlertRule(appFamily, connectionString)
    allResourceName = {}

    # print(allResourceName)
    threads = [
        threading.Thread(target=updateVmAlerts_main, args=(connectionString, connectionString_write, appFamily, alertData, allResourceName, exceptionLogs)),
        threading.Thread(target=updateVmDb_main, args=(connectionString, connectionString_write, appFamily, alertData, allResourceName, exceptionLogs)),
        threading.Thread(target=updateServices_main, args=(connectionString, connectionString_write, appFamily, alertData, allResourceName, exceptionLogs)),
        threading.Thread(target=updateFilestorageDb_main, args=(connectionString, connectionString_write, appFamily, alertData, allResourceName, exceptionLogs)),
    ]

    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    # print(exceptionLogs)
    # updateAlertRule(connectionString, connectionString_write, appFamily, alertData, allResourceName)
    if(len(exceptionLogs.keys()) > 0):
        print(exceptionLogs)
        exData = {
            "UserName": "",
            "PageName": "alertRulesUpdate.py",
            "LineNumber": "",
            "ExceptionMessage": json.dumps(exceptionLogs)
        }
        activityLog["exception"] = json.dumps(exceptionLogs)
        log_user_activity(activityLog)
        insert_data(exData)
        return error_response(501, "Failed to update alert rules", detail=json.dumps(exceptionLogs))

    log_user_activity(activityLog)
    return {"status": 200, "Data": "Success", "meta": {}, "error": None}


@alerts_bp.route("/api/AlertRules/MaintenanceTagUpdate", methods=["POST"])
def maintenanceTag():
    data = request.get_json()
    alertSuppressData = data["data"]
    threads = []
    connectionString_write = connectToDw_AADpwd_Write("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")

    for metric in alertSuppressData:
        if(len(metric) == 1):
            res = "'(" + data[metric][0] + ")'"
        else:
            res = tuple(data[metric])
        threads.append(threading.Thread(target=updateMaintenanceTag, args=(connectionString_write, res, metric,)))

    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    return {"status": 200, "Data": "Pass", "meta": {}, "error": None}


@alerts_bp.route('/api/appValidationAlertConfig', methods=["POST"])
def app_validation_alert_config():
    data = request.get_json()
    app_cis = data.get('appCIs', [])
    if not app_cis or not isinstance(app_cis, list):
        return error_response(400, "appCIs must be a non-empty list")

    app_cis_sql = ",".join([f"'{ci}'" for ci in app_cis])
    query = f"""
        SELECT [AppFamily], [AppCI], [ServerName], [MaintenanceEnabled]
        FROM [AppValidationAlertConfiguration]
        WHERE [AppCI] IN ({app_cis_sql})
    """
    connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    result = queryDw(connectionString, query)

    config_data = []
    if result:
        for row in result:
            config_data.append(dict(zip([
                "AppFamily", "AppCI", "ServerName", "MaintenanceEnabled"
            ], row)))

    return {"status": 200, "Data": config_data, "meta": {}, "error": None}


@alerts_bp.route('/api/getUserWatchlistAlertManager', methods=['POST'])
def getUserWatchListAlertManager():

    connectToServicePerf = connectToDw_SqlServerPwd("spidedbsv6c6b60.wa.providence.org\\SPIDER", "ServicePerf_DW","servCRCAMonitor")
    user_filters = userfilterAlertManager(connectToServicePerf)
    return {"status": 200, "Data": user_filters, "meta": {}, "error": None}


@alerts_bp.route('/api/submitMaintenance', methods=['POST'])
def submit_maintenance():
    try:
        
        auth = request.headers.get("Authorization")
        if not (auth and len(auth.split(" ")) == 2 and auth.split(" ")[0] == "Bearer"):
            return error_response(501, "Invalid Token")
        
        token = auth.split(" ")[1]
        res,emailId = validateToken(token)
        if not res:
            return error_response(501, "Invalid Token")
 
    except Exception as e:
        print(f"Auth error: {e}")
        return error_response(501, "Invalid Token", exc=e)
 
   
    form_data = request.get_json()
    user_email = form_data.get('mailAdd')
    app_family = form_data.get('appFamily')
    app_ci = form_data.get('appCI')
    server_names = form_data.get('serverName')
    justification = form_data.get('justification')
    start_time = form_data.get('startTime')
    end_time = form_data.get('endTime')
    recurrence = form_data.get('selectedFrequency') or "OneTime"
    distributionList = form_data.get('distributionList')
 
    # --- Validate required fields
    required_fields = [user_email, justification, start_time, end_time, server_names, app_family, app_ci, distributionList]
    if any(field is None or (isinstance(field, list) and len(field) == 0) for field in required_fields):
        return error_response(400, "Please complete all required fields.")
 
    # --- Format dates ---
    try:
        start_time_dt = datetime.strptime(start_time, "%d-%m-%Y %H:%M").strftime("%Y-%m-%d %H:%M:%S")
        end_time_dt = datetime.strptime(end_time, "%d-%m-%Y %H:%M").strftime("%Y-%m-%d %H:%M:%S")
    except ValueError:
        return error_response(400, "Invalid date format.")
 
    # --- Find server details (custom helper) ---
    servers = find_servers_by_name(server_names)
    if not servers:
        return error_response(404, "No servers found")
 
    # --- Database Connection ---
    connectionString = connectToDw_AADpwd_Write(
        "sqldb-azure-prod-012.database.windows.net",
        "crcamonitoring",
        "servCRCAMonitoring@providence.org"
    )
 
    try:
        conn = openConnection(connectionString)
        cursor = conn.cursor()
 
        # Call Stored Procedure
        server_details_json = json.dumps(servers)
        app_ci_json = json.dumps(app_ci)
 
        cursor.execute("""
            EXEC usp_InsertMaintenanceRequest
                @serverDetails = ?,
                @startTime = ?,
                @endTime = ?,
                @status = ?,
                @appFamily = ?,
                @userEmail = ?,
                @justification = ?,
                @appCI = ?,
                @recurrence = ?,
                @distributionList = ?
        """,
        (
            server_details_json,
            start_time_dt,
            end_time_dt,
            'pending',
            app_family,
            user_email,
            justification,
            app_ci_json,
            recurrence,
            distributionList
        ))
 
        conn.commit()
        print("Maintenance request inserted successfully via stored procedure.")
 
        return {"status": 200, "Data": "Maintenance request submitted successfully!", "meta": {}, "error": None}, 200
 
    except Exception as e:
        print(f"Error executing stored procedure: {e}")
        return error_response(500, "There was an error submitting the request. Please try again!", exc=e)
 
    finally:
        if conn:
            conn.close()


@alerts_bp.route('/api/filteralertmanagement', methods=["POST"])
def filteralertmanagement():
    try:
        #hosting_type = request.json.get('hostingType')  # Get the hosting type from the request body
        email = request.json.get('mailAdd')
        
        #print(f"Hosting Type selected: {hosting_type}")
        print(f"The mail is {email}")
        
        connectToServicePerf = connectToDw_SqlServerPwd("spidedbsv6c6b60.wa.providence.org\\SPIDER", "ServicePerf_DW", "servCRCAMonitor")
        connectionStringAzure = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
        
        filters = alertfilterdf(connectToServicePerf, email, connectionStringAzure)  # Pass hosting type to filter data
        return {"status": 200, "Data": filters, "meta": {}, "error": None}
    
    except Exception as e:
        return error_response(500, "An unexpected error occurred", detail=str(e), exc=e)
