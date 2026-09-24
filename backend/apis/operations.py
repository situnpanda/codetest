"""Operational route slice (VSA): server/network/interface/alert-manager/maintenance.

Handlers moved verbatim from main.py. Registered via `operations_bp`. Behavior unchanged.
"""
import os
import json
import pyodbc
import requests
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

import pandas

from flask import Blueprint, request, jsonify

from shared.auth import validateToken
from shared.cache_paths import cache_path, userToSupportGroupMappingJsonPath
from shared.filters import getFiltersFromCache
from shared.variables import globalVariables
from shared.dataBase import (
    connectToDw_AADpwd,
    connectToDw_AADpwd_Write,
    connectToDw_SqlServerPwd,
    queryDw,
)
from domains.metrics.application.applicationTelemetry import interfacesLogsData
from domains.metrics.infrastructure.infrastructureTelemetry import (
    sendEmail,
    userfilterAlertManager,
    diskdetails_df,
    find_servers_by_name,
    alertfilterdf,
)

operations_bp = Blueprint("operations", __name__)


@operations_bp.route('/api/serverDownDetails', methods = ["POST"])
def serverDownDetails():  
    dataPost = request.get_json()
    aggregate = dataPost.get('aggregate')
    filter = dataPost.get('filters')
    #serverName = dataPost.get('serverName')
    start_time = dataPost.get('start_time')
    end_time = dataPost.get('end_time')

    print("The aggreate is ", aggregate)
    logsData = dict()
    serverAlertsListJsonPath = os.path.join(cache_path, "serverAlertsList.json")

    print("The filter for server down ", filter)
    #print("The server name is ", serverName)
    print("The starttime is ", start_time)
    print("The endTime is ", end_time)

    if aggregate=="forGAC":
        print("yes the agg is for gac")
    if os.path.exists(serverAlertsListJsonPath):
        print("Aggregate")
        print("The server alert path exists")
        with open(serverAlertsListJsonPath, "r") as json_file:

            server_alerts_df = json_file.read()
            server_alerts_df = json.loads(server_alerts_df)
            print("The type of server alerts df is ", type(server_alerts_df["Data"]))
            server_alerts_df = pandas.read_json(server_alerts_df["Data"])
            print("The server alerts df is ")
            print(server_alerts_df)
            print("Rows with NaT/null in DownTimeEnd:")
            print(server_alerts_df[server_alerts_df["DownTimeEnd"].isna()])
            #server_alerts_df["TimeGenerated"] = pandas.to_datetime(server_alerts_df["TimeGenerated"], errors='coerce')
            server_alerts_df["DownTimeStart"] = pandas.to_datetime(server_alerts_df["DownTimeStart"], errors="coerce")
            server_alerts_df["DownTimeEnd"] = pandas.to_datetime(server_alerts_df["DownTimeEnd"], errors="coerce")
            print("The original srtarttime and endtime are",start_time, end_time)
            start_time = datetime.strptime(start_time, "%Y-%m-%d %I:%M:%S %p")
            start_time = datetime.strftime(start_time, "%Y-%m-%d %H:%M:%S")
            start_time = pandas.to_datetime(start_time)

            end_time = datetime.strptime(end_time, "%Y-%m-%d %I:%M:%S %p")
            end_time = datetime.strftime(end_time, "%Y-%m-%d %H:%M:%S")
            end_time = pandas.to_datetime(end_time)
            print("The formated starttime and endtime are",start_time, end_time)

            appCI = getFiltersFromCache(filter, "appCI")  #check
            #print("The appci from cache is", appCI)

            appCI = [i.strip() for i in appCI.replace("'","").split(",")]

            #alerts_df_sample = server_alerts_df[(server_alerts_df["TimeGenerated"]>=start_time) & (alerts_df["TimeGenerated"]<=end_time)]
            server_alerts_df_sample = server_alerts_df[
                (server_alerts_df["DownTimeStart"] >= start_time) &
                (
                    (server_alerts_df["DownTimeEnd"].isna()) |
                    (server_alerts_df["DownTimeEnd"] <= end_time)
                )
            ]
            print("The server alerts df sample is", server_alerts_df_sample)
            #alerts_df_sample["TimeGenerated"] = alerts_df_sample["TimeGenerated"].dt.strftime('%Y-%m-%d %H:%M')
            server_alerts_df_sample["DownTimeStart"] = server_alerts_df_sample["DownTimeStart"].dt.strftime('%Y-%m-%d %H:%M')
            server_alerts_df_sample["DownTimeEnd"] = server_alerts_df_sample["DownTimeEnd"].dt.strftime('%Y-%m-%d %H:%M')


            print("The alerts df before processing is", server_alerts_df_sample)

            # Normalize AppCI values and filter
            server_alerts_df_sample["AppCI_copy"] = server_alerts_df_sample["AppCI"].str.lower().str.strip()
            server_alerts_df_sample = server_alerts_df_sample[server_alerts_df_sample["AppCI_copy"].isin(appCI)]
            print("The main sample is")
            # print(server_alerts_df_sample)
            # Convert final filtered data to JSON
            logsData["ServersData"] = server_alerts_df_sample.to_json()

            # Count number of entries
            json_str = logsData["ServersData"]
            json_obj = json.loads(json_str)


            some_column = next(iter(json_obj))
            count_entries = len(json_obj[some_column])

            print(f"Number of entries in cache: {count_entries}")
            #print("The logs data is ")
            #print(logsData["ServersData"])
            return jsonify(logsData)    

    return jsonify({})

