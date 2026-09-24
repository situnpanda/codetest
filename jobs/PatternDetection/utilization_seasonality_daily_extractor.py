"""
Simple MSTL Anomaly Extractor — runs once per day.

For each (server × metric), decomposes the last 30 days of utilization with
MSTL (daily + weekly seasonality) and flags samples whose residual is unusual
*relative to that server's own learned behaviour*, then applies several
noise-reduction gates so the output matches a human reviewer's intuition.
Emits ONE row per (server, metric) into the ADX Analytics table.

Baselining is adaptive per server (not a static threshold):
  1. MSTL removes each server's daily + weekly seasonality and trend.
  2. The residual band is learned per (day-of-week, hour) bucket using a
     robust MAD-based modified z-score, so 3 AM (quiet) and 2 PM (busy) each
     get their own tolerance instead of one global cutoff.
  3. A rolling-window z-score cross-validates each candidate against the
     recent local past, so a single freak event can't widen the band and
     hide everything around it.
  4. Persistence (k-of-n neighbours) kills isolated single-sample blips.

The Data column is a JSON array of anomaly objects:
    [
        {"timestamp": "2026-06-23 07:10:00",
         "expected":  62.14,
         "actual":    93.80},
        ...
    ]

Timestamps are emitted exactly as they arrive from ADX (UTC) — no timezone
conversion is performed.

Metrics covered:
    - CPU     (Processor / % Processor Time)
    - Memory  (Memory    / % Committed Bytes In Use)
    - Disk    (LogicalDisk / % Free Space — inverted to % Used, per drive)
"""

import pandas as pd
import numpy as np
import json
import sys
import os
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from datetime import datetime, timedelta, timezone
from statsmodels.tsa.seasonal import MSTL
from sklearn.linear_model import LinearRegression

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

ANALYSIS_DAYS = 30
MSTL_PERIODS = [144, 1008]  # daily (144 * 10-min) + weekly (1008 * 10-min) cycles
MIN_DATA_POINTS = 1008      # require at least 1 full week of samples

# --- Adaptive baseline / noise-reduction knobs ---
# The anomaly gate is learned from each server's own residual distribution
# (see find_anomalies). These constants only tune how strict the gates are;
# none of them is an absolute utilization threshold.
MAD_Z_THRESHOLD = 3.5       # per-(dow,hour) modified z-score cutoff (robust)
MAD_FLOOR_RELATIVE = 0.3    # per-bucket MAD floored at 0.3 * global MAD ...
MAD_FLOOR_ABS = 1.0         #   ... and never below this, so quiet buckets
                            #   don't turn tiny ripples into false anomalies
ROLLING_WINDOW = 7 * 144    # 7-day rolling holdback window (samples)
ROLLING_MIN_PERIODS = 500   # ~3.5 days before the rolling z is trusted
ROLLING_Z_THRESHOLD = 2.5   # candidate must also be unusual vs recent past
EDGE_TRIM_HEAD_HOURS = 48   # MSTL warm-up: first 48 h unreliable
EDGE_TRIM_TAIL_HOURS = 6    # MSTL right-edge artifact: last 6 h unreliable
PERSISTENCE_K = 2           # keep a point only if >= K of N neighbours also fire
PERSISTENCE_N = 3

HIGH_UTIL_THRESHOLD = 90.0  # utilization breach cutoff (absolute %)
PERSISTENCE_N = 3


# --- ADX ingest ---
def get_ingest_client():
    credential = ManagedIdentityCredential(client_id='015ad614-f9a5-4333-83b4-b71c01c393d8')
    ingest_uri = ADX_CLUSTER.replace("https://", "https://ingest-")
    kcsb = KustoConnectionStringBuilder.with_azure_token_credential(ingest_uri, credential)
    return QueuedIngestClient(kcsb)


def ingest_to_adx(client, df):
    if df.empty:
        return
    props = IngestionProperties(database=ADX_DATABASE, table=ANALYTICS_TABLE)
    client.ingest_from_dataframe(df, ingestion_properties=props)
    print(f"  Queued {len(df)} rows -> {ANALYTICS_TABLE}")


