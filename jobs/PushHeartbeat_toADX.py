import sys
from pathlib import Path

# Add the parent of 'parent_folder' to sys.path
root = Path(__file__).resolve().parents[1] / "backend"
sys.path.append(str(root))

import os
import pandas as pd
import numpy as np
from shared.dataBase import connectToDw_AADpwd,connectToDw_AADpwd_Write,queryDw,insert_data,exceptioninfo
from datetime import datetime, timezone, timedelta
from azure.monitor.query import LogsQueryClient, LogsQueryStatus
from azure.identity import DefaultAzureCredential, VisualStudioCodeCredential, AzureCliCredential, ManagedIdentityCredential
from azure.core.exceptions import HttpResponseError
from azure.kusto.data import KustoClient, KustoConnectionStringBuilder, DataFormat
from azure.kusto.ingest import IngestionProperties, IngestionMappingKind, KustoStreamingIngestClient, QueuedIngestClient
from azure.kusto.data.helpers import dataframe_from_result_table
from shared.LogAnalytics import connectToLogAnlytics, queryInLogAnalytics
import threading

def insertIntoADX(df):
    
    while True:
        try:
            cluster = "https://ingest-telemetrycrcav2.westus2.kusto.windows.net"
            kcsb = KustoConnectionStringBuilder.with_azure_token_credential(cluster, credential)
            ingest_client = QueuedIngestClient(kcsb)
            break
        except:
            credential = AzureCliCredential()
    try:
        ingestion_properties = IngestionProperties(
            database=database,
            table=table,
            data_format=DataFormat.CSV,  # Specify the format of the data being ingested
            ingestion_mapping_reference="HeartbeatPerfCsvMapping",  # Ensure you have an appropriate mapping defined
        )

        ingest_client.ingest_from_dataframe(df, ingestion_properties)
        print("Data ingestion initiated.")
    except Exception as ex:
        print("Exception")
        print(ex)
        info = exceptioninfo(ex)
        raise Exception(info)

def getMaxTime():
    try:
        cluster = "https://telemetrycrcav2.westus2.kusto.windows.net"
        kcsb = KustoConnectionStringBuilder.with_azure_token_credential(cluster, credential)
        read_client = KustoClient(kcsb)
        
        KUSTO_QUERY = f"""set notruncation; Heartbeat | summarize maxTime = max(TimeGenerated) """
        st = datetime.now()
        result = read_client.execute_query(database, KUSTO_QUERY)
        end = datetime.now()
        print("Metrics Table", st, end)
        print((end-st).seconds)
        try:
            df = dataframe_from_result_table(result.primary_results[0])
            if(len(df)):
                
                maxTime = df["maxTime"].iloc[0]
                return maxTime
            else:
                return ""
        except:
            return ""
    except Exception as ex:
        info = exceptioninfo(ex)
        raise Exception(info)

def getDatabaseList():
    serverName = 'sqldb-azure-prod-012.database.windows.net'
    dBname = 'crcamonitoring'
    username = 'servCRCAMonitoring@providence.org'
    df_apps = pd.DataFrame()
    try:
        connectionString = connectToDw_AADpwd(serverName,dBname,username)
        try:
            sqlQuery = f""" Select lower([Subscription ID]), lower([Resource Group]), lower([Sql Server Name]), lower([Database Name]), [Resource Name], [Hosting Type] from [Database List] where [Last Updated] = (Select MAX([Last Updated]) from [Database List])"""
            res = queryDw(connectionString, sqlQuery)
            df_apps = pd.DataFrame(np.array(res),columns=["SubscriptionId","ResourceGroup","SqlServerName", "DatabaseName", "ResourceId", "HostingType"])
            return df_apps
        except Exception as Ex:
            info = exceptioninfo(Ex)
            raise Exception(info) 
    except Exception as Ex:
        info = exceptioninfo(Ex)
        raise Exception(info)  

def getServerList():
    serverName = 'sqldb-azure-prod-012.database.windows.net'
    dBname = 'crcamonitoring'
    username = 'servCRCAMonitoring@providence.org'
    df_apps = pd.DataFrame()
    try:
        connectionString = connectToDw_AADpwd(serverName,dBname,username)
        try:
            sqlQuery = f""" Select lower([Subscription ID]), lower([Resource Group]), lower([Server Name]), [Resource Name], [Hosting Type] from [Server List] where [Last Updated] = (Select MAX([Last Updated]) from [Server List])"""
            res = queryDw(connectionString, sqlQuery)
            df_apps = pd.DataFrame(np.array(res),columns=["SubscriptionId","ResourceGroup","ServerName", "ResourceId", "HostingType"])
            return df_apps
        except Exception as Ex:
            info = exceptioninfo(Ex)
            raise Exception(info) 
    except Exception as Ex:
        info = exceptioninfo(Ex)
        raise Exception(info)  
    