@operations_bp.route('/api/appValidationAlertConfig', methods=["POST"])
def app_validation_alert_config():
    data = request.get_json()
    app_cis = data.get('appCIs', [])
    if not app_cis or not isinstance(app_cis, list):
        return jsonify({"error": "appCIs must be a non-empty list"}), 400

    app_cis_sql = ",".join([f"'{ci}'" for ci in app_cis])
    query = f"""
        SELECT [AppFamily], [AppCI], [ServerName], [MaintenanceEnabled]
        FROM [AppValidationAlertConfiguration]
        WHERE [AppCI] IN ({app_cis_sql})
    """
    connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    result = queryDw(connectionString, query)

    config_data = []
    if result:
        for row in result:
            config_data.append(dict(zip([
                "AppFamily", "AppCI", "ServerName", "MaintenanceEnabled"
            ], row)))

    return jsonify({"data": config_data})

@operations_bp.route('/api/dcxPortHealthAlertsGAC', methods = ["POST"])
def dcxPortHealthAlertsGAC():
    dataPost = request.get_json()
    aggregate = dataPost.get('aggregate')
    filter = dataPost.get('filters')
    start_time = dataPost.get('start_time')
    end_time = dataPost.get('end_time')
    appCI = getFiltersFromCache(filter, "appCI")  #check
    # print("THe appCI for backend is", appCI)


    # print("The aggreate dcx is ", aggregate)
    logsData = dict()

    # print("The filter dcx is ", filter)
    #print("The server name is ", serverName)
    # print("The starttime dcx is ", start_time)
    # print("The endTime dcx is ", end_time)
    connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    startTime = datetime.strptime(start_time, "%Y-%m-%d %I:%M:%S %p").strftime("%Y-%m-%d %H:%M:%S")
    endTime = datetime.strptime(end_time, "%Y-%m-%d %I:%M:%S %p").strftime("%Y-%m-%d %H:%M:%S")
    print("The start time format dcx is", startTime)
    print("The endTime format dcx is", endTime)
    appCI = getFiltersFromCache(filter, "appCI")  #check
    # print("The app cis are ", appCI)


    timeGenerated = f"""between Convert(datetime, '{startTime}') and Convert(datetime, '{endTime}')"""


    query = f"""SELECT  alertMessage, resourceId, alertType, TimeGenerated, AppCI FROM CustomAlerts WHERE TimeGenerated IS NOT NULL AND alertType like 'Port' and TimeGenerated {timeGenerated}"""
    print("The dcx gac query is ", query)
    result = queryDw(connectionString, query)

    print("The reuslt is", result)


    formatted_result = []
    if result:
        for row in result:
            alertMessage, resourceId, alertType, timeGenerated, AppCI = row

            # Filter by AppCI
            if AppCI.lower() != 'deviceconx-phs':
                continue  # Skip this row

            # try:
            #     #parsed_resource = json.loads(resourceType)
            #     resource_value = parsed_resource.get("server", resourceType)
            # except (json.JSONDecodeError, TypeError):
            #     resource_value = resourceType

            formatted_result.append({
                "alertMessage": alertMessage,
                "resourceType": resourceId,
                "alertType": alertType,
                "TimeGenerated": timeGenerated.strftime("%Y-%m-%d %H:%M:%S") if timeGenerated else None,
                "AppCI": AppCI
            })
            print("formatted_result",formatted_result)
    print("port alerts", formatted_result)    
    return jsonify({"data": formatted_result}), 200

