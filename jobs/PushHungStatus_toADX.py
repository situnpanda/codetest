import sys
from pathlib import Path
root = Path(__file__).resolve().parents[1] / "backend"
sys.path.append(str(root))

import pandas as pd
import numpy as np
from datetime import datetime, timezone
from azure.identity import AzureCliCredential, ManagedIdentityCredential
from azure.kusto.data import KustoConnectionStringBuilder, DataFormat
from azure.kusto.ingest import IngestionProperties, QueuedIngestClient
from shared.dataBase import connectToDw_AADpwd, queryDw, insert_data, exceptioninfo
from shared.logAnalytics import queryInLogAnalytics
import threading

WORKSPACE_ID = "552b9630-b106-4fe7-a1fa-97d04a0010ef"
SUBSCRIPTIONS_KQL = """dynamic([
    "ab16a144-47d7-45c5-bcb7-8affc988f8e0",
    "9592c342-d1fb-477e-8e91-ad39bf00933b",
    "5467bf57-48b4-4930-b3cb-bf039b259d04",
    "343a7ee0-5081-4024-82fc-498ee61867a9",
    "6d590d81-bab9-4b9a-b011-090467b5a9a4",
    "accde124-a45f-47be-aefa-b09362b2c5fc",
    "a82a7c51-82fd-4bbc-a376-3cd8752a1675"
])"""


def connectToDB():
    return connectToDw_AADpwd(
        "sqldb-azure-prod-012.database.windows.net",
        "crcamonitoring",
        "servCRCAMonitoring@providence.org"
    )


# ── STEP 1: Get metadata from DB ─────────────────────────────────────────────

def getServerList():
    """Returns dict keyed by lowercase server name → list of metadata dicts."""
    print("[getServerList] Loading...")
    conn = connectToDB()
    rows = queryDw(conn, """
        SELECT [Resource Name], [Server Name], [Subscription ID], [Resource Group], [Hosting Type], [Application CI]
        FROM [Server List]
        WHERE [Last Updated] = (SELECT MAX([Last Updated]) FROM [Server List])
    """)
    result = {}
    for resName, srvName, subId, rg, hosting, appCI in rows:
        key = srvName.strip().lower()
        if key not in result:
            result[key] = []
        result[key].append({
            "subscriptionId": (subId or "").strip(),
            "resourceGroup":  (rg or "").strip(),
            "hostingType":    hosting.strip(),
            "applicationCI":  appCI.strip(),
            "serverName":     srvName.strip()
        })
    print(f"[getServerList] {len(result)} unique servers loaded.")
    return result


def buildResourceId(meta):
    """Build ResourceId string from server metadata."""
    if meta["hostingType"].lower() == "onpremise":
        return f"ServerName/{meta['serverName']}/ApplicationCI/{meta['applicationCI']}"
    return (f"SubscriptionID/{meta['subscriptionId']}/"
            f"ResourceGroup/{meta['resourceGroup']}/"
            f"ServerName/{meta['serverName']}/"
            f"ApplicationCI/{meta['applicationCI']}")


# ── STEP 2: Determine status via KQL ─────────────────────────────────────────

