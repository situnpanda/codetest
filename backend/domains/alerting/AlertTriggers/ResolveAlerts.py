import sys
from pathlib import Path

# Add the parent of 'parent_folder' to sys.path
root = Path(__file__).resolve().parents[2]
sys.path.append(str(root))

from shared.dataBase import queryDw, exceptioninfo, insert_data, connectToDw_AADpwd, connectToDw_AADpwd_Write, updateDw

def resolveAlerts(val):
    try:
        sqlQuery = f""" Update [Event Logs] set [Event State] = 'Resolved' where [Alert ID] in {val};
        Update [Alert Logs] set [Alert State] = 'Resolved', [Time Updated] = GETUTCDATE() where [Alert ID] in {val}"""
        print(sqlQuery)
        connectionString = connectToDw_AADpwd_Write("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
        res = updateDw(connectionString, sqlQuery,[])
        print(res)
    except Exception as ex:
        info = exceptioninfo(ex)
        raise Exception(info)

def getToBeResolvedAlerts():
    try:
        sqlQuery = f""" Select [Alert Id] from [Alert Logs] where [Time Generated] <= DATEADD(minute,-30,GETUTCDATE())"""
        connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
        res = queryDw(connectionString, sqlQuery)
        result = []
        for i in res:
            result.append(i[0])
        return result
    except Exception as ex:
        info = exceptioninfo(ex)
        raise Exception(info)
    
try:
    alertIds = getToBeResolvedAlerts()
    if(len(alertIds)>0):
        if(len(alertIds)==1):
            val = "('"+alertIds[0]+"')"
        else:
            val = tuple(alertIds)
        print(val)
        resolveAlerts(val)
        
except Exception as ex:
    print(ex)
    if isinstance(ex.args[0], dict):
        insert_data(ex.args[0])
    else:
        info = exceptioninfo(ex)
        insert_data(info)
        