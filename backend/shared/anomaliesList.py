from shared.dataBase import queryDw, connectToDw
from shared.LogAnalytics import queryInLogAnalytics
from shared.keyVault import connectToKeyVault
from shared.variables import globalVariables
from datetime import datetime, timedelta
import pandas as pd
import pytz
import pandas
import numpy

anomaliesData ={
    "SpikedCount": 0,
    "AvgPeakVal": 0,
    'ServerList':pd.DataFrame(),
    'PeakValList':pd.DataFrame()
}

def anomaliesList(connectionString):
    anomaliesListQuery = """ Select ServerName, SubscriptionId, ResourceGroup, PeakTime,PeakValue,MidPoints,AnomalyType from InfraAnomalies """
    anomaliesList = queryDw(connectionString, anomaliesListQuery)
    df_anomaliesList = pandas.DataFrame()
    if(len(anomaliesList)>0):
        df_anomaliesList = pandas.DataFrame(numpy.array(anomaliesList), columns=["ServerName", "SubscriptionId", "ResourceGroup", "PeakTime","PeakValue","MidPoints","AnomalyType"])
        
    return df_anomaliesList

def anomaliesInfo(connectionString):
    CountQuery = """SELECT COUNT(DISTINCT servername) AS distinctServerCount,
    AVG(peakvalue) AS averagePeakValue    FROM InfraAnomalies;    """
    ValuesList = queryDw(connectionString,CountQuery)
    anomaliesData['SpikedCount'] = ValuesList[0][0]
    anomaliesData['AvgPeakVal']= ValuesList[0][1]
    listQuery = """SELECT distinct servername, peakvalue FROM InfraAnomalies
where peakvalue>80;"""
    dataList = queryDw(connectionString, listQuery)
    serverList = [row[0] for row in dataList]
    peakValList = [row[1] for row in dataList]
    anomaliesData['ServerList'] = pd.DataFrame({'ServerName': serverList})
    anomaliesData['PeakValList'] = pd.DataFrame({'PeakValue': peakValList})
    anomaliesData['ServerList'] = anomaliesData['ServerList'].to_dict(orient='records')
    anomaliesData['PeakValList'] = anomaliesData['PeakValList']['PeakValue'].tolist()
    return anomaliesData

