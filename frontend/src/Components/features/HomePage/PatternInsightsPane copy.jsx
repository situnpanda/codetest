import React, { useEffect, useMemo, useState } from 'react';
import {
    Drawer, Box, Typography, IconButton, Chip, Stack,
    CircularProgress, Alert, Autocomplete, TextField, Tooltip, Paper
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
    Tooltip as RTooltip, ResponsiveContainer,
    ComposedChart, Line, Scatter
} from 'recharts';
import dayjs from 'dayjs';
import dayjsUtc from 'dayjs/plugin/utc';
import dayjsTimezone from 'dayjs/plugin/timezone';
import { fetchPatternAnalysis_fromADX } from '../../shared/APIs/fetchAPIs';

dayjs.extend(dayjsUtc);
dayjs.extend(dayjsTimezone);
// ── Visual constants (aligned with the existing dashboard standards) ──────────
const NAVY = '#00338E';
const BORDER = '#E6E8EE';
const TEXT = '#111827';
const MUTED = '#6B7280';

const SEVERITY = {
    high: { color: '#DC2626', bg: '#FEECEC', label: 'High' },
    medium: { color: '#D97706', bg: '#FEF3E2', label: 'Medium' },
    low: { color: '#6B7280', bg: '#F3F4F6', label: 'Low' },
};

const STACK = {
    morning: '#B3C7F5',
    business: '#7FA1E8',
    overnight: '#4B79D6',
};

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// The daily extractors look back a fixed 30-day window
// (ANALYSIS_DAYS = 30 in daily_pattern_extractor_*.py).
const ANALYSIS_WINDOW_DAYS = 30;

// Anomalies below this confidence score are hidden by default. Mirrors
// LOW_CONFIDENCE_SCORE in daily_pattern_extractor_utilization.py — keep in sync.
const LOW_CONFIDENCE_SCORE = 0.4;

const fmt = (v, d = 1) =>
    (v === null || v === undefined || Number.isNaN(Number(v))) ? '—' : Number(v).toFixed(d);

// All timestamps in this pane are displayed in Pacific Time.
// The backend (both the daily extractor and the utilization API endpoints)
// emits every timestamp as PT wall clock ("YYYY-MM-DD HH:mm:ss") — no offset,
// already converted server-side. The frontend performs NO timezone shift;
// it parses the incoming string directly in PT so what you see in the UI
// matches the string character-for-character.
const TZ = 'America/Los_Angeles';
const dPT = (s) => {
    if (s == null) return null;
    // Backend emits "YYYY-MM-DD HH:mm:ss" (space form). Normalize to ISO
    // then anchor the interpretation to PT — no offset shifting.
    const d = dayjs.tz(String(s).replace(' ', 'T'), TZ);
    return d.isValid() ? d : null;
};
const dUtc = dPT;
const safeFormat = (s, fmtStr) => {
    const d = dPT(s);
    return d ? d.format(fmtStr) : '—';
};
const safeFormatUtc = safeFormat;

const titleForMetric = (domain, metric) => {
    if (domain === 'network') return 'Network Packet Patterns';
    const map = { CPU: 'CPU Utilization Patterns', Memory: 'Memory Utilization Patterns', Disk: 'Disk Utilization Patterns' };
    return map[metric] || 'Seasonal Patterns';
};

const INFO_TOOLTIP =
    'Pattern Analysis reviews the last 30 days of telemetry once a day and surfaces seasonal habits ' +
    '(when this resource typically gets busy), anomalies that broke the pattern (outliers, sudden ' +
    'spikes, sustained-high stretches), and the overall trend direction so you can spot growth ' +
    'before it becomes a capacity event.';

const CATEGORY_LABEL = {
    residual_anomaly: 'Outlier',
    rate_of_change_spike: 'Sudden Spike / Drop',
    sustained_high: 'Sustained High',
    threshold_breach: 'Threshold Breach',
};

// ── Defensive anomaly accessors ───────────────────────────────────────────────
// The live daily extractor emits per-category shapes (single-point uses `time`;
// multi-point uses `start`/`end`/`duration_minutes` and `max_*`/`avg_*` peaks).
// The pane reads through these helpers so it stays correct even if a future
// extractor release normalises the schema.
const startOf = (a) => a && (a.start || a.time);
const endOf = (a) => a && (a.end || a.time);
const durationOf = (a) => {
    if (!a) return null;
    if (a.duration_minutes != null) return a.duration_minutes;
    const s = dPT(a.start), e = dPT(a.end);
    if (s && e && s.isValid() && e.isValid()) return Math.max(10, e.diff(s, 'minute') + 10);
    return 10; // single-point events are 10-min bins
};
const peakOf = (domain, a) => {
    if (!a) return null;
    if (domain === 'network') return a.value ?? a.max_value ?? a.avg_value;
    return a.utilization ?? a.max_utilization ?? a.avg_utilization;
};
const expectedOf = (domain, a) => {
    if (!a) return null;
    if (domain === 'network') return a.expected_value ?? a.peak_expected_value ?? a.avg_expected_value;
    return a.expected_utilization ?? a.peak_expected_utilization ?? a.avg_expected_utilization;
};
const prevOf = (domain, a) => {
    if (!a) return null;
    return domain === 'network' ? a.prev_value : a.prev_utilization;
};

// ── Plain-English tooltip copy (kept centralised so the wording stays consistent) ─
const TIP = {
    outliers:
        'Moments when usage was unusually high compared to what we normally expect at that hour and weekday.',
    suddenSpikes:
        'A sharp, short change in usage — a sudden step up (spike) or step down (drop) that did not gradually build.',
    sustainedHigh:
        'A long stretch (an hour or more) where usage stayed elevated instead of returning to its usual level.',
    thresholdBreach:
        'A sample where utilization crossed the absolute 90 % line, regardless of whether that was unusual for the resource. Always-busy workloads will see this count rise even when no seasonal pattern was broken.',
    highSeverity:
        'These anomalies are well above the expected range — most likely to need attention.',
    mediumSeverity:
        'These anomalies are somewhat above the expected range — worth a look but not urgent.',
    peakObserved:
        'The highest 10-minute average utilization recorded for this resource over the last 30 days.',
    trendIncreasing:
        'Usage is gradually climbing over the last 30 days. Watch for capacity issues if the trend continues.',
    trendDecreasing:
        'Usage is gradually falling over the last 30 days — the resource is being used less than before.',
    trendStable:
        'Usage is roughly flat — no meaningful upward or downward drift over the last 30 days.',
    resourceSelector:
        'Pick which resource and counter (CPU, Memory or a specific disk drive) to view pattern insights for.',
    slopePerDay:
        'Average change in utilization per day, based on the trend line. Positive numbers mean usage is growing; negative numbers mean it is shrinking.',
    currentLevel:
        'Where the trend line sits today. This is the smoothed value from the trend fit, not the latest raw data point.',
    fitR2:
        'How tightly the trend line follows the actual data, from 0 to 1. Higher means we are more confident in the direction the trend is reporting.',
    daysTo90:
        'If the current upward trend keeps going at the same pace, an estimate of how many days until average utilization reaches 90%.',
    rightSizing:
        'Right-sizing suggests adjusting the resource so capacity matches typical usage — saving cost when over-provisioned, or reducing risk when under-provisioned.',
    breachesByDay:
        'Each bar shows how many seasonal-pattern breaches happened on that weekday, split by time of day (morning, business hours, overnight).',
    thresholdBreachesByDay:
        'Each bar shows how many 10-minute samples crossed the absolute 90 % utilization line on that weekday, split by time of day (morning, business hours, overnight). Unlike the seasonal view above, this is a flat threshold check — always-busy resources will rack up bars even when their seasonal pattern was never broken.',
};

// ── Small presentational helpers ─────────────────────────────────────────────
function StatCard({ label, value, sub, accent = NAVY, hint }) {
    const card = (
        <Box sx={{ flex: 1, minWidth: 0, border: `1px solid ${BORDER}`, borderRadius: 2, px: 1.25, py: 1, bgcolor: '#FFFFFF', cursor: hint ? 'help' : 'default' }}>
            <Typography sx={{ fontSize: 20, fontWeight: 800, color: accent, lineHeight: 1.1 }}>{value}</Typography>
            <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: TEXT, mt: 0.25 }}>{label}</Typography>
            {sub != null && <Typography sx={{ fontSize: 9.5, color: MUTED }}>{sub}</Typography>}
        </Box>
    );
    return hint ? <Tooltip title={hint} arrow placement="top">{card}</Tooltip> : card;
}