# --- Server list ---
def get_server_list():
    srv = 'sqldb-azure-prod-012.database.windows.net'
    db = 'crcamonitoring'
    usr = 'servCRCAMonitoring@providence.org'
    pwd = connectToKeyVault("servCRCAMonitoring-AAD-iTelemetry")
    drv = '{ODBC Driver 17 for SQL Server}'
    conn = (
        f"Driver={drv};UID={usr};PWD={pwd};"
        f"Authentication=ActiveDirectoryPassword;Server={srv};Database={db}"
    )
    sqlquery = (
        "SELECT DISTINCT [Server Name] "
        "FROM [Server List] "
        "WHERE Environment LIKE 'prod%' "
        "AND ("
        "[Application CI] LIKE '%Mosaiq%' OR "
        "[Application CI] LIKE '%WellSky Transfusion%' OR "
        "[Application CI] LIKE '%Change Healthcare Cardiology%' OR "
        "[Application CI] LIKE '%Acuo VNA%' OR "
        "[Application CI] LIKE '%Synapse PACS%' OR "
        "[Application CI] LIKE '%OBIX%' OR"
        "[Application CI] LIKE '%Deviceconx%'"
        ")"
    )
    return queryDw(conn, sqlquery)


# --- Bulk fetch ---
def bulk_fetch_cpu_mem(server_names, obj_name, counter_name, start_str, end_str):
    if not server_names:
        return {}
    tokens = ", ".join(f"'{n}'" for n in server_names)
    query = f"""
    {ADX_SOURCE_TABLE}
    | where TimeGenerated >= datetime('{start_str}') and TimeGenerated <= datetime('{end_str}')
    | where ObjectName == '{obj_name}' and CounterName == '{counter_name}'
    | where ResourceId has_any ({tokens})
    | extend ServerName = tostring(split(extract(@'(?:^|/)ServerName/([^/]+)', 1, ResourceId), '_')[0])
    | project TimeGenerated, ServerName, AvgValue
    | order by ServerName asc, TimeGenerated asc
    """
    df = readFromADX(query)
    if df.empty:
        return {}
    df["TimeGenerated"] = pd.to_datetime(df["TimeGenerated"])
    df.rename(columns={"AvgValue": "Utilization"}, inplace=True)
    result = {}
    for name, g in df.groupby("ServerName", sort=False):
        g = g.drop(columns=["ServerName"]).drop_duplicates(subset=["TimeGenerated"])
        g.set_index("TimeGenerated", inplace=True)
        result[name] = g
    return result


def bulk_fetch_disk(server_names, start_str, end_str):
    if not server_names:
        return {}
    tokens = ", ".join(f"'ServerName/{n}'" for n in server_names)
    query = f"""
    {ADX_SOURCE_TABLE}
    | where TimeGenerated >= datetime('{start_str}') and TimeGenerated <= datetime('{end_str}')
    | where ObjectName == 'LogicalDisk' and CounterName == '% Free Space'
    | where trim(' ', DriveName) in ('C:', 'D:')
    | where ResourceId has_any ({tokens})
    | extend ServerName = tostring(split(extract(@'(?:^|/)ServerName/([^/]+)', 1, ResourceId), '_')[0])
    | project TimeGenerated, ServerName, DriveName, AvgValue = 100 - AvgValue
    | order by ServerName asc, DriveName asc, TimeGenerated asc
    """
    df = readFromADX(query)
    if df.empty:
        return {}
    df["TimeGenerated"] = pd.to_datetime(df["TimeGenerated"])
    df["DriveName"] = df["DriveName"].str.strip()
    df.rename(columns={"AvgValue": "Utilization"}, inplace=True)
    result = {}
    for (name, drive), g in df.groupby(["ServerName", "DriveName"], sort=False):
        g = g.drop(columns=["ServerName", "DriveName"]).drop_duplicates(subset=["TimeGenerated"])
        g.set_index("TimeGenerated", inplace=True)
        result.setdefault(name, {})[drive] = g
    return result


