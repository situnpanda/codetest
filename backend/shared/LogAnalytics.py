import os
import pandas as pd
from datetime import datetime, timezone, timedelta
import pytz
from azure.monitor.query import LogsQueryClient, LogsQueryStatus
from azure.identity import DefaultAzureCredential, AzureCliCredential, ManagedIdentityCredential
from shared.keyVault import connectToKeyVault
from azure.core.exceptions import HttpResponseError
import json
import requests
import hashlib
import hmac
import base64

from shared.appinsights_logger import log_dependency

def connectToLogAnlytics():
    
    #credential = ManagedIdentityCredential(client_id='015ad614-f9a5-4333-83b4-b71c01c393d8')
    credential = AzureCliCredential()
    # credential = DefaultAzureCredential()
    client = LogsQueryClient(credential)
    return client

@log_dependency("LAW", "log_analytics_query")  # Logging: capture Log Analytics query timing, row count, and errors
def queryInLogAnalytics(workspaceId, query, startTime, endTime):

    client = connectToLogAnlytics()
    
    df = pd.DataFrame()
    try:
        response = client.query_workspace(
            workspace_id=workspaceId,
            query=query,
            timespan= timedelta(days=0)
        )
        if response.status == LogsQueryStatus.PARTIAL:
            error = response.partial_error
            print(error)
            # Logging: raise so @log_dependency records partial failures as errors (like log_performance)
            raise Exception(f"Partial Log Analytics result: {error}")
        data = response.tables
        for table in data:
            df = pd.DataFrame(data=table.rows, columns=table.columns)
            #print(df)
            
    except HttpResponseError as err:
        print("----------Something fatal happened-------------")
        print(err)
        # Logging: raise so @log_dependency records this as a failure
        raise
    return df


def build_signature(method, content_length, content_type, date, resource, shared_key, workspace_id):
    x_headers = 'x-ms-date:' + date
    string_to_hash = f"{method}\n{str(content_length)}\n{content_type}\n{x_headers}\n{resource}"
    bytes_to_hash = str.encode(string_to_hash, encoding='utf-8')
    decoded_key = base64.b64decode(shared_key)
    encoded_hash = base64.b64encode(hmac.new(decoded_key, bytes_to_hash, digestmod=hashlib.sha256).digest()).decode()
    authorization = f"SharedKey {workspace_id}:{encoded_hash}"
    return authorization

@log_dependency("LAW", "post_data")  # Logging: capture Log Analytics push timing and errors
def post_data_to_log_analytics(data, workspace_id, log_type):
    shared_key = connectToKeyVault("CentralLAWPrimaryKey")
    print(len(shared_key))
    
    try:
        method = 'POST'
        content_type = 'application/json'
        resource = '/api/logs'
        rfc1123date = datetime.now(pytz.utc).strftime('%a, %d %b %Y %H:%M:%S GMT')
        body = json.dumps(data)
        content_length = len(body)
        signature = build_signature(method, content_length, content_type, rfc1123date, resource, shared_key, workspace_id)
        uri = f"https://{workspace_id}.ods.opinsights.azure.com{resource}?api-version=2016-04-01"

        headers = {
            'Authorization': signature,
            'Content-Type': content_type,
            'Log-Type': log_type,
            'x-ms-date': rfc1123date
        }
        print(body)
        response = requests.post(uri, data=body, headers=headers)

        if response.status_code >= 200 and response.status_code <= 299:
            print(response)
            return 'Accepted' , 200
        else:
            print(response.text)
            raise Exception("Failed to push Data to Log Analytics"+str(response.text))

    except Exception as ex:
        raise Exception(str(ex))