import json
import pandas
from collections import defaultdict
from datetime import datetime

from flask import Blueprint, request, jsonify, current_app

from shared.dataBase import connectToDw_AADpwd, queryDw
from domains.metadata.getComponentList import serviceList, serviceList_new, urlList, customRequirementList, dbList, dbList_new, fileShareList_new
from domains.metadata.getAppSummary import appSummary
from domains.metadata.updateOnboardedData import updateServicesData, updateUrlData, updateCustomRequirementData
from domains.metrics.infrastructure.azureGovernance import tagCompliance_Subscription, tagCompliance_ServerName

metadata_bp = Blueprint("metadata", __name__)


# Alert manager historical data on selecting app family
@metadata_bp.route('/api/getDataByAppFamily', methods=["POST"])
def appFamilyDetails():
    app_family = request.get_json()

    print(f"Received appFamily data: {app_family}, type: {type(app_family)}")

    app_family_name = app_family['newValue']
    print(type(app_family_name))

    # Establish a database connection using the provided connection string
    connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")

    query = f"""
        SELECT * FROM maintenance_requests WHERE appFamily LIKE '{app_family_name}' AND status LIKE 'pending'
    """
    print(query)

    # Execute the query and fetch the results
    db_response = queryDw(connectionString, query)

    # Prepare table data
    table_data = []
    if db_response:  # Check if db_response is not empty
        for row in db_response:
            servers = json.loads(row[0])  # Assuming the first column contains JSON
            server_names = [server['name'] for server in servers]

            table_data.append({
                "appFamily": row[5],
                "serverNames": server_names,
                "startTime": row[1].isoformat(),
                "endTime": row[2].isoformat(),
                "status": row[4]
            }) 
    else:
        print("No records found for the given app family.")
        table_data = []  # Empty list if no records are found

    print("The table data is:")     
    print(table_data)

    # Get the current date
    current_date = datetime.now()

    # Prepare graph data: Monthly count of responses for the last 12 months
    monthly_counts = defaultdict(int)

    for row in db_response:
        if row:  # Ensure row is valid
            start_time = row[1]  # Extract the startTime (datetime object)
            # Calculate the difference in months between the start time and current time
            months_diff = (current_date.year - start_time.year) * 12 + (current_date.month - start_time.month)
            
            # Include only records within the last 12 months
            if 0 <= months_diff < 12:
                key = (start_time.year, start_time.month)  # Use (year, month) as the key
                monthly_counts[key] += 1

    # Generate graph data for the last 12 months in the correct format
    graph_data = {}

    return jsonify({"tableData": table_data, "graphData": graph_data})


# alert manager historical data for all app families
@metadata_bp.route('/api/getHistoricalDataForAllAppFamilies')
def getHistoricalDataForAllAppFamilies():
    # Establish a database connection using the provided connection string
    connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    query = f"""select serverdetails, starttime, endtime, status, appFamily, userEmail, recurrence from maintenance_requests order by id desc"""
    print(query)

    # Execute the query and fetch the results
    db_response = queryDw(connectionString, query)
    print(db_response)
    # Prepare table data
    table_data = []
    if db_response:  # Check if db_response is not empty
        for row in db_response:
            servers = json.loads(row[0])  # Assuming the first column contains JSON
            server_names = [server['name'] for server in servers]

            table_data.append({
                "appFamily": row[4],
                "serverNames": server_names,
                "startTime": row[1].isoformat(),
                "endTime": row[2].isoformat(),
                "status": row[3],
                "userEmail": row[5] if len(row) > 5 else None,
                "frequency": row[6] if len(row) > 6 else "OneTime"
            }) 
    else:
        print("No records found for the given app family.")
        table_data = []  # Empty list if no records are found

    print("The table data is:")     
    print(table_data)
    return jsonify({"tableData": table_data})


@metadata_bp.route('/api/updateOnboardedData', methods=["POST"])
def updateOnboardedData():
    dataPost = request.get_json()
    dataCategory = dataPost.get("dataCategory")
    updateCategory = dataPost.get("updateCategory")
    data = dataPost.get("data")
    userName = dataPost.get("userName")
    print(data)
    
    if(dataCategory=="services"):
        updateServicesData(updateCategory, data, userName)
    elif(dataCategory=="urls"):
        updateUrlData(updateCategory, data, userName)
    elif(dataCategory=="custom requirement"):
        updateCustomRequirementData(updateCategory, data, userName)
    # print("Hello")
    return "", 200


@metadata_bp.route('/api/governance', methods=['GET'])
def load_json_file():
    d = {
        "ab16a144-47d7-45c5-bcb7-8affc988f8e0":"prod1.json",
        "9592c342-d1fb-477e-8e91-ad39bf00933b":"prod2.json",
        "5467bf57-48b4-4930-b3cb-bf039b259d04":"prod3.json",
        "343a7ee0-5081-4024-82fc-498ee61867a9":"prod4.json",
        "6d590d81-bab9-4b9a-b011-090467b5a9a4":"test1.json"
    }
    df = pandas.DataFrame()
    if 'subscription_id' in request.args:
        print("Here1")
        subscriptionId = request.args.get("subscription_id")
        df = tagCompliance_Subscription(subscriptionId, d, current_app._get_current_object())
        if subscriptionId is None:
            return jsonify({'error': 'Subscription ID is missing in request parameters'}), 400
    elif 'serverName' in request.args:
        serverName = request.args.get("serverName")
        s= ""
        for i in serverName.split(','):
            s+="'"+i+"',"
        s=s[0:-1]
        serverName = s
        # print(serverName)
        df = tagCompliance_ServerName(serverName, d, current_app._get_current_object())
        print(df)
    
    
    logsData= {}
    logsData["tagComplianceData"] = df.to_json()
    return jsonify(logsData)


@metadata_bp.route('/api/getOnboardingList', methods=["POST"])
def getList():
    data = request.get_json()
    appFamily = data["appFamily"] if "appFamily" in data else ""
    appCI = data["appCI"] if "appCI" in data else ""
    type = data["type"] if "type" in data else ""

    logData = {}
    if(type=="services"):
        logData["metaData"] = serviceList(appFamily, appCI)
    elif(type=="services_new"):
        logData["metaData"] = serviceList_new(appFamily, appCI)
    elif(type=="urls"):
        logData["metaData"] = urlList(appFamily, appCI)
    elif(type=="customRequirement"):
        logData["metaData"] = customRequirementList(appFamily, appCI)
    elif(type=="database"):
        logData["metaData"] = dbList(appFamily, appCI)
    elif(type=="database_new"):
        logData["metaData"] = dbList_new(appFamily, appCI)
    elif(type=="fileshare_new"):
        logData["metaData"] = fileShareList_new(appFamily, appCI)
    
    logData["metaData"] = logData["metaData"].to_json()
    return jsonify(logData)


@metadata_bp.route('/api/getOnboardingSummary', methods=["GET"])
def getAppOnboardingSummary():
    logData = {}
    # print(logData)
    data = appSummary()
    print(data)
    logData["appOnboardingSummary"] = data.to_json()
    return jsonify(logData)