@operations_bp.route('/api/networkServerCountByAppCI', methods=["POST"])
def networkServerCountByAppCI():
    dataPost = request.get_json()
    filter = dataPost.get('filters')
    
    logsData = dict()
    
    connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    
    query = """
        SELECT
            sl.[Application CI],
            COUNT(DISTINCT nl.ServerNameExtracted) AS ServerCount
        FROM
        (
            SELECT
                SUBSTRING(
                    ResourceName,
                    CHARINDEX('ServerName/', ResourceName) + LEN('ServerName/'),
                    LEN(ResourceName)
                ) AS ServerNameExtracted
            FROM NetworkList
            WHERE ResourceName LIKE '%ServerName/%'
        ) nl
        INNER JOIN [Server List] sl
            ON nl.ServerNameExtracted = sl.[Server Name]
        GROUP BY
            sl.[Application CI]
        ORDER BY
            sl.[Application CI]
    """
    
    print("The networkServerCountByAppCI query is:", query)
    result = queryDw(connectionString, query)
    print("The result is:", result)
    
    formatted_result = []
    if result:
        for row in result:
            applicationCI, serverCount = row
            formatted_result.append({
                "ApplicationCI": applicationCI,
                "ServerCount": serverCount
            })
    
    print("networkServerCountByAppCI result:", formatted_result)
    return jsonify({"data": formatted_result}), 200

@operations_bp.route("/api/logServiceRequests", methods=["POST"])
def logServiceRequests():
    print("inside log requests")
    dataPost = request.get_json()
    name = dataPost.get('userName')
    serviceType = dataPost.get('serviceType')
    supportGroups = dataPost.get('supportGroups')
    status = dataPost.get('status')

    print("The existing pyodbc drivers are:", pyodbc.drivers())

    connectionString = connectToDw_AADpwd_Write("sqldb-azure-prod-012.database.windows.net","crcamonitoring","servCRCAMonitoring@providence.org")
    print("The connection string is ", connectionString)
    
    conn = pyodbc.connect(connectionString)

    try:
        
        cursor = conn.cursor()
        insert_query = """insert into ServiceRequest (TimeGenerated, [User Name], [Service Type], [Data], [Status]) VALUES (?, ?, ?, ?, ?)"""
        cursor.execute(insert_query, (datetime.now(),name,serviceType,supportGroups,status))
        conn.commit()
        sendEmail(name, supportGroups)
        return jsonify({"message": "Request logged successfully!"}), 200

    except Exception as e:
        print(f"Error inserting request: {e}")
        return jsonify({"status": "error", "message": "There was an error submitting the request. Please try again!"}), 500

    finally:
        if conn:
            conn.close()

    return jsonify({"message": "There was an error submitting the request. Please try again!"})

