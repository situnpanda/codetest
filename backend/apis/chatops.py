"""ChatOps HTTP route slice.

Web/routing layer for the ``/api/chatInitiator/*`` endpoints consumed by the
ChatOps feature (early-warning notifications and warning-event actions). Moved
here from ``domains.chatops.ChatOps`` so all ChatOps APIs live in a single VSA
route slice. Behavior and route paths are unchanged.
"""
import sys
from pathlib import Path

# Ensure the backend root is importable (shared.*, domains.*) regardless of the
# current working directory.
root = Path(__file__).resolve().parents[1]
sys.path.append(str(root))

from flask import Blueprint, jsonify, request
from shared.dataBase import insertDw, queryDw, connectToDw_AADpwd, insert_data, exceptioninfo, connectToDw_AADpwd_Write
from shared.sessionTokenAction import validateToken
from shared.userActivityLogging import log_user_activity
from shared.appinsightsLogger import log_performance, error_response
import pandas as pd
import numpy as np
import base64
import json
from shared.environment import ENVIRONMENT

# Each environment reads/writes its own early-warning tables so stag/dev never touch production data.
EARLY_WARNING_TABLES = {
    "production":  ("[Early Warnings]",      "[Potential Issues]"),
    "staging":     ("[Early Warnings Stag]", "[Potential Issues Stag]"),
    "development": ("[Early Warnings Dev]",  "[Potential Issues Dev]"),
}
EW_TABLE, PI_TABLE = EARLY_WARNING_TABLES[ENVIRONMENT]

chatOps = Blueprint("chatInitiator", __name__, url_prefix="/api/chatInitiator")
connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
connectionString_write = connectToDw_AADpwd_Write("sqldb-azure-prod-012.database.windows.net","crcamonitoring","servCRCAMonitoring@providence.org")

def from_url_safe(encoded_id):
    # Adds padding back and decodes
    padding = '=' * (4 - len(encoded_id) % 4)
    return base64.urlsafe_b64decode(encoded_id + padding).decode()

def to_url_safe(original_id):
    return base64.urlsafe_b64encode(original_id.encode()).decode().rstrip("=")

@chatOps.route("/getEarlyWarningsData", methods=["POST"])
@log_performance()
def getEarlyWarningData():
    df_earlyWarning = pd.DataFrame()
    try:
        data = request.get_json()
        
        startTime = data.get("startTime", None)
        endTime = data.get("endTime", None)
        
        issueID = data.get("issueID", [])
        status = data.get("status",[])
        
        applicationFamily = data.get("applicationFamily", [])
        supportGroup = data.get("supportGroup", [])
        
        # if (not startTime or not endTime) and len(issueID) == 0 and len(status) == 0 and len(applicationFamily) == 0 and len(supportGroup) == 0:
        #     return jsonify({"Data": "startTime and endTime are required", "status": 400}), 400

        sqlQueryCondition = []
        maskedIssueID = []
        if(startTime and endTime):
            sqlQueryCondition.append(f"[Start Time] >= '{startTime}' and [End Time] <= '{endTime}'")
        if(len(issueID)):
            issueID = [from_url_safe(i).lower() for i in issueID if i is not None]
            sqlQueryCondition.append(f"lower([Early Warning ID]) in ({','.join([f"'{i}'" for i in issueID])})")
        if(len(status)):
            sqlQueryCondition.append(f"[State] in ({','.join([f"'{s}'" for s in status])})")
        if(len(applicationFamily)):
            sqlQueryCondition.append(f"lower(ew.[Application Family]) in ({','.join([f"'{a.lower()}'" for a in applicationFamily])})")
        if(len(supportGroup) and "All" not in supportGroup):
            sqlQueryCondition.append(f"lower(al.[Support Group]) in ({','.join([f"'{s.lower()}'" for s in supportGroup])})")
        
        sqlQueryEW = f""" Select Distinct [Early Warning ID],ew.[Time Generated],[State],[Summary],ew.[Application Family], [State], [Sequential ID] from {EW_TABLE} ew 
        left join 
        (
            SELECT DISTINCT [Application Family], [Support Group]
            FROM [Application List] where [Last Updated] = (Select Max([Last Updated]) from [Application List])
        ) al
        on lower(ew.[Application Family]) = lower(al.[Application Family])
        {f"where {' and '.join(sqlQueryCondition)}" if len(sqlQueryCondition) else ""} order by ew.[Time Generated] desc"""
        
        print(sqlQueryEW)
        res = queryDw(connectionString, sqlQueryEW)
        if(len(res)):
            df_earlyWarning = pd.DataFrame(np.array(res), columns=["Early Warning ID","Time Generated","State","Summary","Application Family","Status","Sequential ID"])
            df_earlyWarning["Summary"] = df_earlyWarning["Summary"].apply(json.loads)
            df_earlyWarning["Time Generated"] = df_earlyWarning["Time Generated"].dt.strftime("%Y-%m-%d %H:%M:%SZ")
            df_earlyWarning["Early Warning ID"] = df_earlyWarning["Early Warning ID"].apply(lambda x: to_url_safe(x))
        return {"status": 200, "Data": df_earlyWarning.to_json(), "meta": {}, "error": None}
    
    except Exception as ex:
        if ex.args and len(ex.args) > 0 and isinstance(ex.args[0], dict):
            info = ex.args[0]
            info["PageName"] = "chatops.py"
            insert_data(ex.args[0])
        else:
            info = exceptioninfo(ex)
            info["PageName"] = "chatops.py"
            insert_data(info)
        return error_response(501, "Failed to fetch early warnings data", detail=info, exc=ex)
    
