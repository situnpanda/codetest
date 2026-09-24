import sys
from pathlib import Path

# Add the parent of 'parent_folder' to sys.path
root = Path(__file__).resolve().parents[1] / "backend"
sys.path.append(str(root))

import json 
from datetime import datetime
from shared.keyVault import connectToKeyVault
from shared.dataBase import insertDw, connectToDw_AADpwd_Write, queryDw
from azure.identity import ClientSecretCredential
from azure.mgmt.storage import StorageManagementClient
from datetime import datetime
from azure.identity import ManagedIdentityCredential
from azure.mgmt.sql import SqlManagementClient
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
import pandas as pd
from datetime import datetime
import pytz
import numpy as np

def get_storage_account_key(subscription_id, resource_group_name, account_name, credential):
    storage_client = StorageManagementClient(credential, subscription_id)
    
    keys = storage_client.storage_accounts.list_keys(resource_group_name, account_name)
    account_key = keys.keys[0].value  
    
    return account_key

def fetch_databases(resource_group_name, server_name, sql_management_client):
    try:
        databases = sql_management_client.databases.list_by_server(resource_group_name, server_name)
        a = []
        for db in databases:
            a.append(db.name)
        return a
    except Exception as e:
        print(f"Error fetching database: {e}")
        return []

def process_sqlServerName(subscription_id, sqlServer, credential):
    results = []
    
    sqlServerName = sqlServer.name
    resource_group_name = sqlServer.id.split('/')[4]

    sql_management_client = SqlManagementClient(credential, subscription_id)
    sqlServers = fetch_databases(resource_group_name, sqlServerName, sql_management_client)
    if not sqlServers:
        print(f"No Database found for {sqlServerName}.")
        return results

    for database in sqlServers:
        appCI = sqlServer.tags["applicationCI"]
        supportGroup = sqlServer.tags["supportGroup"]
        hostingType = "Cloud"
        results.append({
            "Resource Name" : "SubscriptionID/"+subscription_id+"/ResourceGroup/"+resource_group_name+"/SqlServerName/"+sqlServerName+"/DatabaseName/"+database+"/ApplicationCI/"+appCI if hostingType=="Cloud" else "SqlServerName/"+sqlServerName+"/DatabaseName/"+database+"/ApplicationCI/"+appCI,
            "Database Name": database,
            "Sql Server Name": sqlServerName,
            "Subscription ID": subscription_id,
            "Application CI": appCI,
            "Resource Group":resource_group_name,
            "Hosting Type": hostingType
        })

    return results


def process_storage_accounts(data, credential):
    all_data = []

    with ThreadPoolExecutor() as executor:
        futures = []

        for resource in data:
            subscription_id = resource.get("subscriptionId")
            # storage_client = StorageManagementClient(credential, subscription_id)
            sql_management_client = SqlManagementClient(credential, subscription_id)
            # List storage accounts
            print(f"Listing sql servers in subscription {subscription_id}:\n")
            for sqlServer in sql_management_client.servers.list():
                futures.append(
                    executor.submit(process_sqlServerName, subscription_id, sqlServer, credential)
                )

        # Collect results as they complete
        for future in as_completed(futures):
            try:
                result = future.result()
                if result:
                    all_data.extend(result)
            except Exception as e:
                print(f"Error processing Sql Servers: {e}")

    # Create a DataFrame from the collected data
    df = pd.DataFrame(all_data)
    pst = pytz.timezone('America/Los_Angeles')

    current_time = datetime.now(pst)

    formatted_time = current_time.strftime("%Y-%m-%d %I:%M:%S %p")

    df['Last Updated'] = formatted_time
    df["Application CI_lower"] = df["Application CI"].str.lower()
    # Print the DataFrame
    print(len(df))
    connectionString = connectToDw_AADpwd_Write("sqldb-azure-prod-012.database.windows.net","crcamonitoring","servCRCAMonitoring@providence.org")
    sqlQuery = f""" Select distinct lower([Application CI]) from [Application List] where [Last Updated] = (Select max([Last Updated]) from [Application List])"""
    val = queryDw(connectionString, sqlQuery)
    df_appCI = pd.DataFrame(np.array(val), columns=["Application CI_lower"])
    df = df.merge(df_appCI, on="Application CI_lower", how="inner").drop(columns={"Application CI_lower"})
    print(len(df), df.columns)

    if not df.empty:
        try:
            required_columns = [
                "Resource Name", "Sql Server Name", "Database Name", "Subscription ID", "Resource Group", "Application CI", "Hosting Type", "Last Updated"
            ]
            insert_query = """
                MERGE INTO [Database List] AS target
                USING (SELECT ? as [Resource Name], ? AS [Sql Server Name], ? AS [Database Name], ? AS [Subscription ID], ? AS [Resource Group], ? AS [Application CI], ? AS [Hosting Type], ? AS [Last Updated]) AS source
                ON lower(target.[Resource Name]) like lower(source.[Resource Name])
                WHEN MATCHED THEN
                    UPDATE SET target.[Application CI] = source.[Application CI], target.[Last Updated] = source.[Last Updated]
                WHEN NOT MATCHED THEN
                    INSERT ([Resource Name], [Database Name], [Sql Server Name], [Subscription ID], [Application CI], [Resource Group], [Hosting Type], [Last Updated]) 
                    VALUES 
                    (source.[Resource Name], source.[Database Name], source.[Sql Server Name], source.[Subscription ID], source.[Application CI], source.[Resource Group], source.[Hosting Type], source.[Last Updated]);
            """
            print(insert_query)
            data = []
            for ind,row in df.iterrows():
                a = []
                for col in required_columns:
                    a.append(row[col])
                
                data.append(tuple(a))
            print(data[0],len(data))
            
            res = insertDw(connectionString,insert_query,data)
            print(res)
        except Exception as e:
            print(f"Error inserting data into SQL Server: {e}")
    else:
        print("No data to insert.")
    
    return df

if __name__ == "__main__":
    try:
        data = [
            {"subscriptionId" : "ab16a144-47d7-45c5-bcb7-8affc988f8e0"},
            {"subscriptionId" : "9592c342-d1fb-477e-8e91-ad39bf00933b"},
            {"subscriptionId" : "5467bf57-48b4-4930-b3cb-bf039b259d04"},
            {"subscriptionId" : "343a7ee0-5081-4024-82fc-498ee61867a9"},
            {"subscriptionId" : "6d590d81-bab9-4b9a-b011-090467b5a9a4"}
        ]
        #   ('ab16a144-47d7-45c5-bcb7-8affc988f8e0', '9592c342-d1fb-477e-8e91-ad39bf00933b', 
        #    '5467bf57-48b4-4930-b3cb-bf039b259d04', '343a7ee0-5081-4024-82fc-498ee61867a9', '6d590d81-bab9-4b9a-b011-090467b5a9a4')
        print("Loaded data.json successfully.")
        
        tenant_id = "2e319086-9a26-46a3-865f-615bed576786"  
        client_id = "e2ff3825-261b-418f-9878-c1c031c4cd2a"  
        client_secret = connectToKeyVault("autoServPrin")  

        credential = ClientSecretCredential(tenant_id, client_id, client_secret)
        
        process_storage_accounts(data, credential)
    except FileNotFoundError:
        print("data.json file not found.")
    except json.JSONDecodeError:
        print("Error decoding JSON. Please check the file format.")
    except Exception as e:
        print(f"Error: {e}")

