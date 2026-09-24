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
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip as RTooltip, ResponsiveContainer, Cell
} from 'recharts';
import dayjs from 'dayjs';
import { fetchPatternAnalysis_fromADX } from '../../shared/APIs/fetchAPIs';

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

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// The simple extractor looks back a fixed 30-day window (ANALYSIS_DAYS = 30).
const ANALYSIS_WINDOW_DAYS = 30;

const fmt = (v, d = 1) =>
    (v === null || v === undefined || Number.isNaN(Number(v))) ? '—' : Number(v).toFixed(d);

// Timestamps are emitted by the extractor exactly as they arrive from ADX
// (no timezone conversion). We parse them as plain wall-clock strings and do
// NOT shift them — what the backend stored is what we render.
const parseTs = (s) => {
    if (s == null) return null;
    const d = dayjs(String(s).replace(' ', 'T'));
    return d.isValid() ? d : null;
};
const fmtTs = (s, f = 'MMM D, YYYY HH:mm') => {
    const d = parseTs(s);
    return d ? d.format(f) : '—';
};

// Assign a timestamp to one of the three time-of-day buckets:
//   morning  = 6am – 10am   (non-business)
//   business = 10am – 6pm
//   evening  = 6pm – 6am     (non-business / overnight)
const bucketForHour = (hour) =>
    (hour >= 6 && hour < 10 ? 'morning' : hour >= 10 && hour < 18 ? 'business' : 'evening');

const titleForMetric = (metric) => {
    const map = { CPU: 'CPU Utilization', Memory: 'Memory Utilization', Disk: 'Disk Utilization' };
    return map[metric] || 'Utilization Patterns';
};

// ── Small presentational helpers ─────────────────────────────────────────────
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

function EmptyState({ title, subtitle }) {
    return (
        <Box sx={{ border: `1px dashed ${BORDER}`, borderRadius: 2, py: 3, textAlign: 'center' }}>
            <Typography sx={{ fontSize: 12, color: '#2E7D32', fontWeight: 700 }}>{title}</Typography>
            {subtitle && <Typography sx={{ fontSize: 10.5, color: MUTED }}>{subtitle}</Typography>}
        </Box>
    );
}

function TrendBadge({ trend }) {
    if (!trend || !trend.state) return null;
    const state = trend.state;
    const cfg = state === 'increasing'
        ? { Icon: TrendingUpIcon, color: '#D97706', text: 'Increasing' }
        : state === 'decreasing'
            ? { Icon: TrendingDownIcon, color: '#2E7D32', text: 'Decreasing' }
            : { Icon: TrendingFlatIcon, color: MUTED, text: 'Stable' };
    const { Icon } = cfg;
    const days = trend['days to 90%'];
    return (        
            <Chip
                size="small"
                icon={<Icon sx={{ fontSize: 14, color: `${cfg.color} !important` }} />}
                label={cfg.text}
                sx={{ height: 20, fontSize: 10.5, fontWeight: 700, color: cfg.color, bgcolor: `${cfg.color}14`, cursor: 'help', '& .MuiChip-label': { px: 0.75 } }}
            />
    );
}

