import os
import json
import pandas as pd
import numpy as np
import pyodbc
from azure.keyvault.secrets import SecretClient
from azure.identity import DefaultAzureCredential, AzureCliCredential, ManagedIdentityCredential
from shared.logAnalytics import post_data_to_log_analytics
from shared.dataBase import queryDw, exceptioninfo, insert_data
from datetime import datetime, timedelta
import pytz
import logging
import threading

def readServicesData(connectionString, appFamily, existingAlertData, exceptionLogs):
    try:
        sqlQuery = f""" Select sl.[Application CI], sl.[Server Name], sl.[Subscription ID], sl.[Resource Group], sl.[Hosting Type], wsla.[Service Name], wsla.[Alert Frequency], wsla.[Communication] 
            from [Windows Services Alert Configuration] as wsla
            inner join [Server List] as sl on lower(sl.[Resource Name]) like lower(wsla.[Resource Name])
            inner join [Application List] as al on lower(al.[Application CI]) like lower(sl.[Application CI])
            where lower(al.[Application Family]) like lower('{appFamily}') 
        """
        print(sqlQuery)
        res = queryDw(connectionString, sqlQuery)
        print(res)
        
        if(len(res)>0):
            df_res = pd.DataFrame(np.array(res), columns=["ApplicationCI", "ServerName", "SubscriptionID","ResourceGroup", "Hosting Type", "ServiceName", "Alert Frequency", "Communication"])
            # df_res = pd.merge(df_appCi, df_res, on="ServerName")
            df_res['Resources'] = df_res["ApplicationCI"].astype(str) + "/" + df_res["ServerName"].astype(str)
            print(df_res)
            df_res['Resources'] = df_res.apply(
                lambda row: 
                    row["SubscriptionID"]+"/"+row["ResourceGroup"]+"/"+row["ServerName"]+"/"+row["ApplicationCI"]+ ","+ row['ServiceName']  if row["Hosting Type"]=="Cloud" else row["ServerName"]+"/"+row["ApplicationCI"] + ","+ row['ServiceName'], 
                    axis=1
            )
            print(df_res)
            df_res = df_res.drop(columns=["ServerName", "ServiceName","SubscriptionID","ResourceGroup"], axis=1)
            df_res = df_res.groupby(["Alert Frequency", "Communication", "Hosting Type"]).agg(lambda x: list(set(x))).reset_index()
            df_res["Alert Frequency"] = df_res["Alert Frequency"].astype(int)
            df_res["Hosting Type"] = df_res["Hosting Type"].astype(str)
            df_res["Communication"] = df_res["Communication"].apply(json.loads)
            existingAlertData["Services"] = df_res.to_dict(orient='records')
    except Exception as ex:
        print("Services", ex)
        exceptionLogs["Services Alert Read"] = exceptioninfo(ex)

