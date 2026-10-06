"""Network HTTP route slice (consolidated).

Web/routing layer for the network / moxa / load-balancer / crowdstrike metrics
endpoints and the DCX port-health operational endpoints. Business logic lives in
``domains.metrics.*``; this module only wires HTTP requests to those functions
and returns the uniform success/error envelope.
"""
import requests
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

from flask import Blueprint, request

from shared.appinsightsLogger import log_performance, error_response
from shared.filters import getFiltersFromCache
from shared.dataBase import connectToDw_AADpwd, queryDw
from domains.metrics.network.networkMetricsPerf import get_network_perf
from domains.metrics.network.moxa import get_moxa_perf
from domains.metrics.network.loadBalancerMetricsPerf import get_load_balancer_perf
from domains.metrics.network.crowdstrikeMetrics import get_connection_data

network_bp = Blueprint("network", __name__)


@network_bp.route("/api/infrastructureMetrics/", methods=["GET"])
def hello():
    return "Hello"


@network_bp.route("/api/infrastructureMetrics/networkPerfMetrics", methods=["POST"])
@log_performance()
def getNetworkPerf():
    try:
        data = request.get_json() or {}
        return get_network_perf(data)
    except Exception as ex:
        return error_response(501, "Failed to fetch network performance metrics", exc=ex)


@network_bp.route("/api/infrastructureMetrics/moxaPerfMetrics", methods=["POST"])
@log_performance()
def getMoxaPerf():
    try:
        data = request.get_json() or {}
        return get_moxa_perf(data)
    except Exception as ex:
        return error_response(501, "Failed to fetch Moxa switch metrics", exc=ex)


@network_bp.route("/api/infrastructureMetrics/loadBalancerPerfMetrics", methods=["POST"])
@log_performance()
def getLoadBalancerPerf():
    try:
        data = request.get_json() or {}
        return get_load_balancer_perf(data)
    except Exception as ex:
        return error_response(501, "Failed to fetch load balancer performance metrics", exc=ex)


@network_bp.route("/api/crowdstrikeMetrics/getConnectionData", methods=["POST"])
def getConnectionData():
    data = request.get_json(silent=True) or {}
    return get_connection_data(data)


@network_bp.route('/api/dcxPortHealthAlertsGAC', methods = ["POST"])
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
    return {"status": 200, "Data": formatted_result, "meta": {}, "error": None}


@network_bp.route('/api/networkServerCountByAppCI', methods=["POST"])
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
    return {"status": 200, "Data": formatted_result, "meta": {}, "error": None}


@network_bp.route('/api/dcxPortWatcher', methods=["POST"])
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

            return {"status": 200, "Data": final_response, "meta": {}, "error": None}, 200

        except Exception as e:
            return error_response(500, "Failed to fetch server status details", detail=str(e), exc=e)
    

    elif mode == "portDetails":
        print("Yes the mode is correct for all ports")

        servers = dataPost.get("servers", []) 
        condition = dataPost.get("condition", "")
        print("The condition in the dcx backend is ", condition)
        #servers = ["devicappv6dxb24", "devicappv9qldlm", "devicappv97889v"]
        #condition = 'warning'
        if not servers or not condition:
            return {"status": 200, "Data": {"error": "Both 'servers' and 'condition' are required."}, "meta": {}, "error": None}, 200
        
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

        return {"status": 200, "Data": dict(results), "meta": {}, "error": None}
    
    elif mode == "graphDetails":
        print("Yes the mode is correct for all ports")

        port = dataPost.get("port")
        time = dataPost.get("time")
        servers = dataPost.get("servers", []) 
        #condition = dataPost.get("condition", "")

        if not port or not time or not servers:
            return {"status": 200, "Data": {"error": "Fields 'port', 'time', and 'server' are required."}, "meta": {}, "error": None}, 200

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

        return {"status": 200, "Data": results, "meta": {}, "error": None}, 200

    return {"status": 200, "Data": {"error": "No conditions matched"}, "meta": {}, "error": None}
