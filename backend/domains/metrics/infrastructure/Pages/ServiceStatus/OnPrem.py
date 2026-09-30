from shared.dataBase import connectToDw, queryDw, connectToDw_SqlServerPwdScom, connectToDw_AADpwd,exceptioninfo,insert_data
from domains.metrics.infrastructure.Pages.ServiceStatus.Azure import processDataFroDurationServices, getGACQuery
import pandas
import numpy
import pytz
from datetime import datetime, timedelta
from flask import jsonify
from shared.appinsights_logger import error_response

def onPremserviceStatus(serviceList, startTime, endTime, aggregate):
    df_onPremService = pandas.DataFrame()
    if(len(serviceList)>0):
        server_services = ""
        for row in serviceList:
            # print(row[3])
            if("OnPrem" in row[3]):
                server_services = server_services + "'" + row[2]+"' ,"
        if(server_services==""):
            return df_onPremService
        # print("Have Server Services")
        server_services = server_services[0:len(server_services)-2]
        if(startTime==""):
            format_string = "%Y-%m-%d %I:%M:%S %p"
            #print(datetime.now())
            currentTime = datetime.now()
            pst = pytz.timezone('America/Los_Angeles')
            endTime = currentTime.astimezone(pst)
            startTime = endTime - timedelta(hours=5)
            startTime = startTime.strftime(format_string)
            endTime = endTime.strftime(format_string)

        else:
            startTime = datetime.strptime(startTime, "%Y-%m-%d %I:%M:%S %p").strftime("%Y-%m-%d %H:%M:%S")
            endTime = datetime.strptime(endTime, "%Y-%m-%d %I:%M:%S %p").strftime("%Y-%m-%d %H:%M:%S")
        timeGenerated = f"""between Convert(datetime, '{startTime}') and Convert(datetime, '{endTime}') """
        try:
            connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")

            if(aggregate=="no"):
                onPremServicesQuery = f""" Select Trim(ServerName), Trim(ServiceName), Trim(ServerServiceMap), TimeGenerated, Trim(HostingType), Trim(MonitorType), Trim(Status) from CriticalServicesStatus where ServerServiceMap in ({server_services}) and TimeGenerated {timeGenerated} order by TimeGenerated asc"""
            elif(aggregate=="yes"):
                onPremServicesQuery = f""" Select Trim(ServerName), Trim(ServiceName), Trim(ServerServiceMap), TimeGenerated, Trim(HostingType), Trim(MonitorType), Trim(Status) from CriticalServicesStatus where ServerServiceMap in ({server_services}) and TimeGenerated = (Select max(TimeGenerated) from CriticalServicesStatus where Trim(HostingType) like 'OnPremise')"""
            elif(aggregate=="forGAC"):
                onPremServicesQuery = getGACQuery(timeGenerated, "OnPrem")
                # onPremServicesQuery = f""" Select Trim(ServerName), Trim(ServiceName), Trim(ServerServiceMap), TimeGenerated, Trim(HostingType), Trim(MonitorType), Trim(Status) from CriticalServicesStatus where ServerServiceMap in ({server_services}) and TimeGenerated {timeGenerated} order by TimeGenerated asc"""
            # print(onPremServicesQuery)
            try:
                onPremServiceDB = queryDw(connectToCrcaMonitoring, onPremServicesQuery)
                
                # if(aggregate != 'forGAC'and len(onPremServiceDB)>0):
                #     df_onPremService = pandas.DataFrame(numpy.array(onPremServiceDB), columns=["ServerName", "ServiceName","ServerServiceMap","TimeGenerated","HostingType","MonitorType","Status"])
                #     df_onPremService["TimeGenerated"] = df_onPremService["TimeGenerated"].dt.strftime('%Y-%m-%d %H:%M')
                # if(aggregate == 'forGAC'and len(onPremServiceDB)>0):
                #     df_onPremService = pandas.DataFrame(numpy.array(onPremServiceDB), columns=["ServerName", "ServiceName","TimeGenerated","HostingType","MonitorType","Status", "Duration"])
                #     df_onPremService["TimeGenerated"] = df_onPremService["TimeGenerated"].dt.strftime('%Y-%m-%d %H:%M')


                #after GAC merge
                if(len(onPremServiceDB)>0):
                    if(aggregate == "forGAC"):
                        df_onPremService = pandas.DataFrame(numpy.array(onPremServiceDB), columns=["ServerName", "ServiceName","ServerServiceMap","TimeGenerated","EndTime","HostingType","MonitorType","Status","Duration"])
                        pst = pytz.timezone('America/Los_Angeles')
                        currentTime = datetime.now()
                        endTime = currentTime.astimezone(pst)
                        endTime = endTime.strftime('%Y-%m-%d %H:%M')

                        df_onPremService.loc[df_onPremService["EndTime"].isna(), "EndTime"] = endTime
                        df_onPremService["Duration"] = (df_onPremService["EndTime"] - df_onPremService["TimeGenerated"]).dt.total_seconds() / 60
                        df_onPremService["EndTime"] = df_onPremService["EndTime"].astype(str).str[:16]
                    else:
                        df_onPremService = pandas.DataFrame(numpy.array(onPremServiceDB), columns=["ServerName", "ServiceName","ServerServiceMap","TimeGenerated","HostingType","MonitorType","Status"])
                    df_onPremService["TimeGenerated"] = df_onPremService["TimeGenerated"].dt.strftime('%Y-%m-%d %H:%M')    

                
                return df_onPremService
            except Exception as Ex:
                print("Exception in ServiceStatus Onprem query execution: ",Ex )
                info =exceptioninfo(Ex,onPremServicesQuery)
                insert_data(info) 
                return error_response(500, "Failed to fetch on-prem service status", detail=info, exc=Ex)
        except Exception as Ex:
            print("Exception in connecting to crcamonitoring database: ",Ex )
            info =exceptioninfo(Ex)
            insert_data(info)
            return error_response(500, "Failed to connect to monitoring database", detail=info, exc=Ex)
            
            
        