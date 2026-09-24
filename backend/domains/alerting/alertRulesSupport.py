from shared.LogAnalytics import post_data_to_log_analytics
from shared.dataBase import queryDw,insertDw,updateDw, connectToDw_AADpwd,connectToDw_AADpwd_Write
import json
import requests

from flask import Blueprint, jsonify, request

# All routes in this blueprint will be under /api/AlertRules/*
alert_rules_bp = Blueprint("alert_rules", __name__, url_prefix="/api/AlertRules")

connectionString_write = connectToDw_AADpwd_Write("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")

@alert_rules_bp.route("/insertEventLogs",methods=["POST"])
def insertEventLogs(data={}):
    if(len(data.keys())==0):
        bodyParams = request.json
        data = bodyParams["data"]
    
    try:
        col = ["Event ID", "Time Generated", "Event Metric", "Source Event ID", "Source Name", "Source Instance", "Source Alert Rule Name", "Event Severity", "Event State", "Alert ID", "Application CI", "Resource Name"]
        eventId = data["essentials"]["alertId"]
        alertId = data["essentials"]["originalAlertId"]
        timeGenerated = data["essentials"]["eventTriggerDateTime"]
        eventSplit = eventId.split("/")
        alertRuleName = data["essentials"]["alertRule"]
        severity = data["essentials"]["severity"]
        state = data["essentials"]["monitorCondition"]
        resName = data["Resource Name"]
        appCI = resName.split("/")[-1]
        metricType = data["essentials"]["signalType"]
        print(eventId)
        columns = ','.join([f"[{c}]" for c in col])
        placeholders = ','.join(['?' for _ in col])
        values = [eventId, timeGenerated,metricType,eventId,eventSplit[3]+"/"+eventSplit[5],"",alertRuleName, severity,state, alertId, appCI, resName]
        try:
            sqlQuery = f""" Insert into [Event Logs] ({columns}) values ({placeholders})"""
            print(sqlQuery)
            res = insertDw(connectionString_write,sqlQuery,[tuple(values)])
            print(res)
            return res
        except Exception as ex:
            print(ex)
            return "Exception"
    except Exception as ex:
        print(ex)
        return "Exception"

@alert_rules_bp.route("/insertAlertLogs",methods=["POST"])
def insertAlertLogs(data={}):
    if(len(data.keys())==0):
        bodyParams = request.json
        data = bodyParams["data"]
    try:
        col = ["Alert ID", "Time Generated", "Time Updated", "Resource Name", "Alert Type", "Alert Message", "Acknowledgement", "Incident Number", "Application CI", "Alert State", "Event Counter", "Impacted CI", "Application Family", "Communication"]
        alertId = data["essentials"]["originalAlertId"]
        eventId = data["essentials"]["alertId"]
        if(alertId==eventId):
            timeGenerated = data["essentials"]["eventTriggerDateTime"]
            eventSplit = eventId.split("/")
            appFamily = data.get("Application Family", None)
            appCI = data.get("Application CI", None)
            resourceName = data.get("Resource Name", None)
            state = data["essentials"]["monitorCondition"]
            communication = json.dumps(data["communication"])
            eventBody = json.dumps(data["data"])
            print(eventId)
            columns = ','.join([f"[{c}]" for c in col])
            placeholders = ','.join(['?' for _ in columns.split(',')])
            values = [alertId, timeGenerated, timeGenerated,resourceName,eventSplit[-2],eventBody,"No","", appCI,state,1,"",appFamily,communication]
            print(values)
            try:
                sqlQuery = f""" Insert into [Alert Logs] ({columns}) values ({placeholders})"""
                print(sqlQuery)
                res = insertDw(connectionString_write,sqlQuery,[tuple(values)])
                print(res)
                # call Alert Body
                # functionName(data, data["Communication"])
                return res
            except Exception as ex:
                print(ex)
                return "Exception"
    except Exception as ex:
        print(ex)
        return "Exception"

