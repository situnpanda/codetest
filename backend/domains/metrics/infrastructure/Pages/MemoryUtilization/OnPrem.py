import pandas as pd
import numpy
from shared.dataBase import connectToDw_SqlServerPwdScom, queryDw,insert_data,exceptioninfo, connectToDw_AADpwd
from flask import jsonify
from shared.appinsights_logger import error_response

def onPremMemoryUtilization(aggregate, serverName_Cond, timeGenerated,subRg_Cond,threshold):
    #print(f"Threshold value: {threshold}")
    # try:
    #     if(aggregate=="yes"):
    #         sqlQueryOnpremMemoryUtil = f"""Select ServerName, DnsDomain, Max(AvgValue) as MaxValue, Count(*) as Frequency 
    #         from 
    #             (SELECT DATEADD(minute, (DATEDIFF(minute, 0, (vph.DateTime AT TIME ZONE 'Pacific Standard Time')) / 10) * 10, 0) AS TimeGenerated,
    #                     AVG(vph.SampleValue) AS AvgValue,
    #                     LOWER(LEFT(vManagedEntity.Path, CHARINDEX('.', vManagedEntity.Path + '.') - 1)) AS ServerName,
    #                     RIGHT(vManagedEntity.Path, LEN(vManagedEntity.Path) - CHARINDEX('.', vManagedEntity.Path)) AS DnsDomain,
    #                     HostingType = 'OnPremise'
    #             FROM    Perf.vPerfRaw AS vph 
    #             INNER JOIN  vPerformanceRuleInstance ON vPerformanceRuleInstance.PerformanceRuleInstanceRowId = vph.PerformanceRuleInstanceRowId 
    #             INNER JOIN  vManagedEntity ON vph.ManagedEntityRowId = vManagedEntity.ManagedEntityRowId 
    #             INNER JOIN  vPerformanceRule ON vPerformanceRuleInstance.RuleRowId = vPerformanceRule.RuleRowId
    #             WHERE	vPerformanceRule.ObjectName = 'Memory' 
    #             AND  vPerformanceRule.CounterName IN ('PercentMemoryUsed')
    #             AND {serverName_Cond}{timeGenerated}
    #             GROUP BY 
    #                 (DATEADD(minute, (DATEDIFF(minute, 0, (vph.DateTime AT TIME ZONE 'Pacific Standard Time')) / 10) * 10, 0)),
    #                 LOWER(LEFT(vManagedEntity.Path, CHARINDEX('.', vManagedEntity.Path + '.') - 1)),
    #                 RIGHT(vManagedEntity.Path, LEN(vManagedEntity.Path) - CHARINDEX('.', vManagedEntity.Path))
    #             ) as subquery
    #         where AvgValue>={threshold}
    #         group by ServerName, DnsDomain
    #         """

    #         #print(f"SQL Query Executed memory onprem: {sqlQueryOnpremMemoryUtil}")
            
    #     else:
            
    #         sqlQueryOnpremMemoryUtil = f"""SELECT DATEADD(minute, (DATEDIFF(minute, 0, (vph.DateTime AT TIME ZONE 'Pacific Standard Time')) / 10) * 10, 0) AS TimeGenerated,
    #             AVG(vph.SampleValue) AS AvgValue,
    #             LOWER(LEFT(vManagedEntity.Path, CHARINDEX('.', vManagedEntity.Path + '.') - 1)) AS ServerName,
    #             RIGHT(vManagedEntity.Path, LEN(vManagedEntity.Path) - CHARINDEX('.', vManagedEntity.Path)) AS DnsDomain,
    #             HostingType = 'OnPremise'
    #         FROM    Perf.vPerfRaw AS vph 
    #             INNER JOIN  vPerformanceRuleInstance ON vPerformanceRuleInstance.PerformanceRuleInstanceRowId = vph.PerformanceRuleInstanceRowId 
    #             INNER JOIN  vManagedEntity ON vph.ManagedEntityRowId = vManagedEntity.ManagedEntityRowId 
    #             INNER JOIN  vPerformanceRule ON vPerformanceRuleInstance.RuleRowId = vPerformanceRule.RuleRowId
    #         WHERE	vPerformanceRule.ObjectName = 'Memory' 
    #         AND  vPerformanceRule.CounterName IN ('PercentMemoryUsed')
    #         AND {serverName_Cond}{timeGenerated}
    #         GROUP BY 
    #             (DATEADD(minute, (DATEDIFF(minute, 0, (vph.DateTime AT TIME ZONE 'Pacific Standard Time')) / 10) * 10, 0)),
    #             LOWER(LEFT(vManagedEntity.Path, CHARINDEX('.', vManagedEntity.Path + '.') - 1)),
    #             RIGHT(vManagedEntity.Path, LEN(vManagedEntity.Path) - CHARINDEX('.', vManagedEntity.Path))
    #         Order by TimeGenerated ASC
    #         """
        
    #     # print(sqlQueryOnpremMemoryUtil)
    #     try:
    #         connectionString_Scom = connectToDw_SqlServerPwdScom("msscodbsPA2A0L0.wa.providence.org","OperationsManagerDW", "CRCAMonitoring")
    #         df_memoryUtil = pd.DataFrame()
    #         memoryUtilData = queryDw(connectionString_Scom, sqlQueryOnpremMemoryUtil)

    #         if(len(memoryUtilData)>0):
    #             if(aggregate=="yes"):
    #                 df_memoryUtil = pd.DataFrame(numpy.array(memoryUtilData), columns=["ServerName","DnsDomain", "Frequency", "MaxUtiliztion"])
    #             else:
    #                 df_memoryUtil = pd.DataFrame(numpy.array(memoryUtilData), columns=["TimeGenerated","AvgValue", "ServerName","DnsDomain", "HostingType"])
    #                 df_memoryUtil["TimeGenerated"] = df_memoryUtil["TimeGenerated"].dt.strftime('%Y-%m-%d %H:%M')
                
    #         return df_memoryUtil
    #     except Exception as Ex:
    #         print("Exception in connecting to scom database ",Ex )
    #         info =exceptioninfo(Ex)
    #         insert_data(info)
    #         return jsonify({'error':str(Ex)}),500
    # except Exception as Ex:
    #     print("Exception in Onprem Memory Utilization: ",Ex )
    #     info =exceptioninfo(Ex,sqlQueryOnpremMemoryUtil)
    #     insert_data(info)
    #     return jsonify({'error':str(Ex)}),500
    try:
        if(aggregate=="yes"):
            sqlQueryMemoryUtil = f"""Select ServerName, SubscriptionId, ResourceGroup, Count(*) as Frequency, Max(AvgValue) as MaxUtiliztion
            from MemoryUtilization where AvgValue>={threshold} and {serverName_Cond}{subRg_Cond}{timeGenerated} and TimeGenerated = (Select Max(TimeGenerated) from MemoryUtilization)
            group by ServerName, SubscriptionId, ResourceGroup 
            """
        elif(aggregate == "forGAC"):
            sqlQueryMemoryUtil = f"""Select TimeGenerated, ServerName, SubscriptionId, ResourceGroup, AvgValue, HostingType 
            from MemoryUtilization where {serverName_Cond}{subRg_Cond}{timeGenerated} and AvgValue > 80 order by TimeGenerated asc
            """
        else:   
            sqlQueryMemoryUtil = f"""Select TimeGenerated, ServerName, SubscriptionId, ResourceGroup, AvgValue, HostingType 
            from MemoryUtilization where {serverName_Cond}{subRg_Cond}{timeGenerated} order by TimeGenerated ASC
            """

        try:
            connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
            df_memoryUtil = pd.DataFrame()
            memoryUtilData = queryDw(connectToCrcaMonitoring, sqlQueryMemoryUtil)
            print("The query", sqlQueryMemoryUtil)
            if(len(memoryUtilData)>0):
                if(aggregate=="yes"):
                    df_memoryUtil = pd.DataFrame(numpy.array(memoryUtilData), columns=["ServerName", "SubscriptionId", "ResourceGroup", "Frequency", "MaxUtiliztion"])
                else:
                    df_memoryUtil = pd.DataFrame(numpy.array(memoryUtilData), columns=["TimeGenerated", "ServerName", "SubscriptionId", "ResourceGroup", "AvgValue", "HostingType"])
                    df_memoryUtil["TimeGenerated"] = df_memoryUtil["TimeGenerated"].dt.strftime('%Y-%m-%d %H:%M')
                
            return df_memoryUtil
        except Exception as Ex:
            print("Exception in connecting to crcamonitoring database ",Ex )
            info =exceptioninfo(Ex)
            insert_data(info)
            return error_response(500, "Failed to connect to monitoring database", detail=info, exc=Ex)
    except Exception as Ex:
        print("Exception in Azure Memory Utilization: ",Ex )
        info =exceptioninfo(Ex,sqlQueryMemoryUtil)
        insert_data(info)
        return error_response(500, "Failed to fetch memory utilization", detail=info, exc=Ex)
        