def readVmMetricsData(connectionString, appFamily, existingAlertData, exceptionLogs):
    try:
        sqlQuery = f""" Select lower(al.[Application CI]), lower(sl.[Server Name]), lower(sl.[Subscription Id]), lower(sl.[Resource Group]), sl.[Hosting Type], sla.[Custom Threshold], sla.[Alert Frequency], sla.[Communication], sla.[Alert Type], sla.[Data Aggregation]
            from [Server Alert Configuration] as sla
            inner join [Server List] as sl on sl.[Resource Name] like sla.[Resource Name]
            inner join [Application List] as al on al.[Application CI] like sl.[Application CI]
            where lower(al.[Application Family]) like lower('{appFamily}')
        """
        print(sqlQuery)
        res = queryDw(connectionString, sqlQuery)
        if(len(res)>0):
            df_res = pd.DataFrame(np.array(res), columns=["ApplicationCI","ServerName", "SubscriptionId", "ResourceGroup", "Hosting Type", "Custom Threshold", "Alert Frequency", "Communication", "Alert Type", "Data Aggregation"])

            df_res['Resources'] = df_res.apply(
                lambda row: f"{row['SubscriptionId']}/{row['ResourceGroup']}/{row['ServerName']},{row['ApplicationCI']}"
                if row['Hosting Type'] == 'Cloud' else f"{row['ServerName']},{row['ApplicationCI']}",
                axis=1
            )
            df_res = df_res.drop(columns=["ServerName", "SubscriptionId", "ResourceGroup", "ApplicationCI"], axis=1)
            df_res['Custom Threshold'] = pd.to_numeric(df_res['Custom Threshold'], errors='coerce')
            
            # For Disk Alert Configuration
            print("Disk DF")
            df_res_disk = df_res[df_res["Alert Type"].str.contains("Disk", na=False)].copy()
            print(len(df_res_disk))
            if(len(df_res_disk)):
                groupByColList = ["Alert Frequency", "Communication", "Data Aggregation", "Hosting Type", "Disk Custom Threshold"]
                print("here 1")
                df_res_disk["Disk Drives"] = df_res_disk.apply(lambda row: row["Alert Type"].split(" ")[1] if "Disk" in row["Alert Type"] else "", axis=1)
                
                df_res_disk["Alert Type"] = df_res_disk.apply(lambda row: row["Alert Type"].split(" ")[0]+" Custom Threshold", axis=1)
                print(df_res_disk.columns)
                df_res_disk = df_res_disk.pivot_table(index=["Resources", "Hosting Type", "Alert Frequency", "Communication", "Data Aggregation", "Disk Drives"], columns='Alert Type', values='Custom Threshold').reset_index()
                print(df_res_disk.head())
                df_res_disk = df_res_disk.fillna(0)
                print("Here")
                df_res_disk = df_res_disk.groupby(groupByColList, as_index=False).agg(lambda x: sorted(list(set(x))))
            
            # For Other Alert Configuration
            print("Other DF")
            df_res_others = df_res[~df_res["Alert Type"].str.contains("Disk", na=False)].copy()
            print(len(df_res_others))
            if(len(df_res_others)):
                df_res_others["Alert Type"] = df_res_others["Alert Type"].str.strip() + " Custom Threshold"
        
                df_res_others = df_res_others.pivot_table(index=["Resources", "Hosting Type", "Alert Frequency", "Communication", "Data Aggregation"], columns='Alert Type', values='Custom Threshold').reset_index()
                customThresCols = [i for i in df_res_others.columns if ("Custom Threshold" in i)]
                groupByColList = customThresCols + ["Alert Frequency", "Communication", "Data Aggregation", "Hosting Type"]
                d= {"Resources":list}
                # for i in customThresCols:
                #     d[i] = 'mean'
                df_res_others = df_res_others.fillna(-1)
                df_res_others = df_res_others.groupby(groupByColList, as_index=False).agg(d)
                df_res_others = df_res_others.replace(-1,None)
            # Merge 2 Data frames
            print("Merge DF")
            df_res_disk["Resources"] = df_res_disk["Resources"].apply(tuple)
            df_res_others["Resources"] = df_res_others["Resources"].apply(tuple)
            onCols = ["Resources","Alert Frequency", "Communication", "Data Aggregation", "Hosting Type"]
            df_res = df_res_others.merge(df_res_disk, on=onCols, how="outer")
            print(df_res.columns)
            for i in df_res.columns:
                if(i=="Custom Threshold" or i=="Alert Type"):
                    df_res = df_res.drop(columns=i, axis=1)
                elif(" Custom Threshold" in i):
                    df_res[i] = df_res[i].fillna(-1)
                    df_res[i] = df_res[i].apply(int)
                    df_res[i] = df_res[i].replace(-1, None)
            df_res["Communication"] = df_res["Communication"].apply(json.loads)
            df_res["Alert Frequency"] = df_res["Alert Frequency"].astype(int)
            df_res["Data Aggregation"] = df_res["Data Aggregation"].astype(int)
            df_res["Hosting Type"] = df_res["Hosting Type"].astype(str)
            df_res = df_res.where(df_res.notna(), None)
            print(df_res)
            
            print("Server Done")
            existingAlertData["Server"] = df_res.to_dict(orient='records')
    except Exception as ex:
        print("Server", ex)
        exceptionLogs["Read VM Alert Configuration"] = exceptioninfo(ex)
        
