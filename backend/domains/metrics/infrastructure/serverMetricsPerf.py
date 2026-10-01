import sys
from pathlib import Path

# Add the parent of 'parent_folder' to sys.path
root = Path(__file__).resolve().parents[1]
sys.path.append(str(root))

from shared.dataBase import queryDw, connectToDw_AADpwd, insert_data, exceptioninfo
from shared.adx import readFromADX
from domains.metrics.infrastructure.infrastructureTelemetry import fetchCustomThreshold
import pandas as pd
import numpy as np
import gc
import json
from datetime import datetime

from shared.appinsightsLogger import error_response

def updateDatetime(val):
    dt = datetime.strptime(val, "%Y-%m-%d %I:%M:%S %p")
    floored_minute = (dt.minute // 10) * 10
    dt_floored = dt.replace(minute=floored_minute, second=0, microsecond=0)
    val = dt_floored.strftime("%Y-%m-%d %I:%M:%S %p")
    return val

def get_server_perf(data={}):
    try:
        connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
        objectNameMapping = {
            "cpu" : "processor",
            "memory" : "memory",
            "disk" : "logicaldisk"
        }
        data = data or {}

        startTime = data.get("Start Time", None)
        endTime = data.get("End Time", None)
        objectName = data.get("Object Name", [])
        resourceName = data.get("Resource Name", [])
        aggregate = data.get("aggregate", "")
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
            serverList = df_serverList["Resource Name"].to_list()
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
                serverListStr = ",".join(["'"+val+"'" for val in serverList])
                adxQueryCondition += f" and tolower(ResourceId) has_any ({serverListStr})"
        else:
            raise Exception("Start Time/End Time passed is None. It needs to have a datetime value in UTC")
        
        # get Data from ADX
        timeTakenByKqlQuery_toReadPerfData = ""
        df_res = pd.DataFrame()
        if((flag==1 and adxQueryCondition!="") or (flag==0 and len(resourceName)==0)):

            if aggregate == "forGAC":
                # Fetch custom thresholds from SQL and build a KQL datatable
                customThreshold = json.loads(fetchCustomThreshold())
                thresholdRows = ",\n".join(
                    [f"    '{row['AppCI'].lower()}', '{row['Type'].lower()}', real({row['Threshold']})"
                     for row in customThreshold]
                ) if customThreshold else "    '', '', real(90)"

                adxQuery = f"""
let customThresholds = datatable(ct_AppCI:string, ct_Type:string, ct_Threshold:real) [
{thresholdRows}
];
let defaultThreshold = real(90);
Server_Metrics_Perf 
| where {adxQueryCondition}
| extend splitResourceId = split(ResourceId,"/")
| extend SubscriptionId = tostring(iff(array_length(splitResourceId)==4,"",splitResourceId[1])), 
        ResourceGroup = tostring(iff(array_length(splitResourceId)==4,"",splitResourceId[3])), 
        ServerName = tostring(iff(array_length(splitResourceId)==4,splitResourceId[1],splitResourceId[5])),
        AppCI = tostring(iff(array_length(splitResourceId)==4,splitResourceId[3],splitResourceId[7]))
| project-away splitResourceId
| extend AvgValue = iff(tolower(ObjectName)=="logicaldisk", 100.0 - toreal(AvgValue), toreal(AvgValue))
| where AvgValue > 85
| extend AlertType = case(
    tolower(ObjectName)=="processor", "cpu",
    tolower(ObjectName)=="memory", "memory",
    tolower(ObjectName)=="logicaldisk", "disk",
    tolower(ObjectName))
| extend groupKey = iff(isnotempty(DriveName), strcat(ServerName, "_", DriveName), tostring(ServerName))
| extend ct_AppCI = tolower(AppCI), ct_Type = AlertType
| lookup kind=leftouter customThresholds on ct_AppCI, ct_Type
| extend effectiveThreshold = coalesce(ct_Threshold, defaultThreshold)
| extend Threshold = effectiveThreshold
| where AvgValue >= effectiveThreshold
| extend TimeGenerated = bin(TimeGenerated, 10m)
| order by groupKey asc, TimeGenerated asc
| extend prevGroup = prev(groupKey), prevTime = prev(TimeGenerated)
| extend isNewSegment = groupKey != prevGroup or isnull(prevTime) or datetime_diff('minute', TimeGenerated, prevTime) > 10
| extend segmentId = row_cumsum(toint(isNewSegment))
| summarize 
    startTime = min(TimeGenerated),
    endTime = max(TimeGenerated),
    maxDuration = datetime_diff('minute', max(TimeGenerated), min(TimeGenerated)),
    AvgValue = max(AvgValue),
    take_any(ServerName, AppCI, AlertType, groupKey, SubscriptionId, ResourceGroup, ObjectName, Threshold)
    by segmentId
| project-away segmentId
| order by ServerName asc, startTime asc
"""
            else:
                adxQuery = f""" Server_Metrics_Perf 
                | where {adxQueryCondition} 
                | extend splitResourceId = split(ResourceId,"/")
                | extend SubscriptionId = iff(array_length(splitResourceId)==4,"",splitResourceId[1]), 
                        ResourceGroup = iff(array_length(splitResourceId)==4,"",splitResourceId[3]), 
                        ServerName=iff(array_length(splitResourceId)==4,splitResourceId[1],splitResourceId[5]),
                        AppCI = iff(array_length(splitResourceId)==4,splitResourceId[3],splitResourceId[7])
                | project-away splitResourceId
                | order by TimeGenerated asc"""

            df_res = readFromADX(adxQuery)
            if len(df_res) and aggregate != "forGAC":
                df_res["AvgValue"] = df_res.apply(
                    lambda x: 100 - x["AvgValue"] if (x["ObjectName"].lower()=="logicaldisk") else x["AvgValue"], axis=1
                )
                df_res["TimeGenerated"] = df_res["TimeGenerated"].astype(str)
            elif len(df_res) and aggregate == "forGAC":
                # Convert datetime columns to string for JSON serialization
                for col in ["startTime", "endTime"]:
                    if col in df_res.columns:
                        df_res[col] = df_res[col].astype(str).apply(lambda x: x[:16])

            en2 = datetime.now()
            timeTakenByKqlQuery_toReadPerfData = (en2-st2).total_seconds()

        result_json = df_res.to_json()
        del df_res
        gc.collect()
        return {"status": 200, "Data": result_json, "meta": {"Time Taken by Sql DB": timeTakenBySqlQuery_toReadServerList, "Time Taken by Kql ADX": timeTakenByKqlQuery_toReadPerfData}, "error": None}
    
    except Exception as ex:
        # Existing error handling
        if ex.args and ex.args[0] is not None and isinstance(ex.args[0], dict):
            info = ex.args[0]
            info["PageName"] = "ServerMetricsPerf.py"
            insert_data(info)
        else:
            info = exceptioninfo(ex)
            info["PageName"] = "ServerMetricsPerf.py"
            insert_data(info)
        return error_response(501, "Failed to fetch server performance metrics", detail=info, exc=ex)