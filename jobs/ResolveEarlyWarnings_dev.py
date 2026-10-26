import sys
from pathlib import Path

# Add the parent of 'parent_folder' to sys.path
root = Path(__file__).resolve().parents[1]
sys.path.append(str(root))

from Modules.dataBase import queryDw, exceptioninfo, insert_data, connectToDw_AADpwd, connectToDw_AADpwd_Write, updateDw

EW_TABLE = "[Early Warnings Dev]"
PI_TABLE = "[Potential Issues Dev]"

def resolvePotentialIssues():
    try:
        sqlQuery = f""" Update {PI_TABLE} set [State] = 'Resolved' where [Last Updated] <= DATEADD(minute,-300,GETUTCDATE()) and [State] = 'New'"""
        print(sqlQuery)
        connectionString = connectToDw_AADpwd_Write("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
        res = updateDw(connectionString, sqlQuery,[])
        print(res)
    except Exception as ex:
        info = exceptioninfo(ex)
        raise Exception(info)

def resolveEarlyWarnings():
    try:
        sqlQuery = f""" Update ew set [State] = 'Resolved' from {EW_TABLE} ew where (Select count(*) from {PI_TABLE} pi where pi.[Early Warning ID] = ew.[Early Warning ID] and (pi.[State] <> 'True Positive' and pi.[State] <> 'False Positive' and pi.[State] <> 'Resolved' and pi.[State] <> 'Remove From Monitoring')) = 0 and ew.[State] = 'New'"""
        print(sqlQuery)
        connectionString = connectToDw_AADpwd_Write("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
        res = updateDw(connectionString, sqlQuery,[])
        print(res)
    except Exception as ex:
        info = exceptioninfo(ex)
        raise Exception(info)

try:
    resolvePotentialIssues()
    resolveEarlyWarnings()
        
except Exception as ex:
    print(ex)
    if isinstance(ex.args[0], dict):
        insert_data(ex.args[0])
    else:
        info = exceptioninfo(ex)
        insert_data(info)
        