import requests , numpy , pyodbc, sys, os
import concurrent.futures
from azure.identity import ClientSecretCredential
from datetime import datetime, timezone
import pandas as pd
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))
from shared.dataBase import connectToDw_SqlServerPwd, connectToDw_AADpwd,queryDw,insert_data,exceptioninfo
from shared.keyVault import connectToKeyVault
from shared.adx import connectToADX, readFromADX
from azure.identity import DefaultAzureCredential, AzureCliCredential, ManagedIdentityCredential
from azure.kusto.data import KustoClient, KustoConnectionStringBuilder
from azure.kusto.data import KustoClient, KustoConnectionStringBuilder, DataFormat
from azure.kusto.ingest import IngestionProperties, IngestionMappingKind, KustoStreamingIngestClient, QueuedIngestClient
 
 
credential = None
 
def ingestDfToAdx(df, table):
    cluster = "https://ingest-telemetrycrcav2.westus2.kusto.windows.net"
    database = "crca_monitoring_telemetry"
 
    if df.empty:
        return
    try:
        credential = AzureCliCredential()
        kcsb = KustoConnectionStringBuilder.with_azure_token_credential(cluster, credential)

        ingest_client = QueuedIngestClient(kcsb)

        ingestion_props = IngestionProperties(
            database=database,
            table=table,
            data_format=DataFormat.CSV,
            ingestion_mapping_reference="ServerComplianceCsvMapping"
        )

        ingest_client.ingest_from_dataframe(df, ingestion_props)

        print(f"Ingestion queued for {len(df)} rows into ADX")
    except Exception as e:
        print(f"Error ingesting to ADX: {e}")
        info = exceptioninfo(e)
        insert_data(info)
 
 
def getExistingBackupDistinctFromAdxFor(resource_names):
    """
    Fetch distinct existing rows for Backup for only the provided ResourceNames.
    dedup against the entire history (within ADX retention), not just latest.
    """
    compare_columns = ["ResourceName", "ObjectName", "CounterName", "Value"]
 
    if not resource_names:
        return pd.DataFrame(columns=compare_columns)
 
    # Safely build a dynamic array of quoted resource names
    escaped = [rn.replace("\\", "\\\\").replace("\"", "\\\"") for rn in resource_names]
    targets = ",".join([f'"{e}"' for e in escaped])
 
    query = f"""
    let targets = dynamic([{targets}]);
    Resource_Compliance
    | where ObjectName == "Backup" and ResourceName in (targets)
    | project ResourceName, ObjectName, CounterName, Value
    | summarize by ResourceName, ObjectName, CounterName, Value
    """
 
    try:
        df = readFromADX(query)
        if df is None or df.empty:
            return pd.DataFrame(columns=compare_columns)
        return df[compare_columns]
    except Exception as e:
        print(f"Error reading existing backup rows from ADX: {e}")
        info = exceptioninfo(e)
        insert_data(info)
        return pd.DataFrame(columns=compare_columns)
 
 
def remove_existing_backup_rows(new_df, existing_df):
    # Removes rows from new_df that already exist in existing_df
 
    compare_columns = ["ResourceName","ObjectName","CounterName","Value",]
 
    if new_df.empty:
        return new_df
 
    if existing_df.empty:
        return new_df
 
    new_cmp = new_df[compare_columns].copy()
    existing_cmp = existing_df[compare_columns].copy()
 
    # Merge to find duplicates based on current latest values in ADX
    merged = new_cmp.merge(
        existing_cmp.drop_duplicates(),
        how="left",
        on=compare_columns,
        indicator=True
    )
 
    # Determine which rows are new vs already present
    mask_new = merged["_merge"] == "left_only"
 
    # Identify resources where EndTime is new in this batch
    is_endtime = new_df["CounterName"].astype(str) == "EndTime"
    mask_end_new = is_endtime & mask_new
    resources_with_new_end = set(new_df.loc[mask_end_new, "ResourceName"].astype(str))
 
    # keep rows that are new (mask_new)
    # For Status rows, keep only if there's a new EndTime for the same ResourceName in this batch
    is_status = new_df["CounterName"].astype(str) == "Status"
    has_new_end_for_resource = new_df["ResourceName"].astype(str).isin(resources_with_new_end)
    mask_keep_status = is_status & has_new_end_for_resource
 
    filtered_df = new_df.loc[mask_new | mask_keep_status].copy()
 
    # Deduplicate within the batch to avoid repeats
    filtered_df = filtered_df.drop_duplicates(subset=compare_columns).reset_index(drop=True)
 
    return filtered_df
 
 
 
def get_headers():
    try:
        token = credential.get_token("https://management.azure.com/.default").token
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    except Exception as e:
        print(f"Error acquiring Azure token: {e}")
        info = exceptioninfo(e)
        insert_data(info)
        raise
 
