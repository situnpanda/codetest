from shared.dataBase import queryDw, insert_data, exceptioninfo, connectToDw, connectToDw_SqlServerPwd, connectToDw_AADpwd, openConnection
from shared.LogAnalytics import queryInLogAnalytics
from shared.keyVault import connectToKeyVault
from shared.variables import globalVariables
from domains.metrics.infrastructure.Pages.ServiceStatus.OnPrem import onPremserviceStatus
from domains.metrics.infrastructure.Pages.ServiceStatus.UrlS import urlStatus
from domains.metrics.infrastructure.Pages.ServiceStatus.Azure import azureServiceStatus
from shared.filters import filtersData, filtersData_SubRg
from datetime import datetime, timedelta
import pytz
import pandas
import os
import time
import numpy, pyodbc
from flask import jsonify
from shared.appinsights_logger import error_response
import json

serviceData = {
    "Service": pandas.DataFrame()
}

interfaceData = {
    "Interfaces": pandas.DataFrame(),
    "Total Interfaces": 0,
    "Interfaces Stopped": 0,
    "Interfaces Running": 0,
    "Count":-1
}

kpi = {
    "Availability": "NA",
    "Reliability": 100,
    "Performance": "NA"
}


BASE_DIR = os.path.dirname(os.path.abspath(__file__))  # Get current file's directory
CACHE_FOLDER = os.path.join(BASE_DIR, "..", "cache")
INCIDENT_JSON_PATH = os.path.join(CACHE_FOLDER, "incidentList.json")
ALERTS_JSON_PATH = os.path.join(CACHE_FOLDER, "alertsList.json")
SERVERALERTS_JSON_PATH = os.path.join(CACHE_FOLDER, "serverAlertsList.json")


def getGACQuery(timeGenerated):

    query = f"""WITH UpdateStatus AS (
    SELECT
        TimeGenerated,
        ServerName,
        Status,
        HostingType,
        AppCI,
        LAG(Status) OVER (PARTITION BY ServerName ORDER BY TimeGenerated) AS PrevStatus
    FROM ServerStatus
    WHERE
        TimeGenerated {timeGenerated}
        AND AppCI != 'Acuo VNA-PSJH'
        AND HostingType IS NOT NULL
),

DownStarts AS (
    SELECT
        ServerName,
        AppCI,
        HostingType,
        TimeGenerated AS DownStart
    FROM UpdateStatus
    WHERE Status = 'Down' AND PrevStatus = 'Up'
)

SELECT
    TRIM(ds.ServerName) AS ServerName,
    TRIM(ds.AppCI) AS AppCI,
    TRIM(ds.HostingType) AS HostingType,
    ds.DownStart,
    nextUp.UpTime AS DownEnd,
    DATEDIFF(MINUTE, ds.DownStart, nextUp.UpTime) AS Downtime_Minutes
FROM DownStarts ds
OUTER APPLY (
    SELECT TOP 1 TimeGenerated AS UpTime
    FROM ServerStatus
    WHERE
        Status = 'Up'
        AND ServerName = ds.ServerName
        AND AppCI = ds.AppCI
        AND TimeGenerated >= ds.DownStart
    ORDER BY TimeGenerated
) nextUp
ORDER BY ds.DownStart desc;"""
    print(query)
    return query

