import sys
from pathlib import Path

# Add the parent of 'parent_folder' to sys.path
root = Path(__file__).resolve().parents[2]
sys.path.append(str(root))


from shared.logAnalytics import queryInLogAnalytics
from shared.dataBase import queryDw, exceptioninfo, insert_data, connectToDw_AADpwd
import json
import pandas as pd
import numpy as np
import uuid
from datetime import datetime
from domains.alerts.alertRulesSupport import insertEventLogs, insertAlertLogs, updateEventState, createAlert



class AlertSchema:
    def __init__(self, appFamily, communication, data, resourceName, signalType):
        self.alertRule = f"{metricType}-AlertFrequency-{alertFrequency}-DataAggregation-{dataAggregation}"
        self.communication = communication
        self.alertId = f"Application Family/{appFamily}/provider/iTelemetry.AlertManagement/event/{metricType}"
        self.data = data
        self.triggerTime = datetime.now()
        self.appFamily = appFamily
        self.resName = resourceName
        self.signalType = signalType
        
    @property
    def schema(self):
        id = self.getAlertId()
        return {
            "essentials":{
                "alertId" : id,
                "alertRule" : self.alertRule,
                "severity" : "",
                "signalType" : self.signalType,
                "monitorCondition" : "New",
                "firedDateTime" : "",
                "resolvedDateTime" : "",
                "eventTriggerDateTime" : self.triggerTime,
                "originalAlertId" : id
            },
            "data": self.data,
            "communication": json.loads(self.communication),
            "Application Family" : self.appFamily,
            "Resource Name" : self.resName
        }
        
    def getAlertId(self):
        val = str(uuid.uuid4())
        return self.alertId+"/"+val
    
