import sys
from pathlib import Path

# Add the parent of 'parent_folder' to sys.path
root = Path(__file__).resolve().parents[1] / "backend"
sys.path.append(str(root))

import pandas as pd
import numpy as np
from shared.dataBase import connectToDw_AADpwd,queryDw,insert_data,exceptioninfo
from datetime import datetime, timezone, timedelta
from azure.identity import AzureCliCredential, ManagedIdentityCredential
from azure.kusto.data import KustoClient, KustoConnectionStringBuilder, DataFormat
from azure.kusto.ingest import IngestionProperties, QueuedIngestClient
from azure.kusto.data.helpers import dataframe_from_result_table
from azure.mgmt.storage import StorageManagementClient
from azure.storage.fileshare import ShareServiceClient
import threading
from azure.identity import ClientSecretCredential
from shared.keyVault import connectToKeyVault


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
            ingestion_mapping_reference="FileStorageMetricsPerfCsvMapping",  # Ensure you have an appropriate mapping defined
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
        
        KUSTO_QUERY = f"""set notruncation; FileStorage_Metrics_Perf | summarize maxTime = max(TimeGenerated) """
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

def getFileshareList():
    serverName = 'sqldb-azure-prod-012.database.windows.net'
    dBname = 'crcamonitoring'
    username = 'servCRCAMonitoring@providence.org'
    df_apps = pd.DataFrame()
    try:
        connectionString = connectToDw_AADpwd(serverName,dBname,username)
        try:
            sqlQuery = f""" Select lower([Subscription ID]), lower([Resource Group]), lower([Storage Name]), lower([Fileshare Name]), [Resource Name], [Hosting Type] from [File Storage List] where [Last Updated] = (Select MAX([Last Updated]) from [File Storage List])"""
            res = queryDw(connectionString, sqlQuery)
            df_apps = pd.DataFrame(np.array(res),columns=["SubscriptionId","ResourceGroup","StorageName", "FileshareName", "ResourceId", "HostingType"])
            return df_apps
        except Exception as Ex:
            info = exceptioninfo(Ex)
            raise Exception(info) 
    except Exception as Ex:
        info = exceptioninfo(Ex)
        raise Exception(info)  

def threadFunction(df_apps,currentTime):
    for ind,row in df_apps.iterrows():
        try:
            tenant_id = "2e319086-9a26-46a3-865f-615bed576786"  
            client_id = "e2ff3825-261b-418f-9878-c1c031c4cd2a"  
            client_secret = connectToKeyVault("autoServPrin")  

            credential = ClientSecretCredential(tenant_id, client_id, client_secret)
            # credential = ManagedIdentityCredential(client_id='015ad614-f9a5-4333-83b4-b71c01c393d8')
            storage_client = StorageManagementClient(credential, row["SubscriptionId"])
            
            share = storage_client.file_shares.get(row["ResourceGroup"], row["StorageName"], row["FileshareName"], expand="stats")
            print(row["StorageName"], row["FileshareName"])
            # Depending on SDK version, utilization may be exposed as:
            used_bytes = getattr(share, "share_usage_bytes", None) or getattr(share, "shareUsageBytes", None)
            used_bytes = 0 if used_bytes==None else used_bytes
            used_gib = round(used_bytes / (1024**3))

            data["TimeGenerated"].append(currentTime)
            data["ResourceId"].append(row["ResourceId"])
            data["ObjectName"].append("Storage")
            data["CounterName"].append("In GiB")
            data["HostingType"].append("Cloud")
            data["UtilizedValue_inGiB"].append(used_gib)
        except Exception as Ex:
            print(row["StorageName"], row["FileshareName"])
            print(Ex)
            print()

def get_data(df_apps):
    # maxTime = getMaxTime()
    df = pd.DataFrame()
    
    currentTime = datetime.now(timezone.utc)
    currentTime = currentTime.replace(
        minute=(currentTime.minute // 10) * 10,
        second=0,
        microsecond=0
    )
    
    thread = []
    count = len(df_apps)//4
    for i in range(4):
        st = i*count
        en = i*count + count if i!=3 else len(df_apps)
        thread.append(threading.Thread(target=threadFunction, args=(df_apps[st:en],currentTime)))
    
    for i in thread:
        i.start()

    for i in thread:
        i.join()

    print(len(df_apps))
    
    df = pd.DataFrame(data)
    
    return df
# Threads
try:
    
    database = "crca_monitoring_telemetry"
    table = "FileStorage_Metrics_Perf"
    # credential = AzureCliCredential()
    credential = ManagedIdentityCredential(client_id='015ad614-f9a5-4333-83b4-b71c01c393d8')
    data = {
        "TimeGenerated" : [],
        "ResourceId" : [],
        "ObjectName" : [],
        "CounterName" : [],
        "HostingType" : [],
        "UtilizedValue_inGiB" : []
    }

    df_apps = getFileshareList()
    df = get_data(df_apps)

    df_merge = df[["TimeGenerated", "ObjectName", "CounterName", "HostingType", "ResourceId", "UtilizedValue_inGiB"]]
    insertIntoADX(df_merge)
except Exception as ex:
    print(ex)
    if isinstance(ex.args[0], dict):
        insert_data(ex.args[0])
    else:
        info = exceptioninfo(ex)
        insert_data(info)