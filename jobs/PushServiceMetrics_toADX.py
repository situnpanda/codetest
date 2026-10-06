import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "backend"
sys.path.append(str(root))

import os
import pandas as pd
import numpy as np
from shared.dataBase import connectToDw_AADpwd,connectToDw_AADpwd_Write,queryDw,insert_data,exceptioninfo
from datetime import datetime, timezone, timedelta
from azure.monitor.query import LogsQueryClient, LogsQueryStatus
from azure.identity import AzureCliCredential, ManagedIdentityCredential
from azure.core.exceptions import HttpResponseError
from azure.kusto.data import KustoClient, KustoConnectionStringBuilder, DataFormat
from azure.kusto.ingest import IngestionProperties, IngestionMappingKind, KustoStreamingIngestClient, QueuedIngestClient
from shared.logAnalytics import connectToLogAnlytics, queryInLogAnalytics
from azure.kusto.data.helpers import dataframe_from_result_table

def getMaxTime():
    try:
        cluster = "https://telemetrycrcav2.westus2.kusto.windows.net"
        kcsb = KustoConnectionStringBuilder.with_azure_token_credential(cluster, credential)
        read_client = KustoClient(kcsb)
        
        KUSTO_QUERY = f"""set notruncation; Windows_Service_Metrics | summarize maxTime = max(TimeGenerated) """
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

def insertIntoADX(df):
    cluster = "https://ingest-telemetrycrcav2.westus2.kusto.windows.net"
    
    # credential = AzureCliCredential()
    credential = ManagedIdentityCredential(client_id='015ad614-f9a5-4333-83b4-b71c01c393d8')
    while True:
        try:
            kcsb = KustoConnectionStringBuilder.with_azure_token_credential(cluster, credential)
            ingest_client = QueuedIngestClient(kcsb)
            break
        except:
            credential = ManagedIdentityCredential(client_id='015ad614-f9a5-4333-83b4-b71c01c393d8')
    try:
        ingestion_properties = IngestionProperties(
            database=database,
            table=table,
            data_format=DataFormat.CSV,  # Specify the format of the data being ingested
            ingestion_mapping_reference="WindowsServicesCsvMapping",  # Ensure you have an appropriate mapping defined
        )

        ingest_client.ingest_from_dataframe(df, ingestion_properties)
        print("Data ingestion initiated.")
    except Exception as ex:
        print("Exception")
        print(ex)
        info = exceptioninfo(ex)
        raise Exception(info)

def getServiceList():
    serverName = 'sqldb-azure-prod-012.database.windows.net'
    dBname = 'crcamonitoring'
    username = 'servCRCAMonitoring@providence.org'
    df_apps = pd.DataFrame()
    try:
        connectionString = connectToDw_AADpwd(serverName,dBname,username)
        try:
            sqlQuery = f""" Select lower(sl.[Subscription ID]), lower(sl.[Resource Group]), lower(sl.[Server Name]), wsl.[Resource Name], wsl.[Hosting Type], trim(lower(wsl.[Service Name])) from [Windows Services List] as wsl 
            inner join [Server List] as sl on lower(sl.[Resource Name]) like lower(wsl.[Resource Name])"""
            # where sl.[Last Updated] = (Select MAX([Last Updated]) from [Server List])
            print(sqlQuery)
            res = queryDw(connectionString, sqlQuery)
            
            df_apps = pd.DataFrame(np.array(res),columns=["SubscriptionId","ResourceGroup","ServerName", "ResourceId", "HostingType", "ServiceName"])
            return df_apps
        except Exception as Ex:
            info = exceptioninfo(Ex)
            raise Exception(info)
    except Exception as Ex:
        info = exceptioninfo(Ex)
        raise Exception(info)
        