def build_resource_table_teams_html(data, alertRule):
    section_titles = {
        "memory": "Memory", "vm": "Virtual Machines", "cpu": "CPU", "disk": "Disk",
        "fileshares": "File Shares", "services": "Services", "dtu": "DTU",
        "storage": "Storage", "database heartbeat": "Database Heartbeat"
    }
    html = f"<table border='1'>"
    html += (
        "<tr>"
        "<th>Server / Resource</th>"
        "<th>Details</th>"
        "<th>Utilization / Status</th>"
        "</tr>"
    )
    for section, items in (data or {}).items():
        if section not in section_titles:
            continue
        html += f"<tr><td colspan='3'><b>{section_titles[section]}</b></td></tr>"
        for row in items:
            resName = row.get("Resource Name")
            resSplit = resName.split("/")
            resDict = {}
            for i in range(0, len(resSplit), 2):
                resDict[resSplit[i]] = resSplit[i + 1]
            appCI = resDict.get("applicationci", "N/A")
            subscription = resDict.get("subscriptionid", "")
            rg = resDict.get("resourcegroup", "")
            hosting = row.get("Hosting Type", "")
            if 'database' in alertRule.lower():
                serverDbName = resDict.get("sqlservername", "N/A") + "/" + resDict.get("databasename", "N/A")
                server = f"{serverDbName} (App CI: {appCI})"
            elif 'server' in alertRule.lower():
                serverName = resDict.get("servername", "N/A")
                serviceName = row.get("Service Name", "N/A")
                driverName = row.get("Driver Name", "N/A")
                if serviceName != "N/A":
                    server = f"{serverName} (Service: {serviceName}, App CI: {appCI})"
                elif driverName != "N/A":
                    server = f"{serverName} (Driver: {','.join(driverName)}, App CI: {appCI})"
                else:
                    server = f"{serverName} (App CI: {appCI})"
            elif 'fileshare' in alertRule.lower():
                fileshareName = resDict.get("storagename", "N/A") + "/" + resDict.get("filesharename", "N/A")
                server = f"{fileshareName} (App CI: {appCI})"
            else:
                server = resName
            if hosting.lower() == "onpremise":
                details = f"Hosting: {hosting}"
            else:
                details = f"Subscription: {subscription}, Resource Group: {rg}, Hosting: {hosting}"
            util = ""
            if "Avg Utilization" in row:
                util = f"Avg: {row['Avg Utilization']}%, Max: {row['Max Utilization']}%"
            elif "Status" in row:
                util = f"Status: {row['Status']}"
            html += f"<tr><td>{server}</td><td>{details}</td><td>{util}</td></tr>"
    html += "</table>"
    return html

def build_resource_table_html(data,alertRule):
    section_titles={"memory":"Memory","vm":"Virtual Machines","cpu":"CPU","disk":"Disk","fileshares":"File Shares","services":"Services","dtu":"DTU","storage":"Storage", "database heartbeat" : "Database Heartbeat"}
    # html="""<img src="https://sacrcamonitoring01.blob.core.windows.net/$web/crcaMonitoringServicesImage.jpg" alt="CRCA Monitoring" style="max-width:100%; height:auto; margin-bottom:20px; display:block;">"""
    html="""<table width="100%" style="font-family:'Segoe UI', Arial; font-size:14px; border-collapse:collapse; color:#222;">"""
    html+=("""<tr><th style="padding:12px; background:#0d47a1; color:#fff; border-radius:6px 6px 0 0; text-align:left;">Server / Resource</th>"""
            +"""<th style="padding:12px; background:#0d47a1; color:#fff; text-align:left;">Details</th>"""
            +"""<th style="padding:12px; background:#0d47a1; color:#fff; text-align:left;">Utilization / Status</th></tr>"""
          )
    for section,items in (data or {}).items():
        if section not in section_titles: 
            continue
        html+=f"<tr><td colspan=\"3\" style=\"background:#eaf2ff; padding:10px; font-weight:600; font-size:16px; border-left:4px solid #1565c0;\">{section_titles[section]}</td></tr>"
        alt=False
        for row in items:
            resName = row.get("Resource Name")
            resSplit = resName.split("/")
            resDict = {}
            for i in range(0,len(resSplit),2):
                resDict[resSplit[i]] = resSplit[i+1]
                
            bg="#ffffff" if alt else "#f7f9fc"
            alt=not alt
            
            appCI=resDict.get("applicationci","N/A")
            subscription=resDict.get("subscriptionid","")
            rg=resDict.get("resourcegroup","")
            hosting=row.get("Hosting Type","")
            
            if('database' in alertRule.lower()):
                serverDbName=resDict.get("sqlservername","N/A")+"/"+resDict.get("databasename","N/A")
                server = f"""<div style=\"font-weight:600; font-size:15px;\">{serverDbName}</div>
                    <div style=\"color:#666; font-size:12px;\">Application CI: {appCI}</div>
                    """
            elif('server' in alertRule.lower()):
                serverName=resDict.get("servername","N/A")
                serviceName = row.get("Service Name","N/A")
                driverName = row.get("Driver Name", "N/A")
                if(serviceName!="N/A"):
                    server = f"""<div style=\"font-weight:600; font-size:15px;\">{serverName}</div>
                    <div style=\"color:#666; font-size:12px;\">Service Name: {serviceName}</div>
                    <div style=\"color:#666; font-size:12px;\">Application CI: {appCI}</div>
                    """
                elif(driverName!="N/A"):
                    server = f"""<div style=\"font-weight:600; font-size:15px;\">{serverName}</div>
                    <div style=\"color:#666; font-size:12px;\">Driver Name: {",".join(driverName)}</div>
                    <div style=\"color:#666; font-size:12px;\">Application CI: {appCI}</div>
                    """
                else:
                    server = f"""<div style=\"font-weight:600; font-size:15px;\">{serverName}</div>
                    <div style=\"color:#666; font-size:12px;\">Application CI: {appCI}</div>
                    """
                
            elif('fileshare' in alertRule.lower()):
                fileshareName=resDict.get("storagename","N/A")+"/"+resDict.get("filesharename","N/A")
                server = f"""<div style=\"font-weight:600; font-size:15px;\">{fileshareName}</div>
                    <div style=\"color:#666; font-size:12px;\">Application CI: {appCI}</div>
                    """
                    
            if(hosting.lower()=="onpremise"):
                details=f"<div style=''>Hosting: {hosting}</div>"
            else:
                details=f"<div style='margin-bottom:4px;'>Subscription: <b>{subscription}</b></div><div style='margin-bottom:4px;'>Resource Group: {rg}</div><div style=''>Hosting: {hosting}</div>"
            
            util=""
            if "Avg Utilization" in row:
                util=f"<span style='display:inline-block;background:#e3f2fd;color:#0d47a1;padding:4px 10px;border-radius:12px;font-size:12px;margin-right:6px;'>Avg: {row['Avg Utilization']}%</span><span style='display:inline-block;background:#ffebee;color:#c62828;padding:4px 10px;border-radius:12px;font-size:12px;'>Max: {row['Max Utilization']}%</span>"
            elif "Status" in row:
                status=row["Status"]; color="#2e7d32" if status.lower()=="up" else "#c62828"; bgc="#e8f5e9" if status.lower()=="up" else "#ffebee"
                util=f"<span style='display:inline-block;background:{bgc};color:{color};padding:5px 12px;border-radius:12px;font-size:13px;'>● {status}</span>"
            html+=f"<tr style=\"background:{bg};\"><td style=\"padding:12px; vertical-align:top;\">{server}</td><td style=\"padding:12px; vertical-align:top;\">{details}</td><td style=\"padding:12px; vertical-align:top;\">{util}</td></tr>"
    html+="</table>"
    return html