def getVMStatus(serverList):
    """Returns DataFrame with Computer, Status (Up/Down/Hung) for all servers."""
    server_names = set(serverList.keys())

    query = f"""
let GapThreshold = 20;
let HighUtilThreshold = 80;
let Subs = {SUBSCRIPTIONS_KQL};
let HeartbeatStatus =
    Heartbeat
    | where SubscriptionId in (Subs)
    | where TimeGenerated >= ago(2d)
    | summarize LastHeartbeat = max(TimeGenerated) by Computer
    | extend GapMin = datetime_diff('minute', now(), LastHeartbeat)
    | extend IsDown = (GapMin >= GapThreshold);
let DownServers = HeartbeatStatus | where IsDown;
let CpuData = DownServers
    | join kind=leftouter (
        Perf
        | where _SubscriptionId in (Subs) and TimeGenerated >= ago(2d)
        | where CounterName == "% Processor Time" and ObjectName == "Processor" and InstanceName == "_Total"
    ) on Computer
    | where TimeGenerated between ((LastHeartbeat - 30m) .. (LastHeartbeat + 10m))
    | summarize arg_max(TimeGenerated, CounterValue) by Computer, LastHeartbeat, GapMin
    | project Computer, LastHeartbeat, GapMin, LatestCPUTime = TimeGenerated, LatestCPUValue = CounterValue;
let MemData = DownServers
    | join kind=leftouter (
        Perf
        | where _SubscriptionId in (Subs) and TimeGenerated >= ago(2d)
        | where CounterName == "% Committed Bytes In Use" and ObjectName == "Memory"
    ) on Computer
    | where TimeGenerated between ((LastHeartbeat - 30m) .. (LastHeartbeat + 10m))
    | summarize arg_max(TimeGenerated, CounterValue) by Computer
    | project Computer, LatestMemoryTime = TimeGenerated, LatestMemoryValue = CounterValue;
let EventData = DownServers
    | join kind=leftouter (
        Event
        | where _SubscriptionId in (Subs) and TimeGenerated >= ago(2d)
        | where EventID in (
            1000, 1001, 1002,
            2004, 2019, 2020, 26,
            333,
            7009, 7011, 7022,
            7031, 7034,
            41, 6008,
            129, 153, 51, 9, 11
        )
    ) on Computer
    | where TimeGenerated between ((LastHeartbeat - 1h) .. (LastHeartbeat + 10m))
    | summarize ErrorEventCount = count() by Computer;
let DownResult = DownServers
    | join kind=leftouter (CpuData) on Computer
    | join kind=leftouter (MemData) on Computer
    | join kind=leftouter (EventData) on Computer
    | extend
        IsHighCPUUtil = (LatestCPUValue >= HighUtilThreshold),
        IsHighMemoryUtil = (LatestMemoryValue >= HighUtilThreshold),
        ErrorEventCount = coalesce(ErrorEventCount, 0),
        HasEvents = (coalesce(ErrorEventCount, 0) > 0)
    | extend Status = case(
        (IsHighCPUUtil or IsHighMemoryUtil) and HasEvents, "Hung",
        IsHighCPUUtil and IsHighMemoryUtil, "Hung",
        "Down"
    )
    | project Computer, LastHeartbeat, GapMin,
        LatestCPUTime, LatestCPUValue, IsHighCPUUtil,
        LatestMemoryTime, LatestMemoryValue, IsHighMemoryUtil,
        ErrorEventCount, HasEvents, Status;
DownResult
| project Computer, LastHeartbeat, GapMin,
    LatestCPUTime, LatestCPUValue, IsHighCPUUtil,
    LatestMemoryTime, LatestMemoryValue, IsHighMemoryUtil,
    ErrorEventCount, HasEvents, Status"""

    print(f"[getVMStatus] Querying Log Analytics for {len(server_names)} servers...")
    df = queryInLogAnalytics(WORKSPACE_ID, query, '', '')
    if df.empty:
        print("[getVMStatus] No rows returned.")
        return df

    # Filter to only servers in our server list (post-query filter instead of KQL dynamic array)
    df["_key"] = df["Computer"].str.strip().str.lower().str.split(".").str[0]
    df = df[df["_key"].isin(server_names)].drop(columns=["_key"]).reset_index(drop=True)

    print(f"[getVMStatus] Got {len(df)} rows after filtering. Status counts:\n{df['Status'].value_counts().to_string()}")
    return df


# ── STEP 3: Format for ADX Analytics table ───────────────────────────────────
#   Schema: TimeGenerated | ResourceId | ObjectName | CounterName | Data

def formatForADX(vm_df, serverList):
    time_now = datetime.now(timezone.utc)
    rows = []

    for _, r in vm_df.iterrows():
        computer = str(r.get("Computer", "")).strip().lower().split(".")[0]
        meta_list = serverList.get(computer)
        if not meta_list:
            continue
        for meta in meta_list:
            rows.append({
                "TimeGenerated": time_now,
                "ResourceId":    buildResourceId(meta),
                "ObjectName":    "Server",
                "CounterName":   "Status",
                "Data":          r["Status"],    # Down / Hung
            })

    df = pd.DataFrame(rows, columns=["TimeGenerated", "ResourceId", "ObjectName", "CounterName", "Data"])
    print(f"[formatForADX] Built {len(df)} rows")
    return df


