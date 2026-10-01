import pandas as pd
import numpy
from shared.dataBase import connectToDw_SqlServerPwdScom, queryDw,exceptioninfo,insert_data,connectToDw_AADpwd
from flask import jsonify
from shared.appinsightsLogger import error_response

def onPremDiskUtilization(aggregate, serverName_Cond, timeGenerated,subRg_Cond,threshold):
#     print("onPremDiskUtilization")
#     print(aggregate)
#     # print(serverName_Cond)
#     print(timeGenerated)
#     print(threshold)
#     #print(f"Threshold value: {threshold}")
#     try:
#         if(aggregate=="yes"):
#             sqlQueryOnpremDiskUtil = f"""Select ServerName, DnsDomain, Max(AvgValue) as MaxValue, Count(*) as Frequency 
#             from 
#                 (SELECT DATEADD(minute, (DATEDIFF(minute, 0, (vph.DateTime AT TIME ZONE 'Pacific Standard Time')) / 10) * 10, 0) AS TimeGenerated,
#                         Avg(100 - ROUND(vph.SampleValue,2)) AS AvgValue,
#                         LOWER(LEFT(vManagedEntity.Path, CHARINDEX('.', vManagedEntity.Path + '.') - 1)) AS ServerName,
#                         RIGHT(vManagedEntity.Path, LEN(vManagedEntity.Path) - CHARINDEX('.', vManagedEntity.Path)) AS DnsDomain,
#                         HostingType = 'OnPremise'
#                 FROM    Perf.vPerfRaw AS vph 
#                 INNER JOIN  vPerformanceRuleInstance ON vPerformanceRuleInstance.PerformanceRuleInstanceRowId = vph.PerformanceRuleInstanceRowId 
#                 INNER JOIN  vManagedEntity ON vph.ManagedEntityRowId = vManagedEntity.ManagedEntityRowId 
#                 INNER JOIN  vPerformanceRule ON vPerformanceRuleInstance.RuleRowId = vPerformanceRule.RuleRowId
#                 WHERE	vPerformanceRule.ObjectName = 'LogicalDisk' 
#                 AND     vPerformanceRule.CounterName IN ('% Free Space')
#                 AND {serverName_Cond}{timeGenerated}
#                 GROUP BY 
#                     (DATEADD(minute, (DATEDIFF(minute, 0, (vph.DateTime AT TIME ZONE 'Pacific Standard Time')) / 10) * 10, 0)),
#                     LOWER(LEFT(vManagedEntity.Path, CHARINDEX('.', vManagedEntity.Path + '.') - 1)),
#                     RIGHT(vManagedEntity.Path, LEN(vManagedEntity.Path) - CHARINDEX('.', vManagedEntity.Path))
#                 ) as subquery
#             where AvgValue>={threshold}
#             group by ServerName, DnsDomain
#             """
            
#         else:
            
#             sqlQueryOnpremDiskUtil = f"""WITH AggregatedData AS (
#     SELECT 
#         DATEADD(minute, (DATEDIFF(minute, 0, (vph.DateTime AT TIME ZONE 'Pacific Standard Time')) / 10) * 10, 0) AS TimeGenerated,
#         LOWER(LEFT(vManagedEntity.Path, CHARINDEX('.', vManagedEntity.Path + '.') - 1)) AS ServerName,
#         vPerformanceRuleInstance.InstanceName AS DriveName,
#         RIGHT(vManagedEntity.Path, LEN(vManagedEntity.Path) - CHARINDEX('.', vManagedEntity.Path)) AS DnsDomain,
#         HostingType = 'OnPremise',
        
#         -- Average for '% Free Space', ignoring NULL values
#         AVG(CASE 
#                 WHEN vPerformanceRule.CounterName = '% Free Space' AND vph.SampleValue IS NOT NULL THEN 
#                     100 - ROUND(vph.SampleValue, 2) 
#                 ELSE NULL 
#             END) AS AvgValue,
        
