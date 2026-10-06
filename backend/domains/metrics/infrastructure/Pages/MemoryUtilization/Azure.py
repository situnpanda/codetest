import pandas as pd
import numpy
from shared.dataBase import connectToDw, queryDw, connectToDw_AADpwd,exceptioninfo,insert_data
from flask import jsonify
from shared.appinsightsLogger import error_response

def azureMemoryUtilization(aggregate, serverName_Cond, timeGenerated, subRg_Cond,threshold):
    #print(f"Threshold value: {threshold}")
    
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
        return error_response(500, "Failed to fetch Azure memory utilization", detail=info, exc=Ex)
        