import os
import pandas as pd
import subprocess
import pytz
from datetime import datetime, timezone, timedelta
from azure.monitor.query import LogsQueryClient, LogsQueryStatus
from azure.identity import DefaultAzureCredential, VisualStudioCodeCredential, AzureCliCredential, ManagedIdentityCredential
from azure.core.exceptions import HttpResponseError
import numpy
from flask import jsonify
from threading import Thread
import time
import pyodbc
from azure.keyvault.secrets import SecretClient

import sys
from pathlib import Path

# Add the parent directory to sys.path for module imports
root = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(root))
from shared.dataBase import queryDw, insert_data, connectToDw_SqlServerPwd, connectToDw_AADpwd, connectToDw_AADpwd_Write, connectToDw_SQLServerAero, queryAeroSnowflake


def connectToLogAnlytics():
    # credential = AzureCliCredential()
    credential = ManagedIdentityCredential(client_id='015ad614-f9a5-4333-83b4-b71c01c393d8')
    client = LogsQueryClient(credential)
    return client

def queryInLogAnalytics(workspaceId, query, startTime, endTime):
    client = connectToLogAnlytics()
    df = pd.DataFrame()

    try:
        response = client.query_workspace(
            workspace_id='552b9630-b106-4fe7-a1fa-97d04a0010ef',
            query=query,
            timespan=timedelta(days=0)
        )
        if response.status == LogsQueryStatus.PARTIAL:
            data = response.partial_data
        else:
            data = response.tables

        for table in data:
            df = pd.DataFrame(data=table.rows, columns=table.columns)

    except HttpResponseError as err:
        print("Fatal error:", err)

    return df

def serverUptime():
    serverUptimeCloud_df = pd.DataFrame()

    try:
        workspaceId = "552b9630-b106-4fe7-a1fa-97d04a0010ef"
        logAnalyticsQuery = f"""
             Perf  
             | where _SubscriptionId in ('ab16a144-47d7-45c5-bcb7-8affc988f8e0', '9592c342-d1fb-477e-8e91-ad39bf00933b', '5467bf57-48b4-4930-b3cb-bf039b259d04', '343a7ee0-5081-4024-82fc-498ee61867a9', '6d590d81-bab9-4b9a-b011-090467b5a9a4', 'accde124-a45f-47be-aefa-b09362b2c5fc', 'a82a7c51-82fd-4bbc-a376-3cd8752a1675')
            | extend SubscriptionId = tolower(tostring(_SubscriptionId)), ResourceGroup = tolower(tostring(_ResourceId))
            | where ObjectName == "System" and CounterName == "System Up Time"
            | summarize arg_max(TimeGenerated, CounterValue) by Computer
            | extend ServerName = tostring(split(Computer,".")[0])
            | extend LastRestartTimeUTC = TimeGenerated - (CounterValue * 1s)
            | extend LastRestartTimePST = LastRestartTimeUTC - 8h
            | project ServerName, LastRestartTime = LastRestartTimePST, Uptime_Hours = toint(CounterValue / 3600)
        """
        serverUptimeCloud_df = queryInLogAnalytics(workspaceId, logAnalyticsQuery, "", "")
        serverUptimeCloud_df["LastRestartTime"] = pd.to_datetime(serverUptimeCloud_df["LastRestartTime"], errors="coerce")

    except Exception as e:
        print("Log Analytics query failed:", e)
        serverUptimeCloud_df = pd.DataFrame()

    # print("Server Uptime fetched:", len(serverUptimeCloud_df))

    return serverUptimeCloud_df

