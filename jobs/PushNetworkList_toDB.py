import sys
import asyncio
import pandas as pd
import numpy as np
from datetime import datetime, timezone
from azure.identity import ClientSecretCredential
from azure.mgmt.resource import ResourceManagementClient
from azure.mgmt.compute import ComputeManagementClient
from azure.mgmt.network import NetworkManagementClient
from database import connectToKeyVault, connectToDw_AADpwd_Write, queryDw, insert_data, exceptioninfo

SUBSCRIPTIONS = [
    "ab16a144-47d7-45c5-bcb7-8affc988f8e0",
    "9592c342-d1fb-477e-8e91-ad39bf00933b",
    "5467bf57-48b4-4930-b3cb-bf039b259d04",
    "343a7ee0-5081-4024-82fc-498ee61867a9",
    "6d590d81-bab9-4b9a-b011-090467b5a9a4",
    "accde124-a45f-47be-aefa-b09362b2c5fc",
    "a82a7c51-82fd-4bbc-a376-3cd8752a1675"
 
]

def get_credential():
    tenant_id = "2e319086-9a26-46a3-865f-615bed576786"
    client_id = "e2ff3825-261b-418f-9878-c1c031c4cd2a"
    client_secret = connectToKeyVault("autoServPrin")
    return ClientSecretCredential(tenant_id, client_id, client_secret)

async def fetch_subscription_resources(credential, sub, last_updated_at):
    resources = []
    
    try:
        print(f"scanning subscription: {sub}")
        network = NetworkManagementClient(credential, sub)
        res = ResourceManagementClient(credential, sub)
        
        for rg in res.resource_groups.list():
            rg_name = rg.name
            
            for nic in network.network_interfaces.list(rg_name):
                server_name = None
                if nic.virtual_machine and nic.virtual_machine.id:
                    vm_id_parts = nic.virtual_machine.id.split("/")
                    server_name = vm_id_parts[-1] if vm_id_parts else None
                
                if not server_name:
                    continue
                
                formatted_resource_name = f"SubscriptionID/{sub}/ResourceGroup/{rg_name}/ServerName/{server_name}"
                formatted_nic_name = f"SubscriptionID/{sub}/ResourceGroup/{rg_name}/ServerNic/{nic.name}"
                
                resources.append({
                    "ResourceName": formatted_resource_name,
                    "NicName": formatted_nic_name,
                    "LastUpdatedAt": last_updated_at
                })
        
        print(f"subscription {sub}: found {len(resources)} NICs")
    except Exception as e:
        print(f"error scanning subscription {sub}: {e}")
    
    return resources

def get_all_resources(credential):
    last_updated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    
    async def fetch_all():
        tasks = [fetch_subscription_resources(credential, sub, last_updated_at) for sub in SUBSCRIPTIONS]
        results = await asyncio.gather(*tasks)
        return results
    
    results = asyncio.run(fetch_all())
    
    all_resources = []
    for resources in results:
        all_resources.extend(resources)
    
    print(f"total found: {len(all_resources)} resources")
    return pd.DataFrame(all_resources)

def insert_to_sql(df):
    serverName = 'sqldb-azure-prod-012.database.windows.net'
    dBname = 'crcamonitoring'
    username = 'servCRCAMonitoring@providence.org'
    
    try:
        connectionString = connectToDw_AADpwd_Write(serverName, dBname, username)
        
        import pyodbc
        
        with pyodbc.connect(connectionString) as conn:
            with conn.cursor() as cursor:
                merge_query = """
                    MERGE INTO [dbo].[NetworkList] AS target
                    USING (SELECT ? AS [ResourceName], ? AS [NicName], ? AS [LastUpdatedAt]) AS source
                    ON LOWER(target.[ResourceName]) = LOWER(source.[ResourceName]) 
                       AND LOWER(target.[NicName]) = LOWER(source.[NicName])
                    WHEN MATCHED THEN
                        UPDATE SET target.[LastUpdatedAt] = source.[LastUpdatedAt]
                    WHEN NOT MATCHED THEN
                        INSERT ([ResourceName], [NicName], [LastUpdatedAt]) 
                        VALUES (source.[ResourceName], source.[NicName], source.[LastUpdatedAt]);
                """
                
                data = [
                    (row["ResourceName"], row["NicName"], row["LastUpdatedAt"])
                    for _, row in df.iterrows()
                ]
                
                print(f"merging {len(data)} records...")
                cursor.fast_executemany = True
                cursor.executemany(merge_query, data)
                
                conn.commit()
                print(f"merge completed successfully: {cursor.rowcount} rows affected")
        
    except Exception as ex:
        info = exceptioninfo(ex)
        raise Exception(info)

try:
    print("starting resource fetch...")
    credential = get_credential()
    df = get_all_resources(credential)
    
    if not df.empty:
        insert_to_sql(df)
        print("completed successfully")
    else:
        print("no resources found")
        
except Exception as ex:
    print(ex)
    if isinstance(ex.args[0], dict):
        insert_data(ex.args[0], pd.DataFrame(), "")
    else:
        info = exceptioninfo(ex)
        insert_data(info, pd.DataFrame(), "")
