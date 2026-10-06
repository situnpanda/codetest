"""
Daily Pattern Extractor (Network) — runs once per day.
Analyzes the last 1 month of NIC packet-rate metrics from Network_Metrics_Perf.
For each NIC × metric (packets_sent_rate, packets_received_rate), runs MSTL
decomposition + MAD-based anomaly detection and stores a baseline for the
realtime extractor in the Analytics table.

Output: Analytics table, ObjectName = "NetworkPatternSummary"
        1 row per NIC/metric with anomalies + baseline JSON in Data column.

Schedule: Daily at ~1 AM UTC via Task Scheduler or Azure Function timer.
"""

import pandas as pd
import numpy as np
import json
import sys
from pathlib import Path
from datetime import datetime, timedelta, timezone
from statsmodels.tsa.seasonal import MSTL
from sklearn.linear_model import LinearRegression

# Add the backend root (two levels up from Batch Jobs/PatternDetection) to sys.path
root = Path(__file__).resolve().parents[2]
sys.path.append(str(root))

from shared.adx import readFromADX
from shared.dataBase import queryDw
from shared.keyVault import connectToKeyVault
from azure.identity import AzureCliCredential,ManagedIdentityCredential
from azure.kusto.data import KustoConnectionStringBuilder
from azure.kusto.ingest import QueuedIngestClient, IngestionProperties

# --- Configuration ---
ADX_CLUSTER = "https://telemetrycrcav2.westus2.kusto.windows.net"
ADX_DATABASE = "crca_monitoring_telemetry"
ADX_SOURCE_TABLE = "Network_Metrics_Perf"
ANALYTICS_TABLE = "Analytics"
MSTL_PERIODS = [144, 1008]   # Daily (24h × 6) + weekly (7d × 144) cycles
MIN_DATA_POINTS = 1008       # At least 1 full weekly cycle
ANALYSIS_DAYS = 30           # 1 month lookback

# --- Anomaly sensitivity tuning (MAD-based, calibrated for packet-rate workloads) ---
MAD_MULTIPLIER = 8.0             # Residual must exceed median ± MAD_MULTIPLIER * MAD
MAD_FLOOR_RELATIVE = 0.3         # MAD is also floored at 30% of signal std
ROC_MULTIPLIER = 100.0            # Rate-of-change spike: delta must exceed ROC_MULTIPLIER * MAD(deltas)
ROC_MIN_PCT = 100.0               # Delta must also be ≥100% of previous value to be a spike

# --- Anomaly-detection refinements (ported from daily_pattern_extractor_utilization.py) ---
# Layered on top of the global MAD gate above to suppress the dominant
# false-positive sources in packet-rate data. See the helper docstrings below.
EDGE_TRIM_HEAD_HOURS = 48        # MSTL warm-up: first 48 h are unreliable
EDGE_TRIM_TAIL_HOURS = 6         # MSTL right-edge artifact: last 6 h are unreliable
MAD_Z_THRESHOLD = 3.5            # Modified z-score on the per-(dow,hour) residual MAD
ROLLING_VALIDATION_DAYS = 7      # Holdback baseline window (days)
ROLLING_MIN_PERIODS = 500        # ~3.5 days minimum before the rolling z is trusted
ROLLING_Z_THRESHOLD = 2.5        # Rolling z must also agree (cross-validation)
PERSISTENCE_K = 2                # Singleton-killer: >= k of n neighbours must also breach
PERSISTENCE_N = 3
MIN_SIGNAL_FRACTION = 0.05       # Low-base floor: skip residual anomalies whose actual value
                                 #   is below 5% of the NIC's median rate (unbounded analog of
                                 #   the utilization MIN_UTIL floor; real drops to zero are
                                 #   still caught by rateOfChangeDetection).
ROC_NOVELTY_SIGMA = 2.5          # ROC seasonal-novelty gate: |resid - bucket_med| > k*sigma_bucket
IMPUTED_HALO_SAMPLES = 3         # Suppress anomaly / ROC decisions on interpolated points and
                                 #   this many samples on either side of a gap. Prevents synthetic
                                 #   ramps or recoveries created by decompose_mstl's interpolation
                                 #   from being mistaken for real signal.
ROC_SLOT_Z_THRESHOLD = 4.0       # Per-slot delta modified-z threshold. Layered on top of the
                                 #   global ROC gate so recurring bursts that are large in
                                 #   absolute terms but normal for that time-of-week slot are not
                                 #   flagged.
MIN_TRAFFIC_FOR_TREND = 1.0      # Median packet rate (pkts/s) below which trend direction is
                                 #   downgraded to 'stable' — tiny absolute slopes on nearly-idle
                                 #   NICs otherwise flip between increasing/decreasing on noise.

# Metrics to analyze (ObjectName in source → label used in Analytics)
NETWORK_METRICS = [
    ("packets_sent_rate", "PacketsSent"),
    ("packets_received_rate", "PacketsReceived"),
]


# --- ADX Ingestion ---
def get_ingest_client():
    credential = AzureCliCredential()
    # credential = ManagedIdentityCredential(client_id='015ad614-f9a5-4333-83b4-b71c01c393d8')
    ingest_uri = ADX_CLUSTER.replace("https://", "https://ingest-")
    kcsb = KustoConnectionStringBuilder.with_azure_token_credential(ingest_uri, credential)
    return QueuedIngestClient(kcsb)


