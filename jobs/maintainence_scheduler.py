import threading
import time, json, ast
from flask import jsonify
import requests
from datetime import datetime, timedelta
import pyodbc
import logging
from pytz import timezone
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import win32com.client
import requests
from datetime import datetime
from azure.identity import DefaultAzureCredential, ManagedIdentityCredential
from azure.mgmt.resourcegraph import ResourceGraphClient
from azure.mgmt.resource import ResourceManagementClient
from azure.keyvault.secrets import SecretClient
import os
from azure.identity import ClientSecretCredential
import smtplib
from concurrent.futures import ThreadPoolExecutor
 
from email.mime.text import MIMEText
 
from email.mime.multipart import MIMEMultipart
 
# Configure logging to append to a file
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(levelname)s - %(message)s',
                    handlers=[
                        logging.FileHandler('app_log.txt', mode='a'),  # Append mode
                        logging.StreamHandler()  # Also log to console
                    ])
 
 
# Create a new logger for print statements
print_logger = logging.getLogger('print_statements')
print_logger.setLevel(logging.INFO)
print_logger.propagate = False  # Prevent propagation to root logger
 
# Create handler for print_logger
print_handler = logging.FileHandler('print_statements.log', mode='a')
print_handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
 
# Add handler to print_logger
print_logger.addHandler(print_handler)
 
 
def update_maintenance_status_to_active(servers, connection, uniqueid, credential, cursor, appFamily, userEmail, starttime, endtime, appCiList, recurrence, dl):
    t = 0
    print(appCiList)
    print(dl)
    # disabling all URL alerts
    appcilist_lower = [appci.lower() for appci in appCiList]
    query = f"""UPDATE ServiceMon_InputData SET status = 'Disabled' WHERE LOWER(appci) IN ({', '.join(f"'{appci}'" for appci in appcilist_lower)});"""
    print(query)
    cursor.execute(query)
    connection.commit()
 
 
    # Parse servers if it's a JSON string
    if isinstance(servers, str):
        servers = json.loads(servers)
 
    # Ensure servers is a list of dictionaries
    if not isinstance(servers, list):
        return jsonify({"error": "Invalid data format. Expected a list of servers."}), 400
 
    # Initialize a list to hold the success or failure messages
    responses = []
    all_vms = []
    #print)
    #print("Servers received for update:", servers)
   
    # Function to process each server
    def process_server(server):
        server_id = server.get('id')
        resource_group = server.get('resourceGroup')
        vm_name = server.get('name')
       
        if not all([server_id, resource_group, vm_name]):
            return {"vm_name": vm_name, "status": "failed", "error": "Missing required server fields"}
 
        # Initialize ResourceManagementClient
        subscription_id = server_id.split("/")[2]  # Extract subscription ID
        resource_client = ResourceManagementClient(credential, subscription_id)
        # Build the VM resource id and merge the maintenance tag (only requires
        # Microsoft.Resources/tags/write -> Tag Contributor, not VM Contributor).
        resource_id = (
            f"/subscriptions/{subscription_id}"
            f"/resourceGroups/{resource_group}"
            f"/providers/Microsoft.Compute/virtualMachines/{vm_name}"
        )
        try:
            # Merge only the maintenanceStatus tag, leaving other tags intact.
            resource_client.tags.begin_update_at_scope(
                scope=resource_id,
                parameters={
                    "operation": "Merge",
                    "properties": {
                        "tags": {
                            "maintenanceStatus": "active"
                        }
                    }
                }
            ).result()  # Wait for completion
           
            print(f"Maintenance status successfully updated to Active for server: {vm_name}")
            print_logger.info(f"Maintenance status successfully updated to Active for server: {vm_name}")
            return {"vm_name": vm_name, "status": "updated successfully"}
       
        except Exception as e:
            print(f"Failed to update maintenance status to Active for {vm_name}. Error: {str(e)}")
            print_logger.error(f"Failed to update maintenance status to Active for {vm_name}. Error: {str(e)}", exc_info=True)
            return {"vm_name": vm_name, "status": "failed", "error": str(e)}
   
    # Use ThreadPoolExecutor to process servers in parallel
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = [executor.submit(process_server, server) for server in servers]
        responses = [future.result() for future in futures]
   
    # Collect all VM names for email alert
    all_vms = [response["vm_name"] for response in responses if response["status"] == "updated successfully"]
    all_vms_str = ", ".join(all_vms)
 
    print("All VMs processed:", all_vms_str)
    print_logger.info("All VMs processed: %s", all_vms_str)
   
    # Update database and send email if all updates are successful
    if all(response["status"] == "updated successfully" for response in responses):
        query = "UPDATE maintenance_requests SET status = 'active' WHERE id = ?"
        cursor.execute(query, (uniqueid,))
        connection.commit()
        if(recurrence != 'Daily'):
            send_email_alert(all_vms_str, appFamily, userEmail, starttime, endtime, "active", dl)
    else:
        print("Some updates failed. Check details.")
        print_logger.warning("Some updates failed. Check details.")
   
 
 
 
 
 