@chatOps.route("/getWarningEventsData", methods=["POST"])
@log_performance()
def getWarningEvents():
    df_warningEvents = pd.DataFrame()
    try:
        data = request.get_json()
        
        startTime = data.get("startTime", "")
        endTime = data.get("endTime", "")
        
        applicationFamily = data.get("applicationFamily", [])
        supportGroup = data.get("supportGroup", [])
        
        earlyWarningID = data.get("EarlyWarningID", [])
        warningEventsID = data.get("WarningEventsID", [])
        status = data.get("status",[])
        
        sqlQueryCondition = []
        if(startTime!="" and endTime!=""):
            sqlQueryCondition.append(f"[Last Updated] >= '{startTime}' and [Last Updated] <= '{endTime}'")
        if(len(earlyWarningID)):
            earlyWarningID = [from_url_safe(i).lower() for i in earlyWarningID if i is not None]
            sqlQueryCondition.append(f"lower([Early Warning ID]) in ({','.join([f"'{i}'" for i in earlyWarningID])})")
        if(len(warningEventsID)):
            sqlQueryCondition.append(f"[Issue ID] in ({','.join([f"'{i}'" for i in warningEventsID])})")
        if(len(status)):
            sqlQueryCondition.append(f"[State] in ({','.join([f"'{s}'" for s in status])})")
        if(len(applicationFamily)):
            sqlQueryCondition.append(f"lower(al.[Application Family]) in ({','.join([f"'{a.lower()}'" for a in applicationFamily])})")
        if(len(supportGroup) and "All" not in supportGroup):
            sqlQueryCondition.append(f"lower(al.[Support Group]) in ({','.join([f"'{s.lower()}'" for s in supportGroup])})")
        
        sqlQueryPI = f""" Select pi.[Time Generated],[Resource Name],pi.[Application CI], [Resource Type],[Metrics Impacted],[Condition],[Early Warning ID], [Issue ID], [State], [Comments] from {PI_TABLE} pi 
        left join (
            SELECT DISTINCT [Application Family], [Support Group], [Application CI]
            FROM [Application List]
        ) al on lower(pi.[Application CI]) = lower(al.[Application CI])
        {f"where {' and '.join(sqlQueryCondition)}" if len(sqlQueryCondition) else ""} order by pi.[Time Generated] desc"""
        
        print(sqlQueryPI)
        res = queryDw(connectionString, sqlQueryPI)
        if(len(res)):
            df_warningEvents = pd.DataFrame(np.array(res), columns=["Time Generated","Resource Name","Application CI","Resource Type","Metrics Impacted","Condition","Early Warning ID", "Issue ID", "Status", "Comments"])
            df_warningEvents["Time Generated"] = df_warningEvents["Time Generated"].dt.strftime("%Y-%m-%d %H:%M:%SZ")
            df_warningEvents["Early Warning ID"] = df_warningEvents["Early Warning ID"].apply(lambda x: to_url_safe(x))
        return {"status": 200, "Data": df_warningEvents.to_json(), "meta": {}, "error": None}
        
    except Exception as ex:
        if ex.args and len(ex.args) > 0 and isinstance(ex.args[0], dict):
            info = ex.args[0]
            info["PageName"] = "chatops.py"
            insert_data(ex.args[0])
        else:
            info = exceptioninfo(ex)
            info["PageName"] = "chatops.py"
            insert_data(info)
        return error_response(501, "Failed to fetch warning events data", detail=info, exc=ex)

@chatOps.route("/updateEarlyWarningsData", methods=["POST"])
@log_performance()
def updateEarlyWarningsData(data={}):
    try:
        if(len(data)==0):
            data = request.get_json()
        # data = request.get_json()
        earlyWarningID = data.get("EarlyWarningID")
        earlyWarningID = [from_url_safe(i).lower() for i in earlyWarningID] if earlyWarningID else None
        newState = data.get("Status")
        if not earlyWarningID or not newState:
            return error_response(400, "EarlyWarningID and State are required")
        
        arr = []
        for ind, i in enumerate(earlyWarningID):
            arr.append((newState[ind], i))
            
        print(arr)
        sqlQueryUpdate = f""" Update {EW_TABLE} set [State] = ?, [Last Updated] = GETUTCDATE() where lower([Early Warning ID]) = ?"""
        res = insertDw(connectionString_write, sqlQueryUpdate, arr)
        print(res)
        return {"status": 200, "Data": "State updated successfully", "meta": {}, "error": None}
    except Exception as ex:
        if ex.args and len(ex.args) > 0 and isinstance(ex.args[0], dict):
            info = ex.args[0]
            info["PageName"] = "chatops.py"
            insert_data(ex.args[0])
        else:
            info = exceptioninfo(ex)
            info["PageName"] = "chatops.py"
            insert_data(info)
        return error_response(501, "Failed to update early warnings data", detail=info, exc=ex)
    