@operations_bp.route('/api/userToSupportGroupMapping', methods=["POST"])
def userSupportGroupMapping():
    print("came into the functino of user group")
    dataPost = request.get_json()

    supportGroupPreference = dataPost.get('supportGroupCheck')

    if(supportGroupPreference):
        #print("the support group preference is", supportGroupPreference)
        with open(userToSupportGroupMappingJsonPath, "r") as json_file:
            mapping_data = json.load(json_file)

        support_groups = list({
            record.get("SupportGroup")
            for record in mapping_data
            if record.get("SupportGroup")
        })    

        #print("The support groups are", support_groups)
        return jsonify(support_groups),200  #gives the list of all support groups

    mailAdd = dataPost.get('mailAdd')
    #mailAdd = "sunitha.bist@providence.org"
    print("The mail address in the dataPost is", mailAdd)
    
    mailAdd = mailAdd.lower()

    connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    queryRbacAdmin = f"""select HomePageAdmins from RbacAdmins where HomePageAdmins like lower('{mailAdd}')"""
    emails_list = queryDw(connectToCrcaMonitoring, queryRbacAdmin)

    if emails_list:
        return jsonify({"supportGroups": ["All"], "appValidation": "ARIA,Wellsky"}),200
    
    #user prefernece query
    userPreferenceQuery = f"""select userEmail, SupportGroups, alertManager, AppValidation from UserPreferenceTable where userEmail like lower('{mailAdd}')"""

    #print("The user preference query is ", userPreferenceQuery)
    userPreferenceList = queryDw(connectToCrcaMonitoring, userPreferenceQuery)
    #print("The user prefernce list is ", userPreferenceList)
    #connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    if os.path.exists(userToSupportGroupMappingJsonPath):
        # print("The path exists")
        with open(userToSupportGroupMappingJsonPath, "r") as json_file:
            mapping_data = json.load(json_file)
        # Extract only support group names for the given email
        support_groups = list({
            record.get("SupportGroup")
            for record in mapping_data
            if str(record.get("Email", "")).lower() == mailAdd and record.get("SupportGroup")
        })  
        sql_support_groups = []
        app_validation_value = "NoAccess"  

        if userPreferenceList and len(userPreferenceList[0]) > 1:
            sql_support_groups_str = userPreferenceList[0][1]
            # Get app validation value if it exists (4th column, index 3)
            if len(userPreferenceList[0]) > 3 and userPreferenceList[0][3]:
                app_validation_value = userPreferenceList[0][3]
            
            #print("The sql support group is", sql_support_groups_str)
            if sql_support_groups_str == 'All':
                #print("Came inside the all condition")
                return jsonify({"supportGroups": ["All"], "appValidation": app_validation_value}), 200
            if sql_support_groups_str:
                sql_support_groups = [grp.strip() for grp in sql_support_groups_str.split(',') if grp]
                if("IS Applications - Women and Children" in sql_support_groups_str):
                    sql_support_groups = [grp for grp in sql_support_groups if grp != "IS Applications - Women and Children" or "Case Management" not in grp]
                    sql_support_groups.append("IS Applications - Women and Children, Case Management")
                # exception_support_group = "IS Applications - Women and Children, Case Management"
                # if exception_support_group in sql_support_groups_str:
                #     sql_support_groups_str = sql_support_groups_str.replace(exception_support_group, "").replace(",,", ",").strip(",")
 
        # Combine with existing list from JSON
        combined_support_groups = list(set(support_groups + sql_support_groups))
        all_support_groups = list({
            record.get("SupportGroup")
            for record in mapping_data
            if record.get("SupportGroup")
        })
        #print("Final combined support groups are:", combined_support_groups)
        if set(combined_support_groups) == set(all_support_groups):
            #print("Support groups match exactly.")
            return jsonify({"supportGroups": ["All"], "appValidation": app_validation_value}), 200

        if combined_support_groups:
            return jsonify({"supportGroups": combined_support_groups, "appValidation": app_validation_value}), 200  
        
        return jsonify({"supportGroups": ["All"], "appValidation": app_validation_value}), 200
    
    else:
        app_validation_value = "NoAccess"
        if userPreferenceList and len(userPreferenceList[0]) > 3 and userPreferenceList[0][3]:
            app_validation_value = userPreferenceList[0][3]
        return jsonify({"supportGroups": ["All"], "appValidation": app_validation_value}), 200
    
    return jsonify({"supportGroups": ["All"], "appValidation": "NoAccess"}),200

