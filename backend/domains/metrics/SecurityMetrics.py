from flask import Blueprint, request, jsonify
import pandas
from datetime import datetime, timezone
from shared.dataBase import exceptioninfo, insert_data
from shared.ADX import readFromADX

from shared.appinsights_logger import log_performance, error_response

SecurityMetrics = Blueprint('credentialInventory', __name__)

@SecurityMetrics.route('/api/credentialInventory', methods=['POST'])
@log_performance()
def getCredentialInventory():
    """
    Unified API to fetch credential expiry data (Service Accounts + Venafi Certificates).
    """
    try:
        dataPost = request.get_json() or {}
        application_ci = dataPost.get('applicationCI', None)
        object_type = dataPost.get('objectType', 'all')
        
        query = """
            Credential_Inventory
        """
        if object_type == 'service_account':
            query += """
            | where ObjectName == "Service Account Password"
            """
        elif object_type == 'venafi_certificate':
            query += """
            | where ObjectName contains "Venafi Certificate"
            """
        
        if application_ci is not None and application_ci != "":
            query += f"""
            | where ResourceId contains "AppCI/{application_ci}"
            """
        query += """
            | summarize arg_max(LastUpdated, *) by SecretId
            | project
                TimeGenerated,
                ResourceId,
                ObjectName,
                CounterName,
                SecretId,
                Value,
                LastUpdated
            | order by Value asc
        """
        df = readFromADX(query)
        credentials = []
        
        for _, row in df.iterrows():
            # Parse ResourceId to extract metadata
            resource_id = row["ResourceId"]
            metadata = {}
            
            if resource_id and isinstance(resource_id, str):
                # Generic AppCI extraction: find '/AppCI/' and get the value after it (until next '/' or end)
                if '/AppCI/' in resource_id:
                    appci_index = resource_id.find('/AppCI/')
                    appci_value = resource_id[appci_index + 7:]  # Get everything after '/AppCI/'
                    # If there's another '/' after, take only up to that
                    if '/' in appci_value:
                        appci_value = appci_value.split('/')[0]
                    appci_value = appci_value.rstrip(',')  # Remove trailing comma if present
                    if appci_value and appci_value != "NA":
                        metadata['AppCI'] = appci_value
                
                # Split by '/' and parse key/value pairs for other metadata
                parts = resource_id.split('/')
                for i in range(0, len(parts)-1, 2):
                    if i+1 < len(parts):
                        key = parts[i]
                        value = parts[i+1]
                        if key not in metadata:  # Don't override already extracted values
                            metadata[key] = value if value != "NA" else None
            
            # Ensure timestamps are UTC-aware before converting to ISO format
            timeGenerated = None
            if pandas.notna(row["TimeGenerated"]):
                dt = pandas.to_datetime(row["TimeGenerated"], utc=True)
                timeGenerated = dt.isoformat()
            
            expiryDate = None
            daysUntilExpiry = None
            if pandas.notna(row["Value"]):
                dt = pandas.to_datetime(row["Value"], utc=True)
                expiryDate = dt.isoformat()
                now = datetime.now(timezone.utc)
                daysUntilExpiry = (dt - now).days
            
            lastUpdated = None
            if pandas.notna(row["LastUpdated"]):
                dt = pandas.to_datetime(row["LastUpdated"], utc=True)
                lastUpdated = dt.isoformat()
            
            # Unified credential object with all possible fields (NA for non-existing)
            
            # Extract keyvault name from ResourceId (format: .../vaults/kv-name/...)
            keyvault_name = "NA"
            if resource_id and "/vaults/" in resource_id:
                vaults_index = resource_id.find("/vaults/")
                after_vaults = resource_id[vaults_index + 8:]  # Get everything after '/vaults/'
                if '/' in after_vaults:
                    keyvault_name = after_vaults.split('/')[0]
                else:
                    keyvault_name = after_vaults.rstrip(',')
            
            credential = {
                "timeGenerated": timeGenerated,
                "objectName": row["ObjectName"],
                "counterName": row["CounterName"],
                "secretId": row["SecretId"],
                "expiryDate": expiryDate,
                "daysUntilExpiry": daysUntilExpiry,
                "lastUpdated": lastUpdated,
                
                # Service Account fields
                "accountName": row["SecretId"] if "Service Account" in str(row["ObjectName"]) else "NA",
                "name": metadata.get("Name", "NA"),
                "displayName": metadata.get("DisplayName", "NA"),
                "samAccountName": metadata.get("SamAccountName", "NA"),
                "userDomain": metadata.get("UserDomain", "NA"),
                "managerName": metadata.get("ManagerName", "NA"),
                "managerDepartment": metadata.get("ManagerDepartment", "NA"),
                "passwordNeverExpires": metadata.get("PasswordNeverExpires", "NA"),
                
                # Venafi Certificate fields
                "certificateName": row["SecretId"] if "Certificate" in str(row["ObjectName"]) else "NA",
                "subscriptionId": metadata.get("SubscriptionID", "NA"),
                "resourceGroup": metadata.get("ResourceGroup", "NA"),
                "serverName": metadata.get("ServerName", "NA"),
                
                # Keyvault fields
                "keyvaultName": keyvault_name,
                
                # Common fields
                "applicationCI": metadata.get("AppCI") or metadata.get("ApplicationCI", "NA"),
                "apmNumber": metadata.get("APMNumber", "NA")
            }
            
            credentials.append(credential)

        credentials_df = pandas.DataFrame(credentials)
        
        return jsonify({
            "Data": credentials_df.to_json(),
            "status": 200,
            "count": len(credentials),
            "objectType": object_type
        }), 200

    except Exception as ex:
        info = exceptioninfo(ex)
        insert_data(info)
        return error_response(500, "Failed to fetch credential inventory", detail=info, exc=ex)