def serverDownTimeData(connectionString, apmNumbers, serverName, aggregate, startTime, endTime):
    if(startTime==""):
        format_string = "%Y-%m-%d %I:%M:%S %p"
        #print(datetime.now())
        currentTime = datetime.now()
        pst = pytz.timezone('America/Los_Angeles')
        endTime = currentTime.astimezone(pst)
        startTime = endTime - timedelta(hours=5)
        startTime = startTime.strftime(format_string)
        endTime = endTime.strftime(format_string)
        print("The start time is", startTime)
        print("The endTime is", endTime)        
    else:
        startTime = datetime.strptime(startTime, "%Y-%m-%d %I:%M:%S %p").strftime("%Y-%m-%d %H:%M:%S")
        endTime = datetime.strptime(endTime, "%Y-%m-%d %I:%M:%S %p").strftime("%Y-%m-%d %H:%M:%S")
        print("The start time is", startTime)
        print("The endTime is", endTime)

    timeGenerated = f"""between Convert(datetime, '{startTime}') and Convert(datetime, '{endTime}')"""

    try:
        connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
        serversQuery = getGACQuery(timeGenerated)
        azureServerDB = queryDw(connectToCrcaMonitoring, serversQuery)

        serverStatus = pandas.DataFrame(numpy.array(azureServerDB), columns=["ServerName", "AppCI","HostingType","DownTimeStart","DownTimeEnd","Duration"])

        serverStatus["DownTimeStart"] = pandas.to_datetime(serverStatus["DownTimeStart"], errors="coerce")
        serverStatus["DownTimeEnd"] = pandas.to_datetime(serverStatus["DownTimeEnd"], errors="coerce")


        serverStatus["DownTimeStart"] = serverStatus["DownTimeStart"].dt.strftime('%Y-%m-%d %H:%M')
        serverStatus["DownTimeEnd"] = serverStatus["DownTimeEnd"].dt.strftime('%Y-%m-%d %H:%M')
        print(serverStatus)
        null_downtime_rows = serverStatus[serverStatus["DownTimeEnd"].isna()]
        print(null_downtime_rows)
        return serverStatus
    except Exception as Ex:
        print("Exception in servicestatus azure execution: ",Ex )
        info =exceptioninfo(Ex,serversQuery)
        insert_data(info)
        return error_response(500, "Failed to fetch service status", detail=info, exc=Ex)          



def cacheServerDownDetails(filter, starttime, aggregateBool, endtime, readWriteType):
    try:
        print("🔄 Fetching server downtime data from database...")

        # Step 1: Get APM numbers and call the downtime query
        connectToCrcaMonitoring = connectToDw_AADpwd(
            "sqldb-azure-prod-012.database.windows.net",
            "crcamonitoring",
            "servCRCAMonitoring@providence.org"
        )
        apmNumbers = filtersData(filter, "apmNumber")
        downtime_df = serverDownTimeData(connectToCrcaMonitoring, apmNumbers, "", aggregateBool, starttime, endtime)

        # Step 2: Build JSON structure
        downtime_json = {
            "Data": downtime_df.to_json(orient="records"),
            "TimeOfUpdate": endtime
        }

        # Step 3: If readWrite, merge with existing JSON data and write trimmed 30-day window
        if readWriteType == "readWrite":
            try:
                with open(SERVERALERTS_JSON_PATH, "r") as json_file:
                    existing_data = json.load(json_file)

                existing_df = pandas.read_json(existing_data["Data"])
                existing_df["DownTimeStart"] = pandas.to_datetime(existing_df["DownTimeStart"], errors='coerce')


                # Convert new data times
                downtime_df["DownTimeStart"] = pandas.to_datetime(downtime_df["DownTimeStart"], errors='coerce')

                #existing_df["DownTimeStart"] = pandas.to_datetime(existing_df["DownTimeStart"], errors='coerce')
                existing_df["DownTimeEnd"] = pandas.to_datetime(existing_df["DownTimeEnd"], errors='coerce')

                #downtime_df["DownTimeStart"] = pandas.to_datetime(downtime_df["DownTimeStart"], errors='coerce')
                downtime_df["DownTimeEnd"] = pandas.to_datetime(downtime_df["DownTimeEnd"], errors='coerce')

                # Merge and filter to 30-day window
                merged_df = pandas.concat([existing_df, downtime_df], ignore_index=True)

                end_ts = pandas.to_datetime(endtime, errors='coerce')
                start_ts = end_ts - timedelta(days=30)
                print(end_ts, start_ts)
                merged_df = merged_df[(merged_df["DownTimeStart"] >= start_ts) & (merged_df["DownTimeStart"] <= end_ts)]
                print("📅 Min DownTimeStart:", merged_df["DownTimeStart"].min())
                print("📅 Max DownTimeStart:", merged_df["DownTimeStart"].max())
                print("📅 Min DownTimeEnd:", merged_df["DownTimeEnd"].min())
                print("📅 Max DownTimeEnd:", merged_df["DownTimeEnd"].max())
                # Convert time to string for output
                merged_df["DownTimeStart"] = merged_df["DownTimeStart"].dt.strftime('%Y-%m-%d %H:%M')
                merged_df["DownTimeEnd"] = merged_df["DownTimeEnd"].dt.strftime('%Y-%m-%d %H:%M')

                downtime_json["Data"] = merged_df.to_json(orient="records")
            except Exception as e:
                print(f"⚠️ Failed to merge with existing data, defaulting to new data only: {e}")
        print("THe downtime json is")
        print(downtime_json)
        # Step 4: Write to JSON
        with open(SERVERALERTS_JSON_PATH, "w") as json_file:
            json.dump(downtime_json, json_file, indent=4)

        print("✅ Server downtime data cached successfully! Next update in 5 minutes...")
        return "✅ Server downtime data cached successfully! Next update in 5 minutes..."

    except Exception as e:
        print(f"❌ Error fetching or caching downtime data: {e}")
        return f"❌ Error fetching or caching downtime data: {e}"