// ── Weekday summary card ──────────────────────────────────────────────────────
function WeeklyDayCard({ day, morning, business, evening, daysSeen, daysTotal, isPeak }) {
    const total = morning + business + evening;
    const cardBg = isPeak ? '#FEE2E2' : '#FFFFFF';
    const cardBorder = isPeak ? '#FCA5A5' : BORDER;
    // Pattern counts render green at zero, red when non-zero.
    const chipSx = (n) => ({
        height: 16, fontSize: 9, fontWeight: 700, '& .MuiChip-label': { px: 0.5 },
        bgcolor: n === 0 ? '#E6F4EA' : '#FEECEC',
        color: n === 0 ? '#166534' : '#DC2626',
    });
    return (
        <Paper variant="outlined" sx={{ p: 1, borderRadius: 1.5, bgcolor: cardBg, borderColor: cardBorder }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                    <Tooltip arrow placement="top" title={daysSeen != null && daysTotal != null ? `Anomalies were seen on ${daysSeen} of the ${daysTotal} ${day}s that fell within the last 30 days.` : `${day}`}>
                        <Typography sx={{ fontSize: 11, fontWeight: 800, color: TEXT, cursor: 'help' }}>
                            {daysSeen != null && daysTotal != null ? `${daysSeen}/${daysTotal} ${day}s` : day}
                        </Typography>
                    </Tooltip>
                    {isPeak && total > 0 && (
                        <Tooltip arrow placement="top" title="Peak day — this weekday had the most anomalies of the week.">
                            <Chip size="small" label="Peak" sx={{ height: 15, fontSize: 8.5, fontWeight: 700, color: '#C53030', bgcolor: '#FEE2E2', cursor: 'help', '& .MuiChip-label': { px: 0.5 } }} />
                        </Tooltip>
                    )}
                </Stack>
                <Tooltip arrow placement="top" title={`Total anomalies on ${day}s across the 30-day window (morning + business + evening).`}>
                    <Typography sx={{ fontSize: 12, fontWeight: 800, color: total > 0 ? '#DC2626' : TEXT, cursor: 'help' }}>{total}</Typography>
                </Tooltip>
            </Stack>
            <Stack spacing={0.4}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography sx={{ fontSize: 10, color: MUTED }}>Morning (6–10am)</Typography>
                    <Tooltip arrow placement="top" title={`${morning} anomaly(ies) occurred on ${day}s between 6am and 10am.`}>
                        <Chip size="small" label={morning} sx={{ ...chipSx(morning), cursor: 'help' }} />
                    </Tooltip>
                </Stack>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography sx={{ fontSize: 10, color: MUTED }}>Business (10am–6pm)</Typography>
                    <Tooltip arrow placement="top" title={`${business} anomaly(ies) occurred on ${day}s during business hours (10am–6pm).`}>
                        <Chip size="small" label={business} sx={{ ...chipSx(business), cursor: 'help' }} />
                    </Tooltip>
                </Stack>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography sx={{ fontSize: 10, color: MUTED }}>Evening (6pm–6am)</Typography>
                    <Tooltip arrow placement="top" title={`${evening} anomaly(ies) occurred on ${day}s in the evening/overnight window (6pm–6am).`}>
                        <Chip size="small" label={evening} sx={{ ...chipSx(evening), cursor: 'help' }} />
                    </Tooltip>
                </Stack>
            </Stack>
        </Paper>
    );
}

// ── Anomaly row ───────────────────────────────────────────────────────────────
function AnomalyRow({ a }) {
    const sev = SEVERITY[a.severity] || SEVERITY.low;
    const score = a['confidence score'];
    const expected = a.expected;
    const actual = a.actual;
    const delta = (expected != null && actual != null) ? actual - expected : null;
    return (
        <Box sx={{ display: 'flex', borderRadius: 1.5, border: `1px solid ${BORDER}`, overflow: 'hidden', mb: 1 }}>
            <Box sx={{ width: 4, bgcolor: sev.color, flexShrink: 0 }} />
            <Box sx={{ flex: 1, minWidth: 0, p: 1 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                    <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
                        <Tooltip arrow placement="top" title={`Severity of this anomaly (${sev.label}) — how far the actual value deviated from what was expected. Higher severity means a larger, more unusual deviation.`}>
                            <Chip size="small" label={sev.label} sx={{ height: 17, fontSize: 9, fontWeight: 700, color: sev.color, bgcolor: sev.bg, cursor: 'help', '& .MuiChip-label': { px: 0.6 } }} />
                        </Tooltip>
                        {score != null && (
                            <Tooltip arrow placement="top" title={`Confidence score (0–1): how certain the model is that this point is a genuine anomaly. ${Number(score).toFixed(2)} — ${Number(score) >= 0.6 ? 'high confidence' : Number(score) >= 0.4 ? 'moderate confidence' : 'low confidence'}.`}>
                                <Chip size="small" label={`conf ${Number(score).toFixed(2)}`}
                                    sx={{
                                        height: 17, fontSize: 9, fontWeight: 700, cursor: 'help',
                                        color: Number(score) >= 0.6 ? '#166534' : Number(score) >= 0.4 ? '#975A16' : MUTED,
                                        bgcolor: Number(score) >= 0.6 ? '#DCFCE7' : Number(score) >= 0.4 ? '#FEF3E2' : '#F3F4F6',
                                        '& .MuiChip-label': { px: 0.6 },
                                    }} />
                            </Tooltip>
                        )}
                    </Stack>
                    <Tooltip arrow placement="top" title="Actual measured utilization at the time of this anomaly.">
                        <Typography sx={{ fontSize: 17, fontWeight: 800, color: sev.color, whiteSpace: 'nowrap', cursor: 'help' }}>
                            {fmt(actual)}%
                        </Typography>
                    </Tooltip>
                </Stack>
                <Tooltip arrow placement="top" title="Weekday, date and time when this anomaly occurred (as recorded by the backend, no timezone shift). The weekday matches the Weekly pattern summary above.">
                    <Typography sx={{ fontSize: 10, color: MUTED, mt: 0.25, display: 'inline-block', cursor: 'help' }}>
                        {fmtTs(a.timestamp, 'ddd, MMM D, YYYY HH:mm')}
                    </Typography>
                </Tooltip>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                    {expected != null && (
                        <Tooltip arrow placement="top" title="Expected utilization the model predicted for this time, based on the learned normal pattern.">
                            <Chip size="small" variant="outlined" label={`expected ${fmt(expected)}%`}
                                sx={{ height: 18, fontSize: 9, borderColor: BORDER, color: MUTED, cursor: 'help', '& .MuiChip-label': { px: 0.6 } }} />
                        </Tooltip>
                    )}
                    {delta != null && (
                        <Tooltip arrow placement="top" title={`Difference between actual and expected: ${delta >= 0 ? 'actual was higher than expected (spike)' : 'actual was lower than expected (dip)'} by ${fmt(Math.abs(delta))} percentage points.`}>
                            <Chip size="small" variant="outlined" label={`${delta >= 0 ? '▲ +' : '▼ '}${fmt(Math.abs(delta))}`}
                                sx={{ height: 18, fontSize: 9, borderColor: BORDER, color: delta >= 0 ? '#DC2626' : '#2E7D32', cursor: 'help', '& .MuiChip-label': { px: 0.6 } }} />
                        </Tooltip>
                    )}
                </Stack>
            </Box>
        </Box>
    );
}

// Count how many times each weekday occurred in the [runDate-30d, runDate] window.
function weekdayCountsInWindow(runMoment) {
    const counts = { Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0, Sunday: 0 };
    if (!runMoment || !runMoment.isValid()) return counts;
    let cursor = runMoment.subtract(ANALYSIS_WINDOW_DAYS - 1, 'day');
    for (let i = 0; i < ANALYSIS_WINDOW_DAYS; i += 1) {
        const name = cursor.format('ddd');
        counts[name] = (counts[name] || 0) + 1;
        cursor = cursor.add(1, 'day');
    }
    return counts;
}

// Build the per-weekday × time-of-day counts from the anomaly list.
function buildWeeklySummary(anomalies, runMoment) {
    const rows = WEEKDAYS.map((day) => ({ day, morning: 0, business: 0, evening: 0, dates: new Set() }));
    const byName = Object.fromEntries(rows.map((r) => [r.day, r]));
    (anomalies || []).forEach((a) => {
        const d = parseTs(a.timestamp);
        if (!d || !d.isValid()) return;
        // dayjs.day(): Sun=0..Sat=6 → map to WEEKDAYS (Mon..Sun) name.
        const name = WEEKDAYS[(d.day() + 6) % 7];
        const bucket = bucketForHour(d.hour());
        const row = byName[name];
        if (row) {
            row[bucket] += 1;
            row.dates.add(d.format('YYYY-MM-DD'));
        }
    });
    const weekdayCounts = weekdayCountsInWindow(runMoment);
    const peak = rows.reduce((m, r) => {
        const t = r.morning + r.business + r.evening;
        return t > (m ? m.total : 0) ? { day: r.day, total: t } : m;
    }, null);
    return rows.map((r) => ({
        day: r.day,
        morning: r.morning,
        business: r.business,
        evening: r.evening,
        daysSeen: r.dates.size,
        daysTotal: weekdayCounts[r.day] || null,
        isPeak: peak && peak.total > 0 ? r.day === peak.day : false,
    }));
}

// ── Main component ────────────────────────────────────────────────────────────
const PatternInsightsPane = ({ open, onClose, domain = 'utilization', metric, servers = [] }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [records, setRecords] = useState([]);
    const [selectedIdx, setSelectedIdx] = useState(0);
    // Anomaly-timeline severity filter. Defaults to 'high' so the operator
    // first sees what most likely needs action.
    const [severityFilter, setSeverityFilter] = useState('high');

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
                // Default to the first option shown in the (breach-sorted) dropdown,
                // i.e. the resource with the most threshold breaches.
                const breachCount = (r) => (r && r.Data && Array.isArray(r.Data['utilization breaches'])) ? r.Data['utilization breaches'].length : 0;
                let topIdx = 0;
                list.forEach((r, i) => { if (breachCount(r) > breachCount(list[topIdx])) topIdx = i; });
                setSelectedIdx(topIdx);
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
        // For disk, append the drive name (e.g. "C:") from CounterName like
        // "Disk C:" so the operator can tell which volume they're looking at.
        if (metric === 'Disk' && r.CounterName) {
            const m = /Disk\s+(.+)$/.exec(r.CounterName);
            const drive = m ? m[1].trim() : '';
            return drive ? `${r.ResourceId} ${drive}` : `${r.ResourceId}`;
        }
        return `${r.ResourceId}`;
    };

    const selected = records[selectedIdx];
    const data = selected ? selected.Data : null;

    // Resource selector options, each with its threshold-breach count, sorted
    // from the highest breach count to the lowest so the busiest resources
    // surface first.
    const resourceOptions = useMemo(() => {
        return records
            .map((r, i) => ({
                idx: i,
                label: optionLabel(r),
                count: (r && r.Data && Array.isArray(r.Data['utilization breaches'])) ? r.Data['utilization breaches'].length : 0,
                trendState: (r && r.Data && r.Data.trend) ? r.Data.trend.state : null,
            }))
            .sort((a, b) => b.count - a.count);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [records, metric]);

    const anomalies = useMemo(
        () => (data && Array.isArray(data.anomalies) ? data.anomalies : []),
        [data]
    );
    const trend = data && data.trend;

    // Analysis run date (from the ADX row) drives the weekday-in-window counts.
    const runMoment = useMemo(() => parseTs(selected && selected.TimeGenerated), [selected]);

    // 1. Weekly pattern summary from anomalies.
    const weeklySummary = useMemo(() => buildWeeklySummary(anomalies, runMoment), [anomalies, runMoment]);
    const hasWeeklyData = weeklySummary.some((r) => r.morning + r.business + r.evening > 0);

    // Threshold breaches (utilization crossed the high-usage cutoff, e.g. ≥90%).
    const breaches = useMemo(
        () => (data && Array.isArray(data['utilization breaches']) ? data['utilization breaches'] : []),
        [data]
    );
    const breachWeeklySummary = useMemo(() => buildWeeklySummary(breaches, runMoment), [breaches, runMoment]);
    const hasBreachData = breachWeeklySummary.some((r) => r.morning + r.business + r.evening > 0);

    // Per-severity counts for the timeline filter chips.
    const counts = useMemo(() => {
        const c = { high: 0, medium: 0, low: 0 };
        anomalies.forEach((a) => {
            if (a.severity === 'high') c.high += 1;
            else if (a.severity === 'medium') c.medium += 1;
            else c.low += 1;
        });
        return c;
    }, [anomalies]);

    // Sorted anomaly timeline (most recent first).
    const sortedAnomalies = useMemo(
        () => anomalies.slice().sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || ''))),
        [anomalies]
    );

    // Timeline rows after applying the severity filter.
    const visibleAnomalies = useMemo(
        () => (severityFilter === 'all'
            ? sortedAnomalies
            : sortedAnomalies.filter((a) => (a.severity || 'low') === severityFilter)),
        [sortedAnomalies, severityFilter]
    );

    // 2. Utilization range histogram (from UtilizationRange). Always render
    // the full 0–100 set of 10-point bands (the extractor omits empty bands),
    // filling any missing band with a zero count so the x-axis is complete.
    const rangeData = useMemo(() => {
        const ur = (data && data.UtilizationRange) || {};
        return Array.from({ length: 10 }, (_, i) => {
            const lo = i * 10;
            const hi = lo + 10;
            const key = `${lo}_${hi}`;
            return { key, lo, hi, band: `${lo}–${hi}`, count: Number(ur[key]) || 0 };
        });
    }, [data]);

    // Downsizing candidate: samples exist, but none of them landed in a band
    // whose lower bound is 50% or above → all utilization stayed below 50%.
    const allBelow50 = useMemo(() => {
        const hasSamples = rangeData.some((r) => r.count > 0);
        const anyAtOrAbove50 = rangeData.some((r) => r.lo >= 50 && r.count > 0);
        return hasSamples && !anyAtOrAbove50;
    }, [rangeData]);

    // Highest band that actually recorded samples → the max utilization reached.
    const maxBand = useMemo(() => {
        const withSamples = rangeData.filter((r) => r.count > 0);
        return withSamples.length ? withSamples[withSamples.length - 1] : null;
    }, [rangeData]);

    const resourceType = metric === 'CPU' ? 'vCPU' : metric === 'Memory' ? 'RAM' : 'disk';

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
                    </Stack>
                    <IconButton size="small" onClick={onClose}><CloseIcon sx={{ fontSize: 18 }} /></IconButton>
                </Stack>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.5 }}>
                    <Typography sx={{ fontSize: 11, color: MUTED }}>{titleForMetric(metric)}</Typography>
                    <Chip
                        size="small"
                        label={`${ANALYSIS_WINDOW_DAYS}-day window`}
                        sx={{ height: 19, fontSize: 10, fontWeight: 600, color: NAVY, bgcolor: '#EEF3FC', '& .MuiChip-label': { px: 0.75 } }}
                    />
                    <TrendBadge trend={trend} />
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
                        <Typography sx={{ fontSize: 13, fontWeight: 700, color: TEXT }}>No pattern data</Typography>
                        <Typography sx={{ fontSize: 11.5, color: MUTED, maxWidth: 360 }}>
                            No daily pattern analysis is available for the selected server(s) yet.
                        </Typography>
                    </Box>
                ) : (
                    <>
                        {/* Analysis title */}
                        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.75 }}>
                            <Tooltip arrow placement="top" title={`Anomaly and utilization pattern analysis for the selected ${metric || 'utilization'} resource over the last ${ANALYSIS_WINDOW_DAYS} days.`}>
                                <Typography sx={{ fontSize: 13, fontWeight: 800, color: NAVY, display: 'inline-block', cursor: 'help' }}>
                                    {`${metric || 'Utilization'} Analysis`}
                                </Typography>
                            </Tooltip>
                            <Tooltip
                                arrow
                                placement="bottom-start"
                                componentsProps={{ tooltip: { sx: { maxWidth: 360, fontSize: 11, lineHeight: 1.5, p: 1.25 } } }}
                                title={
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                                        <span><strong>What this page shows.</strong> It analyzes the selected resource's {(metric || 'utilization').toLowerCase()} over the last {ANALYSIS_WINDOW_DAYS} days and highlights unusual behavior and capacity trends.</span>
                                        <span><strong>What is an anomaly?</strong> A point where the actual utilization deviated significantly from the expected value the model learned from the resource's normal pattern. Each anomaly is scored by <em>confidence</em> (how sure the model is) and <em>severity</em> (how large the deviation is) — High, Medium or Low.</span>
                                        <span><strong>Trend</strong> (disk only) shows the direction utilization is heading, its daily slope, and the projected days until it reaches 90%.</span>
                                        <span><strong>Weekly pattern summary</strong> groups anomalies by weekday and time of day — Morning (6–10am), Business (10am–6pm) and Evening (6pm–6am) — so recurring problem windows stand out. The busiest weekday is flagged as "Peak".</span>
                                        <span><strong>Utilization distribution</strong> shows how the 10-minute samples spread across 0–100% usage bands. If everything stays low, the resource may be over-provisioned and a downsizing hint appears.</span>
                                        <span><strong>Anomaly timeline</strong> lists every anomaly (most recent first) with its weekday, so it lines up with the weekly summary. Use the chips to filter by severity.</span>
                                    </Box>
                                }
                            >
                                <InfoOutlinedIcon sx={{ fontSize: 15, color: MUTED, cursor: 'help' }} />
                            </Tooltip>
                        </Stack>

                        {/* Resource selector */}
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                            <Typography sx={{ fontSize: 11, fontWeight: 700, color: MUTED, minWidth: 56 }}>Resource</Typography>
                            <Autocomplete
                                size="small"
                                fullWidth
                                disableClearable
                                disabled={records.length <= 1}
                                options={resourceOptions}
                                value={records[selectedIdx] ? { idx: selectedIdx, label: optionLabel(records[selectedIdx]) } : null}
                                isOptionEqualToValue={(opt, val) => opt.idx === val.idx}
                                getOptionLabel={(opt) => (opt && opt.label) || ''}
                                onChange={(_, val) => { if (val) setSelectedIdx(val.idx); }}
                                renderInput={(params) => (
                                    <TextField {...params} placeholder="Search resource…" sx={{ '& .MuiInputBase-input': { fontSize: 12, py: '6px !important' } }} />
                                )}
                                renderOption={(props, opt) => (
                                    <li {...props} key={opt.idx} style={{ fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.label}</span>
                                        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flexShrink: 0 }}>
                                            {metric === 'Disk' && opt.trendState === 'increasing' && (
                                                <Tooltip arrow placement="top" title="Disk utilization is trending upward for this resource.">
                                                    <TrendingUpIcon sx={{ fontSize: 16, color: '#D97706' }} />
                                                </Tooltip>
                                            )}
                                            <Chip
                                                size="small"
                                                label={opt.count}
                                                sx={{
                                                    height: 18, fontSize: 10, fontWeight: 700, flexShrink: 0,
                                                    color: opt.count > 0 ? '#DC2626' : '#166534',
                                                    bgcolor: opt.count > 0 ? '#FEECEC' : '#E6F4EA',
                                                    '& .MuiChip-label': { px: 0.6 },
                                                }}
                                            />
                                        </Stack>
                                    </li>
                                )}
                                sx={{ '& .MuiOutlinedInput-root': { py: 0 } }}
                            />
                        </Stack>
                        {selected.TimeGenerated && (
                            <Tooltip arrow placement="top" title="The date this analysis run was generated by the backend extractor.">
                                <Typography sx={{ fontSize: 10, color: MUTED, mb: 0.5, display: 'inline-block', cursor: 'help' }}>
                                    Analyzed {fmtTs(selected.TimeGenerated, 'MMM D, YYYY')}
                                </Typography>
                            </Tooltip>
                        )}

                        {/* Disk trend + slope (disk only — the extractor emits trend for disk) */}
                        {metric === 'Disk' && trend && trend.state && (
                          <>
                            <SectionTitle hint="Projected direction of disk utilization over the last 30 days, its daily rate of change (slope), and the estimated number of days until it reaches 90%.">
                                Trend
                            </SectionTitle>
                            <Box sx={{ width: '60%', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.75, mb: 0.5 }}>
                                <Paper variant="outlined" sx={{ p: 0.75, borderRadius: 1.5, borderColor: BORDER }}>
                                    <Typography sx={{ fontSize: 9, color: MUTED, mb: 0.25 }}>Direction</Typography>
                                    <TrendBadge trend={trend} />
                                </Paper>
                                <Paper variant="outlined" sx={{ p: 1, borderRadius: 1.5, borderColor: BORDER }}>
                                    <Typography sx={{ fontSize: 9, color: MUTED, mb: 0.25 }}>Slope / day</Typography>
                                    <Tooltip arrow placement="top" title="Average daily rate of change in disk utilization (linear regression slope). Positive means it is filling up over time; negative means it is freeing up.">
                                        <Typography sx={{ fontSize: 13, fontWeight: 800, color: TEXT, lineHeight: 1, pt: 0.5, display: 'inline-block', cursor: 'help' }}>{fmt(trend.slope, 3)}%</Typography>
                                    </Tooltip>
                                </Paper>
                                {trend['days to 90%'] != null && (
                                    <Paper variant="outlined" sx={{ p: 1, borderRadius: 1.5, borderColor: '#FCA5A5', bgcolor: '#FEF2F2' }}>
                                        <Typography sx={{ fontSize: 9, color: MUTED, mb: 0.25 }}>Days to 90%</Typography>
                                        <Tooltip arrow placement="top" title="Projected number of days until disk utilization reaches 90%, based on the current slope. Lower means action is needed sooner.">
                                            <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#DC2626', lineHeight: 1, pt: 0.5, display: 'inline-block', cursor: 'help' }}>{fmt(trend['days to 90%'], 0)}</Typography>
                                        </Tooltip>
                                    </Paper>
                                )}
                            </Box>
                          </>
                        )}

                        {/* 1. Weekly breach summary (threshold breaches) */}
                        <SectionTitle hint="For each weekday over the last 30 days, how many threshold breaches occurred (utilization crossed the high-usage cutoff - ≥90%) — split by time of day: morning (6–10am), business hours (10am–6pm) and evening (6pm–6am).">
                            Weekly breach summary
                        </SectionTitle>
                        {hasBreachData ? (
                            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' }, gap: 1 }}>
                                {breachWeeklySummary.map((r) => (
                                    <WeeklyDayCard key={r.day} day={r.day} morning={r.morning} business={r.business} evening={r.evening} daysSeen={r.daysSeen} daysTotal={r.daysTotal} isPeak={r.isPeak} />
                                ))}
                            </Box>
                        ) : (
                            <EmptyState
                                title="No threshold breaches"
                                subtitle="Utilization stayed below the high-usage threshold on every weekday during this window."
                            />
                        )}

                        {/* 2. Utilization distribution + downsizing note */}
                        <SectionTitle hint="How the resource's 10-minute utilization samples are spread across usage bands over the last 30 days.">
                            Utilization distribution
                        </SectionTitle>
                        {rangeData.some((r) => r.count > 0) ? (
                            <Box sx={{ height: 190, width: '100%' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={rangeData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EEF0F4" />
                                        <XAxis dataKey="band" tick={{ fontSize: 9.5, fill: MUTED }} axisLine={{ stroke: BORDER }} tickLine={false} />
                                        <YAxis allowDecimals={false} domain={[0, 4500]} tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
                                        <RTooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: `1px solid ${BORDER}` }} formatter={(v) => [`${v} samples`, 'Count']} />
                                        <Bar dataKey="count" name="Samples" radius={[3, 3, 0, 0]}>
                                            {rangeData.map((r) => (
                                                <Cell key={r.key} fill={r.lo >= 90 ? '#DC2626' : r.lo >= 70 ? '#D97706' : NAVY} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </Box>
                        ) : (
                            <EmptyState title="No utilization samples" subtitle="No samples were recorded for this resource during the window." />
                        )}
                        {allBelow50 && (
                            <Alert
                                severity="info"
                                icon={false}
                                sx={{ mt: 0.5, py: 0.5, px: 1, fontSize: 11.5, bgcolor: '#EEF3FC', color: NAVY, border: `1px solid ${BORDER}`, '& .MuiAlert-message': { py: 0.5 } }}
                            >
                                All {metric || 'utilization'} samples stayed below 50% over the last {ANALYSIS_WINDOW_DAYS} days{maxBand ? ` (peak reached the ${maxBand.band}% band)` : ''} — this resource looks over-provisioned. Consider downsizing the {resourceType} configuration.
                            </Alert>
                        )}
                    </>
                )}
            </Box>
        </Drawer>
    );
};

export default PatternInsightsPane;
