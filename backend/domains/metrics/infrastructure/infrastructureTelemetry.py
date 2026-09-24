import pandas as pd
import numpy
import requests
from requests.auth import HTTPBasicAuth
from datetime import datetime, timedelta
import pytz
from shared.keyVault import connectToKeyVault
from shared.dataBase import connectToDw, queryDw, deleteDw,insertDw, connectToDw_AADpwd, connectToDw_AADpwd_Write, exceptioninfo, insert_data, connectToAeroDw_SqlServerPwd, connectToDw_SqlServerPwd, connectToDw_SQLServerAero,connectToDw_SqlServerPwdScom, queryAeroSnowflake
from shared.LogAnalytics import queryInLogAnalytics
from domains.metrics.infrastructure.Pages.ServerStatus.OnPrem import onPremServerStatus
from domains.metrics.infrastructure.Pages.CpuUtilization.OnPrem import onPremCpuUtilization
from domains.metrics.infrastructure.Pages.CpuUtilization.Azure import azureCpuUtilization, processDataForDuration
from domains.metrics.infrastructure.Pages.MemoryUtilization.OnPrem import onPremMemoryUtilization
from domains.metrics.infrastructure.Pages.MemoryUtilization.Azure import azureMemoryUtilization
from domains.metrics.infrastructure.Pages.NetworkUtilization.Azure import azureNetworkUtilization
from domains.metrics.infrastructure.Pages.FileshareUtilization.Azure import azureFileshareUtilization
from domains.metrics.infrastructure.Pages.DiskUtilization.Azure import azureDiskUtilization
from domains.metrics.infrastructure.Pages.DiskUtilization.OnPrem import onPremDiskUtilization
from domains.metrics.infrastructure.Pages.DatabaseMetrics.Azure import azureDbMetics
from azure.mgmt.resourcegraph import ResourceGraphClient
from azure.identity import DefaultAzureCredential, AzureCliCredential, ManagedIdentityCredential,ClientSecretCredential
from flask import jsonify
import os
import time
import json
import numpy as np
from shared.filters import filtersData, filtersData_SubRg
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart



serverData ={
        "Server": pd.DataFrame(),
        "total_servers": 0,
        "VmsUp": 0,
        "VmsDeallocated": 0,
        "Count":-1
}

serverEnvironmentData ={
    "Server": pd.DataFrame(),
    "Production" : 0,
    "Development" : 0,
    "Test" : 0,
    "Count" : -1
}

windowEventData={
    "Server": pd.DataFrame(),
    "ApplicationLogs": 0,
    "SystemLogs": 0,
    "SecurityLogs": 0,
    "Count": -1
}

VMRebootData={
    "Server": pd.DataFrame(),
    "GracefulReboot": 0,
    "CrashReboot": 0,
    "Count": -1
}

workstationMetricsData={
    "Server":pd.DataFrame(),
    "totalWorkstations":0,
    "CPUUtization":0,
    "memoryUtilization":0,
    "Count":-1
}

azureServerMetricsCPUData={
    "Server":pd.DataFrame()
}

azureServerMetricsMemoryData={
    "Server":pd.DataFrame()
}

azureServerMetricsNetworkData={
    "Server":pd.DataFrame(),
    "NetworkUtilization":0,
    "ServerNames": [],
    "Count":-1
}

azureServerMetricsFileshareData={
    "Server":pd.DataFrame(),
    "FileshareUtilization":0,
    "ServerNames": [],
    "Count":-1
}
azureServerMetricsDiskData={
    "Server":pd.DataFrame()
}

BASE_DIR = os.path.dirname(os.path.abspath(__file__))  # Get current file's directory
CACHE_FOLDER = os.path.join(BASE_DIR, "..", "cache")
SERVERLIST_JSON_PATH = os.path.join(CACHE_FOLDER, "serverList.json")
ServerMetrics_JSON_PATH = os.path.join(CACHE_FOLDER, "serverMetrics.json")

def sendEmail(name, supportGroups):
    sender_email = "SupportGroupRequest_Itelemetry@providence.org"
    receiver_email = [
         "ayush.mallick@providence.org", "sairamanan.mk@providence.org", "situn.panda@providence.org", "shreya.ghosh@providence.org"
    ]
 
    subject = "Support Group Access Request"
 
    message_obj = MIMEMultipart()
    message_obj["Subject"] = subject
    message_obj["From"] = sender_email
    message_obj["To"] = ", ".join(receiver_email)

    message = f"""
        <html>
        <body>
            <p><strong>User Name</strong> - {name}</p>
            <p><strong>Support Groups Requested</strong> - {supportGroups}</p>
        </body>
        </html>
    """
    part = MIMEText(message, "html")
    message_obj.attach(part)
    
    try:
        with smtplib.SMTP("smtplegacy.providence.org", 25) as server:
            server.sendmail(sender_email, receiver_email, message_obj.as_string())
        print("Email sent successfully")

    except Exception as e:
        print(f"Error sending email: {e}")

    return True    


def cacheAlertInfraData(filter, starttime, aggregateBool, endtime, readWriteType):
    try:
        print("🔄 Fetching Alerts data from database...")
        connectToServicePerf = connectToDw_SqlServerPwd("spidedbsv6c6b60.wa.providence.org\\SPIDER", "ServicePerf_DW", "servCRCAMonitor")
        connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")

        apmNumbers = filtersData(filter, "apmNumber")
        cpu_df = azureServerMetrics_CPU_df(aggregateBool, "", "", connectToCrcaMonitoring, apmNumbers, starttime, endtime)
        mem_df = azureServerMetrics_Memory_df(aggregateBool, "", "", connectToCrcaMonitoring, apmNumbers, starttime, endtime)
        disk_df = azureServerMetrics_Disk_df(aggregateBool, "", "", connectToCrcaMonitoring, apmNumbers, starttime, endtime)
 
        print(len(cpu_df["Server"]), len(mem_df["Server"]), len(disk_df["Server"]))
        alertsInfraDict = {
            "Cpu Data" : cpu_df["Server"].to_json(),
            "Memory Data" : mem_df["Server"].to_json(),
            "Disk Data" : disk_df["Server"].to_json(),
            "TimeOfUpdate" : endtime
        }
        
        with open(ServerMetrics_JSON_PATH, "w") as json_file:
            json.dump(alertsInfraDict, json_file, indent=4)
 
        print("✅ Infra Alerts Data cached successfully! Next update in 2 minutes...")
        return("✅ Infra Alerts Data cached successfully! Next update in 2 minutes...")

    except Exception as e:
        print(f"❌ Error fetching or caching data: {e}")
        return(f"❌ Error fetching or caching data: {e}")

def cacheServerListData(filter):
    try:
        
        print("🔄 Fetching server list data from database...")
        apmNumbers = filtersData(filter, "apmNumber")
        connectToServicePerf = connectToDw_SqlServerPwd("spidedbsv6c6b60.wa.providence.org\\SPIDER", "ServicePerf_DW","servCRCAMonitor")
        serverData = server_overview_df(connectToServicePerf, apmNumbers, "", "")
        # Convert DataFrame to dictionary (JSON serializable format)
        time = datetime.now()
        pst = pytz.timezone('America/Los_Angeles')
        time = time.astimezone(pst)
        serverData_dict = {
            "Server": serverData["Server"].to_dict(orient="records"),  # Convert DataFrame to list of dictionaries
            "total_servers": 0,
            "VmsUp": 0,
            "VmsDeallocated": 0,
            "Count": -1,
            "TimeOfUpdate" : str(time)
        }  
        print("The type is serverdata df is ", type(serverData))
        print("The server df is", serverData)
        with open(SERVERLIST_JSON_PATH, "w") as json_file:
            json.dump(serverData_dict, json_file, indent=4)

        return("✅ server Data cached successfully in json! Next update in 1 hour...")

    except Exception as e:
        return(f"❌ Error fetching or caching  server data: {e}")
    
