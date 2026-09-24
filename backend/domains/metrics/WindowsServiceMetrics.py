import sys
from pathlib import Path
import threading
# Add the parent of 'parent_folder' to sys.path
root = Path(__file__).resolve().parents[1]
sys.path.append(str(root))

from flask import Blueprint, jsonify, request
from shared.dataBase import queryDw, connectToDw_AADpwd, insert_data, exceptioninfo
from shared.ADX import readFromADX
import pandas as pd
import numpy as np
from datetime import datetime
from domains.metrics.infrastructure.Pages.ServiceStatus.UrlS import urlStatus
from shared.LogAnalytics import queryInLogAnalytics
from shared.utils.convertTimeZone import convertUtcToPst

from shared.appinsights_logger import log_performance, error_response

servicePerf = Blueprint("applicationTelemetry_serviceStatus", __name__, url_prefix="/api/applicationMetrics")

def getQueryServices(aggregate, startTime, endTime, serviceListStr):
    if aggregate == "forGAC":
        adxQuery = f"""
Windows_Service_Metrics
| where TimeGenerated >= datetime({startTime}) and TimeGenerated < datetime({endTime})
    and strcat(tolower(ResourceId),'/',tolower(ServiceName)) in ({serviceListStr})
| where Status == "Stopped"
| extend splitResourceId = split(ResourceId,"/")
| extend ServerName = tostring(iff(array_length(splitResourceId)==4, splitResourceId[1], splitResourceId[5])),
         AppCI = tostring(iff(array_length(splitResourceId)==4, splitResourceId[3], splitResourceId[7]))
| project-away splitResourceId
| extend groupKey = strcat(tolower(ServerName), "-", tolower(ServiceName))
| extend TimeGenerated = bin(TimeGenerated, 10m)
| order by groupKey asc, TimeGenerated asc
| extend prevGroup = prev(groupKey), prevTime = prev(TimeGenerated)
| extend isNewSegment = groupKey != prevGroup or isnull(prevTime) or datetime_diff('minute', TimeGenerated, prevTime) > 10
| extend segmentId = row_cumsum(toint(isNewSegment))
| summarize
    TimeGenerated = min(TimeGenerated),
    EndTime = max(TimeGenerated),
    Duration = datetime_diff('minute', max(TimeGenerated), min(TimeGenerated)),
    take_any(ServerName, ServiceName, AppCI, Status, HostingType, groupKey)
    by segmentId
| extend MonitorType = "OS-Services", Description = ""
| extend ServerServiceMap = groupKey
| project-away segmentId, groupKey
| order by ServerName asc, TimeGenerated asc
"""
        return adxQuery
    elif(aggregate):
        adxQueryCondition = f""" where TimeGenerated <= datetime({endTime}) and strcat(tolower(ResourceId),'/',tolower(ServiceName)) in ({serviceListStr})
        | summarize arg_max(TimeGenerated, *) by ResourceId,ServiceName"""
        if(adxQueryCondition!=""):
            adxQuery = f""" Windows_Service_Metrics 
            | {adxQueryCondition} 
            | extend splitResourceId = split(ResourceId,"/")
            | extend ServerName=iff(array_length(splitResourceId)==4,splitResourceId[1],splitResourceId[5]), 
                    AppCI = iff(array_length(splitResourceId)==4,splitResourceId[3],splitResourceId[7]),
                    MonitorType = "OS-Services", 
                    Description = "" 
            | extend ServerServiceMap = strcat(tolower(ServerName),"-", tolower(ServiceName))
            | project-away ResourceId, splitResourceId
            | order by TimeGenerated asc"""
            return adxQuery
        else:
            raise Exception("Query Formation incomplete")
    else:
        adxQueryCondition1 = ""
        adxQueryCondition2 = ""
        adxQueryCondition3 = ""
        
        adxQueryCondition1 += f"""where TimeGenerated < datetime({startTime}) and strcat(tolower(ResourceId),'/',tolower(ServiceName)) in ({serviceListStr})
        | summarize arg_max(TimeGenerated, *) by ResourceId,ServiceName 
        | extend TimeGenerated = datetime({startTime})"""
        adxQueryCondition2 += f"where TimeGenerated > datetime({startTime}) and TimeGenerated < datetime({endTime}) and strcat(tolower(ResourceId),'/',tolower(ServiceName)) in ({serviceListStr})"
        adxQueryCondition3 += f"""where TimeGenerated < datetime({endTime}) and strcat(tolower(ResourceId),'/',tolower(ServiceName)) in ({serviceListStr})
        | summarize arg_max(TimeGenerated, *) by ResourceId,ServiceName 
        | extend TimeGenerated = datetime({endTime})"""
        
        if(adxQueryCondition1!=""):
            adxQuery = f""" let query1 = Windows_Service_Metrics
                | {adxQueryCondition1};
                let query2 = Windows_Service_Metrics 
                | {adxQueryCondition2};
                let query3 = Windows_Service_Metrics
                | {adxQueryCondition3};
                union query1, query2, query3
                | extend splitResourceId = split(ResourceId,"/")
                | extend SubscriptionId = iff(array_length(splitResourceId)==4,"",splitResourceId[1]), 
                        ResourceGroup = iff(array_length(splitResourceId)==4,"",splitResourceId[3]), 
                        ServerName=iff(array_length(splitResourceId)==4,splitResourceId[1],splitResourceId[5]), 
                        AppCI = iff(array_length(splitResourceId)==4,splitResourceId[3],splitResourceId[7]),
                        MonitorType = "OS-Services", 
                        Description = "" 
                | extend ServerServiceMap = strcat(tolower(ServerName),"-", tolower(ServiceName))
                | project-away ResourceId, splitResourceId
                | order by TimeGenerated asc
            """
            return adxQuery
        else:
            raise Exception("Query Formation incomplete")
            
