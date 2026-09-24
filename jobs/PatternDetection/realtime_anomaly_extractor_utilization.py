"""
Real-Time Anomaly Extractor — runs every 10 minutes.
Loads the latest baseline from Analytics table (produced by daily_pattern_extractor_utilization.py),
compares the most recent server reading against expected values, and pushes
detected anomalies to Analytics table with ObjectName = "RealtimeAnomaly".

Schema parity with daily_pattern_extractor_utilization.py — every entry has a
`category` field and uses the same snake_case keys, so the same downstream
consumers can read both PatternSummary.Anomalies and RealtimeAnomaly rows.

Categories emitted (aligned with daily_pattern_extractor_utilization.py):
  - "residual_anomaly"     IQR-outlier on the latest reading.
  - "rate_of_change_spike" Sudden raw-utilization jump/drop on the latest reading.
  - "threshold_breach"     Latest reading >= 90% (model-free).
  - "sustained_high"       Last 3 consecutive 10-min readings all >= 90%.

Coincident point detectors on the latest reading are merged into ONE event
whose `triggers` lists every detector that fired, exactly like the daily
extractor's merge_events_by_overlap. Every event carries a confidence `score`.

Metrics: CPU, Memory, Disk (per-drive).

Schedule: Every 10 minutes via Task Scheduler or Azure Function timer.
"""

import pandas as pd
import json
import sys
from pathlib import Path
from datetime import datetime, timedelta, timezone

# Add the backend root (two levels up from Batch Jobs/PatternDetection) to sys.path
root = Path(__file__).resolve().parents[2]
sys.path.append(str(root))

from shared.ADX import readFromADX
from shared.dataBase import queryDw
from shared.keyVault import connectToKeyVault
from azure.identity import AzureCliCredential,ManagedIdentityCredential
from azure.kusto.data import KustoConnectionStringBuilder
from azure.kusto.ingest import QueuedIngestClient, IngestionProperties

# --- Configuration ---
ADX_CLUSTER = "https://telemetrycrcav2.westus2.kusto.windows.net"
ADX_DATABASE = "crca_monitoring_telemetry"
ADX_SOURCE_TABLE = "Server_Metrics_Perf"
ANALYTICS_TABLE = "Analytics"

# Detection thresholds — must mirror daily_pattern_extractor_utilization.py
MIN_RESIDUAL_MAGNITUDE = 9.0
HIGH_UTIL_THRESHOLD = 90.0
# Rate-of-change gates now operate on RAW utilization deltas (matching the
# daily extractor's rateOfChangeDetection) instead of residual deltas.
SPIKE_PCT_THRESHOLD = 0.4
SPIKE_ABS_THRESHOLD = 30.0
SPIKE_TARGET_MIN = 60.0   # positive spike only interesting if landing util  > this
DROP_TARGET_MAX = 2.0     # negative spike only interesting if landing util <= this
SUSTAINED_THRESHOLD = 90.0
SUSTAINED_MIN_CONSECUTIVE = 3

# Severity ordering + category priority — mirror the daily merge step.
_SEVERITY_ORDER = {"low": 0, "medium": 1, "high": 2}
_SEVERITY_NAMES = ["low", "medium", "high"]
_CATEGORY_PRIORITY = {
    "residual_anomaly": 0,
    "rate_of_change_spike": 1,
    "sustained_high": 2,
    "threshold_breach": 3,
}


def _sev_max(*severities):
    """Highest severity among the arguments (ignoring falsy)."""
    best = 0
    for s in severities:
        if s:
            best = max(best, _SEVERITY_ORDER.get(s, 0))
    return _SEVERITY_NAMES[best]


def _sev_bump(s):
    """Bump one severity level up, capped at 'high'."""
    return _SEVERITY_NAMES[min(2, _SEVERITY_ORDER.get(s, 1) + 1)]


def _score_event(z_max, duration_min, utilization, trigger_count):
    """Confidence score in [0, 1] — mirrors _score_event in the daily extractor
    (per-bucket z-magnitude, duration, absolute level, detector consensus)."""
    z_comp = min(max(float(z_max or 0.0), 0.0) / 8.0, 1.0)
    dur_comp = min(max(float(duration_min or 0), 0) / 60.0, 1.0)
    util_comp = min(max(float(utilization or 0.0), 0.0) / 100.0, 1.0)
    trig_comp = min(max(int(trigger_count or 0), 0) / 3.0, 1.0)
    s = 0.40 * z_comp + 0.20 * dur_comp + 0.20 * util_comp + 0.20 * trig_comp
    return round(float(max(0.0, min(1.0, s))), 3)

