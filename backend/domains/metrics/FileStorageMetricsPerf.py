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

fileStoragePerf = Blueprint("infrastructureTelemetry_fileStorageMetrics", __name__, url_prefix="/api/infrastructureMetrics")

def getQueryFileshare(aggregate, startTime, endTime, fileshareListStr):
    if(aggregate):
        adxQueryCondition = f""" where TimeGenerated <= datetime({endTime}) and tolower(ResourceId) in ({fileshareListStr})
        | summarize arg_max(TimeGenerated, *) by ResourceId"""
        
        if(adxQueryCondition!=""):
            adxQuery = f""" FileStorage_Metrics_Perf 
            | {adxQueryCondition} 
            | extend ResourceId = tolower(ResourceId)
            | extend splitResourceId = split(ResourceId,"/")
            | extend 
                    SubscriptionID = iff(array_length(splitResourceId)==6,"",splitResourceId[1]),
                    ResourceGroup = iff(array_length(splitResourceId)==6,"",splitResourceId[3]),
                    StorageAccountName=iff(array_length(splitResourceId)==6,splitResourceId[1],splitResourceId[5]), 
                    Fileshare = iff(array_length(splitResourceId)==6,splitResourceId[3],splitResourceId[7]), 
                    AppCI = iff(array_length(splitResourceId)==6,splitResourceId[5],splitResourceId[9])
            | project-away splitResourceId
            | order by TimeGenerated asc"""
            return adxQuery
        else:
            raise Exception("Query Formation incomplete")
    else:
        adxQueryCondition = f""" where TimeGenerated >= datetime({startTime}) and TimeGenerated < datetime({endTime}) and tolower(ResourceId) in ({fileshareListStr})"""
        if(adxQueryCondition!=""):
            adxQuery = f""" FileStorage_Metrics_Perf 
            | {adxQueryCondition} 
            | extend ResourceId = tolower(ResourceId)
            | extend splitResourceId = split(ResourceId,"/")
            | extend 
                    SubscriptionID = iff(array_length(splitResourceId)==6,"",splitResourceId[1]),
                    ResourceGroup = iff(array_length(splitResourceId)==6,"",splitResourceId[3]),
                    StorageAccountName=iff(array_length(splitResourceId)==6,splitResourceId[1],splitResourceId[5]), 
                    Fileshare = iff(array_length(splitResourceId)==6,splitResourceId[3],splitResourceId[7]), 
                    AppCI = iff(array_length(splitResourceId)==6,splitResourceId[5],splitResourceId[9])
            | project-away splitResourceId
            | order by TimeGenerated asc"""
            return adxQuery
        else:
            raise Exception("Query Formation incomplete")
        
@fileStoragePerf.route("/",methods=["GET"])
def hello():
    return "Hello"

@fileStoragePerf.route("/fileStoragePerfMetrics",methods=["POST"])
@log_performance()
def getFileStoragePerf():
    try:
        connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
        objectNameMapping = {
            "storage":'storage', 
        }
        data = request.get_json()
        startTime = data.get("Start Time", None)
        endTime = data.get("End Time", None)
        objectName = data.get("Object Name", [])
        resourceName = data.get("Resource Name", [])
        aggregate = data.get("Latest Only", [])
        
        # Formulate the SQL query condition
        timeTakenBySqlQuery_toReadFileStorageList = ""
        st1 = datetime.now()
        sqlQuerycondition = []
        for k in ["Application CI","Application Family","Support Group"]:
            info = data.get(k,[])
            
            if(len(info)):
                val = ",".join(["'"+i.lower()+"'" for i in info])
                condition = f"lower(al.[{k}]) in ({val})"
        
                sqlQuerycondition.append(condition)
            
        sqlQuerycondition = " or ".join(sqlQuerycondition)
        result = []
        if(sqlQuerycondition!=""):
            # get Resource Names from DB
            sqlQuery = f""" Select lower(trim(fsl.[Resource Name])), fsl.[Provisioned Capacity in GB] from [File Storage List] as fsl
            inner join [Application List] as al on lower(al.[Application CI]) like lower(fsl.[Application CI])
            where {sqlQuerycondition}
            """
            result = queryDw(connectionString,sqlQuery)
        fileStorageList=[]
        if(len(result)):
            df_fileStorageList = pd.DataFrame(np.array(result),columns=["ResourceId", "Provisioned Capacity in GB"])
            fileStorageList = df_fileStorageList["ResourceId"].to_list()
        if(len(resourceName)):
            fileStorageList.extend(resourceName)
        fileStorageList = [val.lower() for val in fileStorageList]
        en1 = datetime.now()
        timeTakenBySqlQuery_toReadFileStorageList = (en1-st1).total_seconds()

        # Formulate the ADX query condition
        st2 = datetime.now()
        fileStorageListStr = ""
        if(len(fileStorageList)):
            if(startTime!=None and endTime!=None):
                fileStorageListStr = ",".join(["'"+val+"'" for val in fileStorageList])
            else:
                raise Exception("Start Time/End Time passed is None. It needs to have a datetime value in UTC")
        
        # get Data from ADX
        timeTakenByKqlQuery_toReadFileshareData = ""
        df_res = pd.DataFrame()
        if(fileStorageListStr!=""):
            adxQuery = getQueryFileshare(aggregate,startTime, endTime,fileStorageListStr)
            df_res = readFromADX(adxQuery)
            if(len(df_res)):
                df_res = pd.merge(df_res,df_fileStorageList,how="inner",on=["ResourceId"])
                df_res["TimeGenerated"] = df_res["TimeGenerated"].astype(str)
                # df_res = df_res.drop(columns=["ResourceId"], axis=1)
                df_res.rename(columns={"Provisioned Capacity in GB":"Provisioned Capacity (GiB)", "UtilizedValue_inGiB":"Used Capacity (GiB)"}, inplace=True)
            en2 = datetime.now()
            timeTakenByKqlQuery_toReadFileshareData = (en2-st2).total_seconds()

        return {"Data":df_res.to_json(),"status":200, "Time Taken by Sql DB":timeTakenBySqlQuery_toReadFileStorageList,"Time Taken by Kql ADX":timeTakenByKqlQuery_toReadFileshareData}
    except Exception as ex:
        # Existing error handling
        if ex.args and ex.args[0] is not None and isinstance(ex.args[0], dict):
            info = ex.args[0]
            info["PageName"] = "FileStorageMetricsPerf.py"
            insert_data(info)
        else:
            info = exceptioninfo(ex)
            info["PageName"] = "FileStorageMetricsPerf.py"
            insert_data(info)
        return error_response(501, "Failed to fetch file storage performance metrics", detail=info, exc=ex)