@chatOps.route("/updateWarningEventsData", methods=["POST"])
@log_performance()
def updateWarningEventsData(data={}):
    try:
        if(len(data)==0):
            data = request.get_json()
        print("Data received:", data)
        warningEventsID = data.get("WarningEventsID", [])
        earlyWarningID = data.get("EarlyWarningID", [])
        newState = data.get("Status", [])
        comments = data.get("Comments", [])
        if (not warningEventsID and not earlyWarningID) or not newState:
            return error_response(400, "WarningEventsID and Status are required")
        
        arr = []
            
        sqlQueryCondition = []
        if(len(warningEventsID)):
            sqlQueryCondition.append(f"lower([Issue ID]) = ?")
            for ind, i in enumerate(warningEventsID):
                arr.append((newState[ind], comments[ind] if ind < len(comments) else None, i.lower()))
        elif(len(earlyWarningID)):
            earlyWarningID = [from_url_safe(i).lower() for i in earlyWarningID if i is not None]
            sqlQueryCondition.append(f"lower([Early Warning ID]) = ?")
            for ind, i in enumerate(earlyWarningID):
                arr.append((newState[ind], comments[ind] if ind < len(comments) else None, i.lower()))
        
        sqlQueryUpdate = f""" Update {PI_TABLE} set [State] = ?, [Comments] = ?, [Last Updated] = GETUTCDATE() where {" OR ".join(sqlQueryCondition)} """
        res = insertDw(connectionString_write, sqlQueryUpdate, arr)
        print("203", res)
        return {"status": 200, "Data": "State updated successfully", "meta": {}, "error": None}
    
    except Exception as ex:
        print(ex)
        if ex.args and len(ex.args) > 0 and isinstance(ex.args[0], dict):
            info = ex.args[0]
            info["PageName"] = "chatops.py"
            insert_data(ex.args[0])
        else:
            info = exceptioninfo(ex)
            info["PageName"] = "chatops.py"
            insert_data(info)
        return error_response(501, "Failed to update warning events data", detail=info, exc=ex)
    
@chatOps.route("/acknowledgeResolveEarlyWarning", methods=["POST"])
@log_performance()
def acknowledgeResolveEarlyWarning():
    
    emailId = ""
    try:
        auth = request.headers.get("Authorization")
        if not (auth and len(auth.split(" ")) == 2 and auth.split(" ")[0] == "Bearer"):
            return error_response(501, "Invalid Token")
        token = auth.split(" ")[1]
        res,emailId = validateToken(token)
        if not res:
            return error_response(501, "Invalid Token")
    
    except Exception as e:
        print(f"Auth error: {e}")
        return error_response(501, "Invalid Token", exc=e)
    
    try:
        data = request.get_json()
        print("Data received for acknowledge/resolve:", data)
        earlyWarningID = data.get("EarlyWarningID", [])
        statusEarlyWarning = data.get("StatusEarlyWarning", [])
        warningEventsID = data.get("WarningEventsID", [])
        statusWarningEvents = data.get("StatusWarningEvents", [])
        comments = data.get("Comments", [])
        
        if not earlyWarningID and not warningEventsID:
            return error_response(400, "EarlyWarningID and Status are required")
        
        # Update Early Warning
        data = {
            "EarlyWarningID": earlyWarningID,
            "Status": statusEarlyWarning
        }
        resEarlyWarning = updateEarlyWarningsData(data)
        print(resEarlyWarning)
        
        # Update Warning Events
        if(len(warningEventsID)):
            print("here")
            data = {
                "WarningEventsID": warningEventsID,
                "Status": statusWarningEvents,
                "Comments": comments
            }
        else:            
            print("here2")
            data = {
                "EarlyWarningID": earlyWarningID,
                "Status": statusEarlyWarning
            }
        print("243",data)
        resWarningEvents = updateWarningEventsData(data)
        print(resWarningEvents)
        
        # User Logging
        eventWarningLog = []
        for ind, i in enumerate(earlyWarningID):
            info = {"eventID": i, "state":statusEarlyWarning[ind]}
            eventWarningLog.append((emailId, "Early Warning State Update",json.dumps(info), ""))
        print(eventWarningLog)
        sqlQueryLog = f""" Insert into [User Activity Logs] ([Email ID], [Feature Name], [Data], [Exception], [Time Generated]) values (?, ?, ?, ?, GETUTCDATE()) """
        res = insertDw(connectionString_write, sqlQueryLog, eventWarningLog)
        print(res)
        return {"status": 200, "Data": "State updated successfully", "meta": {}, "error": None}
    
        # return {"Data":"Early Warning updated successfully", "status": 200}
    except Exception as ex:
        print("Error acknowledging early warning:", ex)
        return error_response(501, "Failed to acknowledge/resolve early warning", detail=str(ex), exc=ex)