# --- Adaptive baseline helpers ---
def _mad(values):
    """Median Absolute Deviation — robust scale estimate. Under normality,
    sigma ~= MAD / 0.6745."""
    arr = np.asarray(values, dtype=float)
    if arr.size == 0:
        return 0.0
    return float(np.median(np.abs(arr - np.median(arr))))


def _compute_bucket_stats(resid):
    """Per-(day-of-week, hour) median + floored MAD of the residual.

    This is what makes the baseline learn each server's OWN rhythm: a busy
    2 PM bucket is allowed a wider residual than a quiet 3 AM bucket. The MAD
    floor stops near-constant buckets from turning micro-ripples into
    anomalies.
    """
    r = resid.dropna()
    if r.empty:
        return {}
    keys = list(zip(r.index.dayofweek.tolist(), r.index.hour.tolist()))
    tmp = pd.DataFrame({"r": r.values, "b": keys})
    medians = tmp.groupby("b")["r"].median()
    mads = tmp.groupby("b")["r"].apply(lambda x: _mad(x.values))
    floor = max(_mad(r.values) * MAD_FLOOR_RELATIVE, MAD_FLOOR_ABS)
    mads = mads.clip(lower=floor)
    return {b: (float(medians[b]), float(mads[b])) for b in medians.index}


def _rolling_zscore(resid):
    """Rolling-window z-score used as a holdback cross-validator, so a globally
    rare event still has to look unusual against the *recent* past too."""
    rmean = resid.rolling(window=ROLLING_WINDOW, min_periods=ROLLING_MIN_PERIODS).mean()
    rstd = resid.rolling(window=ROLLING_WINDOW, min_periods=ROLLING_MIN_PERIODS).std().replace(0.0, np.nan)
    return (resid - rmean) / rstd


def _persistence_filter(flagged_index, all_index, k=PERSISTENCE_K, n=PERSISTENCE_N):
    """Keep a candidate only if >= k of the n samples centered on it were also
    flagged. Removes isolated single-sample blips (the dominant false positive)."""
    if len(flagged_index) == 0:
        return flagged_index
    flagged = set(flagged_index)
    pos = {ts: i for i, ts in enumerate(all_index)}
    half = n // 2
    keep = []
    for ts in flagged_index:
        i = pos.get(ts)
        if i is None:
            continue
        lo, hi = max(0, i - half), min(len(all_index), i + half + 1)
        if sum(1 for t in all_index[lo:hi] if t in flagged) >= k:
            keep.append(ts)
    return pd.DatetimeIndex(keep)


# --- MSTL anomaly detection ---
def _confidence_and_severity(z_mod):
    """Map a per-bucket modified z-score to a confidence score [0,1] and a
    severity band. Confidence saturates at z=8; severity cutoffs align with
    the MAD gate (3.5) and a ~1-in-millions tail (5.0)."""
    confidence = round(min(max(abs(z_mod) / 8.0, 0.0), 1.0), 3)
    az = abs(z_mod)
    if az >= 5.0:
        severity = "high"
    elif az >= 4.0:
        severity = "medium"
    else:
        severity = "low"
    return confidence, severity


