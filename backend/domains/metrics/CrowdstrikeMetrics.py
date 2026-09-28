"""
CrowdstrikeMetrics.py

    X-axis  = Time (hourly / daily buckets, UTC)
    Y-axis  = unique source IPs
    Lines   = destination ports (one line per selected port)

"""

import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
sys.path.append(str(root))

import os
import re
import time
from datetime import datetime, timezone

import pandas as pd
import requests
from flask import Blueprint, request
from markupsafe import escape

from shared.keyVault import connectToKeyVault
from shared.dataBase import insert_data, exceptioninfo
from shared.utils.sessionTokenAction import validateToken


crowdstrikeMetrics = Blueprint(
    "crowdstrikeMetrics", __name__, url_prefix="/api/crowdstrikeMetrics"
)

CROWDSTRIKE_BASE_URL = "https://api.crowdstrike.com"
REPOSITORY = "search-all"
REQUEST_TIMEOUT = 60
PAGE_NAME = "CrowdstrikeMetrics.py"


BUCKET_FORMATS = {
    "1h": "%Y-%m-%d %H:00:00",
    "1d": "%Y-%m-%d 00:00:00",
}
DEFAULT_BUCKET = "1h"

SERVER_NAME_RE = re.compile(r"^[A-Za-z0-9._-]+$")

# Direction config: which domain field to filter on, which IP field is the
# "unique IP" metric, and how those map to the API response labels.
#   destination mode -> filter destination.domain, count unique source IPs.
#   source mode      -> filter source.domain,      count unique destination IPs.
DIRECTION_CONFIG = {
    "destination": {
        "filter_field": "destination.domain",
        "split_field": "destination.domain",
        "ip_field": "source.ip",
        "ip_type": "source",
    },
    "source": {
        "filter_field": "source.domain",
        "split_field": "source.domain",
        "ip_field": "destination.ip",
        "ip_type": "destination",
    },
}
DEFAULT_DIRECTION = "destination"

# Both source.ip and destination.ip (and both domains) are fetched so the same
# raw pull can serve either direction; Python picks the relevant fields.
QUERY_TEMPLATE = (
    '#type="psjh-pan-fw" '
    "| {domain_filter} "
    "| rename(field=source.user.name, as=source_user_name) "
    "| rename(field=destination.user.name, as=dest_user_name) "
    '| Time := formatTime(format="{time_format}", field=@timestamp, timezone="UTC") '
    "| groupBy([Time, source.ip, destination.ip, destination.port, "
    "source.domain, destination.domain], "
    'function=count(as="Total Connection Count"), limit=max) '
    '| table([Time, source.ip, destination.ip, destination.port, '
    'source.domain, destination.domain, "Total Connection Count"], limit=max)'
)


def _build_domain_filter(server_names, filter_field="destination.domain"):

    if len(server_names) == 1:
        return f'{filter_field}="{server_names[0]}"'
    values = ", ".join(f'"{s}"' for s in server_names)
    return f"in({filter_field}, values=[{values}])"

def _get_credentials():    
    return (
        "4b13d6a6e285428e8b6db215840b3d2e",
        "N9mDJkw6VqSRK18nL5pQfsulTYg3izdc04hx2F7b",
    )


