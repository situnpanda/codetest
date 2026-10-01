import json
from shared.dataBase import queryDw, insertDw, deleteDw, updateDw, exceptioninfo

workspace_id = '552b9630-b106-4fe7-a1fa-97d04a0010ef'

def updateServicesData(connectionString, data, exceptionLogs):
    try:
        sqlQuery = f""" MERGE INTO [Windows Services Alert Configuration] AS target
                    USING (SELECT ? as ResourceName, ? as ServiceName, ? as HostingType,? as AlertEnabled, ? as AlertCommunication, ? as AlertFrequency) AS source
                    ON lower(target.[Resource Name]) = lower(source.ResourceName) and lower(target.[Service Name]) = lower(source.ServiceName)
                    WHEN MATCHED THEN 
                        UPDATE SET Communication = source.AlertCommunication, [Alert Frequency] = source.AlertFrequency
                    WHEN NOT MATCHED THEN
                        INSERT ([Resource Name], [Service Name], [Alert Frequency], [Communication], [Alert Enabled]) 
                        VALUES (source.ResourceName, source.ServiceName, source.AlertFrequency, source.AlertCommunication, source.AlertEnabled);"""
        print(sqlQuery)
        res = insertDw(connectionString, sqlQuery, data)
        print(res)
    except Exception as ex:
        exceptionLogs["Services Alert Configuration Creation/Update in DB"] = exceptioninfo(ex)
        print("Services", ex)

def updateVmAlertsData(connectionString, data, exceptionLogs):
    try:
        sqlQuery = f""" MERGE INTO [Server Alert Configuration] AS target
                        USING (SELECT ? as ResourceName, ? as AlertEnabled, ? as AlertCommunication, ? as Threshold, ? as AlertFrequency, ? as AlertType, ? as DataAggregation) AS source
                        ON lower(target.[Resource Name]) = lower(source.ResourceName) and lower(target.[Alert Type]) like lower(source.AlertType)
                        WHEN MATCHED THEN
                            UPDATE SET [Communication] = source.AlertCommunication, [Alert Frequency] = source.AlertFrequency, [Data Aggregation] = source.DataAggregation, [Custom Threshold] = source.[Threshold]
                        WHEN NOT MATCHED THEN
                            INSERT ([Resource Name],[Alert Enabled],[Alert Frequency], [Communication], [Custom Threshold], [Alert Type], [Data Aggregation]) 
                            VALUES (source.ResourceName, source.AlertEnabled, source.AlertFrequency, source.AlertCommunication, source.Threshold, source.AlertType, source.DataAggregation);
                    """
        # print(sqlQuery)
        res = insertDw(connectionString, sqlQuery, data)
        print(res)
    except Exception as ex:
        exceptionLogs["VM Alert Configuration Creation/Update in DB"] = exceptioninfo(ex)
        print("VM Alert Configuration Creation/Update", ex)
        
def updateVmMetricsData_database(connectionString, data, exceptionLogs):
    try:
        sqlQuery = f""" MERGE INTO [Database Alert Configuration] AS target
                    USING (SELECT ? as ResourceName, ? as AlertFrequency, ? as AlertCommunication, ? as AlertType, ? as CustomThreshold, ? as HostingType, ? as AlertEnabled, ? as DataAggregation) AS source
                    ON lower(target.[Resource Name]) = lower(source.ResourceName) and lower(target.[Alert Type]) = lower(source.AlertType)
                    WHEN MATCHED THEN
                        UPDATE SET [Custom Threshold] = source.CustomThreshold, Communication = source.AlertCommunication, [Alert Frequency] = source.AlertFrequency, [Data Aggregation] = source.DataAggregation
                    WHEN NOT MATCHED THEN
                        INSERT ([Resource Name],[Alert Frequency],[Communication],[Alert Type], [Custom Threshold], [Alert Enabled], [Data Aggregation]) 
                        VALUES (source.ResourceName, source.AlertFrequency, source.AlertCommunication, source.AlertType, source.CustomThreshold, source.AlertEnabled, source.DataAggregation);"""
        # print(sqlQuery)
        res = insertDw(connectionString, sqlQuery, data)
        print(res)
    except Exception as ex:
        exceptionLogs["Database Alert Configuration Creation/Update in DB"] = exceptioninfo(ex)
        print("DB", ex)
        
