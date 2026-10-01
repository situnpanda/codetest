import sys
from pathlib import Path

# Add the repo root (parent of "Batch Jobs") to sys.path so we can import Modules.*
root = Path(__file__).resolve().parents[1] / "backend"
sys.path.append(str(root))

import ssl
import json
import socket
import urllib3
import requests
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed

from shared.dataBase import connectToDw_AADpwd, queryDw, insert_data, exceptioninfo
from shared.logAnalytics import post_data_to_log_analytics

# ── Configuration ────────────────────────────────────────────────────────────

SQL_SERVER   = "sqldb-azure-prod-012.database.windows.net"
SQL_DATABASE = "crcamonitoring"
SQL_USERNAME = "servCRCAMonitoring@providence.org"

INPUT_QUERY = """
    SELECT URL, APMNumber, ServerName, MonitorType, AppCI, Environment,
           HostingType, SubscriptionId, ResourceGroup
    FROM [crcamonitoring].[dbo].[ServiceMon_InputData]
    WHERE status = 'Enabled'
      AND MonitorType <> 'AvaSureMicroservice'
"""

LA_WORKSPACE_ID = "552b9630-b106-4fe7-a1fa-97d04a0010ef"
LA_LOG_TYPE     = "ServiceMonitoring_CL"

REQUEST_TIMEOUT_SECONDS = 30
# Matches $maxConcurrentJobs = 3 in ServiceMonitoring_Script.ps1 so resource
# usage stays close to the original PowerShell job behavior.
MAX_WORKERS = 6

# Mimic the User-Agent that PowerShell's Invoke-WebRequest sends, so that WAFs
# / IIS request filtering / Akamai / Azure Application Gateway don't 403 us
# because of the default `python-requests/X.Y.Z` UA.
DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "*/*",
    "Accept-Encoding": "gzip, deflate",
    "Connection": "close",
}

# Suppress the InsecureRequestWarning we get from verify=False
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


# ── Step 1: Pull URL list from database ──────────────────────────────────────

def getInputList():
    """Fetch enabled URL/service monitoring inputs from the SQL database."""
    connectionString = connectToDw_AADpwd(SQL_SERVER, SQL_DATABASE, SQL_USERNAME)
    rows = queryDw(connectionString, INPUT_QUERY)

    if not rows:
        return []

    columns = [
        "URL", "APMNumber", "ServerName", "MonitorType", "AppCI",
        "Environment", "HostingType", "SubscriptionId", "ResourceGroup",
    ]
    inputs = []
    for row in rows:
        inputs.append({col: ("" if row[idx] is None else str(row[idx]).strip())
                       for idx, col in enumerate(columns)})
    return inputs


# ── Step 2: Ping check ───────────────────────────────────────────────────────

def pingCheck(entry):
    """
    Perform a lightweight HTTP GET ping against the URL and return a status
    object shaped like the existing ServiceMonitoring LA table records.
    """
    url = entry.get("URL", "")
    status = "Error"
    status_message = ""
    status_code = None

    try:
        response = requests.get(
            url,
            headers=DEFAULT_HEADERS,
            timeout=REQUEST_TIMEOUT_SECONDS,
            verify=False,
            allow_redirects=True,
        )
        status_code = response.status_code
        reason = response.reason or ""
        if 200 <= status_code < 400:
            status = "Ok"
            status_message = f"URL is up and returning {status_code} {reason}".strip()
        else:
            status = "Error"
            status_message = f"URL returned {status_code} {reason}".strip()
    except requests.exceptions.Timeout as ex:
        status_message = f"Timeout after {REQUEST_TIMEOUT_SECONDS}s: {ex}"
    except requests.exceptions.SSLError as ex:
        status_message = f"SSL error: {ex}"
    except requests.exceptions.ConnectionError as ex:
        status_message = f"Connection error: {ex}"
    except Exception as ex:
        status_message = f"Unexpected error: {ex}"

    return {
        "APMNumber":      entry.get("APMNumber", ""),
        "ServerName":     entry.get("ServerName", ""),
        "AppCI":          entry.get("AppCI", ""),
        "Environment":    entry.get("Environment", ""),
        "MonitorType":    entry.get("MonitorType", ""),
        "HostingType":    entry.get("HostingType", ""),
        "Status":         status,
        "StatusMessage":  status_message,
        "StatusCode":     status_code,
        "serviceName":    url,
        "SubscriptionId": entry.get("SubscriptionId", ""),
        "ResourceGroup":  entry.get("ResourceGroup", ""),
        "TimeGenerated":  datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def runPingChecks(inputs):
    """Run pingCheck across all inputs concurrently."""
    results = []
    if not inputs:
        return results


    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_entry = {executor.submit(pingCheck, entry): entry for entry in inputs}
        for future in as_completed(future_to_entry):
            entry = future_to_entry[future]
            try:
                results.append(future.result())
            except Exception as ex:
                print(f"[runPingChecks] Failed for {entry.get('URL')}: {ex}")
                results.append({
                    "APMNumber":      entry.get("APMNumber", ""),
                    "ServerName":     entry.get("ServerName", ""),
                    "AppCI":          entry.get("AppCI", ""),
                    "Environment":    entry.get("Environment", ""),
                    "MonitorType":    entry.get("MonitorType", ""),
                    "HostingType":    entry.get("HostingType", ""),
                    "Status":         "Error",
                    "StatusMessage":  f"Ping check crashed: {ex}",
                    "StatusCode":     None,
                    "serviceName":    entry.get("URL", ""),
                    "SubscriptionId": entry.get("SubscriptionId", ""),
                    "ResourceGroup":  entry.get("ResourceGroup", ""),
                    "TimeGenerated":  datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                })

    up = sum(1 for r in results if r["Status"] == "Ok")
    return results


# ── Step 3: Push to Log Analytics ────────────────────────────────────────────

def pushToLogAnalytics(results):
    if not results:
        return

    status, code = post_data_to_log_analytics(results, LA_WORKSPACE_ID, LA_LOG_TYPE)
    if code != 200:
        raise Exception(f"Failed to push data to Log Analytics: {status} (HTTP {code})")


# ── Main ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    startedAt = datetime.now(timezone.utc)
    try:
        inputs  = getInputList()
        results = runPingChecks(inputs)
        pushToLogAnalytics(results)
    except Exception as ex:
        print(f"[main] Failed: {ex}")
        try:
            if ex.args and isinstance(ex.args[0], dict):
                insert_data(ex.args[0])
            else:
                insert_data(exceptioninfo(ex))
        except Exception as logEx:
            print(f"[main] Also failed to log exception: {logEx}")
    finally:
        finishedAt = datetime.now(timezone.utc)
        elapsed    = (finishedAt - startedAt).total_seconds()
