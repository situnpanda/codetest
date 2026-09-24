import os
import json

import pandas
from datetime import datetime
from flask import Blueprint, request, jsonify

from shared.dataBase import connectToDw_AADpwd, connectToDw_SqlServerPwd, queryDw
from shared.filters import filtersData, getFiltersFromCache
from shared.variables import globalVariables
from shared.cache_paths import alertInfraListJsonPath
from domains.metrics.infrastructure.infrastructureTelemetry import (
    databaseMetricData,
    serverStatus,
    PatchComplianceData,
    ValidationData,
    BackupData,
    server_environment_overview_df,
    windows_events_df,
    serverProcessMetrics_df,
    appReliability,
    appExceptions,
    server_reboot_df,
    workstation_Metrics_df,
    azureServerMetrics_CPU_df,
    azureServerMetrics_Memory_df,
    azureServerMetrics_Fileshare_df,
    azureServerMetrics_Disk_df,
)

infrastructure_bp = Blueprint("infrastructure", __name__)


@infrastructure_bp.route("/api/databaseMetrics", methods=["POST"])
def databaseMetrics():
    dataPost = request.get_json()
    filters = dataPost.get('filters')
    aggregate = dataPost.get('aggregate')
    start_time = dataPost.get('start_time')
    end_time = dataPost.get('end_time')
    
    appCI = getFiltersFromCache(filters, "appCI")
    print(filters)
    print(appCI)
    print(start_time)
    print(end_time)
    try:
        dbMetric_df = databaseMetricData(aggregate, start_time, end_time, appCI)
        print(dbMetric_df)
        logsData = {"DBMetrics": dbMetric_df.to_json()}
        
        # print("Response Data:", logsData)
        return jsonify(logsData) , 200
    except Exception as ex:
        print("in Exception DB")
        print(ex)
        return {}, 501

@infrastructure_bp.route('/api/serverStatus', methods = ["POST"])
def appServerStatus():
    dataPost = request.get_json()
    filter = dataPost.get('filters')
    serverName = dataPost.get('serverName')
    startTime = dataPost.get('startTime', "")
    endTime = dataPost.get('endTime', "")
    aggregate = dataPost.get('aggregate','yes')
    # print(serverName + "1")
    if(serverName!=""):
        if(not("'" in serverName)):
            s=""
            for i in serverName.split(","):
                s = s + "'" + i + "',"
            s = s[:-1]
            serverName = s
        
    logsData = dict()
    appCI = filtersData(filter, "appCI")
    print(appCI)
    # appCI = getFiltersFromCache(filter, "appCI")
    # print(apmNumbers)
    connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    # connectToServicePerf = connectToDw_SqlServerPwd("spidedbsv6c6b60.wa.providence.org\\SPIDER", "ServicePerf_DW","servCRCAMonitor")
    server_df = serverStatus(connectToCrcaMonitoring, appCI, serverName.lower(),aggregate, startTime, endTime)
    
    logsData["ServerStatus"] = server_df.to_json()
    print(datetime.now())
    return jsonify(logsData)

@infrastructure_bp.route('/api/PatchCompliance', methods=["POST"])
def azurePatchCompliance():
    dataPost = request.get_json()

    serverName=""
    apmNumbers = ""
    if('serverName' in dataPost):
        serverName = dataPost.get('serverName')
        if(not("'" in serverName)):
            s= ""
            for i in serverName.split(','):
                s+="'"+i+"',"
            s=s[0:-1]
            # print(s)
            serverName = s
    elif('filters' in dataPost):
        filters = dataPost["filters"]
        sqlQuery = f"""
                        SELECT distinct LOWER(cmdbci.[name]) AS ServerName FROM   
                        [ServicePerf_DW].[dbo].[vw_sn_cmdb_ci_server] AS cmdbci
                        INNER JOIN  
                        vw_SN_Appl_Relationship AS AppRelation ON AppRelation.RelationshipID = cmdbci.sys_id
                        INNER JOIN  
                        vw_SN_cmdb_ci_business_app AS BusinessApp ON BusinessApp.sys_id = AppRelation.ApplicationID
                        WHERE       
                        (BusinessApp.portfolio_name = 'Clinical & Revenue Cycle Apps (CRCA)'
                        OR BusinessApp.[apm_application_family_name] LIKE 'Cromwell')
                        AND BusinessApp.active = 'true'
                        AND AppRelation.Relationship = 'Runs on'
                        AND cmdbci.operational_status_label in ('Operational', 'Repair in Progress', 'VM Terminated', 'Sleep Test in Progress')
                        AND BusinessApp.[name] IN ('{filters["appCI"]}')
                    """
        
        #connect to DB
        connectToServicePerf = connectToDw_SqlServerPwd("spidedbsv6c6b60.wa.providence.org\\SPIDER", "ServicePerf_DW","servCRCAMonitor")
        
        #query
        result = queryDw(connectToServicePerf, sqlQuery)
        s=""
        for i in result:
            s+="'"+i[0]+"',"
        serverName=s[0:-1]
        
    logsData = dict()

    patch_df = PatchComplianceData(serverName.lower(), apmNumbers)

    if patch_df is None:
        logsData["PatchCompliance"] = []  # Returning an empty list if no data is found
    else:
        logsData["PatchCompliance"] = patch_df.to_json()

    return jsonify(logsData)

