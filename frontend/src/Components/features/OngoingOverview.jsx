// ---------- SECTION 1: Imports, Constants, Helpers ----------

import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Unstable_Grid2';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Slider from '@mui/material/Slider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import CloseIcon from '@mui/icons-material/Close';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import Chip from '@mui/material/Chip';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis
} from 'recharts';

// ---------- COLORS ----------
const BLUE_MAIN = '#00338e';
const BLUE_TINT = 'rgba(0,51,142,0.08)';
const BLUE_LIGHT = '#e6ecfa';
const incidentTrendData = [
  { month: "Jan '23", incidents: 18 },
  { month: "Jun '23", incidents: 42 },
  { month: "Sep '23", incidents: 78 },
  { month: "Dec '23", incidents: 105 },
];
// ---------- SPARKLINE DATA ----------
const sparklineData = [
  { x: 0, y: 22 },
  { x: 1, y: 45 },
  { x: 2, y: 18 },
  { x: 3, y: 60 },
  { x: 4, y: 32 },
];

// ---------- SMALL CHARTS ----------

// Mini trend chart (24-hour trend)
export function MiniTrendChart({ height = 24 }) {
  // Use a fixed numeric height so Recharts' ResponsiveContainer can measure correctly
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={sparklineData} margin={{ top: 4, bottom: 0 }}>
        <Area
          type="natural"
          dataKey="y"
          stroke={BLUE_MAIN}
          fill={BLUE_TINT}
          strokeWidth={2.2}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// Mini donut chart
export function MiniDonutChart({ percent }) {
  const data = [
    { name: 'OK', value: percent },
    { name: 'Remaining', value: 100 - percent },
  ];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          cx="50%"
          cy="50%"
          innerRadius={16}
          outerRadius={24}
          stroke="none"
          startAngle={90}
          endAngle={-270}
        >
          <Cell fill="#059669" />
          <Cell fill="#e5e7eb" />
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
// ---------- SECTION 2: Data, Topology, Critical Actions, Main Shell ----------

// --- Metric definitions per tab ---

const infraMetrics = [
  {
    title: 'Servers Unavailable',
    value: '4',
    total: 127,
    subtitle: '4 Unavailable • 127 total',
    status: 'CRITICAL',
    healthy: 97,
  },
  {
    title: 'Database Unavailable',
    value: '2',
    total: 10,
    subtitle: '2 Down • 10 total',
    status: 'CRITICAL',
    healthy: 80,
  },
  {
    title: 'Ports Down',
    value: '7',
    total: 20,
    subtitle: '7 Down • 20 total',
    status: 'WARNING',
    healthy: 65,
  },
  {
    title: 'Interface Connection',
    value: '5',
    total: 25,
    subtitle: '5 Issues • 25 total',
    status: 'CRITICAL',
    healthy: 100,
  },
];

const appMetrics = [
  {
    title: 'App Validation Failures',
    value: '8',
    total: 20,
    subtitle: '8 Errors • 20 checks',
    status: 'WARNING',
    healthy: 75,
  },
  {
    title: 'Services',
    value: '12',
    total: 60,
    subtitle: '12 Degraded • 60 total',
    status: 'CRITICAL',
    healthy: 70,
  },
  {
    title: 'URLs',
    value: '3',
    total: 15,
    subtitle: '3 Failing • 15 total',
    status: 'INFO',
    healthy: 88,
  },
  {
    title: 'App Certificates',
    value: '0',
    total: 50,
    subtitle: '0 Failing • 50 total',
    status: 'NORMAL',
    healthy: 100,
  },
];

const securityMetrics = [
  {
    title: 'Tag Compliance',
    value: '5',
    total: 100,
    subtitle: '5 Non-compliant • 100 apps',
    status: 'WARNING',
    healthy: 95,
  },
  {
    title: 'Patch Compliance',
    value: '9',
    total: 120,
    subtitle: '9 Missing • 120 nodes',
    status: 'CRITICAL',
    healthy: 87,
  },
  {
    title: 'Certificates',
    value: '3',
    total: 50,
    subtitle: '3 Expiring • 50 certs',
    status: 'WARNING',
    healthy: 94,
  },
  {
    title: 'Server Backup',
    value: '1',
    total: 70,
    subtitle: '1 Failure • 70 jobs',
    status: 'CRITICAL',
    healthy: 98,
  },
];

const networkMetrics = [
  {
    title: 'Load Balancers',
    value: '0',
    total: 12,
    subtitle: 'Status view coming soon',
    status: 'NORMAL',
    healthy: 100,
  },
  {
    title: 'Firewalls',
    value: '0',
    total: 8,
    subtitle: 'Status view coming soon',
    status: 'NORMAL',
    healthy: 100,
  },
  {
    title: 'DNS',
    value: '0',
    total: 6,
    subtitle: 'Status view coming soon',
    status: 'NORMAL',
    healthy: 100,
  },
  {
    title: 'WAN Links',
    value: '0',
    total: 10,
    subtitle: 'Status view coming soon',
    status: 'NORMAL',
    healthy: 100,
  },
];

const TABS = ['Infrastructure', 'Application Layer', 'Security & Compliance', 'Network'];

function getMetricsForTab(tab) {
  switch (tab) {
    case 'Infrastructure':
      return infraMetrics;
    case 'Application Layer':
      return appMetrics;
    case 'Security & Compliance':
      return securityMetrics;
    case 'Network':
      return networkMetrics;
    default:
      return infraMetrics;
  }
}

// --- Critical Actions (top row) ---

const criticalActions = [
  {
    id: 'fix-servers',
    title: 'Fix Servers',
    subtitle: '4 Unavailable',
    button: 'Fix Servers',
    metricTitle: 'Servers Unavailable',
  },
  {
    id: 'restore-db',
    title: 'Restore Databases',
    subtitle: '2 Down',
    button: 'Restore Databases',
    metricTitle: 'Database Unavailable',
  },
  {
    id: 'investigate-services',
    title: 'Investigate Services',
    subtitle: '12 Degraded',
    button: 'Investigate Services',
    metricTitle: 'Services',
  },
  {
    id: 'resolve-validation',
    title: 'Resolve Validation Errors',
    subtitle: '8 Errors',
    button: 'Resolve Validation',
    metricTitle: 'App Validation Failures',
  },
  {
    id: 'fix-interface',
    title: 'Fix Interface Connections',
    subtitle: '5 Issues',
    button: 'Fix Actions',
    metricTitle: 'Interface Connection',
  },
  {
    id: 'restore-ports',
    title: 'Restore Ports',
    subtitle: '7 Down',
    button: 'Restore Ports',
    metricTitle: 'Ports Down',
  },
  {
    id: 'fix-backup',
    title: 'Fix Backup Failure',
    subtitle: '1 Failure',
    button: 'Fix Backup',
    metricTitle: 'Server Backup',
  },
];

// flattener to find metric for a given title when a critical card is clicked
function findMetricByTitle(title) {
  const all = [...infraMetrics, ...appMetrics, ...securityMetrics, ...networkMetrics];
  return all.find((m) => m.title === title) || null;
}

// --- Simple topology SVG (shared for all tabs) ---

function TopologyMapSvg() {
  return (
    <Box
      sx={{
        width: '100%',
        height: 130,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg width="360" height="140">
        {/* lines */}
        <line x1="70" y1="70" x2="170" y2="70" stroke="#9ca3af" strokeWidth="2" />
        <line x1="170" y1="70" x2="270" y2="70" stroke="#9ca3af" strokeWidth="2" />
        {/* circles */}
        <circle cx="70" cy="70" r="30" fill="#ffffff" stroke="#2563eb" strokeWidth="3" />
        <circle cx="170" cy="70" r="30" fill="#ffffff" stroke="#ef4444" strokeWidth="3" />
        <circle cx="270" cy="70" r="30" fill="#ffffff" stroke="#2563eb" strokeWidth="3" />
        {/* labels */}
        <text x="70" y="68" textAnchor="middle" fontSize="12" fill="#111827">
          Web
        </text>
        <text x="170" y="64" textAnchor="middle" fontSize="12" fill="#111827">
          App
        </text>
        <text x="170" y="80" textAnchor="middle" fontSize="13" fontWeight="700" fill="#ef4444">
          12 Issues
        </text>
        <text x="270" y="68" textAnchor="middle" fontSize="12" fill="#111827">
          DB
        </text>
        <text x="270" y="80" textAnchor="middle" fontSize="13" fontWeight="700" fill="#ef4444">
          Down
        </text>
      </svg>
    </Box>
  );
}

function TopologyCard() {
  return (
    <Card
      sx={{
        borderRadius: 3,
        border: '1px solid #e5e7eb',
        boxShadow: '0 6px 16px rgba(15,23,42,0.08)',
        p: 1,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '0.86rem', color: BLUE_MAIN }}>
          Topology Map
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <IconButton size="small" sx={{ color: '#6b7280' }} onClick={() => { /* expand action placeholder */ }}>
            <OpenInFullIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
      </Box>

      <TopologyMapSvg />
      <Typography
        sx={{
          mt: 1,
          fontSize: '0.78rem',
          color: '#6b7280',
        }}
      >
        Web tier traffic flows into application services, which in turn depend on
        the database layer. Diagram is for visual overview only; click tiles on
        the left for detailed status.
      </Typography>
    </Card>
  );
}

// --- Critical Actions top row ---

function CriticalActionsRow({ onActionClick }) {
  const variants = [
    { bg: '#ffd6dc' },
    { bg: '#ffd2d8' },
    { bg: '#ffdee4' },
    { bg: '#ffebef' },
    { bg: '#ffeef2' },
    { bg: '#fff1f4' },
    { bg: '#fff4f6' },
  ];

  // create a single-row grid so cards always share available width
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${criticalActions.length}, minmax(0, 1fr))`,
        gap: 1.0,
        mb: 2.4,
        mt: 0.3,
        alignItems: 'stretch',
      }}
    >
      {criticalActions.map((action, idx) => {
        const v = variants[idx % variants.length];
        const parts = action.subtitle ? action.subtitle.split(' ') : ['',''];
        const num = parts[0] || '';
        const rest = parts.slice(1).join(' ');
        return (
          <Card
            key={action.id}
            sx={{
              position: 'relative',
              cursor: 'pointer',
              width: '100%',
              height: 128,
              borderRadius: 2.5,
              boxShadow: '0 10px 22px rgba(15,23,42,0.10)',
              bgcolor: v.bg,
              p: 0.8,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              transition: 'all 0.12s ease',
              '&:hover': {
                transform: 'translateY(-3px)',
                boxShadow: '0 14px 30px rgba(15,23,42,0.16)',
              },
            }}
            onClick={() => onActionClick(action.metricTitle)}
          >
            <Box sx={{ position: 'absolute', right: 8, top: 8 }}>
              <WarningAmberIcon sx={{ color: '#72243a', fontSize: 15 }} />
            </Box>

            <Box sx={{ minWidth: 0 }}>
              <Typography
                sx={{
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  color: '#000000',
                  lineHeight: 1.05,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {action.title}
              </Typography>

              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.6, mt: 0.25, overflow: 'hidden', pt: 0.6 }}>
                <Typography sx={{ fontSize: '1.6rem', fontWeight: 800, color: '#b91c1c', lineHeight: 1 }}>
                  {num}
                </Typography>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#b91c1c', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {rest}
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, mt: 0.4 }}>
              <Box
                onClick={(e) => {
                  e.stopPropagation();
                  onActionClick(action.metricTitle);
                }}
                sx={{
                  flexShrink: 0,
                  width: '100%',
                  maxWidth: 160,
                  px: 1.2,
                  py: 0.55,
                  borderRadius: 1,
                  bgcolor: '#72243a',
                  color: '#ffffff',
                  textAlign: 'center',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {action.button}
              </Box>

              <MenuBookOutlinedIcon sx={{ color: '#6b7280', fontSize: 18, ml: 1.2 }} />
            </Box>
          </Card>
        );
      })}
    </Box>
  );
}

// ---------- MAIN SHELL COMPONENT (top half only) ----------

export default function CriticalActionsAndRemediation() {
  const [activeTab, setActiveTab] = useState('Infrastructure');
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState(null);

  const metrics = getMetricsForTab(activeTab);

  const openOverlayForMetric = (metric) => {
    if (!metric) return;
    setSelectedMetric(metric);
    setOverlayOpen(true);
  };

  const openOverlayForTitle = (metricTitle) => {
    const metric = findMetricByTitle(metricTitle);
    openOverlayForMetric(metric);
  };

  return (
    <Box
      sx={{
        p: { xs: 1.2, md: 1.2 },
        pt: { xs: 0.6, md: 0.8 },
        pb: 1,
        bgcolor: '#f3f4fb',
      }}
    >
      {/* Title */}
      <Typography
        sx={{
          fontWeight: 700,
          fontSize: '1.05rem',
          mb: 0.4,
          color: '#111827',
        }}
      >
        Critical Actions &amp; Remediation
      </Typography>

      {/* Critical actions row */}
      <CriticalActionsRow onActionClick={openOverlayForTitle} />

      {/* Tabs + Topology heading on same row */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          mt: 0.8,
          mb: 1,
        }}
      >
        <Box sx={{ display: 'flex', gap: 2, pt: 0.6 }}>
          {TABS.map((tab) => {
            const active = tab === activeTab;
            return (
              <Box
                key={tab}
                onClick={() => setActiveTab(tab)}
                sx={{
                  pb: 0.6,
                  fontSize: '0.86rem',
                  fontWeight: active ? 700 : 500,
                  cursor: 'pointer',
                  color: active ? BLUE_MAIN : '#4b5563',
                  borderBottom: active ? `2px solid ${BLUE_MAIN}` : '2px solid transparent',
                }}
              >
                {tab}
              </Box>
            );
          })}
        </Box>

        <Box />
      </Box>

      {/* Metrics + Topology row (cards themselves defined in next section) */}
      <Grid container spacing={2} sx={{ alignItems: 'stretch' }}>
        <Grid xs={12} md={6} sx={{ display: 'flex', flexDirection: 'column', minHeight: 260, pt: 1 }}>
          <Box sx={{ flex: 1 }}>
            <MetricGrid
              metrics={metrics}
              onTileClick={openOverlayForMetric}
            />
          </Box>
        </Grid>
        <Grid xs={12} md={6} sx={{ display: 'flex', flexDirection: 'column', minHeight: 260 }}>
          <TopologyCard />
        </Grid>
      </Grid>

      {/* Bottom row + Drawer come in later sections */}
      <LowerStatusRow />
      <RightOverlayDrawer
        open={overlayOpen}
        onClose={() => setOverlayOpen(false)}
        metric={selectedMetric}
      />
    </Box>
  );
}
// ---------- SECTION 3: Metric tiles, bottom row, drawer ----------

// extra colours for thresholds card
const TH_GREEN = '#0b4c3a';
const TH_BEIGE = '#f4e4c7';
const TH_MAROON = '#722c24';

// ----- METRIC GRID (top middle-left) -----

function MetricGrid({ metrics, onTileClick }) {
  var disabled = metrics === networkMetrics;
  return (
    <Grid container spacing={2}>
      {metrics.map((m) => (
        <Grid xs={12} md={6} key={m.title}>
          <MetricTile disabled={disabled} metric={m} onClick={() => onTileClick(m)} />
        </Grid>
      ))}
    </Grid>
  );
}
function MetricTile({ metric, onClick, disabled }) {
  const { title, value, subtitle, healthy } = metric;

  // subtitle like "4 Unavailable • 127 total"
  const [mainPart = '', restPart = ''] = (subtitle || '').split(' • ');
  let labelWord = mainPart.replace(/^[0-9]+\s*/, '').trim(); // drop leading number

  // special case: show "Down" instead of "Unavailable"
  if (labelWord.toLowerCase() === 'unavailable') {
    labelWord = 'Down';
  }

  const detailText = `${labelWord}${restPart ? ` • ${restPart}` : ''}`;

  return (
    <Card
      onClick={disabled ? undefined : onClick}
      sx={{
        borderRadius: 3,
        border: '1px solid #e5e7eb',
        boxShadow: '0 6px 16px rgba(15,23,42,0.08)',
        p: 1,
        height: 120,
        display: 'flex',
        flexDirection: 'column',
        opacity: disabled ? 0.5 : 1,
        filter: disabled ? 'grayscale(40%)' : 'none',
        pointerEvents: disabled ? 'none' : 'auto',
        cursor: disabled ? 'default' : 'pointer',
        '&:hover': {
          boxShadow: disabled
            ? '0 6px 16px rgba(15,23,42,0.08)'
            : '0 8px 20px rgba(15,23,42,0.14)',
          transform: disabled ? 'none' : 'translateY(-1px)',
        },
        transition: 'all 0.15s ease',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          mb: 0.6,
        }}
      >
        {/* left: title + number + small text on same line */}
        <Box sx={{ minWidth: 0 }}>
          <Typography
            sx={{ fontWeight: 700, fontSize: '0.9rem', color: '#111827', mb: 0.25 }}
          >
            {title}
          </Typography>

          <Box
            sx={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 1,
            }}
          >
            <Typography
              sx={{
                fontSize: '1.6rem',
                fontWeight: 800,
                color: '#1f2933',
                lineHeight: 1,
              }}
            >
              {value}
            </Typography>

            <Typography
              sx={{
                fontSize: '0.75rem',
                color: '#6b7280',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                overflow: 'hidden',
                maxWidth: 150,
              }}
            >
              {detailText}
            </Typography>
          </Box>
        </Box>

        {/* right: donut */}
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <Box
            sx={{
              position: 'relative',
              width: 70,
              height: 48,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <MiniDonutChart percent={healthy} />
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Typography
                sx={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  color: '#111827',
                }}
              >
                {healthy}%
              </Typography>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* sparkline brought up closer */}
      <Box sx={{ mt: 0.4 }}>
        <Typography sx={{ fontSize: '0.68rem', color: '#9ca3af', mb: 0.1 }}>
          24 hour trend
        </Typography>
        <Box sx={{ height: 26 }}>
          <MiniTrendChart height={26} />
        </Box>
      </Box>
    </Card>
  );
}
// ----- BOTTOM ROW WRAPPER -----

function LowerStatusRow() {
  return (
    <Grid
      container
      spacing={2}
      sx={{
        mt: 2,
        px: { xs: 1, md: 0 },
      }}
    >
      <Grid xs={12} md={6}>
        <ThresholdsBreachedPanel />
      </Grid>
      <Grid xs={12} md={4}>
        <IssueDetectionPanel />
      </Grid>
      <Grid xs={12} md={2}>
        <OnCallStatusPanel />
      </Grid>
    </Grid>
  );
}

// ----- THRESHOLDS BREACHED PANEL -----

function ThresholdsBreachedPanel() {
  const [activeTab, setActiveTab] = useState('Servers');
  const [value, setValue] = useState(86);

  const datasets = {
    Servers: [
      { label: 'CPU', value: 18, text: '19 apps with CPU utilization above threshold' },
      { label: 'MEM', value: 12, text: '19 apps with MEMORY utilization above threshold' },
      { label: 'DISK', value: 25, text: '21 apps with DISK utilization above threshold' },
    ],
    Fileshares: [
      { label: 'Read', value: 10, text: '10 services with read IO above threshold' },
      { label: 'Write', value: 16, text: '16 services with write IO above threshold' },
      { label: 'IOPS', value: 22, text: '22 services with IOPS above threshold' },
    ],
    Databases: [
      { label: 'Storage', value: 15, text: '15 DBs with storage utilization above threshold' },
      { label: 'DTU', value: 20, text: '20 DBs with DTU utilization above threshold' },
      { label: 'CPU', value: 17, text: '17 DBs with CPU utilization above threshold' },
    ],
  };

  const bars = datasets[activeTab];
  // small dynamic adjustment so counts move a little when threshold changes
  const scale = 1 - (value - 50) / 200; // value in [50,100] -> scale in [1, 0.75]
  const dynamicBars = bars.map((b) => ({ ...b, current: Math.max(0, Math.round(b.value * scale)) }));
  const maxBar = Math.max(...dynamicBars.map((b) => b.current), 1);
  const totalBreached = dynamicBars.reduce((s, b) => s + b.current, 0);

  const handleSlider = (_, v) => {
    setValue(Array.isArray(v) ? v[0] : v);
  };

  const chipBase = {
    px: 1.8,
    py: 0.5,
    borderRadius: 999,
    fontSize: '0.7rem',
    fontWeight: 600,
    cursor: 'pointer',
  };

  return (
    <Card
      sx={{
        borderRadius: 3,
        border: '1px solid #e5e7eb',
        boxShadow: '0 4px 14px rgba(15,23,42,0.06)',
        p: 2,
        height: 260, // adjusted to match other bottom-row cards
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          mb: 1.2,
          alignItems: 'center',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.98rem' }}>
            Thresholds Breached
          </Typography>
          <Typography sx={{ fontSize: '0.86rem', color: '#7f1d1d', fontWeight: 700 }}>
            {totalBreached} breached
          </Typography>
        </Box>
        <MoreHorizIcon sx={{ fontSize: 18, color: '#9ca3af' }} />
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '1.1fr 1.8fr',
          gap: 2.2,
          alignItems: 'flex-start',
        }}
      >
        {/* left half: gauge + slider */}
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Box sx={{ position: 'relative', width: 140, height: 72 }}>
            <svg viewBox="0 0 100 50" width="100%" height="100%">
              <path
                d="M 10 50 A 40 40 0 0 1 90 50"
                fill="none"
                stroke={TH_BEIGE}
                strokeWidth="16"
                strokeLinecap="round"
              />
              <path
                d="M 10 50 A 40 40 0 0 1 90 50"
                fill="none"
                stroke={TH_MAROON}
                strokeWidth="16"
                strokeLinecap="round"
                strokeDasharray={`${((value - 50) / 50) * 125.66} 200`}
                style={{ transition: 'stroke-dasharray 0.25s ease' }}
              />
            </svg>
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
                pb: 0.5,
              }}
            >
              <Typography
                sx={{
                  fontSize: '1.5rem',
                  fontWeight: 800,
                  color: TH_GREEN,
                }}
              >
                {value}%
              </Typography>
            </Box>
          </Box>

          <Typography
            sx={{
              mt: 0.4,
              fontSize: '0.78rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 1,
              color: '#374151',
            }}
          >
            Global Threshold
          </Typography>

          <Box sx={{ width: '84%', mt: 1.4 }}>
            <Slider size="small" value={value} min={50} max={100} onChange={handleSlider} />
          </Box>

          <Box
            sx={{
              mt: 0.8,
              px: 3,
              py: 0.9,
              borderRadius: 999,
              bgcolor: TH_GREEN,
              color: '#ffffff',
              fontSize: '0.75rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 0.8,
              cursor: 'pointer',
            }}
          >
            Adjust Threshold
          </Box>
        </Box>

        {/* right half: tabs + bars */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.3 }}>
          <Box sx={{ display: 'flex', gap: 0.6 }}>
            {['Servers', 'Fileshares', 'Databases'].map((t) => {
              const active = t === activeTab;
              return (
                <Box
                  key={t}
                  onClick={() => setActiveTab(t)}
                  sx={{
                    ...chipBase,
                    bgcolor: active ? TH_GREEN : '#f3f4f6',
                    color: active ? '#ffffff' : '#4b5563',
                  }}
                >
                  {t}
                </Box>
              );
            })}
          </Box>

          {dynamicBars.map((bar) => {
            const pct = (bar.current / maxBar) * 100;
            return (
              <Box key={bar.label} sx={{ display: 'flex', flexDirection: 'column', gap: 0.3 }}>
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                    <Typography
                      sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}
                    >
                      {bar.label}
                    </Typography>
                    <Typography sx={{ fontSize: '0.72rem', color: '#6b7280' }}>
                      {bar.text}
                    </Typography>
                  </Box>
                  <Typography
                    sx={{
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: '#111827',
                    }}
                  >
                    {bar.current}
                  </Typography>
                </Box>

                <Box
                  sx={{
                    height: 14,
                    borderRadius: 7,
                    bgcolor: '#f3f4f6',
                    overflow: 'hidden',
                  }}
                >
                  <Box
                    sx={{
                      height: '100%',
                      width: `${pct}%`,
                      maxWidth: '100%',
                      borderRadius: 7,
                      bgcolor: '#f97316',
                      transition: 'width 0.25s ease',
                    }}
                  />
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Card>
  );
}

// ----- ISSUE DETECTION & AUTO REMEDIATION -----
function IssueDetectionPanel() {
  const stats = [
    { label: 'Apps',      value: 38, subtitle: 'This Week' },
    { label: 'Incidents', value: 60, subtitle: 'Resolved', delta: '-0.70%' },
    { label: 'Resolved',  value: 481, subtitle: 'This Week', delta: '-8.77%' },
    { label: 'Restart',   value: 67, subtitle: 'This Week' },
  ];

  return (
    <Card
      sx={{
        borderRadius: 3,
        border: '1px solid #e5e7eb',
        boxShadow: '0 4px 14px rgba(15,23,42,0.06)',
        p: 2,
        height: 260,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          mb: 1.2,
          alignItems: 'center',
        }}
      >
        <Typography sx={{ fontWeight: 700, fontSize: '0.98rem' }}>
          Issue Detection &amp; Auto Remediation
        </Typography>
        <InfoOutlinedIcon sx={{ fontSize: 17, color: '#9ca3af' }} />
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '1.05fr 1.2fr',
          gap: 1.4,
          alignItems: 'stretch',
          height: 'calc(100% - 26px)',
        }}
      >
        {/* left: four small stat tiles */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0,1fr))',
            gap: 1,
          }}
        >
          {stats.map((s) => (
            <Box
              key={s.label}
              sx={{
                borderRadius: 2,
                bgcolor: '#f3f4f6',
                p: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <Typography
                sx={{ fontSize: '0.72rem', fontWeight: 600, color: '#4b5563' }}
              >
                {s.label}
              </Typography>
              <Typography
                sx={{
                  fontSize: '1.3rem',
                  fontWeight: 800,
                  color: '#111827',
                  lineHeight: 1.1,
                  mt: 0.4,
                }}
              >
                {s.value}
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.3 }}>
                <Typography sx={{ fontSize: '0.7rem', color: '#6b7280' }}>
                  {s.subtitle}
                </Typography>
                {s.delta && (
                  <Typography
                    sx={{
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      color: s.delta.startsWith('-') ? '#16a34a' : '#b91c1c',
                    }}
                  >
                    {s.delta}
                  </Typography>
                )}
              </Box>
            </Box>
          ))}
        </Box>

        {/* right: incidents auto-resolved line+area chart */}
        <Box
          sx={{
            borderRadius: 2,
            bgcolor: '#eef2ff',
            p: 1.4,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <Typography
            sx={{
              fontSize: '0.78rem',
              fontWeight: 600,
              color: '#111827',
              mb: 0.6,
            }}
          >
            Count of incidents auto resolved per month
          </Typography>

          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <ResponsiveContainer width="100%" height={100}>
              <AreaChart
                data={incidentTrendData}
                margin={{ top: 10, right: 8, left: 0, bottom: 0 }}
              >
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#6b7280' }}
                  interval={0}
                />
                <Area
                  type="monotone"
                  dataKey="incidents"
                  stroke={BLUE_MAIN}
                  fill={BLUE_TINT}
                  strokeWidth={3}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Box>

          {/* legend row like screenshot */}
          <Box
            sx={{
              mt: 0.4,
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 2,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  bgcolor: BLUE_MAIN,
                }}
              />
              <Typography sx={{ fontSize: '0.7rem', color: '#111827' }}>
                Incidents
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  bgcolor: BLUE_MAIN,
                }}
              />
              <Typography sx={{ fontSize: '0.7rem', color: '#111827' }}>
                Observed
              </Typography>
            </Box>
          </Box>
        </Box>
      </Box>
    </Card>
  );
}
// ----- ON-CALL ROSTER PANEL -----

function OnCallStatusPanel() {
  const [shiftFilter, setShiftFilter] = useState('All');

  const team = [
    { initials: 'AR', name: 'Arjun Rao', role: 'Primary on-call', shift: 'Day shift', time: '09:00 – 17:00' },
    { initials: 'MI', name: 'Meghana Iyer', role: 'Backup', shift: 'Day shift', time: '09:00 – 17:00' },
    { initials: 'DC', name: 'Daniel Cooper', role: 'Database', shift: 'Evening shift', time: '17:00 – 01:00' },
    { initials: 'LP', name: 'Liam Patel', role: 'Applications', shift: 'Night shift', time: '01:00 – 09:00' },
  ];

  const filtered =
    shiftFilter === 'All'
      ? team
      : team.filter((m) => m.shift.toLowerCase().includes(shiftFilter.toLowerCase()));

  // simplified on-call panel: no extra filter controls, compact list

  return (
    <Card
      sx={{
        borderRadius: 3,
        border: '1px solid #e5e7eb',
        boxShadow: '0 4px 14px rgba(15,23,42,0.06)',
        p: 1.9,
        height: 260,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* header */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          mb: 0.9,
          alignItems: 'flex-start',
        }}
      >
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: '0.94rem' }}>
            Today&apos;s On-Call Roster
          </Typography>
          <Typography
            sx={{ mt: 0.2, fontSize: '0.7rem', color: '#6b7280' }}
          >
            Names and shift windows for everyone on rotation today.
          </Typography>
        </Box>
      </Box>

      {/* simplified list */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 0.6,
          maxHeight: 180,
          overflowY: 'auto',
          pr: 0.2,
        }}
      >
        {filtered.map((m) => (
          <Box
            key={m.name}
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              py: 0.4,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
              <Box
                sx={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  bgcolor: '#f3f0dc',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: '#4b5563',
                }}
              >
                {m.initials}
              </Box>
              <Box>
                <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>
                  {m.name}
                </Typography>
                <Typography sx={{ fontSize: '0.72rem', color: '#6b7280' }}>
                  {m.role}
                </Typography>
              </Box>
            </Box>

            <Box sx={{ textAlign: 'right' }}>
              <Typography
                sx={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#111827',
                }}
              >
                {m.time}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>

      <Typography
        sx={{
          mt: 0.6,
          fontSize: '0.64rem',
          color: '#9ca3af',
          textAlign: 'center',
        }}
      >
        Times are shown in your local timezone.
      </Typography>
    </Card>
  );
}

// ----- RIGHT OVERLAY DRAWER (simplified existing style) -----

function RightOverlayDrawer({ open, onClose, metric }) {
  if (!metric) return null;

  // sample lists for demo purposes
  const sampleServers = ['srv-db-01', 'srv-web-02', 'srv-app-03', 'srv-cache-04'];
  const sampleServices = ['Auth', 'Payments', 'Reporting', 'QueueWorker'];
  const sampleDatabases = ['db-prod-01', 'db-replica-02', 'db-archive-03'];

  const rows = Array.from({ length: 4 }).map((_, idx) => ({
     id: idx + 1,
     appFamily: '3M 360 ENCOMPASS-AK',
     status: idx % 2 === 0 ? 'Critical' : 'Good',
     count: 5 + idx,
     duration: `${2 + idx}h ${15 * (idx + 1)}m`,
   }));

  // determine column label based on metric
  const secondColumnLabel = metric.title === 'Servers Unavailable' ? 'Servers' : metric.title === 'Services' ? 'Services' : metric.title === 'Database Unavailable' ? 'Databases' : 'Status';

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: '100vw', sm: '85vw', md: '75vw', lg: '65vw' },
          maxWidth: 1100,
          bgcolor: '#f5f7fb',
          boxShadow: '-8px 0 24px rgba(15,23,42,0.25)',
        },
      }}
    >
      {/* header */}
      <Box
        sx={{
          px: 3,
          py: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #e5e7eb',
          bgcolor: '#ffffff',
        }}
      >
        <Box>
          <Typography
            sx={{
              fontWeight: 700,
              color: BLUE_MAIN,
              letterSpacing: 0.4,
              fontSize: '0.85rem',
              textTransform: 'uppercase',
            }}
          >
            App Family Overview
          </Typography>
          <Typography sx={{ mt: 0.2, fontSize: '0.85rem', color: '#4b5563' }}>
            {metric.title} – detailed downtime and issues by app family.
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Box>

      {/* table body */}
      <Box
        sx={{
          m: 2.5,
          borderRadius: 2,
          overflow: 'hidden',
          bgcolor: '#ffffff',
          border: '1px solid #e5e7eb',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* header row */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '2.5fr 3fr 1.5fr', // move servers column further left by making it wider
            alignItems: 'center',
            bgcolor: '#f8fafc',
            px: 3,
            py: 1.3,
            borderBottom: '1px solid #e5e7eb',
            fontSize: 13,
            fontWeight: 600,
            color: '#6b7280',
          }}
        >
          <span>App Family</span>
          <span>{secondColumnLabel}</span>
          <span>Duration</span>
        </Box>

        {/* rows */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {rows.map((row, idx) => (
            <Box
              key={row.id}
              sx={{
                display: 'grid',
                gridTemplateColumns: '2.5fr 3fr 1.5fr', // match header, move servers column further left
                alignItems: 'center',
                px: 3,
                py: 1.2,
                fontSize: 13,
                bgcolor: idx % 2 === 0 ? '#f3f8ff' : '#ffffff',
                borderBottom: '1px solid #edf2ff',
              }}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.2 }}>
                <Typography
                  sx={{
                    fontWeight: 600,
                    color: '#1d4ed8',
                    fontSize: 13,
                    textDecoration: 'underline',
                    textDecorationThickness: '1px',
                  }}
                >
                  {row.appFamily}
                </Typography>
                <Typography sx={{ fontSize: 11, color: '#6b7280' }}>
                  {metric.subtitle || 'Downtime and incident summary'}
                </Typography>
              </Box>

              {/* second column: chips for specific metrics, otherwise status */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                {metric.title === 'Servers Unavailable' ? (
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-start' }}>
                    {sampleServers.map((s, i) => (
                      <Chip
                        key={s}
                        label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>{/* colored dot */}<Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: ['#06b6d4', '#14b8a6', '#60a5fa', '#7c3aed'][i % 4] }} />{s}</Box>}
                        size="small"
                        sx={{
                          bgcolor: ['#ecfeff', '#f0fdfa', '#f0f9ff', '#faf5ff'][i % 4],
                          color: '#0f172a',
                          fontWeight: 700,
                          fontSize: '0.78rem',
                          height: 32,
                          borderRadius: '999px',
                          border: '1px solid rgba(15,23,42,0.06)',
                          boxShadow: '0 4px 10px rgba(16,24,40,0.04)',
                          '& .MuiChip-label': { px: 1.25, py: 0.25, display: 'flex', alignItems: 'center', gap: 0.6 },
                        }}
                      />
                    ))}
                  </Box>
                ) : metric.title === 'Services' ? (
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-start' }}>
                    {sampleServices.map((s, i) => (
                      <Chip
                        key={s}
                        label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}><Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: ['#7c3aed', '#6d28d9', '#a78bfa', '#c084fc'][i % 4] }} />{s}</Box>}
                        size="small"
                        sx={{
                          bgcolor: ['#fbf8ff', '#faf5ff', '#f5f3ff', '#fff0ff'][i % 4],
                          color: '#0f172a',
                          fontWeight: 700,
                          fontSize: '0.78rem',
                          height: 32,
                          borderRadius: '999px',
                          border: '1px solid rgba(124,58,237,0.08)',
                          boxShadow: '0 4px 10px rgba(16,24,40,0.04)',
                          '& .MuiChip-label': { px: 1.25, py: 0.25, display: 'flex', alignItems: 'center', gap: 0.6 },
                        }}
                      />
                    ))}
                  </Box>
                ) : metric.title === 'Database Unavailable' ? (
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-start' }}>
                    {sampleDatabases.map((d, i) => (
                      <Chip
                        key={d}
                        label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}><Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: ['#f59e0b', '#f97316', '#fb923c'][i % 3] }} />{d}</Box>}
                        size="small"
                        sx={{
                          bgcolor: ['#fff7ed', '#fff7ed', '#fff8f1'][i % 3],
                          color: '#1f2937',
                          fontWeight: 700,
                          fontSize: '0.78rem',
                          height: 32,
                          borderRadius: '999px',
                          border: '1px solid rgba(245,158,11,0.08)',
                          boxShadow: '0 4px 10px rgba(16,24,40,0.04)',
                          '& .MuiChip-label': { px: 1.25, py: 0.25, display: 'flex', alignItems: 'center', gap: 0.6 },
                        }}
                      />
                    ))}
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                    <Box
                      sx={{
                        px: 1,
                        py: 0.3,
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 700,
                        bgcolor: row.status === 'Critical' ? '#fee2e2' : '#dcfce7',
                        color: row.status === 'Critical' ? '#b91c1c' : '#15803d',
                      }}
                    >
                      {row.status}
                    </Box>
                    <Typography sx={{ fontSize: 11, color: '#6b7280' }}>
                      {row.count} affected components
                    </Typography>
                  </Box>
                )}
              </Box>

              <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{row.duration}</Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Drawer>
  );
}