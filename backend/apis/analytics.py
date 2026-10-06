"""Analytics HTTP route slice (consolidated).

Web/routing layer for the analytics / pattern-analysis endpoints under
``/api/infrastructureMetrics`` plus the anomalies endpoints. Business logic lives
in ``domains.metrics.Analytics`` and ``domains.metrics.infrastructure``; this
module only wires HTTP requests to those functions and returns the uniform
success/error envelope.
"""
from flask import Blueprint, request

from shared.appinsightsLogger import log_performance, error_response
from shared.dataBase import connectToDw_AADpwd, connectToDw_SqlServerPwd
from shared.filters import getFiltersFromCache
from shared.anomaliesList import anomaliesList, anomaliesInfo
from domains.metrics.analytics.analytics import get_server_status, get_pattern_analysis
from domains.metrics.infrastructure.infrastructureTelemetry import infraAnomalies

analytics_bp = Blueprint("analytics", __name__)


@analytics_bp.route("/api/infrastructureMetrics/Analytics", methods=["POST"])
@log_performance()
def getServerStatus():
    try:
        data = request.get_json() or {}
        return get_server_status(data)
    except Exception as ex:
        return error_response(500, "Failed to fetch seasonal pattern", detail=str(ex), exc=ex)


@analytics_bp.route("/api/infrastructureMetrics/PatternAnalysis", methods=["POST"])
@log_performance()
def getPatternAnalysis():
    try:
        data = request.get_json(silent=True) or {}
        return get_pattern_analysis(data)
    except Exception as ex:
        return error_response(500, "Failed to fetch pattern analysis", detail=str(ex), exc=ex)


@analytics_bp.route('/anomaliesList')
def anomaliesData():
    connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    df_anomaliesList = anomaliesList(connectToCrcaMonitoring)
    logsData = dict()
    logsData["anomaliesList"] = df_anomaliesList.to_json()
    return {"status": 200, "Data": df_anomaliesList.to_json(), "meta": {}, "error": None}


@analytics_bp.route('/anomaliesInfo')
def anomaliesInformation():
    connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    anomalies_data = anomaliesInfo(connectToCrcaMonitoring)
    return {"status": 200, "Data": anomalies_data, "meta": {}, "error": None}


@analytics_bp.route('/api/infraAnomalies', methods = ['POST'])
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