@operations_bp.route('/api/dcxPortWatcher', methods=["POST"])
def dcxPortWatcher():
    dataPost = request.get_json()
    mode = dataPost.get("mode")

    if mode == "allServers":
        print("Yes the mode is correct for all servers")
        serverName = dataPost.get('serverName')
        print("the servers type is",type(serverName))
        print("The server names in dcx are", serverName)
        if serverName and isinstance(serverName, str):
            serverName = [name.strip() for name in serverName.replace("'","").split(",") if name.strip()]
            print("The server name is", serverName)
        externalApi = "https://dcxportwatcher.providence.org/api/api/DataFetch/Server"
        try:
            # Fetch server status data
            response = requests.get(externalApi,verify=False)
            response.raise_for_status()
            server_status_list = response.json()
            print("")

            print("The all server status are", server_status_list)

            filtered_server_status = []
            if serverName:
                print("yes the server name")
                filtered_server_status = [
                    server for server in server_status_list 
                    if server.get('server') == serverName
                ]
                print("The filtered server status are:", filtered_server_status)
            else:
                filtered_server_status = server_status_list

            if serverName:
                print("yes the server name")
                if isinstance(serverName, list):
                    #print("in if conditon")
                    filtered_server_status = [
                        server for server in server_status_list 
                        if server.get('server') in serverName
                    ]

                else:
                    #print("else cond")
                    filtered_server_status = [
                        server for server in server_status_list 
                        if server.get('server') == serverName
                    ]
            else:
                filtered_server_status = server_status_list
            #print("the filtered servers are in dcx ",filtered_server_status)   

            # Raw Server to Location mapping
            server_location_mapping_raw = {
                "devicappvevn2rg": "AK",
                "devicappvgsbqgv": "AK",
                "devicappv97889v": "CT",
                "devicappvj7glso": "CT",
                "devicappvows6vq": "MT",
                "devicappvq5vy63": "MT",
                "devicappv6dxb24": "PT",
                "devicappv9qldlm": "PT"
            }

            # Create Location ➔ List of Servers mapping
            location_to_servers = defaultdict(list)
            for server, location in server_location_mapping_raw.items():
                location_to_servers[location].append(server)

            # Prepare final output
            final_response = {
                "ServerStatus": filtered_server_status,
                "LocationToServersMapping": location_to_servers
            }
            print("The final response is", final_response)

            return jsonify(final_response), 200

        except Exception as e:
            return jsonify({"error": str(e)}), 500
    

    elif mode == "portDetails":
        print("Yes the mode is correct for all ports")

        servers = dataPost.get("servers", []) 
        condition = dataPost.get("condition", "")
        print("The condition in the dcx backend is ", condition)
        #servers = ["devicappv6dxb24", "devicappv9qldlm", "devicappv97889v"]
        #condition = 'warning'
        if not servers or not condition:
            return jsonify({"error": "Both 'servers' and 'condition' are required."}), 200
        
        EXTERNAL_API_URL = "https://dcxportwatcher.providence.org/api/api/DataFetch/Packet"

        def fetch_server_data(server, condition):
            params = {
                "server": server,
                "condition": condition
            }
            try:
                response = requests.get(EXTERNAL_API_URL, params=params, verify=False)
                response.raise_for_status()

                json_data = response.json()

                if isinstance(json_data, list):
                    return server, json_data
                else:
                    return server, [json_data]

            except requests.exceptions.RequestException as e:
                return server, [{"error": str(e)}]

        if condition == "critical":
            condition_list = ["critical", "warning", "okay"]
        elif condition == "warning":
            condition_list = ["warning", "okay"]
        else:
            condition_list = [condition]

        max_threads = 3
        results = defaultdict(list)

        with ThreadPoolExecutor(max_workers=max_threads) as executor:
            futures = {
                executor.submit(fetch_server_data, server, cond): (server, cond)
                for server in servers
                for cond in condition_list
            }

            for future in as_completed(futures):
                try:
                    server, data_list = future.result()  
                    results[server].extend(data_list)
                except Exception as e:
                    server, _ = futures[future]
                    results[server].append({"error": str(e)})

        return jsonify(dict(results))
    
    elif mode == "graphDetails":
        print("Yes the mode is correct for all ports")

        port = dataPost.get("port")
        time = dataPost.get("time")
        servers = dataPost.get("servers", []) 
        #condition = dataPost.get("condition", "")

        if not port or not time or not servers:
            return jsonify({"error": "Fields 'port', 'time', and 'server' are required."}), 200

        EXTERNAL_API_URL = "https://dcxportwatcher.providence.org/api/api/DataFetch/Graph"


        # Function to fetch graph data for a single server
        def fetch_server_graph_data(server, port, time):
            params = {
                "server": server,
                "port": port,
                "time": time
            }
            try:
                response = requests.get(EXTERNAL_API_URL, params=params, verify=False)
                response.raise_for_status()
                return response.json()
            except requests.exceptions.RequestException as e:
                return {"error": str(e), "server": server}

        max_threads = 3

        with ThreadPoolExecutor(max_workers=max_threads) as executor:
            futures = {
                executor.submit(fetch_server_graph_data, server, port, time): server
                for server in servers
            }

            results = {}
            for future in as_completed(futures):
                server = futures[future]
                try:
                    data = future.result()
                    results[server] = data
                except Exception as e:
                    results[server] = {"error": str(e)}

        return jsonify(results), 200

    return jsonify({"error": "No conditions matched"})


