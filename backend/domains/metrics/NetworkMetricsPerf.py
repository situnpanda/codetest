import sys
from pathlib import Path

# Add the parent of 'parent_folder' to sys.path
root = Path(__file__).resolve().parents[1]
sys.path.append(str(root))

from flask import Blueprint, jsonify, request
from shared.dataBase import queryDw, connectToDw_AADpwd, insert_data, exceptioninfo
from shared.ADX import readFromADX
from shared.utils import convertTimeZone
import pandas as pd
import numpy as np
from datetime import datetime

from shared.appinsights_logger import log_performance, error_response

networkPerf = Blueprint("infrastructureTelemetry_networkMetrics", __name__, url_prefix="/api/infrastructureMetrics")

def updateDatetime(val):
    dt = datetime.strptime(val, "%Y-%m-%d %I:%M:%S %p")
    floored_minute = (dt.minute // 10) * 10
    dt_floored = dt.replace(minute=floored_minute, second=0, microsecond=0)
    val = dt_floored.strftime("%Y-%m-%d %I:%M:%S %p")
    return val

@networkPerf.route("/",methods=["GET"])
def hello():
    return "Hello"

@networkPerf.route("/networkPerfMetrics",methods=["POST"])
@log_performance()  
def getNetworkPerf(data={}):
    try:
        connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
        objectNameMapping = {
            "bytes_received_rate": "bytes_received_rate",
            "bytes_sent_rate": "bytes_sent_rate",
            "packets_received_rate": "packets_received_rate",
            "packets_sent_rate": "packets_sent_rate",
            "network_in_total": "network_in_total",
            "network_out_total": "network_out_total"
        }
        type = ""
        if(len(data.keys())==0):
            data = request.get_json()
            type = "api"
        
        startTime = data.get("Start Time", None)
        endTime = data.get("End Time", None)
        objectName = data.get("Object Name", [])
        resourceName = data.get("Resource Name", [])
        flag = 0
        
        startTime = updateDatetime(startTime)
        endTime = updateDatetime(endTime)

        # Formulate the SQL query condition
        timeTakenBySqlQuery_toReadServerList = ""
        st1 = datetime.now()
        sqlQuerycondition = []
        for k in ["Application CI","Application Family","Support Group"]:
            info = data.get(k,[])
            flag = 1
            if(len(info)):
                val = ",".join(["'"+i.lower()+"'" for i in info])
                condition = f"lower(al.[{k}]) in ({val})"
        
                sqlQuerycondition.append(condition)
            
        sqlQuerycondition = " or ".join(sqlQuerycondition)
        result=[]
        if(sqlQuerycondition!=""):
            # get Resource Names from DB
            sqlQuery = f""" Select sl.[Resource Name] from [Server List] as sl
                inner join [Application List] as al on lower(al.[Application CI]) like lower(sl.[Application CI])
                where {sqlQuerycondition}
            """
            result = queryDw(connectionString,sqlQuery)
        serverList=[]
        if(len(result)):
            df_serverList = pd.DataFrame(np.array(result),columns=["Resource Name"])
            # Extract server names from full ResourceId paths
            # Format: SubscriptionID/.../ResourceGroup/.../ServerName/servername/ApplicationCI/...
            df_serverList["Server Name"] = df_serverList["Resource Name"].apply(
                lambda x: x.split("/")[x.lower().split("/").index("servername") + 1].lower()
            )
            serverList = df_serverList["Server Name"].to_list()
        if(len(resourceName)):
            serverList.extend(resourceName)
        serverList = [val.lower() for val in serverList]
        en1 = datetime.now()
        timeTakenBySqlQuery_toReadServerList = (en1-st1).total_seconds()

        # Formulate the ADX query condition
        st2 = datetime.now()
        adxQueryCondition = ""
        if(startTime!=None and endTime!=None):
            adxQueryCondition += f"TimeGenerated >= datetime({startTime}) and TimeGenerated < datetime({endTime})"
            if(len(objectName)):
                objectNameList = ",".join(["'"+objectNameMapping[val.lower()]+"'" for val in objectName])
                adxQueryCondition += f" and tolower(ObjectName) in ({objectNameList})"
            if(len(serverList)):            
                serverListRegex = "|".join([val for val in serverList])
                adxQueryCondition += f' and tolower(ResourceId) matches regex @"({serverListRegex})"'
        else:
            raise Exception("Start Time/End Time passed is None. It needs to have a datetime value in UTC")
        
        # get Data from ADX
        timeTakenByKqlQuery_toReadPerfData = ""
        df_res = pd.DataFrame()
        if((flag==1 and adxQueryCondition!="") or (flag==0 and len(resourceName)==0)):
            adxQuery = f""" Network_Metrics_Perf 
            | where {adxQueryCondition} 
            | extend splitResourceId = split(ResourceId,"/")
            | extend SubscriptionId = tostring(splitResourceId[1]),
                    ResourceGroup = tostring(splitResourceId[3]),
                    ServerNameRaw = tostring(splitResourceId[5]),
                    ServerName = tostring(split(splitResourceId[5], "_")[0])
            | project-away ResourceId, splitResourceId, ServerNameRaw
            | order by TimeGenerated asc"""
            df_res = readFromADX(adxQuery)
            if(len(df_res)):
                df_res["TimeGenerated"] = df_res["TimeGenerated"].astype(str)
            en2 = datetime.now()
            timeTakenByKqlQuery_toReadPerfData = (en2-st2).total_seconds()

        # if(type=="api"):
        return {"Data":df_res.to_json(),"status":200, "Time Taken by Sql DB":timeTakenBySqlQuery_toReadServerList,"Time Taken by Kql ADX":timeTakenByKqlQuery_toReadPerfData}
        # else:
        #     return df_res
    except Exception as ex:
        # Existing error handling
        if ex.args and ex.args[0] is not None and isinstance(ex.args[0], dict):
            info = ex.args[0]
            info["PageName"] = "NetworkMetrics.py"
            insert_data(info)
        else:
            info = exceptioninfo(ex)
            info["PageName"] = "NetworkMetrics.py"
            insert_data(info)
        return error_response(501, "Failed to fetch network performance metrics", detail=info, exc=ex)
