"""Misc HTTP route slice (consolidated).

Web/routing layer for platform/system endpoints (UiPath run-process, telemetry
proxy, secrets, Log Analytics access check), user/performance metrics, resource
compliance events, infra alerts, and service-request logging. Business logic
lives in ``domains.metrics.*`` and ``shared.*``; this module only wires HTTP
requests to those functions and returns the uniform success/error envelope.
"""
import base64
import json
import os
import pyodbc
import requests
from datetime import datetime

import pandas
from flask import Blueprint, request, jsonify, Response

import shared.appinsightsLogger as appinsights_logger
from shared.appinsightsLogger import log_performance, error_response
from shared.environment import ENVIRONMENT
from shared.adx import ADX_CLUSTER, ADX_DATABASE
from shared.keyVault import connectToKeyVault
from shared.dataBase import (
    connectToDw_AADpwd,
    connectToDw_AADpwd_Write,
    connectToDw_SqlServerPwd,
    queryDw,
    openConnection,
)
from shared.logAnalytics import queryInLogAnalytics
from shared.filters import getFiltersFromCache
from domains.metrics.infrastructure.userMetrics import get_user_metrics, get_performance_metrics
from domains.metrics.infrastructure.resourceComplianceMetrics import get_infra_events
from domains.metrics.infrastructure.infrastructureTelemetry import sendEmail, infraAlerts, serverUptime, TagComplianceData

misc_bp = Blueprint("misc", __name__)


@misc_bp.route("/api/environment", methods=["GET"])
def getBackendEnvironment():
    """Read-only: which environment this backend resolved at startup (no secrets)."""
    info = {
        "environment": ENVIRONMENT,
        "deploymentEnvSet": bool((os.getenv("DEPLOYMENT_ENV") or "").strip()),
        "appInsightsEnabled": appinsights_logger._logger_provider is not None,
        "adxCluster": ADX_CLUSTER,
        "adxDatabase": ADX_DATABASE,
    }
    return {"status": 200, "Data": json.dumps(info), "meta": {}, "error": None}


@misc_bp.route('/api/run-process', methods=['POST'])
def run_process():
    body = request.json
    token = body.get('token')
    args = body.get('inputArgs')
    app_family = body.get('appFamily', 'aria').lower()
    if not token:
        client_secret = connectToKeyVault('iTelemetry-runButton')
        if not client_secret:
            return error_response(500, "Failed to retrieve client secret from Key Vault")
        token_res = requests.post(
            'https://cloud.uipath.com/identity_/connect/token',
            headers={'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json'},
            data={
                'grant_type': 'client_credentials',
                'client_id': 'e217fa3f-1cde-4c6a-ab73-f041794e2d83',
                'client_secret': client_secret,
                'scope': 'OR.Jobs.Write'
            }
        )
        if token_res.status_code != 200:
            return error_response(401, "Failed to get UiPath token", detail=token_res.text)
        token = token_res.json().get('access_token')

    input_args_string = f'"{str(args).strip()}"'

    connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    config_query = f"SELECT [ApplicationFamily], [ReleaseKey], [ReleaseName], [RobotID], [OrgUnitID] FROM [ValidationConfiguration] WHERE LOWER([ApplicationFamily]) = '{app_family}'"
    config_result = queryDw(connectionString, config_query)

    if not config_result or len(config_result) == 0:
        return error_response(400, f"No configuration found for app family: {app_family}")

    config_row = config_result[0]
    release_key_secret_name = config_row[1]
    release_name = config_row[2]
    robot_ids = [config_row[3]]
    org_unit_id = str(config_row[4])

    release_key = connectToKeyVault(release_key_secret_name)
    if not release_key:
        return error_response(500, f"Failed to retrieve release key from Key Vault for: {release_key_secret_name}")

    print(f"Config loaded - Family: {app_family}, ReleaseName: {release_name}, RobotIds: {robot_ids}, OrgUnitId: {org_unit_id}")

    payload_str = f'''
    {{
      "startInfo": {{
        "ReleaseKey": "{release_key}",
        "ReleaseName": "{release_name}",
        "Strategy": "Specific",
        "RobotIds": {robot_ids},
        "Source": "Manual",
        "InputArguments": {input_args_string}
      }}
    }}
    '''

    print("Payload string to send:\n", payload_str)

    r = requests.post(
        'https://cloud.uipath.com/providence/Shared/orchestrator_/odata/Jobs/UiPath.Server.Configuration.OData.StartJobs',
        headers={
            'Accept': 'application/json',
            'Content-Type': 'application/json;odata.metadata=minimal;odata.streaming=true',
            'X-UIPATH-OrganizationUnitId': org_unit_id,
            'Authorization': f'Bearer {token}'
        },
        data=payload_str
    )
    return {"status": r.status_code, "Data": r.text, "meta": {}, "error": None}, r.status_code