def serverStatus():
    df_ServerNameAppCI = pd.DataFrame()

    server_name_query = f"""SELECT [Server Name], [Application CI], [Hosting Type]
                            FROM [Server List]"""

    connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net",
                                          "crcamonitoring",
                                          "servCRCAMonitoring@providence.org")

    server_name_list = queryDw(connectionString, server_name_query)
    df_ServerNameAppCI = pd.DataFrame(numpy.array(server_name_list),
                                      columns=["ServerName", "AppCI", "HostingType"])

    workspaceId = "552b9630-b106-4fe7-a1fa-97d04a0010ef"

    logAnalyticsQuery = f"""
        Heartbeat
        | where TimeGenerated > ago(5m)
        | extend ServerName = tolower(tostring(Resource))
        | extend TimeGenerated = datetime_utc_to_local(TimeGenerated, 'US/Pacific')
        | extend SubscriptionId = tolower(tostring(SubscriptionId)), ResourceGroup = tolower(tostring(ResourceGroup))
        | where SubscriptionId in ("ab16a144-47d7-45c5-bcb7-8affc988f8e0","9592c342-d1fb-477e-8e91-ad39bf00933b", "5467bf57-48b4-4930-b3cb-bf039b259d04", "343a7ee0-5081-4024-82fc-498ee61867a9", "6d590d81-bab9-4b9a-b011-090467b5a9a4","accde124-a45f-47be-aefa-b09362b2c5fc","a82a7c51-82fd-4bbc-a376-3cd8752a1675")
        | summarize  LastHeartbeat = max(TimeGenerated) by ServerName, SubscriptionId, ResourceGroup, ResourceType 
        | extend CurrentTime = now()
        | extend CurrentTime = datetime_utc_to_local(CurrentTime, 'US/Pacific')
        | extend TimeSinceLastHeartbeat = CurrentTime - LastHeartbeat, HostingType = iff(ResourceGroup contains "rg-azarc-compute-eng-westus2", "OnPremise", "Cloud")
        | extend Status = iif(TimeSinceLastHeartbeat > timespan(5m), "Down", "Up")
        | project ServerName, Status, HostingType"""

    serverStatus_df = queryInLogAnalytics(workspaceId, logAnalyticsQuery, "", "")

    # Merge AppCI
    df_ServerNameAppCI = df_ServerNameAppCI.drop("HostingType", axis=1)
    serverStatus_df = pd.merge(serverStatus_df, df_ServerNameAppCI, on="ServerName", how="left")

    # print("Server Status fetched:", len(serverStatus_df))

    return serverStatus_df

def BackupData():

    backup_query = f"""SELECT 
    vmname AS ServerName,
    Backupstatus AS Backup_Status,
    CAST(BackupStartTime AS TIMESTAMP_NTZ) AS LastBackupDate,
    Source AS Backup_Process
FROM ESI_AERO_PROD_DB.REPORTING.VW_BACKUPANDRESTOREDATA_HISTORY
WHERE IsLatest = 1 AND Org_PillarName = 'CRCA'
QUALIFY ROW_NUMBER() OVER (PARTITION BY vmname ORDER BY BackupStartTime DESC) = 1
ORDER BY LastBackupDate DESC;
"""

    backup_list = queryAeroSnowflake(backup_query)

    if not backup_list:
        return pd.DataFrame()

    backup_data_df = pd.DataFrame(numpy.array(backup_list),
                                  columns=["ServerName", "Backup_Status", "LastBackupDate", "Backup_Process"])

    backup_data_df["LastBackupDate"] = pd.to_datetime(backup_data_df["LastBackupDate"], errors="coerce")
    # print("Backup Data fetched:" , len(backup_data_df))

    # print(backup_data_df.head(), len(backup_data_df))
    return backup_data_df

def connectToDw_AADpwd_Write(serverName, dbName, userName):
    # print(userName)
    pwd = connectToKeyVault("servCRCAMonitoring-AAD-iTelemetry")

    driver= '{ODBC Driver 17 for SQL Server}'
    connectionString = "Driver="+driver+";UID="+userName+";PWD="+pwd+"; Authentication=ActiveDirectoryPassword;Server="+serverName+";Database="+dbName
    #print(connectionString)
    return connectionString

