"""Application HTTP route slice (consolidated).

Web/routing layer for the ``/api/applicationMetrics`` service/URL/interface
endpoints plus incident, change-request, downtime, app-validation, reliability
and exception endpoints. Business logic lives in ``domains.metrics.*``; this
module only wires HTTP requests to those functions and returns the uniform
success/error envelope.
"""
import pandas
from datetime import datetime

from flask import Blueprint, request

from shared.appinsightsLogger import log_performance, error_response
from shared.adx import readFromADX
from shared.dataBase import connectToDw_AADpwd, connectToDw_SqlServerPwd
from shared.filters import getFiltersFromCache
from shared.variables import globalVariables
from domains.metrics.application.windowsServiceMetrics import (
    get_service_url_status,
    get_service_status,
    get_url_status,
)
from domains.metrics.application.interfaceMetrics import fetch_corepoint_interface_status
from domains.metrics.application.downtimeDetailsMetrics import get_change_incident_events
from domains.metrics.application.applicationTelemetry import (
    incidentData,
    getIncidentObservation,
    changeRequest,
    interfacesLogsData,
)
from domains.metrics.infrastructure.infrastructureTelemetry import (
    ValidationData,
    appReliability,
    appExceptions,
)

application_bp = Blueprint("application", __name__)


@application_bp.route("/api/applicationMetrics/", methods=["GET"])
def hello():
    return "Hello"


@application_bp.route("/api/applicationMetrics/serviceUrlMetrics", methods=["POST"])
@log_performance()
def getServiceUrlStatus():
    data = request.get_json() or {}
    return get_service_url_status(data)


@application_bp.route("/api/applicationMetrics/serviceMetrics", methods=["POST"])
@log_performance()
def getServiceStatus():
    data = request.get_json() or {}
    return get_service_status(data)


@application_bp.route("/api/applicationMetrics/urlMetrics", methods=["POST"])
@log_performance()
def getUrlStatus():
    data = request.get_json() or {}
    return get_url_status(data)


@application_bp.route("/api/applicationMetrics/onDemand/interfaceStatus", methods=["POST"])
@log_performance()
def fetchCorepointInterfaceStatus():
    requestData = request.get_json() or {}
    app = requestData.get("Application family", [])
    return fetch_corepoint_interface_status(app)


@application_bp.route('/api/downtimeEvents', methods=['POST'])
@log_performance()
def get_change_incident_events_route():
    try:
        data = request.get_json() or {}
        return get_change_incident_events(data)
    except Exception as ex:
        return error_response(500, "Failed to fetch downtime details", exc=ex)


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


@application_bp.route('/api/appValidation', methods=["POST"])
def appValidation():
    dataPost = request.get_json()
    appCI =dataPost.get('appCI',"").strip("'")
    aggregate =dataPost.get('aggregate',"no")
    logsData = {}
    df = ValidationData(aggregate,appCI)
    logsData = {"appValidation": df.to_json()}
    return {"status": 200, "Data": df.to_json(), "meta": {}, "error": None}


@application_bp.route('/api/applicationReliability', methods=["POST"])
def applicationReliabilityLog():
    dataPost = request.get_json()

    filter = dataPost.get('filters')      
    start_time = dataPost.get('start_time')   
    end_time = dataPost.get('end_time') 
    # apmNumbers = filtersData(filter, "apmNumber")
    apmNumbers = getFiltersFromCache(filter, "apmNumber")  
      
    aggregateBool = dataPost.get('aggregate')  
    #print(aggregateBool)
    connectToServicePerf = connectToDw_SqlServerPwd("spidedbsv6c6b60.wa.providence.org\\SPIDER", "ServicePerf_DW","servCRCAMonitor")
    insights_df = appReliability(connectToServicePerf, apmNumbers,aggregateBool, start_time, end_time)

    return {"status": 200, "Data": insights_df, "meta": {}, "error": None}


@application_bp.route('/api/applicationexceptions', methods=["POST"])
def applicationexceptionLog():
    dataPost = request.get_json()

    filter = dataPost.get('filters')      
    start_time = dataPost.get('start_time')   
    end_time = dataPost.get('end_time') 
    aggregateBool = dataPost.get('aggregate')  
    #print(aggregateBool)

    # apmNumbers = filtersData(filter, "apmNumber")
    apmNumbers = getFiltersFromCache(filter, "apmNumber")  
         
    connectToServicePerf = connectToDw_SqlServerPwd("spidedbsv6c6b60.wa.providence.org\\SPIDER", "ServicePerf_DW","servCRCAMonitor")
    insights_df = appExceptions(connectToServicePerf, apmNumbers, aggregateBool, start_time, end_time)
    
    return {"status": 200, "Data": insights_df, "meta": {}, "error": None}


@application_bp.route('/api/interfaceHealthLogs', methods=["POST"])
def interfaceLogsFinal():
    
    dataPost = request.get_json()
    aggregateBool = dataPost.get('aggregate')    # Retrieve the value of the 'limit' parameter
    start_time = dataPost.get('start_time')  # Retrieve the value of the 'start_time' parameter
    end_time = dataPost.get('end_time')  # Retrieve the value of the 'end_time' parameter
    filter = dataPost.get('filters')
    
    appFamily = getFiltersFromCache(filter, "appFamily")

    connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")

    interfaces_df = interfacesLogsData(connectToCrcaMonitoring, globalVariables.apmNumbers,start_time,end_time, aggregateBool, appFamily)
    print(interfaces_df)
    # Check if DataFrame is empty
    if interfaces_df['Interfaces'].empty:
        response = {
            "Interfaces": [],
            "Total Interfaces": 0
        }
    else:
        interfaces_df['Interfaces']['TimeGenerated'] = interfaces_df['Interfaces']['TimeGenerated'].dt.strftime('%Y-%m-%d %H:%M:%S')
        # Convert the DataFrame to JSON format
        interfaces_json = interfaces_df['Interfaces'].to_dict(orient="records")
        
        # Calculate distinct count of InterfaceName
        total_interfaces = interfaces_df['Interfaces']['InterfaceName'].nunique()

        # Prepare the final response
        response = {
            "Interfaces": interfaces_json,
            "Total Interfaces": total_interfaces
        }
    print(response)  # Log for debugging
    return {"status": 200, "Data": response, "meta": {}, "error": None}
