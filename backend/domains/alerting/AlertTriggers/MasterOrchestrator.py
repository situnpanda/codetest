import json
import subprocess
import time
import sys
from pathlib import Path
import threading
import pandas as pd
import numpy as np
from datetime import datetime
import logging

# Add the parent of 'parent_folder' to sys.path
root = Path(__file__).resolve().parents[2]
sys.path.append(str(root))

from shared.dataBase import queryDw, exceptioninfo, insert_data, connectToDw_AADpwd
from domains.alerting.AlertTriggers.ServerAlerts import serverAlertsMain
from domains.alerting.AlertTriggers.FileStorageAlerts import fileStorageAlertsMain

current_dir = Path(__file__).resolve().parent

log_file = current_dir / "AlertingMasterOrchestrator.log"

logging.basicConfig(
    filename=str(log_file),
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

def worker_process(filename, data, last_run, key):
    try:
        if filename == "ServerAlerts.py":
            serverAlertsMain(data[0], data[1])
        elif filename == "FileStorageAlerts.py":
            fileStorageAlertsMain(data[0], data[1])
            
        last_run[key] = datetime.now()
        logging.info(f"Successfully ran {filename} with Alert Frequency: {data[0]} and Data Aggregation: {data[1]}")
    except Exception as e:
        info = exceptioninfo(e)
        print(f"Exception occurred while running {filename}: {str(e)}")
        info["PageName"] = "MasterOrchestrator.py"
        info["ExceptionMessage"] = f"Exception occurred while running {filename}: {str(e)}"
        logging.error(info["ExceptionMessage"])
        insert_data(info)

def getConfig(type, configurationArray):
    
    try:
        if(type=="ServerAlerts"):
            sqlQuery = f""" Select DISTINCT [Alert Frequency], [Data Aggregation] from [Server Alert Configuration] where [Alert Enabled] = 1
            Union
            Select DISTINCT [Alert Frequency], 5 AS [Data Aggregation] from [Windows Services Alert Configuration] where [Alert Enabled] = 1"""
        elif(type=="DatabaseAlerts"):
            sqlQuery = f""" Select DISTINCT [Alert Frequency], [Data Aggregation] from [Database Alert Configuration] where [Alert Enabled] = 1""" 
        elif(type=="FileStorageAlerts"):
            sqlQuery = f""" Select DISTINCT [Alert Frequency], [Data Aggregation] from [File Storage Alert Configuration] where [Alert Enabled] = 1"""
        
        connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
        res = queryDw(connectionString, sqlQuery)
        if(len(res)):
            configurationArray[type] = []
            for i in res:
                configurationArray[type].append([i[0], i[1]])
        
    except Exception as ex:
        info = exceptioninfo(ex)
        print(f"Exception occurred while getting Configuration of {type}: {str(ex)}")
        info["PageName"] = "MasterOrchestrator.py"
        info["ExceptionMessage"] = f"Exception occurred while getting Configuration of {type}: {str(ex)}"
        logging.error(info["ExceptionMessage"])
        insert_data(info)

def main():
    timeSinceConfig = datetime.now()
    configurationArray = {}
    try:
        with open("last_run.json", "r") as f:
            last_run = json.load(f)
    except FileNotFoundError:
        last_run = {}
    
    while True:
        if(datetime.now() - timeSinceConfig).seconds >= 300 or len(configurationArray.keys())<2:
            threads = []
            for i in ["ServerAlerts", "FileStorageAlerts"]:
                threads.append(threading.Thread(target=getConfig, args=(i, configurationArray)))
            
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join()
                
            timeSinceConfig = datetime.now()
            
        print(configurationArray)
        
        threads = []
        for i in configurationArray.keys():
            for config in configurationArray[i]:
                key = i+"-"+str(config[0])+"-"+str(config[1])
                if key not in last_run or (datetime.now() - last_run[key]).seconds >= config[0]*60:
                    if(len(config)==2):
                        print(f"Running {i} with Alert Frequency: {config[0]} and Data Aggregation: {config[1]}")
                        threads.append(threading.Thread(target=worker_process, args=(i+".py", [config[0], config[1]], last_run, key)))
                # break
            
        for thread in threads:
            thread.start()
        for thread in threads:            
            thread.join()
            
        with open("last_run.json", "w") as f:
            json.dump(last_run, f, indent=4)
            
        time.sleep(1)
    
if __name__ == "__main__":
    main()