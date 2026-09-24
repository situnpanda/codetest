from shared.variables import globalVariables
from shared.dataBase import connectToDw, connectToDw_AADpwd,queryDw
from domains.metrics.application.applicationTelemetry import servicesData, interfacesData
from datetime import datetime, timedelta
def mapView(region):
    connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    connectToServicePerf = connectToDw("spidedbsv6c6b60.wa.providence.org\\SPIDER", "ServicePerf_DW")
    mapViewData = []
    #print('')
    for index, incident in globalVariables.incidentsData["incidentList"].iterrows():
        incidentStatus = {
            "incidentNumber": incident["IncNumber"],
            "servicesStopped":"NA",
            "interfacesStopped":"NA"
        }
        
        appCI = incident["AppCI"]
        format_string = "%Y-%m-%d %H:%M:%S"
        endTime = datetime.strptime(str(incident["sys_created_on"]), format_string)
        startTime = endTime - timedelta(minutes=30)
        endTime = endTime.strftime("%Y-%m-%d %I:%M:%S %p")
        startTime = startTime.strftime("%Y-%m-%d %I:%M:%S %p")
        print(endTime)
        print(startTime)
        
        query = f""" SELECT [number], [name], [apm_application_family_name] FROM [ServicePerf_DW].[dbo].[vw_SN_cmdb_ci_business_app]
                WHERE [portfolio_name] = 'Clinical and Revenue Cycle Applications' and [active] = 'true' and [name] like '%{appCI}%' """    
        
        rows = queryDw(connectToServicePerf, query)
        apmNumbers=""
        for row in rows:
            apmNumbers = apmNumbers + "'" + row[0]+"' ,"
        apmNumbers = apmNumbers[0:len(apmNumbers)-2]
        print(apmNumbers)

        servicesStatusData = servicesData(connectToCrcaMonitoring, apmNumbers, startTime,endTime)
        interfacesStatusData = interfacesData(connectToCrcaMonitoring, apmNumbers, startTime,endTime)
        
        if(len(servicesStatusData["Service"])>0):
            incidentStatus["servicesStopped"] = servicesStatusData["Service"][servicesStatusData["Service"]["Status"]=="Stopped"]['ServerServiceMap'].nunique()
        elif(servicesStatusData["Count"]==-1):
            incidentStatus["servicesStopped"] = "NA"
        
        if(len(interfacesStatusData["Interfaces"])>0):
            incidentStatus["interfacesStopped"] = interfacesStatusData["Interfaces"][interfacesStatusData["Interfaces"]["Status"]=="Stopped"]['InterfaceName'].nunique()
            print("HI1")
        elif(interfacesStatusData["Count"]==-1):
            incidentStatus["interfacesStopped"]="NA"
        
        mapViewData.append(incidentStatus)
        print("--------------------------")

        return mapViewData