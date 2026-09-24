from flask import Flask
import pandas as pd
from shared.dataBase import connectToDw, updateDw, deleteDw, queryDw, connectToDw_AADpwd
from datetime import datetime, timedelta
import pytz
import json
requestDict = dict()
connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")

def insertRequestData(data):
    format_string = "%Y-%m-%d %H:%M:%S"
    currentTime = datetime.now()
    pst = pytz.timezone('America/Los_Angeles')
    currentTime = currentTime.astimezone(pst)
    currentTime = currentTime.strftime(format_string)
    currentTime = datetime.strptime(currentTime, format_string)
    data["TimeGenerated"] = currentTime
    query = f"""Insert into ServiceRequest ([TimeGenerated]
        ,[User Name]
        ,[Service Type]
        ,[Data]
        ,[Status]) Values(?,?,?,?,?)
      """
    tempDict_add = [(currentTime, data["User Name"], data["Service Type"], data["Data"], data["Status"])]
    insertStatus = updateDw(connectToCrcaMonitoring, query, tempDict_add)
    print(insertStatus)

def updateServicesData(updateType, data, userName): # Data is in the form of a dictionary with key being each column in sql table
    
    tempDict = []
    # If the operation is to Delete
    if(updateType=="delete"):
        for i in range(len(data["Server Name"])):
            tempStr = data["Server Name"][i].split("/")[0]+"-"+data["Service Name"][i]
            tempDict.append(tempStr.lower())
        deleteValues = tuple(tempDict) # Convert data to tuple for query compatability
        if len(deleteValues) == 1:
            deleteValues = f"('{deleteValues[0]}')"
        query = f""" Delete from CriticalWindowsServiceList where Trim(lower(ServerName)) +'-'+ Trim(lower(ServiceName)) in {deleteValues}"""
        print(query)
        deleteStatus = deleteDw(connectToCrcaMonitoring, query)
        requestDict["Data"] = query
        requestDict["Service Type"] = "Delete Application Services Metadata"
        requestDict["User Name"] = userName
        requestDict["Status"] = deleteStatus
        insertRequestData(requestDict)
        
    # If the operation is to Add
    elif(updateType=="add"):
        for i in data["Server Name"]:
            for j in data["Service Name"]:
                tempStr = i.split("/")[0]+"-"+j
                tempDict.append(tempStr.lower())
        
        # Find if already existing data is added again
        findValues = tuple(tempDict) # Convert data to tuple for query compatability
        if len(findValues) == 1:
            findValues = f"('{findValues[0]}')"
        
        findQuery = f""" Select Trim(ServerName), Trim(ServiceName) from CriticalWindowsServiceList where Trim(lower(ServerName)) +'-'+ Trim(lower(ServiceName)) in {findValues}"""
        
        findData = queryDw(connectToCrcaMonitoring, findQuery)
        existingData = []
        for row in findData:
            existingData.append(row[0]+"-"+row[1])
        
        # Add new Data to the table
        tempDict_add = []
        for i in data["Server Name"]:
            for j in data["Service Name"]:
                tempStr = i.split("/")[0]+"-"+j
                if(not(tempStr in existingData)):
                    tempDict_add.append((data["Application Family"], data["Application CI"],i.split("/")[0],j,i.split("/")[1]))
        
        if(len(tempDict_add)>0):
            insertQuery = f"""Insert into CriticalWindowsServiceList (
                [AppFamily]
                ,[AppCI]
                ,[ServerName]
                ,[ServiceName]
                ,[HostingType]
                ) values (?,?,?,?,?)"""
            print(insertQuery)
            print(tempDict_add)
            insertStatus = updateDw(connectToCrcaMonitoring, insertQuery, tempDict_add)
            requestDict["Data"] = insertQuery + "Data: " + str(tempDict_add)
            requestDict["Service Type"] = "Insert Application Services Metadata"
            requestDict["User Name"] = userName
            requestDict["Status"] = insertStatus
            # print(requestDict)
            insertRequestData(requestDict)
        else:
            print("Redundant Values")
        
