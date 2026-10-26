"""Metadata HTTP route slice (consolidated).

Web/routing layer for onboarding/metadata, governance, user-to-support-group
mapping, filters, application-health summary, hospital list, and map-view
endpoints. Business logic lives in ``domains.metadata``, ``domains.metrics.*``
and ``shared.*``; this module only wires HTTP requests to those functions.
"""
import json
import numpy
import pandas
from collections import defaultdict
from datetime import datetime

from flask import Blueprint, request, jsonify, current_app

from shared.dataBase import connectToDw_AADpwd, queryDw
from shared.filters import filtersData
from shared.hospitalList import hospitalList, hospitalListCount
from domains.metadata.getComponentList import serviceList, serviceList_new, urlList, customRequirementList, dbList, dbList_new, fileShareList_new
from domains.metadata.getAppSummary import appSummary
from domains.metadata.updateOnboardedData import updateServicesData, updateUrlData, updateCustomRequirementData
from domains.metrics.infrastructure.azureGovernance import tagCompliance_Subscription, tagCompliance_ServerName
from domains.metrics.application.mapViewTelemetry import mapView

metadata_bp = Blueprint("metadata", __name__)


def _support_group_values(rows):
    return [row[0] for row in rows if row and row[0]]


def _preference_support_groups(raw_value):
    if not raw_value:
        return []

    support_groups = [group.strip() for group in raw_value.split(',') if group.strip()]
    if "IS Applications - Women and Children" in raw_value:
        support_groups = [
            group for group in support_groups
            if group != "IS Applications - Women and Children" or "Case Management" not in group
        ]
        support_groups.append("IS Applications - Women and Children, Case Management")
    return support_groups


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

    return {"status": 200, "Data": {"tableData": table_data, "graphData": graph_data}, "meta": {}, "error": None}


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
    return {"status": 200, "Data": {"tableData": table_data}, "meta": {}, "error": None}


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
    return {"status": 200, "Data": "", "meta": {}, "error": None}, 200


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
    
    
    return {"status": 200, "Data": df.to_json(), "meta": {}, "error": None}


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
    return {"status": 200, "Data": logData["metaData"], "meta": {}, "error": None}


@metadata_bp.route('/api/getOnboardingSummary', methods=["GET"])
def getAppOnboardingSummary():
    logData = {}
    # print(logData)
    data = appSummary()
    print(data)
    logData["appOnboardingSummary"] = data.to_json()
    return {"status": 200, "Data": data.to_json(), "meta": {}, "error": None}


@metadata_bp.route('/api/userToSupportGroupMapping', methods=["POST"])
def userSupportGroupMapping():
    print("came into the function of user group")
    dataPost = request.get_json()
    connectToCrcaMonitoring = connectToDw_AADpwd(
        "sqldb-azure-prod-012.database.windows.net",
        "crcamonitoring",
        "servCRCAMonitoring@providence.org"
    )

    supportGroupPreference = dataPost.get('supportGroupCheck')

    if(supportGroupPreference):
        support_groups = _support_group_values(queryDw(
            connectToCrcaMonitoring,
            """
            select distinct [SupportGroup]
            from [UserToSupportGroupMapping]
            where [SupportGroup] is not null and ltrim(rtrim([SupportGroup])) <> ''
            order by [SupportGroup]
            """
        ))
        return {"status": 200, "Data": support_groups, "meta": {}, "error": None},200  #gives the list of all support groups

    mailAdd = dataPost.get('mailAdd')
    print("The mail address in the dataPost is", mailAdd)
    
    mailAdd = mailAdd.lower()

    queryRbacAdmin = "select HomePageAdmins from RbacAdmins where lower(HomePageAdmins) = ?"
    emails_list = queryDw(connectToCrcaMonitoring, queryRbacAdmin, (mailAdd,))

    if emails_list:
        return {"status": 200, "Data": {"supportGroups": ["All"], "appValidation": "ARIA,Wellsky"}, "meta": {}, "error": None},200
    
    #user prefernece query
    userPreferenceQuery = "select userEmail, SupportGroups, alertManager, AppValidation from UserPreferenceTable where lower(userEmail) = ?"

    #print("The user preference query is ", userPreferenceQuery)
    userPreferenceList = queryDw(connectToCrcaMonitoring, userPreferenceQuery, (mailAdd,))
    #print("The user prefernce list is ", userPreferenceList)
    support_groups = _support_group_values(queryDw(
        connectToCrcaMonitoring,
        """
        select distinct [SupportGroup]
        from [UserToSupportGroupMapping]
        where lower([Email]) = ? and [SupportGroup] is not null and ltrim(rtrim([SupportGroup])) <> ''
        """,
        (mailAdd,)
    ))
    all_support_groups = _support_group_values(queryDw(
        connectToCrcaMonitoring,
        """
        select distinct [SupportGroup]
        from [UserToSupportGroupMapping]
        where [SupportGroup] is not null and ltrim(rtrim([SupportGroup])) <> ''
        """
    ))

    sql_support_groups = []
    app_validation_value = "NoAccess"

    if userPreferenceList and len(userPreferenceList[0]) > 1:
        sql_support_groups_str = userPreferenceList[0][1]
        if len(userPreferenceList[0]) > 3 and userPreferenceList[0][3]:
            app_validation_value = userPreferenceList[0][3]

        if sql_support_groups_str == 'All':
            return {"status": 200, "Data": {"supportGroups": ["All"], "appValidation": app_validation_value}, "meta": {}, "error": None}, 200
        sql_support_groups = _preference_support_groups(sql_support_groups_str)

    combined_support_groups = list(set(support_groups + sql_support_groups))
    if set(combined_support_groups) == set(all_support_groups):
        return {"status": 200, "Data": {"supportGroups": ["All"], "appValidation": app_validation_value}, "meta": {}, "error": None}, 200

    if combined_support_groups:
        return {"status": 200, "Data": {"supportGroups": combined_support_groups, "appValidation": app_validation_value}, "meta": {}, "error": None}, 200

    return {"status": 200, "Data": {"supportGroups": ["All"], "appValidation": app_validation_value}, "meta": {}, "error": None}, 200
    
    return {"status": 200, "Data": {"supportGroups": ["All"], "appValidation": "NoAccess"}, "meta": {}, "error": None},200


