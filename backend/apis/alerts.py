import base64
import json
import pyodbc
import threading

import requests
import pandas
from datetime import datetime

from flask import Blueprint, request, jsonify
from markupsafe import escape

from shared.keyVault import connectToKeyVault
from shared.dataBase import connectToDw_AADpwd, connectToDw_AADpwd_Write, connectToDw_SqlServerPwd, queryDw, insert_data, openConnection
from shared.auth import validateToken
from shared.utils.userActivityLogging import log_user_activity
from domains.metrics.infrastructure.infrastructureTelemetry import serverUptime, TagComplianceData
from domains.alerting.alertRulesSupport import updateRecord
from domains.alerting.alertRulesRead import readAlertRule
from domains.alerting.alertRulesUpdate import updateVmAlerts_main, updateMaintenanceTag, updateVmDb_main, updateServices_main, updateFilestorageDb_main

alerts_bp = Blueprint("alerts", __name__)


@alerts_bp.route('/api/createUserStoryForCustomThresold', methods=['POST'])
def createUserStoryForCustomThresold():
    data = request.json
   
    print("Received data:", data)
   
    organization = "PSJH"
    project = "CRCA"
    # pwd = connectToKeyVault("servCRCAMonitoring")
    personal_access_token = connectToKeyVault("personal-access-token-iTelemetry")
    base_url = f" https://dev.azure.com/{organization}/{project}/_apis/wit/workitems/$User Story?api-version=6.0"

    applicationCI = data.get('applicationCI')
    customThreshold = data.get('customThreshold')
    comments = data.get('comments')
    requestor = data.get('requestor')
    alertType = data.get('alertType')
    request_body = [
        {
            "op": "add",
            "path": "/fields/System.Title",
            "value": f"GAC Custom Threshold Request" # title of user story
        },
        {
            "op": "add",
            "path": "/fields/System.Description",
            "value": f"""
            
            <b>Application CI : </b> {applicationCI} <br>
            <b>Alert Type : </b> {alertType} <br>
            <b>Custom Threshold : </b> {customThreshold} <br>
            <b>submitted by : </b> {requestor} <br>
            <b>Additional Comments : </b> {comments} <br>
            <p>Validate and change the threshold as requested</p>
            """
        },
        {
            "op": "add",
            "path": "/fields/Microsoft.VSTS.Common.AcceptanceCriteria",
            "value": "Custom Threshold Set for given App CI"
        },
        {
            "op": "add",
            "path": "/fields/Microsoft.VSTS.Scheduling.StoryPoints",
            "value": 1
        },
        {
            "op": "add",
            "path": "/fields/System.AreaPath",
            "value": "CRCA\SI\Monitoring"        }
    ]
    headers = {
        "Content-Type": "application/json-patch+json",
         "Authorization": "Basic " + base64.b64encode(f":{personal_access_token}".encode()).decode()
    }
    response = requests.post(base_url, json=request_body, headers=headers)
    if response.status_code == 200:
        created_user_story = json.loads(response.content.decode())
        user_story_id = created_user_story["id"]
        print(f"User story created successfully with ID: {user_story_id} - for {applicationCI}")
        return jsonify({"message": f"User story created successfully with ID: {user_story_id}"})
    else:
        print(f"Error creating user story for {applicationCI}")
        print(f"Response: {response.text}")
    return {"responseCode": response.status_code}