#         -- Max for 'Free Megabytes'
#         MAX(CASE 
#                 WHEN vPerformanceRule.CounterName = 'Free Megabytes' THEN vph.SampleValue 
#                 ELSE NULL 
#             END) AS MaxFreeMegabytes
#     FROM    
#         Perf.vPerfRaw AS vph 
#         INNER JOIN vPerformanceRuleInstance ON vPerformanceRuleInstance.PerformanceRuleInstanceRowId = vph.PerformanceRuleInstanceRowId 
#         INNER JOIN vManagedEntity ON vph.ManagedEntityRowId = vManagedEntity.ManagedEntityRowId 
#         INNER JOIN vPerformanceRule ON vPerformanceRuleInstance.RuleRowId = vPerformanceRule.RuleRowId
#     WHERE   
#         vPerformanceRule.ObjectName = 'LogicalDisk' 
#         AND vPerformanceRule.CounterName IN ('% Free Space', 'Free Megabytes')
#         AND {serverName_Cond}{timeGenerated}
#     GROUP BY 
#         DATEADD(minute, (DATEDIFF(minute, 0, (vph.DateTime AT TIME ZONE 'Pacific Standard Time')) / 10) * 10, 0),
#         LOWER(LEFT(vManagedEntity.Path, CHARINDEX('.', vManagedEntity.Path + '.') - 1)),
#         RIGHT(vManagedEntity.Path, LEN(vManagedEntity.Path) - CHARINDEX('.', vManagedEntity.Path)),
#         vPerformanceRuleInstance.InstanceName
# )
# SELECT 
#     TimeGenerated,
#     AvgValue,
#     ServerName,
#     DriveName,
#     DnsDomain,
#     HostingType,
#     CASE 
#         WHEN AvgValue > 0 THEN CEILING(MaxFreeMegabytes / ((100 - AvgValue) / 100) / 1024) 
#         ELSE -1 
#     END AS TotalDiskCapacityGB,
#     CEILING(MaxFreeMegabytes / 1024) AS FreeSpaceGB
# FROM 
#     AggregatedData
# WHERE 
#     AvgValue IS NOT NULL -- Filter out rows where AvgValue is NULL
# ORDER BY 
#     TimeGenerated ASC;
#             """
#         #print(f"SQL Query Executed disk onprem: {sqlQueryOnpremDiskUtil}")
#         # print(sqlQueryOnpremDiskUtil)
#         try:
#             connectionString_Scom = connectToDw_SqlServerPwdScom("msscodbsPA2A0L0.wa.providence.org","OperationsManagerDW", "CRCAMonitoring")
#             df_DiskUtil = pd.DataFrame()
#             diskUtilData = queryDw(connectionString_Scom, sqlQueryOnpremDiskUtil)
#             # print("Disk------Onprem")
#             # print(df_DiskUtil)

#             if(len(diskUtilData)>0):
#                 if(aggregate=="yes"):
#                     df_DiskUtil = pd.DataFrame(numpy.array(diskUtilData), columns=["ServerName","DnsDomain", "Frequency", "MaxUtiliztion"])
#                 else:
#                     df_DiskUtil = pd.DataFrame(numpy.array(diskUtilData), columns=["TimeGenerated","AvgValue", "ServerName","DriveName", "DnsDomain", "HostingType","TotalSpace","FreeSpace"])
#                     df_DiskUtil["TimeGenerated"] = df_DiskUtil["TimeGenerated"].dt.strftime('%Y-%m-%d %H:%M')
#                     df_DiskUtil["AvgDiskReads"] = numpy.nan
#                     df_DiskUtil["AvgDiskWrites"] = numpy.nan
#                     df_DiskUtil["AvgDiskReadBytes"] = numpy.nan
#                     df_DiskUtil["AvgDiskWriteBytes"] = numpy.nan
#                     df_DiskUtil["AvgDiskLatency"] = numpy.nan
                    
#             return df_DiskUtil            
        
