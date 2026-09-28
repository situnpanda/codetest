import base64
from flask import Flask, jsonify, Response
from multiprocessing import Process
import os
import sys
import json, pyodbc, time
import pandas
import numpy
from collections import defaultdict
from flask import Flask, request, Blueprint
from flask_swagger_ui import get_swaggerui_blueprint
from markupsafe import escape
from shared.keyVault import connectToKeyVault
from shared.dataBase import connectToDw, connectToDw_AADpwd, connectToDw_SqlServerPwd,queryDw, connectToDw_AADpwd_Write, insert_data, openConnection
from domains.metrics.application.applicationTelemetry import cacheIncidentData, servicesData, interfacesData, incidentData, kpiData, changeRequest, getIncidentObservation, interfacesLogsData
from domains.metrics.application.mapViewTelemetry import mapView
from shared.hospitalList import hospitalList, hospitalListCount
from shared.anomaliesList import anomaliesList,anomaliesInfo
from shared.filters import filtersData, filtersData_SubRg, getFiltersFromCache, getServerList
from shared.variables import globalVariables
from domains.metrics.application.incidentToIssues import incidentIssueMapping
from domains.metadata.getComponentList import serviceList,serviceList_new, urlList, customRequirementList, dbList, dbList_new, fileShareList_new
from domains.metadata.getAppSummary import appSummary
from domains.metadata.updateOnboardedData import updateServicesData, updateUrlData, updateCustomRequirementData
from domains.metrics.infrastructure.infrastructureTelemetry import sendEmail, databaseMetricData, cacheServerListData, userfilterAlertManager, server_environment_overview_df,server_overview_df,windows_events_df,serverProcessMetrics_df,server_reboot_df,workstation_Metrics_df, azureServerMetrics_Fileshare_df, azureServerMetrics_CPU_df, azureServerMetrics_Memory_df, azureServerMetrics_Disk_df, infraAnomalies, infraAlerts, serverStatus, diskdetails_df, find_servers_by_name, alertfilterdf,citrixServerData,serverUptime, appReliability, appExceptions, PatchComplianceData,ValidationData,BackupData,TagComplianceData
from domains.metrics.infrastructure.azureGovernance import tagCompliance_Subscription, tagCompliance_ServerName
from flask_cors import CORS
from shared.LogAnalytics import queryInLogAnalytics
from shared.utils.userActivityLogging import log_user_activity
from shared.ADX import readFromADX
import requests
import threading
from datetime import datetime
import jwt
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
import logging
from domains.alerting.alertRulesSupport import updateRecord, alert_rules_bp
from domains.alerting.alertRulesRead import readAlertRule
from domains.alerting.alertRulesUpdate import updateVmAlerts_main, updateMaintenanceTag, updateVmDb_main, updateServices_main, updateFilestorageDb_main
from flask_compress import Compress

app = Flask(__name__)
Compress(app)
from shared.appinsights_logger import initialize_azure_monitor
initialize_azure_monitor()
from domains.metrics.ServerMetricsPerf import serverPerf
from domains.metrics.WindowsServiceMetrics import servicePerf
from domains.metrics.DatabaseMetricsPerf import databasePerf
from domains.metrics.FileStorageMetricsPerf import fileStoragePerf
from domains.metrics.ResourceComplianceMetrics import resourceCompliance
from domains.metrics.DowntimeDetailsMetrics import downtimeDetails
from domains.metrics.NetworkMetricsPerf import networkPerf
from domains.metrics.Moxa import moxaPerf
from domains.metrics.InterfaceMetrics import interfacePerf
from domains.metrics.LoadBalancerMetricsPerf import loadBalancerPerf
from domains.chatops.ChatOps import chatOps
from domains.metrics.SecurityMetrics import SecurityMetrics
from domains.metrics.Analytics import AnalyticsBp
from domains.metrics.CitrixDataMetrics import citrixPerf
from domains.metrics.UserMetrics import userMetrics
from domains.metrics.CrowdstrikeMetrics import crowdstrikeMetrics


ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:9090",
    "https://itelemetry.providence.org",
    "https://iTelemetryStag.providence.org",
    "http://100.100.132.163:5090",
    "http://100.100.132.166:5090",
    "http://100.100.129.88:5090",
    "http://100.100.129.8:5090",
    "https://cloud.uipath.com"
]
CORS(app, origins=ALLOWED_ORIGINS)

