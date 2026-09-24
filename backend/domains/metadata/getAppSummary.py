from flask import Flask
import pandas as pd
import numpy
import json
from shared.dataBase import connectToDw, queryDw, connectToDw_AADpwd, connectToDw_SqlServerPwd

connectionString_crcamonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")

def appSummary():
    query = f""" SELECT [App Family]
        ,[App CI]
        ,[Custom Monitoring]
        ,[Wave Number]
        ,[Month Onboarded]
        ,[Document Link]
        ,[Status]
    FROM ApplicationOnboardingSummary order by [Month Onboarded]"""
    # print(query)
    appSummaryList = queryDw(connectionString_crcamonitoring, query)
    if(len(appSummaryList)>0):
        df_appSummaryList = pd.DataFrame(numpy.array(appSummaryList), columns=["Application Family","Application CI", "Custom Monitoring" , "Wave Number", "Month Onboarded", "Document Link", "Status"])
        df_appSummaryList["Month Onboarded"] = df_appSummaryList["Month Onboarded"].dt.strftime('%Y-%m-%d %H:%M:%S')
    print(df_appSummaryList)
    
    return df_appSummaryList
    