def update_maintenance_status_to_inactive(servers, connection, uniqueid, credential, cursor, appFamily, userEmail, starttime, endtime, appCiList, recurrence, dl):
    t = 0
    print(starttime)
    print(endtime)
    print(type(starttime))
    print(type(endtime))
 
    # Enabling all URL alerts
    appcilist_lower = [appci.lower() for appci in appCiList]
    query = f"""UPDATE ServiceMon_InputData SET status = 'Enabled' WHERE LOWER(appci) IN ({', '.join(f"'{appci}'" for appci in appcilist_lower)});"""
    print(query)
    cursor.execute(query)
    connection.commit()
 
    # # Increment both by 7 days
    # starttime += timedelta(days=7)
    # endtime += timedelta(days=7)
    # print(starttime)
    # print(endtime)
    # print(type(starttime))
    # print(type(endtime))
    # # Parse servers if it's a JSON string
    if isinstance(servers, str):
        servers = json.loads(servers)
 
    # Ensure servers is a list of dictionaries
    if not isinstance(servers, list):
        return jsonify({"error": "Invalid data format. Expected a list of servers."}), 400
 
    # Initialize a list to hold the success or failure messages
    responses = []
    all_vms = []
   
    #print("Servers received for update:", servers)
   
    # Function to process each server
    def process_server(server):
        server_id = server.get('id')
        resource_group = server.get('resourceGroup')
        vm_name = server.get('name')
       
        if not all([server_id, resource_group, vm_name]):
            return {"vm_name": vm_name, "status": "failed", "error": "Missing required server fields"}
 
        # Initialize ResourceManagementClient
        subscription_id = server_id.split("/")[2]  # Extract subscription ID
        resource_client = ResourceManagementClient(credential, subscription_id)
        # Build the VM resource id and merge the maintenance tag (only requires
        # Microsoft.Resources/tags/write -> Tag Contributor, not VM Contributor).
        resource_id = (
            f"/subscriptions/{subscription_id}"
            f"/resourceGroups/{resource_group}"
            f"/providers/Microsoft.Compute/virtualMachines/{vm_name}"
        )
        try:
            # Merge only the maintenanceStatus tag, leaving other tags intact.
            resource_client.tags.begin_update_at_scope(
                scope=resource_id,
                parameters={
                    "operation": "Merge",
                    "properties": {
                        "tags": {
                            "maintenanceStatus": "inactive"
                        }
                    }
                }
            ).result()  # Wait for completion
           
            print(f"Maintenance status successfully updated to inactive for server: {vm_name}")
            print_logger.info(f"Maintenance status successfully updated to inactive for server: {vm_name}")
            return {"vm_name": vm_name, "status": "updated successfully"}
       
        except Exception as e:
            print(f"Failed to update maintenance status for {vm_name}. Error: {str(e)}")
            print_logger.error(f"Failed to update maintenance status to inactive for {vm_name}. Error: {str(e)}", exc_info=True)
            return {"vm_name": vm_name, "status": "failed", "error": str(e)}
   
    # Use ThreadPoolExecutor to process servers in parallel
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = [executor.submit(process_server, server) for server in servers]
        responses = [future.result() for future in futures]
   
    # Collect all VM names for email alert
    all_vms = [response["vm_name"] for response in responses if response["status"] == "updated successfully"]
    all_vms_str = ", ".join(all_vms)
 
    print("All VMs processed:", all_vms_str)
    print_logger.warning("All VMs processed: %s", all_vms_str)
   
    # Update database and send email if all updates are successful
    if all(response["status"] == "updated successfully" for response in responses):
        if(recurrence == 'Weekly'):
            print("The recurrence is weekly")
            starttime += timedelta(days=7)
            endtime += timedelta(days=7)
            query = """UPDATE maintenance_requests SET starttime = ?, endtime = ?, status = 'pending' WHERE id = ?"""
            cursor.execute(query, (starttime, endtime, uniqueid))
            connection.commit()
        elif(recurrence == 'Monthly'):
            print("The recurrence is monthly")
            starttime += timedelta(days=30)
            endtime += timedelta(days=30)
            query = """UPDATE maintenance_requests SET starttime = ?, endtime = ?, status = 'pending' WHERE id = ?"""
            cursor.execute(query, (starttime, endtime, uniqueid))
            connection.commit()
        elif(recurrence == 'Daily'):
            print("The recurrence is weekly")
            starttime += timedelta(days=1)
            endtime += timedelta(days=1)
            query = """UPDATE maintenance_requests SET starttime = ?, endtime = ?, status = 'pending' WHERE id = ?"""
            cursor.execute(query, (starttime, endtime, uniqueid))
            connection.commit()
        else:
            query = "UPDATE maintenance_requests SET status = 'archived' WHERE id = ?"
            cursor.execute(query, (uniqueid,))
           
            connection.commit()
        if(recurrence != 'Daily'):
            send_email_alert(all_vms_str, appFamily, userEmail, starttime, endtime, "inactive", dl)
    else:
        print("Some updates failed. Check the responses for details.")
        print_logger.warning("Some updates failed. Check the responses for details.")
   
 
 
 
 
 
 
 
 