def insert_data_serverstatus(df):
    print(f"[DEBUG] insert_data_serverstatus: START - {len(df)} rows to insert")
    df = df[[
        "ServerName", "HostingType", "Status", "AppCI", "LastRestartTime",
        "Uptime_Hours", "Backup_Status", "LastBackupDate",
        "Backup_Process", "TimeGenerated"
    ]]

    insert_query = """
    INSERT INTO ServerStatus (
        ServerName, HostingType, Status, AppCI, LastRestartTime,
        Uptime_Hours, Backup_Status, LastBackupDate, Backup_Process, TimeGenerated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """

    # Small helpers: NaN/NaT -> None; datetimes must be naive for SQL Server ODBC.
    def _s(v): return None if pd.isna(v) else str(v)
    def _f(v): return None if pd.isna(v) else float(v)
    def _dt(v):
        if pd.isna(v): return None
        dt = v.to_pydatetime() if hasattr(v, "to_pydatetime") else v
        return dt.replace(tzinfo=None) if getattr(dt, "tzinfo", None) else dt

    params = [
        (_s(r.ServerName), _s(r.HostingType), _s(r.Status), _s(r.AppCI),
         _dt(r.LastRestartTime), _f(r.Uptime_Hours),
         _s(r.Backup_Status), _dt(r.LastBackupDate),
         _s(r.Backup_Process), _dt(r.TimeGenerated))
        for r in df.itertuples(index=False)
    ]

    conn_string = connectToDw_AADpwd_Write(
        "sqldb-azure-prod-012.database.windows.net",
        "crcamonitoring",
        "servCRCAMonitoring@providence.org",
    )

    with pyodbc.connect(conn_string) as conn:
        with conn.cursor() as cursor:
            cursor.fast_executemany = True
            # Lock parameter types so fast_executemany doesn't infer NVARCHAR
            # from a row-0 NULL and fail later rows with ODBC 22018.
            cursor.setinputsizes([
                (pyodbc.SQL_WVARCHAR, 255, 0),   # ServerName
                (pyodbc.SQL_WVARCHAR, 50, 0),    # HostingType
                (pyodbc.SQL_WVARCHAR, 50, 0),    # Status
                (pyodbc.SQL_WVARCHAR, 255, 0),   # AppCI
                pyodbc.SQL_TYPE_TIMESTAMP,       # LastRestartTime
                pyodbc.SQL_DOUBLE,               # Uptime_Hours
                (pyodbc.SQL_WVARCHAR, 50, 0),    # Backup_Status
                pyodbc.SQL_TYPE_TIMESTAMP,       # LastBackupDate
                (pyodbc.SQL_WVARCHAR, 100, 0),   # Backup_Process
                pyodbc.SQL_TYPE_TIMESTAMP,       # TimeGenerated
            ])
            cursor.executemany(insert_query, params)
        conn.commit()

    print("[DEBUG] insert_data_serverstatus: END - commit successful")

def connectToKeyVault(name):

    kvUri = "https://akv-monitoring-01.vault.azure.net/"
    #credential = DefaultAzureCredential()
    # credential = AzureCliCredential()
    credential = ManagedIdentityCredential(client_id='015ad614-f9a5-4333-83b4-b71c01c393d8')
    client = SecretClient(vault_url=kvUri, credential=credential)
    retrieved_secret = client.get_secret(name)
    return retrieved_secret.value

serverStatus_df = serverStatus()
serverUptime_df = serverUptime()
serverBackup_df = BackupData()

for df in [serverStatus_df, serverUptime_df, serverBackup_df]:
    if "ServerName" in df.columns:
        df["ServerName"] = df["ServerName"].str.lower()


merged_df = (
    serverStatus_df
    .merge(serverUptime_df, on="ServerName", how="left")
    .merge(serverBackup_df, on="ServerName", how="left")
)

pst = pytz.timezone('America/Los_Angeles')
current_time = datetime.now(pst)
# Pass a naive datetime to SQL Server (ODBC datetime2 rejects tz-aware -> 22018).
merged_df['TimeGenerated'] = current_time.replace(tzinfo=None)


merged_df = merged_df.drop_duplicates().reset_index(drop=True)
print(merged_df.columns)

print(merged_df)

try:
    print("Starting SQL insert for ServerStatus...")
    insert_data_serverstatus(merged_df)
    print("All data inserted successfully into ServerStatus.")
except Exception as e:
    print("Failed during final insert:", e)