@infrastructure_bp.route('/api/appValidation', methods=["POST"])
def appValidation():
    dataPost = request.get_json()
    appCI =dataPost.get('appCI',"").strip("'")
    aggregate =dataPost.get('aggregate',"no")
    logsData = {}
    df = ValidationData(aggregate,appCI)
    logsData = {"appValidation": df.to_json()}
    return jsonify(logsData)

@infrastructure_bp.route('/api/ServerBackup', methods=["POST"])
def azureServerBackup():
    dataPost = request.get_json()

    serverName=""
    if('serverName' in dataPost):
        serverName = dataPost.get('serverName')
        if(not("'" in serverName)):
            s= ""
            for i in serverName.split(','):
                s+="'"+i+"',"
            s=s[0:-1]
            # print(s)
            serverName = s

    logsData = dict()
    
    backup_df = BackupData(serverName.lower())

    if backup_df is None:
        logsData["ServerBackup"] = []  # Returning an empty list if no data is found
    else:
        logsData["ServerBackup"] = backup_df.to_json()

    return jsonify(logsData)

@infrastructure_bp.route('/api/serverEnvironmentLogs', methods=["POST"])
def serverEnvironmentLogs():

    dataPost = request.get_json()
    page = dataPost.get('page')  # Retrieve the value of the 'page' parameter
    limit = dataPost.get('limit')    # Retrieve the value of the 'limit' parameter
    aggregateBool = dataPost.get('aggregate')    # Retrieve the value of the 'limit' parameter
    filter = dataPost.get('filters')

    
    apmNumbers = getFiltersFromCache(filter, "apmNumber")
    logsData = dict()

    connectToServicePerf = connectToDw_SqlServerPwd("spidedbsv6c6b60.wa.providence.org\\SPIDER", "ServicePerf_DW","servCRCAMonitor")
    server_environment_df = server_environment_overview_df(connectToServicePerf,apmNumbers, "", "")
    server_environment_df["Count"] = len(server_environment_df["Server"])

    globalVariables.server_environment_data = server_environment_df
    if(aggregateBool=="yes"):
        selected_keys=["Production","Development","Test"]
        serverAggergateValue = {key: globalVariables.server_environment_data[key] for key in selected_keys if key in globalVariables.server_environment_data}
        return jsonify(serverAggergateValue)
    
    df = server_environment_df["Server"]

    if(page==None):
        page = -1
    if(int(page)==-1):
        start = 0
        end = -1
    else:
        start = (int(page)-1)*int(limit)
        end = start + int(limit)
        if(end>len(df["Server"])):
            end = -1
        
    logsData["environmentLogs"] = df.iloc[start:end].to_json()
    return jsonify(logsData)

