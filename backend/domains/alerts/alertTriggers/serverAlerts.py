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
            "MEMORY":"",
            "DISK":"",
            "VMHEARTBEAT":"",
            "SERVICES":""
        }
        
    @property
    def queries(self):
        return {
            "CPU" : f""" let cpuQuery = (Perf
                    | where TimeGenerated > ago({str(dataAggregation)}m) and (ObjectName == "Processor"
                        and CounterName == "% Processor Time"
                        and InstanceName =~ "_Total" ) 
                        and _SubscriptionId in ("ab16a144-47d7-45c5-bcb7-8affc988f8e0", "9592c342-d1fb-477e-8e91-ad39bf00933b", "5467bf57-48b4-4930-b3cb-bf039b259d04", "343a7ee0-5081-4024-82fc-498ee61867a9", "6d590d81-bab9-4b9a-b011-090467b5a9a4", "accde124-a45f-47be-aefa-b09362b2c5fc")
                    | extend resourceIdSpilt=split(_ResourceId, '/') 
                    | extend
                        SubscriptionId=tostring(resourceIdSpilt[2]),
                        ResourceGroup=tostring(resourceIdSpilt[4]),
                        ServerName=tolower(tostring(resourceIdSpilt[8])),
                        DnsDomain = strcat(tostring(split(Computer, '.')[1]), '.', tostring(split(Computer, '.')[2]), '.', tostring(split(Computer, '.')[3]))
                    | extend HostingType = iff(tolower(ResourceGroup) contains "rg-azarc-compute-eng-westus2", "OnPremise", "Cloud")
                    | extend TimeGenerated = datetime_utc_to_local(TimeGenerated, 'US/Pacific')
                    | where DnsDomain != '..' 
                    | summarize 
                        AvgValue = round(avg(CounterValue)),
                        MinValue = round(min(CounterValue)),
                        MaxValue = round(max(CounterValue)),
                        StandardDeviation = round(stdev(CounterValue)),
                        SampleCount = count(),
                        TimeGenerated = arg_min(TimeGenerated, *)
                        by
                        SubscriptionId,
                        ResourceGroup,
                        ServerName,
                        DnsDomain,
                        HostingType, _ResourceId, ObjectName, CounterName
                    | where {self.condition['CPU']}
                    | project SubscriptionId, ResourceGroup, ServerName, HostingType = iff(ResourceGroup contains "rg-azarc-compute-eng-westus2", "OnPremise", "Cloud"), ObjectName='CPU', AvgValue,MaxValue, TimeGenerated);
                """,
            "MEMORY" : f""" let memoryQuery = (Perf
                    | where ObjectName == "Memory"
                        and CounterName in ("% Committed Bytes In Use", "% Used Memory")
                        and _SubscriptionId in ("ab16a144-47d7-45c5-bcb7-8affc988f8e0", "9592c342-d1fb-477e-8e91-ad39bf00933b", "5467bf57-48b4-4930-b3cb-bf039b259d04", "343a7ee0-5081-4024-82fc-498ee61867a9", "6d590d81-bab9-4b9a-b011-090467b5a9a4", "accde124-a45f-47be-aefa-b09362b2c5fc") 
                        and TimeGenerated > ago({str(dataAggregation)}m)
                    | extend resourceIdSpilt=split(_ResourceId, '/')
                    | extend
                        SubscriptionId=tostring(resourceIdSpilt[2]),
                        ResourceGroup=tostring(resourceIdSpilt[4]),
                        ServerName=tolower(tostring(resourceIdSpilt[8])),
                        DnsDomain = strcat(tostring(split(Computer, '.')[1]), '.', tostring(split(Computer, '.')[2]), '.', tostring(split(Computer, '.')[3]))
                    | extend HostingType = iff(tolower(ResourceGroup) contains "rg-azarc-compute-eng-westus2", "OnPremise", "Cloud")
                    | extend TimeGenerated = datetime_utc_to_local(TimeGenerated, 'US/Pacific')
                    | where DnsDomain != '..' 
                    | summarize 
                        AvgValue = round(avg(CounterValue)),
                        MinValue = round(min(CounterValue)),
                        MaxValue = round(max(CounterValue)),
                        StandardDeviation = round(stdev(CounterValue)),
                        SampleCount = count(),
                        TimeGenerated = arg_min(TimeGenerated, *)
                        by
                        SubscriptionId,
                        ResourceGroup,
                        ServerName,
                        DnsDomain,
                        HostingType,ObjectName, CounterName
                    | where {self.condition['MEMORY']}
                    | project SubscriptionId, ResourceGroup, ServerName, HostingType = iff(ResourceGroup contains "rg-azarc-compute-eng-westus2", "OnPremise", "Cloud"), ObjectName='Memory', AvgValue,MaxValue, TimeGenerated);
                """,
            "DISK" : f""" let diskQuery = (Perf
                    | where ObjectName == "LogicalDisk" and TimeGenerated > ago({str(dataAggregation)}min)
                        and CounterName in ("% Free Space")
                        and InstanceName !in ("_Total")
                        and InstanceName !startswith "HarddiskVolume"
                        and InstanceName !contains "Program Files"
                        and _SubscriptionId in ("ab16a144-47d7-45c5-bcb7-8affc988f8e0", "9592c342-d1fb-477e-8e91-ad39bf00933b", "5467bf57-48b4-4930-b3cb-bf039b259d04", "343a7ee0-5081-4024-82fc-498ee61867a9", "6d590d81-bab9-4b9a-b011-090467b5a9a4", "accde124-a45f-47be-aefa-b09362b2c5fc")
                    | extend resourceIdSplit = split(_ResourceId, '/')
                    | extend
                        SubscriptionId = tostring(resourceIdSplit[2]),
                        ResourceGroup = tostring(resourceIdSplit[4]),
                        ServerName = tolower(tostring(resourceIdSplit[8])),
                        DnsDomain = strcat(tostring(split(Computer, '.')[1]), '.', tostring(split(Computer, '.')[2]), '.', tostring(split(Computer, '.')[3]))
                    | extend HostingType = iff(tolower(ResourceGroup) contains "rg-azarc-compute-eng-westus2", "OnPremise", "Cloud")
                    | extend TimeGenerated = datetime_utc_to_local(TimeGenerated, 'US/Pacific')
                    | where DnsDomain != '..' 
                    | where InstanceName in ("C:", "D:", "E:", "R:", "L:", "T:")
                    | summarize
                        AvgValue = round(avgif(100 - CounterValue, CounterName == "% Free Space")),
                        MinValue = round(minif(100 - CounterValue, CounterName == "% Free Space")),
                        MaxValue = round(maxif(100 - CounterValue, CounterName == "% Free Space")),
                        StandardDeviation = round(stdevif(100 - CounterValue, CounterName == "% Free Space")),
                        SampleCount = count(),
                        TimeGenerated = arg_min(TimeGenerated, *)
                        by
                        SubscriptionId,
                        ResourceGroup,
                        ServerName,
                        DnsDomain,
                        InstanceName,
                        HostingType, ObjectName, CounterName
                    | where {self.condition['DISK']}
                    | project SubscriptionId, ResourceGroup, ServerName, HostingType = iff(ResourceGroup contains "rg-azarc-compute-eng-westus2", "OnPremise", "Cloud"), ObjectName=strcat('Disk ', toupper(InstanceName)), AvgValue,MaxValue, DriveName = InstanceName, TimeGenerated);
                """,
            "VMHEARTBEAT" : f""" let vmheartbeatQuery = ( Heartbeat
                    | extend ServerName = tolower(tostring(Resource))
                    | extend TimeGenerated = datetime_utc_to_local(TimeGenerated, 'US/Pacific')
                    | extend SubscriptionId = tolower(tostring(SubscriptionId)), ResourceGroup = tolower(tostring(ResourceGroup))
                    | where 
                    SubscriptionId in ("ab16a144-47d7-45c5-bcb7-8affc988f8e0","9592c342-d1fb-477e-8e91-ad39bf00933b", "5467bf57-48b4-4930-b3cb-bf039b259d04", "343a7ee0-5081-4024-82fc-498ee61867a9", "6d590d81-bab9-4b9a-b011-090467b5a9a4","accde124-a45f-47be-aefa-b09362b2c5fc","a82a7c51-82fd-4bbc-a376-3cd8752a1675") and 
                    TimeGenerated>ago({str(dataAggregation)}min)  and {self.condition['VMHEARTBEAT']}
                    | summarize  LastHeartbeat = max(TimeGenerated) by ServerName, SubscriptionId, ResourceGroup, ResourceType 
                    | extend CurrentTime = now()
                    | extend CurrentTime = datetime_utc_to_local(CurrentTime, 'US/Pacific')
                    | extend TimeSinceLastHeartbeat = CurrentTime - LastHeartbeat 
                    | extend Status = iif(TimeSinceLastHeartbeat > timespan(5m), "Down", "Up"), ObjectName = 'Heartbeat',HostingType = iff(tolower(ResourceGroup) contains "rg-azarc-compute-eng-westus2", "OnPremise", "Cloud"), TimeGenerated = CurrentTime
                    | project SubscriptionId, ResourceGroup, ServerName, HostingType = iff(ResourceGroup contains "rg-azarc-compute-eng-westus2", "OnPremise", "Cloud"), ObjectName='VM Heartbeat', Status, TimeGenerated);
                """,
            "SERVICES" : f""" let servicesQuery = ConfigurationData
                    | extend resourceIdSpilt=split(_ResourceId, '/')
                    | extend SubscriptionId=tostring(resourceIdSpilt[2]),
                        ResourceGroup=tostring(resourceIdSpilt[4]),
                        ServerName=tolower(tostring(resourceIdSpilt[8])),
                        ServiceName = iff(ConfigDataType == 'WindowsServices', SvcDisplayName, SvcName)
                    | extend TimeGenerated = datetime_utc_to_local(TimeGenerated, 'US/Pacific')
                    | where TimeGenerated > ago(1d) and ConfigDataType in ('WindowsServices', 'Daemons')
                        and _SubscriptionId in ('ab16a144-47d7-45c5-bcb7-8affc988f8e0', '9592c342-d1fb-477e-8e91-ad39bf00933b', '5467bf57-48b4-4930-b3cb-bf039b259d04', '343a7ee0-5081-4024-82fc-498ee61867a9', '6d590d81-bab9-4b9a-b011-090467b5a9a4', 'accde124-a45f-47be-aefa-b09362b2c5fc',"a82a7c51-82fd-4bbc-a376-3cd8752a1675")
                        and {self.condition["SERVICES"]}
                    | summarize arg_max(TimeGenerated, *) by SubscriptionId, ResourceGroup, ServerName, ServiceName 
                    | summarize SvcState = make_list(SvcState) by SubscriptionId, ResourceGroup, ServerName, ServiceName, TimeGenerated
                    | extend SvcState = iff(set_has_element(SvcState, 'Running'), 'Running', SvcState[0])
                    | where SvcState != 'Running'
                    | project SubscriptionId, ResourceGroup, ServerName, ServiceName, HostingType = iff(ResourceGroup contains "rg-azarc-compute-eng-westus2", "OnPremise", "Cloud"), ObjectName='Services', Status=SvcState, TimeGenerated;
            """
        }
    
    def changeCondition(self, keyData, value):
        self.condition[keyData] = value
    