def get_data_database():
    maxTime = getMaxTime()
    df = pd.DataFrame()
    workspaceId = '552b9630-b106-4fe7-a1fa-97d04a0010ef'
    currentTime = datetime.now(timezone.utc)
    
    floored_currentTime = currentTime.replace(
        minute=(currentTime.minute // 5) * 5,
        second=0,
        microsecond=0
    )
    if(maxTime=="" or pd.isna(maxTime)):
        startTime = floored_currentTime-timedelta(minutes=5)
        # startTime = floored_currentTime-timedelta(days=30)
    else:
        maxTime = maxTime+timedelta(minutes=5)
        startTime = maxTime.replace(
            minute=(maxTime.minute // 5) * 5,
            second=0,
            microsecond=0
        )
    while True:
        if(startTime>=floored_currentTime):
            break
        endTime = floored_currentTime if(startTime+timedelta(days=1)>floored_currentTime) else startTime+timedelta(days=1)
        print(startTime, endTime)
        query = f"""AzureMetrics
        | where ResourceProvider == "MICROSOFT.SQL"
        | where TimeGenerated >= ago(5d) and SubscriptionId in (
            "ab16a144-47d7-45c5-bcb7-8affc988f8e0", "9592c342-d1fb-477e-8e91-ad39bf00933b",
            "5467bf57-48b4-4930-b3cb-bf039b259d04", "343a7ee0-5081-4024-82fc-498ee61867a9",
            "6d590d81-bab9-4b9a-b011-090467b5a9a4", "accde124-a45f-47be-aefa-b09362b2c5fc", "a82a7c51-82fd-4bbc-a376-3cd8752a1675"
        )
        | where MetricName in ('availability')
        | extend
            SubscriptionId=tolower(tostring(SubscriptionId)),
            ResourceGroup=tolower(tostring(ResourceGroup)),
            DatabaseName=tolower(tolower(tostring(Resource))),
            SqlServerName=tolower(tolower(split(ResourceId, '/')[8])),
            ObjectName = MetricName,
            CounterName = UnitName
        | summarize LastHeartbeat = max(TimeGenerated) by SqlServerName, DatabaseName, SubscriptionId, ResourceGroup 
        | extend CurrentTime = now()
        | extend TimeSinceLastHeartbeat = CurrentTime - LastHeartbeat 
        | extend Status = iif(TimeSinceLastHeartbeat >= timespan(10m), "Down", "Up")
        | extend ObjectName = 'Database', TimeGenerated = CurrentTime
        | project
            SubscriptionId,
            ResourceGroup,
            SqlServerName,
            DatabaseName,
            ObjectName,
            TimeGenerated,
            HostingType = iff(ResourceGroup contains "rg-azarc-compute-eng-westus2", "OnPremise", "Cloud"),
            Status 
        """

        # print(query)
        try:
            df_iter = pd.DataFrame()
            df_iter = queryInLogAnalytics(workspaceId, query,'','')
            df = pd.concat([df,df_iter], ignore_index=True)
            
        except Exception as Ex:
            info = exceptioninfo(Ex,query)
            raise Exception(info)
        startTime = endTime
    return df

def get_data_vm():
    maxTime = getMaxTime()
    df = pd.DataFrame()
    workspaceId = '552b9630-b106-4fe7-a1fa-97d04a0010ef'
    currentTime = datetime.now(timezone.utc)
    
    floored_currentTime = currentTime.replace(
        minute=(currentTime.minute // 5) * 5,
        second=0,
        microsecond=0
    )
    if(maxTime=="" or pd.isna(maxTime)):
        startTime = floored_currentTime-timedelta(minutes=10)
        # startTime = floored_currentTime-timedelta(days=30)
    else:
        maxTime = maxTime+timedelta(minutes=5)
        startTime = maxTime.replace(
            minute=(maxTime.minute // 5) * 5,
            second=0,
            microsecond=0
        )
    while True:
        if(startTime>=floored_currentTime):
            break
        endTime = floored_currentTime if(startTime+timedelta(days=1)>floored_currentTime) else startTime+timedelta(days=1)
        print(startTime, endTime)
        
        query = f"""Heartbeat
        | extend ServerName = tolower(tostring(Resource))
        | extend SubscriptionId = tolower(tostring(SubscriptionId)), ResourceGroup = tolower(tostring(ResourceGroup))
        | where TimeGenerated > ago(5d) and 
        SubscriptionId in (
            "ab16a144-47d7-45c5-bcb7-8affc988f8e0", "9592c342-d1fb-477e-8e91-ad39bf00933b",
            "5467bf57-48b4-4930-b3cb-bf039b259d04", "343a7ee0-5081-4024-82fc-498ee61867a9",
            "6d590d81-bab9-4b9a-b011-090467b5a9a4", "accde124-a45f-47be-aefa-b09362b2c5fc","a82a7c51-82fd-4bbc-a376-3cd8752a1675"
        )
        | summarize  LastHeartbeat = max(TimeGenerated) by ServerName, SubscriptionId, ResourceGroup, ResourceType 
        | extend CurrentTime = now()
        | extend TimeSinceLastHeartbeat = CurrentTime - LastHeartbeat 
        | extend Status = iif(TimeSinceLastHeartbeat >= timespan(10m), "Down", "Up")
        | extend ObjectName = 'VM', TimeGenerated = CurrentTime
        | project SubscriptionId, ResourceGroup, ServerName, ObjectName, TimeGenerated, HostingType = iff(ResourceGroup contains "rg-azarc-compute-eng-westus2", "OnPremise", "Cloud"), Status """
        
        print(query)
        try:
            df_iter = pd.DataFrame()
            df_iter = queryInLogAnalytics(workspaceId, query,'','')
            df = pd.concat([df,df_iter], ignore_index=True)
            
        except Exception as Ex:
            info = exceptioninfo(Ex,query)
            raise Exception(info)
        startTime = endTime
    return df

def threadFunction(type):
    if(type=="db"):
        df_apps_db = getDatabaseList()
        df = get_data_database()
        if(len(df)):
            df_cloud = df[df["HostingType"]=='Cloud']
            df_onPremise = df[df["HostingType"]=='OnPremise']
            
            df_cloud = df_cloud.merge(df_apps_db,on=["SubscriptionId", "ResourceGroup","SqlServerName","DatabaseName", "HostingType"],how="inner")
            df_onPremise = df_onPremise.merge(df_apps_db[["HostingType","SqlServerName","DatabaseName","ResourceId"]],on=["HostingType","SqlServerName","DatabaseName",],how="inner")

            df_merge = pd.concat([df_cloud,df_onPremise], ignore_index=True)
            print("db",len(df_merge),len(df))
            result.append(df_merge)
    
    elif(type=="vm"):
        df_apps_vm = getServerList()
        df = get_data_vm()
        if(len(df)):
            df_cloud = df[df["HostingType"]=='Cloud']
            df_onPremise = df[df["HostingType"]=='OnPremise']
            
            df_cloud = df_cloud.merge(df_apps_vm,on=["SubscriptionId", "ResourceGroup","ServerName", "HostingType"],how="inner")
            df_onPremise = df_onPremise.merge(df_apps_vm[["HostingType","ServerName","ResourceId"]],on=["HostingType","ServerName"],how="inner")

            df_merge = pd.concat([df_cloud,df_onPremise], ignore_index=True)
            result.append(df_merge)
            print("vm",len(df_merge),len(df))
        
# Threads
result = []
try:
    
    database = "crca_monitoring_telemetry"
    table = "Heartbeat"
    credential = AzureCliCredential()
    df_merge = pd.DataFrame()
    
    threads= [
        threading.Thread(target=threadFunction,args=('db',)),
        threading.Thread(target=threadFunction,args=('vm',))
    ]
    
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    
    for i in result:
        df_merge = pd.concat([df_merge,i], ignore_index=True)
        print(1)

    df_merge["CounterName"] = '5min Avg'
    df_merge = df_merge[["TimeGenerated", "ObjectName","CounterName", "HostingType", "ResourceId", "Status"]]
    print(df_merge.isnull().sum())
    print(len(df_merge[df_merge["ObjectName"]=='VM']))
    print(len(df_merge[df_merge["ObjectName"]=='Database']))
    
    print(len(df_merge))
    insertIntoADX(df_merge)
except Exception as ex:
    print(ex)
    if isinstance(ex.args[0], dict):
        insert_data(ex.args[0])
    else:
        info = exceptioninfo(ex)
        insert_data(info)