@infrastructure_bp.route('/api/windowEventLogs', methods=["POST"])
def windowEventLog():

    dataPost = request.get_json()

    aggregateBool = dataPost.get('aggregate')    # Retrieve the value of the 'limit' parameter
    filter = dataPost.get('filters')
    start_time = dataPost.get('start_time')  # Retrieve the value of the 'start_time' parameter
    end_time = dataPost.get('end_time')  # Retrieve the value of the 'end_time' parameter
    serverName = ""
    apmNumbers = ""
    logsData = dict()
    if('serverName' in dataPost):
        serverName = dataPost.get('serverName')
        if(not("'" in serverName)):
            s= ""
            for i in serverName.split(','):
                s+="'"+i+"',"
            s=s[0:-1]
            print(s)
            serverName = s
    else:
        # apmNumbers = filtersData(filter, "apmNumber")
        apmNumbers = getFiltersFromCache(filter, "apmNumber")
    # print(serverName)
    # print(apmNumbers)
    connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    windowEvent_df = windows_events_df(connectToCrcaMonitoring, apmNumbers,serverName,aggregateBool, start_time, end_time)

    df = windowEvent_df["Server"]
    logsData["windowsEventLogs"] = df
    return jsonify(logsData)

@infrastructure_bp.route('/api/serverProcessMetrics', methods=["POST"])
def serverProcessMetricsLog():
    dataPost = request.get_json()
    serverName = dataPost.get('serverName', "")
    start_time = dataPost.get('start_time', "")
    end_time = dataPost.get('end_time', "")
    logsData = dict()

    # Normalise serverName into a quoted, comma-separated list e.g. 'srv1','srv2'
    if(serverName != "" and not("'" in serverName)):
        s = ""
        for i in serverName.split(','):
            s += "'" + i.strip() + "',"
        serverName = s[0:-1]

    processMetricsJson = serverProcessMetrics_df(serverName.lower(), start_time, end_time)
    logsData["ServerProcessMetrics"] = processMetricsJson
    return jsonify(logsData)

@infrastructure_bp.route('/api/applicationReliability', methods=["POST"])
def applicationReliabilityLog():
    dataPost = request.get_json()

    filter = dataPost.get('filters')      
    start_time = dataPost.get('start_time')   
    end_time = dataPost.get('end_time') 
    # apmNumbers = filtersData(filter, "apmNumber")
    apmNumbers = getFiltersFromCache(filter, "apmNumber")  
      
    aggregateBool = dataPost.get('aggregate')  
    #print(aggregateBool)
    connectToServicePerf = connectToDw_SqlServerPwd("spidedbsv6c6b60.wa.providence.org\\SPIDER", "ServicePerf_DW","servCRCAMonitor")
    insights_df = appReliability(connectToServicePerf, apmNumbers,aggregateBool, start_time, end_time)

    return jsonify(insights_df)

@infrastructure_bp.route('/api/applicationexceptions', methods=["POST"])
def applicationexceptionLog():
    dataPost = request.get_json()

    filter = dataPost.get('filters')      
    start_time = dataPost.get('start_time')   
    end_time = dataPost.get('end_time') 
    aggregateBool = dataPost.get('aggregate')  
    #print(aggregateBool)

    # apmNumbers = filtersData(filter, "apmNumber")
    apmNumbers = getFiltersFromCache(filter, "apmNumber")  
         
    connectToServicePerf = connectToDw_SqlServerPwd("spidedbsv6c6b60.wa.providence.org\\SPIDER", "ServicePerf_DW","servCRCAMonitor")
    insights_df = appExceptions(connectToServicePerf, apmNumbers, aggregateBool, start_time, end_time)
    
    return jsonify(insights_df)



@infrastructure_bp.route('/api/VMRebootLogs', methods=["POST"])
def VMRebootLog():

    dataPost = request.get_json()
    
    aggregateBool = dataPost.get('aggregate')    # Retrieve the value of the 'limit' parameter
    filter = dataPost.get('filters')
    start_time = dataPost.get('start_time')  # Retrieve the value of the 'start_time' parameter
    end_time = dataPost.get('end_time')  # Retrieve the value of the 'end_time' parameter
    apmNumbers=""
    serverName=""
    logsData = dict()

    if('serverName' in dataPost):
        serverName = dataPost.get('serverName')
        if(not("'" in serverName)):
            s= ""
            for i in serverName.split(','):
                s+="'"+i+"',"
            s=s[0:-1]
            print(s)
            serverName = s
    else:
        # apmNumbers = filtersData(filter, "apmNumber")
        apmNumbers = getFiltersFromCache(filter, "apmNumber")  
        
        
    connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    vm_df = server_reboot_df(connectToCrcaMonitoring, apmNumbers, serverName, aggregateBool, start_time, end_time)

    df = vm_df["Server"]

    logsData["vmRebootEvents"] = df

    return jsonify(logsData)

