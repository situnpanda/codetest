import React, { useState, useEffect, useMemo } from "react";
import {Grid,Card,CardContent,Typography,Divider,LinearProgress,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,Button,Box,Autocomplete,TextField,Tooltip,Chip,Accordion,AccordionSummary,AccordionDetails,Tabs,Tab,CircularProgress,Pagination,Avatar,IconButton,Collapse,Modal,Paper,Select,MenuItem,Popover} from "@mui/material";
import { styled } from '@mui/material/styles';
import { tableCellClasses } from '@mui/material/TableCell';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { InfoOutlined, ExpandMore, KeyboardArrowDown, KeyboardArrowUp, OpenInNew, Close, FilterAlt, SwapVert, ArrowUpward, ArrowDownward, Search as SearchIcon, Terminal as TerminalIcon, WarningAmber, FileDownloadOutlined } from '@mui/icons-material';
import InputAdornment from '@mui/material/InputAdornment';
import { getUrl } from '../../../environment';
import { fetchWarningEvents, fetchUserMetrics_fromADX, fetchEarlyWarnings, fetchPerformanceMetrics_fromADX } from '../../shared/APIs/fetchAPIs';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { logPageVisit,startPageTracking,appInsights } from '../appInsights'; // Import the function
import { useNavigate, useLocation } from 'react-router-dom';

dayjs.extend(utc);
dayjs.extend(timezone);

const baseUrl = getUrl();

const [BLUE_MAIN, NAVY_MAIN, GREEN_MAIN, OCHRE_MAIN, NAVY_TINT] = 
  ['#335fa8', '#4a5b6a', '#5da44f', '#df9538', '#dddfe2'];

// Reusable utility functions
const STATE_MAP = {
  'remove from monitoring': 'removed', 'remove from alerting': 'removed',
  'resolved': 'resolved', 'acknowledged': 'acknowledged', 'new': 'new',
  'true positive': 'truePositive', 'false positive': 'falsePositive'
};

const normalizeState = (state) => {
  const normalized = String(state || '').trim().toLowerCase();
  return STATE_MAP[normalized] || (normalized ? 'new' : null);
};

const parseSummary = (summary) => {
  if (!summary) return null;
  if (typeof summary === 'object') return summary;
  try { return JSON.parse(summary); } catch { return null; }
};

const categorizeByMetric = (baseType, metricType) => {
  const m = metricType.toLowerCase();
  const categories = {
    vm: { cpu: 'VM/CPU', memory: 'VM/Memory', mem: 'VM/Memory', disk: 'VM/Disk', availability: 'VM/Availability', avail: 'VM/Availability', 'port health': 'VM/PortHealth', porthealth: 'VM/PortHealth', default: 'VM/Other' },
    database: { cpu: 'Database/CPU', dtu: 'Database/DTU', memory: 'Database/Memory', mem: 'Database/Memory', storage: 'Database/Storage', disk: 'Database/Storage', deadlock: 'Database/Deadlock', connection: 'Database/Connection', default: 'Database/Other' }
  };
  const cat = categories[baseType.toLowerCase()];
  if (!cat) return baseType;
  for (const [key, val] of Object.entries(cat)) {
    if (key !== 'default' && m.includes(key)) return val;
  }
  return cat.default;
};

const getComponentFromDetails = (details) => {
  if (!details || typeof details !== 'object') return [];
  const components = [];
  const patterns = [
    [['database', 'sql'], { cpu: 'Database/CPU', dtu: 'Database/DTU', memory: 'Database/Memory', mem: 'Database/Memory', storage: 'Database/Storage', disk: 'Database/Storage', deadlock: 'Database/Deadlock', connection: 'Database/Connection', default: 'Database/Other' }],
    [['cpu'], { default: 'VM/CPU' }],
    [['memory', 'mem'], { default: 'VM/Memory' }],
    [['disk'], { default: 'VM/Disk' }],
    [['availability', 'avail', 'port health'], { default: 'VM/Availability' }],
    [['file share', 'fileshare', 'file storage'], { default: 'File Share' }],
    [['url'], { default: 'URL' }],
    [['windows service', 'windowsservice'], { default: 'Windows Service' }]
  ];
  Object.keys(details).forEach(key => {
    const k = key.toLowerCase();
    for (const [triggers, mapping] of patterns) {
      if (triggers.some(t => k.includes(t))) {
        for (const [sub, comp] of Object.entries(mapping)) {
          if (sub === 'default' || k.includes(sub)) { components.push(comp); break; }
        }
        break;
      }
    }
  });
  return [...new Set(components)];
};

const CustomTabs = styled(Tabs)(() => ({ backgroundColor: 'transparent', minHeight: 38, borderBottom: '1px solid #E5E7EB', '& .MuiTabs-indicator': { display: 'block', height: 3, backgroundColor: '#00338e' } }));
const CustomTab = styled(Tab)(() => ({ backgroundColor: 'transparent', color: '#00338e', fontSize: 13, fontWeight: 600, textDecoration: 'none', transition: 'none', minHeight: 38, padding: '6px 16px', textTransform: 'none', '&.Mui-selected': { backgroundColor: 'transparent', fontWeight: 700 } }));
const StyledTableCell = styled(TableCell)(({ theme }) => ({ [`&.${tableCellClasses.head}`]: { backgroundColor: '#00338e', color: theme.palette.common.white, fontWeight: 700, fontSize: 12, fontFamily: 'inherit', letterSpacing: '0.03em', padding: '8px 10px', borderBottom: '2px solid rgba(255,255,255,0.15)', textAlign: 'left', whiteSpace: 'nowrap' }, [`&.${tableCellClasses.body}`]: { fontSize: 12, fontFamily: 'inherit', lineHeight: 1.55, padding: '7px 10px', textAlign: 'left', verticalAlign: 'top', borderBottom: '1px solid #f0f0f0', color: '#1e293b' } }));
const StyledTableRow = styled(TableRow)(() => ({ '&:nth-of-type(even)': { backgroundColor: '#f8f9fb' }, '&:hover': { backgroundColor: '#eef4ff !important', transition: 'background-color 0.15s' } }));

export default function AuditReport({ globalFilterData, preferredTZ, date, appInsights }) {
  const [tabValue, setTabValue] = useState(0);
  const [allWarningEventsData, setAllWarningEventsData] = useState([]); // Store all data
  const [warningEventsData, setWarningEventsData] = useState([]); // Filtered data
  const [allEarlyWarningsData, setAllEarlyWarningsData] = useState([]);
  const [earlyWarningsData, setEarlyWarningsData] = useState([]);
  const [auditLogsData, setAuditLogsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userMetricsData, setUserMetricsData] = useState([]);
  const [userMetricsLoading, setUserMetricsLoading] = useState(false);
  var location = useLocation();

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

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  // Hide the header time filter (#timeline) while on the iTelemetry Metrics tab (tab 1); no Header changes needed
  useEffect(() => {
    const el = document.getElementById('timeline');
    if (el) el.style.display = tabValue === 1 ? 'none' : '';
    return () => {
      const cleanup = document.getElementById('timeline');
      if (cleanup) cleanup.style.display = '';
    };
  }, [tabValue]);

  var fetchAuditEarlyWarningStateUpdates = () => {
    var url = new URL(baseUrl + 'audit/earlyWarningStateUpdates');
    fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    })
      .then((response) => response.json())
      .then((data) => {
        if (data && data["status"] === 200) {
          const logsData = JSON.parse(data["Data"] || '{}');

          if (logsData && Object.keys(logsData).length > 0) {
            const columnNames = Object.keys(logsData);
            const firstColumn = columnNames[0];
            const rowIndices = Object.keys(logsData[firstColumn] || {});
            const logs = rowIndices.map((idx) => {
              const row = {};
              columnNames.forEach((col) => {
                row[col] = logsData[col]?.[idx];
              });
              return row;
            });
            setAuditLogsData(logs);
          } else {
            setAuditLogsData([]);
          }
        } else {
          setAuditLogsData([]);
        }
      })
      .catch((error) => {
        setAuditLogsData([]);
        console.error('Error fetching Early Warning State Update logs:', error);
      });
  }

  // Filter data based on header date filter (PST format from TimelineFilter, UTC in database)
  const filterDataByDateRange = (data, dateFilter) => {
    if (!data?.length || !dateFilter?.startDate && !dateFilter?.endDate) return data || [];
    
    const parsePST = (d) => d ? dayjs.tz(d, 'YYYY-MM-DD hh:mm:ss A', 'America/Los_Angeles').utc().valueOf() : null;
    const startDate = parsePST(dateFilter.startDate);
    const endDate = parsePST(dateFilter.endDate);
    
    return data.filter(event => {
      if (!event.timeGenerated) return false;
      const eventTime = dayjs.utc(event.timeGenerated).valueOf();
      return (!startDate || eventTime >= startDate) && (!endDate || eventTime <= endDate);
    });
  };

  // Filter data when date filter changes
  useEffect(() => {
    setWarningEventsData(filterDataByDateRange(allWarningEventsData, date));
    setEarlyWarningsData(filterDataByDateRange(allEarlyWarningsData, date));
  }, [date, allWarningEventsData, allEarlyWarningsData]);

  // Fetch all data once on component mount
  useEffect(() => {
    const fetchWarningEventsData = async () => {
      setLoading(true);
      
      // Fetch all data without time filters
      const params = {
        "supportGroup": [],
        "applicationFamily": [],
      };
      
      // Using fetchWarningEvents from fetchAPIs
      fetchWarningEvents(null, params)
        .then((data) => {
          if (data && data["Issue ID"] && Object.keys(data["Issue ID"]).length > 0) {
            const issueKeys = Object.keys(data["Issue ID"]);
            
            // Transform data from column-based to row-based format
            const events = issueKeys.map(key => ({
              issueId: data["Issue ID"][key],
              eventId: data["Event ID"]?.[key],
              earlyWarningId: data["Early Warning ID"]?.[key],
              timeGenerated: data["Time Generated"][key],
              state: data["State"]?.[key] || data["Issue State"]?.[key] || data["Status"]?.[key],
              appCI: data["Application CI"][key],
              resourceName: data["Resource Name"]?.[key],
              resourceType: data["Resource Type"][key],
              metricType: data["Metrics Impacted"][key],
              condition: data["Condition"][key]?.split(';')[0] || data["Condition"][key],
              comments: data["Comments"]?.[key] || '-',
            }));
            
            setAllWarningEventsData(events); // Store all data
          } else {
            setAllWarningEventsData([]);
          }
        })
        .catch((error) => {
          console.error('Error fetching warning events:', error);
          setAllWarningEventsData([]);
        })
        .finally(() => {
          setLoading(false);
        });
    };

    fetchWarningEventsData();
  }, []); // Only fetch once on mount

  useEffect(() => {
    const fetchEarlyWarningsData = async () => {
      const params = {
        "supportGroup": [],
        "applicationFamily": [],
      };

      fetchEarlyWarnings(null, params)
        .then((data) => {
          if (data && data["Early Warning ID"] && Object.keys(data["Early Warning ID"]).length > 0) {
            const warningKeys = Object.keys(data["Early Warning ID"]);
            const warnings = warningKeys.map((key) => ({
              earlyWarningId: data["Early Warning ID"]?.[key],
              timeGenerated: data["Time Generated"]?.[key],
              status: data["State"]?.[key] || data["Status"]?.[key],
              summary: data["Summary"]?.[key],
              applicationFamily: data["Application Family"]?.[key],
              resourceType: data["Resource Type"]?.[key] || data["ResourceType"]?.[key] || data["resourceType"]?.[key],
              sequentialId: data["Sequential ID"]?.[key],
            }));
            setAllEarlyWarningsData(warnings);
          } else {
            setAllEarlyWarningsData([]);
          }
        })
        .catch((error) => {
          console.error('Error fetching early warnings:', error);
          setAllEarlyWarningsData([]);
        });
    };

    fetchEarlyWarningsData();
  }, []);

  // Fetch User Metrics when User Metrics tab is selected
  useEffect(() => {
    if (tabValue !== 1) return;
    setUserMetricsLoading(true);
    fetchUserMetrics_fromADX()
      .then((rawData) => {
        if (rawData && Object.keys(rawData).length > 0) {
          const columnNames = Object.keys(rawData);
          const rowIndices = Object.keys(rawData[columnNames[0]]);
          const rows = rowIndices.map(idx => {
            const row = {};
            columnNames.forEach(col => { row[col] = rawData[col][idx]; });
            return row;
          });
          setUserMetricsData(rows);
        } else {
          setUserMetricsData([]);
        }
      })
      .catch((err) => {
        console.error('User Metrics fetch error:', err);
        setUserMetricsData([]);
      })
      .finally(() => setUserMetricsLoading(false));
  }, [tabValue]);

  useEffect(() => {
    fetchAuditEarlyWarningStateUpdates();
  }, []);

  return (
    <>
      {/* Header with Tabs - Sticky, full width aligned to page */}
      <Box sx={{ position: 'sticky', top: 0, zIndex: 100, backgroundColor: '#f8f9fa', px: 2, pt: 4 }}>
        <CustomTabs value={tabValue} onChange={handleTabChange}>
          <CustomTab label="Issues" />
          <CustomTab label="iTelemetry Metrics" />
        </CustomTabs>
      </Box>

    <Grid container spacing={2} padding={2} sx={{ pt: 1, pb: 6 }}>
      {/* Tab Content */}
      {tabValue === 0 && (
        <IssuesTabContent warningEventsData={warningEventsData} earlyWarningsData={earlyWarningsData} allWarningEventsData={allWarningEventsData} allEarlyWarningsData={allEarlyWarningsData} auditLogsData={auditLogsData} loading={loading} date={date} globalFilterData={globalFilterData} preferredTZ={preferredTZ} />
      )}

      {tabValue === 1 && (
        <Grid item xs={12}>
          <Accordion defaultExpanded sx={{ border: `1px solid ${NAVY_TINT}`, borderRadius: '10px !important', boxShadow: '0 4px 14px rgba(15,23,42,0.06)', '&:before': { display: 'none' }, mb: 1.25 }}>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography sx={{ fontWeight: 700, color: NAVY_MAIN, fontSize: '0.92rem' }}>User Metrics</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0.5 }}>
              <UserMetricsTabContent userMetricsData={userMetricsData} loading={userMetricsLoading} />
            </AccordionDetails>
          </Accordion>

          <Accordion defaultExpanded sx={{ border: `1px solid ${NAVY_TINT}`, borderRadius: '10px !important', boxShadow: '0 4px 14px rgba(15,23,42,0.06)', '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography sx={{ fontWeight: 700, color: NAVY_MAIN, fontSize: '0.96rem' }}>Performance</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0.5 }}>
              <PerformanceTabContent preferredTZ={preferredTZ} />
            </AccordionDetails>
          </Accordion>
        </Grid>
      )}
    </Grid>
    </>
  );
}

