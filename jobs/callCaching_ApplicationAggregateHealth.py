# from domains.metrics.application.applicationTelemetry import servicesData, interfacesLogsData
# from datetime import datetime, timedelta
# import pytz
# from domains.metrics.ServerMetricsPerf import getServerPerf 
# from shared.filters import filtersData
# from shared.dataBase import queryDw, insert_data, exceptioninfo, connectToDw, connectToDw_SqlServerPwd, connectToDw_AADpwd, connectToDw_AADpwd_Write
# import pandas as pd
# import numpy as np
# import threading
import pyodbc
# import json
# import requests
import time

import sys
from pathlib import Path
import pandas as pd
import numpy as np
import threading
import requests
import uuid
from datetime import datetime, timedelta
import pytz
import json

# Add the parent of 'parent_folder' to sys.path
root = Path(__file__).resolve().parents[1] / "backend"
sys.path.append(str(root))
from domains.metrics.application.applicationTelemetry import servicesData, interfacesLogsData
from domains.metrics.infrastructure.infrastructureTelemetry import serverStatus
from domains.metrics.ServerMetricsPerf import getServerPerf
from domains.metrics.DatabaseMetricsPerf import getDatabasePerf
from domains.metrics.FileStorageMetricsPerf import getFileStoragePerf
from domains.metrics.WindowsServiceMetrics import getServiceUrlStatus
from shared.dataBase import queryDw, insert_data, exceptioninfo, connectToDw_AADpwd, connectToDw_AADpwd_Write, updateDw, insertDw


