import os
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
root = Path(__file__).resolve().parents[1]
sys.path.append(str(root))
from flask import Blueprint, jsonify, request
from shared.keyVault import connectToKeyVault
from shared.dataBase import queryDw, insert_data, exceptioninfo, connectToDw_AADpwd, connectToDw_AADpwd_Write, updateDw, insertDw
# Logging: central Application Insights logging via the @log_performance decorator
from shared.appinsights_logger import log_performance, error_response

interfacePerf = Blueprint("applicationTelemetry_interfaceStatus", __name__, url_prefix="/api/applicationMetrics")

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

def worker_thread(corepointMonitor, userName, serviceAccountPwd, app, interfaceStatus, exceptionMessage):
    url = "https://corepoint" + corepointMonitor + ".providence.org/monitor/"
    try:
        # Initialize Selenium WebDriver
        chrome_options = Options()
        # In a container (CHROME_BIN set) run headless and sandbox-free so Chromium
        # can start as a non-root user with limited /dev/shm. On a local Windows dev
        # box these env vars are unset, so the original visible-browser behavior stays.
        chromeBinary = os.environ.get("CHROME_BIN")
        if chromeBinary:
            chrome_options.binary_location = chromeBinary
            chrome_options.add_argument("--headless=new")
            chrome_options.add_argument("--no-sandbox")
            chrome_options.add_argument("--disable-dev-shm-usage")
            chrome_options.add_argument("--disable-gpu")
            chrome_options.add_argument("--window-size=1920,1080")
            chrome_options.add_argument("--user-data-dir=/tmp/chrome-data")

        chromeDriverPath = os.environ.get("CHROMEDRIVER_BIN")
        if chromeDriverPath:
            driver = webdriver.Chrome(service=Service(executable_path=chromeDriverPath), options=chrome_options)
        else:
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
                            "Application Family" : applicationFamily,
                            "Corepoint Monitor" : corepointMonitor,
                            "Time Generated" : datetime.now(pytz.UTC),
                        }
                        for column in connectionInfo:
                            columnData = str(column.get_attribute("outerHTML"))
                            if("peer" in columnData):
                                peerIp = column.get_property("innerText")
                                recordDict["Peer IP"] = peerIp
                            elif("idle" in columnData):
                                idleTime = column.get_property("innerText")
                                recordDict["Idle Time"] = idleTime
                            elif("connection-state" in columnData):
                                connectionState = column.get_property("innerText")
                                recordDict["Connection State"] = connectionState
                            elif("queueDepth" in columnData):
                                queueDepth = column.get_property("innerText")
                                pattern = r"[^a-zA-Z0-9]"
                                queueDepth = re.sub(pattern, "0", queueDepth)
                                recordDict["Queue Depth"] = queueDepth
                            elif("<cp-connection-name-renderer" in columnData):
                                driverFetchObject.driver = column
                                interfaceName = driverFetchObject.findElement("class", "text-align").get_property("innerText")
                                recordDict["Interface Name"] = interfaceName
                        data.append(recordDict)
                except Exception as ex:
                    print(ex)
                    if(corepointMonitor not in exceptionMessage):
                        exceptionMessage[corepointMonitor] = {applicationFamily : ""}
                    exceptionMessage[corepointMonitor][applicationFamily] = str(ex)
        interfaceStatus.extend(data)
    except Exception as ex:
        print(f"Exception in thread {corepointMonitor} with error {str(ex)}")
        if(corepointMonitor not in exceptionMessage):
            exceptionMessage[corepointMonitor] = {"driver" : str(ex)}
    finally:
        driver.quit()
        
@interfacePerf.route("/onDemand/interfaceStatus", methods=["POST"])
@log_performance()
def fetchCorepointInterfaceStatus(app=[]):
    interfaceStatus  = []
    exceptionMessage = {}
    if(len(app)==0):
        requestData = request.get_json()
        app = requestData.get("Application family", [])
    #     print(f"[onDemand/interfaceStatus] Raw request payload: {requestData}")
    
    # print(f"[onDemand/interfaceStatus] Received Application family: {app}")
    
    if(len(app)):
        query = f"""Select [Application Family], [Interface Details] from [Interface List] where lower([Application Family]) in ({','.join([f"'{i.lower()}'" for i in app])})"""
        # print(f"[onDemand/interfaceStatus] Query: {query}")
    else:
        return error_response(500, "Application Data missing")
    
    connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    res = queryDw(connectToCrcaMonitoring, query)
    # print(f"[onDemand/interfaceStatus] DB result type: {type(res)}, row count: {len(res) if isinstance(res, list) else 'N/A (str)'}")
    if(isinstance(res, str)):
        # # print(f"[onDemand/interfaceStatus] DB error: {res}")
        return error_response(500, "Failed to fetch interface list from DB")
    
    interfaceMetadata = {}
    for row in res:
        applicationFamily = row[0]
        interfaceDetails = json.loads(row[1])
        interfaceMetadata[applicationFamily] = interfaceDetails
        # print(f"[onDemand/interfaceStatus] Found Application Family: '{applicationFamily}' with {len(interfaceDetails)} interface(s)")
    
    # print(f"[onDemand/interfaceStatus] Total matched families: {len(interfaceMetadata)}")
    # print(f"[onDemand/interfaceStatus] Matched family list: {list(interfaceMetadata.keys())}")
    if(len(interfaceMetadata)==0):
        # print(f"[onDemand/interfaceStatus] No match found - returning 'Interfaces Not onboarded'")
        return error_response(501, "Interfaces Not onboarded")
    
    # Declare and Initialize parameters
    threadArray = []
    corepointMonitors = ["3","4","akprod","wmprod"]
    serviceAccountPwd = connectToKeyVault("serviceAccntPWD")
    userName = "PHSWA\\svc.isaccprovision"
    
    for corepointMonitor in corepointMonitors:
        thread = threading.Thread(target=worker_thread, args=(corepointMonitor, userName, serviceAccountPwd, interfaceMetadata, interfaceStatus, exceptionMessage))
        threadArray.append(thread)
    
    for thread in threadArray:
        thread.start()
    for thread in threadArray:
        thread.join()

    # print(f"[onDemand/interfaceStatus] Total interface rows collected: {len(interfaceStatus)}")
    # print(f"[onDemand/interfaceStatus] Exception monitors: {list(exceptionMessage.keys())}")

    if(exceptionMessage.keys()):
        info = {
            "UserName": "N/A",
            "PageName": "InterfaceMetrics.py",
            "LineNumber": "N/A",
            "ExceptionMessage": json.dumps(exceptionMessage)
        }
        insert_data(info)
    return {"Data": interfaceStatus, "Exceptions": exceptionMessage, "status":200}