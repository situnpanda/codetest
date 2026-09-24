from flask import Flask
import pandas as pd
import numpy
import json
from shared.dataBase import connectToDw, queryDw, connectToDw_AADpwd, connectToDw_SqlServerPwd


server_name_query = f"""
                        SELECT distinct LOWER(cmdbci.[name]) AS ServerName, BusinessApp.name AS AppCI, BusinessApp.[apm_application_family_name] AS AppFamily,
                        Case
                            when cmdbci.u_is_cloud like 'true' then 'Cloud'
                            else 'OnPremise'
                        End AS HostingType
                        FROM   
                        [ServicePerf_DW].[dbo].[vw_sn_cmdb_ci_server] AS cmdbci
                        INNER JOIN  
                        vw_SN_Appl_Relationship AS AppRelation ON AppRelation.RelationshipID = cmdbci.sys_id
                        INNER JOIN  
                        vw_SN_cmdb_ci_business_app AS BusinessApp ON BusinessApp.sys_id = AppRelation.ApplicationID
                        WHERE       
                        (BusinessApp.portfolio_name = 'Clinical & Revenue Cycle Apps (CRCA)'
                        OR BusinessApp.[apm_application_family_name] LIKE 'Cromwell')
                        AND BusinessApp.active = 'true'
                        AND AppRelation.Relationship = 'Runs on'"""

connectionString_Snow = connectToDw_SqlServerPwd("spidedbsv6c6b60.wa.providence.org\\SPIDER", "ServicePerf_DW","servCRCAMonitor")
connectionString_crcamonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")

def serviceList_new(appFamily, appCI):
    conditions = ""
    df_servicesList = pd.DataFrame()
    if(appCI!=""):
        conditions += f"lower(sl.[Application CI]) in ('{appCI.lower()}')"
    elif(appFamily!=""):
        conditions += f"lower(al.[Application Family]) in ('{appFamily.lower()}')"
    
    sqlQuery = f""" Select wsl.[Resource Name],sl.[Server Name], trim([Service Name]),wsl.[Hosting Type],sl.[Application CI] from [Windows Services List] wsl
        inner join [Server List] sl on lower(wsl.[Resource Name]) like lower(sl.[Resource Name])
        inner join [Application List] al on lower(al.[Application CI]) like lower(sl.[Application CI])
        where {conditions}
    """
    print(sqlQuery)
    
    metaData = queryDw(connectionString_crcamonitoring, sqlQuery)
    if(len(metaData)>0):
        df_servicesList = pd.DataFrame(numpy.array(metaData), columns=["Resource Name","Server Name", "Service Name", "Hosting Type", "Application CI"])
        
    return df_servicesList

def serviceList(appFamily, appCI):
    
    server_names = ""
    conditions = ""
    query = server_name_query
    
    if(appCI!=""):
        conditions += f"lower(BusinessApp.name) in ('{appCI.lower()}')"
    if(appFamily!=""):
        conditions += f"lower(BusinessApp.[apm_application_family_name]) in ('{appFamily.lower()}')"
    
    if(conditions!=""):
        query += f" AND ({conditions})"
    
    df_servicesList = pd.DataFrame()
    df_serverList = pd.DataFrame()
    print(query)
    server_name_list = queryDw(connectionString_Snow, query)
    
    if(len(server_name_list)>0):
        df_serverList = pd.DataFrame(numpy.array(server_name_list), columns=["Server Name", "Application CI", "Application Family", "Hosting Type"])

        for row in server_name_list:
            server_names = server_names + "'" + row[0]+"' , "
        server_names = server_names[0:len(server_names)-2]
        # print(server_names)
        metaDataQuery = f""" Select ServerName, trim(ServiceName) from CriticalWindowsServiceList where lower(ServerName) in ({server_names})"""
        
        metaData = queryDw(connectionString_crcamonitoring, metaDataQuery)
        if(len(metaData)>0):
            df_servicesList = pd.DataFrame(numpy.array(metaData), columns=["Server Name", "Service Name"])
            df_servicesList = pd.merge(df_servicesList, df_serverList, on="Server Name")
            # print(df_servicesList)
    return df_servicesList

def urlList(appFamily, appCI):
    
    appCiNames = ""
    conditions = ""
    query = server_name_query
    
    if(appCI!=""):
        conditions += f"lower(BusinessApp.name) in ({appCI})"
    if(appFamily!=""):
        conditions += f"lower(BusinessApp.[apm_application_family_name]) in ({appFamily})"
    if(conditions!=""):
        query += f" AND ({conditions})"
    
    df_urlList = pd.DataFrame()    
    appCi_list = queryDw(connectionString_Snow, query)
    
    for row in appCi_list:
        appCiNames = appCiNames + "'" + row[1]+"' , "
    appCiNames = appCiNames[0:len(appCiNames)-2]
    # print(appCiNames)
    metaDataQuery = f"""Select AppCI, URL, Environment, HostingType from ServiceMon_InputData where AppCI in ({appCiNames})"""
    metaData = queryDw(connectionString_crcamonitoring, metaDataQuery)
    if(len(metaData)>0):
        df_urlList = pd.DataFrame(numpy.array(metaData), columns=["Application CI", "URL", "Environment", "Hosting Type"])
    
    return df_urlList