def getQueryUrl(aggregate, startTime, endTime, urlListStr):
    if(aggregate == 'forGAC'):
        logAnalyticsQuery =  f""" ServiceMonitoring_CL
                        | extend TimeGenerated = datetime_utc_to_local(TimeGenerated, 'US/Pacific')
                        | where TimeGenerated >= datetime({startTime}) and TimeGenerated <= datetime({endTime}) and tolower(serviceName_s) in ({urlListStr})
                        | extend Status = iff(Status_s contains "Error", "Stopped", "Running")
                        | where Status == "Stopped"
                        | extend ServerServiceMap = strcat(tolower(ServerName_s),"-", tolower(serviceName_s))
                        | extend TimeGenerated = bin(TimeGenerated, 10m)
                        | order by ServerServiceMap asc, TimeGenerated asc
                        | extend prevGroup = prev(ServerServiceMap), prevTime = prev(TimeGenerated)
                        | extend isNewSegment = ServerServiceMap != prevGroup or isnull(prevTime) or datetime_diff('minute', TimeGenerated, prevTime) > 10
                        | extend segmentId = row_cumsum(toint(isNewSegment))
                        | summarize
                            TimeGenerated = min(TimeGenerated),
                            EndTime = max(TimeGenerated),
                            Duration = datetime_diff('minute', max(TimeGenerated), min(TimeGenerated)),
                            take_any(ServerName_s, serviceName_s, ServerServiceMap, AppCI_s, StatusMessage_s)
                            by segmentId
                        | project
                            TimeGenerated,
                            EndTime,
                            Duration,
                            MonitorType = "URL",
                            ServerName = ServerName_s,
                            ServiceName = serviceName_s,
                            ServerServiceMap,
                            Status = "Stopped",
                            Description = StatusMessage_s,
                            AppCI = AppCI_s,
                            HostingType = "URL"
                        | order by TimeGenerated asc """
    elif(aggregate):
        logAnalyticsQuery =  f""" ServiceMonitoring_CL
                        | extend TimeGenerated = datetime_utc_to_local(TimeGenerated, 'US/Pacific')
                        | extend ServerServiceMap = strcat(tolower(ServerName_s),"-", tolower(serviceName_s))
                        | where TimeGenerated>ago(1d) and tolower(serviceName_s) in ({urlListStr})
                        | extend Status = iff(Status_s contains "Error", "Stopped","Running")
                        | summarize  arg_max(TimeGenerated, *)  by ServerServiceMap 
                        | project
                            TimeGenerated,
                            MonitorType = MonitorType_s,
                            ServerName = ServerName_s,
                            ServiceName = serviceName_s,
                            ServerServiceMap,
                            Status,
                            AppCI = AppCI_s,
                            HostingType = "URL" """ 
    else:
        logAnalyticsQuery =  f""" ServiceMonitoring_CL
                        | extend TimeGenerated = datetime_utc_to_local(TimeGenerated, 'US/Pacific')
                        | extend ServerServiceMap = strcat(tolower(ServerName_s),"-", tolower(serviceName_s))
                        | where TimeGenerated >= datetime({startTime}) and TimeGenerated <= datetime({endTime}) and tolower(serviceName_s) in ({urlListStr})
                        | extend Status = iff(Status_s contains "Error", "Stopped", "Running")
                        | project
                            TimeGenerated,
                            MonitorType = MonitorType_s,
                            ServerName = ServerName_s,
                            ServiceName = serviceName_s,
                            ServerServiceMap,
                            Status,
                            ResourceGroup,
                            SubscriptionId = SubscriptionId,
                            Description = StatusMessage_s,
                            AppCI = AppCI_s,
                            HostingType = "URL"
                        | order by TimeGenerated asc """
    return logAnalyticsQuery