class Query:
    def __init__(self):
        self.condition = {
            "CPU":"",
            "STORAGE":"",
            "DTU":"",
            "DBHEARTBEAT":""
        }
        
    @property
    def queries(self):
        return {
            "CPU" : f""" let cpuQuery = (AzureMetrics
                    | where ResourceProvider == "MICROSOFT.SQL"
                    | where TimeGenerated > ago({str(dataAggregation)}min) and SubscriptionId in (
                        "ab16a144-47d7-45c5-bcb7-8affc988f8e0", "9592c342-d1fb-477e-8e91-ad39bf00933b",
                        "5467bf57-48b4-4930-b3cb-bf039b259d04", "343a7ee0-5081-4024-82fc-498ee61867a9",
                        "6d590d81-bab9-4b9a-b011-090467b5a9a4", "accde124-a45f-47be-aefa-b09362b2c5fc", "a82a7c51-82fd-4bbc-a376-3cd8752a1675"
                        )
                    | extend
                        SubscriptionId=tostring(SubscriptionId),
                        ResourceGroup=tostring(ResourceGroup), 
                        DatabaseName=tolower(tostring(Resource)),
                        ServerName=tolower(split(ResourceId, '/')[8]),
                        ObjectName = 'CPU'
                    | where MetricName in ('cpu_percent')
                    | extend HostingType = iff(tolower(ResourceGroup) contains "rg-azarc-compute-eng-westus2", "OnPremise", "Cloud")
                    | summarize TimeGenerated=max(TimeGenerated), AvgValue=avg(Average), MaxValue=max(Maximum), MinValue=min(Minimum) by SubscriptionId, ResourceGroup, ServerName, DatabaseName, ObjectName, HostingType
                    | where {self.condition["CPU"]}
                    | project TimeGenerated, SubscriptionId, ResourceGroup, ServerName, DatabaseName, HostingType, ObjectName, AvgValue, MaxValue, MinValue);
                """,
            "STORAGE" : f""" let storageQuery = (AzureMetrics
                    | where ResourceProvider == "MICROSOFT.SQL"
                    | where TimeGenerated > ago({str(dataAggregation)}min) and SubscriptionId in (
                        "ab16a144-47d7-45c5-bcb7-8affc988f8e0", "9592c342-d1fb-477e-8e91-ad39bf00933b",
                        "5467bf57-48b4-4930-b3cb-bf039b259d04", "343a7ee0-5081-4024-82fc-498ee61867a9",
                        "6d590d81-bab9-4b9a-b011-090467b5a9a4", "accde124-a45f-47be-aefa-b09362b2c5fc", "a82a7c51-82fd-4bbc-a376-3cd8752a1675"
                        )
                    | extend
                        SubscriptionId=tostring(SubscriptionId),
                        ResourceGroup=tostring(ResourceGroup), 
                        DatabaseName=tolower(tostring(Resource)),
                        ServerName=tolower(split(ResourceId, '/')[8]),
                        ObjectName = 'Storage'
                    | where MetricName in ('storage_percent')
                    | extend HostingType = iff(tolower(ResourceGroup) contains "rg-azarc-compute-eng-westus2", "OnPremise", "Cloud")
                    | summarize TimeGenerated=max(TimeGenerated), AvgValue=avg(Average), MaxValue=max(Maximum), MinValue=min(Minimum) by SubscriptionId, ResourceGroup, ServerName, DatabaseName, ObjectName, HostingType
                    | where {self.condition["STORAGE"]}
                    | project TimeGenerated, SubscriptionId, ResourceGroup, ServerName, DatabaseName, HostingType, ObjectName, AvgValue, MaxValue, MinValue);
                """,
            "DTU" : f""" let dtuQuery = (AzureMetrics
                    | where ResourceProvider == "MICROSOFT.SQL"
                    | where TimeGenerated > ago({str(dataAggregation)}min) and SubscriptionId in (
                        "ab16a144-47d7-45c5-bcb7-8affc988f8e0", "9592c342-d1fb-477e-8e91-ad39bf00933b",
                        "5467bf57-48b4-4930-b3cb-bf039b259d04", "343a7ee0-5081-4024-82fc-498ee61867a9",
                        "6d590d81-bab9-4b9a-b011-090467b5a9a4", "accde124-a45f-47be-aefa-b09362b2c5fc", "a82a7c51-82fd-4bbc-a376-3cd8752a1675"
                        )
                    | extend
                        SubscriptionId=tostring(SubscriptionId),
                        ResourceGroup=tostring(ResourceGroup), 
                        DatabaseName=tolower(tostring(Resource)),
                        ServerName=tolower(split(ResourceId, '/')[8]),
                        ObjectName = 'DTU'
                    | where MetricName in ('dtu_percent')
                    | extend HostingType = iff(tolower(ResourceGroup) contains "rg-azarc-compute-eng-westus2", "OnPremise", "Cloud")
                    | summarize TimeGenerated=max(TimeGenerated), AvgValue=avg(Average), MaxValue=max(Maximum), MinValue=min(Minimum) by SubscriptionId, ResourceGroup, ServerName, DatabaseName, ObjectName, HostingType
                    | where {self.condition["DTU"]}
                    | project TimeGenerated, SubscriptionId, ResourceGroup, ServerName, DatabaseName, HostingType, ObjectName, AvgValue, MaxValue, MinValue);
                """,
            "DBHEARTBEAT" : f""" let dbheartbeatQuery = (AzureMetrics
                    | where ResourceProvider == "MICROSOFT.SQL"
                    | where TimeGenerated > ago(60min) and SubscriptionId in (
                        "ab16a144-47d7-45c5-bcb7-8affc988f8e0", "9592c342-d1fb-477e-8e91-ad39bf00933b",
                        "5467bf57-48b4-4930-b3cb-bf039b259d04", "343a7ee0-5081-4024-82fc-498ee61867a9",
                        "6d590d81-bab9-4b9a-b011-090467b5a9a4", "accde124-a45f-47be-aefa-b09362b2c5fc", "a82a7c51-82fd-4bbc-a376-3cd8752a1675"
                        )
                    | extend
                        SubscriptionId=tostring(SubscriptionId),
                        ResourceGroup=tostring(ResourceGroup), 
                        DatabaseName=tolower(tostring(Resource)),
                        ServerName=tolower(split(ResourceId, '/')[8]),
                        ObjectName = 'Database Heartbeat'
                    | where MetricName in ('availability')
                    | extend HostingType = iff(tolower(ResourceGroup) contains "rg-azarc-compute-eng-westus2", "OnPremise", "Cloud")
                    | summarize TimeGenerated=max(TimeGenerated),AvgValue=avg(Average), MaxValue=max(Maximum), MinValue=min(Minimum) by SubscriptionId, ResourceGroup, ServerName, DatabaseName, ObjectName, HostingType
                    | where {self.condition["DBHEARTBEAT"]}
                    | project TimeGenerated, SubscriptionId, ResourceGroup, ServerName, DatabaseName, HostingType, ObjectName, Status=iff(AvgValue==0,'Down','Up'));
                """
        }
    
    def changeCondition(self, keyData, value):
        self.condition[keyData] = value
    
