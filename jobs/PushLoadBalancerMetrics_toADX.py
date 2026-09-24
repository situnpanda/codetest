import sys
from pathlib import Path
root = Path(__file__).resolve().parents[1] / "backend"
sys.path.append(str(root))
import pandas as pd
from datetime import datetime, timezone, timedelta
from azure.identity import AzureCliCredential , ManagedIdentityCredential
from azure.mgmt.network import NetworkManagementClient
from azure.monitor.querymetrics import MetricsClient
from azure.kusto.data import KustoClient, KustoConnectionStringBuilder, DataFormat
from azure.kusto.ingest import IngestionProperties, IngestionMappingKind, KustoStreamingIngestClient, QueuedIngestClient
from azure.kusto.data.helpers import dataframe_from_result_table
from shared.dataBase import connectToDw_AADpwd, queryDw, insert_data, exceptioninfo
from shared.keyVault import connectToKeyVault
from azure.identity import ClientSecretCredential

 
def getServerList():
 
    serverName = 'sqldb-azure-prod-012.database.windows.net'
    dBname = 'crcamonitoring'
    username = 'servCRCAMonitoring@providence.org'
    connectionString = connectToDw_AADpwd(serverName, dBname, username)
 
    query = """SELECT lower([Subscription ID]) as SubscriptionId,lower([Resource Group]) as ResourceGroup,lower([Server Name]) as ServerName,[Resource Name] as ResourceId,[Hosting Type] as HostingType,[Application CI] as ApplicationCI FROM [Server List] WHERE [Last Updated] = (SELECT MAX([Last Updated]) FROM [Server List]) """
    res = queryDw(connectionString, query)
 
    if not res:
        return pd.DataFrame(columns=[ "SubscriptionId", "ResourceGroup", "ServerName", "ResourceId", "HostingType", "ApplicationCI"])
    rows = [tuple(r) for r in res]
    df = pd.DataFrame(rows, columns=[ "SubscriptionId", "ResourceGroup", "ServerName", "ResourceId", "HostingType", "ApplicationCI" ])
    return df
 
 
def getMaxTime():
    try:
        cluster = "https://telemetrycrcav2.westus2.kusto.windows.net"
        kcsb = KustoConnectionStringBuilder.with_azure_token_credential(cluster, credential)
        read_client = KustoClient(kcsb)
 
        kusto_query = "set notruncation; LoadBalancer_Metrics_Perf | summarize maxTime = max(TimeGenerated)"
        result = read_client.execute_query(database, kusto_query)
 
        try:
            df = dataframe_from_result_table(result.primary_results[0])
            if len(df):
                return df["maxTime"].iloc[0]
            return ""
        except Exception:
            return ""
    except Exception as ex:
        info = exceptioninfo(ex)
        raise Exception(info)
 
 
def insertIntoADX(df):
   
    while True:
        try:
            # credential = AzureCliCredential()
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
            data_format=DataFormat.CSV,  # Specify the format of the data being ingested
            ingestion_mapping_reference="LoadBalancerMetricsPerfCsvMapping",  # Ensure you have an appropriate mapping defined
        )
 
        ingest_client.ingest_from_dataframe(df, ingestion_properties)
        print("Data ingestion initiated for ", len(df), " rows.")
    except Exception as ex:
        print("Exception")
        print(ex)
        info = exceptioninfo(ex)
        raise Exception(info)
 
 
 
def getLoadBalancerMetrics(start_time, end_time):
 
    print("\nFetching Load Balancer metrics...")
    clients_by_region = {}
    all_rows = []
 
    for sub in subscriptions:
 
        network_client = NetworkManagementClient(credential, sub)
        for lb in network_client.load_balancers.list_all():
                lb_id = lb.id
                lb_name = lb.name
                rg = lb.id.split("/resourceGroups/")[1].split("/")[0]
 
                try:
 
                    region = (lb.location or "global").lower()
                    endpoint = f"https://{region}.metrics.monitor.azure.com"
                    if region not in clients_by_region:
                        clients_by_region[region] = MetricsClient(endpoint=endpoint, credential=credential)
                    mclient = clients_by_region[region]
 
                    results = mclient.query_resources(
                        resource_ids=[lb_id],
                        metric_namespace="Microsoft.Network/loadBalancers",
                        metric_names=metrics_list,
                        timespan=(start_time, end_time),
                        granularity=timedelta(minutes=15),
                        aggregations=["Average", "Minimum", "Maximum"],
                    )
 
                    for res in results:
                        for metric in res.metrics:
                            metric_name = metric.name
                            for ts in metric.timeseries:
                                for dp in ts.data:
                                    if dp.average is None:
                                        continue
                                    row = {
                                        "TimeGenerated": dp.timestamp,
                                        "SubscriptionId": sub.lower(),
                                        "ResourceGroup": rg.lower(),
                                        "LoadBalancerName": lb_name.lower(),
                                        "ObjectName": metric_name,
                                        "CounterName": metric.unit,
                                        "AvgValue": round(dp.average),
                                        "MinValue": round(dp.minimum) if dp.minimum is not None else None,
                                        "MaxValue": round(dp.maximum) if dp.maximum is not None else None,
                                    }
                                    all_rows.append(row)
 
                except Exception as ex:
                    print(f"    Error: {ex}")
 
    return pd.DataFrame(all_rows)
 
 
