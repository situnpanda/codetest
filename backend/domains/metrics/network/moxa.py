import sys
from pathlib import Path

# Add the parent of 'parent_folder' to sys.path
root = Path(__file__).resolve().parents[1]
sys.path.append(str(root))

from shared.dataBase import queryDw, connectToDw_AADpwd, insert_data, exceptioninfo
from shared.logAnalytics import queryInLogAnalytics
import pandas as pd
import numpy as np
import gc
from datetime import datetime

from shared.appinsightsLogger import error_response

WORKSPACE_ID = "552b9630-b106-4fe7-a1fa-97d04a0010ef"


def get_moxa_perf(data={}):
    try:
        data = data or {}

        startTime = data.get("Start Time", None)
        endTime = data.get("End Time", None)
        aggregate = data.get("Latest Only", False)
        includeLatest = data.get("Include Latest", False)
        resourceName = data.get("Resource Name", [])
        appCIList = [str(i).lower() for i in data.get("Application CI", [])]

        if startTime is None or endTime is None:
            raise Exception("Start Time/End Time passed is None. It needs to have a datetime value in UTC")

        connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
        result = queryDw(connectionString, "Select ResourceId, MoxaIP from [Moxa List]")

        df_moxaList = pd.DataFrame()
        moxaIpList = []
        if result is not None and len(result):
            df_moxaList = pd.DataFrame(np.array(result), columns=["ResourceId", "MoxaIP"])
            df_moxaList["MoxaIP"] = df_moxaList["MoxaIP"].astype(str).str.strip()

            def extractAppCI(resourceId):
                parts = str(resourceId).split("/")
                for idx, seg in enumerate(parts):
                    if seg.lower() == "applicationci" and idx + 1 < len(parts):
                        return parts[idx + 1]
                return ""
            df_moxaList["ApplicationCI"] = df_moxaList["ResourceId"].apply(extractAppCI)

            if len(appCIList):
                df_moxaList = df_moxaList[df_moxaList["ApplicationCI"].str.lower().isin(appCIList)]

            moxaIpList = [ip.lower() for ip in df_moxaList["MoxaIP"].to_list() if ip]

        if len(resourceName):
            moxaIpList.extend([str(val).lower().strip() for val in resourceName])
        moxaIpList = list(set(moxaIpList))

        moxaIpListStr = ",".join(["'" + ip + "'" for ip in moxaIpList]) if len(moxaIpList) else ""
        st = datetime.now()
        df_res = pd.DataFrame()
        df_latest = pd.DataFrame()

        if moxaIpListStr != "":
            ipCondition = f"| where tolower(MoxaIP) in ({moxaIpListStr})"
            # When includeLatest is requested we fetch the full historical data once
            # and derive the "latest" status in pandas - avoids a 2nd KQL + list fetch.
            timeFilter = (
                f'| where TimeGenerated >= datetime("{startTime}") and TimeGenerated <= datetime("{endTime}")'
                if aggregate and not includeLatest
                else f'| where TimeGenerated >= datetime("{startTime}") and TimeGenerated < datetime("{endTime}")'
            )
            summarize = "| summarize arg_max(TimeGenerated, *) by ServerName, MoxaIP" if aggregate and not includeLatest else ""
            query = f"""moxapingresult_CL
                    {timeFilter}
                    | project TimeGenerated, ServerName = ServerName_s, MoxaIP = MoxaIP_s, Status = Status_s
                    {ipCondition}
                    {summarize}
                    | order by TimeGenerated asc"""

            df_res = queryInLogAnalytics(WORKSPACE_ID, query, "", "")
            if df_res is not None and len(df_res):
                df_res["TimeGenerated"] = df_res["TimeGenerated"].astype(str)
                if len(df_moxaList):
                    df_res["MoxaIP"] = df_res["MoxaIP"].astype(str).str.strip()
                    df_res = df_res.merge(df_moxaList, on="MoxaIP", how="left")
                else:
                    df_res["ApplicationCI"] = ""
                df_res = df_res[[col for col in ["TimeGenerated", "ApplicationCI", "MoxaIP", "Status"] if col in df_res.columns]]
                if includeLatest:
                    df_latest = df_res.sort_values("TimeGenerated").groupby("MoxaIP", as_index=False).last()

        en = datetime.now()
        timeTakenByKqlQuery = (en - st).total_seconds()

        response = {"status": 200, "Data": df_res.to_json(), "meta": {"Time Taken by Kql LAW": timeTakenByKqlQuery}, "error": None}
        if includeLatest:
            response["meta"]["Latest"] = df_latest.to_json()
        del df_res, df_latest
        gc.collect()
        return response

    except Exception as ex:
        if ex.args and isinstance(ex.args[0], dict):
            info = ex.args[0]
        else:
            info = exceptioninfo(ex)
        info["PageName"] = "Moxa.py"
        insert_data(info)
        return error_response(501, "Failed to fetch Moxa switch metrics", detail=info, exc=ex)
