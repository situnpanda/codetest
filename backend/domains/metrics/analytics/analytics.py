import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
sys.path.append(str(root))

from shared.adx import readFromADX
import pandas as pd
import json
import re
from datetime import datetime

from shared.appinsightsLogger import error_response

def get_server_status(data={}):
    """
    Fetch server status from the ADX Analytics table.

    Expected POST body:
    {
        "appCI": "'AppName1','AppName2'"   (optional, comma-separated quoted names)
        "serverName": "'srv1','srv2'"      (optional, comma-separated quoted names)
        "CounterName": "name1"
        "ObjectName" : ""
    }

    Returns JSON matching the legacy ServerStatus shape:
        { "ServerName": {0: "srv1", ...}, "Status": {0: "Up", ...}, "HostingType": {0: "Azure", ...}, ... }
    """
    try:
        data = data or {}
        app_ci = data.get("appCI", "")
        server_name = data.get("serverName", "")
        counter_name = data.get("CounterName", "Status")
        object_name = data.get("ObjectName", "Server")
        data_filter = data.get("DataFilter", "")

        # ── Build KQL filters ────────────────────────────────────────
        filters = []
        if data_filter:
            vals = [v.strip().strip("'") for v in data_filter.split(",") if v.strip()]
            kql_vals = ", ".join([f'"{v}"' for v in vals])
            filters.append(f'| where Data in ({kql_vals})')
        if server_name:
            names = [n.strip().strip("'").lower() for n in server_name.split(",") if n.strip()]
            kql_names = ", ".join([f'"{n}"' for n in names])
            filters.append(f'| where tolower(ServerName) in ({kql_names})')

        if app_ci:
            cis = [c.strip().strip("'").lower() for c in app_ci.split(",") if c.strip()]
            kql_cis = ", ".join([f'"{c}"' for c in cis])
            filters.append(f'| where tolower(AppCI) in ({kql_cis})')

        filter_clause = "\n                ".join(filters)

        query = f"""
                Analytics
                | where ObjectName == "{object_name}" and CounterName == "{counter_name}"
                | where TimeGenerated == toscalar(
                    Analytics
                    | where ObjectName == "{object_name}" and CounterName == "{counter_name}"
                    | summarize max(TimeGenerated)
                )
                | extend parts = split(ResourceId, "/")
                | extend
                    ServerName   = tostring(parts[array_length(parts) - 3]),
                    AppCI        = tostring(parts[array_length(parts) - 1]),
                    HostingType  = iff(ResourceId has "SubscriptionID/", "Cloud", "OnPremise")
                {filter_clause}
                | project ServerName, TimeGenerated, HostingType, AppCI, Status = Data
                """
        df = readFromADX(query)

        if df.empty:
            return {"status": 200, "Data": json.dumps({}), "meta": {}, "error": None}

        # Ensure column types match legacy format
        df["TimeGenerated"] = pd.to_datetime(df["TimeGenerated"]).dt.strftime("%Y-%m-%d %H:%M:%S")

        result = df.to_json()
        return {"status": 200, "Data": result, "meta": {}, "error": None}

    except Exception as ex:
        return error_response(500, "Failed to fetch seasonal pattern", detail=str(ex), exc=ex)