@infrastructure_bp.route('/api/WorkstationMetricsLogs', methods=["GET"])
def WorkstationMetricsLog():
    page = request.args.get('page')  # Retrieve the value of the 'page' parameter
    limit = request.args.get('limit')    # Retrieve the value of the 'limit' parameter
    aggregateBool = request.args.get('aggregate')    # Retrieve the value of the 'limit' parameter
    start_time = request.args.get('start_time')  # Retrieve the value of the 'start_time' parameter
    end_time = request.args.get('end_time')  # Retrieve the value of the 'end_time' parameter
    logsData = dict()

    connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    work_df = workstation_Metrics_df(connectToCrcaMonitoring, globalVariables.apmNumbers, start_time, end_time)
    work_df["Count"] = len(work_df["Server"])

    globalVariables.workstation_metrics_data = work_df
    if(aggregateBool=="yes"):
        selected_keys=["totalWorkstations","CPUUtization","memoryUtilization"]
        serverAggergateValue = {key: globalVariables.workstation_metricJs_data[key] for key in selected_keys if key in globalVariables.workstation_metrics_data}
        return jsonify(serverAggergateValue)
    
    df = work_df["Server"]
    if(page==None):
        page = -1
    if(int(page)==-1):
        start = 0
        end = -1
    else:
        start = (int(page)-1)*int(limit)
        end = start + int(limit)
        if(end>len(df)):
            end = -1

    logsData["workstationLogs"] = df.iloc[start:end].to_json()

    return jsonify(logsData)