# Key Vault that stores the automation SPN client secret.
KEY_VAULT_URI = "https://akv-monitoring-01.vault.azure.net/"
SPN_SECRET_NAME = "clientSecretSpn"


def get_spn_client_secret():
    """Fetch the automation SPN client secret from Key Vault.

    Uses ManagedIdentityCredential (same as the other extractors) so the
    scheduled/prod host authenticates via its managed identity. Raises if the
    secret can't be retrieved so callers fail with a clear message instead of
    the cryptic 'secret should be a Microsoft Entra application's client
    secret' error from ClientSecretCredential.
    """
    credential = ManagedIdentityCredential(client_id='015ad614-f9a5-4333-83b4-b71c01c393d8')
    client = SecretClient(vault_url=KEY_VAULT_URI, credential=credential)
    secret = client.get_secret(SPN_SECRET_NAME).value
    if not secret:
        raise ValueError(f"Key Vault secret '{SPN_SECRET_NAME}' is empty or missing.")
    return secret


# Function to handle maintenance tasks
def handle_task_active(task, connection, action, cursor):
    print(task)
    server_details = task[0]
    uniqueid = task[3]
    appFamily = task[5]
    userEmail = task[6]
    startTime = task[1]
    endTime = task[2]
    appCi = task[9]
    recurrence = task[10]
    dl = task[11]
    print("The dl is", dl)
    # Authenticate using SPN
    tenant_id = "2e319086-9a26-46a3-865f-615bed576786"
    client_id = "e2ff3825-261b-418f-9878-c1c031c4cd2a"
    client_secret = get_spn_client_secret()
    credential = ClientSecretCredential(tenant_id=tenant_id, client_id=client_id, client_secret=client_secret)
    print(appCi)
    print(type(appCi))
    appCi_list = ast.literal_eval(appCi)
    print(appCi_list)
    print(type(appCi_list))
    if action == 'start':
        update_maintenance_status_to_active(server_details, connection, uniqueid, credential, cursor, appFamily, userEmail, startTime, endTime, appCi_list, recurrence, dl)
    #print("tested")
 
 