def iso_now():
    return datetime.now(timezone.utc).isoformat()
 
 
def get_all_backup_items(url, headers):
    #fetch all backup items
    items = []
   
    while url:
        try:
            resp = requests.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json()

            items.extend(data.get("value", []))

            #following nextLink if additional pages exist
            url = data.get("nextLink")
        except Exception as e:
            print(f"Error fetching backup items: {e}")
            info = exceptioninfo(e)
            insert_data(info)
            break
   
    return items
 
 
def get_backup_rows_for_sub(subscription_id, server_map):
   
    def normalize_status_for_storage(status):
        if status is None:
            return None
        s = str(status).strip()
        low = s.lower().replace(" ", "")
        # Preserve CompletedWithWarnings explicitly
        if "completedwithwarnings" in low:
            return "Completed With Warnings"
        # common final statuses
        if low in ("completed", "succeeded", "success"):
            return "Completed"
        if "failed" in low or "fail" in low:
            return "Failed"
        if "canceled" in low or "cancelled" in low or "cancel" in low:
            return "Canceled"
        return s
 
    headers = get_headers()
    rows = []
 
    vault_list_url = (
        f"https://management.azure.com/subscriptions/{subscription_id}"
        "/providers/Microsoft.RecoveryServices/vaults?api-version=2023-02-01"
    )
 
    try:
        vault_resp = requests.get(vault_list_url, headers=headers)
        vault_resp.raise_for_status()
        vaults = vault_resp.json().get("value", [])
    except Exception as e:
        print(f"Error listing vaults for subscription {subscription_id}: {e}")
        info = exceptioninfo(e)
        insert_data(info)
        return rows
    
    for vault in vaults:
 
        vault_name = vault["name"]
        rg_name = vault["id"].split("/resourceGroups/")[1].split("/")[0]
        
        backup_jobs_url = (
            f"https://management.azure.com/subscriptions/{subscription_id}"
            f"/resourceGroups/{rg_name}"
            f"/providers/Microsoft.RecoveryServices/vaults/{vault_name}"
            "/backupJobs?api-version=2023-02-01"
        )
 
        try:
            jobs = get_all_backup_items(backup_jobs_url, headers)
        except Exception as e:
            print(f"Error fetching backup jobs for vault {vault_name}: {e}")
            info = exceptioninfo(e)
            insert_data(info)
            jobs = []
 
        latest_backup_by_vm = {}
 
        for job in jobs:
            props = job.get("properties", {})
 
            if props.get("operation") != "Backup":
                continue
 
            vm_name = props.get("entityFriendlyName")
            start_time = props.get("startTime")
            end_time = props.get("endTime")
            status = props.get("status")
 
            if not vm_name or not start_time:
                continue
 
            vm_key = vm_name.lower()
 
            if (
                vm_key not in latest_backup_by_vm or
                start_time > latest_backup_by_vm[vm_key]["startTime"]
            ):
                latest_backup_by_vm[vm_key] = {
                    "startTime": start_time,
                    "endTime": end_time,
                    "status": status
                }
        
        for vm_key, backup in latest_backup_by_vm.items():
 
            if vm_key not in server_map:
                continue  # VM not present
 
            metadata_list = server_map[vm_key]
 
            for meta in metadata_list:
                try:
                    resource_name = build_resource_name(meta)

                    # Backup Start Time
                    rows.append({
                        "ResourceName": resource_name,
                        "ObjectName": "Backup",
                        "CounterName": "StartTime",
                        "Value": backup["startTime"]
                    })

                    # Backup End Time (may be None if running)
                    if backup.get("endTime"):
                        rows.append({
                            "ResourceName": resource_name,
                            "ObjectName": "Backup",
                            "CounterName": "EndTime",
                            "Value": backup["endTime"]
                        })
                        # Append final Status only when EndTime exists
                        rows.append({
                            "ResourceName": resource_name,
                            "ObjectName": "Backup",
                            "CounterName": "Status",
                            "Value": normalize_status_for_storage(backup["status"])
                        })
                except Exception as e:
                    print(f"Error building backup rows for VM {vm_key}: {e}")
                    info = exceptioninfo(e)
                    insert_data(info)
                    continue
 
    return rows
 
 
 
 