@alert_rules_bp.route("/constructAlertBody",methods=["POST"])
def createAlert(data={}, communication={}):
    subject = data["Application Family"]+"-"+data["essentials"]["alertRule"]
    if(len(data.keys())==0 and len(communication.keys())==0):
        bodyParams = request.json
        data = bodyParams["data"]
        communication = bodyParams["communication"]
    if(communication["Type"].upper()=="EMAIL"):
        communication["Subject"] = subject
    alertRule = data["essentials"]["alertRule"]
    data=data["data"]
    val = {
        "Alert Type": communication["Type"].upper(),
        "Content Body": "",
        "Communication Details": communication
    }
    try:
        if("TEAMS" in communication["Type"].upper()):
            html_body = build_resource_table_teams_html(data if isinstance(data, dict) else {}, alertRule)
            html_body = f"<h4>{subject}</h4>{html_body}"
        else:
            html_body = build_resource_table_html(data if isinstance(data, dict) else {}, alertRule)
        
        val["Content Body"] = html_body
    except Exception as _ex:
        print("Warning: failed to build HTML body for alert:", _ex)

    # Below calls logic app
    print(val)
    try:
        triggerData = {"Metadata":[val]}
        logicAppTrigger = "https://la-monitoring-workflows.azurewebsites.net:443/api/AlertRuleCommunicationTrigger/triggers/CommunicateTrigger/invoke?api-version=2022-05-01&sp=%2Ftriggers%2FCommunicateTrigger%2Frun&sv=1.0&sig=uRPBLInlpH7Gvq2AXjfHT0d3rtIH-opSeFFeVfHHuXo"
        headers = {
            "content-type":"application/json"
        }
        response = requests.post(logicAppTrigger, json=triggerData, headers=headers)
        print(response)
    except Exception as ex:
        print(ex)

def updateRecord(id):
    sqlQuery = f""" Update [Alert Logs] set Acknowledgement = 'Yes' where [Alert ID] = ?"""
    try:
        updateDw(connectionString_write, sqlQuery, [(id)])
    except Exception as ex:
        raise Exception ("Update to id Failed in DB" + ex)

@alert_rules_bp.route("/updateEventState",methods=["POST"])
def updateEventState(eventId=()):
    if(len(list(eventId))==0):
        bodyParams = request.json
        eventId = bodyParams["eventId"]
    
    placeholders = ','.join(['?' for _ in eventId])
    sqlQuery = f""" Update [Event Logs] set [Event State] = ? where [Event ID] in ({placeholders})"""
    params = ['Resolved',*eventId]
    print(params)
    try:
        res = updateDw(connectionString_write, sqlQuery, params)
        return res
    except Exception as ex:
        raise Exception ("Update to Event State Failed in DB" + ex)