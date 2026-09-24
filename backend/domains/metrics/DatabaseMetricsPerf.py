import sys
from pathlib import Path

# Add the parent of 'parent_folder' to sys.path
root = Path(__file__).resolve().parents[1]
sys.path.append(str(root))

from flask import Blueprint, jsonify, request
from shared.dataBase import queryDw, connectToDw_AADpwd, insert_data, exceptioninfo
from shared.ADX import readFromADX
import pandas as pd
import numpy as np
from datetime import datetime

from shared.appinsights_logger import log_performance, error_response

databasePerf = Blueprint("infrastructureTelemetry_databaseMetrics", __name__, url_prefix="/api/infrastructureMetrics")

def getQueryDatabase(aggregate, startTime, endTime, databaseListStr):
    if(aggregate):
        adxQueryCondition = f""" where TimeGenerated <= datetime({endTime}) and tolower(ResourceId) in ({databaseListStr})
        | summarize arg_max(TimeGenerated, *) by ResourceId"""
        
        if(adxQueryCondition!=""):
            adxQuery = f""" Database_Metrics_Perf 
            | {adxQueryCondition} 
            | extend ResourceId = tolower(ResourceId)
            | extend splitResourceId = split(ResourceId,"/")
            | extend 
                    SubscriptionID = iff(array_length(splitResourceId)==6,"",splitResourceId[1]),
                    ResourceGroup = iff(array_length(splitResourceId)==6,"",splitResourceId[3]),
                    ServerName=iff(array_length(splitResourceId)==6,splitResourceId[1],splitResourceId[5]), 
                    DatabaseName = iff(array_length(splitResourceId)==6,splitResourceId[3],splitResourceId[7]), 
                    AppCI = iff(array_length(splitResourceId)==6,splitResourceId[5],splitResourceId[9])
            | project-away splitResourceId
            | order by TimeGenerated asc"""
            return adxQuery
        else:
            raise Exception("Query Formation incomplete")
    else:
        adxQueryCondition = f""" where TimeGenerated >= datetime({startTime}) and TimeGenerated < datetime({endTime}) and tolower(ResourceId) in ({databaseListStr})"""
        if(adxQueryCondition!=""):
            adxQuery = f""" Database_Metrics_Perf 
            | {adxQueryCondition} 
            | extend ResourceId = tolower(ResourceId)
            | extend splitResourceId = split(ResourceId,"/")
            | extend 
                    SubscriptionID = iff(array_length(splitResourceId)==6,"",splitResourceId[1]),
                    ResourceGroup = iff(array_length(splitResourceId)==6,"",splitResourceId[3]),
                    ServerName=iff(array_length(splitResourceId)==6,splitResourceId[1],splitResourceId[5]), 
                    DatabaseName = iff(array_length(splitResourceId)==6,splitResourceId[3],splitResourceId[7]), 
                    AppCI = iff(array_length(splitResourceId)==6,splitResourceId[5],splitResourceId[9])
            | project-away splitResourceId,ResourceId
            | order by TimeGenerated asc"""
            return adxQuery
        else:
            raise Exception("Query Formation incomplete")

@databasePerf.route("/",methods=["GET"])
def hello():
    return "Hello"

@databasePerf.route("/databasePerfMetrics",methods=["POST"])
@log_performance()
def getDatabasePerf(data={}):
    try:
        connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
        objectNameMapping = {
            "cpu":'cpu_percent', 
            "storage":'storage_percent', 
            "session count":'sessions_count',
            "user connection failure":'connection_failed_user_error', 
            "log write":'log_write_percent',
            "log read":'physical_data_read_percent', 
            "deadlock":'deadlock', 
            "system connection failure":'connection_failed',
            "dtu":'dtu_consumption_percent'
        }
        
        type = ""
        if(len(data.keys())==0):
            data = request.get_json()
            type = "api"
        
        startTime = data.get("Start Time", None)
        endTime = data.get("End Time", None)
        objectName = data.get("Object Name", [])
        aggregate = data.get("Latest Only", False)
        resourceName = data.get("Resource Name", [])
        
        # Formulate the SQL query condition
        timeTakenBySqlQuery_toReadDatabaseList = ""
        st1 = datetime.now()
        sqlQuerycondition = []
        for k in ["Application CI","Application Family","Support Group"]:
            info = data.get(k,[])
            
            if(len(info)):
                val = ",".join(["'"+i.lower()+"'" for i in info])
                condition = f"lower(al.[{k}]) in ({val})"
        
                sqlQuerycondition.append(condition)
            
        sqlQuerycondition = " or ".join(sqlQuerycondition)
        
        # get Resource Names from DB
        databaseList = []
        databaseListStr = ""
        
        if sqlQuerycondition:
            sqlQuery = f""" Select dl.[Resource Name] from [Database List] as dl
            inner join [Application List] as al on lower(al.[Application CI]) like lower(dl.[Application CI])
            where {sqlQuerycondition}
            """
            result = queryDw(connectionString, sqlQuery)
            
            if result is not None and len(result):
                df_databaseList = pd.DataFrame(np.array(result), columns=["Resource Name"])
                databaseList = df_databaseList["Resource Name"].to_list()
        
        if(len(resourceName)):
            databaseList.extend(resourceName)
        databaseList = [val.lower() for val in databaseList]
        
        if len(databaseList):
            databaseListStr = ",".join(["'"+val+"'" for val in databaseList])
            
        en1 = datetime.now()
        timeTakenBySqlQuery_toReadDatabaseList = (en1-st1).total_seconds()

        # Formulate the ADX query condition
        st2 = datetime.now()
        adxQueryCondition = ""
        if(len(databaseList)):
            if(startTime!=None and endTime!=None):
                adxQueryCondition += f"TimeGenerated >= datetime({startTime}) and TimeGenerated < datetime({endTime}) and tolower(ResourceId) in ({databaseListStr})"
                if(len(objectName)):
                    objectNameList = ",".join(["'"+objectNameMapping[val.lower()]+"'" for val in objectName])
                    adxQueryCondition += f" and tolower(ObjectName) in ({objectNameList})"
            else:
                raise Exception("Start Time/End Time passed is None. It needs to have a datetime value in UTC")
        
        # get Data from ADX
        timeTakenByKqlQuery_toReadPerfData = ""
        df_res = pd.DataFrame()
        if(databaseListStr!=""):
            adxQuery = getQueryDatabase(aggregate, startTime, endTime, databaseListStr)
            df_res = readFromADX(adxQuery)
            if df_res is not None and len(df_res):
                df_res["TimeGenerated"] = df_res["TimeGenerated"].astype(str)
            en2 = datetime.now()
            timeTakenByKqlQuery_toReadPerfData = (en2-st2).total_seconds()

        return {"Data":df_res.to_json(),"status":200, "Time Taken by Sql DB":timeTakenBySqlQuery_toReadDatabaseList,"Time Taken by Kql ADX":timeTakenByKqlQuery_toReadPerfData}
    
    except Exception as ex:
        # Existing error handling
        if ex.args and ex.args[0] is not None and isinstance(ex.args[0], dict):
            info = ex.args[0]
            info["PageName"] = "DatabaseMetricsPerf.py"
            insert_data(info)
        else:
            info = exceptioninfo(ex)
            info["PageName"] = "DatabaseMetricsPerf.py"
            insert_data(info)
        return error_response(501, "Failed to fetch database performance metrics", detail=info, exc=ex)