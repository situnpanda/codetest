import sys
from pathlib import Path
root = Path(__file__).resolve().parents[1]
sys.path.append(str(root))
from shared.dataBase import queryDw, connectToDw_AADpwd, insert_data, exceptioninfo
from shared.adx import readFromADX
import pandas as pd
import numpy as np
from datetime import datetime

from shared.appinsightsLogger import error_response

def get_load_balancer_perf(data={}):
    try:
        connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net","crcamonitoring","servCRCAMonitoring@providence.org")

      
        objectNameMapping = {
            "vipavailability": "vipavailability",
            "dipavailability": "dipavailability",
            "bytecount": "bytecount",
            "packetcount": "packetcount",
            "syncount": "syncount",
            "snatconnectioncount": "snatconnectioncount",
        }

        data = data or {}

        startTime = data.get("Start Time", None)
        endTime = data.get("End Time", None)
        objectName = data.get("Object Name", [])
        resourceName = data.get("Resource Name", [])

        timeTakenBySqlQuery_toReadLbList = ""
        st1 = datetime.now()

        sqlQuerycondition = []
        for k in ["Application CI", "Application Family", "Support Group"]:
            info = data.get(k, [])
            if len(info):
                val = ",".join(["'" + i.lower() + "'" for i in info])
                condition = f"lower(al.[{k}]) in ({val})"
                sqlQuerycondition.append(condition)

        sqlQuerycondition = " or ".join(sqlQuerycondition)

        lbList = []
        if sqlQuerycondition:
            sqlQuery = f""" Select ll.[Resource Name] from [LoadBalancer List] as ll
        inner join [Application List] as al on lower(al.[Application CI]) like lower(ll.[Application CI])
        where {sqlQuerycondition}
        """
            result = queryDw(connectionString, sqlQuery)
            if len(result):
                df_lbList = pd.DataFrame(np.array(result), columns=["Resource Name"])
                lbList = df_lbList["Resource Name"].to_list()

        if len(resourceName):
            lbList.extend(resourceName)
        lbList = [val.lower() for val in lbList]

        en1 = datetime.now()
        timeTakenBySqlQuery_toReadLbList = (en1 - st1).total_seconds()

        st2 = datetime.now()
        adxQueryCondition = ""
        if len(lbList):
            if startTime is not None and endTime is not None:
                lbListStr = ",".join(["'" + val + "'" for val in lbList])
                adxQueryCondition += (
                    f"TimeGenerated >= datetime({startTime}) and TimeGenerated < datetime({endTime}) "
                    f"and tolower(ResourceId) in ({lbListStr})"
                )
                if len(objectName):
                    mappedObjectNames = [objectNameMapping[val.lower()] for val in objectName]
                    objectNameList = ",".join(["'" + v + "'" for v in mappedObjectNames])
                    adxQueryCondition += f" and tolower(ObjectName) in ({objectNameList})"
            else:
                raise Exception(
                    "Start Time/End Time passed is None. It needs to have a datetime value in UTC"
                )

        timeTakenByKqlQuery_toReadPerfData = ""
        df_res = pd.DataFrame()
        if adxQueryCondition != "":
            adxQuery = (
                f" LoadBalancer_Metrics_Perf | where {adxQueryCondition} | order by TimeGenerated asc"
            )
            # print("the adx query is", adxQuery)
            df_res = readFromADX(adxQuery)
            if len(df_res):
                df_res["TimeGenerated"] = df_res["TimeGenerated"].astype(str)
            en2 = datetime.now()
            timeTakenByKqlQuery_toReadPerfData = (en2 - st2).total_seconds()

        return {
            "status": 200,
            "Data": df_res.to_json(),
            "meta": {
                "Time Taken by Sql DB": timeTakenBySqlQuery_toReadLbList,
                "Time Taken by Kql ADX": timeTakenByKqlQuery_toReadPerfData,
            },
            "error": None,
        }

    except Exception as ex:
        # Existing error handling
        if ex.args and ex.args[0] is not None and isinstance(ex.args[0], dict):
            info = ex.args[0]
            info["PageName"] = "LoadBalancerMetricsPerf.py"
            insert_data(info)
        else:
            info = exceptioninfo(ex)
            info["PageName"] = "LoadBalancerMetricsPerf.py"
            insert_data(info)
        return error_response(501, "Failed to fetch load balancer performance metrics", detail=info, exc=ex)