def handle_task_inactive(task, connection, action, cursor):
   
    server_details = task[0]
    uniqueid = task[3]
    appFamily = task[5]
    userEmail = task[6]
    startTime = task[1]
    endTime = task[2]
    appCi = task[9]
    recurrence = task[10]
    dl = task[11]
    # Authenticate using SPN
    tenant_id = "2e319086-9a26-46a3-865f-615bed576786"
    client_id = "e2ff3825-261b-418f-9878-c1c031c4cd2a"
    client_secret = get_spn_client_secret()
    credential = ClientSecretCredential(tenant_id=tenant_id, client_id=client_id, client_secret=client_secret)
    print(appCi)
    print(type(appCi))
    appCi_list = ast.literal_eval(appCi)
    print(appCi_list)
    print(type(appCi_list))
   
   
    if action == 'end':
        update_maintenance_status_to_inactive(server_details, connection, uniqueid, credential, cursor, appFamily, userEmail, startTime, endTime, appCi_list, recurrence, dl)    
   
    #print("tested")
 
 
 
# Function to fetch new tasks from the database
def fetch_new_tasks(connection):
    try:
        cursor = connection.cursor()
 
        # Get the current time in PST
        current_time = datetime.now().astimezone(timezone('US/Pacific'))
        print("Fetching new tasks at: ",current_time)
        print_logger.info(f"Fetching new tasks at {current_time}")
 
       
        # Fetch tasks with start time <= current time <= endtime
       
        cursor.execute("""
             SELECT * FROM maintenance_requests WHERE status = 'pending' and startTime <= ? AND endTime >= ?
         """, (current_time,current_time,))
       
 
        active_tasks = cursor.fetchall()
        print(active_tasks)
     
 
        # Fetch tasks with current time > endtime
 
        cursor.execute("""
            SELECT * FROM maintenance_requests WHERE status = 'active' AND endTime < ?""", (current_time,))
        # cursor.execute("""
        #     SELECT * FROM maintenance_requests WHERE status = 'active' and userEmail like 'Ayush.Mallick@providence.org'""")
       
        inactive_tasks = cursor.fetchall()
        print(inactive_tasks)
 
 
        def handle_active_tasks():
            # Authenticate using SPN
            for task in active_tasks:
                handle_task_active(task, connection, "start", cursor)
 
        def handle_inactive_tasks():
            for task in inactive_tasks:
                handle_task_inactive(task, connection, "end", cursor)
       
        # Create and start threads
        active_thread = threading.Thread(target=handle_active_tasks, daemon=True)
        inactive_thread = threading.Thread(target=handle_inactive_tasks, daemon=True)
 
        active_thread.start()
        inactive_thread.start()
 
        # Wait for both threads to complete
        active_thread.join()
        inactive_thread.join()
       
 
 
    except Exception as e:
        logging.error(f"Database query error: {e}")
        print_logger.error("Database query error")
        return False  # Indicate an error occurred
 
    return True  # Indicate successful fetch
 
def connectToDw_AADpwd(serverName, dbName):
    pwd = r"<N!85Ye\7z=m)K)L"
    driver = '{ODBC Driver 17 for SQL Server}'
    connectionString = f"Driver={driver};Server={serverName};Database={dbName};Authentication=ActiveDirectoryPassword;UID=servCRCAMonitoring@providence.org;PWD={pwd}"
    return connectionString
 
def get_secret_id_spn(vault_url):
    credential = ManagedIdentityCredential(client_id='015ad614-f9a5-4333-83b4-b71c01c393d8')
   
    # Initialize the SecretClient using the Managed Identity credential
    secret_client = SecretClient(vault_url=vault_url, credential=credential)
 
 
    # Define the secret name you want to retrieve
    secret_name = "autoServPrin"
    retrieved_secret = secret_client.get_secret(secret_name)
   
    return retrieved_secret.value
 
 
