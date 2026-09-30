"""System / platform route slice (VSA).

Handlers moved verbatim from main.py. Registered by main.py via `system_bp`.
Behavior unchanged.
"""
from flask import Blueprint, request, jsonify, Response
import requests

from shared.keyVault import connectToKeyVault
from shared.dataBase import connectToDw_AADpwd, queryDw
from shared.LogAnalytics import queryInLogAnalytics
from shared.appinsights_logger import error_response

system_bp = Blueprint("system", __name__)


@system_bp.route('/api/run-process', methods=['POST'])
def run_process():
    body = request.json
    token = body.get('token')
    args = body.get('inputArgs')
    app_family = body.get('appFamily', 'aria').lower()
    if not token:
        client_secret = connectToKeyVault('iTelemetry-runButton')
        if not client_secret:
            return error_response(500, "Failed to retrieve client secret from Key Vault")
        token_res = requests.post(
            'https://cloud.uipath.com/identity_/connect/token',
            headers={'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json'},
            data={
                'grant_type': 'client_credentials',
                'client_id': 'e217fa3f-1cde-4c6a-ab73-f041794e2d83',
                'client_secret': client_secret,
                'scope': 'OR.Jobs.Write'
            }
        )
        if token_res.status_code != 200:
            return error_response(401, "Failed to get UiPath token", detail=token_res.text)
        token = token_res.json().get('access_token')

    input_args_string = f'"{str(args).strip()}"'

    connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    config_query = f"SELECT [ApplicationFamily], [ReleaseKey], [ReleaseName], [RobotID], [OrgUnitID] FROM [ValidationConfiguration] WHERE LOWER([ApplicationFamily]) = '{app_family}'"
    config_result = queryDw(connectionString, config_query)

    if not config_result or len(config_result) == 0:
        return error_response(400, f"No configuration found for app family: {app_family}")

    config_row = config_result[0]
    release_key_secret_name = config_row[1]
    release_name = config_row[2]
    robot_ids = [config_row[3]]
    org_unit_id = str(config_row[4])

    release_key = connectToKeyVault(release_key_secret_name)
    if not release_key:
        return error_response(500, f"Failed to retrieve release key from Key Vault for: {release_key_secret_name}")

    print(f"Config loaded - Family: {app_family}, ReleaseName: {release_name}, RobotIds: {robot_ids}, OrgUnitId: {org_unit_id}")

    payload_str = f'''
    {{
      "startInfo": {{
        "ReleaseKey": "{release_key}",
        "ReleaseName": "{release_name}",
        "Strategy": "Specific",
        "RobotIds": {robot_ids},
        "Source": "Manual",
        "InputArguments": {input_args_string}
      }}
    }}
    '''

    print("Payload string to send:\n", payload_str)

    r = requests.post(
        'https://cloud.uipath.com/providence/Shared/orchestrator_/odata/Jobs/UiPath.Server.Configuration.OData.StartJobs',
        headers={
            'Accept': 'application/json',
            'Content-Type': 'application/json;odata.metadata=minimal;odata.streaming=true',
            'X-UIPATH-OrganizationUnitId': org_unit_id,
            'Authorization': f'Bearer {token}'
        },
        data=payload_str
    )
    return {"status": r.status_code, "Data": r.text, "meta": {}, "error": None}, r.status_code

@system_bp.route("/api/telemetryAppInsights", methods=["POST"])
def telemetry_proxy():
    AI_ENDPOINT = "https://dc.services.visualstudio.com/v2/track"
    try:

        payload = request.get_data()
        print("The payload is", payload)

        resp = requests.post(AI_ENDPOINT, data=payload, headers={"Content-Type": request.headers.get("Content-Type", "application/json")}, timeout=5,)
        print("The res is", resp)

        return Response(resp.content, status=resp.status_code, content_type=resp.headers.get("Content-Type", "application/json"),)

    except Exception as e:
        print("Exception")
        return jsonify({"error": "Failed to forward telemetry"}), 500

@system_bp.route('/api/getSecrets', methods=["POST"])
def getSecrets():
    data = request.json
    secret_name = data.get("secretName")

    if not secret_name:
        return error_response(400, "Secret name not provided")
    secret_value = connectToKeyVault(secret_name)

    if not secret_value:
        return error_response(404, "Secret not found")

    return {"status": 200, "Data": secret_value, "meta": {}, "error": None}, 200

@system_bp.route('/api/checkLogAnalyticsAccess', methods=["GET"])
def checkLogAnalyticsAccess():

    logAnalyticsQuery = f"""Perf
            | where TimeGenerated > ago(1d) and ObjectName == "Processor"
            and CounterName == "% Processor Time"
            and InstanceName =~ "_Total"
            and _SubscriptionId in ("ab16a144-47d7-45c5-bcb7-8affc988f8e0", "9592c342-d1fb-477e-8e91-ad39bf00933b", "5467bf57-48b4-4930-b3cb-bf039b259d04", "343a7ee0-5081-4024-82fc-498ee61867a9", "6d590d81-bab9-4b9a-b011-090467b5a9a4", "accde124-a45f-47be-aefa-b09362b2c5fc")
            | extend resourceIdSpilt=split(_ResourceId, '/')
            | extend
            SubscriptionId=tostring(resourceIdSpilt[2]),
            ResourceGroup=tostring(resourceIdSpilt[4]),
            ServerName=tolower(tostring(resourceIdSpilt[8]))
            | extend SubRg = strcat(SubscriptionId, "/", ResourceGroup)
            | distinct SubRg, ServerName
            """

    workspaceId = "552b9630-b106-4fe7-a1fa-97d04a0010ef"
    serverStatus = queryInLogAnalytics(workspaceId, logAnalyticsQuery, "", "")

    return {"status": 200, "Data": serverStatus.to_json(), "meta": {}, "error": None}
