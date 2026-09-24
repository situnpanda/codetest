import sys
from pathlib import Path
import threading
# Add the parent of 'parent_folder' to sys.path
root = Path(__file__).resolve().parents[1]
sys.path.append(str(root))

from flask import Blueprint, jsonify, request
from shared.dataBase import insertDw, queryDw, connectToDw_AADpwd, insert_data, exceptioninfo, connectToDw_AADpwd_Write
from shared.utils.sessionTokenAction import validateToken
from shared.utils.userActivityLogging import log_user_activity
from shared.appinsights_logger import log_performance, error_response
import pandas as pd
import numpy as np
import base64
import json

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
            sqlQueryCondition.append(f"lower([Early Warnings].[Application Family]) in ({','.join([f"'{a.lower()}'" for a in applicationFamily])})")
        if(len(supportGroup) and "All" not in supportGroup):
            sqlQueryCondition.append(f"lower(al.[Support Group]) in ({','.join([f"'{s.lower()}'" for s in supportGroup])})")
        
        sqlQueryEW = f""" Select Distinct [Early Warning ID],[Early Warnings].[Time Generated],[State],[Summary],[Early Warnings].[Application Family], [State], [Sequential ID] from [Early Warnings] 
        left join 
        (
            SELECT DISTINCT [Application Family], [Support Group]
            FROM [Application List] where [Last Updated] = (Select Max([Last Updated]) from [Application List])
        ) al
        on lower([Early Warnings].[Application Family]) = lower(al.[Application Family])
        {f"where {' and '.join(sqlQueryCondition)}" if len(sqlQueryCondition) else ""} order by [Early Warnings].[Time Generated] desc"""
        
        print(sqlQueryEW)
        res = queryDw(connectionString, sqlQueryEW)
        if(len(res)):
            df_earlyWarning = pd.DataFrame(np.array(res), columns=["Early Warning ID","Time Generated","State","Summary","Application Family","Status","Sequential ID"])
            df_earlyWarning["Summary"] = df_earlyWarning["Summary"].apply(json.loads)
            df_earlyWarning["Time Generated"] = df_earlyWarning["Time Generated"].dt.strftime("%Y-%m-%d %H:%M:%SZ")
            df_earlyWarning["Early Warning ID"] = df_earlyWarning["Early Warning ID"].apply(lambda x: to_url_safe(x))
        return {"Data":df_earlyWarning.to_json(), "status": 200}
    
    except Exception as ex:
        if ex.args and len(ex.args) > 0 and isinstance(ex.args[0], dict):
            info = ex.args[0]
            info["PageName"] = "ChatOps.py"
            insert_data(ex.args[0])
        else:
            info = exceptioninfo(ex)
            info["PageName"] = "ChatOps.py"
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
        
        sqlQueryPI = f""" Select [Potential Issues].[Time Generated],[Resource Name],[Potential Issues].[Application CI], [Resource Type],[Metrics Impacted],[Condition],[Early Warning ID], [Issue ID], [State], [Comments] from [Potential Issues] 
        left join (
            SELECT DISTINCT [Application Family], [Support Group], [Application CI]
            FROM [Application List]
        ) al on lower([Potential Issues].[Application CI]) = lower(al.[Application CI])
        {f"where {' and '.join(sqlQueryCondition)}" if len(sqlQueryCondition) else ""} order by [Potential Issues].[Time Generated] desc"""
        
        print(sqlQueryPI)
        res = queryDw(connectionString, sqlQueryPI)
        if(len(res)):
            df_warningEvents = pd.DataFrame(np.array(res), columns=["Time Generated","Resource Name","Application CI","Resource Type","Metrics Impacted","Condition","Early Warning ID", "Issue ID", "Status", "Comments"])
            df_warningEvents["Time Generated"] = df_warningEvents["Time Generated"].dt.strftime("%Y-%m-%d %H:%M:%SZ")
            df_warningEvents["Early Warning ID"] = df_warningEvents["Early Warning ID"].apply(lambda x: to_url_safe(x))
        return {"Data":df_warningEvents.to_json(), "status": 200}
        
    except Exception as ex:
        if ex.args and len(ex.args) > 0 and isinstance(ex.args[0], dict):
            info = ex.args[0]
            info["PageName"] = "ChatOps.py"
            insert_data(ex.args[0])
        else:
            info = exceptioninfo(ex)
            info["PageName"] = "ChatOps.py"
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
        sqlQueryUpdate = f""" Update [Early Warnings] set [State] = ?, [Last Updated] = GETUTCDATE() where lower([Early Warning ID]) = ?"""
        res = insertDw(connectionString_write, sqlQueryUpdate, arr)
        print(res)
        return {"Data":"State updated successfully", "status": 200}
    except Exception as ex:
        if ex.args and len(ex.args) > 0 and isinstance(ex.args[0], dict):
            info = ex.args[0]
            info["PageName"] = "ChatOps.py"
            insert_data(ex.args[0])
        else:
            info = exceptioninfo(ex)
            info["PageName"] = "ChatOps.py"
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
        
        sqlQueryUpdate = f""" Update [Potential Issues] set [State] = ?, [Comments] = ?, [Last Updated] = GETUTCDATE() where {" OR ".join(sqlQueryCondition)} """
        res = insertDw(connectionString_write, sqlQueryUpdate, arr)
        print("203", res)
        return {"Data":"State updated successfully", "status": 200}
    
    except Exception as ex:
        print(ex)
        if ex.args and len(ex.args) > 0 and isinstance(ex.args[0], dict):
            info = ex.args[0]
            info["PageName"] = "ChatOps.py"
            insert_data(ex.args[0])
        else:
            info = exceptioninfo(ex)
            info["PageName"] = "ChatOps.py"
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
        return {"Data":"State updated successfully", "status": 200}
    
        # return {"Data":"Early Warning updated successfully", "status": 200}
    except Exception as ex:
        print("Error acknowledging early warning:", ex)
        return error_response(501, "Failed to acknowledge/resolve early warning", detail=str(ex), exc=ex)