import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "backend"
sys.path.append(str(root))

import asyncio
import aiohttp
import pandas as pd
import numpy as np
from datetime import datetime, timezone, timedelta
from azure.identity import AzureCliCredential,ManagedIdentityCredential
from azure.kusto.data import KustoClient, KustoConnectionStringBuilder, DataFormat
from azure.kusto.data.helpers import dataframe_from_result_table
from azure.kusto.ingest import IngestionProperties, QueuedIngestClient
from shared.dataBase import connectToKeyVault, connectToDw_AADpwd, queryDw, insert_data, exceptioninfo
from azure.identity import ClientSecretCredential

VM_METRICS = ["Network In Total", "Network Out Total"]
NIC_METRICS = ["BytesReceivedRate", "BytesSentRate", "PacketsReceivedRate", "PacketsSentRate"]

def insertIntoADX(df):
    
    while True:
        try:
            credential = ManagedIdentityCredential(client_id='015ad614-f9a5-4333-83b4-b71c01c393d8')
            cluster = "https://ingest-telemetrycrcav2.westus2.kusto.windows.net"
            kcsb = KustoConnectionStringBuilder.with_azure_token_credential(cluster, credential)
            ingest_client = QueuedIngestClient(kcsb)
            break
        except:
            credential = AzureCliCredential()
    try:
        ingestion_properties = IngestionProperties(
            database=database,
            table=table,
            data_format=DataFormat.CSV,
            ingestion_mapping_reference="NetworkMetricsPerfCsvMapping",
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
        
        KUSTO_QUERY = f"""set notruncation; {table} | summarize maxTime = max(TimeGenerated)"""
        st = datetime.now()
        result = read_client.execute_query(database, KUSTO_QUERY)
        end = datetime.now()
        print("Metrics Table", st, end)
        print((end-st).seconds)
        try:
            df = dataframe_from_result_table(result.primary_results[0])
            if len(df):
                maxTime = df["maxTime"].iloc[0]
                return maxTime
            else:
                return ""
        except:
            return ""
    except Exception as ex:
        info = exceptioninfo(ex)
        raise Exception(info)

def getResourceList():
    serverName = 'sqldb-azure-prod-012.database.windows.net'
    dBname = 'crcamonitoring'
    username = 'servCRCAMonitoring@providence.org'

    try:
        connectionString = connectToDw_AADpwd(serverName, dBname, username)
        query = "SELECT ResourceName, NicName FROM [dbo].[NetworkList]"
        res = queryDw(connectionString, query)
        df = pd.DataFrame(np.array(res), columns=["ResourceName", "NicName"])

        vms, nics = [], []
        for _, row in df.iterrows():
            resource_name = row["ResourceName"]  
            nic_name_formatted = row["NicName"] 
            res_parts = resource_name.split("/")
            sub_id = res_parts[1] if len(res_parts) > 1 else ""
            rg_name = res_parts[3] if len(res_parts) > 3 else ""
            server_name = res_parts[5] if len(res_parts) > 5 else ""
            nic_parts = nic_name_formatted.split("/")
            nic_name = nic_parts[5] if len(nic_parts) > 5 else ""
            vm_arm_id = f"/subscriptions/{sub_id}/resourceGroups/{rg_name}/providers/Microsoft.Compute/virtualMachines/{server_name}"
            
            vms.append({
                "subscriptionId": sub_id,
                "resourceGroup": rg_name,
                "vmName": server_name,
                "resourceId": vm_arm_id,
                "ResourceName": resource_name
            })
            
            nic_arm_id = f"/subscriptions/{sub_id}/resourceGroups/{rg_name}/providers/Microsoft.Network/networkInterfaces/{nic_name}"
            
            nics.append({
                "subscriptionId": sub_id,
                "resourceGroup": rg_name,
                "nicName": nic_name,
                "resourceId": nic_arm_id,
                "ResourceName": resource_name,
                "NicNameFormatted": nic_name_formatted
            })
        
        print(f"Loaded from DB: {len(vms)} VMs, {len(nics)} NICs")
        return vms, nics
    except Exception as ex:
        info = exceptioninfo(ex)
        raise Exception(info)

async def fetchMetrics(session, headers, resource, metrics, timespan, sem):
    url = f"https://management.azure.com{resource['resourceId']}/providers/microsoft.insights/metrics"
    params = {
        "api-version": "2018-01-01",
        "metricnames": ",".join(metrics),
        "timespan": timespan,
        "interval": "PT1M",
        "aggregation": "Average,Minimum,Maximum,Total",
    }

    async with sem:
        try:
            async with session.get(url, headers=headers, params=params, timeout=aiohttp.ClientTimeout(total=60)) as resp:
                resp.raise_for_status()
                payload = await resp.json()
        except:
            return []

    rows = []
    for metric in payload.get("value", []):
        metric_name = metric.get("name", {}).get("value")
        for ts in metric.get("timeseries", []):
            for data in ts.get("data", []):
                if data.get("timeStamp"):
                    rows.append({
                        **resource,
                        "timeStamp": data["timeStamp"],
                        "metricName": metric_name,
                        "average": data.get("average"),
                        "minimum": data.get("minimum"),
                        "maximum": data.get("maximum"),
                        "total": data.get("total")
                    })
    return rows

async def fetchAllMetrics(resources, metrics, start_time, end_time):
    token = credential.get_token("https://management.azure.com/.default").token
    headers = {"Authorization": f"Bearer {token}"}

    timespan = f"{start_time.strftime('%Y-%m-%dT%H:%M:%SZ')}/{end_time.strftime('%Y-%m-%dT%H:%M:%SZ')}"

    print(f"Fetching metrics for {len(resources)} resources from {start_time} to {end_time}...")
    sem = asyncio.Semaphore(32)

    async with aiohttp.ClientSession() as session:
        tasks = [fetchMetrics(session, headers, r, metrics, timespan, sem) for r in resources]
        results = await asyncio.gather(*tasks)

    rows = [row for result in results for row in result]
    return pd.DataFrame(rows)

def aggregateData(vm_df, nic_df):
    if not nic_df.empty:
        nic_df["ServerName"] = nic_df["nicName"].str.split("-").str[0].str.strip().str.lower()
        nic_df["TimeStampUtc"] = pd.to_datetime(nic_df["timeStamp"], utc=True)

        nic_pivot = nic_df.pivot_table(
            index=["ResourceName", "NicNameFormatted", "subscriptionId", "resourceGroup", "nicName", "TimeStampUtc"],
            columns="metricName",
            values=["average", "minimum", "maximum"],
            aggfunc="first"
        ).reset_index()
        nic_pivot.columns = [f"{col[1]}_{col[0]}" if col[1] else col[0] for col in nic_pivot.columns]
        
        nic_agg = nic_pivot.groupby("ResourceName", as_index=False).agg({
            "NicNameFormatted": "first",
            "subscriptionId": "first",
            "resourceGroup": "first",
            "nicName": "first",
            "TimeStampUtc": "max",
            **{col: "min" if "_minimum" in col else "max" if "_maximum" in col else "mean" 
               for col in nic_pivot.columns if any(m in col for m in NIC_METRICS)}
        })
    else:
        nic_agg = pd.DataFrame()

    if not vm_df.empty:
        vm_agg = vm_df.pivot_table(index="ResourceName", columns="metricName", values="total", aggfunc="sum").reset_index()
        vm_agg.columns = [col.replace(" ", "") + "_sum" if col != "ResourceName" else col for col in vm_agg.columns]
    else:
        vm_agg = pd.DataFrame()

    if not nic_agg.empty and not vm_agg.empty:
        return nic_agg.merge(vm_agg, how="outer", on="ResourceName")
    return nic_agg if not nic_agg.empty else vm_agg if not vm_agg.empty else pd.DataFrame()

def transformToFinal(merged_df):
    if merged_df.empty:
        return pd.DataFrame()

    rows = []
    metrics_config = [
        ("bytes_received_rate", "BytesReceivedRate", "KiB/sec", 1024, True),
        ("bytes_sent_rate", "BytesSentRate", "KiB/sec", 1024, True),
        ("packets_received_rate", "PacketsReceivedRate", "Packets/sec", 1, True),
        ("packets_sent_rate", "PacketsSentRate", "Packets/sec", 1, True),
        ("network_in_total", "NetworkInTotal_sum", "KiB", 1024, False),
        ("network_out_total", "NetworkOutTotal_sum", "KiB", 1024, False),
    ]

    for _, row in merged_df.iterrows():
        resource_id = row.get("NicNameFormatted") if pd.notna(row.get("NicNameFormatted")) else row.get("ResourceName", "")
        
        time_gen = row.get("TimeStampUtc")
        if pd.isna(time_gen):
            time_gen = pd.Timestamp.utcnow().replace(tzinfo=timezone.utc).floor("T")
        
        for obj_name, metric_key, counter_name, divisor, has_minmax in metrics_config:
            if has_minmax:
                min_val = row.get(f"{metric_key}_minimum")
                max_val = row.get(f"{metric_key}_maximum")
                avg_val = row.get(f"{metric_key}_average")
                if pd.notna(avg_val):
                    rows.append({
                        "TimeGenerated": time_gen,
                        "ObjectName": obj_name,
                        "CounterName": counter_name,
                        "ResourceId": resource_id,
                        "AvgValue": int(round(avg_val / divisor)),
                        "MaxValue": int(round(max_val / divisor)) if pd.notna(max_val) else 0,
                        "MinValue": int(round(min_val / divisor)) if pd.notna(min_val) else 0
                    })
            else:
                val = row.get(metric_key)
                if pd.notna(val):
                    v = int(round(val / divisor))
                    rows.append({
                        "TimeGenerated": time_gen,
                        "ObjectName": obj_name,
                        "CounterName": counter_name,
                        "ResourceId": resource_id,
                        "AvgValue": v, "MaxValue": v, "MinValue": v
                    })

    return pd.DataFrame(rows)

# Main execution
try:
    database = "crca_monitoring_telemetry"
    table = "Network_Metrics_Perf"
    # credential = AzureCliCredential()
    tenant_id = connectToKeyVault("tenantIdSpn")
    client_id = connectToKeyVault("clientIdSpn")
    client_secret = connectToKeyVault("clientSecretSpn")

    credential = ClientSecretCredential( tenant_id=tenant_id, client_id=client_id, client_secret=client_secret)

    maxTime = getMaxTime()
    currentTime = datetime.now(timezone.utc)
    
    floored_currentTime = currentTime.replace(
        minute=(currentTime.minute // 10) * 10,
        second=0,
        microsecond=0
    )
    
    if maxTime == "":
        startTime = floored_currentTime - timedelta(minutes=10)
    else:
        maxTime = maxTime + timedelta(minutes=10)
        startTime = maxTime.replace(
            minute=(maxTime.minute // 10) * 10,
            second=0,
            microsecond=0
        )
    
    print(f"Fetching data from {startTime} to {floored_currentTime}")
    
    vms, nics = getResourceList()
    accumulated_data = []
    batch_start = startTime
    
    while True:
        if startTime >= floored_currentTime:
            break
        
        endTime = floored_currentTime if (startTime + timedelta(minutes=10) > floored_currentTime) else startTime + timedelta(minutes=10)
        print(f"Processing window: {startTime} to {endTime}")
        
        vm_df = asyncio.run(fetchAllMetrics(vms, VM_METRICS, startTime, endTime))
        nic_df = asyncio.run(fetchAllMetrics(nics, NIC_METRICS, startTime, endTime))
        print(f"Fetched: {len(vm_df)} VM rows, {len(nic_df)} NIC rows")
        
        merged = aggregateData(vm_df, nic_df)
        print(f"Aggregated: {len(merged)} rows")
        
        df = transformToFinal(merged)
        print(f"Transformed: {len(df)} final rows")
        
        if not df.empty:
            accumulated_data.append(df)
        
        startTime = endTime
        
        # Insert every hour OR when we reach the end
        time_elapsed = (startTime - batch_start).total_seconds() / 60
        if time_elapsed >= 60 or startTime >= floored_currentTime:
            if accumulated_data:
                final_df = pd.concat(accumulated_data, ignore_index=True)
                final_df = final_df[["TimeGenerated", "ObjectName", "CounterName", "ResourceId", "AvgValue", "MaxValue", "MinValue"]]
                
                for col in ["AvgValue", "MaxValue", "MinValue"]:
                    final_df[col] = final_df[col].fillna(0).astype(int)
                
                if hasattr(final_df["TimeGenerated"].dtype, 'tz'):
                    final_df["TimeGenerated"] = final_df["TimeGenerated"].dt.tz_localize(None)
                
                print(f"Inserting {len(final_df)} rows to ADX (batch from {batch_start} to {startTime})...")
                insertIntoADX(final_df)
                print(f"✓ Batch {batch_start} to {startTime} completed")
                
                # Reset for next batch
                accumulated_data = []
                batch_start = startTime
    
    print("All windows processed successfully")
        
except Exception as ex:
    print(ex)
    if isinstance(ex.args[0], dict):
        insert_data(ex.args[0])
    else:
        info = exceptioninfo(ex)
        insert_data(info)