def cacheIncidentData(filter, miBool, starttime, aggregateBool, endtime, active):
    while True:
        try:
            print("🔄 Fetching incident data from database...")
            connectToServicePerf = connectToDw_SqlServerPwd("spidedbsv6c6b60.wa.providence.org\\SPIDER", "ServicePerf_DW","servCRCAMonitor")
            appCI = filtersData(filter, "appCI")
            incidents_df = incidentData(connectToServicePerf, appCI, aggregateBool, starttime, endtime, miBool, active)
            print("The type is incidents df is ", type(incidents_df))
            print("The incident df is", incidents_df)
            with open(INCIDENT_JSON_PATH, "w") as json_file:
                json_file.write(incidents_df)
            return("✅ incident Data cached successfully! Next update in 2 minutes...")

        except Exception as e:
            return(f"❌ Error fetching or caching data: {e}")
        
        # Always wait 5 minutes before retrying, even if an error occurs
        # time.sleep(120)

def cacheAlertData(filter, starttime, aggregateBool, endtime, readWriteType):

    try:
        print("🔄 Fetching Alerts data from database...")
        connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
        apmNumbers = filtersData(filter, "apmNumber")
        alerts_appDf = servicesData(connectToCrcaMonitoring, apmNumbers, "", aggregateBool, starttime, endtime)
        print("The type is incidents df is ", type(alerts_appDf["Service"]))
        print("The Alerts df is", len(alerts_appDf["Service"]))
        
        alertsDict = {
            "Data" : alerts_appDf["Service"].to_json(),
            "TimeOfUpdate" : endtime
        }
        
        # if(readWriteType=="readWrite"):
            
        #     with open(ALERTS_JSON_PATH, "r") as json_file:
        #         alerts_df = json_file.read()
        #         alerts_df = json.loads(alerts_df)
                
        #     end_time = datetime.strptime(endtime, "%Y-%m-%d %I:%M:%S %p")
        #     end_time = datetime.strftime(end_time, "%Y-%m-%d %H:%M:%S")
        #     end_time = pandas.to_datetime(end_time)
            
        #     start_time = end_time - timedelta(days=30)
        #     start_time = datetime.strftime(start_time, "%Y-%m-%d %H:%M:%S")
        #     start_time = pandas.to_datetime(start_time)
            
        #     alerts_app_df = pandas.read_json(alerts_df["Data"])
        #     # print(len(alerts_app_df))
        #     alerts_app_df["TimeGenerated"] = pandas.to_datetime(alerts_app_df["TimeGenerated"], errors='coerce')
            
        #     if(len(alerts_appDf["Service"])):
        #         alerts_appDf["Service"]["TimeGenerated"] = pandas.to_datetime(alerts_appDf["Service"]["TimeGenerated"], errors='coerce')
                
        #         print(alerts_app_df["TimeGenerated"].min(),alerts_app_df["TimeGenerated"].max())
        #         print(alerts_appDf["Service"]["TimeGenerated"].min(),alerts_appDf["Service"]["TimeGenerated"].max())

        #         alerts_app_df = pandas.concat([alerts_app_df, alerts_appDf["Service"]], ignore_index=True)
        #         print(alerts_app_df["TimeGenerated"].min(),alerts_app_df["TimeGenerated"].max())

        #     alerts_app_df = alerts_app_df[(alerts_app_df["TimeGenerated"]>=start_time) & (alerts_app_df["TimeGenerated"]<end_time)]
        #     print(alerts_app_df["TimeGenerated"].min(),alerts_app_df["TimeGenerated"].max())
        #     alerts_app_df["TimeGenerated"] = alerts_app_df["TimeGenerated"].dt.strftime('%Y-%m-%d %H:%M:%S')
            
        #     # print(len(alerts_app_df))
        #     alertsDict["Data"] = alerts_app_df.to_json()
            
        #     with open(ALERTS_JSON_PATH, "w") as json_file:
        #         json.dump(alertsDict, json_file, indent=4)
        # else:
        with open(ALERTS_JSON_PATH, "w") as json_file:
            json.dump(alertsDict, json_file, indent=4)
        
        print("✅ Alerts Data cached successfully! Next update in 2 minutes...")
        return("✅ Alerts Data cached successfully! Next update in 2 minutes...")

    except Exception as e:
        print(f"❌ Error fetching or caching data: {e}")
        return(f"❌ Error fetching or caching data: {e}")
        