def dbList_new(appFamily, appCI):
    conditions = ""
    df_databaseList = pd.DataFrame()
    if(appCI!=""):
        conditions += f"lower(al.[Application CI]) in ('{appCI.lower()}')"
    elif(appFamily!=""):
        conditions += f"lower(al.[Application Family]) in ('{appFamily.lower()}')"
    
    sqlQuery = f""" Select dl.[Resource Name],dl.[Sql Server Name], dl.[Database Name], dl.[Hosting Type], al.[Application CI] from [Database List] dl
        inner join [Application List] al on lower(al.[Application CI]) like lower(dl.[Application CI])
        where {conditions}
    """
    print(sqlQuery)
    
    metaData = queryDw(connectionString_crcamonitoring, sqlQuery)
    if(len(metaData)>0):
        df_databaseList = pd.DataFrame(numpy.array(metaData), columns=["Resource Name", "Server Name", "Database Name", "Hosting Type", "Application CI"])
        
    return df_databaseList

def dbList(appFamily, appCI):
    
    appCiNames = ""
    conditions = ""
    query = server_name_query
    
    if(appCI!=""):
        conditions += f"lower(BusinessApp.name) in ('{appCI.lower()}')"
    if(appFamily!=""):
        conditions += f"lower(BusinessApp.[apm_application_family_name]) in ('{appFamily.lower()}')"
    if(conditions!=""):
        query += f" AND ({conditions})"
    print(query)
    df_dbList = pd.DataFrame()    
    appCi_list = queryDw(connectionString_Snow, query)
    if(len(appCi_list)>0):
        for row in appCi_list:
            appCiNames = appCiNames + "'" + row[1]+"' , "
        appCiNames = appCiNames[0:len(appCiNames)-2]
        # print(appCiNames)
        metaDataQuery = f"""Select [Sql Server Name],[Database Name],[Application CI], [Hosting Type] from [DatabaseMetaData] where [Application CI] in ({appCiNames})"""
        metaData = queryDw(connectionString_crcamonitoring, metaDataQuery)
        if(len(metaData)>0):
            df_dbList = pd.DataFrame(numpy.array(metaData), columns=["Server Name", "Database Name", "Application CI", "Hosting Type"])
    
    return df_dbList

def fileShareList_new(appFamily, appCI):
    conditions = ""
    df_fileshareList = pd.DataFrame()
    if(appCI!=""):
        conditions += f"lower(al.[Application CI]) in ('{appCI.lower()}')"
    elif(appFamily!=""):
        conditions += f"lower(al.[Application Family]) in ('{appFamily.lower()}')"
    
    sqlQuery = f""" Select fl.[Resource Name],fl.[Storage Name], fl.[Fileshare Name], fl.[Hosting Type], al.[Application CI] from [File Storage List] fl
        inner join [Application List] al on lower(al.[Application CI]) like lower(fl.[Application CI])
        where {conditions}
    """
    print(sqlQuery)
    
    metaData = queryDw(connectionString_crcamonitoring, sqlQuery)
    if(len(metaData)>0):
        df_fileshareList = pd.DataFrame(numpy.array(metaData), columns=["Resource Name", "Storage Name", "Fileshare Name", "Hosting Type", "Application CI"])
        
    return df_fileshareList
    
def customRequirementList(appFamily, appCI):
    # print(appFamily)
    # print(appCI)
    appFamilyNames = ""
    conditions = ""
    
    query = server_name_query
    
    if(appCI!=""):
        conditions += f"lower(BusinessApp.name) in ({appCI})"
    if(appFamily!=""):
        conditions += f"lower(BusinessApp.[apm_application_family_name]) in ({appFamily})"
    if(conditions!=""):
        query += f" AND ({conditions})"
    
    df_customRequirementList = pd.DataFrame()    
    appFamily_list = queryDw(connectionString_Snow, query)
    
    for row in appFamily_list:
        appFamilyNames = appFamilyNames + "'" + row[2].lower().strip()+"' , "
    appFamilyNames = appFamilyNames[0:len(appFamilyNames)-2]
    metaDataQuery = f"""Select [App Family], [Custom Monitoring] from ApplicationOnboardingSummary where Lower(Trim([App Family])) in ({appFamilyNames}) and [Custom Monitoring] is not NULL"""
    # print(metaDataQuery)
    metaData = queryDw(connectionString_crcamonitoring, metaDataQuery)
    if(len(metaData)>0):
        tempArr = []
        for row in metaData:
            customMon = json.loads(row[1])
            for i in customMon:
                temp = []
                temp.append(row[0])
                temp.append(i)
                temp.append(customMon[i])
            tempArr.append(temp)
        print(tempArr)
        df_customRequirementList = pd.DataFrame(numpy.array(tempArr), columns=["Application Family", "Custom Requirement", "Status"])
        print(df_customRequirementList)
    return df_customRequirementList