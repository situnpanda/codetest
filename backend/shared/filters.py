from shared.dataBase import connectToDw, connectToDw_AADpwd,queryDw,connectToDw_SqlServerPwd,exceptioninfo,insert_data
import pandas
import numpy
from shared.variables import globalVariables
from flask import jsonify
from shared.appinsightsLogger import error_response
from shared.logAnalytics import queryInLogAnalytics
import os
import json
# File s with Cached Data
modules_path = os.path.dirname(os.path.abspath(__file__))  # Current file's directory
cache_path = os.path.join(modules_path, "cache")  # Path to cache inside Modules
applicationListJsonPath = os.path.join(cache_path, "applicationList.json")

def getApplicationMetaData(dataPost, dataReturnType):
    
    try:
        connectToServicePerf = connectToDw_SqlServerPwd("spidedbsv6c6b60.wa.providence.org\\SPIDER", "ServicePerf_DW","servCRCAMonitor")
        try:
            query = f""" SELECT [number], [name], [apm_application_family_name], [support_group_name]
                , [Managed By Group], [application_category_name], [it_application_owner_name]
                FROM [ServicePerf_DW].[dbo].[vw_SN_cmdb_ci_business_app]
                WHERE [portfolio_name] = 'Clinical & Revenue Cycle Apps (CRCA)' and [active] = 'true' 
            """
            queryCond=0

            if("appFamily" in dataPost and dataPost["appFamily"][0]!="All"):
                appFam = ""
                for a in dataPost["appFamily"]:
                    appFam = appFam + "'" + a +"'" +","
                #query += f"""and [apm_application_family_name] in ({appFam[0:-1]}) """
                if(queryCond>0):
                    query += f"""or Lower([apm_application_family_name]) in ({appFam[0:-1].lower()}) """
                else:
                    query += f"""and (Lower([apm_application_family_name]) in ({appFam[0:-1].lower()}) """
                queryCond=1

            if("appCI" in dataPost and dataPost["appCI"][0]!="All"):
                appCi = ""
                for a in dataPost["appCI"]:
                    appCi = appCi + "'" + a.lower() +"'" +","
                #query += f"""or [name] in ({appCi[0:-1]}) """
                if(queryCond>0):
                    query += f"""or Lower([name]) in ({appCi[0:-1]}) """
                else:
                    query += f"""and (Lower([name]) in ({appCi[0:-1]}) """
                queryCond=1

            if("managedByGroup" in dataPost and dataPost["managedByGroup"][0]!="All"):
                managedByGroup = ""
                for a in dataPost["managedByGroup"]:
                    managedByGroup = managedByGroup + "'" + a.lower() +"'"+","
                #query += f"""and [Managed By Group] in ({managedByGroup[0:-1]}) """
                if(queryCond>0):
                    query += f"""or lower([Managed By Group]) in ({managedByGroup[0:-1]}) """
                else:
                    query += f"""and (lower([Managed By Group]) in ({managedByGroup[0:-1]}) """
                queryCond=1

            if("supportGroup" in dataPost and dataPost["supportGroup"][0]!="All"):
                supportGroup = ""
                for a in dataPost["supportGroup"]:
                    supportGroup = supportGroup + "'" + a.lower() +"'" +","
                #query += f"""and [support_group_name] in ({supportGroup[0:-1]}) """
                if(queryCond>0):
                    query += f"""or lower([support_group_name]) in ({supportGroup[0:-1]}) """
                else:
                    query += f"""and (lower([support_group_name]) in ({supportGroup[0:-1]}) """
                queryCond=1
            
            if(queryCond==1):
                query += f""")"""
            
            rows = queryDw(connectToServicePerf, query)
            if(len(rows)>0):
                
                df_filters = pandas.DataFrame(numpy.array(rows), columns=["APM Number", "Application CI", "Application Family","Support Group","Managed By Group","Application Category", "Application Owner"])
                
                if(dataReturnType=="dataFrame"):
                    return df_filters

        except Exception as Ex:
            print("Exception in filters query execution: ",Ex )
            print(Ex)
            info =exceptioninfo(Ex,query)
            insert_data(info)    
            return error_response(500, "Failed to fetch filter metadata", detail=info, exc=Ex)
    except Exception as Ex:
        print("Exception in connecting to database: ",Ex )
        info =exceptioninfo(Ex)
        insert_data(info)
        return error_response(500, "Failed to connect to database", detail=info, exc=Ex)