def updateFileStorageMetricsData_database(connectionString, data, exceptionLogs):
    try:
        sqlQuery = f""" MERGE INTO [File Storage Alert Configuration] AS target
                    USING (SELECT ? as ResourceName, ? as AlertFrequency, ? as AlertCommunication, ? as AlertType, ? as CustomThreshold, ? as HostingType, ? as AlertEnabled, ? as DataAggregation) AS source
                    ON lower(target.[Resource Name]) = lower(source.ResourceName) and lower(target.[Alert Type]) = lower(source.AlertType)
                    WHEN MATCHED THEN
                        UPDATE SET [Custom Threshold] = source.CustomThreshold, Communication = source.AlertCommunication, [Alert Frequency] = source.AlertFrequency, [Data Aggregation] = source.DataAggregation
                    WHEN NOT MATCHED THEN
                        INSERT ([Resource Name],[Alert Frequency],[Communication],[Alert Type], [Custom Threshold], [Alert Enabled], [Data Aggregation]) 
                        VALUES (source.ResourceName, source.AlertFrequency, source.AlertCommunication, source.AlertType, source.CustomThreshold, source.AlertEnabled, source.DataAggregation);"""
        # print(sqlQuery)
        res = insertDw(connectionString, sqlQuery, data)
        print(res)
    except Exception as ex:
        exceptionLogs["File Storage Alert Configuration Creation/Update in DB"] = exceptioninfo(ex)
        print("File Storage", ex)
    
def deleteVmMetricsData(connectionString, data, type, appFamily, exceptionLogs):
    conditionValue = f"('{data[0]}')" if(len(data)==1) else (f"{str(data)}" if(len(data))>1 else "")
    try:
        if(type=="VM Alerts"):
            sqlQuery = f""" Delete from [Server Alert Configuration] where
            lower([Resource Name]) in (Select lower([Resource Name]) from [Server List] as sl
            inner join [Application List] as al on al.[Application CI] like sl.[Application CI] where lower(al.[Application Family]) like '{appFamily.lower()}') 
            {f"and lower([Resource Name] +'/'+ [Alert Type]) not in {conditionValue}" if(len(list(data))!=0) else ""}
            """
        elif(type=="Database"):
            sqlQuery = f""" Delete from [Database Alert Configuration] where 
            lower([Resource Name]) in (Select lower([Resource Name]) from [Database List] as dl
            inner join [Application List] as al on al.[Application CI] like dl.[Application CI] where lower(al.[Application Family]) like '{appFamily.lower()}') 
            {f"and lower([Resource Name] +'/'+ [Alert Type]) not in {conditionValue}" if(len(list(data))!=0) else ""}"""
        elif(type=="Services"):
            sqlQuery = f""" Delete from [Windows Services Alert Configuration] where 
            lower([Resource Name]) in (Select lower([Resource Name]) from [Server List] as sl
            inner join [Application List] as al on al.[Application CI] like sl.[Application CI] where lower(al.[Application Family]) like '{appFamily.lower()}') 
            {f"and lower([Resource Name] +'/'+ [Service Name]) not in {conditionValue}" if(len(list(data))!=0) else ""}
            """
        elif(type=="File Storage"):
            sqlQuery = f""" Delete from [File Storage Alert Configuration] where 
            lower([Resource Name]) in (Select lower([Resource Name]) from [File Storage List] as fsl
            inner join [Application List] as al on al.[Application CI] like fsl.[Application CI] where lower(al.[Application Family]) like '{appFamily.lower()}') 
            {f"and lower([Resource Name] +'/'+ [Alert Type]) not in {conditionValue}" if(len(list(data))!=0) else ""}
            """
        print(sqlQuery)
        res = deleteDw(connectionString, sqlQuery, [()])
        # print(res)
    except Exception as ex:
        info = exceptioninfo(ex)
        exceptionLogs[type+ " Alert Delete from DB"] = info
    
def updateServices_main(connectionString, connectionStringWrite, appFamily, data, allResourceName, exceptionLogs):
    if(len(data["Services"])):
        arr = []
        alertResource = []
        for content in data["Services"]:
            if(len(content.keys())>0):
                hostingType = content["Hosting Type"]
                alertEnabled = 1
                alertFrequency = int(content["Alert Frequency"])
                alertCommunication = json.dumps(content["Communication"])
                for res in content["Resources"]:
                    resourceName = res["ResourceName"].split("/")
                    if(len(resourceName)==4):
                        resourceName = "SubscriptionID/"+resourceName[0]+"/ResourceGroup/"+resourceName[1]+"/ServerName/"+resourceName[2]+"/ApplicationCI/"+resourceName[3]
                    else:
                        resourceName = "ServerName/"+resourceName[0]+"/ApplicationCI/"+resourceName[3]
                    
                    serviceName = res["ServiceName"].lower()
                    arr.append((resourceName, serviceName, hostingType, alertEnabled, alertCommunication, alertFrequency))
                    alertResource.append(resourceName.lower()+"/"+ serviceName.lower())
        
        if(len(arr)>0):
            print()
            updateServicesData(connectionStringWrite, arr, exceptionLogs)
            
        deleteVmMetricsData(connectionStringWrite, tuple(alertResource), "Services",appFamily, exceptionLogs)

