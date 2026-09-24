import subprocess
import json
import sys
from pathlib import Path
import pandas as pd

root = Path(__file__).resolve().parents[1] / "backend"
sys.path.append(str(root))

from datetime import datetime, timezone
import re
import numpy as np
from shared.keyVault import connectToKeyVault
from shared.dataBase import connectToDw_AADpwd, queryDw
from azure.kusto.data import KustoConnectionStringBuilder, DataFormat
from azure.kusto.ingest import IngestionProperties, QueuedIngestClient
from azure.identity import AzureCliCredential, ManagedIdentityCredential

def date_formatting(date_string):
    """
    Convert .NET JSON date format /Date(milliseconds)/ to datetime string
    Example: /Date(1798023788810)/ -> '2027-01-06 19:54:55'
    """
    if not date_string or date_string == "Never Expires":
        return None
    try:
        # Check if it's in /Date(...)/ format
        if isinstance(date_string, str) and date_string.startswith('/Date('):
            # Extract the timestamp using regex
            match = re.search(r'/Date\((\d+)\)/', date_string)
            if match:
                timestamp_ms = int(match.group(1))
                timestamp_sec = timestamp_ms / 1000.0
                # Use timezone-aware datetime
                dt = datetime.fromtimestamp(timestamp_sec, tz=timezone.utc)
                return dt.strftime('%Y-%m-%d %H:%M:%S')
        try:
            dt = pd.to_datetime(date_string)
            return dt.strftime('%Y-%m-%d %H:%M:%S')
        except:
            return None
            
    except Exception as e:
        print(f"Warning: Could not parse date '{date_string}': {e}")
        return None

def insertToADX(df):
    """Insert dataframe into Azure Data Explorer using queued ingestion"""
    ingest_cluster = "https://ingest-telemetrycrcav2.westus2.kusto.windows.net"
    database = "crca_monitoring_telemetry"
    table = "Credential_Inventory"
    
    try:
        credential = ManagedIdentityCredential(client_id='015ad614-f9a5-4333-83b4-b71c01c393d8')
    except:
        credential = AzureCliCredential()
    
    # Set timestamps
    current_time = datetime.now(timezone.utc)
    df['TimeGenerated'] = current_time
    df['LastUpdated'] = current_time
    
    # Ingest data
    print(f"Inserting {len(df)} records to ADX...")
    
    ingest_kcsb = KustoConnectionStringBuilder.with_azure_token_credential(ingest_cluster, credential)
    
    ingestion_properties = IngestionProperties(
        database=database,
        table=table,
        data_format=DataFormat.CSV
    )
    
    try:
        ingest_client = QueuedIngestClient(ingest_kcsb)
        ingest_client.ingest_from_dataframe(df, ingestion_properties)
        print(f"✓ Successfully queued {len(df)} records for ingestion into ADX table '{table}'")
        print(f"  Note: Data will appear in 5-10 minutes (queued ingestion)")
    except Exception as ex:
        print(f"✗ Failed to ingest data into ADX: {ex}")
        raise

def query_ad_accounts():
    """Query Active Directory for service accounts via PowerShell"""
    ps_script = Path(__file__).parent / "PushServAccPasswordExpiry_toADX.ps1"    
    print("Fetching password from Azure Key Vault...")    
    try:
        password = connectToKeyVault("servCRCAMonitoring-AAD-iTelemetry")
        print("✓ Password retrieved from Key Vault")
    except Exception as e:
        print(f"✗ Failed to fetch password from Key Vault: {e}")
        return []    
    print("Querying Active Directory...")    
    try:
        result = subprocess.run(
            [
                "powershell.exe",
                "-ExecutionPolicy", "Bypass",
                "-File", str(ps_script),
                "-Password", password,
                "-OutputJson"
            ],
            capture_output=True,
            text=True,
            timeout=300
        )        
        if result.returncode == 0:
            output = result.stdout.strip()
            json_start = -1
            for i, char in enumerate(output):
                if char in ['[', '{']:
                    json_start = i
                    break            
            if json_start >= 0:
                json_data = output[json_start:]
                accounts = json.loads(json_data)                
                if isinstance(accounts, dict):
                    accounts = [accounts]                
                print(f"✓ Retrieved {len(accounts)} accounts from AD")
                return accounts
            else:
                print("✗ No JSON found in output")
                return []                
        else:
            print("✗ PowerShell failed:", result.stderr)
            return []            
    except Exception as e:
        print(f"✗ Error: {e}")
        return []