@infrastructure_bp.route('/api/azureServerMetricsCPUDatalogs', methods=["POST"])
def azureServerMetricsCPUDatalog():
    print("Azure Server Metrics CPU Data Logs called")
    st = datetime.now()
    dataPost = request.get_json()

    aggregateBool = dataPost.get('aggregate')
    filter = dataPost.get('filters')
    serverName = dataPost.get('serverName')
    start_time = dataPost.get('start_time')
    end_time = dataPost.get('end_time')
    
    threshold = dataPost.get('threshold', 80)
    #print("Threshold received:", threshold)

    apmNumbers = ""
    subRg = ""
    logsData = dict()
    connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")

    if(serverName=="" and ("subRg" not in filter)):
        if aggregateBool=="forGAC" :
            if os.path.exists(alertInfraListJsonPath):
                print("Aggregate")
                print("The os path exists in infra")
                with open(alertInfraListJsonPath, "r") as json_file: 
                    
                    alerts_df = json_file.read()
                    alerts_df = json.loads(alerts_df)
                    # print(type(alerts_df["Data"]))
                    alerts_df = pandas.read_json(alerts_df["Cpu Data"])
                    alerts_df["TimeGenerated"] = pandas.to_datetime(alerts_df["TimeGenerated"], errors='coerce')
                    # print(start_time, end_time)
                    start_time = datetime.strptime(start_time, "%Y-%m-%d %I:%M:%S %p")
                    start_time = datetime.strftime(start_time, "%Y-%m-%d %H:%M:%S")
                    start_time = pandas.to_datetime(start_time)
                    
                    end_time = datetime.strptime(end_time, "%Y-%m-%d %I:%M:%S %p")
                    end_time = datetime.strftime(end_time, "%Y-%m-%d %H:%M:%S")
                    end_time = pandas.to_datetime(end_time)
                    print("The start time and end time for cpu are",start_time, end_time)
                    appCI = getFiltersFromCache(filter, "appCI")
                    appCI = [i.strip() for i in appCI.replace("'","").split(",")]
                    # print(appCI)
                    alerts_df["endTime"] = pandas.to_datetime(alerts_df["endTime"], errors='coerce')
                    
                    print("alerts_df_sample cpu1",alerts_df)
                    
                    alerts_df_sample = alerts_df[((end_time - alerts_df["endTime"]).dt.total_seconds() / 60 < 30) | (alerts_df["TimeGenerated"]>=start_time) & (alerts_df["TimeGenerated"]<=end_time)]
                    print("alerts_df_sample cpu2",alerts_df_sample)
                    alerts_df_sample["endTime"] = alerts_df_sample["endTime"].dt.strftime('%Y-%m-%d %H:%M')
                    alerts_df_sample["TimeGenerated"] = alerts_df_sample["TimeGenerated"].dt.strftime('%Y-%m-%d %H:%M')
                    # Filter based on appCI
                    alerts_df_sample["AppCI_copy"] = alerts_df_sample["AppCI"].str.lower()
                    alerts_df_sample["AppCI_copy"] = alerts_df_sample["AppCI_copy"].str.strip()
                    alerts_df_sample = alerts_df_sample[alerts_df_sample["AppCI_copy"].isin(appCI)]
                    
                    print(alerts_df_sample)
                    print("The Alerts df is ", len(alerts_df_sample))
                    logsData["CpuUtilization"] = alerts_df_sample.to_json()  
                    return jsonify(logsData)
        # apmNumbers = filtersData(filter, "apmNumber")
        apmNumbers = getFiltersFromCache(filter, "apmNumber")  
        
    elif(serverName=="" and ("subRg" in filter)):
        filterOptions = filter
        serverName = ""
        #apmNumbers = filtersData(json.loads(filter), "apmNumber")
        
        if(filterOptions["serverName"][0]!="All"):
            if(filterOptions["subRg"][0]=="All"):
                for server in filterOptions["serverName"]:
                    serverName = serverName+ "'" + server + "'" +","
                serverName = serverName[0:len(serverName)-1]
            else:
                for subrg in filterOptions["subRg"]:
                    subRg = subRg + "'" + subrg + "/"+filterOptions["serverName"][0]+"'"+","
                subRg = subRg[0:len(subRg)-1]

        elif(filterOptions["subRg"][0]!="All"):
            if(filterOptions["serverName"][0]=="All"):
                for subrg in filterOptions["subRg"]:
                    subRg = subRg + "'" + subrg + "'"+","
                subRg = subRg[0:len(subRg)-1]
            else:
                for subrg in filterOptions["subRg"]:
                    subRg = subRg + "'" + subrg + "/"+filterOptions["serverName"][0]+"'"+","
                subRg = subRg[0:len(subRg)-1]
        
        elif(filterOptions["serverName"][0]!="All" and filterOptions["subRg"][0]!="All"):
            f = {"appFamily": ["All"],"appCI": ["All"],"managedByGroup": ["All"],"supportGroup": ["All"]}
            # apmNumbers = filtersData(f, "apmNumber")
            apmNumbers = getFiltersFromCache(f, "apmNumber")  
            
    elif(serverName!=""):
        if(not("'" in serverName)):
            s= ""
            for i in serverName.split(','):
                s+="'"+i+"',"
            s=s[0:-1]
            # print(s)
            serverName = s

    # Pass the threshold to the CPU utilization function.
    cpu_df = azureServerMetrics_CPU_df(
        aggregateBool, serverName.lower(), subRg, 
        connectToCrcaMonitoring, apmNumbers, start_time, 
        end_time, threshold
    )
    # print("The cpu df is",cpu_df)
    df = cpu_df["Server"]
    logsData["CpuUtilization"] = df.to_json()
    logsData["threshold"] = threshold
    for i in cpu_df:
        if(i!="Server"):
            #print(i)
            #print(cpu_df[i])
            logsData[i] = cpu_df[i]

    #print("THe logs data for CPU is", logsData)        
    en = datetime.now()

    print("Azure CPU API: "+ str(st)+" - "+str(en))
    #print("Response Data:", logsData) 
    return jsonify(logsData)