def getalertconfigs():
    try:
        df_database = pd.DataFrame()
        
        connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
        sqlQuery_server = f"""Select lower(al.[Application CI]) as [Application CI], dla.[Custom Threshold], dla.[Communication], trim(dla.[Alert Type]), al.[Application Family], dl.[Subscription ID], dl.[Resource Group], dl.[Sql Server Name], dl.[Database Name], trim(dl.[Hosting Type])
                from [Database Alert Configuration] as dla
                inner join [Database List] as dl on dl.[Resource Name] like dla.[Resource Name]
                inner join [Application List] as al on al.[Application CI] like dl.[Application CI]
                where dla.[Alert Frequency] = {alertFrequency} and dla.[Data Aggregation] = {dataAggregation} and dla.[Alert Enabled] = 1
            """
        
        res_server = queryDw(connectionString,sqlQuery_server)
        if(len(res_server)>0):
            df_database = pd.DataFrame(np.array(res_server), columns = ["Application CI", "Custom Threshold", "Communication", "Alert Type", "Application Family", "Subscription ID", "Resource Group", "Server Name", "Database Name", "Hosting Type"])
            print(df_database.columns)
            
        return df_database
    except Exception as ex:
        info = exceptioninfo(ex)
        raise Exception(info)

def logAnalyticsQueryCondition(df):
    
    eventMetric = {}
    try:
        for ind, row in df.iterrows():
            alertType = row["Alert Type"]
            customThreshold = row["Custom Threshold"]
            subscriptionID = row["Subscription ID"]
            resourceGroup = row["Resource Group"]
            serverName = row["Server Name"]
            databaseName = row["Database Name"]
            hostingType = row["Hosting Type"].lower()
            resourceName = (subscriptionID+"/"+resourceGroup+"/"+serverName+"/"+databaseName).lower()
            print(alertType, hostingType)
            if(alertType.lower() in ["cpu", "storage", "dtu"]):
                if(alertType not in eventMetric):
                    eventMetric[alertType] = []
                
                if(hostingType=="cloud"):
                    cond = f"(strcat(tolower(SubscriptionId),'/',tolower(ResourceGroup),'/',tolower(ServerName),'/',tolower(DatabaseName)) == '{resourceName}' and AvgValue>={customThreshold})"
                else:
                    cond = f"(strcat(tolower(ServerName),'/',tolower(DatabaseName)) == '{resourceName}' and tolower(HostingType) == '{hostingType}' and AvgValue>={customThreshold})"
                
                eventMetric[alertType].append(cond)
                
            elif(alertType.lower() == "database heartbeat"):
                if("dbheartbeat" not in eventMetric):
                    eventMetric["dbheartbeat"] = []
                
                if(hostingType=="cloud"):
                    cond = f"(strcat(tolower(SubscriptionId),'/',tolower(ResourceGroup),'/',tolower(ServerName),'/',tolower(DatabaseName)) == '{resourceName}')"
                else:
                    cond = f"(strcat(tolower(ServerName),'/',tolower(DatabaseName)) == '{resourceName}' and tolower(HostingType) == '{hostingType}')"
                
                eventMetric["dbheartbeat"].append(cond)
    except Exception as ex:
        info = exceptioninfo(ex)
        raise Exception(info)
        
    return eventMetric