def get_token():
    client_id, client_secret = _get_credentials()
    resp = requests.post(
        f"{CROWDSTRIKE_BASE_URL}/oauth2/token",
        data={"client_id": client_id, "client_secret": client_secret},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    token = resp.json().get("access_token")
    if not token:
        raise RuntimeError("No access_token returned from CrowdStrike auth endpoint.")
    return token


def submit_query_job(token, query_string, start_ms, end_ms):
    resp = requests.post(
        f"{CROWDSTRIKE_BASE_URL}/humio/api/v1/repositories/{REPOSITORY}/queryjobs",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"queryString": query_string, "start": start_ms, "end": end_ms, "isLive": False},
        timeout=REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    job_id = resp.json().get("id")
    if not job_id:
        raise RuntimeError("No job id returned when submitting the query.")
    return job_id


def poll_query_job(token, job_id, poll_interval=2.0, max_wait=300.0):
    """Poll a query job until done, then return its events list."""
    url = f"{CROWDSTRIKE_BASE_URL}/humio/api/v1/repositories/{REPOSITORY}/queryjobs/{job_id}"
    headers = {"Authorization": f"Bearer {token}"}
    deadline = time.monotonic() + max_wait

    while True:
        resp = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        payload = resp.json()

        if payload.get("done"):
            return payload.get("events", [])
        if time.monotonic() > deadline:
            raise TimeoutError(f"Query job {job_id} did not finish within {max_wait}s.")

        wait = payload.get("metaData", {}).get("pollAfter", poll_interval * 1000) / 1000
        wait = min(max(wait, poll_interval), 10)
        time.sleep(wait)


def fetch_events(server_names, start_ms, end_ms, time_format, filter_field="destination.domain"):
    token = get_token()
    domain_filter = _build_domain_filter(server_names, filter_field)
    query = QUERY_TEMPLATE.format(domain_filter=domain_filter, time_format=time_format)
    job_id = submit_query_job(token, query, start_ms, end_ms)
    events = poll_query_job(token, job_id)
    return pd.DataFrame(events)

def _to_epoch_ms(value):
    """Parse an ISO/`YYYY-MM-DD HH:MM:SS` string (assumed UTC) to epoch ms."""
    ts = pd.to_datetime(value, utc=True)
    return int(ts.timestamp() * 1000)


def _choose_bucket(start_ms, end_ms):
    # Always bucket hourly, regardless of the selected window span.
    return "1h"



def _build_time_axis(bucket, start_ms, end_ms, agg=None):
    """Return the dense list of bucket Timestamps for the window."""
    freq = "h" if bucket == "1h" else "D"
    if start_ms is not None and end_ms is not None:
        start_ts = pd.Timestamp(start_ms, unit="ms", tz="UTC").floor(freq)
        end_ts = pd.Timestamp(end_ms, unit="ms", tz="UTC").floor(freq)
        return list(pd.date_range(start=start_ts, end=end_ts, freq=freq))
    if agg is not None:
        return sorted(agg["Time"].unique())
    return []


def build_time_series(df, ip_field="source.ip", bucket="1h", start_ms=None, end_ms=None):

    # Build a DENSE X-axis so every bucket in the window shows (even zeros).
    # Do this even when there is no traffic so all servers share the same axis.
    if df.empty:
        time_buckets = _build_time_axis(bucket, start_ms, end_ms)
        time_labels = [
            pd.Timestamp(t).strftime("%Y-%m-%d %H:%M:%S") for t in time_buckets
        ]
        return {"timeBuckets": time_labels, "selectedPorts": [], "series": []}

    df = df.copy()
    df["destination.port"] = df["destination.port"].astype(str)
    df["Time"] = pd.to_datetime(df["Time"], utc=True)

    # Unique IPs (source or destination, per direction) per (Time, port).
    agg = (
        df.groupby(["Time", "destination.port"])[ip_field]
        .nunique()
        .reset_index(name="uniqueIPs")
    )

    # Actual list of unique IPs per (Time, port) - used for the hover tooltip.
    ip_lists = (
        df.groupby(["Time", "destination.port"])[ip_field]
        .apply(lambda s: sorted(set(s.dropna().astype(str))))
        .to_dict()
    )

    # Rank ports by total unique IPs across the whole window.
    port_rank = (
        agg.groupby("destination.port")["uniqueIPs"].sum()
        .sort_values(ascending=False)
    )
    # Draw a line for every port; default-select the single most-talked one.
    ports_to_draw = port_rank.index.tolist()
    default_selected = port_rank.index[:1].tolist()

    time_buckets = _build_time_axis(bucket, start_ms, end_ms, agg=agg)
    time_labels = [pd.Timestamp(t).strftime("%Y-%m-%d %H:%M:%S") for t in time_buckets]

    series = []
    for port in ports_to_draw:
        sub = agg[agg["destination.port"] == port].set_index("Time")["uniqueIPs"]
        points = [
            {
                "time": lbl,
                "uniqueIPs": int(sub.get(t, 0)),
                "ips": ip_lists.get((t, port), []),
            }
            for t, lbl in zip(time_buckets, time_labels)
        ]
        series.append({"port": port, "points": points})

    return {
        "timeBuckets": time_labels,
        "selectedPorts": default_selected,
        "series": series,
    }


def build_port_list(df, ip_field="source.ip"):

    if df.empty:
        return []

    df = df.copy()
    df["destination.port"] = df["destination.port"].astype(str)
    ports = (
        df.groupby("destination.port")[ip_field]
        .nunique()
        .reset_index(name="uniqueIPs")
        .sort_values("uniqueIPs", ascending=False)
    )
    return [
        {"port": r["destination.port"], "uniqueIPs": int(r["uniqueIPs"])}
        for _, r in ports.iterrows()
    ]


def build_connection_data(df, ip_field="source.ip", bucket="1h", start_ms=None, end_ms=None):

    return {
        "ports": build_port_list(df, ip_field),
        **build_time_series(df, ip_field=ip_field, bucket=bucket, start_ms=start_ms, end_ms=end_ms),
    }

def _parse_window():
    data = request.get_json(silent=True) or {}
    # Accept either a single serverName or a list of serverNames.
    server_names = data.get("serverNames")
    if server_names is None:
        single = data.get("serverName")
        server_names = [single] if single else []
    if isinstance(server_names, str):
        server_names = [server_names]
    start_time = data.get("startTime")
    end_time = data.get("endTime")

    if not server_names or not start_time or not end_time:
        return None, "serverName(s), startTime and endTime are required."

    # Validate every server name (they are injected into the LogScale query).
    server_names = [str(s).strip() for s in server_names if str(s).strip()]
    if not server_names:
        return None, "At least one valid serverName is required."
    for s in server_names:
        if not SERVER_NAME_RE.match(s):
            return None, f"Invalid server name: {s!r}."
    # De-duplicate while preserving order.
    server_names = list(dict.fromkeys(server_names))

    try:
        start_ms = _to_epoch_ms(start_time)
        end_ms = _to_epoch_ms(end_time)
    except Exception:
        return None, "startTime and endTime must be valid UTC datetimes."
    if start_ms >= end_ms:
        return None, "startTime must be earlier than endTime."

    bucket = _choose_bucket(start_ms, end_ms)

    # Direction decides which domain field is filtered and which IP is counted.
    direction = str(data.get("direction") or DEFAULT_DIRECTION).strip().lower()
    if direction not in DIRECTION_CONFIG:
        return None, f"direction must be one of {list(DIRECTION_CONFIG)}."

    return (
        {
            "serverNames": server_names,
            "startMs": start_ms,
            "endMs": end_ms,
            "bucket": bucket,
            "timeFormat": BUCKET_FORMATS[bucket],
            "direction": direction,
        },
        None,
    )


def _handle_exception(ex):
    """Log the exception the way the other blueprints do and return a payload."""
    if ex.args and len(ex.args) > 0 and isinstance(ex.args[0], dict):
        info = ex.args[0]
    else:
        info = exceptioninfo(ex)
    info["PageName"] = PAGE_NAME
    insert_data(info)
    return {"Data": info, "status": 501}


@crowdstrikeMetrics.route("/getConnectionData", methods=["POST"])
def getConnectionData():

    try:
        params, error = _parse_window()
        if error:
            return {"Data": str(escape(error)), "status": 400}

        cfg = DIRECTION_CONFIG[params["direction"]]
        filter_field = cfg["filter_field"]
        split_field = cfg["split_field"]
        ip_field = cfg["ip_field"]

        # One fetch for ALL servers -> split per server in Python.
        df = fetch_events(
            params["serverNames"], params["startMs"], params["endMs"],
            params["timeFormat"], filter_field=filter_field,
        )
        has_domain = (not df.empty) and (split_field in df.columns)

        servers_out = []
        for server_name in params["serverNames"]:
            server_df = (
                df[df[split_field] == server_name] if has_domain else df.iloc[0:0]
            )
            result = build_connection_data(
                server_df,
                ip_field=ip_field,
                bucket=params["bucket"],
                start_ms=params["startMs"],
                end_ms=params["endMs"],
            )
            result["serverName"] = str(escape(server_name))
            servers_out.append(result)

        return {
            "Data": {
                "bucket": params["bucket"],
                "direction": params["direction"],
                "ipType": cfg["ip_type"],
                "servers": servers_out,
            },
            "status": 200,
        }

    except Exception as ex:
        return _handle_exception(ex)
