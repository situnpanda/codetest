import requests
import json
import pandas as pd
import numpy as np
import urllib3
import base64
import aiohttp
import asyncio
from datetime import datetime, timezone
from cryptography import x509
from cryptography.hazmat.backends import default_backend
from azure.identity import AzureCliCredential
from azure.kusto.data import KustoConnectionStringBuilder, DataFormat
from azure.kusto.ingest import IngestionProperties, QueuedIngestClient
from database import connectToKeyVault, connectToDw_AADpwd, connectToDw_AADpwd_Write, queryDw, exceptioninfo

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def get_venafi_token():
    """Authenticate with Venafi API using OAuth."""
    password = connectToKeyVault("Venafi-iTelemetry")
    if not password:
        raise Exception("Failed to fetch Venafi password from Key Vault")

    payload = {
        "username": "svc.TEOSQLDATA@ca.providence.org",
        "password": password,
        "grant_type": "password",
        "client_id": "AERO",
        "scope": "certificate:manage,discover;configuration:manage"
    }

    resp = requests.post("https://pki.providence.org/vedauth/authorize/oauth", 
                        json=payload, verify=False, timeout=30)
    
    if resp.status_code == 200:
        return resp.json().get("access_token")
    raise Exception(f"Venafi OAuth failed: {resp.status_code}, {resp.text}")

def fetch_certificates(token):
    """Fetch certificate list from Venafi."""
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    resp = requests.get("https://pki.providence.org/vedsdk/certificates/", 
                       headers=headers, verify=False, timeout=60)
    
    if resp.status_code == 200:
        return resp.json().get("Certificates", [])
    raise Exception(f"Failed to fetch certificates: {resp.status_code}")

def parse_certificate(base64_cert):
    """Decode Base64 certificate and extract expiry date."""
    try:
        cert_pem = base64.b64decode(base64_cert.strip().replace('\n', '').replace('\r', ''))
        cert = x509.load_pem_x509_certificate(cert_pem, default_backend())
        
        try:
            cn = cert.subject.get_attributes_for_oid(x509.oid.NameOID.COMMON_NAME)[0].value
        except:
            cn = None
        
        return {"expiry_date": cert.not_valid_after, "common_name": cn}
    except Exception as e:
        print(f"  Error parsing certificate: {e}")
        return None

def get_server_list():
    """Fetch server list from crcamonitoring database."""
    serverName = 'sqldb-azure-prod-012.database.windows.net'
    dBname = 'crcamonitoring'
    username = 'servCRCAMonitoring@providence.org'
    
    connectionString = connectToDw_AADpwd(serverName, dBname, username)
    query = """
        SELECT [Resource Name], [Server Name], [Subscription ID], [Resource Group], 
               [Application CI]
        FROM [dbo].[Server List]
    """
    res = queryDw(connectionString, query)
    df = pd.DataFrame(np.array(res), columns=["ResourceName", "ServerName", "SubscriptionID", 
                                               "ResourceGroup", "ApplicationCI"])
    df["ServerNameLower"] = df["ServerName"].str.lower().str.strip()
    print(f"Loaded {len(df)} servers from database")
    return df

def extract_server_name(cert_name):
    """Extract server name from certificate CN."""
    if not cert_name:
        return None
    
    cert_lower = cert_name.lower().strip()
    for suffix in ['.wa.providence.org', '.stjoe.org', '.providence.org', '.hp.providence.org']:
        if suffix in cert_lower:
            cert_lower = cert_lower.split(suffix)[0]
            break
    
    return cert_lower.split('.')[0] if '.' in cert_lower else cert_lower

