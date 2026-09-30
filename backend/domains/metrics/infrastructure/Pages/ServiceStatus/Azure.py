from shared.dataBase import connectToDw, queryDw, connectToDw_SqlServerPwdScom, connectToDw_AADpwd,exceptioninfo,insert_data
import pandas
import numpy
import pytz
from datetime import datetime, timedelta
from shared.LogAnalytics import queryInLogAnalytics
from flask import jsonify
from shared.appinsights_logger import error_response

def getGACQuery(timeGenerated, hostingType):
    # GACquery = f"""
    # WITH UpdateTable AS (
    #     SELECT 
    #         TimeGenerated,
    #         ServiceName,
    #         ServerName,
    #         Status, 
    #         Hostingtype,
    #         Monitortype,
    #         LAG(Status) OVER (PARTITION BY ServiceName, ServerName, HostingType ORDER BY TimeGenerated) as prevStatus,
    #         LAG(TimeGenerated) OVER (PARTITION BY ServiceName, ServerName, HostingType ORDER BY TimeGenerated) as prevTime
    #     FROM 
    #         [CriticalServicesStatus]
    #     WHERE 
    #         TimeGenerated {timeGenerated} and ServerName not like 'acuo%' and HostingType = '{hostingType}'
    # ),
    # ChangeFind as (
    #     SELECT 
    #         TimeGenerated,
    #         ServiceName,
    #         ServerName,
    #         Status, 
    #         Hostingtype,
    #         Monitortype,
    #         CASE 
    #             when (Status = 'Running' and prevStatus <> 'Running') then 'Change'
    #             when (Status <> 'Running' and (prevStatus = 'Running' or prevTime IS NULL)) then 'Change'
    #             Else 'No Change'
    #         END as Change,
    #         Case 
    #         when (Status <> 'Running' and prevTime IS NULL) then 'greater'
    #         Else Null
    #         End as TimeGreater
    #     from UpdateTable
    # ),
    # GetDurationTime as (
    #     SELECT 
    #         TimeGenerated,
    #         ServiceName,
    #         ServerName,
    #         Status, 
    #         Hostingtype,
    #         Change, 
    #         TimeGreater,
    #         Monitortype,
    #         Case
    #             when Status <> 'Running' then Lead(TimeGenerated) over (PARTITION BY ServiceName, ServerName, HostingType ORDER BY TimeGenerated)
    #             else Null
    #         end as EndTime
    #     from ChangeFind where Change like 'Change'
    # ),
    # GetDuration as (
    #     SELECT 
    #         TimeGenerated,
    #         ServiceName,
    #         ServerName,
    #         Status, 
    #         Hostingtype,
    #         Change, 
    #         TimeGreater,
    #         Monitortype,
    #         DATEDIFF(MINUTE,TimeGenerated,EndTime) as Duration
    #     from GetDurationTime where Status <> 'Running'
    # )
    # Select Trim(ServerName) as ServerName, Trim(ServiceName) as ServiceName, TimeGenerated, Trim(HostingType) as HostingType, 
    #                 Trim(MonitorType) as MonitorType, Trim(Status) as Status, Duration
    # from GetDuration order by ServerName, ServiceName, TimeGenerated
    # """
    GACquery = f"""WITH UpdateTable AS (
        SELECT
            TimeGenerated,
            ServiceName,
            ServerName,
			ServerServicemap,
            Status,
            Hostingtype,
            Monitortype,
            LAG(Status) OVER (PARTITION BY ServiceName, ServerName, HostingType ORDER BY TimeGenerated) as prevStatus,
            LAG(TimeGenerated) OVER (PARTITION BY ServiceName, ServerName, HostingType ORDER BY TimeGenerated) as prevTime
        FROM
            [CriticalServicesStatus]
        WHERE
        TimeGenerated {timeGenerated} and ServerName not like 'acuo%' and HostingType = '{hostingType}'
    ),
    ChangeFind as (
        SELECT
            TimeGenerated,
            ServiceName,
            ServerName,
			ServerServicemap,
            Status,
            Hostingtype,
            Monitortype,
            CASE
                when (Status = 'Running' and prevStatus <> 'Running') then 'Change'
                when (Status <> 'Running' and (prevStatus = 'Running' or prevTime IS NULL)) then 'Change'
                Else 'No Change'
            END as Change,
            Case
            when (Status <> 'Running' and prevTime IS NULL) then 'greater'
            Else Null
            End as TimeGreater
        from UpdateTable
    ),
    GetDurationTime as (
        SELECT
            TimeGenerated,
            ServiceName,
            ServerName,
			ServerServicemap,
            Status,
            Hostingtype,
            Change,
            TimeGreater,
            Monitortype,
            Case
                when Status <> 'Running' then Lead(TimeGenerated) over (PARTITION BY ServiceName, ServerName, HostingType ORDER BY TimeGenerated)
                else Null
            end as EndTime
        from ChangeFind where Change like 'Change'
    ),
    GetDuration as (
        SELECT
            TimeGenerated,
            ServiceName,
            ServerName,
			ServerServicemap,
            Status,
            Hostingtype,
            Change,
            TimeGreater,
            Monitortype,
			EndTime,
            DATEDIFF(MINUTE,TimeGenerated,EndTime) as Duration
        from GetDurationTime where Status <> 'Running'
    )
    Select 
	TRIM(ServerName) AS ServerName, 
    TRIM(ServiceName) AS ServiceName,
    ServerServicemap, 
    TimeGenerated,
    EndTime, 
    TRIM(HostingType) AS HostingType, 
    TRIM(MonitorType) AS MonitorType, 
    TRIM(Status) AS Status, 
    Duration 
    FROM GetDuration 
    ORDER BY ServerName, TimeGenerated;"""
    return GACquery
    #azureServicesQuery = f"""WITH UpdateTable AS (SELECT TimeGenerated, ServiceName, ServerName, Status, Hostingtype, Monitortype, ServerServicemap, LAG(Status) OVER (PARTITION BY ServiceName, ServerName, HostingType ORDER BY TimeGenerated) as prevStatus, LAG(TimeGenerated) OVER (PARTITION BY ServiceName, ServerName, HostingType ORDER BY TimeGenerated) as prevTime FROM [CriticalServicesStatus] WHERE ServerServiceMap in ({server_services}) and TimeGenerated {timeGenerated} AND ServerName NOT LIKE 'acuo%'), ChangeFind as (SELECT TimeGenerated, ServiceName, ServerName, ServerServicemap, Status, Hostingtype, Monitortype, CASE when (Status = 'Running' and prevStatus <> 'Running') then 'Change' when (Status <> 'Running' and (prevStatus = 'Running' or prevTime IS NULL)) then 'Change' Else 'No Change' END as Change, Case when (Status <> 'Running' and prevTime IS NULL) then 'greater' Else Null End as TimeGreater from UpdateTable), GetDurationTime as (SELECT TimeGenerated, ServiceName, ServerName, ServerServicemap, Status, Hostingtype, Change, TimeGreater, Monitortype, COALESCE(LEAD(cf.TimeGenerated) OVER (PARTITION BY cf.ServiceName, cf.ServerName, cf.HostingType ORDER BY cf.TimeGenerated), (SELECT MAX(TimeGenerated) FROM ChangeFind WHERE ServiceName = cf.ServiceName AND ServerName = cf.ServerName AND HostingType = cf.HostingType)) AS EndTime from ChangeFind cf where Change like 'Change'), GetDuration as (SELECT TimeGenerated, EndTime, ServiceName, ServerName, ServerServicemap, Status, Hostingtype, Change, TimeGreater, Monitortype, DATEDIFF(MINUTE,TimeGenerated,EndTime) as Duration from GetDurationTime where Status <> 'Running') Select Trim(ServerName) as ServerName, Trim(ServiceName) as ServiceName,ServerServicemap, TimeGenerated,EndTime, Trim(HostingType) as HostingType, Trim(MonitorType) as MonitorType, Trim(Status) as Status, Duration from GetDuration order by ServerName, TimeGenerated;"""
    #return azureServicesQuery