@operations_bp.route('/api/interfaceHealthLogs', methods=["POST"])
def interfaceLogsFinal():
    
    dataPost = request.get_json()
    aggregateBool = dataPost.get('aggregate')    # Retrieve the value of the 'limit' parameter
    start_time = dataPost.get('start_time')  # Retrieve the value of the 'start_time' parameter
    end_time = dataPost.get('end_time')  # Retrieve the value of the 'end_time' parameter
    filter = dataPost.get('filters')
    
    appFamily = getFiltersFromCache(filter, "appFamily")

    connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")

    interfaces_df = interfacesLogsData(connectToCrcaMonitoring, globalVariables.apmNumbers,start_time,end_time, aggregateBool, appFamily)
    print(interfaces_df)
    # Check if DataFrame is empty
    if interfaces_df['Interfaces'].empty:
        response = {
            "Interfaces": [],
            "Total Interfaces": 0
        }
    else:
        interfaces_df['Interfaces']['TimeGenerated'] = interfaces_df['Interfaces']['TimeGenerated'].dt.strftime('%Y-%m-%d %H:%M:%S')
        # Convert the DataFrame to JSON format
        interfaces_json = interfaces_df['Interfaces'].to_dict(orient="records")
        
        # Calculate distinct count of InterfaceName
        total_interfaces = interfaces_df['Interfaces']['InterfaceName'].nunique()

        # Prepare the final response
        response = {
            "Interfaces": interfaces_json,
            "Total Interfaces": total_interfaces
        }
    print(response)  # Log for debugging
    return jsonify(response)


@operations_bp.route('/api/diskSkuRecommendation', methods=["POST"])
def diskskurecommendation():
    connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    
    # Get the VM name from the request JSON
    request_data = request.get_json()
    vm_name = request_data.get('vm')  # Extract the vm name from the request
    print(f"Fetching details for VM: {vm_name}")

    # Call the function with the VM name
    vmdetails_df = diskdetails_df(connectToCrcaMonitoring, vm_name)
    if(vmdetails_df is None):
       return jsonify({"message": "VM SKU details not found"}), 200
    
    # Convert the DataFrame to JSON and return
    json_data = vmdetails_df.to_json(orient="records")

    return jsonify(json.loads(json_data))


@operations_bp.route('/api/getUserWatchlistAlertManager', methods=['POST'])
def getUserWatchListAlertManager():

    connectToServicePerf = connectToDw_SqlServerPwd("spidedbsv6c6b60.wa.providence.org\\SPIDER", "ServicePerf_DW","servCRCAMonitor")
    user_filters = userfilterAlertManager(connectToServicePerf)
    return user_filters