def getalertconfigs():
    try:
        df_server = pd.DataFrame()
        df_service = pd.DataFrame()
        df = pd.DataFrame()
        sqlQuery_server = f"""Select lower(al.[Application CI]) as [Application CI], sla.[Custom Threshold], sla.[Communication], sla.[Alert Type], al.[Application Family], sl.[Subscription ID], sl.[Resource Group], sl.[Server Name], sl.[Hosting Type]
                from [Server Alert Configuration] as sla
                inner join [Server List] as sl on sl.[Resource Name] like sla.[Resource Name]
                inner join [Application List] as al on al.[Application CI] like sl.[Application CI]
                where sla.[Alert Frequency] = {alertFrequency} and sla.[Data Aggregation] = {dataAggregation} and sla.[Alert Enabled] = 1
            """
        
        res_server = queryDw(connectionString,sqlQuery_server)
        if(len(res_server)>0):
            df_server = pd.DataFrame(np.array(res_server), columns = ["Application CI", "Custom Threshold", "Communication", "Alert Type", "Application Family", "Subscription ID", "Resource Group", "Server Name", "Hosting Type"])
            print(df_server.columns)
        sqlQuery_services = f"""Select al.[Application CI] as [Application CI], wsla.[Communication], [Alert Type] = 'Services',al.[Application Family], trim(wsla.[Service Name]), sl.[Subscription ID], sl.[Resource Group], sl.[Server Name], sl.[Hosting Type]
                from [Windows Services Alert Configuration] as wsla
                inner join [Server List] as sl on lower(sl.[Resource Name]) like lower(wsla.[Resource Name])
                inner join [Application List] as al on lower(al.[Application CI]) like lower(sl.[Application CI])
                where wsla.[Alert Frequency] = {alertFrequency} and wsla.[Alert Enabled] = 1
            """
        
        res_service = queryDw(connectionString,sqlQuery_services)
        if(len(res_service)>0):
            df_service = pd.DataFrame(np.array(res_service), columns =["Application CI", "Communication", "Alert Type", "Application Family", "Service Name", "Subscription ID", "Resource Group", "Server Name", "Hosting Type"])
        
        if(len(df_server)>0 and len(df_service)>0):
            df = pd.concat([df_server, df_service], ignore_index=True)  
        elif(len(df_server)>0):
            df=df_server
        elif(len(df_service)>0):
            df=df_service
            
        return df
    except Exception as ex:
        info = exceptioninfo(ex)
        raise Exception(info)

