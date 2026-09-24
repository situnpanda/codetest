import sys
from pathlib import Path

# Add the parent of 'parent_folder' to sys.path
root = Path(__file__).resolve().parents[1] / "backend"
sys.path.append(str(root))

import json
from datetime import datetime
from shared.keyVault import connectToKeyVault
from shared.dataBase import queryDw, connectToDw_AADpwd_Write, insertDw
import numpy as np
from azure.identity import ClientSecretCredential
from azure.mgmt.resource import ResourceManagementClient
from azure.mgmt.storage import StorageManagementClient
from datetime import datetime
from azure.identity import ManagedIdentityCredential, AzureCliCredential
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
import pandas as pd
from datetime import datetime
import pytz
import threading

def process_storage_account(subscription_id, credential, all_data):
    """Process a single storage account to fetch file shares and calculate metrics."""
    results = []
    
    resource_client = ResourceManagementClient(credential, subscription_id)
    storage_client = StorageManagementClient(credential, subscription_id)
    hostingType = "Cloud"
    appCI = ""
    
    for rg in resource_client.resource_groups.list():
        resource_group_name = rg.name
        if rg.tags and "applicationCI" in rg.tags:
            appCI = rg.tags.get('applicationCI')
        
        storage_accounts = storage_client.storage_accounts.list_by_resource_group(resource_group_name)
        storage_accounts = list(storage_accounts)
        
        for account in storage_accounts:
            storage_account_name = account.name
            
            file_shares = storage_client.file_shares.list(resource_group_name, storage_account_name)
            file_shares = list(file_shares)
            
            for share in file_shares:
                # print(share)
                results.append({
                    "Resource Name" : "SubscriptionID/"+subscription_id+"/ResourceGroup/"+resource_group_name+"/StorageName/"+storage_account_name+"/FileshareName/"+share.name+"/ApplicationCI/"+appCI if hostingType=="Cloud" else "Storage/"+storage_account_name+"/Fileshare/"+share.name+"/ApplicationCI/"+appCI,
                    "Fileshare Name": share.name,
                    "Storage Name": storage_account_name,
                    "Provisioned Capacity in GB": share.share_quota,
                    "Subscription ID": subscription_id,
                    "Application CI": appCI,
                    "Hosting Type" : hostingType,
                    "Resource Group":resource_group_name
                })
    # print(results[0])
    all_data.extend(results)
    # return results

def process_storage_accounts(data, credential):

    all_data = []
    threads = []
    
    for resource in data:
        subscription_id = resource.get("subscriptionId")
        print(f"Subscription ID: {subscription_id}")
        threads.append(threading.Thread(target = process_storage_account, args = (subscription_id, credential, all_data)))
        
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    # Create a DataFrame from the collected data
    df = pd.DataFrame(all_data)
    pst = pytz.timezone('America/Los_Angeles')

    current_time = datetime.now(pst)

    formatted_time = current_time.strftime("%Y-%m-%d %I:%M:%S %p")

    df['Last Updated'] = formatted_time
    df["Application CI_lower"] = df["Application CI"].str.lower()
    print(len(df))
    connectionString = connectToDw_AADpwd_Write("sqldb-azure-prod-012.database.windows.net","crcamonitoring","servCRCAMonitoring@providence.org")
    sqlQuery = f""" Select distinct lower([Application CI]) from [Application List] where [Last Updated] = (Select max([Last Updated]) from [Application List])"""
    val = queryDw(connectionString, sqlQuery)
    df_appCI = pd.DataFrame(np.array(val), columns=["Application CI_lower"])
    df = df.merge(df_appCI, on="Application CI_lower", how="inner").drop(columns={"Application CI_lower"})
    print(len(df), df.columns)
    # print(df.head())
    
    if not df.empty:
        try:
            required_columns = [
                "Resource Name", "Storage Name", "Fileshare Name", "Subscription ID", "Resource Group", "Application CI", "Hosting Type", "Last Updated", "Provisioned Capacity in GB"
            ]
            insert_query = """
                MERGE INTO [File Storage List] AS target
                USING (SELECT ? as [Resource Name], ? AS [Storage Name], ? AS [Fileshare Name], ? AS [Subscription ID], ? AS [Resource Group], ? AS [Application CI], ? AS [Hosting Type], ? AS [Last Updated], ? AS [Provisioned Capacity in GB]) AS source
                ON lower(target.[Resource Name]) like lower(source.[Resource Name])
                WHEN MATCHED THEN
                    UPDATE SET target.[Application CI] = source.[Application CI], target.[Last Updated] = source.[Last Updated], target.[Provisioned Capacity in GB] = source.[Provisioned Capacity in GB]
                WHEN NOT MATCHED THEN
                    INSERT ([Resource Name], [Storage Name], [Fileshare Name], [Subscription ID], [Application CI], [Resource Group], [Hosting Type], [Last Updated], [Provisioned Capacity in GB]) 
                    VALUES 
                    (source.[Resource Name], source.[Storage Name], source.[Fileshare Name], source.[Subscription ID], source.[Application CI], source.[Resource Group], source.[Hosting Type], source.[Last Updated], source.[Provisioned Capacity in GB]);
            """
            data = []
            for ind, row in df.iterrows():
                a = []
                for col in required_columns:
                    a.append(row[col])
                data.append(tuple(a))
            print(data[0])
            connectionString = connectToDw_AADpwd_Write("sqldb-azure-prod-012.database.windows.net","crcamonitoring","servCRCAMonitoring@providence.org")
            # print("Here")
            res = insertDw(connectionString,insert_query,data)
            print(res)
        except Exception as e:
            print(f"Error inserting data into SQL Server: {e}")
    else:
        print("No data to insert.")
    return df

if __name__ == "__main__":
    try:
        
        # Authenticate using a Service Principal
        tenant_id = "2e319086-9a26-46a3-865f-615bed576786"  
        client_id = "e2ff3825-261b-418f-9878-c1c031c4cd2a"  
        client_secret = connectToKeyVault("autoServPrin")  

        # Create the credential for Service Principal authentication
        credential = ClientSecretCredential(tenant_id, client_id, client_secret)
        
        data = [
            {"subscriptionId" : "ab16a144-47d7-45c5-bcb7-8affc988f8e0"},
            {"subscriptionId" : "9592c342-d1fb-477e-8e91-ad39bf00933b"},
            {"subscriptionId" : "5467bf57-48b4-4930-b3cb-bf039b259d04"},
            {"subscriptionId" : "343a7ee0-5081-4024-82fc-498ee61867a9"},
            {"subscriptionId" : "6d590d81-bab9-4b9a-b011-090467b5a9a4"}
        ]
        process_storage_accounts(data, credential)
    except FileNotFoundError:
        print("data.json file not found.")
    except json.JSONDecodeError:
        print("Error decoding JSON. Please check the file format.")
    except Exception as e:
        print(f"Error: {e}")

