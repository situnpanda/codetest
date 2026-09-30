import os
import json
import time

import pandas
from datetime import datetime
from flask import Blueprint, request, jsonify

from shared.dataBase import connectToDw_AADpwd, connectToDw_SqlServerPwd
from shared.ADX import readFromADX
from shared.filters import filtersData, getFiltersFromCache, getServerList
from domains.metrics.application.applicationTelemetry import servicesData, incidentData, getIncidentObservation, changeRequest
from shared.appinsights_logger import error_response

application_bp = Blueprint("application", __name__)


@application_bp.route('/api/serverLogs', methods = ["POST"])
def serverLogs():
    print(datetime.now())
    dataPost = request.get_json()
    filter = dataPost.get('filters')
    
    server_df = getServerList(filter)

    
    return {"status": 200, "Data": server_df["Server"].to_json(), "meta": {}, "error": None}
    
# @app.route('/api/serverLogs', methods = ["POST"])
# def serverLogs():

#     def fetch_server_logs(filter):
#         """Helper function to fetch server logs from the database"""
#         apmNumbers = filtersData(filter, "apmNumber")
#         connectToServicePerf = connectToDw_SqlServerPwd("spidedbsv6c6b60.wa.providence.org\\SPIDER", "ServicePerf_DW", "servCRCAMonitor")
#         server_df = server_overview_df(connectToServicePerf, apmNumbers, "", "")
#         print("The server df is")
#         print(server_df)

#         server_df["Count"] = len(server_df["Server"]) if "Server" in server_df else 0
#         return server_df

#     dataPost = request.get_json()
#     logsData = dict()
#     filter = dataPost.get('filters')
#     #print("The filter is", filter)
#     serverName = dataPost.get('serverName')
#     mailAdd = dataPost.get('mailAdd')

#     if os.path.exists(serverListJsonPath):

#         # Check if all filters are ['All'] or all except 'supportGroup' are ['All']
#         all_filter_except_support_group = all(
#             (k == 'supportGroup' or v == ['All'])
#             for k, v in filter.items()
#         )

#         if all(value == ['All'] for value in filter.values()) or all_filter_except_support_group:
#             # print("Yes the value is all")
            
#             for attempt in range(2):
#                 #print("The server os path exists")
#                 try: 
#                     with open(serverListJsonPath, "r") as json_file:
#                         server_df = json.load(json_file) 
#                         server_df["Server"] = pandas.DataFrame(server_df["Server"])

#                         # Check if SupportGroup is not 'All'
#                         if filter.get('supportGroup') != ['All']:
#                             support_groups = [sg.lower() for sg in filter.get('supportGroup')]  # Convert all filter values to lowercase
#                             server_df["Server"] = server_df["Server"][server_df["Server"]['SupportGroup'].str.lower().isin(support_groups)]

    

#                         server_df["Count"] = len(server_df["Server"])
#                         #print(server_df["Server"])
#                         distinct_support_groups = server_df["Server"]['SupportGroup'].unique()
#                         #print("The distinct support groups are", distinct_support_groups)
#                         logsData["ServerLogs"] = server_df["Server"].to_json() 
#                         #print(logsData)
#                         break

#                 except json.JSONDecodeError as e:
#                     print(f"Attempt {attempt + 1}: JSONDecodeError - {e}. Retrying...")

#                 if attempt < 1:  # Sleep before retrying (only before the last attempt)
#                     print("Waiting 1 second before retrying...")
#                     time.sleep(1)     

#         else :
#             # print("came into the else condition")
#             server_df = fetch_server_logs(filter)
#             logsData["ServerLogs"] = server_df["Server"].to_json()
#             logsData["Count"] = server_df["Count"]
#             #print(logsData["ServerLogs"])

#     else :
        
#         server_df = fetch_server_logs(filter)
#         logsData["ServerLogs"] = server_df["Server"].to_json(orient="records")
#         logsData["Count"] = server_df["Count"]
        
#     return jsonify(logsData)

@application_bp.route('/api/serviceLogs', methods=["POST"])
def serviceLogs():
    
    try:
        s = datetime.now()
        dataPost = request.get_json()
        aggregate = dataPost.get('aggregate')    # Retrieve the value of the 'limit' parameter
        filter = dataPost.get('filters')
        start_time = dataPost.get('start_time')  # Retrieve the value of the 'start_time' parameter
        end_time = dataPost.get('end_time')  # Retrieve the value of the 'end_time' parameter
        serviceType = dataPost.get('serviceType', 'All')
        serverName = ""
        apmNumbers = ""
        logsData = dict()
        print("hello Hereeee")
        print(filter)
        if('serverName' in dataPost):
            serverName = dataPost.get('serverName')
            if(not("'" in serverName)):
                s= ""
                for i in serverName.split(','):
                    s+="'"+i+"',"
                s=s[0:-1]
                # print(s)
                serverName = s
        else:
            apmNumbers = getFiltersFromCache(filter, "apmNumber")
            # print("APM Numbers")
            # print(apmNumbers)
        connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
        
        services_df = servicesData(connectToCrcaMonitoring, apmNumbers, serverName, aggregate, start_time, end_time)
        
        # print(services_df["Service"].columns)
        for i in services_df:
            if(i!="Service"):
                print(i+" "+services_df[i])
                logsData[i] = services_df[i]
        
        e = datetime.now()
        print("Services API: "+ str(s)+" - "+str(e)) 
        return {"status": 200, "Data": services_df["Service"].to_json(), "meta": dict(logsData), "error": None}, 200
        
    except Exception as ex:
        print(str(ex))
        return error_response(501, "Failed to fetch service metrics", detail=str(ex), exc=ex)

