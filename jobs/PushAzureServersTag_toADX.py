import requests , numpy , pyodbc, json, sys, os
import concurrent.futures
from azure.identity import ClientSecretCredential
from datetime import datetime, timezone
import pandas as pd
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))
from shared.dataBase import connectToDw, connectToDw_AADpwd, connectToDw_AADpwd_Write,queryDw,connectToDw_SqlServerPwd,exceptioninfo,insert_data
from shared.filters import filtersData
from shared.keyVault import connectToKeyVault
from shared.ADX import connectToADX, readFromADX
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


def kql_escape(value: str) -> str:
    if value is None:
        return ""
    return (
        str(value)
        .replace("\\", "\\\\")   # escape backslash
        .replace('"', '\\"')    # escape double quotes
        .replace("\n", " ")
        .replace("\r", " ")
        .replace("\t", " ")
    )

def getLatestTagFromAdx():
    query = """
    Resource_Compliance
    | where ObjectName == "Tag"
    | summarize arg_max(LastUpdated, *) by ResourceName
    | project ResourceName, Value
    """
    try:
        df = readFromADX(query)
        return df
    except Exception as e:
        print(f"Error reading latest tags from ADX: {e}")
        info = exceptioninfo(e)
        insert_data(info)
        return pd.DataFrame(columns=["ResourceName", "Value"])



def diff_tags(new_df, existing_df):

    if existing_df.empty:
        return new_df.reset_index(drop=True), new_df["ResourceName"].tolist(), []

    merged = new_df.merge(
        existing_df,
        on="ResourceName",
        how="left",
        suffixes=("_new", "_old"),
        indicator=True
    )

    # New VM rows
    new_rows = merged["_merge"] == "left_only"

    # Changed tag rows
    changed_rows = (
        (merged["_merge"] == "both") &
        (merged["Value_new"] != merged["Value_old"])
    )

    to_upsert = merged[new_rows | changed_rows].copy()

    new_vm_names = to_upsert.loc[new_rows, "ResourceName"].tolist()
    changed_vm_names = to_upsert.loc[changed_rows, "ResourceName"].tolist()

    final_df = to_upsert[[
        "ResourceName",
        "ObjectName",
        "CounterName",
        "Value_new"
    ]].rename(columns={"Value_new": "Value"})

    return final_df.reset_index(drop=True), new_vm_names, changed_vm_names



def chunk_list(lst, size):
    for i in range(0, len(lst), size):
        yield lst[i:i + size]


def update_tags_in_adx(df_to_update, batch_size=150):
    if df_to_update.empty:
        return
    try:
        client = connectToADX("https://telemetrycrcav2.westus2.kusto.windows.net")
    except Exception as e:
        print(f"Error connecting to ADX: {e}")
        info = exceptioninfo(e)
        insert_data(info)
        return

    for batch_df in chunk_list(df_to_update, batch_size):

        resource_names = batch_df["ResourceName"].unique().tolist()

        resource_list = ",".join([
            f'"{kql_escape(r)}"' for r in resource_names
        ])

        # Build datatable rows (NO parentheses!)
        rows = []
        for _, r in batch_df.iterrows():
            dt = r["LastUpdated"].strftime("%Y-%m-%dT%H:%M:%S.%fZ")
            tg = dt  # TimeGenerated mirrors LastUpdated
            rows.append(
                f'"{kql_escape(r.ResourceName)}", '
                f'"{kql_escape(r.ObjectName)}", '
                f'"{kql_escape(r.CounterName)}", '
                f'"{kql_escape(r.Value)}", '
                f'datetime("{dt}"), '
                f'datetime("{tg}")'
            )

        datatable_rows = ",\n".join(rows)

        kql = f"""
            .set-or-replace Resource_Compliance <|
            let Updated =
                datatable(ResourceName:string, ObjectName:string, CounterName:string, Value:string, LastUpdated:datetime, TimeGenerated:datetime)
                [
                    {datatable_rows}
                ];

            Resource_Compliance
            | where not(ObjectName == "Tag" and ResourceName in ({resource_list}))
            | union Updated
        """

        try:
            print(f"Upserting {len(batch_df)} rows in ADX...")
            client.execute_mgmt("crca_monitoring_telemetry", kql)
        except Exception as e:
            print(f"Error executing ADX upsert: {e}")
            info = exceptioninfo(e)
            insert_data(info)

    print("ADX upsert completed.")


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


def get_all_vms(subscription_id):
    headers = get_headers()

    url = (
        f"https://management.azure.com/subscriptions/{subscription_id}"
        "/providers/Microsoft.Compute/virtualMachines?api-version=2023-03-01"
    )

    vms = []
    
    while url:
        try:
            resp = requests.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json()

            vms.extend(data.get("value", []))

            #following nextLink for next page
            url = data.get("nextLink")
        except Exception as e:
            print(f"Error fetching VMs for sub {subscription_id}: {e}")
            info = exceptioninfo(e)
            insert_data(info)
            break

    return vms