swaggerui_blueprint = get_swaggerui_blueprint('/swagger', '/swagger.json')
app.register_blueprint(swaggerui_blueprint, url_prefix='/swagger')

# app.register_blueprint(alert_rules_bp)
app.register_blueprint(serverPerf)
app.register_blueprint(servicePerf)
app.register_blueprint(databasePerf)
app.register_blueprint(fileStoragePerf)
app.register_blueprint(resourceCompliance)
app.register_blueprint(downtimeDetails)
app.register_blueprint(networkPerf)
app.register_blueprint(moxaPerf)
app.register_blueprint(interfacePerf)
app.register_blueprint(loadBalancerPerf)
app.register_blueprint(chatOps)
app.register_blueprint(SecurityMetrics)
app.register_blueprint(AnalyticsBp)
app.register_blueprint(citrixPerf)
app.register_blueprint(userMetrics)
app.register_blueprint(crowdstrikeMetrics)

# VSA route slices (extracted from main.py)
from apis.system import system_bp
app.register_blueprint(system_bp)
from apis.operations import operations_bp
app.register_blueprint(operations_bp)
from apis.summary import summary_bp
app.register_blueprint(summary_bp)
from apis.application import application_bp
app.register_blueprint(application_bp)
from apis.infrastructure import infrastructure_bp
app.register_blueprint(infrastructure_bp)

# File s with Cached Data
BASE_DIR = os.path.dirname(os.path.abspath(__file__))  # Current file's directory
modules_path = os.path.join(BASE_DIR, "Modules")  # Path to Modules folder
cache_path = os.path.join(modules_path, "cache")  # Path to cache inside Modules
incidentListJsonPath = os.path.join(cache_path, "incidentList.json")
serverListJsonPath = os.path.join(cache_path, "serverList.json")
alertListJsonPath = os.path.join(cache_path, "alertsList.json")
alertInfraListJsonPath = os.path.join(cache_path, "serverMetrics.json")
applicationListJsonPath = os.path.join(cache_path, "applicationList.json")
userToSupportGroupMappingJsonPath = os.path.join(cache_path, "userToSupportGroupMappingList.json")


# App registration and Authorization
# Backend_App_ID = "f1a12b92-1409-4c98-8e3e-ff39939dfb1e"
from shared.auth import Tenant_ID, Backend_App_ID, validateToken



@app.route('/swagger.json')
def generate_swagger():
    with open('./swagger.json') as file:
           swagger_data = file.read()
    return swagger_data

@app.route("/api")
def index():
    for rule in app.url_map.iter_rules():
        print()
        print(f"  {rule} -> methods: {sorted(rule.methods)}")
    return "Hello"

