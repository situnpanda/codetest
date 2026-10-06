"""
Real-Time Network Anomaly Extractor — runs every 10 minutes.
Loads the latest network baseline from Analytics (produced by
daily_pattern_extractor_network.py), compares the most recent NIC readings
against expected values, and pushes detected anomalies to Analytics with
ObjectName = "NetworkRealtimeAnomaly".

Metrics: packets_sent_rate, packets_received_rate (per NIC).

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

from shared.adx import readFromADX
from azure.identity import AzureCliCredential,ManagedIdentityCredential
from azure.kusto.data import KustoConnectionStringBuilder
from azure.kusto.ingest import QueuedIngestClient, IngestionProperties

# --- Configuration ---
ADX_CLUSTER = "https://telemetrycrcav2.westus2.kusto.windows.net"
ADX_DATABASE = "crca_monitoring_telemetry"
ADX_SOURCE_TABLE = "Network_Metrics_Perf"
ANALYTICS_TABLE = "Analytics"

SPIKE_RESID_ABS_THRESHOLD = 20.0   # Legacy fallback for sudden-change check
SPIKE_RESID_PCT_THRESHOLD = 0.4
LOOKBACK_MINUTES = 20

# Detection thresholds — must mirror daily_pattern_extractor_network.py
MAD_Z_THRESHOLD = 3.5              # modified-z gate for residual anomalies
MAD_Z_HIGH = 5.0                   # modified-z high-severity band
ROC_SLOT_Z_THRESHOLD = 4.0         # per-slot delta novelty gate
ROC_NOVELTY_SIGMA = 2.5            # per-slot residual novelty gate for spikes
MAD_SCALE = 0.6745                 # modified-z constant (0.6745 * (x - med) / MAD)

# Severity ordering — mirror the daily merge step.
_SEVERITY_ORDER = {"low": 0, "medium": 1, "high": 2}
_SEVERITY_NAMES = ["low", "medium", "high"]


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


def _score_event(z_max, duration_min, trigger_count):
    """Confidence score in [0, 1] — mirrors _score_event in the daily network
    extractor (z-magnitude, duration, detector consensus; no utilization term)."""
    z_comp = min(max(float(z_max or 0.0), 0.0) / 8.0, 1.0)
    dur_comp = min(max(float(duration_min or 0), 0) / 60.0, 1.0)
    trig_comp = min(max(int(trigger_count or 0), 0) / 2.0, 1.0)
    s = 0.55 * z_comp + 0.25 * dur_comp + 0.20 * trig_comp
    return round(float(max(0.0, min(1.0, s))), 3)


def _slot_stats_lookup(stats, pos):
    """Fetch [median, mad] for a weekly slot from a slot-stats dict. Baseline
    JSON keys are strings after json.loads, so try both str and int keys."""
    if not stats:
        return None
    v = stats.get(str(pos))
    if v is None:
        v = stats.get(pos)
    if not v or len(v) < 2:
        return None
    return float(v[0]), float(v[1])

# Metrics (ObjectName in source → label stored in baseline)
NETWORK_METRICS = [
    ("packets_sent_rate", "PacketsSent"),
    ("packets_received_rate", "PacketsReceived"),
]

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


# --- Load Baselines ---
def load_baselines():
    """Load latest baseline per NIC/metric from Analytics."""
    query = f"""
    {ANALYTICS_TABLE}
    | where ObjectName == 'NetworkPatternSummary'
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
    """Compute expected value from baseline: trend + seasonal."""
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
def check_iqr_anomaly(actual, expected, baseline, ts):
    """Per-slot MAD modified-z residual check — mirrors anomalyDetection in the
    daily network extractor. Uses the bucket_slot_stats[slot] = [median, mad]
    the daily extractor exports, falling back to the global median/mad when the
    weekly slot has no stored stats. Returns (info_or_None, residual, z).
    """
    residual = actual - expected
    pos = get_week_position(ts)
    slot = _slot_stats_lookup(baseline.get("bucket_slot_stats"), pos)
    if slot is not None:
        median_r, mad = slot
    else:
        median_r = baseline.get("median", 0.0)
        mad = baseline.get("mad", 0.0)
    if mad <= 0:
        return None, residual, 0.0

    z = abs(MAD_SCALE * (residual - median_r) / mad)
    if z < MAD_Z_THRESHOLD:
        return None, residual, z
    return {
        "severity": "high" if z >= MAD_Z_HIGH else "medium",
        "direction": "spike" if residual > 0 else "drop",
    }, residual, z


def check_spike(current_val, prev_val, expected, baseline, ts):
    """Per-slot rate-of-change novelty check — mirrors rateOfChangeDetection in
    the daily network extractor: a base roc_threshold gate, then a per-slot
    delta-novelty gate (delta_slot_stats) and a per-slot residual-novelty gate
    (bucket_slot_stats). Returns (info_or_None, delta, z_delta).
    """
    if prev_val is None:
        return None, 0.0, 0.0
    delta = current_val - prev_val
    roc_threshold = baseline.get("roc_threshold", 0.0)

    # Base magnitude gate.
    if roc_threshold > 0:
        if abs(delta) <= roc_threshold:
            return None, delta, 0.0
    else:
        if prev_val == 0 or not (abs(delta) > SPIKE_RESID_ABS_THRESHOLD and
                                 abs(delta) / abs(prev_val) > SPIKE_RESID_PCT_THRESHOLD):
            return None, delta, 0.0

    pos = get_week_position(ts)

    # Per-slot delta novelty (only enforced when the slot has stored stats).
    z_delta = 0.0
    dslot = _slot_stats_lookup(baseline.get("delta_slot_stats"), pos)
    if dslot is not None:
        d_med, d_mad = dslot
        if d_mad > 0:
            z_delta = abs(MAD_SCALE * (delta - d_med) / d_mad)
            if z_delta < ROC_SLOT_Z_THRESHOLD:
                return None, delta, z_delta

    # Per-slot residual novelty: the landing point must itself be off-profile.
    rslot = _slot_stats_lookup(baseline.get("bucket_slot_stats"), pos)
    if rslot is not None:
        r_med, r_mad = rslot
        if r_mad > 0:
            sigma = r_mad / MAD_SCALE
            if abs((current_val - expected) - r_med) < ROC_NOVELTY_SIGMA * sigma:
                return None, delta, z_delta

    high = roc_threshold > 0 and abs(delta) > 2 * roc_threshold
    return {
        "severity": "high" if high else "medium",
        "direction": "spike" if delta > 0 else "drop",
    }, delta, z_delta


