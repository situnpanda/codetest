"""
Real-Time Seasonality Anomaly Extractor -- runs every 10 minutes.

Consumes the compact per-(day-of-week, hour) baseline that
utilization_seasonality_daily_extractor.py embeds in each Analytics row
(ObjectName == 'UtilPatternSummary', Data.baseline, method == 'mstl_dow_hour'),
then scores the SINGLE most-recent reading for each (server, metric) WITHOUT
re-running MSTL.

Why a frozen baseline?
    MSTL (daily + weekly decomposition over 30 days) is far too expensive to run
    every 10 minutes. The daily job runs it once and freezes, per (dow, hour)
    bucket, the three numbers a realtime check needs:
        expected     -- typical utilization for that weekday+hour
        resid_median -- the residual centre for that bucket (usually ~0)
        resid_mad    -- the robust spread (the tolerance)

Same determination as the daily extractor:
    This scores the LATEST sample with the SAME gate stack the daily job uses
    (a short history window is fetched so the rolling/persistence gates have data):
        Gate 2  per-(dow,hour) MAD modified z-score  >= z_threshold
        Gate 3  rolling holdback z-score             >= ROLLING_Z_THRESHOLD
        Gate 4  persistence: latest + >= K of last N samples pass Gates 2 & 3
    Gate 1 (edge-trim) is a daily MSTL warm-up artifact and does not apply.
    Because realtime cannot see future points, Gate 4's centered window becomes
    a trailing window (causal).

Optional trend drift:
    For slow-growing metrics (e.g. disk), expected can be extrapolated forward
    from baseline_end_utc using trend_slope_per_day, so a baseline that is a few
    days old does not drift out of alignment. Toggle with APPLY_TREND_DRIFT.

Also emits a model-free 'threshold_breach' when the latest reading is >= 90%.

Emits ONE Analytics row per detected event with ObjectName == 'RealtimeAnomaly'.

Metrics: CPU, Memory, Disk C:, Disk D:.
Schedule: every 10 minutes (Task Scheduler / Azure Function timer).

Usage:
    python realtime_anomaly_extractor_seasonality.py [--dry-run]
    --dry-run : score and print detected events but DO NOT ingest to ADX.
"""

import argparse
import json
import sys
from pathlib import Path
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

# Add the backend root (two levels up from Batch Jobs/PatternDetection) to sys.path
root = Path(__file__).resolve().parents[2]
sys.path.append(str(root))

from shared.ADX import readFromADX
from azure.identity import ManagedIdentityCredential
from azure.kusto.data import KustoConnectionStringBuilder
from azure.kusto.ingest import QueuedIngestClient, IngestionProperties


# --- Configuration ---
ADX_CLUSTER = "https://telemetrycrcav2.westus2.kusto.windows.net"
ADX_DATABASE = "crca_monitoring_telemetry"
ADX_SOURCE_TABLE = "Server_Metrics_Perf"
ANALYTICS_TABLE = "Analytics"

# Row markers produced by utilization_seasonality_daily_extractor.py.
DAILY_OBJECT_NAME = "UtilPatternSummary"
BASELINE_METHOD = "mstl_dow_hour"
# Marker written by THIS extractor.
REALTIME_OBJECT_NAME = "RealtimeAnomaly"

HIGH_UTIL_THRESHOLD = 90.0   # model-free absolute breach cutoff (%)
MANAGED_IDENTITY_CLIENT_ID = "015ad614-f9a5-4333-83b4-b71c01c393d8"

# Gates mirrored from utilization_seasonality_daily_extractor.py so realtime
# determines an anomaly the SAME way the daily job does.
MAD_Z_DEFAULT = 3.5          # per-(dow,hour) modified-z cutoff (baseline overrides)
ROLLING_WINDOW = 7 * 144     # 7-day rolling holdback window (samples)
ROLLING_MIN_PERIODS = 500    # ~3.5 days before the rolling z is trusted
ROLLING_Z_THRESHOLD = 2.5    # candidate must also be unusual vs recent past
PERSISTENCE_K = 2            # keep a point only if >= K of last N samples fire
PERSISTENCE_N = 3

# Realtime must pull enough history to compute the rolling holdback + persistence.
WINDOW_DAYS = 8              # a little over the 7-day rolling window

# Extrapolate expected forward using the baseline's per-day trend slope.
# Helpful for disk (slow growth); near-zero effect for CPU/Memory.
APPLY_TREND_DRIFT = True
MAX_DRIFT_DAYS = 7           # never extrapolate further than this many days

# Metric label -> (ObjectName, CounterName) for the source telemetry.
CPU_MEM_METRICS = [
    ("CPU", "Processor", "% Processor Time"),
    ("Memory", "Memory", "% Committed Bytes In Use"),
]


