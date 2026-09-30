import React, {useEffect,useState,useMemo,useRef,useLayoutEffect,useCallback} from "react";
import {Grid,Paper,Checkbox,TextField,Autocomplete,ListItemText,Typography,IconButton,useTheme,useMediaQuery,Tooltip,Box,Tabs,Tab} from "@mui/material";
import { Select, MenuItem, Popover, Button, Card } from "@mui/material";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
import CircularProgress from "@mui/material/CircularProgress";
import TimelineIcon from "@mui/icons-material/Timeline";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ComputerIcon from "@mui/icons-material/Computer";
import ListAltOutlinedIcon from "@mui/icons-material/ListAltOutlined";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import BarChartOutlinedIcon from "@mui/icons-material/BarChartOutlined";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import SwapVertIcon from "@mui/icons-material/SwapVert";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import {setPreferredTimezone} from "../../shared/Timestamp/PreferenceConversion";
import { logPageVisit,startPageTracking,appInsights } from '../appInsights'; // Import the function
import { useNavigate, useLocation } from 'react-router-dom';
import { getUrl } from '../../../environment';
import { fetchWarningEvents } from '../../shared/APIs/fetchAPIs';
import CircularProgress_Styled from '../../shared/UI Components/CircularProgress';
import { styled } from '@mui/material/styles';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { BatterySaverOutlined } from "@mui/icons-material";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);


const StyledCard = styled(Card)({
  width: '100%',
  boxShadow: '0px 3px 6px rgba(0, 0, 0, 0.16)',
  padding: 4,
  position: 'relative',
});