def callLogAnalytics(eventMetric, df_appFamily):
    lawQuery = ""
    end = []
    obj = Query()
    df_final = pd.DataFrame()
    try:
        for i in eventMetric:
            print(i)
            val = "("+" or ".join(eventMetric[i])+")"
            obj.changeCondition(i.upper(), val)
            query = obj.queries[i.upper()]
            end.append(i.lower()+"Query")
            lawQuery+=query
        
        if(lawQuery!=""):
            commonQuery = "union "+",".join(end)
            lawQuery+=commonQuery
            print(lawQuery)
            # call log analytics
            df = queryInLogAnalytics(workspaceId, lawQuery, "", "")
            if(len(df)>0):
                # call Event Validation
                changeCol = {"SubscriptionId":"Subscription ID", "ResourceGroup":"Resource Group", "ServerName": "Server Name", "DatabaseName":"Database Name", "ObjectName":"Alert Type", "HostingType":"Hosting Type"}
                
                # Metric DF
                df["SubscriptionId"] = df["SubscriptionId"].str.lower().str.strip()
                df["ResourceGroup"] = df["ResourceGroup"].str.lower().str.strip()
                df["ServerName"] = df["ServerName"].str.lower().str.strip()
                df["DatabaseName"] = df["DatabaseName"].str.lower().str.strip()
                df["ObjectName"] = df["ObjectName"].str.lower().str.strip()
                
                df.rename(columns=changeCol, inplace=True)
                
                df_appFamily["Subscription ID"] = df_appFamily["Subscription ID"].str.lower().str.strip()
                df_appFamily["Resource Group"] = df_appFamily["Resource Group"].str.lower().str.strip()
                df_appFamily["Server Name"] = df_appFamily["Server Name"].str.lower().str.strip()
                df_appFamily["Database Name"] = df_appFamily["Database Name"].str.lower().str.strip()
                df_appFamily["Alert Type"] = df_appFamily["Alert Type"].str.lower().str.strip()
                
                df_final = df.copy()
                df_final = df_final.merge(df_appFamily,how="left",on=list(changeCol.values()))
        print(len(df_final))
        print(df_final.head())   
    except Exception as ex:
        info = exceptioninfo(ex)
        raise Exception(info)
    
    return df_final

def createAlert_eventData(df_final):
    try:
        print(df_final["Alert Type"].unique())
        print(len(df_final))
        df_events = pd.DataFrame()
        df_alerts = df_final.copy()
        resolved_events = pd.DataFrame()
        
        sqlQuery = f""" Select [Event ID], trim(upper([Event Metric])), trim(lower([Resource Name])), [Alert ID] from [Event Logs]
        where lower([Source Alert Rule Name]) like '%databasealerts%' and trim(lower([Event State])) <> 'resolved'"""
        res = queryDw(connectionString,sqlQuery)
        
        if(len(res)>0):
            df_app = pd.DataFrame(np.array(res), columns=["Event ID", "Alert Type", "Resource Name", "Alert ID"])
            print(df_app)
            
            # rows from previous iteration not in current iteration
            keys = ["Alert Type", "Resource Name"]
            resolved_events = (
                df_app.merge(df_final, on=keys, how="left", indicator=True)
                    .query("_merge == 'left_only'")
                    .drop(columns="_merge")
            )
            
            # Get all New events which were not part of Alerts before
            df_app = df_app.drop(columns=["Event ID"])
            df_alerts = (
                df_final.merge(df_app[["Alert Type", "Resource Name"]].drop_duplicates(), on=keys, how="left", indicator=True)
                    .query("_merge == 'left_only'")
                    .drop(columns="_merge")
            )
            
            # Get all Active events which were part of Alerts before
            df_events = (
                df_final.merge(df_app[["Alert Type", "Resource Name", "Alert ID"]].drop_duplicates(), on=keys, how="left", indicator=True)
                    .query("_merge == 'both'")
                    .drop(columns="_merge")
            )
            print(len(df_events))
            print(len(df_alerts))
            print(len(resolved_events))
            print(df_alerts.columns)
            print(df_events.columns)
            print(resolved_events.columns)
        
        return df_alerts, df_events, resolved_events
    except Exception as ex:
        info = exceptioninfo(ex)
        raise Exception(info)
        

def updateResolvedEventsState(resolvedEvents):
    id = resolvedEvents["Event ID"].unique().tolist()
    try:
        updateEventState(id)
    except Exception as ex:
        info = exceptioninfo(ex)
        raise Exception(info)
        
def createEventPayload(df_events):
    try:
        print(df_events.columns)
        for _,row in df_events.iterrows():
            alertType = row["Alert Type"].lower()
            eventType = row["Alert Type"]
            data = {}
            
            data["Resource Name"] = row["Resource Name"]
            data["Hosting Type"] = row["Hosting Type"]
            data["Application CI"] = row["Application CI"]
            
            if(alertType=="cpu" or alertType=="storage" or alertType=="dtu"):
                data["Avg Utilization"] = row["AvgValue"]
                data["Max Utilization"] = row["MaxValue"]
            
            if(alertType=="database heartbeat"):
                data["Status"] = row["Status"]
            
            obj = AlertSchema(row["Application Family"].upper(), row["Communication"],data,row["Resource Name"],eventType)
            payload = obj.schema
            payload["essentials"]["originalAlertId"] = row["Alert ID"]
            # payload["essentials"]["monitorCondition"] = "In Progress"
            print(payload)
            insertEventLogs(payload)
            print("-------------------")
    except Exception as ex:
        info = exceptioninfo(ex)
        raise Exception(info)
        
