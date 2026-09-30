import sys
from pathlib import Path

# Add the parent of 'parent_folder' to sys.path
root = Path(__file__).resolve().parents[1]
sys.path.append(str(root))

from flask import Blueprint, jsonify, request
from shared.dataBase import insert_data, exceptioninfo
from shared.ADX import readFromADX
from shared.LogAnalytics import queryInLogAnalytics
import pandas as pd
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta

from shared.appinsights_logger import log_performance, error_response

userMetrics = Blueprint("infrastructureTelemetry_userMetrics", __name__, url_prefix="/api/infrastructureMetrics")
 
PERF_WORKSPACE_ID = "552b9630-b106-4fe7-a1fa-97d04a0010ef"
PERF_SERVICE_NAME = "iTelemetry-Backend"
PERF_ROLE_NAME = "iTelemetry.iTelemetry-Backend"

@userMetrics.route("/userMetrics", methods=["GET"])
@log_performance()
def getUserMetrics():
    try:
        st = datetime.now()

        adxQuery = r"""
        let blocked_users = dynamic([
            "m k",
            "sai ramanan",
            "m k sai ramanan",
            "sudeepthi kalisapudi l",
            "ghosh shreya",
            "panda situn",
            "mallick ayush",
            "penmetsa karthik sai verma",
            "penmetsa karthik sai varma"
        ]);
        User_Metrics
        | extend _rawUserName = tostring(column_ifexists("UserName", column_ifexists("User Name", column_ifexists("Identity", column_ifexists("User", "")))))
        | extend _normalizedUserName = tolower(replace_regex(trim(" ", replace_regex(_rawUserName, @"[^a-zA-Z0-9]+", " ")), @"\s+", " "))
        | where _normalizedUserName !in (blocked_users)
        | project-away _rawUserName, _normalizedUserName
        | order by TimeGenerated desc
        """

        df_res = readFromADX(adxQuery)

        if len(df_res):
            df_res["TimeGenerated"] = df_res["TimeGenerated"].astype(str)

        en = datetime.now()
        timeTakenByKqlQuery = (en - st).total_seconds()

        return {
            "status": 200,
            "Data": df_res.to_json(),
            "meta": {"Time Taken by Kql ADX": timeTakenByKqlQuery},
            "error": None
        }

    except Exception as ex:
        if ex.args and ex.args[0] is not None and isinstance(ex.args[0], dict):
            info = ex.args[0]
            info["PageName"] = "UserMetrics.py"
            insert_data(info)
        else:
            info = exceptioninfo(ex)
            info["PageName"] = "UserMetrics.py"
            insert_data(info)
        return error_response(501, "Failed to fetch user metrics", detail=info, exc=ex)


def _perf_records(query):
    """Run a KQL query against the App Insights workspace and return JSON-safe records."""
    df = queryInLogAnalytics(PERF_WORKSPACE_ID, query, "", "")
    if df is None or len(df) == 0:
        return []
    # pandas -> JSON handles numpy types; parse back to native python
    return json.loads(df.to_json(orient="records"))