def transform_data(accounts):
    if not accounts:
        return pd.DataFrame()    
    df = pd.DataFrame(accounts)
    apm_numbers = df['APMNumber'].dropna().unique().tolist()    
    apm_numbers = [str(apm).strip() for apm in apm_numbers if apm and str(apm).strip()]
    if apm_numbers:
        print(f"\nFetching Application CIs for {len(apm_numbers)} APM numbers...")
        df_app_ci = fetchAppCIs(apm_numbers)

        if not df_app_ci.empty:
            df = df.merge(
                df_app_ci[['APMNumber', 'ApplicationCI']].drop_duplicates(),
                left_on='APMNumber',
                right_on='APMNumber',
                how='left'
            )
            df = df.rename(columns={"ApplicationCI" : 'AppCI'})
            df['AppCI'] = df['AppCI'].str.lower()
            print(f"✓ Merged Application CI data for {df['AppCI'].notna().sum()} accounts")
    if 'ExpiryDate' in df.columns:
        df['ExpiryDate'] = df['ExpiryDate'].apply(date_formatting)
    
    def build_resource_id(row):
        """Build a slash-separated string from all additional fields"""
        parts = []
        # if 'Name' in row and pd.notna(row['Name']):
        #     parts.append(f"Name/{row['Name']}")
        # else:
        #     parts.append("Name/NA")
       
        exclude_fields = ['Email', 'ExpiryDate']
        for col in df.columns:
            if col not in exclude_fields:
                # Check if value is empty, NaN, None, or just whitespace
                if pd.isna(row[col]) or not str(row[col]).strip():
                    parts.append(f"{col}/NA")
                else:
                    parts.append(f"{col}/{str(row[col]).strip()}")
        
        return '/'.join(parts) if parts else ''
    
    df['CombinedResourceId'] = df.apply(build_resource_id, axis=1)
    column_mapping = {
        'Email': 'SecretId',
        'ExpiryDate': 'Value',
        'CombinedResourceId': 'ResourceId',
    }    
    df = df.rename(columns=column_mapping)
    df['ObjectName'] = 'Service Account Password'
    df["CounterName"] = 'Expiry'
    df = df[['SecretId', 'Value', 'ResourceId', 'ObjectName', 'CounterName']]
    return df

def fetchAppCIs(apm_list):
    """Fetch application CI information from crcamonitoring database based on APM numbers."""
    if not apm_list:
        print("⚠ No APM numbers provided to fetch Application CIs")
        return pd.DataFrame()
    serverName = 'sqldb-azure-prod-012.database.windows.net'
    dBname = 'crcamonitoring'
    username = 'servCRCAMonitoring@providence.org'
    try:
        connectionString = connectToDw_AADpwd(serverName, dBname, username)
        apm_list_sql = ','.join([f"'{apm}'" for apm in apm_list if apm and str(apm).strip()])
        query = f"""
            SELECT [Application CI],[APM Number]
            FROM [dbo].[Application List] where [APM Number] in ({apm_list_sql})
        """
        print(f"Querying database for {len(apm_list)} APM numbers...", query)
        res = queryDw(connectionString, query)
        if res:
            df = pd.DataFrame(np.array(res), columns=["ApplicationCI", "APMNumber"])
            return df
        else:
            print("⚠ No matching AppCIs found in database")
            return pd.DataFrame()
    except Exception as e:
        print(f"✗ Error fetching Application CIs: {e}")
        return pd.DataFrame()

if __name__ == "__main__":
    try:
        accounts = query_ad_accounts()        
        if accounts:
            df = transform_data(accounts)           
            if not df.empty:
                print("\n✓ Process completed Before!")
                insertToADX(df)
                print("\n✓ Process completed After!")
            else:
                print("✗ No data to insert")
        else:
            print("✗ No data retrieved from Active Directory")            
    except Exception as ex:
        print(f"\n✗ Process failed: {ex}")