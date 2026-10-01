import sys
from pathlib import Path
import pandas as pd
import numpy as np
import threading
import requests
import uuid
from datetime import datetime, timedelta
import pytz
import json

# Add the parent of 'parent_folder' to sys.path
root = Path(__file__).resolve().parents[1] / "backend"
sys.path.append(str(root))

from domains.metrics.application.applicationTelemetry import servicesData, interfacesLogsData
from domains.metrics.infrastructure.infrastructureTelemetry import serverStatus
from domains.metrics.infrastructure.serverMetricsPerf import getServerPerf
from domains.metrics.infrastructure.databaseMetricsPerf import getDatabasePerf
from domains.metrics.infrastructure.fileStorageMetricsPerf import getFileStoragePerf
from domains.metrics.application.windowsServiceMetrics import getServiceUrlStatus
from shared.dataBase import queryDw, insert_data, exceptioninfo, connectToDw_AADpwd, connectToDw_AADpwd_Write, updateDw, insertDw
import base64

def to_url_safe(original_id):
    return base64.urlsafe_b64encode(original_id.encode()).decode().rstrip("=")

def serverHealthAggregate(connectToCrcaMonitoring, appCI, df_serverList):
    global issueEvents
    try:
        serverHealthDF = serverStatus(connectToCrcaMonitoring, appCI, "", "yes", "", "")
        serverHealthDF["ServerName"] = serverHealthDF["ServerName"].str.strip().str.upper()
        serverHealthDF = serverHealthDF[serverHealthDF["Status"].str.strip().str.lower()=="down"]
        
        # Potential Issue Table data generation
        df_temp = pd.DataFrame()
        df_temp["Resource Name"] = serverHealthDF["ServerName"]
        df_temp["Time Generated"] = serverHealthDF["TimeGenerated"]
        df_temp["Resource Type"] = "VM"
        df_temp["Metrics Impacted"] = "Availability"
        df_temp["Condition"] = df_temp.apply(lambda x: "Status = Down", axis=1)
        df_temp["Application CI"] = serverHealthDF["AppCI"].str.lower()
        df_temp = df_temp.merge(df_serverList[["Application CI", "Application Family"]], how="left", on="Application CI")
        print(len(df_temp))

        issueEvents = pd.concat([issueEvents, df_temp], ignore_index=True)
        try:
            externalApi = "https://dcxportwatcher.providence.org/api/api/DataFetch/Server"
            response = requests.get(externalApi,verify=False)
            response.raise_for_status()
            server_status_list = response.json()
            
            a=[]
            for i in server_status_list:
                a.append((i["server"], "Critical" if i["critical"]>0 else "Not Critical"))
            portDf = pd.DataFrame(np.array(a), columns=["ServerName", "Port Health"])
            portDf = portDf[portDf["Port Health"]=="Critical"]
            
            # Potential Issue Table data generation
            df_temp = pd.DataFrame()
            df_temp["Resource Name"] = portDf["ServerName"]
            df_temp["Time Generated"] = datetime.now(pytz.utc)
            df_temp["Resource Type"] = "VM"
            df_temp["Metrics Impacted"] = "Port Health"
            df_temp["Condition"] = df_temp.apply(lambda x: "Status = Critical", axis=1)
            df_temp["Application CI"] = "DeviceConX-PHS".upper()
            df_temp = df_temp.merge(df_serverList[["Application CI", "Application Family"]], how="left", on="Application CI")
            issueEvents = pd.concat([issueEvents, df_temp], ignore_index=True)
            
        except Exception as ex:
            print(ex)
        
        try:
            sqlQuery = "Select distinct [Support Group] from [Application List] where [Last Updated] = (Select max([Last Updated]) from [Application List])"
            res = queryDw(connectToCrcaMonitoring, sqlQuery) 
            df = pd.DataFrame(np.array(res),columns=["Support Group"])
            supportGroupList = df["Support Group"].to_list()
            
            endTime = datetime.now(pytz.utc)
            startTime = (endTime-timedelta(minutes=10))
            startTime = startTime.replace(
                minute=(startTime.minute // 10) * 10,
                second=0,
                microsecond=0
            )
            tempDict = {
                "Start Time":startTime.strftime("%Y-%m-%d %I:%M:%S %p"),
                "End Time":endTime.strftime("%Y-%m-%d %I:%M:%S %p"),
                "Support Group": supportGroupList,
                "Object Name":["Cpu", "memory", "disk"]
            }
            
            df_perf = pd.read_json(getServerPerf(tempDict)["Data"])
            df_perf["AvgValue"] = df_perf["AvgValue"].astype(int) 
            df_perf["ServerName"] = df_perf["ServerName"].str.lower()
            df_perf = df_perf[(df_perf["ObjectName"].str.lower()=="processor") | (df_perf["ObjectName"].str.lower()=="memory") | ((df_perf["ObjectName"].str.lower()=="logicaldisk") & (df_perf["DriveName"].str.lower()!="y:") & (df_perf["DriveName"].str.lower()!="p:") & (df_perf["DriveName"].str.lower()!="i:"))]
            df_perf = df_perf[df_perf["AvgValue"]>95]
            
            # Potential Issue Table data generation
            if(len(df_perf)):
                df_temp = pd.DataFrame()
                df_temp["Resource Name"] = df_perf["ResourceId"].str.lower()
                df_temp["Time Generated"] = df_perf["TimeGenerated"]
                df_temp["Resource Type"] = "VM"
                df_temp["Metrics Impacted"] = df_perf.apply(lambda x: "CPU" if x["ObjectName"].lower()=="processor" else ("Memory" if x["ObjectName"].lower()=="memory" else f"Disk {x['DriveName']}"), axis=1)
                df_temp["Condition"] = df_perf.apply(lambda x: f"AvgValue > 95% ; {x['AvgValue']}%" if x["ObjectName"].lower() in ("processor", "memory") else (f"AvgValue > 95% ; DriveName:{x['DriveName']} - {x['AvgValue']}%" if x["ObjectName"].lower()=="logicaldisk" else ""), axis=1)
                df_temp["Application CI"] = df_perf["AppCI"].str.upper()
                df_temp = df_temp.merge(df_serverList[["Application CI", "Application Family"]], how="left", on="Application CI")
                issueEvents = pd.concat([issueEvents, df_temp], ignore_index=True)

        except Exception as ex:
            print(ex)
        
    except Exception as ex:
        print(ex)
        print("Server Health Exception")
    
def serviceHealthAggregate(connectToCrcaMonitoring, df_serverList):
    global issueEvents
    try:
        sqlQuery = "Select distinct [Support Group] from [Application List] where [Last Updated] = (Select max([Last Updated]) from [Application List])"
        res = queryDw(connectToCrcaMonitoring, sqlQuery) 
        df = pd.DataFrame(np.array(res),columns=["Support Group"])
        supportGroupList = df["Support Group"].to_list()
        
        endTime = datetime.now(pytz.utc)
        startTime = endTime-timedelta(minutes=10)
        startTime = startTime.replace(
            minute=(startTime.minute // 10) * 10,
            second=0,
            microsecond=0
        )
        tempDict = {
            "Start Time":startTime.strftime("%Y-%m-%d %I:%M:%S %p"),
            "End Time":endTime.strftime("%Y-%m-%d %I:%M:%S %p"),
            "Support Group": supportGroupList,
            "Object Name":["services", "url"],
            "Latest Only":True
        }
        servicesHealthDF = pd.read_json(getServiceUrlStatus(tempDict)["Data"])
        servicesHealthDF = servicesHealthDF[servicesHealthDF["Status"].str.strip().str.lower()!="running"]
        
        if(len(servicesHealthDF)):
            df_temp = pd.DataFrame()
            df_temp["Resource Name"] = servicesHealthDF["ServerServiceMap"].str.lower()
            df_temp["Time Generated"] = servicesHealthDF["TimeGenerated"]
            df_temp["Resource Type"] = servicesHealthDF.apply(lambda x: "Windows Service" if x["MonitorType"].lower()=="os-services" else ("URL" if x["MonitorType"].lower()=="url" else ""), axis=1)
            df_temp["Metrics Impacted"] = servicesHealthDF.apply(lambda x: "Status" if x["MonitorType"].lower()=="os-services" else ("Availability" if x["MonitorType"].lower()=="url" else ""), axis=1)
            df_temp["Condition"] = servicesHealthDF.apply(lambda x: f"Service Status != Running ; Status : {x['Status']}" if x["MonitorType"].lower()=="os-services" else (f"URL Ping State != 200 ; Status : {x['Status']}" if x["MonitorType"].lower()=="url" else ""), axis=1)
            df_temp["Application CI"] = servicesHealthDF["AppCI"].str.upper()
            df_temp = df_temp.merge(df_serverList[["Application CI", "Application Family"]], how="left", on="Application CI")
            issueEvents = pd.concat([issueEvents, df_temp], ignore_index=True)

    except Exception as ex:
        print("Service Health Exception")
        print(ex)

def interfaceHealthAggregate(connectToCrcaMonitoring, appFamily):
    global issueEvents
    startTime=""
    endTime=""
    format_string = "%Y-%m-%d %I:%M:%S %p"
    pst_timezone = pytz.timezone('US/Pacific')

    endTime = datetime.now(pst_timezone)
    startTime = endTime-timedelta(minutes=15)
    startTime = startTime.strftime(format_string)
    endTime = endTime.strftime(format_string)

    try:
        interfacesHealthDF = interfacesLogsData(connectToCrcaMonitoring,"",startTime,endTime,"no",appFamily)
        aggregate = interfacesHealthDF["Interfaces"].copy()
        aggregate["Stopped"] = aggregate.apply(
            lambda x: 0 if ((x["ConnectionStatus"].lower() in ('connected', 'simulated') and x["QueueDepth"]<300) or (x["QueueDepth"]<1000)) else 1,
            axis=1
        )
        # aggregate.to_csv("interfaceHealth.csv", index=False)
        aggregate = aggregate.groupby(['InterfaceName', "CorepointMonitor", "PeerIp", "ApplicationFamily"]).apply(
            lambda g: pd.Series({
                 'TimeGenerated': g['TimeGenerated'].max(),
                 'ConnectionStatus': g.loc[g['TimeGenerated'].idxmax(), 'ConnectionStatus'],
                 'QueueDepth': g.loc[g['TimeGenerated'].idxmax(), 'QueueDepth'],
                 'Stopped' : 1 if g["Stopped"].mean()==1 else 0
            })).reset_index()
        aggregate = aggregate[aggregate["Stopped"]==1]
        
        # Potential Issue Table data generation
        if(len(aggregate)):
            df_temp = pd.DataFrame()
            df_temp["Resource Name"] = aggregate["InterfaceName"].str.lower()
            df_temp["Time Generated"] = aggregate["TimeGenerated"]
            df_temp["Resource Type"] = "Corepoint Interfaces"
            df_temp["Metrics Impacted"] = "Interface Connectivity"
            df_temp["Condition"] = aggregate.apply(lambda x: f"Connection status is not Connected/Simulated and Queue depth > 0 ; ConnectionStatus: {x['ConnectionStatus']}, QueueDepth: {x['QueueDepth']}", axis=1)
            df_temp["Application Family"] = aggregate["ApplicationFamily"].str.upper()
            issueEvents = pd.concat([issueEvents, df_temp], ignore_index=True)
        
    except Exception as ex:
        print("Interface Health Exception")
        print(ex)
    
def fileStorageHealthAggregate(connectToCrcaMonitoring, df_serverList):
    global issueEvents
    try:
        sqlQuery = "Select distinct [Support Group] from [Application List] where [Last Updated] = (Select max([Last Updated]) from [Application List])"
        res = queryDw(connectToCrcaMonitoring, sqlQuery) 
        df = pd.DataFrame(np.array(res),columns=["Support Group"])
        supportGroupList = df["Support Group"].to_list()
        
        endTime = datetime.now(pytz.utc)
        startTime = endTime-timedelta(minutes=10)
        startTime = startTime.replace(
            minute=(startTime.minute // 10) * 10,
            second=0,
            microsecond=0
        )
        tempDict = {
            "Start Time":startTime.strftime("%Y-%m-%d %I:%M:%S %p"),
            "End Time":endTime.strftime("%Y-%m-%d %I:%M:%S %p"),
            "Support Group": supportGroupList,
            "Object Name":["storage"],
            "Latest Only":True
        }
        fileStorageHealthDF = pd.read_json(getFileStoragePerf(tempDict)["Data"])
        fileStorageHealthDF["AvgValue"] = ((fileStorageHealthDF["Used Capacity (GiB)"]//fileStorageHealthDF["Provisioned Capacity (GiB)"])*100).astype(int) 
        fileStorageHealthDF = fileStorageHealthDF[fileStorageHealthDF["AvgValue"]>95]
        # fileStorageHealthDF.to_csv("Sample1.csv")
        # Potential Issue Table data generation
        if(len(fileStorageHealthDF)):
            df_temp = pd.DataFrame()
            df_temp["Resource Name"] = fileStorageHealthDF["ResourceId"].str.lower()
            # df_temp["Time Generated"] = fileStorageHealthDF["TimeGenerated"]
            df_temp["Resource Type"] = "File Storage"
            df_temp["Metrics Impacted"] = "Storage Capacity"
            df_temp["Condition"] = fileStorageHealthDF.apply(lambda x: f"AvgValue > 95% ; {x['AvgValue']}%" if x["ObjectName"].lower() in ("storage") else "", axis=1)
            df_temp["Application CI"] = fileStorageHealthDF["AppCI"].str.upper()
            df_temp = df_temp.merge(df_serverList[["Application CI", "Application Family"]], how="left", on="Application CI")
            issueEvents = pd.concat([issueEvents, df_temp], ignore_index=True)
        
    except Exception as ex:
        print(ex)
        print("File Storage Health Exception")
        
        

def databaseHealthAggregate(connectToCrcaMonitoring, df_serverList):
    global issueEvents
    try:
        sqlQuery = "Select distinct [Support Group] from [Application List] where [Last Updated] = (Select max([Last Updated]) from [Application List])"
        res = queryDw(connectToCrcaMonitoring, sqlQuery) 
        df = pd.DataFrame(np.array(res),columns=["Support Group"])
        supportGroupList = df["Support Group"].to_list()
        
        endTime = datetime.now(pytz.utc)
        startTime = endTime-timedelta(minutes=10)
        startTime = startTime.replace(
            minute=(startTime.minute // 10) * 10,
            second=0,
            microsecond=0
        )
        tempDict = {
            "Start Time":startTime.strftime("%Y-%m-%d %I:%M:%S %p"),
            "End Time":endTime.strftime("%Y-%m-%d %I:%M:%S %p"),
            "Support Group": supportGroupList,
            "Object Name":["cpu", "storage", "dtu"],
            "Latest Only":True
        }
        databaseMetricsDF = pd.read_json(getDatabasePerf(tempDict)["Data"])
        databaseMetricsDF["AvgValue"] = databaseMetricsDF["AvgValue"].astype(int) 
        databaseMetricsDF = databaseMetricsDF[databaseMetricsDF["AvgValue"]>95]
        
        # Potential Issue Table data generation
        if(len(databaseMetricsDF)):
            df_temp = pd.DataFrame()
            df_temp["Resource Name"] = databaseMetricsDF["ResourceId"].str.lower()
            df_temp["Time Generated"] = databaseMetricsDF["TimeGenerated"]
            df_temp["Resource Type"] = "Database"
            df_temp["Metrics Impacted"] = databaseMetricsDF.apply(lambda x: "CPU" if x["ObjectName"].lower()=="cpu_percent" else ("Storage" if x["ObjectName"].lower()=="storage_percent" else "DTU"), axis=1)
            df_temp["Condition"] = databaseMetricsDF.apply(lambda x: f"AvgValue >= 95% ; {x['AvgValue']}%" if x["ObjectName"].lower() in ("cpu_percent", "storage_percent", "dtu_consumption_percent") else "", axis=1)
            df_temp["Application CI"] = databaseMetricsDF["AppCI"].str.upper()
            df_temp = df_temp.merge(df_serverList[["Application CI", "Application Family"]], how="left", on="Application CI")
            issueEvents = pd.concat([issueEvents, df_temp], ignore_index=True)
        
    except Exception as ex:
        print(ex)
        print("Database Health Exception")

def fetchActivePotentialIssues():
    connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    sqlQuery = f""" Select [Issue ID],[Resource Name],[Metrics Impacted], [Condition], [Resource Type] from [Potential Issues] where lower([State]) not in ('resolved', 'true positive','false positive')"""
    df = pd.DataFrame(columns=["Issue ID","Resource Name","Metrics Impacted", "Condition", "Resource Type"])
    try:
        res = queryDw(connectionString, sqlQuery)
        if(len(res)>0):
            df = pd.DataFrame(np.array(res), columns=["Issue ID","Resource Name","Metrics Impacted", "Condition", "Resource Type"])
    except Exception as ex:
        print("Error Fetching Active Potential Issues")
        print(ex)
        raise Exception("Error Fetching Active Potential Issues"+str(ex))
    return df

def createNewEarlyWarnings(df_newPotentialIssues):
    print()
    tempDict = {}
    try:
        df_temp = df_newPotentialIssues.copy()
        tempTime = datetime.now(pytz.utc)
        for index, row in df_newPotentialIssues.iterrows():
            appFamily = row["Application Family"]
            resourceName = row["Resource Name"]
            resourceType = row["Resource Type"]
            metricsImpacted = resourceType+ " / " +row["Metrics Impacted"]
            condition = row["Condition"]
            val = str(uuid.uuid4())
            
            if("Application CI" in row and pd.notna(row["Application CI"])):
                issueId = f"ApplicationCI/{row["Application CI"]}/provider/iTelemetry.WarningEventDetection/{metricsImpacted}/{val}"
            else:
                issueId = f"Interface/{resourceName}/provider/iTelemetry.WarningEventDetection/{metricsImpacted}/{val}"
            
            df_temp.loc[index,"Issue ID"] = issueId
            df_temp.loc[index,"Counter"] = 1
            df_temp.loc[index,"State"] = "New"
            df_temp.loc[index,"Time Generated"] = tempTime
            df_temp.loc[index,"Last Updated"] = tempTime
            df_temp.loc[index, "Early Warning ID"] = ""
            
            # print(df_temp.columns)
            if(appFamily not in tempDict):
                tempDict[appFamily] = {}
            
            if(metricsImpacted not in tempDict[appFamily]):
                tempDict[appFamily][metricsImpacted] = []
                
            tempDict[appFamily][metricsImpacted].append({
                "Resource Name": resourceName,
                "Condition": condition,
                "Resource Type": resourceType,
                "Metrics Impacted": row["Metrics Impacted"]
            })
        
        # Create a Summary for each Application Family and Metrics Impacted combination and insert into Early Warnings table
        tempEwDict = []
        for appFamily in tempDict:
            counter = 0
            summaryDict = {}
            details = {}
            for metricsImpacted in tempDict[appFamily]:
                details[metricsImpacted] = []
                counter+=len(tempDict[appFamily][metricsImpacted])
                details[metricsImpacted] = [{"Resource Name" : x["Resource Name"], "Condition":x['Condition'].split(';')[0], "Utilization (or) Status" : x['Condition'].split(';')[1] if len(x['Condition'].split(";")) > 1 else ""} for x in tempDict[appFamily][metricsImpacted]]
                
            summaryDict["Summary"] = f"{counter} new warning events detected for {appFamily} application family."
            summaryDict["Details"] = details
            
            val = str(uuid.uuid4())
            eventId = f"ApplicationFamily/{appFamily}/provider/iTelemetry.EarlyWarningDetection/{val}"
            masked_eventId = to_url_safe(eventId)
            
            tempEwDict.append({
                "Early Warning ID": eventId,
                "Masked Early Warning ID" : masked_eventId,
                "Summary": json.dumps(summaryDict),
                "State": "New",
                "Application Family": appFamily,
                "Time Generated": tempTime,
                "Last Updated" : tempTime,
                "User Tagged": "Kalisapudi.Sudeepthi@providence.org"
            })
            
            df_temp["Early Warning ID"] = df_temp.apply(lambda x: eventId if x["Application Family"].upper()==appFamily.upper() else x["Early Warning ID"], axis=1)
            
        return tempEwDict, df_temp
    except Exception as ex:
        print("Error Creating Early Warning Summary")
        print(ex)
        raise Exception("Error Creating Early Warning Summary"+str(ex))

def updatePotentialIssuesTable(df_existingPotentialIssues):
    connectionString = connectToDw_AADpwd_Write("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    
    # Update Counter and Last Updated for existing Potential Issues
    arr = []
    for index, row in df_existingPotentialIssues.iterrows():
        arr.append((row["Issue ID"],))
    
    sqlQueryUpdate = f"""Update [Potential Issues] set [Counter] = [Counter]+1, [Last Updated] = GETUTCDATE() where [Issue ID] like ?"""
    try:
        res = insertDw(connectionString, sqlQueryUpdate, arr)
    except Exception as ex:
        print("Error Updating Potential Issues Table")
        print(ex)
        raise Exception("Error Updating Potential Issues Table"+str(ex))

def insertNewPotentialIssues(df_newPotentialIssues):
    connectionString = connectToDw_AADpwd_Write("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    arr = []
    for index, row in df_newPotentialIssues.iterrows():
        arr.append(
            (row["Time Generated"], row["Issue ID"], row["Resource Name"], row["Metrics Impacted"], row["Condition"], row["Resource Type"], row["State"], row["Counter"], row["Last Updated"], row["Application CI"] if "Application CI" in row and pd.notna(row["Application CI"]) else None, row["Early Warning ID"])
        )
    sqlQueryInsert = f"""Insert into [Potential Issues] ([Time Generated], [Issue ID], [Resource Name], [Metrics Impacted], [Condition], [Resource Type], [State], [Counter], [Last Updated], [Application CI], [Early Warning ID]) 
                        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"""
    try:
        res = insertDw(connectionString, sqlQueryInsert, arr)
    except Exception as ex:
        print("Error Inserting into Potential Issues Table")
        print(ex)
        raise Exception("Error Inserting into Potential Issues Table"+str(ex))

def insertNewEarlyWarnings(df_newEarlyWarnings):
    connectionString = connectToDw_AADpwd_Write("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    arr = []
    for index, row in df_newEarlyWarnings.iterrows():
        arr.append(
            (row["Time Generated"], row["Early Warning ID"], row["Summary"], row["State"], row["Application Family"], row["Last Updated"])
        )
    sqlQueryInsert = f"""Insert into [Early Warnings] ([Time Generated], [Early Warning ID], [Summary], [State], [Application Family], [Last Updated]) 
                        values (?, ?, ?, ?, ?, ?)"""
    try:
        res = insertDw(connectionString, sqlQueryInsert, arr)
    except Exception as ex:
        print("Error Inserting into Early Warnings Table")
        print(ex)
        raise Exception("Error Inserting into Early Warnings Table"+str(ex))

def getSequentialID(earlyWarningDict):
    arr = []
    for i in earlyWarningDict:
        arr.append(i["Early Warning ID"])
        
    sqlQueryGetID = f""" Select [Sequential ID], [Early Warning ID] from [Early Warnings] where lower([Early Warning ID]) in ({','.join(["'" + id.lower() + "'" for id in arr])})"""
    # with open("data.txt", "w") as f:
    #     f.write(str(sqlQueryGetID))
    try:
        connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
        res = queryDw(connectionString, sqlQueryGetID)
        idMapping = {id.lower(): seqId for seqId, id in res}
        for ew in earlyWarningDict:
            ew["Sequential ID"] = idMapping.get(ew["Early Warning ID"].lower(), None)
        
        # with open("Sampledata.json", "w") as f:
        #     # json.dump(earlyWarningDict, f)
        
        # with open("data.txt", "w") as f:
        #     f.write(str(earlyWarningDict))

        return earlyWarningDict
    except Exception as ex:
        print("Error Fetching Sequential ID for Early Warning")
        print(ex)
        raise Exception("Error Fetching Sequential ID for Early Warning"+str(ex))

def generate_early_warning_html(tempEwDict):
    """
    Generates HTML summary for each Application Family in tempEwDict.
        - appFamily as <h2>
        - Summary as <p>
        - Metrics Impacted as <h3>
        - Details as <ul>
    """
    
    for ew in tempEwDict:
        html = ""
        app_family = ew.get("Application Family")
        summary_json = ew.get("Summary")
        
        summary_obj = json.loads(summary_json)
        userTagged = ew.get("User Tagged")
        maskedId = ew.get("Masked Early Warning ID")
        summary_text = summary_obj.get("Summary", "")
        details = summary_obj.get("Details", {})
        sequential_id = ew.get("Sequential ID", None)

        html += f"<h2>{app_family}</h2>\n"
        html += f"<p>{summary_text}</p>\n"
        for metrics_impacted, items in details.items():
            html += f"<h3>{metrics_impacted}</h3>\n"
            html += "<table border='1' style='border-collapse:collapse;'>\n"
            html += (
                "<tr>"
                "<th>Resource Name</th>"
                "<th>Trigger Condition</th>"
                "<th>Utilization or Status</th>"
                "</tr>\n"
            )
            for item in items:
                resName = item.get("Resource Name", "").split("/")
                resNameHtml = ""
                if("vm" in metrics_impacted.lower()):
                    if(len(resName)==4):
                        resNameHtml += "<ul>"
                        resNameHtml += f"<li>Server Name:{resName[1]}</li>"
                        resNameHtml += f"<li>Application CI:{resName[3]}</li>"
                        resNameHtml += "</ul>"
                    elif(len(resName)>4):
                        resNameHtml += "<ul>"
                        resNameHtml += f"<li>Subscription ID:{resName[1]}</li>"
                        resNameHtml += f"<li>Resource Group:{resName[3]}</li>"
                        resNameHtml += f"<li>Server Name:{resName[5]}</li>"
                        resNameHtml += f"<li>Application CI:{resName[7]}</li>"
                        resNameHtml += "</ul>"
                elif("database" in metrics_impacted.lower()):
                    if(len(resName)==6):
                        resNameHtml += "<ul>"
                        resNameHtml += f"<li>Server Name:{resName[1]}</li>"
                        resNameHtml += f"<li>Database Name:{resName[3]}</li>"
                        resNameHtml += f"<li>Application CI:{resName[5]}</li>"
                        resNameHtml += "</ul>"
                    elif(len(resName)>6):
                        resNameHtml += "<ul>"
                        resNameHtml += f"<li>Subscription ID:{resName[1]}</li>"
                        resNameHtml += f"<li>Resource Group:{resName[3]}</li>"
                        resNameHtml += f"<li>Server Name:{resName[5]}</li>"
                        resNameHtml += f"<li>Database Name:{resName[7]}</li>"
                        resNameHtml += f"<li>Application CI:{resName[9]}</li>"
                        resNameHtml += "</ul>"
                elif("storage" in metrics_impacted.lower()):
                    if(len(resName)>6):
                        resNameHtml += "<ul>"
                        resNameHtml += f"<li>Subscription ID:{resName[1]}</li>"
                        resNameHtml += f"<li>Resource Group:{resName[3]}</li>"
                        resNameHtml += f"<li>Storage Name:{resName[5]}</li>"
                        resNameHtml += f"<li>Fileshare Name:{resName[7]}</li>"
                        resNameHtml += f"<li>Application CI:{resName[9]}</li>"
                        resNameHtml += "</ul>"
                elif("service" in metrics_impacted.lower()):
                    resName = item.get("Resource Name", "").split("-")
                    resNameHtml += f"<li>Server Name:{"-".join(resName[0:-1])}</li>"
                    resNameHtml += f"<li>Service Name:{resName[-1]}</li>"
                else:
                    resNameHtml = item.get("Resource Name", "")
                    
                html += "<tr>"
                # item is expected to be a dict with keys: Resource Name, Condition, Utilization (or) Status
                html += f"<td>{resNameHtml}</td>"
                html += f"<td>{item.get('Condition', '')}</td>"
                html += f"<td>{item.get('Utilization (or) Status', '')}</td>"
                html += "</tr>\n"
            html += "</table>\n"
            
        try:
            triggerData = {"Summary": html, "Acknowledge Issue URL" : f"itelemetrystag.providence.org/applicationHealth?Name={app_family}&Type=Application%20Family&EarlyWarningId={maskedId}&EarlyWarningUpdate=Acknowledge", "Resolve Issue URL" : f"itelemetrystag.providence.org/applicationHealth?Name={app_family}&Type=Application%20Family&EarlyWarningId={maskedId}&EarlyWarningUpdate=Resolve", "User Tagged": userTagged, "Masked Event ID": maskedId, "Sequential ID": sequential_id}
            logicAppTrigger = "https://la-monitoring-workflows.azurewebsites.net:443/api/Chat_Initiator_Ops/triggers/Called_by_the_Detection_Algorithm/invoke?api-version=2022-05-01&sp=%2Ftriggers%2FCalled_by_the_Detection_Algorithm%2Frun&sv=1.0&sig=B_P61VdwzZZVGM5I0NVmRihaP_Rfhyzmg976InGZ3Ak"
            headers = {
                "content-type":"application/json"
            }
            response = requests.post(logicAppTrigger, json=triggerData, headers=headers)
            print(response)
        except Exception as ex:
            print(ex)
    return html

def caching_ApplicationHealth_Aggregate():
    
    datetime_format = "%Y-%m-%d %I:%M:%S %p"
    time = datetime.now()
    pst = pytz.timezone('America/Los_Angeles')
    time = time.astimezone(pst)
    
    # connectionString to crcamonitoring
    connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")

    serverListQuery = """Select [Application Family]
        ,[Application CI]
        ,[Support Group], [APM Number]
    from [Application List] where [Last Updated] = (Select MAX([Last Updated]) from [Application List])"""
    
    try:
        data = queryDw(connectToCrcaMonitoring, serverListQuery)
    except Exception as ex:
        print("Error Fetching Server List Data")
        print(ex)
        raise Exception("Error Fetching Server List Data"+str(ex))
        
    if(len(data)>0):
        df_ServerList = pd.DataFrame(np.array(data),
                            columns=[
                                "AppFamily","AppCI", "SupportGroup", "APMNumber"
                            ]
                        )
        df_ServerList.drop_duplicates(subset=['AppCI'], inplace=True)
        df_ServerList["Application CI"] = df_ServerList["AppCI"].str.upper()
        df_ServerList["Application Family"] = df_ServerList["AppFamily"].str.upper()
        df_ServerList["Support Group"] = df_ServerList["SupportGroup"]
        df_ServerList["APM Number"] = df_ServerList["APMNumber"]
        df_ServerList.drop(columns=["AppCI", "AppFamily", "SupportGroup", "APMNumber"], inplace=True)
        
        appCI = ",".join(["'"+str(x)+"'" for x in df_ServerList["Application CI"].str.lower().unique().tolist()])
        appFamily = ",".join(["'"+str(x)+"'" for x in df_ServerList["Application Family"].str.lower().unique().tolist()])
        apmNumbers = ",".join(["'"+str(x)+"'" for x in df_ServerList["APM Number"].str.lower().unique().tolist()])
        
    else:
        print("Exception occured in Server List Fetch")
        return
    
    threads = [
                threading.Thread(target=serverHealthAggregate, args=(connectToCrcaMonitoring, appCI, df_ServerList)),
                threading.Thread(target=serviceHealthAggregate, args=(connectToCrcaMonitoring, df_ServerList)),
                threading.Thread(target=interfaceHealthAggregate, args=(connectToCrcaMonitoring, appFamily)),
                threading.Thread(target=fileStorageHealthAggregate, args=(connectToCrcaMonitoring, df_ServerList)),
                threading.Thread(target=databaseHealthAggregate, args=(connectToCrcaMonitoring, df_ServerList))
            ]
    
    for i in threads:
        i.start()
    for i in threads:
        i.join()
    
    print("All Threads Executed")

# Main function
# sampleVar = [{
#     "Early Warning ID": "ApplicationFamily/3M 360 ENCOMPASS/provider/iTelemetry.EarlyWarningDetection/35272b84-711d-488f-b01b-c1c4d97be4cc"
# }]
# earlyWarning = getSequentialID(sampleVar)
# print(earlyWarning)
issueEvents = pd.DataFrame()
try: 
    activePotentialIssues = fetchActivePotentialIssues()
    caching_ApplicationHealth_Aggregate()

    df_existingPotentialIssues = pd.merge(issueEvents, activePotentialIssues.drop(columns=["Condition"]), on=["Resource Name","Metrics Impacted", "Resource Type"], how="inner").reset_index()
    df_newPotentialIssues = pd.merge(issueEvents, activePotentialIssues.drop(columns=["Condition"]), on=["Resource Name","Metrics Impacted",  "Resource Type"], how="left", indicator=True).query('_merge == "left_only"').drop(columns=["_merge"]).reset_index()
    df_resolvedPotentialIssues = pd.merge(issueEvents, activePotentialIssues, on=["Resource Name","Metrics Impacted", "Resource Type", "Condition"], how="right", indicator=True).query('_merge == "right_only"').drop(columns=["_merge"]).reset_index()

    earlyWarning, eventDf = createNewEarlyWarnings(df_newPotentialIssues)
    
    if(len(earlyWarning)):
        earlyWarningDF = pd.DataFrame(earlyWarning)
        earlyWarning = getSequentialID(earlyWarning)
        print(earlyWarning)
        insertNewEarlyWarnings(earlyWarningDF)
        generate_early_warning_html(earlyWarning)
    
    if(len(df_existingPotentialIssues)):
        updatePotentialIssuesTable(df_existingPotentialIssues)
    
    if(len(eventDf)):
        insertNewPotentialIssues(eventDf)
        
except Exception as ex:
    print("Error in Main Function")
    print(ex)
    
    if ex.args and len(ex.args) > 0 and isinstance(ex.args[0], dict):
        insert_data(ex.args[0])
    else:
        info = exceptioninfo(ex)
        insert_data(info)