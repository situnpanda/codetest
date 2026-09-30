import pandas as pd
import numpy
from shared.dataBase import connectToDw, queryDw, connectToDw_AADpwd,exceptioninfo,insert_data
from flask import jsonify
from shared.appinsights_logger import error_response
from datetime import datetime, timedelta

#after gac merge
def processDataForDuration(df, customThreshold):
    print("customThreshold")

    def calculate_high_utilization(row):
        threshold_entry = next((entry for entry in customThreshold
                                if entry['AppCI'].lower() == row['AppCI'].lower()
                                and entry['Type'].lower() == row['AlertType'].lower()), None)
        threshold = threshold_entry['Threshold'] if threshold_entry else 90
        return 1 if row['AvgValue'] >= threshold else 0

    def joinThreshold(row):
        threshold = next((entry for entry in customThreshold
                          if entry['AppCI'].lower() == row['AppCI'].lower()
                          and entry['Type'].lower() == row['AlertType'].lower()), None)
        return threshold

    df['Threshold'] = df.apply(joinThreshold, axis=1)
    df['IsHighUtilization'] = df.apply(calculate_high_utilization, axis=1)
    print("after joining thres ishigh:")
    # print(df)

    df['groupKey'] = df.apply(
        lambda x: f"{x['ServerName']}_{x['DriveName']}"
        if 'DriveName' in x and pd.notnull(x['DriveName'])
        else x['ServerName'], axis=1
    )

    df.sort_values(by=['groupKey', 'TimeGenerated'], inplace=True)  # sort for safe iteration
    grouped = df.groupby('groupKey')

    durationData = []
    max_gap = timedelta(minutes=10)  # Your data is every 10 minutes

    for _, group in grouped:
        groupStartTime = None
        currentGroup = None
        previousHighTime = None

        for _, row in group.iterrows():
            currentTime = datetime.strptime(row['TimeGenerated'], "%Y-%m-%d %H:%M")

            if row['IsHighUtilization'] == 1:
                # Start new segment if none started or gap is too long
                if not groupStartTime or (previousHighTime and currentTime - previousHighTime > max_gap):
                    if currentGroup:
                        currentGroup['endTime'] = previousHighTime.strftime("%Y-%m-%d %H:%M")
                        durationData.append(currentGroup)

                    groupStartTime = currentTime
                    currentGroup = row.to_dict()
                    currentGroup['startTime'] = row['TimeGenerated']
                    currentGroup['maxDuration'] = 0

                duration = (currentTime - groupStartTime).total_seconds() / 60  # in minutes
                currentGroup['maxDuration'] = max(currentGroup['maxDuration'], duration)
                previousHighTime = currentTime

            else:
                # End the current group if utilization drops
                if currentGroup:
                    currentGroup['endTime'] = previousHighTime.strftime("%Y-%m-%d %H:%M")
                    durationData.append(currentGroup)
                    groupStartTime = None
                    currentGroup = None
                    previousHighTime = None

        # End-of-group check
        if currentGroup:
            currentGroup['endTime'] = previousHighTime.strftime("%Y-%m-%d %H:%M")
            durationData.append(currentGroup)

    duration_df = pd.DataFrame(durationData)

    if len(duration_df) > 0:
        duration_df.sort_values(by=['ServerName', 'startTime'], inplace=True)
        # print("duration_df")
        # print(duration_df)

    return duration_df

def azureCpuUtilization(aggregate, serverName_Cond, timeGenerated, subRg_Cond,threshold):
    #print(f"Threshold value: {threshold}") 
    try:
        if(aggregate=="yes"):
            sqlQueryCpuUtil = f"""
                SELECT ServerName, SubscriptionId, ResourceGroup, Count(*) as Frequency, 
                    Max(AvgValue) as MaxUtiliztion
                FROM CpuUtilization 
                WHERE AvgValue >= {threshold} 
                AND {serverName_Cond}{subRg_Cond}{timeGenerated} and TimeGenerated = (Select Max(TimeGenerated) from CpuUtilization)
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
            return error_response(500, "Failed to connect to monitoring database", detail=info, exc=Ex)
    except Exception as Ex:
        print("Exception in Azure CPU Utilization: ",Ex )
        info =exceptioninfo(Ex,sqlQueryCpuUtil)
        insert_data(info)
        return error_response(500, "Failed to fetch Azure CPU utilization", detail=info, exc=Ex)