# Lookback wide enough to (a) detect a 3-reading sustained streak ending now and
# (b) give the spike-check a previous residual for context.
LOOKBACK_MINUTES = 40


# --- ADX Ingestion ---
def ingest_anomalies(analytics_df):
    if analytics_df.empty:
        return
    # credential = AzureCliCredential()
    credential = ManagedIdentityCredential(client_id='015ad614-f9a5-4333-83b4-b71c01c393d8')
    ingest_uri = ADX_CLUSTER.replace("https://", "https://ingest-")
    kcsb = KustoConnectionStringBuilder.with_azure_token_credential(ingest_uri, credential)
    client = QueuedIngestClient(kcsb)
    props = IngestionProperties(database=ADX_DATABASE, table=ANALYTICS_TABLE)
    client.ingest_from_dataframe(analytics_df, ingestion_properties=props)
    print(f"  Queued {len(analytics_df)} anomalies → {ANALYTICS_TABLE}")


# --- Server List ---
def get_server_list():
    """Fetch the monitored server list from the DW. Returns a set of server names."""
    srv = 'sqldb-azure-prod-012.database.windows.net'
    db = 'crcamonitoring'
    usr = 'servCRCAMonitoring@providence.org'
    pwd = connectToKeyVault("servCRCAMonitoring-AAD-iTelemetry")
    drv = '{ODBC Driver 17 for SQL Server}'
    conn = f"Driver={drv};UID={usr};PWD={pwd};Authentication=ActiveDirectoryPassword;Server={srv};Database={db}"
    rows = queryDw(conn, "Select ServerName from CrcaServerListData where AppFamily like 'deviceconx'")
    return {row[0].strip() for row in rows if row[0]}


# --- Load Baselines ---
def load_baselines(server_names):
    """Load latest baseline per server/metric from Analytics table, scoped to server_names."""
    server_list = ", ".join(f"'{s}'" for s in server_names)
    query = f"""
    {ANALYTICS_TABLE}
    | where ObjectName == 'PatternSummary'
    | where ResourceId in ({server_list})
    | summarize arg_max(TimeGenerated, Data) by ResourceId, CounterName
    | project ResourceId, CounterName, Data
    """
    df = readFromADX(query)
    if df.empty:
        return {}

    baselines = {}
    for _, row in df.iterrows():
        key = (row["ResourceId"], row["CounterName"])
        try:
            data = json.loads(row["Data"])
            baselines[key] = data["BaselineJSON"]
        except (json.JSONDecodeError, TypeError, KeyError):
            continue
    return baselines


# --- Baseline Calculations ---
def get_week_position(ts):
    """Map timestamp to weekly position (0-1007): day*144 + hour*6 + minute//10."""
    return ts.dayofweek * 144 + ts.hour * 6 + ts.minute // 10


def get_expected(baseline, ts, readings_since):
    """Compute expected utilization from baseline: trend + seasonal."""
    pos = get_week_position(ts)
    profile = baseline["seasonal_profile"]
    seasonal = profile[pos] if pos < len(profile) else 0.0
    trend_val = baseline["trend_last_value"] + baseline["trend_slope"] * readings_since
    return trend_val + seasonal


def readings_since_baseline(baseline, current_time):
    """Count 10-min readings elapsed since baseline was computed."""
    baseline_time = pd.to_datetime(baseline["trend_last_time"])
    return int((current_time - baseline_time).total_seconds() / 600)