const BakingNow = ({ appInsights, preferredTZ, date }) => {
  var baseUrl = getUrl();
  // baseUrl = "http://127.0.0.1:5000/api/"
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  var location = useLocation();

  // Read URL query params (e.g. from LeadershipSummary navigation)
  const urlParams = useMemo(() => {
    const sp = new URLSearchParams(location.search);
    const params = {
      startTime: sp.get('startTime'),  // UTC "YYYY-MM-DD HH:mm:ss"
      endTime: sp.get('endTime'),      // UTC "YYYY-MM-DD HH:mm:ss"
      appCI: sp.get('appCI'),
      incidentNumber: sp.get('incidentNumber'),
    };
    console.log('[BakingNow] URL params from LeadershipSummary:', params);
    return params;
  }, [location.search]);

  // Build time range params for API calls
  // Priority: URL params > date picker > default 24h
  const getTimeRangeParams = () => {
    // 1. URL query params from LeadershipSummary (already in UTC)
    if (urlParams.startTime && urlParams.endTime) {
      const startUTC = new Date(urlParams.startTime + 'Z');
      const endUTC = new Date(urlParams.endTime + 'Z');
      if (!isNaN(startUTC.getTime()) && !isNaN(endUTC.getTime())) {
        const diffHours = Math.max(1, Math.ceil((endUTC.getTime() - startUTC.getTime()) / (1000 * 60 * 60)));
        console.log('[BakingNow] Using URL time range:', { startTime: startUTC.toISOString(), endTime: endUTC.toISOString(), hours: diffHours });
        return { startTime: startUTC.toISOString(), endTime: endUTC.toISOString(), hours: diffHours };
      }
    }
    // 2. Date picker selection (only when not navigated from LeadershipSummary)
    if (date && date.startDate && date.endDate) {
      const startLA = dayjs.tz(date.startDate, 'YYYY-MM-DD hh:mm:ss A', 'America/Los_Angeles');
      const endLA = dayjs.tz(date.endDate, 'YYYY-MM-DD hh:mm:ss A', 'America/Los_Angeles');
      if (startLA.isValid() && endLA.isValid()) {
        const startUTC = startLA.utc().toISOString();
        const endUTC = endLA.utc().toISOString();
        const diffHours = Math.max(1, Math.ceil(endLA.diff(startLA, 'hour', true)));
        return { startTime: startUTC, endTime: endUTC, hours: diffHours };
      }
    }
    // Default: last 24 hours
    const now = new Date();
    const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return { startTime: start.toISOString(), endTime: now.toISOString(), hours: 24 };
  };
  
  useEffect(() => {
    startPageTracking(window.location.href);
    return () => {
        logPageVisit();      
        if (appInsights) {
            appInsights.flush();
            console.log('[Page] Flushed telemetry on unmount.');
        }
    };
  }, [location]);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const startTime = searchParams.get('startTime');
    const endTime = searchParams.get('endTime');
    const appCI = searchParams.get('appCI');
    const incidentNumber = searchParams.get('incidentNumber');
 
    if (startTime || endTime || appCI || incidentNumber) {
      // console.log('=== BakingNow: URL Parameters Received ===');
      // console.log('Start Time:', startTime);
      // console.log('End Time:', endTime);
      // console.log('App CI:', appCI);
      // console.log('Incident Number:', incidentNumber);
 
    }
  }, [location.search]);


  const DonutChart = ({ segments, total, size = 128, stroke = 10, centerText, onSegmentClick, onHoverChange }) => {
    
    const [hoverIdx, setHoverIdx] = useState(null);
    const padding = 5;
    const radius = size / 2 - padding;
    const cx = size / 2;
    const cy = size / 2;

    return (
    <Box sx={{ position: 'relative', width: size, height: size, overflow: { xs: 'hidden', sm: 'visible' } }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <defs>
            {/* subtle hover glow */}
            <filter id="pieGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur" />
              <feOffset in="blur" dx="0" dy="0" result="offset" />
              <feMerge>
                <feMergeNode in="offset" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {(() => {
            if (total <= 0) {
              return <circle cx={cx} cy={cy} r={radius} fill="#e5e7eb" />;
            }
            const positive = segments.filter(s => (s.value || 0) > 0);
            if (positive.length === 0) {
              return <circle cx={cx} cy={cy} r={radius} fill="#e5e7eb" />;
            }
            const fmtPercent = (v) => `${Math.round(((v || 0) / total) * 100)}%`;
            const approxTextWidth = (text, fontSize) => (text?.length || 0) * fontSize * 0.55;
            if (positive.length === 1 && (positive[0].value || 0) === total) {
              const isHover = hoverIdx === 0;
              const seg = positive[0];
              const percent = fmtPercent(seg.value);
              const scale = isHover ? 1.02 : 1; // subtler hover scale
              // Full circle: choose a label that fits roughly within circle width
              const baseFont = 12;
              const maxWidth = radius * 1.6; // inside circle, leave side padding
              const fullVariants = [
                `${seg.label}: ${percent} (${seg.value})`,
                `${seg.label}: ${percent}`,
                `${percent}`,
                `${seg.value}`
              ];
              let fullText = '';
              for (const t of fullVariants) {
                if (approxTextWidth(t, baseFont) <= maxWidth) { fullText = t; break; }
              }
              return (
                <g
                  onMouseLeave={() => { setHoverIdx(null); onHoverChange && onHoverChange(null); }}
                  style={{
                    transform: `translate(${cx}px, ${cy}px) scale(${scale}) translate(${-cx}px, ${-cy}px)`,
                    transformOrigin: `${cx}px ${cy}px`,
                    transition: 'transform 120ms ease-in-out'
                  }}
                >
                  <circle
                    cx={cx}
                    cy={cy}
                    r={radius}
                    fill={seg.color}
                    onMouseEnter={() => { setHoverIdx(0); onHoverChange && onHoverChange({ label: seg.label, value: seg.value, percent: fmtPercent(seg.value) }); }}
                    onClick={() => {
                      if (onSegmentClick) onSegmentClick({ label: seg.label, value: seg.value, color: seg.color, index: 0 });
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                </g>
              );
            }
            {
              const rawAngles = positive.map((s) => ((s.value || 0) / total) * 2 * Math.PI);
              const MIN_ARC_PX = 3.5; // tweakable: ~3.5px arc length for visibility
              const EPS = MIN_ARC_PX / radius; // convert to radians based on current radius
              const adjustedAngles = rawAngles.map((a, i) => ((positive[i].value || 0) > 0 ? Math.max(a, EPS) : 0));
              const sumAdjusted = adjustedAngles.reduce((acc, a) => acc + a, 0);
              const scale = sumAdjusted > 0 ? (2 * Math.PI) / sumAdjusted : 1;
              const finalAngles = adjustedAngles.map((a) => a * scale);

              const parts = [];
              let accAngle = -Math.PI / 2;
              for (let i = 0; i < positive.length; i++) {
                const seg = positive[i];
                const value = seg.value || 0;
                const angle = finalAngles[i];
                const startAngle = accAngle;
                const midAngle = startAngle + angle / 2;
                parts.push({ seg, idx: i, value, angle, startAngle, midAngle, rawAngle: rawAngles[i] });
                accAngle += angle;
              }

              const NUDGE_DEG = Math.PI / 20; // ~9 degrees, subtler nudge
              return parts.map((part) => {
                const { seg, idx, value, angle, startAngle, midAngle } = part;
                const isHover = hoverIdx === idx;
                const x1 = cx + radius * Math.cos(startAngle);
                const y1 = cy + radius * Math.sin(startAngle);
                const x2 = cx + radius * Math.cos(startAngle + angle);
                const y2 = cy + radius * Math.sin(startAngle + angle);
                const largeArc = angle > Math.PI ? 1 : 0;
                const d = [
                  `M ${cx} ${cy}`,
                  `L ${x1} ${y1}`,
                  `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
                  'Z'
                ].join(' ');

                const ratio = angle / (2 * Math.PI);
                const percent = fmtPercent(value);
                // Adjust label radius and font size for small slices to keep text inside
                let fontSize = 11;
                if (ratio < 0.06) fontSize = 8;
                else if (ratio < 0.1) fontSize = 9;
                else if (ratio < 0.15) fontSize = 10;
                let labelR = radius * 0.62;
                if (ratio < 0.12) labelR = radius * 0.5;
                if (ratio < 0.06) labelR = radius * 0.42;

                // Compute outward offset direction away from the larger neighbor
                const prev = parts[(idx - 1 + parts.length) % parts.length];
                const next = parts[(idx + 1) % parts.length];
                const awayFromNext = (next?.angle || 0) >= (prev?.angle || 0);
                const nudgeDir = midAngle + (awayFromNext ? -NUDGE_DEG : NUDGE_DEG);
                const scale = isHover ? 1.02 : 1; // subtler hover scale
                const offset = isHover ? 6 : 0; // smaller outward offset
                const dx = Math.cos(nudgeDir) * offset;
                const dy = Math.sin(nudgeDir) * offset;

                return (
                  <g
                    key={idx}
                    onMouseLeave={() => { setHoverIdx(null); onHoverChange && onHoverChange(null); }}
                    style={{
                      transform: `translate(${cx}px, ${cy}px) translate(${dx}px, ${dy}px) scale(${scale}) translate(${-cx}px, ${-cy}px)`,
                      transformOrigin: `${cx}px ${cy}px`,
                      transition: 'transform 120ms ease-in-out'
                    }}
                  >
                    <path
                      d={d}
                      fill={seg.color}
                      stroke="#ffffff"
                      strokeWidth={(part.rawAngle || 0) < EPS ? 2 : 1}
                      filter={isHover ? 'url(#pieGlow)' : undefined}
                      onMouseEnter={() => { setHoverIdx(idx); onHoverChange && onHoverChange({ label: seg.label, value, percent: fmtPercent(value) }); }}
                      onClick={() => {
                        if (onSegmentClick) onSegmentClick({ label: seg.label, value, color: seg.color, index: idx });
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                  </g>
                );
              });
            }
          })()}
        </svg>    
      </Box>
    );
  };

  const DonutCard = ({ title, counts, single = false, singleColor = '#ef4444', singleLabel = 'Incidents', onSelect, eventType, customSegments, customTotal }) => {
    const success = counts.Success || 0;
    const failed = counts.Failed || 0;
    const warning = counts.Warning || 0;
    const total = success + failed + warning;
    const segments = customSegments || (single
      ? [{ label: singleLabel, color: singleColor, value: total }]
      : (
          eventType === 'Patch'
            ? [
                { label: 'Success', color: '#22c55e', value: success },
                { label: 'Failed', color: '#ef4444', value: failed },
              ]
            : [
                { label: 'Success', color: '#22c55e', value: success },
                { label: 'In Progress', color: '#eab308', value: warning },
                { label: 'Failed', color: '#ef4444', value: failed },
              ]
        ));
    const totalForChart = customTotal != null
      ? customTotal
      : (customSegments
          ? customSegments.reduce((acc, s) => acc + (s.value || 0), 0)
          : (eventType === 'Patch' ? (success + failed) : total));

    const [hoverInfo, setHoverInfo] = useState(null); // {label, value, percent}
    const theme = useTheme();
    const isSm = useMediaQuery(theme.breakpoints.down('sm'));
    const isMd = useMediaQuery(theme.breakpoints.down('md'));
    const isLgUp = useMediaQuery(theme.breakpoints.up('lg'));
    const isXlUp = useMediaQuery(theme.breakpoints.up('xl'));
    // Dynamically size pie based on its cell width to keep a near-constant visual gap
    const pieCellRef = useRef(null);
    const [chartSize, setChartSize] = useState(104);
    useEffect(() => {
      if (!pieCellRef.current) return;
      const el = pieCellRef.current;
      let timerId = null;
      const compute = () => {
        const w = el.offsetWidth || 0;
        if (!w) return;
        const marginFrac = isSm ? 0.04 : 0.055; 
        const minMarginPx = 6; 
        const targetMargin = Math.max(minMarginPx, Math.round(w * marginFrac));
          
        const minSize = 68;
        const maxSize = isSm ? 88 : (isMd ? 128 : (isXlUp ? 160 : 144));
            const desired = w - 2 * targetMargin;
            const clamped = Math.max(minSize, Math.min(desired, maxSize));
            const rounded = Math.round(clamped);
            // Tolerance of 3px to prevent oscillation during continuous resize
            setChartSize(prev => Math.abs(prev - rounded) <= 3 ? prev : rounded);
      };
      compute();
      const ro = new ResizeObserver(() => {
        if (timerId) clearTimeout(timerId);
        timerId = setTimeout(compute, 150);
      });
      ro.observe(el);
      return () => { ro.disconnect(); if (timerId) clearTimeout(timerId); };
    }, [isSm, isMd, isXlUp]);
    const chartStroke = isSm ? 8 : isMd ? 9 : (isXlUp ? 11 : 10);
    const cardMinHeight = { xs: 84, sm: 96, md: 104, lg: 112, xl: 120 };

    return (
    <Paper 
      sx={{ 
        p: { xs: 0.25, sm: 0.375, md: 0.5 }, 
        borderRadius: 2, 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'stretch', 
        gap: { xs: 0.25, sm: 0.375, md: 0.5 }, 
        height: '100%', 
        minHeight: cardMinHeight, 
        border: '2px solid #e2e8f0', 
        backgroundColor: '#ffffff',
        boxShadow: '0 12px 24px rgba(2, 8, 20, 0.18), 0 6px 12px rgba(2, 8, 20, 0.12), 0 0 0 1px rgba(2, 8, 20, 0.06)',
        transition: 'box-shadow 200ms ease',
        '&:hover': {
          boxShadow: '0 20px 36px rgba(2, 8, 20, 0.22), 0 10px 20px rgba(2, 8, 20, 0.15), 0 0 0 1px rgba(2, 8, 20, 0.08)'
        }
      }} 
      variant="outlined"
    >
        {/* Header row: title left, legend right */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: { xs: 0.5, sm: 0.5, md: 0.5 }, gap: { xs: 0.5, sm: 0.5, md: 0.5 } }}>
          <Typography 
            variant="caption" 
            sx={{ 
              fontWeight: 700,
              color: '#475569',
              textTransform: 'none',
              letterSpacing: 0,
              fontSize: { xs: '0.625rem', sm: '0.6875rem', md: '0.75rem' }
            }}
          >
            {title}
          </Typography>
        </Box>
    {/* Content row: MUI Grid with fixed 3:2 proportion (pie:hover) across breakpoints */}
    <Grid container columns={{ xs: 5, sm: 5, md: 5 }} spacing={0.25} alignItems="center">
      <Grid item xs={3} sm={3} md={3} ref={pieCellRef} sx={{ display: 'flex', alignItems: 'center', justifyContent: { xs: 'flex-start', md: 'center' } }}>
        <DonutChart
          segments={segments}
          total={totalForChart}
          size={chartSize}
          stroke={chartStroke}
          onHoverChange={(info) => setHoverInfo(info)}
          onSegmentClick={(seg) => {
            if (!onSelect) return;
            if (customSegments && eventType === 'Major Incident') {
              onSelect({ eventType, miSeverity: seg.label });
              return;
            }
            if (customSegments && eventType === 'Early Warning') {
              onSelect({ eventType, ewStatus: seg.label });
              return;
            }
            if (single) {
              onSelect({ eventType, status: null });
            } else {
              onSelect({ eventType, status: seg.label });
            }
          }}
        />
      </Grid>
    <Grid item xs={2} sm={2} md={2} sx={{ p: 0.25, borderRadius: 1, backgroundColor: '#f8fafc', overflow: 'hidden', textAlign: 'center', ml: 0, borderLeft: '1px solid #e5e7eb' }}>
            {hoverInfo ? (
              <>
                <Typography variant="caption" sx={{ fontWeight: 700, color: '#334155', fontSize: { xs: '0.5625rem', sm: '0.625rem', md: '0.6875rem' } }}>{hoverInfo.label}</Typography>
                <Typography variant="caption" sx={{ display: 'block', color: '#0f172a', fontSize: { xs: '0.5625rem', sm: '0.625rem', md: '0.6875rem' } }}>{hoverInfo.value} • {hoverInfo.percent}</Typography>
                <Typography variant="caption" sx={{ display: 'block', color: '#64748b', fontSize: { xs: '0.5625rem', sm: '0.6125rem', md: '0.675rem' } }}>Click to filter table</Typography>
              </>
            ) : (
              <>
                <Typography variant="caption" sx={{ fontWeight: 700, color: '#334155', fontSize: { xs: '0.5625rem', sm: '0.625rem', md: '0.6875rem' } }}>Total</Typography>
                <Typography variant="caption" sx={{ display: 'block', color: '#0f172a', fontSize: { xs: '0.5625rem', sm: '0.625rem', md: '0.6875rem' } }}>{totalForChart}</Typography>
              </>
            )}
          </Grid>
        </Grid>
        {/* Legend row below hover panel to improve spacing (hidden on xs to reduce height) */}
        <Grid container columns={{ xs: 5, sm: 10, md: 10 }} spacing={0} alignItems="center" sx={{ display: { xs: 'none', sm: 'flex' } }}>
          <Grid item xs={3} sm={4} md={4} />
          <Grid item xs={2} sm={6} md={6}>
            <Box sx={{ display: 'flex', flexWrap: 'nowrap', justifyContent: 'flex-end', alignItems: 'center', gap: { xs: 0.25, sm: 0.375, md: 0.5 }, mt: { xs: 0.125, sm: 0.125, md: 0.125 } }}>
              {segments.map((s, idx) => (
                <Box key={idx} sx={{ display: 'inline-flex', alignItems: 'center', gap: { xs: 0.25, sm: 0.375, md: 0.375 } }}>
                  <Box sx={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: s.color }} />
                  <Typography 
                    variant="caption" 
                    sx={{ color: '#334155', fontWeight: 700, fontSize: { xs: '0.5625rem', sm: '0.625rem', md: '0.6875rem' }, whiteSpace: 'nowrap' }}
                  >
                    {s.label}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Grid>
        </Grid>
      </Paper>
    );
  };

  const InlineSummaryPies = ({ events, onSelect }) => {
    // Build counts for Backup, Patch, Change based on status color buckets
    const counts = useMemo(() => computeInlineCounts(events || []), [events]);

    const miSegments = useMemo(() => computeMiSegments(events || []), [events]);
    const ewSegments = useMemo(() => computeEwSegments(events || []), [events]);

    const backupTotal = counts.Backup.Success + counts.Backup.Warning + counts.Backup.Failed;
    const patchTotal = counts.Patch.Success + counts.Patch.Warning + counts.Patch.Failed;
    const changeTotal = counts.Change.Success + counts.Change.Warning + counts.Change.Failed;
    const miTotal = miSegments.total;
    const ewTotal = ewSegments.total;

    return (
      <Grid 
        container 
        spacing={2} 
        alignItems="stretch"
        columns={{ xs: 1, sm: 2, md: 5 }} 
        sx={{ mb: 0.5 }}
      >
        {backupTotal > 0 && (
          <Grid item xs={1} sm={1} md={1}>
            <DonutCard title="Backup" counts={counts.Backup} eventType="Backup" onSelect={onSelect} />
          </Grid>
        )}
        {patchTotal > 0 && (
          <Grid item xs={1} sm={1} md={1}>
            <DonutCard title="Patch" counts={counts.Patch} eventType="Patch" onSelect={onSelect} />
          </Grid>
        )}
        {changeTotal > 0 && (
          <Grid item xs={1} sm={1} md={1}>
            <DonutCard title="Change" counts={counts.Change} eventType="Change" onSelect={onSelect} />
          </Grid>
        )}
        {miTotal > 0 && (
          <Grid item xs={1} sm={1} md={1}>
            <DonutCard 
              title="Major Incidents" 
              counts={{}} 
              eventType="Major Incident" 
              onSelect={onSelect} 
              customSegments={miSegments.segs} 
              customTotal={miTotal} 
            />
          </Grid>
        )}
        {ewTotal > 0 && (
          <Grid item xs={1} sm={1} md={1}>
            <DonutCard 
              title="Early Warning" 
              counts={{}} 
              eventType="Early Warning" 
              onSelect={onSelect} 
              customSegments={ewSegments.segs} 
              customTotal={ewTotal} 
            />
          </Grid>
        )}
      </Grid>
    );
  };

  const getStatusColor = (color) => {
    const normalizedColor = (color || "").toLowerCase();
    if (normalizedColor === "green") return "#22c55e";
    if (normalizedColor === "red") return "#ef4444";
    return "#eab308"; // yellow
  };

  const getStatusLabel = (color) => {
    const normalizedColor = (color || "").toLowerCase().trim();
    if (normalizedColor === "green") return "Success";
    if (normalizedColor === "red") return "Failed";
    return "In Progress";
  };

  // Normalize to buckets used in pies/filters
  const getStatusBucket = (event) => getStatusLabel(event.color);

  // Apply text filter based on operator
  const applyOp = (haystack, needle, op) => {
    const h = String(haystack || '').toLowerCase();
    const n = String(needle || '').toLowerCase();
    if (!n) return true;
    switch (op) {
      case 'equals':
        return h === n;
      case 'starts':
        return h.startsWith(n);
      case 'ends':
        return h.endsWith(n);
      case 'contains':
      default:
        return h.includes(n);
    }
  };

  // Helper: does event message match selected MI severity?
  const matchesMiSeverity = (event, sev) => {
    if (event.eventType !== 'Major Incident') return false;
    const msg = String(event.message || event.description || '').toLowerCase();
    if (sev === 'Other') {
      return !(/mi\s*1/i.test(msg) || /mi\s*2/i.test(msg) || /mi\s*3/i.test(msg));
    }
    const re = new RegExp(`mi\\s*${sev.replace(/mi/i, '')}`, 'i');
    if (sev.toUpperCase() === 'MI1') return /mi\s*1/i.test(msg);
    if (sev.toUpperCase() === 'MI2') return /mi\s*2/i.test(msg);
    if (sev.toUpperCase() === 'MI3') return /mi\s*3/i.test(msg);
    return false;
  };

  // Compute a unified effective time for sorting (overall time)
  const getEffectiveTime = (e) => {
    const isChange = e.eventType === 'Change';
    const statusLabel = getStatusLabel(e.color).toLowerCase();
    if (isChange && statusLabel.includes('progress')) {
      return (e.startTime ?? e.endTime ?? 0) || 0;
    }
    return (e.endTime ?? e.startTime ?? 0) || 0;
  };

  // Build filtered + sorted events in one place
  const buildProcessedEvents = (events, columnFilters, columnOps, quickFilter, sortConfig) => {
    let filtered = [...events];

    // Quick filter from pies
    if (quickFilter) {
      if (quickFilter.eventType) {
        filtered = filtered.filter(e => e.eventType === quickFilter.eventType);
        if (quickFilter.eventType === 'Major Incident' && quickFilter.miSeverity) {
          filtered = filtered.filter(e => matchesMiSeverity(e, quickFilter.miSeverity));
        } else if (quickFilter.eventType === 'Early Warning' && quickFilter.ewStatus) {
          filtered = filtered.filter(e => (e.rawStatus || '').toLowerCase() === quickFilter.ewStatus.toLowerCase());
        } else if (quickFilter.status) {
          filtered = filtered.filter(e => getStatusBucket(e) === quickFilter.status);
        }
      } else {
        // Status-only or Applications-only quick filter (from KPI cards)
        if (quickFilter.status) {
          filtered = filtered.filter(e => getStatusBucket(e) === quickFilter.status);
        }
        if (quickFilter.hasApp) {
          filtered = filtered.filter(e => (e.applicationCIs?.length || 0) > 0);
        }
      }
    }

    // Column-wise filters
    const cf = columnFilters;
    const co = columnOps;
    if (cf.applicationCI) {
      filtered = filtered.filter(event => applyOp(event.applicationCIs?.join(", ") || "", cf.applicationCI, co.applicationCI));
    }
    if (cf.serverName) {
      filtered = filtered.filter(event => applyOp(event.serverName || "", cf.serverName, co.serverName));
    }
    if (cf.eventType) {
      filtered = filtered.filter(event => applyOp(event.eventType || "", cf.eventType, co.eventType));
    }
    if (cf.message) {
      filtered = filtered.filter(event => applyOp(event.message || "", cf.message, co.message));
    }
    if (cf.status) {
      filtered = filtered.filter(event => {
        const displayStatus = (event.eventType === "Early Warning" && event.rawStatus) ? event.rawStatus : getStatusLabel(event.color);
        return applyOp(displayStatus || "", cf.status, co.status);
      });
    }

    // Sorting
    filtered.sort((a, b) => {
      let aVal, bVal;
      switch (sortConfig.key) {
        case 'startTime':
          aVal = getEffectiveTime(a);
          bVal = getEffectiveTime(b);
          break;
        case 'applicationCI':
          aVal = (a.applicationCIs?.[0] || "").toLowerCase();
          bVal = (b.applicationCIs?.[0] || "").toLowerCase();
          break;
        case 'serverName':
          aVal = (a.serverName || "").toLowerCase();
          bVal = (b.serverName || "").toLowerCase();
          break;
        case 'eventType':
          aVal = (a.eventType || "").toLowerCase();
          bVal = (b.eventType || "").toLowerCase();
          break;
        case 'status':
          aVal = (a.eventType === "Early Warning" && a.rawStatus) ? a.rawStatus : getStatusLabel(a.color);
          bVal = (b.eventType === "Early Warning" && b.rawStatus) ? b.rawStatus : getStatusLabel(b.color);
          break;
        default:
          return 0;
      }
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  };

  // Aggregate header KPIs
  const computeKpis = (events = []) => {
    const total = events.length;
    let failed = 0, warning = 0, success = 0;
    for (const e of events) {
      const c = String(e.color || '').toLowerCase();
      if (c === 'red') failed++;
      else if (c === 'yellow') warning++;
      else if (c === 'green') success++;
    }
    return { total, failed, warning, success };
  };

  // Quick filter label formatter
  const formatQuickFilterLabel = (qf) => {
    if (!qf) return '';
    const base = qf.eventType || (qf.hasApp ? 'Applications' : '');
    const parts = [];
    if (base) parts.push(base);
    if (qf.status) parts.push(qf.status);
    if (qf.miSeverity) parts.push(qf.miSeverity);
    if (qf.ewStatus) parts.push(qf.ewStatus);
    return parts.join(' = ');
  };

  // Toggle logic for quick filter selection from pies
  const handleQuickSelect = (prev, sel) => {
    const sameType = prev && prev.eventType === sel.eventType;
    const sameStatus = 'status' in sel ? prev?.status === sel.status : false;
    const sameMi = 'miSeverity' in sel ? prev?.miSeverity === sel.miSeverity : false;
    const sameEw = 'ewStatus' in sel ? prev?.ewStatus === sel.ewStatus : false;
    if (sameType && (sameStatus || sameMi || sameEw)) return null; // re-click same wedge => clear
    return sel; // different wedge or type => apply directly
  };

  // Inline pies helpers
  const computeInlineCounts = (events = []) => {
    const base = { Success: 0, Warning: 0, Failed: 0 };
    const out = { Backup: { ...base }, Patch: { ...base }, Change: { ...base } };
    for (const e of events) {
      const type = e.eventType;
      if (!out[type]) continue;
      const label = getStatusLabel(e.color);
      if (label === 'Success') out[type].Success++;
      else if (label === 'Failed') out[type].Failed++;
      else out[type].Warning++;
    }
    return out;
  };

  const computeEwSegments = (events = []) => {
    let newCount = 0, acknowledged = 0, resolved = 0;
    for (const e of events) {
      if (e.eventType !== 'Early Warning') continue;
      const s = (e.rawStatus || '').toLowerCase();
      if (s === 'resolved') resolved++;
      else if (s === 'acknowledged') acknowledged++;
      else newCount++;
    }
    const segs = [];
    if (resolved) segs.push({ label: 'Resolved', color: '#22c55e', value: resolved });
    if (acknowledged) segs.push({ label: 'Acknowledged', color: '#eab308', value: acknowledged });
    if (newCount) segs.push({ label: 'New', color: '#ef4444', value: newCount });
    return { segs, total: newCount + acknowledged + resolved };
  };

  const computeMiSegments = (events = []) => {
    let mi1 = 0, mi2 = 0, mi3 = 0, other = 0;
    for (const e of events) {
      if (e.eventType !== 'Major Incident') continue;
      const msg = String(e.message || e.description || '').toLowerCase();
      if (/mi\s*1/.test(msg)) mi1++;
      else if (/mi\s*2/.test(msg)) mi2++;
      else if (/mi\s*3/.test(msg)) mi3++;
      else other++;
    }
    const segs = [];
    if (mi1) segs.push({ label: 'MI1', color: '#ef4444', value: mi1 });
    if (mi2) segs.push({ label: 'MI2', color: '#f97316', value: mi2 });
    if (mi3) segs.push({ label: 'MI3', color: '#eab308', value: mi3 });
    if (other) segs.push({ label: 'Other', color: '#64748b', value: other });
    return { segs, total: mi1 + mi2 + mi3 + other };
  };



  const EventsTable = ({ events, isLoading, preferredTZ, initialAppCIFilter = "" }) => {
    const theme = useTheme();
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const HEADER_H = 30; 
    const [columnFilters, setColumnFilters] = useState({applicationCI: initialAppCIFilter,serverName: "",eventType: "",message: "",status: ""});
    const [columnOps, setColumnOps] = useState({applicationCI: "contains",serverName: "contains",eventType: "contains",message: "contains",status: "contains"});
    const [quickFilter, setQuickFilter] = useState(null); // { eventType: string, status: 'Success'|'In Progress'|'Failed'|null }
    const [filterAnchors, setFilterAnchors] = useState({applicationCI: null,serverName: null,eventType: null,message: null,status: null});
    const [sortConfig, setSortConfig] = useState({ key: 'startTime', direction: 'desc' });
    
    // Dynamic rows-per-page based on available viewport height
    const tableBoxRef = useRef(null);
    const theadRef = useRef(null);
    const tbodyRef = useRef(null);
    const paginationRef = useRef(null);
    const rowsPerPageRef = useRef(rowsPerPage);
    rowsPerPageRef.current = rowsPerPage;

    const recalcRowsPerPage = useCallback(() => {
      try {
        if (!tableBoxRef.current) return;
        const viewportH = window.innerHeight || document.documentElement.clientHeight;
        const boxRect = tableBoxRef.current.getBoundingClientRect();
        const paginationH = paginationRef.current?.offsetHeight || 0;
        const headerH = HEADER_H;

        // Available vertical space for data rows inside the table box
        const availableForRows = Math.max(0, viewportH - boxRect.top - paginationH);

        // Measure a row height from the first rendered row
        const firstRow = tbodyRef.current?.querySelector('tr');
        const rowH = firstRow?.offsetHeight || 40; // fallback if no rows yet

        if (rowH > 0) {
          const possible = Math.floor((availableForRows - headerH) / rowH);
          const next = Number.isFinite(possible) ? Math.max(5, Math.min(possible, 100)) : 10;
          // Only update if difference is > 1 row to prevent oscillation
          if (Math.abs(next - rowsPerPageRef.current) > 1) {
            setRowsPerPage(next);
            setPage(0);
          }
        }
      } catch (e) {
        console.warn('recalcRowsPerPage failed', e);
      }
    }, []);
    useEffect(() => {
      recalcRowsPerPage();
      let timerId = null;
      const onResize = () => {
        if (timerId) clearTimeout(timerId);
        timerId = setTimeout(recalcRowsPerPage, 200);
      };
      window.addEventListener('resize', onResize);
      const ro = new ResizeObserver(onResize);
      if (tableBoxRef.current) ro.observe(tableBoxRef.current);
      if (paginationRef.current) ro.observe(paginationRef.current);

      // Recalc after paint (helps when content just mounted)
      const raf1 = requestAnimationFrame(() => recalcRowsPerPage());

      return () => {
        window.removeEventListener('resize', onResize);
        ro.disconnect();
        cancelAnimationFrame(raf1);
        if (timerId) clearTimeout(timerId);
      };
    }, [recalcRowsPerPage, isLoading]);

    // Handle sorting
    const handleSort = (key) => {
      setSortConfig(prevConfig => ({
        key,
        direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
      }));
    };

    // Filter and sort events
    const processedEvents = useMemo(() => {
      return buildProcessedEvents(events, columnFilters, columnOps, quickFilter, sortConfig);
    }, [events, columnFilters, columnOps, sortConfig, quickFilter]);

    const paginatedEvents = useMemo(() => {
      const start = page * rowsPerPage;
      return processedEvents.slice(start, start + rowsPerPage);
    }, [processedEvents, page, rowsPerPage]);

    useEffect(() => {
      if (isLoading) return;
      const id1 = requestAnimationFrame(() => recalcRowsPerPage());
      return () => {
        cancelAnimationFrame(id1);
      };
    }, [isLoading, processedEvents.length, recalcRowsPerPage]);

    useEffect(() => {
      setPage(0);
    }, [events.length,rowsPerPage,columnFilters.applicationCI,columnFilters.serverName,columnFilters.eventType,columnFilters.message,columnFilters.status]);

    const getSortIconComp = (columnKey) => {
      if (sortConfig.key !== columnKey) return (
        <SwapVertIcon sx={{ fontSize: '0.9rem', color: '#94a3b8' }} />
      );
      return sortConfig.direction === 'asc'
        ? <ArrowUpwardIcon sx={{ fontSize: '0.9rem', color: '#475569' }} />
        : <ArrowDownwardIcon sx={{ fontSize: '0.9rem', color: '#475569' }} />;
    };

    // Format exact timestamp in preferred timezone
    const formatExactTimestamp = (ts) => {
      if (!ts) return "—";
      const d = new Date(ts);
      const options = { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: preferredTZ };
      const formatted = d.toLocaleString('en-US', options).replace(',', '');
      const tzAbbr = preferredTZ === 'Asia/Kolkata' ? 'IST' : 'PST';
      return `${formatted} ${tzAbbr}`;
    };

    // Relative time for tooltip
    const formatRelativeUnified = (ts) => {
      if (!ts) return "";
      const now = Date.now();
      const diffMs = Math.max(0, now - ts);
      const mins = Math.floor(diffMs / 60000);
      const hours = Math.floor(diffMs / 3600000);
      if (mins < 1) return 'just now';
      if (mins < 60) return `${mins} min ago`;
      if (hours < 24) return `${hours} hr ago`;
      const days = Math.floor(diffMs / 86400000);
      return days === 1 ? '1 day ago' : `${days} days ago`;
    };

    // --- KPIs for header ---
    const kpis = useMemo(() => computeKpis(events), [events]);

    const handleKpiClick = (type) => {
      setQuickFilter(prev => {
        if (type === 'all') return null; // show full data
        if (type === 'failed') {
          // toggle if already status-only Failed
          if (!prev?.eventType && prev?.status === 'Failed') return null;
          return { status: 'Failed' };
        }
        if (type === 'inprogress') {
          if (!prev?.eventType && prev?.status === 'In Progress') return null;
          return { status: 'In Progress' };
        }
        if (type === 'success') {
          if (!prev?.eventType && prev?.status === 'Success') return null;
          return { status: 'Success' };
        }
        return prev;
      });
      setPage(0);
    };

    // Reusable header with filter popover and optional sort
    const renderFilterHeader = ({ label, sortKey, columnKey, popoverMinWidth = 240 }) => (
      <th 
        style={{ textAlign: "left", padding: "0 14px",height: HEADER_H,fontWeight: 700, color: "#ffffff",cursor: "default",userSelect: "none"}}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)"}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: '#ffffff', fontSize: { xs: '0.625rem', sm: '0.6875rem', md: '0.75rem' } }}>
            {label}
          </Typography>
          {sortKey && (
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); handleSort(sortKey); }}
              sx={{ ml: 0.25, color: '#ffffff', width: 22, height: 22 }}
            >
              {getSortIconComp(sortKey)}
            </IconButton>
          )}
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); setFilterAnchors(a => ({ ...a, [columnKey]: e.currentTarget })); }}
            sx={{ ml: 0.5, color: '#ffffff', width: 26, height: 26 }}
          >
            <FilterAltIcon fontSize="inherit" />
          </IconButton>
          <Popover
            open={Boolean(filterAnchors[columnKey])}
            anchorEl={filterAnchors[columnKey]}
            onClose={() => setFilterAnchors(a => ({ ...a, [columnKey]: null }))}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
          >
            <Box sx={{ p: 1, minWidth: popoverMinWidth }}>
              <Typography variant="caption" sx={{ display: 'block', mb: 0.5, color: '#334155', fontWeight: 600 }}>{label} Filter</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Select
                  value={columnOps[columnKey]}
                  onChange={(e) => setColumnOps(o => ({ ...o, [columnKey]: e.target.value }))}
                  size="small"
                  sx={{ height: 28, minHeight: 28, fontSize: '0.75rem' }}
                  MenuProps={{
                    PaperProps: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } }
                  }}
                >
                  <MenuItem value="contains">Contains</MenuItem>
                  <MenuItem value="equals">Equals</MenuItem>
                  <MenuItem value="starts">Starts</MenuItem>
                  <MenuItem value="ends">Ends</MenuItem>
                </Select>
                <TextField
                  value={columnFilters[columnKey]}
                  onChange={(e) => setColumnFilters(f => ({ ...f, [columnKey]: e.target.value }))}
                  placeholder="Search…"
                  size="small"
                  sx={{ flex: 1, '& .MuiInputBase-root': { height: 28, minHeight: 28 }, '& .MuiInputBase-input': { py: 0, fontSize: '0.75rem' } }}
                />
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                <Button size="small" onClick={() => { setColumnFilters(f => ({ ...f, [columnKey]: '' })); }} sx={{ textTransform: 'none', fontSize: '0.75rem' }}>Clear</Button>
                <Button size="small" variant="contained" onClick={() => setFilterAnchors(a => ({ ...a, [columnKey]: null }))} sx={{ ml: 1, textTransform: 'none', fontSize: '0.75rem' }}>Close</Button>
              </Box>
            </Box>
          </Popover>
        </Box>
      </th>
    );

    // --- Reusable row cell renderers ---
    const tdBase = { padding: '6px 8px', fontSize: '0.75rem', overflow: 'hidden' };
    const tdText = { ...tdBase, color: '#374151' };
    const tdServer = { ...tdBase, color: '#6b7280', fontFamily: 'monospace' };
    const tdTime = { ...tdBase, color: '#1f2937', fontWeight: 500 };

    const renderApplicationCiCell = (event) => (
      <td style={tdText}>
        <Tooltip title={event.applicationCIs?.join(", ") || "—"}>
          <Typography 
            variant="body2" 
            sx={{ 
              fontWeight: 500, 
              fontSize: { xs: '0.625rem', sm: '0.6875rem', md: '0.75rem' },
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            {event.applicationCIs?.join(", ") || "—"}
          </Typography>
        </Tooltip>
      </td>
    );

    const renderServerCell = (event) => (
      <td style={tdServer}>
        {event.serverName ? (
          <Tooltip title={event.serverName} arrow>
            <Typography 
              variant="body2" 
              sx={{ 
                fontSize: { xs: '0.625rem', sm: '0.6875rem', md: '0.75rem' }, 
                color: "#6b7280", 
                fontFamily: "monospace",
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {event.serverName}
            </Typography>
          </Tooltip>
        ) : (
          "—"
        )}
      </td>
    );

    const renderEventTypeCell = (event) => (
      <td style={{ ...tdText, fontWeight: 600 }}>
        <Typography 
          variant="body2" 
          sx={{ 
            fontWeight: 600,
            fontSize: { xs: '0.625rem', sm: '0.6875rem', md: '0.75rem' },
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {event.eventType}
        </Typography>
      </td>
    );

    const renderStatusCell = (event) => (
      <td style={{ ...tdBase }}>
        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
          <Box sx={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: getStatusColor(event.color) }} />
          <Typography 
            variant="body2" 
            sx={{ 
              color: getStatusColor(event.color),
              fontWeight: 700,
              fontSize: { xs: '0.5625rem', sm: '0.625rem', md: '0.6875rem' },
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            {(event.eventType === "Early Warning" && event.rawStatus) ? event.rawStatus : getStatusLabel(event.color)}
          </Typography>
        </Box>
      </td>
    );

    const renderMessageCell = (event) => (
      <td style={tdText}>
        <Tooltip title={event.message || ''}>
          <Typography 
            variant="body2" 
            sx={{ 
              fontSize: { xs: '0.5625rem', sm: '0.625rem', md: '0.6875rem' },
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            {event.message}
          </Typography>
        </Tooltip>
      </td>
    );

    const renderTimeCell = (event) => {
      const isChange = event.eventType === 'Change';
      const statusLabel = getStatusLabel(event.color).toLowerCase();
      const ts = (isChange && statusLabel.includes('progress')) ? event.startTime : (event.endTime ?? event.startTime);
      const exactTime = formatExactTimestamp(ts);
      const relativeTime = formatRelativeUnified(ts);
      return (
        <td style={tdTime}>
          <Tooltip title={relativeTime || ''} arrow>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <AccessTimeIcon sx={{ fontSize: '0.9rem', color: '#64748b' }} />
              <Typography variant="body2" sx={{ fontSize: { xs: '0.5625rem', sm: '0.625rem', md: '0.6875rem' }, color: '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {exactTime}
              </Typography>
            </Box>
          </Tooltip>
        </td>
      );
    };

    return (
      <Paper elevation={3} sx={{p: 3,borderRadius: 3,backgroundColor: "#f5f5f5",width: "100%",display: "flex",flexDirection: "column",boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)"}}>
        {/* Header Section */}
        <Box sx={{ mb: 2.5 }}>
          <Grid container alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
            <Grid item xs={12} md={6}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <BarChartOutlinedIcon sx={{ color: '#2563eb' }} />
                <Box>
                  <Typography
                    variant="subtitle2"
                    sx={{ fontWeight: 800, color: '#0f172a', display: 'block' }}
                  >
                    Application & Infra Events
                  </Typography>
                </Box>
              </Box>
            </Grid>
            <Grid item xs={12} md={6}>
              <Grid container spacing={0.75} justifyContent={{ xs: 'flex-start', md: 'flex-end' }}>
                <Grid item>
                  <Button 
                    onClick={() => handleKpiClick('all')} 
                    variant="outlined"
                    sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 0.75, 
                      px: 1, 
                      py: 0.5, 
                      borderRadius: 1.5, 
                      bgcolor: '#eff6ff', 
                      border: '1px solid #dbeafe',
                      textTransform: 'none',
                      '&:hover': {
                        bgcolor: '#dbeafe',
                        border: '1px solid #bfdbfe'
                      }
                    }}
                  >
                    <ListAltOutlinedIcon sx={{ fontSize: 16, color: '#1d4ed8' }} />
                    <Typography variant="caption" sx={{ color: '#1e40af', fontWeight: 700 }}>{kpis.total}</Typography>
                    <Typography variant="caption" sx={{ color: '#1e40af' }}>Events</Typography>
                  </Button>
                </Grid>
                <Grid item>
                  <Button 
                    onClick={() => handleKpiClick('failed')} 
                    variant="outlined"
                    sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 0.75, 
                      px: 1, 
                      py: 0.5, 
                      borderRadius: 1.5, 
                      bgcolor: '#fef2f2', 
                      border: '1px solid #fee2e2',
                      textTransform: 'none',
                      '&:hover': {
                        bgcolor: '#fee2e2',
                        border: '1px solid #fecaca'
                      }
                    }}
                  >
                    <WarningAmberIcon sx={{ fontSize: 16, color: '#b91c1c' }} />
                    <Typography variant="caption" sx={{ color: '#991b1b', fontWeight: 700 }}>{kpis.failed}</Typography>
                    <Typography variant="caption" sx={{ color: '#991b1b' }}>Failed</Typography>
                  </Button>
                </Grid>
                <Grid item>
                  <Button 
                    onClick={() => handleKpiClick('inprogress')} 
                    variant="outlined"
                    sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 0.75, 
                      px: 1, 
                      py: 0.5, 
                      borderRadius: 1.5, 
                      bgcolor: '#fff7ed', 
                      border: '1px solid #ffedd5',
                      textTransform: 'none',
                      '&:hover': {
                        bgcolor: '#ffedd5',
                        border: '1px solid #fed7aa'
                      }
                    }}
                  >
                    <TimelineIcon sx={{ fontSize: 16, color: '#c2410c' }} />
                    <Typography variant="caption" sx={{ color: '#9a3412', fontWeight: 700 }}>{kpis.warning}</Typography>
                    <Typography variant="caption" sx={{ color: '#9a3412' }}>In Progress</Typography>
                  </Button>
                </Grid>
                <Grid item>
                  <Button 
                    onClick={() => handleKpiClick('success')} 
                    variant="outlined"
                    sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 0.75, 
                      px: 1, 
                      py: 0.5, 
                      borderRadius: 1.5, 
                      bgcolor: '#f0fdf4', 
                      border: '1px solid #dcfce7',
                      textTransform: 'none',
                      '&:hover': {
                        bgcolor: '#dcfce7',
                        border: '1px solid #bbf7d0'
                      }
                    }}
                  >
                    <CheckCircleIcon sx={{ fontSize: 16, color: '#15803d' }} />
                    <Typography variant="caption" sx={{ color: '#166534', fontWeight: 700 }}>{kpis.success}</Typography>
                    <Typography variant="caption" sx={{ color: '#166534' }}>Success</Typography>
                  </Button>
                </Grid>
              </Grid>
            </Grid>
          </Grid>
          {/* Inline pies under header */}
          <InlineSummaryPies
            events={events}
            onSelect={(sel) => {
              setQuickFilter(prev => handleQuickSelect(prev, sel));
              // Reset to first page whenever quick filter changes
              setPage(0);
            }}
          />
          {/* Active filter chips: quick filter + column filters (always above the table) */}
          <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            {quickFilter && (
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, px: 1, py: 0.5, borderRadius: 1, backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0' }}>
                <Typography 
                  variant="caption" 
                  sx={{ fontWeight: 600, color: '#334155', fontSize: { xs: '0.6875rem', sm: '0.75rem', md: '0.8125rem' } }}
                >
                  Filter:
                </Typography>
                <Typography 
                  variant="caption" 
                  sx={{ color: '#1f2937', fontSize: { xs: '0.6875rem', sm: '0.75rem', md: '0.8125rem' } }}
                >
                  {formatQuickFilterLabel(quickFilter)}
                </Typography>
                <IconButton size="small" onClick={() => setQuickFilter(null)} sx={{ p: 0.25 }}>
                  ✕
                </IconButton>
              </Box>
            )}

            {Object.entries(columnFilters)
              .filter(([key, val]) => Boolean(val && String(val).trim().length > 0))
              .map(([key, val]) => {
                const labelMap = {
                  applicationCI: 'Application CI',
                  serverName: 'Server',
                  eventType: 'Event Type',
                  message: 'Event Message',
                  status: 'Status',
                };
                const opLabelMap = {
                  contains: 'contains',
                  equals: 'equals',
                  starts: 'starts',
                  ends: 'ends',
                };
                const label = labelMap[key] || key;
                const opLabel = opLabelMap[columnOps[key]] || columnOps[key];
                return (
                  <Box key={`cf-${key}`} sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, px: 1, py: 0.5, borderRadius: 1, backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0' }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: '#334155', fontSize: { xs: '0.6875rem', sm: '0.75rem', md: '0.8125rem' } }}>
                      {label}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#64748b', fontSize: { xs: '0.6875rem', sm: '0.75rem', md: '0.8125rem' } }}>
                      {opLabel}:
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#1f2937', fontSize: { xs: '0.6875rem', sm: '0.75rem', md: '0.8125rem' }, maxWidth: 240, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {String(val)}
                    </Typography>
                    <IconButton size="small" onClick={() => setColumnFilters(f => ({ ...f, [key]: '' }))} sx={{ p: 0.25 }}>
                      ✕
                    </IconButton>
                  </Box>
                );
              })}
          </Box>
        </Box>

        {isLoading ? (
          <StyledCard sx={{borderRadius: 2, margin:1}}>
            <Grid container xs={12} justifyContent="center" alignItems="center" sx={{ minHeight: 200, height:'100%', display: 'flex' }}>
              <CircularProgress_Styled loadingWhat="Loading Application and Infra Events" fetchingFor="Fetching Backup, Change Requests, Patch Compliance, Major Incidents, Early Warnings..."/>
            </Grid>
          </StyledCard>
        ) : (
          <>
            <Box ref={tableBoxRef} sx={{ border: "1px solid #e5e7eb", borderRadius: 2, overflow: "hidden",boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)",mt: 0.5}}>
              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                {/* Adjusted widths to give more space to Event Message */}
                <colgroup>
                  <col style={{ width: "15%" }} />
                  <col style={{ width: "15%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "28%" }} />
                  <col style={{ width: "14%" }} />
                </colgroup>
                <thead ref={theadRef}>
                  <tr style={{backgroundColor: theme.palette.primary.main,borderBottom: "2px solid #e2e8f0",height: HEADER_H}}>
                    {renderFilterHeader({ label: 'Application CI', sortKey: 'applicationCI', columnKey: 'applicationCI', popoverMinWidth: 240 })}
                    {renderFilterHeader({ label: 'Resource', sortKey: 'serverName', columnKey: 'serverName', popoverMinWidth: 240 })}
                    {renderFilterHeader({ label: 'Event Type', sortKey: 'eventType', columnKey: 'eventType', popoverMinWidth: 240 })}
                    {renderFilterHeader({ label: 'Status', sortKey: 'status', columnKey: 'status', popoverMinWidth: 240 })}
                    {renderFilterHeader({ label: 'Event Message', sortKey: null, columnKey: 'message', popoverMinWidth: 280 })}
                    
                    <th 
                      style={{textAlign: "left", padding: "0 14px",height: HEADER_H,fontWeight: 700, color: "#ffffff",cursor: "default",userSelect: "none",transition: "background-color 0.2s"}}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)"}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                    >
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: '#ffffff', fontSize: { xs: '0.625rem', sm: '0.6875rem', md: '0.75rem' } }}>
                          Time
                        </Typography>
                        <IconButton
                          size="small"
                          onClick={(e) => { e.stopPropagation(); handleSort('startTime'); }}
                          sx={{ ml: 0.25, color: '#ffffff', width: 22, height: 22 }}
                        >
                          {getSortIconComp('startTime')}
                        </IconButton>
                      </Box>
                    </th>
                  </tr>
                </thead>
                <tbody ref={tbodyRef}>
                  {paginatedEvents.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: "16px", textAlign: "center", color: "#6b7280", backgroundColor: "#f9fafb" }}>
                        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                          <WarningAmberIcon sx={{ fontSize: "1rem", color: "#9ca3af" }} />
                          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: { xs: '0.75rem', sm: '0.8125rem', md: '0.875rem' }, color: "#6b7280" }}>
                            No Events Found
                          </Typography>
                        </Box>
                        <Typography variant="caption" sx={{ display: 'block', color: "#9ca3af", mt: 0.5, fontSize: { xs: '0.625rem', sm: '0.6875rem', md: '0.75rem' } }}>
                          {Object.values(columnFilters).some(v => v) ? "Try adjusting your filters" : "No events in the selected time range"}
                        </Typography>
                      </td>
                    </tr>
                  ) : paginatedEvents.map((event, idx) => (
                    <tr
                      key={event.id}
                      style={{
                        borderBottom: "1px solid #f3f4f6",
                        backgroundColor: "#ffffff",
                        transition: "all 0.2s ease",
                        cursor: "pointer"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "#f0f9ff";
                        e.currentTarget.style.transform = "scale(1.002)";
                        e.currentTarget.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.08)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "#ffffff";
                        e.currentTarget.style.transform = "scale(1)";
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    >
                      {renderApplicationCiCell(event)}
                      {renderServerCell(event)}
                      {renderEventTypeCell(event)}
                      {renderStatusCell(event)}
                      {renderMessageCell(event)}
                      {renderTimeCell(event)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>

            {/* Pagination */}
            <Box ref={paginationRef} sx={{display: "grid",gridTemplateColumns: "1fr auto 1fr",alignItems: "center", mt: 2.5,pt: 2,borderTop: "1px solid #e5e7eb"}}>
              <Typography variant="caption" sx={{ gridColumn: 1, color: "#6b7280", fontWeight: 500, fontSize: { xs: '0.625rem', sm: '0.688rem', md: '0.75rem' } }}>
                {processedEvents.length > 0
                  ? `Showing ${page * rowsPerPage + 1} - ${Math.min((page + 1) * rowsPerPage, processedEvents.length)} of ${processedEvents.length} events`
                  : `0 events`}
              </Typography>
              
              <Box sx={{ gridColumn: 2, display: "flex", alignItems: "center", gap: 1 }}>
                <IconButton
                  size="small"
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                  sx={{
                    backgroundColor: page === 0 ? "#f3f4f6" : "#3b82f6",
                    color: page === 0 ? "#9ca3af" : "#ffffff",
                    "&:hover": {
                      backgroundColor: page === 0 ? "#f3f4f6" : "#2563eb"
                    },
                    borderRadius: 1.5,
                    width: 26,
                    height: 26
                  }}
                >
                  <ArrowBackIosNewIcon sx={{ fontSize: "0.75rem" }} />
                </IconButton>
                
                <Box sx={{px: 1.25, py: 0.25, borderRadius: 1, backgroundColor: "#f8fafc",border: "1px solid #e2e8f0"}}>
                  <Typography variant="caption" sx={{ color: "#1e293b", fontWeight: 600, fontSize: { xs: '0.625rem', sm: '0.688rem', md: '0.75rem' } }}>
                    {processedEvents.length > 0 ? (page + 1) : 0} / {processedEvents.length > 0 ? Math.ceil(processedEvents.length / rowsPerPage) : 0}
                  </Typography>
                </Box>

                <IconButton
                  size="small"
                  disabled={(page + 1) * rowsPerPage >= processedEvents.length}
                  onClick={() => setPage(p => p + 1)}
                  sx={{
                    backgroundColor: (page + 1) * rowsPerPage >= processedEvents.length ? "#f3f4f6" : "#3b82f6",
                    color: (page + 1) * rowsPerPage >= processedEvents.length ? "#9ca3af" : "#ffffff",
                    "&:hover": {
                      backgroundColor: (page + 1) * rowsPerPage >= processedEvents.length ? "#f3f4f6" : "#2563eb"
                    },
                    borderRadius: 1.5,
                    width: 26,
                    height: 26
                  }}
                >
                  <ArrowForwardIosIcon sx={{ fontSize: "0.75rem" }} />
                </IconButton>
              </Box>
            </Box>
          </>
        )}
      </Paper>
    );
  };


  const aggregateByServerAndTime = (events) => {
    const map = new Map();
    events.forEach(e => {
      const key = [
        e.serverName || "APP",
        e.eventType,
        e.startTime,
        e.endTime,
        e.eventType === "Early Warning" ? e.id : ""
      ].join("|");
      if (!map.has(key)) {
        map.set(key, { ...e, applicationCIs: new Set([e.applicationCI]) });
      } else {
        map.get(key).applicationCIs.add(e.applicationCI);
      }
    });
    return Array.from(map.values()).map(e => ({
      ...e,
      applicationCIs: Array.from(e.applicationCIs)
    }));
  };


  const parseUTC = (ts) => {
    if (!ts) return null;
    let cleanedTs = ts;
    const fractionalSecondsMatch = ts.match(/\.(\d{3})\d+/);
    if (fractionalSecondsMatch) {
      cleanedTs = ts.replace(/\.(\d{3})\d+/, '.$1');
    }
    const timestamp = new Date(cleanedTs).getTime();
    if (isNaN(timestamp)) {
      console.error("Failed to parse timestamp:", ts, "cleaned:", cleanedTs);
      return null;
    }
    return timestamp;
  };


  const determineEventColor = (eventType, status, startTime, endTime) => {
    const statusLower = (status || "").toLowerCase().trim();
    const hasValidStart = startTime && !isNaN(startTime);
    const hasValidEnd = endTime && !isNaN(endTime);
    switch (eventType) {
      case "Major Incident":
        return "red";
      case "Change":
        {
          const now = Date.now();
          if (hasValidEnd) {
            // If end time is in the past, consider it completed unless cancelled/failed
            if (endTime <= now) {
              if (statusLower.includes("failed") || statusLower.includes("canceled") || statusLower.includes("cancelled")) return "red";
              return "green";
            }
            // End time in the future: still in progress/scheduled
            return "yellow";
          }
          // No end time: initiated/in progress
          if (hasValidStart && !hasValidEnd) return "yellow";
          return "yellow";
        }
      case "Backup":
        // Prioritize explicit failure/success over missing timestamps
        if (statusLower.includes("fail") || statusLower.includes("error")) return "red";
        if (statusLower.includes("complete") || statusLower === "successful" || statusLower === "success") return "green";
        if (!hasValidEnd) return "yellow";
        return "yellow";
      case "Patch":
        if (statusLower === "installed") return "green";
        if (statusLower === "not installed") return "red";
        return "yellow";
      case "Early Warning":
        if (statusLower === "resolved") return "green";
        if (statusLower === "acknowledged") return "yellow";
        if (statusLower === "new") return "red";
        return "yellow";
      default:
        return "yellow";
    }
  };

  const determineEventMessage = (eventType, status, startTime, endTime, extraData = {}) => {
    const statusLower = (status || "").toLowerCase();
    switch (eventType) {
      case "Major Incident":
        return "Major Incident";
      case "Change":
        const objectName = "Change";
        {
          const fmtShort = (ts) => {
            try {
              return new Intl.DateTimeFormat("en-US", {
                month: "short",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false
              }).format(ts);
            } catch {
              return "";
            }
          };
          const now = Date.now();
          // In progress without end time
          if (startTime && !endTime) return `${objectName} in progress`;
          if (endTime) {
            if (endTime <= now) {
              if (statusLower.includes("failed") || statusLower.includes("canceled") || statusLower.includes("cancelled")) return `${objectName} failed`;
              return `${objectName} completed`;
            }
            // Future end time: if started, still in progress, else scheduled
            if (startTime && startTime <= now) return `${objectName} in progress`;
            return `${objectName} scheduled`;
          }
          return `${objectName} ${status}`;
        }
      case "Backup":
        if (!endTime) return "Backup initiated";
        if (statusLower === "completed") return "Backup completed";
        if (statusLower === "failed") return "Backup failed";
        return `Backup ${status}`;
      case "Patch":
        // Prefer collection name in message brackets; fallback to patch window if collection missing
        const collection = extraData.collection || extraData.patchWindow || "";
        if (statusLower === "installed") return `Patch installed (${collection})`;
        if (statusLower === "not installed") return `Patch not installed (${collection})`;
        return `Patch status unknown (${collection})`;
      case "Early Warning":
        return status || "Early Warning";
      default:
        return status || "Unknown";
    }
  };

  const fetchBackupEvents = async (timeRange) => {
    const r = await fetch(baseUrl + "infraEvents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startTime: timeRange.startTime,
        endTime: timeRange.endTime,
        eventType: "Backup"
      })
    });

    const d = await r.json();
    console.log("The backup data is", d);
    return (d.Data || []).map((e, i) => {
      // console.log(`[Backup ${i}] RAW from backend:`, {
      //   server: e.serverName,
      //   startTime: e.startTime,
      //   endTime: e.endTime,
      //   backupStatus: e.backupStatus
      // });

      const parsedStart = parseUTC(e.startTime);
      const parsedEnd = e.endTime ? parseUTC(e.endTime) : null;
      const color = determineEventColor("Backup", e.backupStatus, parsedStart, parsedEnd);
      const message = determineEventMessage("Backup", e.backupStatus, parsedStart, parsedEnd);

      return {
        id: `backup-${i}`,
        eventType: "Backup",
        serverName: e.serverName,
        applicationCI: e.applicationCI,
        startTime: parsedStart,
        endTime: parsedEnd,
        color,
        message,
        rawStatus: e.backupStatus
      };
    });
  };

  const fetchChangeEvents = async (timeRange) => {
    const r = await fetch(baseUrl + "downtimeEvents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hours: timeRange.hours,
        eventType: "Change"
      })
    });

    const d = await r.json();

    return (d.Data || []).map((e, i) => {
      // console.log(`[Change ${i}] RAW from backend:`, {
      //   number: e.number,
      //   startTime: e.startTime,
      //   endTime: e.endTime,
      //   status: e.status
      // });

    // Parse timestamps to UTC epoch for consistency
    const parsedStart = e.startTime ? parseUTC(e.startTime) : null;
    const parsedEnd = e.endTime ? parseUTC(e.endTime) : null;
      
      const color = determineEventColor("Change", e.status, parsedStart, parsedEnd);
      const message = determineEventMessage("Change", e.status, parsedStart, parsedEnd);

      // console.log(`[Change ${i}] Color determination:`, {
      //   status: e.status,
      //   startTime: e.startTime,
      //   endTime: e.endTime,
      //   parsedStart,
      //   parsedEnd,
      //   determinedColor: color
      // });

      return {
        id: `change-${i}`,
        eventType: "Change",
        serverName: null,
        applicationCI: e.applicationCI,
        startTime: parsedStart,
        endTime: parsedEnd,
        color,
        message,
        rawStatus: e.status,
        number: e.number,
        description: e.description
      };
    });
  };



  const fetchMajorIncidentEvents = async (timeRange) => {
    const r = await fetch(baseUrl + "downtimeEvents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hours: timeRange.hours,
        eventType: "Major Incident"
      })
    });

    const d = await r.json();

    return (d.Data || []).map((e, i) => {
      // console.log(`[Major Incident ${i}] RAW from backend:`, {
      //   number: e.number,
      //   startTime: e.startTime,
      //   endTime: e.endTime,
      //   status: e.status
      // });

    const parsedStart = e.startTime ? parseUTC(e.startTime) : null;
    const parsedEnd = e.endTime ? parseUTC(e.endTime) : null;
      
    const color = determineEventColor("Major Incident", e.status, parsedStart, parsedEnd);
    const backendMsg = e.description || e.message || null;
    const message = backendMsg || determineEventMessage("Major Incident", e.status, parsedStart, parsedEnd);

      // console.log(`[Major Incident ${i}] Color determination:`, {
      //   status: e.status,
      //   startTime: e.startTime,
      //   endTime: e.endTime,
      //   parsedStart,
      //   parsedEnd,
      //   determinedColor: color
      // });

      return {
        id: `mi-${i}`,
        eventType: "Major Incident",
        serverName: null,
        applicationCI: e.applicationCI,
        startTime: parsedStart,
        endTime: parsedEnd,
        color,
        message,
        rawStatus: e.status,
        number: e.number,
        description: e.description
      };
    });
  };

  const fetchPatchEvents = async (timeRange) => {
    try {
      const r = await fetch(baseUrl + "infraEvents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startTime: timeRange.startTime, endTime: timeRange.endTime, eventType: "Patch" })
      });

      if (!r.ok) {
        console.warn("Failed to fetch Patch events from infraEvents");
        return [];
      }

      const d = await r.json();
      return (d.Data || []).map((e, i) => {
        // Patch has date-only; prefer startTime, fallback to timestamp
        const parsedStart = e.startTime ? parseUTC(e.startTime) : (e.timestamp ? parseUTC(e.timestamp) : null);
        const status = e.patchStatus || e.status || "";
        const color = determineEventColor("Patch", status, parsedStart, null);
        const message = determineEventMessage("Patch", status, parsedStart, null, { collection: e.collection || "", patchWindow: e.patchWindow || e.window || "" });

        return {
          id: `patch-${i}`,
          eventType: "Patch",
          serverName: e.serverName || null,
          applicationCI: e.applicationCI || null,
          startTime: parsedStart,
          endTime: null,
          color,
          message,
          rawStatus: status
        };
      });
    } catch (err) {
      console.error("PatchEvents (infraEvents) error:", err);
      return [];
    }
  };

  const fetchEarlyWarningEvents = async (timeRange) => {
    try {
      // Backend expects "YYYY-MM-DD HH:mm:ss" format, not ISO with T/Z
      const formatForBackend = (isoStr) => {
        if (!isoStr) return '';
        return isoStr.replace('T', ' ').replace(/\.\d{3}Z$/, '').replace('Z', '');
      };
      const params = {
        startTime: formatForBackend(timeRange.startTime),
        endTime: formatForBackend(timeRange.endTime),
      };
      const raw = await fetchWarningEvents(null, params);
      // raw is column-oriented JSON from pandas: {"col": {"0": val, ...}, ...}
      if (!raw || typeof raw !== 'object') return [];

      const timeGenCol = raw["Time Generated"] || {};
      const resourceNameCol = raw["Resource Name"] || {};
      const appCICol = raw["Application CI"] || {};
      const resourceTypeCol = raw["Resource Type"] || {};
      const metricsCol = raw["Metrics Impacted"] || {};
      const conditionCol = raw["Condition"] || {};
      const statusCol = raw["Status"] || {};

      const keys = Object.keys(timeGenCol);

      return keys.map((k, i) => {
        const timeGen = timeGenCol[k];
        const rawResourceName = resourceNameCol[k] || "";
        const resourceType = (resourceTypeCol[k] || "").toLowerCase();
        const appCI = appCICol[k] || "";
        const metrics = metricsCol[k] || "";
        const condition = conditionCol[k] || "";
        const status = statusCol[k] || "";

        // Parse resource name based on type (same logic as ChatOps getresourceDetails)
        let displayName = rawResourceName;
        if (resourceType === "windows service") {
          const parts = rawResourceName.split("-");
          const serverName = parts.slice(0, -1).join("-");
          const serviceName = parts[parts.length - 1] || "";
          displayName = serviceName ? `${serverName} - ${serviceName}` : serverName;
        } else if (resourceType === "url") {
          displayName = rawResourceName.replace(/^-+/, "").trim();
        } else if (resourceType === "corepoint interfaces") {
          displayName = rawResourceName;
        } else {
          // Path-based: subscriptionid/xxx/servername/yyy/...
          const parts = rawResourceName.split("/");
          for (let j = 0; j < parts.length - 1; j += 2) {
            const key = (parts[j] || "").toLowerCase();
            if (key === "servername" || key === "databasename" || key === "storagename" || key === "filesharename") {
              displayName = parts[j + 1] || rawResourceName;
              break;
            }
          }
        }

        const parsedStart = timeGen ? parseUTC(timeGen) : null;
        const color = determineEventColor("Early Warning", status, parsedStart, null);
        const message = condition
          ? `${metrics}: ${condition}`.trim()
          : metrics || "Early Warning";

        return {
          id: `ew-${i}`,
          eventType: "Early Warning",
          serverName: displayName || null,
          applicationCI: appCI || null,
          startTime: parsedStart,
          endTime: null,
          color,
          message,
          rawStatus: status
        };
      });
    } catch (err) {
      console.error("EarlyWarningEvents error:", err);
      return [];
    }
  };


  const loadTimelineEvents = async (preferredTZ) => {
    setPreferredTimezone(preferredTZ);
    const timeRange = getTimeRangeParams();

    const [b, c, m, p, ew] = await Promise.all([
      fetchBackupEvents(timeRange),
      fetchChangeEvents(timeRange),
      fetchMajorIncidentEvents(timeRange),
      fetchPatchEvents(timeRange),
      fetchEarlyWarningEvents(timeRange),
    ]);

    console.log('[BakingNow] Event counts — Backup:', b.length, 'Change:', c.length, 'MI:', m.length, 'Patch:', p.length, 'EarlyWarning:', ew.length, 'Total before aggregate:', b.length + c.length + m.length + p.length + ew.length);

    const converted = [...b, ...c, ...m, ...p, ...ew].map(e => {
      const startEpoch = new Date(e.startTime).getTime();   
      const endEpoch = e.endTime ? new Date(e.endTime).getTime() : null;
      
      return {
        ...e,
        startTime: startEpoch,
        endTime: endEpoch
      };
    });

    const aggregated = aggregateByServerAndTime(converted);

    // If navigated from LeadershipSummary with an appCI filter, pre-filter events
    if (urlParams.appCI) {
      const filterCI = urlParams.appCI.toLowerCase();
      return aggregated.filter(e =>
        (e.applicationCIs || []).some(ci => String(ci).toLowerCase().includes(filterCI))
      );
    }
    
    return aggregated;
  };



  const loadSeqRef = useRef(0);

  useEffect(() => {
    // Skip initial load if neither URL params nor date picker are ready yet
    const hasUrlParams = urlParams.startTime && urlParams.endTime;
    const hasDatePicker = date && date.startDate && date.endDate;
    if (!hasUrlParams && !hasDatePicker) {
      return;
    }

    const seq = ++loadSeqRef.current;
    setIsLoading(true);

    loadTimelineEvents(preferredTZ)
      .then((timelineData) => {
        // Only apply if this is still the latest request
        if (seq !== loadSeqRef.current) return;
        setTimelineEvents(timelineData);
      })
      .finally(() => {
        if (seq === loadSeqRef.current) setIsLoading(false);
      });
  }, [preferredTZ, date, urlParams.startTime, urlParams.endTime]);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', minHeight: '100vh', mx: 0, px: { xs: 2, sm: 3, md: 4 }, pt: { xs: 3, sm: 4 } }}>
        <StyledCard sx={{ borderRadius: 2, margin: 1 }}>
          <Grid container xs={12} justifyContent="center" alignItems="center" sx={{ minHeight: 200, height: '100%', display: 'flex' }}>
            <CircularProgress_Styled loadingWhat="Loading Application and Infra Events- Last 24 hours" fetchingFor="Fetching Backup, Change Requests, Patch Compliance, Major Incidents..." />
          </Grid>
        </StyledCard>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', mt: 2.5, backgroundColor: '#f8fafc', py: { xs: 1, sm: 1.25, md: 1.5 } }}>
      <Box sx={{ width: '100%', px: { xs: 1, sm: 1.25, md: 1.5 } }}>
        <EventsTable 
          events={timelineEvents} 
          isLoading={isLoading}
          preferredTZ={preferredTZ}
          initialAppCIFilter={urlParams.appCI || ""}
        />
      </Box>
    </Box>
  );
};

export default BakingNow;