def get_maintenance_rows_for_sub(subscription_id, server_map):
    rows = []
    try:
        az_vms = get_all_vms(subscription_id)
    except Exception as e:
        # get_all_vms already logs, but keep safeguard
        print(f"Error in get_all_vms for sub {subscription_id}: {e}")
        info = exceptioninfo(e)
        insert_data(info)
        return rows

    vm_lookup = {}
    for vm in az_vms:
        name = vm["name"].lower()
        vm_lookup[name] = vm

    servers = []
    for srv, metas in server_map.items():
        matched = [m for m in metas if m["subscriptionId"].lower() == subscription_id.lower()]
        if matched:
            servers.append((srv, matched))

    for serverName, meta_list in servers:

        server_key = serverName.lower()

        if server_key not in vm_lookup:
            # Not an Azure VM (on-premise or naming mismatch)
            continue

        vm = vm_lookup[server_key]
        try:
            tags = vm.get("tags", {})
            tags_json = json.dumps(tags, sort_keys=True)
        except Exception as e:
            print(f"Error serializing tags for VM {server_key}: {e}")
            info = exceptioninfo(e)
            insert_data(info)
            continue
       

        # O/P rows
        for meta in meta_list:
            try:
                resource_name = build_resource_name(meta)

                rows.append({
                    "ResourceName": resource_name,
                    "ObjectName": "Tag",
                    "CounterName": "Status",
                    "Value": tags_json
                })
            except Exception as e:
                print(f"Error building row for VM {server_key}: {e}")
                info = exceptioninfo(e)
                insert_data(info)
                continue

    return rows



def load_server_metadata_from_db():
    try:
        connectToCrcaMonitoring = connectToDw_AADpwd_Write("sqldb-azure-prod-012.database.windows.net","crcamonitoring", "servCRCAMonitoring@providence.org")
        query = """select [Resource Name], [Server Name], [Subscription ID], [Resource Group], [Hosting Type], [Application CI] from [Server List] """
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


def serverTagData():
    print("StartTime:" + str(datetime.now()))
    server_map, resource_name_set = load_server_metadata_from_db()
    try:
        existing_df = getLatestTagFromAdx()
    except Exception as e:
        print(f"Error retrieving existing tags from ADX: {e}")
        info = exceptioninfo(e)
        insert_data(info)
        existing_df = pd.DataFrame(columns=["ResourceName", "Value"])
    subscriptions = ['6d590d81-bab9-4b9a-b011-090467b5a9a4','5467bf57-48b4-4930-b3cb-bf039b259d04','ab16a144-47d7-45c5-bcb7-8affc988f8e0','343a7ee0-5081-4024-82fc-498ee61867a9','9592c342-d1fb-477e-8e91-ad39bf00933b']

    all_rows = []

    def process_subscription(sub):
        maintenance_rows = get_maintenance_rows_for_sub(sub, server_map)
        return maintenance_rows 

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

 
    if all_rows:
        df = pd.DataFrame(all_rows, columns=["ResourceName", "ObjectName", "CounterName", "Value"])
        # print(f"Created DataFrame with {len(df)} rows")
    else:
        df = pd.DataFrame(columns=["ResourceName", "ObjectName", "CounterName", "Value"])
    
    try:
        df_to_insert, new_vm_names, changed_vm_names = diff_tags(df, existing_df)
    except Exception as e:
        print(f"Error diffing tag changes: {e}")
        info = exceptioninfo(e)
        insert_data(info)
        return
    
    if df_to_insert.empty:
        return

    try:
        df_to_insert["LastUpdated"] = datetime.now(timezone.utc)
        # New column mirroring LastUpdated for Azure Monitor-style conventions
        df_to_insert["TimeGenerated"] = df_to_insert["LastUpdated"]
    except Exception as e:
        print(f"Error setting LastUpdated: {e}")
        info = exceptioninfo(e)
        insert_data(info)
        return

    if new_vm_names:
        try:
            ingestDfToAdx(df_to_insert[df_to_insert["ResourceName"].isin(new_vm_names)],"Resource_Compliance")
        except Exception as e:
            print(f"Error ingesting new VMs to ADX: {e}")
            info = exceptioninfo(e)
            insert_data(info)

    # Update CHANGED VMs (DELETE + INSERT)
    if changed_vm_names:
        try:
            update_tags_in_adx(df_to_insert[df_to_insert["ResourceName"].isin(changed_vm_names)])
        except Exception as e:
            print(f"Error updating changed VMs in ADX: {e}")
            info = exceptioninfo(e)
            insert_data(info)

    print("EndTime:" + str(datetime.now()))


if __name__ == "__main__":
    try:
        tenant_id = connectToKeyVault("tenantIdSpn")
        client_id = connectToKeyVault("clientIdSpn")
        client_secret = connectToKeyVault("clientSecretSpn")

        credential = ClientSecretCredential(
            tenant_id=tenant_id,
            client_id=client_id,
            client_secret=client_secret
        )

        serverTagData()
    except Exception as e:
        print(f"Fatal error running serverTagData: {e}")
        info = exceptioninfo(e)
        insert_data(info)



























