def updateVmAlerts_main(connectionString, connectionStringWrite, appFamily, data, allResourceName, exceptionLogs):
    
    if(len(data["Server"])>0):
        arr = []
        alertResource = []
        for content in data["Server"]:
            if(len(content.keys())>0):
                hostingType = content["Hosting Type"]
                
                alertFrequency = int(content["Alert Frequency"])
                alertCommunication = json.dumps(content["Communication"])
                dataAggregation = int(content["Data Aggregation"])
                
                cpuThreshold = int(content["CPU Custom Threshold"]) if ("CPU Custom Threshold" in content and content["CPU Custom Threshold"]!=None and content["CPU Custom Threshold"]!="") else ""
                memThreshold = int(content["Memory Custom Threshold"]) if ("Memory Custom Threshold" in content and content["Memory Custom Threshold"]!=None and content["Memory Custom Threshold"]!="") else ""
                diskThreshold = int(content["Disk Custom Threshold"]) if ("Disk Custom Threshold" in content and content["Disk Custom Threshold"]!=None and content["Disk Custom Threshold"]!="") else ""
                vmHeartBeat = 1 if("VM Heartbeat Custom Threshold" in content and content["VM Heartbeat Custom Threshold"]!=None and int(content["VM Heartbeat Custom Threshold"])==1) else 0
                
                for res in content["Resources"]:
                    resourceName = res["ResourceName"].split("/")
                    appCI = res["ApplicationCI"]
                
                    if(len(resourceName)==3):
                        resourceName = "SubscriptionID/"+resourceName[0]+"/ResourceGroup/"+resourceName[1]+"/ServerName/"+resourceName[2]+"/ApplicationCI/"+appCI
                    else:
                        resourceName = "ServerName/"+resourceName[0]+"/ApplicationCI/"+appCI
                    if(vmHeartBeat==1):
                        arr.append((resourceName, 1, alertCommunication, 1, alertFrequency, "VM Heartbeat", dataAggregation))
                        alertResource.append(resourceName.lower()+"/"+"vm heartbeat")
                    if(cpuThreshold!=""):
                        arr.append((resourceName, 1, alertCommunication, cpuThreshold, alertFrequency, "CPU", dataAggregation))
                        alertResource.append(resourceName.lower()+"/"+"cpu")
                    if(memThreshold!=""):
                        arr.append((resourceName, 1, alertCommunication, memThreshold, alertFrequency, "Memory", dataAggregation))
                        alertResource.append(resourceName.lower()+"/"+"memory")
                    if(diskThreshold!=""):
                        for drive in content["Disk Drives"]:
                            arr.append((resourceName, 1, alertCommunication, diskThreshold, alertFrequency, "Disk "+drive, dataAggregation))
                            # alertResource.append(tuple([resourceName.lower(),(f"Disk {drive}").lower()]))
                            alertResource.append(resourceName.lower()+"/"+f"Disk {drive}".lower())
                            
        if(len(arr)>0):
            print("Server Update")
            print(arr)
            updateVmAlertsData(connectionStringWrite, arr, exceptionLogs)
        deleteVmMetricsData(connectionStringWrite, tuple(alertResource), "VM Alerts",appFamily, exceptionLogs)

