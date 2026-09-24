import pandas
from shared.variables import globalVariables
from datetime import timedelta, datetime
import numpy
from shared.dataBase import connectToDw, connectToDw_AADpwd, queryDw,exceptioninfo,insert_data

def incidentIssueMapping():
    incidentIssueMapping = pandas.DataFrame()
    if(globalVariables.incidentsData["Count"]>0):
        try:
            connectToServicePerf = connectToDw("spidedbsv6c6b60.wa.providence.org\\SPIDER", "ServicePerf_DW")
            try:
                connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")

                for index, incident in globalVariables.incidentsData["incidentList"].iterrows():
                    format_string = "%Y-%m-%d %H:%M:%S"
                    endTime = datetime.strptime(str(incident["sys_created_on"]), format_string)
                    startTime = endTime - timedelta(minutes=30)
                    appCI = incident["AppCI"]
                    
                    globalVariables.servicesData["Service"]["TimeGenerated"]=pandas.to_datetime(globalVariables.servicesData["Service"]["TimeGenerated"].astype(str).apply(lambda x: x.split('.')[0]))            
                    globalVariables.interfacesData["Interfaces"]["TimeGenerated"]=pandas.to_datetime(globalVariables.interfacesData["Interfaces"]["TimeGenerated"].astype(str).apply(lambda x: x.split('.')[0]))            

                    if(len(globalVariables.servicesData["Service"])>0):
                        serviceQuery = f""" SELECT LOWER(cmdbci.[name]) AS ServerName
                                FROM   [ServicePerf_DW].[dbo].[vw_sn_cmdb_ci_server] AS cmdbci
                                INNER JOIN	vw_SN_Appl_Relationship AS AppRelation ON AppRelation.RelationshipID = cmdbci.sys_id
                                INNER JOIN	vw_SN_cmdb_ci_business_app AS BusinessApp ON BusinessApp.sys_id = AppRelation.ApplicationID
                                WHERE		(BusinessApp.portfolio_name = 'Clinical and Revenue Cycle Applications' 
                                OR              BusinessApp.[apm_application_family_name] like 'Cromwell')
                                AND			BusinessApp.active = 'true'
                                AND			AppRelation.Relationship = 'Runs on'
                                AND BusinessApp.[name] like '%{appCI}%'
                                """
                        try:
                            serverList_queryResult = queryDw(connectToServicePerf, serviceQuery)
                            df_serviceList = pandas.DataFrame(numpy.array(serverList_queryResult), columns=["ServerName"])
                            
                            serviceList = df_serviceList["ServerName"].values.tolist()
                            
                            servicesData = globalVariables.servicesData["Service"]
                            servicesWithIssues = servicesData[servicesData["ServerName"].isin(serviceList)]
                            if(len(servicesWithIssues)>0):
                                servicesWithIssues = servicesWithIssues[(servicesData["TimeGenerated"]>=startTime and servicesData["TimeGenerated"]<=endTime)]

                            print(len(servicesWithIssues))
                            if(len(servicesWithIssues)>0):
                                servicesWithIssues = servicesWithIssues[["ServiceName","Status"]].rename(columns ={"ServiceName":"Components"})
                                pandas.concat([incidentIssueMapping,servicesWithIssues], ignore_index=True)
                        except Exception as Ex:
                            print("Exception in executing query: ",Ex )
                            info =exceptioninfo(Ex,serviceQuery)
                            insert_data(info)  
                            
                    if(len(globalVariables.interfacesData["Interfaces"])>0):
                        try:
                            interfaceQuery = f""" Select [Interfaces Monitored] from CriticalInterfacesList where AppCI like '{appCI}' """
                            interfaceList = queryDw(connectToCrcaMonitoring, interfaceQuery)
                            print("Helooooo1")
                            df_interfaceList = pandas.DataFrame(numpy.array(serverList_queryResult), columns=["InterfaceName"])
                            interfaceList = df_interfaceList["InterfaceName"].values.tolist()
                            print("Helooooo2")
                            interfacesData = globalVariables.interfacesData["Interfaces"]
                            #print(interfacesData["InterfaceName"])
                            interfacesWithIssues = interfacesData[interfacesData["TimeGenerated"]>startTime]
                            print("Helooooo3")
                            #interfacesWithIssues = interfacesData[interfacesData["InterfaceName"].isin(interfaceList)]
                            print(interfaceList)
                            if(len(interfacesWithIssues)>0):
                                print("Helooooo4")
                                print(interfacesWithIssues)
                                interfacesWithIssues = interfacesWithIssues[["InterfaceName","Status"]].rename(columns ={"InterfaceName":"Components"})
                                pandas.concat([incidentIssueMapping,interfacesWithIssues], ignore_index=True)
                        except Exception as Ex:
                            print("Exception in executing query: ",Ex )
                            info =exceptioninfo(Ex,interfaceQuery)
                            insert_data(info)  
                            return -1
                        
                    if(len(incidentIssueMapping)>0):
                        print("Helooooo5")
                        incidentIssueMapping["IncidentNumber"] = incident
                        #pandas.concat([incidentIssueMapping,interfacesWithIssues], ignore_index=True)
                        incidentIssueMappingList = incidentIssueMapping.values.tolist()
                        return incidentIssueMappingList
                    else:
                        return []
            except Exception as Ex:
                print("Exception in connecting to crca monitoring database ",Ex )
                info =exceptioninfo(Ex)
                insert_data(info)   
                return -1    
        except Exception as Ex:
            print("Exception in connecting to SPIDERDB ",Ex )
            info =exceptioninfo(Ex)
            insert_data(info)
            return -1

            