# --- ADX ingest ---
def get_ingest_client():
    credential = ManagedIdentityCredential(client_id=MANAGED_IDENTITY_CLIENT_ID)
    ingest_uri = ADX_CLUSTER.replace("https://", "https://ingest-")
    kcsb = KustoConnectionStringBuilder.with_azure_token_credential(ingest_uri, credential)
    return QueuedIngestClient(kcsb)


def ingest_anomalies(df):
    if df.empty:
        return
    client = get_ingest_client()
    props = IngestionProperties(database=ADX_DATABASE, table=ANALYTICS_TABLE)
    client.ingest_from_dataframe(df, ingestion_properties=props)
    print(f"  Queued {len(df)} events -> {ANALYTICS_TABLE}")


# --- Load baselines ---
def load_baselines():
    """Load the latest embedded baseline per (server, metric) from Analytics.

    Returns { (server, metric_label): baseline_dict } for rows whose baseline
    uses the expected mstl_dow_hour method. A per-baseline 'global_expected'
    (median of bucket expecteds) is added as a fallback for missing buckets.
    """
    query = f"""
    {ANALYTICS_TABLE}
    | where ObjectName == '{DAILY_OBJECT_NAME}'
    | summarize arg_max(TimeGenerated, Data) by ResourceId, CounterName
    | project ResourceId, CounterName, Data
    """
    df = readFromADX(query)
    if df is None or df.empty:
        return {}

    baselines = {}
    for _, row in df.iterrows():
        try:
            data = json.loads(row["Data"])
        except (json.JSONDecodeError, TypeError):
            continue
        baseline = (data or {}).get("baseline")
        if not baseline or baseline.get("method") != BASELINE_METHOD:
            continue
        buckets = baseline.get("buckets") or {}
        if not buckets:
            continue
        # Fallback expected = median of all bucket expecteds.
        exp_vals = sorted(b["expected"] for b in buckets.values())
        baseline["global_expected"] = exp_vals[len(exp_vals) // 2]
        baselines[(row["ResourceId"], row["CounterName"])] = baseline
    return baselines


# --- Fetch recent history window ---
def _prep_series(df):
    """Normalize to a tz-naive UTC 10-min series indexed by time, Utilization col."""
    df = df.copy()
    ts = pd.to_datetime(df["TimeGenerated"])
    if getattr(ts.dt, "tz", None) is not None:
        ts = ts.dt.tz_convert("UTC").dt.tz_localize(None)
    df["TimeGenerated"] = ts
    df = df.drop_duplicates(subset=["TimeGenerated"]).sort_values("TimeGenerated")
    return df.set_index("TimeGenerated")


def fetch_window_cpu_mem(obj_name, counter_name, server_names):
    """Last WINDOW_DAYS of readings per server for one CPU/Memory counter."""
    if not server_names:
        return {}
    tokens = ", ".join(f"'{n}'" for n in server_names)
    cutoff = (datetime.now(timezone.utc) - timedelta(days=WINDOW_DAYS)).strftime("%Y-%m-%d %H:%M:%S")
    query = f"""
    {ADX_SOURCE_TABLE}
    | where TimeGenerated >= datetime('{cutoff}')
    | where ObjectName == '{obj_name}' and CounterName == '{counter_name}'
    | where ResourceId has_any ({tokens})
    | extend ServerName = tostring(split(extract(@'(?:^|/)ServerName/([^/]+)', 1, ResourceId), '_')[0])
    | where isnotempty(ServerName)
    | project TimeGenerated, ServerName, Utilization = AvgValue
    | order by ServerName asc, TimeGenerated asc
    """
    df = readFromADX(query)
    if df is None or df.empty:
        return {}
    return {str(name): _prep_series(g.drop(columns=["ServerName"]))
            for name, g in df.groupby("ServerName", sort=False)}


def fetch_window_disk(server_names):
    """Last WINDOW_DAYS of Disk % Used readings per (server, drive)."""
    if not server_names:
        return {}
    tokens = ", ".join(f"'ServerName/{n}'" for n in server_names)
    cutoff = (datetime.now(timezone.utc) - timedelta(days=WINDOW_DAYS)).strftime("%Y-%m-%d %H:%M:%S")
    query = f"""
    {ADX_SOURCE_TABLE}
    | where TimeGenerated >= datetime('{cutoff}')
    | where ObjectName == 'LogicalDisk' and CounterName == '% Free Space'
    | where trim(' ', DriveName) in ('C:', 'D:')
    | where ResourceId has_any ({tokens})
    | extend ServerName = tostring(split(extract(@'(?:^|/)ServerName/([^/]+)', 1, ResourceId), '_')[0])
    | where isnotempty(ServerName)
    | project TimeGenerated, ServerName, DriveName = trim(' ', DriveName), Utilization = 100.0 - AvgValue
    | order by ServerName asc, DriveName asc, TimeGenerated asc
    """
    df = readFromADX(query)
    if df is None or df.empty:
        return {}
    out = {}
    for (name, drive), g in df.groupby(["ServerName", "DriveName"], sort=False):
        label = f"Disk {str(drive).strip()}"
        out[(str(name), label)] = _prep_series(g.drop(columns=["ServerName", "DriveName"]))
    return out


# --- Scoring (mirrors the daily extractor's Gate 2 + Gate 3 + Gate 4) ---
def _days_since_baseline(baseline, ts):
    end = baseline.get("baseline_end_utc")
    if not end:
        return 0.0
    end_ts = pd.to_datetime(end)
    # Series index is tz-naive UTC; normalize the baseline anchor to match.
    if end_ts.tzinfo is not None:
        end_ts = end_ts.tz_convert("UTC").tz_localize(None)
    delta_days = (ts - end_ts).total_seconds() / 86400.0
    return max(0.0, min(delta_days, MAX_DRIFT_DAYS))


def _severity_and_confidence(z_mod):
    """Same mapping as the daily extractor's _confidence_and_severity."""
    confidence = round(min(max(abs(z_mod) / 8.0, 0.0), 1.0), 3)
    az = abs(z_mod)
    if az >= 5.0:
        severity = "high"
    elif az >= 4.0:
        severity = "medium"
    else:
        severity = "low"
    return severity, confidence


def _expected_and_band(baseline, ts):
    """(expected, resid_median, resid_mad, bucket_key) for one timestamp, with
    optional trend drift. Falls back to global stats when the bucket is missing."""
    key = f"{int(ts.dayofweek)}_{int(ts.hour)}"
    b = (baseline.get("buckets") or {}).get(key)
    if b is not None:
        expected = float(b["expected"])
        resid_median = float(b["resid_median"])
        resid_mad = float(b["resid_mad"])
        bucket_key = key
    else:
        expected = float(baseline.get("global_expected", 0.0))
        resid_median = 0.0
        resid_mad = float(baseline.get("global_resid_mad", 0.0))
        bucket_key = "global"
    if APPLY_TREND_DRIFT and baseline.get("trend_slope_per_day"):
        expected += float(baseline["trend_slope_per_day"]) * _days_since_baseline(baseline, ts)
    return expected, resid_median, resid_mad, bucket_key


def _rolling_z(residual):
    """Rolling-window z of the residual proxy -- mirrors the daily extractor's
    _rolling_zscore holdback cross-validator (Gate 3)."""
    rmean = residual.rolling(window=ROLLING_WINDOW, min_periods=ROLLING_MIN_PERIODS).mean()
    rstd = residual.rolling(window=ROLLING_WINDOW, min_periods=ROLLING_MIN_PERIODS).std().replace(0.0, np.nan)
    return (residual - rmean) / rstd


def score_series(baseline, df, run_time):
    """Decide whether the LATEST sample is an anomaly using the same gate stack
    as the daily extractor:
        Gate 2  per-(dow,hour) MAD modified z-score  >= z_threshold
        Gate 3  rolling holdback z-score             >= ROLLING_Z_THRESHOLD
        Gate 4  persistence: latest + >= K of last N samples pass Gates 2 & 3
    (Gate 1 edge-trim is a daily MSTL artifact and does not apply here.)
    A model-free threshold_breach (>= 90%) is emitted independently.
    Returns an event dict or None.
    """
    if df is None or df.empty:
        return None

    util = df["Utilization"].astype(float)
    idx = util.index
    z_threshold = float(baseline.get("z_threshold", MAD_Z_DEFAULT))

    expected_vals, med_vals, mad_vals, bkeys = [], [], [], []
    for ts in idx:
        e, rm, ma, key = _expected_and_band(baseline, ts)
        expected_vals.append(e)
        med_vals.append(rm)
        mad_vals.append(ma)
        bkeys.append(key)

    expected = pd.Series(expected_vals, index=idx)
    resid_median = pd.Series(med_vals, index=idx)
    mad = pd.Series(mad_vals, index=idx).where(lambda s: s > 0, np.nan)
    residual = util - expected

    # Gate 2: per-bucket robust modified z-score.
    z_bucket = 0.6745 * (residual - resid_median) / mad
    gate2 = z_bucket.abs() >= z_threshold

    # Gate 3: rolling holdback z on the residual proxy.
    rz = _rolling_z(residual)
    gate3 = rz.abs() >= ROLLING_Z_THRESHOLD

    passed = (gate2 & gate3).fillna(False)

    last = idx[-1]
    latest_pass = bool(passed.loc[last])

    # Gate 4: causal persistence over the trailing N samples (realtime cannot see
    # future points, so the daily centered window becomes a trailing window).
    tail = passed.iloc[-PERSISTENCE_N:]
    persist_count = int(tail.sum())
    persist_ok = latest_pass and persist_count >= PERSISTENCE_K

    actual = float(util.loc[last])
    is_breach = actual >= HIGH_UTIL_THRESHOLD

    if not (persist_ok or is_breach):
        return None

    z_last = float(z_bucket.loc[last]) if pd.notna(z_bucket.loc[last]) else 0.0
    rz_last = float(rz.loc[last]) if pd.notna(rz.loc[last]) else 0.0

    triggers = []
    severity, confidence = "low", 0.0
    if persist_ok:
        triggers.append("seasonal_residual")
        severity, confidence = _severity_and_confidence(z_last)
    if is_breach:
        triggers.append("threshold_breach")
        severity = "high"
        confidence = max(confidence, 0.9)

    category = "seasonal_residual" if persist_ok else "threshold_breach"
    exp_last = float(expected.loc[last])
    return {
        "category": category,
        "triggers": triggers,
        "time": str(last),
        "utilization": round(actual, 2),
        "expected_utilization": round(exp_last, 2),
        "residual": round(actual - exp_last, 2),
        "bucket": bkeys[-1],
        "day": last.day_name(),
        "severity": severity,
        "confidence score": confidence,
        "gates": {
            "bucket_z": round(z_last, 3),
            "bucket_z_threshold": z_threshold,
            "rolling_z": round(rz_last, 3),
            "rolling_z_threshold": ROLLING_Z_THRESHOLD,
            "persistence": f"{persist_count}/{PERSISTENCE_N}",
            "persistence_required": PERSISTENCE_K,
        },
        "detected_at": str(run_time),
    }


# --- Main ---
def run(dry_run=False):
    run_time = datetime.now(timezone.utc)
    print(f"Real-Time Seasonality Anomaly Extractor -- {run_time.strftime('%Y-%m-%d %H:%M:%S')} UTC")

    baselines = load_baselines()
    if not baselines:
        print("No mstl_dow_hour baselines found. Run utilization_seasonality_daily_extractor.py first.")
        return
    server_names = sorted({rid for (rid, _cn) in baselines})
    print(f"Baselines loaded: {len(baselines)} across {len(server_names)} servers")

    # Recent history window per (server, metric_label) -- enough for the rolling
    # holdback + persistence gates, not just the newest sample.
    windows = {}
    for metric_label, obj_name, counter_name in CPU_MEM_METRICS:
        for server, wdf in fetch_window_cpu_mem(obj_name, counter_name, server_names).items():
            windows[(server, metric_label)] = wdf
    for key, wdf in fetch_window_disk(server_names).items():
        windows[key] = wdf

    # Score each series' latest sample with the full gate stack.
    rows = []
    events = []
    for key, wdf in windows.items():
        baseline = baselines.get(key)
        if not baseline:
            continue
        event = score_series(baseline, wdf, run_time)
        if not event:
            continue
        server_name, metric_label = key
        rows.append({
            "TimeGenerated": pd.to_datetime(event["time"]),
            "ResourceId": server_name,
            "ObjectName": REALTIME_OBJECT_NAME,
            "CounterName": metric_label,
            "Data": json.dumps(event, default=str),
        })
        events.append((server_name, metric_label, event))

    if not rows:
        print("\nNo anomalies detected.")
        return

    print(f"\nDetected {len(rows)} events:")
    for server_name, metric_label, e in events:
        g = e["gates"]
        print(f"  {server_name}/{metric_label}: {e['category']} "
              f"actual={e['utilization']}% expected={e['expected_utilization']}% "
              f"bucket={e['bucket']} | Gate2 z={g['bucket_z']} (>= {g['bucket_z_threshold']}) "
              f"Gate3 rz={g['rolling_z']} (>= {g['rolling_z_threshold']}) "
              f"Gate4 persist={g['persistence']} (>= {g['persistence_required']}) "
              f"| triggers={e['triggers']} severity={e['severity']} conf={e['confidence score']}")

    if dry_run:
        print("\n[dry-run] Skipping ingest. No rows written to ADX.")
        return
    ingest_anomalies(pd.DataFrame(rows))
    print(f"\nDone: {len(rows)} events ingested.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Realtime seasonality anomaly extractor (mstl_dow_hour baseline).")
    ap.add_argument("--dry-run", action="store_true", help="Score and print events but do not ingest to ADX.")
    args = ap.parse_args()
    run(dry_run=args.dry_run)