# ── STEP 4: Push to ADX ──────────────────────────────────────────────────────

def insertIntoADX(df):
    cluster  = "https://ingest-telemetrycrcav2.westus2.kusto.windows.net"
    database = "crca_monitoring_telemetry"
    table    = "Analytics"

    if df.empty:
        print("[insertIntoADX] Empty DataFrame, nothing to ingest.")
        return

    print(f"[insertIntoADX] Ingesting {len(df)} rows into {database}.{table}...")
    cred = AzureCliCredential()
    # cred = ManagedIdentityCredential(client_id='015ad614-f9a5-4333-83b4-b71c01c393d8')
    kcsb = KustoConnectionStringBuilder.with_azure_token_credential(cluster, cred)
    client = QueuedIngestClient(kcsb)
    props = IngestionProperties(
        database=database,
        table=table,
        data_format=DataFormat.CSV,
        ingestion_mapping_reference="AnalyticsCsvMapping",
    )
    client.ingest_from_dataframe(df, props)
    print(f"[insertIntoADX] ✅ Queued {len(df)} rows.")


# ── Main ──────────────────────────────────────────────────────────────────────

vm_result = {}


def fetchVM(serverList):
    global vm_result
    vm_result = getVMStatus(serverList)


try:
    print("=" * 60)
    print(f"[Heartbeat+HungStatus] ▶ Start: {datetime.now()}")
    print("=" * 60)

    # STEP 1 — Get metadata from DB
    print("\n── STEP 1: Get metadata from DB ──")
    serverList = getServerList()

    if not serverList:
        raise Exception("Server list is empty.")

    # STEP 2 — Query VM status
    print("\n── STEP 2: Determine VM status via KQL ──")
    t_vm = threading.Thread(target=fetchVM, args=(serverList,))
    t_vm.start()
    t_vm.join()

    vm_df = vm_result if isinstance(vm_result, pd.DataFrame) else pd.DataFrame()
    print(f"VM rows: {len(vm_df)}")

    # Save raw KQL results to CSV
    vm_csv = Path(__file__).resolve().parent / "Hung_vm_raw.csv"
    vm_df.to_csv(vm_csv, index=False)
    print(f"[CSV] Saved vm_df ({len(vm_df)} rows) to {vm_csv}")

    if vm_df.empty:
        print("[WARNING] No status data returned from Log Analytics.")

    # Log status breakdown
    if not vm_df.empty:
        print(f"\n[Summary] VM Status breakdown:")
        for status, count in vm_df['Status'].value_counts().items():
            print(f"  {status}: {count}")
        hung = vm_df[vm_df['Status'] == 'Hung']
        if not hung.empty:
            print(f"\n[Hung Servers]")
            for _, r in hung.iterrows():
                print(f"  {r['Computer']} | CPU={r.get('LatestCPUValue','N/A')} | Mem={r.get('LatestMemoryValue','N/A')} | Events={r.get('ErrorEventCount',0)}")

    # STEP 3 — Format for ADX
    print("\n── STEP 3: Format for ADX ──")
    df_analytics = formatForADX(vm_df, serverList)
    print(f"Sample:\n{df_analytics.head(10).to_string()}")

    if df_analytics.empty:
        raise Exception("No rows after formatting.")

    # STEP 4 — Save CSV
    print("\n── STEP 4: Save CSV ──")
    csv_path = Path(__file__).resolve().parent / "Hung_output.csv"
    df_analytics.to_csv(csv_path, index=False)
    print(f"[CSV] Saved {len(df_analytics)} rows to {csv_path}")

    # STEP 5 — Push to ADX
    print("\n── STEP 5: Push to ADX ──")
    insertIntoADX(df_analytics)

    print("\n" + "=" * 60)
    print(f"[Heartbeat+HungStatus] ✅ End: {datetime.now()}")
    print("=" * 60)

except Exception as ex:
    print(f"\n❌ Error: {ex}")
    if ex.args and isinstance(ex.args[0], dict):
        insert_data(ex.args[0])
    else:
        info = exceptioninfo(ex)
        insert_data(info)