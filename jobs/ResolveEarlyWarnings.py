import sys
from pathlib import Path

# Add the parent of 'parent_folder' to sys.path
root = Path(__file__).resolve().parents[1] / "backend"
sys.path.append(str(root))

from shared.dataBase import queryDw, exceptioninfo, insert_data, connectToDw_AADpwd, connectToDw_AADpwd_Write, updateDw

def resolvePotentialIssues():
    try:
        sqlQuery = f""" Update [Potential Issues] set [State] = 'Resolved' where [Last Updated] <= DATEADD(minute,-300,GETUTCDATE()) and [State] = 'New'"""
        print(sqlQuery)
        connectionString = connectToDw_AADpwd_Write("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
        res = updateDw(connectionString, sqlQuery,[])
        print(res)
    except Exception as ex:
        info = exceptioninfo(ex)
        raise Exception(info)

def resolveEarlyWarnings():
    try:
        sqlQuery = f""" Update [Early Warnings] set [State] = 'Resolved' where (Select count(*) from [Potential Issues] where [Potential Issues].[Early Warning ID] = [Early Warnings].[Early Warning ID] and ([Potential Issues].[State] <> 'True Positive' and [Potential Issues].[State] <> 'False Positive' and [Potential Issues].[State] <> 'Resolved' and [Potential Issues].[State] <> 'Remove From Monitoring')) = 0 and [State] = 'New'"""
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
        