def servicesData(connectionString, apmNumbers, serverName, aggregate, startTime, endTime):
    s = datetime.now()
    servicesFinal = pandas.DataFrame()
    #print(apmNumbers)

    #Get Server, Service List
    try:
        serverNames=""
        df_ServerNameAppCI = pandas.DataFrame()

        # serverDetailsQuery = f"""
        #     SELECT LOWER(cmdbci.[name]) AS ServerName, BusinessApp.name AS AppCI
        #         FROM   [ServicePerf_DW].[dbo].[vw_sn_cmdb_ci_server] AS cmdbci
        #         INNER JOIN	vw_SN_Appl_Relationship AS AppRelation ON AppRelation.RelationshipID = cmdbci.sys_id
        #         INNER JOIN	vw_SN_cmdb_ci_business_app AS BusinessApp ON BusinessApp.sys_id = AppRelation.ApplicationID
        #         WHERE		(BusinessApp.portfolio_name = 'Clinical & Revenue Cycle Apps (CRCA)' 
        #         OR              BusinessApp.[apm_application_family_name] like 'Cromwell')
        #         AND			BusinessApp.active = 'true'
        #         AND			AppRelation.Relationship = 'Runs on'
        #         AND         BusinessApp.[number] in ({apmNumbers})
        #     """
        
        serverDetailsQuery = f"""select lower(ServerName), AppCI from CrcaServerListData where APMNumber IN ({apmNumbers})"""

        print(serverDetailsQuery)
        #connectToServicePerf = connectToDw("spidedbsv6c6b60.wa.providence.org\\SPIDER", "ServicePerf_DW")
        connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
        
        serverDetailsRows = queryDw(connectToCrcaMonitoring, serverDetailsQuery)
        
        e = datetime.now()
        # print("Services API Read ServerList: "+ str(s)+" - "+str(e)) 
        serviceData["Services API Read ServerList"] = str(s)+" - "+str(e)
        print(len(serverDetailsRows))
        serverNames = ""
        for row in serverDetailsRows:
            serverNames = serverNames + "'" + row[0]+"' ,"
        serverNames = serverNames[0:len(serverNames)-2]
        
        df_ServerNameAppCI = pandas.DataFrame(numpy.array(serverDetailsRows), columns=["ServerName", "AppCI"])
        
        try:
            s = datetime.now()
            serviceQuery = f""" Select ServerName, ServiceName, Trim(Lower(ServerName) + '-' + Lower(ServiceName)), HostingType from CriticalWindowsServiceList where Lower(ServerName) in ({serverNames}) """
            
            print(serviceQuery)
            serviceList = queryDw(connectionString, serviceQuery)
            e = datetime.now()
            # print("Services API Read Services List: "+ str(s)+" - "+str(e)) 
            serviceData["Services API Read Services List"] = str(s)+" - "+str(e)
            print(len(serviceList))
            
            s = datetime.now()
            serviceStatus = azureServiceStatus(serviceList, startTime, endTime, aggregate)
            e = datetime.now()
            serviceData["Services API Read Azure Services Data"] = str(s)+" - "+str(e)
            # print("Services API Read Azure Services Data: "+ str(s)+" - "+str(e)) 
            # print(len(serviceStatus))
            
            if(len(serviceStatus) > 0):
                # serviceStatus["TimeGenerated"] = serviceStatus["TimeGenerated"].dt.strftime('%Y-%m-%d %H:%M:%S')
                servicesFinal = pandas.concat([servicesFinal, serviceStatus], ignore_index=True)
                print("Azure Services Read")
                
            s = datetime.now()
            df_onPremService = onPremserviceStatus(serviceList, startTime, endTime, aggregate)
            e = datetime.now()
            serviceData["Services API Read Onpremise Services Data"] = str(s)+" - "+str(e)
            # print("Services API Read Onpremise Services Data: "+ str(s)+" - "+str(e))
            # print(df_onPremService)
            
            if(len(df_onPremService)>0):
                servicesFinal = pandas.concat([servicesFinal, df_onPremService], ignore_index=True)
                print("OnPrem Services Read")
            
        except Exception as ex:
            print("Service List Exception")
            print(ex)
    except Exception as ex:
        print("Server Name Exception")
        print(ex)
    # print(servicesFinal)

    if(len(servicesFinal)>0 and len(df_ServerNameAppCI)>0):
        servicesFinal = pandas.merge(servicesFinal,df_ServerNameAppCI,on="ServerName")
        servicesFinal = servicesFinal.drop_duplicates()

    #Get URLs 
    #if(aggregate!="forGAC"):
    try:
        s = datetime.now()
        urlApiStatus = urlStatus(connectionString, apmNumbers, startTime, endTime, aggregate)
        e = datetime.now()
        serviceData["URL API Read Data"] = str(s)+" - "+str(e)
        print("URL API Read Data: "+ str(s)+" - "+str(e))

        if(len(urlApiStatus) > 0):
            # urlApiStatus["TimeGenerated"] = urlApiStatus["TimeGenerated"].dt.strftime('%Y-%m-%d %H:%M')
            servicesFinal = pandas.concat([servicesFinal, urlApiStatus], ignore_index=True)
        print("URLs Read")
    except Exception as ex:
        print(ex)
        print("URLs Exception")
    serviceData["Service"] = servicesFinal
    
    return serviceData