def analyze(df, include_trend=False):
    """Decompose df['Utilization'] with MSTL and return the findings payload.

    Returns a dict:
        {
            "anomalies": [
                {"timestamp","expected","actual","confidence score","severity"}, ...
            ],
            "utilization breaches": [{"timestamp","utilization"}, ...],
            "trend": {"state","slope","days to 90%"}   # only when include_trend
        }
    Timestamps are emitted as-is (no timezone conversion).
    """
    empty = {"anomalies": [], "utilization breaches": [], "trend": None}

    # Data already arrives as 10-min values from ADX; use it as-is with NO
    # resampling/binning. Just sort and drop any missing utilization.
    df_r = df.sort_index()
    df_r = df_r[~df_r.index.duplicated(keep='first')]
    df_r = df_r.dropna(subset=['Utilization'])

    if len(df_r) < MIN_DATA_POINTS:
        return empty

    # MSTL learns each server's daily + weekly shape. Combine the per-period
    # seasonal columns so expected = trend + seasonal.
    res = MSTL(df_r['Utilization'], periods=MSTL_PERIODS).fit()
    if isinstance(res.seasonal, pd.DataFrame):
        seasonal = res.seasonal.sum(axis=1)
    else:
        seasonal = res.seasonal
    resid = res.resid
    expected = res.trend + seasonal   # actual - residual

    # Per-(dow, hour) robust band — the core of "baseline from behaviour".
    bucket_stats = _compute_bucket_stats(resid)

    anomalies = []
    if bucket_stats:
        # Cross-validators / edge trim to suppress noise.
        rolling_z = _rolling_zscore(resid)
        idx = df_r.index
        head_cut = idx[0] + pd.Timedelta(hours=EDGE_TRIM_HEAD_HOURS)
        tail_cut = idx[-1] - pd.Timedelta(hours=EDGE_TRIM_TAIL_HOURS)

        candidates = []           # timestamps that passed every gate
        z_by_ts = {}              # ts -> modified z-score (for confidence/severity)
        for ts in resid.dropna().index:
            # Gate 1: edge trim (MSTL boundaries are unreliable).
            if ts < head_cut or ts > tail_cut:
                continue

            med, mad = bucket_stats.get((int(ts.dayofweek), int(ts.hour)), (None, None))
            if med is None or mad is None or mad <= 0:
                continue

            # Gate 2: robust per-bucket modified z-score.
            r = float(resid.loc[ts])
            z_mod = 0.6745 * (r - med) / mad
            if abs(z_mod) < MAD_Z_THRESHOLD:
                continue

            # Gate 3: rolling holdback must agree it's unusual vs the recent past.
            rz = rolling_z.loc[ts] if ts in rolling_z.index else None
            if rz is None or pd.isna(rz) or abs(float(rz)) < ROLLING_Z_THRESHOLD:
                continue

            candidates.append(ts)
            z_by_ts[ts] = z_mod

        if candidates:
            # Gate 4: persistence — drop isolated single-sample blips.
            kept = _persistence_filter(pd.DatetimeIndex(candidates), idx)
            for ts in kept:
                confidence, severity = _confidence_and_severity(z_by_ts[ts])
                anomalies.append({
                    "timestamp": str(ts),
                    "expected": round(float(expected.loc[ts]), 2),
                    "actual": round(float(df_r.loc[ts, 'Utilization']), 2),
                    "confidence score": confidence,
                    "severity": severity,
                })

    # Utilization breaches — 10-min points whose sustained utilization crosses
    # the cutoff. AvgValue is the actual utilization over each interval.
    breach_series = df_r['Utilization'][df_r['Utilization'] >= HIGH_UTIL_THRESHOLD]
    breaches = [
        {"timestamp": str(ts), "utilization": round(float(v), 2)}
        for ts, v in breach_series.items()
    ]

    # Trend — Disk only.
    trend = _trend_analysis(res.trend) if include_trend else None

    # Utilization distribution — count of samples per 10-point band.
    util_range = _utilization_range(df_r['Utilization'])

    return {
        "anomalies": anomalies,
        "utilization breaches": breaches,
        "trend": trend,
        "UtilizationRange": util_range,
    }