def get_data(serverServicesName):
    maxTime = getMaxTime()
    df = pd.DataFrame()
    workspaceId = '552b9630-b106-4fe7-a1fa-97d04a0010ef'
    currentTime = datetime.now(timezone.utc)
    
    floored_currentTime = currentTime

    if(maxTime=="" or pd.isna(maxTime)):
        startTime = floored_currentTime-timedelta(minutes=2)
        startTime = "Dec 1 2025"
        startTime = datetime.strptime(startTime, "%b %d %Y").replace(tzinfo=timezone.utc)

    else:
        # maxTime = maxTime+timedelta(minutes=10)
        startTime = maxTime
    print(startTime, floored_currentTime)

    while True:
        if(startTime>=floored_currentTime):
            break
        endTime = floored_currentTime if(startTime+timedelta(minutes=60)>floored_currentTime) else startTime+timedelta(minutes=60)
        print(startTime, endTime)

        query = f"""ConfigurationData
                        | extend resourceIdSpilt=split(_ResourceId, '/')
                        | extend SubscriptionId=tostring(resourceIdSpilt[2]),
                            ResourceGroup=tostring(resourceIdSpilt[4]),
                            ServerName=tolower(tostring(resourceIdSpilt[8])),
                            ServiceName = iff(ConfigDataType == 'WindowsServices', tolower(SvcDisplayName), tolower(SvcName))
                        | extend ServerServiceMap = strcat(ServerName, "-", ServiceName)
                        | where TimeGenerated > datetime({startTime}) and TimeGenerated <= datetime({endTime}) and ConfigDataType in ('WindowsServices', 'Daemons')
                            and _SubscriptionId in ('ab16a144-47d7-45c5-bcb7-8affc988f8e0', '9592c342-d1fb-477e-8e91-ad39bf00933b', '5467bf57-48b4-4930-b3cb-bf039b259d04', '343a7ee0-5081-4024-82fc-498ee61867a9', '6d590d81-bab9-4b9a-b011-090467b5a9a4', 'accde124-a45f-47be-aefa-b09362b2c5fc',"a82a7c51-82fd-4bbc-a376-3cd8752a1675")
                            and ServerServiceMap in {tuple(serverServicesName)}
                        | summarize SvcState = make_list(SvcState) by SubscriptionId, ResourceGroup, ServerName, ServiceName, TimeGenerated
                        | extend SvcState = iff(set_has_element(SvcState, 'Running'), 'Running', SvcState[0])
                        | project SubscriptionId, ResourceGroup, ServerName, ServiceName, HostingType = iff(ResourceGroup contains "rg-azarc-compute-eng-westus2", "OnPremise", "Cloud"), Status=SvcState, TimeGenerated"""
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
    table = "Windows_Service_Metrics"
    # credential = AzureCliCredential()
    credential = ManagedIdentityCredential(client_id='015ad614-f9a5-4333-83b4-b71c01c393d8')

    df_apps = getServiceList()
    df_apps["ServerServices"] = df_apps.apply(
        lambda row : row["ServerName"].lower()+"-"+row["ServiceName"].lower(),
        axis=1
    )
    serverServicesName = list(df_apps["ServerServices"].to_list())
    df = get_data(serverServicesName)
    if(len(df)):
        df_cloud = df[df["HostingType"]=='Cloud'].copy()
        df_onPremise = df[df["HostingType"]=='OnPremise'].copy()
        # print(len(df_cloud),len(df_onPremise))
        df_cloud = df_cloud.merge(df_apps.drop_duplicates(),on=["SubscriptionId", "ResourceGroup","ServerName", "HostingType","ServiceName"],how="left")
        df_onPremise = df_onPremise.merge(df_apps[["HostingType","ServerName","ResourceId","ServiceName"]].drop_duplicates(),on=["HostingType","ServerName","ServiceName"],how="left")
        # print(len(df_cloud),len(df_onPremise))
        df_merge = pd.concat([df_cloud,df_onPremise], ignore_index=True)
        df_merge = df_merge[["TimeGenerated", "ResourceId","ServiceName","Status", "HostingType"]]
        # print(df_merge.isnull().sum())
        insertIntoADX(df_merge)
except Exception as ex:
    print(ex)
    if isinstance(ex.args[0], dict):
        insert_data(ex.args[0])
    else:
        info = exceptioninfo(ex)
        insert_data(info)