def cacheServerListData_toDB(filter):
    try:
        
        print("🔄 Fetching server list data from database...")
        apmNumbers = filtersData(filter, "apmNumber")
        connectToServicePerf = connectToDw_SqlServerPwd("spidedbsv6c6b60.wa.providence.org\\SPIDER", "ServicePerf_DW","servCRCAMonitor")
        serverData = server_overview_df(connectToServicePerf, apmNumbers, "", "")
        # Convert DataFrame to dictionary (JSON serializable format)
        time = datetime.now()
        pst = pytz.timezone('America/Los_Angeles')
        time = time.astimezone(pst)
        serverData_dict = {
            "Server": serverData["Server"].to_dict(orient="records"),  # Convert DataFrame to list of dictionaries
            "total_servers": 0,
            "VmsUp": 0,
            "VmsDeallocated": 0,
            "Count": -1,
            "TimeOfUpdate" : str(time)
        }  
        try:
            connectToCrcaMonitoring = connectToDw_AADpwd_Write("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
            columns = ""
            values = ""
            valuesDelete = ""
            data = [tuple(d.values()) for d in serverData_dict["Server"]]
            for i in serverData_dict["Server"][0]:
                values+="?,"
                columns = columns + i +","
                valuesDelete = valuesDelete + i + "=? and "
            values=values[0:-1]
            columns=columns[0:-1]
            valuesDelete=valuesDelete[0:-5]
            values = "("+values+")"
            columns = "("+columns+")"
            
            sqlSelectQuery = f"""Select {columns[1:-1]} from CrcaServerListData"""
            result = queryDw(connectToCrcaMonitoring, sqlSelectQuery)
            result = [tuple("" if element is None else element for element in tup) for tup in result]
            dataDelete = list(set(result) - set(data))
            dataInsert = list(set(data) - set(result))
            
            # print(dataInsert)
            # print(dataDelete)
            
            if(len(dataDelete)>0):
                sqlDelete = f"""Delete from CrcaServerListData where {valuesDelete}"""
                # print(sqlDelete)
                print(deleteDw(connectToCrcaMonitoring, sqlDelete, dataDelete))

            if(len(dataInsert)>0):
                sqlInsertQuery = f"""Insert into CrcaServerListData {columns} values {values}"""
                print(insertDw(connectToCrcaMonitoring, sqlInsertQuery, dataInsert))
            return("✅ server Data cached successfully! Next update in 1 hour...")
        except Exception as ex:
            raise Exception(f"Error Inserting Data into DB: "+ex)
    except Exception as e:
        return(f"❌ Error fetching or caching  server data: {e}")

def userfilterAlertManager(connectionString):
    query = f"""select  distinct email from [ServicePerf_DW].[dbo].[vw_SN_sys_user] where department_name like '%Clinical & Revenue Cycle Applications%' or department_name like '%IS CRCA%' or department_name like 'Vcdh'"""
    users_list = queryDw(connectionString, query)
    columns = ["Emails"]
    df = pd.DataFrame(np.array(users_list), columns=columns)
    emails = df.to_dict(orient='records')
    return {
        "emailAddress": emails,  # Send the complete data for that app family, ci & servers
    }


def datetimeStringToUTC(dateTimeString):
    # print("Date")
    # print(dateTimeString)
    datetime_format = "%Y-%m-%d %I:%M:%S %p"
    
    dateTimeString = datetime.strptime(dateTimeString, datetime_format)
    pst_tz = pytz.timezone('US/Pacific')

    # Localize the naive datetime object to PST timezone
    pst_datetime = pst_tz.localize(dateTimeString)
    
    # Convert the PST datetime to UTC
    utc_datetime = pst_datetime.astimezone(pytz.utc)
    utc_datetime = utc_datetime.strftime(datetime_format)
    # Print the resulting UTC datetime
    print("Original PST datetime:", pst_datetime)
    print("Converted UTC datetime:", utc_datetime)
    return utc_datetime

#Disk Automation
def diskdetails_df(connectionString, vm):
    # Use the vm parameter in the query
    if len(vm) == 1:
        # Single item, use '=' instead of 'IN'
        query = f"select * from DiskAutomation where vmName = '{next(iter(vm))}'"
    else:
        # Multiple items, use 'IN'
        query = f"select * from DiskAutomation where vmName in {tuple(vm)}"
    try:
        vm_name_list = queryDw(connectionString, query)

        if not vm_name_list:
            print("details not found")
            return None

        
        columns = ["vmName", "vmSize", "cachedThroughput", "uncachedThroughput", "cachedIOPS", "uncachedIOPS", "datadiskcount", "skuuncachedthroughputIOPSvalue", "skuuncachedthroughputMbps", "skucachedIOPSvalue", "cachedbandwidthpoints", "vmstatus", "recommendedSize", "osdiskanddatadisk"]
        df = pd.DataFrame(np.array(vm_name_list), columns=columns)
        df['cachedbandwidthpoints'] = df['cachedbandwidthpoints'].apply(lambda x: json.loads(x) if isinstance(x, str) else x)

        # Identify missing VMs from the input list
        existing_vm_names = df['vmName'].str.lower().tolist()
        missing_vms = set(vm) - set(existing_vm_names)
        # print(missing_vms)
        
        # Add rows for missing VMs with null values for all fields except vmName
        missing_rows = []
        for missing_vm in missing_vms:
            missing_row = {col: None for col in columns}
            missing_row['vmName'] = missing_vm
            missing_rows.append(missing_row)
        
        # Convert missing rows into a DataFrame and concatenate
        missing_df = pd.DataFrame(missing_rows, columns=columns)
        df = pd.concat([df, missing_df], ignore_index=True)
        
        return df
    except Exception as Ex:
        print("Exception in disk details: ",Ex )
        info =exceptioninfo(Ex,query)
        insert_data(info)
        return jsonify({'error':str(Ex)}),500
    

# find the cloud servers for alert manager
def find_servers_by_name(server_names):
    # credential = ManagedIdentityCredential(client_id='015ad614-f9a5-4333-83b4-b71c01c393d8')
    
    tenant_id = connectToKeyVault('tenantIdSpn')
    client_id = connectToKeyVault('clientIdSpn')
    client_secret = connectToKeyVault('clientSecretSpn')
    credential = ClientSecretCredential(tenant_id=tenant_id, client_id=client_id, client_secret=client_secret)
    #credential = AzureCliCredential()
    resource_graph_client = ResourceGraphClient(credential)
    
    # Ensure server_names is formatted correctly for the query
    formatted_server_names = ",".join([f"'{name}'" for name in server_names])

    query = f'''Resources
    | where type =~ 'Microsoft.Compute/virtualMachines'
    | where tolower(name) in ({formatted_server_names})
    | project name, resourceGroup, id'''
    # print(query)
    query_request = {
        'query': query,
        'subscriptions': []  # Leave empty for all subscriptions
    }

    response = resource_graph_client.resources(query_request)
    return response.data if response.data else None
    # return None


BASE_DIR = os.path.dirname(os.path.abspath(__file__))  # Current file's directory
modules_path = os.path.join(BASE_DIR, "..")
cache_path = os.path.join(modules_path, "cache")  # Path to cache inside Modules
userToSupportGroupMappingJsonPath = os.path.join(cache_path, "userToSupportGroupMappingList.json")


def alertfilterdf(connectionString, email, connectionStringAzure):
    email = email.lower()
    print("The lowered email is", email)

    queryRbacAdmin = f"""select names from RbacAdmins"""
    emails_list = queryDw(connectionStringAzure, queryRbacAdmin)
 
    emails = [row[0] for row in emails_list]
     
    querySupportGroup = f"Select distinct [SupportGroup] from [UserToSupportGroupMapping] where lower([Email]) like '{email.lower()}'"
    supportGroupList = queryDw(connectionStringAzure, querySupportGroup)
 
    print("Distinct Support Groups:", supportGroupList)
 
    support_group_str = ", ".join(f"'{sg[0].lower()}'" for sg in supportGroupList)
 
    if email in emails:
       
        print("You are a admin")
 
        # Final query
        # query = f"""SELECT DISTINCT LOWER(ServerName), AppCI, AppFamily, ServerHostingType FROM CrcaServerListData WHERE LOWER(ServerHostingType) LIKE '%cloud%'"""
        query = f"""Select distinct LOWER(sl.[Server Name]), sl.[Application CI], al.[Application Family], sl.[Hosting Type] from [Server List] sl
        inner join [Application List] al on sl.[Application CI] like al.[Application CI] where LOWER(sl.[Hosting Type]) like '%cloud%'
        """
        # print("The query is" , query)
   
    else:
 
        if len(support_group_str)==0:
            print("No support group details present for the user")
            return {
                "full_data": [],
                "AppFamily": []
            }
        # Final query
        # query = f"""SELECT DISTINCT LOWER(ServerName), AppCI, AppFamily, ServerHostingType FROM CrcaServerListData WHERE LOWER(ServerHostingType) LIKE '%cloud%' and LOWER(SupportGroup) IN ({support_group_str})"""
        query = f"""Select distinct LOWER([Server Name]), sl.[Application CI], al.[Application Family], sl.[Hosting Type] from [Server List] sl
        inner join [Application List] al on sl.[Application CI] like al.[Application CI] where LOWER(sl.[Hosting Type]) like '%cloud%' and LOWER(al.[Support Group]) in ({support_group_str})
        """
    print(query)

 
    details_list = queryDw(connectionStringAzure, query)
    print("The details list is", details_list)
    if not details_list:
        print("No server details present for the user")
        return {
            "full_data": [],
            "AppFamily": []
        }
 
    columns = ["ServerName", "AppCI", "AppFamily", "HostingType"]
    df = pd.DataFrame(np.array(details_list), columns=columns)
 
    # Get distinct app families
    distinct_app_families = df['AppFamily'].drop_duplicates().tolist()
    print(distinct_app_families)
 
    # Convert the full dataframe to a dictionary for JSON response
    full_data = df.to_dict(orient='records')
 
 
    return {
        "full_data": full_data,  # Send the complete data for that app family, ci & servers
        "AppFamily": distinct_app_families  # Send the distinct app families
    }


def serverStatus(connectionString, appCI, serverName, aggregate, startTime, endTime):
    
    if(startTime==""):
        format_string = "%Y-%m-%d %I:%M:%S %p"
        #print(datetime.now())
        currentTime = datetime.now()
        pst = pytz.timezone('America/Los_Angeles')
        endTime = currentTime.astimezone(pst)
        startTime = endTime - timedelta(hours=5)
        startTime = startTime.strftime(format_string)
        endTime = endTime.strftime(format_string)
    else:
        startTime = datetime.strptime(startTime, "%Y-%m-%d %I:%M:%S %p").strftime("%Y-%m-%d %H:%M:%S")
        endTime = datetime.strptime(endTime, "%Y-%m-%d %I:%M:%S %p").strftime("%Y-%m-%d %H:%M:%S")
    
    serverName_Cond = ""
    
    if(serverName=="" and appCI!=""):
        serverName_Cond = f"""Lower(AppCI) in ({appCI.lower()})"""
    elif(appCI!="" and serverName!=""):
        serverName_Cond = f"""Lower(AppCI) in ({appCI.lower()}) and lower(ServerName) in ({serverName.lower()})"""
    elif(serverName!=""):
        serverName_Cond = f"""lower(ServerName) in ({serverName.lower()})"""

    if(aggregate=="yes"):
        sqlQuery = f""" Select ServerName, TimeGenerated, HostingType, AppCI, Status, Uptime_Hours, Backup_Status, LastBackupDate from ServerStatus where {serverName_Cond} and TimeGenerated = (Select MAX(TimeGenerated) from ServerStatus)"""
    else:
        sqlQuery = f""" Select ServerName, TimeGenerated, HostingType, AppCI, Status, Uptime_Hours, Backup_Status, LastBackupDate from ServerStatus where {serverName_Cond} and TimeGenerated >= Convert(datetime, {startTime}) and TimeGenerated <= Convert(datetime, {endTime})"""
    
    print(sqlQuery)
    serverStatusData = queryDw(connectionString, sqlQuery)
    if(len(serverStatusData)>0):
        
        serverStatus_df = pd.DataFrame(numpy.array(serverStatusData), columns=["ServerName", "TimeGenerated","HostingType", "AppCI", "Status", "Up Time", "Backup Status", "Last Backup Date"])
        serverStatus_df['TimeGenerated'] = serverStatus_df['TimeGenerated'].dt.strftime('%Y-%m-%d %H:%M:%S')
        serverStatus_df['Last Backup Date'] = serverStatus_df['Last Backup Date'].apply(lambda x: x.strftime('%Y-%m-%d %H:%M:%S') if pd.notnull(x) else 'NULL')
        
        print(len(serverStatus_df))

    return serverStatus_df

def PatchComplianceData(serverName, apmNumber):
    connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")

    if(apmNumber==""):
        
        if isinstance(serverName, str):
            formatted_server_names = f"{serverName.strip().lower()}"
        elif isinstance(serverName, list):
            formatted_server_names = ", ".join(f"'{name.strip().lower()}'" for name in serverName if name.strip())
        
        compliance_query = f""" SELECT [ServerName]
                ,[IsServerCompliant]
                ,[ServerComplianceUpdatedDate]
                ,[collectionName]
                ,[Status]
                ,[State]
                ,[PatchWindow]
                ,[LastUpdated]
            FROM [dbo].[ServerPatchCompliance] where lower(ServerName) in ({formatted_server_names})
        """
        # print("Compliance queryyyy")
        # print(compliance_query)
        patch_list = queryDw(connectToCrcaMonitoring, compliance_query)
        
    else:
        compliance_query = f"""
            SELECT a.ServerName, a.IsServerCompliant, a.ServerComplianceUpdatedDate, 
                a.collectionName, a.Status, a.State, b.Attribute11, NULL AS LastUpdated
            FROM reporting.vw_MEMCM_host_servers_compliance_details a
            JOIN reporting.vw_MEMCM_host_servers_agent_health b ON a.ServerName = b.ServerName
            WHERE a.Status NOT LIKE '%Not Applicable%' AND b.APMNumber IN ({apmNumber})
            GROUP BY a.ServerName, a.IsServerCompliant, a.ServerComplianceUpdatedDate, 
            a.collectionName, a.Status, a.State, b.Attribute11, b.collectionNames;
        """
        # print("Compliance queryyyy")
        # print(compliance_query)
        patch_list = queryAeroSnowflake(compliance_query)

    if not patch_list:
        return None 

    columns = ["ServerName", "IsServerCompliant", "ServerComplianceUpdatedDate", "collectionName", "Status", "State", "Attribute11", "LastUpdated"]

    patch_data_df = pd.DataFrame(np.array(patch_list), columns=columns)
    
    patch_data_df.rename(columns={'Attribute11': 'PatchWindow'}, inplace=True)

    #print(patch_data_df)
    if patch_data_df.empty:
        return None 

    return patch_data_df

def BackupData(serverName):
    print("Server names in backup:", serverName)

    if isinstance(serverName, str):
        formatted_server_names = f"{serverName.strip().lower()}"
    elif isinstance(serverName, list):
        formatted_server_names = ", ".join(f"'{name.strip().lower()}'" for name in serverName if name.strip())

    print("Processed Server Names:", formatted_server_names)

    query = f"""SELECT ServerName, Backup_Status, IsBackupSuccess, LastBackupDate, Backup_process
                FROM ServerStatus AS a
                WHERE [TimeGenerated] = (
                            SELECT MAX([TimeGenerated])
                            FROM ServerStatus AS b
                            WHERE a.ServerName = b.ServerName)
                            AND
                ServerName IN ({serverName})
        """
    print(query)
    connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    df_Backup = pd.DataFrame()
    df_Backup = queryDw(connectToCrcaMonitoring, query)
    df_Backup= pd.DataFrame(numpy.array(df_Backup), columns=["ServerName", "Backup_Status", "IsBackupSuccess", "LastBackupDate", "Backup_process"])
    serverBackup_df = df_Backup.dropna()
    print("final: ",serverBackup_df)
    if serverBackup_df.empty:
        return None 
    return serverBackup_df


def ValidationData(aggregate,AppName):  
    if aggregate == "no":
        query = f"""
            SELECT *
            FROM ApplicationValidation
            WHERE [Application CI] = '{AppName}'
            AND TimeGenerated IN (
                SELECT DISTINCT TOP 5 TimeGenerated
                FROM ApplicationValidation
                WHERE [Application CI] = '{AppName}'
                ORDER BY TimeGenerated DESC
            )
            ORDER BY TimeGenerated DESC
        """
    else:
        query = f"""
            SELECT *
            FROM ApplicationValidation
            WHERE TimeGenerated IN (
                SELECT MAX(TimeGenerated)
                FROM ApplicationValidation
                GROUP BY [Application CI]
            )
        """
    serverValidation_df = pd.DataFrame()
    connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    df_Validation = pd.DataFrame()
    df_Validation = queryDw(connectToCrcaMonitoring, query)
    if(len(df_Validation)>0):
        df_Validation = pd.DataFrame(numpy.array(df_Validation), columns=["Application CI","FunctionName", "Server Name","Description","TimeGenerated","Status","Screenshot","LatencyTimestamp"])
        df_Validation['TimeGenerated'] = pd.to_datetime(df_Validation['TimeGenerated'], format="%m-%d-%Y %H:%M:%S").dt.strftime("%Y-%m-%d %I:%M:%S %p")
        serverValidation_df = df_Validation
    print("final: ",serverValidation_df)
    return serverValidation_df

def appExceptions(connectToServicePerf, apmNumbers, aggregate, startTime, endTime):
    if (startTime == ""):
        format_string = "%Y-%m-%d %I:%M:%S %p"
        currentTime = datetime.now()
        pst = pytz.timezone('America/Los_Angeles')
        endTime = currentTime.astimezone(pst)
        startTime = endTime - timedelta(hours=5)  
        startTime = startTime.strftime(format_string)
        endTime = endTime.strftime(format_string)


    connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    

    timeGenerated = f"""between Convert(datetime, '{startTime}') and Convert(datetime, '{endTime}')"""


    if aggregate == "yes":
        query_exceptions = f"""
        SELECT 
            SUM(TotalException) AS TotalExceptions, 
            COUNT(ImpactedUsers) AS ImpactedUsersCount, 
            COUNT(DISTINCT(Type)) AS DistinctTypeCount
        FROM 
            AppExceptions ae
        JOIN 
            crcamonitoring.dbo.ResourceMappings rm
            ON ae.AppInsightName = rm.ResourceName
        WHERE 
            ae.TimeGenerated {timeGenerated}
            AND rm.ResourceType = 'AppInsights'
            AND rm.APMNumber IN ({apmNumbers})
        """
    else:
        query_exceptions = f"""
        SELECT ar.*, rm.APMNumber 
        FROM AppExceptions ar 
        JOIN crcamonitoring.dbo.ResourceMappings rm ON ar.AppInsightName = rm.ResourceName  
        WHERE rm.ResourceType = 'AppInsights' 
        AND ar.TimeGenerated {timeGenerated}  
        AND rm.APMnumber IN ({apmNumbers})
        ORDER BY TimeGenerated DESC;
        """
    
    print(query_exceptions)
    app_list = queryDw(connectToCrcaMonitoring, query_exceptions)
    
    if aggregate == "yes":
        total_exceptions = app_list[0][0] if app_list else 0
        impacted_users = app_list[0][1] if app_list else 0
        unique_exceptions = app_list[0][2] if app_list else 0

        if total_exceptions == 0 and impacted_users == 0 and unique_exceptions == 0:
            return []  

        aggregate_result = {
            "TotalExceptions": total_exceptions,
            "ImpactedUsersCount": impacted_users,
            "DistinctTypeCount": unique_exceptions
        }
        #print("Aggregated result:", aggregate_result)
        return aggregate_result
    
    else:
        columns = ["TimeGenerated", "ProblemId", "OuterMessage", "OperationName", "Type", "SubscriptionId", "ResourceGroup", "AppInsightName", "HostingType", "TotalException", "ImpactedUsers", "Id","APMNumber"]

        if not app_list:
            return []  
        appexceptions_df = pd.DataFrame(np.array(app_list), columns=columns)
        #print("app exceptions query 1 done")
        appexceptions_df = appexceptions_df.drop(columns=["HostingType", "ImpactedUsers", "APMNumber", "SubscriptionId", "ResourceGroup", "OperationName","Id"])
        
        appexceptions_df['TimeGenerated'] = appexceptions_df['TimeGenerated'].dt.strftime("%Y-%m-%d %H:%M:%S")
        print(appexceptions_df)
        appexceptions_json = appexceptions_df.to_dict(orient="records")
        # print(appexceptions_json)
        return appexceptions_json  
    
           
def appReliability(connectToServicePerf, apmNumbers, aggregate, startTime, endTime):
    if (startTime == ""):
        format_string = "%Y-%m-%d %I:%M:%S %p"
        currentTime = datetime.now()
        pst = pytz.timezone('America/Los_Angeles')
        endTime = currentTime.astimezone(pst)
        startTime = endTime - timedelta(hours=5)
        startTime = startTime.strftime(format_string)
        endTime = endTime.strftime(format_string)
        #print("start and end time none: " ,startTime,endTime)

    connectToCrcaMonitoring = connectToDw_AADpwd(
        "sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org"
    )

    timeGenerated = f"""between Convert(datetime, '{startTime}') and Convert(datetime, '{endTime}')"""
    
    if aggregate == "yes":
        query_reliability = f"""SELECT ar.AppInsightName,ar.Reliability
                            FROM
                                AppReliability ar
                            JOIN
                                crcamonitoring.dbo.ResourceMappings rm
                                ON ar.AppInsightName = rm.ResourceName
                            WHERE
                                ar.TimeGenerated = (
                                    SELECT MAX(ar2.TimeGenerated)
                                    FROM AppReliability ar2
                                    JOIN crcamonitoring.dbo.ResourceMappings rm2
                                    ON ar2.AppInsightName = rm2.ResourceName
                                    WHERE rm2.APMNumber IN ({apmNumbers})
                                )
                            AND rm.APMNumber IN ({apmNumbers})
                            GROUP BY
                                ar.AppInsightName, ar.Reliability;
                                    """
    else:
        query_reliability = f"""
        SELECT ar.*, rm.APMNumber 
        FROM AppReliability ar 
        JOIN crcamonitoring.dbo.ResourceMappings rm
        ON ar.AppInsightName = rm.ResourceName  
        WHERE rm.ResourceType = 'AppInsights' AND
         ar.TimeGenerated {timeGenerated}
        AND rm.APMnumber IN ({apmNumbers})
        order by TimeGenerated DESC
        """
    
    print(query_reliability)
    app_list = queryDw(connectToCrcaMonitoring, query_reliability)

    print(app_list)

    # Check if data is empty
    if not app_list:
        print("No data returned from the query.")
        if aggregate == "yes":
            return {"Reliability": None}
        else:
            return []

    if aggregate == "yes":
        appreliability_json = {"AppInsightName" : app_list[0][0], "Reliability" : app_list[0][1]}
        return appreliability_json
    else:
        columns = ["TimeGenerated", "ResourceGroup", "Total", "Success", "AppRoleName", "SubscriptionId", "AppInsightName", "HostingType", "Reliability", "Id","APMNumber"]
        
        try:
            appreliability_df = pd.DataFrame(np.array(app_list), columns=columns)
        except ValueError as e:
            print(f"Error while creating DataFrame: {e}")
            return []

        appreliability_df = appreliability_df.drop(columns=["APMNumber", "SubscriptionId", "ResourceGroup", "AppRoleName", "HostingType","Id"])

        appreliability_df['TimeGenerated'] = appreliability_df['TimeGenerated'].dt.strftime("%Y-%m-%d %H:%M")
        print(appreliability_df)
        #print("App reliability query done")
        appreliability_json = appreliability_df.to_dict(orient="records")
        #print(appreliability_json)
        return appreliability_json
    
def server_overview_df(connectionString, apmNumbers, startTime, endTime):

    #connectToServicePerf = connectToDw("spidedbsv6c6b60.wa.providence.org\\SPIDER", "ServicePerf_DW")
    
    query = f"""
            SELECT distinct LOWER(cmdbci.[name]) AS ServerName,
            cmdbci.[dns_domain] AS DnsDomain, 
            cmdbci.[sys_class_name] AS SysClassName, 
            cmdbci.[u_ci_service_level_name] AS Environment, 
            BusinessApp.[apm_application_family_name] AS AppFamily,
            BusinessApp.[name] AS AppCI, 
            BusinessApp.[application_category_name] AS AppCategory, 
            BusinessApp.[install_type_label] AS AppHostingType,
            Case
				when cmdbci.u_is_cloud like 'true' then 'Cloud'
				else 'OnPremise'
			End AS ServerHostingType,
            BusinessApp.[it_application_owner_name] AS AppOwnerName, 
            BusinessApp.[number] AS APMNumber, 
            BusinessApp.[support_group_name] AS SupportGroup,
            BusinessApp.[Managed By Group] AS ManagedByGroup,
            CASE 
				WHEN cmdbci.correlation_id LIKE '/subscriptions/%' THEN 
					SUBSTRING(
						cmdbci.correlation_id, 
						CHARINDEX('/subscriptions/', cmdbci.correlation_id) + LEN('/subscriptions/'), 
						CHARINDEX('/resourceGroups/', cmdbci.correlation_id) - (CHARINDEX('/subscriptions/', cmdbci.correlation_id) + LEN('/subscriptions/'))
					)
				ELSE NULL
			END AS SubscriptionID,
			CASE 
				WHEN cmdbci.correlation_id LIKE '/subscriptions/%' THEN 
					SUBSTRING(
						cmdbci.correlation_id, 
						CHARINDEX('/resourceGroups/', cmdbci.correlation_id) + LEN('/resourceGroups/'), 
						CHARINDEX('/providers/', cmdbci.correlation_id) - (CHARINDEX('/resourceGroups/', cmdbci.correlation_id) + LEN('/resourceGroups/'))
					)
				ELSE NULL
			END AS ResourceGroup
            FROM   
            [ServicePerf_DW].[dbo].[vw_sn_cmdb_ci_server] AS cmdbci
            INNER JOIN  
            vw_SN_Appl_Relationship AS AppRelation ON AppRelation.RelationshipID = cmdbci.sys_id
            INNER JOIN  
            vw_SN_cmdb_ci_business_app AS BusinessApp ON BusinessApp.sys_id = AppRelation.ApplicationID
            WHERE       
            (BusinessApp.portfolio_name = 'Clinical & Revenue Cycle Apps (CRCA)'
            OR BusinessApp.[apm_application_family_name] LIKE 'Cromwell')
            AND BusinessApp.active = 'true'
            AND cmdbci.operational_status_label in ('Operational', 'Repair in Progress', 'VM Terminated', 'Sleep Test in Progress')
            AND AppRelation.Relationship = 'Runs on'
            AND BusinessApp.[number] IN ({apmNumbers})
            """
    
    rows = queryDw(connectionString, query)

    df = pd.DataFrame(numpy.array(rows), columns=["ServerName", "DnsDomain","SysClassName","Environment","AppFamily","AppCI","AppCategory","AppHostingType","ServerHostingType","AppOwnerName","APMNumber","SupportGroup","ManagedByGroup", "SubscriptionID", "ResourceGroup"])
    
    # production = ['Production 24x7 (Default)','Production - Business Hours','Production 24x7 Tier 1']
    # test = ['Test']
    
    serverData["Server"] = df
    
    return serverData
    #print(df_filtered_prod)

def server_environment_overview_df(connectionString, apmNumbers, startTime, endTime):
    
    if(startTime==""):
        format_string = "%Y-%m-%d %I:%M:%S %p"
        #print(datetime.now())
        currentTime = datetime.now()
        pst = pytz.timezone('America/Los_Angeles')
        endTime = currentTime.astimezone(pst)
        startTime = endTime - timedelta(hours=5)
        startTime = startTime.strftime(format_string)
        endTime = endTime.strftime(format_string)

    
    query = f"""
            SELECT distinct LOWER(cmdbci.[name]) AS ServerName,
            cmdbci.[dns_domain] AS DnsDomain, 
            cmdbci.[sys_class_name] AS SysClassName, 
            cmdbci.[u_ci_service_level_name] AS Environment, 
            BusinessApp.[apm_application_family_name] AS AppFamily,
            BusinessApp.[name] AS AppCI, 
            BusinessApp.[application_category_name] AS AppCategory, 
            BusinessApp.[install_type_label] AS AppHostingType,
            BusinessApp.[it_application_owner_name] AS AppOwnerName, 
            BusinessApp.[number] AS APMNumber, 
            BusinessApp.[support_group_name] AS SupportGroup,
            BusinessApp.[Managed By Group] AS ManagedByGroup FROM   
            [ServicePerf_DW].[dbo].[vw_sn_cmdb_ci_server] AS cmdbci
            INNER JOIN  
            vw_SN_Appl_Relationship AS AppRelation ON AppRelation.RelationshipID = cmdbci.sys_id
            INNER JOIN  
            vw_SN_cmdb_ci_business_app AS BusinessApp ON BusinessApp.sys_id = AppRelation.ApplicationID
            WHERE       
            (BusinessApp.portfolio_name = 'Clinical & Revenue Cycle Apps (CRCA)'
            OR BusinessApp.[apm_application_family_name] LIKE 'Cromwell')
            AND BusinessApp.active = 'true'
            AND AppRelation.Relationship = 'Runs on'
            AND BusinessApp.[number] IN ({apmNumbers})"""
    
    rows = queryDw(connectionString, query)

    df = pd.DataFrame(numpy.array(rows), columns=["ServerName", "DnsDomain","SysClassName","Environment","AppFamily","AppCI","AppCategory","AppHostingType","AppOwnerName","APMNumber","SupportGroup","ManagedByGroup"])


    production = ['Production 24x7 (Default)','Production - Business Hours','Production 24x7 Tier 1']
    test = ['Test']
    dev = ['Development']
    df_filtered_prod = df[df['Environment'].isin(production)]
    df_filtered_test = df[df['Environment'].isin(test)]
    df_filtered_dev = df[df['Environment'].isin(dev)]
    
    serverEnvironmentData["Server"] = df
    serverEnvironmentData["Production"] = len(df_filtered_prod)
    serverEnvironmentData["Development"]= len(df_filtered_dev)
    serverEnvironmentData["Test"] = len(df_filtered_test)
    
    return serverEnvironmentData

def windows_events_df(connectionString, apmNumbers,serverName,aggregate, startTime, endTime):
    print(apmNumbers)
    print(serverName)
    if(startTime==""):
        format_string = "%Y-%m-%d %I:%M:%S %p"
        #print(datetime.now())
        currentTime = datetime.now()
        pst = pytz.timezone('America/Los_Angeles')
        endTime = currentTime.astimezone(pst)
        startTime = endTime - timedelta(hours=5)
        startTime = startTime.strftime(format_string)
        endTime = endTime.strftime(format_string)
        
    startTime = datetimeStringToUTC(startTime) 
    endTime = datetimeStringToUTC(endTime)

    timeGenerated = f"""between(datetime("{startTime}") .. datetime("{endTime}"))"""
    server_names = ""
    condition =""
    if(aggregate=="yes"):
        condition = """| summarize LogCount = count() by EventLog"""
    else:
         condition = """| summarize SampleCount = array_length(make_list(1)), TimeGenerated = arg_max(TimeGenerated, *)
                        by
                        EventLog,
                        EventID,
                        ServerName,
                        EventType,
                        RenderedDescription,
                        ResourceGroup,
                        SubscriptionId,
                        HostingType = 'Cloud'
                        | sort by TimeGenerated desc
                        | project TimeGenerated = datetime_utc_to_local(TimeGenerated, 'US/Pacific')
                        , ServerName, EventLog, EventID, EventType, Description = RenderedDescription,
                        SubscriptionId, ResourceGroup, SampleCount"""

    if(apmNumbers!=""):
        # server_name_query = f"""
        #                     SELECT distinct LOWER(cmdbci.[name]) AS ServerName FROM   
        #                     [ServicePerf_DW].[dbo].[vw_sn_cmdb_ci_server] AS cmdbci
        #                     INNER JOIN  
        #                     vw_SN_Appl_Relationship AS AppRelation ON AppRelation.RelationshipID = cmdbci.sys_id
        #                     INNER JOIN  
        #                     vw_SN_cmdb_ci_business_app AS BusinessApp ON BusinessApp.sys_id = AppRelation.ApplicationID
        #                     WHERE       
        #                     (BusinessApp.portfolio_name = 'Clinical & Revenue Cycle Apps (CRCA)'
        #                     OR BusinessApp.[apm_application_family_name] LIKE 'Cromwell')
        #                     AND BusinessApp.active = 'true'
        #                     AND AppRelation.Relationship = 'Runs on'
        #                     AND cmdbci.operational_status_label in ('Operational', 'Repair in Progress', 'VM Terminated', 'Sleep Test in Progress')
        #                     AND BusinessApp.[number] IN ({apmNumbers})"""
        
        server_name_query = f"""select ServerName from CrcaServerListData where APMNumber IN ({apmNumbers})"""
        
        server_name_list = queryDw(connectionString, server_name_query)
        server_names = ""

        for row in server_name_list:
            server_names = server_names + "'" + row[0]+"' , "
        server_names = server_names[0:len(server_names)-2]
    else:
        server_names = serverName
    #print(server_names)

    workspaceId = "552b9630-b106-4fe7-a1fa-97d04a0010ef"

    #time generated > ago(1d)
    logAnalyticsQuery = f"""Event
                        | where _SubscriptionId in ('ab16a144-47d7-45c5-bcb7-8affc988f8e0', '9592c342-d1fb-477e-8e91-ad39bf00933b', '5467bf57-48b4-4930-b3cb-bf039b259d04', '343a7ee0-5081-4024-82fc-498ee61867a9', '6d590d81-bab9-4b9a-b011-090467b5a9a4', 'accde124-a45f-47be-aefa-b09362b2c5fc', 'a82a7c51-82fd-4bbc-a376-3cd8752a1675')
                        | extend resourceIdSpilt=split(_ResourceId, '/')
                        | extend
                        SubscriptionId=tostring(resourceIdSpilt[2]),
                        ResourceGroup=tostring(resourceIdSpilt[4]),
                        ServerName=tolower(tostring(resourceIdSpilt[8])),
                        EventType = case(
                            EventLevelName contains "Information", "Information",
                            EventLevelName contains "Error", "Error",
                            EventLevelName contains "Warning", "Warning",
                        tostring(EventLevelName))
                        | where ServerName in ({server_names})  
                        | where TimeGenerated {timeGenerated}  
                        {condition}
                        """
    print(logAnalyticsQuery)
    windowsEventLogs = queryInLogAnalytics(workspaceId, logAnalyticsQuery,"","")
    #print(windowsEventLogs)
    #print(serverStatus)

    columns = windowsEventLogs.columns
    if(not windowsEventLogs.empty and "TimeGenerated" in columns):
        windowsEventLogs["TimeGenerated"] = windowsEventLogs["TimeGenerated"].dt.strftime('%Y-%m-%d %H:%M:%S')

    windowEventData["Server"] = windowsEventLogs.to_json()
    
    
    if(aggregate=="yes"):
        
        windowsEventLogsT = windowsEventLogs.T
        windowsEventLogsT.columns=windowsEventLogsT.iloc[0]
        windowsEventLogsT = windowsEventLogsT.iloc[1:]
        
        #print(windowsEventLogsT.columns)
        if('Application' in windowsEventLogsT.columns):
            application = windowsEventLogsT['Application'].iloc[0]
        else:
            application = 0
        if('System' in windowsEventLogsT.columns):
            system = windowsEventLogsT['System'].iloc[0]
        else:
            system = 0
        if('Security' in windowsEventLogsT.columns):
            security = windowsEventLogsT['Security'].iloc[0]
        else:
            security = 0
        
        windowEventData["Server"] = {"ApplicationLogs":application,"SystemLogs":system,"SecurityLogs":security}

    return windowEventData


def serverProcessMetrics_df(serverName, startTime, endTime):
    if(startTime==""):
        format_string = "%Y-%m-%d %I:%M:%S %p"
        currentTime = datetime.now()
        pst = pytz.timezone('America/Los_Angeles')
        endTime = currentTime.astimezone(pst)
        startTime = endTime - timedelta(hours=5)
        startTime = startTime.strftime(format_string)
        endTime = endTime.strftime(format_string)

    startTime = datetimeStringToUTC(startTime)
    endTime = datetimeStringToUTC(endTime)

    timeGenerated = f"""between(datetime("{startTime}") .. datetime("{endTime}"))"""

    # serverName comes in as a comma separated, quoted string e.g. "'srv1','srv2'"
    server_names = serverName if serverName else ""

    subscriptions = "'ab16a144-47d7-45c5-bcb7-8affc988f8e0', '9592c342-d1fb-477e-8e91-ad39bf00933b', '5467bf57-48b4-4930-b3cb-bf039b259d04', '343a7ee0-5081-4024-82fc-498ee61867a9', '6d590d81-bab9-4b9a-b011-090467b5a9a4', 'accde124-a45f-47be-aefa-b09362b2c5fc', 'a82a7c51-82fd-4bbc-a376-3cd8752a1675'"

    workspaceId = "552b9630-b106-4fe7-a1fa-97d04a0010ef"

    logAnalyticsQuery = f"""let numCores = Perf
            | where _SubscriptionId in ({subscriptions})
            | where ObjectName == "Processor" and CounterName == "% Processor Time"
                and InstanceName != "_Total"
            | extend ServerName = tolower(tostring(split(_ResourceId, '/')[8]))
            | where ServerName in ({server_names})
            | where TimeGenerated {timeGenerated}
            | summarize Cores = dcount(InstanceName) by ServerName;
        let cpu = Perf
            | where _SubscriptionId in ({subscriptions})
            | where ObjectName == "Process" and CounterName == "% Processor Time"
                and InstanceName != "_Total" and InstanceName != "Idle"
            | extend ServerName = tolower(tostring(split(_ResourceId, '/')[8]))
            | where ServerName in ({server_names})
            | where TimeGenerated {timeGenerated}
            | summarize RawValue = avg(CounterValue), TimeGenerated = max(TimeGenerated)
                by ResourceId = _ResourceId, ServerName, ProcessName = InstanceName
            | join kind=leftouter (numCores) on ServerName
            | extend Cores = coalesce(Cores, 1)
            | extend AvgValue = round(RawValue / Cores, 2)
            | extend ObjectName = "cpu"
            | project ResourceId, ServerName, ProcessName, TimeGenerated, AvgValue, ObjectName;
        let procMem = Perf
            | where _SubscriptionId in ({subscriptions})
            | where ObjectName == "Process" and CounterName == "Working Set"
                and InstanceName != "_Total" and InstanceName != "Idle"
            | extend ServerName = tolower(tostring(split(_ResourceId, '/')[8]))
            | where ServerName in ({server_names})
            | where TimeGenerated {timeGenerated}
            | summarize WorkingSetMB = avg(CounterValue) / (1024 * 1024), TimeGenerated = max(TimeGenerated)
                by ResourceId = _ResourceId, ServerName, ProcessName = InstanceName;
        let availByServer = Perf
            | where _SubscriptionId in ({subscriptions})
            | where ObjectName == "Memory" and CounterName == "Available MBytes"
            | extend ServerName = tolower(tostring(split(_ResourceId, '/')[8]))
            | where ServerName in ({server_names})
            | where TimeGenerated {timeGenerated}
            | summarize AvailMB = avg(CounterValue) by ServerName;
        let usedByServer = procMem
            | summarize UsedMB = sum(WorkingSetMB) by ServerName;
        let totalMemByServer = availByServer
            | join kind=leftouter (usedByServer) on ServerName
            | extend TotalMB = coalesce(AvailMB, 0.0) + coalesce(UsedMB, 0.0)
            | project ServerName, TotalMB;
        let mem = procMem
            | join kind=leftouter (totalMemByServer) on ServerName
            | extend AvgValue = iff(isnotnull(TotalMB) and TotalMB > 0, round(WorkingSetMB / TotalMB * 100, 2), round(WorkingSetMB, 2))
            | extend ObjectName = "memory"
            | project ResourceId, ServerName, ProcessName, TimeGenerated, AvgValue, ObjectName;
        union cpu, mem
        | extend TimeGenerated = datetime_utc_to_local(TimeGenerated, 'US/Pacific')
        | extend splitResourceId = split(ResourceId, "/")
        | extend
            SubscriptionId = tostring(iff(array_length(splitResourceId)==4, "", splitResourceId[2])),
            ResourceGroup = tostring(iff(array_length(splitResourceId)==4, "", splitResourceId[4])),
            AppCI = tostring(iff(array_length(splitResourceId)==4, splitResourceId[3], splitResourceId[7]))
        | project-away splitResourceId
        | project
            TimeGenerated,
            ResourceId,
            SubscriptionId,
            ResourceGroup,
            ServerName,
            AppCI,
            ProcessName,
            ObjectName,
            AvgValue
        | sort by ObjectName asc, AvgValue desc"""

    print("Server Process Metrics KQL Query:")
    print(logAnalyticsQuery)

    processMetrics = queryInLogAnalytics(workspaceId, logAnalyticsQuery, "", "")

    print("Server Process Metrics result rows:", len(processMetrics))
    print("Server Process Metrics result:")
    print(processMetrics)

    columns = processMetrics.columns
    if(not processMetrics.empty and "TimeGenerated" in columns):
        processMetrics["TimeGenerated"] = processMetrics["TimeGenerated"].dt.strftime('%Y-%m-%d %H:%M:%S')

    return processMetrics.to_json()


def server_reboot_df(connectionString, apmNumbers, serverName, aggregate, startTime, endTime):

    if(startTime==""):
        format_string = "%Y-%m-%d %I:%M:%S %p"
        #print(datetime.now())
        currentTime = datetime.now()
        pst = pytz.timezone('America/Los_Angeles')
        endTime = currentTime.astimezone(pst)
        startTime = endTime - timedelta(hours=5)
        startTime = startTime.strftime(format_string)
        endTime = endTime.strftime(format_string)
        
    startTime = datetimeStringToUTC(startTime) 
    endTime = datetimeStringToUTC(endTime)
    
    timeGenerated = f"""between(datetime("{startTime}") .. datetime("{endTime}"))"""
    condition = ""
    server_names = ""
    if(aggregate=="yes"):
        condition ="""| summarize 
                    Reboots=count() by RebootTypes
                    """
        
    else:
        condition = """ | project
                        TimeGenerated = datetime_utc_to_local(TimeGenerated, 'US/Pacific'),
                        EventLog,
                        EventID,
                        EventType = EventLevelName,
                        ServerName,
                        UserName,
                        Description = RenderedDescription,
                        ResourceGroup,
                        SubscriptionId,
                        RebootType = RebootTypes
                        | sort by TimeGenerated desc"""
        
    if(apmNumbers!=""):
        # server_name_query = f"""
        #                 SELECT distinct LOWER(cmdbci.[name]) AS ServerName FROM   
        #                 [ServicePerf_DW].[dbo].[vw_sn_cmdb_ci_server] AS cmdbci
        #                 INNER JOIN  
        #                 vw_SN_Appl_Relationship AS AppRelation ON AppRelation.RelationshipID = cmdbci.sys_id
        #                 INNER JOIN  
        #                 vw_SN_cmdb_ci_business_app AS BusinessApp ON BusinessApp.sys_id = AppRelation.ApplicationID
        #                 WHERE       
        #                 (BusinessApp.portfolio_name = 'Clinical & Revenue Cycle Apps (CRCA)'
        #                 OR BusinessApp.[apm_application_family_name] LIKE 'Cromwell')
        #                 AND BusinessApp.active = 'true'
        #                 AND AppRelation.Relationship = 'Runs on'
        #                 AND cmdbci.operational_status_label in ('Operational', 'Repair in Progress', 'VM Terminated', 'Sleep Test in Progress')
        #                 AND BusinessApp.[number] IN ({apmNumbers})"""

        server_name_query= f"""select ServerName from CrcaServerListData where APMNumber IN ({apmNumbers})"""
                
    
        server_name_list = queryDw(connectionString, server_name_query)
        server_names = ""

        for row in server_name_list:
            server_names = server_names + "'" + row[0]+"' , "
        server_names = server_names[0:len(server_names)-2]
    
    else:
        server_names = serverName

    # print(server_names)
    workspaceId = "552b9630-b106-4fe7-a1fa-97d04a0010ef"

    logAnalyticsQuery = f"""Event
                        | where _SubscriptionId in ('ab16a144-47d7-45c5-bcb7-8affc988f8e0', '9592c342-d1fb-477e-8e91-ad39bf00933b', '5467bf57-48b4-4930-b3cb-bf039b259d04', '343a7ee0-5081-4024-82fc-498ee61867a9', '6d590d81-bab9-4b9a-b011-090467b5a9a4')
                        and EventID in ('1074','41')
                        | where RenderedDescription contains 'shutdown'
                        or RenderedDescription contains 'reboot'
                        or RenderedDescription contains 'stopped' 
                        | extend resourceIdSpilt=split(_ResourceId, '/')
                        | extend
                        SubscriptionId=tostring(resourceIdSpilt[2]),
                        ResourceGroup=tostring(resourceIdSpilt[4]),
                        ServerName=tolower(tostring(resourceIdSpilt[8])),
                        HostingType = 'Cloud'
                        | where ServerName in ({server_names})
                        | extend RebootTypes = iif(EventID == '1074', 'Graceful', iif(EventID == '41', 'Crash', 'null'))
                        | where TimeGenerated {timeGenerated}
                        {condition}
                        """
    # print(logAnalyticsQuery)
    vmRebootsStatus = queryInLogAnalytics(workspaceId, logAnalyticsQuery,"","")
    columns = vmRebootsStatus.columns
    print("Columns")
    print(columns)
    if(not vmRebootsStatus.empty and "TimeGenerated" in columns):
        vmRebootsStatus["TimeGenerated"] = vmRebootsStatus["TimeGenerated"].dt.strftime('%Y-%m-%d %H:%M:%S')

    VMRebootData["Server"] = vmRebootsStatus.to_json()

    if(aggregate=="yes"):
        #vmRebootsStatus=vmRebootsStatus.reset_index(drop=True, inplace=True)
        vmRebootsStatusT = vmRebootsStatus.T
        
        vmRebootsStatusT.columns=vmRebootsStatusT.iloc[0]
        vmRebootsStatusT = vmRebootsStatusT.iloc[1:]
        
        if('Graceful' in vmRebootsStatusT.columns):
            graceful = vmRebootsStatusT['Graceful'].iloc[0]
        else:
            graceful = 0
        if('Crash' in vmRebootsStatusT.columns):
            crash = vmRebootsStatusT['Crash'].iloc[0]
        else:
            crash = 0
        
        
        VMRebootData["Server"] = {"GracefulReboot":graceful,"CrashReboot":crash}
    
    return VMRebootData


def workstation_Metrics_df(connectionString, apmNumbers, startTime, endTime):
    USERNAME = 'servCRCAMonitoring@providence.org'
    PASSWORD = ""
    url = "https://my-odata.aternity.com/aternity.odata/latest/RAW_DATA_CPU_MEMORY?$filter=in(DEVICE_NAME,%27AKDT1144983%27,%20%27AKDT39JKWP3%27,%20%27AKDT1073657%27,%20%27AKDT1045812%27,%20%27MTDTD5TSJD3%27,%20%27MTDTD05VJD3%27,%20%27WADTD8G0FF3%27,%20%27WADTHTGDQ53%27,%20%27SEDT993057%27,%20%27WADT3CJ8NF3%27,%20%27WIN161J0F3%27,%20%27WADT991643%27,%20%27WADT990661%27,%20%27WADT991652%27,%20%27WADT990667%27,%20%27WADT991642%27,%20%27WADT8GY9R53%27,%20%27WADT1098808%27,%20%27WADT5JVYNF3%27,%20%27WADT8GY8R53%27,%20%27WADT1024654%27,%20%27WADT1027222%27,%20%27ORLT7Y0RP73%27,%20%27ORLTDM8LNQJ%27,%20%27ORLTBH9HDB3%27,%20%27ORDT49P9H63%27,%20%27ORLT522JP73%27,%20%27ORLTCKPSP73%27,%20%27SJO-TL-1WVT0S2%27,%20%27SJO-TL-1WVS0S2%27,%20%27SJO-TL-1WTX0S2%27,%20%27SJO-TL-BG5DCP2%27,%20%27SJO-TL-1WTZ0S2%27,%20%27SJO-TL-1WTY0S2%27,%20%27CADTBKKQQJ3%27,%20%27CADT4J3RN3%27,%20%27CADT1041428%27,%20%27CADT1025299%27,%20%27CADT995785%27,%20%27CADT76KF8B3%27,%20%27TXDTFFCJPY2%27,%20%27TXDT1039502%27,%20%27TXDT1030618%27,%20%27TXDT1062722%27,%20%27TXDT027459%27,%20%27TXDT1036730%27%20)%20and%20relative_time(last_7_days)"
    
    response = requests.get(url, auth=HTTPBasicAuth(USERNAME, PASSWORD))
    data = response.json()
    json_data = data['value']
    df = pd.DataFrame(json_data)
    '''
    for columns in df:
        print(columns)
        '''
    #df.drop(index=0, axis=columns)
    #df=df.drop(index=0, axis='columns')
    print(df)

    query = f'''  select distinct(DeviceName) from [dbo].[EdgeDevice_MasterData] 
            where [APMNumber] in ({apmNumbers}) '''
    
    device_name_list = queryDw(connectionString, query)
    device_names = ""

    #print(device_name_list)
    for row in device_name_list:
        device_names = device_names + "'" + row[0]+"' , "
    device_names = device_names[0:len(device_names)-2]

    #print(device_names)
    device_names_array = device_names.replace("'", "").split(",")
    #print(device_names_array)

    cleaned_device_names_array = [s.strip() for s in device_names_array]
    #print(cleaned_device_names_array)

    df_filtered = df[df['DEVICE_NAME'].isin(cleaned_device_names_array)]

    print(df_filtered)

    distinct_device_names = df_filtered['DEVICE_NAME'].unique()
    print(distinct_device_names)

    unique_device_name_count = df_filtered['DEVICE_NAME'].nunique()

    #print(unique_device_name_count)
    totalWorkstation = unique_device_name_count
    df_filtered1 = df_filtered[df_filtered['HRC_CPU_UTIL_AVG'] > 80]
    print(df_filtered1)

    unique_device_name_count1 = df_filtered1['DEVICE_NAME'].nunique()

    #print(unique_device_name_count1)

    cpu_utilisation = unique_device_name_count1

    df_filtered2 = df_filtered[df_filtered['HRC_VIRTUAL_MEMORY_UTIL_AVG'] > 80]

    unique_device_name_count2 = df_filtered2['DEVICE_NAME'].nunique()

    print(unique_device_name_count2)

    ans= []
    workstationMetricsData["Server"] = df_filtered
    workstationMetricsData["totalWorkstations"] = unique_device_name_count
    workstationMetricsData["CPUUtization"] = unique_device_name_count1
    workstationMetricsData["memoryUtilization"] = unique_device_name_count2



    ans.append(unique_device_name_count)
    ans.append(unique_device_name_count1)
    ans.append(unique_device_name_count2)
    return workstationMetricsData

def AzureSqlDatabase(connectionString, apmNumber, startTime, endTime):

    dbQuery = f"""SELECT [Date]    ,[subscriptionId] AS SubscriptionId   ,[name] AS ResourceGrouo ,[tag_applicationID] AS APMNumber 
            ,[tag_applicationCI] AS AppCI ,[tag_appSupportGroup] AS SupportGroup 
            FROM [dbo].[AzRGDetails] WHERE [Date] = (select dateadd(day,-2, cast(getdate() as date))) and ([tag_applicationID] like 'APM%' OR [tag_applicationID] like 'BSN%') 
            and [tag_applicationID] not in ('APM0000000','APM-MISSING','APM000Temp005') and [subscriptionId] in ('ab16a144-47d7-45c5-bcb7-8affc988f8e0','9592c342-d1fb-477e-8e91-ad39bf00933b','5467bf57-48b4-4930-b3cb-bf039b259d04','343a7ee0-5081-4024-82fc-498ee61867a9','6d590d81-bab9-4b9a-b011-090467b5a9a4','accde124-a45f-47be-aefa-b09362b2c5fc')
            and [tag_applicationID] in ({apmNumber})"""
    
    list = queryDw(connectionString, dbQuery)
    print(list)

def fetchCustomThreshold():
    connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    query = f"""SELECT t.* FROM customthreshold t INNER JOIN (SELECT AppCI, Type, MAX(modifieddate) AS modifiedDate FROM customthreshold GROUP BY AppCI, Type) md ON t.AppCI = md.AppCI AND t.Type = md.Type AND t.modifieddate = md.modifiedDate;"""
    customThreshold = queryDw(connectionString, query)
    customThresholdDataDataFrame = pd.DataFrame(numpy.array(customThreshold), columns = ['AppCI','Type','Threshold','Changedby','Comments','ModifiedDate'])
    customThresholdDataDataFrame["ModifiedDate"] = customThresholdDataDataFrame["ModifiedDate"].dt.strftime('%Y-%m-%d %H:%M:%S')
    customThresholdJson = customThresholdDataDataFrame.to_json(orient='records', indent=2)
    # print(SupportGroupAppCiDataJson)
    # print(customThresholdJson)
    return customThresholdJson

def process_data_for_duration(df,customThreshold):
    # Define the function here, or import it if defined externally
    # print("my df is", df)
    customThreshold = json.loads(fetchCustomThreshold())
    print("my custom threshold is", customThreshold)
    
    def calculate_high_utilization(row):
        threshold_entry = next((entry for entry in customThreshold
                                if entry['AppCI'].lower() == row['AppCI'].lower() and
                                   entry['Type'].lower() == row['AlertType'].lower()), 
                               None)
        threshold = threshold_entry['Threshold'] if threshold_entry else 90
        # print("threshold, threshold_entry",threshold, threshold_entry)
        return 1 if row['AvgValue'] > threshold else 0

    df['IsHighUtilization'] = df.apply(calculate_high_utilization, axis=1)

    # df_cleaned = df.drop(columns=['AppCI']).drop_duplicates()

    df['groupKey'] = df.apply(lambda x: f"{x['ServerName']}_{x['DriveName']}" if 'DriveName' in x and pd.notnull(x['DriveName']) else x['ServerName'], axis=1)
    grouped = df.groupby('groupKey')
    duration_data = []

    for _, group in grouped:
        # print(group)
        group_start_time = None
        current_group = None
        
        for _, row in group.iterrows():
            current_time = datetime.strptime(row['TimeGenerated'], "%Y-%m-%d %H:%M")
            
            if row['IsHighUtilization'] == 1:
                if not group_start_time:
                    group_start_time = current_time
                    current_group = row.to_dict()
                    current_group['startTime'] = row['TimeGenerated']
                    current_group['maxDuration'] = 0
                
                duration = (current_time - group_start_time).total_seconds() / 60  # Duration in minutes
                current_group['maxDuration'] = max(current_group['maxDuration'], duration)
            elif current_group:
                current_group['endTime'] = row['TimeGenerated']
                duration_data.append(current_group)
                group_start_time = None
                current_group = None
        
        if current_group:
            current_group['endTime'] = group.iloc[-1]['TimeGenerated']
            duration_data.append(current_group)

    duration_df = pd.DataFrame(duration_data)
    if(len(duration_df)>0):
        duration_df.sort_values(by=['ServerName', 'startTime'], inplace=True)
    # print( "qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq\n" , duration_df)
    # duration_df1 = duration_df[['ServerName','TimeGenerated','endTime','maxDuration']]
    # print("duration_df1")
    # print(duration_df1)
    return duration_df

def azureServerMetrics_CPU_df(aggregate, serverName,subRg, connectionString, apmNumber, startTime, endTime, threshold=80):
    #print("threshold value being passed in first drill cpu", threshold)

    format_string = "%Y-%m-%d %I:%M:%S %p"
    if(startTime==""):
       
        #print(datetime.now())
        currentTime = datetime.now()
        pst = pytz.timezone('America/Los_Angeles')
        endTime = currentTime.astimezone(pst)
        startTime = endTime - timedelta(hours=5)
        startTime = startTime.strftime(format_string)
        endTime = endTime.strftime(format_string)
        startTimeCloud = datetime.strptime(startTime, "%Y-%m-%d %I:%M:%S %p") - timedelta(minutes=10)
        startTimeCloud = startTimeCloud.strftime(format_string)
    else:
        startTimeCloud = datetime.strptime(startTime, "%Y-%m-%d %I:%M:%S %p") - timedelta(minutes=10)
        startTimeCloud = startTimeCloud.strftime(format_string)
        startTime = datetime.strptime(startTime, "%Y-%m-%d %I:%M:%S %p").strftime("%Y-%m-%d %H:%M:%S")
        endTime = datetime.strptime(endTime, "%Y-%m-%d %I:%M:%S %p").strftime("%Y-%m-%d %H:%M:%S")
    
    timeGenerated = f""" and (TimeGenerated between Convert(datetime,'{startTimeCloud}') and Convert(datetime,'{endTime}'))"""
    
    serverName_Cond = ""
    serverName_Cond_onPrem = ""
    server_names_onPrem = ""
    subRg_Cond = ""
    server_names = ""
    df_ServerNameAppCI = pd.DataFrame()

    server_name_query = f"""select ServerName, AppCI, ServerHostingType from CrcaServerListData where"""
    if(serverName=="" and apmNumber!=""):
        
        server_name_query += f""" APMNumber IN ({apmNumber})"""
        # print(server_name_query)
        s = datetime.now()
        server_name_list = queryDw(connectionString, server_name_query)
        e = datetime.now()
        azureServerMetricsCPUData["API Read ServerList"] = str(s)+" - "+str(e)

        for row in server_name_list:
            server_names = server_names + "'" + row[0]+"' , "
            if(not("Cloud" in row[2])):
                server_names_onPrem = server_names_onPrem + "'" + row[0]+"' , "

        server_names = server_names[0:len(server_names)-2]
        
        df_ServerNameAppCI = pd.DataFrame(numpy.array(server_name_list), columns=["ServerName", "AppCI", "HostingType"])

        serverName_Cond = f"""ServerName in ({server_names})"""
        
        server_names_onPrem = server_names_onPrem[0:len(server_names_onPrem)-2]
        serverName_Cond_onPrem = f"""ServerName in ({server_names_onPrem})"""
        
    elif(serverName!=""):
        server_name_query += f""" lower(ServerName) IN ({serverName})"""
        print("THe server name is not empty")
        print(server_name_query)
        s = datetime.now()
        server_name_list = queryDw(connectionString, server_name_query)
        e = datetime.now()
        azureServerMetricsCPUData["API Read ServerList"] = str(s)+" - "+str(e)

        for row in server_name_list:
            server_names = server_names + "'" + row[0]+"' , "
            if(not("Cloud" in row[2])):
                server_names_onPrem = server_names_onPrem + "'" + row[0]+"' , "
        server_names = server_names[0:len(server_names)-2]

        df_ServerNameAppCI = pd.DataFrame(numpy.array(server_name_list), columns=["ServerName", "AppCI", "HostingType"])
        # print(df_ServerNameAppCI)
        serverName_Cond = f"""ServerName in ({serverName})"""
        server_names_onPrem = server_names_onPrem[0:len(server_names_onPrem)-2]
        serverName_Cond_onPrem = f"""ServerName in ({server_names_onPrem})"""
        
    elif(subRg!=""):
        subRg_Cond = f""" and (SubscriptionId +'/'+ ResourceGroup) in {subRg}"""

    df_cpuUtil = pd.DataFrame()
    cpuUtilDataOnPrem = pd.DataFrame()
    s = datetime.now()
    cpuUtilDataAzure = azureCpuUtilization(aggregate, serverName_Cond, timeGenerated, subRg_Cond, threshold)
    e = datetime.now()
    azureServerMetricsCPUData["API Read Azure CPU Utilization Function"] = str(s)+" - "+str(e)

    # print(server_names_onPrem)
    if(server_names_onPrem!=""):
        s=datetime.now()
        cpuUtilDataOnPrem = onPremCpuUtilization(aggregate, serverName_Cond_onPrem, timeGenerated, subRg_Cond, threshold)
        e=datetime.now()
        azureServerMetricsCPUData["API Read OnPrem CPU Utilization Function"] = str(s)+" - "+str(e)
    
    if(len(cpuUtilDataAzure)>0):
        df_cpuUtil = pd.concat([df_cpuUtil,cpuUtilDataAzure], axis=0)
    if(len(cpuUtilDataOnPrem)>0):
        df_cpuUtil = pd.concat([df_cpuUtil,cpuUtilDataOnPrem], axis=0)

    if(len(df_ServerNameAppCI)>0 and len(df_cpuUtil)>0):
        df_ServerNameAppCI = df_ServerNameAppCI.drop('HostingType', axis=1)
        df_cpuUtil = pd.merge(df_cpuUtil, df_ServerNameAppCI, on='ServerName')
    

    #after gac merge
    if(aggregate=="forGAC" and len(df_cpuUtil)>0):  
        df_cpuUtil['AlertType']='cpu'
        threshold = json.loads(fetchCustomThreshold())
        df_cpuUtil = processDataForDuration(df_cpuUtil,threshold)

    azureServerMetricsCPUData["Server"] = df_cpuUtil
    return azureServerMetricsCPUData


def fetchCustomThreshold():
    connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    query = f"""SELECT t.* FROM customthreshold t INNER JOIN (SELECT AppCI, Type, MAX(modifieddate) AS modifiedDate FROM customthreshold GROUP BY AppCI, Type) md ON t.AppCI = md.AppCI AND t.Type = md.Type AND t.modifieddate = md.modifiedDate;"""
    customThreshold = queryDw(connectionString, query)
    customThresholdDataDataFrame = pd.DataFrame(numpy.array(customThreshold), columns = ['AppCI','Type','Threshold','Changedby','Comments','ModifiedDate'])
    customThresholdDataDataFrame["ModifiedDate"] = customThresholdDataDataFrame["ModifiedDate"].dt.strftime('%Y-%m-%d %H:%M:%S')
    customThresholdJson = customThresholdDataDataFrame.to_json(orient='records', indent=2)
    # print(SupportGroupAppCiDataJson)
    # print(customThresholdJson)
    return customThresholdJson
 

def azureServerMetrics_Memory_df(aggregate, serverName, subRg, connectionString, apmNumber, startTime, endTime,threshold=80):
    #print("threshold value being passed in first drill memory", threshold)
    format_string = "%Y-%m-%d %I:%M:%S %p"
    if(startTime==""):
       
        #print(datetime.now())
        currentTime = datetime.now()
        pst = pytz.timezone('America/Los_Angeles')
        endTime = currentTime.astimezone(pst)
        startTime = endTime - timedelta(hours=5)
        startTime = startTime.strftime(format_string)
        endTime = endTime.strftime(format_string)
        startTimeCloud = datetime.strptime(startTime, "%Y-%m-%d %I:%M:%S %p") - timedelta(minutes=10)
        startTimeCloud = startTimeCloud.strftime(format_string)
    else:
        startTimeCloud = datetime.strptime(startTime, "%Y-%m-%d %I:%M:%S %p") - timedelta(minutes=10)
        startTimeCloud = startTimeCloud.strftime(format_string)
        startTime = datetime.strptime(startTime, "%Y-%m-%d %I:%M:%S %p").strftime("%Y-%m-%d %H:%M:%S")
        endTime = datetime.strptime(endTime, "%Y-%m-%d %I:%M:%S %p").strftime("%Y-%m-%d %H:%M:%S")
    
    timeGenerated = f""" and (TimeGenerated between Convert(datetime,'{startTimeCloud}') and Convert(datetime,'{endTime}'))"""
 
    serverName_Cond = ""
    serverName_Cond_onPrem = ""
    server_names_onPrem = ""
    subRg_Cond = ""
    server_names = ""
    df_ServerNameAppCI = pd.DataFrame()

    # server_name_query = f"""
    #     SELECT distinct LOWER(cmdbci.[name]) AS ServerName, BusinessApp.name AS AppCI, 
    #     Case
    #         when cmdbci.u_is_cloud like 'true' then 'Cloud'
    #         else 'OnPremise'
	# 	End AS HostingType FROM   
    #     [ServicePerf_DW].[dbo].[vw_sn_cmdb_ci_server] AS cmdbci
    #     INNER JOIN  
    #     vw_SN_Appl_Relationship AS AppRelation ON AppRelation.RelationshipID = cmdbci.sys_id
    #     INNER JOIN  
    #     vw_SN_cmdb_ci_business_app AS BusinessApp ON BusinessApp.sys_id = AppRelation.ApplicationID
    #     WHERE       
    #     (BusinessApp.portfolio_name = 'Clinical & Revenue Cycle Apps (CRCA)'
    #     OR BusinessApp.[apm_application_family_name] LIKE 'Cromwell')
    #     AND BusinessApp.active = 'true'
    #     AND cmdbci.operational_status_label in ('Operational', 'Repair in Progress', 'VM Terminated', 'Sleep Test in Progress')
    #     AND AppRelation.Relationship = 'Runs on'
    #     AND"""

    server_name_query = f"""select ServerName, AppCI, ServerHostingType from CrcaServerListData where"""

    if(serverName=="" and apmNumber!=""):
        
        server_name_query += f""" APMNumber IN ({apmNumber})"""        
        # print(server_name_query)
        s = datetime.now()
        server_name_list = queryDw(connectionString, server_name_query)
        e = datetime.now()
        azureServerMetricsMemoryData["API Read ServerList"] = str(s)+" - "+str(e)


        for row in server_name_list:
            server_names = server_names + "'" + row[0]+"' , "
            if(not("Cloud" in row[2])):
                server_names_onPrem = server_names_onPrem + "'" + row[0]+"' , "

        server_names = server_names[0:len(server_names)-2]
        
        df_ServerNameAppCI = pd.DataFrame(numpy.array(server_name_list), columns=["ServerName", "AppCI", "HostingType"])

        serverName_Cond = f"""ServerName in ({server_names})"""
        
        server_names_onPrem = server_names_onPrem[0:len(server_names_onPrem)-2]
        serverName_Cond_onPrem = f"""ServerName in ({server_names_onPrem})"""
        
    elif(serverName!=""):
        server_name_query += f""" lower(ServerName) IN ({serverName})"""
        s = datetime.now()
        server_name_list = queryDw(connectionString, server_name_query)
        e = datetime.now()
        azureServerMetricsMemoryData["API Read ServerList"] = str(s)+" - "+str(e)

        for row in server_name_list:
            server_names = server_names + "'" + row[0]+"' , "
            if(not("Cloud" in row[2])):
                server_names_onPrem = server_names_onPrem + "'" + row[0]+"' , "
        server_names = server_names[0:len(server_names)-2]

        df_ServerNameAppCI = pd.DataFrame(numpy.array(server_name_list), columns=["ServerName", "AppCI", "HostingType"])
        
        serverName_Cond = f"""ServerName in ({serverName})"""
        server_names_onPrem = server_names_onPrem[0:len(server_names_onPrem)-2]
        serverName_Cond_onPrem = f"""ServerName in ({server_names_onPrem})"""
    elif(subRg!=""):
        
        subRg_Cond = f""" and (SubscriptionId +'/'+ ResourceGroup) in {subRg}"""

    df_memoryUtil = pd.DataFrame()
    memoryUtilDataOnPrem = pd.DataFrame()
    s = datetime.now()
    memoryUtilDataAzure = azureMemoryUtilization(aggregate, serverName_Cond, timeGenerated, subRg_Cond,threshold)
    e = datetime.now()
    azureServerMetricsMemoryData["API read Azure Memory Utilization Function"] = str(s)+" - "+str(e)

    # print(server_names_onPrem)
    if(server_names_onPrem!=""):
        s = datetime.now()
        memoryUtilDataOnPrem = onPremMemoryUtilization(aggregate, serverName_Cond_onPrem, timeGenerated,subRg_Cond,threshold)
        e = datetime.now()
        azureServerMetricsMemoryData["API read OnPrem Memory Utilization Function"] = str(s)+" - "+str(e)
    
    
    if(len(memoryUtilDataAzure)>0):
        df_memoryUtil = pd.concat([df_memoryUtil,memoryUtilDataAzure], axis=0)
    if(len(memoryUtilDataOnPrem)>0):
        df_memoryUtil = pd.concat([df_memoryUtil,memoryUtilDataOnPrem], axis=0)

    if(len(df_ServerNameAppCI)>0 and len(df_memoryUtil)>0):
        df_ServerNameAppCI = df_ServerNameAppCI.drop('HostingType', axis=1)
        df_memoryUtil = pd.merge(df_memoryUtil, df_ServerNameAppCI, on='ServerName')

    # if(aggregate=="forGAC" and len(df_memoryUtil)>0):  
    #     df_memoryUtil['AlertType']='memory'
    #     df_memoryUtil = process_data_for_duration(df_memoryUtil,threshold)
    #     print("process_data_for_duration df_memoryUtil")
    #     print(df_memoryUtil)    

    #after gac merge
    if(aggregate=="forGAC" and len(df_memoryUtil)>0):  
        df_memoryUtil['AlertType']='memory'
        threshold = json.loads(fetchCustomThreshold())
        df_memoryUtil = processDataForDuration(df_memoryUtil,threshold)
    
    azureServerMetricsMemoryData["Server"] = df_memoryUtil
    
    return azureServerMetricsMemoryData

def azureServerMetrics_Network_df(serverName, subRg, connectionString, apmNumber, startTime, endTime):
    #print("threshold value being passed in first drill memory", threshold)
    format_string = "%Y-%m-%d %I:%M:%S %p"
    if(startTime==""):
        
        #print(datetime.now())
        currentTime = datetime.now()
        pst = pytz.timezone('America/Los_Angeles')
        endTime = currentTime.astimezone(pst)
        startTime = endTime - timedelta(hours=5)
        startTime = startTime.strftime(format_string)
        endTime = endTime.strftime(format_string)
        startTimeCloud = datetime.strptime(startTime, "%Y-%m-%d %I:%M:%S %p") - timedelta(minutes=10)
        startTimeCloud = startTimeCloud.strftime(format_string)
    else:
        startTimeCloud = datetime.strptime(startTime, "%Y-%m-%d %I:%M:%S %p") - timedelta(minutes=10)
        startTimeCloud = startTimeCloud.strftime(format_string)
        startTime = datetime.strptime(startTime, "%Y-%m-%d %I:%M:%S %p").strftime("%Y-%m-%d %H:%M:%S")
        endTime = datetime.strptime(endTime, "%Y-%m-%d %I:%M:%S %p").strftime("%Y-%m-%d %H:%M:%S")
    
    timeGenerated = f""" and (TimeGenerated between Convert(datetime,'{startTimeCloud}') and Convert(datetime,'{endTime}'))"""
    timeGenerated_onPrem = f""" and ((DATEADD(minute, (DATEDIFF(minute, 0, (vph.DateTime AT TIME ZONE 'Pacific Standard Time')) / 10) * 10, 0)) between Convert(datetime,'{startTime}') and Convert(datetime,'{endTime}'))"""
    
    serverName_Cond = ""
    serverName_Cond_onPrem = ""
    server_names_onPrem = ""
    subRg_Cond = ""
    server_names = ""
    df_ServerNameAppCI = pd.DataFrame()

    server_name_query = f"""
        SELECT distinct LOWER(cmdbci.[name]) AS ServerName, BusinessApp.name AS AppCI, 
        Case
            when cmdbci.u_is_cloud like 'true' then 'Cloud'
            else 'OnPremise'
		End AS HostingType FROM   
        [ServicePerf_DW].[dbo].[vw_sn_cmdb_ci_server] AS cmdbci
        INNER JOIN  
        vw_SN_Appl_Relationship AS AppRelation ON AppRelation.RelationshipID = cmdbci.sys_id
        INNER JOIN  
        vw_SN_cmdb_ci_business_app AS BusinessApp ON BusinessApp.sys_id = AppRelation.ApplicationID
        WHERE       
        (BusinessApp.portfolio_name = 'Clinical & Revenue Cycle Apps (CRCA)'
        OR BusinessApp.[apm_application_family_name] LIKE 'Cromwell')
        AND BusinessApp.active = 'true'
        AND cmdbci.operational_status_label in ('Operational', 'Repair in Progress', 'VM Terminated', 'Sleep Test in Progress')
        AND AppRelation.Relationship = 'Runs on'
        AND"""

    if(serverName=="" and apmNumber!=""):
        
        server_name_query += f""" BusinessApp.[number] IN ({apmNumber})"""
        #print(server_name_query)
        server_name_list = queryDw(connectionString, server_name_query)
        for row in server_name_list:
            server_names = server_names + "'" + row[0]+"' , "
            if(not("Cloud" in row[2])):
                server_names_onPrem = server_names_onPrem + "'" + row[0]+"' , "

        server_names = server_names[0:len(server_names)-2]
        
        df_ServerNameAppCI = pd.DataFrame(numpy.array(server_name_list), columns=["ServerName", "AppCI", "HostingType"])

        serverName_Cond = f"""ServerName in ({server_names})"""
        
        server_names_onPrem = server_names_onPrem[0:len(server_names_onPrem)-2]
        serverName_Cond_onPrem = f"""LOWER(LEFT(vManagedEntity.Path, CHARINDEX('.', vManagedEntity.Path + '.') - 1)) in ({server_names_onPrem})"""
        
    elif(serverName!=""):
        server_name_query += f""" lower(ServerName) IN ({serverName})"""
        server_name_list = queryDw(connectionString, server_name_query)
        for row in server_name_list:
            server_names = server_names + "'" + row[0]+"' , "
            if(not("Cloud" in row[2])):
                server_names_onPrem = server_names_onPrem + "'" + row[0]+"' , "
        server_names = server_names[0:len(server_names)-2]

        df_ServerNameAppCI = pd.DataFrame(numpy.array(server_name_list), columns=["ServerName", "AppCI", "HostingType"])
        
        serverName_Cond = f"""ServerName in ({serverName})"""
        server_names_onPrem = server_names_onPrem[0:len(server_names_onPrem)-2]
        serverName_Cond_onPrem = f"""LOWER(LEFT(vManagedEntity.Path, CHARINDEX('.', vManagedEntity.Path + '.') - 1)) in ({server_names_onPrem})"""
    elif(subRg!=""):
        
        subRg_Cond = f""" and (SubscriptionId +'/'+ ResourceGroup) in {subRg}"""

    df_networkUtil = pd.DataFrame()
    networkUtilDataOnPrem = pd.DataFrame()
    networkUtilDataAzure = azureNetworkUtilization(serverName_Cond, timeGenerated, subRg_Cond)
    # print("in infra: ", networkUtilDataAzure)
    # print(server_names_onPrem)
    if(server_names_onPrem!=""):
        networkUtilDataOnPrem =0
    
    if(len(networkUtilDataAzure)>0):
        df_networkUtil = pd.concat([df_networkUtil,networkUtilDataAzure], axis=0)
    if(len(networkUtilDataOnPrem)>0):
        df_networkUtil = pd.concat([df_networkUtil,networkUtilDataOnPrem], axis=0)

    if(len(df_ServerNameAppCI)>0 and len(df_networkUtil)>0):
        df_ServerNameAppCI = df_ServerNameAppCI.drop('HostingType', axis=1)
        df_networkUtil = pd.merge(df_networkUtil, df_ServerNameAppCI, on='ServerName')
    
    azureServerMetricsNetworkData["Server"] = df_networkUtil
    
    return azureServerMetricsNetworkData

def azureServerMetrics_Fileshare_df(aggregate,startTime, endTime, appname):
    format_string = "%Y-%m-%d %I:%M:%S %p"
    print(startTime)
    if startTime == "":
        currentTime = datetime.now()
        pst = pytz.timezone('America/Los_Angeles')
        endTime = currentTime.astimezone(pst)
        startTime = endTime - timedelta(hours=5)
        startTime = startTime.strftime(format_string)
        endTime = endTime.strftime(format_string)
    else:
        startTime = datetime.strptime(startTime, "%Y-%m-%d %I:%M:%S %p").strftime("%Y-%m-%d %H:%M:%S")
        endTime = datetime.strptime(endTime, "%Y-%m-%d %I:%M:%S %p").strftime("%Y-%m-%d %H:%M:%S")
    
    timeGenerated = f"""TimeGenerated BETWEEN CONVERT(datetime, '{startTime}') AND CONVERT(datetime, '{endTime}')"""
    appnamecond = f"""LOWER(ServerName) in ({appname})"""
    s = datetime.now()
    df_fileshareUtil = azureFileshareUtilization(aggregate,timeGenerated,appnamecond)
    e = datetime.now()
    print("hello")
    print(df_fileshareUtil)
    azureServerMetricsFileshareData = {"ServerName": df_fileshareUtil}
    azureServerMetricsFileshareData["Fileshare API read FileShare Utilization Function"] = str(s)+" - "+str(e)

    return azureServerMetricsFileshareData

def azureServerMetrics_Disk_df(aggregate,serverName, subRg, connectionString, apmNumber, startTime, endTime,threshold=80):
    #print("threshold value being passed in first drill disk", threshold)
    format_string = "%Y-%m-%d %I:%M:%S %p"
    if(startTime==""):
        
        #print(datetime.now())
        currentTime = datetime.now()
        pst = pytz.timezone('America/Los_Angeles')
        endTime = currentTime.astimezone(pst)
        startTime = endTime - timedelta(hours=5)
        startTime = startTime.strftime(format_string)
        endTime = endTime.strftime(format_string)
        startTimeCloud = datetime.strptime(startTime, "%Y-%m-%d %I:%M:%S %p") - timedelta(minutes=10)
        startTimeCloud = startTimeCloud.strftime(format_string)
    else:
        startTimeCloud = datetime.strptime(startTime, "%Y-%m-%d %I:%M:%S %p") - timedelta(minutes=10)
        startTimeCloud = startTimeCloud.strftime(format_string)
        startTime = datetime.strptime(startTime, "%Y-%m-%d %I:%M:%S %p").strftime("%Y-%m-%d %H:%M:%S")
        endTime = datetime.strptime(endTime, "%Y-%m-%d %I:%M:%S %p").strftime("%Y-%m-%d %H:%M:%S")
    
    timeGenerated = f""" and (TimeGenerated between Convert(datetime,'{startTimeCloud}') and Convert(datetime,'{endTime}'))"""
    # timeGenerated = f"""between(datetime("{startTime}") .. datetime("{endTime}"))"""
    
    serverName_Cond = ""
    serverName_Cond_onPrem = ""
    server_names_onPrem = ""
    subRg_Cond = ""
    server_names = ""
    df_ServerNameAppCI = pd.DataFrame()

    # server_name_query = f"""
    #     SELECT distinct LOWER(cmdbci.[name]) AS ServerName, BusinessApp.name AS AppCI, 
    #     Case
    #         when cmdbci.u_is_cloud like 'true' then 'Cloud'
    #         else 'OnPremise'
	# 	End AS HostingType FROM   
    #     [ServicePerf_DW].[dbo].[vw_sn_cmdb_ci_server] AS cmdbci
    #     INNER JOIN  
    #     vw_SN_Appl_Relationship AS AppRelation ON AppRelation.RelationshipID = cmdbci.sys_id
    #     INNER JOIN  
    #     vw_SN_cmdb_ci_business_app AS BusinessApp ON BusinessApp.sys_id = AppRelation.ApplicationID
    #     WHERE       
    #     (BusinessApp.portfolio_name = 'Clinical & Revenue Cycle Apps (CRCA)'
    #     OR BusinessApp.[apm_application_family_name] LIKE 'Cromwell')
    #     AND BusinessApp.active = 'true'
    #     AND cmdbci.operational_status_label in ('Operational', 'Repair in Progress', 'VM Terminated', 'Sleep Test in Progress')
    #     AND AppRelation.Relationship = 'Runs on'
    #     AND"""

    server_name_query = f"""select ServerName, AppCI, ServerHostingType from CrcaServerListData where"""

    if(serverName=="" and apmNumber!=""):
        
        server_name_query += f""" APMNumber IN ({apmNumber})"""
        # print(server_name_query)
        s = datetime.now()
        server_name_list = queryDw(connectionString, server_name_query)
        e = datetime.now()
        azureServerMetricsDiskData["API read ServerList"] = str(s)+" - "+str(e)

        for row in server_name_list:
            server_names = server_names + "'" + row[0]+"' , "
            if(not("Cloud" in row[2])):
                server_names_onPrem = server_names_onPrem + "'" + row[0]+"' , "

        server_names = server_names[0:len(server_names)-2]
        
        df_ServerNameAppCI = pd.DataFrame(numpy.array(server_name_list), columns=["ServerName", "AppCI", "HostingType"])
        serverName_Cond = f"""ServerName in ({server_names})"""
        # serverName_Cond = f"""| where  ServerName in ({server_names})"""
        server_names_onPrem = server_names_onPrem[0:len(server_names_onPrem)-2]
        serverName_Cond_onPrem = f"""ServerName in ({server_names_onPrem})"""
    elif(serverName!=""):
        server_name_query += f""" lower(ServerName) IN ({serverName})"""
        s=datetime.now()
        server_name_list = queryDw(connectionString, server_name_query)
        e=datetime.now()
        azureServerMetricsDiskData["API read ServerList"] = str(s)+" - "+str(e)

        for row in server_name_list:
            server_names = server_names + "'" + row[0]+"' , "
            if(not("Cloud" in row[2])):
                server_names_onPrem = server_names_onPrem + "'" + row[0]+"' , "
        server_names = server_names[0:len(server_names)-2]

        df_ServerNameAppCI = pd.DataFrame(numpy.array(server_name_list), columns=["ServerName", "AppCI", "HostingType"])
        
        serverName_Cond = f"""ServerName in ({serverName})"""
        # serverName_Cond = f"""| where  ServerName in ({serverName})"""
        server_names_onPrem = server_names_onPrem[0:len(server_names_onPrem)-2]
        serverName_Cond_onPrem = f"""ServerName in ({server_names_onPrem})"""
    elif(subRg!=""):
        subRg_Cond = f""" and (SubscriptionId +'/'+ ResourceGroup) in {subRg}"""
        # subRg_Cond = f"""| extend subRgServer = strcat(SubscriptionId,"/",ResourceGroup)
        # | where  subRgServer in ({subRg})"""

    df_diskUtil = pd.DataFrame()
    diskUtilDataOnPrem = pd.DataFrame()
    s=datetime.now()
    diskUtilDataAzure = azureDiskUtilization(aggregate, serverName_Cond, timeGenerated, subRg_Cond,threshold)
    e=datetime.now()
    azureServerMetricsDiskData["API read azureDiskUtilizationn Function"]= str(s)+" - "+str(e)
    # print(server_names_onPrem)""
    if(server_names_onPrem!=""):
        s=datetime.now()
        diskUtilDataOnPrem = onPremDiskUtilization(aggregate, serverName_Cond_onPrem, timeGenerated,subRg_Cond,threshold)
        e=datetime.now()
        azureServerMetricsDiskData["API read onPremDiskUtilization Function"]= str(s)+" - "+str(e)
    
    
    if(len(diskUtilDataAzure)>0):
        df_diskUtil = pd.concat([df_diskUtil,diskUtilDataAzure], axis=0)
    if(len(diskUtilDataOnPrem)>0):
        df_diskUtil = pd.concat([df_diskUtil,diskUtilDataOnPrem], axis=0)

    if(len(df_ServerNameAppCI)>0 and len(df_diskUtil)>0):
        df_ServerNameAppCI = df_ServerNameAppCI.drop('HostingType', axis=1)
        df_diskUtil = pd.merge(df_diskUtil, df_ServerNameAppCI, on='ServerName')
    # print("DISK:--------------")
    # print(df_diskUtil)
    #addhere
    # if(aggregate=="forGAC"and len(df_diskUtil)>0):  
    #     df_diskUtil['AlertType']='disk'
    #     df_diskUtil = process_data_for_duration(df_diskUtil,threshold)
    #     print("process_data_for_duration df_diskUtil")
    #     print(df_diskUtil)

    #after gac merge
    if(aggregate=="forGAC"and len(df_diskUtil)>0):  
        df_diskUtil['AlertType']='disk'
        threshold = json.loads(fetchCustomThreshold())
        df_diskUtil = processDataForDuration(df_diskUtil,threshold)

    azureServerMetricsDiskData["Server"] = df_diskUtil

    return azureServerMetricsDiskData

def infraAnomalies(apmNumber, aggregate, connectionString, startTime, endTime):

    if(startTime==""):
        format_string = "%Y-%m-%d %H:%M:%S"
        #print(datetime.now())
        currentTime = datetime.now()
        pst = pytz.timezone('America/Los_Angeles')
        endTime = currentTime.astimezone(pst)
        startTime = endTime - timedelta(hours=5)
        startTime = startTime.strftime(format_string)
        endTime = endTime.strftime(format_string)

    else:
        startTime = datetime.strptime(startTime, "%Y-%m-%d %I:%M:%S %p").strftime("%Y-%m-%d %H:%M:%S")
        endTime = datetime.strptime(endTime, "%Y-%m-%d %I:%M:%S %p").strftime("%Y-%m-%d %H:%M:%S")

    server_names = ""
    server_name_query = f"""
                        SELECT distinct LOWER(cmdbci.[name]) AS ServerName, BusinessApp.[name]   FROM   
                        [ServicePerf_DW].[dbo].[vw_sn_cmdb_ci_server] AS cmdbci
                        INNER JOIN  
                        vw_SN_Appl_Relationship AS AppRelation ON AppRelation.RelationshipID = cmdbci.sys_id
                        INNER JOIN  
                        vw_SN_cmdb_ci_business_app AS BusinessApp ON BusinessApp.sys_id = AppRelation.ApplicationID
                        WHERE       
                        (BusinessApp.portfolio_name = 'Clinical & Revenue Cycle Apps (CRCA)'
                        OR BusinessApp.[apm_application_family_name] LIKE 'Cromwell')
                        AND BusinessApp.active = 'true'
                        AND AppRelation.Relationship = 'Runs on'
                        AND cmdbci.operational_status_label in ('Operational', 'Repair in Progress', 'VM Terminated', 'Sleep Test in Progress')
                        AND BusinessApp.[number] IN ({apmNumber})"""

    # print(server_name_query)
    server_name_list = queryDw(connectionString, server_name_query)
    for row in server_name_list:
        server_names = server_names + "'" + row[0]+"' , "
    server_names = server_names[0:len(server_names)-2]
    df_serverNameAppCI = pd.DataFrame(numpy.array(server_name_list), columns=["ServerName","AppCI"])
    # print(df_serverNameAppCI)
    queryAnomalies = f"""Select AnomalyType, ServerName, MidPoints, PeakValue
    from InfraAnomalies 
    where (PeakTime between Convert(datetime, '{startTime}') and Convert(datetime, '{endTime}')) and ServerName in ({server_names})"""
    # print(queryAnomalies)
    
    connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    anomaliesList = queryDw(connectToCrcaMonitoring, queryAnomalies)

    df_anomaliesList = pd.DataFrame()
    
    #print(changeRequestQuery)
    anomaliesData = {}
    if(len(anomaliesList)>0):
        df_anomaliesList = pd.DataFrame(numpy.array(anomaliesList), columns=["AnomalyType","ServerName", "Points", "PeakValue"])
        
        df_anomaliesList["PeakValue"] = df_anomaliesList["PeakValue"].astype(int)
        df_anomaliesList["Point1"] = df_anomaliesList["Points"].str[1:-1].str.split(',').str[0].str.split(': ').str[1].astype(int)
        df_anomaliesList["Point2"] = df_anomaliesList["Points"].str[1:-1].str.split(',').str[1].str.split(': ').str[1].astype(int)
        df_anomaliesList["Point3"] = df_anomaliesList["Points"].str[1:-1].str.split(',').str[2].str.split(': ').str[1].astype(int)
        df_anomaliesList["DifferenceInSpike"] = df_anomaliesList["PeakValue"] - df_anomaliesList[["Point1", "Point2", "Point3"]].min(axis=1)
        df_anomaliesList.drop(columns=["Points"], inplace=True)
        df_anomaliesList = df_anomaliesList[df_anomaliesList["DifferenceInSpike"]>30]
        df_anomaliesList["ServerName"] = df_anomaliesList["ServerName"].str.lower()
        df_anomaliesList = pd.merge(df_anomaliesList, df_serverNameAppCI, on='ServerName', how='inner')
        print(df_anomaliesList.columns)
        df_anomaliesList = df_anomaliesList.groupby(['AppCI', 'AnomalyType']).size()
        df_anomaliesList = df_anomaliesList.reset_index(name='AnomalyFrequency')
        # print(df_anomaliesList[df_anomaliesList["DifferenceInSpike"]>30])
        
    anomaliesData["anomaliesList"] = df_anomaliesList
    
    return anomaliesData


def infraAlerts(apmNumber, aggregate, connectionString, startTime, endTime):
    if(startTime==""):
        format_string = "%Y-%m-%d %H:%M:%S"
        #print(datetime.now())
        currentTime = datetime.now()
        pst = pytz.timezone('America/Los_Angeles')
        endTime = currentTime.astimezone(pst)
        startTime = endTime - timedelta(hours=5)
        startTime = startTime.strftime(format_string)
        endTime = endTime.strftime(format_string)

    else:
        startTime = datetime.strptime(startTime, "%Y-%m-%d %I:%M:%S %p").strftime("%Y-%m-%d %H:%M:%S")
        endTime = datetime.strptime(endTime, "%Y-%m-%d %I:%M:%S %p").strftime("%Y-%m-%d %H:%M:%S")

    server_names = ""
    server_name_query = f"""
                        SELECT distinct LOWER(cmdbci.[name]) AS ServerName FROM   
                        [ServicePerf_DW].[dbo].[vw_sn_cmdb_ci_server] AS cmdbci
                        INNER JOIN  
                        vw_SN_Appl_Relationship AS AppRelation ON AppRelation.RelationshipID = cmdbci.sys_id
                        INNER JOIN  
                        vw_SN_cmdb_ci_business_app AS BusinessApp ON BusinessApp.sys_id = AppRelation.ApplicationID
                        WHERE       
                        (BusinessApp.portfolio_name = 'Clinical & Revenue Cycle Apps (CRCA)'
                        OR BusinessApp.[apm_application_family_name] LIKE 'Cromwell')
                        AND BusinessApp.active = 'true'
                        AND AppRelation.Relationship = 'Runs on'
                        AND cmdbci.operational_status_label in ('Operational', 'Repair in Progress', 'VM Terminated', 'Sleep Test in Progress')
                        AND BusinessApp.[number] IN ({apmNumber})"""

    #print(server_name_query)
    server_name_list = queryDw(connectionString, server_name_query)
    for row in server_name_list:
        server_names = server_names + "'" + row[0]+"' , "
    server_names = server_names[0:len(server_names)-2]

    connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    df_alertsData = pd.DataFrame()
    if(aggregate=="yes"):
        alertsQuery = f"""Select Sum(Frequency) as AlertFrequency, MetricsType, AppCI from EmailAlerts 
        where (Timestamp between Convert(datetime, '{startTime}') and Convert(datetime, '{endTime}')) and ResourceName in ({server_names}) group by MetricsType, AppCI"""
        alertsList = queryDw(connectToCrcaMonitoring, alertsQuery)

        if(len(alertsList)>0):
            df_alertsData = pd.DataFrame(numpy.array(alertsList), columns=["AlertFrequency","MetricType", "AppCI"])
        

    # print(df_alertsData)
    
    #print(changeRequestQuery)
    alertsData = {}
    
    alertsData["alertsList"] = df_alertsData
    return alertsData

def citrixServerData(apmNumbers):
    query = f""" 
    Select distinct citrixServerStatus.Name, citrixServerStatus.Tags, citrixServerStatus.PowerState, citrixServerStatus.RegistrationState, citrixServerStatus.InMaintenanceMode, citrixServerStatus.SummaryState, 
        citrixServerStatus.FaultState, citrixServerStatus.IPAddress, citrixServerStatus.ScheduledReboot, citrixServerStatus.ApplicationsInUse, citrixServerStatus.AssignedUsers, citrixServerStatus.ADFTimestamp,
        citrixAllApps.APM_Number FROM ESI_AERO_PROD_DB.reporting.vw_CITRIXCLOUD_DaaS_host_Machines as citrixServerStatus
        Inner Join ESI_AERO_PROD_DB.reporting.vw_CitrixAll_MachinesToResources as citrixAllAppsToRes on citrixAllAppsToRes.MachineName = citrixServerStatus.Name 
        Inner Join ESI_AERO_PROD_DB.reporting.vw_CitrixAll_Applications as citrixAllApps on citrixAllApps.ApplicationId = citrixAllAppsToRes.ApplicationId 
    where citrixAllApps.APM_Number like 'APM%' and citrixAllApps.APM_Number in ({apmNumbers}) order by citrixServerStatus.Name
    """
    citrixServerList = queryAeroSnowflake(query)
    df_citrixStatus = pd.DataFrame()
    
    if(len(citrixServerList)>0):
        df_citrixStatus = pd.DataFrame(numpy.array(citrixServerList), 
                                       columns=["Machine Name", "Server Tags", "Power State", "Registration State", "Maintenance State", "Summary State",
                                                "Fault State", "Machine IP", "Scheduled Reboot", "Application In Use", "Assigned Users", "Last Updated", "APM Number"])
        print(df_citrixStatus)
    return df_citrixStatus

def serverUptime(serverName):        

    query = f"""SELECT ServerName, LastRestartTime, Uptime_Hours
                FROM ServerStatus AS a
                WHERE [TimeGenerated] = (
                            SELECT MAX([TimeGenerated])
                            FROM ServerStatus AS b
                            WHERE a.ServerName = b.ServerName)
                            AND
                ServerName IN ({serverName})
        """
    print(query)
    connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    df_Uptime = pd.DataFrame()
    df_Uptime = queryDw(connectToCrcaMonitoring, query)
    df_Uptime= pd.DataFrame(numpy.array(df_Uptime), columns=["ServerName","LastRestartTime", "Uptime_Hours"])
    print(df_Uptime)
    serverUptime_df = df_Uptime.dropna()
    print("final: ",serverUptime_df)
    return serverUptime_df

def databaseMetricData(aggregate, startTime, endTime, appCI):
    print()
    if (startTime == ""):
        format_string = "%Y-%m-%d %I:%M:%S %p"
        currentTime = datetime.now()
        pst = pytz.timezone('America/Los_Angeles')
        endTime = currentTime.astimezone(pst)
        startTime = endTime - timedelta(hours=5)  
        startTime = startTime.strftime(format_string)
        endTime = endTime.strftime(format_string)    
    df_azure = pd.DataFrame()
    exceptions = {"Azure":""}
    # Function call to get Azure DB Metrics
    try:
        df_azure = azureDbMetics(aggregate, startTime, endTime, appCI)
    except Exception as ex:
        exceptions["Azure"] = ex
        print(ex)
    
    if(exceptions["Azure"]!=""):
        raise Exception("Azure Data not Retrieved.",{"Message":exceptions["Azure"]})
    print(df_azure)
    
    return df_azure

def TagComplianceData(serverName):
    if isinstance(serverName, str):
        formatted_server_names = f"{serverName.strip().lower()}"
    elif isinstance(serverName, list):
        formatted_server_names = ", ".join(f"'{name.strip().lower()}'" for name in serverName if name.strip())

    connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")

    tag_compliance_query = f"""
    SELECT 
    * FROM AzureTagStatus
    WHERE ServerName IN ({formatted_server_names})
    """

    print("Tag Compliance Query:")
    print(tag_compliance_query)

    tag_list = queryDw(connectToCrcaMonitoring, tag_compliance_query)

    if not tag_list:
        return None  # Return None if no data is found

    columns = [
        "ServerName", "ResourceGroup", "SubscriptionID", "amiRuntimeEnv",
        "Application CI", "APMNumber", "BackupType", "Domain", "Environment",
        "Tag Key", "Module Owner", "Security Patching", "Support Group",
        "Maintenance Status", "Maintenance Window", "LastUpdated"
    ]

    tag_data_df = pd.DataFrame(np.array(tag_list), columns=columns)

    if tag_data_df.empty:
        return None  # Return None if the DataFrame is empty

    print(tag_data_df)

    return tag_data_df