def _utilization_range(series):
    """Bucket utilization samples into 10-point bands (0_10 ... 90_100).

    Values are clamped to [0, 100]; 100 falls in the 90_100 band. Only
    non-empty bands are returned.
    """
    counts = {}
    for v in series.dropna().values:
        val = min(max(float(v), 0.0), 100.0)
        low = int(val // 10) * 10
        if low >= 100:
            low = 90
        key = f"{low}_{low + 10}"
        counts[key] = counts.get(key, 0) + 1
    return counts


def _trend_analysis(trend):
    """Linear-regression trend direction on the MSTL trend component.

    Returns {"state","slope","days to 90%"}. slope is per-day (%/day);
    'days to 90%' is populated only for an increasing trend below 90%.
    """
    trend_clean = trend.dropna()
    if trend_clean.empty:
        return None
    X = np.arange(len(trend_clean)).reshape(-1, 1)
    reg = LinearRegression().fit(X, trend_clean.values)
    slope_per_day = float(reg.coef_[0]) * 144   # 144 samples per day
    current_level = float(trend_clean.iloc[-1])

    if slope_per_day > 0.5:
        state = "increasing"
    elif slope_per_day < -0.5:
        state = "decreasing"
    else:
        state = "stable"

    days_to_90 = None
    if state == "increasing" and slope_per_day > 0 and current_level < 90:
        days_to_90 = round((90 - current_level) / slope_per_day, 1)

    return {
        "state": state,
        "slope": round(slope_per_day, 3),
        "days to 90%": days_to_90,
    }


# --- Parallel worker ---
def _analyze_task(task):
    """Top-level worker so it can be pickled by ProcessPoolExecutor.

    task = (server_name, metric_label, include_trend, df). Returns a dict with
    either 'findings' or 'error'. The MSTL decomposition is CPU-bound, so
    running these across cores is where the real speed-up comes from.
    """
    name, metric_label, include_trend, df = task
    try:
        findings = analyze(df, include_trend=include_trend)
        return {"name": name, "metric": metric_label, "findings": findings}
    except Exception as ex:  # noqa: BLE001 - report per-task, never abort the batch
        return {"name": name, "metric": metric_label, "error": str(ex)}


# --- Main ---
def run():
    servers = get_server_list()
    run_date = datetime.now(timezone.utc)
    end_str = run_date.strftime('%Y-%m-%d %H:%M:%S')
    start_str = (run_date - timedelta(days=ANALYSIS_DAYS)).strftime('%Y-%m-%d %H:%M:%S')
    server_names = [s[0] for s in servers]

    print(f"Simple MSTL Anomaly Extractor -- {run_date.strftime('%Y-%m-%d %H:%M')} UTC")
    print(f"Window: {start_str} -> {end_str}")
    print(f"Servers: {len(server_names)}")

    # Build the full list of (server x metric) analysis tasks first, then run
    # the CPU-bound MSTL fits in parallel across cores.
    tasks = []

    # CPU + Memory
    for obj_name, counter_name, metric_label in [
        ("Processor", "% Processor Time", "CPU"),
        ("Memory", "% Committed Bytes In Use", "Memory"),
    ]:
        print(f"\nFetching {metric_label}...")
        data = bulk_fetch_cpu_mem(server_names, obj_name, counter_name, start_str, end_str)
        for name in server_names:
            df = data.get(name)
            if df is None or df.empty:
                continue
            tasks.append((name, metric_label, False, df))

    # Disk per drive (C:, D:)
    print("\nFetching Disk (C:, D:)...")
    disk_data = bulk_fetch_disk(server_names, start_str, end_str)
    for name in server_names:
        drives = disk_data.get(name)
        if not drives:
            continue
        for drive, ddf in drives.items():
            if ddf.empty:
                continue
            tasks.append((name, f"Disk {drive}", True, ddf))

    # Run the MSTL decompositions in parallel (CPU-bound work).
    # Leave at least 2 cores free so the VM stays responsive; also cap absolute
    # workers so we never oversubscribe the box.
    cpu_total = os.cpu_count() or 6
    max_workers = max(1, cpu_total // 2) 
    print(f"\nAnalyzing {len(tasks)} (server x metric) series across {max_workers} workers "
          f"(of {cpu_total} cores; leaving headroom for the VM)...")

    rows = []
    with ProcessPoolExecutor(max_workers=max_workers) as pool:
        for result in pool.map(_analyze_task, tasks, chunksize=8):
            name = result["name"]
            metric_label = result["metric"]
            if "error" in result:
                print(f"  {name}/{metric_label}: ERROR -- {result['error']}")
                continue
            findings = result["findings"]
            rows.append({
                "TimeGenerated": run_date,
                "ResourceId": name,
                "ObjectName": "UtilPatternSummary",
                "CounterName": metric_label,
                "Data": json.dumps(findings),
            })

    if rows:
        print(f"\nIngesting {len(rows)} rows into {ANALYTICS_TABLE}...")
        client = get_ingest_client()
        ingest_to_adx(client, pd.DataFrame(rows))

    print(f"\nDone: {len(rows)} rows ingested.")


if __name__ == "__main__":
    run()
