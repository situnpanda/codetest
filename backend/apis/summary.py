import json

import numpy
import pandas
from datetime import datetime
from flask import Blueprint, request, jsonify

from shared.dataBase import connectToDw_AADpwd, connectToDw_SqlServerPwd, queryDw
from shared.filters import filtersData, getFiltersFromCache
from shared.hospitalList import hospitalList, hospitalListCount
from shared.anomaliesList import anomaliesList, anomaliesInfo
from domains.metrics.application.mapViewTelemetry import mapView
from domains.metrics.infrastructure.infrastructureTelemetry import infraAnomalies, infraAlerts

summary_bp = Blueprint("summary", __name__)


@summary_bp.route("/api/filters", methods = ["POST"])
def filters():
    #Get Data from Post API
    dataPost = request.get_json()
    print(dataPost)
    
    if("filterType" in dataPost):
        if(dataPost['filterType']=="dataFrame"):
            filterDataDF = filtersData(dataPost, "dataFrame")
            return {"status": 200, "Data": filterDataDF.to_json(), "meta": {}, "error": None}
    else:
        filterData = filtersData(dataPost, "filter")
    return {"status": 200, "Data": filterData, "meta": {}, "error": None}

@summary_bp.route('/api/applicationHealthSummary', methods = ["GET"])
def applicationHealthSummary():
    
    appCI = request.args.get('appCI', "")
    appFamily = request.args.get('appFamily', "")
    supportGroup = request.args.get('supportGroup', "")
    
    sqlQuery = f""" Select ahs.[Application CI]
      ,ahs.[Server Health]
      ,ahs.[Services Health]
      ,ahs.[Interfaces Health]
      ,ahs.[File Storage Health]
      ,ahs.[Application Family]
      ,ahs.[Support Group]
      ,ahs.[Database Health]
      ,al.[Recovery Ranking]
    from [ApplicationHealthPage_Summary] ahs
    left join [Application List] al
      on lower(ahs.[Application CI]) = lower(al.[Application CI]) """
    
    flag = 0
    if(appCI!="" and appCI!="'All'"):
        sqlQuery += f"where ahs.[Application CI] in ({appCI.upper()})"
        flag = 1
    elif(appFamily!="" and appFamily!="'All'"):
        sqlQuery += f"where ahs.[Application Family] in ({appFamily.upper()})"
        flag = 1
    elif(supportGroup!="" and supportGroup!="'All'"):
        sqlQuery += f"where ahs.[Support Group] in ({supportGroup.upper()})"
        flag = 1
    
    if flag==1:
        sqlQuery += " and ahs.[Last Updated] = (Select MAX([Last Updated]) from [ApplicationHealthPage_Summary])"
    else:
        sqlQuery += "where ahs.[Last Updated] = (Select MAX([Last Updated]) from [ApplicationHealthPage_Summary])"
    
    connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    print(datetime.now())
    print(sqlQuery)
    print(datetime.now())
    
    result = queryDw(connectToCrcaMonitoring, sqlQuery)
    df = pandas.DataFrame(numpy.array(result), columns=["Application CI", "Server Health", "Services Health", "Interfaces Health", "File Storage Health", "Application Family", "Support Group", "Database Health", "Recovery Ranking"])
    for i in ["Server Health", "Services Health", "Interfaces Health", "File Storage Health", "Database Health"]:
        print(i)
        df[i] = df[i].apply(lambda x: json.loads(x) if x!="" else {})
    logsData = dict()
    logsData["Application Summary"] = df.to_json()
    print(datetime.now())
    return {"status": 200, "Data": df.to_json(), "meta": {}, "error": None}

@summary_bp.route('/api/hospitalList', methods=["GET"])
def hospitalData():
    typeOfData = request.args.get('queryType')

    connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    if(typeOfData=="list"):
        hopsitalList_df = hospitalList(connectToCrcaMonitoring)
    else:
        hopsitalList_df = hospitalListCount(connectToCrcaMonitoring)
    logsData = dict()
    logsData["hospitalData"] = hopsitalList_df.to_json()
    return {"status": 200, "Data": hopsitalList_df.to_json(), "meta": {}, "error": None}

@summary_bp.route('/api/mapView')
def mapViewTelemetry():
    region = request.args.get('region')
    mapViewData = mapView(region)
    return {"status": 200, "Data": mapViewData, "meta": {}, "error": None}

@summary_bp.route('/anomaliesList')
def anomaliesData():
    connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    df_anomaliesList = anomaliesList(connectToCrcaMonitoring)
    logsData = dict()
    logsData["anomaliesList"] = df_anomaliesList.to_json()
    return {"status": 200, "Data": df_anomaliesList.to_json(), "meta": {}, "error": None}

@summary_bp.route('/anomaliesInfo')
def anomaliesInformation():
    connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    anomalies_data = anomaliesInfo(connectToCrcaMonitoring)
    return {"status": 200, "Data": anomalies_data, "meta": {}, "error": None}

@summary_bp.route('/api/infraAnomalies', methods = ['POST'])
def anomaliesInfra():

    dataPost = request.get_json()

    aggregateBool = dataPost.get('aggregate')    # Retrieve the value of the 'limit' parameter
    filter = dataPost.get('filters')
    start_time = dataPost.get('start_time')  # Retrieve the value of the 'start_time' parameter
    end_time = dataPost.get('end_time')  # Retrieve the value of the 'end_time' parameter
    
    apmNumber = getFiltersFromCache(filter, "apmNumber")

    logsData = dict()

    connectToServicePerf = connectToDw_SqlServerPwd("spidedbsv6c6b60.wa.providence.org\\SPIDER", "ServicePerf_DW","servCRCAMonitor")
    anomaliesData = infraAnomalies(apmNumber, aggregateBool, connectToServicePerf, start_time, end_time)
    print("main")
    print(anomaliesData)
    logsData["AnomaliesData"] = anomaliesData["anomaliesList"].to_json()
    return {"status": 200, "Data": anomaliesData["anomaliesList"].to_json(), "meta": {}, "error": None}

@summary_bp.route('/api/infraAlerts', methods = ['POST'])
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