@misc_bp.route("/api/telemetryAppInsights", methods=["POST"])
def telemetry_proxy():
    AI_ENDPOINT = "https://dc.services.visualstudio.com/v2/track"
    try:

        payload = request.get_data()
        print("The payload is", payload)

        resp = requests.post(AI_ENDPOINT, data=payload, headers={"Content-Type": request.headers.get("Content-Type", "application/json")}, timeout=5,)
        print("The res is", resp)

        return Response(resp.content, status=resp.status_code, content_type=resp.headers.get("Content-Type", "application/json"),)

    except Exception as e:
        print("Exception")
        return jsonify({"error": "Failed to forward telemetry"}), 500


@misc_bp.route('/api/getSecrets', methods=["POST"])
def getSecrets():
    data = request.json
    secret_name = data.get("secretName")

    if not secret_name:
        return error_response(400, "Secret name not provided")
    secret_value = connectToKeyVault(secret_name)

    if not secret_value:
        return error_response(404, "Secret not found")

    return {"status": 200, "Data": secret_value, "meta": {}, "error": None}, 200


@misc_bp.route('/api/checkLogAnalyticsAccess', methods=["GET"])
def checkLogAnalyticsAccess():

    logAnalyticsQuery = f"""Perf
            | where TimeGenerated > ago(1d) and ObjectName == "Processor"
            and CounterName == "% Processor Time"
            and InstanceName =~ "_Total"
            and _SubscriptionId in ("ab16a144-47d7-45c5-bcb7-8affc988f8e0", "9592c342-d1fb-477e-8e91-ad39bf00933b", "5467bf57-48b4-4930-b3cb-bf039b259d04", "343a7ee0-5081-4024-82fc-498ee61867a9", "6d590d81-bab9-4b9a-b011-090467b5a9a4", "accde124-a45f-47be-aefa-b09362b2c5fc")
            | extend resourceIdSpilt=split(_ResourceId, '/')
            | extend
            SubscriptionId=tostring(resourceIdSpilt[2]),
            ResourceGroup=tostring(resourceIdSpilt[4]),
            ServerName=tolower(tostring(resourceIdSpilt[8]))
            | extend SubRg = strcat(SubscriptionId, "/", ResourceGroup)
            | distinct SubRg, ServerName
            """

    workspaceId = "552b9630-b106-4fe7-a1fa-97d04a0010ef"
    serverStatus = queryInLogAnalytics(workspaceId, logAnalyticsQuery, "", "")

    return {"status": 200, "Data": serverStatus.to_json(), "meta": {}, "error": None}


@misc_bp.route("/api/infrastructureMetrics/userMetrics", methods=["GET"])
@log_performance()
def getUserMetrics():
    try:
        return get_user_metrics()
    except Exception as ex:
        return error_response(501, "Failed to fetch user metrics", exc=ex)


@misc_bp.route("/api/infrastructureMetrics/performanceMetrics", methods=["GET"])
@log_performance()
def getPerformanceMetrics():
    try:
        days = request.args.get("days", 7)
        return get_performance_metrics(days)
    except Exception as ex:
        return error_response(501, "Failed to fetch performance metrics", exc=ex)


@misc_bp.route('/api/infraEvents', methods=["POST"])
@log_performance()
def get_infra_events_route():
    try:
        data = request.get_json() or {}
        return get_infra_events(data)
    except Exception as ex:
        return error_response(500, "Failed to fetch resource compliance events", exc=ex)