@metadata_bp.route("/api/filters", methods = ["POST"])
def filters():
    #Get Data from Post API
    dataPost = request.get_json()
    print(dataPost)
    
    if("filterType" in dataPost):
        if(dataPost['filterType']=="dataFrame"):
            filterDataDF = filtersData(dataPost, "dataFrame")
            return {"status": 200, "Data": filterDataDF.to_json(), "meta": {}, "error": None}
    else:
        filterData = filtersData(dataPost, "filter")
    return {"status": 200, "Data": filterData, "meta": {}, "error": None}


@metadata_bp.route('/api/applicationHealthSummary', methods = ["GET"])
def applicationHealthSummary():
    
    appCI = request.args.get('appCI', "")
    appFamily = request.args.get('appFamily', "")
    supportGroup = request.args.get('supportGroup', "")
    
    sqlQuery = f""" Select ahs.[Application CI]
      ,ahs.[Server Health]
      ,ahs.[Services Health]
      ,ahs.[Interfaces Health]
      ,ahs.[File Storage Health]
      ,ahs.[Application Family]
      ,ahs.[Support Group]
      ,ahs.[Database Health]
      ,al.[Recovery Ranking]
    from [ApplicationHealthPage_Summary] ahs
    left join [Application List] al
      on lower(ahs.[Application CI]) = lower(al.[Application CI]) """
    
    flag = 0
    if(appCI!="" and appCI!="'All'"):
        sqlQuery += f"where ahs.[Application CI] in ({appCI.upper()})"
        flag = 1
    elif(appFamily!="" and appFamily!="'All'"):
        sqlQuery += f"where ahs.[Application Family] in ({appFamily.upper()})"
        flag = 1
    elif(supportGroup!="" and supportGroup!="'All'"):
        sqlQuery += f"where ahs.[Support Group] in ({supportGroup.upper()})"
        flag = 1
    
    if flag==1:
        sqlQuery += " and ahs.[Last Updated] = (Select MAX([Last Updated]) from [ApplicationHealthPage_Summary])"
    else:
        sqlQuery += "where ahs.[Last Updated] = (Select MAX([Last Updated]) from [ApplicationHealthPage_Summary])"
    
    connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    print(datetime.now())
    print(sqlQuery)
    print(datetime.now())
    
    result = queryDw(connectToCrcaMonitoring, sqlQuery)
    df = pandas.DataFrame(numpy.array(result), columns=["Application CI", "Server Health", "Services Health", "Interfaces Health", "File Storage Health", "Application Family", "Support Group", "Database Health", "Recovery Ranking"])
    for i in ["Server Health", "Services Health", "Interfaces Health", "File Storage Health", "Database Health"]:
        print(i)
        df[i] = df[i].apply(lambda x: json.loads(x) if x!="" else {})
    logsData = dict()
    logsData["Application Summary"] = df.to_json()
    print(datetime.now())
    return {"status": 200, "Data": df.to_json(), "meta": {}, "error": None}


@metadata_bp.route('/api/hospitalList', methods=["GET"])
def hospitalData():
    typeOfData = request.args.get('queryType')

    connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    if(typeOfData=="list"):
        hopsitalList_df = hospitalList(connectToCrcaMonitoring)
    else:
        hopsitalList_df = hospitalListCount(connectToCrcaMonitoring)
    logsData = dict()
    logsData["hospitalData"] = hopsitalList_df.to_json()
    return {"status": 200, "Data": hopsitalList_df.to_json(), "meta": {}, "error": None}


@metadata_bp.route('/api/mapView')
def mapViewTelemetry():
    region = request.args.get('region')
    mapViewData = mapView(region)
    return {"status": 200, "Data": mapViewData, "meta": {}, "error": None}