def processDataFroDurationServices(df):
    def calculate_high_utilization(row):
        return 1 if row['Status'] == 'Stopped' else 0

    df['IsHighUtilization'] = df.apply(calculate_high_utilization, axis=1)
    grouped = df.groupby('ServerServiceMap')
    duration_data = []

    for _, group in grouped:
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

    duration_df = pandas.DataFrame(duration_data)
    if(len(duration_df)>0):
        duration_df.sort_values(by=['ServerName', 'startTime'], inplace=True)
    return duration_df

def azureServiceStatus(serviceList, startTime, endTime, aggregate):
    serviceStatus = pandas.DataFrame()
    
    if(len(serviceList)>0):
        server_services = ""
        
        for row in serviceList:
            
            if("Cloud" in row[3]):
                server_services = server_services + "'" + row[2]+"' ,"
        if(server_services==""):
            return serviceStatus
        server_services = server_services[0:len(server_services)-2]
        #print(server_services)
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
        
        timeGenerated = f"""between Convert(datetime, '{startTime}') and Convert(datetime, '{endTime}')"""
        try:
            connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")

            if(aggregate=="no"):
                azureServicesQuery = f""" Select Trim(ServerName) as ServerName, Trim(ServiceName) as ServiceName, Trim(ServerServiceMap) as ServerServiceMap, TimeGenerated, Trim(HostingType) as HostingType, 
                Trim(MonitorType) as MonitorType, Trim(Status) as Status from CriticalServicesStatus where ServerServiceMap in ({server_services}) and TimeGenerated {timeGenerated} and Trim(HostingType) like 'Cloud' order by TimeGenerated asc"""
            elif(aggregate=="yes"):
                azureServicesQuery = f""" Select Trim(ServerName) as ServerName, Trim(ServiceName) as ServiceName, Trim(ServerServiceMap) as ServerServiceMap, TimeGenerated, Trim(HostingType) as HostingType, 
                Trim(MonitorType) as MonitorType, Trim(Status) as Status from CriticalServicesStatus where ServerServiceMap in ({server_services}) and TimeGenerated = (Select max(TimeGenerated) from CriticalServicesStatus where Trim(HostingType) like 'Cloud')"""
            elif(aggregate=="forGAC"):
                azureServicesQuery = getGACQuery(timeGenerated, "Cloud")
                #print(timeGenerated)
                #azureServicesQuery = f"""WITH UpdateTable AS (SELECT TimeGenerated, ServiceName, ServerName, Status, Hostingtype, Monitortype, ServerServicemap, LAG(Status) OVER (PARTITION BY ServiceName, ServerName, HostingType ORDER BY TimeGenerated) as prevStatus, LAG(TimeGenerated) OVER (PARTITION BY ServiceName, ServerName, HostingType ORDER BY TimeGenerated) as prevTime FROM [CriticalServicesStatus] WHERE ServerName NOT LIKE 'acuo%'), ChangeFind as (SELECT TimeGenerated, ServiceName, ServerName, ServerServicemap, Status, Hostingtype, Monitortype, CASE when (Status = 'Running' and prevStatus <> 'Running') then 'Change' when (Status <> 'Running' and (prevStatus = 'Running' or prevTime IS NULL)) then 'Change' Else 'No Change' END as Change, Case when (Status <> 'Running' and prevTime IS NULL) then 'greater' Else Null End as TimeGreater from UpdateTable), GetDurationTime as (SELECT TimeGenerated, ServiceName, ServerName, ServerServicemap, Status, Hostingtype, Change, TimeGreater, Monitortype, COALESCE(LEAD(cf.TimeGenerated) OVER (PARTITION BY cf.ServiceName, cf.ServerName, cf.HostingType ORDER BY cf.TimeGenerated), (SELECT MAX(TimeGenerated) FROM ChangeFind WHERE ServiceName = cf.ServiceName AND ServerName = cf.ServerName AND HostingType = cf.HostingType)) AS EndTime from ChangeFind cf where Change like 'Change'), GetDuration as (SELECT TimeGenerated, EndTime, ServiceName, ServerName, ServerServicemap, Status, Hostingtype, Change, TimeGreater, Monitortype, DATEDIFF(MINUTE,TimeGenerated,EndTime) as Duration from GetDurationTime where Status <> 'Running') Select Trim(ServerName) as ServerName, Trim(ServiceName) as ServiceName,ServerServicemap, TimeGenerated,EndTime, Trim(HostingType) as HostingType, Trim(MonitorType) as MonitorType, Trim(Status) as Status, Duration from GetDuration order by ServerName, TimeGenerated;"""

                print(azureServicesQuery)
                # f""" Select Trim(ServerName) as ServerName, Trim(ServiceName) as ServiceName, Trim(ServerServiceMap) as ServerServiceMap, TimeGenerated, Trim(HostingType) as HostingType, 
                # Trim(MonitorType) as MonitorType, Trim(Status) as Status from CriticalServicesStatus where ServerServiceMap in ({server_services}) and TimeGenerated {timeGenerated} and serverName not like 'acuo%' and Trim(HostingType) like 'Cloud' order by TimeGenerated asc"""
            # print(azureServicesQuery)
            try:
                azureServiceDB = queryDw(connectToCrcaMonitoring, azureServicesQuery)
                # if(aggregate != 'forGAC' and len(azureServiceDB)>0):
                #     serviceStatus = pandas.DataFrame(numpy.array(azureServiceDB), columns=["ServerName", "ServiceName","ServerServiceMap","TimeGenerated","HostingType","MonitorType","Status"])
                #     serviceStatus["TimeGenerated"] = serviceStatus["TimeGenerated"].dt.strftime('%Y-%m-%d %H:%M')
                # if(aggregate == 'forGAC' and len(azureServiceDB)>0):
                #     # serviceStatus = processDataFroDurationServices(serviceStatus)
                #     serviceStatus = pandas.DataFrame(numpy.array(azureServiceDB), columns=["ServerName", "ServiceName","TimeGenerated","HostingType","MonitorType","Status", "Duration"])
                #     serviceStatus["TimeGenerated"] = serviceStatus["TimeGenerated"].dt.strftime('%Y-%m-%d %H:%M')


                #gac changes after mergeif(len(azureServiceDB)>0):
                if(len(azureServiceDB)>0):
                    if(aggregate == "forGAC"):
                        serviceStatus = pandas.DataFrame(numpy.array(azureServiceDB), columns=["ServerName", "ServiceName","ServerServiceMap","TimeGenerated","EndTime","HostingType","MonitorType","Status","Duration"])
                        pst = pytz.timezone('America/Los_Angeles')
                        currentTime = datetime.now()
                        endTime = currentTime.astimezone(pst)
                        endTime = endTime.strftime('%Y-%m-%d %H:%M')

                        serviceStatus.loc[serviceStatus["EndTime"].isna(), "EndTime"] = endTime
                        serviceStatus["Duration"] = (serviceStatus["EndTime"] - serviceStatus["TimeGenerated"]).dt.total_seconds() / 60
                        serviceStatus["EndTime"] = serviceStatus["EndTime"].astype(str).str[:16]
                    else:
                        serviceStatus = pandas.DataFrame(numpy.array(azureServiceDB), columns=["ServerName", "ServiceName","ServerServiceMap","TimeGenerated","HostingType","MonitorType","Status"])
                    serviceStatus["TimeGenerated"] = serviceStatus["TimeGenerated"].dt.strftime('%Y-%m-%d %H:%M')
                return serviceStatus
            except Exception as Ex:
                print("Exception in servicestatus azure execution: ",Ex )
                info =exceptioninfo(Ex,azureServicesQuery)
                insert_data(info)
                return error_response(500, "Failed to fetch Azure service status", detail=info, exc=Ex)
        except Exception as Ex:
            print("Exception in connecting to crcamonitoring database: ",Ex )
            info =exceptioninfo(Ex)
            insert_data(info)
            return error_response(500, "Failed to connect to monitoring database", detail=info, exc=Ex)
            