@misc_bp.route('/api/infraAlerts', methods = ['POST'])
def alertsInfra():

    dataPost = request.get_json()

    aggregateBool = dataPost.get('aggregate')  # Retrieve the value of the 'limit' parameter
    filter = dataPost.get('filters')
    start_time = dataPost.get('start_time')  # Retrieve the value of the 'start_time' parameter
    end_time = dataPost.get('end_time')  # Retrieve the value of the 'end_time' parameter
    
    apmNumber = getFiltersFromCache(filter, "apmNumber")

    logsData = dict()

    connectToServicePerf = connectToDw_SqlServerPwd("spidedbsv6c6b60.wa.providence.org\\SPIDER", "ServicePerf_DW","servCRCAMonitor")
    alertsData = infraAlerts(apmNumber, aggregateBool, connectToServicePerf, start_time, end_time)
    logsData["AlertsData"] = alertsData["alertsList"].to_json()
    return {"status": 200, "Data": alertsData["alertsList"].to_json(), "meta": {}, "error": None}


@misc_bp.route("/api/logServiceRequests", methods=["POST"])
def logServiceRequests():
    print("inside log requests")
    dataPost = request.get_json()
    name = dataPost.get('userName')
    serviceType = dataPost.get('serviceType')
    supportGroups = dataPost.get('supportGroups')
    status = dataPost.get('status')

    print("The existing pyodbc drivers are:", pyodbc.drivers())

    connectionString = connectToDw_AADpwd_Write("sqldb-azure-prod-012.database.windows.net","crcamonitoring","servCRCAMonitoring@providence.org")
    print("The connection string is ", connectionString)
    
    conn = openConnection(connectionString)

    try:
        
        cursor = conn.cursor()
        insert_query = """insert into ServiceRequest (TimeGenerated, [User Name], [Service Type], [Data], [Status]) VALUES (?, ?, ?, ?, ?)"""
        cursor.execute(insert_query, (datetime.now(),name,serviceType,supportGroups,status))
        conn.commit()
        sendEmail(name, supportGroups)
        return {"status": 200, "Data": "Request logged successfully!", "meta": {}, "error": None}

    except Exception as e:
        print(f"Error inserting request: {e}")
        return error_response(500, "There was an error submitting the request. Please try again!", exc=e)

    finally:
        if conn:
            conn.close()

    return jsonify({"message": "There was an error submitting the request. Please try again!"})


@misc_bp.route('/api/createUserStoryForCustomThresold', methods=['POST'])
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
            "value": r"CRCA\SI\Monitoring"       
        }
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
        return {"status": 200, "Data": f"User story created successfully with ID: {user_story_id}", "meta": {}, "error": None}
    else:
        print(f"Error creating user story for {applicationCI}")
        print(f"Response: {response.text}")
    return {"status": response.status_code, "Data": {"responseCode": response.status_code}, "meta": {}, "error": None}


@misc_bp.route('/api/createUserStory', methods=['POST'])
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
            "value": r"CRCA\SI\Monitoring"
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
        return {"status": 200, "Data": f"User story created successfully with ID: {user_story_id}", "meta": {}, "error": None}
    else:
        print(f"Error creating user story for {resourceName}")
        print(f"Response: {response.text}")
       
    return {"status": response.status_code, "Data": {"responseCode": response.status_code}, "meta": {}, "error": None}
 

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


@misc_bp.route('/api/setCustomThreshold',methods=["GET","POST"])
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
        return {"status": 200, "Data": "Success..", "meta": {}, "error": None}
    
    except Exception as e:
        print(f"Error inserting request: {e}")
        return error_response(500, "There was an error submitting the request. Please try again!", exc=e)
    finally:
        if conn:
            conn.close()


@misc_bp.route('/api/serverUptime', methods=["POST"])
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
    return {"status": 200, "Data": df.to_json(), "meta": {}, "error": None}


@misc_bp.route('/api/TagCompliance', methods=["POST"])
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

    return {"status": 200, "Data": logsData["TagCompliance"], "meta": {}, "error": None}


@misc_bp.route("/api/audit/earlyWarningStateUpdates", methods=["GET"])
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

        return {"status": 200, "Data": df_res.to_json(), "meta": {}, "error": None}, 200

    except Exception as ex:
        print("Exception in get_early_warning_state_updates:")
        print(ex)
        return error_response(501, "Failed to fetch early warning state updates", detail=str(ex), exc=ex)