def readDbMetricsData(connectionString, appFamily, existingAlertData, exceptionLogs):
    try:
        sqlQuery = f""" Select lower(al.[Application CI]), lower(dl.[Sql Server Name]), lower(dl.[Database Name]), lower(dl.[Subscription Id]), lower(dl.[Resource Group]), dl.[Hosting Type], sla.[Custom Threshold], sla.[Alert Frequency], sla.[Communication], sla.[Alert Type], sla.[Data Aggregation]
            from [Database Alert Configuration] as sla
            inner join [Database List] as dl on dl.[Resource Name] like sla.[Resource Name]
            inner join [Application List] as al on al.[Application CI] like dl.[Application CI]
            where lower(al.[Application Family]) like lower('{appFamily}')
        """
        print(sqlQuery)
        res = queryDw(connectionString, sqlQuery)
        if(len(res)>0):
            df_res = pd.DataFrame(np.array(res), columns=["ApplicationCI","ServerName", "DatabaseName", "SubscriptionId", "ResourceGroup", "Hosting Type", "Custom Threshold", "Alert Frequency", "Communication", "Alert Type", "Data Aggregation"])

            df_res['Resources'] = df_res.apply(
                lambda row: f"{row['SubscriptionId']}/{row['ResourceGroup']}/{row['ServerName']}/{row['DatabaseName']},{row['ApplicationCI']}"
                if row['Hosting Type'] == 'Cloud' else f"{row['ServerName']}/{row['DatabaseName']},{row['ApplicationCI']}",
                axis=1
            )
            df_res = df_res.drop(columns=["ServerName", "SubscriptionId", "ResourceGroup","DatabaseName"], axis=1)
            df_res["Alert Type"] = df_res["Alert Type"].str.strip() + " Custom Threshold"

            alertTypeList = df_res["Alert Type"].unique().tolist()
            print(alertTypeList)
            df_res['Custom Threshold'] = pd.to_numeric(df_res['Custom Threshold'], errors='coerce')
            df_res = df_res.pivot_table(index=["Resources", "Hosting Type", "Alert Frequency", "Communication", "Data Aggregation"], columns='Alert Type', values='Custom Threshold').reset_index()
            # print(df_res)
            groupByColList = alertTypeList+["Alert Frequency", "Communication", "Data Aggregation", "Hosting Type"]
            df_res = df_res.fillna(0)
            df_res = df_res.groupby(groupByColList, as_index=False).agg(lambda x: sorted(tuple(set(x))))
            
            df_res["Communication"] = df_res["Communication"].apply(json.loads)
            df_res["Alert Frequency"] = df_res["Alert Frequency"].astype(int)
            df_res["Data Aggregation"] = df_res["Data Aggregation"].astype(int)
            df_res["Hosting Type"] = df_res["Hosting Type"].astype(str)
            print("Database Done")
            existingAlertData["Database"] = df_res.to_dict(orient='records')
            
    except Exception as ex:
        print("Database", ex)
        exceptionLogs["Database Alert Read"] = exceptioninfo(ex)
        
