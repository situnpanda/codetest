"""Alerts HTTP route slice.

Web/routing layer for the ``/api/AlertRules/*`` endpoints. Business logic lives
in ``domains.alerting``; this module only wires HTTP requests to those
functions and returns the uniform success/error envelope.
"""
import json
import threading

from flask import Blueprint, request
from markupsafe import escape

from shared.dataBase import connectToDw_AADpwd, connectToDw_AADpwd_Write, insert_data
from shared.auth import validateToken
from shared.appinsights_logger import error_response
from shared.utils.userActivityLogging import log_user_activity
from domains.alerting.alertRulesSupport import updateRecord
from domains.alerting.alertRulesRead import readAlertRule
from domains.alerting.alertRulesUpdate import (
    updateVmAlerts_main,
    updateMaintenanceTag,
    updateVmDb_main,
    updateServices_main,
    updateFilestorageDb_main,
)

alerts_bp = Blueprint("alerts", __name__, url_prefix="/api/AlertRules")


@alerts_bp.route("/AcknowledgeAlert", methods=["GET"])
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


@alerts_bp.route("/ReadAlertRules", methods=["POST"])
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


@alerts_bp.route("/UpdateAlertRules", methods=["POST"])
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


@alerts_bp.route("/MaintenanceTagUpdate", methods=["POST"])
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