def interfacesData(connectionString, apmNumbers, startTime, endTime):

    #Get Interface List
    interfaceQuery = f""" Select [Interfaces Monitored] from CriticalInterfacesList where APMNumber in ({apmNumbers}) """
    interfaceList = queryDw(connectionString, interfaceQuery)
    if(len(interfaceList)>0):
        interfaces = ""
        for row in interfaceList:
            interfaces = interfaces + "'" + row[0]+"' , "
        interfaces = interfaces[0:len(interfaces)-2]
        if(startTime!=""):
            timeGenerated = f"""between(datetime("{startTime}") .. datetime("{endTime}"))"""
        else:
            timeGenerated = """> ago(7d)"""
        #print(interfaces)
        #Query In LogAnalytics for the Interface Status
        workspaceId = "2fc4e462-7e14-486b-ace3-290db135b23c"
        #workspaceId = connectToKeyVault("CrcaTestLsWsID")
        logAnalyticsQuery = f""" Interface_Logs_CL 
                            | where TimeGenerated {timeGenerated} and InterfaceName_s in ({interfaces})
                            | extend uptime1 = split(UpTime_s,' ')
                            | extend upTimeHrs = iff(array_length(uptime1)==2,
                                                    (iff(uptime1[1]=='hours' or uptime1[1]=='hour',toreal(uptime1[0]),
                                                    iff(uptime1[1]=='days' or uptime1[1]=='day',toreal(uptime1[0])*24,
                                                    iff(uptime1[1]=='mins' or uptime1[1]=='min',round(toreal(uptime1[0])/60,2), round(toreal(uptime1[0])/3600,2))
                                                    ))),
                                                    (iff(uptime1[1]=='hours' or uptime1[1]=='hour',toreal(uptime1[0]),
                                                    iff(uptime1[1]=='days' or uptime1[1]=='day',toreal(uptime1[0])*24,
                                                    iff(uptime1[1]=='mins' or uptime1[1]=='min',round(toreal(uptime1[0])/60,2), round(toreal(uptime1[0])/3600,2))
                                                    )))
                                                    )
                            | extend upTimeHrs = iff(array_length(uptime1)>2,
                                                    (iff(uptime1[3]=='hours' or uptime1[3]=='hour',upTimeHrs + toreal(uptime1[2]),
                                                    iff(uptime1[3]=='days' or uptime1[3]=='day',upTimeHrs + toreal(uptime1[2])*24,
                                                    iff(uptime1[3]=='mins' or uptime1[3]=='min',upTimeHrs + round(toreal(uptime1[2])/60,2), round(toreal(uptime1[2])/3600,2))
                                                    ))),
                                                    upTimeHrs
                                                    )
                            | extend InterfaceType = iff(InterfaceName_s startswith "IB_" or InterfaceName_s startswith "OB_" ,"Corepoint", "Raphsody")
                            | project 
                            TimeGenerated, 
                            upTimeHrs, 
                            UpTime_s, 
                            MsgReceived_s, 
                            MsgSent_s, 
                            InterfaceName = InterfaceName_s, 
                            Status_s, 
                            IdleTime_s, 
                            Application_s, 
                            InterfaceType  """
        
        interfaceStatus = queryInLogAnalytics(workspaceId, logAnalyticsQuery,"","")
        
        if(len(interfaceStatus)>0):
            interfaceStatus["Availability"] = [100 if x == 'Running' else 0 for x in interfaceStatus["Status_s"]]
        interfaceData["Interfaces"] = interfaceStatus
        arr=[]
        for ind in interfaceStatus.index:
            if(interfaceStatus["InterfaceName"][ind] not in arr):
                interfaceData["Total Interfaces"]+=1
            if(interfaceStatus["Status_s"][ind] == "Stopped" and interfaceStatus["InterfaceName"][ind] not in arr):
                interfaceData["Interfaces Stopped"]+=1
                arr.append(interfaceStatus["InterfaceName"][ind])
            elif(interfaceStatus["Status_s"][ind] == "Running" and interfaceStatus["InterfaceName"][ind] not in arr):
                interfaceData["Interfaces Running"]+=1
                arr.append(interfaceStatus["InterfaceName"][ind])
        #print(interfaceData)
        interfaceData["Count"] = len(interfaceStatus)

    return interfaceData