# Alert manager historical data on selecting app family
@app.route('/api/getDataByAppFamily', methods=["POST"])
def appFamilyDetails():
    app_family = request.get_json()

    print(f"Received appFamily data: {app_family}, type: {type(app_family)}")

    app_family_name = app_family['newValue']
    print(type(app_family_name))

    # Establish a database connection using the provided connection string
    connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")

    query = f"""
        SELECT * FROM maintenance_requests WHERE appFamily LIKE '{app_family_name}' AND status LIKE 'pending'
    """
    print(query)

    # Execute the query and fetch the results
    db_response = queryDw(connectionString, query)

    # Prepare table data
    table_data = []
    if db_response:  # Check if db_response is not empty
        for row in db_response:
            servers = json.loads(row[0])  # Assuming the first column contains JSON
            server_names = [server['name'] for server in servers]

            table_data.append({
                "appFamily": row[5],
                "serverNames": server_names,
                "startTime": row[1].isoformat(),
                "endTime": row[2].isoformat(),
                "status": row[4]
            }) 
    else:
        print("No records found for the given app family.")
        table_data = []  # Empty list if no records are found

    print("The table data is:")     
    print(table_data)

    # Get the current date
    current_date = datetime.now()

    # Prepare graph data: Monthly count of responses for the last 12 months
    monthly_counts = defaultdict(int)

    for row in db_response:
        if row:  # Ensure row is valid
            start_time = row[1]  # Extract the startTime (datetime object)
            # Calculate the difference in months between the start time and current time
            months_diff = (current_date.year - start_time.year) * 12 + (current_date.month - start_time.month)
            
            # Include only records within the last 12 months
            if 0 <= months_diff < 12:
                key = (start_time.year, start_time.month)  # Use (year, month) as the key
                monthly_counts[key] += 1

    # Generate graph data for the last 12 months in the correct format
    graph_data = {}

    return jsonify({"tableData": table_data, "graphData": graph_data})


# alert manager historical data for all app families
@app.route('/api/getHistoricalDataForAllAppFamilies')
def getHistoricalDataForAllAppFamilies():
    # Establish a database connection using the provided connection string
    connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    query = f"""select serverdetails, starttime, endtime, status, appFamily, userEmail, recurrence from maintenance_requests order by id desc"""
    print(query)

    # Execute the query and fetch the results
    db_response = queryDw(connectionString, query)
    print(db_response)
    # Prepare table data
    table_data = []
    if db_response:  # Check if db_response is not empty
        for row in db_response:
            servers = json.loads(row[0])  # Assuming the first column contains JSON
            server_names = [server['name'] for server in servers]

            table_data.append({
                "appFamily": row[4],
                "serverNames": server_names,
                "startTime": row[1].isoformat(),
                "endTime": row[2].isoformat(),
                "status": row[3],
                "userEmail": row[5] if len(row) > 5 else None,
                "frequency": row[6] if len(row) > 6 else "OneTime"
            }) 
    else:
        print("No records found for the given app family.")
        table_data = []  # Empty list if no records are found

    print("The table data is:")     
    print(table_data)
    return jsonify({"tableData": table_data})

# @app.route('/api/citrixServerStatus', methods=["Post"])
# def citrixServer():
#     dataPost = request.get_json()
#     filter = dataPost.get("filters")
#     print(filter)
#     apmNumbers = filtersData(filter, "apmNumber")
#     logsData = dict()
#     print(apmNumbers[:30])
#     citrixServerInfo = citrixServerData(apmNumbers)
#     logsData["Citrix Status"] = citrixServerInfo.to_json()
#     return logsData, 200

@app.route('/api/updateOnboardedData', methods=["POST"])
def updateOnboardedData():
    dataPost = request.get_json()
    dataCategory = dataPost.get("dataCategory")
    updateCategory = dataPost.get("updateCategory")
    data = dataPost.get("data")
    userName = dataPost.get("userName")
    print(data)
    
    if(dataCategory=="services"):
        updateServicesData(updateCategory, data, userName)
    elif(dataCategory=="urls"):
        updateUrlData(updateCategory, data, userName)
    elif(dataCategory=="custom requirement"):
        updateCustomRequirementData(updateCategory, data, userName)
    # print("Hello")
    return "", 200