@servicePerf.route("/",methods=["GET"])
def hello():
    return "Hello"

@servicePerf.route("/serviceUrlMetrics", methods=["POST"])
@log_performance()
def getServiceUrlStatus():
    try:
        data = request.get_json()
        st = datetime.now()
        objectName = data.get("Object Name", [])
        threads = []
        df = pd.DataFrame()
        status=[]
        lock = threading.Lock()
        results = []
        
        if("services" in objectName):
            threads.append(threading.Thread(target=getServiceStatus, args=(data,results,lock)))
            
        if("url" in objectName):
            threads.append(threading.Thread(target=getUrlStatus, args=(data,results,lock)))
            
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        
        responseData = {}
        for result in results:
            df = pd.concat([df,result["Data"]], axis=0, ignore_index=True)
            status.append(result["status"])
            for key in result:
                if(key != "Data" or key!="status"):
                    responseData[key] = result[key]
        en = datetime.now()
        responseData["Data"] = df.to_json()
        responseData["status"] = 200 if 200 in status else (501 if 501 in status else 200)
        responseData["TotalTimeTaken"] = (en-st).total_seconds()
        
        return responseData
    
    except Exception as ex:
        # Existing error handling
        if isinstance(ex.args[0], dict):
            info = ex.args[0]
            info["PageName"] = "WindowsServiceMetrics.py"
        else:
            info = exceptioninfo(ex)
            info["PageName"] = "WindowsServiceMetrics.py"
        return error_response(501, "Failed to fetch windows service metrics", detail=info, exc=ex)