# --- Anomaly Checks ---
def check_iqr_anomaly(actual, expected, baseline):
    """Check if residual exceeds IQR bounds + the significance floor.

    Returns (anomaly_info_or_None, residual, z_proxy). The `is_critical`
    (util >= threshold auto-flag) override was removed to mirror the daily
    extractor — absolute breaches are now their own `threshold_breach`
    category, and sustained elevation is covered by `sustained_high`.
    """
    residual = actual - expected
    outside_bounds = residual < baseline["lower_bound"] or residual > baseline["upper_bound"]
    is_significant = abs(residual) >= MIN_RESIDUAL_MAGNITUDE
    if not (outside_bounds and is_significant):
        return None, residual, 0.0

    iqr = baseline["residual_IQR"]
    # Modified-z proxy: IQR ~= 1.35*sigma, so residual/sigma ~= 1.35*residual/IQR.
    # Keeps the confidence score on the same z-scale the daily extractor uses.
    z_proxy = abs(residual) * 1.35 / max(iqr, 1e-6)
    return {
        "severity": "high" if abs(residual) > 3 * iqr else "medium",
        "direction": "spike" if residual > 0 else "drop",
    }, residual, z_proxy


def check_spike(current_util, prev_util):
    """Raw-utilization rate-of-change gate — mirrors rateOfChangeDetection.

    Dual base gate (pct AND absolute delta) plus the daily extractor's
    direction-aware landing-zone gate: a positive spike only matters when the
    result lands above SPIKE_TARGET_MIN, a negative spike only when the result
    collapses to <= DROP_TARGET_MAX. Returns a dict of ROC fields or None.
    """
    if prev_util is None:
        return None
    d = current_util - prev_util
    if d == 0:
        return None
    pct = abs(d) / abs(prev_util) if prev_util != 0 else 1.0
    if not (pct > SPIKE_PCT_THRESHOLD and abs(d) > SPIKE_ABS_THRESHOLD):
        return None
    if d > 0 and current_util <= SPIKE_TARGET_MIN:
        return None
    if d < 0 and current_util > DROP_TARGET_MAX:
        return None
    return {
        "prev_utilization": round(prev_util, 2),
        "delta": round(d, 2),
        "pct_change": round(pct * 100.0, 1),
        "direction": "spike" if d > 0 else "drop",
        "severity": "high" if abs(d) > 2 * SPIKE_ABS_THRESHOLD else "medium",
    }


def sustained_severity(max_util):
    """Mirror detect_sustained_high() severity tiers from the daily extractor."""
    if max_util >= 95:
        return "high"
    if max_util >= 90:
        return "medium"
    return "low"


# --- Event Builders (output schema = daily extractor's Anomalies entries) ---
def build_point_event(ts, actual, expected, residual, z_res,
                      residual_info, spike_info, is_breach, run_time):
    """Merge coincident residual / rate-of-change / threshold detectors on the
    latest reading into ONE event, mirroring merge_events_by_overlap in the
    daily extractor: union of triggers, primary category by priority, severity
    = max(individual) bumped one level on multi-trigger consensus, with the
    business override that any utilization > 90 is always high. Returns None
    when no point detector fired.
    """
    if not (residual_info or spike_info or is_breach):
        return None

    triggers = []
    severities = []
    categories = []
    if residual_info:
        triggers.append("iqr_outlier")
        severities.append(residual_info["severity"])
        categories.append("residual_anomaly")
    if spike_info:
        triggers.append("rate_of_change_spike")
        severities.append(spike_info["severity"])
        categories.append("rate_of_change_spike")
    if is_breach:
        triggers.append("threshold_breach")
        severities.append("high")
        categories.append("threshold_breach")

    primary = min(categories, key=lambda c: _CATEGORY_PRIORITY.get(c, 99))
    sev = _sev_max(*severities)
    if len(triggers) >= 2:
        sev = _sev_bump(sev)
    if actual > HIGH_UTIL_THRESHOLD:
        sev = "high"

    # threshold_breach is model-free -> no model expectation/residual to report.
    has_model = bool(residual_info or spike_info)
    z_synth = 1.0 + max(0.0, (actual - HIGH_UTIL_THRESHOLD) / max(100.0 - HIGH_UTIL_THRESHOLD, 1.0))
    z_max = max(z_res or 0.0, z_synth if is_breach else 0.0)

    return {
        "category": primary,
        "triggers": triggers,
        "time": str(ts),
        "utilization": round(actual, 2),
        "expected_utilization": round(expected, 2) if has_model else None,
        "prev_utilization": spike_info["prev_utilization"] if spike_info else None,
        "delta": spike_info["delta"] if spike_info else None,
        "pct_change": spike_info["pct_change"] if spike_info else None,
        "direction": spike_info["direction"] if spike_info else None,
        "residual": round(residual, 2) if has_model else None,
        "day": ts.day_name() if hasattr(ts, "day_name") else None,
        "severity": sev,
        "score": _score_event(z_max, 10, actual, len(triggers)),
        "detected_at": str(run_time),
    }