@application_bp.route('/api/incidentLogs', methods=["POST"])
def incidentLogs():

    print("StartTime:"+str(datetime.now()))
    dataPost = request.get_json()
    aggregateBool = dataPost.get('aggregate')    # Retrieve the value of the 'limit' parameter
    logsData = dict()
    filter = dataPost.get('filters')
    miBool = dataPost.get('miBool') 
    start_time = dataPost.get('start_time')  # Retrieve the value of the 'start_time' parameter
    end_time = dataPost.get('end_time')  # Retrieve the value of the 'end_time' parameter
    active = dataPost.get('active', "no")
    appCI = getFiltersFromCache(filter, "appCI")
    connectToServicePerf = connectToDw_SqlServerPwd("spidedbsv6c6b60.wa.providence.org\\SPIDER", "ServicePerf_DW","servCRCAMonitor")
    incidents_df = incidentData(connectToServicePerf, appCI, aggregateBool, start_time, end_time, miBool, active)
    logsData["incidents"] = incidents_df

    print("EndTime:"+str(datetime.now()))
    return {"status": 200, "Data": logsData["incidents"], "meta": {}, "error": None}

@application_bp.route('/api/incidentObservation', methods=["POST"])
def incidentObservation():
    dataPost = request.get_json()
    incidentList = dataPost.get('incidentList')
    print(incidentList)
    logsData = dict()
    # logsData["incidentObservation"] = incidentList
    # return jsonify(logsData)
    incString = ""
    for i in incidentList:
        incString = incString + "'"+i+"',"
    incString = incString[0:-1]
    # logsData["incidentObservation"] = incString
    # return jsonify(logsData)
    observation_df = getIncidentObservation(incString)
    logsData["incidentObservation"] = observation_df.to_json()
    return {"status": 200, "Data": observation_df.to_json(), "meta": {}, "error": None}

@application_bp.route('/api/changeIncidentevents', methods=["POST"])
def getEvents():

    try:
        dataPost = request.get_json() or {}
        hours = int(dataPost.get('hours', 24))
        eventType = dataPost.get('eventType')   # "Change" or "Major Incident"

        if eventType not in ["Change", "Major Incident"]:
            return error_response(400, "Invalid eventType")

        objectName = "Change Request" if eventType == "Change" else "Major Incident"

        query = f"""
        let hoursBack = {hours}h;

        Downtime_Details
        | where ObjectName == "{objectName}"
        | where
            OpenedAt >= ago(hoursBack)
            or ClosedAt >= ago(hoursBack)
            or (
                OpenedAt < ago(hoursBack)
                and (isnull(ClosedAt) or ClosedAt >= ago(hoursBack))
            )
        | project
            Number,
            ApplicationCI,
            ShortDescription,
            OpenedAt,
            ClosedAt,
            PriorityLabel,
            Status
        | order by OpenedAt desc
        """

        df = readFromADX(query)

        events = []

        for _, row in df.iterrows():
            events.append({
                "eventType": eventType,
                "number": row["Number"],
                "applicationCI": row["ApplicationCI"],
                "description": row["ShortDescription"],
                "startTime": row["OpenedAt"].isoformat() if pandas.notna(row["OpenedAt"]) else None,
                "endTime": row["ClosedAt"].isoformat() if pandas.notna(row["ClosedAt"]) else None,
                "priority": row["PriorityLabel"],
                "status": row["Status"]
            })

        return {"status": 200, "Data": events, "meta": {}, "error": None}, 200

    except Exception as ex:
        print("Events API Error:", ex)
        return error_response(500, "Failed to fetch change/incident events", detail=str(ex), exc=ex)

@application_bp.route('/api/changeRequestLogs', methods=["POST"])
def changeRequestsLogs():

    dataPost = request.get_json()

    aggregateBool = dataPost.get('aggregate')    # Retrieve the value of the 'limit' parameter
    filter = dataPost.get('filters')
    start_time = dataPost.get('start_time')  # Retrieve the value of the 'start_time' parameter
    end_time = dataPost.get('end_time')  # Retrieve the value of the 'end_time' parameter
    
    appCI = getFiltersFromCache(filter, "appCI")

    logsData = dict()

    connectToServicePerf = connectToDw_SqlServerPwd("spidedbsv6c6b60.wa.providence.org\\SPIDER", "ServicePerf_DW","servCRCAMonitor")
    changeRequests_df = changeRequest(connectToServicePerf, appCI, start_time, end_time)
    #print(changeRequests_df)
     
    #changeRequests_df["Count"] = len(changeRequests_df["changeRequestList"])
    logsData["changeRequests"] = changeRequests_df["changeRequestList"].to_json()
    
    return {"status": 200, "Data": changeRequests_df["changeRequestList"].to_json(), "meta": {}, "error": None}