@userMetrics.route("/performanceMetrics", methods=["GET"])
@log_performance()
def getPerformanceMetrics():
    """
    Backend API performance metrics derived from our own App Insights logs
    (AppTraces). Reads the canonical schema we push (event_type, endpoint,
    duration_ms, status_code, service_name, operation, exception_type, ...).
    Query param: days (7 | 14 | 30). Defaults to 7.
    """
    try:
        st = datetime.now()

        try:
            days = int(request.args.get("days", 7))
        except (TypeError, ValueError):
            days = 7
        if days not in (7, 14, 30):
            days = 7

        end_dt = datetime.now(timezone.utc)
        start_dt = end_dt - timedelta(days=days)
        start_iso = start_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        end_iso = end_dt.strftime("%Y-%m-%dT%H:%M:%SZ")

        base = f"""AppTraces
| where TimeGenerated between (datetime({start_iso}) .. datetime({end_iso}))
| where AppRoleName == '{PERF_ROLE_NAME}'
| where tostring(Properties['environment']) == 'production'""" 

        responses = f"""{base}
| where tostring(Properties['event_type']) == 'api_response'
| extend dur = todouble(tostring(Properties['duration_ms'])), code = toint(tostring(Properties['status_code']))"""

        # 1. Per-endpoint (API) summary: response time, traffic, failures, uptime
        endpoints_query = f"""{responses}
| summarize total = count(), errors = countif(code >= 400), avgMs = round(avg(dur), 0) by fn = tostring(Properties['function_name'])
| where isnotempty(fn)
| extend failedPercent = round(100.0 * errors / total, 2),
         uptime = round(100.0 * (total - errors) / total, 1)
| order by total desc"""

        # 2. Recent API error logs (most recent first) for inline drill-down per endpoint
        error_logs_query = f"""{responses}
| where code >= 400
| extend path = tostring(parse_url(tostring(Properties['endpoint'])).Path)
| project TimeGenerated,
          fn = tostring(Properties['function_name']),
          code,
          message = tostring(Properties['exception_message']),
          reason = tostring(Properties['exception_type']),
          endpoint = tostring(Properties['endpoint']),
          path,
          durationMs = round(dur, 0)
| order by TimeGenerated desc
| take 2000"""

        # Database / dependency events (ADX queries, SQL, Log Analytics external calls)
        deps = f"""{base}
| where tostring(Properties['event_type']) in ('database_query', 'external_call')
| extend dur = todouble(tostring(Properties['duration_ms'])), code = toint(tostring(Properties['status_code']))"""

        # 3. Per-operation database/dependency summary (query time, traffic, failures)
        databases_query = f"""{deps}
| summarize total = count(), errors = countif(code >= 400), avgMs = round(avg(dur), 0)
    by svc = tostring(Properties['service_name']), op = tostring(Properties['operation'])
| where isnotempty(svc) or isnotempty(op)
| extend failedPercent = round(100.0 * errors / total, 2),
         uptime = round(100.0 * (total - errors) / total, 1)
| order by total desc"""

        # 4. Recent database/dependency error logs for inline drill-down
        database_errors_query = f"""{deps}
| where code >= 400
| project TimeGenerated,
          svc = tostring(Properties['service_name']),
          op = tostring(Properties['operation']),
          code,
          message = tostring(Properties['exception_message']),
          reason = tostring(Properties['exception_type']),
          durationMs = round(dur, 0)
| order by TimeGenerated desc
| take 2000"""

        # Run the four independent Log Analytics queries concurrently so the
        # total wait is bounded by the slowest query, not their sum.
        with ThreadPoolExecutor(max_workers=4) as pool:
            endpoints_future = pool.submit(_perf_records, endpoints_query)
            errors_future = pool.submit(_perf_records, error_logs_query)
            databases_future = pool.submit(_perf_records, databases_query)
            database_errors_future = pool.submit(_perf_records, database_errors_query)

            endpoint_rows = endpoints_future.result()
            error_rows = errors_future.result()
            database_rows = databases_future.result()
            database_error_rows = database_errors_future.result()

        def _fmt_time(ms):
            try:
                return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%m-%d %H:%M:%S") if ms else "-"
            except (TypeError, ValueError, OSError):
                return "-"

        # Build the API endpoints list
        endpoints = []
        for r in endpoint_rows:
            fn = r.get("fn") or ""
            total = int(r.get("total") or 0)
            errors = int(r.get("errors") or 0)
            uptime = r.get("uptime", 100)
            endpoints.append({
                "id": fn,
                "name": fn,
                "sub": f"Uptime {uptime}%",
                "responseTime": int(r.get("avgMs") or 0),
                "totalCalls": total,
                "failedCalls": errors,
                "failedPercent": f"{r.get('failedPercent', 0)}%",
            })

        # Group API error logs by endpoint id (latest first)
        error_logs = {}
        for r in error_rows:
            fn = r.get("fn") or ""
            bucket = error_logs.setdefault(fn, [])
            code = int(r.get("code") or 0)
            dur = r.get("durationMs")
            bucket.append({
                "time": _fmt_time(r.get("TimeGenerated")),
                "timeMs": r.get("TimeGenerated"),
                "code": code,
                "reason": r.get("reason") or "Error",
                "message": r.get("message") or f"HTTP {code}",
                "path": r.get("path") or r.get("endpoint") or "-",
                "duration": f"{int(dur)}ms" if dur is not None else "-",
            })

        # Build the database/dependency list
        databases = []
        for r in database_rows:
            svc = r.get("svc") or ""
            op = r.get("op") or ""
            total = int(r.get("total") or 0)
            errors = int(r.get("errors") or 0)
            uptime = r.get("uptime", 100)
            name = op or svc or "Unknown"
            sub = svc if (op and svc) else f"Uptime {uptime}%"
            databases.append({
                "id": f"{svc}||{op}",
                "name": name,
                "sub": sub,
                "responseTime": int(r.get("avgMs") or 0),
                "totalCalls": total,
                "failedCalls": errors,
                "failedPercent": f"{r.get('failedPercent', 0)}%",
            })

        # Group database/dependency error logs by id
        database_error_logs = {}
        for r in database_error_rows:
            key = f"{r.get('svc') or ''}||{r.get('op') or ''}"
            bucket = database_error_logs.setdefault(key, [])
            code = int(r.get("code") or 0)
            dur = r.get("durationMs")
            bucket.append({
                "time": _fmt_time(r.get("TimeGenerated")),
                "timeMs": r.get("TimeGenerated"),
                "code": code,
                "reason": r.get("reason") or "Error",
                "message": r.get("message") or f"HTTP {code}",
                "path": r.get("op") or "-",
                "duration": f"{int(dur)}ms" if dur is not None else "-",
            })

        payload = {
            "endpoints": endpoints,
            "errorLogs": error_logs,
            "databases": databases,
            "databaseErrorLogs": database_error_logs,
            "windowDays": days,
        }

        en = datetime.now()
        timeTaken = (en - st).total_seconds()

        return {
            "status": 200,
            "Data": json.dumps(payload),
            "meta": {"Time Taken by Kql LAW": timeTaken},
            "error": None
        }

    except Exception as ex:
        if ex.args and ex.args[0] is not None and isinstance(ex.args[0], dict):
            info = ex.args[0]
            info["PageName"] = "UserMetrics.py"
            insert_data(info)
        else:
            info = exceptioninfo(ex)
            info["PageName"] = "UserMetrics.py"
            insert_data(info)
        return error_response(501, "Failed to fetch performance metrics", detail=info, exc=ex)