@servicePerf.route("/serviceMetrics",methods=["POST"])
@log_performance()
def getServiceStatus(data={},results=[],lock=threading.Lock()):
    try:
        type = ""
        if(not len(data)):
            type = "api"
            data = request.get_json()
        
        connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
        objectNameMapping = {
            "cpu" : "processor",
            "memory" : "memory",
            "disk" : "logicaldisk"
        }
        
        startTime = data.get("Start Time", None)
        endTime = data.get("End Time", None)
        # objectName = data.get("Object Name", [])
        resourceName = data.get("Resource Name", [])
        aggregate = data.get("Latest Only", "")
        
        # Formulate the SQL query condition
        timeTakenBySqlQuery_toReadserviceList = ""
        st1 = datetime.now()
        sqlQuerycondition = []
        for k in ["Application CI","Application Family","Support Group","Resource Name"]:
            info = data.get(k,[])
            
            if(len(info)):
                val = ",".join(["'"+i.lower()+"'" for i in info])
                if(k=="Resource Name"):
                    condition = f"lower(sl.[{k}]) in ({val})"
                else:
                    condition = f"lower(al.[{k}]) in ({val})"
        
                sqlQuerycondition.append(condition)
            
        sqlQuerycondition = " or ".join(sqlQuerycondition)
        
        # get Resource Names from DB
        sqlQuery = f""" Select wsl.[Resource Name]+'/'+ trim(wsl.[Service Name]) from [Windows Services List] as wsl
        inner join [Server List] as sl on lower(sl.[Resource Name]) like lower(wsl.[Resource Name]) 
        inner join [Application List] as al on lower(al.[Application CI]) like lower(sl.[Application CI])
        where {sqlQuerycondition}
        """
        result = queryDw(connectionString,sqlQuery)
        serviceList=[]
        if(len(result)):
            df_serviceList = pd.DataFrame(np.array(result),columns=["Resource Name"])
            serviceList = df_serviceList["Resource Name"].to_list()
        if(len(resourceName)):
            serviceList.extend(resourceName)
        serviceList = [val.lower() for val in serviceList]
        en1 = datetime.now()
        timeTakenBySqlQuery_toReadserviceList = (en1-st1).total_seconds()
        
        # Formulate the ADX query condition
        st2 = datetime.now()
        
        if(len(serviceList)):
            if(startTime!=None and endTime!=None):
                serviceListStr = ",".join(["'"+val+"'" for val in serviceList])
            else:
                raise Exception("Start Time/End Time passed is None. It needs to have a datetime value in UTC")
        else:
            raise Exception("No Services Found/Onboarded")
            
        # get Data from ADX
        timeTakenByKqlQuery_toReadServicesData = ""
        df_res = pd.DataFrame()
        adxQuery = getQueryServices(aggregate,startTime, endTime,serviceListStr)
        df_res = readFromADX(adxQuery)
        if(len(df_res)):
            if aggregate == "forGAC":
                for col in ["TimeGenerated", "EndTime"]:
                    if col in df_res.columns:
                        df_res[col] = df_res[col].astype(str).apply(lambda x: x[:16])
            else:
                df_res["TimeGenerated"] = df_res["TimeGenerated"].astype(str)
        en2 = datetime.now()
        timeTakenByKqlQuery_toReadServicesData = (en2-st2).total_seconds()
        
        if(type=="api"):
            return {"Data":df_res.to_json(),"status":200, "Time Taken by Sql DB to fetch  Services List":timeTakenBySqlQuery_toReadserviceList,"Time Taken by Kql to fetch Services Data":timeTakenByKqlQuery_toReadServicesData}
        else:
            results.append(
                {"Data":df_res,"status":200, "Time Taken by Sql DB to fetch Services List":timeTakenBySqlQuery_toReadserviceList,"Time Taken by Kql to fetch Services Data":timeTakenByKqlQuery_toReadServicesData}
            ) 
    except Exception as ex:
        # Existing error handling
        if isinstance(ex.args[0], dict):
            info = ex.args[0]
            info["PageName"] = "WindowsServiceMetrics.py"
            # insert_data(ex.args[0])
        else:
            info = exceptioninfo(ex)
            info["PageName"] = "WindowsServiceMetrics.py"
            # insert_data(info)
        return error_response(501, "Failed to fetch windows service metrics", detail=info, exc=ex)
    