def updateUrlData(updateType, data, userName):
    
    # print(updateType)
    tempDict = []
    for i in range(len(data["URL"])):
        tempStr = data["URL"][i]
        tempDict.append(tempStr.lower())
        
    if(updateType=="delete"):
        deleteValues = tuple(tempDict) # Convert data to tuple for query compatability
        if len(deleteValues) == 1:
            deleteValues = f"('{deleteValues[0]}')"
        query = f""" Delete from ServiceMon_InputData where Trim(lower(URL)) in {deleteValues}"""
        print(query)
        deleteStatus = deleteDw(connectToCrcaMonitoring, query)
        requestDict["Data"] = query
        requestDict["Service Type"] = "Delete Application URL Metadata"
        requestDict["User Name"] = userName
        requestDict["Status"] = deleteStatus
        insertRequestData(requestDict)
        
    elif(updateType=="add"):
        # Find if already existing data is added again
        findValues = tuple(tempDict) # Convert data to tuple for query compatability
        if len(findValues) == 1:
            findValues = f"('{findValues[0]}')"
            
        findQuery = f""" Select Trim(URL), Trim(AppCI) from ServiceMon_InputData where Trim(lower(URL)) in {findValues}"""
        
        findData = queryDw(connectToCrcaMonitoring, findQuery)
        existingData = []
        for row in findData:
            existingData.append(row[0]+"-"+row[1])
        
        tempDict_add = []
        for i in data["URL"]:
            if(not(i+data["Application CI"] in existingData)):
                tempDict_add.append((data["Application CI"],i,"URL",data["Environment"], data['Hosting Type']))
        
        if(len(tempDict_add)>0):
            # print(insertValues)
            query = f"""Insert into ServiceMon_InputData (
                [AppCI]
                ,[URL]
                ,[MonitorType]
                ,[Environment]
                ,[HostingType]
                ) values (?,?,?,?,?)"""
            print(query)
            insertStatus = updateDw(connectToCrcaMonitoring, query, tempDict_add)
            requestDict["Data"] = query + "Data: " + str(tempDict_add)
            requestDict["Service Type"] = "Delete Application URL Metadata"
            requestDict["User Name"] = userName
            requestDict["Status"] = insertStatus
            insertRequestData(requestDict)
            # print(tempDict_add)
        else:
            print("Redundant Entry")
            
def updateCustomRequirementData(updateType, data, userName):
    print(data)
    tempDict = []
    tempDict_add = []

    # for i in range(len(data["Application Family"])):
    tempStr = data["Application Family"]
    tempDict.append(tempStr.lower().strip())
        
    if(updateType=="add"):
        # Find if already existing data is added again
        findValues = tuple(tempDict) # Convert data to tuple for query compatability
        if len(findValues) == 1:
            findValues = f"('{findValues[0]}')"
            
        findQuery = f""" Select [App Family], [Custom Monitoring] from ApplicationOnboardingSummary where lower(trim([App Family])) in {findValues}"""
        findData = queryDw(connectToCrcaMonitoring, findQuery)
        print(findData)
        customMon = dict()
        for row in findData:
            if(not(row[1]==None)):
                customMon = json.loads(row[1])
                for i in range(len(data["Custom Requirement"])):
                    if(data["Custom Requirement"][i] in customMon):
                        data["Custom Requirement"].pop(i)
            
        # for i in data["Application Family"]:
        if(len(data["Custom Requirement"])>0):
            for j in data["Custom Requirement"]:
                customMon[j]="New"
            customMon=json.dumps(customMon)
            query = f"""Update ApplicationOnboardingSummary set [Custom Monitoring] = ? where [App Family] like ?"""
            print(query)
            print((customMon, tempStr))
            updateStatus = updateDw(connectToCrcaMonitoring, query, (customMon, tempStr))
            requestDict["Data"] = query
            requestDict["Service Type"] = "Insert Application Custom Requirement Metadata"
            requestDict["User Name"] = userName
            requestDict["Status"] = updateStatus
            print(requestDict)
            insertRequestData(requestDict)
        else:
            print("Redundant Entry")
        