def readFileStorageMetricsData(connectionString, appFamily, existingAlertData, exceptionLogs):
    try:
        sqlQuery = f""" Select lower(al.[Application CI]), lower(fsl.[Storage Name]), lower(fsl.[Fileshare Name]), lower(fsl.[Subscription Id]), lower(fsl.[Resource Group]), fsl.[Hosting Type], fsla.[Custom Threshold], fsla.[Alert Frequency], fsla.[Communication], fsla.[Alert Type], fsla.[Data Aggregation]
            from [File Storage Alert Configuration] as fsla
            inner join [File Storage List] as fsl on fsl.[Resource Name] like fsla.[Resource Name]
            inner join [Application List] as al on al.[Application CI] like fsl.[Application CI]
            where lower(al.[Application Family]) like lower('{appFamily}')
        """
        print(sqlQuery)
        res = queryDw(connectionString, sqlQuery)
        if(len(res)>0):
            df_res = pd.DataFrame(np.array(res), columns=["ApplicationCI","StorageName", "FileshareName", "SubscriptionId", "ResourceGroup", "Hosting Type", "Custom Threshold", "Alert Frequency", "Communication", "Alert Type", "Data Aggregation"])

            df_res['Resources'] = df_res.apply(
                lambda row: f"{row['SubscriptionId']}/{row['ResourceGroup']}/{row['StorageName']}/{row['FileshareName']},{row['ApplicationCI']}"
                if row['Hosting Type'] == 'Cloud' else f"{row['StorageName']}/{row['FileshareName']},{row['ApplicationCI']}",
                axis=1
            )
            df_res = df_res.drop(columns=["StorageName", "SubscriptionId", "ResourceGroup","FileshareName"], axis=1)
            df_res["Alert Type"] = df_res["Alert Type"].str.strip() + " Custom Threshold"

            alertTypeList = df_res["Alert Type"].unique().tolist()
            print(alertTypeList)
            df_res['Custom Threshold'] = pd.to_numeric(df_res['Custom Threshold'], errors='coerce')
            df_res = df_res.pivot_table(index=["Resources", "Hosting Type", "Alert Frequency", "Communication", "Data Aggregation"], columns='Alert Type', values='Custom Threshold').reset_index()
            # print(df_res)
            groupByColList = alertTypeList+["Alert Frequency", "Communication", "Data Aggregation", "Hosting Type"]
            df_res = df_res.fillna(0)
            df_res = df_res.groupby(groupByColList, as_index=False).agg(lambda x: sorted(tuple(set(x))))
            
            df_res["Communication"] = df_res["Communication"].apply(json.loads)
            df_res["Alert Frequency"] = df_res["Alert Frequency"].astype(int)
            df_res["Data Aggregation"] = df_res["Data Aggregation"].astype(int)
            df_res["Hosting Type"] = df_res["Hosting Type"].astype(str)
            print("File Storage Done")
            existingAlertData["File Storage"] = df_res.to_dict(orient='records')
            
    except Exception as ex:
        print("File Storage", ex)
        exceptionLogs["File Storage Alert Read"] = exceptioninfo(ex)

def readAlertRule(appFamily, connectionString):
    existingAlertData = {
        "Server" :[{}],
        "Services":[{}],
        "Database" : [{}],
        "File Storage" : [{}]
    }
    exceptionLogs = {}
    threads = [
        threading.Thread(target=readVmMetricsData, args = (connectionString, appFamily, existingAlertData, exceptionLogs)),
        threading.Thread(target=readServicesData, args = (connectionString, appFamily, existingAlertData, exceptionLogs)),        
        threading.Thread(target=readDbMetricsData, args = (connectionString, appFamily, existingAlertData, exceptionLogs)),
        threading.Thread(target=readFileStorageMetricsData, args = (connectionString, appFamily, existingAlertData, exceptionLogs)),        
    ]
    
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
        
    if(len(exceptionLogs.keys())>0):
        exData = {
            "UserName" : "",
            "PageName" : "alertRulesRead.py",
            "LineNumber" : "",
            "ExceptionMessage" : json.dumps(exceptionLogs)
        }
        # Call the function to insert exception
        # insert_data(exData)  
        print()
        return exData, 501
    # print(existingAlertData)
            
    return existingAlertData, 200