def build_sustained_event(window, run_time):
    """Sustained-high entry matching detect_sustained_high() output shape."""
    utils = [float(u) for u in window["AvgValue"].values]
    start_ts = window["TimeGenerated"].iloc[0]
    end_ts = window["TimeGenerated"].iloc[-1]
    max_util = max(utils)
    duration_min = int((end_ts - start_ts).total_seconds() / 60) + 10
    severity = sustained_severity(max_util)
    # Business override mirrors the daily merge: any utilization > 90 is high.
    if max_util > HIGH_UTIL_THRESHOLD:
        severity = "high"
    z_synth = 1.0 + max(0.0, (max_util - SUSTAINED_THRESHOLD) / max(100.0 - SUSTAINED_THRESHOLD, 1.0))
    return {
        "category": "sustained_high",
        "triggers": ["sustained_high"],
        "start": str(start_ts),
        "end": str(end_ts),
        "duration_minutes": duration_min,
        "count": int(len(window)),
        "avg_utilization": round(sum(utils) / len(utils), 2),
        "max_utilization": round(max_util, 2),
        "day": start_ts.day_name(),
        "severity": severity,
        "score": _score_event(z_synth, duration_min, max_util, 1),
        "detected_at": str(run_time),
    }


# --- Fetch Latest Readings ---
def fetch_latest_readings(obj_name, counter_name, server_names):
    """Fetch last LOOKBACK_MINUTES of readings for monitored servers for one metric type."""
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=LOOKBACK_MINUTES)).strftime('%Y-%m-%d %H:%M:%S')
    server_filter = " or ".join(f"ResourceId has 'ServerName/{s}'" for s in server_names)
    query = f"""
    {ADX_SOURCE_TABLE}
    | where ObjectName == '{obj_name}' and CounterName == '{counter_name}'
    | where TimeGenerated >= datetime('{cutoff}')
    | where {server_filter}
    | extend ServerName = extract('ServerName/(.+)', 1, ResourceId)
    | where isnotempty(ServerName)
    | project TimeGenerated, ServerName, AvgValue
    | order by ServerName asc, TimeGenerated asc
    """
    df = readFromADX(query)
    if df.empty:
        return {}

    df["TimeGenerated"] = pd.to_datetime(df["TimeGenerated"])
    result = {}
    for server, grp in df.groupby("ServerName"):
        result[server] = grp.sort_values("TimeGenerated").reset_index(drop=True)
    return result


def fetch_latest_disk_readings(server_names):
    """Fetch last LOOKBACK_MINUTES of Disk readings, grouped by (server, drive)."""
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=LOOKBACK_MINUTES)).strftime('%Y-%m-%d %H:%M:%S')
    server_filter = " or ".join(f"ResourceId has 'ServerName/{s}'" for s in server_names)
    query = f"""
    {ADX_SOURCE_TABLE}
    | where ObjectName == 'LogicalDisk' and CounterName == '% Free Space'
    | where TimeGenerated >= datetime('{cutoff}')
    | where {server_filter}
    | where trim(' ', DriveName) in ('C:', 'D:')
    | extend ServerName = extract('ServerName/(.+)', 1, ResourceId)
    | where isnotempty(ServerName)
    | project TimeGenerated, ServerName, DriveName = trim(' ', DriveName), AvgValue = 100 - AvgValue
    | order by ServerName asc, DriveName asc, TimeGenerated asc
    """
    df = readFromADX(query)
    if df.empty:
        return {}

    df["TimeGenerated"] = pd.to_datetime(df["TimeGenerated"])
    result = {}
    for (server, drive), grp in df.groupby(["ServerName", "DriveName"]):
        key = (server, f"Disk {drive}")
        result[key] = grp.sort_values("TimeGenerated").reset_index(drop=True)
    return result