def get_pattern_analysis(data={}):
    """
    Fetch the latest daily seasonal-pattern summary for a set of servers.

    Expected POST body:
    {
        "domain": "utilization" | "network",   (default "utilization")
        "servers": ["srv1", "srv2"],            (server names; array or CSV)
        "metric": "CPU" | "Memory" | "Disk" | "Packets"   (optional filter)
    }

    Returns:
        { "status": 200, "Data": "<json-array-string>" }
    where each element is:
        utilization -> { ResourceId, CounterName, TimeGenerated, Data{...} }
        network     -> { ResourceId(NIC), ServerName, CounterName, TimeGenerated, Data{...} }

    An empty array is returned when no pattern rows exist for the request.
    """
    try:
        body = data or {}
        domain = str(body.get("domain", "utilization")).strip().lower()
        metric = str(body.get("metric", "")).strip().lower()
        servers = _sanitize_names(body.get("servers"))

        if not servers:
            return {"status": 200, "Data": json.dumps([]), "meta": {}, "error": None}

        server_in_list = ", ".join([f'"{s}"' for s in servers])

        if domain == "network":
            # NetworkPatternSummary rows are keyed by NIC name only (NIC names
            # in the source table embed the server name as a substring and are
            # unique across the fleet). The CTE below enumerates the NICs
            # attached to the requested servers and inner-joins them onto the
            # pattern rows so the response is scoped to the caller's servers.
            query = f"""
                let nics =
                    Network_Metrics_Perf
                    | where TimeGenerated > ago(45d)
                    | where ObjectName in ('packets_sent_rate', 'packets_received_rate')
                    | where tolower(ResourceId) has_any ({server_in_list})
                    | extend ServerName = tolower(tostring(split(extract(@'(?:^|/)ServerName/([^/]+)', 1, ResourceId), '_')[0]))
                    | extend NicName = extract('ServerNic/(.+)', 1, ResourceId)
                    | where isnotempty(NicName) and isnotempty(ServerName)
                    | distinct NicName, ServerName;
                Analytics
                | where ObjectName == "NetworkPatternSummary"
                | where CounterName in ('PacketsSent', 'PacketsReceived')
                | join kind=inner (nics) on $left.ResourceId == $right.NicName
                | summarize arg_max(TimeGenerated, Data) by ResourceId, ServerName, CounterName
                | project ResourceId, ServerName, CounterName, TimeGenerated, Data
                """
            df = readFromADX(query)
            records = _records_from_pattern_df(df, include_server=True)
        else:
            # Utilization rows are keyed directly by server name.
            if metric == "cpu":
                counter_filter = '| where CounterName == "CPU"'
            elif metric == "memory":
                counter_filter = '| where CounterName == "Memory"'
            elif metric == "disk":
                counter_filter = '| where CounterName startswith "Disk"'
            else:
                counter_filter = ""

            query = f"""
                Analytics
                | where ObjectName == "UtilPatternSummary"
                | where tolower(ResourceId) in ({server_in_list})
                {counter_filter}
                | summarize arg_max(TimeGenerated, Data) by ResourceId, CounterName
                | project ResourceId, CounterName, TimeGenerated, Data
                """
            df = readFromADX(query)
            records = _records_from_pattern_df(df, include_server=False)

        return {"status": 200, "Data": json.dumps(records, default=str), "meta": {}, "error": None}

    except Exception as ex:
        return error_response(500, "Failed to fetch pattern analysis", detail=str(ex), exc=ex)


# Allowed characters for a server / NIC identifier. Hostnames only ever contain
# letters, digits, dot, dash and underscore, so anything else is rejected before
# it is interpolated into a KQL query (defence-in-depth against KQL injection).
_SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._-]")


def _sanitize_names(raw):
    """Normalise the incoming server/NIC list into a clean, lower-cased list.

    Accepts either a list of strings or a comma-separated string. Strips quotes
    and whitespace, lower-cases, removes any character outside the safe set and
    drops empties / duplicates while preserving order.
    """
    if raw is None:
        return []
    if isinstance(raw, str):
        parts = raw.split(",")
    elif isinstance(raw, (list, tuple)):
        parts = raw
    else:
        return []

    cleaned = []
    seen = set()
    for part in parts:
        if part is None:
            continue
        name = _SAFE_NAME_RE.sub("", str(part).strip().strip("'\"").lower())
        if name and name not in seen:
            seen.add(name)
            cleaned.append(name)
    return cleaned


def _records_from_pattern_df(df, include_server=False):
    """Convert a pattern-summary dataframe into a list of plain dict records.

    The ``Data`` column (a JSON string) is parsed into a nested object so the
    frontend receives ready-to-render JSON instead of a string-in-string.
    """
    records = []
    if df is None or df.empty:
        return records

    for _, row in df.iterrows():
        raw_data = row.get("Data")
        try:
            parsed = json.loads(raw_data) if isinstance(raw_data, str) else raw_data
        except (ValueError, TypeError):
            parsed = None

        record = {
            "ResourceId": row.get("ResourceId"),
            "CounterName": row.get("CounterName"),
            "TimeGenerated": str(row.get("TimeGenerated")),
            "Data": parsed,
        }
        if include_server:
            record["ServerName"] = row.get("ServerName")
        records.append(record)
    return records