def getServerList(dataPost):
    filterData = dict()
    filterData["appFamily"] = []
    filterData["appCI"] = []
    filterData["managedByGroup"] = []
    filterData["supportGroup"] = []
    df = pandas.DataFrame()
    serverData = dict()
    try:
        connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")

        try:
            query = f""" Select sl.[Server Name], sl.[DNS Domain], sl.[Environment], al.[Application Family], al.[Application CI], al.[Application Category], sl.[Hosting Type], al.[Application Owner], al.[APM Number], al.[Support Group], al.[Managed By Group], sl.[Subscription ID], sl.[Resource Group] from [Server List] as sl
            inner join [Application List] as al on lower(al.[Application CI]) = lower(sl.[Application CI]) 
            where sl.[Last Updated] = (Select Max([Last Updated]) from [Server List])"""
            queryCond=[]

            if("appFamily" in dataPost and dataPost["appFamily"][0]!="All"):
                appFam = ""
                for a in dataPost["appFamily"]:
                    appFam = appFam + "'" + a +"'" +","
                
                queryCond.append(f"""Lower([Application Family]) in ({appFam[0:-1].lower()})""")
                
            if("appCI" in dataPost and dataPost["appCI"][0]!="All"):
                appCi = ""
                for a in dataPost["appCI"]:
                    appCi = appCi + "'" + a.lower() +"'" +","
                    
                queryCond.append(f"""Lower([Application CI]) in ({appCi[0:-1]})""")

            if("managedByGroup" in dataPost and dataPost["managedByGroup"][0]!="All"):
                managedByGroup = ""
                for a in dataPost["managedByGroup"]:
                    managedByGroup = managedByGroup + "'" + a.lower() +"'"+","
                #query += f"""and [Managed By Group] in ({managedByGroup[0:-1]}) """
                queryCond.append(f"""lower([Managed By Group]) in ({managedByGroup[0:-1]})""")

            if("supportGroup" in dataPost and dataPost["supportGroup"][0]!="All"):
                supportGroup = ""
                for a in dataPost["supportGroup"]:
                    supportGroup = supportGroup + "'" + a.lower() +"'" +","
                #query += f"""and [support_group_name] in ({supportGroup[0:-1]}) """
                queryCond.append(f"""lower([Support Group]) in ({supportGroup[0:-1]})""")
            
            if(len(queryCond)):
                query += f" and ({" or".join(queryCond)})"
                
            # print("Queryyyyyyyyyyyyyyyyyyyyyyyyy")
            print(query)
            rows = queryDw(connectToCrcaMonitoring, query)
            if(len(rows)):
                df = pandas.DataFrame(numpy.array(rows), columns=["ServerName", "DnsDomain","Environment","AppFamily","AppCI","AppCategory","ServerHostingType","AppOwnerName","APMNumber","SupportGroup","ManagedByGroup", "SubscriptionID", "ResourceGroup"])
            
        except Exception as Ex:
            print("Exception in filters query execution: ",Ex )
            print(Ex)
            info = exceptioninfo(Ex,query)
            insert_data(info)    
            # return jsonify({'error':str(Ex)}),500
    except Exception as Ex:
        print("Exception in connecting to database: ",Ex )
        info =exceptioninfo(Ex)
        insert_data(info)
        # return jsonify({'error':str(Ex)}),500
    serverData["Server"] = df
    return serverData