def serverHealthAggregate(connectToCrcaMonitoring, appCI, apmNumbers):
    # Server Health (Aggregate="yes") Thread 2
    try:
        serverHealthDF = serverStatus(connectToCrcaMonitoring, appCI, "", "yes", "", "")
        serverHealthDF["ServerName"] = serverHealthDF["ServerName"].str.strip().str.lower()
        print(len(serverHealthDF), serverHealthDF.columns)
        
        # Port Health from External API
        externalApi = "https://dcxportwatcher.providence.org/api/api/DataFetch/Server"
        try:
            response = requests.get(externalApi,verify=False)
            response.raise_for_status()
            server_status_list = response.json()
            
            print("The all server status are", server_status_list)
            a=[]
            for i in server_status_list:
                a.append((i["server"], "Critical" if i["critical"]>0 else "Not Critical"))
            portDf = pd.DataFrame(np.array(a), columns=["ServerName", "Port Health"])
            serverHealthDF = pd.merge(serverHealthDF, portDf,on="ServerName", how="outer")
            
            print(portDf.columns)
            print(portDf) 
        except Exception as ex:
            print(ex)
        
        try:
            sqlQuery = "Select distinct [Support Group] from [Application List] where [Last Updated] = (Select max([Last Updated]) from [Application List])"
            res = queryDw(connectToCrcaMonitoring, sqlQuery) 
            df = pd.DataFrame(np.array(res),columns=["Support Group"])
            supportGroupList = df["Support Group"].to_list()
            
            endTime = datetime.now(pytz.utc)
            startTime = (endTime-timedelta(minutes=10))
            startTime = startTime.replace(
                minute=(startTime.minute // 10) * 10,
                second=0,
                microsecond=0
            )
            tempDict = {
                "Start Time":startTime.strftime("%Y-%m-%d %I:%M:%S %p"),
                "End Time":endTime.strftime("%Y-%m-%d %I:%M:%S %p"),
                "Support Group": supportGroupList,
                "Object Name":["Cpu", "memory", "disk"]
            }
            
            df_perf = pd.read_json(getServerPerf(tempDict)["Data"])
            df_perf["AvgValue"] = df_perf["AvgValue"].astype(int) 
            df_perf["ServerName"] = df_perf["ServerName"].str.lower()
            df_perf = df_perf[(df_perf["ObjectName"].str.lower()=="processor") | (df_perf["ObjectName"].str.lower()=="memory") | ((df_perf["ObjectName"].str.lower()=="logicaldisk") & (df_perf["DriveName"].str.lower()!="y:") & (df_perf["DriveName"].str.lower()!="p:") & (df_perf["DriveName"].str.lower()!="i:"))]
            df_perf = df_perf[["ServerName","AvgValue","AppCI", "HostingType"]].groupby(["ServerName","AppCI", "HostingType"]).agg({
                        "AvgValue":"max"
                    }).reset_index()
            
            serverHealthDF = pd.merge(serverHealthDF, df_perf,on=["ServerName","AppCI", "HostingType"], how="outer")
        except Exception as ex:
            print(ex)
        
        aggregate = serverHealthDF.groupby('AppCI').agg(
            Total_Cloud = ("HostingType", lambda x: (x=="Cloud").sum()),
            Total_OnPremise = ("HostingType", lambda x: (x=="OnPremise").sum()),
            UnHealthy_Cloud = ("HostingType", lambda x: ((x=="Cloud") & ((serverHealthDF.loc[x.index, 'Status']=="Down") | (serverHealthDF.loc[x.index, 'Port Health']=="Critical") | (serverHealthDF.loc[x.index, 'AvgValue']>95))).sum()),
            UnHealthy_OnPremise = ("HostingType", lambda x: ((x=="OnPremise") & ((serverHealthDF.loc[x.index, 'Status']=="Down") | (serverHealthDF.loc[x.index, 'AvgValue']>95))).sum()),
            UpTime = ("Up Time", "mean"),
            FailedBackup = ("Backup Status", lambda x: (x!="Complete").sum())
        )
        
        aggregate = aggregate.reset_index()
        aggregate["Application CI"] = aggregate["AppCI"].str.upper()
        aggregate["Server Health"] = aggregate.apply(lambda row: json.dumps({col: row[col] for col in ["Total_Cloud", "Total_OnPremise", "UnHealthy_Cloud", "UnHealthy_OnPremise", "UpTime", "FailedBackup"]}), axis=1)
        aggregate.drop(columns=["AppCI","Total_Cloud", "Total_OnPremise", "UnHealthy_Cloud", "UnHealthy_OnPremise", "UpTime", "FailedBackup"], inplace=True)
        arr.append(aggregate)
        
    except Exception as ex:
        print(ex)
        print("Server Health Exception")
    
def serviceHealthAggregate(connectToCrcaMonitoring, apmNumbers):
    # Services Data (Aggregate="yes") Thread 1
    try:
        sqlQuery = "Select distinct [Support Group] from [Application List] where [Last Updated] = (Select max([Last Updated]) from [Application List])"
        res = queryDw(connectToCrcaMonitoring, sqlQuery) 
        df = pd.DataFrame(np.array(res),columns=["Support Group"])
        supportGroupList = df["Support Group"].to_list()
        
        endTime = datetime.now(pytz.utc)
        startTime = endTime-timedelta(minutes=10)
        startTime = startTime.replace(
            minute=(startTime.minute // 10) * 10,
            second=0,
            microsecond=0
        )
        tempDict = {
            "Start Time":startTime.strftime("%Y-%m-%d %I:%M:%S %p"),
            "End Time":endTime.strftime("%Y-%m-%d %I:%M:%S %p"),
            "Support Group": supportGroupList,
            "Object Name":["services", "url"],
            "Latest Only":True
        }
        servicesHealthDF = pd.read_json(getServiceUrlStatus(tempDict)["Data"])
        # servicesHealthDF = servicesHealthDF[servicesHealthDF["Status"].str.strip().str.lower()!="running"]
        print(servicesHealthDF.columns)
        print(servicesHealthDF["MonitorType"].unique())
        aggregate = servicesHealthDF.groupby('AppCI').agg(
            Total_Cloud = ("HostingType", lambda x: ((x.str.lower()=="cloud") & (servicesHealthDF.loc[x.index,'MonitorType'].str.lower()=="os-services")).sum()),
            Total_OnPremise = ("HostingType", lambda x: ((x.str.lower()=="onpremise") & (servicesHealthDF.loc[x.index,'MonitorType'].str.lower()=="os-services")).sum()),
            Total_Url = ("MonitorType", lambda x: ((x.str.lower()!="os-services")).sum()),
            UnHealthy_Cloud = ("HostingType", lambda x: ((x.str.lower()=="cloud") & (servicesHealthDF.loc[x.index, 'Status'].str.lower()!="running") & (servicesHealthDF.loc[x.index,'MonitorType'].str.lower()=="os-services")).sum()),
            UnHealthy_OnPremise = ("HostingType", lambda x: ((x.str.lower()=="onpremise") & (servicesHealthDF.loc[x.index, 'Status'].str.lower()!="running") & (servicesHealthDF.loc[x.index,'MonitorType'].str.lower()=="os-services")).sum()),
            UnHealthy_Url = ("MonitorType", lambda x: ((x.str.lower()!="os-services") & (servicesHealthDF.loc[x.index, 'Status'].str.lower()!="running")).sum()),
        )
        
        aggregate = aggregate.reset_index()
        aggregate["Application CI"] = aggregate["AppCI"].str.upper()
        aggregate["Services Health"] = aggregate.apply(lambda row: json.dumps({col: row[col] for col in ["Total_Cloud", "Total_OnPremise","Total_Url", "UnHealthy_Cloud", "UnHealthy_OnPremise", "UnHealthy_Url"]}), axis=1)
        
        aggregate.drop(columns=["AppCI","Total_Cloud", "Total_OnPremise", "Total_Url", "UnHealthy_Cloud", "UnHealthy_OnPremise", "UnHealthy_Url"], inplace=True)
        # completeAggregateDF = pd.merge(completeAggregateDF,aggregate,on="Application CI",how="outer")
        arr.append(aggregate)

    except Exception as ex:
        print("Service Health Exception")
        print(ex)

def interfaceHealthAggregate(connectToCrcaMonitoring, appFamily):
    # Interfaces Health (Aggregate="yes") Thread 3
    startTime=""
    endTime=""
    format_string = "%Y-%m-%d %I:%M:%S %p"
    ## Define PST timezone
    pst_timezone = pytz.timezone('US/Pacific')

    # Get current time in PST
    endTime = datetime.now(pst_timezone)
    startTime = endTime-timedelta(minutes=15)
    startTime = startTime.strftime(format_string)
    endTime = endTime.strftime(format_string)
    print(startTime, endTime)
    try:
        interfacesHealthDF = interfacesLogsData(connectToCrcaMonitoring,"",startTime,endTime,"no",appFamily)
        print(len(interfacesHealthDF["Interfaces"]), interfacesHealthDF["Interfaces"].columns)
    
        aggregate = interfacesHealthDF["Interfaces"].copy()
        aggregate["Stopped"] = aggregate.apply(
            lambda x: 0 if ((x["ConnectionStatus"].lower() in ('connected', 'simulated') and x["QueueDepth"]<300) or (x["QueueDepth"]<1000)) else 1,
            axis=1
        )
        aggregate = aggregate.groupby(['InterfaceName', "CorepointMonitor", "PeerIp", "ApplicationFamily"]).apply(
            lambda g: pd.Series({
                 'TimeGenerated': g['TimeGenerated'].max(),
                 'ConnectionStatus': g.loc[g['TimeGenerated'].idxmax(), 'ConnectionStatus'],
                 'QueueDepth': g.loc[g['TimeGenerated'].idxmax(), 'QueueDepth'],
                 'Stopped' : 1 if g["Stopped"].mean()==1 else 0
        })).reset_index()
        
        aggregate = aggregate.groupby('ApplicationFamily').agg(
            Total_Interfaces = ("InterfaceName", 'count'),
            Connected = ("ConnectionStatus", lambda x: (x.str.lower()=="connected").sum()),
            Connecting = ("ConnectionStatus", lambda x: (x.str.lower()=="connecting").sum()),
            Simulated = ("ConnectionStatus", lambda x: (x.str.lower()=="simulated").sum()),
            Waiting_For_Reply = ("ConnectionStatus", lambda x: (x.str.lower()=="waiting for reply").sum()),
            Not_Connected = ("ConnectionStatus", lambda x: (x.str.lower()=="not connected").sum()),
            Stopped = ("ConnectionStatus", lambda x: (((x.str.lower()!="connected") & (x.str.lower()!="simulated")) & (aggregate.loc[x.index, "QueueDepth"]>0)).sum())
        )
        
        aggregate = aggregate.reset_index()
        aggregate["Application Family"] = aggregate["ApplicationFamily"].str.upper()
        aggregate["Interfaces Health"] = aggregate.apply(lambda row:  json.dumps({col: row[col] for col in ["Total_Interfaces", "Connected", "Connecting", "Simulated", "Waiting_For_Reply", "Not_Connected", "Stopped"]}), axis=1)
        
        aggregate.drop(columns=["ApplicationFamily","Total_Interfaces", "Connected", "Connecting", "Simulated", "Waiting_For_Reply", "Not_Connected", "Stopped"], inplace=True)
        # aggregate.to_csv("sample1.csv")
        arr.append(aggregate)
        
    except Exception as ex:
        print("Interface Health Exception")
        print(ex)
    
def fileStorageHealthAggregate(connectToCrcaMonitoring, appCI):
    # Filestorage (Aggregate="yes") Thread 4
    try:
        # fileStorageHealthDF = azureServerMetrics_Fileshare_df("yes","","",appCI.lower())
        # print(len(fileStorageHealthDF["ServerName"]), fileStorageHealthDF["ServerName"].columns)
        sqlQuery = "Select distinct [Support Group] from [Application List] where [Last Updated] = (Select max([Last Updated]) from [Application List])"
        res = queryDw(connectToCrcaMonitoring, sqlQuery) 
        df = pd.DataFrame(np.array(res),columns=["Support Group"])
        supportGroupList = df["Support Group"].to_list()
        
        endTime = datetime.now(pytz.utc)
        startTime = endTime-timedelta(minutes=10)
        startTime = startTime.replace(
            minute=(startTime.minute // 10) * 10,
            second=0,
            microsecond=0
        )
        tempDict = {
            "Start Time":startTime.strftime("%Y-%m-%d %I:%M:%S %p"),
            "End Time":endTime.strftime("%Y-%m-%d %I:%M:%S %p"),
            "Support Group": supportGroupList,
            "Object Name":["storage"],
            "Latest Only":True
        }
        fileStorageHealthDF = pd.read_json(getFileStoragePerf(tempDict)["Data"])
        fileStorageHealthDF["AvgValue"] = ((fileStorageHealthDF["Used Capacity (GiB)"]//fileStorageHealthDF["Provisioned Capacity (GiB)"])*100).astype(int) 
        print(fileStorageHealthDF.columns)
        aggregate = fileStorageHealthDF.groupby('AppCI').agg(
            Total_Cloud=(
                'ResourceId',
                lambda x: x.drop_duplicates().shape[0]
            ),
            UnHealthy_Cloud = ("AvgValue", lambda x: (
                (x>=95)
                &
                (~fileStorageHealthDF.loc[x.index, 'AppCI'].str.upper().isin(["SYNAPSE PACS-CA-FMC", "SYNAPSE PACS-CA-PSJHC"])) 
            ).sum()),
        )
        aggregate = aggregate.reset_index()
        aggregate["Application CI"] = aggregate["AppCI"].str.upper()
        aggregate["File Storage Health"] = aggregate.apply(lambda row: json.dumps({col: row[col] for col in ["Total_Cloud", "UnHealthy_Cloud"]}), axis=1)
        
        aggregate.drop(columns=["AppCI","Total_Cloud", "UnHealthy_Cloud"], inplace=True)
        arr.append(aggregate)
    except Exception as ex:
        print("File Storage Health Exception")
        print(ex)

def databaseHealthAggregate(connectToCrcaMonitoring,appCI):
    # Database Metrics (Aggregate="yes") Thread 5
    try:
        sqlQuery = "Select distinct [Support Group] from [Application List] where [Last Updated] = (Select max([Last Updated]) from [Application List])"
        res = queryDw(connectToCrcaMonitoring, sqlQuery) 
        df = pd.DataFrame(np.array(res),columns=["Support Group"])
        supportGroupList = df["Support Group"].to_list()
        
        endTime = datetime.now(pytz.utc)
        startTime = endTime-timedelta(minutes=10)
        startTime = startTime.replace(
            minute=(startTime.minute // 10) * 10,
            second=0,
            microsecond=0
        )
        tempDict = {
            "Start Time":startTime.strftime("%Y-%m-%d %I:%M:%S %p"),
            "End Time":endTime.strftime("%Y-%m-%d %I:%M:%S %p"),
            "Support Group": supportGroupList,
            "Object Name":["cpu", "storage", "dtu"],
            "Latest Only":True
        }
        databaseMetricsDF = pd.read_json(getDatabasePerf(tempDict)["Data"])
        databaseMetricsDF["AvgValue"] = databaseMetricsDF["AvgValue"].astype(int)
        print(databaseMetricsDF.columns)
        databaseMetricsDF = databaseMetricsDF.groupby(["ResourceId", "AppCI"]).agg({
            "AvgValue":"max",
        }).reset_index()
        aggregate = databaseMetricsDF.groupby('AppCI').agg(
            Total_Cloud = ("ResourceId", 'count'),
            UnHealthy_Cloud = ("AvgValue", lambda x: (x>=95).sum()),
        )
        aggregate = aggregate.reset_index()
        aggregate["Application CI"] = aggregate["AppCI"].str.upper()
        aggregate["Database Health"] = aggregate.apply(lambda row: json.dumps({col: row[col] for col in ["Total_Cloud", "UnHealthy_Cloud"]}), axis=1)
        
        aggregate.drop(columns=["Total_Cloud", "UnHealthy_Cloud"], inplace=True)
        arr.append(aggregate)
    except Exception as ex:
        print("Database Health Exception")
        print(ex)

def mergeDf(df_serverList, arr):
    df = pd.DataFrame()
    try:
        a = []
        for i in arr:
            if(len(df)==0 and "Application CI" in i.columns):
                df = i.copy()
            else:
                if("Application Family" in i.columns):
                    a.append(i.copy())
                else:
                    df = pd.merge(df,i,on="Application CI", how="outer")
                
        df = pd.merge(df,df_serverList, on="Application CI", how="outer")
        for i in a:
            df = pd.merge(i,df, on="Application Family", how="outer")
    
    except Exception as ex:
        print("Exception in Merging")
        print(ex)
        
    print(df.head())
    # df.to_csv("FinalAggregate.csv", index=False)
    return df

def insert_update_data(connectToCrcaMonitoring, df, required_columns, query):
    # connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    
    print(df.columns)
    print(required_columns)
    if not all(col in df.columns for col in required_columns):
        raise ValueError("DataFrame does not have the required columns.")

    # Insert data into SQL Server
    with pyodbc.connect(connectToCrcaMonitoring) as conn:
        with conn.cursor() as cursor:
            insert_query = query
            for _, row in df.iterrows():
                try:
                    cursor.execute(insert_query, 
                        tuple([row[i] for i in required_columns])
                    )
                    
                except Exception as ex:
                    for i in required_columns:
                        print(i, row[i])
                    print(ex)
            conn.commit()
            print("Data inserted successfully.")

def pushToDB(df, dTime):
    connectionString = connectToDw_AADpwd_Write("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")

    print(len(df))
    df = df.drop_duplicates(subset=['Application CI'])
    value_counts = df["Application CI"].value_counts()
    duplicates = value_counts[value_counts > 1]
    val = df[df["Application CI"]=="NILREAD VIEWER-PSJH"]
    print(val)
    print(duplicates)
    
    df.fillna("", inplace=True)
    required_columns = [
                "Time Generated", "Last Updated", "Application CI","Server Health","Services Health","Interfaces Health","Database Health","File Storage Health","Application Family","Support Group"
            ]
    insert_query = """
        MERGE INTO ApplicationHealthPage_Summary AS target
        USING (SELECT 
            ? AS [Time Generated]
            ,? AS [Last Updated]
            ,? AS [Application CI]
            ,? AS [Server Health]
            ,? AS [Services Health]
            ,? AS [Interfaces Health]
            ,? AS [Database Health]
            ,? AS [File Storage Health]
            ,? AS [Application Family]
            ,? AS [Support Group]) 
            AS source
        ON target.[Application CI] = source.[Application CI]
        WHEN MATCHED THEN
            UPDATE SET target.[Server Health]=source.[Server Health],target.[Services Health]=source.[Services Health],target.[Interfaces Health]=source.[Interfaces Health],target.[Database Health]=source.[Database Health],target.[File Storage Health]=source.[File Storage Health],target.[Application Family]=source.[Application Family],target.[Support Group]=source.[Support Group], target.[Last Updated]=source.[Last Updated]
        WHEN NOT MATCHED THEN
            INSERT ([Time Generated],[Application CI],[Server Health],[Services Health],[Interfaces Health],[Database Health],[File Storage Health],[Application Family],[Support Group], [Last Updated]) VALUES (source.[Time Generated],source.[Application CI],source.[Server Health],source.[Services Health],source.[Interfaces Health],source.[Database Health],source.[File Storage Health],source.[Application Family],source.[Support Group],source.[Last Updated]);
    """
    
    df["Time Generated"] = dTime
    df["Last Updated"] = dTime
    
    try:
        insert_update_data(connectionString,df, required_columns, insert_query)
    except Exception as ex:
        print("Error in Pushing Data to DB")
        print(ex)

def caching_ApplicationHealth_Aggregate():
    datetime_format = "%Y-%m-%d %I:%M:%S %p"
    # time = datetime.now()
    pst = pytz.timezone('America/Los_Angeles')
    # time = time.astimezone(pst)
    
    # connectionString to crcamonitoring
    connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")

    serverListQuery = """Select [Application Family]
        ,[Application CI]
        ,[Support Group], [APM Number]
    from [Application List] where [Last Updated] = (Select MAX([Last Updated]) from [Application List])"""
    
    try:
        data = queryDw(connectToCrcaMonitoring, serverListQuery)
    except Exception as ex:
        print("Error Fetching Server List Data")
        print(ex)
        raise Exception("Error Fetching Server List Data"+str(ex))
        
    if(len(data)>0):
        df_ServerList = pd.DataFrame(np.array(data),
                            columns=[
                                "AppFamily","AppCI", "SupportGroup", "APMNumber"
                            ]
                        )
        df_ServerList.drop_duplicates(subset=['AppCI'], inplace=True)
        df_ServerList["Application CI"] = df_ServerList["AppCI"].str.upper()
        df_ServerList["Application Family"] = df_ServerList["AppFamily"].str.upper()
        df_ServerList["Support Group"] = df_ServerList["SupportGroup"]
        df_ServerList["APM Number"] = df_ServerList["APMNumber"]
        df_ServerList.drop(columns=["AppCI", "AppFamily", "SupportGroup", "APMNumber"], inplace=True)
        
        appCI = ",".join(["'"+str(x)+"'" for x in df_ServerList["Application CI"].str.lower().unique().tolist()])
        appFamily = ",".join(["'"+str(x)+"'" for x in df_ServerList["Application Family"].str.lower().unique().tolist()])
        apmNumbers = ",".join(["'"+str(x)+"'" for x in df_ServerList["APM Number"].str.lower().unique().tolist()])
        
    else:
        print("Exception occured in Server List Fetch")
        return
    
    threads = [
                threading.Thread(target=serverHealthAggregate, args=(connectToCrcaMonitoring, appCI, apmNumbers)),
                threading.Thread(target=serviceHealthAggregate, args=(connectToCrcaMonitoring, apmNumbers,)),
                threading.Thread(target=interfaceHealthAggregate, args=(connectToCrcaMonitoring, appFamily,)),
                threading.Thread(target=fileStorageHealthAggregate, args=(connectToCrcaMonitoring,appCI,)),
                threading.Thread(target=databaseHealthAggregate, args=(connectToCrcaMonitoring,appCI,))
            ]
    
    for i in threads:
        i.start()       
    for i in threads:
        i.join()
        
    # df_ServerList.to_csv("ServerList.csv", index=False)
    df = mergeDf(df_ServerList, arr)
    # print(len(df))
    cols_to_check = ["Server Health", "Services Health", "Interfaces Health", "Database Health", "File Storage Health"]
    df = df.dropna(subset=cols_to_check, how='all')
    # print(len(df))
    datT = datetime.now(pytz.timezone('UTC'))
    # df.to_csv(f"FinalAggregate_{datT.strftime('%Y%m%d_%H%M%S')}.csv", index=False)
    # df.to_csv(f"FinalAggregate_{datT.strftime('%Y%m%d_%H%M%S')}.csv", index=False)
    pushToDB(df,datT)
    print("All Threads Executed")
    # time.sleep(10000)

arr = []
completeAggregateDF = pd.DataFrame(columns=["Application CI"])
print(datetime.now())
caching_ApplicationHealth_Aggregate()
print(datetime.now())