function SectionTitle({ children, hint }) {
    return (
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 2.5, mb: 1 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 800, color: TEXT }}>{children}</Typography>
            {hint && (
                <Tooltip title={hint} arrow placement="top">
                    <InfoOutlinedIcon sx={{ fontSize: 13, color: MUTED, cursor: 'help' }} />
                </Tooltip>
            )}
        </Stack>
    );
}

// Shared empty-state block for pattern-insight visuals. Matches the visual
// language of the anomaly-timeline empty state so every "nothing to show"
// message looks identical across the pane.
function EmptyState({ title, subtitle }) {
    return (
        <Box sx={{ border: `1px dashed ${BORDER}`, borderRadius: 2, py: 3, textAlign: 'center' }}>
            <Typography sx={{ fontSize: 12, color: '#2E7D32', fontWeight: 700 }}>{title}</Typography>
            {subtitle && (
                <Typography sx={{ fontSize: 10.5, color: MUTED }}>{subtitle}</Typography>
            )}
        </Box>
    );
}

function TrendBadge({ trend }) {
    if (!trend || !trend.direction) return null;
    const dir = trend.direction;
    const cfg = dir === 'increasing'
        ? { Icon: TrendingUpIcon, color: '#D97706', text: 'Increasing', hint: TIP.trendIncreasing }
        : dir === 'decreasing'
            ? { Icon: TrendingDownIcon, color: '#2E7D32', text: 'Decreasing', hint: TIP.trendDecreasing }
            : { Icon: TrendingFlatIcon, color: MUTED, text: 'Stable', hint: TIP.trendStable };
    const { Icon } = cfg;
    return (
        <Tooltip title={cfg.hint} arrow placement="top">
            <Chip
                size="small"
                icon={<Icon sx={{ fontSize: 15, color: `${cfg.color} !important` }} />}
                label={cfg.text}
                sx={{ height: 22, fontSize: 10.5, fontWeight: 700, color: cfg.color, bgcolor: `${cfg.color}14`, cursor: 'help', '& .MuiChip-label': { px: 0.75 } }}
            />
        </Tooltip>
    );
}