def ingest_to_adx(client, df):
    if df.empty:
        return
    props = IngestionProperties(database=ADX_DATABASE, table=ANALYTICS_TABLE)
    client.ingest_from_dataframe(df, ingestion_properties=props)
    print(f"  Queued {len(df)} rows → {ANALYTICS_TABLE}")


# --- Server List ---
def get_server_list():
    srv = 'sqldb-azure-prod-012.database.windows.net'
    db = 'crcamonitoring'
    usr = 'servCRCAMonitoring@providence.org'
    pwd = connectToKeyVault("servCRCAMonitoring-AAD-iTelemetry")
    drv = '{ODBC Driver 17 for SQL Server}'
    conn = f"Driver={drv};UID={usr};PWD={pwd};Authentication=ActiveDirectoryPassword;Server={srv};Database={db}"
    sqlquery = (
        "SELECT DISTINCT ServerName "
        "FROM CrcaServerListData "
        "WHERE Environment LIKE 'prod%' "
        "AND AppFamily IN ("
        "'Mosaiq'"
        # "'Change Healthcare Cardiology',"
        # "'Acuo VNA',"
        # "'Fuji Synapse PACS',"
        # "'OBIX',"
        # "'WellSky Transfusion',"
        # "'Deviceconx'"
        ")"
    )
    return queryDw(conn, sqlquery)


# --- NIC Discovery ---
def get_nic_list(start_str, end_str, server_names):
    """Discover distinct NIC names from ADX in the analysis window.

    Returns a plain list of NIC name strings. NIC names in the source table
    already embed the server name as a substring and are guaranteed unique
    across the fleet, so keying every downstream step by NIC name alone is
    safe and lets us skip the extra `ServerName/<host>` filter in the per-NIC
    fetch.
    """
    server_filters = ", ".join(f"'{n}'" for n in server_names)
    query = f"""
    {ADX_SOURCE_TABLE}
    | where TimeGenerated >= datetime('{start_str}') and TimeGenerated <= datetime('{end_str}')
    | where ObjectName in ('packets_sent_rate', 'packets_received_rate')
    | where ResourceId has_any ({server_filters})
    | extend NicName = extract('ServerNic/(.+)', 1, ResourceId)
    | where isnotempty(NicName)
    | distinct NicName
    | order by NicName asc
    """
    print("query", query)
    df = readFromADX(query)
    if df.empty:
        return []
    return df["NicName"].dropna().astype(str).tolist()


# --- Analysis Functions ---

def decompose_mstl(df):
    """Run MSTL decomposition with daily and weekly seasonality.

    Returns (resampled_df, result, imputed_mask):
      resampled_df   — 10-minute resampled series (interpolation applied so MSTL
                       has a regular index).
      result         — object exposing .seasonal (combined), .trend, .resid.
      imputed_mask   — boolean Series aligned with resampled_df.index. True for
                       10-minute bins that were originally missing and were
                       filled by linear interpolation. Downstream detectors use
                       this mask (plus a halo) so anomaly and ROC decisions are
                       never made on synthetic samples.
    """
    if len(df) < MIN_DATA_POINTS:
        raise ValueError(f"Insufficient data: {len(df)} points (need {MIN_DATA_POINTS}+)")

    df_r = df.resample('10min').mean()
    # Capture which bins are truly missing (NaN after resample) BEFORE the
    # interpolation step so downstream code can distinguish real samples from
    # linearly-invented ones.
    imputed_mask = df_r['Value'].isna()
    df_r['Value'] = df_r['Value'].interpolate(method='linear', limit=6)
    df_r.dropna(subset=['Value'], inplace=True)
    # Realign the imputed mask to df_r after the dropna above (long gaps beyond
    # the interpolation limit will have been dropped entirely).
    imputed_mask = imputed_mask.reindex(df_r.index, fill_value=False)

    if len(df_r) < MIN_DATA_POINTS:
        raise ValueError(f"After interpolation, only {len(df_r)} points (need {MIN_DATA_POINTS}+)")

    mstl = MSTL(df_r['Value'], periods=MSTL_PERIODS)
    res = mstl.fit()

    # MSTL returns .seasonal as DataFrame (multi-period) or Series (single period).
    if isinstance(res.seasonal, pd.DataFrame):
        combined_seasonal = res.seasonal.sum(axis=1)
    else:
        combined_seasonal = res.seasonal

    class CombinedResult:
        def __init__(self, seasonal, trend, resid):
            self.seasonal = seasonal
            self.trend = trend
            self.resid = resid

    return df_r, CombinedResult(combined_seasonal, res.trend, res.resid), imputed_mask


# ── Anomaly-detection helpers (ported from daily_pattern_extractor_utilization.py) ──
# These replace the single global-MAD residual band with a robust,
# seasonality-aware pipeline. The global _compute_thresholds / compute_baseline
# path below is intentionally left unchanged so the realtime extractor's
# BaselineJSON contract still holds.

