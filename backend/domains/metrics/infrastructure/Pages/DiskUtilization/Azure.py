import pandas as pd
import numpy
from shared.dataBase import connectToDw, queryDw, connectToDw_AADpwd, insert_data,exceptioninfo
from shared.LogAnalytics import queryInLogAnalytics
from flask import jsonify

def azureDiskUtilization(aggregate, serverName_Cond, timeGenerated, subRg_Cond,threshold):
    #print(f"Threshold value: {threshold}")
    
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
            return jsonify({'error':str(Ex)}),500
    except Exception as Ex:
        print("Exception in Azure Disk Utilization: ",Ex )
        info =exceptioninfo(Ex,sqlQueryDiskUtil)
        insert_data(info)
        return jsonify({'error':str(Ex)}),500
    ## New code end

    # return df_diskUtilization
    # print(sqlQueryMemoryUtil)