def filtersData(dataPost, dataReturnType):
    
    filterData = dict()
    filterData["appFamily"] = []
    filterData["appCI"] = []
    filterData["managedByGroup"] = []
    filterData["supportGroup"] = []
    try:
        # connectToServicePerf = connectToDw_SqlServerPwd("spidedbsv6c6b60.wa.providence.org\\SPIDER", "ServicePerf_DW","servCRCAMonitor")
        connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")

        try:
        
            query = f""" Select [APM Number], [Application CI], [Application Family], [Support Group], [Managed By Group] from [Application List]
            where [Last Updated] = (Select Max([Last Updated]) from [Application List]) """
            queryCond=[]

            if("appFamily" in dataPost and dataPost["appFamily"][0]!="All"):
                appFam = ""
                for a in dataPost["appFamily"]:
                    appFam = appFam + "'" + a +"'" +","
                
                queryCond.append(f"""Lower([Application Family]) in ({appFam[0:-1].lower()})""")
                
            if("appCI" in dataPost and dataPost["appCI"][0]!="All"):
                appCi = ""
                for a in dataPost["appCI"]:
                    appCi = appCi + "'" + a.lower() +"'" +","
                    
                queryCond.append(f"""Lower([Application CI]) in ({appCi[0:-1]})""")

            if("managedByGroup" in dataPost and dataPost["managedByGroup"][0]!="All"):
                managedByGroup = ""
                for a in dataPost["managedByGroup"]:
                    managedByGroup = managedByGroup + "'" + a.lower() +"'"+","
                #query += f"""and [Managed By Group] in ({managedByGroup[0:-1]}) """
                queryCond.append(f"""lower([Managed By Group]) in ({managedByGroup[0:-1]})""")

            if("supportGroup" in dataPost and dataPost["supportGroup"][0]!="All"):
                supportGroup = ""
                for a in dataPost["supportGroup"]:
                    supportGroup = supportGroup + "'" + a.lower() +"'" +","
                #query += f"""and [support_group_name] in ({supportGroup[0:-1]}) """
                queryCond.append(f"""lower([Support Group]) in ({supportGroup[0:-1]})""")
            
            if(len(queryCond)):
                query = query + "and "+ f" ({" or".join(queryCond)})"
                # query += f"({" or".join(queryCond)})"
                
            print("Queryyyyyyyyyyyyyyyyyyyyyyyyy")
            print(query)
            rows = queryDw(connectToCrcaMonitoring, query)
            if(len(rows)>0):
                
                df_filters = pandas.DataFrame(numpy.array(rows), columns=["ApmNumber", "AppCI", "AppFamily","SupportGroup","ManagedByGroup"])
                filterData["appFamily"] = df_filters["AppFamily"].drop_duplicates().to_list()
                filterData["appCI"] = df_filters["AppCI"].drop_duplicates().to_list()
                filterData["managedByGroup"] = df_filters["ManagedByGroup"].drop_duplicates().to_list()
                filterData["supportGroup"] = df_filters["SupportGroup"].drop_duplicates().to_list()
                
                apmNumbers = ""
                appCI = ""
                appFamily = ""
                
                for row in rows:
                    
                    # print(row)
                    if(row[0]!=None):
                        apmNumbers = apmNumbers + "'" + row[0]+"' ,"
                    if(row[1]!=None):
                        appCI = appCI +"'" +row[1].lower()+"' ,"
                    if(row[2]!=None):
                        appFamily = appFamily +"'" +row[2].lower()+"' ,"
                
                if(dataReturnType=="filter"):
                    return filterData
                elif(dataReturnType=="apmNumber"):
                    #print("apmNumbers")
                    return apmNumbers[0:len(apmNumbers)-1]
                elif(dataReturnType=="appCI"):
                    
                    return appCI[0:len(appCI)-1]
                    #print("apmNumbers")
                elif(dataReturnType=="appFamily"):
                    #print("apmNumbers")
                    return appFamily[0:len(appFamily)-1]
                elif(dataReturnType=="dataFrame"):
                    return df_filters

        except Exception as Ex:
            print("Exception in filters query execution: ",Ex )
            print(Ex)
            info =exceptioninfo(Ex,query)
            insert_data(info)    
            return error_response(500, "Failed to fetch server list", detail=info, exc=Ex)
    except Exception as Ex:
        print("Exception in connecting to database: ",Ex )
        info =exceptioninfo(Ex)
        insert_data(info)
        return error_response(500, "Failed to connect to database", detail=info, exc=Ex)