@servicePerf.route("/urlMetrics",methods=["POST"])
@log_performance()
def getUrlStatus(data = {},results=[],lock=threading.Lock()):
    try:
        type = ""
        if(not len(data)):
            type = "api"
            data = request.get_json()
        
        connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
        
        startTime = convertUtcToPst(data.get("Start Time", None))
        endTime = convertUtcToPst(data.get("End Time", None))
        aggregate = data.get("Latest Only", "")
        
        # Formulate the SQL query condition
        timeTakenBySqlQuery_toReadurlList = ""
        st1 = datetime.now()
        sqlQuerycondition = []
        for k in ["Application CI","Application Family","Support Group"]:
            info = data.get(k,[])
            
            if(len(info)):
                val = ",".join(["'"+i.lower()+"'" for i in info])
                condition = f"lower(al.[{k}]) in ({val})"
        
                sqlQuerycondition.append(condition)
            
        sqlQuerycondition = " or ".join(sqlQuerycondition)
        
        # get URLs from DB
        sqlQuery = f""" Select lower([URL]) from ServiceMon_InputData as url
        inner join [Application List] as al on lower(al.[Application CI]) like lower(url.[AppCI])
        where {sqlQuerycondition}"""
        
        result = queryDw(connectionString,sqlQuery)
        urlList=[]
        if(len(result)):
            df_urlList = pd.DataFrame(np.array(result),columns=["URL"])
            urlList = df_urlList["URL"].to_list()
        urlList = [val.lower() for val in urlList]
        en1 = datetime.now()
        timeTakenBySqlQuery_toReadurlList = (en1-st1).total_seconds()
        
        # Formulate the ADX query condition
        st2 = datetime.now()
        
        if(len(urlList)):
            if(startTime!=None and endTime!=None):
                urlListStr = ",".join(["'"+val+"'" for val in urlList])
                # if(len(objectName)):
                #     objectNameList = ",".join(["'"+objectNameMapping[val.lower()]+"'" for val in objectName])
                #     adxQueryCondition += f" and tolower(ObjectName) in ({objectNameList})"
            else:
                raise Exception("Start Time/End Time passed is None. It needs to have a datetime value in UTC")
        else:
            raise Exception("No URLs Found/Onboarded")
        
        # get Data from LAW
        timeTakenByKqlQuery_toReadUrlData = ""
        df_res = pd.DataFrame()
        lawQuery = getQueryUrl(aggregate,startTime, endTime,urlListStr)
        workspaceId = "552b9630-b106-4fe7-a1fa-97d04a0010ef"
        df_res = queryInLogAnalytics(workspaceId, lawQuery,"","")
        
        if(len(df_res)>0):
            for col in ["TimeGenerated", "EndTime"]:
                if col in df_res.columns and hasattr(df_res[col], 'dt'):
                    df_res[col] = df_res[col].dt.tz_localize(None)
                    df_res[col] = df_res[col].dt.tz_localize('America/Los_Angeles', nonexistent='shift_forward', ambiguous='infer')
                    df_res[col] = df_res[col].dt.tz_convert('UTC')
                    df_res[col] = df_res[col].astype(str)
            
        en2 = datetime.now()
        timeTakenByKqlQuery_toReadUrlData = (en2-st2).total_seconds()
        
        if(type=="api"):
            return {"Data":df_res.to_json(),"status":200, "Time Taken by Sql DB to fetch Url List":timeTakenBySqlQuery_toReadurlList,"Time Taken by Kql to fetch Url Data":timeTakenByKqlQuery_toReadUrlData}
        else:
            results.append(
                {"Data":df_res,"status":200, "Time Taken by Sql DB to fetch Url List":timeTakenBySqlQuery_toReadurlList,"Time Taken by Kql to fetch Url Data":timeTakenByKqlQuery_toReadUrlData}
            ) 
        
    except Exception as ex:
        if isinstance(ex.args[0], dict):
            info = ex.args[0]
            info["PageName"] = "WindowsServiceMetrics.py"
            # insert_data(ex.args[0])
        else:
            info = exceptioninfo(ex)
            info["PageName"] = "WindowsServiceMetrics.py"
            # insert_data(info)
        return error_response(501, "Failed to fetch windows service metrics", detail=info, exc=ex)
        