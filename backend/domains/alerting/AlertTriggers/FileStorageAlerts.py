import sys
from pathlib import Path

# Add the parent of 'parent_folder' to sys.path
root = Path(__file__).resolve().parents[2]
sys.path.append(str(root))

from shared.LogAnalytics import queryInLogAnalytics
from shared.dataBase import queryDw, exceptioninfo, insert_data, connectToDw_AADpwd
import json
import pandas as pd
import numpy as np
import uuid
from datetime import datetime
from domains.alerting.alertRulesSupport import insertEventLogs, insertAlertLogs,createAlert,updateEventState

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
            "STORAGE":""
        }
        
    @property
    def queries(self):
        return {
            "STORAGE" : f""" Select max([TimeGenerated]),[SubscriptionID],[Resource Group],[File Share],[Storage Account Name], Avg([UsedPercentage]), Max([UsedPercentage]), 'Storage' AS [Alert Type]
                                from [AzureResourceStatus] where {self.condition["STORAGE"]} and ([TimeGenerated]>=Dateadd(MINUTE,-{dataAggregation}, (Select MAX([TimeGenerated]) from [AzureResourceStatus])))
                                group by [SubscriptionID],[Resource Group],[File Share],[Storage Account Name]
                            """ 
        }
    
    def changeCondition(self, keyData, value):
        self.condition[keyData] = value
    
def getalertconfigs():
    try:
        df = pd.DataFrame()
        connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
        sqlQuery_server = f"""Select lower(al.[Application CI]) as [Application CI], fsla.[Custom Threshold], fsla.[Communication], fsla.[Alert Type], al.[Application Family], fsl.[Subscription ID], fsl.[Resource Group], fsl.[Storage Name], fsl.[Fileshare Name], fsl.[Hosting Type]
                from [File Storage Alert Configuration] as fsla
                inner join [File Storage List] as fsl on lower(fsl.[Resource Name]) like lower(fsla.[Resource Name])
                inner join [Application List] as al on lower(al.[Application CI]) like lower(fsl.[Application CI])
                where fsla.[Alert Frequency] = {alertFrequency} and fsla.[Data Aggregation] = {dataAggregation} and fsla.[Alert Enabled] = 1
            """
        print(sqlQuery_server)
        res_server = queryDw(connectionString,sqlQuery_server)
        if(len(res_server)):
            df = pd.DataFrame(np.array(res_server), columns=["Application CI", "Custom Threshold", "Communication", "Alert Type", "Application Family", "Subscription ID", "Resource Group", "Storage Name", "Fileshare Name", "Hosting Type"])
        return df
    except Exception as ex:
        info = exceptioninfo(ex)
        raise Exception(info)

def logAnalyticsQueryCondition(df):
    
    eventMetric = {}
    try:
        for ind, row in df.iterrows():
            alertType = row["Alert Type"].upper()
            eventMetric[alertType] = eventMetric.get(alertType,[])
            customThreshold = row["Custom Threshold"]
            subscriptionID = row["Subscription ID"]
            resourceGroup = row["Resource Group"]
            storageName = row["Storage Name"]
            fileshareName = row["Fileshare Name"]
            hostingType = row["Hosting Type"].lower()
            resourceName = (subscriptionID+"/"+resourceGroup+"/"+storageName+"/"+fileshareName).lower()
            
            cond = f"""lower([SubscriptionId]+'/'+[Resource Group]+'/'+[Storage Account Name]+'/'+[File Share]) like '{resourceName}' and [UsedPercentage]>={customThreshold}"""
            eventMetric[alertType].append(cond)
            
        return eventMetric
    except Exception as ex:
        info = exceptioninfo(ex)
        raise Exception(info)

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
            end.append(i.upper()+"Query")
            lawQuery+=query
        
        if(lawQuery!=""):
            print(lawQuery)
            # call log analytics
            connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
            res = queryDw(connectionString, lawQuery)
            if(len(res)>0):
                df = pd.DataFrame(np.array(res),columns=["TimeGenerated","Subscription ID", "Resource Group", "Storage Name", "Fileshare Name","AvgValue","MaxValue", "Alert Type"])

                # call Event Validation
                df_appFamily["Subscription ID"] = df_appFamily["Subscription ID"].str.lower().str.strip()
                df_appFamily["Resource Group"] = df_appFamily["Resource Group"].str.lower().str.strip()
                df_appFamily["Storage Name"] = df_appFamily["Storage Name"].str.lower().str.strip()
                df_appFamily["Fileshare Name"] = df_appFamily["Fileshare Name"].str.lower().str.strip()  
                df_appFamily["Alert Type"] = df_appFamily["Alert Type"].str.lower().str.strip()
                
                df["Subscription ID"] = df["Subscription ID"].str.lower().str.strip()
                df["Resource Group"] = df["Resource Group"].str.lower().str.strip()
                df["Storage Name"] = df["Storage Name"].str.lower().str.strip()
                df["Fileshare Name"] = df["Fileshare Name"].str.lower().str.strip()  
                df["Alert Type"] = df["Alert Type"].str.lower().str.strip()
                
                df_final = df.merge(df_appFamily,how="left",on=["Subscription ID","Resource Group","Storage Name","Fileshare Name", "Alert Type"])
                
        return df_final
    except Exception as ex:
        info = exceptioninfo(ex)
        raise Exception(info)

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
        print(ex)
        
def createEventPayload(df_events):
    print(df_events.columns)
    try:
        for _,row in df_events.iterrows():
            alertType = row["Alert Type"].lower()
            eventType = row["Alert Type"]
            data = {}
            
            data["Resource Name"] = row["Resource Name"]
            data["Hosting Type"] = row["Hosting Type"]
            data["Application CI"] = row["Application CI"]
            
            if(alertType=="storage"):
                data["Avg Utilization"] = row["AvgValue"]
                data["Max Utilization"] = row["MaxValue"]
            
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
    try:
        alertData = {}
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
            
            if(alertType=="storage"):
                data["Avg Utilization"] = row["AvgValue"]
                data["Max Utilization"] = row["MaxValue"]
            
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
alertFrequency = 5
dataAggregation = 10
metricType = "FileStorage"

def fileStorageAlertsMain(alertFreq, dataAgg):
    global alertFrequency, dataAggregation
    alertFrequency = alertFreq
    dataAggregation = dataAgg
    try:
        df = getalertconfigs()
        condition = logAnalyticsQueryCondition(df)
        df_final = callLogAnalytics(condition, df)

        if(len(df_final)>0):
            df_final["Resource Name"] = df_final.apply(
                lambda row : "SubscriptionId/" + row["Subscription ID"] + "/ResourceGroup/" + row["Resource Group"] + "/StorageName/" + row["Storage Name"]  + "/FileshareName/" + row["Fileshare Name"]+"/ApplicationCI/" + row["Application CI"]
                if (row["Hosting Type"].lower()=="cloud") else "StorageName/" + row["Storage Name"] + "/FileshareName/" + row["Fileshare Name"] +"/ApplicationCI/" + row["Application CI"]
                , axis = 1
            )
            df_final["Resource Name"] = df_final["Resource Name"].str.lower()
            df_final["Alert Type"] = df_final["Alert Type"].str.upper()
            
            df_alerts, df_events, resolvedEvents = createAlert_eventData(df_final)
            print("FS Alerts")
            print(len(df_alerts), len(df_events), len(resolvedEvents))
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
            