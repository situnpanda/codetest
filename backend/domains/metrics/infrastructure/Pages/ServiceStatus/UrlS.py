from shared.dataBase import connectToDw, queryDw, connectToDw_SqlServerPwdScom, connectToDw_AADpwd,exceptioninfo,insert_data
import pandas
import numpy
import pytz
from datetime import datetime, timedelta
from shared.logAnalytics import queryInLogAnalytics
from flask import jsonify
from shared.appinsightsLogger import error_response
from domains.metrics.infrastructure.pages.serviceStatus.azure import processDataFroDurationServices

def urlStatus(connectionString, apmNumbers, startTime, endTime, aggregate):
    try:
        urlApiListQuery = f"""  Select APMNumber, AppCI, URL, MonitorType, ServerName, Environment from ServiceMon_InputData where APMNumber in ({apmNumbers}) """
        urlApiList = queryDw(connectionString, urlApiListQuery)
        urlApiStatus = pandas.DataFrame()
        try:
            if(len(urlApiList)>0):
                urlApi = ""
                for row in urlApiList:
                    urlApi = urlApi + "'" + row[2]+"' , "
                urlApi = urlApi[0:len(urlApi)-2]

                if(startTime==""):
                    format_string = "%Y-%m-%d %I:%M:%S %p"
                    #print(datetime.now())
                    currentTime = datetime.now()
                    pst = pytz.timezone('America/Los_Angeles')
                    endTime = currentTime.astimezone(pst)
                    startTime = endTime - timedelta(hours=5)
                    startTime = startTime.strftime(format_string)
                    endTime = endTime.strftime(format_string)
                
                timeGenerated = f"""between(datetime("{startTime}") .. datetime("{endTime}"))"""

                #Query In LogAnalytics for the URLs Status
                workspaceId = "552b9630-b106-4fe7-a1fa-97d04a0010ef"#911cbca9-2534-4c35-80e5-176ce6759a98"#connectToKeyVault("CrcaProdLsWsID")
                #workspaceId = connectToKeyVault("CrcaProdLsWsID")
                if(aggregate=="no"):
                    logAnalyticsQuery =  f""" ServiceMonitoring_CL
                                    | extend TimeGenerated = datetime_utc_to_local(TimeGenerated, 'US/Pacific')
                                    | extend ServerServiceMap = strcat(tolower(ServerName_s),"-", tolower(serviceName_s))
                                    | where TimeGenerated {timeGenerated} and serviceName_s in ({urlApi})
                                    | extend Status = iff(Status_s contains "Error", "Stopped", "Running")
                                    | project
                                        TimeGenerated,
                                        MonitorType = MonitorType_s,
                                        ServerName = ServerName_s,
                                        ServiceName = serviceName_s,
                                        ServerServiceMap,
                                        Status,
                                        ResourceGroup,
                                        SubscriptionId = SubscriptionId,
                                        Description = StatusMessage_s,
                                        AppCI = AppCI_s,
                                        HostingType = "URL"
                                    | order by TimeGenerated asc """ 
                elif(aggregate=="forGAC"):
                    # logAnalyticsQuery =  f""" ServiceMonitoring_CL
                    #                 | extend TimeGenerated = datetime_utc_to_local(TimeGenerated, 'US/Pacific')
                    #                 | extend ServerServiceMap = strcat(tolower(ServerName_s),"-", tolower(serviceName_s))
                    #                 | where TimeGenerated {timeGenerated} and serviceName_s in ({urlApi})
                    #                 | extend Status = iff(Status_s contains "Error", "Stopped","Running")
                    #                 | project
                    #                     TimeGenerated,
                    #                     MonitorType = MonitorType_s,
                    #                     ServerName = ServerName_s,
                    #                     ServiceName = serviceName_s,
                    #                     Status,
                    #                     ResourceGroup,
                    #                     SubscriptionId = SubscriptionId,
                    #                     Description = StatusMessage_s,
                    #                     AppCI = AppCI_s,
                    #                     HostingType = "URL"
                    #                 | order by TimeGenerated asc """ 

                    #after gac merge
                    logAnalyticsQuery =f"""
                    let UpdateTable =
                        ServiceMonitoring_CL
                        | extend TimeGenerated = datetime_utc_to_local(TimeGenerated, 'US/Pacific')
                        | where TimeGenerated {timeGenerated} and serviceName_s in ({urlApi})                        
                        | extend ServerServiceMap = strcat(tolower(ServerName_s), "-", tolower(serviceName_s))
                        | extend Status = Status_s
                        | project TimeGenerated,
                                ServiceName = serviceName_s,
                                ServerName = ServerName_s,
                                Status,
                                HostingType = "URL",
                                MonitorType = MonitorType_s,
                                ServerServiceMap,
                                ResourceGroup,
                                SubscriptionId,
                                StatusMessage_s,
                                AppCI_s
                        | sort by ServerServiceMap asc, TimeGenerated asc  
                        | serialize
                        | extend prevStatus = prev(Status),
                                prevTime = prev(TimeGenerated);
                        let ChangeFind =
                            UpdateTable
                            | extend Change = case(
                                Status == "Ok" and prevStatus != "Ok"  , "Change",
                                Status != "Ok" and (prevStatus == "Ok" or isempty(prevTime)), "Change",
                                "No Change"
                            );
                        let GetDurationTime =
                            ChangeFind
                            | where Change == "Change"
                            | serialize
                            | extend EndTime = next(TimeGenerated);
                        let GetDuration =
                            GetDurationTime
                            | where Status != "Ok"
                            | extend Duration = case(
                                isempty(EndTime), 0,
                                datetime_diff("minute", EndTime, TimeGenerated)
                            );
                        GetDuration
                        | project TimeGenerated,
                                EndTime,
                                Duration,
                                ServerName = ServiceName,
                                ServiceName,
                                AppCI = AppCI_s,
                                MonitorType,
                                Status,
                                Description = StatusMessage_s,        
                                HostingType = "URL"
                        | order by TimeGenerated
                    """
                else:
                    logAnalyticsQuery =  f""" ServiceMonitoring_CL
                                    | extend TimeGenerated = datetime_utc_to_local(TimeGenerated, 'US/Pacific')
                                    | extend ServerServiceMap = strcat(tolower(ServerName_s),"-", tolower(serviceName_s))
                                    | where TimeGenerated>ago(1d) and serviceName_s in ({urlApi})
                                    | extend Status = iff(Status_s contains "Error", "Stopped","Running")
                                    | summarize  arg_max(TimeGenerated, *)  by ServerServiceMap 
                                    | project
                                        TimeGenerated,
                                        MonitorType = MonitorType_s,
                                        ServerName = ServerName_s,
                                        ServiceName = serviceName_s,
                                        ServerServiceMap,
                                        Status,
                                        AppCI = AppCI_s,
                                        HostingType = "URL" """ 

                urlApiStatus = queryInLogAnalytics(workspaceId, logAnalyticsQuery,"","")
                # if(aggregate == 'forGAC' and len(urlApiStatus)>0):
                #     urlApiStatus['TimeGenerated'] = urlApiStatus['TimeGenerated'].dt.strftime('%Y-%m-%d %H:%M')
                #     #urlApiStatus = processDataFroDurationServices(urlApiStatus)
                # if(aggregate != 'forGAC' and len(urlApiStatus)>0):
                #     urlApiStatus['TimeGenerated'] = urlApiStatus['TimeGenerated'].dt.strftime('%Y-%m-%d %H:%M')

                #after gac merge
                if(len(urlApiStatus)>0):
                    if(aggregate == "forGAC"):
                        urlApiStatus['EndTime'] = urlApiStatus['EndTime'].dt.strftime('%Y-%m-%d %H:%M')
                    urlApiStatus['TimeGenerated'] = urlApiStatus['TimeGenerated'].dt.strftime('%Y-%m-%d %H:%M')

               
            return urlApiStatus
        except Exception as Ex:
            print("Exception in URL's query: ",Ex )
            info =exceptioninfo(Ex,logAnalyticsQuery)
            insert_data(info)
            return error_response(500, "Failed to fetch URL service status", detail=info, exc=Ex)
    except Exception as Ex:
        print("Exception in URL's List query: ",Ex )
        info =exceptioninfo(Ex,urlApiListQuery)
        insert_data(info)
        return error_response(500, "Failed to fetch URL API list", detail=info, exc=Ex)
