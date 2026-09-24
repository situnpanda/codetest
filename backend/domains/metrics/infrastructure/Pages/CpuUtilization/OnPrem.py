import pandas as pd
import numpy
from shared.dataBase import connectToDw_SqlServerPwdScom, queryDw, exceptioninfo,insert_data, connectToDw_AADpwd
from flask import jsonify

def onPremCpuUtilization(aggregate, serverName_Cond, timeGenerated,subRg_Cond, threshold):
    #print(f"Threshold value: {threshold}")
    # try:
    #     if(aggregate=="yes"):
    #         sqlQueryOnpremCpuUtil = f"""Select ServerName, DnsDomain, Max(AvgValue) as MaxValue, Count(*) as Frequency 
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
    #             WHERE	vPerformanceRule.ObjectName = 'Processor Information' 
    #             AND     vPerformanceRule.CounterName IN ('% Processor Time')
    #             AND {serverName_Cond}{timeGenerated}
    #             GROUP BY 
    #                 (DATEADD(minute, (DATEDIFF(minute, 0, (vph.DateTime AT TIME ZONE 'Pacific Standard Time')) / 10) * 10, 0)),
    #                 LOWER(LEFT(vManagedEntity.Path, CHARINDEX('.', vManagedEntity.Path + '.') - 1)),
    #                 RIGHT(vManagedEntity.Path, LEN(vManagedEntity.Path) - CHARINDEX('.', vManagedEntity.Path))
    #             ) as subquery
    #         where AvgValue>={threshold}
    #         group by ServerName, DnsDomain
    #         """
    #     elif(aggregate=="forGAC"):
    #         sqlQueryOnpremCpuUtil = f"""SELECT DATEADD(minute, (DATEDIFF(minute, 0, (vph.DateTime AT TIME ZONE 'Pacific Standard Time')) / 10) * 10, 0) AS TimeGenerated,
    #             AVG(vph.SampleValue) AS AvgValue,
    #             LOWER(LEFT(vManagedEntity.Path, CHARINDEX('.', vManagedEntity.Path + '.') - 1)) AS ServerName,
    #             RIGHT(vManagedEntity.Path, LEN(vManagedEntity.Path) - CHARINDEX('.', vManagedEntity.Path)) AS DnsDomain,
    #             HostingType = 'OnPremise'
    #         FROM    Perf.vPerfRaw AS vph 
    #             INNER JOIN  vPerformanceRuleInstance ON vPerformanceRuleInstance.PerformanceRuleInstanceRowId = vph.PerformanceRuleInstanceRowId 
    #             INNER JOIN  vManagedEntity ON vph.ManagedEntityRowId = vManagedEntity.ManagedEntityRowId 
    #             INNER JOIN  vPerformanceRule ON vPerformanceRuleInstance.RuleRowId = vPerformanceRule.RuleRowId
    #         WHERE	vPerformanceRule.ObjectName = 'Processor Information' 
    #             AND     vPerformanceRule.CounterName IN ('% Processor Time')
    #             AND {serverName_Cond}{timeGenerated}
    #         GROUP BY 
    #             (DATEADD(minute, (DATEDIFF(minute, 0, (vph.DateTime AT TIME ZONE 'Pacific Standard Time')) / 10) * 10, 0)),
    #             LOWER(LEFT(vManagedEntity.Path, CHARINDEX('.', vManagedEntity.Path + '.') - 1)),
    #             RIGHT(vManagedEntity.Path, LEN(vManagedEntity.Path) - CHARINDEX('.', vManagedEntity.Path))
    #         HAVING
	# 			AVG(vph.SampleValue) > 70
    #         Order by TimeGenerated DESC
    #         """
    #     else:
    #         sqlQueryOnpremCpuUtil = f"""SELECT DATEADD(minute, (DATEDIFF(minute, 0, (vph.DateTime AT TIME ZONE 'Pacific Standard Time')) / 10) * 10, 0) AS TimeGenerated,
    #             AVG(vph.SampleValue) AS AvgValue,
    #             LOWER(LEFT(vManagedEntity.Path, CHARINDEX('.', vManagedEntity.Path + '.') - 1)) AS ServerName,
    #             RIGHT(vManagedEntity.Path, LEN(vManagedEntity.Path) - CHARINDEX('.', vManagedEntity.Path)) AS DnsDomain,
    #             HostingType = 'OnPremise'
    #         FROM    Perf.vPerfRaw AS vph 
    #             INNER JOIN  vPerformanceRuleInstance ON vPerformanceRuleInstance.PerformanceRuleInstanceRowId = vph.PerformanceRuleInstanceRowId 
    #             INNER JOIN  vManagedEntity ON vph.ManagedEntityRowId = vManagedEntity.ManagedEntityRowId 
    #             INNER JOIN  vPerformanceRule ON vPerformanceRuleInstance.RuleRowId = vPerformanceRule.RuleRowId
    #         WHERE	vPerformanceRule.ObjectName = 'Processor Information' 
    #             AND     vPerformanceRule.CounterName IN ('% Processor Time')
    #             AND {serverName_Cond}{timeGenerated}
    #         GROUP BY 
    #             (DATEADD(minute, (DATEDIFF(minute, 0, (vph.DateTime AT TIME ZONE 'Pacific Standard Time')) / 10) * 10, 0)),
    #             LOWER(LEFT(vManagedEntity.Path, CHARINDEX('.', vManagedEntity.Path + '.') - 1)),
    #             RIGHT(vManagedEntity.Path, LEN(vManagedEntity.Path) - CHARINDEX('.', vManagedEntity.Path))
    #         Order by TimeGenerated ASC
    #         """
    #     # print(f" 1.......SQL Query Executed cpu onprem: {sqlQueryOnpremCpuUtil}")
    #     try:
    #         connectionString_Scom = connectToDw_SqlServerPwdScom("msscodbsPA2A0L0.wa.providence.org","OperationsManagerDW", "CRCAMonitoring")
    #         df_cpuUtil = pd.DataFrame()
    #         cpuUtilData = queryDw(connectionString_Scom, sqlQueryOnpremCpuUtil)
    #         # print("2-------CPU on prem Util data",cpuUtilData)

    #         if(cpuUtilData and len(cpuUtilData)>0):
    #             if(aggregate=="yes"):
    #                 df_cpuUtil = pd.DataFrame(numpy.array(cpuUtilData), columns=["ServerName","DnsDomain", "Frequency", "MaxUtiliztion"])
    #             else:
    #                 df_cpuUtil = pd.DataFrame(numpy.array(cpuUtilData), columns=["TimeGenerated","AvgValue", "ServerName","DnsDomain", "HostingType"])
    #                 df_cpuUtil["TimeGenerated"] = df_cpuUtil["TimeGenerated"].dt.strftime('%Y-%m-%d %H:%M')
    #         return df_cpuUtil
    #     except Exception as Ex:
    #         print("Exception in connecting to database ",Ex )
    #         info =exceptioninfo(Ex)
    #         insert_data(info)
    #         return jsonify({'error':str(Ex)}),500
    # except Exception as Ex:
    #     print("Exception in OnPrem CPU Utilization: ",Ex )
    #     info =exceptioninfo(Ex,sqlQueryOnpremCpuUtil)
    #     insert_data(info)
    #     return jsonify({'error':str(Ex)}),500
    try:
        if(aggregate=="yes"):
            sqlQueryCpuUtil = f"""
                SELECT ServerName, SubscriptionId, ResourceGroup, Count(*) as Frequency, 
                    Max(AvgValue) as MaxUtiliztion
                FROM CpuUtilization 
                WHERE AvgValue >= {threshold} 
                AND {serverName_Cond} {subRg_Cond} {timeGenerated} and TimeGenerated = (Select Max(TimeGenerated) from CpuUtilization)
                GROUP BY ServerName, SubscriptionId, ResourceGroup
            """
        elif(aggregate == "forGAC"):
            sqlQueryCpuUtil = f"""Select TimeGenerated, ServerName, SubscriptionId, ResourceGroup, AvgValue, HostingType 
            from CpuUtilization where {serverName_Cond}{subRg_Cond}{timeGenerated} and AvgValue > 80 order by TimeGenerated asc
            """
        else:
            sqlQueryCpuUtil = f"""Select TimeGenerated, ServerName, SubscriptionId, ResourceGroup, AvgValue, HostingType 
            from CpuUtilization where {serverName_Cond}{subRg_Cond}{timeGenerated} order by TimeGenerated asc
            """
        #print(f"SQL Query Executed cpu azure: {sqlQueryCpuUtil}")
        # print(sqlQueryCpuUtil)
        # print(sqlQueryCpuUtil)
        try:
            connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
            df_cpuUtil = pd.DataFrame()
            cpuUtilData = queryDw(connectToCrcaMonitoring, sqlQueryCpuUtil)

            if(len(cpuUtilData)>0):
                if(aggregate=="yes"):
                    df_cpuUtil = pd.DataFrame(numpy.array(cpuUtilData), columns=["ServerName", "SubscriptionId", "ResourceGroup", "Frequency", "MaxUtiliztion"])
                else:
                    df_cpuUtil = pd.DataFrame(numpy.array(cpuUtilData), columns=["TimeGenerated", "ServerName", "SubscriptionId", "ResourceGroup", "AvgValue", "HostingType"])
                    df_cpuUtil["TimeGenerated"] = df_cpuUtil["TimeGenerated"].dt.strftime('%Y-%m-%d %H:%M')
                

            return df_cpuUtil
        except Exception as Ex:
            print("Exception Connecting to db for Azure CPU Utilization: ",Ex)
            info = exceptioninfo(Ex)
            insert_data(info)
            return jsonify({'error':str(Ex)}),500
    except Exception as Ex:
        print("Exception in Azure CPU Utilization: ",Ex )
        info =exceptioninfo(Ex,sqlQueryCpuUtil)
        insert_data(info)
        return jsonify({'error':str(Ex)}),500