def interfacesLogsData(connectionString, apmNumbers, startTime, endTime, aggregate, appFamily):
    
    appFamily= appFamily.lower()
    
    #appFamily = appFamily[0].lower()
    interfaceDataFinal = {
        "Interfaces": pandas.DataFrame(),
        "Total Interfaces": 0
    }
    timeGenerated = f"""between Convert(datetime, '{startTime}') and Convert(datetime, '{endTime}')"""
    
    if(aggregate=="no"):
        interfacedataquery = f"""SELECT  TimeGenerated, InterfaceName, ConnectionStatus, QueueDepth, PeerIp, ApplicationFamily, CorepointMonitor FROM [dbo].[InterfacesStatus] WHERE LOWER(ApplicationFamily) in ({appFamily}) and TimeGenerated {timeGenerated} order by TimeGenerated desc"""
    elif(aggregate=="yes"):
        interfacedataquery = f"""SELECT  TimeGenerated, InterfaceName, ConnectionStatus, QueueDepth, PeerIp, ApplicationFamily, CorepointMonitor FROM [dbo].[InterfacesStatus] WHERE LOWER(ApplicationFamily) in ({appFamily}) and TimeGenerated = (Select max(TimeGenerated) from InterfacesStatus where LOWER(ApplicationFamily) in ({appFamily}))"""
          
    interfaceDetailsList = queryDw(connectionString, interfacedataquery)
    
    if interfaceDetailsList:
        # Extract column names from the cursor description
        with openConnection(connectionString) as conn:
            column_names = [column[0] for column in conn.cursor().execute(interfacedataquery).description]
        
        # Create a DataFrame
        df = pandas.DataFrame.from_records(interfaceDetailsList, columns=column_names)
        # print(df)
        interfaceDataFinal["Interfaces"] = df
        interfaceDataFinal["Total Interfaces"] = 0

    else:
        print("No data retrieved.")

    return interfaceDataFinal


