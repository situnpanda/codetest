import sys
from pathlib import Path
import pandas as pd
import numpy as np
import threading
import requests
import uuid
import time
from datetime import datetime, timedelta
import pytz
import json
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
import re

# Add the parent of 'parent_folder' to sys.path
root = Path(__file__).resolve().parents[1] / "backend"
sys.path.append(str(root))
from shared.keyVault import connectToKeyVault
from shared.dataBase import queryDw, insert_data, exceptioninfo, connectToDw_AADpwd, connectToDw_AADpwd_Write, updateDw, insertDw

class PerformActionOnElements:
    def __init__(self, element, value):
        self.element = element
        self.value = value
        
    def clickElement(self):
        startTime = datetime.now()
        while True:
            endTime = datetime.now()
            try:
                self.element.click()
                break
            except Exception as ex:
                if((endTime-startTime).total_seconds() > 120):
                    raise Exception(f"Unable to Click Element {self.Element}")
    
    def clearElement(self):
        startTime = datetime.now()
        while True:
            endTime = datetime.now()
            try:
                self.element.clear()
                break
            except Exception as ex:
                if((endTime-startTime).total_seconds() > 120):
                    raise Exception(f"Unable to Clear Data in Element {self.Element}")
                
    def sendKeys(self, typeOfKey = "enter"):
        startTime = datetime.now()
        while True:
            endTime = datetime.now()
            try:
                self.element.send_keys(self.value)
                if(typeOfKey=="enter"):
                    self.element.send_keys(Keys.RETURN)
                break
            except Exception as ex:
                if((endTime-startTime).total_seconds() > 120):
                    raise Exception(f"Unable to Send Keys to Element {self.Element}")

class FetchElements:
    def __init__(self, driver):
        self.driver = driver
        
    def findElement(self, locatorType, locatorValue):
        startTime = datetime.now()
        while True:
            endTime = datetime.now()
            try:
                if(locatorType == "id"):
                    element = self.driver.find_element(By.ID, locatorValue)
                elif(locatorType == "class"):
                    element = self.driver.find_element(By.CLASS_NAME, locatorValue)
                elif(locatorType == "name"):
                    element = self.driver.find_element(By.NAME, locatorValue)
                elif(locatorType == "xpath"):
                    element = self.driver.find_element(By.XPATH, locatorValue)
                elif(locatorType == "classes"):
                    element = self.driver.find_elements(By.CLASS_NAME, locatorValue)
                elif(locatorType == "tag"):
                    element = self.driver.find_elements(By.TAG_NAME, locatorValue)
                return element
            except Exception as ex:
                if((endTime-startTime).total_seconds() > 120):
                    raise Exception(f"Unable to find Element with {self.locatorType} and value {self.locatorValue}")   

def worker_thread(corepointMonitor, userName, serviceAccountPwd, app):
    url = "https://corepoint" + corepointMonitor + ".providence.org/monitor/"
    global interfaceStatus
    try:
        # Initialize Selenium WebDriver
        chrome_options = Options()
        # chrome_options.add_argument("--headless")
        # chromeDriverPath = r".\chromedriver-win64_v146\chromedriver.exe"
        # service = Service(executable_path=chromeDriverPath)
        driver = webdriver.Chrome(options=chrome_options)
        
        driver.get(url)
        driverActionObject = PerformActionOnElements("","")
        driverFetchObject = FetchElements(driver)
        
        # Login to Corepoint
        userNameElement = driverFetchObject.findElement("id", "username")
        driverActionObject.element = userNameElement
        driverActionObject.value = userName
        driverActionObject.sendKeys("no-enter")
        
        passwordElement = driverFetchObject.findElement("id", "password")
        driverActionObject.element = passwordElement
        driverActionObject.value = serviceAccountPwd
        driverActionObject.sendKeys("no-enter")
        
        loginButton = driverFetchObject.findElement("id", "login-button")
        driverActionObject.element = loginButton
        driverActionObject.clickElement()
        
        # Search for Interface and fetch details
        data = []
        for applicationFamily in app:
            for interfaceName in app[applicationFamily]:
                try:
                    searchElement = driverFetchObject.findElement("id", "name-filter")
                    driverActionObject.element = searchElement
                    driverActionObject.clearElement()
                    driverActionObject.value = interfaceName
                    driverActionObject.sendKeys()
                    time.sleep(3)
                    tableElement = driverFetchObject.findElement("classes", "dx-datagrid-table")
                    driverFetchObject.driver = tableElement[1]
                    tableContents = driverFetchObject.findElement("tag", "tr")
                    
                    for record in tableContents:
                        driverFetchObject.driver = record
                        connectionInfo = driverFetchObject.findElement("classes", "dx-template-wrapper")
                        recordDict = {
                            "ApplicationFamily" : applicationFamily,
                            "CorepointMonitor" : corepointMonitor,
                            "TimeGenerated" : datetime.now(pytz.UTC),
                        }
                        for column in connectionInfo:
                            columnData = str(column.get_attribute("outerHTML"))
                            if("peer" in columnData):
                                peerIp = column.get_property("innerText")
                                recordDict["PeerIP"] = peerIp
                            elif("idle" in columnData):
                                idleTime = column.get_property("innerText")
                                recordDict["IdleTime"] = idleTime
                            elif("connection-state" in columnData):
                                connectionState = column.get_property("innerText")
                                recordDict["ConnectionState"] = connectionState
                            elif("queueDepth" in columnData):
                                queueDepth = column.get_property("innerText")
                                pattern = r"[^a-zA-Z0-9]"
                                queueDepth = re.sub(pattern, "0", queueDepth)
                                recordDict["QueueDepth"] = queueDepth
                            elif("<cp-connection-name-renderer" in columnData):
                                driverFetchObject.driver = column
                                interfaceName = driverFetchObject.findElement("class", "text-align").get_property("innerText")
                                recordDict["InterfaceName"] = interfaceName
                        data.append(recordDict)
                except Exception as ex:
                    print(ex)
        interfaceStatus.extend(data)
    except Exception as ex:
        print(f"Exception in thread {corepointMonitor} with error {str(ex)}")
    finally:
        driver.quit()
            
def fetchCorepointInterfaceStatus(app=[]):
    if(len(app)==0):
        # Get All Mappings from DB
        query = f"""Select [Application Family], [Interface Details] from [Interface List]"""
    else:
        query = f"""Select [Application Family], [Interface Details] from [Interface List] where lower([Application Family]) in ({','.join([f"'{i.lower()}'" for i in app])})"""
    
    connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    res = queryDw(connectToCrcaMonitoring, query)
    interfaceMetadata = {}
    for row in res:
        applicationFamily = row[0]
        interfaceDetails = json.loads(row[1])
        interfaceMetadata[applicationFamily] = interfaceDetails
        
    # Declare and Initialize parameters
    threadArray = []
    corepointMonitors = ["3","4","akprod","wmprod"]
    serviceAccountPwd = connectToKeyVault("serviceAccntPWD")
    userName = "PHSWA\\svc.isaccprovision"
    
    for corepointMonitor in corepointMonitors:
        thread = threading.Thread(target=worker_thread, args=(corepointMonitor, userName, serviceAccountPwd, interfaceMetadata))
        threadArray.append(thread)
    
    for thread in threadArray:
        thread.start()
    for thread in threadArray:
        thread.join()
    print()

interfaceStatus  = []
exceptionMessage = []
if __name__ == "__main__":
    fetchCorepointInterfaceStatus(app=["deviceconx"])