import pandas as pd
import numpy
from shared.dataBase import connectToDw, queryDw, connectToDw_AADpwd, exceptioninfo, insert_data
from flask import jsonify

def azureFileshareUtilization(aggregate,timeGenerated,appnamecond):
    if(aggregate=="no"):
        sqlQueryFileshareUtil=f""" 
            SELECT [File Share],
                    [Used Capacity (GiB)], [Provisioned Capacity (GiB)]
                ,[TimeGenerated] , [Storage Account Name]
            FROM azureResourceStatus
            where {timeGenerated} AND {appnamecond}
            ORDER BY [File Share], [Storage Account Name], [TimeGenerated] asc;
        """
    else:
        sqlQueryFileshareUtil = f"""
            SELECT [File Share]
            ,[Storage Account Name]
            ,[Used Capacity (GiB)]
            ,[Provisioned Capacity (GiB)]
            ,[SubscriptionID]
            ,[ServerName]
            ,[Support Group]
            ,[Resource Group]
            ,[TimeGenerated]
            FROM azureResourceStatus AS a
            WHERE [TimeGenerated] = (
            SELECT MAX([TimeGenerated])
            FROM azureresourcestatus AS b
            WHERE a.[File Share] = b.[File Share]
            AND a.[Storage Account Name] = b.[Storage Account Name]
            AND {appnamecond}
            AND b.{timeGenerated}
            )
            ORDER BY [File Share], [Storage Account Name];
            """
    # print(sqlQueryFileshareUtil)

    try:
        connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
        df_fileshareUtil = pd.DataFrame()
        
        try:
            fileshareUtilData = queryDw(connectToCrcaMonitoring, sqlQueryFileshareUtil)
            if(len(fileshareUtilData)>0):
                if(aggregate=="no"):
                     df_fileshareUtil = pd.DataFrame(numpy.array(fileshareUtilData), columns=["Fileshare","Used Capacity (GiB)","Provisioned Capacity (GiB)","TimeGenerated", "Storage Account Name"])
                else:
                    df_fileshareUtil = pd.DataFrame(
                        numpy.array(fileshareUtilData),
                        columns=[
                            "Fileshare", "StorageAccountName", "Used Capacity (GiB)", "Provisioned Capacity (GiB)",
                            "SubscriptionID", "AppCI", "Support Group", "Resource Group", "TimeGenerated"
                        ]
                    )
                df_fileshareUtil["TimeGenerated"] = df_fileshareUtil["TimeGenerated"].dt.strftime('%Y-%m-%d %H:%M')
            # print(df_fileshareUtil)
            print(aggregate)
            return df_fileshareUtil
        except Exception as Ex:
            print("Exception in connecting to crcamonitoring database", Ex)
            info = exceptioninfo(Ex)
            insert_data(info)
            return jsonify({'error': str(Ex)}), 500
    except Exception as Ex:
        print("Exception in Azure Fileshare Utilization:", Ex)
        info = exceptioninfo(Ex, sqlQueryFileshareUtil)
        insert_data(info)
        return jsonify({'error': str(Ex)}), 500