@infrastructure_bp.route('/api/azureServerMetricsMemoryDatalogs', methods=["POST"])
def azureServerMetricsMemoryDatalog():
    print("azureServerMetricsMemoryDatalogs function has been called")
    s = datetime.now()
    dataPost = request.get_json()

    aggregateBool = dataPost.get('aggregate')    # Retrieve the value of the 'limit' parameter
    filter = dataPost.get('filters')
    serverName = dataPost.get('serverName')
    start_time = dataPost.get('start_time')  # Retrieve the value of the 'start_time' parameter
    end_time = dataPost.get('end_time')  # Retrieve the value of the 'end_time' parameter
    threshold = dataPost.get('threshold', 80)

    #print("Threshold received:", threshold)

    apmNumbers = ""
    subRg = ""
    logsData = dict()

    if(serverName=="" and ("subRg" not in filter)):
        if aggregateBool=="forGAC" :
            if os.path.exists(alertInfraListJsonPath):
                print("Aggregate")
                #print("The os path exists")
                with open(alertInfraListJsonPath, "r") as json_file: 
                    
                    alerts_df = json_file.read()
                    alerts_df = json.loads(alerts_df)
                    # print(type(alerts_df["Data"]))
                    alerts_df = pandas.read_json(alerts_df["Memory Data"])
                    alerts_df["TimeGenerated"] = pandas.to_datetime(alerts_df["TimeGenerated"], errors='coerce')
                    # print(start_time, end_time)
                    start_time = datetime.strptime(start_time, "%Y-%m-%d %I:%M:%S %p")
                    start_time = datetime.strftime(start_time, "%Y-%m-%d %H:%M:%S")
                    start_time = pandas.to_datetime(start_time)
                    
                    end_time = datetime.strptime(end_time, "%Y-%m-%d %I:%M:%S %p")
                    end_time = datetime.strftime(end_time, "%Y-%m-%d %H:%M:%S")
                    end_time = pandas.to_datetime(end_time)
                    print("The start time and endtime for memory are",start_time, end_time)
                    appCI = getFiltersFromCache(filter, "appCI")
                    appCI = [i.strip() for i in appCI.replace("'","").split(",")]
                    # print(appCI)
                    alerts_df["endTime"] = pandas.to_datetime(alerts_df["endTime"], errors='coerce')
                    print("alerts_df_sample memory1",alerts_df)  
                                     
                    alerts_df_sample = alerts_df[((end_time - alerts_df["endTime"]).dt.total_seconds() / 60 < 30) | (alerts_df["TimeGenerated"]>=start_time) & (alerts_df["TimeGenerated"]<=end_time)]
                    print("alerts_df_sample memory2",alerts_df_sample)
                    alerts_df_sample["endTime"] = alerts_df_sample["endTime"].dt.strftime('%Y-%m-%d %H:%M')
                    alerts_df_sample["TimeGenerated"] = alerts_df_sample["TimeGenerated"].dt.strftime('%Y-%m-%d %H:%M')
                    
                    # Filter based on appCI
                    alerts_df_sample["AppCI_copy"] = alerts_df_sample["AppCI"].str.lower()
                    alerts_df_sample["AppCI_copy"] = alerts_df_sample["AppCI_copy"].str.strip()
                    alerts_df_sample = alerts_df_sample[alerts_df_sample["AppCI_copy"].isin(appCI)]
                    
                    print(alerts_df_sample)
                    print("The Alerts df is ", len(alerts_df_sample))
                    logsData["MemoryUtilization"] = alerts_df_sample.to_json()  
                    return jsonify(logsData)
        # apmNumbers = filtersData(filter, "apmNumber")
        apmNumbers = getFiltersFromCache(filter, "apmNumber")  
        
    
    elif(serverName=="" and ("subRg" in filter)):
        filterOptions = filter
        serverName = ""
        
        if(filterOptions["serverName"][0]!="All"):
            if(filterOptions["subRg"][0]=="All"):
                for server in filterOptions["serverName"]:
                    serverName = serverName+ "'" + server + "'" +","
                serverName = serverName[0:len(serverName)-1]
            else:
                for subrg in filterOptions["subRg"]:
                    subRg = subRg + "'" + subrg + "/"+filterOptions["serverName"][0]+"'"+","
                subRg = subRg[0:len(subRg)-1]

        elif(filterOptions["subRg"][0]!="All"):
            if(filterOptions["serverName"][0]=="All"):
                for subrg in filterOptions["subRg"]:
                    subRg = subRg + "'" + subrg + "'"+","
                subRg = subRg[0:len(subRg)-1]
            else:
                for subrg in filterOptions["subRg"]:
                    subRg = subRg + "'" + subrg + "/"+filterOptions["serverName"][0]+"'"+","
                subRg = subRg[0:len(subRg)-1]
        
        elif(filterOptions["serverName"][0]!="All" and filterOptions["subRg"][0]!="All"):
            f = {"appFamily": ["All"],"appCI": ["All"],"managedByGroup": ["All"],"supportGroup": ["All"]}
            # apmNumbers = filtersData(f, "apmNumber")
            apmNumbers = getFiltersFromCache(f, "apmNumber")  
            

    elif(serverName!=""):
        if(not("'" in serverName)):
            s= ""
            for i in serverName.split(','):
                s+="'"+i+"',"
            s=s[0:-1]
            # print(s)
            serverName = s

    connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    memory_df = azureServerMetrics_Memory_df(aggregateBool,serverName.lower(),subRg,connectToCrcaMonitoring, apmNumbers, start_time, end_time,threshold)
    df = memory_df["Server"]
    # if(aggregateBool=="no" and (not df.empty)):
    #     df["TimeGenerated"] = df["TimeGenerated"].dt.strftime('%Y-%m-%d %H:%M:%S')
    logsData["MemoryUtilization"] = df.to_json()
    logsData["threshold"] = threshold
    e = datetime.now()
    #print("Response Data:", logsData)
    for i in memory_df:
        if(i!="Server"):
            logsData[i] = memory_df[i]
    #print(memory_df)
    print("Memory API: "+ str(s)+" - "+str(e))

    return jsonify(logsData)