def _bucket_key(ts):
    """(dayofweek 0..6, hour 0..23, ten_min_slot 0..5) — per-10-minute weekly
    slot key for residual and delta stats. There are 1008 unique slots in a
    week (7 × 24 × 6). Using this fine-grained key matches the 10-minute
    cadence of the resampled series so the anomaly model evaluates each
    sample against its actual time-of-week regime rather than an hour-wide
    average that blurs six consecutive bins together."""
    return (int(ts.dayofweek), int(ts.hour), int(ts.minute) // 10)


def _mad(values):
    """Median Absolute Deviation. Robust scale estimator; under normality
    sigma ≈ MAD / 0.6745."""
    arr = np.asarray(values, dtype=float)
    if arr.size == 0:
        return 0.0
    return float(np.median(np.abs(arr - np.median(arr))))


def _compute_bucket_stats(resid, signal_std=None):
    """Per-(dayofweek, hour) median + MAD of the MSTL residual.

    Returns {(dow, hour): (median, mad_floored)}. Each time-of-week slot gets
    its own residual scale so a nightly-batch NIC and a business-hours NIC are
    judged against their own normal. MAD is floored at
    max(0.3 × global_MAD, 0.02 × signal_std) so quiet slots don't divide by ~0
    and turn every sample into an apparent outlier. The absolute floor scales
    with the signal because packet rates are unbounded (unlike the utilization
    extractor's hard 1.0).
    """
    r = resid.dropna()
    if r.empty:
        return {}
    keys = list(zip(
        r.index.dayofweek.tolist(),
        r.index.hour.tolist(),
        (r.index.minute // 10).tolist(),
    ))
    df = pd.DataFrame({"r": r.values, "b": keys})
    medians = df.groupby("b")["r"].median()
    mads = df.groupby("b")["r"].apply(lambda x: _mad(x.values))
    global_mad = _mad(r.values)
    floor = global_mad * 0.3
    if signal_std:
        floor = max(floor, signal_std * 0.02)
    floor = max(floor, 1e-9)
    mads = mads.clip(lower=floor)
    return {b: (float(medians[b]), float(mads[b])) for b in medians.index}


def _rolling_zscore(resid, window=None, min_periods=None):
    """Vectorised rolling z-score on the residual — a holdback baseline so a
    globally-rare event must also look unusual against the recent local past.
    Defends against single-event contamination of the 30-day statistics."""
    win = window if window is not None else ROLLING_VALIDATION_DAYS * 144
    mp = min_periods if min_periods is not None else ROLLING_MIN_PERIODS
    rmean = resid.rolling(window=win, min_periods=mp).mean()
    rstd = resid.rolling(window=win, min_periods=mp).std().replace(0.0, np.nan)
    return (resid - rmean) / rstd


def _persistence_mask(flagged_index, all_index, k=PERSISTENCE_K, n=PERSISTENCE_N):
    """Keep a candidate only if ≥ k of the n samples centered on it were also
    flagged. Kills singleton blips that immediately revert to baseline — the
    dominant false-positive class in bursty packet-rate data."""
    if len(flagged_index) == 0:
        return flagged_index
    flagged_set = set(flagged_index)
    pos = {ts: i for i, ts in enumerate(all_index)}
    half = n // 2
    keep = []
    for ts in flagged_index:
        i = pos.get(ts)
        if i is None:
            continue
        lo, hi = max(0, i - half), min(len(all_index), i + half + 1)
        if sum(1 for t in all_index[lo:hi] if t in flagged_set) >= k:
            keep.append(ts)
    return pd.DatetimeIndex(keep)


def _edge_cutoffs(df_index):
    """(head, tail) timestamps bounding the trustworthy interior of the window.
    Samples in the first EDGE_TRIM_HEAD_HOURS or last EDGE_TRIM_TAIL_HOURS are
    dropped because MSTL trend/seasonal fits are unreliable at the boundaries."""
    if len(df_index) == 0:
        return None, None
    head = df_index[0] + pd.Timedelta(hours=EDGE_TRIM_HEAD_HOURS)
    tail = df_index[-1] - pd.Timedelta(hours=EDGE_TRIM_TAIL_HOURS)
    return head, tail


def _imputed_neighborhood(imputed_mask, halo=IMPUTED_HALO_SAMPLES):
    """Return a boolean Series where True means the sample OR any of its
    +/- halo 10-minute neighbours was linearly interpolated. Detectors use
    this to suppress candidates near data gaps so a filled ramp is never
    mistaken for a real spike or drop."""
    if imputed_mask is None or len(imputed_mask) == 0:
        return None
    win = 2 * int(halo) + 1
    inflated = imputed_mask.astype(bool).rolling(window=win, center=True, min_periods=1).max()
    return inflated.astype(bool)


def _compute_delta_slot_stats(deltas, signal_std=None):
    """Per-10-minute-slot median + MAD of the delta series.

    Mirrors _compute_bucket_stats but for the first difference. Used by
    rateOfChangeDetection so a NIC whose 10-minute slot habitually swings by
    a large absolute amount (e.g. a nightly replication burst) is judged
    against its own historical delta distribution, not a single global MAD.
    Returns {(dow, hour, ten_min_slot): (median_delta, mad_delta_floored)}.
    """
    d = deltas.dropna()
    if d.empty:
        return {}
    keys = list(zip(
        d.index.dayofweek.tolist(),
        d.index.hour.tolist(),
        (d.index.minute // 10).tolist(),
    ))
    df = pd.DataFrame({"d": d.values, "b": keys})
    medians = df.groupby("b")["d"].median()
    mads = df.groupby("b")["d"].apply(lambda x: _mad(x.values))
    global_mad = _mad(d.values)
    floor = global_mad * 0.3
    if signal_std:
        floor = max(floor, signal_std * 0.02)
    floor = max(floor, 1e-9)
    mads = mads.clip(lower=floor)
    return {b: (float(medians[b]), float(mads[b])) for b in medians.index}


_SEVERITY_ORDER = {"low": 0, "medium": 1, "high": 2}
_SEVERITY_NAMES = ["low", "medium", "high"]


def _sev_bump(s):
    """Bump one severity level up, capped at 'high'."""
    return _SEVERITY_NAMES[min(2, _SEVERITY_ORDER.get(s, 1) + 1)]


def _score_event(z_max, duration_min, trigger_count):
    """Confidence score in [0, 1] for a network anomaly. Blends how far the
    residual sits outside its per-bucket band (z), how long the event lasted,
    and how many detectors agreed. There is no absolute-level term (unlike the
    utilization score) because packet rates are unbounded. The UI can use this
    to hide low-confidence rows without changing detector thresholds."""
    z_comp = min(max(float(z_max or 0.0), 0.0) / 8.0, 1.0)
    dur_comp = min(max(float(duration_min or 0), 0) / 60.0, 1.0)
    trig_comp = min(max(int(trigger_count or 0), 0) / 2.0, 1.0)
    s = 0.55 * z_comp + 0.25 * dur_comp + 0.20 * trig_comp
    return round(float(max(0.0, min(1.0, s))), 3)


def _compute_thresholds(resid, df_resampled):
    """Compute MAD-based anomaly thresholds from MSTL residuals.
    MAD (Median Absolute Deviation) is more robust than IQR for heavy-tailed
    and bimodal distributions typical of network packet-rate data."""
    signal_std = float(df_resampled['Value'].std())

    median_r = float(resid.median())
    raw_mad = float((resid - median_r).abs().median())
    # Scale factor 1.4826 makes MAD consistent with std for normal distributions
    scaled_mad = raw_mad * 1.4826
    # Floor MAD to a fraction of signal std to prevent near-zero thresholds
    # on very stable NICs or bimodal signals where median sits on one mode
    mad = max(scaled_mad, signal_std * MAD_FLOOR_RELATIVE)

    threshold = MAD_MULTIPLIER * mad
    lower_bound = median_r - threshold
    upper_bound = median_r + threshold

    return {
        "median": median_r,
        "mad": mad,
        "threshold": threshold,
        "lower_bound": lower_bound,
        "upper_bound": upper_bound,
        "signal_std": signal_std,
    }


def anomalyDetection(stl_result, df_resampled, bucket_stats=None, imputed_mask=None):
    """Per-(dayofweek, hour, 10-min-slot) MAD anomaly detection on MSTL residuals.

    Ported from the utilization extractor. Replaces the single global-MAD band
    with a robust, seasonality-aware pipeline so routine busy-hour traffic is
    no longer flagged and one-off blips are dropped:

      1. Per-slot modified z-score (MAD-based): each 10-minute weekly slot has
         its own residual scale.
      2. Edge trim: first EDGE_TRIM_HEAD_HOURS / last EDGE_TRIM_TAIL_HOURS are
         excluded — MSTL fits are unreliable at boundaries.
      3. Rolling 7-day z-score holdback: the point must also look unusual
         against the recent local baseline, not just the 30-day global one.
      4. Persistence (k-of-n): singleton blips that instantly revert are killed.
      5. Low-base floor: residual ripples on a near-idle NIC are suppressed
         (real drops to zero are still caught by rateOfChangeDetection).
      6. Gap-awareness: candidates that fall on an interpolated sample or
         within IMPUTED_HALO_SAMPLES 10-minute bins of one are dropped, so
         telemetry outages do not become synthetic anomalies.
    """
    resid = stl_result.resid
    signal_std = float(df_resampled['Value'].std())
    if bucket_stats is None:
        bucket_stats = _compute_bucket_stats(resid, signal_std=signal_std)
    if not bucket_stats:
        return []

    head_cut, tail_cut = _edge_cutoffs(df_resampled.index)
    rolling_z = _rolling_zscore(resid)
    imputed_near = _imputed_neighborhood(imputed_mask)

    # Low-base floor reference: a fraction of the NIC's median rate. Median is
    # ~0 for bursty/idle NICs (so nothing is suppressed and bursts are kept),
    # and meaningful for steadily-loaded NICs (so tiny-value ripples are cut).
    signal_ref = float(df_resampled['Value'].median())
    min_value_floor = signal_ref * MIN_SIGNAL_FRACTION

    # ── 1) Per-point candidate generation ───────────────────────────────────
    candidates = []
    for ts in resid.dropna().index:
        if head_cut is not None and ts < head_cut:
            continue
        if tail_cut is not None and ts > tail_cut:
            continue
        # Skip anything sitting on or near an interpolated bin.
        if imputed_near is not None and ts in imputed_near.index and bool(imputed_near.loc[ts]):
            continue

        med, mad = bucket_stats.get(_bucket_key(ts), (None, None))
        if med is None or mad is None or mad <= 0:
            continue
        r = float(resid.loc[ts])
        z_mod = 0.6745 * (r - med) / mad
        if abs(z_mod) < MAD_Z_THRESHOLD:
            continue

        # Holdback validator (rolling 7-day z).
        rz = rolling_z.loc[ts] if ts in rolling_z.index else None
        if rz is None or pd.isna(rz) or abs(float(rz)) < ROLLING_Z_THRESHOLD:
            continue

        value = float(df_resampled.loc[ts, "Value"])
        if value < min_value_floor:
            continue

        expected = value - r
        candidates.append({
            "ts": ts, "value": value, "residual": r,
            "z": abs(float(z_mod)), "expected": expected,
        })

    if not candidates:
        return []

    # ── 2) Persistence filter ─────────────────────────────────────────
    cand_index = pd.DatetimeIndex([c["ts"] for c in candidates])
    kept_index = _persistence_mask(cand_index, df_resampled.index)
    kept_set = set(kept_index)
    survivors = [c for c in candidates if c["ts"] in kept_set]
    if not survivors:
        return []

    # ── 3) Group adjacent points (≤ 10-min gap) into events ──────────────────
    events = []
    current = [survivors[0]]
    for pt in survivors[1:]:
        if (pt["ts"] - current[-1]["ts"]) <= pd.Timedelta("10min"):
            current.append(pt)
        else:
            events.append(current)
            current = [pt]
    events.append(current)

    # ── 4) Summarize ────────────────────────────────────────────────
    out = []
    for group in events:
        zs = [p["z"] for p in group]
        values = [p["value"] for p in group]
        peak_i = max(range(len(group)), key=lambda i: group[i]["z"])
        z_max = float(max(zs))

        # Severity bands on the modified z-score (match the utilization cutoffs:
        # z = 3.5 is the medium/low boundary, z ≥ 5 is high).
        if z_max >= 5.0:
            severity = "high"
        elif z_max >= 3.5:
            severity = "medium"
        else:
            severity = "low"

        duration_min = int((group[-1]["ts"] - group[0]["ts"]).total_seconds() / 60) + 10
        out.append({
            "category": "residual_anomaly",
            "triggers": ["mad_outlier"],
            "start": str(group[0]["ts"]),
            "end": str(group[-1]["ts"]),
            "duration_minutes": duration_min,
            "value": round(float(max(values)), 2),
            "expected_value": round(float(group[peak_i]["expected"]), 2),
            "severity": severity,
            "_z_max": z_max,
        })

    return out


def rateOfChangeDetection(stl_result, df_resampled, bucket_stats=None,
                          delta_slot_stats=None, imputed_mask=None):
    """Detect sudden spikes/drops via rate-of-change on raw values.

    Base gate (unchanged): the 10-min delta must exceed ROC_MULTIPLIER × MAD of
    the delta series AND be ≥ ROC_MIN_PCT % of the previous value. Layered on
    top of that base, three additional gates cut seasonal noise and artefacts:

      • Edge trim — drop candidates in the unreliable MSTL boundary regions.
      • Per-bucket residual novelty — using the 10-minute weekly slot
        residual median/MAD, skip a spike whose residual sits within
        ROC_NOVELTY_SIGMA σ of what that slot normally does.
      • Per-slot delta novelty — additionally require the delta itself to
        exceed the slot's own historical delta MAD by
        ROC_SLOT_Z_THRESHOLD modified-z. A recurring scheduled burst that
        matches its own delta history is recognised as normal even when it is
        large in absolute terms; a burst that is atypical for that time-of-week
        slot is not.
      • Gap-awareness — spikes sitting on or near an interpolated sample are
        dropped so telemetry outages don't become synthetic spikes/drops.

    Returns (spike_events, roc_stats). roc_stats is computed from the full delta
    series (pre-gating) so compute_baseline's realtime contract is unchanged.
    """
    values = df_resampled['Value']
    deltas = values.diff().dropna()

    if len(deltas) < 100:
        return [], {}

    median_d = float(deltas.median())
    raw_mad_d = float((deltas - median_d).abs().median())
    mad_d = raw_mad_d * 1.4826
    # Floor to prevent near-zero threshold on very flat signals
    signal_std = float(values.std())
    mad_d = max(mad_d, signal_std * 0.05)

    threshold = ROC_MULTIPLIER * mad_d
    prev_values = values.shift(1).loc[deltas.index]
    stat_gate = deltas.abs() > threshold
    pct_gate = deltas.abs() >= (prev_values.abs() * ROC_MIN_PCT / 100.0)
    spikes = deltas[stat_gate & pct_gate]

    roc_stats = {"roc_mad": round(mad_d, 4), "roc_threshold": round(threshold, 4)}
    if spikes.empty:
        return [], roc_stats

    head_cut, tail_cut = _edge_cutoffs(df_resampled.index)
    resid = stl_result.resid
    if bucket_stats is None:
        bucket_stats = _compute_bucket_stats(resid, signal_std=signal_std)
    if delta_slot_stats is None:
        delta_slot_stats = _compute_delta_slot_stats(deltas, signal_std=signal_std)
    imputed_near = _imputed_neighborhood(imputed_mask)

    # Build spike events — each is a point-in-time jump that survived the base
    # gate plus the edge-trim, residual-novelty, per-slot delta-novelty, and
    # gap-halo gates.
    spike_events = []
    for ts in spikes.index:
        # Edge trim
        if head_cut is not None and ts < head_cut:
            continue
        if tail_cut is not None and ts > tail_cut:
            continue
        # Gap halo
        if imputed_near is not None and ts in imputed_near.index and bool(imputed_near.loc[ts]):
            continue

        # Per-bucket residual novelty gate
        r = float(resid.loc[ts]) if ts in resid.index else 0.0
        med, mad = bucket_stats.get(_bucket_key(ts), (0.0, None))
        if mad is not None and mad > 0:
            sigma = mad / 0.6745
            if abs(r - med) < ROC_NOVELTY_SIGMA * sigma:
                continue
            z_mag = abs((r - med) / sigma)
        else:
            # No bucket info — the strict base gate already passed, so keep it.
            z_mag = 0.0

        # Per-slot delta novelty gate — additionally require the delta itself
        # to look atypical for this time-of-week slot. Recurring scheduled
        # bursts (matching their own slot's history) are rejected here.
        delta_val = float(spikes.loc[ts])
        d_med, d_mad = delta_slot_stats.get(_bucket_key(ts), (None, None))
        if d_med is not None and d_mad is not None and d_mad > 0:
            delta_z = abs(0.6745 * (delta_val - d_med) / d_mad)
            if delta_z < ROC_SLOT_Z_THRESHOLD:
                continue
            # Combined magnitude — favours events atypical in either dimension.
            z_mag = max(z_mag, float(delta_z))

        actual = float(values.loc[ts])
        prev_val = float(values.shift(1).loc[ts])
        pct_change = abs(delta_val) / (abs(prev_val) + 1e-6) * 100
        expected = actual - r

        spike_events.append({
            "time": str(ts),
            "value": round(actual, 2),
            "prev_value": round(prev_val, 2),
            "delta": round(delta_val, 2),
            "pct_change": round(pct_change, 1),
            "expected_value": round(expected, 2),
            "severity": "high" if abs(delta_val) > 2 * threshold else "medium",
            "direction": "spike" if delta_val > 0 else "drop",
            "_z_max": float(z_mag),
        })

    return spike_events, roc_stats


def _merge_roc_into_anomalies(residual_events, roc_events):
    """Fold ROC events into the residual_anomaly list.

    For each residual_anomaly event, any ROC hit whose timestamp falls inside
    that event's window is consumed: the residual event gains the
    'rate_of_change_spike' trigger plus prev_value / delta / pct_change from the
    largest-delta ROC inside the window. When both detectors agree on a window
    the severity is bumped one level (detector consensus), mirroring the
    utilization extractor's merge.

    ROC hits with no overlapping residual_anomaly are emitted as standalone
    entries with category='rate_of_change_spike'.

    Finally every event gets a confidence `score` in [0, 1] (per-bucket z,
    duration, detector consensus) so the UI can gate low-confidence rows.
    """
    def event_window(ev):
        return pd.to_datetime(ev["start"]), pd.to_datetime(ev["end"])

    # Pre-parse roc timestamps once
    roc_ts = [pd.to_datetime(r["time"]) for r in roc_events]

    consumed = set()
    for ev in residual_events:
        ev_start, ev_end = event_window(ev)
        in_window = [
            (i, roc_events[i]) for i in range(len(roc_events))
            if i not in consumed and ev_start <= roc_ts[i] <= ev_end
        ]
        if not in_window:
            continue
        if "rate_of_change_spike" not in ev["triggers"]:
            ev["triggers"].append("rate_of_change_spike")
        _, peak_roc = max(in_window, key=lambda x: abs(x[1]["delta"]))
        ev["prev_value"] = peak_roc["prev_value"]
        ev["delta"] = peak_roc["delta"]
        ev["pct_change"] = peak_roc["pct_change"]
        ev["_z_max"] = max(float(ev.get("_z_max") or 0.0), float(peak_roc.get("_z_max") or 0.0))
        # Detector consensus → bump severity one level.
        ev["severity"] = _sev_bump(ev.get("severity"))
        for i, _ in in_window:
            consumed.add(i)

    standalone = []
    for i, roc in enumerate(roc_events):
        if i in consumed:
            continue
        standalone.append({
            "category": "rate_of_change_spike",
            "triggers": ["rate_of_change_spike"],
            "start": roc["time"],
            "end": roc["time"],
            "duration_minutes": 10,
            "value": roc["value"],
            "expected_value": roc["expected_value"],
            "prev_value": roc["prev_value"],
            "delta": roc["delta"],
            "pct_change": roc["pct_change"],
            "direction": roc["direction"],
            "severity": roc["severity"],
            "_z_max": float(roc.get("_z_max") or 0.0),
        })

    all_events = residual_events + standalone
    # Confidence score (per-bucket z-magnitude, duration, detector consensus).
    for ev in all_events:
        ev["score"] = _score_event(
            ev.get("_z_max"), ev.get("duration_minutes"), len(ev.get("triggers") or [])
        )
    return all_events


# Canonical key order for every entry in the Anomalies list. Every emitted
# anomaly is padded to this exact shape (missing fields become None) so
# downstream consumers (UI, API, KQL projections) can rely on a single schema
# regardless of category. See pattern_detection.md for field semantics.
_ANOMALY_KEYS_NET = [
    "category",
    "triggers",
    "start",
    "end",
    "duration_minutes",
    "value",
    "expected_value",
    "prev_value",
    "delta",
    "pct_change",
    "direction",
    "severity",
    "score",
]


def _normalize_anomaly_net(entry):
    """Pad an anomaly entry with None for any missing canonical key.
    Guarantees a uniform JSON shape across residual_anomaly and
    rate_of_change_spike categories."""
    return {k: entry.get(k) for k in _ANOMALY_KEYS_NET}


def trendAnalysis(stl_result, df_resampled=None):
    """Trend direction analysis via linear regression on the trend component.

    For nearly-idle NICs the current_level term sits close to zero, which
    makes the relative slope numerically unstable and prone to flipping
    between 'increasing' and 'decreasing' on tiny absolute movements. When
    the observed traffic is below MIN_TRAFFIC_FOR_TREND the direction is
    downgraded to 'stable' and a low-confidence flag is included so consumers
    know the label is unreliable.
    """
    trend = stl_result.trend
    trend_clean = trend.dropna()
    X = np.arange(len(trend_clean)).reshape(-1, 1)
    y = trend_clean.values
    reg = LinearRegression().fit(X, y)
    slope_per_day = reg.coef_[0] * 144
    current_level = float(trend_clean.iloc[-1])

    # Traffic-scale guard for low-volume NICs.
    if df_resampled is not None and 'Value' in df_resampled.columns:
        median_traffic = float(df_resampled['Value'].median())
    else:
        median_traffic = float(abs(current_level))
    low_traffic = median_traffic < MIN_TRAFFIC_FOR_TREND

    # For packet rates, "increasing/decreasing" thresholds are relative to current level
    denom = max(abs(current_level), median_traffic, 1e-6)
    relative_slope = slope_per_day / denom
    if low_traffic:
        direction = "stable"
    elif relative_slope > 0.05:
        direction = "increasing"
    elif relative_slope < -0.05:
        direction = "decreasing"
    else:
        direction = "stable"

    return {
        "direction": direction,
        "slope_per_day": round(float(slope_per_day), 4),
        "current_trend_level": round(current_level, 2),
        "r_squared": round(float(reg.score(X, y)), 4),
        "median_traffic": round(median_traffic, 4),
        "confidence": "low" if low_traffic else "normal",
    }


def compute_baseline(stl_result, df_resampled, bucket_stats=None, delta_slot_stats=None):
    """Compute baseline JSON for the realtime anomaly extractor.

    In addition to the legacy global-MAD residual band and ROC threshold
    (kept for backwards compatibility), the baseline now exports the same
    per-slot residual and per-slot delta statistics the daily detectors use.
    This closes the train-serving skew between the daily job and the realtime
    path: a realtime detector built from BaselineJSON can reproduce the daily
    seasonal-aware residual and ROC decisions per 10-minute weekly slot.

    Serialised shape:
      seasonal_profile      : [1008] mean seasonal component per weekly slot
      trend_slope / trend_last_value / trend_last_time : linear trend export
      median / mad / lower_bound / upper_bound / signal_std : legacy global
                              residual band (unchanged for back-compat)
      roc_mad / roc_threshold : legacy global ROC MAD + threshold
      bucket_slot_stats     : {slot_int: [median, mad]} residual stats per
                              10-minute weekly slot; missing slots default to
                              [0, global_mad] at read time.
      delta_slot_stats      : {slot_int: [median, mad]} per-slot delta stats.
    """
    seasonal = stl_result.seasonal
    trend = stl_result.trend
    resid = stl_result.resid

    week_pos = (df_resampled.index.dayofweek * 144 + df_resampled.index.hour * 6 + df_resampled.index.minute // 10)
    seasonal_df = pd.DataFrame({'position': week_pos, 'seasonal': seasonal.values})
    seasonal_by_pos = seasonal_df.groupby('position')['seasonal'].mean()
    seasonal_profile = [round(float(seasonal_by_pos.get(i, 0.0)), 4) for i in range(1008)]

    trend_clean = trend.dropna()
    X = np.arange(len(trend_clean)).reshape(-1, 1)
    reg = LinearRegression().fit(X, trend_clean.values)

    t = _compute_thresholds(resid, df_resampled)

    _, roc_stats = rateOfChangeDetection(stl_result, df_resampled)

    # Fine-grained per-slot stats. Serialised as compact dicts keyed by the
    # weekly-slot integer (0..1007 = dow*144 + hour*6 + minute//10) so the
    # realtime path can rebuild the same decision surface without recomputing
    # 30 days of MSTL. Slots absent from the dict fall back to the global
    # median/MAD.
    if bucket_stats is None:
        bucket_stats = _compute_bucket_stats(resid, signal_std=t["signal_std"])
    if delta_slot_stats is None:
        deltas = df_resampled['Value'].diff().dropna()
        delta_slot_stats = _compute_delta_slot_stats(deltas, signal_std=t["signal_std"])

    def _slot_int(k):
        dow, hour, tm = k
        return int(dow) * 144 + int(hour) * 6 + int(tm)

    bucket_slot_stats_out = {
        _slot_int(k): [round(float(v[0]), 4), round(float(v[1]), 4)]
        for k, v in bucket_stats.items()
    }
    delta_slot_stats_out = {
        _slot_int(k): [round(float(v[0]), 4), round(float(v[1]), 4)]
        for k, v in delta_slot_stats.items()
    }

    return {
        "seasonal_profile": seasonal_profile,
        "trend_slope": round(float(reg.coef_[0]), 6),
        "trend_last_value": round(float(trend_clean.iloc[-1]), 4),
        "trend_last_time": str(trend_clean.index[-1]),
        "median": round(t["median"], 4),
        "mad": round(t["mad"], 4),
        "lower_bound": round(t["lower_bound"], 4),
        "upper_bound": round(t["upper_bound"], 4),
        "signal_std": round(t["signal_std"], 4),
        "bucket_slot_stats": bucket_slot_stats_out,
        "delta_slot_stats": delta_slot_stats_out,
        **roc_stats,
    }


# --- Orchestrator ---
def analyze_nic_metric(df):
    """Run full analysis for one NIC/metric. Returns findings dict."""
    df_r, stl_result, imputed_mask = decompose_mstl(df)
    # Compute per-slot residual + delta stats once and share them across the
    # detectors and the baseline exporter so daily decisions and realtime
    # reconstruction stay in sync.
    signal_std = float(df_r['Value'].std())
    bucket_stats = _compute_bucket_stats(stl_result.resid, signal_std=signal_std)
    deltas = df_r['Value'].diff().dropna()
    delta_slot_stats = _compute_delta_slot_stats(deltas, signal_std=signal_std)

    residual_data = anomalyDetection(
        stl_result, df_r,
        bucket_stats=bucket_stats,
        imputed_mask=imputed_mask,
    )
    roc_data, _ = rateOfChangeDetection(
        stl_result, df_r,
        bucket_stats=bucket_stats,
        delta_slot_stats=delta_slot_stats,
        imputed_mask=imputed_mask,
    )
    # Merge ROC into residual_anomaly events via the 'triggers' array; non-overlapping
    # ROC hits become standalone category='rate_of_change_spike' entries. Sorted
    # chronologically by start/time so consumers can scan a single timeline.
    anomaly_data = _merge_roc_into_anomalies(residual_data, roc_data)
    anomaly_data.sort(key=lambda e: e.get("start") or "")
    # Pad every entry to the canonical schema so all categories share one shape.
    anomaly_data = [_normalize_anomaly_net(e) for e in anomaly_data]
    trend_data = trendAnalysis(stl_result, df_r)
    baseline = compute_baseline(
        stl_result, df_r,
        bucket_stats=bucket_stats,
        delta_slot_stats=delta_slot_stats,
    )

    return {
        "Anomalies": anomaly_data,
        "TrendAnalysis": trend_data,
        "BaselineJSON": baseline,
    }


# --- Main ---
def run():
    run_date = datetime.now(timezone.utc)
    end_date = run_date
    start_date = end_date - timedelta(days=ANALYSIS_DAYS)
    start_str = start_date.strftime('%Y-%m-%d %H:%M:%S')
    end_str = end_date.strftime('%Y-%m-%d %H:%M:%S')

    print(f"Network Daily Pattern Extractor — {run_date.strftime('%Y-%m-%d %H:%M')} UTC")
    print(f"Analysis window: {start_str} → {end_str} ({ANALYSIS_DAYS} days)")

    servers = get_server_list()
    server_names = [s[0] for s in servers]
    print(f"Servers: {len(server_names)}")

    nics = get_nic_list(start_str, end_str, server_names)
    print(f"NICs discovered: {len(nics)}")
    print()

    analytics_rows = []

    for nic_name in nics:
        for obj_name, metric_label in NETWORK_METRICS:
            try:
                # NIC names are unique across the fleet (they embed the server
                # name as a substring), so filtering by `ServerNic/<nic>` alone
                # is sufficient to isolate this NIC's samples.
                query = f"""
                {ADX_SOURCE_TABLE}
                | where ResourceId has 'ServerNic/{nic_name}'
                | where ObjectName == '{obj_name}'
                | where TimeGenerated >= datetime('{start_str}') and TimeGenerated <= datetime('{end_str}')
                | project TimeGenerated, AvgValue
                | order by TimeGenerated asc
                """
                df = readFromADX(query)
                if df.empty:
                    continue

                df.rename(columns={"AvgValue": "Value"}, inplace=True)
                df["TimeGenerated"] = pd.to_datetime(df["TimeGenerated"])
                df = df.drop_duplicates(subset=["TimeGenerated"])
                df.set_index("TimeGenerated", inplace=True)

                findings = analyze_nic_metric(df)
                analytics_rows.append({
                    "TimeGenerated": run_date,
                    "ResourceId": nic_name,
                    "ObjectName": "NetworkPatternSummary",
                    "CounterName": metric_label,
                    "Data": json.dumps(findings, default=str),
                })
                td = findings["TrendAnalysis"]
                cats = [a.get('category') for a in findings['Anomalies']]
                residual_count = cats.count('residual_anomaly')
                roc_count = cats.count('rate_of_change_spike')
                print(f"  {nic_name}/{metric_label}: residual={residual_count}, "
                      f"roc={roc_count}, "
                      f"trend={td['direction']} (slope={td['slope_per_day']}/day)")

            except ValueError as ve:
                print(f"  {nic_name}/{metric_label}: skipped ({ve})")
            except Exception as ex:
                print(f"  {nic_name}/{metric_label}: ERROR — {ex}")

    if analytics_rows:
        print(f"\nIngesting {len(analytics_rows)} rows to ADX...")
        client = get_ingest_client()
        ingest_to_adx(client, pd.DataFrame(analytics_rows))

    print(f"\nDone: {len(analytics_rows)} pattern summaries ingested")


if __name__ == "__main__":
    run()