# --- Per-(server, metric) detection ---
def detect_events(readings, baseline, run_time):
    """Run residual_anomaly + sustained_high checks on a server/metric's recent readings.

    Returns a list of event dicts shaped exactly like daily-extractor Anomalies entries.
    Only the latest reading is scored for residual_anomaly (one event per run, per metric),
    and at most one sustained_high event is emitted when the trailing window qualifies.
    """
    events = []
    if readings is None or readings.empty:
        return events

    # --- Point detectors on the latest reading only ---
    latest = readings.iloc[-1]
    ts = latest["TimeGenerated"]
    actual = float(latest["AvgValue"])
    n = readings_since_baseline(baseline, ts)
    expected = get_expected(baseline, ts, n)

    residual_info, residual, z_res = check_iqr_anomaly(actual, expected, baseline)

    # Rate-of-change now compares RAW utilization to the previous reading
    # (matching the daily extractor), not residual deltas.
    prev_util = None
    if len(readings) >= 2:
        prev_util = float(readings.iloc[-2]["AvgValue"])
    spike_info = check_spike(actual, prev_util)

    # Model-free absolute breach detector (daily thresholdBreachDetection).
    is_breach = actual >= HIGH_UTIL_THRESHOLD

    point_event = build_point_event(
        ts, actual, expected, residual, z_res,
        residual_info, spike_info, is_breach, run_time,
    )
    if point_event:
        events.append(point_event)

    # --- Sustained-high: last N consecutive readings all >= threshold ---
    if len(readings) >= SUSTAINED_MIN_CONSECUTIVE:
        tail = readings.tail(SUSTAINED_MIN_CONSECUTIVE)
        if (tail["AvgValue"] >= SUSTAINED_THRESHOLD).all():
            # Ensure those readings are actually consecutive 10-min samples
            gaps = tail["TimeGenerated"].diff().dropna()
            if (gaps <= pd.Timedelta("10min")).all():
                events.append(build_sustained_event(tail, run_time))

    return events


# --- Main ---
def run():
    run_time = datetime.now(timezone.utc)
    print(f"Real-Time Anomaly Extractor — {run_time.strftime('%Y-%m-%d %H:%M:%S')} UTC")

    server_names = get_server_list()
    if not server_names:
        print("No servers found in server list. Exiting.")
        return
    print(f"Servers in scope: {len(server_names)}")

    baselines = load_baselines(server_names)
    if not baselines:
        print("No baselines found. Run daily_pattern_extractor_utilization.py first.")
        return

    print(f"Baselines loaded: {len(baselines)}")

    metrics = [
        (("Processor", "% Processor Time"), "CPU"),
        (("Memory", "% Committed Bytes In Use"), "Memory"),
    ]

    # Build a single (server, metric_label) -> readings_df map across all metrics.
    readings_by_key = {}
    for (obj_name, counter_name), metric_label in metrics:
        for server_name, readings in fetch_latest_readings(obj_name, counter_name, server_names).items():
            readings_by_key[(server_name, metric_label)] = readings
    for key, readings in fetch_latest_disk_readings(server_names).items():
        readings_by_key[key] = readings

    # Run detection per (server, metric_label).
    analytics_rows = []
    summary_lines = []
    for (server_name, metric_label), readings in readings_by_key.items():
        baseline = baselines.get((server_name, metric_label))
        if not baseline:
            continue

        for event in detect_events(readings, baseline, run_time):
            event_ts = event.get("time") or event.get("end")
            analytics_rows.append({
                "TimeGenerated": pd.to_datetime(event_ts),
                "ResourceId": server_name,
                "ObjectName": "RealtimeAnomaly",
                "CounterName": metric_label,
                "Data": json.dumps(event, default=str),
            })
            summary_lines.append((server_name, metric_label, event))

    # --- Output ---
    if analytics_rows:
        ingest_anomalies(pd.DataFrame(analytics_rows))
        print(f"\nDetected {len(analytics_rows)} events:")
        for server_name, metric_label, event in summary_lines:
            if event["category"] == "sustained_high":
                print(f"  {server_name}/{metric_label}: sustained_high "
                      f"{event['start']} → {event['end']} "
                      f"(avg={event['avg_utilization']}%, peak={event['max_utilization']}%, "
                      f"severity={event['severity']}, score={event['score']})")
            else:
                print(f"  {server_name}/{metric_label}: {event['category']} "
                      f"actual={event['utilization']}%, expected={event['expected_utilization']}%, "
                      f"triggers={event['triggers']}, severity={event['severity']}, "
                      f"score={event['score']}")
    else:
        print("\nNo anomalies detected.")


if __name__ == "__main__":
    run()