def logAnalyticsQueryCondition(df):
    try:
        eventMetric = {}
        for ind, row in df.iterrows():
            alertType = row["Alert Type"].split(" ")[0]
            customThreshold = row["Custom Threshold"] if "Custom Threshold" in row else 0
            subscriptionID = row["Subscription ID"]
            resourceGroup = row["Resource Group"]
            serverName = row["Server Name"]
            hostingType = row["Hosting Type"].lower()
            resourceName = (subscriptionID+"/"+resourceGroup+"/"+serverName).lower()
            
            if(alertType.lower() in ["cpu", "memory"]):
                if(alertType not in eventMetric):
                    eventMetric[alertType] = []
                
                if(hostingType=="cloud"):
                    cond = f"(strcat(tolower(SubscriptionId),'/',tolower(ResourceGroup),'/',tolower(ServerName)) == '{resourceName}' and AvgValue>={customThreshold})"
                else:
                    cond = f"(tolower(ServerName) == '{resourceName}' and tolower(HostingType) == '{hostingType}' and AvgValue>={customThreshold})"
                
                eventMetric[alertType].append(cond)
                
            elif("disk" in alertType.lower()):
                driveName = (row["Alert Type"].split(" ")[1]).lower()
                if(alertType not in eventMetric):
                    eventMetric[alertType] = []
                
                if(hostingType=="cloud"):
                    cond = f"(strcat(tolower(SubscriptionId),'/',tolower(ResourceGroup),'/',tolower(ServerName)) == '{resourceName}' and tolower(InstanceName) == '{driveName}' and AvgValue>={customThreshold})"
                else:
                    cond = f"(tolower(ServerName) == '{resourceName}' and tolower(HostingType) == '{hostingType}' and tolower(InstanceName) == '{driveName}' and AvgValue>={customThreshold})"
                
                eventMetric[alertType].append(cond)
            
            elif(alertType.lower().strip() == "vm"):
                if("vmheartbeat" not in eventMetric):
                    eventMetric["vmheartbeat"] = []
                
                if(hostingType=="cloud"):
                    cond = f"(strcat(tolower(SubscriptionId),'/',tolower(ResourceGroup),'/',tolower(ServerName)) == '{resourceName}')"
                else:
                    cond = f"(tolower(ServerName) == '{resourceName}' and tolower(HostingType) == '{hostingType}')"
                
                eventMetric["vmheartbeat"].append(cond)
                
            elif(alertType.lower() == "services"):
                serviceName = (row["Service Name"]).lower()
                if(alertType not in eventMetric):
                    eventMetric[alertType] = []
                
                if(hostingType=="cloud"):
                    cond = f"(strcat(tolower(SubscriptionId),'/',tolower(ResourceGroup),'/',tolower(ServerName)) == '{resourceName}' and tolower(ServiceName) == '{serviceName}')"
                else:
                    cond = f"(tolower(ServerName) == '{resourceName}' and tolower(HostingType) == '{hostingType}' and tolower(ServiceName) == '{serviceName}')"
                
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
            # print(i)
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
                changeCol = {"SubscriptionId":"Subscription ID", "ResourceGroup":"Resource Group", "ServerName": "Server Name", "ObjectName":"Alert Type", "HostingType":"Hosting Type"}
                
                # Metric DF
                df["SubscriptionId"] = df["SubscriptionId"].str.lower().str.strip()
                df["ResourceGroup"] = df["ResourceGroup"].str.lower().str.strip()
                df["ServerName"] = df["ServerName"].str.lower().str.strip()
                df["ObjectName"] = df["ObjectName"].str.lower().str.strip()
                
                df.rename(columns=changeCol, inplace=True)
                
                df_appFamily["Subscription ID"] = df_appFamily["Subscription ID"].str.lower().str.strip()
                df_appFamily["Resource Group"] = df_appFamily["Resource Group"].str.lower().str.strip()
                df_appFamily["Server Name"] = df_appFamily["Server Name"].str.lower().str.strip()
                df_appFamily["Alert Type"] = df_appFamily["Alert Type"].str.lower().str.strip()
                
                df_final = df[~df["Alert Type"].str.contains("services", na=False)].copy()
                df_final = df_final.merge(df_appFamily,how="left",on=list(changeCol.values()))
                
                if("ServiceName" in df.columns):
                    df["ServiceName"] = df["ServiceName"].str.lower().str.strip()
                    df_appFamily["Service Name"] = df_appFamily["Service Name"].str.lower().str.strip()
                    changeCol["ServiceName"] = "Service Name"
                    df.rename(columns={"ServiceName":"Service Name"}, inplace=True)
                    df_servicesFinal = df[df["Alert Type"].str.contains("services", na=False)].copy()
                    df_servicesFinal = df_servicesFinal.merge(df_appFamily,how="left",on=list(changeCol.values()))

                    df_final = pd.concat([df_final, df_servicesFinal])
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
        where lower([Source Alert Rule Name]) like '%serveralerts%' and trim(lower([Event State])) <> 'resolved'"""
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
    try:
        print(df_events.columns)
        for _,row in df_events.iterrows():
            alertType = row["Alert Type"].split(" ")[0].lower()
            eventType = row["Alert Type"]
            data = {}
            
            data["Resource Name"] = row["Resource Name"]
            data["Hosting Type"] = row["Hosting Type"]
            data["Application CI"] = row["Application CI"]
            if(alertType=="services"):
                data["Service Name"] = row["Service Name"]
                # eventType=eventType + " " + row["Service Name"]
            elif(alertType=="cpu" or alertType=="memory" or alertType=="disk"):
                data["Avg Utilization"] = row["AvgValue"]
                data["Max Utilization"] = row["MaxValue"]
            
            if(alertType=="services" or alertType=="vm"):
                data["Status"] = row["Status"]
            elif(alertType=="disk"):
                data["Driver Name"] = row["Alert Type"].split(" ")[1]
            
            obj = AlertSchema(row["Application Family"].upper(), row["Communication"],data,row["Resource Name"],eventType)
            payload = obj.schema
            payload["essentials"]["originalAlertId"] = row["Alert ID"]
            payload["essentials"]["MonitorCondition"] = "In Progress"
            print(payload)
            insertEventLogs(payload)
            print("-------------------")
    except Exception as ex:
        info = exceptioninfo(ex)
        raise Exception(info)

def createAlertInfo(df_alerts):
    try:
        alertData = {}
        for ind, row in df_alerts.iterrows():
            appFamily = row["Application Family"].upper()
            alertType = row["Alert Type"].split(" ")[0].lower()
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
            if(alertType=="services"):
                data["Service Name"] = row["Service Name"]
            elif(alertType=="cpu" or alertType=="memory" or alertType=="disk"):
                data["Avg Utilization"] = row["AvgValue"]
                data["Max Utilization"] = row["MaxValue"]
            
            if(alertType=="services" or alertType=="vm"):
                data["Status"] = row["Status"]
            elif(alertType=="disk"):
                data["Driver Name"] = row["Alert Type"].split(" ")[1]
                
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
metricType = "ServerAlerts"

def serverAlertsMain(alertFreq, dataAgg):
    global alertFrequency, dataAggregation
    alertFrequency = alertFreq
    dataAggregation = dataAgg
    try:
        df = getalertconfigs()
        condition = logAnalyticsQueryCondition(df)
        df_final = callLogAnalytics(condition, df)

        if(len(df_final)>0):
            df_final["Resource Name"] = df_final.apply(
                lambda row : "SubscriptionId/" + row["Subscription ID"] + "/ResourceGroup/" + row["Resource Group"] + "/ServerName/" + row["Server Name"] +"/ApplicationCI/" + row["Application CI"]
                if (row["Hosting Type"].lower()=="cloud") else "ServerName/" + row["Server Name"] +"/ApplicationCI/" + row["Application CI"]
                , axis = 1
            )
            df_final["Resource Name"] = df_final["Resource Name"].str.lower()
            df_final["Alert Type"] = df_final.apply(
                lambda row: row["Alert Type"] +" "+row["Service Name"] if row["Alert Type"].lower().strip()=="services" 
                else row["Alert Type"]
                , axis=1
            )
            df_final["Alert Type"] = df_final["Alert Type"].str.upper()
            
            df_alerts, df_events, resolvedEvents = createAlert_eventData(df_final)
            print("Server Alerts")
            print(len(df_alerts), len(df_events), len(resolvedEvents))
            if(len(resolvedEvents)>0):
                updateResolvedEventsState(resolvedEvents)
            if(len(df_events)>0):
                createEventPayload(df_events)
            if(len(df_alerts)>0):
                alertInfo = createAlertInfo(df_alerts)
                df = createAlertPayload(alertInfo)
                df_alerts["Application Family"] = df_alerts["Application Family"].str.upper()
                df_events = df_alerts.merge(df,on=["Application Family", "Communication"],how="left")
                createEventPayload(df_events)
                print()
                
    except Exception as ex:
        print(ex)
        if isinstance(ex.args[0], dict):
            insert_data(ex.args[0])
        else:
            info = exceptioninfo(ex)
            insert_data(info)
            