@app.route('/api/governance', methods=['GET'])
def load_json_file():
    d = {
        "ab16a144-47d7-45c5-bcb7-8affc988f8e0":"prod1.json",
        "9592c342-d1fb-477e-8e91-ad39bf00933b":"prod2.json",
        "5467bf57-48b4-4930-b3cb-bf039b259d04":"prod3.json",
        "343a7ee0-5081-4024-82fc-498ee61867a9":"prod4.json",
        "6d590d81-bab9-4b9a-b011-090467b5a9a4":"test1.json"
    }
    df = pandas.DataFrame()
    if 'subscription_id' in request.args:
        print("Here1")
        subscriptionId = request.args.get("subscription_id")
        df = tagCompliance_Subscription(subscriptionId, d, app)
        if subscriptionId is None:
            return jsonify({'error': 'Subscription ID is missing in request parameters'}), 400
    elif 'serverName' in request.args:
        serverName = request.args.get("serverName")
        s= ""
        for i in serverName.split(','):
            s+="'"+i+"',"
        s=s[0:-1]
        serverName = s
        # print(serverName)
        df = tagCompliance_ServerName(serverName, d, app)
        print(df)
    
    
    logsData= {}
    logsData["tagComplianceData"] = df.to_json()
    return jsonify(logsData)
 
@app.route('/api/createUserStoryForCustomThresold', methods=['POST'])
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

@app.route('/api/createUserStory', methods=['POST'])
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

@app.route('/api/getOnboardingList', methods=["POST"])
def getList():
    data = request.get_json()
    appFamily = data["appFamily"] if "appFamily" in data else ""
    appCI = data["appCI"] if "appCI" in data else ""
    type = data["type"] if "type" in data else ""

    logData = {}
    if(type=="services"):
        logData["metaData"] = serviceList(appFamily, appCI)
    elif(type=="services_new"):
        logData["metaData"] = serviceList_new(appFamily, appCI)
    elif(type=="urls"):
        logData["metaData"] = urlList(appFamily, appCI)
    elif(type=="customRequirement"):
        logData["metaData"] = customRequirementList(appFamily, appCI)
    elif(type=="database"):
        logData["metaData"] = dbList(appFamily, appCI)
    elif(type=="database_new"):
        logData["metaData"] = dbList_new(appFamily, appCI)
    elif(type=="fileshare_new"):
        logData["metaData"] = fileShareList_new(appFamily, appCI)
    
    logData["metaData"] = logData["metaData"].to_json()
    return jsonify(logData)

@app.route('/api/getOnboardingSummary', methods=["GET"])
def getAppOnboardingSummary():
    logData = {}
    # print(logData)
    data = appSummary()
    print(data)
    logData["appOnboardingSummary"] = data.to_json()
    return jsonify(logData)

# @app.route('/api/fetchCustomThreshold',methods=["GET","POST"])  
# def fetchCustomThreshold():
#     connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
#     query = f"""SELECT t.* FROM customthreshold t INNER JOIN (SELECT AppCI, Type, MAX(modifieddate) AS modifiedDate FROM customthreshold GROUP BY AppCI, Type) md ON t.AppCI = md.AppCI AND t.Type = md.Type AND t.modifieddate = md.modifiedDate;"""
#     customThreshold = queryDw(connectionString, query)
#     customThresholdDataDataFrame = pandas.DataFrame(numpy.array(customThreshold), columns = ['AppCI','Type','Threshold','Changedby','Comments','ModifiedDate'])
#     customThresholdDataDataFrame["ModifiedDate"] = customThresholdDataDataFrame["ModifiedDate"].dt.strftime('%Y-%m-%d %H:%M:%S')
#     customThresholdJson = customThresholdDataDataFrame.to_json(orient='records', indent=2)
#     # print(SupportGroupAppCiDataJson)
#     print(customThresholdJson)
#     return customThresholdJson

@app.route('/api/setCustomThreshold',methods=["GET","POST"])
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

@app.route('/api/serverUptime', methods=["POST"])
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

@app.route('/api/TagCompliance', methods=["POST"])
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

@app.route("/api/AlertRules/AcknowledgeAlert", methods=["GET"])
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
    
@app.route("/api/AlertRules/ReadAlertRules", methods=["POST"])
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
    
@app.route("/api/AlertRules/UpdateAlertRules", methods=["POST"])
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

@app.route("/api/AlertRules/MaintenanceTagUpdate", methods=["POST"])
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
    
    
@app.route("/api/audit/earlyWarningStateUpdates", methods=["GET"])
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
    
