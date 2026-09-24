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

def insertIntoADX(df):
    
    while True:
        try:
            cluster = "https://ingest-telemetrycrcav2.westus2.kusto.windows.net"
            kcsb = KustoConnectionStringBuilder.with_azure_token_credential(cluster, credential)
            ingest_client = QueuedIngestClient(kcsb)
            break
        except:
            # credential = AzureCliCredential()
            credential = ManagedIdentityCredential(client_id='015ad614-f9a5-4333-83b4-b71c01c393d8')
    try:
        ingestion_properties = IngestionProperties(
            database=database,
            table=table,
            data_format=DataFormat.CSV,  # Specify the format of the data being ingested
            ingestion_mapping_reference="ServerMetricsPerfCsvMapping",  # Ensure you have an appropriate mapping defined
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
        
        KUSTO_QUERY = f"""set notruncation; Server_Metrics_Perf | summarize maxTime = max(TimeGenerated) """
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

def get_data():
    maxTime = getMaxTime()
    df = pd.DataFrame()
    workspaceId = '552b9630-b106-4fe7-a1fa-97d04a0010ef'
    currentTime = datetime.now(timezone.utc)
    
    floored_currentTime = currentTime.replace(
        minute=(currentTime.minute // 10) * 10,
        second=0,
        microsecond=0
    )
    if(maxTime=="" or pd.isna(maxTime)):
        startTime = floored_currentTime-timedelta(minutes=10)
    else:
        maxTime = maxTime+timedelta(minutes=10)
        startTime = maxTime.replace(
            minute=(maxTime.minute // 10) * 10,
            second=0,
            microsecond=0
        )
    while True:
        if(startTime>=floored_currentTime):
            break
        endTime = floored_currentTime if(startTime+timedelta(minutes=10)>floored_currentTime) else startTime+timedelta(minutes=10)
        print(startTime, endTime)
        query = f"""Perf
            | where ((ObjectName == "Processor" and CounterName == "% Processor Time" and InstanceName =~ "_Total") or (ObjectName == "Memory" and CounterName in ("% Committed Bytes In Use", "% Used Memory")) 
    or (ObjectName == "LogicalDisk" and CounterName in ("% Free Space") and InstanceName !in ("_Total") and InstanceName !startswith "HarddiskVolume" and InstanceName !contains "Program Files"))
                and _SubscriptionId in ("ab16a144-47d7-45c5-bcb7-8affc988f8e0", "9592c342-d1fb-477e-8e91-ad39bf00933b", "5467bf57-48b4-4930-b3cb-bf039b259d04", "343a7ee0-5081-4024-82fc-498ee61867a9", "6d590d81-bab9-4b9a-b011-090467b5a9a4", "accde124-a45f-47be-aefa-b09362b2c5fc", "a82a7c51-82fd-4bbc-a376-3cd8752a1675") 
                and TimeGenerated >= datetime({startTime}) and TimeGenerated < datetime({endTime})
            | extend resourceIdSpilt=split(_ResourceId, '/')
            | extend
                SubscriptionId=tolower(tostring(resourceIdSpilt[2])),
                ResourceGroup=tolower(tostring(resourceIdSpilt[4])),
                ServerName=tolower(tostring(resourceIdSpilt[8])),
                DnsDomain = strcat(tostring(split(Computer, '.')[1]), '.', tostring(split(Computer, '.')[2]), '.', tostring(split(Computer, '.')[3])), InstanceName = iff(tolower(ObjectName) contains "disk",InstanceName,'')
            | where (DnsDomain != '..' or ServerName contains 'patieapp')
            | summarize 
                AvgValue = round(avg(CounterValue)),
                MinValue = round(min(CounterValue)),
                MaxValue = round(max(CounterValue)),
                SampleCount = count()
                by
                SubscriptionId,
                ResourceGroup,
                ServerName,
                DnsDomain, 
                ObjectName, 
                CounterName,
                InstanceName,
                bin(TimeGenerated,10m)
            | project
                TimeGenerated,
                ObjectName, 
                CounterName,
                HostingType = iff(ResourceGroup contains "rg-azarc-compute-eng-westus2", "OnPremise", "Cloud"),
                SubscriptionId,
                ResourceGroup,
                ServerName,
                DriveName = InstanceName,
                AvgValue,
                MaxValue,
                MinValue """
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
# Threads
try:
    
    database = "crca_monitoring_telemetry"
    table = "Server_Metrics_Perf"
    # credential = AzureCliCredential()
    credential = ManagedIdentityCredential(client_id='015ad614-f9a5-4333-83b4-b71c01c393d8')

    df = get_data()
    df_apps = getServerList()

    df_cloud = df[df["HostingType"]=='Cloud']
    df_onPremise = df[df["HostingType"]=='OnPremise']

    df_cloud = df_cloud.merge(df_apps,on=["SubscriptionId", "ResourceGroup","ServerName", "HostingType"],how="inner")
    df_onPremise = df_onPremise.merge(df_apps[["HostingType","ServerName","ResourceId"]],on=["HostingType","ServerName"],how="inner")

    df_merge = pd.concat([df_cloud,df_onPremise], ignore_index=True)
    df_merge = df_merge[["TimeGenerated", "ObjectName", "CounterName", "HostingType", "ResourceId", "DriveName", "AvgValue","MaxValue","MinValue"]]
    insertIntoADX(df_merge)
except Exception as ex:
    print(ex)
    if isinstance(ex.args[0], dict):
        insert_data(ex.args[0])
    else:
        info = exceptioninfo(ex)
        insert_data(info)