def createAlertInfo(df_final):
    alertData = {}
    try:
        for ind, row in df_final.iterrows():
            appFamily = row["Application Family"].upper()
            alertType = row["Alert Type"].lower()
            communication = row["Communication"]
            
            if(appFamily not in alertData):
                alertData[appFamily] = {}
                
            if(communication not in alertData[appFamily]):
                alertData[appFamily][communication] = {}
                
            if(alertType not in alertData[appFamily][communication]):
                alertData[appFamily][communication][alertType] = []
            
            data = {}
        
            data["Resource Name"] = row["Resource Name"]
            data["Hosting Type"] = row["Hosting Type"]
            data["Application CI"] = row["Application CI"]
            
            if(alertType=="cpu" or alertType=="storage" or alertType=="dtu"):
                data["Avg Utilization"] = row["AvgValue"]
                data["Max Utilization"] = row["MaxValue"]
            
            if(alertType=="database heartbeat"):
                data["Status"] = row["Status"]
            
            alertData[appFamily][communication][alertType].append(data)
        return alertData
    except Exception as ex:
        info = exceptioninfo(ex)
        raise Exception(info)

def createAlertPayload(alertData):
    try:
        temp = {
            "Application Family" : [],
            "Communication" : [],
            "Alert ID" : []
        }
        for appFamily in alertData:
            for communication in alertData[appFamily]:
                obj = AlertSchema(appFamily.upper(), communication,alertData[appFamily][communication],"", "Alert")
                payload = obj.schema
                print("-------------------")
                # Validate with data in in-memory cache
                print(payload)
                createAlert(payload, payload["communication"])
                alertRes = insertAlertLogs(payload)
                alertId = payload["essentials"]["originalAlertId"]
                temp["Application Family"].append(appFamily.upper())
                temp["Communication"].append(communication)
                temp["Alert ID"].append(alertId)
                
        df = pd.DataFrame(temp)
        return df
    except Exception as ex:
        info = exceptioninfo(ex)
        raise Exception(info)

connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
workspaceId = "552b9630-b106-4fe7-a1fa-97d04a0010ef"
alertFrequency = 10
dataAggregation = 20
metricType = "DatabaseAlerts"

try:
    df = getalertconfigs()
    condition = logAnalyticsQueryCondition(df)
    df_final = callLogAnalytics(condition, df)

    if(len(df_final)>0):
        df_final["Resource Name"] = df_final.apply(
            lambda row : "SubscriptionId/" + row["Subscription ID"] + "/ResourceGroup/" + row["Resource Group"] + "/SqlServerName/" + row["Server Name"]  + "/DatabaseName/" + row["Database Name"]+"/ApplicationCI/" + row["Application CI"]
            if (row["Hosting Type"].lower()=="cloud") else "SqlServerName/" + row["Server Name"] + "/DatabaseName/" + row["Database Name"] +"/ApplicationCI/" + row["Application CI"]
            , axis = 1
        )
        df_final["Resource Name"] = df_final["Resource Name"].str.lower()
        df_final["Alert Type"] = df_final["Alert Type"].str.upper()
        
        df_alerts, df_events, resolvedEvents = createAlert_eventData(df_final)
        
        if(len(resolvedEvents)>0):
            updateResolvedEventsState(resolvedEvents)
        
        if(len(df_events)>0):
            createEventPayload(df_events)
        if(len(df_alerts)>0):
            alertInfo = createAlertInfo(df_alerts)
            print(alertInfo)
            df = createAlertPayload(alertInfo)
            df_alerts["Application Family"] = df_alerts["Application Family"].str.upper()
            df_events = df_alerts.merge(df,on=["Application Family", "Communication"],how="left")
            print(len(df_events))
            print(df_events.head())
            createEventPayload(df_events)
            print()
except Exception as ex:
    print(ex)
    if isinstance(ex.args[0], dict):
        insert_data(ex.args[0])
    else:
        info = exceptioninfo(ex)
        insert_data(info)