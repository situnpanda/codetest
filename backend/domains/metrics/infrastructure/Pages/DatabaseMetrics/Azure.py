from shared.dataBase import connectToDw, queryDw, connectToDw_SqlServerPwdScom, connectToDw_AADpwd,exceptioninfo,insert_data
import pandas
import numpy
import pytz
from datetime import datetime, timedelta
from shared.LogAnalytics import queryInLogAnalytics
from flask import jsonify

def azureDbMetics(aggregate,startTime, endTime, appCI):
    dbMetrics = pandas.DataFrame()
    if(appCI==None):
        return dbMetrics
    print(startTime)
    print(endTime)
    if(startTime==""):
        format_string = "%Y-%m-%d %I:%M:%S %p"
        #print(datetime.now())
        currentTime = datetime.now()
        pst = pytz.timezone('America/Los_Angeles')
        endTime = currentTime.astimezone(pst)
        startTime = endTime - timedelta(hours=12)
        startTime = startTime.strftime(format_string)
        endTime = endTime.strftime(format_string)
    else:
        startTime = datetime.strptime(startTime, "%Y-%m-%d %I:%M:%S %p").strftime("%Y-%m-%d %H:%M:%S")
        endTime = datetime.strptime(endTime, "%Y-%m-%d %I:%M:%S %p").strftime("%Y-%m-%d %H:%M:%S")
    
    timeGenerated = f"""between Convert(datetime, '{startTime}') and Convert(datetime, '{endTime}')"""
    try:
        connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")

        if(aggregate=="no"):
            azureDbMetricsQuery = f""" Select db.[TimeGenerated]
                                            ,db.[Server Name]
                                            ,db.[Database Name]
                                            ,db.[Cpu Utilization]
                                            ,db.[Storage Utilization]
                                            ,db.[Session Count]
                                            ,db.[Connection Failure User]
                                            ,db.[Data Write Transaction]
                                            ,db.[Data Read Transaction]
                                            ,db.[Deadlocks]
                                            ,db.[Connection Failure System]
                                            ,db.[Availability]
                                            ,db.[DTU Utilization]
                                            ,db_md.[Application CI]
                                            ,db_md.[Support Group]
                                            ,db_md.[Hosting Type]
                                        from DatabaseMetrics db 
                                        join DatabaseMetaData db_md on db_md.[Sql Server Name] = db.[Server Name] and db.[Database Name] = db_md.[Database Name]
                                        where db_md.[Hosting Type] like 'Cloud' and TimeGenerated {timeGenerated} and lower(db_md.[Application CI]) in ({appCI}) order by db.[TimeGenerated] asc"""
        elif(aggregate=="yes"):
            azureDbMetricsQuery = f""" Select db.[TimeGenerated]
                                        ,db.[Server Name]
                                        ,db.[Database Name]
                                        ,db.[Cpu Utilization]
                                        ,db.[Storage Utilization]
                                        ,db.[Session Count]
                                        ,db.[Connection Failure User]
                                        ,db.[Data Write Transaction]
                                        ,db.[Data Read Transaction]
                                        ,db.[Deadlocks]
                                        ,db.[Connection Failure System]
                                        ,db.[Availability]
                                        ,db.[DTU Utilization]
                                        ,db_md.[Application CI]
                                        ,db_md.[Support Group]
                                        ,db_md.[Hosting Type]
                                    from DatabaseMetrics db 
                                    join DatabaseMetaData db_md on db_md.[Sql Server Name] = db.[Server Name] and db.[Database Name] = db_md.[Database Name]
                                    where db_md.[Hosting Type] like 'Cloud' and TimeGenerated = (Select max(TimeGenerated) from DatabaseMetrics) and db_md.[Application CI] in ({appCI})"""
        # print(azureServicesQuery)
        try:
            azureDbMetricsData = queryDw(connectToCrcaMonitoring, azureDbMetricsQuery)
            if(len(azureDbMetricsData)>0):
                dbMetrics = pandas.DataFrame(numpy.array(azureDbMetricsData), columns=[	'TimeGenerated','Server Name','Database Name','Cpu Utilization','Storage Utilization','Session Count','Connection Failure User','Data Write Transaction','Data Read Transaction','Deadlocks','Connection Failure System','Availability','DTU Utilization','Application CI','Support Group','Hosting Type'])
                dbMetrics["TimeGenerated"] = dbMetrics["TimeGenerated"].dt.strftime('%Y-%m-%d %H:%M')
            return dbMetrics
        except Exception as Ex:
            print("Exception in DB Metrics azure execution: ",Ex )
            raise Exception("Exception in azure DB Metrics execution:"+Ex)
            info =exceptioninfo(Ex,azureDbMetricsQuery)
            insert_data(info)
            return jsonify({'error':str(Ex)}),500      
    except Exception as Ex:
        print("Exception in connecting to crcamonitoring database: ",Ex )
        raise Exception("Exception in connecting to crcamonitoring database for azure DB Metrics execution:"+Ex)
        info =exceptioninfo(Ex)
        insert_data(info)
        return jsonify({'error':str(Ex)}),500
            