def updateVmDb_main(connectionString, connectionStringWrite, appFamily, data, allResourceName, exceptionLogs):
    
    if(len(data["Database"])>0):
        arr = []
        alertResource = []
        for content in data["Database"]:
            print("Database In")
            if(len(content.keys())>0):
                hostingType = content["Hosting Type"]
                alertEnabled = 1
                alertFrequency = int(content["Alert Frequency"])
                alertCommunication = json.dumps(content["Communication"])
                dataAggregation = int(content["Data Aggregation"])
                customThreshold = {}
                for key in content:
                    if("Custom Threshold" in key and (content[key]!=None and content[key]!="" and content[key]!=0)):
                        print(content[key])
                        customThreshold[key.split(" Custom Threshold")[0]] = int(content[key])
                
                for res in content["Resources"]:
                    resourceName = res["ResourceName"].split("/")
                    appCI = res["ApplicationCI"]
                
                    if(len(resourceName)>2):
                        resourceName = "SubscriptionID/"+resourceName[0]+"/ResourceGroup/"+resourceName[1]+"/SqlServerName/"+resourceName[2]+"/DatabaseName/"+resourceName[3]+"/ApplicationCI/"+appCI
                    else:
                        resourceName = "SqlServerName/"+resourceName[0]+"/DatabaseName/"+resourceName[1]+"/ApplicationCI/"+appCI
                    
                    for customKey in customThreshold:
                        alertResource.append(resourceName.lower()+"/"+ customKey.lower())
                        arr.append((resourceName, alertFrequency, alertCommunication, customKey, customThreshold[customKey], hostingType, alertEnabled, dataAggregation))
                        
        if(len(arr)>0):
            updateVmMetricsData_database(connectionStringWrite, arr, exceptionLogs)
        deleteVmMetricsData(connectionStringWrite, tuple(alertResource), "Database",appFamily, exceptionLogs)

def updateFilestorageDb_main(connectionString, connectionStringWrite, appFamily, data, allResourceName, exceptionLogs):
    
    if(len(data["File Storage"])>0):
        arr = []
        alertResource = []
        for content in data["File Storage"]:
            if(len(content.keys())>0):
                hostingType = content["Hosting Type"]
                alertEnabled = 1
                alertFrequency = int(content["Alert Frequency"])
                alertCommunication = json.dumps(content["Communication"])
                dataAggregation = int(content["Data Aggregation"])
                customThreshold = {}
                for key in content:
                    if("Custom Threshold" in key and (content[key]!=None and content[key]!="" and content[key]!=0)):
                        print(content[key])
                        customThreshold[key.split(" Custom Threshold")[0]] = int(content[key])
                
                for res in content["Resources"]:
                    resourceName = res["ResourceName"].split("/")
                    appCI = res["ApplicationCI"]
                
                    if(len(resourceName)>2):
                        resourceName = "SubscriptionID/"+resourceName[0]+"/ResourceGroup/"+resourceName[1]+"/StorageName/"+resourceName[2]+"/FileshareName/"+resourceName[3]+"/ApplicationCI/"+appCI
                    else:
                        resourceName = "StorageName/"+resourceName[0]+"/FileshareName/"+resourceName[1]+"/ApplicationCI/"+appCI
                    
                    for customKey in customThreshold:
                        alertResource.append(resourceName.lower()+"/"+ customKey.lower())
                        arr.append((resourceName, alertFrequency, alertCommunication, customKey, customThreshold[customKey], hostingType, alertEnabled, dataAggregation))
        print("Storage")
        print(arr)
        if(len(arr)>0):
            updateFileStorageMetricsData_database(connectionStringWrite, arr, exceptionLogs)
        deleteVmMetricsData(connectionStringWrite, tuple(alertResource), "File Storage",appFamily, exceptionLogs)

def updateMaintenanceTag(connectionString, data, type):
    try:
        if(type.lower()=="cpu"):
            sqlQuery = f""" Update [Server CPU Alert Configuration] set AlertEnabled = 'No' where lower([Subscription ID]+'/'+ [Resource Group] +'/'+ [ServerName]) in {data}"""
        elif(type.lower()=="memory"):
            sqlQuery = f""" Update [Server Memory Alert Configuration] set AlertEnabled = 'No' where lower([Subscription ID]+'/'+ [Resource Group] +'/' + [ServerName]) in {data}"""
        elif(type.lower()=="disk"):
            sqlQuery = f""" Update [Server Disk Alert Configuration] set AlertEnabled = 'No' where lower([Subscription ID]+'/'+ [Resource Group] +'/'+ [ServerName]) in {data}"""
        elif(type.lower()=="vm hearbeat"):
            sqlQuery = f""" Update [Server Heartbeat Alert Configuration] set AlertEnabled = 'No' where lower([Subscription ID]+'/'+ [Resource Group] +'/'+ [Server Name]) in {data}"""
        
        print(sqlQuery)
        # res = updateDw(connectionString, sqlQuery, [()])
        # return res
    except Exception as ex:
        print("Maintenance Update", ex)
    