def get_data():
 
    max_time = getMaxTime()
 
    current_time = datetime.now(timezone.utc)
    floored_current_time = current_time.replace(
        minute=(current_time.minute // 15) * 15,
        second=0,
        microsecond=0,
    )
    if max_time == "" or pd.isna(max_time):
        start_time = floored_current_time - timedelta(minutes=15)
    else:
        max_time = max_time + timedelta(minutes=15)
        start_time = max_time.replace(
            minute=(max_time.minute // 15) * 15,
            second=0,
            microsecond=0,
        )
 
    end_time = floored_current_time
    if start_time >= end_time:
        print("No new window to process (start_time >= current floored time)")
        return pd.DataFrame(columns=[ "TimeGenerated","ObjectName","CounterName","HostingType","ResourceId","AvgValue","MaxValue","MinValue",])
 
    df_metrics = getLoadBalancerMetrics(start_time, end_time)
 
    if df_metrics.empty:
        return pd.DataFrame(columns=["TimeGenerated","ObjectName","CounterName","HostingType","ResourceId","AvgValue","MaxValue","MinValue",])
 
    # Aggregate over the 15-minute window like in DB metrics: compute avg/min/max over the window
    df_metrics["TimeGenerated"] = pd.to_datetime(df_metrics["TimeGenerated"])
 
    df_agg = (
        df_metrics.groupby(["SubscriptionId","ResourceGroup","LoadBalancerName","ObjectName","CounterName",pd.Grouper(key="TimeGenerated", freq="15min"),], as_index=False)
        .agg(
            AvgValue=("AvgValue", "mean"),
            MinValue=("AvgValue", "min"),
            MaxValue=("AvgValue", "max"),
        )
    )
 
    df_agg["AvgValue"] = df_agg["AvgValue"].round().astype("Int64")
    df_agg["MinValue"] = df_agg["MinValue"].round().astype("Int64")
    df_agg["MaxValue"] = df_agg["MaxValue"].round().astype("Int64")
    df_servers = getServerList()
    df_final = df_agg.merge(df_servers, on=["SubscriptionId", "ResourceGroup"], how="inner")
 
    df_final["ResourceId"] = (
        "SubscriptionID/" + df_final["SubscriptionId"].astype(str) +
        "/ResourceGroup/" + df_final["ResourceGroup"].astype(str) +
        "/SqlServerName/" + df_final["ServerName"].astype(str) +
        "/LoadBalancerName/" + df_final["LoadBalancerName"].astype(str) +
        "/ApplicationCI/" + df_final["ApplicationCI"].astype(str)
    )
    # Reorder columns to match ADX mapping
    df_final = df_final[["TimeGenerated", "ObjectName", "CounterName", "HostingType", "ResourceId", "AvgValue", "MaxValue", "MinValue",]]
    return df_final
 

try:
    subscriptions = ["ab16a144-47d7-45c5-bcb7-8affc988f8e0","9592c342-d1fb-477e-8e91-ad39bf00933b","5467bf57-48b4-4930-b3cb-bf039b259d04","343a7ee0-5081-4024-82fc-498ee61867a9","6d590d81-bab9-4b9a-b011-090467b5a9a4"]
    metrics_list = ["VipAvailability","DipAvailability","ByteCount","PacketCount","SYNCount","SnatConnectionCount"]
    # credential = AzureCliCredential()
    tenant_id = connectToKeyVault("tenantIdSpn")
    client_id = connectToKeyVault("clientIdSpn")
    client_secret = connectToKeyVault("clientSecretSpn")

    credential = ClientSecretCredential( tenant_id=tenant_id, client_id=client_id, client_secret=client_secret)

    database = "crca_monitoring_telemetry"
    table = "LoadBalancer_Metrics_Perf"
    df_final = get_data()

    if df_final.empty:
        print("No new Load Balancer metrics to ingest into ADX")
    else:
        insertIntoADX(df_final)
 
except Exception as ex:
    print("Fatal Error:", ex)
    if isinstance(ex.args[0], dict):
        insert_data(ex.args[0])
    else:
        info = exceptioninfo(ex)
        insert_data(info)