// ── Weekly breach summary card (per-day, Chatbot-style) ───────────────────────
function WeeklyDayCard({ day, daysSeen, daysTotal, morning, business, overnight, isPeak }) {
    const total = morning + business + overnight;
    const cardBg = isPeak ? '#FEE2E2' : '#FFFFFF';
    const cardBorder = isPeak ? '#FCA5A5' : BORDER;
    const chipFor = (n, kind) => {
        const zero = n === 0;
        const palette = kind === 'business'
            ? { bg: '#FDEAEA', color: '#C53030' }
            : { bg: '#FFF7E0', color: '#975A16' };
        return {
            bgcolor: zero ? '#E6F4EA' : palette.bg,
            color: zero ? '#166534' : palette.color,
        };
    };
    return (
        <Paper variant="outlined" sx={{ p: 1, borderRadius: 1.5, bgcolor: cardBg, borderColor: cardBorder }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                    <Typography sx={{ fontSize: 11, fontWeight: 800, color: TEXT }}>
                        {daysSeen != null && daysTotal != null ? `${daysSeen}/${daysTotal} ${day}s` : day}
                    </Typography>
                    {isPeak && (
                        <Chip size="small" label="Peak" sx={{ height: 15, fontSize: 8.5, fontWeight: 700, color: '#C53030', bgcolor: '#FEE2E2', '& .MuiChip-label': { px: 0.5 } }} />
                    )}
                </Stack>
                <Typography sx={{ fontSize: 12, fontWeight: 800, color: TEXT }}>{total}</Typography>
            </Stack>
            <Stack spacing={0.4}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography sx={{ fontSize: 10, color: MUTED }}>Morning (6–10am)</Typography>
                    <Chip size="small" label={morning} sx={{ height: 16, fontSize: 9, fontWeight: 700, '& .MuiChip-label': { px: 0.5 }, ...chipFor(morning, 'amber') }} />
                </Stack>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography sx={{ fontSize: 10, color: MUTED }}>Business (10am–6pm)</Typography>
                    <Chip size="small" label={business} sx={{ height: 16, fontSize: 9, fontWeight: 700, '& .MuiChip-label': { px: 0.5 }, ...chipFor(business, 'business') }} />
                </Stack>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography sx={{ fontSize: 10, color: MUTED }}>Overnight (6pm–6am)</Typography>
                    <Chip size="small" label={overnight} sx={{ height: 16, fontSize: 9, fontWeight: 700, '& .MuiChip-label': { px: 0.5 }, ...chipFor(overnight, 'amber') }} />
                </Stack>
            </Stack>
        </Paper>
    );
}

// ── Anomaly row ───────────────────────────────────────────────────────────────
function AnomalyRow({ domain, a }) {
    const sev = SEVERITY[a.severity] || SEVERITY.low;
    const peak = peakOf(domain, a);
    const expected = expectedOf(domain, a);
    const prev = prevOf(domain, a);
    const start = startOf(a);
    const end = endOf(a);
    const duration = durationOf(a);
    const isPoint = !start || !end || start === end;
    const triggers = a.triggers || [];

    const startLabel = safeFormat(start, 'MMM D, YYYY HH:mm');
    const endLabel = safeFormat(end, 'HH:mm');
    const sDay = dPT(start);
    const eDay = dPT(end);
    const sameDay = sDay && eDay && sDay.format('YYYY-MM-DD') === eDay.format('YYYY-MM-DD');

    return (
        <Box sx={{ display: 'flex', borderRadius: 1.5, border: `1px solid ${BORDER}`, overflow: 'hidden', mb: 1 }}>
            <Box sx={{ width: 4, bgcolor: sev.color, flexShrink: 0 }} />
            <Box sx={{ flex: 1, minWidth: 0, p: 1 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                    <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: TEXT, whiteSpace: 'nowrap' }}>
                            {CATEGORY_LABEL[a.category] || a.category}
                        </Typography>
                        <Chip size="small" label={sev.label} sx={{ height: 17, fontSize: 9, fontWeight: 700, color: sev.color, bgcolor: sev.bg, '& .MuiChip-label': { px: 0.6 } }} />
                        {a.score != null && (
                            <Tooltip title={`Confidence ${Number(a.score).toFixed(2)} — blends per-bucket z-magnitude, duration, utilization and detector consensus. ${Number(a.score) < 0.4 ? 'Low-confidence row; consider deprioritising.' : ''}`} arrow placement="top">
                                <Chip
                                    size="small"
                                    label={`conf ${Number(a.score).toFixed(2)}`}
                                    sx={{
                                        height: 17, fontSize: 9, fontWeight: 700,
                                        color: Number(a.score) >= 0.6 ? '#166534' : Number(a.score) >= 0.4 ? '#975A16' : MUTED,
                                        bgcolor: Number(a.score) >= 0.6 ? '#DCFCE7' : Number(a.score) >= 0.4 ? '#FEF3E2' : '#F3F4F6',
                                        cursor: 'help',
                                        '& .MuiChip-label': { px: 0.6 },
                                    }}
                                />
                            </Tooltip>
                        )}
                    </Stack>
                    <Typography sx={{ fontSize: 17, fontWeight: 800, color: sev.color, whiteSpace: 'nowrap' }}>
                        {fmt(peak)}{domain === 'network' ? '' : '%'}
                    </Typography>
                </Stack>

                <Typography sx={{ fontSize: 10, color: MUTED, mt: 0.25 }}>
                    {isPoint
                        ? startLabel
                        : (sameDay ? `${startLabel} – ${endLabel}` : `${startLabel} → ${safeFormat(end, 'MMM D, YYYY HH:mm')}`)}
                    {' PT'}
                    {duration != null ? `  ·  ${duration} min` : ''}
                    {a.day ? `  ·  ${a.day}` : ''}
                </Typography>

                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                    {expected != null && (
                        <Chip size="small" variant="outlined" label={`expected ${fmt(expected)}${domain === 'network' ? '' : '%'}`}
                            sx={{ height: 18, fontSize: 9, borderColor: BORDER, color: MUTED, '& .MuiChip-label': { px: 0.6 } }} />
                    )}
                    {a.delta != null && (
                        <Chip size="small" variant="outlined" label={`Δ ${fmt(a.delta)}${a.pct_change != null ? ` (${fmt(a.pct_change, 0)}%)` : ''}`}
                            sx={{ height: 18, fontSize: 9, borderColor: BORDER, color: TEXT, '& .MuiChip-label': { px: 0.6 } }} />
                    )}
                    {prev != null && (
                        <Chip size="small" variant="outlined" label={`from ${fmt(prev)}`}
                            sx={{ height: 18, fontSize: 9, borderColor: BORDER, color: MUTED, '& .MuiChip-label': { px: 0.6 } }} />
                    )}
                    {triggers.map((t) => (
                        <Chip key={t} size="small" label={t.replace(/_/g, ' ')}
                            sx={{ height: 18, fontSize: 9, fontWeight: 600, color: NAVY, bgcolor: '#EEF3FC', '& .MuiChip-label': { px: 0.6 } }} />
                    ))}
                </Stack>
            </Box>
        </Box>
    );
}

// Count how many times each weekday occurred in the [runDate-30d, runDate] window.
function weekdayCountsInWindow(runDay) {
    const counts = { Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0, Sunday: 0 };
    if (!runDay || !runDay.isValid()) return counts;
    let cursor = runDay.subtract(ANALYSIS_WINDOW_DAYS - 1, 'day');
    for (let i = 0; i < ANALYSIS_WINDOW_DAYS; i += 1) {
        const name = cursor.format('dddd');
        counts[name] = (counts[name] || 0) + 1;
        cursor = cursor.add(1, 'day');
    }
    return counts;
}

// Build the per-weekday breach rows used by both the seasonal
// (PatternDetails) and absolute-threshold (PatternDetailsUtilization)
// weekly summary cards. Both backend fields use the same schema so a single
// builder keeps the two views in lock-step — if the extractor changes how it
// groups morning/business/overnight, this helper is the only place that needs
// to know about it.
function buildWeeklySummary(patternDetails, runMoment) {
    const pd = patternDetails || {};
    const weekdayCounts = weekdayCountsInWindow(runMoment);
    const rows = WEEKDAYS.map((day) => {
        const dayData = pd[day];
        const morning = dayData ? (dayData['Non Business Hours - Morning'] || []).length : 0;
        const business = dayData ? (dayData['Business Hours'] || []).length : 0;
        // Prefer the current schema key ('Non Business Hours - Overnight'); fall
        // back to the pre-DST-fix name ('Non Business Hours - Evening') so
        // historical ADX rows keep rendering during the rollover.
        const overnight = dayData
            ? (
                (dayData['Non Business Hours - Overnight']
                    || dayData['Non Business Hours - Evening']
                    || []).length
            )
            : 0;
        const occurences = (pd.Occurences && pd.Occurences[day]) || [];
        return {
            day,
            morning,
            business,
            overnight,
            total: morning + business + overnight,
            daysSeen: occurences.length || (dayData ? 1 : 0),
            daysTotal: weekdayCounts[day] || null,
        };
    });
    const peak = rows.reduce((m, r) => (r.total > (m?.total || 0) ? r : m), null);
    return rows.map((r) => ({ ...r, isPeak: peak && peak.total > 0 ? r.day === peak.day : false }));
}

// ── Main component ────────────────────────────────────────────────────────────
const PatternInsightsPane = ({ open, onClose, domain = 'utilization', metric, servers = [], fetchUtilization = null }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [records, setRecords] = useState([]);
    const [selectedIdx, setSelectedIdx] = useState(0);
    // Pane-owned utilization time series cache, keyed by metric. Fetched
    // independently of the parent page so the chart always reflects the full
    // 30-day analysis window, not whatever short range the parent page may be
    // showing in its server-status time filter.
    const [paneUtil, setPaneUtil] = useState({});
    const [paneUtilLoading, setPaneUtilLoading] = useState(false);
    // Severity filter for the anomaly timeline. 'all' shows everything; the
    // other values restrict the list to a single severity bucket. Default is
    // 'high' so the chart and list both focus on what the operator most
    // likely needs to act on; the chip row lets the user widen the view.
    const [severityFilter, setSeverityFilter] = useState('high');
    // Hide low-confidence anomalies (score < LOW_CONFIDENCE_SCORE). On by
    // default so the timeline mirrors the human reviewer's intuition; toggle
    // off to inspect everything the detectors caught.
    const [hideLowConfidence, setHideLowConfidence] = useState(true);

    const serversKey = useMemo(() => (servers || []).slice().sort().join('|'), [servers]);

    useEffect(() => {
        if (!open) return;
        const serverList = (servers || []).filter(Boolean);
        if (serverList.length === 0) {
            setRecords([]);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                setError('');
                const res = await fetchPatternAnalysis_fromADX({ domain, metric, servers: serverList });
                if (cancelled) return;
                const list = Array.isArray(res) ? res.filter((r) => r && r.Data) : [];
                setRecords(list);
                setSelectedIdx(0);
            } catch (err) {
                if (!cancelled) {
                    setError('Unable to load pattern insights.');
                    setRecords([]);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, domain, metric, serversKey]);

    const optionLabel = (r) => {
        if (domain === 'network') {
            const counter = r.CounterName === 'PacketsSent' ? 'Sent' : r.CounterName === 'PacketsReceived' ? 'Received' : r.CounterName;
            return `${r.ServerName || r.ResourceId} · ${counter}`;
        }
        return `${r.ResourceId} · ${r.CounterName}`;
    };

    const selected = records[selectedIdx];
    const data = selected ? selected.Data : null;
    const anomalies = useMemo(() => (data && Array.isArray(data.Anomalies) ? data.Anomalies : []), [data]);

    // Analysis-window labels. selected.TimeGenerated is UTC from ADX; we
    // convert to PT so the displayed analyzed-on date matches the rest of the
    // pane (everything else is PT).
    const runMoment = useMemo(() => {
        if (!selected) return null;
        const d = dUtc(selected.TimeGenerated);
        return d ? d.tz(TZ) : null;
    }, [selected]);
    const windowLabel = useMemo(() => {
        if (!runMoment || !runMoment.isValid()) return `Last ${ANALYSIS_WINDOW_DAYS} days`;
        const end = runMoment;
        const start = end.subtract(ANALYSIS_WINDOW_DAYS - 1, 'day');
        return `${start.format('MMM D')} – ${end.format('MMM D, YYYY')}`;
    }, [runMoment]);

    const counts = useMemo(() => {
        const c = { residual: 0, roc: 0, sustained: 0, threshold: 0, high: 0, medium: 0, low: 0 };
        anomalies.forEach((a) => {
            if (a.category === 'residual_anomaly') c.residual += 1;
            else if (a.category === 'rate_of_change_spike') c.roc += 1;
            else if (a.category === 'sustained_high') c.sustained += 1;
            else if (a.category === 'threshold_breach') c.threshold += 1;
            if (a.severity === 'high') c.high += 1;
            else if (a.severity === 'medium') c.medium += 1;
            else if (a.severity === 'low') c.low += 1;
        });
        return c;
    }, [anomalies]);

    // Weekly breach summary derived from PatternDetails. Always returns all 7
    // weekdays (Mon..Sun); when the extractor produced no PatternDetails (e.g.
    // a brand-new resource or one with no seasonal anomalies in the window) the
    // rows are still emitted with zero counts so the pane shows the full weekly
    // grid plus a "no breaches observed" note rather than collapsing the
    // section entirely.
    const weeklySummary = useMemo(
        () => buildWeeklySummary(data && data.PatternDetails, runMoment),
        [data, runMoment]
    );

    // Weekly utilization breach summary derived from PatternDetailsUtilization.
    // Same shape as `weeklySummary` (and rendered with the same WeeklyDayCard
    // grid), but the underlying data is the *absolute* 90 %+ breaches the
    // extractor emits via `utilizationThresholdDetails` — no seasonal/MSTL
    // filtering, just a hard threshold. This lets always-busy resources whose
    // seasonal grid stays empty still show a meaningful weekday distribution.
    const weeklyUtilizationSummary = useMemo(
        () => buildWeeklySummary(data && data.PatternDetailsUtilization, runMoment),
        [data, runMoment]
    );

    // Stacked-bar data — only include days that actually had breaches so the
    // chart focuses on signal, not empty bars.
    const breachData = useMemo(
        () => weeklySummary
            .filter((r) => r.total > 0)
            .map((r) => ({ day: r.day.slice(0, 3), morning: r.morning, business: r.business, overnight: r.overnight })),
        [weeklySummary]
    );

    // Parallel stacked-bar data for absolute 90 %+ threshold breaches. Same
    // shape and reducer as `breachData`, but sourced from the utilization
    // weekday summary so always-busy workloads still get a meaningful weekday
    // distribution even when their seasonal grid stays empty.
    const thresholdBreachData = useMemo(
        () => weeklyUtilizationSummary
            .filter((r) => r.total > 0)
            .map((r) => ({ day: r.day.slice(0, 3), morning: r.morning, business: r.business, overnight: r.overnight })),
        [weeklyUtilizationSummary]
    );

    const rangeData = useMemo(() => {
        const ur = data && data.UtilizationRange;
        if (!ur) return [];
        return [['50_60', '50–60'], ['60_70', '60–70'], ['70_80', '70–80'], ['80_90', '80–90'], ['90_100', '90–100']]
            .map(([k, label]) => ({ band: label, count: ur[k] || 0 }));
    }, [data]);

    // ── Utilization time series + anomaly markers ────────────────────────────
    // Fetches the raw utilization series on its own (decoupled from the parent
    // page's time filter) so the chart always shows the full 30-day pattern
    // window. Cached per metric so re-opening the pane or flipping between
    // metrics doesn't re-hit ADX unnecessarily.
    useEffect(() => {
        if (!open || domain !== 'utilization' || !metric || typeof fetchUtilization !== 'function') return;
        if (paneUtil[metric] !== undefined) return;
        let cancelled = false;
        setPaneUtilLoading(true);
        (async () => {
            try {
                const res = await fetchUtilization(metric);
                if (!cancelled) setPaneUtil((prev) => ({ ...prev, [metric]: res || {} }));
            } catch (e) {
                if (!cancelled) setPaneUtil((prev) => ({ ...prev, [metric]: {} }));
            } finally {
                if (!cancelled) setPaneUtilLoading(false);
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, domain, metric, fetchUtilization, serversKey]);

    // Reset cache when the resource scope changes so a re-opened pane on a
    // different server fetches fresh data.
    useEffect(() => { setPaneUtil({}); }, [serversKey]);

    const utilSeries = useMemo(() => {
        if (domain !== 'utilization' || !selected) return [];
        const raw = paneUtil[metric];
        if (!raw || !raw.TimeGenerated || !raw.ServerName || !raw.AvgValue) return [];
        const serverLc = String(selected.ResourceId || '').toLowerCase();
        if (!serverLc) return [];
        let drive = null;
        if (metric === 'Disk' && selected.CounterName) {
            const m = /Disk\s+(.+)$/.exec(selected.CounterName);
            drive = m ? m[1].trim() : null;
        }
        const points = [];
        Object.keys(raw.TimeGenerated).forEach((i) => {
            const sn = String(raw.ServerName[i] || '').toLowerCase();
            if (sn !== serverLc) return;
            if (drive && raw.DriveName && raw.DriveName[i] !== drive) return;
            const ts = dUtc(raw.TimeGenerated[i]);
            const val = raw.AvgValue[i];
            if (!ts || !ts.isValid() || val == null || Number.isNaN(Number(val))) return;
            points.push({ t: ts.valueOf(), value: Number(val) });
        });
        points.sort((a, b) => a.t - b.t);
        return points;
    }, [domain, metric, paneUtil, selected]);

    const sortedAnomalies = useMemo(
        () => anomalies.slice().sort((a, b) => String(startOf(b) || '').localeCompare(String(startOf(a) || ''))),
        [anomalies]
    );

    // ── MSTL decomposition (trend + seasonal + residual) ──────────────────────
    // The backend stores enough information in BaselineJSON to reconstruct the
    // three MSTL components on the frontend:
    //   * `seasonal_profile`  — 1008 averaged weekly positions (one per 10-min
    //     bucket Mon-00:00 .. Sun-23:50). Indexed by Pacific Time dayofweek/
    //     hour/minute because the extractor converts UTC→PT before MSTL runs.
    //   * `trend_slope`       — per-step (10-min) slope of the fitted trend.
    //   * `trend_last_value`  — trend value at `trend_last_time`.
    //   * `trend_last_time`   — Pacific Time anchor for the trend line.
    // Decomposition is: actual = trend + seasonal + residual.
    // Bucket-key math evaluates the timestamp in PT (dayjs.utc().tz(TZ)) so the
    // (dayofweek, hour, minute) we extract matches how `seasonal_profile` was
    // indexed at extraction time. Using raw UTC fields here would shift every
    // lookup by the active PT offset (7–8 h).
    const decomposition = useMemo(() => {
        if (utilSeries.length === 0) return [];
        const baseline = data && data.BaselineJSON;
        if (!baseline) return [];
        const profile = Array.isArray(baseline.seasonal_profile) ? baseline.seasonal_profile : null;
        const slope = Number(baseline.trend_slope);
        const lastVal = Number(baseline.trend_last_value);
        const lastTime = dUtc(baseline.trend_last_time);
        if (!profile || profile.length !== 1008 || !Number.isFinite(slope) || !Number.isFinite(lastVal) || !lastTime || !lastTime.isValid()) {
            return [];
        }
        const lastMs = lastTime.valueOf();
        const stepMs = 10 * 60 * 1000; // 10-minute resampling step
        return utilSeries.map((p) => {
            // Evaluate the timestamp in PT — seasonal_profile is PT-indexed.
            const u = dayjs.utc(p.t).tz(TZ);
            // dayjs.day() is Sun=0..Sat=6; backend uses Mon=0..Sun=6.
            const dow = (u.day() + 6) % 7;
            const slot = u.hour() * 6 + Math.floor(u.minute() / 10);
            const pos = dow * 144 + slot;
            const seasonal = pos >= 0 && pos < 1008 ? Number(profile[pos]) || 0 : 0;
            const steps = Math.round((p.t - lastMs) / stepMs);
            const trend = lastVal + slope * steps;
            const residual = p.value - trend - seasonal;
            return { t: p.t, actual: p.value, trend, seasonal, residual };
        });
    }, [utilSeries, data]);

    // Apply the severity-filter chip selection and the low-confidence toggle.
    // 'all' is a severity passthrough; hideLowConfidence drops rows whose
    // backend-emitted confidence score is below LOW_CONFIDENCE_SCORE.
    const visibleAnomalies = useMemo(() => {
        let list = severityFilter === 'all' ? sortedAnomalies : sortedAnomalies.filter((a) => a.severity === severityFilter);
        if (hideLowConfidence) {
            list = list.filter((a) => a.score == null || Number(a.score) >= LOW_CONFIDENCE_SCORE);
        }
        return list;
    }, [sortedAnomalies, severityFilter, hideLowConfidence]);

    // Count of low-confidence rows being filtered, surfaced in the toggle chip
    // so the user can see what's being hidden without flipping the switch.
    const lowConfidenceCount = useMemo(
        () => sortedAnomalies.filter((a) => a.score != null && Number(a.score) < LOW_CONFIDENCE_SCORE).length,
        [sortedAnomalies]
    );

    // Anomaly markers for the utilization chart, grouped by severity so each
    // severity gets its own coloured Scatter series (recharts colours per
    // series, not per point). Mirrors the same filter set as the timeline
    // (severityFilter + hideLowConfidence) so the chart and the list always
    // tell the same story. Markers outside the rendered series window are
    // dropped so a dot never floats outside the chart bounds.
    const anomalyDotsBySeverity = useMemo(() => {
        const empty = { high: [], medium: [], low: [] };
        if (utilSeries.length === 0) return empty;
        const tMin = utilSeries[0].t;
        const tMax = utilSeries[utilSeries.length - 1].t;
        const buckets = { high: [], medium: [], low: [] };
        visibleAnomalies.forEach((a) => {
            const m = dPT(startOf(a));
            const peak = peakOf(domain, a);
            if (!m || !m.isValid() || peak == null || Number.isNaN(Number(peak))) return;
            const t = m.valueOf();
            if (t < tMin || t > tMax) return;
            const sev = SEVERITY[a.severity] ? a.severity : 'medium';
            buckets[sev].push({
                t,
                value: Number(peak),
                severity: sev,
                category: a.category,
                startLabel: safeFormat(startOf(a), 'MMM D, YYYY HH:mm'),
            });
        });
        return buckets;
    }, [visibleAnomalies, utilSeries, domain]);

    const anomalyDotsCount = (
        anomalyDotsBySeverity.high.length
        + anomalyDotsBySeverity.medium.length
        + anomalyDotsBySeverity.low.length
    );

    const trend = data && data.TrendAnalysis;
    // Right-sizing recommendation. Mirrors the rule the backend used to apply
    // in `utilizationRange` (daily_pattern_extractor_utilization.py): only
    // emit a suggestion when the resource never reached the 70%+ bands
    // anywhere in the 30-day window — that's the signal it's been over-
    // provisioned. Generated client-side now so the wording lives next to the
    // distribution histogram it summarises.
    const utilText = useMemo(() => {
        if (domain === 'network') return '';
        const ur = data && data.UtilizationRange;
        if (!ur) return '';
        const b70 = Number(ur['70_80']) || 0;
        const b80 = Number(ur['80_90']) || 0;
        const b90 = Number(ur['90_100']) || 0;
        if (b70 > 0 || b80 > 0 || b90 > 0) return '';
        const b60 = Number(ur['60_70']) || 0;
        const b50 = Number(ur['50_60']) || 0;
        const maxRaw = ur.maximum;
        const maxNum = Number(maxRaw);
        const maxLabel = Number.isFinite(maxNum) ? `${maxNum}%` : '';
        const name = (selected && selected.ResourceId) || '';
        // Mirror backend's metric_type semantics: for disks the label was
        // "Disk <drive>" (e.g. "Disk C:"); CPU/Memory pass through unchanged.
        let metricType = metric || '';
        if (metric === 'Disk' && selected && selected.CounterName) {
            metricType = selected.CounterName;
        }
        let text;
        if (b60 > 0) {
            text = `The max ${metricType} Utilization ${name} has reached is between 60 and 70% (${maxLabel})`;
        } else if (b50 > 0) {
            text = `The max ${metricType} Utilization ${name} has reached is between 50 and 60% (${maxLabel})`;
        } else {
            text = `The max ${metricType} Utilization ${name} has reached is less than 50% (${maxLabel})`;
        }
        const resource = metric === 'CPU' ? 'Vcpu' : metric === 'Memory' ? 'RAM' : 'Disk Space';
        return `${text}, so validate and reduce the ${resource} configuration if required.`;
    }, [domain, data, metric, selected]);
    const maxUtil = data && data.UtilizationRange && data.UtilizationRange.maximum;

    return (
        <Drawer
            anchor="right"
            open={open}
            onClose={onClose}
            PaperProps={{ sx: { width: { xs: '100vw', sm: '50vw' }, minWidth: { xs: 'auto', sm: 480 }, bgcolor: '#FFFFFF' } }}
        >
            {/* Header */}
            <Box sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${BORDER}`, bgcolor: '#FFFFFF', position: 'sticky', top: 0, zIndex: 2 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
                        <InsightsOutlinedIcon sx={{ fontSize: 22, color: NAVY }} />
                        <Typography sx={{ fontSize: 15, fontWeight: 800, color: TEXT }}>Pattern Analysis</Typography>
                        <Tooltip title={INFO_TOOLTIP} arrow placement="bottom-start">
                            <InfoOutlinedIcon sx={{ fontSize: 16, color: MUTED, cursor: 'help' }} />
                        </Tooltip>
                    </Stack>
                    <IconButton size="small" onClick={onClose}><CloseIcon sx={{ fontSize: 18 }} /></IconButton>
                </Stack>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.5 }}>
                    <Typography sx={{ fontSize: 11, color: MUTED }}>{titleForMetric(domain, metric)}</Typography>
                    <Chip
                        size="small"
                        icon={<EventOutlinedIcon sx={{ fontSize: 12, color: `${NAVY} !important` }} />}
                        label={`${windowLabel} · ${ANALYSIS_WINDOW_DAYS}-day window`}
                        sx={{ height: 19, fontSize: 10, fontWeight: 600, color: NAVY, bgcolor: '#EEF3FC', '& .MuiChip-label': { px: 0.75 } }}
                    />
                </Stack>
            </Box>

            {/* Body */}
            <Box sx={{ flex: 1, overflowY: 'auto', px: 2, py: 1.5 }}>
                {loading ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8, gap: 1.5 }}>
                        <CircularProgress size={26} sx={{ color: NAVY }} />
                        <Typography sx={{ fontSize: 12, color: MUTED }}>Loading insights…</Typography>
                    </Box>
                ) : error ? (
                    <Alert severity="error" sx={{ fontSize: 12 }}>{error}</Alert>
                ) : records.length === 0 ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8, gap: 1, textAlign: 'center' }}>
                        <InsightsOutlinedIcon sx={{ fontSize: 40, color: '#C7CDDA' }} />
                        <Typography sx={{ fontSize: 13, fontWeight: 700, color: TEXT }}>No seasonal pattern data</Typography>
                        <Typography sx={{ fontSize: 11.5, color: MUTED, maxWidth: 360 }}>
                            No daily pattern analysis is available for the selected {domain === 'network' ? 'network adapters' : 'server(s)'} yet.
                        </Typography>
                    </Box>
                ) : (
                    <>
                        {/* Resource filter (searchable) */}
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                            <Typography sx={{ fontSize: 11, fontWeight: 700, color: MUTED, minWidth: 56 }}>Resource</Typography>
                            <Tooltip title={TIP.resourceSelector} arrow placement="top">
                                <Autocomplete
                                    size="small"
                                    fullWidth
                                    disableClearable
                                    disabled={records.length <= 1}
                                    options={records.map((r, i) => ({ idx: i, label: optionLabel(r) }))}
                                    value={records[selectedIdx] ? { idx: selectedIdx, label: optionLabel(records[selectedIdx]) } : null}
                                    isOptionEqualToValue={(opt, val) => opt.idx === val.idx}
                                    getOptionLabel={(opt) => (opt && opt.label) || ''}
                                    onChange={(_, val) => { if (val) setSelectedIdx(val.idx); }}
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            placeholder="Search resource…"
                                            sx={{ '& .MuiInputBase-input': { fontSize: 12, py: '6px !important' } }}
                                        />
                                    )}
                                    renderOption={(props, opt) => (
                                        <li {...props} key={opt.idx} style={{ fontSize: 12 }}>{opt.label}</li>
                                    )}
                                    sx={{ '& .MuiOutlinedInput-root': { py: 0 } }}
                                />
                            </Tooltip>
                        </Stack>

                        {/* Resource + trend header */}
                        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 1 }}>
                            <Box sx={{ minWidth: 0 }}>
                                {/* <Typography sx={{ fontSize: 13, fontWeight: 800, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {domain === 'network' ? (selected.ServerName || selected.ResourceId) : selected.ResourceId}
                                </Typography> */}
                                <Typography sx={{ fontSize: 10, color: MUTED }}>
                                    {/* {domain === 'network' ? `${selected.CounterName} · NIC ${selected.ResourceId}` : selected.CounterName} */}
                                    {selected.TimeGenerated ? `Analyzed ${safeFormatUtc(selected.TimeGenerated, 'MMM D, YYYY')}` : ''}
                                </Typography>
                            </Box>
                            <TrendBadge trend={trend} />
                        </Stack>

                        {/* Right-sizing recommendation now lives below the
                            utilization distribution section so the suggestion
                            sits beside the histogram it summarises. */}

                        {/* Weekly utilization breach summary (utilization only) — absolute
                            90 %+ breaches from PatternDetailsUtilization. Same grid UI as
                            the seasonal summary above; the two views answer different
                            questions:
                              • Weekly breach summary           → broke its own learned pattern
                              • Weekly utilization breach summary → crossed the absolute 90 % line
                            An always-busy resource will often have an empty seasonal grid
                            but a populated utilization grid. */}
                        {domain !== 'network' && (
                            <>
                                <SectionTitle
                                    hint={
                                        'For each weekday over the last 30 days, this shows how many 10-minute samples ' +
                                        'reached the critical 90 % utilization line, split by time of day' +
                                        'this view is a flat threshold check — ' +
                                        'Useful for always-busy workloads whose seasonal grid stays empty because the busyness is baked into their normal pattern.'
                                    }
                                >
                                    Weekly utilization breach summary
                                </SectionTitle>
                                {weeklyUtilizationSummary.every((r) => r.total === 0) ? (
                                    <EmptyState
                                        title="No threshold breaches detected"
                                        subtitle="No 10-minute samples crossed 90% utilization on any weekday during this window."
                                    />
                                ) : (
                                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' }, gap: 1 }}>
                                        {weeklyUtilizationSummary.map((r) => (
                                            <WeeklyDayCard
                                                key={r.day}
                                                day={r.day}
                                                daysSeen={r.daysSeen}
                                                daysTotal={r.daysTotal}
                                                morning={r.morning}
                                                business={r.business}
                                                overnight={r.overnight}
                                                isPeak={r.isPeak}
                                            />
                                        ))}
                                    </Box>
                                )}
                            </>
                        )}

                        {/* Threshold breaches by day stacked bar (utilization only) — mirror
                            of the seasonal version above, but driven by the absolute 90 %+
                            threshold checks so always-busy resources still get a weekday
                            breakdown. */}
                        {domain !== 'network' && (
                            <>
                                <SectionTitle hint={TIP.thresholdBreachesByDay}>Threshold breaches by day &amp; time of day</SectionTitle>
                                {thresholdBreachData.length > 0 ? (
                                    <Box sx={{ height: 210, width: '100%' }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={thresholdBreachData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EEF0F4" />
                                                <XAxis dataKey="day" tick={{ fontSize: 10, fill: MUTED }} axisLine={{ stroke: BORDER }} tickLine={false} />
                                                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
                                                <RTooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: `1px solid ${BORDER}` }} />
                                                <Legend wrapperStyle={{ fontSize: 10 }} iconSize={9} />
                                                <Bar dataKey="morning" stackId="a" name="Morning" fill={STACK.morning} />
                                                <Bar dataKey="business" stackId="a" name="Business hrs" fill={STACK.business} />
                                                <Bar dataKey="overnight" stackId="a" name="Overnight" fill={STACK.overnight} radius={[3, 3, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </Box>
                                ) : (
                                    <EmptyState
                                        title="No threshold breaches detected"
                                        subtitle="This resource stayed below 90% utilization during the last 30 days."
                                    />
                                )}
                            </>
                        )}

                        {/* Utilization range histogram (utilization only) — always rendered with a contextual suggestion note */}
                        {domain !== 'network' && (
                            <>
                                <SectionTitle hint="How the resource's 10-minute peak utilization samples are spread across the high-usage bands (50% and up) during the last 30 days. Tells you whether the resource lives near the top, the middle, or rarely climbs at all.">Utilization distribution</SectionTitle>
                                {rangeData.some((r) => r.count > 0) ? (
                                    <Box sx={{ height: 180, width: '100%' }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={rangeData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EEF0F4" />
                                                <XAxis dataKey="band" tick={{ fontSize: 9.5, fill: MUTED }} axisLine={{ stroke: BORDER }} tickLine={false} />
                                                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
                                                <RTooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: `1px solid ${BORDER}` }} formatter={(v) => [`${v} samples`, 'Count']} />
                                                <Bar dataKey="count" name="Samples" fill={NAVY} radius={[3, 3, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </Box>
                                ) : (
                                    <EmptyState
                                        title="No high-utilization samples"
                                        subtitle="No 10-minute samples reached the 50%+ utilization bands during this window."
                                    />
                                )}
                                {/* Right-sizing recommendation — only shown when the resource never
                                    crossed 70% utilization in the analysis window. Sits directly
                                    beneath the distribution histogram it summarises. Mirrors the
                                    original extractor rule from `utilizationRange` in
                                    daily_pattern_extractor_utilization.py, composed client-side
                                    (see `utilText` memo) so the wording lives next to the chart. */}
                                {utilText && (
                                    <Tooltip title={TIP.rightSizing} arrow placement="top">
                                        <Alert
                                            severity="info"
                                            icon={false}
                                            sx={{
                                                mt: 0.5,
                                                py: 0.5,
                                                px: 1,
                                                fontSize: 11.5,
                                                bgcolor: '#EEF3FC',
                                                color: NAVY,
                                                border: `1px solid ${BORDER}`,
                                                cursor: 'help',
                                                '& .MuiAlert-message': { py: 0.5 },
                                            }}
                                        >
                                            {utilText}
                                        </Alert>
                                    </Tooltip>
                                )}
                            </>
                        )}

                        {/* Trend detail */}
                        {trend && trend.direction && (
                            <>
                                <SectionTitle hint={`Direction & slope of how utilization has moved over the last ${ANALYSIS_WINDOW_DAYS} days. Helps spot gradual growth before it becomes a capacity event.`}>Trend</SectionTitle>
                                <Box sx={{ border: `1px solid ${BORDER}`, borderRadius: 2, p: 1.25 }}>
                                    <Stack direction="row" flexWrap="wrap" useFlexGap spacing={2}>
                                        <Tooltip title={TIP.slopePerDay} arrow placement="top">
                                            <Box sx={{ cursor: 'help' }}>
                                                <Typography sx={{ fontSize: 10, color: MUTED }}>Slope / day</Typography>
                                                <Typography sx={{ fontSize: 13, fontWeight: 800, color: TEXT }}>{fmt(trend.slope_per_day, 2)}</Typography>
                                            </Box>
                                        </Tooltip>
                                        <Tooltip title={TIP.currentLevel} arrow placement="top">
                                            <Box sx={{ cursor: 'help' }}>
                                                <Typography sx={{ fontSize: 10, color: MUTED }}>Current level</Typography>
                                                <Typography sx={{ fontSize: 13, fontWeight: 800, color: TEXT }}>{fmt(trend.current_trend_level)}</Typography>
                                            </Box>
                                        </Tooltip>
                                        <Tooltip title={TIP.fitR2} arrow placement="top">
                                            <Box sx={{ cursor: 'help' }}>
                                                <Typography sx={{ fontSize: 10, color: MUTED }}>Fit (R²)</Typography>
                                                <Typography sx={{ fontSize: 13, fontWeight: 800, color: TEXT }}>{fmt(trend.r_squared, 2)}</Typography>
                                            </Box>
                                        </Tooltip>
                                        {trend.estimated_days_to_90pct != null && (
                                            <Tooltip title={TIP.daysTo90} arrow placement="top">
                                                <Box sx={{ cursor: 'help' }}>
                                                    <Typography sx={{ fontSize: 10, color: MUTED }}>Days to 90%</Typography>
                                                    <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#DC2626' }}>{fmt(trend.estimated_days_to_90pct, 0)}</Typography>
                                                </Box>
                                            </Tooltip>
                                        )}
                                    </Stack>
                                </Box>
                            </>
                        )}

                        {/* ─────────────────────────────────────────────────────────────
                            Hidden bottom container. These sections stay mounted so their
                            hooks, fetches, and memo calculations keep running, but
                            `display: none` removes them from the rendered UI. Remove the
                            wrapping <Box> to make them visible again. */}
                        <Box>
                        {/* <Box sx = {{display: 'none'}} > */}
                            {/* MSTL decomposition (trend + seasonal + residual) ─ utilization only */}
                            {domain !== 'network' && (
                                <>
                                    <SectionTitle hint="Breaks the utilization signal into its three MSTL components: the long-term trend (gradual drift), the seasonal pattern (recurring weekly/daily shape) and the residual (what is left after removing the first two — large values are pattern breaks).">
                                        Pattern decomposition · trend / seasonal / residual
                                    </SectionTitle>
                                    {decomposition.length > 0 ? (
                                        <Stack spacing={1}>
                                        {[
                                            { key: 'trend', label: 'Trend', color: '#1F6FEB', hint: 'Long-term drift fitted by linear regression on the MSTL trend component. Slope is reported in the Trend section above.' },
                                            { key: 'seasonal', label: 'Seasonal', color: '#7C3AED', hint: 'Recurring weekly + daily pattern. One value per 10-min slot, averaged over the 30-day window.' },
                                            { key: 'residual', label: 'Residual', color: '#DC2626', hint: 'What remains after subtracting trend and seasonal. Spikes in residual are the signal anomaly detectors react to.' },
                                        ].map(({ key, label, color, hint }) => (
                                            <Box key={key} sx={{ border: `1px solid ${BORDER}`, borderRadius: 2, px: 1, py: 0.75 }}>
                                                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.25 }}>
                                                    <Stack direction="row" alignItems="center" spacing={0.5}>
                                                        <Box sx={{ width: 12, height: 2, bgcolor: color }} />
                                                        <Typography sx={{ fontSize: 11, fontWeight: 800, color: TEXT }}>{label}</Typography>
                                                    </Stack>
                                                    <Tooltip title={hint} arrow placement="top">
                                                        <InfoOutlinedIcon sx={{ fontSize: 12, color: MUTED, cursor: 'help' }} />
                                                    </Tooltip>
                                                </Stack>
                                                <Box sx={{ height: 110, width: '100%' }}>
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <ComposedChart data={decomposition} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EEF0F4" />
                                                            <XAxis
                                                                type="number"
                                                                dataKey="t"
                                                                domain={['dataMin', 'dataMax']}
                                                                tickFormatter={(v) => dayjs.utc(v).tz(TZ).format('MMM D')}
                                                                tick={{ fontSize: 9.5, fill: MUTED }}
                                                                axisLine={{ stroke: BORDER }}
                                                                tickLine={false}
                                                            />
                                                            <YAxis
                                                                tick={{ fontSize: 9.5, fill: MUTED }}
                                                                axisLine={false}
                                                                tickLine={false}
                                                                width={32}
                                                                tickFormatter={(v) => `${Math.round(v)}`}
                                                            />
                                                            {key === 'residual' && (
                                                                <RTooltip
                                                                    cursor={{ stroke: BORDER }}
                                                                    labelFormatter={(v) => dayjs.utc(v).tz(TZ).format('MMM D, YYYY HH:mm [PT]')}
                                                                    formatter={(value) => [Number(value).toFixed(2), label]}
                                                                    contentStyle={{ fontSize: 11, borderRadius: 8, border: `1px solid ${BORDER}` }}
                                                                />
                                                            )}
                                                            {key !== 'residual' && (
                                                                <RTooltip
                                                                    cursor={{ stroke: BORDER }}
                                                                    labelFormatter={(v) => dayjs.utc(v).tz(TZ).format('MMM D, YYYY HH:mm [PT]')}
                                                                    formatter={(value) => [`${Number(value).toFixed(2)}%`, label]}
                                                                    contentStyle={{ fontSize: 11, borderRadius: 8, border: `1px solid ${BORDER}` }}
                                                                />
                                                            )}
                                                            <Line
                                                                type="monotone"
                                                                dataKey={key}
                                                                stroke={color}
                                                                strokeWidth={1.4}
                                                                dot={false}
                                                                isAnimationActive={false}
                                                            />
                                                        </ComposedChart>
                                                    </ResponsiveContainer>
                                                </Box>
                                            </Box>
                                        ))}
                                    </Stack>
                                    ) : (
                                        <EmptyState
                                            title="No decomposition available"
                                            subtitle="Not enough utilization samples to break the signal into trend, seasonal and residual components."
                                        />
                                    )}
                                </>
                            )}

                            {/* Weekly breach summary (utilization only) — all 7 weekdays, always rendered */}
                            {domain !== 'network' && (
                                <>
                                    <SectionTitle
                                        hint={
                                            'For each weekday over the last 30 days, this shows how many times utilization ' +
                                            'went above its usual seasonal range, split by time of day (morning, business ' +
                                            'hours, overnight). The fraction at the top of each card (e.g. "2/4 Mondays") ' +
                                            'means: out of the 4 Mondays in this window, 2 had at least one breach. Cards ' +
                                            'with all zeros mean the resource stayed inside its normal pattern that day.'
                                        }
                                    >
                                        Weekly breach summary
                                    </SectionTitle>
                                    {weeklySummary.every((r) => r.total === 0) ? (
                                        <EmptyState
                                            title="No seasonal breaches detected"
                                            subtitle="This resource stayed within its normal pattern on every weekday during this window."
                                        />
                                    ) : (
                                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' }, gap: 1 }}>
                                            {weeklySummary.map((r) => (
                                                <WeeklyDayCard
                                                    key={r.day}
                                                    day={r.day}
                                                    daysSeen={r.daysSeen}
                                                    daysTotal={r.daysTotal}
                                                    morning={r.morning}
                                                    business={r.business}
                                                    overnight={r.overnight}
                                                    isPeak={r.isPeak}
                                                />
                                            ))}
                                        </Box>
                                    )}
                                </>
                            )}

                            {/* Breaches by day stacked bar (utilization only) */}
                            {domain !== 'network' && (
                                <>
                                    <SectionTitle hint={TIP.breachesByDay}>Breaches by day &amp; time of day</SectionTitle>
                                    {breachData.length > 0 ? (
                                        <Box sx={{ height: 210, width: '100%' }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={breachData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EEF0F4" />
                                                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: MUTED }} axisLine={{ stroke: BORDER }} tickLine={false} />
                                                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
                                                    <RTooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: `1px solid ${BORDER}` }} />
                                                    <Legend wrapperStyle={{ fontSize: 10 }} iconSize={9} />
                                                    <Bar dataKey="morning" stackId="a" name="Morning" fill={STACK.morning} />
                                                    <Bar dataKey="business" stackId="a" name="Business hrs" fill={STACK.business} />
                                                    <Bar dataKey="overnight" stackId="a" name="Overnight" fill={STACK.overnight} radius={[3, 3, 0, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </Box>
                                    ) : (
                                        <EmptyState
                                            title="No seasonal breaches detected"
                                            subtitle="This resource behaved within its expected pattern on every weekday."
                                        />
                                    )}
                                </>
                            )}

                            {/* Anomaly timeline */}
                            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mt: 2.5, mb: 1, flexWrap: 'wrap', rowGap: 0.75 }}>
                                <Stack direction="row" alignItems="center" spacing={0.5}>
                                    <Typography sx={{ fontSize: 12, fontWeight: 800, color: TEXT }}>Anomaly timeline</Typography>
                                    <Tooltip
                                        title={`All outliers, sudden spikes/drops${domain === 'network' ? '' : ', sustained-high periods, and absolute 90 %+ threshold breaches'} detected in the ${ANALYSIS_WINDOW_DAYS}-day window, most recent first.`}
                                        arrow
                                        placement="top"
                                    >
                                        <InfoOutlinedIcon sx={{ fontSize: 13, color: MUTED, cursor: 'help' }} />
                                    </Tooltip>
                                </Stack>
                                <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
                                    {lowConfidenceCount > 0 && (
                                        <Tooltip
                                            title={`Confidence score combines residual z-magnitude, duration, utilization and detector consensus. Toggle off to also show ${lowConfidenceCount} low-confidence row${lowConfidenceCount === 1 ? '' : 's'} (score < ${LOW_CONFIDENCE_SCORE}).`}
                                            arrow
                                            placement="top"
                                        >
                                            <Chip
                                                size="small"
                                                clickable
                                                label={hideLowConfidence ? `Hiding ${lowConfidenceCount} low-conf` : `Showing all (${lowConfidenceCount} low-conf)`}
                                                onClick={() => setHideLowConfidence((v) => !v)}
                                                sx={{
                                                    height: 20,
                                                    fontSize: 10,
                                                    fontWeight: 700,
                                                    color: hideLowConfidence ? '#FFFFFF' : MUTED,
                                                    bgcolor: hideLowConfidence ? MUTED : `${MUTED}14`,
                                                    border: `1px solid ${hideLowConfidence ? MUTED : 'transparent'}`,
                                                    '& .MuiChip-label': { px: 0.75 },
                                                    '&:hover': { bgcolor: hideLowConfidence ? MUTED : `${MUTED}26` },
                                                }}
                                            />
                                        </Tooltip>
                                    )}
                                    {[
                                        { key: 'all', label: 'All', count: sortedAnomalies.length, color: NAVY },
                                        { key: 'high', label: 'High', count: counts.high, color: SEVERITY.high.color },
                                        { key: 'medium', label: 'Medium', count: counts.medium, color: SEVERITY.medium.color },
                                        { key: 'low', label: 'Low', count: counts.low, color: SEVERITY.low.color },
                                    ].map(({ key, label, count, color }) => {
                                        const active = severityFilter === key;
                                        return (
                                            <Chip
                                                key={key}
                                                size="small"
                                                clickable
                                                label={`${label} ${count}`}
                                                onClick={() => setSeverityFilter(key)}
                                                sx={{
                                                    height: 20,
                                                    fontSize: 10,
                                                    fontWeight: 700,
                                                    color: active ? '#FFFFFF' : color,
                                                    bgcolor: active ? color : `${color}14`,
                                                    border: `1px solid ${active ? color : 'transparent'}`,
                                                    '& .MuiChip-label': { px: 0.75 },
                                                    '&:hover': { bgcolor: active ? color : `${color}26` },
                                                }}
                                            />
                                        );
                                    })}
                                </Stack>
                            </Stack>
                            {sortedAnomalies.length === 0 ? (
                                <Box sx={{ border: `1px dashed ${BORDER}`, borderRadius: 2, py: 3, textAlign: 'center' }}>
                                    <Typography sx={{ fontSize: 12, color: '#2E7D32', fontWeight: 700 }}>No anomalies detected</Typography>
                                    <Typography sx={{ fontSize: 10.5, color: MUTED }}>This resource behaved within its expected pattern.</Typography>
                                </Box>
                            ) : visibleAnomalies.length === 0 ? (
                                <Box sx={{ border: `1px dashed ${BORDER}`, borderRadius: 2, py: 3, textAlign: 'center' }}>
                                    <Typography sx={{ fontSize: 11.5, color: MUTED }}>
                                        No {severityFilter}-severity anomalies in this window.
                                    </Typography>
                                </Box>
                            ) : (
                                <Box>
                                    {visibleAnomalies.map((a, i) => (
                                        <AnomalyRow key={`${startOf(a) || 'na'}-${a.category}-${i}`} domain={domain} a={a} />
                                    ))}
                                </Box>
                            )}

                            {/* Utilization-over-time with anomaly dots (utilization only) */}
                            {domain !== 'network' && (
                                <>
                                    <SectionTitle hint="Last 30 days of utilization for this resource. Red dots mark detected anomalies at the time they occurred.">
                                        Utilization over time · last 30 days
                                    </SectionTitle>
                                    {paneUtilLoading && utilSeries.length === 0 ? (
                                        <Box sx={{ height: 220, width: '100%', border: `1px solid ${BORDER}`, borderRadius: 2, p: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Stack direction="row" alignItems="center" spacing={1}>
                                                <CircularProgress size={18} sx={{ color: NAVY }} />
                                                <Typography sx={{ fontSize: 11, color: MUTED }}>Loading 30-day utilization…</Typography>
                                            </Stack>
                                        </Box>
                                    ) : utilSeries.length === 0 ? (
                                        <Box sx={{ height: 220, width: '100%', border: `1px dashed ${BORDER}`, borderRadius: 2, p: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Typography sx={{ fontSize: 11, color: MUTED }}>
                                                No utilization samples available for this resource in the last 30 days.
                                            </Typography>
                                        </Box>
                                    ) : (
                                        <Box sx={{ height: 220, width: '100%', border: `1px solid ${BORDER}`, borderRadius: 2, p: 1 }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <ComposedChart margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EEF0F4" />
                                                    <XAxis
                                                        type="number"
                                                        dataKey="t"
                                                        domain={['dataMin', 'dataMax']}
                                                        tickFormatter={(v) => dayjs.utc(v).tz(TZ).format('MMM D')}
                                                        tick={{ fontSize: 10, fill: MUTED }}
                                                        axisLine={{ stroke: BORDER }}
                                                        tickLine={false}
                                                        allowDuplicatedCategory={false}
                                                    />
                                                    <YAxis
                                                        domain={[0, 100]}
                                                        tick={{ fontSize: 10, fill: MUTED }}
                                                        axisLine={false}
                                                        tickLine={false}
                                                        tickFormatter={(v) => `${v}%`}
                                                        width={36}
                                                    />
                                                    <RTooltip
                                                        cursor={{ stroke: BORDER }}
                                                        labelFormatter={(v) => dayjs.utc(v).tz(TZ).format('MMM D, YYYY HH:mm [PT]')}
                                                        formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name === 'Anomaly' ? 'Anomaly peak' : 'Utilization']}
                                                        contentStyle={{ fontSize: 11, borderRadius: 8, border: `1px solid ${BORDER}` }}
                                                    />
                                                    <Line
                                                        data={utilSeries}
                                                        name="Utilization"
                                                        type="monotone"
                                                        dataKey="value"
                                                        stroke={NAVY}
                                                        strokeWidth={1.6}
                                                        dot={false}
                                                        activeDot={{ r: 3, fill: NAVY }}
                                                        isAnimationActive={false}
                                                    />
                                                    {anomalyDotsBySeverity.high.length > 0 && (
                                                        <Scatter
                                                            data={anomalyDotsBySeverity.high}
                                                            name="High"
                                                            dataKey="value"
                                                            fill={SEVERITY.high.color}
                                                            stroke="#FFFFFF"
                                                            strokeWidth={1}
                                                            shape="circle"
                                                            isAnimationActive={false}
                                                        />
                                                    )}
                                                    {anomalyDotsBySeverity.medium.length > 0 && (
                                                        <Scatter
                                                            data={anomalyDotsBySeverity.medium}
                                                            name="Medium"
                                                            dataKey="value"
                                                            fill={SEVERITY.medium.color}
                                                            stroke="#FFFFFF"
                                                            strokeWidth={1}
                                                            shape="circle"
                                                            isAnimationActive={false}
                                                        />
                                                    )}
                                                    {anomalyDotsBySeverity.low.length > 0 && (
                                                        <Scatter
                                                            data={anomalyDotsBySeverity.low}
                                                            name="Low"
                                                            dataKey="value"
                                                            fill={SEVERITY.low.color}
                                                            stroke="#FFFFFF"
                                                            strokeWidth={1}
                                                            shape="circle"
                                                            isAnimationActive={false}
                                                        />
                                                    )}
                                                </ComposedChart>
                                            </ResponsiveContainer>
                                        </Box>
                                    )}
                                    {utilSeries.length > 0 && (
                                        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.5, ml: 0.5 }}>
                                            <Stack direction="row" alignItems="center" spacing={0.5}>
                                                <Box sx={{ width: 14, height: 2, bgcolor: NAVY }} />
                                                <Typography sx={{ fontSize: 10, color: MUTED }}>Utilization</Typography>
                                            </Stack>
                                            {['high', 'medium', 'low'].map((sev) => {
                                                const n = anomalyDotsBySeverity[sev].length;
                                                if (n === 0) return null;
                                                return (
                                                    <Stack key={sev} direction="row" alignItems="center" spacing={0.5}>
                                                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: SEVERITY[sev].color }} />
                                                        <Typography sx={{ fontSize: 10, color: MUTED }}>
                                                            {SEVERITY[sev].label} ({n})
                                                        </Typography>
                                                    </Stack>
                                                );
                                            })}
                                            {anomalyDotsCount === 0 && anomalies.length > 0 && (
                                                <Typography sx={{ fontSize: 10, color: MUTED, fontStyle: 'italic' }}>
                                                    No anomalies match current filter
                                                </Typography>
                                            )}
                                        </Stack>
                                    )}
                                </>
                            )}

                            {/* Detected anomalies (stat cards) */}
                            <SectionTitle hint="Counts of detected pattern breaks, broken down by category and severity.">Detected anomalies</SectionTitle>
                            <Stack direction="row" spacing={1} sx={{ mb: 0.5 }}>
                                <StatCard label="Outliers" value={counts.residual} hint={TIP.outliers} />
                                <StatCard label="Sudden Spikes / Drops" value={counts.roc} hint={TIP.suddenSpikes} />
                                {domain === 'network'
                                    ? <StatCard label="High severity" value={counts.high} accent={counts.high ? '#DC2626' : NAVY} hint={TIP.highSeverity} />
                                    : <StatCard label="Sustained High" value={counts.sustained} accent={counts.sustained ? '#DC2626' : NAVY} hint={TIP.sustainedHigh} />}
                            </Stack>
                            {domain !== 'network' && (
                                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                                    <StatCard label="Threshold Breaches" value={counts.threshold} accent={counts.threshold ? '#DC2626' : NAVY} hint={TIP.thresholdBreach} />
                                    <StatCard label="High severity" value={counts.high} accent={counts.high ? '#DC2626' : NAVY} hint={TIP.highSeverity} />
                                    <StatCard label="Medium severity" value={counts.medium} accent={counts.medium ? '#D97706' : NAVY} hint={TIP.mediumSeverity} />
                                </Stack>
                            )}
                        </Box>
                    </>
                )}
            </Box>
        </Drawer>
    );
};

export default PatternInsightsPane;