@infrastructure_bp.route('/api/azureServerMetricsFileshareDatalogs', methods=["POST"])
def azureServerMetricsFileshareDatalog():
    start = datetime.now()
    print("the azureServerMetricsFileshareDatalogs api is called")
    dataPost = request.get_json()
    aggregate =dataPost.get('aggregate')
    start_time = dataPost.get('start_time')
    end_time = dataPost.get('end_time')
    appname = dataPost.get('appname', "")
    filters = dataPost.get('filters')
    # print("StartTimeeeeeeeee:")
    appCI = getFiltersFromCache(filters, "appCI")
    fileshare_df = azureServerMetrics_Fileshare_df(aggregate, start_time, end_time, appCI)
    df = fileshare_df["ServerName"]
    
    logsData = {"FileshareUtilization": df.to_json()}
    
    # print("Response Data:", logsData)
    end = datetime.now()
    print(fileshare_df)
    for i in fileshare_df:
        if(i!="ServerName"):
            #print(i)
            #print(disk_df[i])
            logsData[i] = fileshare_df[i]
    
    print("azureServerMetricsFileshareDatalogs API: "+ str(start)+" - "+str(end))
    return jsonify(logsData)

@infrastructure_bp.route('/api/azureServerMetricsDiskDatalogs', methods=["POST"])
def azureServerMetricsDiskDatalog():
    print("azureServerMetricsDiskDatalogs function has been called")
    start = datetime.now()
    dataPost = request.get_json()

    aggregateBool = dataPost.get('aggregate')    # Retrieve the value of the 'limit' parameter
    filter = dataPost.get('filters')
    serverName = dataPost.get('serverName')
    start_time = dataPost.get('start_time')  # Retrieve the value of the 'start_time' parameter
    end_time = dataPost.get('end_time')  # Retrieve the value of the 'end_time' parameter
    threshold = dataPost.get('threshold', 80)
    #print(dataPost)
    #print("Threshold received:", threshold)

    apmNumbers = ""
    subRg = ""
    logsData = dict()

    if(serverName=="" and ("subRg" not in filter)):
        if aggregateBool=="forGAC" :
            if os.path.exists(alertInfraListJsonPath):
                print("Aggregate")
                #print("The os path exists")
                with open(alertInfraListJsonPath, "r") as json_file: 
                    
                    alerts_df = json_file.read()
                    alerts_df = json.loads(alerts_df)
                    # print(type(alerts_df["Data"]))
                    alerts_df = pandas.read_json(alerts_df["Disk Data"])
                    alerts_df["TimeGenerated"] = pandas.to_datetime(alerts_df["TimeGenerated"], errors='coerce')
                    # print(start_time, end_time)
                    start_time = datetime.strptime(start_time, "%Y-%m-%d %I:%M:%S %p")
                    start_time = datetime.strftime(start_time, "%Y-%m-%d %H:%M:%S")
                    start_time = pandas.to_datetime(start_time)
                    
                    end_time = datetime.strptime(end_time, "%Y-%m-%d %I:%M:%S %p")
                    end_time = datetime.strftime(end_time, "%Y-%m-%d %H:%M:%S")
                    end_time = pandas.to_datetime(end_time)
                    print("THe start time adn end time for disk are", start_time, end_time)
                    appCI = getFiltersFromCache(filter, "appCI")
                    appCI = [i.strip() for i in appCI.replace("'","").split(",")]
                    # print(appCI)
                    alerts_df["endTime"] = pandas.to_datetime(alerts_df["endTime"], errors='coerce')
                    

                    print("alerts_df_sample disk1",alerts_df)
                    
                    alerts_df_sample = alerts_df[((end_time - alerts_df["endTime"]).dt.total_seconds() / 60 < 30) | (alerts_df["TimeGenerated"]>=start_time) & (alerts_df["TimeGenerated"]<=end_time)]
                    
                    print("alerts_df_sample disk2",alerts_df_sample)

                    alerts_df_sample["endTime"] = alerts_df_sample["endTime"].dt.strftime('%Y-%m-%d %H:%M')
                    alerts_df_sample["TimeGenerated"] = alerts_df_sample["TimeGenerated"].dt.strftime('%Y-%m-%d %H:%M')
                    
                    # Filter based on appCI
                    alerts_df_sample["AppCI_copy"] = alerts_df_sample["AppCI"].str.lower()
                    alerts_df_sample["AppCI_copy"] = alerts_df_sample["AppCI_copy"].str.strip()
                    alerts_df_sample = alerts_df_sample[alerts_df_sample["AppCI_copy"].isin(appCI)]
                    
                    print(alerts_df_sample)
                    print("The Alerts df is ", len(alerts_df_sample))
                    logsData["DiskUtilization"] = alerts_df_sample.to_json()  
                    return jsonify(logsData)
        # apmNumbers = filtersData(filter, "apmNumber")
        apmNumbers = getFiltersFromCache(filter, "apmNumber")  
        
    
    elif(serverName=="" and ("subRg" in filter)):
        filterOptions = filter
        serverName = ""
        #apmNumbers = filtersData(json.loads(filter), "apmNumber")
        
        if(filterOptions["serverName"][0]!="All"):
            if(filterOptions["subRg"][0]=="All"):
                for server in filterOptions["serverName"]:
                    serverName = serverName+ "'" + server + "'" +","
                serverName = serverName[0:len(serverName)-1]
            else:
                for subrg in filterOptions["subRg"]:
                    subRg = subRg + "'" + subrg + "/"+filterOptions["serverName"][0]+"'"+","
                subRg = subRg[0:len(subRg)-1]

        elif(filterOptions["subRg"][0]!="All"):
            if(filterOptions["serverName"][0]=="All"):
                for subrg in filterOptions["subRg"]:
                    subRg = subRg + "'" + subrg + "'"+","
                subRg = subRg[0:len(subRg)-1]
            else:
                for subrg in filterOptions["subRg"]:
                    subRg = subRg + "'" + subrg + "/"+filterOptions["serverName"][0]+"'"+","
                subRg = subRg[0:len(subRg)-1]
        
        elif(filterOptions["serverName"][0]!="All" and filterOptions["subRg"][0]!="All"):
            f = {"appFamily": ["All"],"appCI": ["All"],"managedByGroup": ["All"],"supportGroup": ["All"]}
            # apmNumbers = filtersData(f, "apmNumber")
            apmNumbers = getFiltersFromCache(f, "apmNumber")  

    elif(serverName!=""):
        if(not("'" in serverName)):
            s= ""
            for i in serverName.split(','):
                s+="'"+i+"',"
            s=s[0:-1]
            serverName = s

    connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    disk_df = azureServerMetrics_Disk_df(aggregateBool,serverName.lower(), subRg,connectToCrcaMonitoring, apmNumbers,start_time,end_time,threshold)
    disk_df["Count"] = len(disk_df["Server"])
    
    df = disk_df["Server"]
    # print("Disk Metrics----------", df)
    # if(aggregateBool=="no" and (not df.empty)):
    #     df["TimeGenerated"] = df["TimeGenerated"].dt.strftime('%Y-%m-%d %H:%M:%S')
    logsData["DiskUtilization"] = df.to_json()
    logsData["threshold"] = threshold
    #print("Response Data:", logsData) 
    for i in disk_df:
        if(i!="Server"):
            #print(i)
            #print(disk_df[i])
            logsData[i] = disk_df[i]
    #print("THe logs data for disk is", logsData)        
    end = datetime.now()
    #print(disk_df)
    print("Disk API: "+ str(start)+" - "+str(end))

    return jsonify(logsData)