@alerts_bp.route('/api/createUserStory', methods=['POST'])
def create_user_story():
    data = request.json
   
    print("Received data:", data)
   
    organization = "PSJH"
    project = "CRCA Services"
    # pwd = connectToKeyVault("servCRCAMonitoring")
    personal_access_token = connectToKeyVault("personal-access-token-iTelemetry")
    base_url = f" https://dev.azure.com/{organization}/{project}/_apis/wit/workitems/$User Story?api-version=6.0"

    resourceName = data.get('resourceName')
    applicationId = data.get('applicationId')
    applicationCI = data.get('applicationCI')
    nonCompliantTags = data.get("nonCompliantTags")

    # nct = ", ".join(nonCompliantTags.keys())
    nct = ", ".join(f"{key.capitalize()}" for key in nonCompliantTags.keys())

    print("Received data:", nct)
    request_body = [
        {
            "op": "add",
            "path": "/fields/System.Title",
            "value": f"Azure Tag Remediation - {resourceName}" # title of user story
        },
        {
            "op": "add",
            "path": "/fields/System.Description",
            "value": f"""
            <b>ResourceName : </b> {resourceName}<br>
            <b>Application ID : </b> {applicationId} <br>
            <b>Application CI : </b> {applicationCI} <br><br>
            <p>The tags which need Remediation are <b>{nct}</b></p><br>
            """
        },
        {
            "op": "add",
            "path": "/fields/Microsoft.VSTS.Common.AcceptanceCriteria",
            "value": "Resource is remediated and is Tag compliant"
        },
        {
            "op": "add",
            "path": "/fields/Microsoft.VSTS.Scheduling.StoryPoints",
            "value": 0.5
        },
        {
            "op": "add",
            "path": "/fields/System.AreaPath",
            "value": "CRCA\SI\Monitoring"
        }
    ]
 
    headers = {
        "Content-Type": "application/json-patch+json",
         "Authorization": "Basic " + base64.b64encode(f":{personal_access_token}".encode()).decode()
    }
   
 
    response = requests.post(base_url, json=request_body, headers=headers)
 
    # Handle response
    if response.status_code == 200:
        created_user_story = json.loads(response.content.decode())
        user_story_id = created_user_story["id"]
        print(f"User story created successfully with ID: {user_story_id} - for {resourceName}")
        return jsonify({"message": f"User story created successfully with ID: {user_story_id}"})
    else:
        print(f"Error creating user story for {resourceName}")
        print(f"Response: {response.text}")
       
    return {"responseCode": response.status_code}
 
def create_task(user_story_id, title, desc, org_estimate, rem_estimate, sg, personal_access_token):
    task_endpoint = f" https://dev.azure.com/PSJH/CRCA Services/_apis/wit/workitems/$Task?api-version=6.0"
 
    task_request_body = [
        {
            "op": "add",
            "path": "/fields/System.Title",
            "value": title
        },
        {
            "op": "add",
            "path": "/fields/System.Description",
            "value": desc
        },
        {
            "op": "add",
            "path": "/fields/Microsoft.VSTS.Scheduling.OriginalEstimate",
            "value": org_estimate
        },
        {
            "op": "add",
            "path": "/fields/Microsoft.VSTS.Scheduling.RemainingWork",
            "value": rem_estimate
        },
        {
            "op": "add",
            "path": "/fields/Custom.ApplicationSupportGroup",
            "value": sg
        }
    ]
 
    headers = {
        "Content-Type": "application/json-patch+json",
        "Authorization": "Basic " + base64.b64encode(f":{personal_access_token}".encode()).decode()
    }

    response = requests.post(task_endpoint, json=task_request_body, headers=headers)

   
    if response.status_code == 200:
        created_task = json.loads(response.content.decode())
        task_id = created_task["id"]
        print(f"Task '{title}' created successfully with ID: {task_id}")
 
    else:
        print(f"Error creating task '{title}'")
        print(f"Response: {response.text}")


