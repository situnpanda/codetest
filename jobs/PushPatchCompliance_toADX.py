import requests , numpy , pyodbc, sys, os, json
import concurrent.futures
from azure.identity import ClientSecretCredential
from datetime import datetime, timezone
import pandas as pd
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))
from domains.metrics.infrastructure.infrastructureTelemetry import PatchComplianceData
from shared.dataBase import connectToDw, connectToDw_AADpwd, connectToDw_AADpwd_Write,queryDw,connectToDw_SqlServerPwd,exceptioninfo,insert_data
from shared.filters import filtersData
from shared.keyVault import connectToKeyVault
from azure.identity import DefaultAzureCredential, AzureCliCredential, ManagedIdentityCredential
from azure.kusto.data import KustoClient, KustoConnectionStringBuilder
from azure.kusto.data import KustoClient, KustoConnectionStringBuilder, DataFormat
from azure.kusto.ingest import IngestionProperties, IngestionMappingKind, KustoStreamingIngestClient, QueuedIngestClient
from shared.ADX import connectToADX, readFromADX

credential = None

def ingestDfToAdx(df, table):
    cluster = "https://ingest-telemetrycrcav2.westus2.kusto.windows.net"
    database = "crca_monitoring_telemetry"

    if df.empty:
        return
    # Use globally initialized SPN credential when available, otherwise fall back to Azure CLI
    global credential
    try:
        token_cred = AzureCliCredential()
        kcsb = KustoConnectionStringBuilder.with_azure_token_credential(cluster, token_cred)

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


def delete_patch_rows_from_adx():
    try:
        client = connectToADX("https://telemetrycrcav2.westus2.kusto.windows.net")

        kql = """
        .delete table Resource_Compliance records <|
        Resource_Compliance
        | where ObjectName == "Patch"
        """

        # print("Deleting existing Patch rows from ADX...")
        client.execute_mgmt("crca_monitoring_telemetry", kql)
        # print("Patch rows deleted.")
    except Exception as e:
        print(f"Error deleting Patch rows from ADX: {e}")
        info = exceptioninfo(e)
        insert_data(info)



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

def get_patch_rows(df_patch, server_map):

    rows = []
    # Track unique PatchName/UpdatedDate emission per ResourceName to avoid duplicates
    emitted_patch_keys = set()
    emitted_updateddate_keys = set()
    for _, row in df_patch.iterrows():
        try:

            srv = str(row["ServerName"]).strip()
            patch_name = str(row["PatchWindow"]).strip()
            status = str(row["Status"]).strip()
            updatedDate = str(row["ServerComplianceUpdatedDate"]).strip()
            # collection name is present in PatchComplianceData output
            collectionName = str(row.get("collectionName", "")).strip()
     
            if srv in server_map:
                key = srv
            elif srv.lower() in server_map:
                key = srv.lower()
            else:
                # Server not in metadata so skipping
                continue

            meta_list = server_map[key]

            # For each ApplicationCI entry
            for meta in meta_list:

                try:
                    resource_name = build_resource_name(meta)
                except Exception as e:
                    print(f"Error building resource name for {srv}: {e}")
                    info = exceptioninfo(e)
                    insert_data(info)
                    continue

                # Emit a single PatchName row per (ResourceName, PatchWindow, UpdatedDate)
                patch_key = (resource_name, patch_name, updatedDate)
                if patch_key not in emitted_patch_keys:
                    rows.append({
                        "ResourceName": resource_name,
                        "ObjectName": "Patch",
                        "CounterName": "PatchWindow",
                        "Value": patch_name
                    })
                    emitted_patch_keys.add(patch_key)

                # Emit a single UpdatedDate row per (ResourceName, PatchWindow, UpdatedDate)
                if patch_key not in emitted_updateddate_keys:
                    rows.append({
                        "ResourceName": resource_name,
                        "ObjectName": "Patch",
                        "CounterName": "UpdatedDate",
                        "Value": updatedDate
                    })
                    emitted_updateddate_keys.add(patch_key)

                # Status row with collection identity in JSON for deterministic pairing
                status_payload = {
                    "collection": collectionName,
                    "status": status
                }
                try:
                    status_json = json.dumps(status_payload)
                except Exception as e:
                    print(f"Error serializing status payload for {resource_name}: {e}")
                    info = exceptioninfo(e)
                    insert_data(info)
                    status_json = "{}"
                rows.append({
                    "ResourceName": resource_name,
                    "ObjectName": "Patch",
                    "CounterName": "CollectionStatus",
                    "Value": status_json
                })
        except Exception as e:
            print(f"Error processing patch row: {e}")
            info = exceptioninfo(e)
            insert_data(info)
            continue

    return rows


def patchData():
    print("StartTime:" + str(datetime.now()))
    server_map, resource_name_set = load_server_metadata_from_db()
    # Filters
    filter = {'appFamily': ['All'],'appCI': ['All'],'managedByGroup': ['All'],'supportGroup': ['All']}

    all_rows = []
 
    try:
        apmNumber = filtersData(filter, "apmNumber")
        df_patch = PatchComplianceData("", apmNumber)
        df_patch = df_patch.drop_duplicates().reset_index(drop=True)
        patch_rows = get_patch_rows(df_patch, server_map)
        all_rows.extend(patch_rows)
    except Exception as e:
        print(f"Error fetching/processing patch data: {e}")
        info = exceptioninfo(e)
        insert_data(info)


    # Create DataFrame from all_rows
    if all_rows:
        df = pd.DataFrame(all_rows, columns=["ResourceName", "ObjectName", "CounterName", "Value"])
        # print(f"Created DataFrame with {len(df)} rows")    
    else:
        df = pd.DataFrame(columns=["ResourceName", "ObjectName", "CounterName", "Value"])


    if df.empty:
        #print("No new or changed rows to ingest.")
        return
    
    #cannot use update logic as the query length was too large and the limit for a query is 2097152
    try:
        delete_patch_rows_from_adx()
    except Exception as e:
        print(f"Error deleting old patch rows: {e}")
        info = exceptioninfo(e)
        insert_data(info)
    try:
        LastUpdated = datetime.now(timezone.utc)
        df["LastUpdated"] = LastUpdated
        # New column mirroring LastUpdated for Azure Monitor-style conventions
        df["TimeGenerated"] = df["LastUpdated"]
    except Exception as e:
        print(f"Error setting LastUpdated on patch DF: {e}")
        info = exceptioninfo(e)
        insert_data(info)
    try:
        ingestDfToAdx(df, "Resource_Compliance")
    except Exception as e:
        print(f"Error ingesting patch DF to ADX: {e}")
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

        patchData()
    except Exception as e:
        print(f"Fatal error running patchData: {e}")
        info = exceptioninfo(e)
        insert_data(info)



























































