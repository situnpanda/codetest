import sys
from pathlib import Path

# Add the parent of 'parent_folder' to sys.path
root = Path(__file__).resolve().parents[1] / "backend"
sys.path.append(str(root))

from domains.metrics.infrastructure.infrastructureTelemetry import cacheServerListData_toDB,  server_overview_df
from shared.dataBase import connectToDw_AADpwd_Write, insertDw, connectToDw_SqlServerPwd
from shared.filters import filtersData
from datetime import datetime
import pytz

    
def push_data_to_serverList(filter, time):
    
    apmNumbers = filtersData(filter, "apmNumber")
    connectToServicePerf = connectToDw_SqlServerPwd("spidedbsv6c6b60.wa.providence.org\\SPIDER", "ServicePerf_DW","servCRCAMonitor")
    df = server_overview_df(connectToServicePerf, apmNumbers,"","")
    df = df["Server"]
    colMapping = {
        "ServerName": "ServerName",
        "AppCI" : "ApplicationCI",
        "SubscriptionID": "SubscriptionID",
        "ResourceGroup" : "ResourceGroup",
        "ServerHostingType" : "HostingType",
        "DnsDomain" : "DnsDomain",
        "Environment" : "Environment"
    }
    print(df.columns)
    df = df.rename(columns=colMapping)
    df = df[colMapping.values()]
    df["Last Updated"] = time
    df = df.fillna("")
    df["Resource Name"] = df.apply(lambda x: "SubscriptionID/"+x["SubscriptionID"]+"/ResourceGroup/"+x["ResourceGroup"]+"/ServerName/"+x["ServerName"]+"/ApplicationCI/"+x["ApplicationCI"] if x["HostingType"]=="Cloud" else "ServerName/"+x["ServerName"]+"/ApplicationCI/"+x["ApplicationCI"], axis=1)
    try:
        columns = df.columns
        st = ",".join([("@"+col.replace(" ","")+"= ?") for col in columns])
        
        data = [tuple([row[col] for col in columns]) for ind, row in df.iterrows()]
        
        connectionString = connectToDw_AADpwd_Write("sqldb-azure-prod-012.database.windows.net","crcamonitoring","servCRCAMonitoring@providence.org")
        
        sqlQuery = f""" 
            EXEC UpdateServerList {st}
        """
        print(sqlQuery)
        print(data[0])
        res = insertDw(connectionString, sqlQuery, data)
        print(res)
    except Exception as ex:
        print("Failed to Update the DB\n "+ ex)
    
def caching_serverList():
    filter = {'appFamily': ['All'], 'appCI': ['All'], 'managedByGroup': ['All'], 'supportGroup': ['All']}
    datetime_format = "%Y-%m-%d %I:%M:%S %p"
    time = datetime.now()
    pst = pytz.timezone('America/Los_Angeles')
    time = time.astimezone(pst)
    time = time.strftime(datetime_format)
    
    # Update in Server List
    try:
        push_data_to_serverList(filter, time)
    except Exception as ex:
        print("Exception in Pushing Data to [Server List] table",ex)
        
caching_serverList()