async def fetch_cert_async(session, token, guid, dn, cert_name, sem):
    """Fetch certificate details and PEM data."""
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    async with sem:
        try:
            async with session.post("https://pki.providence.org/vedsdk/certificates/retrieve",
                                   headers=headers, json={"CertificateDN": dn, "Format": "Base64"},
                                   ssl=False, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                if resp.status == 200:
                    text = await resp.text()
                    try:
                        json_resp = await resp.json()
                        return json_resp.get("CertificateData") or json_resp.get("certificateData") or text
                    except:
                        return text
        except Exception as e:
            print(f"  Warning: Failed to retrieve {cert_name}: {e}")
        return None

async def process_certificates(token, certificates):
    """Process all certificates in parallel."""
    sem = asyncio.Semaphore(20)
    connector = aiohttp.TCPConnector(ssl=False)
    
    async with aiohttp.ClientSession(connector=connector) as session:
        tasks = []
        for idx, cert in enumerate(certificates, 1):
            guid = cert.get("Guid", "").strip('{}')
            dn = cert.get("DN")
            name = cert.get("Name", f"cert_{idx}")
            
            if guid and dn:
                tasks.append(fetch_cert_async(session, token, guid, dn, name, sem))
        
        print(f"Processing {len(tasks)} certificates in parallel...")
        results = await asyncio.gather(*tasks)
        
        cert_data = []
        for i, (cert, pem) in enumerate(zip(certificates, results)):
            if pem:
                parsed = parse_certificate(pem)
                if parsed:
                    cert_data.append({
                        "CertificateName": cert.get("Name") or parsed.get("common_name"),
                        "ExpiryDate": parsed.get("expiry_date")
                    })
        
        return pd.DataFrame(cert_data)

def insert_to_adx(df, database, table):
    """Insert certificate data directly to ADX table."""
    cluster = "https://ingest-telemetrycrcav2.westus2.kusto.windows.net"
    credential = AzureCliCredential()
    
    try:
        kcsb = KustoConnectionStringBuilder.with_azure_token_credential(cluster, credential)
        ingest_client = QueuedIngestClient(kcsb)
        
        ingestion_properties = IngestionProperties(
            database=database,
            table=table,
            data_format=DataFormat.CSV,
            ingestion_mapping_reference="CredentialMapping",
        )
        
        ingest_client.ingest_from_dataframe(df, ingestion_properties)
        print(f"✓ Data ingestion initiated to {table}: {len(df)} records")
    except Exception as ex:
        print(f"Error inserting to ADX: {ex}")
        info = exceptioninfo(ex)
        raise Exception(info)

try:
    database = "crca_monitoring_telemetry"
    table = "Credential_Inventory"
    
    print("Step 1: Getting OAuth token...")
    token = get_venafi_token()
    
    print("Step 2: Fetching server list...")
    server_df = get_server_list()
    
    print("Step 3: Listing certificates...")
    certificates = fetch_certificates(token)
    print(f"Found {len(certificates)} certificates")
    
    print("Step 4: Fetching certificate data...")
    cert_df = asyncio.run(process_certificates(token, certificates))
    
    print("Step 5: Mapping to servers...")
    final_records = []
    time_generated = datetime.now(timezone.utc).replace(tzinfo=None)
    
    for _, row in cert_df.iterrows():
        cert_name = row.get("CertificateName")
        expiry = row.get("ExpiryDate")
        
        if not cert_name or not expiry:
            continue
        
        server_name = extract_server_name(cert_name)
        if not server_name:
            continue
        
        server_match = server_df[server_df["ServerNameLower"] == server_name]
        if server_match.empty:
            continue
        
        server = server_match.iloc[0]
        resource_id = f"SubscriptionID/{server['SubscriptionID']}/ResourceGroup/{server['ResourceGroup']}/ServerName/{server['ServerName']}/AppCI/{server['ApplicationCI']}"
        
        final_records.append({
            "TimeGenerated": time_generated,
            "ResourceId": resource_id,
            "ObjectName": "VM Venafi Certificate",
            "CounterName": "Expiry",
            "SecretId": cert_name,
            "Value": expiry.replace(tzinfo=None) if hasattr(expiry, 'replace') else expiry,
            "LastUpdated": time_generated
        })
    
    final_df = pd.DataFrame(final_records)
    print(f"Mapped {len(final_df)} certificates to servers (out of {len(cert_df)} total)")
    
    if not final_df.empty:
        final_df = final_df[["TimeGenerated", "ResourceId", "ObjectName", "CounterName", "SecretId", "Value", "LastUpdated"]]
        insert_to_adx(final_df, database, table)
    else:
        print("No data to process")
    
except Exception as ex:
    print(f"Error: {ex}")
    import traceback
    traceback.print_exc()