# --- Fetch Latest Readings ---
def fetch_latest_readings(obj_name):
    """Fetch last 20 min of readings for all NICs for one network metric."""
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=LOOKBACK_MINUTES)).strftime('%Y-%m-%d %H:%M:%S')
    query = f"""
    {ADX_SOURCE_TABLE}
    | where ObjectName == '{obj_name}'
    | where TimeGenerated >= datetime('{cutoff}')
    | extend NicName = extract('ServerNic/(.+)', 1, ResourceId)
    | where isnotempty(NicName)
    | project TimeGenerated, NicName, AvgValue
    | order by NicName asc, TimeGenerated asc
    """
    df = readFromADX(query)
    if df.empty:
        return {}

    df["TimeGenerated"] = pd.to_datetime(df["TimeGenerated"])
    result = {}
    for nic, grp in df.groupby("NicName"):
        result[nic] = grp.sort_values("TimeGenerated").tail(2)
    return result


# --- Main ---
def run():
    run_time = datetime.now(timezone.utc)
    print(f"Network Real-Time Anomaly Extractor — {run_time.strftime('%Y-%m-%d %H:%M:%S')} UTC")

    baselines = load_baselines()
    if not baselines:
        print("No baselines found. Run daily_pattern_extractor_network.py first.")
        return

    print(f"Baselines loaded: {len(baselines)}")

    all_anomalies = []

    for obj_name, metric_label in NETWORK_METRICS:
        nic_readings = fetch_latest_readings(obj_name)

        for nic_name, readings in nic_readings.items():
            baseline = baselines.get((nic_name, metric_label))
            if not baseline:
                continue
            if readings is None or len(readings) == 0:
                continue

            # Score the latest reading only (one event per NIC/metric per run),
            # matching realtime_anomaly_extractor_utilization.
            latest = readings.iloc[-1]
            ts = latest["TimeGenerated"]
            actual = float(latest["AvgValue"])
            n = readings_since_baseline(baseline, ts)
            expected = get_expected(baseline, ts, n)

            residual_info, residual, z_res = check_iqr_anomaly(actual, expected, baseline, ts)

            prev_val = float(readings.iloc[-2]["AvgValue"]) if len(readings) >= 2 else None
            spike_info, delta, z_delta = check_spike(actual, prev_val, expected, baseline, ts)

            if not (residual_info or spike_info):
                continue

            triggers = []
            severities = []
            direction = None
            prev_value = pct_change = None
            if residual_info:
                triggers.append("mad_outlier")
                severities.append(residual_info["severity"])
                direction = residual_info["direction"]
            if spike_info:
                triggers.append("rate_of_change_spike")
                severities.append(spike_info["severity"])
                direction = spike_info["direction"]
                prev_value = round(prev_val, 2) if prev_val is not None else None
                pct_change = round(abs(delta) / (abs(prev_val) + 1e-6) * 100.0, 1) if prev_val is not None else None

            # Primary category by priority (residual > rate-of-change), severity
            # = max(individual) bumped on multi-trigger consensus — mirrors the
            # daily merge step.
            category = "residual_anomaly" if residual_info else "rate_of_change_spike"
            severity = _sev_max(*severities)
            if len(triggers) >= 2:
                severity = _sev_bump(severity)
            z_max = max(z_res or 0.0, z_delta or 0.0)

            all_anomalies.append({
                "NicName": nic_name,
                "MetricType": metric_label,
                "TimeGenerated": ts,
                "Data": {
                    "category": category,
                    "triggers": triggers,
                    "time": str(ts),
                    "value": round(actual, 2),
                    "expected_value": round(expected, 2),
                    "prev_value": prev_value,
                    "delta": round(delta, 2) if spike_info else None,
                    "pct_change": pct_change,
                    "residual": round(residual, 2),
                    "severity": severity,
                    "direction": direction,
                    "score": _score_event(z_max, 10, len(triggers)),
                    "detected_at": str(run_time),
                },
            })

    # --- Output ---
    if all_anomalies:
        analytics_rows = []
        for a in all_anomalies:
            analytics_rows.append({
                "TimeGenerated": a["TimeGenerated"],
                "ResourceId": a["NicName"],
                "ObjectName": "NetworkRealtimeAnomaly",
                "CounterName": a["MetricType"],
                "Data": json.dumps(a["Data"], default=str),
            })
        df = pd.DataFrame(analytics_rows)
        ingest_anomalies(df)
        print(f"\nDetected {len(all_anomalies)} anomalies:")
        for a in all_anomalies:
            d = a["Data"]
            print(f"  {a['NicName']}/{a['MetricType']}: {d['category']} actual={d['value']}, "
                  f"expected={d['expected_value']}, residual={d['residual']:+.1f}, "
                  f"triggers={d['triggers']}, severity={d['severity']}, score={d['score']}")
    else:
        print("\nNo anomalies detected.")


if __name__ == "__main__":
    run()