def filtersData_SubRg():
    workspaceId = "552b9630-b106-4fe7-a1fa-97d04a0010ef"

    logAnalyticsQuery = f"""Perf
            | where TimeGenerated > ago(1d) and ObjectName == "Processor"
            and CounterName == "% Processor Time"
            and InstanceName =~ "_Total"
            and _SubscriptionId in ("ab16a144-47d7-45c5-bcb7-8affc988f8e0", "9592c342-d1fb-477e-8e91-ad39bf00933b", "5467bf57-48b4-4930-b3cb-bf039b259d04", "343a7ee0-5081-4024-82fc-498ee61867a9", "6d590d81-bab9-4b9a-b011-090467b5a9a4", "accde124-a45f-47be-aefa-b09362b2c5fc")
            | extend resourceIdSpilt=split(_ResourceId, '/')
            | extend
            SubscriptionId=tostring(resourceIdSpilt[2]),
            ResourceGroup=tostring(resourceIdSpilt[4]),
            serverName=tolower(tostring(resourceIdSpilt[8]))
            | extend subRg = strcat(SubscriptionId, "/", ResourceGroup)
            | distinct subRg, serverName
            """

    #print(logAnalyticsQuery2)
    try:
        subRg_serverName = queryInLogAnalytics(workspaceId, logAnalyticsQuery,"","")
        return subRg_serverName.to_json()
    except Exception as Ex:
        print("Exception in executing query in filters_subrg: ",Ex )
        info =exceptioninfo(Ex,logAnalyticsQuery)
        insert_data(info)
        return error_response(500, "Failed to fetch subscription/resource-group filters", detail=info, exc=Ex)
    
def getFiltersFromCache(dataPost, type):
    print(applicationListJsonPath)
    if os.path.exists(applicationListJsonPath):
        print("File Exist")
        #print("The datapost in cache is", dataPost)
        #print("The type is ", type)
        #print("The os path exists")
        with open(applicationListJsonPath, "r") as json_file: 
            
            app_df = json_file.read()
            app_df = json.loads(app_df)
            print(app_df["data"][0])
            # print(type(alerts_df["Data"]))
            app_df = pandas.DataFrame(app_df["data"])
            print(app_df.head())
            if("appFamily" in dataPost and dataPost["appFamily"][0]!="All"):
                app_df["AppFamily_Copy"] = app_df["AppFamily"].str.lower()
                app_df = app_df[app_df["AppFamily_Copy"].isin([i.lower() for i in dataPost["appFamily"]])]
                app_df.drop(columns=["AppFamily_Copy"])
                
            if("appCI" in dataPost and dataPost["appCI"][0]!="All"):
                app_df["AppCI_Copy"] = app_df["AppCI"].str.lower()
                app_df = app_df[app_df["AppCI_Copy"].isin([i.lower() for i in dataPost["appCI"]])]
                app_df.drop(columns=["AppCI_Copy"])

            if("managedByGroup" in dataPost and "managedByGroup" in dataPost and dataPost["managedByGroup"][0]!="All"):
                app_df["ManagedGroup_Copy"] = app_df["ManagedByGroup"].str.lower()
                app_df = app_df[app_df["ManagedGroup_Copy"].isin([i.lower() for i in dataPost["managedByGroup"]])]
                app_df.drop(columns=["ManagedGroup_Copy"])

            if("supportGroup" in dataPost and dataPost["supportGroup"][0]!="All"):
                app_df["SupportGroup_Copy"] = app_df["SupportGroup"].str.lower()
                app_df = app_df[app_df["SupportGroup_Copy"].isin([i.lower() for i in dataPost["supportGroup"]])]
                app_df.drop(columns=["SupportGroup_Copy"])
            print("before type is apm number")
            
            if(type=="apmNumber"):
                #print("apmNumbers")
                l = app_df["ApmNumber"].unique()
                s=""
                for i in l:
                    s=s+"'"+i+"',"
                s=s[0:-1]
                print(len(l),l[0])
                return s
            elif(type=="appCI"):
                
                l = app_df["AppCI"].unique()
                s=""
                for i in l:
                    s=s+"'"+i.lower()+"',"
                s=s[0:-1]
                print(len(l),l[0])
                print("came inside appci cache and task is over")
                return s
            elif(type=="appFamily"):
                #print("apmNumbers")
                l = app_df["AppFamily"].unique()
                s=""
                for i in l:
                    s=s+"'"+i.lower()+"',"
                s=s[0:-1]
                print(len(l),l[0])
                return s
            elif(type=="dataFrame"):
                return app_df
    else:
        print("File not Exist")
        print("The datapost is", dataPost)
        print(type)
        return filtersData(dataPost, type)