def incidentData(connectionString, appCI, aggregate, startTime, endTime, boolMi, active):

    timeGenerated = ""
    incidentsData = {}

    if(startTime==""):
        format_string = "%Y-%m-%d %H:%M:%S"
        #print(datetime.now())
        currentTime = datetime.now()
        pst = pytz.timezone('America/Los_Angeles')
        endTime = currentTime.astimezone(pst)
        startTime = endTime - timedelta(hours=5)
        startTime = startTime.strftime(format_string)
        endTime = endTime.strftime(format_string)
        timeGenerated = f"""[opened_at]>=DATEADD(DAY, -2, GETDATE())"""

    else:
        startTime = datetime.strptime(startTime, "%Y-%m-%d %I:%M:%S %p").strftime("%Y-%m-%d %H:%M:%S")
        endTime = datetime.strptime(endTime, "%Y-%m-%d %I:%M:%S %p").strftime("%Y-%m-%d %H:%M:%S")

        timeGenerated = f"""[opened_at]>=Convert(datetime,'{startTime}') and [opened_at]<=Convert(datetime,'{endTime}')"""
    
    if(appCI!=""):
        condition = f"""(Lower([cmdb_ci_label]) in ({appCI}))"""

    if(boolMi == "yes"):
        condition +=f""" and [major_incident_state] like 'Accepted'"""
    
    if(active=="yes"):
        condition +=f""" and [active] like 'true' and [state_label_1] not in ('Closed', 'Resolved')"""
        
    incidentQuery = f""" Select number, [cmdb_ci_label], [assignment_group_label],  [Resolve_Time_Seconds], [opened_at], [major_incident_state], [state_label_1], [resolved_at], [short_description], [priority_label] from vw_SN_incident 
         where {condition} and {timeGenerated} order by [opened_at]"""
    
    print(incidentQuery)
    incidentList = queryDw(connectionString, incidentQuery)
    #print("length of incidents")
    #print(incidentList)
    df_incidentList =  pandas.DataFrame()

    if(len(incidentList)>0):
        appCI = []
        filterData = dict()
        filterData["appFamily"] = ["All"]
        filterData["appCI"] = ["All"]
        filterData["managedByGroup"] = ["All"]
        filterData["supportGroup"] = ["All"]
        for row in incidentList:
            appCI.append(row[1])
        filterData["appCI"] = appCI
        # print(filterData)
        
        df_incidentList = pandas.DataFrame(numpy.array(incidentList), columns=["Number","AppCI", "Assignment Group", "Resolve_Time_Seconds","StartDateTime","u_major_incident","Status","EndDateTime", "ShortDescription", "PriorityLabel"])
        df_filters = filtersData(filterData, "dataFrame")
        print(df_filters)
        
        df_incidentList = pandas.merge(df_incidentList, df_filters[["AppCI", "AppFamily"]], on="AppCI")
        print(df_incidentList.columns)
        
        if(aggregate=="yes"):
            df_incidentList["Reliability"] = ((10080 / df_incidentList.shape[0]) / ((10080+(df_incidentList["Resolve_Time_Seconds"]//60))/df_incidentList.shape[0]))*100
            df_incidentList.dropna()
            print("Reliability")
            kpi["Reliability"]=round(df_incidentList["Reliability"].mean(),2)

            incidentsData["Total"] = len(incidentList)
            incidentsData["Resolved"] = len(df_incidentList[df_incidentList["Status"]=="Resolved"])
            incidentsData["Closed"] = len(df_incidentList[df_incidentList["Status"]=="Closed"])
            incidentsData["On Hold"] = len(df_incidentList[df_incidentList["Status"]=="On Hold"])
            incidentsData["Cancelled"] = len(df_incidentList[df_incidentList["Status"]=="Cancelled"])
            incidentsData["New"] = len(df_incidentList[df_incidentList["Status"]=="New"])
            incidentsData["Open"] = len(df_incidentList[df_incidentList["Status"]=="In Progress"])
            return incidentsData
        else:
            if(not df_incidentList.empty):
                # print(df_incidentList["StartDateTime"][0])
                df_incidentList["StartDateTime"]=df_incidentList["StartDateTime"].astype(str)
                df_incidentList["EndDateTime"]=df_incidentList["EndDateTime"].astype(str)
                print(df_incidentList)
            incidentsData["incidentsData"] = df_incidentList
            return df_incidentList.to_json()

        #print(incidentsData)
        
    else:
        if(aggregate=="yes"):
            incidentsData["Total"] = 0
            incidentsData["Resolved"] = 0
            incidentsData["Closed"] = 0
            incidentsData["On Hold"] = 0
            incidentsData["Cancelled"] = 0
            incidentsData["New"] = 0
            incidentsData["Open"] = 0
            return incidentsData
        else:
            incidentsData["incidentsData"] = df_incidentList
            return df_incidentList.to_json()

def getIncidentObservation(incidentList):
    try:
        connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
        print(incidentList)
        sqlQuery = f""" Select [Number]
                    ,[iTelemetry Observation]
                    ,[Problem Category]
                    ,[Accountability]
                    ,[Alert Summary]
                from iTelemetryObservation where Number in ({incidentList})
                """
        df_observation = pandas.DataFrame()
        observationData = queryDw(connectToCrcaMonitoring, sqlQuery)
        
        try:
            if(len(observationData)>0):
                df_observation = pandas.DataFrame(numpy.array(observationData), columns=["Number", "iTelemetry Observation","Problem Category", "Accountability", "Alert Summary"])
        except Exception as ex:
            print(ex)
            info = exceptioninfo(ex)
            insert_data(info)
            return error_response(500, "Failed to build incident observation", detail=info, exc=ex)
        # print(df_observation)
        return df_observation  
    except Exception as ex:
        print(ex)
        info = exceptioninfo(ex)
        insert_data(info)
        return error_response(500, "Failed to fetch incident observation", detail=info, exc=ex)

def changeRequest(connectionString, appCI, startTime, endTime):

    changeRequestData = {}

    if(appCI!=""):
        condition = f"""(Lower([cmdb_ci_value]) in ({appCI})) and ([state_value] not in ('%Cancel%')) and """
    else:
        condition =""

    timeGenerated = ""

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

    timeGenerated = f"""(([start_date]>=Convert(datetime,'{startTime}') and [start_date]<=Convert(datetime,'{endTime}')) or ([end_date]>=Convert(datetime,'{startTime}') and [end_date]<=Convert(datetime,'{endTime}')) or ([start_date]<=Convert(datetime,'{startTime}') and ([end_date]>=Convert(datetime,'{endTime}') or [end_date] is Null)))"""

    changeRequestQuery = f""" 
            Select [number], [cmdb_ci_value], [state_value], [end_date], [start_date], [assignment_group_value], [assigned_to_value], 
            [short_description], [active] 
            FROM [ServicePerf_DW].[dbo].[vw_SN_change_request] 
            where {condition}{timeGenerated}
     """
    df_changeRequest = pandas.DataFrame()
    #print(changeRequestQuery)
    changeRequestList = queryDw(connectionString, changeRequestQuery)
    if(len(changeRequestList)>0):
        df_changeRequest = pandas.DataFrame(numpy.array(changeRequestList), columns=["Number","AppCI", "Status","EndDateTime","StartDateTime","AssignmentGroup","AssignedTo","ShortDescription","Active"])
        df_changeRequest["StartDateTime"]=df_changeRequest["StartDateTime"].dt.strftime('%Y-%m-%d %H:%M:%S')
        df_changeRequest["EndDateTime"]=df_changeRequest["EndDateTime"].dt.strftime('%Y-%m-%d %H:%M:%S')
    
    changeRequestData["changeRequestList"] = df_changeRequest
        #print(changeRequestList)

    return changeRequestData

def kpiData(apmNumbers):
    #Performance
    logAnalyticsQuery = f""" AppPerformanceMonitoring_CL | where TimeGenerated >= ago(7d) and apmNumber_s in ({apmNumbers})
                        | extend message = split(Message, ';')
                        | extend SourceMachine = message[1], Measure = message[2], value = split(message[3], '='), DateTime = datetime_t
                        | extend Modality = value[0], Latency = value[1], AppFamily = iff(application_s == 'Synapse','Fuji Synapse PACS', application_s), APMNumber = apmNumber_s, AppCI = applicationCI_s
                        |extend Performance = iff(toint(split(Latency,'.')[0]) >= 800, 0,100)
                        | project DateTime, SourceMachine, AppFamily, APMNumber, AppCI, Measure, Modality, Latency, Performance """

    workspaceId = "911cbca9-2534-4c35-80e5-176ce6759a98"
    performance = queryInLogAnalytics(workspaceId, logAnalyticsQuery,"","")
    #print(performance.shape[0])
    if(performance.shape[0]>0):
        kpi["Performance"] = performance["Latency"].astype(float).mean()

    #Availability - Complete
    noOfRows_Availability=0

    if(len(globalVariables.servicesData["Service"])>0):
        kpi["Availability"] = globalVariables.servicesData["Service"]["Availability"].sum()
        noOfRows_Availability += globalVariables.servicesData["Count"]

    if(len(globalVariables.interfacesData["Interfaces"])>0):
        noOfRows_Availability += globalVariables.interfacesData["Count"]
        if(kpi["Availability"]!="NA"):
            kpi["Availability"]+=(globalVariables.interfacesData["Interfaces"]["Availability"].sum())
        else:
            kpi["Availability"]=globalVariables.interfacesData["Interfaces"]["Availability"].sum()

    if(kpi["Availability"]!="NA"):
        kpi["Availability"] = round((kpi["Availability"]/noOfRows_Availability), 2)
    #Reliability - Complete
    if(len(globalVariables.incidentsData)>0):
        kpi["Reliability"]=round(globalVariables.incidentsData["incidentList"]["Reliability"].mean(),2)

    return kpi