def send_email_alert(vm_name, appFamily, userEmail, starttime, endtime, status, dl):
    #sender_email = "CRCAMaintenance_Alerts@providence.org"
    sender_email = "MaintenanceAlert_Itelemetry@providence.org"
    #sender_email = "ayush.mallick@providence.org"
    receiver_email = [
        userEmail,"ayush.mallick@providence.org", dl
    ]
    print(receiver_email)
    subject = "Update - Maintenance Status"
 
    message_obj = MIMEMultipart()
    message_obj["Subject"] = subject
    message_obj["From"] = sender_email
    message_obj["To"] = ", ".join(receiver_email)
    # Creating the email body
    if status == "active":
        alert_message = f"""
        <html>
        <body>
            <p><strong>App Family</strong> - {appFamily}</p>
            <p><strong>Server Names</strong> - {vm_name}</p>
            <p><strong>StartTime (PST)</strong> - {starttime}</p>
            <p><strong>EndTime (PST)</strong> - {endtime}</p>
           
            <p>The maintenance status for the above servers is successfully set to "Active" from {starttime} to {endtime}.</p>
           
            <p><strong>Note - This is an automated alert. Please reach out to the itelemetry team for any issues.</strong></p>
       
        </body>
        </html>
    """
    else:
        alert_message = f"""
        <html>
        <body>
            <p><strong>App Family</strong> - {appFamily}</p>
            <p><strong>Server Names</strong> - {vm_name}</p>
            <p><strong>StartTime (PST)</strong> - {starttime}</p>
            <p><strong>EndTime (PST)</strong> - {endtime}</p>
           
            <p>The maintenance status for the above servers is successfully set to "inactive".</p>
           
            <p><strong>Note - This is an automated alert. Please reach out to the itelemetry team for any issues.</strong></p>
           
 
        </body>
        </html>
    """
       
    part = MIMEText(alert_message, "html")
    message_obj.attach(part)
   
    try:
        with smtplib.SMTP("smtplegacy.providence.org", 25) as server:
            server.sendmail(sender_email, receiver_email, message_obj.as_string())
        print("Email sent successfully")
        print_logger.info("Email sent successfully")
 
   
    except Exception as e:
        print(f"Error sending email: {e}")
        print_logger.error("Error sending email")
 
# Main function to initiate the script.
# Designed to run ONE pass and then exit, so it can be scheduled
# (e.g. every 3 minutes) via Windows Task Scheduler instead of looping forever.
def main():
    print("The existing pyodbc drivers are:", pyodbc.drivers())
    connection = None
    max_retries = 5

    current_time = datetime.now().astimezone(timezone('US/Pacific'))
    connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring")

    # Try to connect (bounded retries), run a single fetch/process pass, then return.
    for attempt in range(1, max_retries + 1):
        try:
            connection = pyodbc.connect(connectionString, timeout=15)  # Set a connection timeout
            logging.info("Connected to the database successfully.")
            print(f"Connected to the database successfully at {current_time}")

            if fetch_new_tasks(connection):
                logging.info("Maintenance run completed successfully.")
                print_logger.info(f"Maintenance run completed at {current_time}")
            else:
                logging.warning("Fetch new tasks failed during this run.")
                print("Fetch new tasks failed during this run.")
                print_logger.warning("Fetch new tasks failed during this run.")

            break  # single pass done for this scheduled invocation

        except Exception as e:
            logging.error(f"Error connecting to the database: {e}")
            print_logger.error(f"Error connecting to the database: {e}")
            print(f"Error connecting to the database: {e}")
            if attempt >= max_retries:
                logging.critical("Max retries reached. Exiting...")
                break
            logging.info(f"Retrying to connect to the database... ({attempt}/{max_retries})")
            print(f"Retrying to connect to the database... ({attempt}/{max_retries})")
            time.sleep(10)  # Wait before retrying

        finally:
            if connection:
                connection.close()
                connection = None

# Entry point for the script
if __name__ == "__main__":
    main()