@operations_bp.route('/api/submitMaintenance', methods=['POST'])
def submit_maintenance():
    try:
        
        auth = request.headers.get("Authorization")
        if not (auth and len(auth.split(" ")) == 2 and auth.split(" ")[0] == "Bearer"):
            return {"Message": "Invalid Token"}, 501
        
        token = auth.split(" ")[1]
        res,emailId = validateToken(token)
        if not res:
            return {"Message": "Invalid Token"}, 501
 
    except Exception as e:
        print(f"Auth error: {e}")
        return {"Message": "Invalid Token"}, 501
 
   
    form_data = request.get_json()
    user_email = form_data.get('mailAdd')
    app_family = form_data.get('appFamily')
    app_ci = form_data.get('appCI')
    server_names = form_data.get('serverName')
    justification = form_data.get('justification')
    start_time = form_data.get('startTime')
    end_time = form_data.get('endTime')
    recurrence = form_data.get('selectedFrequency') or "OneTime"
    distributionList = form_data.get('distributionList')
 
    # --- Validate required fields
    required_fields = [user_email, justification, start_time, end_time, server_names, app_family, app_ci, distributionList]
    if any(field is None or (isinstance(field, list) and len(field) == 0) for field in required_fields):
        return jsonify({"status": "error", "message": "Please complete all required fields."}), 400
 
    # --- Format dates ---
    try:
        start_time_dt = datetime.strptime(start_time, "%d-%m-%Y %H:%M").strftime("%Y-%m-%d %H:%M:%S")
        end_time_dt = datetime.strptime(end_time, "%d-%m-%Y %H:%M").strftime("%Y-%m-%d %H:%M:%S")
    except ValueError:
        return jsonify({"status": "error", "message": "Invalid date format."}), 400
 
    # --- Find server details (custom helper) ---
    servers = find_servers_by_name(server_names)
    if not servers:
        return jsonify({"status": "error", "message": "No servers found"}), 404
 
    # --- Database Connection ---
    connectionString = connectToDw_AADpwd_Write(
        "sqldb-azure-prod-012.database.windows.net",
        "crcamonitoring",
        "servCRCAMonitoring@providence.org"
    )
 
    try:
        conn = pyodbc.connect(connectionString)
        cursor = conn.cursor()
 
        # Call Stored Procedure
        server_details_json = json.dumps(servers)
        app_ci_json = json.dumps(app_ci)
 
        cursor.execute("""
            EXEC usp_InsertMaintenanceRequest
                @serverDetails = ?,
                @startTime = ?,
                @endTime = ?,
                @status = ?,
                @appFamily = ?,
                @userEmail = ?,
                @justification = ?,
                @appCI = ?,
                @recurrence = ?,
                @distributionList = ?
        """,
        (
            server_details_json,
            start_time_dt,
            end_time_dt,
            'pending',
            app_family,
            user_email,
            justification,
            app_ci_json,
            recurrence,
            distributionList
        ))
 
        conn.commit()
        print("Maintenance request inserted successfully via stored procedure.")
 
        return jsonify({"status": "success", "message": "Maintenance request submitted successfully!"}), 200
 
    except Exception as e:
        print(f"Error executing stored procedure: {e}")
        return jsonify({"status": "error", "message": "There was an error submitting the request. Please try again!"}), 500
 
    finally:
        if conn:
            conn.close()


@operations_bp.route('/api/filteralertmanagement', methods=["POST"])
def filteralertmanagement():
    try:
        #hosting_type = request.json.get('hostingType')  # Get the hosting type from the request body
        email = request.json.get('mailAdd')
        
        #print(f"Hosting Type selected: {hosting_type}")
        print(f"The mail is {email}")
        
        connectToServicePerf = connectToDw_SqlServerPwd("spidedbsv6c6b60.wa.providence.org\\SPIDER", "ServicePerf_DW", "servCRCAMonitor")
        connectionStringAzure = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
        
        filters = alertfilterdf(connectToServicePerf, email, connectionStringAzure)  # Pass hosting type to filter data
        return filters
    
    except Exception as e:
        return {"error": "An unexpected error occurred", "details": str(e)}, 500
