"""
Daily Pattern Extractor — runs once per day.
Analyzes the last 1 month of server metrics to detect seasonal patterns,
sustained high-utilization, anomalies, and trend direction (Disk only).
Stores deduced findings + baseline for real-time detection in Analytics table.

Output: Analytics table, ObjectName = "PatternSummary"
        1 row per server/metric with all findings as JSON in Data column.
        Metrics: CPU, Memory (no trend), Disk per-drive (with trend).

Schedule: Daily at ~1 AM UTC via Task Scheduler.
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
ADX_SOURCE_TABLE = "Server_Metrics_Perf"
ANALYTICS_TABLE = "Analytics"
# Timestamps from ADX arrive in UTC and are converted ONCE inside
# `decompose_stl` to America/Los_Angeles wall clock (tz-naive) so every
# downstream operation — Morning / Business Hours / Evening classification,
# day-of-week grouping, and the hour-of-day MAD buckets in
# _compute_bucket_stats — speaks PT. This fixes two bugs the operator sees:
#   (a) Weekday leak: a Monday 5 PM PT batch has a Tuesday UTC timestamp,
#       which would otherwise show up under the Tuesday card.
#   (b) DST drift: PT is UTC-8 in winter (PST) and UTC-7 in summer (PDT),
#       so any fixed UTC-hour cutoff is off by an hour half the year.
# Emitted timestamp strings are PT wall-clock with no offset
# (e.g. "2026-06-23 07:10:00"), matching what the frontend renders.
#
# Operational windows (PT wall clock):
#   Morning  : 06:00-10:00 PT
#   Business : 10:00-18:00 PT
#   Evening  : 18:00-06:00 PT
LOCAL_TZ = "America/Los_Angeles"
MSTL_PERIODS = [144, 1008]       # Daily and weekly cycles
MIN_DATA_POINTS = 1008    # At least 1 full weekly cycle
ANALYSIS_DAYS = 30        # 1 month lookback
MIN_RESIDUAL_MAGNITUDE = 9.0        # Ignore anomalies with |residual| below this
HIGH_UTIL_THRESHOLD = 90.0           # Always flag if utilization is critically high
MIN_IQR = 5.0                        # Hard floor on IQR (percentage points)
MIN_IQR_RELATIVE = 0.5               # IQR also floored at 50% of signal std — scales to server's actual variance
SPIKE_PCT_THRESHOLD = 0.4            # ROC: pct change between consecutive samples must exceed 40%
SPIKE_ABS_THRESHOLD = 30.0           # ROC: absolute change must also exceed 25 percentage points
SPIKE_TARGET_MIN = 60.0              # ROC spike (positive): only flag when the RESULTING util is above this.
                                     #   Filters out big jumps that land in a comfortable range (e.g. 10→60).
DROP_TARGET_MAX = 2.0                # ROC drop  (negative): only flag when the RESULTING util is at/below this.
                                     #   Filters out routine declines and only catches catastrophic falls to ~zero
                                     #   (workload vanished, agent stopped, process crashed, etc.).
SUSTAINED_THRESHOLD = 90.0           # Sustained-high threshold (% utilization)
SUSTAINED_MIN_CONSECUTIVE = 3        # Sustained-high requires this many consecutive 10-min readings

# ── Anomaly-detection refinements ────────────────────────────────────────────
# Tighten what counts as a residual anomaly so the timeline matches a human
# reviewer's intuition. Each constant addresses a specific failure mode:
EDGE_TRIM_HEAD_HOURS = 48            # MSTL trend/seasonal warm-up: first 48 h are unreliable
EDGE_TRIM_TAIL_HOURS = 6             # MSTL right-edge artifact: last 6 h are unreliable
MAD_Z_THRESHOLD = 3.5                # Modified z-score on per-bucket MAD
ROLLING_VALIDATION_DAYS = 7          # Holdback baseline window
ROLLING_MIN_PERIODS = 500            # ~3.5 days minimum before rolling z is trusted
ROLLING_Z_THRESHOLD = 2.5            # Rolling z must also agree (cross-validation)
PERSISTENCE_K = 2                    # Singleton-killer: ≥ k of n neighbors must also breach
PERSISTENCE_N = 3
MIN_UTIL_FOR_RESIDUAL_ANOMALY = 20.0 # Suppress low-base noise (1%→3% jumps look huge in % but aren't)
ROC_NOVELTY_SIGMA = 2.5              # ROC seasonal-novelty gate: |resid - bucket_med| > k·σ_bucket


def _clip_pct(v):
    """Clamp a utilization value to [0, 100].

    MSTL is an additive decomposition (actual = trend + seasonal + residual)
    and has no notion that utilization is bounded. For a server that runs near
    its ceiling, trend + seasonal can mathematically sum to >100% while the
    residual is a negative correction that brings the model back to the
    observed value. We clamp model-derived values (most importantly
    `expected_utilization`) so the UI never shows physically impossible
    numbers like "expected 102%".
    """
    try:
        f = float(v)
    except (TypeError, ValueError):
        return v
    if f > 100.0:
        return 100.0
    if f < 0.0:
        return 0.0
    return f


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
        "FROM [Server List] "
        "WHERE Environment LIKE 'prod%' "
        "AND ("
        # "[Application CI] LIKE 'Mosaiq' OR "
        # "[Application CI] LIKE 'WellSky Transfusion' OR "
        # "[Application CI] LIKE 'Change Healthcare Cardiology' OR "
        # "[Application CI] LIKE 'Acuo VNA' OR "
        # "[Application CI] LIKE 'Fuji Synapse PACS' OR "
        # "[Application CI] LIKE 'OBIX' OR "
        "[Application CI] LIKE 'Deviceconx'"
        ")"
    )
    return queryDw(conn, sqlquery)


# --- Analysis Functions (matching patternDetection.ipynb) ---

def decompose_stl(df):
    """Run MSTL decomposition with daily, and weekly seasonality.
    Returns (resampled_df, result) where result has .seasonal (combined), .trend, .resid."""
    if len(df) < MIN_DATA_POINTS:
        raise ValueError(f"Insufficient data: {len(df)} points (need {MIN_DATA_POINTS}+)")

    df_r = df.resample('10min').mean()
    df_r['Utilization'] = df_r['Utilization'].interpolate(method='linear', limit=6)
    df_r['MaxUtilization'] = df_r['MaxUtilization'].interpolate(method='linear', limit=6)
    df_r.dropna(subset=['Utilization'], inplace=True)

    if len(df_r) < MIN_DATA_POINTS:
        raise ValueError(f"After interpolation, only {len(df_r)} points (need {MIN_DATA_POINTS}+)")

    # Convert the index to America/Los_Angeles ONCE, then drop tz-info so the
    # downstream code (which uses .hour, .day_name(), .dayofweek, and
    # str(Timestamp) for serialization) operates entirely in PT wall clock.
    # zoneinfo handles PST/PDT automatically, so business-hours cutoffs stay
    # correct across DST transitions. See the module header for the
    # operational windows this enables.
    if df_r.index.tz is None:
        df_r.index = df_r.index.tz_localize("UTC")
    df_r.index = df_r.index.tz_convert(LOCAL_TZ).tz_localize(None)

    mstl = MSTL(df_r['Utilization'], periods=MSTL_PERIODS)
    res = mstl.fit()

    # MSTL returns .seasonal as a DataFrame (one column per period).
    # If a period is dropped (insufficient data), it may return a Series instead.
    # Combine into a single Series so downstream code works unchanged.
    if isinstance(res.seasonal, pd.DataFrame):
        combined_seasonal = res.seasonal.sum(axis=1)
    else:
        combined_seasonal = res.seasonal

    class CombinedResult:
        def __init__(self, seasonal, trend, resid):
            self.seasonal = seasonal
            self.trend = trend
            self.resid = resid

    return df_r, CombinedResult(combined_seasonal, res.trend, res.resid)


def seasonalityidentification(name, stl_result, df_resampled):
    """Identify weekly seasonal patterns and sustained high-utilization periods."""
    seasonal = stl_result.seasonal
    threshold = seasonal.quantile(0.8)
    weekly_peaks = seasonal[seasonal > threshold]

    df_resampled["Seasonality"] = seasonal
    df_resampled['WeekOfMonth'] = df_resampled.index.isocalendar().week.astype(int)
    df_resampled["DayOfWeek"] = df_resampled.index.day_name()

    pct_change = df_resampled['Utilization'].pct_change().abs()
    abs_change = df_resampled['Utilization'].diff().abs()
    df_resampled["RateOfChange"] = pct_change
    df_resampled["AbsChange"] = abs_change

    condition_value_above_90 = df_resampled['Utilization'] > HIGH_UTIL_THRESHOLD
    condition_genuine_spike = (pct_change > SPIKE_PCT_THRESHOLD) & (abs_change > SPIKE_ABS_THRESHOLD)
    filtered_seasonal_points = weekly_peaks[condition_value_above_90 | condition_genuine_spike]

    df_filtered = df_resampled[df_resampled.index.isin(filtered_seasonal_points.index)]

    # NOTE: the AbsChange floor in the spike aggregation below is 20 (not
    # SPIKE_ABS_THRESHOLD=25) — this is the historical spike-counting behavior
    # and is kept as a literal intentionally so emitted counts are unchanged.
    df_weekly = df_filtered.groupby(['WeekOfMonth', 'DayOfWeek']).agg(
        max_utilization=('Utilization', 'max'),
        avg_utilization=('Utilization', 'mean'),
        count_above_90=('Utilization', lambda x: (x >= HIGH_UTIL_THRESHOLD).sum()),
        timeList=('Utilization', lambda x: x.index[x >= HIGH_UTIL_THRESHOLD].strftime('%I:%M:%S %p').tolist()),
        count_sudden_spikes=('RateOfChange', lambda x: ((x > SPIKE_PCT_THRESHOLD) & (df_resampled.loc[x.index, 'AbsChange'] > 20)).sum()),
        spikeTimeList=('RateOfChange', lambda x: x.index[(x > SPIKE_PCT_THRESHOLD) & (df_resampled.loc[x.index, 'AbsChange'] > 20)].strftime('%I:%M:%S %p').tolist())
    ).reset_index()

    sustained = detect_sustained_high(df_resampled, threshold=SUSTAINED_THRESHOLD, min_consecutive=SUSTAINED_MIN_CONSECUTIVE)
    df_weekly = df_weekly[df_weekly["count_above_90"] > 0]
    return df_weekly, sustained


def detect_sustained_high(df, threshold=SUSTAINED_THRESHOLD, min_consecutive=SUSTAINED_MIN_CONSECUTIVE):
    """Detect periods where utilization stays >= threshold for min_consecutive readings (1 hour).

    Each entry is shaped like an anomaly event so it can be merged into the
    Anomalies list with category='sustained_high'.
    """
    high = df['Utilization'] >= threshold
    groups = (high != high.shift()).cumsum()
    sustained = high.groupby(groups).filter(lambda x: x.sum() >= min_consecutive if x.iloc[0] else False)

    if sustained.empty:
        return []

    periods = []
    for _, grp in df.loc[sustained.index].groupby(
        (sustained.index.to_series().diff() > pd.Timedelta('10min')).cumsum()
    ):
        max_util = float(grp['Utilization'].max())
        # Severity scales with peak utilization above the 90% threshold.
        if max_util >= 95:
            severity = "high"
        elif max_util >= 90:
            severity = "medium"
        else:
            severity = "low"

        periods.append({
            "category": "sustained_high",
            "start": str(grp.index[0]),
            "end": str(grp.index[-1]),
            "duration_minutes": int((grp.index[-1] - grp.index[0]).total_seconds() / 60) + 10,
            "utilization": round(max_util, 2),
            "day": grp.index[0].day_name(),
            "severity": severity,
            # Synthetic z so the confidence score still rewards long sustained
            # runs (sustained_high doesn't have a residual-based z of its own).
            "_z_max": float(min(4.0, max(1.0, len(grp) / 6.0))),
        })
    return periods


# ── Shared time-bucketing (used by build_summary & utilizationThresholdDetails) ──
_TIME_FMT = "%I:%M:%S %p"


def _classify_time(t_str):
    """Map an '%I:%M:%S %p' time string to a PT operational window.

    All timestamps are America/Los_Angeles wall clock (see decompose_stl), so
    DST is already handled. Cutoffs are exhaustive — every hour maps to exactly
    one window, and the overnight stretch folds into "evening":
        business : 10:00-18:00 PT
        morning  : 06:00-10:00 PT
        evening  : 18:00-06:00 PT (wraps midnight)
    """
    h = datetime.strptime(t_str, _TIME_FMT).hour
    if 10 <= h < 18:
        return "business"
    if 6 <= h < 10:
        return "morning"
    return "evening"


def _bucketize_day_times(breach_times, spike_times):
    """Sort one day's breach/spike time strings into the 6-slot PatternDetails
    schema. Input and output are both '%I:%M:%S %p' strings; each slot is
    chronologically sorted. Shared by build_summary (seasonal breaches) and
    utilizationThresholdDetails (absolute breaches) so both emit an identical
    weekday-grid shape."""
    slots = {
        "Business Hours": [],
        "Non Business Hours - Morning": [],
        "Non Business Hours - Evening": [],
        "Sudden Spikes - Business Hours": [],
        "Sudden Spikes - Morning": [],
        "Sudden Spikes - Evening": [],
    }
    for t in breach_times:
        cat = _classify_time(t)
        parsed = datetime.strptime(t, _TIME_FMT)
        if cat == "business":
            slots["Business Hours"].append(parsed)
        elif cat == "morning":
            slots["Non Business Hours - Morning"].append(parsed)
        else:
            slots["Non Business Hours - Evening"].append(parsed)
    for t in spike_times:
        cat = _classify_time(t)
        parsed = datetime.strptime(t, _TIME_FMT)
        if cat == "business":
            slots["Sudden Spikes - Business Hours"].append(parsed)
        elif cat == "morning":
            slots["Sudden Spikes - Morning"].append(parsed)
        else:
            slots["Sudden Spikes - Evening"].append(parsed)
    for key in slots:
        slots[key].sort()
        slots[key] = [datetime.strftime(t, _TIME_FMT) for t in slots[key]]
    return slots


def build_summary(df_week, name, metric_type, sustained_periods=None):
    """Generate pattern summary text and details dict"""
    text = ""
    occurences = {}
    if len(df_week) > 0:
        timeList = {}
        spikeList = {}
        for _, i in df_week.iterrows():
            if i["DayOfWeek"] not in timeList:
                timeList[i["DayOfWeek"]] = []
                spikeList[i["DayOfWeek"]] = []
                occurences[i["DayOfWeek"]] = df_week[df_week["DayOfWeek"] == i["DayOfWeek"]]["WeekOfMonth"].tolist()
            timeList[i["DayOfWeek"]].extend(i["timeList"])
            spikeList[i["DayOfWeek"]].extend(i["spikeTimeList"])

        timeDays = {}
        # All timestamps reaching this point are America/Los_Angeles wall clock
        # (see decompose_stl). PT Business/Morning/Evening bucketing is shared
        # with utilizationThresholdDetails via _bucketize_day_times.
        for day in timeList:
            timeDays[day] = _bucketize_day_times(timeList[day], spikeList[day])

        days = ",".join(df_week["DayOfWeek"].unique())
        text += f"The Azure server({name}) has reached over a 90% {metric_type} utilization on {days} considering last 1 month data.\n"
        weekNames = []
        for day_name in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]:
            if day_name in timeDays:
                t = f"On {day_name}'s, the Utilization has breached threshold"
                for label, key in [("Business hours", "Business Hours"),
                                   ("early Morning Non Business Hours", "Non Business Hours - Morning"),
                                   ("Evening Non Business Hours", "Non Business Hours - Evening")]:
                    if timeDays[day_name][key]:
                        length = len(timeDays[day_name][key])
                        valMapping = {1: "once", 2: "twice", 3: "thrice"}
                        count_str = valMapping.get(length, f"{length} times")
                        times = timeDays[day_name][key]
                        time_str = f"at {times[0]}" if length == 1 else f"between {times[0]},{times[-1]}"
                        t += f" {count_str} during {label}({time_str}),"
                t = t.rstrip(",")

                spikeInfo = []
                for label, key in [("Business Hours", "Sudden Spikes - Business Hours"),
                                   ("early Morning", "Sudden Spikes - Morning"),
                                   ("Evening", "Sudden Spikes - Evening")]:
                    if timeDays[day_name][key]:
                        length = len(timeDays[day_name][key])
                        count_str = {1: "once", 2: "twice", 3: "thrice"}.get(length, f"{length} times")
                        times = timeDays[day_name][key]
                        time_str = f"at {times[0]}" if length == 1 else f"between {times[0]},{times[-1]}"
                        spikeInfo.append(f"{count_str} during {label} ({time_str})")
                if spikeInfo:
                    t += f". Additionally, sudden spikes (>40% jump) were observed {', '.join(spikeInfo)}"
                text += t + "\n"
            else:
                weekNames.append(day_name)
        if weekNames:
            text += f"On {','.join(weekNames)} the Utilizations where less than given threshold"

        if sustained_periods:
            text += f"\n\nSustained high utilization (>=90% for 1+ hours) detected in {len(sustained_periods)} period(s):"
            for sp in sustained_periods[:5]:
                text += f"\n  - {sp['day']}: {sp['start']} to {sp['end']} ({sp['duration_minutes']} min, peak {sp['utilization']}%)"

        timeDays["Occurences"] = occurences
        return text, timeDays
    return "No Patterns/Threshold breach Found", None


def utilizationRange(df):
    """Compute utilization range distribution.

    Returns a histogram of MaxUtilization across the analysis window plus the
    observed peak. The right-sizing recommendation that used to be returned
    alongside this dict is now composed on the frontend so the suggestion can
    sit next to the histogram it summarises (see `PatternInsightsPane.jsx`).
    """
    d = {
        "50_60": len(df[(df["MaxUtilization"] >= 50) & (df["MaxUtilization"] < 60)]),
        "60_70": len(df[(df["MaxUtilization"] >= 60) & (df["MaxUtilization"] < 70)]),
        "70_80": len(df[(df["MaxUtilization"] >= 70) & (df["MaxUtilization"] < 80)]),
        "80_90": len(df[(df["MaxUtilization"] >= 80) & (df["MaxUtilization"] < 90)]),
        "90_100": len(df[(df["MaxUtilization"] >= 90) & (df["MaxUtilization"] <= 100)]),
    }
    d["maximum"] = float(df["MaxUtilization"].max())
    return d


def utilizationThresholdDetails(df_resampled, threshold=HIGH_UTIL_THRESHOLD):
    """Absolute-threshold companion to PatternDetails.

    Counts every 10-min sample whose `MaxUtilization` reached `threshold`
    (default 90%) and groups them into the exact same shape as PatternDetails
    so the UI can render an identical weekday grid. The two fields answer
    different questions:

        PatternDetails             → "when did this resource break its OWN
                                      learned seasonal pattern?" (relative,
                                      MSTL-residual-based)
        PatternDetailsUtilization  → "when did this resource exceed 90%
                                      utilization in absolute terms?"
                                      (no model, just a hard cutoff)

    Reasoning: an always-busy server can produce zero seasonal breaches yet
    sit at 90%+ for hundreds of samples — the existing weekly summary will
    look empty even though `UtilizationRange.90_100 = 29`. This field
    surfaces those samples directly so the weekly grid stays meaningful for
    saturated workloads.

    MaxUtilization is used (not Utilization) so counts are consistent with
    UtilizationRange, which also bins on MaxUtilization. Sudden-spike
    classification reuses the same SPIKE_PCT_THRESHOLD / SPIKE_ABS_THRESHOLD
    gates as seasonalityidentification, but additionally requires the
    landing utilization to be at/above `threshold` so only spikes that end
    in the critical band are kept.

    Returns: dict with the PatternDetails schema:
        {
            "Monday": {
                "Business Hours": [...time strings...],
                "Non Business Hours - Morning": [...],
                "Non Business Hours - Evening": [...],
                "Sudden Spikes - Business Hours": [...],
                "Sudden Spikes - Morning": [...],
                "Sudden Spikes - Evening": [...]
            },
            ...
            "Occurences": { "Monday": [<weekOfMonth>, ...], ... }
        }
        or None when no samples breached.
    """
    if df_resampled is None or df_resampled.empty:
        return None
    if "MaxUtilization" not in df_resampled.columns:
        return None

    df = df_resampled.copy()
    df["DayOfWeek"] = df.index.day_name()
    df["WeekOfMonth"] = df.index.isocalendar().week.astype(int)

    # Absolute breach: MaxUtilization (peak inside the 10-min bucket) >= threshold.
    breach_mask = df["MaxUtilization"].fillna(0) >= threshold

    # Sudden-spike candidates: same gates as seasonalityidentification, with
    # the extra "landing zone" rule that the post-spike utilization itself
    # must be at/above the threshold — we only want spikes into the critical band.
    util_series = df["Utilization"]
    pct_change = util_series.pct_change().abs()
    abs_change = util_series.diff().abs()
    spike_mask = (
        (pct_change > SPIKE_PCT_THRESHOLD)
        & (abs_change > SPIKE_ABS_THRESHOLD)
        & (util_series >= threshold)
    ).fillna(False)

    if not breach_mask.any() and not spike_mask.any():
        return None

    # PT wall clock — see decompose_stl. Bucketing shares _bucketize_day_times
    # with build_summary (same exhaustive Business/Morning/Evening cutoffs).
    timeDays = {}
    occurences = {}
    for day, grp in df.groupby("DayOfWeek", sort=False):
        bm = breach_mask.loc[grp.index]
        sm = spike_mask.loc[grp.index]
        if not (bm.any() or sm.any()):
            continue

        breach_times = grp.index[bm].strftime("%I:%M:%S %p").tolist()
        spike_times = grp.index[sm].strftime("%I:%M:%S %p").tolist()
        timeDays[day] = _bucketize_day_times(breach_times, spike_times)

        occurences[day] = sorted(grp.loc[bm | sm, "WeekOfMonth"].unique().tolist())

    if not timeDays:
        return None

    timeDays["Occurences"] = occurences
    return timeDays


# ── Anomaly-detection helpers (shared by anomalyDetection & rateOfChangeDetection) ──

def _bucket_key(ts):
    """(dayofweek 0..6, hour 0..23) — the bucket key for per-time-slot stats."""
    return (int(ts.dayofweek), int(ts.hour))


def _mad(values):
    """Median Absolute Deviation. Robust scale estimator; under normality
    sigma ≈ MAD / 0.6745."""
    arr = np.asarray(values, dtype=float)
    if arr.size == 0:
        return 0.0
    return float(np.median(np.abs(arr - np.median(arr))))


def _compute_bucket_stats(resid):
    """Per-(dayofweek, hour) median + MAD of the STL residual.

    Returns {(dow, hour): (median, mad_floored)}. MAD is floored at
    max(0.3 × global_MAD, 1.0) so quiet buckets (e.g. 3 AM Sundays where the
    residual barely moves) don't divide by ~0 and turn every sample into an
    apparent outlier."""
    r = resid.dropna()
    if r.empty:
        return {}
    keys = list(zip(r.index.dayofweek.tolist(), r.index.hour.tolist()))
    df = pd.DataFrame({"r": r.values, "b": keys})
    medians = df.groupby("b")["r"].median()
    mads = df.groupby("b")["r"].apply(lambda x: _mad(x.values))
    global_mad = _mad(r.values)
    floor = max(global_mad * 0.3, 1.0)
    mads = mads.clip(lower=floor)
    return {b: (float(medians[b]), float(mads[b])) for b in medians.index}


def _rolling_zscore(resid, window=None, min_periods=None):
    """Vectorised rolling z-score on the residual. Used as a holdback baseline
    so a global-rare event still has to look unusual against the *recent past*
    too — defends against single-event contamination of the 30-day stats."""
    win = window if window is not None else ROLLING_VALIDATION_DAYS * 144
    mp = min_periods if min_periods is not None else ROLLING_MIN_PERIODS
    rmean = resid.rolling(window=win, min_periods=mp).mean()
    rstd = resid.rolling(window=win, min_periods=mp).std().replace(0.0, np.nan)
    return (resid - rmean) / rstd


def _persistence_mask(flagged_index, all_index, k=PERSISTENCE_K, n=PERSISTENCE_N):
    """Keep a candidate only if ≥ k of the n surrounding samples (centered on
    the candidate) were also flagged. Kills singleton blips that immediately
    revert to baseline — the dominant false-positive class the human reviewer
    complains about."""
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
    """(head, tail) timestamps marking the trustworthy interior of the window.
    Samples outside this range are dropped because MSTL trend/seasonal fits
    are unreliable at the boundaries."""
    if len(df_index) == 0:
        return None, None
    head = df_index[0] + pd.Timedelta(hours=EDGE_TRIM_HEAD_HOURS)
    tail = df_index[-1] - pd.Timedelta(hours=EDGE_TRIM_TAIL_HOURS)
    return head, tail


def _score_event(z_max, duration_min, utilization, trigger_count):
    """Confidence score in [0, 1]. Weighted blend of: how far outside the
    per-bucket band (z), how long the event lasted, the absolute operating
    level, and how many detectors agreed. The UI uses this to gate
    low-confidence events without changing the detection thresholds."""
    z_comp = min(max(float(z_max or 0.0), 0.0) / 8.0, 1.0)
    dur_comp = min(max(float(duration_min or 0), 0) / 60.0, 1.0)
    util_comp = min(max(float(utilization or 0.0), 0.0) / 100.0, 1.0)
    trig_comp = min(max(int(trigger_count or 0), 0) / 3.0, 1.0)
    s = 0.40 * z_comp + 0.20 * dur_comp + 0.20 * util_comp + 0.20 * trig_comp
    return round(float(max(0.0, min(1.0, s))), 3)


def anomalyDetection(stl_result, df_resampled, bucket_stats=None):
    """Detect residual anomalies the way a human reviewer would.

    Replaces the old global-IQR + critical-util override with a robust pipeline
    designed to suppress the dominant false-positive sources:

      1. Per-(dayofweek, hour) modified z-score (MAD-based) — the residual band
         is allowed to be tight at 3 AM and loose at 2 PM. Removes the
         "everything during business hours looks anomalous" failure.
      2. Edge trim: first EDGE_TRIM_HEAD_HOURS and last EDGE_TRIM_TAIL_HOURS
         are excluded — MSTL trend/seasonal are unreliable at boundaries.
      3. Rolling 7-day z-score holdback: the candidate must also look unusual
         against a recent local baseline, not just the 30-day global one.
      4. Persistence (k-of-n): kill singleton blips that immediately revert.
      5. Min-utilization floor: don't flag low-base residual ripples.

    The is_critical override (any util ≥ 90 % auto-flags) is intentionally
    removed — sustained_high already covers prolonged elevated utilization
    and the override was the dominant false-positive source on always-busy
    servers."""
    resid = stl_result.resid
    if bucket_stats is None:
        bucket_stats = _compute_bucket_stats(resid)
    if not bucket_stats:
        return []

    head_cut, tail_cut = _edge_cutoffs(df_resampled.index)
    rolling_z = _rolling_zscore(resid)

    # ── 1) Per-point candidate generation ────────────────────────────────────
    candidates = []
    for ts in resid.dropna().index:
        if head_cut is not None and ts < head_cut:
            continue
        if tail_cut is not None and ts > tail_cut:
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

        util = float(df_resampled.loc[ts, "Utilization"])
        if util < MIN_UTIL_FOR_RESIDUAL_ANOMALY:
            continue

        # MSTL is additive: expected = actual - residual. Clamp because
        # trend+seasonal can mathematically exceed 100 on saturated servers.
        expected = _clip_pct(util - r)
        candidates.append({
            "ts": ts, "util": util, "residual": r,
            "z": abs(float(z_mod)), "expected": expected,
        })

    if not candidates:
        return []

    # ── 2) Persistence filter ────────────────────────────────────────────────
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

    # ── 4) Summarize ─────────────────────────────────────────────────────────
    out = []
    for group in events:
        zs = [p["z"] for p in group]
        utils = [p["util"] for p in group]
        peak_i = max(range(len(group)), key=lambda i: group[i]["z"])
        z_max = float(max(zs))

        # Severity bands on the modified z-score. Cutoffs picked so that
        # z = 3.5 lands at the medium/low boundary (matching MAD_Z_THRESHOLD)
        # and z ≥ 5 is high (≈ 1-in-millions under Gaussianity).
        if z_max >= 5.0:
            severity = "high"
        elif z_max >= 3.5:
            severity = "medium"
        else:
            severity = "low"

        duration_min = int((group[-1]["ts"] - group[0]["ts"]).total_seconds() / 60) + 10
        out.append({
            "category": "residual_anomaly",
            "triggers": ["iqr_outlier"],   # trigger key kept stable for frontend
            "start": str(group[0]["ts"]),
            "end": str(group[-1]["ts"]),
            "duration_minutes": duration_min,
            "utilization": round(float(max(utils)), 2),
            "expected_utilization": round(float(group[peak_i]["expected"]), 2),
            "severity": severity,
            "_z_max": z_max,   # internal: consumed by merge_events_by_overlap for scoring
        })

    return out


def rateOfChangeDetection(stl_result, df_resampled, bucket_stats=None):
    """Detect sudden jumps/drops in utilization between consecutive 10-min samples.

    Four gates run in sequence:

    1. Base gate (dual): both pct_change > SPIKE_PCT_THRESHOLD AND
       abs_delta > SPIKE_ABS_THRESHOLD. Suppresses tiny jumps that look big
       in pct terms (e.g. 1% -> 2% is +100% pct but only +1pp).

    2. Edge trim: drop candidates in the first EDGE_TRIM_HEAD_HOURS or last
       EDGE_TRIM_TAIL_HOURS of the window — MSTL trend/seasonal fits there
       are noisy and so is the residual we evaluate in gate 4.

    3. Landing-zone gate (direction-aware): once a sample passes the base
       gate, the *resulting* utilization decides whether it's operationally
       interesting:
          - Positive delta (spike): only flagged when `current > SPIKE_TARGET_MIN`.
            A jump 30% -> 55% isn't a problem; 30% -> 80% and 60% -> 90% are.
          - Negative delta (drop):  only flagged when `current <= DROP_TARGET_MAX`.
            A drop 80% -> 40% is normal cooldown; 50% -> 1% is catastrophic.

    4. Per-bucket prediction-interval gate: replaces the legacy
       `|residual| < MIN_RESIDUAL_MAGNITUDE` rule with a statistically
       principled check. Per (dayofweek, hour) we know the residual median
       and MAD-derived sigma; we skip the event if `|resid - bucket_med|`
       is within `ROC_NOVELTY_SIGMA × sigma_bucket`. A daily 3 AM batch
       spike whose magnitude matches its history is recognised as known
       seasonality; a 3 AM spike that's twice the usual amplitude is not.

    Returns a list of point-in-time events with the same shape contract as
    residual_anomaly single-point entries so they merge cleanly via
    merge_events_by_overlap.
    """
    util = df_resampled['Utilization']
    delta = util.diff()
    abs_delta = delta.abs()
    pct_change = util.pct_change().abs()

    # Gate 1 (base): both pct and absolute delta must clear the floor.
    candidates = (pct_change > SPIKE_PCT_THRESHOLD) & (abs_delta > SPIKE_ABS_THRESHOLD)
    candidate_idx = util.index[candidates.fillna(False)]
    if len(candidate_idx) == 0:
        return []

    head_cut, tail_cut = _edge_cutoffs(df_resampled.index)
    resid = stl_result.resid
    if bucket_stats is None:
        bucket_stats = _compute_bucket_stats(resid)

    events = []
    for ts in candidate_idx:
        # Gate 2 (edge trim)
        if head_cut is not None and ts < head_cut:
            continue
        if tail_cut is not None and ts > tail_cut:
            continue

        current = float(util.loc[ts])
        d = float(delta.loc[ts])

        # Gate 3 (landing zone)
        if d > 0:
            if current <= SPIKE_TARGET_MIN:
                continue
        elif d < 0:
            if current > DROP_TARGET_MAX:
                continue
        else:
            continue  # delta == 0 can't happen given abs_delta > 25, defensive

        # Gate 4 (per-bucket novelty)
        r = float(resid.loc[ts]) if ts in resid.index else 0.0
        med, mad = bucket_stats.get(_bucket_key(ts), (0.0, None))
        if mad is not None and mad > 0:
            sigma = mad / 0.6745
            if abs(r - med) < ROC_NOVELTY_SIGMA * sigma:
                continue
            z_mag = abs((r - med) / sigma)
        else:
            # Fallback to the legacy magnitude floor when bucket stats are missing.
            if abs(r) < MIN_RESIDUAL_MAGNITUDE:
                continue
            z_mag = abs(r) / max(MIN_RESIDUAL_MAGNITUDE, 1.0)

        prev = current - d
        pct = float(pct_change.loc[ts]) * 100.0
        expected = _clip_pct(current - r)
        severity = "high" if abs(d) > 2 * SPIKE_ABS_THRESHOLD else "medium"
        direction = "spike" if d > 0 else "drop"
        events.append({
            "time": ts,
            "utilization": current,
            "prev_utilization": prev,
            "delta": d,
            "pct_change": pct,
            "expected": expected,
            "severity": severity,
            "direction": direction,
            "_z_max": float(z_mag),
        })
    return events


def thresholdBreachDetection(df_resampled, threshold=HIGH_UTIL_THRESHOLD):
    """Flag every 10-min sample whose `Utilization` reached `threshold` (90%).

    This is the model-free counterpart to `anomalyDetection`. It exists so the
    Anomalies timeline always carries every absolute-threshold breach, even
    when:

      * the residual detector ignored the sample (low z because the resource
        is *always* near 90 — the bucket median already sits high), and
      * `detect_sustained_high` ignored it because the run was shorter than
        SUSTAINED_MIN_CONSECUTIVE.

    Each surviving sample is emitted as a point-in-time event (start == end ==
    sample timestamp, duration_minutes = 10). The merge step then collapses
    these point events into whatever sustained / residual / ROC event they
    overlap, so a sustained 90% run becomes ONE row with the trigger list
    `["sustained_high", "threshold_breach"]` (plus any others that agreed),
    while an isolated 1-sample 90% spike survives as a standalone row with
    triggers `["threshold_breach"]` and category `threshold_breach`.

    Severity is fixed at `"high"` — by definition this detector only fires
    at or above the operational ceiling.

    Returns a list of canonical anomaly dicts shaped like the other
    detectors so they feed `merge_events_by_overlap` without translation.
    """
    if df_resampled is None or df_resampled.empty:
        return []
    if "Utilization" not in df_resampled.columns:
        return []

    util = df_resampled["Utilization"]
    breaches = util[util >= threshold].dropna()
    if breaches.empty:
        return []

    events = []
    for ts, value in breaches.items():
        v = float(value)
        # Synthetic z so the confidence score still treats threshold breaches
        # as meaningful contributions when this is the only detector that
        # fired. Scales linearly from 1.0 at 90% to ~2.0 at 100%.
        z_synth = 1.0 + max(0.0, (v - threshold) / max(100.0 - threshold, 1.0))
        events.append({
            "category": "threshold_breach",
            "triggers": ["threshold_breach"],
            "start": str(ts),
            "end": str(ts),
            "duration_minutes": 10,
            "utilization": round(v, 2),
            "day": ts.day_name() if hasattr(ts, "day_name") else None,
            "severity": "high",
            "_z_max": float(z_synth),
        })
    return events

# ---------------------------------------------------------------------------
# Unified event merge across all three detectors.
# ---------------------------------------------------------------------------

# Severity ordering used by the merge step.
_SEVERITY_ORDER = {"low": 0, "medium": 1, "high": 2}
_SEVERITY_NAMES = ["low", "medium", "high"]


def _sev_max(*severities):
    """Return the highest severity from the args (defaults to 'medium' if
    no usable values are passed)."""
    levels = [_SEVERITY_ORDER.get(s, 1) for s in severities if s]
    if not levels:
        return "medium"
    return _SEVERITY_NAMES[max(levels)]


def _sev_bump(s):
    """Bump one level up, capped at 'high'."""
    return _SEVERITY_NAMES[min(2, _SEVERITY_ORDER.get(s, 1) + 1)]


# Primary category priority when a merged group spans multiple detectors.
# Lower number wins. Drives UI grouping (the existing pane counts and
# CATEGORY_LABEL chip key off this single field).
_CATEGORY_PRIORITY = {
    "residual_anomaly": 0,
    "rate_of_change_spike": 1,
    "sustained_high": 2,
    "threshold_breach": 3,
}


def _roc_to_standard(ev):
    """Convert a raw ROC event (point-in-time dict with `time`) into the
    canonical anomaly schema used by anomalyDetection / detect_sustained_high.
    This lets all three detector outputs feed merge_events_by_overlap with
    the same shape."""
    return {
        "category": "rate_of_change_spike",
        "triggers": ["rate_of_change_spike"],
        "start": str(ev["time"]),
        "end": str(ev["time"]),
        "duration_minutes": 10,
        "utilization": round(ev["utilization"], 2),
        "expected_utilization": round(ev["expected"], 2),
        "prev_utilization": round(ev["prev_utilization"], 2),
        "delta": round(ev["delta"], 2),
        "pct_change": round(ev["pct_change"], 1),
        "direction": ev["direction"],
        "severity": ev["severity"],
        "_z_max": float(ev.get("_z_max") or 0.0),
    }


def merge_events_by_overlap(residual_events, roc_events, sustained_events, threshold_events=None):
    """Collapse overlapping events from all detectors into one row each.

    Replaces _merge_roc_into_anomalies. Two events overlap if their
    [start, end] windows touch any common timestamp (inclusive). The merged
    event inherits:

        triggers        = union of all constituent triggers (deduped, order
                          preserved)
        category        = primary category by priority
                          (residual_anomaly > rate_of_change_spike >
                           sustained_high > threshold_breach)
        start / end     = min(starts) / max(ends)
        duration_min    = (end - start) in minutes + 10 (one-bin floor)
        utilization     = max observed utilization across constituents
        expected_util   = from residual constituent if present, else ROC, else None
        prev/delta/pct/direction = from the ROC constituent with the largest |delta|
        day             = day-of-week derived from start (in PT wall clock)
        severity        = max(individual severities); bumped one level if
                          two or more *distinct* triggers fire on the same window

    Rationale: today a single bad moment (e.g. a daily batch that just
    breached, was caught by IQR, AND started a sustained-high run) lands as
    three separate anomalies. With this merge it's one row that clearly says
    "this fired all three detectors" — and the severity automatically reflects
    the agreement between detectors. Threshold-breach point events fold into
    whatever sustained / residual / ROC window they overlap, so a sustained
    90% run no longer double-counts.
    """
    # Standardise every event to the canonical schema with parsed timestamps.
    pool = []
    for ev in residual_events or []:
        pool.append({
            **ev,
            "_start": pd.to_datetime(ev["start"]),
            "_end": pd.to_datetime(ev["end"]),
            "_source": "residual",
        })
    for ev in roc_events or []:
        std = _roc_to_standard(ev)
        pool.append({
            **std,
            "_start": pd.Timestamp(ev["time"]),
            "_end": pd.Timestamp(ev["time"]),
            "_source": "roc",
        })
    for ev in sustained_events or []:
        # detect_sustained_high doesn't tag itself today — add the trigger here.
        triggers = list(ev.get("triggers") or [])
        if "sustained_high" not in triggers:
            triggers.append("sustained_high")
        pool.append({
            **ev,
            "triggers": triggers,
            "_start": pd.to_datetime(ev["start"]),
            "_end": pd.to_datetime(ev["end"]),
            "_source": "sustained",
        })
    for ev in threshold_events or []:
        pool.append({
            **ev,
            "_start": pd.to_datetime(ev["start"]),
            "_end": pd.to_datetime(ev["end"]),
            "_source": "threshold",
        })

    if not pool:
        return []

    # Sweep-line grouping: sort by start, group anything whose start <= running max-end.
    pool.sort(key=lambda e: e["_start"])
    groups = []
    current = [pool[0]]
    current_end = pool[0]["_end"]
    for ev in pool[1:]:
        if ev["_start"] <= current_end:
            current.append(ev)
            if ev["_end"] > current_end:
                current_end = ev["_end"]
        else:
            groups.append(current)
            current = [ev]
            current_end = ev["_end"]
    groups.append(current)

    merged = []
    for group in groups:
        # Union of triggers, order-preserving.
        triggers = []
        for ev in group:
            for t in ev.get("triggers") or []:
                if t not in triggers:
                    triggers.append(t)

        # Primary category: highest-priority among present categories.
        cats = [ev.get("category") for ev in group if ev.get("category")]
        primary = (
            min(set(cats), key=lambda c: _CATEGORY_PRIORITY.get(c, 99))
            if cats else None
        )

        start_ts = min(ev["_start"] for ev in group)
        end_ts = max(ev["_end"] for ev in group)
        duration_min = max(10, int((end_ts - start_ts).total_seconds() / 60) + 10)

        utils = [ev.get("utilization") for ev in group if ev.get("utilization") is not None]
        utilization = round(float(max(utils)), 2) if utils else None

        # expected_utilization: prefer residual member (its expected comes from
        # the IQR peak-residual point); fall back to ROC; sustained doesn't have one.
        expected = None
        for ev in group:
            if ev["_source"] == "residual" and ev.get("expected_utilization") is not None:
                expected = ev["expected_utilization"]
                break
        if expected is None:
            for ev in group:
                if ev["_source"] == "roc" and ev.get("expected_utilization") is not None:
                    expected = ev["expected_utilization"]
                    break

        # ROC fields from the constituent with the biggest |delta|.
        prev_util = delta = pct = direction = None
        roc_members = [ev for ev in group if ev["_source"] == "roc"]
        if roc_members:
            peak_roc = max(roc_members, key=lambda e: abs(e.get("delta") or 0))
            prev_util = peak_roc.get("prev_utilization")
            delta = peak_roc.get("delta")
            pct = peak_roc.get("pct_change")
            direction = peak_roc.get("direction")

        # Severity: max of individuals, bumped one level when 2+ triggers
        # agree on the same window. Final business override: any threshold
        # breach (>90 utilization) is always high.
        sev = _sev_max(*[ev.get("severity") for ev in group])
        if len(triggers) >= 2:
            sev = _sev_bump(sev)
        if utilization is not None and utilization > HIGH_UTIL_THRESHOLD:
            sev = "high"

        day_name = start_ts.day_name() if hasattr(start_ts, "day_name") else None

        # Confidence score [0..1]. Combines per-bucket z-magnitude, duration,
        # absolute utilization, and detector consensus. The UI uses this to
        # let users hide low-confidence rows without changing detector tuning.
        z_max = max((float(ev.get("_z_max") or 0.0) for ev in group), default=0.0)
        score = _score_event(z_max, duration_min, utilization, len(triggers))

        merged.append({
            "category": primary,
            "triggers": triggers,
            "start": str(start_ts),
            "end": str(end_ts),
            "duration_minutes": duration_min,
            "utilization": utilization,
            "expected_utilization": expected,
            "prev_utilization": round(float(prev_util), 2) if prev_util is not None else None,
            "delta": round(float(delta), 2) if delta is not None else None,
            "pct_change": round(float(pct), 1) if pct is not None else None,
            "direction": direction,
            "day": day_name,
            "severity": sev,
            "score": score,
        })

    return merged


# Canonical key order for every entry in the Anomalies list. Every emitted
# anomaly is padded to this exact shape (missing fields become None) so
# downstream consumers (UI, API, KQL projections) can rely on a single schema
# regardless of category. See pattern_detection.md for field semantics.

_ANOMALY_KEYS_UTIL = [
    "category",
    "triggers",
    "start",
    "end",
    "duration_minutes",
    "utilization",
    "expected_utilization",
    "prev_utilization",
    "delta",
    "pct_change",
    "direction",
    "day",
    "severity",
    "score",
]


def _normalize_anomaly_util(entry):
    """Pad an anomaly entry with None for any missing canonical key.
    Guarantees a uniform JSON shape across residual_anomaly,
    rate_of_change_spike, and sustained_high categories."""
    return {k: entry.get(k) for k in _ANOMALY_KEYS_UTIL}


def trendAnalysis(stl_result):
    """Trend direction analysis via linear regression on trend component."""
    trend = stl_result.trend
    trend_clean = trend.dropna()
    X = np.arange(len(trend_clean)).reshape(-1, 1)
    y = trend_clean.values
    reg = LinearRegression().fit(X, y)
    slope_per_day = reg.coef_[0] * 144
    current_level = float(trend_clean.iloc[-1])

    if slope_per_day > 0.5:
        direction = "increasing"
    elif slope_per_day < -0.5:
        direction = "decreasing"
    else:
        direction = "stable"

    days_to_90 = None
    if direction == "increasing" and slope_per_day > 0 and current_level < 90:
        days_to_90 = round((90 - current_level) / slope_per_day, 1)

    return {
        "direction": direction,
        "slope_per_day": round(float(slope_per_day), 4),
        "current_trend_level": round(current_level, 2),
        "r_squared": round(float(reg.score(X, y)), 4),
        "estimated_days_to_90pct": days_to_90
    }


def compute_baseline(stl_result, df_resampled):
    """Compute baseline JSON for realtime anomaly extractor."""
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

    signal_std = float(df_resampled['Utilization'].std())
    Q1 = float(resid.quantile(0.25))
    Q3 = float(resid.quantile(0.75))
    raw_iqr = Q3 - Q1
    IQR = max(raw_iqr, max(MIN_IQR, signal_std * MIN_IQR_RELATIVE))

    cv = float(resid.std() / (abs(resid.mean()) + 1e-6))
    if cv < 0.1:
        multiplier = 3.0
    elif cv > 0.3:
        multiplier = 1.5
    else:
        multiplier = 2.0

    return {
        "seasonal_profile": seasonal_profile,
        "trend_slope": round(float(reg.coef_[0]), 6),
        "trend_last_value": round(float(trend_clean.iloc[-1]), 4),
        "trend_last_time": str(trend_clean.index[-1]),
        "lower_bound": round(Q1 - multiplier * IQR, 4),
        "upper_bound": round(Q3 + multiplier * IQR, 4),
        "residual_IQR": round(IQR, 4),
    }


# --- Orchestrator ---
def analyze_server_metric(name, df, metric_type, include_trend=False):
    """Run full analysis for one server/metric. Returns findings dict or None."""
    df_r, stl_result = decompose_stl(df)

    # Seasonal patterns + sustained periods
    df_weekly, sustained = seasonalityidentification(name, stl_result, df_r.copy())

    # Pattern details
    _, pattern_data = build_summary(df_weekly, name, metric_type, sustained)

    # Utilization range (histogram + peak only — the right-sizing suggestion
    # is now generated on the frontend, see PatternInsightsPane.jsx)
    util_range = utilizationRange(df_r)

    # Absolute-threshold pattern details — same schema as PatternDetails but
    # populated from raw MaxUtilization >= 90% (no seasonal/MSTL filtering).
    # Lets the UI weekly grid stay informative for always-busy resources where
    # the relative (seasonal) PatternDetails comes back empty.
    pattern_data_utilization = utilizationThresholdDetails(df_r, threshold=HIGH_UTIL_THRESHOLD)

    # Anomalies — three independent detectors feed a single overlap-based
    # merge. Any datapoint window that fires multiple detectors becomes ONE
    # row whose `triggers` lists every detector that agreed. Severity is the
    # max of constituent severities and is bumped one level when 2+ triggers
    # fire (so consensus across detectors automatically promotes severity).
    bucket_stats = _compute_bucket_stats(stl_result.resid)
    residual_data = anomalyDetection(stl_result, df_r, bucket_stats=bucket_stats)
    roc_data = rateOfChangeDetection(stl_result, df_r, bucket_stats=bucket_stats)
    threshold_data = thresholdBreachDetection(df_r, threshold=HIGH_UTIL_THRESHOLD)
    merged_anomalies = merge_events_by_overlap(residual_data, roc_data, sustained, threshold_data)
    merged_anomalies.sort(key=lambda e: e.get("start") or "")
    # Pad every entry to the canonical schema so all categories share one shape.
    merged_anomalies = [_normalize_anomaly_util(e) for e in merged_anomalies]

    # Trend analysis (Disk only)
    trend_data = trendAnalysis(stl_result) if include_trend else None

    # Baseline for realtime extractor
    baseline = compute_baseline(stl_result, df_r)

    return {
        "PatternDetails": pattern_data,
        "PatternDetailsUtilization": pattern_data_utilization,
        "UtilizationRange": util_range,
        "Anomalies": merged_anomalies,
        "TrendAnalysis": trend_data,
        "BaselineJSON": baseline,
    }


# --- Bulk fetch helpers ---
# All servers are pulled in ONE ADX query per metric instead of one query
# per (server, metric). This collapses ~1800 round-trips (600 servers × 3
# metrics) down to 3, eliminating per-call connect/auth/plan overhead.
# `has_any` with 'ServerName/<n>' tokens is used to preserve the exact
# match semantics of the original per-server `has 'ServerName/{name}'`
# filter (consistent with daily_pattern_extractor_network.py).

def _bulk_fetch_cpu_mem(server_names, obj_name, counter_name, start_str, end_str):
    """Fetch one CPU/Memory counter for ALL servers in a single ADX query.

    Returns: dict {server_name: DataFrame indexed by TimeGenerated with
             columns Utilization, MaxUtilization}. Servers with no data are
             absent from the dict.
    """
    if not server_names:
        return {}
    server_tokens = ", ".join(f"'{n}'" for n in server_names)
    query = f"""
    {ADX_SOURCE_TABLE}
    | where TimeGenerated >= datetime('{start_str}') and TimeGenerated <= datetime('{end_str}')
    | where ObjectName == '{obj_name}' and CounterName == '{counter_name}'
    | where ResourceId has_any ({server_tokens})
    | extend ServerName = tostring(split(extract(@'(?:^|/)ServerName/([^/]+)', 1, ResourceId), '_')[0])
    | project TimeGenerated, ServerName, AvgValue, MaxValue
    | order by ServerName asc, TimeGenerated asc
    """
    df_all = readFromADX(query)
    if df_all.empty:
        return {}
    df_all["TimeGenerated"] = pd.to_datetime(df_all["TimeGenerated"])
    df_all.rename(columns={"AvgValue": "Utilization", "MaxValue": "MaxUtilization"}, inplace=True)

    result = {}
    for name, g in df_all.groupby("ServerName", sort=False):
        g = g.drop(columns=["ServerName"]).drop_duplicates(subset=["TimeGenerated"])
        g.set_index("TimeGenerated", inplace=True)
        result[name] = g
    return result


def _bulk_fetch_disk(server_names, start_str, end_str):
    """Fetch Disk % Free Space for ALL servers and drives (C:, D:) in one query.

    Returns: dict {server_name: {drive: DataFrame}}.
    """
    if not server_names:
        return {}
    server_tokens = ", ".join(f"'ServerName/{n}'" for n in server_names)
    query = f"""
    {ADX_SOURCE_TABLE}
    | where TimeGenerated >= datetime('{start_str}') and TimeGenerated <= datetime('{end_str}')
    | where ObjectName == 'LogicalDisk' and CounterName == '% Free Space'
    | where trim(' ', DriveName) in ('C:', 'D:')
    | where ResourceId has_any ({server_tokens})
    | extend ServerName = tostring(split(extract(@'(?:^|/)ServerName/([^/]+)', 1, ResourceId), '_')[0])
    | project TimeGenerated, ServerName, DriveName, AvgValue = 100 - AvgValue, MaxValue = 100 - MinValue
    | order by ServerName asc, DriveName asc, TimeGenerated asc
    """
    df_all = readFromADX(query)
    if df_all.empty:
        return {}
    df_all["TimeGenerated"] = pd.to_datetime(df_all["TimeGenerated"])
    df_all["DriveName"] = df_all["DriveName"].str.strip()
    df_all.rename(columns={"AvgValue": "Utilization", "MaxValue": "MaxUtilization"}, inplace=True)

    result = {}
    for (name, drive), g in df_all.groupby(["ServerName", "DriveName"], sort=False):
        g = g.drop(columns=["ServerName", "DriveName"]).drop_duplicates(subset=["TimeGenerated"])
        g.set_index("TimeGenerated", inplace=True)
        result.setdefault(name, {})[drive] = g
    return result


# --- Main ---
def run():
    servers = get_server_list()
    run_date = datetime.now(timezone.utc)
    end_date = run_date
    start_date = end_date - timedelta(days=ANALYSIS_DAYS)
    start_str = start_date.strftime('%Y-%m-%d %H:%M:%S')
    end_str = end_date.strftime('%Y-%m-%d %H:%M:%S')

    print(f"Daily Pattern Extractor — {run_date.strftime('%Y-%m-%d %H:%M')} UTC")
    print(f"Analysis window: {start_str} → {end_str} ({ANALYSIS_DAYS} days)")
    print(f"Servers: {len(servers)}")
    print()

    server_names = [s[0] for s in servers]
    analytics_rows = []

    # --- CPU & Memory (no trend analysis) ---
    metrics = [
        ("Processor", "% Processor Time", "CPU"),
        ("Memory", "% Committed Bytes In Use", "Memory"),
    ]

    for obj_name, counter_name, metric_label in metrics:
        print(f"\nBulk-fetching {metric_label} for {len(server_names)} servers...")
        try:
            data_by_server = _bulk_fetch_cpu_mem(server_names, obj_name, counter_name, start_str, end_str)
        except Exception as ex:
            print(f"  {metric_label}: BULK FETCH FAILED — {ex}")
            continue
        print(f"  {metric_label}: got data for {len(data_by_server)} servers")

        for name in server_names:
            df = data_by_server.get(name)
            if df is None or df.empty:
                continue
            try:
                findings = analyze_server_metric(name, df, metric_label, include_trend=False)
                if findings:
                    analytics_rows.append({
                        "TimeGenerated": run_date,
                        "ResourceId": name,
                        "ObjectName": "PatternSummary",
                        "CounterName": metric_label,
                        "Data": json.dumps(findings, default=str),
                    })
                    cats = [a.get('category') for a in findings['Anomalies']]
                    sustained_count = cats.count('sustained_high')
                    roc_count = cats.count('rate_of_change_spike')
                    residual_count = cats.count('residual_anomaly')
                    print(f"  {name}/{metric_label}: residual={residual_count}, "
                          f"roc={roc_count}, sustained={sustained_count}")
            except ValueError as ve:
                print(f"  {name}/{metric_label}: skipped ({ve})")
            except Exception as ex:
                print(f"  {name}/{metric_label}: ERROR — {ex}")

    # --- Disk (with trend analysis, per-drive) ---
    print(f"\nBulk-fetching Disk (C:, D:) for {len(server_names)} servers...")
    try:
        disk_by_server = _bulk_fetch_disk(server_names, start_str, end_str)
    except Exception as ex:
        print(f"  Disk: BULK FETCH FAILED — {ex}")
        disk_by_server = {}
    print(f"  Disk: got data for {len(disk_by_server)} servers")

    for name in server_names:
        drives_data = disk_by_server.get(name)
        if not drives_data:
            continue
        for drive, drive_df in drives_data.items():
            if drive_df.empty:
                continue
            metric_label = f"Disk {drive}"
            try:
                findings = analyze_server_metric(name, drive_df, metric_label, include_trend=True)
                if findings:
                    analytics_rows.append({
                        "TimeGenerated": run_date,
                        "ResourceId": name,
                        "ObjectName": "PatternSummary",
                        "CounterName": metric_label,
                        "Data": json.dumps(findings, default=str),
                    })
                    td = findings["TrendAnalysis"]
                    cats = [a.get('category') for a in findings['Anomalies']]
                    sustained_count = cats.count('sustained_high')
                    roc_count = cats.count('rate_of_change_spike')
                    residual_count = cats.count('residual_anomaly')
                    print(f"  {name}/{metric_label}: trend={td['direction']}, "
                          f"residual={residual_count}, roc={roc_count}, "
                          f"sustained={sustained_count}")
            except ValueError as ve:
                print(f"  {name}/{metric_label}: skipped ({ve})")
            except Exception as ex:
                print(f"  {name}/{metric_label}: ERROR — {ex}")

    # --- Ingest ---
    if analytics_rows:
        print(f"\nIngesting {len(analytics_rows)} rows to ADX...")
        client = get_ingest_client()
        ingest_to_adx(client, pd.DataFrame(analytics_rows))

    print(f"\nDone: {len(analytics_rows)} pattern summaries ingested")


if __name__ == "__main__":
    run()