def load_server_metadata_from_db():
    try:
        connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net","crcamonitoring", "servCRCAMonitoring@providence.org")
        query = """SELECT[Resource Name],[Server Name],[Subscription ID],[Resource Group],[Hosting Type],[Application CI] FROM [Server List] WHERE [Last Updated] = (  SELECT MAX([Last Updated]) FROM [Server List]);"""
        rows = queryDw(connectToCrcaMonitoring, query)
    except Exception as e:
        print(f"Error loading server metadata from DB: {e}")
        info = exceptioninfo(e)
        insert_data(info)
        return {}, set()
    server_map = {}
    resource_name_set = set()
 
    for resourceName, serverName, subId, rg, hostingType, appCI in rows:
 
        # ResourceName set (used for FK validation)
        resource_name_set.add(resourceName.strip())
 
        key = serverName.strip()
 
        if key not in server_map:
            server_map[key] = []
 
        server_map[key].append({
            "resourceName": resourceName.strip(),
            "subscriptionId": subId.strip() if subId else "",
            "resourceGroup": rg.strip() if rg else "",
            "hostingType": hostingType.strip(),
            "applicationCI": appCI.strip(),
            "serverName": serverName.strip()
        })
 
    return server_map, resource_name_set
 
 
def build_resource_name(meta):
   
    serverName = meta["serverName"]
 
    if meta["hostingType"].lower() == "onpremise":
        # On-prem format (NO subscription, NO RG)
        return (
            f"ServerName/{serverName}/"
            f"ApplicationCI/{meta['applicationCI']}"
        )
 
    # Cloud format (Azure VM)
    return (
        f"SubscriptionID/{meta['subscriptionId']}/"
        f"ResourceGroup/{meta['resourceGroup']}/"
        f"ServerName/{serverName}/"
        f"ApplicationCI/{meta['applicationCI']}"
    )
 
 
def serverBackupData():
    print("StartTime:" + str(datetime.now()))
    server_map, resource_name_set = load_server_metadata_from_db()
 
    subscriptions = ['6d590d81-bab9-4b9a-b011-090467b5a9a4','5467bf57-48b4-4930-b3cb-bf039b259d04','ab16a144-47d7-45c5-bcb7-8affc988f8e0','343a7ee0-5081-4024-82fc-498ee61867a9','9592c342-d1fb-477e-8e91-ad39bf00933b']
 
    all_rows = []
 
    def process_subscription(sub):
        backup_rows = get_backup_rows_for_sub(sub, server_map)
        return backup_rows
 
    max_workers = 5
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        try:
            future_map = {
                executor.submit(process_subscription, sub): sub
                for sub in subscriptions
            }

            for future in concurrent.futures.as_completed(future_map):
                sub = future_map[future]
                try:
                    rows = future.result()
                    all_rows.extend(rows)
                except Exception as e:
                    print(f"Error processing subscription {sub}: {e}")
                    info = exceptioninfo(e)
                    insert_data(info)
        except Exception as e:
            print(f"Executor error: {e}")
            info = exceptioninfo(e)
            insert_data(info)
 
    # Create DataFrame from all_rows
    if all_rows:
        df = pd.DataFrame(all_rows, columns=["ResourceName", "ObjectName", "CounterName", "Value"])
    else:
        df = pd.DataFrame(columns=["ResourceName", "ObjectName", "CounterName", "Value"])
 
    # Fetch existing distinct rows in ADX for only the ResourceNames in this batch
    resource_names = df["ResourceName"].dropna().astype(str).unique().tolist()
    try:
        existing_df = getExistingBackupDistinctFromAdxFor(resource_names)
    except Exception as e:
        print(f"Error retrieving existing backup rows from ADX: {e}")
        info = exceptioninfo(e)
        insert_data(info)
        existing_df = pd.DataFrame(columns=["ResourceName","ObjectName","CounterName","Value"]) 

    try:
        df = remove_existing_backup_rows(df, existing_df)
    except Exception as e:
        print(f"Error removing existing backup rows: {e}")
        info = exceptioninfo(e)
        insert_data(info)

    if df.empty:
        #print("No new or changed rows to ingest.")
        return
 
    LastUpdated = datetime.now(timezone.utc)
    df["LastUpdated"] = LastUpdated
    # New column mirroring LastUpdated for Azure Monitor-style conventions
    df["TimeGenerated"] = df["LastUpdated"]
    
    try:
        ingestDfToAdx(df, "Resource_Compliance")
    except Exception as e:
        print(f"Error ingesting backup DF to ADX: {e}")
        info = exceptioninfo(e)
        insert_data(info)
    print("EndTime:" + str(datetime.now()))
 
 
if __name__ == "__main__":
 
    try:
        tenant_id = connectToKeyVault("tenantIdSpn")
        client_id = connectToKeyVault("clientIdSpn")
        client_secret = connectToKeyVault("clientSecretSpn")

        credential = ClientSecretCredential( tenant_id=tenant_id, client_id=client_id, client_secret=client_secret)

        serverBackupData()
    except Exception as e:
        print(f"Fatal error running serverBackupData: {e}")
        info = exceptioninfo(e)
        insert_data(info)