@alerts_bp.route('/api/setCustomThreshold',methods=["GET","POST"])
def setCustomThreshold():
    data = request.json
    appci = data.get('appci').lower()
    type = data.get('type').lower()
    threshold = data.get('threshold')
    changedby = data.get('changedby')
    comments = data.get('comments')
    modifieddate = data.get('modifieddate')
    print(data)
    connectionString = connectToDw_AADpwd_Write("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    query = "insert into customthreshold values (?, ?, ?, ?, ?, ?)"
    try:
        with openConnection(connectionString) as conn:
            with conn.cursor() as cursor:
                cursor.execute(query, (appci, type, threshold, changedby, comments, modifieddate))
                conn.commit()
                print("Inserted Custom Threshold successfully") 
        # caching_AlertsInfraList()
        return {'message':'Success..'}
    
    except Exception as e:
        print(f"Error inserting request: {e}")
        return jsonify({"message": "There was an error submitting the request. Please try again!"}), 500
    finally:
        if conn:
            conn.close()


@alerts_bp.route('/api/serverUptime', methods=["POST"])
def getServerUptime():
    dataPost = request.get_json()
    serverName=""
    if('serverName' in dataPost):
        serverName = dataPost.get('serverName')
        if(not("'" in serverName)):
            s= ""
            for i in serverName.split(','):
                s+="'"+i+"',"
            s=s[0:-1]
            # print(s)
            serverName = s
    print("Servername in suerver uptime: ",serverName)
    logsData = {}
    df = serverUptime(serverName)
    logsData = {"ServerUptime": df.to_json()}
    print("Uptime data returned in main: ",logsData)
    return jsonify(logsData)


@alerts_bp.route('/api/TagCompliance', methods=["POST"])
def azureTagCompliance():
    dataPost = request.get_json()

    serverName = ""
    if 'serverName' in dataPost:
        serverName = dataPost.get('serverName')
        if not ("'" in serverName):
            s = ""
            for i in serverName.split(','):
                s += "'" + i + "',"
            s = s[0:-1]
            serverName = s
    elif('filters' in dataPost):
        filters = dataPost["filters"]
        sqlQuery = f"""
                        SELECT distinct LOWER(cmdbci.[name]) AS ServerName FROM   
                        [ServicePerf_DW].[dbo].[vw_sn_cmdb_ci_server] AS cmdbci
                        INNER JOIN  
                        vw_SN_Appl_Relationship AS AppRelation ON AppRelation.RelationshipID = cmdbci.sys_id
                        INNER JOIN  
                        vw_SN_cmdb_ci_business_app AS BusinessApp ON BusinessApp.sys_id = AppRelation.ApplicationID
                        WHERE       
                        (BusinessApp.portfolio_name = 'Clinical & Revenue Cycle Apps (CRCA)'
                        OR BusinessApp.[apm_application_family_name] LIKE 'Cromwell')
                        AND BusinessApp.active = 'true'
                        AND AppRelation.Relationship = 'Runs on'
                        AND cmdbci.operational_status_label in ('Operational', 'Repair in Progress', 'VM Terminated', 'Sleep Test in Progress')
                        AND BusinessApp.[name] IN (?)
                    """
        
        #connect to DB
        connectToServicePerf = connectToDw_SqlServerPwd("spidedbsv6c6b60.wa.providence.org\\SPIDER", "ServicePerf_DW","servCRCAMonitor")
        
        #query
        result = queryDw(connectToServicePerf, sqlQuery, (filters["appCI"],))
        s=""
        for i in result:
            s+="'"+i[0]+"',"
        serverName=s[0:-1]
        
    logsData = {}

    tag_df = TagComplianceData(serverName.lower())

    if tag_df is None:
        logsData["TagCompliance"] = []  # Returning an empty list if no data is found
    else:
        logsData["TagCompliance"] = tag_df.to_json()

    return jsonify(logsData)


@alerts_bp.route("/api/AlertRules/AcknowledgeAlert", methods=["GET"])
def AcknowledgeAlert():
    id = request.args.get("id","")
    resourceId = request.args.get("resourceId","")
    metricType = request.args.get("metricType","")
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
        appFamily = data.get("applicationFamily","")
        print(appFamily)
    except Exception as ex:
        # Call the function to insert exception
        print("Data Fetched failed")
    
    connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    alertData, status = readAlertRule(appFamily, connectionString)
    
    return {"Data":alertData, "status":status}
    

@alerts_bp.route("/api/AlertRules/UpdateAlertRules", methods=["POST"])
def updateAlertRules():
    emailId = ""
    try:
        auth = request.headers.get("Authorization")
        if not (auth and len(auth.split(" ")) == 2 and auth.split(" ")[0] == "Bearer"):
            return {"Message": "Invalid Session Token", "status":501}

        token = auth.split(" ")[1]
        res,emailId = validateToken(token)
        if not res:
            return {"Message": "Invalid Session Token", "status":501}
 
    except Exception as e:
        print(f"Auth error: {e}")
        return {"Message": "Invalid Session Token", "status":501}
    
    print("Valid Token")
    
    data = request.get_json()
    appFamily = data.get("applicationFamily","")
    alertData = data.get("data",{})
    exceptionLogs = {}
    activityLog = {
        "data" : json.dumps(data),
        "emailID" : emailId,
        "featureName" : "Alert Rules Update",
        "exception" : ""
    }
    connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    connectionString_write = connectToDw_AADpwd_Write("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    
    # alertDataRead = readAlertRule(appFamily, connectionString)
    allResourceName = {} 

    # print(allResourceName)
    threads = [
        threading.Thread(target=updateVmAlerts_main, args = (connectionString, connectionString_write, appFamily, alertData, allResourceName, exceptionLogs)),
        threading.Thread(target=updateVmDb_main, args = (connectionString, connectionString_write, appFamily, alertData, allResourceName, exceptionLogs)),
        threading.Thread(target=updateServices_main, args = (connectionString, connectionString_write, appFamily, alertData, allResourceName, exceptionLogs)), 
        threading.Thread(target=updateFilestorageDb_main, args = (connectionString, connectionString_write, appFamily, alertData, allResourceName, exceptionLogs)),               
    ]
    
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
        
    # print(exceptionLogs)
    # updateAlertRule(connectionString, connectionString_write, appFamily, alertData, allResourceName)
    if(len(exceptionLogs.keys())>0):
        print(exceptionLogs)
        exData = {
            "UserName" : "",
            "PageName" : "alertRulesUpdate.py",
            "LineNumber" : "",
            "ExceptionMessage" : json.dumps(exceptionLogs)
        }
        activityLog["exception"] = json.dumps(exceptionLogs)
        log_user_activity(activityLog)
        insert_data(exData)
        return {"Message":exceptionLogs, "status":501}
    
    log_user_activity(activityLog)
    return {"Message":"Success", "status":200}


@alerts_bp.route("/api/AlertRules/MaintenanceTagUpdate", methods=["POST"])
def maintenanceTag():
    data = request.get_json()
    alertSuppressData = data["data"]
    threads = []
    connectionString_write = connectToDw_AADpwd_Write("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")

    for metric in alertSuppressData:
        if(len(metric)==1):
            res = "'("+ data[metric][0]+")'"
        else:
            res = tuple(data[metric])
        threads.append(threading.Thread(target=updateMaintenanceTag, args = (connectionString_write, res, metric,)))
        
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    return {"Message":"Pass", "status":200}
    
    
@alerts_bp.route("/api/audit/earlyWarningStateUpdates", methods=["GET"])
def get_early_warning_state_updates():
    try:
        connectionString = connectToDw_AADpwd(
            "sqldb-azure-prod-012.database.windows.net",
            "crcamonitoring",
            "servCRCAMonitoring@providence.org"
        )

        sqlQuery = """
            SELECT
                [Time Generated],
                [Email ID],
                [Feature Name],
                [Data],
                [Exception]
            FROM [User Activity Logs]
            WHERE [Feature Name] = 'Early Warning State Update'
            ORDER BY [Time Generated] DESC
        """

        with openConnection(connectionString) as conn:
            with conn.cursor() as cursor:
                cursor.execute(sqlQuery)
                result = cursor.fetchall()
                column_names = [desc[0] for desc in cursor.description] if cursor.description else []

        rows = []
        for row in result:
            row_values = []
            try:
                row_values = list(row)
            except Exception:
                row_values = [row]

            row_dict = {}
            for i, col in enumerate(column_names):
                value = row_values[i] if i < len(row_values) else None
                if isinstance(value, datetime):
                    value = str(value)
                row_dict[col] = value
            rows.append(row_dict)

        df_res = pandas.DataFrame(rows)

        return jsonify({"Data": df_res.to_json(), "status": 200}), 200

    except Exception as ex:
        print("Exception in get_early_warning_state_updates:")
        print(ex)
        return jsonify({"Data": "[]", "status": 501, "Message": str(ex)}), 501