// Issues Tab Content Component
function IssuesTabContent({ warningEventsData, earlyWarningsData, allWarningEventsData, allEarlyWarningsData, auditLogsData, loading, date, globalFilterData, preferredTZ }) {
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(8); // Dynamic rows based on screen size
  const [activeFilters, setActiveFilters] = useState([]); // Track active card filters
  const [columnFilters, setColumnFilters] = useState({});
  const [columnOps, setColumnOps] = useState({});
  const [filterAnchors, setFilterAnchors] = useState({});
  const [sortConfig, setSortConfig] = useState({ key: 'timeGenerated', direction: 'desc' });
  const [selectedChartStates, setSelectedChartStates] = useState(['acknowledged']); // Default to Acknowledged
  const [selectedChartPoint, setSelectedChartPoint] = useState(null); // Track selected chart point for filtering
  const [selectedResourceTypes, setSelectedResourceTypes] = useState([]); // Track selected resource type filters (multi-select)
  const [selectedAppFamilies, setSelectedAppFamilies] = useState([]); // Track selected app family filters (multi-select)

  // Calculate rows per page based on screen height
  React.useEffect(() => {
    const getViewportHeight = () =>
      window.visualViewport ? window.visualViewport.height : window.innerHeight;

    const computeRows = () => {
      const h = getViewportHeight();
      const reserved = 480; // space for header, tabs, cards, filters, pagination, padding
      const rowHeight = 44; // approx row height for small table
      const available = Math.max(0, h - reserved);
      const rows = Math.max(5, Math.min(25, Math.floor(available / rowHeight)));
      setRowsPerPage(rows);
    };

    computeRows();
    window.addEventListener('resize', computeRows);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', computeRows);
    }
    return () => {
      window.removeEventListener('resize', computeRows);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', computeRows);
      }
    };
  }, []);

  // Chart state options with providence colors (keeping warnings orange)
  const chartStateOptions = [
    { value: 'truePositive', label: 'True Positives', color: '#c74634' },    // Providence Red
    { value: 'falsePositive', label: 'False Positives', color: '#7d5ba6' },  // Providence Purple
    { value: 'new', label: 'New', color: BLUE_MAIN },                        // Providence Blue (#335fa8)
    { value: 'acknowledged', label: 'Acknowledged', color: GREEN_MAIN },     // Providence Green (#5da44f)
    { value: 'resolved', label: 'Resolved', color: '#00838f' },              // Providence Teal
    { value: 'removed', label: 'Removed', color: NAVY_MAIN }                 // Providence Navy (#4a5b6a)
  ];

  // Handle card click to toggle filter
  const handleCardClick = (filterKey) => {
    setActiveFilters(prev => {
      if (filterKey === 'total') {
        // If clicking total, clear all filters
        return [];
      }
      if (prev.includes(filterKey)) {
        // If already selected, remove it
        return prev.filter(f => f !== filterKey);
      } else {
        // Add to filters
        return [...prev, filterKey];
      }
    });
    setPage(1); // Reset to first page when filter changes
  };

  const formatEventId = (value) => {
    if (value === null || value === undefined || value === '') return '-';
    const raw = String(value).trim();
    if (!raw) return '-';

    const ewMatch = raw.match(/^EW0*(\d+)$/i);
    if (ewMatch) {
      return `EW${ewMatch[1].padStart(7, '0')}`;
    }

    if (/^\d+$/.test(raw)) {
      return `EW${raw.padStart(7, '0')}`;
    }

    return raw;
  };

  const formatTimeForPreferredTZ = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).replace('Z', '');

    const tz = preferredTZ || 'America/Los_Angeles';
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).formatToParts(date);

    const getPart = (type) => parts.find((p) => p.type === type)?.value || '00';
    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');
    const hour = getPart('hour');
    const minute = getPart('minute');
    const second = getPart('second');

    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  };

  const getResourceNameFromSummary = (summary) => {
    if (!summary) return '-';
    let parsedSummary = summary;

    if (typeof summary === 'string') {
      try {
        parsedSummary = JSON.parse(summary);
      } catch {
        return '-';
      }
    }

    if (typeof parsedSummary !== 'object') return '-';

    const resourceVal =
      parsedSummary['Resource Name'] ||
      parsedSummary['resourceName'] ||
      parsedSummary['ResourceName'] ||
      parsedSummary['resource'] ||
      parsedSummary['Resource'];

    if (Array.isArray(resourceVal)) {
      return resourceVal.filter(Boolean).join(', ') || '-';
    }

    return resourceVal ? String(resourceVal) : '-';
  };

  const formatResourceDetails = (resourceValue) => {
    if (!resourceValue || resourceValue === '-') return '-';
    const raw = String(resourceValue).trim();
    if (!raw) return '-';

    // Already in labeled format
    if (raw.includes(':')) return raw;

    const segments = raw.split('/').filter(Boolean);
    if (segments.length < 2) return raw;

    const keyLabelMap = {
      subscriptionid: 'Subscription ID',
      resourcegroup: 'Resource Group',
      sqlservername: 'SQL Server Name',
      databasename: 'Database Name',
      applicationci: 'Application CI',
      servername: 'Server Name'
    };

    const orderedKeys = ['subscriptionid', 'resourcegroup', 'sqlservername', 'databasename', 'applicationci', 'servername'];
    const kv = {};
    for (let i = 0; i < segments.length - 1; i += 2) {
      const key = String(segments[i]).toLowerCase();
      const value = segments[i + 1];
      if (key && value) kv[key] = value;
    }

    const lines = [];
    orderedKeys.forEach((key) => {
      if (kv[key]) {
        lines.push(`${keyLabelMap[key] || key}: ${kv[key]}`);
      }
    });

    if (lines.length === 0) return raw;
    return lines.join('\n');
  };

  const renderResourceDetailsWithBoldKeys = (resourceValue) => {
    const text = resourceValue ?? '-';
    if (text === '-') return '-';

    const lines = String(text).split('\n').filter((line) => line !== '');
    if (lines.length === 0) return '-';

    return lines.map((line, idx) => {
      const colonIndex = line.indexOf(':');
      const afterColon = colonIndex !== -1 ? line.slice(colonIndex + 1).trim() : '';
      const isUrl = afterColon.startsWith('//') || afterColon.startsWith('http');

      if (colonIndex === -1 || isUrl) {
        return (
          <Box key={idx}>{line}</Box>
        );
      }

      const key = line.slice(0, colonIndex).trim();
      const value = afterColon;

      return (
        <Box key={idx}>
          <Typography component="span" sx={{ fontWeight: 700, fontSize: 13 }}>
            {key}:
          </Typography>
          <Typography component="span" sx={{ fontSize: 13 }}>
            {value ? ` ${value}` : ''}
          </Typography>
        </Box>
      );
    });
  };

  // Helper function to extract just ServerName for VM resource types
  const getServerNameForVM = (resourceValue) => {
    const text = resourceValue ?? '-';
    if (text === '-') return '-';

    const lines = String(text).split('\n').filter((line) => line !== '');
    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex !== -1) {
        const key = line.slice(0, colonIndex).trim().toLowerCase();
        const value = line.slice(colonIndex + 1).trim();
        if (key === 'server name' || key === 'servername') {
          return value || '-';
        }
      }
    }
    // If no Server Name found, return the first value or the whole string
    return lines.length > 0 ? lines[0] : '-';
  };

  // Build AppCI to Application Name mapping from globalFilterData
  const getAppCIToNameMap = () => {
    const map = {};
    if (globalFilterData && globalFilterData["AppCI"] && globalFilterData["AppFamily"]) {
      Object.keys(globalFilterData["AppCI"]).forEach(key => {
        const appCI = globalFilterData["AppCI"][key];
        const appFamily = globalFilterData["AppFamily"][key];
        if (appCI && !map[appCI.toLowerCase()]) {
          map[appCI.toLowerCase()] = appFamily || appCI;
        }
      });
    }
    return map;
  };

  const appCIToNameMap = getAppCIToNameMap();

  const earlyWarningIdToSequentialId = (earlyWarningsData || []).reduce((acc, warning) => {
    if (warning?.earlyWarningId) {
      acc[warning.earlyWarningId] = warning.sequentialId;
    }
    return acc;
  }, {});

  const mappedWarningEventsForTable = (warningEventsData || []).map((event) => {
    const rawEventId = event.eventId || earlyWarningIdToSequentialId[event.earlyWarningId] || '-';
    const appCIValue = event.appCI || '-';
    const appFamilyFromMap = appCIToNameMap[appCIValue.toLowerCase()] || appCIValue;
    return {
      ...event,
      eventId: formatEventId(rawEventId),
      resourceName: formatResourceDetails(event.resourceName || '-'),
      appFamily: appFamilyFromMap,
    };
  });

  const warningEventIds = new Set(
    (warningEventsData || [])
      .map((event) => formatEventId(event.eventId || earlyWarningIdToSequentialId[event.earlyWarningId] || '-'))
      .filter((eventId) => eventId && eventId !== '-')
  );

  const mappedEarlyWarningsForTable = (earlyWarningsData || []).map((warning) => ({
    timeGenerated: warning.timeGenerated,
    eventId: formatEventId(warning.sequentialId || warning.earlyWarningId || '-'),
    issueId: warning.earlyWarningId || '-',
    appCI: warning.applicationFamily || '-',
    appFamily: warning.applicationFamily || '-',
    resourceName: formatResourceDetails(getResourceNameFromSummary(warning.summary)),
    resourceType: 'Early Warning',
    metricType: 'Early Warning',
    condition: warning.status || '-',
    summary: typeof warning.summary === 'object' ? JSON.stringify(warning.summary) : (warning.summary || '-')
  }));

  const uniqueEarlyWarningsForTable = mappedEarlyWarningsForTable.filter(
    (warning) => !(warning.eventId && warning.eventId !== '-' && warningEventIds.has(warning.eventId))
  );

  // Build a map of earlyWarningId -> latest state from warning events
  const latestStateByEarlyWarningId = (warningEventsData || []).reduce((acc, event) => {
    const ewId = event?.earlyWarningId;
    if (!ewId) return acc;
    
    const mappedState = normalizeState(event?.state) || 'new';
    const eventTime = new Date(event?.timeGenerated || 0).getTime();
    const prev = acc[ewId];
    if (!prev || eventTime >= prev.time) {
      acc[ewId] = { state: mappedState, time: eventTime };
    }
    return acc;
  }, {});

  // Build a map of earlyWarningId -> state change info (who changed the state)
  const stateChangeByEarlyWarningId = useMemo(() => {
    const changeMap = {};
    if (!auditLogsData || auditLogsData.length === 0) return changeMap;

    auditLogsData.forEach((log) => {
      const emailId = log['Email ID'] || '';
      const timeGenerated = log['Time Generated'];
      let data = log['Data'];
      
      // Parse the Data field which contains JSON with eventID and state
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch (e) {
          return;
        }
      }
      
      if (!data || !data.eventID) return;
      
      const ewId = data.eventID;
      const state = data.state;
      const logTime = new Date(timeGenerated || 0).getTime();
      
      // Format the email to show just the name part (before @)
      const userName = emailId ? emailId.split('@')[0] : '';
      
      // Store all state changes for this early warning (most recent first)
      if (!changeMap[ewId]) {
        changeMap[ewId] = [];
      }
      changeMap[ewId].push({
        userName,
        emailId,
        state,
        time: logTime,
        timeGenerated
      });
    });

    // Sort each early warning's changes by time (most recent first)
    Object.keys(changeMap).forEach((ewId) => {
      changeMap[ewId].sort((a, b) => b.time - a.time);
    });

    return changeMap;
  }, [auditLogsData]);

  // Add computed effective state and state changed by user to table data
  const tableDataWithState = [...mappedWarningEventsForTable, ...uniqueEarlyWarningsForTable].map(row => {
    // Get the early warning ID for this row
    const ewId = row.earlyWarningId || row.issueId;
    
    // Get state change info from audit logs
    const stateChanges = ewId ? stateChangeByEarlyWarningId[ewId] : null;
    const latestChange = stateChanges?.[0];
    const stateChangedBy = latestChange?.userName || '-';
    // Ensure the timestamp is treated as UTC by appending 'Z' if it's a valid date string without timezone
    let stateChangedTime = latestChange?.timeGenerated || '-';
    if (stateChangedTime && stateChangedTime !== '-' && typeof stateChangedTime === 'string' && !stateChangedTime.endsWith('Z') && !stateChangedTime.includes('+')) {
      stateChangedTime = stateChangedTime.replace(' ', 'T') + 'Z';
    }
    
    // For warning events, use their state field directly
    if (row.state) {
      return { ...row, effectiveState: normalizeState(row.state) || 'new', stateChangedBy, stateChangedTime };
    }
    
    // For early warnings, check if there's a linked warning event state
    if (ewId && latestStateByEarlyWarningId[ewId]) {
      return { ...row, effectiveState: latestStateByEarlyWarningId[ewId].state, stateChangedBy, stateChangedTime };
    }
    
    // Fallback: use the condition/status field from early warning
    return { ...row, effectiveState: normalizeState(row.condition) || 'new', stateChangedBy, stateChangedTime };
  });

  const tableData = tableDataWithState.sort((a, b) => new Date(b.timeGenerated || 0) - new Date(a.timeGenerated || 0));

  // Handle chart point click for filtering
  const handleChartPointClick = (data) => {
    if (data && data.activePayload && data.activePayload.length > 0) {
      const clickedPoint = data.activePayload[0].payload;
      // Toggle off if clicking the same point
      if (selectedChartPoint && selectedChartPoint.time === clickedPoint.time) {
        setSelectedChartPoint(null);
      } else {
        setSelectedChartPoint(clickedPoint);
      }
      setPage(1); // Reset to first page when chart filter changes
    }
  };

  // Apply column filters and sorting
  const applyFiltersAndSort = (rows, colFilters, colOps, sortCfg) => {
    let filtered = [...rows];

    // Apply chart point time filter first
    if (selectedChartPoint) {
      filtered = filtered.filter(row => {
        if (!row.timeGenerated) return false;
        const rowTime = new Date(row.timeGenerated).getTime();
        return rowTime >= selectedChartPoint.intervalStart && rowTime < selectedChartPoint.intervalEnd;
      });
    }

    // Apply card filters
    if (activeFilters.length > 0) {
      filtered = filtered.filter(row => activeFilters.includes(row.effectiveState));
    }

    // Helper function to get effective resource type using same logic as the chart
    const getEffectiveResourceType = (warning) => {
      const parsed = parseSummary(warning?.summary);
      const detailsComponents = getComponentFromDetails(parsed?.Details);
      
      if (detailsComponents.length > 1) return 'Multiple';
      if (detailsComponents.length === 1) return detailsComponents[0];
      
      let component = warning?.resourceType || parsed?.['Resource Type'] || parsed?.['ResourceType'] || 'Other';
      component = String(component).trim() || 'Other';
      if (component.toLowerCase() === 'early warning' || component === '-') component = 'Other';
      
      const metricType = String(warning?.metricType || parsed?.['Metric Type'] || parsed?.['MetricType'] || '');
      if (component.toLowerCase() === 'vm') return categorizeByMetric('vm', metricType);
      if (component.toLowerCase() === 'database') return categorizeByMetric('database', metricType);
      
      return component;
    };

    // Apply resource type filter (multi-select)
    if (selectedResourceTypes.length > 0) {
      filtered = filtered.filter(row => {
        const effectiveResourceType = getEffectiveResourceType(row);
        return selectedResourceTypes.some(filter => effectiveResourceType.toLowerCase() === filter.toLowerCase());
      });
    }

    // Apply app family filter (multi-select)
    if (selectedAppFamilies.length > 0) {
      filtered = filtered.filter(row => {
        const rowAppFamily = String(row.appFamily || row.appCI || '').toLowerCase();
        return selectedAppFamilies.some(filter => {
          const filterLower = filter.toLowerCase();
          return rowAppFamily === filterLower || rowAppFamily.includes(filterLower);
        });
      });
    }

    // Apply column filters
    Object.keys(colFilters).forEach(colKey => {
      const filterVal = colFilters[colKey];
      if (!filterVal || !String(filterVal).trim()) return;
      const op = colOps[colKey] || 'contains';
      filtered = filtered.filter(row => {
        let cellVal = '';
        if (colKey === 'timeGenerated' || colKey === 'stateChangedTime') {
          cellVal = formatTimeForPreferredTZ(row[colKey]).toLowerCase();
        } else {
          cellVal = String(row[colKey] || '').toLowerCase();
        }
        const needle = String(filterVal).toLowerCase();
        switch (op) {
          case 'equals': return cellVal === needle;
          case 'starts': return cellVal.startsWith(needle);
          case 'ends': return cellVal.endsWith(needle);
          case 'contains':
          default: return cellVal.includes(needle);
        }
      });
    });

    // Apply sorting
    if (sortCfg.key) {
      filtered.sort((a, b) => {
        let aVal, bVal;
        if (sortCfg.key === 'timeGenerated' || sortCfg.key === 'stateChangedTime') {
          aVal = new Date(a[sortCfg.key] || 0).getTime();
          bVal = new Date(b[sortCfg.key] || 0).getTime();
        } else {
          aVal = String(a[sortCfg.key] || '').toLowerCase();
          bVal = String(b[sortCfg.key] || '').toLowerCase();
        }
        if (aVal < bVal) return sortCfg.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortCfg.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  };

  // Filter table data based on active card filters, column filters, and chart point filter
  const filteredTableData = useMemo(() => {
    return applyFiltersAndSort(tableData, columnFilters, columnOps, sortConfig);
  }, [tableData, activeFilters, columnFilters, columnOps, sortConfig, selectedChartPoint, selectedResourceTypes, selectedAppFamilies]);

  // Sort handlers
  const handleSort = (colKey) => {
    setSortConfig(prev => ({
      key: colKey,
      direction: prev.key === colKey && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
    setPage(1);
  };

  const getSortIcon = (colKey) => {
    if (sortConfig.key !== colKey) {
      return <SwapVert sx={{ fontSize: 14, color: '#94a3b8' }} />;
    }
    return sortConfig.direction === 'asc'
      ? <ArrowUpward sx={{ fontSize: 14, color: '#fff' }} />
      : <ArrowDownward sx={{ fontSize: 14, color: '#fff' }} />;
  };

  const columnLabelMap = {
    timeGenerated: 'Time Generated',
    eventId: 'Event ID',
    appCI: 'App CI',
    appFamily: 'App Family',
    resourceName: 'Resource Name',
    resourceType: 'Resource Type',
    metricType: 'Metric Type',
    condition: 'Condition',
    state: 'State',
    stateChangedBy: 'State Changed By',
    stateChangedTime: 'State Changed Time',
    summary: 'Summary',
    comments: 'Comments'
  };

  const preferredColumnOrder = [
    'timeGenerated',
    'eventId',
    'appFamily',
    'appCI',
    'resourceName',
    'resourceType',
    'metricType',
    'condition',
    'state',
    'comments',
    'stateChangedBy',
    'stateChangedTime',
    'summary'
  ];

  const hiddenColumns = ['issueId', 'earlyWarningId', 'effectiveState'];

  const availableColumns = tableData.length > 0 ? Object.keys(tableData[0]) : [];
  const issueTableColumns = [
    ...preferredColumnOrder.filter((col) => availableColumns.includes(col) && !hiddenColumns.includes(col)),
    ...availableColumns.filter((col) => !preferredColumnOrder.includes(col) && !hiddenColumns.includes(col))
  ];

  // Calculate paginated data
  const totalPages = Math.max(1, Math.ceil(filteredTableData.length / rowsPerPage));
  const paginatedData = filteredTableData.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage
  );

  const handlePageChange = (event, newPage) => {
    setPage(newPage);
  };

  // Reset to page 1 when data or filters change
  React.useEffect(() => {
    setPage(1);
  }, [filteredTableData.length, date, activeFilters, columnFilters, selectedChartPoint]);

  // Reset chart point filter and other filters when date range changes
  React.useEffect(() => {
    setSelectedChartPoint(null);
    setSelectedResourceTypes([]);
    setSelectedAppFamilies([]);
  }, [date]);

  // Generate trend data based on Early Warnings + Potential Issue mapped state and date filter
  const generateTrendData = () => {
    if (!earlyWarningsData || earlyWarningsData.length === 0) {
      return [];
    }

    const now = Date.now();
    let intervals = [];
    
    // Calculate date range - parse PST-formatted strings from TimelineFilter
    let startDateMs = date?.startDate 
      ? dayjs.tz(date.startDate, 'YYYY-MM-DD hh:mm:ss A', 'America/Los_Angeles').utc().valueOf()
      : now - 24 * 60 * 60 * 1000;
    let endDateMs = date?.endDate 
      ? dayjs.tz(date.endDate, 'YYYY-MM-DD hh:mm:ss A', 'America/Los_Angeles').utc().valueOf()
      : now;
    
    // Calculate the difference in days
    const diffMs = endDateMs - startDateMs;
    const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
    
    // Determine interval size based on date range
    let intervalCount, intervalMs;
    const diffHours = diffMs / (60 * 60 * 1000);
    
    if (diffHours <= 6) {
      // 6 hours or less: divide into 6 intervals
      intervalCount = 6;
      intervalMs = diffMs / intervalCount;
    } else if (diffDays <= 1) {
      // Up to 24 hours: divide into 6-8 intervals based on duration
      intervalCount = Math.min(8, Math.max(4, Math.ceil(diffHours / 3)));
      intervalMs = diffMs / intervalCount;
    } else if (diffDays <= 14) {
      // Up to 14 days: 7 intervals
      intervalCount = Math.min(7, diffDays);
      intervalMs = diffMs / intervalCount;
    } else {
      // More than 14 days: 7 intervals
      intervalCount = 7;
      intervalMs = diffMs / intervalCount;
    }
    
    // Get the user's preferred timezone for display (default to PST)
    const displayTz = preferredTZ || 'America/Los_Angeles';
    
    // Helper to round minutes to nearest 10
    const roundToNearest10Minutes = (dayjsObj) => {
      const minutes = dayjsObj.minute();
      const roundedMinutes = Math.round(minutes / 10) * 10;
      if (roundedMinutes === 60) {
        return dayjsObj.minute(0).add(1, 'hour');
      }
      return dayjsObj.minute(roundedMinutes);
    };
    
    for (let i = intervalCount; i >= 0; i--) {
      const intervalEndMs = endDateMs - (i * intervalMs);
      const intervalStartMs = intervalEndMs - intervalMs;
      
      // Format the label using the user's preferred timezone for display
      let intervalEndDayjs = dayjs.utc(intervalEndMs).tz(displayTz);
      
      // Round to nearest 10 minutes for cleaner labels
      const roundedIntervalEnd = roundToNearest10Minutes(intervalEndDayjs);
      
      let label;
      if (diffDays <= 1) {
        // For short ranges, show HH:mm format
        label = roundedIntervalEnd.format('HH:mm');
      } else if (diffDays <= 7) {
        // For up to a week, show day and time
        label = roundedIntervalEnd.format('M/D HH:mm');
      } else {
        // For longer ranges, show just the date
        label = roundedIntervalEnd.format('M/D');
      }
      
      intervals.push({ startMs: intervalStartMs, endMs: intervalEndMs, label });
    }

    const countStateInInterval = (warnings, events) => {
      const latestStateByEW = (events || []).reduce((acc, event) => {
        const ewId = event?.earlyWarningId;
        if (!ewId) return acc;
        const mapped = normalizeState(event?.state);
        if (!mapped) return acc;
        const eventTime = dayjs.utc(event?.timeGenerated).valueOf();
        const prev = acc[ewId];
        if (!prev || eventTime >= prev.time) {
          acc[ewId] = { state: mapped, time: eventTime };
        }
        return acc;
      }, {});

      const counts = { truePositive: 0, falsePositive: 0, new: 0, acknowledged: 0, resolved: 0, removed: 0 };
      (warnings || []).forEach((warning) => {
        const ewId = warning?.earlyWarningId;
        const finalState = (ewId && latestStateByEW[ewId]?.state) || normalizeState(warning?.status) || 'new';
        if (counts[finalState] !== undefined) counts[finalState]++;
      });
      return counts;
    };

    // Count total warnings and all state counts in each interval
    return intervals.map(interval => {
      const inInterval = (time) => time >= interval.startMs && time < interval.endMs;
      const intervalWarnings = (earlyWarningsData || []).filter(w => w?.timeGenerated && inInterval(dayjs.utc(w.timeGenerated).valueOf()));
      const intervalEvents = (warningEventsData || []).filter(e => e?.timeGenerated && inInterval(dayjs.utc(e.timeGenerated).valueOf()));
      const stateCounts = countStateInInterval(intervalWarnings, intervalEvents);

      return {
        time: interval.label,
        warnings: intervalWarnings.length,
        intervalStart: interval.startMs,
        intervalEnd: interval.endMs,
        ...stateCounts
      };
    });
  };

  const trendData = generateTrendData();

  // Get time range label for subtitle
  const getTimeRangeLabel = () => {
    if (date?.startDate && date?.endDate) {
      // Parse PST-formatted dates from TimelineFilter and convert to user's preferred timezone
      const displayTz = preferredTZ || 'America/Los_Angeles';
      const start = dayjs.tz(date.startDate, 'YYYY-MM-DD hh:mm:ss A', 'America/Los_Angeles').tz(displayTz);
      const end = dayjs.tz(date.endDate, 'YYYY-MM-DD hh:mm:ss A', 'America/Los_Angeles').tz(displayTz);
      
      // Check if start and end are on the same day (in user's timezone)
      if (start.format('YYYY-MM-DD') === end.format('YYYY-MM-DD')) {
        // Same day - show date with time range
        return `${start.format('M/D/YYYY')} ${start.format('HH:mm')} - ${end.format('HH:mm')}`;
      } else {
        // Different days - show full date range with times
        return `${start.format('M/D/YYYY HH:mm')} - ${end.format('M/D/YYYY HH:mm')}`;
      }
    }
    return 'All time trend';
  };

  // Generate Warnings by Component data from Early Warnings AND Warning Events
  const generateWarningsByComponent = () => {
    const tableDataForComponent = [...mappedWarningEventsForTable, ...uniqueEarlyWarningsForTable];
    
    if (!tableDataForComponent.length) {
      return ['VM/CPU', 'VM/Memory', 'VM/Disk', 'Database/CPU', 'Database/DTU', 'File Share', 'URL', 'Windows Service']
        .map(name => ({ name, warnings: 0 }));
    }

    const componentCounts = {};
    tableDataForComponent.forEach((warning) => {
      const parsed = parseSummary(warning?.summary);
      const detailsComponents = getComponentFromDetails(parsed?.Details);
      
      let component;
      if (detailsComponents.length > 1) {
        component = 'Multiple';
      } else if (detailsComponents.length === 1) {
        component = detailsComponents[0];
      } else {
        component = warning?.resourceType || parsed?.['Resource Type'] || parsed?.['ResourceType'] || 
                    parsed?.['resource type'] || parsed?.['resource_type'] || 'Other';
        component = String(component).trim() || 'Other';
        if (component.toLowerCase() === 'early warning' || component === '-') component = 'Other';
        
        const metricType = String(warning?.metricType || parsed?.['Metric Type'] || parsed?.['MetricType'] || 
                          parsed?.['metric type'] || parsed?.['Metric'] || '');
        if (component.toLowerCase() === 'vm') component = categorizeByMetric('vm', metricType);
        if (component.toLowerCase() === 'database') component = categorizeByMetric('database', metricType);
      }
      
      componentCounts[component] = (componentCounts[component] || 0) + 1;
    });

    return Object.entries(componentCounts)
      .map(([name, warnings]) => ({ name, warnings }))
      .sort((a, b) => b.warnings - a.warnings);
  };

  const warningsByComponent = generateWarningsByComponent();

  // Generate Warnings by Application data from Early Warnings
  const generateWarningsByApp = () => {
    if (!earlyWarningsData?.length) return [];
    const appNameCounts = {};
    earlyWarningsData.forEach((warning) => {
      const appRaw = warning?.applicationFamily || warning?.appCI || 'Unknown';
      const appName = appCIToNameMap[String(appRaw).toLowerCase()] || appRaw;
      appNameCounts[appName] = (appNameCounts[appName] || 0) + 1;
    });
    return Object.entries(appNameCounts)
      .map(([name, warnings]) => ({ name, warnings }))
      .sort((a, b) => b.warnings - a.warnings);
  };

  const warningsByApp = generateWarningsByApp();
  const totalWarningsCount = earlyWarningsData.length;

  // Calculate duration based on date filter (PST format)
  const getRangeDurationMs = () => {
    if (date?.startDate && date?.endDate) {
      const start = dayjs.tz(date.startDate, 'YYYY-MM-DD hh:mm:ss A', 'America/Los_Angeles').utc().valueOf();
      const end = dayjs.tz(date.endDate, 'YYYY-MM-DD hh:mm:ss A', 'America/Los_Angeles').utc().valueOf();
      return end - start;
    }
    return 24 * 60 * 60 * 1000; // Default to 24 hours
  };

  const getTimeWindow = (windowIndex = 0) => {
    const duration = getRangeDurationMs();
    if (date?.startDate && date?.endDate) {
      const start = dayjs.tz(date.startDate, 'YYYY-MM-DD hh:mm:ss A', 'America/Los_Angeles').utc().valueOf();
      const end = dayjs.tz(date.endDate, 'YYYY-MM-DD hh:mm:ss A', 'America/Los_Angeles').utc().valueOf();
      if (windowIndex === 0) {
        return { start, end };
      } else {
        // Previous window (same duration before the start date)
        return { start: start - duration, end: start };
      }
    }
    // Default behavior
    const end = Date.now() - (windowIndex * duration);
    const start = end - duration;
    return { start, end };
  };

  const filterByWindow = (data, window) => {
    if (!Array.isArray(data) || data.length === 0) return [];
    return data.filter((item) => {
      // Parse event time as UTC since database stores in UTC
      const t = dayjs.utc(item?.timeGenerated).valueOf();
      if (Number.isNaN(t)) return false;
      return t >= window.start && t < window.end;
    });
  };

  const STATE_DISPLAY_MAP = {
    'removed': 'Removed', 'resolved': 'Resolved', 'acknowledged': 'Acknowledged',
    'new': 'New', 'truePositive': 'True Positive', 'falsePositive': 'False Positive'
  };

  const computeStateCounts = (warnings, events) => {
    const latestPotentialStateByEarlyWarning = (events || []).reduce((acc, event) => {
      const ewId = event?.earlyWarningId;
      if (!ewId) return acc;
      const mapped = normalizeState(event?.state);
      if (!mapped) return acc;
      const eventTime = new Date(event?.timeGenerated || 0).getTime();
      const prev = acc[ewId];
      if (!prev || eventTime >= prev.time) {
        acc[ewId] = { state: STATE_DISPLAY_MAP[mapped], time: eventTime };
      }
      return acc;
    }, {});

    return (warnings || []).reduce((acc, warning) => {
      const ewId = warning?.earlyWarningId;
      const potentialIssueState = ewId ? latestPotentialStateByEarlyWarning[ewId]?.state : null;
      const normalized = normalizeState(warning?.status);
      const finalState = potentialIssueState || (normalized ? STATE_DISPLAY_MAP[normalized] : null) || 'New';

      const stateKey = { 'True Positive': 'truePositive', 'False Positive': 'falsePositive', 'Acknowledged': 'acknowledged', 'Resolved': 'resolved', 'Removed': 'removed' }[finalState] || 'new';
      acc[stateKey]++;
      return acc;
    }, { truePositive: 0, falsePositive: 0, new: 0, acknowledged: 0, resolved: 0, removed: 0 });
  };

  const currentWindow = getTimeWindow(0);
  const previousWindow = getTimeWindow(1);

  const currentWarningsForCards = filterByWindow(allEarlyWarningsData, currentWindow);
  const currentEventsForCards = filterByWindow(allWarningEventsData, currentWindow);
  const previousWarningsForCards = filterByWindow(allEarlyWarningsData, previousWindow);
  const previousEventsForCards = filterByWindow(allWarningEventsData, previousWindow);

  const stateCounts = computeStateCounts(currentWarningsForCards, currentEventsForCards);
  const previousStateCounts = computeStateCounts(previousWarningsForCards, previousEventsForCards);

  const totalWarningsPrevious = previousWarningsForCards.length;

  const getTrend = (currentValue, previousValue) => {
    if (previousValue === 0 && currentValue === 0) {
      return { trend: 0, trendUp: true };
    }
    if (previousValue === 0) {
      return { trend: 100, trendUp: true };
    }
    const pctChange = ((currentValue - previousValue) / previousValue) * 100;
    return {
      trend: Math.round(Math.abs(pctChange)),
      trendUp: pctChange >= 0
    };
  };

  // Show at least 1% if value > 0 to avoid misleading 0% when items exist
  const pct = (value) => {
    if (totalWarningsCount === 0) return 0;
    if (value === 0) return 0;
    const calculated = (value / totalWarningsCount) * 100;
    return Math.max(1, Math.round(calculated)); // At least 1% if value > 0
  };

  const totalTrend = getTrend(totalWarningsCount, totalWarningsPrevious);
  const truePositiveTrend = getTrend(stateCounts.truePositive, previousStateCounts.truePositive);
  const falsePositiveTrend = getTrend(stateCounts.falsePositive, previousStateCounts.falsePositive);
  const newTrend = getTrend(stateCounts.new, previousStateCounts.new);
  const acknowledgedTrend = getTrend(stateCounts.acknowledged, previousStateCounts.acknowledged);
  const resolvedTrend = getTrend(stateCounts.resolved, previousStateCounts.resolved);
  const removedTrend = getTrend(stateCounts.removed, previousStateCounts.removed);

  // Summary card data - using Providence colors matching the chart
  const summaryCards = [
    { title: "Total Warnings", value: totalWarningsCount, percent: 100, trend: totalTrend.trend, trendUp: totalTrend.trendUp, color: '#FF9800', filterKey: 'total' },
    { title: "True Positives", value: stateCounts.truePositive, percent: pct(stateCounts.truePositive), trend: truePositiveTrend.trend, trendUp: truePositiveTrend.trendUp, color: '#c74634', filterKey: 'truePositive' },
    { title: "False Positives", value: stateCounts.falsePositive, percent: pct(stateCounts.falsePositive), trend: falsePositiveTrend.trend, trendUp: falsePositiveTrend.trendUp, color: '#7d5ba6', filterKey: 'falsePositive' },
    { title: "New", value: stateCounts.new, percent: pct(stateCounts.new), trend: newTrend.trend, trendUp: newTrend.trendUp, color: BLUE_MAIN, filterKey: 'new' },
    { title: "Acknowledged", value: stateCounts.acknowledged, percent: pct(stateCounts.acknowledged), trend: acknowledgedTrend.trend, trendUp: acknowledgedTrend.trendUp, color: GREEN_MAIN, filterKey: 'acknowledged' },
    { title: "Resolved", value: stateCounts.resolved, percent: pct(stateCounts.resolved), trend: resolvedTrend.trend, trendUp: resolvedTrend.trendUp, color: '#00838f', filterKey: 'resolved' },
    { title: "Removed", value: stateCounts.removed, percent: pct(stateCounts.removed), trend: removedTrend.trend, trendUp: removedTrend.trendUp, color: NAVY_MAIN, filterKey: 'removed' }
  ];

  return (
    <>
      {/* Summary Cards */}
      <Grid item xs={12} container spacing={1.5} sx={{ mt: 1 }}>
        {summaryCards.map((card, index) => {
          const isSelected = card.filterKey !== 'total' && activeFilters.includes(card.filterKey);
          
          return (
          <Grid item xs={6} sm={4} md={true} key={index}>
            <Card
              onClick={() => handleCardClick(card.filterKey)}
              sx={{ borderRadius: 3, boxShadow: isSelected ? '0 4px 20px rgba(51,95,168,0.25)' : '0 4px 14px rgba(15,23,42,0.06)', border: isSelected ? `2px solid ${BLUE_MAIN}` : `1px solid ${NAVY_TINT}`, borderLeft: `4px solid ${card.color}`, background: isSelected ? `linear-gradient(180deg, rgba(51,95,168,0.15) 0%, #ffffff 42%)` : `linear-gradient(180deg, rgba(51,95,168,0.05) 0%, #ffffff 42%)`, height: 88, cursor: 'pointer', transition: 'all 0.2s ease-in-out', '&:hover': { boxShadow: '0 6px 20px rgba(51,95,168,0.18)', transform: 'translateY(-2px)' } }}
            >
              <CardContent sx={{ p: 1.2, '&:last-child': { pb: 1.2 }, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 0.75 }}>
                  <Typography variant="subtitle2" sx={{ color: NAVY_MAIN, fontWeight: 700, fontSize: '0.7rem', lineHeight: 1.2 }}>{card.title}</Typography>
                  <Box sx={{ px: 0.8, py: 0.15, borderRadius: 999, backgroundColor: isSelected ? BLUE_MAIN : 'rgba(51,95,168,0.08)', color: isSelected ? '#fff' : BLUE_MAIN, fontSize: '0.6rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{card.percent}%</Box>
                </Box>
                <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.4, fontSize: '1.12rem', color: '#111827' }}>{card.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
          );
        })}
      </Grid>

      {/* Top Cards */}
      <Grid item xs={12} container spacing={2}>
        {/* Trend Chart */}
        <Grid item xs={12} md={6}>
          <Card sx={{ borderRadius: 3, boxShadow: '0 4px 14px rgba(15,23,42,0.06)', border: `1px solid ${NAVY_TINT}`, backgroundColor: '#ffffff', height: 260 }}>
            <CardContent sx={{ p: 1.2, '&:last-child': { pb: 1.2 }, height: '100%' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: NAVY_MAIN, fontSize: '0.84rem' }}>
                    Total Warnings vs {selectedChartStates.length === 0 
                      ? 'States' 
                      : selectedChartStates.length === 1 
                        ? chartStateOptions.find(o => o.value === selectedChartStates[0])?.label || 'States'
                        : `${selectedChartStates.length} States`}
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#6b7280', fontSize: '0.68rem', mt: 0.12 }}>{getTimeRangeLabel()}</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Autocomplete
                    multiple
                    size="small"
                    options={chartStateOptions}
                    value={chartStateOptions.filter(opt => selectedChartStates.includes(opt.value))}
                    onChange={(e, newValue) => setSelectedChartStates(newValue.map(v => v.value))}
                    getOptionLabel={(option) => option.label}
                    isOptionEqualToValue={(option, value) => option.value === value.value}
                    disableCloseOnSelect
                    renderTags={(value, getTagProps) => value.map((option, index) => (
                      <Chip {...getTagProps({ index })} key={option.value} label={option.label} size="small" sx={{ height: 18, fontSize: 9, bgcolor: option.color, color: '#fff', '& .MuiChip-deleteIcon': { color: 'rgba(255,255,255,0.7)', fontSize: 12 }, '& .MuiChip-label': { px: 0.75 } }} />
                    ))}
                    renderOption={(props, option) => (<li {...props} style={{ fontSize: 11, padding: '4px 8px' }}><Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: option.color, mr: 1, flexShrink: 0 }} />{option.label}</li>)}
                    sx={{ width: 350, '& .MuiInputBase-root': { minHeight: 28, fontSize: 11, py: 0.25, flexWrap: 'wrap', gap: 0.25 }, '& .MuiAutocomplete-tag': { my: 0.125, maxWidth: 90 }, '& .MuiAutocomplete-endAdornment': { right: 4 } }}
                    renderInput={(params) => (<TextField {...params} placeholder={selectedChartStates.length === 0 ? "Select states" : ""} sx={{ '& .MuiInputBase-input': { fontSize: 10, py: 0.25, minWidth: '30px !important' } }} />)}
                  />
                  <Tooltip title="Select which states to display on the chart" arrow>
                    <InfoOutlined sx={{ fontSize: 16, color: NAVY_MAIN, cursor: 'pointer', '&:hover': { color: BLUE_MAIN } }} />
                  </Tooltip>
                </Box>
              </Box>
              
              <ResponsiveContainer width="100%" height={185}>
                <AreaChart 
                  data={trendData} 
                  margin={{ top: 0, right: 20, left: 0, bottom: 5 }}
                  onClick={handleChartPointClick}
                  style={{ cursor: 'pointer' }}
                >
                  <defs>
                    <linearGradient id="warningsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FF9800" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#FF9800" stopOpacity={0}/>
                    </linearGradient>
                    {chartStateOptions.map(opt => (
                      <linearGradient key={opt.value} id={`${opt.value}Gradient`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={opt.color} stopOpacity={0.2}/>
                        <stop offset="95%" stopColor={opt.color} stopOpacity={0}/>
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="time" 
                    tick={{ fontSize: 10, fill: '#6b7280' }}
                    axisLine={{ stroke: '#d1d5db' }}
                  />
                  <YAxis 
                    tick={{ fontSize: 10, fill: '#6b7280' }}
                    axisLine={{ stroke: '#d1d5db' }}
                  />
                  <RechartsTooltip 
                    contentStyle={{ 
                      backgroundColor: '#fff', 
                      border: '1px solid #e5e7eb',
                      borderRadius: 8,
                      fontSize: 11
                    }}
                    labelFormatter={(label) => `Time: ${label} (Click to filter)`}
                  />
                  <Legend 
                    wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
                    iconType="line"
                    iconSize={10}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="warnings" 
                    name="Total Warnings"
                    stroke="#FF9800" 
                    strokeWidth={2}
                    fill="url(#warningsGradient)"
                    dot={(props) => {
                      const isSelected = selectedChartPoint && selectedChartPoint.time === props.payload.time;
                      return (
                        <circle
                          cx={props.cx}
                          cy={props.cy}
                          r={isSelected ? 6 : 3}
                          fill={isSelected ? '#FF9800' : '#FF9800'}
                          stroke={isSelected ? '#fff' : 'none'}
                          strokeWidth={isSelected ? 2 : 0}
                          style={{ filter: isSelected ? 'drop-shadow(0 0 4px #FF9800)' : 'none' }}
                        />
                      );
                    }}
                    activeDot={{ r: 5, fill: '#FF9800', stroke: '#fff', strokeWidth: 2, cursor: 'pointer' }}
                  />
                  {selectedChartStates.map(stateKey => {
                    const stateOpt = chartStateOptions.find(o => o.value === stateKey);
                    if (!stateOpt) return null;
                    return (
                      <Area 
                        key={stateKey}
                        type="monotone" 
                        dataKey={stateKey}
                        name={stateOpt.label}
                        stroke={stateOpt.color} 
                        strokeWidth={2}
                        fill={`url(#${stateKey}Gradient)`}
                        dot={{ r: 2, fill: stateOpt.color }}
                        activeDot={{ r: 4, fill: stateOpt.color, stroke: '#fff', strokeWidth: 2 }}
                      />
                    );
                  })}
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Warnings by Component */}
        <Grid item xs={12} md={2.5}>
          <Card sx={{ borderRadius: 3, boxShadow: '0 4px 14px rgba(15,23,42,0.06)', border: `1px solid ${NAVY_TINT}`, backgroundColor: '#ffffff', height: 260 }}>
            <CardContent sx={{ p: 1.2, '&:last-child': { pb: 1.2 }, height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ mb: 0.45 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, color: NAVY_MAIN, fontSize: '0.84rem' }}>Warnings by Resource Type</Typography>
              </Box>
              <Divider sx={{ mb: 0.45 }} />

              <Box sx={{ flex: 1, overflowY: 'auto', pr: 0.2, '&::-webkit-scrollbar': { width: 6 }, '&::-webkit-scrollbar-thumb': { background: '#d1d5db', borderRadius: 3 } }}>
              {warningsByComponent.map((item) => {
                const isSelected = selectedResourceTypes.includes(item.name);
                return (
                <Box key={item.name} onClick={() => { setSelectedResourceTypes(prev => prev.includes(item.name) ? prev.filter(t => t !== item.name) : [...prev, item.name]); setPage(1); }} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.42, px: 0.5, borderRadius: 1, borderBottom: '1px solid #f3f4f6', cursor: 'pointer', backgroundColor: isSelected ? 'rgba(51,95,168,0.12)' : 'transparent', border: isSelected ? `1px solid ${BLUE_MAIN}` : '1px solid transparent', transition: 'all 0.15s ease-in-out', '&:hover': { backgroundColor: isSelected ? 'rgba(51,95,168,0.18)' : 'rgba(51,95,168,0.06)' }, '&:last-child': { borderBottom: isSelected ? `1px solid ${BLUE_MAIN}` : '1px solid transparent' } }}>
                  <Typography sx={{ fontSize: 12, color: isSelected ? BLUE_MAIN : NAVY_MAIN, fontWeight: isSelected ? 700 : 500, pr: 1 }}>
                    {item.name}
                  </Typography>
                  <Box sx={{ minWidth: 34, textAlign: 'right', px: 0.78, py: 0.2, borderRadius: 999, backgroundColor: isSelected ? BLUE_MAIN : '#FEF4E8', color: isSelected ? '#fff' : OCHRE_MAIN, fontSize: 12, fontWeight: 700 }}>
                    {item.warnings}
                  </Box>
                </Box>
              );
              })}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Warnings by Application */}
        <Grid item xs={12} md={3.5}>
          <Card sx={{ borderRadius: 3, boxShadow: '0 4px 14px rgba(15,23,42,0.06)', border: `1px solid ${NAVY_TINT}`, backgroundColor: '#ffffff', height: 260 }}>
            <CardContent sx={{ p: 1.2, '&:last-child': { pb: 1.2 }, height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.45, gap: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, color: NAVY_MAIN, fontSize: '0.84rem', whiteSpace: 'nowrap' }}>Warnings by Application</Typography>
                <Autocomplete
                  multiple
                  size="small"
                  options={warningsByApp.map(app => app.name)}
                  value={selectedAppFamilies}
                  onChange={(e, newValue) => { setSelectedAppFamilies(newValue); setPage(1); }}
                  disableCloseOnSelect
                  limitTags={1}
                  renderInput={(params) => <TextField {...params} placeholder={selectedAppFamilies.length === 0 ? "Filter..." : ""} />}
                  renderTags={(value, getTagProps) => value.length > 0 ? <Chip {...getTagProps({ index: 0 })} label={`${value.length} selected`} size="small" sx={{ height: 18, fontSize: 10, '& .MuiChip-label': { px: 0.5 } }} /> : null}
                  renderOption={(props, option) => <li {...props} style={{ fontSize: 11, padding: '4px 8px' }}>{option}</li>}
                  sx={{ flex: 1, maxWidth: 180, '& .MuiInputBase-root': { minHeight: 24, py: 0, fontSize: 10, borderRadius: 1.5, backgroundColor: '#f9fafb' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e5e7eb' }, '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: BLUE_MAIN }, '& .MuiAutocomplete-tag': { m: 0 }, '& .MuiAutocomplete-input': { py: '2px !important', px: 0.5 } }}
                />
              </Box>
              <Divider sx={{ mb: 0.45 }} />

              <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', pr: 0.2, '&::-webkit-scrollbar': { width: 6 }, '&::-webkit-scrollbar-thumb': { background: '#d1d5db', borderRadius: 3 } }}>
                {warningsByApp.map((app) => {
                  const isSelected = selectedAppFamilies.includes(app.name);
                  return (
                  <Box key={app.name} onClick={() => { setSelectedAppFamilies(prev => prev.includes(app.name) ? prev.filter(a => a !== app.name) : [...prev, app.name]); setPage(1); }} sx={{ mb: 0.5, p: 0.5, borderRadius: 1, cursor: 'pointer', backgroundColor: isSelected ? 'rgba(51,95,168,0.12)' : 'transparent', border: isSelected ? `1px solid ${BLUE_MAIN}` : '1px solid transparent', transition: 'all 0.15s ease-in-out', '&:hover': { backgroundColor: isSelected ? 'rgba(51,95,168,0.18)' : 'rgba(51,95,168,0.06)' } }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.2 }}>
                      <Typography sx={{ fontSize: 12, color: isSelected ? BLUE_MAIN : NAVY_MAIN, fontWeight: isSelected ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }} title={app.name}>{app.name}</Typography>
                      <Typography sx={{ fontSize: 12, fontWeight: 700, color: isSelected ? BLUE_MAIN : OCHRE_MAIN }}>{app.warnings}</Typography>
                    </Box>
                  <LinearProgress variant="determinate" value={totalWarningsCount > 0 ? (app.warnings / totalWarningsCount) * 100 : 0} sx={{ height: 4, borderRadius: 3, backgroundColor: isSelected ? 'rgba(51,95,168,0.2)' : '#FEF4E8', '& .MuiLinearProgress-bar': { borderRadius: 3, backgroundColor: isSelected ? BLUE_MAIN : OCHRE_MAIN } }} />
                </Box>
              );
              })}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Active Filters Indicator */}
      {(activeFilters.length > 0 || selectedChartPoint || selectedResourceTypes.length > 0 || selectedAppFamilies.length > 0 || Object.keys(columnFilters).filter(k => columnFilters[k]).length > 0) && (
        <Grid item xs={12}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', py: 0.5 }}>
            <Typography sx={{ fontSize: 13, color: NAVY_MAIN, fontWeight: 600 }}>
              Filtered by:
            </Typography>
            {selectedChartPoint && (
              <Chip label={`Time: ${selectedChartPoint.time}`} size="small" onDelete={() => setSelectedChartPoint(null)} sx={{ backgroundColor: '#FF9800', color: '#fff', fontWeight: 600, fontSize: 11, '& .MuiChip-deleteIcon': { color: 'rgba(255,255,255,0.7)', '&:hover': { color: '#fff' } } }} />
            )}
            {activeFilters.map((filter) => (
              <Chip key={filter} label={filter === 'truePositive' ? 'True Positives' : filter === 'falsePositive' ? 'False Positives' : filter.charAt(0).toUpperCase() + filter.slice(1)} size="small" onDelete={() => handleCardClick(filter)} sx={{ backgroundColor: BLUE_MAIN, color: '#fff', fontWeight: 600, fontSize: 11, '& .MuiChip-deleteIcon': { color: 'rgba(255,255,255,0.7)', '&:hover': { color: '#fff' } } }} />
            ))}
            {selectedResourceTypes.map((resourceType) => (
              <Chip key={resourceType} label={`Resource Type: ${resourceType}`} size="small" onDelete={() => setSelectedResourceTypes(prev => prev.filter(t => t !== resourceType))} sx={{ backgroundColor: '#00838f', color: '#fff', fontWeight: 600, fontSize: 11, '& .MuiChip-deleteIcon': { color: 'rgba(255,255,255,0.7)', '&:hover': { color: '#fff' } } }} />
            ))}
            {selectedAppFamilies.map((appFamily) => (
              <Chip key={appFamily} label={`Application: ${appFamily}`} size="small" onDelete={() => setSelectedAppFamilies(prev => prev.filter(a => a !== appFamily))} sx={{ backgroundColor: '#7d5ba6', color: '#fff', fontWeight: 600, fontSize: 11, '& .MuiChip-deleteIcon': { color: 'rgba(255,255,255,0.7)', '&:hover': { color: '#fff' } } }} />
            ))}
            {Object.entries(columnFilters).filter(([k, v]) => v && String(v).trim()).map(([colKey, filterVal]) => (
              <Chip key={`col-${colKey}`} label={`${columnLabelMap[colKey] || colKey} ${columnOps[colKey] || 'contains'}: ${filterVal}`} size="small" onDelete={() => setColumnFilters(f => ({ ...f, [colKey]: '' }))} sx={{ backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0', color: '#334155', fontWeight: 600, fontSize: 11, '& .MuiChip-deleteIcon': { color: '#64748b', '&:hover': { color: '#334155' } } }} />
            ))}
            <Button size="small" onClick={() => { setActiveFilters([]); setColumnFilters({}); setColumnOps({}); setSelectedChartPoint(null); setSelectedResourceTypes([]); setSelectedAppFamilies([]); }} sx={{ fontSize: 11, textTransform: 'none', color: BLUE_MAIN, fontWeight: 600, minWidth: 'auto', '&:hover': { backgroundColor: 'rgba(51,95,168,0.08)' } }}>Clear All</Button>
            <Typography sx={{ fontSize: 12, color: '#6b7280', ml: 'auto' }}>
              Showing {filteredTableData.length} of {tableData.length} records
            </Typography>
          </Box>
        </Grid>
      )}

      {/* Logs */}
      <Grid item xs={12}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
          <Button variant="outlined" size="small" startIcon={<FileDownloadOutlined />} disabled={filteredTableData.length === 0}
            onClick={() => {
              const headers = issueTableColumns.map(col => columnLabelMap[col] || col);
              const escape = v => (v.includes('"') || v.includes(',') || v.includes('\n')) ? `"${v.replace(/"/g, '""')}"` : v;
              const rows = filteredTableData.map(row => issueTableColumns.map(col => {
                const val = (col === 'timeGenerated' || col === 'stateChangedTime') ? formatTimeForPreferredTZ(row[col]) : String(row[col] ?? '');
                return escape(val);
              }));
              const blob = new Blob([[headers.join(','), ...rows.map(r => r.join(','))].join('\n')], { type: 'text/csv' });
              Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `audit_report_${dayjs().format('YYYY-MM-DD_HH-mm-ss')}.csv` }).click();
            }}
            sx={{ textTransform: 'none', fontWeight: 600, fontSize: 12, borderColor: BLUE_MAIN, color: BLUE_MAIN, '&:hover': { backgroundColor: 'rgba(51,95,168,0.08)' } }}
          >Export to CSV</Button>
        </Box>
        <TableContainer sx={{ bgcolor: '#fff', borderRadius: 3, boxShadow: '0 8px 24px rgba(15,23,42,0.06)', border: `1px solid ${NAVY_TINT}`, overflowX: 'auto', width: '100%' }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}>
              <CircularProgress size={40} sx={{ color: BLUE_MAIN }} />
            </Box>
          ) : (
            <>
              <Table size="small" sx={{ tableLayout: 'auto', width: '100%', minWidth: { xs: 700, sm: 850, md: 980 } }}>
                <TableHead>
                  <TableRow>
                    {issueTableColumns.map((columnKey) => (
                      <StyledTableCell key={columnKey}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>
                            {columnLabelMap[columnKey] || columnKey}
                          </Typography>
                          {columnKey === 'timeGenerated' ? (
                            // Only Time Generated gets sort icons
                            <IconButton 
                              size="small" 
                              onClick={() => handleSort(columnKey)} 
                              sx={{ p: 0.25, color: '#fff' }}
                            >
                              {getSortIcon(columnKey)}
                            </IconButton>
                          ) : (
                            // All other columns get filter icons
                            <>
                              <IconButton 
                                size="small" 
                                onClick={(e) => setFilterAnchors(a => ({ ...a, [columnKey]: e.currentTarget }))} 
                                sx={{ p: 0.25, color: '#fff' }}
                              >
                                <FilterAlt sx={{ fontSize: 14, color: columnFilters[columnKey] ? '#fbbf24' : '#fff' }} />
                              </IconButton>
                              <Popover
                                open={Boolean(filterAnchors[columnKey])}
                                anchorEl={filterAnchors[columnKey]}
                                onClose={() => setFilterAnchors(a => ({ ...a, [columnKey]: null }))}
                                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                              >
                                <Box sx={{ p: 1.5, minWidth: 220 }}>
                                  <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#334155', mb: 1 }}>
                                    {columnLabelMap[columnKey] || columnKey} Filter
                                  </Typography>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <Select
                                      value={columnOps[columnKey] || 'contains'}
                                      onChange={(e) => setColumnOps(o => ({ ...o, [columnKey]: e.target.value }))}
                                      size="small"
                                      sx={{ height: 28, minHeight: 28, fontSize: 11 }}
                                      MenuProps={{ PaperProps: { sx: { '& .MuiMenuItem-root': { fontSize: 11 } } } }}
                                    >
                                      <MenuItem value="contains">Contains</MenuItem>
                                      <MenuItem value="equals">Equals</MenuItem>
                                      <MenuItem value="starts">Starts</MenuItem>
                                      <MenuItem value="ends">Ends</MenuItem>
                                    </Select>
                                    <TextField
                                      value={columnFilters[columnKey] || ''}
                                      onChange={(e) => { setColumnFilters(f => ({ ...f, [columnKey]: e.target.value })); setPage(1); }}
                                      placeholder="Search…"
                                      size="small"
                                      sx={{ flex: 1, '& .MuiInputBase-root': { height: 28, minHeight: 28 }, '& .MuiInputBase-input': { py: 0, fontSize: 11 } }}
                                    />
                                  </Box>
                                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1, gap: 0.5 }}>
                                    <Button size="small" onClick={() => setColumnFilters(f => ({ ...f, [columnKey]: '' }))} sx={{ textTransform: 'none', fontSize: 11 }}>Clear</Button>
                                    <Button size="small" variant="contained" onClick={() => setFilterAnchors(a => ({ ...a, [columnKey]: null }))} sx={{ textTransform: 'none', fontSize: 11 }}>Done</Button>
                                  </Box>
                                </Box>
                              </Popover>
                            </>
                          )}
                        </Box>
                      </StyledTableCell>
                    ))}
                  </TableRow>
                </TableHead>

                <TableBody>
                  {paginatedData.length === 0 ? (
                    <TableRow>
                      <StyledTableCell colSpan={issueTableColumns.length || 1} sx={{ textAlign: 'center', py: 4 }}>
                        <Typography sx={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                          No issues or early warnings data available
                        </Typography>
                      </StyledTableCell>
                    </TableRow>
                  ) : (
                    paginatedData.map((row, i) => (
                      <StyledTableRow key={i} sx={{ '&:hover': { bgcolor: '#f8f9fa', transition: 'background-color 0.2s' } }}>
                        {issueTableColumns.map((columnKey) => (
                          <StyledTableCell key={columnKey} sx={columnKey === 'timeGenerated' ? { color: '#1e293b' } : {}}>
                            {columnKey === 'condition' ? (
                              <Box 
                                component="span" 
                                px={1.5} 
                                py={0.5} 
                                borderRadius={999} 
                                bgcolor='#FFF3E6'
                                color='#C77800'
                                fontSize={11} 
                                fontWeight={700} 
                                display="inline-block" 
                                border='1px solid #F4A261'
                              >
                                {row[columnKey] ?? '-'}
                              </Box>
                            ) : (
                              columnKey === 'timeGenerated' || columnKey === 'stateChangedTime' ? (
                                formatTimeForPreferredTZ(row[columnKey])
                              ) :
                              columnKey === 'resourceName' ? (
                                <Box sx={{ whiteSpace: 'pre-line', textAlign: 'left' }}>
                                  {String(row.resourceType || '').toLowerCase().startsWith('vm') 
                                    ? getServerNameForVM(row[columnKey])
                                    : renderResourceDetailsWithBoldKeys(row[columnKey])}
                                </Box>
                              ) : (
                                row[columnKey] ?? '-'
                              )
                            )}
                          </StyledTableCell>
                        ))}
                      </StyledTableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              
              {/* Pagination */}
              {tableData.length > rowsPerPage && (
                <Box display="flex" justifyContent="center" mt={1} mb={0.5}>
                  <Pagination count={totalPages} page={page} onChange={handlePageChange} color="primary" size="medium" showFirstButton showLastButton sx={{ '& .MuiPaginationItem-root': { fontSize: 13, fontWeight: 600 } }} />
                </Box>
              )}
            </>
          )}
        </TableContainer>
      </Grid>
    </>
  );
}

// Performance Tab Content Component
const PERF_RED = '#c62828';
const PERF_STATUS = {
  fast: { color: GREEN_MAIN, label: 'Fast < 1000ms' },
  medium: { color: OCHRE_MAIN, label: '1000-3000ms' },
  slow: { color: PERF_RED, label: 'Slow > 3000ms' },
};
const perfGetStatus = (ms) => (ms < 1000 ? 'fast' : ms <= 3000 ? 'medium' : 'slow');
const perfBarWidth = (ms) => Math.min(100, Math.round((Number(ms) / 4000) * 100));
const perfCodeColor = (code) => (code >= 500 ? PERF_RED : code >= 400 ? OCHRE_MAIN : NAVY_MAIN);
const perfFmtNum = (v) => (v === null || v === undefined || v === '') ? '0' : Number(v).toLocaleString();
// Format a UTC epoch (ms) into the user's preferred timezone as "MM-DD HH:mm:ss"
const perfFmtTime = (ms, preferredTZ) => {
  if (ms === null || ms === undefined || ms === '') return '';
  const date = new Date(Number(ms));
  if (Number.isNaN(date.getTime())) return '';
  const tz = preferredTZ || 'America/Los_Angeles';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || '00';
  return `${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
};
// Shared navy table header, matching the Issues table (StyledTableCell head) for a consistent page style
const PERF_HEAD_CELL = { backgroundColor: '#00338e', color: '#fff', fontWeight: 700, fontSize: 12, letterSpacing: '0.03em', padding: '8px 10px', borderBottom: '2px solid rgba(255,255,255,0.15)', whiteSpace: 'nowrap' };
const perfPrettifyName = (fn) => {
  if (!fn) return 'Unknown';
  return String(fn)
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

// A single performance section card: metrics table with inline error-log drill-down.
function PerfSection({ title, subtitle, nameHeader, rows, errorLogs, preferredTZ }) {
  const [expandedId, setExpandedId] = useState(null);
  const [showAllId, setShowAllId] = useState(null);
  const INITIAL_ERRORS = 15;
  return (
    <Card sx={{ borderRadius: 3, boxShadow: '0 4px 14px rgba(15,23,42,0.06)', border: `1px solid ${NAVY_TINT}`, backgroundColor: '#ffffff', overflow: 'hidden' }}>
      <Box sx={{ p: 1.75, borderBottom: `1px solid ${NAVY_TINT}` }}>
        <Typography sx={{ fontWeight: 700, fontSize: '0.84rem', color: NAVY_MAIN }}>{title}</Typography>
        {subtitle && <Typography sx={{ fontSize: 12, color: '#6b7280', mt: 0.2 }}>{subtitle}</Typography>}
      </Box>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={PERF_HEAD_CELL}>{nameHeader}</TableCell>
              <TableCell sx={PERF_HEAD_CELL}>Average Response Time</TableCell>
              <TableCell sx={{ ...PERF_HEAD_CELL, textAlign: 'right' }}>Total Calls</TableCell>
              <TableCell sx={{ ...PERF_HEAD_CELL, textAlign: 'right' }}>Failed Calls</TableCell>
              <TableCell sx={{ ...PERF_HEAD_CELL, textAlign: 'center' }}>Logs</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} sx={{ textAlign: 'center', py: 4, color: '#9ca3af', fontSize: '0.85rem' }}>No data available</TableCell>
              </TableRow>
            ) : rows.map((ep) => {
              const ms = Number(ep.responseTime) || 0;
              const status = PERF_STATUS[perfGetStatus(ms)];
              const failed = Number(ep.failedCalls) || 0;
              const isOpen = expandedId === ep.id;
              const rowErrors = errorLogs[ep.id] || [];
              const showAll = showAllId === ep.id;
              const visibleErrors = showAll ? rowErrors : rowErrors.slice(0, INITIAL_ERRORS);
              return (
                <React.Fragment key={ep.id}>
                  <TableRow sx={{ backgroundColor: isOpen ? `${PERF_RED}0a` : 'transparent', '&:hover': { backgroundColor: isOpen ? `${PERF_RED}14` : '#eef4ff' } }}>
                    <TableCell sx={{ borderBottom: isOpen ? 'none' : `1px solid ${NAVY_TINT}`, py: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: status.color, flexShrink: 0 }} />
                        <Box>
                          <Typography sx={{ fontWeight: 600, fontSize: 13, color: NAVY_MAIN }}>{perfPrettifyName(ep.name)}</Typography>
                          <Typography sx={{ fontSize: 11, color: BLUE_MAIN, fontWeight: 600 }}>{ep.sub}</Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ borderBottom: isOpen ? 'none' : `1px solid ${NAVY_TINT}`, py: 1, minWidth: 160 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ px: 1, py: 0.25, borderRadius: 1, border: `1px solid ${status.color}55`, backgroundColor: `${status.color}15`, color: status.color, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{ms}ms</Box>
                        <Box sx={{ flex: 1, minWidth: 60, height: 6, borderRadius: 999, backgroundColor: '#f1f5f9', overflow: 'hidden' }}>
                          <Box sx={{ width: `${perfBarWidth(ms)}%`, height: '100%', borderRadius: 999, backgroundColor: status.color }} />
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ borderBottom: isOpen ? 'none' : `1px solid ${NAVY_TINT}`, py: 1, textAlign: 'right', fontWeight: 600, fontSize: 13, color: NAVY_MAIN }}>{perfFmtNum(ep.totalCalls)}</TableCell>
                    <TableCell sx={{ borderBottom: isOpen ? 'none' : `1px solid ${NAVY_TINT}`, py: 1, textAlign: 'right' }}>
                      <Typography sx={{ fontWeight: 700, fontSize: 13, color: failed > 0 ? PERF_RED : GREEN_MAIN }}>{perfFmtNum(failed)}</Typography>
                      <Typography sx={{ fontSize: 11, color: failed > 0 ? PERF_RED : '#9ca3af' }}>{ep.failedPercent}</Typography>
                    </TableCell>
                    <TableCell sx={{ borderBottom: isOpen ? 'none' : `1px solid ${NAVY_TINT}`, py: 1, textAlign: 'center' }}>
                      <Button
                        onClick={() => { setExpandedId(isOpen ? null : ep.id); setShowAllId(null); }}
                        startIcon={<TerminalIcon sx={{ fontSize: 15 }} />}
                        disabled={failed === 0}
                        sx={{
                          textTransform: 'none', fontSize: 11.5, fontWeight: 700, borderRadius: 1.5, px: 1.25, py: 0.4, minWidth: 0,
                          border: `1px solid ${isOpen ? PERF_RED : `${PERF_RED}66`}`,
                          backgroundColor: isOpen ? PERF_RED : `${PERF_RED}12`,
                          color: isOpen ? '#ffffff' : PERF_RED,
                          '&:hover': { backgroundColor: isOpen ? '#a01f1f' : `${PERF_RED}22`, border: `1px solid ${isOpen ? '#a01f1f' : PERF_RED}` },
                          '&.Mui-disabled': { border: `1px solid ${NAVY_TINT}`, backgroundColor: '#f8fafc', color: '#cbd5e1' },
                        }}
                      >
                        Error Logs
                      </Button>
                    </TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell colSpan={5} sx={{ p: 0, borderBottom: isOpen ? `1px solid ${NAVY_TINT}` : 'none' }}>
                      <Collapse in={isOpen} timeout="auto" unmountOnExit>
                        <Box sx={{ backgroundColor: `${PERF_RED}08`, borderTop: `1px solid ${PERF_RED}33` }}>
                          <TableContainer sx={{ maxHeight: 320 }}>
                            <Table size="small" stickyHeader>
                              <TableHead>
                                <TableRow>
                                  <TableCell sx={{ ...PERF_HEAD_CELL, backgroundColor: '#8f2020' }}>Time</TableCell>
                                  <TableCell sx={{ ...PERF_HEAD_CELL, backgroundColor: '#8f2020' }}>Code</TableCell>
                                  <TableCell sx={{ ...PERF_HEAD_CELL, backgroundColor: '#8f2020' }}>Reason</TableCell>
                                  <TableCell sx={{ ...PERF_HEAD_CELL, backgroundColor: '#8f2020' }}>Error Message</TableCell>
                                  <TableCell sx={{ ...PERF_HEAD_CELL, backgroundColor: '#8f2020', textAlign: 'right' }}>Duration</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {rowErrors.length === 0 ? (
                                  <TableRow>
                                    <TableCell colSpan={5} sx={{ textAlign: 'center', py: 2.5, color: '#9ca3af', fontSize: 12 }}>No recent error logs captured</TableCell>
                                  </TableRow>
                                ) : visibleErrors.map((err, ei) => (
                                  <TableRow key={ei} sx={{ '&:hover': { backgroundColor: `${PERF_RED}0a` } }}>
                                    <TableCell sx={{ py: 0.75, fontFamily: 'monospace', fontSize: 11.5, color: '#6b7280', borderBottom: `1px solid ${PERF_RED}22`, whiteSpace: 'nowrap' }}>{perfFmtTime(err.timeMs, preferredTZ) || err.time}</TableCell>
                                    <TableCell sx={{ py: 0.75, fontWeight: 700, fontSize: 12.5, color: perfCodeColor(Number(err.code)), borderBottom: `1px solid ${PERF_RED}22` }}>{err.code}</TableCell>
                                    <TableCell sx={{ py: 0.75, borderBottom: `1px solid ${PERF_RED}22` }}>
                                      <Box component="span" sx={{ px: 0.9, py: 0.2, borderRadius: 1, backgroundColor: `${PERF_RED}15`, color: PERF_RED, fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{err.reason || 'Error'}</Box>
                                    </TableCell>
                                    <TableCell sx={{ py: 0.75, borderBottom: `1px solid ${PERF_RED}22`, maxWidth: 420 }}>
                                      <Typography sx={{ fontSize: 12, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={err.message}>{err.message}</Typography>
                                      <Typography sx={{ fontFamily: 'monospace', fontSize: 11, color: BLUE_MAIN, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={err.path}>{err.path}</Typography>
                                    </TableCell>
                                    <TableCell sx={{ py: 0.75, fontFamily: 'monospace', fontSize: 11.5, color: '#6b7280', borderBottom: `1px solid ${PERF_RED}22`, textAlign: 'right', whiteSpace: 'nowrap' }}>{err.duration}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableContainer>
                          <Box sx={{ px: 2, py: 1, borderTop: `1px solid ${PERF_RED}33`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                            <Typography sx={{ fontSize: 11.5, color: PERF_RED }}>Showing {visibleErrors.length} of {rowErrors.length} errors</Typography>
                            {rowErrors.length > INITIAL_ERRORS && (
                              <Button
                                onClick={() => setShowAllId(showAll ? null : ep.id)}
                                sx={{ textTransform: 'none', fontSize: 11.5, fontWeight: 700, color: PERF_RED, px: 1, py: 0.25, minWidth: 0, '&:hover': { backgroundColor: `${PERF_RED}12` } }}
                              >
                                {showAll ? 'Show less' : `View all ${rowErrors.length} errors`}
                              </Button>
                            )}
                          </Box>
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
}

function PerformanceTabContent({ preferredTZ }) {
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchPerformanceMetrics_fromADX(days)
      .then((res) => { if (active) setData(res); })
      .catch((err) => {
        if (active) {
          console.error('Performance metrics fetch error:', err);
          setError('Unable to load performance metrics.');
          setData(null);
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days]);

  const endpoints = data?.endpoints || [];
  const errorLogs = data?.errorLogs || {};

  const LegendDot = ({ color, label }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Box sx={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: color }} />
      <Typography sx={{ fontSize: 11, color: NAVY_MAIN, fontWeight: 600 }}>{label}</Typography>
    </Box>
  );

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 10 }}>
        <CircularProgress size={40} sx={{ color: BLUE_MAIN }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ backgroundColor: '#fff', borderRadius: 2, p: 2, minHeight: 120, display: 'flex', justifyContent: 'center', alignItems: 'center', border: `1px dashed ${NAVY_TINT}` }}>
        <Typography variant="body2" sx={{ color: '#9ca3af' }}>{error}</Typography>
      </Box>
    );
  }

  const windowLabel = days === 7 ? 'Last 7 days' : days === 14 ? 'Last 14 days' : 'Last 30 days';

  return (
    <Box>
      {/* Shared controls: response-time legend + time window filter */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <LegendDot color={PERF_STATUS.fast.color} label="Fast < 1000ms" />
          <LegendDot color={PERF_STATUS.medium.color} label="1000-3000ms" />
          <LegendDot color={PERF_STATUS.slow.color} label="Slow > 3000ms" />
        </Box>
        <Box sx={{ display: 'flex', gap: 0.25, bgcolor: '#f1f5f9', borderRadius: 999, p: 0.2 }}>
          {[{ key: 7, label: 'Week' }, { key: 14, label: 'Last 14 Days' }, { key: 30, label: 'Last Month' }].map((item) => (
            <Box key={item.key} onClick={() => setDays(item.key)} sx={{ px: 0.8, py: 0.3, borderRadius: 999, cursor: 'pointer', bgcolor: days === item.key ? BLUE_MAIN : 'transparent', color: days === item.key ? '#fff' : NAVY_MAIN, fontWeight: 600, fontSize: 10, transition: 'all 0.2s' }}>{item.label}</Box>
          ))}
        </Box>
      </Box>

      <PerfSection
        title="API Performance Metrics"
        subtitle={`Response times, traffic volumes and failure rates · ${windowLabel}`}
        nameHeader="API Name"
        rows={endpoints}
        errorLogs={errorLogs}
        preferredTZ={preferredTZ}
      />
    </Box>
  );
}

// User Metrics Tab Content Component
function UserMetricsTabContent({ userMetricsData, loading }) {
  const [selectedWindow, setSelectedWindow] = useState('7d');
  const [expandedUser, setExpandedUser] = useState(null);
  const [allLoginsModalOpen, setAllLoginsModalOpen] = useState(false);
  const [modalExpandedUser, setModalExpandedUser] = useState(null);
  const [suppressionData, setSuppressionData] = useState(null);
  const [suppressionLoading, setSuppressionLoading] = useState(true);
  const [selectedLoginDay, setSelectedLoginDay] = useState(null); // Track selected day for filtering
  const [sessionsViewMode, setSessionsViewMode] = useState(false); // Track if sessions line was clicked
  const [pageInfoAnchor, setPageInfoAnchor] = useState(null); // Anchor for page info popover

  // Fetch Alert Suppression data
  useEffect(() => {
    const fetchSuppressionData = async () => {
      setSuppressionLoading(true);
      try {
        const response = await fetch(baseUrl + 'getHistoricalDataForAllAppFamilies');
        const result = await response.json();
        const data = result.tableData || [];
        
        if (data && data.length > 0) {
          // Calculate summary metrics from raw data
          const uniqueUsers = new Set();
          const uniqueApps = new Set();
          let oneTimeRequests = 0;
          let recurringRequests = 0;
          const appTimeTotals = {};

          data.forEach(item => {
            if (item.appFamily) uniqueApps.add(item.appFamily);
            if (item.userEmail) uniqueUsers.add(item.userEmail.toLowerCase());
            
            // Count frequency types
            const freq = String(item.frequency || '').toLowerCase();
            if (freq === 'recurring') {
              recurringRequests++;
            } else {
              oneTimeRequests++;
            }
            // Sum suppression time per app family
            const start = new Date(item.startTime);
            const end = new Date(item.endTime);
            const durationMins = Math.max(0, Math.round((end - start) / (1000 * 60)));
            if (item.appFamily) {
              appTimeTotals[item.appFamily] = (appTimeTotals[item.appFamily] || 0) + durationMins;
            }
          });

          const appFamilyData = Object.entries(appTimeTotals)
            .map(([name, time]) => ({ name, time }))
            .sort((a, b) => b.time - a.time)
            .slice(0, 8);

          const processedData = {
            totalRequests: data.length,
            uniqueUsers: uniqueUsers.size,
            uniqueApps: uniqueApps.size,
            oneTimeRequests,
            recurringRequests,
            appFamilyData
          };
          
          setSuppressionData(processedData);
        } else {
          setSuppressionData(null);
        }
      } catch (error) {
        console.error('Error fetching suppression data:', error);
        setSuppressionData(null);
      } finally {
        setSuppressionLoading(false);
      }
    };

    fetchSuppressionData();
  }, []);

  // Helper to get initials from name
  const getInitials = (name) => {
    if (!name || name === 'Unknown User') return '?';
    const parts = name.split(/[\s,]+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // Helper to get avatar background color based on name
  const getAvatarColor = (name) => {
    const colors = ['#335fa8', '#5da44f', '#df9538', '#4a5b6a', '#9c27b0', '#00838f', '#c62828', '#6a1b9a'];
    if (!name) return colors[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  // Helper to format time ago
  const formatTimeAgo = (seconds) => {
    if (seconds === null || seconds === undefined) return '-';
    // Round up to at least 1 minute for any positive time spent
    const mins = seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : 0;
    if (mins < 60) return `${mins}m`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.round(hours / 24);
    return `${days}d`;
  };

  const getValueByCandidates = (obj, candidates) => {
    if (!obj) return undefined;
    const keyMap = Object.keys(obj).reduce((acc, key) => {
      acc[key.toLowerCase().replace(/[^a-z0-9]/g, '')] = key;
      return acc;
    }, {});

    for (const candidate of candidates) {
      const normalized = candidate.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (keyMap[normalized]) return obj[keyMap[normalized]];
    }
    return undefined;
  };

  const parseTime = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const enrichedRows = userMetricsData.map((row) => {
    const userName =
      getValueByCandidates(row, ['UserName', 'User Name', 'UPN', 'Email', 'Identity', 'User']) ||
      'Unknown User';

    const timeGeneratedRaw = getValueByCandidates(row, ['TimeGenerated', 'Time Generated', 'Timestamp', 'EventTime']);
    const parsedTime = parseTime(timeGeneratedRaw);

    return {
      ...row,
      userName,
      parsedTime,
    };
  });

  const normalizeUserName = (value) =>
    String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');

  const blockedUserNames = new Set([
    'm k',
    'sai ramanan',
    'm k sai ramanan',
    'sudeepthi kalisapudi l',
    'ghosh shreya',
    'panda situn',
    'mallick ayush',
    'penmetsa karthik sai verma',
    'penmetsa karthik sai varma'
  ]);

  const normalizedEnrichedRows = enrichedRows.filter((row) => {
    const normalized = normalizeUserName(row?.userName);
    return !blockedUserNames.has(normalized);
  });

  const getLoginSignal = (row) => {
    const signal = getValueByCandidates(row, [
      'Activity',
      'EventName',
      'OperationName',
      'Action',
      'MetricName',
      'Event Type',
      'EventType'
    ]);
    return String(signal || '').toLowerCase();
  };

  // Mapping of raw page names to user-friendly display names
  const pageNameDisplayMap = {
    'applicationhealth': 'Application Health',
    'bakingnow': 'Baking Now',
    'validation': 'App Validation',
    'alertsuppression': 'Alert Suppression',
    'alertsummary': 'Alert Summary',
    'applicationheatmap': 'Application Heatmap',
    'appwallboard': 'Application Wallboard',
    'homepage': 'Home Page',
    'leadershipdashboard': 'Leadership Dashboard',
    'auditreport': 'Audit Report',
    'serverStatus': 'Server Status',
    'serverstatus': 'Server Status',
    'appstatus': 'App Status',
    'databasemetrics': 'Database Metrics',
    'applicationinsights': 'Application Insights',
  };

  // Mapping of page names to descriptions
  const pageDescriptionMap = {
    'Application Health': 'Shows application health status, metrics, and warnings across monitored areas to help quickly identify issues.',
    'Baking Now': 'Displays key operational events from the last 24 hours including patches, backups, major incidents, and change requests.',
    'App Validation': 'Enables users to trigger App validation on demand and view historical runs.',
    'Alert Suppression': 'Allows users to suppress alerts for specific applications or resources.',
    'Alert Summary': 'Overview of all alerts across applications.',
    'Application Heatmap': 'Executive dashboard showing application health, availability metrics, and incident analytics.',
    'Application Wallboard': 'View of all application families grouped by support groups with health status and active incidents.',
    'Audit Report': 'Audit logs and reports for user activities.',
  };

  const getPageNameFromVisited = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '-';

    let pageName = '-';
    
    try {
      const normalizedUrl = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
      const parsed = new URL(normalizedUrl);
      const host = parsed.hostname.toLowerCase();
      const pathParts = parsed.pathname.split('/').filter(Boolean);

      if (host === 'itelemetry.providence.org' || host.endsWith('.itelemetry.providence.org')) {
        pageName = pathParts[0] || '-';
      } else {
        pageName = pathParts[0] || raw;
      }
    } catch {
      const marker = 'itelemetry.providence.org/';
      const lower = raw.toLowerCase();
      const idx = lower.indexOf(marker);
      if (idx >= 0) {
        const rest = raw.slice(idx + marker.length);
        pageName = rest.split('/').filter(Boolean)[0] || '-';
      } else {
        const cleaned = raw.replace(/^\/+/, '');
        pageName = cleaned.split('/').filter(Boolean)[0] || raw;
      }
    }
    
    // Convert to display name if mapping exists
    const pageNameLower = pageName.toLowerCase();
    return pageNameDisplayMap[pageNameLower] || pageName;
  };

  const hasLoginLikeSignals = normalizedEnrichedRows.some((row) => {
    const s = getLoginSignal(row);
    return /login|logon|sign\s?in|signin|authenticate/.test(s);
  });

  const loginRows = hasLoginLikeSignals
    ? normalizedEnrichedRows.filter((row) => /login|logon|sign\s?in|signin|authenticate/.test(getLoginSignal(row)))
    : normalizedEnrichedRows.filter((row) => row.parsedTime);

  const getDayKey = (dateObj) => `${dateObj.getFullYear()}-${dateObj.getMonth()}-${dateObj.getDate()}`;

  // Session timeout in milliseconds (30 minutes)
  const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

  // Calculate sessions with 30-minute timeout logic
  // A new session starts if the gap between consecutive events for the same user is > 30 minutes
  const calculateSessionsWithTimeout = (rows, filterFn = () => true) => {
    // Filter rows first
    const filteredRows = rows.filter(row => row.parsedTime && filterFn(row));
    
    if (filteredRows.length === 0) return 0;

    // Group by user
    const userEvents = new Map();
    filteredRows.forEach(row => {
      const userKey = String(row.userName || 'Unknown User').toLowerCase();
      if (!userEvents.has(userKey)) {
        userEvents.set(userKey, []);
      }
      userEvents.get(userKey).push(row.parsedTime.getTime());
    });

    let totalSessions = 0;

    // For each user, sort their events and count sessions based on 30-min gaps
    userEvents.forEach((timestamps) => {
      if (timestamps.length === 0) return;
      
      // Sort timestamps ascending
      timestamps.sort((a, b) => a - b);
      
      // First event always starts a session
      let sessions = 1;
      
      for (let i = 1; i < timestamps.length; i++) {
        const gap = timestamps[i] - timestamps[i - 1];
        if (gap > SESSION_TIMEOUT_MS) {
          // Gap > 30 minutes = new session
          sessions++;
        }
      }
      
      totalSessions += sessions;
    });

    return totalSessions;
  };

  // Keep only one login record per user per day (latest timestamp for that day)
  const uniqueDailyLoginRows = Array.from(
    loginRows.reduce((acc, row) => {
      if (!row.parsedTime) return acc;
      const userKey = String(row.userName || 'Unknown User').toLowerCase();
      const dayKey = getDayKey(row.parsedTime);
      const dedupeKey = `${dayKey}__${userKey}`;

      const prev = acc.get(dedupeKey);
      if (!prev || row.parsedTime > prev.parsedTime) {
        acc.set(dedupeKey, row);
      }
      return acc;
    }, new Map()).values()
  );

  const getRangeDays = (windowKey) => {
    if (windowKey === '14d') return 14;
    if (windowKey === '30d') return 30;
    return 7;
  };

  const now = new Date();
  const rangeDays = getRangeDays(selectedWindow);
  const startOfWindow = new Date(now);
  startOfWindow.setDate(startOfWindow.getDate() - (rangeDays - 1));
  startOfWindow.setHours(0, 0, 0, 0);

  const rangeLoginRows = uniqueDailyLoginRows.filter((row) => {
    if (!row.parsedTime) return false;
    return row.parsedTime >= startOfWindow && row.parsedTime <= now;
  });

  // Total sessions with 30-minute timeout logic
  const totalSessions = calculateSessionsWithTimeout(loginRows, (row) => 
    row.parsedTime >= startOfWindow && row.parsedTime <= now
  );

  // Unique users = distinct users seen in selected window
  const uniqueUsers = new Set(
    rangeLoginRows.map((r) => String(r.userName || 'Unknown User').toLowerCase())
  ).size;

  const loginData = Array.from({ length: rangeDays }).map((_, index) => {
    const d = new Date(startOfWindow);
    d.setDate(startOfWindow.getDate() + index);
    const key = getDayKey(d);

    // Get unique users who logged in on this day
    const dayLogins = uniqueDailyLoginRows.filter((row) => {
      if (!row.parsedTime) return false;
      const rowKey = getDayKey(row.parsedTime);
      return rowKey === key;
    });
    
    const uniqueUsersForDay = new Set(
      dayLogins.map((r) => String(r.userName || 'Unknown User').toLowerCase())
    ).size;

    // Sessions for this day with 30-minute timeout logic
    const sessionsForDay = calculateSessionsWithTimeout(loginRows, (row) => {
      const rowKey = getDayKey(row.parsedTime);
      return rowKey === key && row.parsedTime >= startOfWindow && row.parsedTime <= now;
    });

    return {
      day: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      dayKey: key,
      dateObj: new Date(d),
      value: uniqueUsersForDay,
      sessions: sessionsForDay,
    };
  });

  // Handle chart point click for filtering - detects if sessions or users line was clicked
  const handleLoginChartClick = (data) => {
    if (data && data.activePayload && data.activePayload.length > 0) {
      const clickedPoint = data.activePayload[0].payload;
      // Detect which line was clicked - check the dataKey of the active payload
      const clickedDataKey = data.activePayload[0]?.dataKey;
      const isSessionsClick = clickedDataKey === 'sessions';
      
      // Toggle off if clicking the same day with same mode
      if (selectedLoginDay && selectedLoginDay.dayKey === clickedPoint.dayKey && sessionsViewMode === isSessionsClick) {
        setSelectedLoginDay(null);
        setSessionsViewMode(false);
      } else {
        setSelectedLoginDay(clickedPoint);
        setSessionsViewMode(isSessionsClick);
      }
    }
  };

  // Reset selected day and sessions mode when window changes
  React.useEffect(() => {
    setSelectedLoginDay(null);
    setSessionsViewMode(false);
  }, [selectedWindow]);

  // Group recent logs by user and aggregate pages
  const recentLogsGrouped = (() => {
    const userMap = new Map();
    
    loginRows
      .filter((row) => row.parsedTime)
      .filter((row) => row.parsedTime >= startOfWindow && row.parsedTime <= now)
      .filter((row) => {
        // Apply day filter if selected
        if (selectedLoginDay) {
          const rowKey = getDayKey(row.parsedTime);
          return rowKey === selectedLoginDay.dayKey;
        }
        return true;
      })
      .forEach((row) => {
        const userName = row.userName || 'Unknown User';
        const userKey = userName.toLowerCase();
        const rawTimeSpent = getValueByCandidates(row, ['TimeSpent', 'Time Spent', 'Duration', 'SessionDuration', 'Session Duration']);
        const parsedTimeSpent = (() => {
          if (rawTimeSpent === null || rawTimeSpent === undefined || rawTimeSpent === '') return 0;
          if (typeof rawTimeSpent === 'number') return rawTimeSpent;
          const numeric = Number(String(rawTimeSpent).replace(/[^0-9.-]/g, ''));
          return Number.isFinite(numeric) ? numeric : 0;
        })();
        
        const pageVisited = getPageNameFromVisited(getValueByCandidates(row, ['PageVisited', 'Page Visited', 'Page', 'URL', 'Url', 'Path', 'Route']));
        
        if (!userMap.has(userKey)) {
          userMap.set(userKey, {
            name: userName,
            pages: new Set(),
            totalTimeSpent: 0,
            latestTime: row.parsedTime,
            visits: []
          });
        }
        
        const userData = userMap.get(userKey);
        if (pageVisited && pageVisited !== '-') {
          userData.pages.add(pageVisited);
        }
        userData.totalTimeSpent += parsedTimeSpent;
        if (row.parsedTime > userData.latestTime) {
          userData.latestTime = row.parsedTime;
        }
        userData.visits.push({
          page: pageVisited,
          timeSpent: parsedTimeSpent,
          time: row.parsedTime
        });
      });
    
    return Array.from(userMap.values())
      .sort((a, b) => b.latestTime - a.latestTime);
  })();

  // Helper function to aggregate visits by page (one record per page with cumulative time)
  const getAggregatedVisits = (visits) => {
    const pageMap = new Map();
    visits.forEach((visit) => {
      const page = visit.page || '-';
      if (pageMap.has(page)) {
        pageMap.set(page, pageMap.get(page) + (visit.timeSpent || 0));
      } else {
        pageMap.set(page, visit.timeSpent || 0);
      }
    });
    return Array.from(pageMap.entries())
      .map(([page, totalTime]) => ({ page, totalTime }))
      .sort((a, b) => b.totalTime - a.totalTime);
  };

  // Calculate sessions per user for the selected day (for sessions view mode)
  const sessionsPerUser = (() => {
    if (!selectedLoginDay || !sessionsViewMode) return [];
    
    const dayKey = selectedLoginDay.dayKey;
    const userSessionsMap = new Map();
    
    // Get all rows for the selected day
    const dayRows = loginRows
      .filter(row => row.parsedTime && getDayKey(row.parsedTime) === dayKey);
    
    // Group by user and collect timestamps
    const userEvents = new Map();
    dayRows.forEach(row => {
      const userName = row.userName || 'Unknown User';
      const userKey = userName.toLowerCase();
      if (!userEvents.has(userKey)) {
        userEvents.set(userKey, { name: userName, timestamps: [], totalTimeSpent: 0 });
      }
      userEvents.get(userKey).timestamps.push(row.parsedTime.getTime());
      
      // Also track time spent
      const rawTimeSpent = getValueByCandidates(row, ['TimeSpent', 'Time Spent', 'Duration', 'SessionDuration', 'Session Duration']);
      const parsedTimeSpent = (() => {
        if (rawTimeSpent === null || rawTimeSpent === undefined || rawTimeSpent === '') return 0;
        if (typeof rawTimeSpent === 'number') return rawTimeSpent;
        const numeric = Number(String(rawTimeSpent).replace(/[^0-9.-]/g, ''));
        return Number.isFinite(numeric) ? numeric : 0;
      })();
      userEvents.get(userKey).totalTimeSpent += parsedTimeSpent;
    });
    
    // Calculate sessions for each user using 30-min timeout
    const result = [];
    userEvents.forEach((data, userKey) => {
      if (data.timestamps.length === 0) return;
      
      // Sort timestamps ascending
      data.timestamps.sort((a, b) => a - b);
      
      // Count sessions based on 30-min gaps
      let sessions = 1;
      for (let i = 1; i < data.timestamps.length; i++) {
        const gap = data.timestamps[i] - data.timestamps[i - 1];
        if (gap > SESSION_TIMEOUT_MS) {
          sessions++;
        }
      }
      
      result.push({
        name: data.name,
        sessions: sessions,
        events: data.timestamps.length,
        totalTimeSpent: data.totalTimeSpent
      });
    });
    
    // Sort by sessions descending, then by events
    return result.sort((a, b) => b.sessions - a.sessions || b.events - a.events);
  })();

  // Limited list for the card
  // When a day is selected, show all users for that day (matching the chart count); otherwise show first 5 with time >= 30 seconds
  const recentLogsLimited = selectedLoginDay
    ? recentLogsGrouped // Show all users when filtering by day to match chart count
    : recentLogsGrouped
        .filter(user => user.totalTimeSpent >= 30)
        .slice(0, 5);

  const windowLabel = selectedWindow === '14d' ? '14 days' : selectedWindow === '30d' ? 'month' : 'week';

  const totalSuppressionTime = suppressionData?.appFamilyData?.reduce((sum, item) => sum + item.time, 0) || 0;
  const maxSuppressionTime = suppressionData?.appFamilyData?.length > 0 
    ? Math.max(...suppressionData.appFamilyData.map(item => item.time)) 
    : 1;

  return (
    <Grid item xs={12}>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 10 }}>
          <CircularProgress size={40} sx={{ color: BLUE_MAIN }} />
        </Box>
      ) : (
        <Box p={0.5} bgcolor="#ffffff" borderRadius={2}>
          <Grid container spacing={2}>
            {/* LEFT SIDE - User Metrics */}
            <Grid item xs={12} md={6}>
              <Card sx={{ borderRadius: 3, border: `1px solid ${NAVY_TINT}`, boxShadow: '0 4px 14px rgba(15,23,42,0.06)', height: '100%' }}>
                <CardContent sx={{ p: 2 }}>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    <Typography variant="h6" sx={{ color: NAVY_MAIN, fontWeight: 700, fontSize: '0.95rem' }}>User Metrics</Typography>
                    <Box sx={{ display: 'flex', gap: 0.25, bgcolor: '#f1f5f9', borderRadius: 999, p: 0.2 }}>
                      {[{ key: '7d', label: 'Week' }, { key: '14d', label: 'Last 14 Days' }, { key: '30d', label: 'Last Month' }].map((item) => (
                        <Box key={item.key} onClick={() => setSelectedWindow(item.key)} sx={{ px: 0.8, py: 0.3, borderRadius: 999, cursor: 'pointer', bgcolor: selectedWindow === item.key ? BLUE_MAIN : 'transparent', color: selectedWindow === item.key ? '#fff' : NAVY_MAIN, fontWeight: 600, fontSize: 10, transition: 'all 0.2s' }}>{item.label}</Box>
                      ))}
                    </Box>
                  </Box>

                  {/* Stats Cards - matching Issues tab style */}
                  <Grid container spacing={1.5} mb={2}>
                    <Grid item xs={6}>
                      <Card sx={{ borderRadius: 3, boxShadow: '0 4px 14px rgba(15,23,42,0.06)', border: `1px solid ${NAVY_TINT}`, borderLeft: `4px solid ${GREEN_MAIN}`, background: `linear-gradient(180deg, rgba(51,95,168,0.05) 0%, #ffffff 42%)`, height: 72, transition: 'all 0.2s ease-in-out', '&:hover': { boxShadow: '0 6px 20px rgba(51,95,168,0.18)', transform: 'translateY(-2px)' } }}>
                        <CardContent sx={{ p: 1.2, '&:last-child': { pb: 1.2 }, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                          <Typography variant="subtitle2" sx={{ color: NAVY_MAIN, fontWeight: 700, fontSize: '0.7rem', lineHeight: 1.2 }}>Total Sessions</Typography>
                          <Typography variant="h5" sx={{ fontWeight: 700, fontSize: '1.12rem', color: '#111827' }}>{totalSessions}</Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={6}>
                      <Card sx={{ borderRadius: 3, boxShadow: '0 4px 14px rgba(15,23,42,0.06)', border: `1px solid ${NAVY_TINT}`, borderLeft: `4px solid ${BLUE_MAIN}`, background: `linear-gradient(180deg, rgba(93,164,79,0.05) 0%, #ffffff 42%)`, height: 72, transition: 'all 0.2s ease-in-out', '&:hover': { boxShadow: '0 6px 20px rgba(51,95,168,0.18)', transform: 'translateY(-2px)' } }}>
                        <CardContent sx={{ p: 1.2, '&:last-child': { pb: 1.2 }, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                          <Typography variant="subtitle2" sx={{ color: NAVY_MAIN, fontWeight: 700, fontSize: '0.7rem', lineHeight: 1.2 }}>Unique Users</Typography>
                          <Typography variant="h5" sx={{ fontWeight: 700, fontSize: '1.12rem', color: '#111827' }}>{uniqueUsers}</Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  </Grid>

                  {/* Daily Logins Area Chart */}
                  <Box sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Box>
                        <Typography variant="subtitle2" sx={{ fontSize: 13, fontWeight: 700, color: NAVY_MAIN }}>Daily Activity</Typography>
                        <Typography variant="caption" sx={{ color: '#9ca3af', fontSize: 11 }}>Sessions & unique users per day (click to filter)</Typography>
                      </Box>
                      {selectedLoginDay && (
                        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                          <Chip
                            label={`${selectedLoginDay.day}: ${selectedLoginDay.sessions} session${selectedLoginDay.sessions !== 1 ? 's' : ''}`}
                            size="small"
                            onClick={() => setSessionsViewMode(true)}
                            sx={{ backgroundColor: sessionsViewMode ? GREEN_MAIN : 'rgba(93,164,79,0.3)', color: sessionsViewMode ? '#fff' : GREEN_MAIN, fontWeight: 600, fontSize: 10, height: 22, cursor: 'pointer', border: sessionsViewMode ? 'none' : `1px solid ${GREEN_MAIN}` }}
                          />
                          <Chip
                            label={`${selectedLoginDay.value} user${selectedLoginDay.value !== 1 ? 's' : ''}`}
                            size="small"
                            onClick={() => setSessionsViewMode(false)}
                            sx={{ backgroundColor: !sessionsViewMode ? BLUE_MAIN : 'rgba(51,95,168,0.3)', color: !sessionsViewMode ? '#fff' : BLUE_MAIN, fontWeight: 600, fontSize: 10, height: 22, cursor: 'pointer', border: !sessionsViewMode ? 'none' : `1px solid ${BLUE_MAIN}` }}
                          />
                          <Chip
                            label="×"
                            size="small"
                            onClick={() => { setSelectedLoginDay(null); setSessionsViewMode(false); }}
                            sx={{ backgroundColor: '#e5e7eb', color: '#64748b', fontWeight: 700, fontSize: 12, height: 22, minWidth: 22, cursor: 'pointer', '& .MuiChip-label': { px: 0.5 } }}
                          />
                        </Box>
                      )}
                    </Box>
                     
                    <ResponsiveContainer width="100%" height={160}>
                      <AreaChart 
                        data={loginData} 
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                        onClick={handleLoginChartClick}
                        style={{ cursor: 'pointer' }}
                      >
                        <defs>
                          <linearGradient id="colorLogins" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={BLUE_MAIN} stopOpacity={0.3}/>
                            <stop offset="95%" stopColor={BLUE_MAIN} stopOpacity={0.05}/>
                          </linearGradient>
                          <linearGradient id="colorSessions" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={GREEN_MAIN} stopOpacity={0.3}/>
                            <stop offset="95%" stopColor={GREEN_MAIN} stopOpacity={0.05}/>
                          </linearGradient>
                        </defs>
                        <XAxis 
                          dataKey="day" 
                          tick={{ fontSize: 10, fill: '#9ca3af' }}
                          axisLine={{ stroke: '#e5e7eb' }}
                          tickLine={false}
                        />
                        <YAxis 
                          tick={{ fontSize: 10, fill: '#9ca3af' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <RechartsTooltip 
                          contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
                          labelFormatter={(label) => `${label} (Click to filter)`}
                          formatter={(value, name) => {
                            if (name === 'sessions') return [`${value} session${value !== 1 ? 's' : ''}`, 'Sessions'];
                            return [`${value} user${value !== 1 ? 's' : ''}`, 'Unique Users'];
                          }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="sessions"
                          name="sessions"
                          stroke={GREEN_MAIN}
                          strokeWidth={2}
                          fill="url(#colorSessions)"
                          dot={(props) => {
                            const isSelected = selectedLoginDay && selectedLoginDay.dayKey === props.payload.dayKey && sessionsViewMode;
                            return (
                              <circle
                                cx={props.cx}
                                cy={props.cy}
                                r={isSelected ? 6 : 3}
                                fill={GREEN_MAIN}
                                stroke={isSelected ? '#fff' : 'none'}
                                strokeWidth={isSelected ? 2 : 0}
                                style={{ filter: isSelected ? 'drop-shadow(0 0 4px #5DA44F)' : 'none', cursor: 'pointer' }}
                              />
                            );
                          }}
                          activeDot={{ r: 5, fill: GREEN_MAIN, stroke: '#fff', strokeWidth: 2, cursor: 'pointer' }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="value"
                          name="Unique Users"
                          stroke={BLUE_MAIN}
                          strokeWidth={2}
                          fill="url(#colorLogins)"
                          dot={(props) => {
                            const isSelected = selectedLoginDay && selectedLoginDay.dayKey === props.payload.dayKey && !sessionsViewMode;
                            return (
                              <circle
                                cx={props.cx}
                                cy={props.cy}
                                r={isSelected ? 6 : 3}
                                fill={BLUE_MAIN}
                                stroke={isSelected ? '#fff' : 'none'}
                                strokeWidth={isSelected ? 2 : 0}
                                style={{ filter: isSelected ? 'drop-shadow(0 0 4px #335fa8)' : 'none', cursor: 'pointer' }}
                              />
                            );
                          }}
                          activeDot={{ r: 5, fill: BLUE_MAIN, stroke: '#fff', strokeWidth: 2, cursor: 'pointer' }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                    <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 0.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Box sx={{ width: 12, height: 3, bgcolor: GREEN_MAIN, borderRadius: 1 }} />
                        <Typography sx={{ fontSize: 10, color: '#6b7280' }}>Sessions</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Box sx={{ width: 12, height: 3, bgcolor: BLUE_MAIN, borderRadius: 1 }} />
                        <Typography sx={{ fontSize: 10, color: '#6b7280' }}>Unique Users</Typography>
                      </Box>
                    </Box>
                  </Box>

                  {/* Recent Logins List OR Sessions Breakdown */}
                  <Box>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="subtitle2" sx={{ fontSize: 13, fontWeight: 700, color: NAVY_MAIN }}>
                          {sessionsViewMode && selectedLoginDay ? 'Sessions by User' : 'Recent Logins'}
                        </Typography>
                        {selectedLoginDay && (
                          <Typography sx={{ fontSize: 11, color: '#9ca3af' }}>
                            ({sessionsViewMode ? `${sessionsPerUser.length} user${sessionsPerUser.length !== 1 ? 's' : ''}` : `${recentLogsLimited.length} user${recentLogsLimited.length !== 1 ? 's' : ''}`} on {selectedLoginDay.day})
                          </Typography>
                        )}
                      </Box>
                      {!sessionsViewMode && (
                        <Box onClick={() => setAllLoginsModalOpen(true)} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', color: BLUE_MAIN, fontSize: 12, fontWeight: 600, '&:hover': { textDecoration: 'underline' } }}>
                          View All
                          <OpenInNew sx={{ fontSize: 14 }} />
                        </Box>
                      )}
                    </Box>
                    <Box>
                      {sessionsViewMode && selectedLoginDay ? (
                        // Sessions breakdown view
                        sessionsPerUser.length > 0 ? sessionsPerUser.map((user, index) => (
                          <Box key={index} sx={{ display: 'flex', alignItems: 'center', py: 1, px: 0.5, borderRadius: 1, '&:hover': { bgcolor: '#f8fafc' } }}>
                            <Avatar sx={{ width: 32, height: 32, fontSize: 12, fontWeight: 700, bgcolor: getAvatarColor(user.name), mr: 1.5 }}>
                              {getInitials(user.name)}
                            </Avatar>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography sx={{ fontSize: 13, fontWeight: 600, color: NAVY_MAIN, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {user.name}
                              </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: `${GREEN_MAIN}15`, px: 1, py: 0.25, borderRadius: 2 }}>
                                <Typography sx={{ fontSize: 12, fontWeight: 700, color: GREEN_MAIN }}>{user.sessions}</Typography>
                                <Typography sx={{ fontSize: 10, color: '#6b7280' }}>session{user.sessions !== 1 ? 's' : ''}</Typography>
                              </Box>
                              <Typography sx={{ fontSize: 11, color: '#9ca3af' }}>
                                {user.events} event{user.events !== 1 ? 's' : ''}
                              </Typography>
                              <Typography sx={{ fontSize: 12, fontWeight: 600, color: BLUE_MAIN, minWidth: 40, textAlign: 'right' }}>
                                {formatTimeAgo(user.totalTimeSpent)}
                              </Typography>
                            </Box>
                          </Box>
                        )) : (
                          <Box sx={{ py: 4, textAlign: 'center' }}>
                            <Typography sx={{ color: '#9ca3af', fontSize: 13 }}>No session data available</Typography>
                          </Box>
                        )
                      ) : (
                        // Normal recent logins view
                        recentLogsLimited.length > 0 ? recentLogsLimited.map((user, index) => (
                        <Box key={index}>
                          <Box onClick={() => setExpandedUser(expandedUser === index ? null : index)} sx={{ display: 'flex', alignItems: 'center', py: 1, px: 0.5, cursor: 'pointer', borderRadius: 1, '&:hover': { bgcolor: '#f8fafc' } }}>
                            <Avatar sx={{ width: 32, height: 32, fontSize: 12, fontWeight: 700, bgcolor: getAvatarColor(user.name), mr: 1.5 }}>
                              {getInitials(user.name)}
                            </Avatar>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography sx={{ fontSize: 13, fontWeight: 600, color: NAVY_MAIN, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {user.name}
                              </Typography>
                            </Box>
                            <Typography sx={{ fontSize: 12, color: '#9ca3af', mr: 1 }}>
                              {user.pages.size} {user.pages.size === 1 ? 'page' : 'pages'}
                            </Typography>
                            <Typography sx={{ fontSize: 12, fontWeight: 600, color: BLUE_MAIN, minWidth: 40, textAlign: 'right' }}>
                              {formatTimeAgo(user.totalTimeSpent)}
                            </Typography>
                            {expandedUser === index ? <KeyboardArrowUp sx={{ fontSize: 18, color: '#9ca3af', ml: 0.5 }} /> : <KeyboardArrowDown sx={{ fontSize: 18, color: '#9ca3af', ml: 0.5 }} />}
                          </Box>
                          <Collapse in={expandedUser === index}>
                            <Box sx={{ pl: 6, pr: 1, pb: 1, bgcolor: '#f8fafc', borderRadius: 1, mt: 0.5 }}>
                              {/* Header Row */}
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75, borderBottom: '2px solid #d1d5db', mb: 0.5 }}>
                                <Typography sx={{ fontSize: 12, fontWeight: 700, color: NAVY_MAIN }}>Page Name</Typography>
                                <Typography sx={{ fontSize: 12, fontWeight: 700, color: NAVY_MAIN }}>Time Spent</Typography>
                              </Box>
                              {getAggregatedVisits(user.visits).map((visit, vIdx) => (
                                <Box key={vIdx} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75, borderBottom: '1px solid #e5e7eb', '&:last-child': { borderBottom: 'none' } }}>
                                  <Typography sx={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>{visit.page}</Typography>
                                  <Typography sx={{ fontSize: 12, fontWeight: 500, color: BLUE_MAIN }}>{formatTimeAgo(visit.totalTime)}</Typography>
                                </Box>
                              ))}
                            </Box>
                          </Collapse>
                        </Box>
                      )) : (
                        <Box sx={{ py: 4, textAlign: 'center' }}>
                          <Typography sx={{ color: '#9ca3af', fontSize: 13 }}>No recent login data available</Typography>
                        </Box>
                      )
                      )}
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* RIGHT SIDE - Alert Suppression Summary */}
            <Grid item xs={12} md={6}>
              <Card sx={{ borderRadius: 3, border: `1px solid ${NAVY_TINT}`, boxShadow: '0 4px 14px rgba(15,23,42,0.06)', height: '100%' }}>
                <CardContent sx={{ p: 2 }}>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    <Typography variant="h6" sx={{ color: NAVY_MAIN, fontWeight: 700, fontSize: '0.95rem' }}>Alert Suppression Summary</Typography>
                    <Typography variant="caption" sx={{ color: BLUE_MAIN, fontWeight: 600 }}>Till date</Typography>
                  </Box>

                  {suppressionLoading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
                      <CircularProgress size={32} sx={{ color: BLUE_MAIN }} />
                    </Box>
                  ) : !suppressionData ? (
                    <Box sx={{ py: 6, textAlign: 'center' }}>
                      <Typography sx={{ color: '#9ca3af', fontSize: 13 }}>No suppression data available</Typography>
                    </Box>
                  ) : (
                    <>
                      {/* Stats Cards */}
                      <Grid container spacing={1.5} mb={2}>
                        <Grid item xs={4}>
                          <Card sx={{ borderRadius: 3, boxShadow: '0 4px 14px rgba(15,23,42,0.06)', border: `1px solid ${NAVY_TINT}`, borderLeft: `4px solid ${BLUE_MAIN}`, background: `linear-gradient(180deg, rgba(51,95,168,0.05) 0%, #ffffff 42%)`, height: 72 }}>
                            <CardContent sx={{ p: 1.2, '&:last-child': { pb: 1.2 }, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                              <Typography variant="subtitle2" sx={{ color: NAVY_MAIN, fontWeight: 700, fontSize: '0.7rem', lineHeight: 1.2 }}>Unique Users</Typography>
                              <Typography variant="h5" sx={{ fontWeight: 700, fontSize: '1.12rem', color: '#111827' }}>{suppressionData.uniqueUsers}</Typography>
                            </CardContent>
                          </Card>
                        </Grid>
                        <Grid item xs={4}>
                          <Card sx={{ borderRadius: 3, boxShadow: '0 4px 14px rgba(15,23,42,0.06)', border: `1px solid ${NAVY_TINT}`, borderLeft: `4px solid ${BLUE_MAIN}`, background: `linear-gradient(180deg, rgba(51,95,168,0.05) 0%, #ffffff 42%)`, height: 72 }}>
                            <CardContent sx={{ p: 1.2, '&:last-child': { pb: 1.2 }, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                              <Typography variant="subtitle2" sx={{ color: NAVY_MAIN, fontWeight: 700, fontSize: '0.7rem', lineHeight: 1.2 }}>Unique Apps</Typography>
                              <Typography variant="h5" sx={{ fontWeight: 700, fontSize: '1.12rem', color: '#111827' }}>{suppressionData.uniqueApps}</Typography>
                            </CardContent>
                          </Card>
                        </Grid>
                      </Grid>

                      {/* Request Distribution Bar */}
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="subtitle2" sx={{ fontSize: 13, fontWeight: 700, color: NAVY_MAIN, mb: 1 }}>Request Distribution</Typography>
                        <Box sx={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', mb: 1 }}>
                          <Box sx={{ width: `${suppressionData.totalRequests > 0 ? (suppressionData.oneTimeRequests / suppressionData.totalRequests) * 100 : 0}%`, bgcolor: OCHRE_MAIN }} />
                          <Box sx={{ width: `${suppressionData.totalRequests > 0 ? (suppressionData.recurringRequests / suppressionData.totalRequests) * 100 : 0}%`, bgcolor: GREEN_MAIN }} />
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: OCHRE_MAIN }} />
                            <Typography sx={{ fontSize: 11, color: '#6b7280' }}>
                              One-time <strong>{suppressionData.oneTimeRequests}</strong> ({suppressionData.totalRequests > 0 ? Math.round((suppressionData.oneTimeRequests / suppressionData.totalRequests) * 100) : 0}%)
                            </Typography>
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: GREEN_MAIN }} />
                            <Typography sx={{ fontSize: 11, color: '#6b7280' }}>
                              Recurring <strong>{suppressionData.recurringRequests}</strong> ({suppressionData.totalRequests > 0 ? Math.round((suppressionData.recurringRequests / suppressionData.totalRequests) * 100) : 0}%)
                            </Typography>
                          </Box>
                        </Box>
                      </Box>

                      {/* Suppression Time per App Family */}
                      <Box>
                        <Typography variant="subtitle2" sx={{ fontSize: 13, fontWeight: 700, color: NAVY_MAIN, mb: 1 }}>Suppression Time per App Family</Typography>
                        <Box>
                          {suppressionData.appFamilyData && suppressionData.appFamilyData.length > 0 ? suppressionData.appFamilyData.map((item, index) => (
                            <Box key={index} sx={{ mb: 1 }}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.3 }}>
                                <Typography sx={{ fontSize: 12, color: NAVY_MAIN }}>{item.name}</Typography>
                                <Typography sx={{ fontSize: 12, fontWeight: 700, color: BLUE_MAIN }}>{item.time.toLocaleString()}m</Typography>
                              </Box>
                              <LinearProgress variant="determinate" value={(item.time / maxSuppressionTime) * 100} sx={{ height: 6, borderRadius: 3, backgroundColor: '#e5e7eb', '& .MuiLinearProgress-bar': { borderRadius: 3, backgroundColor: BLUE_MAIN } }} />
                            </Box>
                          )) : (
                            <Typography sx={{ color: '#9ca3af', fontSize: 12, textAlign: 'center', py: 2 }}>No app family data</Typography>
                          )}
                        </Box>
                        <Divider sx={{ my: 1.5 }} />
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography sx={{ fontSize: 13, fontWeight: 700, color: NAVY_MAIN }}>Total</Typography>
                          <Typography sx={{ fontSize: 13, fontWeight: 700, color: NAVY_MAIN }}>{totalSuppressionTime.toLocaleString()}m</Typography>
                        </Box>
                      </Box>
                    </>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      )}

      {/* All Recent Logins Modal */}
      <Modal
        open={allLoginsModalOpen}
        onClose={() => { setAllLoginsModalOpen(false); setModalExpandedUser(null); }}
        aria-labelledby="all-logins-modal"
      >
        <Paper sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: { xs: '95%', sm: '80%', md: '60%', lg: '50%' }, maxWidth: 650, maxHeight: '85vh', bgcolor: '#fff', borderRadius: 3, boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Modal Header */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 3, py: 2, borderBottom: '1px solid #e5e7eb' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, color: NAVY_MAIN, fontSize: '1.1rem' }}>
                All Recent Logins
              </Typography>
              <Tooltip title="Click for page descriptions" arrow>
                <IconButton 
                  size="small" 
                  onClick={(e) => setPageInfoAnchor(e.currentTarget)}
                  sx={{ p: 0.5, color: '#9ca3af', '&:hover': { color: BLUE_MAIN, bgcolor: 'rgba(51,95,168,0.08)' } }}
                >
                  <InfoOutlined sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
              <Popover
                open={Boolean(pageInfoAnchor)}
                anchorEl={pageInfoAnchor}
                onClose={() => setPageInfoAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                PaperProps={{ sx: { borderRadius: 2, boxShadow: '0 8px 24px rgba(15,23,42,0.15)', maxWidth: 360, maxHeight: 400 } }}
              >
                <Box sx={{ p: 2 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: 14, color: NAVY_MAIN, mb: 1.5, borderBottom: `2px solid ${BLUE_MAIN}`, pb: 0.5 }}>
                    Page Descriptions
                  </Typography>
                  <Box sx={{ maxHeight: 320, overflowY: 'auto', pr: 0.5 }}>
                    {Object.entries(pageDescriptionMap).map(([pageName, description]) => (
                      <Box key={pageName} sx={{ mb: 1.5, '&:last-child': { mb: 0 } }}>
                        <Typography sx={{ fontWeight: 600, fontSize: 12, color: NAVY_MAIN }}>{pageName}</Typography>
                        <Typography sx={{ fontSize: 11, color: '#6b7280', lineHeight: 1.4 }}>{description}</Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              </Popover>
            </Box>
            <IconButton 
              size="small" 
              onClick={() => { setAllLoginsModalOpen(false); setModalExpandedUser(null); }}
              sx={{ color: '#9ca3af', '&:hover': { color: NAVY_MAIN } }}
            >
              <Close sx={{ fontSize: 20 }} />
            </IconButton>
          </Box>

          {/* Modal Content */}
          <Box sx={{ flex: 1, overflowY: 'auto', px: 2, py: 1 }}>
            {recentLogsGrouped.filter(user => user.totalTimeSpent >= 30).length > 0 ? recentLogsGrouped.filter(user => user.totalTimeSpent >= 30).map((user, index) => (
              <Box key={index}>
                <Box onClick={() => setModalExpandedUser(modalExpandedUser === index ? null : index)} sx={{ display: 'flex', alignItems: 'center', py: 1.25, px: 1, cursor: 'pointer', borderRadius: 1, borderBottom: '1px solid #f3f4f6', '&:hover': { bgcolor: '#f8fafc' } }}>
                  <Avatar sx={{ width: 36, height: 36, fontSize: 13, fontWeight: 700, bgcolor: getAvatarColor(user.name), mr: 2 }}>
                    {getInitials(user.name)}
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 600, color: NAVY_MAIN, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {user.name}
                    </Typography>
                  </Box>
                  <Typography sx={{ fontSize: 13, color: '#9ca3af', mr: 2 }}>
                    {user.pages.size} {user.pages.size === 1 ? 'page' : 'pages'}
                  </Typography>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: BLUE_MAIN, minWidth: 50, textAlign: 'right' }}>
                    {formatTimeAgo(user.totalTimeSpent)}
                  </Typography>
                  {modalExpandedUser === index ? <KeyboardArrowUp sx={{ fontSize: 20, color: '#9ca3af', ml: 1 }} /> : <KeyboardArrowDown sx={{ fontSize: 20, color: '#9ca3af', ml: 1 }} />}
                </Box>
                <Collapse in={modalExpandedUser === index}>
                  <Box sx={{ pl: 7, pr: 2, py: 1, bgcolor: '#f8fafc', borderRadius: 1, mb: 0.5 }}>
                    {/* Header Row */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75, borderBottom: '2px solid #d1d5db', mb: 0.5 }}>
                      <Typography sx={{ fontSize: 13, fontWeight: 700, color: NAVY_MAIN }}>Page Name</Typography>
                      <Typography sx={{ fontSize: 13, fontWeight: 700, color: NAVY_MAIN }}>Time Spent</Typography>
                    </Box>
                    {getAggregatedVisits(user.visits).map((visit, vIdx) => (
                      <Box key={vIdx} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75, borderBottom: '1px solid #e5e7eb', '&:last-child': { borderBottom: 'none' } }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>{visit.page}</Typography>
                        <Typography sx={{ fontSize: 13, fontWeight: 500, color: BLUE_MAIN }}>{formatTimeAgo(visit.totalTime)}</Typography>
                      </Box>
                    ))}
                  </Box>
                </Collapse>
              </Box>
            )) : (
              <Box sx={{ py: 6, textAlign: 'center' }}>
                <Typography sx={{ color: '#9ca3af', fontSize: 14 }}>No recent login data available</Typography>
              </Box>
            )}
          </Box>
        </Paper>
      </Modal>
    </Grid>
  );
}