#         except Exception as Ex:
#             print("Exception in connecting to Scom database ",Ex )
#             info =exceptioninfo(Ex)
#             insert_data(info)
#             return jsonify({'error':str(Ex)}),500
#     except Exception as Ex:
#         print("Exception in On Prem Disk Utilization: ",Ex )
#         info =exceptioninfo(Ex,sqlQueryOnpremDiskUtil)
#         insert_data(info)
#         return jsonify({'error':str(Ex)}),500
       
    ## New Code
    try:
        if(aggregate=="yes"):
            sqlQueryDiskUtil = f"""Select Trim(ServerName), Trim(SubscriptionId), Trim(ResourceGroup), Trim(DriverName), Count(*) as Frequency, Max(AvgValue) as MaxUtiliztion
            from DiskUtilization where AvgValue>={threshold} and {serverName_Cond}{subRg_Cond}{timeGenerated}
            group by ServerName, SubscriptionId, ResourceGroup, DriverName
            """
        elif(aggregate=="forGAC"):
            sqlQueryDiskUtil = f"""Select TimeGenerated, Trim(ServerName), Trim(SubscriptionId), Trim(ResourceGroup), Trim(DriverName), AvgValue, Trim(HostingType),TotalDiskCapacityGB,FreeSpaceGB,AvgDiskReads,AvgDiskWrites,AvgDiskReadBytes,AvgDiskWriteBytes,AvgDiskLatency 
            from DiskUtilization where {serverName_Cond}{subRg_Cond}{timeGenerated} and AvgValue > 80 order by TimeGenerated asc
            """
        else:
            sqlQueryDiskUtil = f"""Select TimeGenerated, Trim(ServerName), Trim(SubscriptionId), Trim(ResourceGroup), Trim(DriverName), AvgValue, Trim(HostingType),TotalDiskCapacityGB,FreeSpaceGB,AvgDiskReads,AvgDiskWrites,AvgDiskReadBytes,AvgDiskWriteBytes,AvgDiskLatency 
            from DiskUtilization where {serverName_Cond}{subRg_Cond}{timeGenerated} order by TimeGenerated asc
            """
        #print(f"SQL Query Executed disk azure: {sqlQueryDiskUtil}")

        # print(sqlQueryDiskUtil)
        # print(sqlQueryCpuUtil)
        try:
            connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
            df_diskUtil = pd.DataFrame()
            diskUtilData = queryDw(connectToCrcaMonitoring, sqlQueryDiskUtil)

            if(len(diskUtilData)>0):
                if(aggregate=="yes"):
                    df_diskUtil = pd.DataFrame(numpy.array(diskUtilData), columns=["ServerName", "SubscriptionId", "ResourceGroup", "DriveName", "Frequency", "MaxUtiliztion"])
                else:
                    df_diskUtil = pd.DataFrame(numpy.array(diskUtilData), columns=["TimeGenerated", "ServerName", "SubscriptionId", "ResourceGroup", "DriveName", "AvgValue", "HostingType","TotalSpace","FreeSpace","AvgDiskReads","AvgDiskWrites","AvgDiskReadBytes","AvgDiskWriteBytes","AvgDiskLatency"])
                    df_diskUtil["TimeGenerated"] = df_diskUtil["TimeGenerated"].dt.strftime('%Y-%m-%d %H:%M')
                    #print(df_diskUtil)
                
            return df_diskUtil
        except Exception as Ex:
            print("Exception in connecting to crcamonitoring database ",Ex )
            info =exceptioninfo(Ex)
            insert_data(info)
            return error_response(500, "Failed to connect to monitoring database", detail=info, exc=Ex)
    except Exception as Ex:
        print("Exception in Azure Disk Utilization: ",Ex )
        info =exceptioninfo(Ex,sqlQueryDiskUtil)
        insert_data(info)
        return error_response(500, "Failed to fetch disk utilization", detail=info, exc=Ex)
    ## New code end

    # return df_diskUtilization
    # print(sqlQueryMemoryUtil)    
