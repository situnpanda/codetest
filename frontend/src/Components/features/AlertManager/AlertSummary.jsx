import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Modal, Tooltip, TextField, Select, MenuItem, Grid, Tabs, Tab, Box,
  FormControl, Snackbar, CircularProgress, Autocomplete, Typography,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Button, IconButton,
} from '@mui/material';
import { getUrl } from '../../../environment';
import {
  AreaChart, Area, ReferenceLine, XAxis, YAxis,
  Tooltip as TooltipRecharts, Label, CartesianGrid,
  ResponsiveContainer, ScatterChart, Scatter, ReferenceDot,
} from 'recharts';
import { useNavigate, useLocation } from 'react-router-dom';
import { differenceInHours, differenceInMinutes } from 'date-fns';
import { styled } from '@mui/material/styles';
import BuildIcon from '@mui/icons-material/Build';
import InfoOutlineIcon from '@mui/icons-material/InfoOutlined';
import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { logPageVisit, startPageTracking, appInsights } from '../appInsights';
import { fetchServerPerformance_fromADX, fetchServicesData_fromADX } from '../../shared/APIs/fetchAPIs';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

// ─── Styled Components (module-scope) ────────────────────────────────────────

const CustomAutocomplete = styled(Autocomplete)(() => ({
  '& .MuiInputLabel-root': { color: '#00338e', fontWeight: 'bold' },
  '& .Mui-focused': { color: '#00338e', fontWeight: 'bold' },
  '& .MuiOutlinedInput-root': {
    borderRadius: '20px',
    backgroundColor: '#ffffff',
    fontWeight: 'bold',
    fontSize: '1em',
    '& fieldset': { borderColor: '#E8E8E8' },
    '&:hover fieldset': { borderColor: '#E8E8E8' },
    '&.Mui-focused fieldset': { borderColor: '#00338e' },
  },
  '& .MuiAutocomplete-popupIndicator': { color: '#888' },
}));

const CustomTabs = styled(Tabs)(() => ({
  backgroundColor: '#F8F7F7',
  borderRadius: '8px 8px 0 0',
  minHeight: 'inherit',
  '& .MuiTabs-indicator': { display: 'none' },
}));

const CustomTab = styled(Tab)(() => ({
  backgroundColor: '#E8E8E8',
  borderRadius: '8px 8px 0 0',
  color: '#00338e',
  fontSize: 'small',
  fontWeight: 'bold',
  textDecoration: 'none',
  transition: 'none',
  '&.Mui-selected': { backgroundColor: '#ffffff', fontWeight: 'bolder' },
  '& .MuiTab-wrapper': { fontSize: '0.25rem' },
}));

const CustomTooltip = styled(({ className, ...props }) => (
  <Tooltip {...props} classes={{ popper: className }} />
))(() => ({
  [`& .MuiTooltip-tooltip`]: {
    backgroundColor: '#ffffff',
    color: '#000000',
    padding: '10px 10px 0 10px',
    border: '1px solid #ddd',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
  },
}));

// ─── Helper Functions (module-scope) ─────────────────────────────────────────

const ALLOWED_DRIVES = ['C:', 'D:', 'E:', 'R:', 'L:', 'T:'];

const ceilStartTimestamp = (timestamp, timeIncrement) => {
  if (timeIncrement === 'minutes') return timestamp.add(1, 'minute').startOf('minute');
  if (timeIncrement === 'hours') return timestamp.add(1, 'hour').startOf('hour');
  if (timeIncrement === 'days') return timestamp.add(1, 'day').startOf('day');
  return timestamp;
};

const formatDuration = (duration) => {
  const days = Math.floor(duration / 1440);
  const hours = Math.floor((duration % 1440) / 60);
  const minutes = Math.floor(duration % 60);
  if (duration === 0) return '<1m';
  let result = '';
  if (days > 0) result += `${days}d `;
  if (hours > 0) result += `${hours}h `;
  if (minutes > 0) result += `${minutes}m`;
  return result.trim();
};

const computeAlertStatus = (endDate, startDate, item) => {
  const status = differenceInMinutes(new Date(endDate), new Date(item.EndTime)) > 20 ? 'Resolved' : 'Active';
  const beforeTimestamp = new Date(startDate) > new Date(item.TimeGenerated) ? 'yes' : 'no';
  const formattedDuration = formatDuration(item.Duration, beforeTimestamp, status);
  return { AlertStatus: status, BeforeTimestamp: beforeTimestamp, FormattedDuration: formattedDuration };
};

const processDataForSummaryTable = (data) => {
  const summary = {};
  data.forEach((item) => {
    const key = `${item.AppCI}-${item.AlertType}`;
    const avgValue = parseFloat(item.AvgValue);
    if (!summary[key]) {
      summary[key] = {
        AppCI: item.AppCI, AlertType: item.AlertType, count: 0,
        latestTime: item.TimeGenerated, Description: item.AlertDescription,
        uniqueServers: new Set(), uniqueServices: new Set(),
        totalAvgValue: 0, numAvgValues: 0, maxAvgValue: avgValue, minAvgValue: avgValue,
        uniqueHostingTypes: new Set(), Threshold: item.Threshold, ThresholdData: item.ThresholdData,
      };
    }
    const s = summary[key];
    s.count += 1;
    s.uniqueServers.add(item.ServerName);
    s.uniqueServices.add(item.ServiceName);
    s.totalAvgValue += avgValue;
    s.numAvgValues += 1;
    if (avgValue > s.maxAvgValue) s.maxAvgValue = avgValue;
    if (avgValue < s.minAvgValue) s.minAvgValue = avgValue;
    s.uniqueHostingTypes.add(item.HostingType);
    if (new Date(item.TimeGenerated) > new Date(s.latestTime)) s.latestTime = item.TimeGenerated;
  });
  return Object.values(summary)
    .map((item) => ({
      ...item,
      uniqueServerCount: item.uniqueServers.size,
      uniqueServiceCount: item.uniqueServices.size,
      averageAvgValue: item.totalAvgValue / item.numAvgValues,
      uniqueHostingTypes: Array.from(item.uniqueHostingTypes),
    }))
    .sort((a, b) => b.count - a.count);
};

const processDataForTimeline = (data, dateRange) => {
  if (!Array.isArray(data)) return [];
  const timeDiff = differenceInHours(new Date(dateRange.endDate), new Date(dateRange.startDate));
  let dateFormat, timeIncrement, incrementValue = 1;
  if (timeDiff <= 1) { dateFormat = 'YYYY-MM-DD HH:mm'; timeIncrement = 'minutes'; }
  else if (timeDiff <= 24) { dateFormat = 'YYYY-MM-DD HH:00'; timeIncrement = 'hours'; }
  else { dateFormat = 'YYYY-MM-DD'; timeIncrement = 'days'; }

  const ceilStart = (ts) => {
    if (timeIncrement === 'minutes') return ts.add(ts.second() ? 1 : 0, 'minutes').startOf('minute');
    if (timeIncrement === 'hours') return ts.add(ts.minute() || ts.second() ? 1 : 0, 'hours').startOf('hour');
    return ts.add(ts.hour() || ts.minute() || ts.second() ? 1 : 0, 'days').startOf('day');
  };

  let current = ceilStart(dayjs(dateRange.startDate));
  const end = dayjs(dateRange.endDate);
  const allTimestamps = [];
  while (current.valueOf() <= end.valueOf()) { allTimestamps.push(current.format(dateFormat)); current = current.add(incrementValue, timeIncrement); }

  const grouped = data.reduce((acc, item) => {
    const t = dayjs(item.TimeGenerated).format(dateFormat);
    (acc[t] = acc[t] || []).push(item);
    return acc;
  }, {});

  return allTimestamps.map((t) => ({
    TimeGenerated: dayjs(t, dateFormat).format('YYYY-MM-DD HH:mm'),
    alerts: grouped[t] || [],
  }));
};

// ─── Main Component ──────────────────────────────────────────────────────────

const AlertSummary = ({ date, setDate, userProfile, supportGroup, appInsights: appInsightsProp }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const baseUrl = getUrl();

  // ── Filter state ──
  const [appCisChosen, setAppCisChosen] = useState([]);
  const [appFamiliesChosen, setAppFamiliesChosen] = useState([]);
  const [supportGroupsChosen, setSupportGroupsChosen] = useState([]);
  const [appCiFilterOptions, setAppCiFilterOptions] = useState([]);
  const [appFamilyFilterOptions, setAppFamilyFilterOptions] = useState([]);
  const [supportGroupFilterOptions, setSupportGroupFilterOptions] = useState([]);
  const [filtersData, setFiltersData] = useState([]);
  const [appCiFilterForBackend, setAppCiFilterForBackend] = useState([]);
  const [onboardedAppFamilies, setOnboardedAppFamilies] = useState([]);

  // ── Alerts state ──
  const [tabValue, setTabValue] = useState(0);
  const [cpuAlerts, setCpuAlerts] = useState([]);
  const [memoryAlerts, setMemoryAlerts] = useState([]);
  const [diskAlerts, setDiskAlerts] = useState([]);
  const [appAlerts, setAppAlerts] = useState([]);
  const [infraAlertsAtPoint, setInfraAlertsAtPoint] = useState([]);
  const [appAlertsAtPoint, setAppAlertsAtPoint] = useState([]);
  const [selectedAlertKey, setSelectedAlertKey] = useState(null);
  const [selectedTime, setSelectedTime] = useState('Last 12 Hours');

  // ── Loading state ──
  const [loadingCounters, setLoadingCounters] = useState({ cpu: 0, memory: 0, disk: 0, app: 0 });
  const startLoading = (type) => setLoadingCounters((p) => ({ ...p, [type]: p[type] + 1 }));
  const stopLoading = (type) => setLoadingCounters((p) => ({ ...p, [type]: p[type] - 1 }));

  // ── Derived state ──
  const infraAlerts = useMemo(() => [...cpuAlerts, ...memoryAlerts, ...diskAlerts], [cpuAlerts, memoryAlerts, diskAlerts]);
  const allInfraLoaded = loadingCounters.cpu === 0 && loadingCounters.memory === 0 && loadingCounters.disk === 0;
  const allAppLoaded = loadingCounters.app === 0;

  // Sync infraAlertsAtPoint when infraAlerts changes
  useEffect(() => { setInfraAlertsAtPoint(infraAlerts); }, [infraAlerts]);
  useEffect(() => { setAppAlertsAtPoint(appAlerts); }, [appAlerts]);

  // Sync appCiFilterForBackend
  useEffect(() => {
    setAppCiFilterForBackend(appCisChosen.length > 0 ? appCisChosen : appCiFilterOptions);
  }, [appCisChosen, appCiFilterOptions]);

  // ── Page tracking ──
  useEffect(() => {
    startPageTracking(window.location.href);
    return () => {
      logPageVisit();
      if (appInsightsProp) appInsightsProp.flush();
    };
  }, [location]);

  // ─── ADX Fetch Functions ──────────────────────────────────────────────────

  const fetchInfraADX = useCallback(async (alertType, customDate, serverName = '', aggregate = 'forGAC', signal = null) => {
    if (aggregate === 'forGAC') startLoading(alertType);
    const serverList = serverName ? serverName.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const params = {
      'Start Time': customDate.startDate,
      'End Time': customDate.endDate,
      'Object Name': [alertType],
      'Resource Name': serverList,
      'Application CI': serverList.length > 0 ? [] : (appCiFilterForBackend.length > 0 ? appCiFilterForBackend : ['All']),
      'Application Family': [],
      'Support Group': [],
      aggregate,
    };

    try {
      const parsedData = await fetchServerPerformance_fromADX(params);
      if (signal?.aborted) return;

      let formatted = [];
      if (parsedData?.ServerName && Object.keys(parsedData).length > 0) {
        const keys = Object.keys(parsedData.ServerName);
        if (aggregate === 'no') {
          formatted = keys.map((k) => ({
            TimeGenerated: parsedData.TimeGenerated?.[k],
            ServerName: parsedData.ServerName?.[k],
            AlertType: alertType,
            AppCI: parsedData.AppCI?.[k],
            AlertDescription: `AvgValue: ${parsedData.AvgValue?.[k]} HostingType: ${parsedData.HostingType?.[k] ?? ''}`,
            AvgValue: parsedData.AvgValue?.[k],
            HostingType: parsedData.HostingType?.[k],
            ThresholdData: parsedData.Threshold?.[k],
            Threshold: parsedData.Threshold?.[k]?.Threshold ?? 90,
          }));
        } else {
          formatted = keys.map((k) => ({
            TimeGenerated: parsedData.startTime?.[k],
            EndTime: parsedData.endTime?.[k],
            Duration: parsedData.maxDuration?.[k],
            ServerName: parsedData.ServerName?.[k],
            AlertType: alertType,
            AppCI: parsedData.AppCI?.[k],
            AlertDescription: `AvgValue: ${parsedData.AvgValue?.[k]}`,
            AvgValue: parsedData.AvgValue?.[k],
            ThresholdData: parsedData.Threshold?.[k],
            Threshold: parsedData.Threshold?.[k]?.Threshold ?? 90,
          }));
        }
      }

      formatted = formatted.filter((i) => i.AppCI !== 'Acuo VNA-PSJH');
      if (aggregate !== 'no') {
        formatted = formatted.map((i) => ({ ...i, ...computeAlertStatus(date.endDate, date.startDate, i) }));
      }

      if (signal?.aborted) return;
      if (aggregate === 'no') return formatted;

      if (alertType === 'cpu') setCpuAlerts(formatted);
      else if (alertType === 'memory') setMemoryAlerts(formatted);
    } catch (err) {
      if (signal?.aborted) return;
      console.error(`Error fetching ${alertType} alerts:`, err);
    } finally {
      if (aggregate === 'forGAC') stopLoading(alertType);
    }
  }, [appCiFilterForBackend, date]);

  const fetchDiskADX = useCallback(async (customDate, serverName = '', aggregate = 'forGAC', signal = null) => {
    if (aggregate === 'forGAC') startLoading('disk');
    const serverList = serverName ? serverName.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const params = {
      'Start Time': customDate.startDate,
      'End Time': customDate.endDate,
      'Object Name': ['disk'],
      'Resource Name': serverList,
      'Application CI': serverList.length > 0 ? [] : (appCiFilterForBackend.length > 0 ? appCiFilterForBackend : ['All']),
      'Application Family': [],
      'Support Group': [],
      aggregate,
    };

    try {
      const parsedData = await fetchServerPerformance_fromADX(params);
      if (signal?.aborted) return;

      let formatted = [];
      if (parsedData?.ServerName && Object.keys(parsedData).length > 0) {
        const keys = Object.keys(parsedData.ServerName);
        if (aggregate === 'no') {
          formatted = keys.map((k) => ({
            TimeGenerated: parsedData.TimeGenerated?.[k],
            ServerName: parsedData.ServerName?.[k],
            DriveName: parsedData.DriveName?.[k] ?? '',
            AlertType: 'disk',
            AppCI: parsedData.AppCI?.[k],
            AlertDescription: `${parsedData.ServerName?.[k] ?? ''}_${parsedData.DriveName?.[k] ?? ''}`,
            AvgValue: parsedData.AvgValue?.[k],
            HostingType: parsedData.HostingType?.[k],
            ThresholdData: parsedData.Threshold?.[k],
            Threshold: parsedData.Threshold?.[k]?.Threshold ?? 90,
          }));
        } else {
          formatted = keys.map((k) => {
            const groupKey = parsedData.groupKey?.[k] ?? '';
            const driveName = groupKey.includes('_') ? groupKey.split('_').slice(1).join('_') : '';
            return {
              TimeGenerated: parsedData.startTime?.[k],
              EndTime: parsedData.endTime?.[k],
              Duration: parsedData.maxDuration?.[k],
              ServerName: parsedData.ServerName?.[k],
              DriveName: driveName,
              AlertType: 'disk',
              AppCI: parsedData.AppCI?.[k],
              AlertDescription: `${parsedData.ServerName?.[k]}_${driveName}`,
              AvgValue: parsedData.AvgValue?.[k],
              ThresholdData: parsedData.Threshold?.[k],
              Threshold: parsedData.Threshold?.[k]?.Threshold ?? 90,
            };
          });
        }
      }

      formatted = formatted.filter((i) => i.AppCI !== 'Acuo VNA-PSJH');
      formatted = formatted.filter((i) => !i.DriveName || ALLOWED_DRIVES.some((d) => i.DriveName.toUpperCase().startsWith(d.toUpperCase())));
      if (aggregate !== 'no') {
        formatted = formatted.map((i) => ({ ...i, ...computeAlertStatus(date.endDate, date.startDate, i) }));
      }

      if (signal?.aborted) return;
      if (aggregate === 'no') return formatted;
      setDiskAlerts(formatted);
    } catch (err) {
      if (signal?.aborted) return;
      console.error('Error fetching disk alerts:', err);
    } finally {
      if (aggregate === 'forGAC') stopLoading('disk');
    }
  }, [appCiFilterForBackend, date]);

  const fetchAppADX = useCallback(async (customDate, signal = null) => {
    startLoading('app');
    const params = {
      'Start Time': customDate.startDate,
      'End Time': customDate.endDate,
      'Object Name': ['services', 'url'],
      'Application CI': appCiFilterForBackend.length > 0 ? appCiFilterForBackend : ['All'],
      'Application Family': [],
      'Support Group': [],
      'Resource Name': [],
      'Latest Only': 'forGAC',
    };

    try {
      const parsedData = await fetchServicesData_fromADX(params);
      if (signal?.aborted) return;

      let formatted = [];
      if (parsedData?.TimeGenerated && Object.keys(parsedData).length > 0) {
        const keys = Object.keys(parsedData.TimeGenerated);
        formatted = keys.map((k) => ({
          TimeGenerated: parsedData.TimeGenerated[k],
          EndTime: parsedData.EndTime?.[k],
          Duration: parsedData.Duration?.[k],
          ServerName: parsedData.ServerName?.[k],
          ServiceName: parsedData.ServiceName?.[k],
          AlertType: parsedData.MonitorType?.[k] === 'OS-Services' ? 'Critical Services' : parsedData.MonitorType?.[k],
          AppCI: parsedData.AppCI?.[k],
          AlertDescription: parsedData.MonitorType?.[k] === 'OS-Services'
            ? `'${parsedData.ServiceName?.[k]}' is in '${parsedData.Status?.[k]}' State`
            : parsedData.Description?.[k],
          HostingType: parsedData.HostingType?.[k],
          Status: parsedData.Status?.[k],
        }));

        formatted = formatted.filter((i) => i.AppCI !== 'Acuo VNA-PSJH');
        formatted = formatted.map((i) => ({ ...i, ...computeAlertStatus(date.endDate, date.startDate, i) }));
      }
      console.log("formattedddd",formatted)

      if (signal?.aborted) return;
      setAppAlerts(formatted);
    } catch (err) {
      if (signal?.aborted) return;
      console.error('Error fetching app alerts:', err);
    } finally {
      stopLoading('app');
    }
  }, [appCiFilterForBackend, date]);

  // ─── Initial Data Load (onboarding + filters) ─────────────────────────────

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        startLoading('cpu');
        const tz = 'America/Los_Angeles';
        const now = dayjs().tz(tz);
        const start = ceilStartTimestamp(now.subtract(12, 'hour'), 'hours');
        setDate({
          startDate: start.format('YYYY-MM-DD hh:mm:ss A'),
          endDate: now.format('YYYY-MM-DD hh:mm:ss A'),
        });

        const res = await fetch(new URL(baseUrl + 'getOnboardingSummary'));
        const data = await res.json();
        const parsed = JSON.parse(data.Data);
        const onboarded = Object.values(parsed['Application Family'])
          .filter((_, i) => parsed.Status[i].toLowerCase() === 'onboarded');

        setOnboardedAppFamilies(onboarded);
        if (onboarded.length === 0) return;

        const filtersRes = await fetch(new URL(baseUrl + 'filters'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            appFamily: onboarded,
            appCI: ['All'],
            managedByGroup: ['All'],
            supportGroup: ['All'],
            filterType: 'dataFrame',
          }),
        });
        const filtersJson = (await filtersRes.json()).Data;
        // Backend returns a column-oriented pandas JSON string; convert to records.
        const filtersParsed =
          typeof filtersJson === 'string' ? JSON.parse(filtersJson) : filtersJson;
        const columns = Object.keys(filtersParsed || {});
        const rowIndices = columns.length ? Object.keys(filtersParsed[columns[0]] || {}) : [];
        const filters = rowIndices.map((idx) => {
          const record = {};
          columns.forEach((col) => {
            record[col] = filtersParsed[col][idx];
          });
          return record;
        });

        const appCis = [...new Set(filters.map((i) => i.AppCI))].sort();
        const appFamilies = [...new Set(filters.map((i) => i.AppFamily))].sort();
        let groups = [...new Set(filters.map((i) => i.SupportGroup))].sort();
        if (supportGroup[0] !== 'All') {
          groups = groups.filter((g) => supportGroup.includes(g)).sort();
        }

        setFiltersData(filters);
        setAppCiFilterOptions(appCis);
        setAppFamilyFilterOptions(appFamilies);
        setSupportGroupFilterOptions(groups);
      } catch (err) {
        console.error('Error fetching initial data:', err);
      } finally {
        stopLoading('cpu');
      }
    };
    fetchInitialData();
  }, []);

  // ─── Fetch alerts when tab/date/filters change ────────────────────────────

  useEffect(() => {
    if (!date.startDate || onboardedAppFamilies.length === 0) return;
    const ac = new AbortController();

    if (tabValue === 0) {
      fetchInfraADX('cpu', date, '', 'forGAC', ac.signal);
      fetchInfraADX('memory', date, '', 'forGAC', ac.signal);
      fetchDiskADX(date, '', 'forGAC', ac.signal);
    } else {
      fetchAppADX(date, ac.signal);
    }

    return () => ac.abort();
  }, [tabValue, date, appCiFilterForBackend, fetchInfraADX, fetchDiskADX, fetchAppADX]);

  // ─── Filter Handlers ──────────────────────────────────────────────────────

  const handleSupportGroupFilterChange = (_, value) => {
    setSupportGroupsChosen(value);
    const getOpts = (key, vals) => [...new Set(filtersData.filter((d) => vals.includes(d.SupportGroup)).map((d) => d[key]))].sort();
    if (value.length) {
      setAppFamilyFilterOptions(getOpts('AppFamily', value));
      setAppCiFilterOptions(getOpts('AppCI', value));
      if (appCisChosen.length) setAppCisChosen([...new Set(filtersData.filter((d) => value.includes(d.SupportGroup) && appCisChosen.includes(d.AppCI)).map((d) => d.AppCI))].sort());
      if (appFamiliesChosen.length) setAppFamiliesChosen([...new Set(filtersData.filter((d) => value.includes(d.SupportGroup) && appFamiliesChosen.includes(d.AppFamily)).map((d) => d.AppFamily))].sort());
    } else {
      const reset = (key) => [...new Set(filtersData.map((d) => d[key]))].sort();
      setAppFamilyFilterOptions(reset('AppFamily'));
      setAppCiFilterOptions(reset('AppCI'));
      setSupportGroupFilterOptions(reset('SupportGroup'));
      setAppFamiliesChosen([]);
      setAppCisChosen([]);
    }
  };

  const handleAppFamilyFilterChange = (_, value) => {
    setAppFamiliesChosen(value);
    let filtered = value.length ? filtersData.filter((d) => value.includes(d.AppFamily)) : filtersData;
    if (!value.length && supportGroupsChosen.length) filtered = filtersData.filter((d) => supportGroupsChosen.includes(d.SupportGroup));
    const getOpts = (key) => [...new Set(filtered.map((d) => d[key]))].sort();
    setAppCiFilterOptions(getOpts('AppCI'));
    if (!value.length) {
      setAppFamilyFilterOptions(getOpts('AppFamily'));
      setAppCisChosen([]);
      setSupportGroupFilterOptions([...new Set(filtersData.map((d) => d.SupportGroup))].sort());
    } else if (appCisChosen.length) {
      setAppCisChosen([...new Set(filtered.filter((d) => appCisChosen.includes(d.AppCI)).map((d) => d.AppCI))].sort());
    }
  };

  const handleAppCiFilterChange = (_, value) => setAppCisChosen(value);

  const handleDateChange = (interval) => {
    setSelectedTime(interval);
    const tz = 'America/Los_Angeles';
    const now = dayjs().tz(tz);
    let start;
    switch (interval) {
      case 'Last 1 Hour': start = now.subtract(1, 'hour').format('YYYY-MM-DD hh:mm:ss A'); break;
      case 'Last 12 Hours': start = ceilStartTimestamp(now.subtract(12, 'hour'), 'hours').format('YYYY-MM-DD hh:mm:ss A'); break;
      case 'Last 1 Day': start = ceilStartTimestamp(now.subtract(24, 'hour'), 'hours').format('YYYY-MM-DD hh:mm:ss A'); break;
      case 'Last 1 Week': start = ceilStartTimestamp(now.subtract(7, 'day'), 'days').format('YYYY-MM-DD hh:mm:ss A'); break;
      default: start = ceilStartTimestamp(now.subtract(12, 'hour'), 'hours').format('YYYY-MM-DD hh:mm:ss A'); break;
    }
    setDate({ startDate: start, endDate: now.format('YYYY-MM-DD hh:mm:ss A') });
  };

  const handleTabChange = (_, newValue) => setTabValue(newValue);

  // ─── BuildAvailabilityGraph ────────────────────────────────────────────────

  const BuildAvailabilityGraph = ({ selectedItem, modalDataFiltered }) => {
    const [utilizationData, setUtilizationData] = useState([]);

    useEffect(() => {
      const servers = [...new Set(modalDataFiltered.map((e) => e.ServerName))].join(',');
      const load = async () => {
        let data = [];
        if (selectedItem?.AlertType === 'disk') data = await fetchDiskADX(date, servers, 'no');
        else if (selectedItem?.AlertType === 'cpu' || selectedItem?.AlertType === 'memory') data = await fetchInfraADX(selectedItem.AlertType, date, servers, 'no');
        setUtilizationData(data || []);
      };
      load();
    }, [modalDataFiltered, selectedItem, date]);

    if (!utilizationData.length) {
      return (
        <div style={{ width: '100%', height: 280, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <CircularProgress sx={{ '& .MuiCircularProgress-circle': { strokeWidth: '2px' } }} />
        </div>
      );
    }

    const dataMap = {};
    utilizationData.forEach((a) => {
      const name = a.DriveName ? `${a.ServerName}_${a.DriveName}` : a.ServerName;
      if (!dataMap[a.TimeGenerated]) dataMap[a.TimeGenerated] = { name: a.TimeGenerated };
      dataMap[a.TimeGenerated][name] = a.AvgValue;
    });
    const chartData = Object.values(dataMap);
    const serverList = [...new Set(utilizationData.map((a) => selectedItem.AlertType === 'disk' ? a.AlertDescription : a.ServerName))];
    const colors = ['#88CCEE', '#DDCC77', '#117733', '#332288', '#AA4499', '#44AA99', '#999933', '#CC6677'];
    const transitionTimestamps = modalDataFiltered.map((i) => ({ TimeGenerated: i.TimeGenerated, AvgValue: i.AvgValue }));

    return (
      <div style={{ width: '100%', height: '100%', padding: 20 }}>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData} margin={{ left: 30, right: 30, top: 20, bottom: 20 }} onClick={() => navigate(`/serverStatus?Name=${selectedItem.AppCI}&Type=Application%20CI&IsFileShare=no`)}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} tickCount={5} interval="preserveStartEnd"
              tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}>
              <Label value="Utilization %" angle={-90} position="InsideTopLeft" dx={-20} style={{ fontWeight: 'bold', fontSize: '12px' }} />
            </YAxis>
            <ReferenceLine y={selectedItem.Threshold} stroke="red" strokeDasharray="3 3" strokeWidth={1}
              label={{ value: `Threshold: ${selectedItem.Threshold}`, position: 'left', style: { fontSize: '12px', fontWeight: 'bold' } }} />
            <TooltipRecharts wrapperStyle={{ maxHeight: 150, overflowY: 'auto', pointerEvents: 'auto' }}
              content={({ active, payload }) => active && payload?.length ? (
                <div style={{ backgroundColor: 'white', border: '1px solid #ccc', padding: 10 }}>
                  <p>{payload[0].payload.name}</p>
                  {payload.sort((a, b) => (b.value || 0) - (a.value || 0)).map((e, i) => (
                    <p key={i} style={{ color: e.color }}>{`${e.dataKey}: ${e.value}`}</p>
                  ))}
                </div>
              ) : null} />
            {serverList.map((s, i) => (
              <Area key={s} type="monotone" dataKey={s} stroke={colors[i]} fill={colors[i]} fillOpacity={0.25} />
            ))}
            {transitionTimestamps.map((e, i) => (
              <ReferenceDot key={i} x={e.TimeGenerated} y={e.AvgValue} r={2} fill="red" stroke="red" />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  };

  // ─── BuildSummaryTable ─────────────────────────────────────────────────────

  const BuildSummaryTable = ({ alertsData }) => {
    const summaryData = useMemo(() => processDataForSummaryTable(alertsData), [alertsData]);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(5);
    const pageCount = Math.ceil(summaryData.length / rowsPerPage);

    // Threshold edit modal
    const [thresholdModalOpen, setThresholdModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const [thresholdInput, setThresholdInput] = useState('');
    const [comments, setComments] = useState('');
    const [validationMsg, setValidationMsg] = useState('');
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [snackbarOpen, setSnackbarOpen] = useState(false);

    // Detail modal
    const [modalOpen, setModalOpen] = useState(false);
    const [modalData, setModalData] = useState([]);
    const [modalDataFiltered, setModalDataFiltered] = useState([]);
    const [serversChosen, setServersChosen] = useState([]);
    const [serversFilterOptions, setServersFilterOptions] = useState([]);

    const openDetailModal = (item) => {
      setSelectedItem(item);
      const source = tabValue === 0 ? infraAlertsAtPoint : appAlertsAtPoint;
      const filtered = source.filter((d) => d.AlertType === item.AlertType && d.AppCI === item.AppCI);
      setModalData(filtered);
      setModalDataFiltered(filtered);
      setServersFilterOptions([...new Set(filtered.map((d) => d.ServerName))]);
      setServersChosen([]);
      setModalOpen(true);
    };

    useEffect(() => {
      if (serversChosen.length === 0) setModalDataFiltered(modalData);
      else setModalDataFiltered(modalData.filter((i) => serversChosen.some((s) => i.ServerName.includes(s))));
    }, [serversChosen, modalData]);

    const handleThresholdChange = (e) => {
      const v = e.target.value;
      setThresholdInput(v);
      setValidationMsg(v >= 80 && v <= 100 ? '' : v === '' ? '' : 'Threshold must be between 80 and 100.');
    };

    const handleThresholdSubmit = (e) => {
      e.preventDefault();
      if (!validationMsg && thresholdInput >= 80 && thresholdInput <= 100) {
        if (Number(thresholdInput) !== selectedItem.Threshold) setConfirmOpen(true);
        else setValidationMsg('The current threshold must be different from the threshold you are submitting.');
      } else {
        setValidationMsg('Threshold must be between 80 and 100.');
      }
    };

    const handleConfirmedSubmit = (e) => {
      e.preventDefault();
      // Submit threshold change
      fetch(new URL(baseUrl + 'setCustomThreshold'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appci: selectedItem.AppCI, type: selectedItem.AlertType,
          threshold: thresholdInput, changedby: userProfile.mail,
          comments, modifieddate: date.endDate,
        }),
      });
      // Create user story
      fetch(new URL(baseUrl + 'createUserStoryForCustomThresold'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationCI: selectedItem.AppCI, alertType: selectedItem.AlertType,
          customThreshold: thresholdInput, comments, requestor: userProfile.mail,
        }),
      });
      setConfirmOpen(false);
      setThresholdModalOpen(false);
      setSnackbarOpen(true);
      setThresholdInput('');
      setComments('');
    };

    const closeThresholdModal = () => {
      setThresholdModalOpen(false);
      setThresholdInput('');
      setComments('');
      setValidationMsg('');
    };

    return (
      <Paper>
        <TableContainer sx={{ overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,0.04)', backgroundColor: '#fff', p: 1, borderRadius: '8px' }}>
          <Table sx={{ width: '100%', borderCollapse: 'collapse' }} aria-label="summary table">
            <TableHead>
              <TableRow>
                {['App CI', 'Description', 'Type', 'Last Triggered', 'Actions'].map((col) => (
                  <TableCell key={col} sx={{ fontSize: 14, fontWeight: 600, color: '#00338e', backgroundColor: '#f5f7fa', borderBottom: '1px solid #e0e0e0', py: 0.5, px: 1 }}>
                    {col}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {summaryData.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((item, idx) => (
                <TableRow key={idx} sx={{ height: 36 }}>
                  <TableCell onClick={() => openDetailModal(item)} sx={{ fontSize: 12, py: 0.5, px: 1, cursor: 'pointer', fontFamily: 'Barlow' }}>{item.AppCI}</TableCell>
                  <TableCell onClick={() => openDetailModal(item)} sx={{ fontSize: 12, py: 0.5, px: 1, cursor: 'pointer', fontFamily: 'Barlow', textDecoration: 'underline', textDecorationColor: '#ccc', '&:hover': { color: '#00338e', textDecorationColor: '#00338e' } }}>
                    {item.AlertType.toLowerCase() === 'url'
                      ? `${item.uniqueServiceCount} URL${item.uniqueServiceCount === 1 ? '' : 's'} ${item.uniqueServiceCount === 1 ? 'was' : 'were'} down which triggered ${item.count} alert${item.count === 1 ? '' : 's'}`
                      : `${item.uniqueServerCount} ${item.uniqueServerCount === 1 ? 'server' : 'servers'} triggered ${item.count} ${item.count === 1 ? item.AlertType.replace(/s$/, '') : item.AlertType} Alert${item.count === 1 ? '' : 's'}${tabValue === 0 ? ` with the base threshold set to ${item.Threshold} and the utilization ${item.minAvgValue === item.maxAvgValue ? `at ${item.minAvgValue}` : `ranging from ${item.minAvgValue} to ${item.maxAvgValue}`}` : ''}`
                    }
                  </TableCell>
                  <TableCell onClick={() => openDetailModal(item)} sx={{ fontSize: 12, py: 0.5, px: 1, cursor: 'pointer', fontFamily: 'Barlow' }}>{item.AlertType.charAt(0).toUpperCase() + item.AlertType.slice(1)}</TableCell>
                  <TableCell onClick={() => openDetailModal(item)} sx={{ fontSize: 12, py: 0.5, px: 1, cursor: 'pointer', fontFamily: 'Barlow' }}>{item.latestTime}</TableCell>
                  <TableCell sx={{ fontSize: 12, py: 0.5, px: 1, textAlign: 'center', fontFamily: 'Barlow' }}>
                    {['cpu', 'memory', 'disk'].includes(item.AlertType.toLowerCase()) ? (
                      <Tooltip title="Edit Threshold">
                        <IconButton size="small" onClick={() => { setSelectedItem(item); setThresholdModalOpen(true); }}>
                          <BuildIcon sx={{ fontSize: 18, color: '#00338e' }} />
                        </IconButton>
                      </Tooltip>
                    ) : (
                      <BuildIcon sx={{ fontSize: 18, color: '#A3A5A6' }} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Pagination */}
        <Grid container alignItems="center" justifyContent="space-between" px={2} sx={{ backgroundColor: '#fff', borderRadius: '8px', py: 2 }}>
          <Grid item display="flex" alignItems="center">
            <Typography variant="body2" sx={{ fontSize: 12, color: '#4f4f4f', mr: 1 }}>Rows per page:</Typography>
            <Select value={rowsPerPage} onChange={(e) => { setRowsPerPage(e.target.value); setPage(0); }} size="small" sx={{ fontSize: 12, height: 32, minWidth: 64 }}>
              {[5, 10, 20].map((o) => <MenuItem key={o} value={o} sx={{ fontSize: 12 }}>{o}</MenuItem>)}
            </Select>
          </Grid>
          <Grid item display="flex" alignItems="center">
            <Typography sx={{ fontSize: 12, color: '#4f4f4f', mr: 1 }}>
              {`${page * rowsPerPage + 1}-${Math.min((page + 1) * rowsPerPage, summaryData.length)} of ${summaryData.length}`}
            </Typography>
            <IconButton disabled={page <= 0} onClick={() => setPage((p) => Math.max(p - 1, 0))} sx={{ color: page <= 0 ? '#ccc' : '#00338e', p: 0 }}>
              <KeyboardArrowLeftIcon fontSize="small" />
            </IconButton>
            <IconButton disabled={page >= pageCount - 1} onClick={() => setPage((p) => Math.min(p + 1, pageCount - 1))} sx={{ color: page >= pageCount - 1 ? '#ccc' : '#00338e', p: 0 }}>
              <KeyboardArrowRightIcon fontSize="small" />
            </IconButton>
          </Grid>
        </Grid>

        {/* Threshold Edit Modal */}
        <Modal open={thresholdModalOpen} onClose={closeThresholdModal} sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Box component="form" onSubmit={handleThresholdSubmit} sx={{ borderRadius: '8px', width: '60%', maxHeight: '80%', backgroundColor: 'white', overflow: 'auto', p: 3, boxShadow: 3 }}>
            <Typography variant="h6" sx={{ mb: 2, textAlign: 'center' }}>Edit Threshold</Typography>
            {selectedItem && (
              <Grid container spacing={1} sx={{ mb: 2 }}>
                <Grid item xs={12}><Typography variant="body1"><b>AppCI:</b> {selectedItem.AppCI}</Typography></Grid>
                <Grid item xs={12}><Typography variant="body1"><b>Alert Type:</b> {selectedItem.AlertType}</Typography></Grid>
                <Grid item xs={12}><Typography variant="body1"><b>Current Threshold:</b> {selectedItem.Threshold}</Typography></Grid>
                <Grid item xs={12}><Typography variant="body1"><b>Last Modified:</b> {selectedItem.ThresholdData?.ModifiedDate ?? 'NA'}</Typography></Grid>
                <Grid item xs={12}><Typography variant="body1"><b>Last Modified by:</b> {selectedItem.ThresholdData?.Changedby ?? 'NA'}</Typography></Grid>
              </Grid>
            )}
            <Typography variant="caption" color="textSecondary" sx={{ mb: 2, display: 'block', fontStyle: 'italic', textAlign: 'center' }}>
              Note: The threshold is set at Application CI level, so all servers associated with that Application CI will have the same threshold.
            </Typography>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <TextField label="Enter New Threshold" value={thresholdInput} onChange={handleThresholdChange} variant="outlined" error={!!validationMsg} helperText={validationMsg} sx={{ mb: 2, borderRadius: '8px' }} />
              <TextField label="Additional Comments" value={comments} onChange={(e) => setComments(e.target.value)} multiline minRows={3} variant="outlined" sx={{ borderRadius: '8px' }} />
            </FormControl>
            <Button variant="contained" color="primary" type="submit" sx={{ borderRadius: '20px' }}>Submit</Button>
          </Box>
        </Modal>

        {/* Confirmation Modal */}
        <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Box component="form" onSubmit={handleConfirmedSubmit} sx={{ p: 3, backgroundColor: 'white', borderRadius: '8px', width: '25%', boxShadow: 3 }}>
            <Grid container spacing={2}>
              <Grid item xs={12}><Typography variant="body1" align="center">Current Threshold: {selectedItem?.Threshold}</Typography></Grid>
              <Grid item xs={12}><Typography variant="body1" align="center">Changed Threshold: {thresholdInput}</Typography></Grid>
              <Grid item xs={12}><Typography variant="body2" align="center" color="textSecondary">Are you sure you want to submit?</Typography></Grid>
              <Grid item xs={12} sx={{ display: 'flex', justifyContent: 'center' }}>
                <Button variant="contained" type="submit" color="primary" sx={{ borderRadius: '20px', m: 1 }}>Yes, Submit</Button>
                <Button variant="outlined" onClick={() => setConfirmOpen(false)} sx={{ borderRadius: '20px', m: 1 }}>Cancel</Button>
              </Grid>
            </Grid>
          </Box>
        </Modal>

        <Snackbar open={snackbarOpen} autoHideDuration={5000} message="Request submitted successfully!" onClose={(_, r) => r !== 'clickaway' && setSnackbarOpen(false)} />

        {/* Detail Modal */}
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Box sx={{ maxWidth: '90%', maxHeight: '80%', minWidth: '90%', overflow: 'auto', backgroundColor: 'white', p: 2, borderRadius: '8px' }}>
            <Grid container spacing={1} sx={{ mb: 2 }}>
              <Grid item xs={12}><Typography variant="body1"><b>AppCI:</b> {selectedItem?.AppCI}</Typography></Grid>
              <Grid item xs={12}><Typography variant="body1"><b>Alert Type:</b> {selectedItem?.AlertType}</Typography></Grid>
              {['cpu', 'memory', 'disk'].includes(selectedItem?.AlertType?.toLowerCase()) && (
                <Grid item xs={12}><Typography variant="body1"><b>Threshold:</b> {selectedItem?.Threshold}</Typography></Grid>
              )}
            </Grid>
            {['cpu', 'memory', 'disk'].includes(selectedItem?.AlertType) && (
              <Grid container spacing={1} sx={{ mb: 2 }}>
                <BuildAvailabilityGraph selectedItem={selectedItem} modalDataFiltered={modalDataFiltered} />
              </Grid>
            )}
            <Grid item spacing={1} sx={{ mb: 2 }}>
              <CustomAutocomplete multiple size="medium" options={serversFilterOptions} getOptionLabel={(o) => o}
                onChange={(_, v) => setServersChosen(v)} value={serversChosen} disabled={!serversFilterOptions.length}
                renderInput={(params) => <TextField {...params} variant="outlined" label={selectedItem?.AlertType?.toLowerCase() === 'url' ? 'URL' : 'Server'} placeholder={!serversFilterOptions.length ? 'No options' : ''} />} />
            </Grid>
            <Table sx={{ minWidth: 650 }} aria-label="detail table">
              <TableHead>
                <TableRow sx={{ backgroundColor: '#f5f7fa' }}>
                  {selectedItem?.AlertType?.toLowerCase() !== 'url' && <TableCell align="center" sx={{ fontWeight: 'bold', color: '#00338e' }}>Server</TableCell>}
                  {selectedItem?.AlertType?.toLowerCase() === 'url' && <TableCell align="center" sx={{ fontWeight: 'bold', color: '#00338e' }}>URL</TableCell>}
                  {selectedItem?.AlertType === 'disk' && <TableCell align="center" sx={{ fontWeight: 'bold', color: '#00338e' }}>Drive Name</TableCell>}
                  <TableCell align="center" sx={{ fontWeight: 'bold', color: '#00338e' }}>Time Generated</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold', color: '#00338e' }}>End Time</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold', color: '#00338e' }}>Duration</TableCell>
                  {['cpu', 'memory', 'disk'].includes(selectedItem?.AlertType?.toLowerCase()) && <TableCell align="center" sx={{ fontWeight: 'bold', color: '#00338e' }}>Avg Utilization</TableCell>}
                  {tabValue === 1 && <TableCell align="center" sx={{ fontWeight: 'bold', color: '#00338e' }}>Description</TableCell>}
                  <TableCell align="center" sx={{ fontWeight: 'bold', color: '#00338e' }}>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(modalDataFiltered || []).map((item, i) => (
                  <Tooltip key={i} title={
                    ['cpu', 'memory', 'disk'].includes(item.AlertType?.toLowerCase())
                      ? `${item.AlertType} utilization surpassed the threshold (${selectedItem.Threshold}%) at ${item.TimeGenerated}. ${item.AlertStatus === 'Active' ? 'It has been elevated ever since.' : `It remained elevated for ${item.FormattedDuration}.`}`
                      : item.AlertType?.toLowerCase() === 'url' ? `URL is down for ${item.FormattedDuration}` : ''
                  }>
                    <TableRow sx={{ cursor: 'pointer' }}>
                      {selectedItem?.AlertType?.toLowerCase() !== 'url' && <TableCell align="center">{item.ServerName}</TableCell>}
                      {selectedItem?.AlertType?.toLowerCase() === 'url' && <TableCell align="center">{item.ServiceName}</TableCell>}
                      {selectedItem?.AlertType === 'disk' && <TableCell align="center">{item.DriveName}</TableCell>}
                      <TableCell align="center">{item.TimeGenerated}</TableCell>
                      <TableCell align="center">{item.AlertStatus === 'Active' ? 'NA' : item.EndTime}</TableCell>
                      <TableCell align="center">{item.FormattedDuration}</TableCell>
                      {['cpu', 'memory', 'disk'].includes(selectedItem?.AlertType?.toLowerCase()) && <TableCell align="center">{item.AvgValue}</TableCell>}
                      {tabValue === 1 && <TableCell align="center">{item.AlertDescription}</TableCell>}
                      <TableCell align="center" style={{ fontWeight: 'bold', color: item.AlertStatus === 'Active' ? '#D43A3B' : '#67B548' }}>
                        {item.AlertStatus}
                      </TableCell>
                    </TableRow>
                  </Tooltip>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Modal>
      </Paper>
    );
  };

  // ─── BuildTimelineBar ──────────────────────────────────────────────────────

  const BuildTimelineBar = ({ alerts, selectedTimeRange, positions }) => {
    const wrapperRef = useRef(null);
    const activeAlerts = alerts.filter((i) => i.AlertStatus === 'Active');
    const processedData = processDataForTimeline(alerts, date);
    const alertPoints = processedData;

    const [minDate, maxDate] = [
      Math.min(...alertPoints.map((a) => new Date(a.TimeGenerated))),
      Math.max(...alertPoints.map((a) => new Date(a.TimeGenerated))),
    ];

    const isApplicationTab = Object.keys(positions).length === 2 && positions.hasOwnProperty('Critical Services');

    const scatterData = alertPoints.flatMap(({ TimeGenerated, alerts: alts }) => {
      const grouped = alts.reduce((acc, cur) => { (acc[cur.AlertType] = acc[cur.AlertType] || []).push(cur); return acc; }, {});
      return Object.entries(grouped)
        .filter(([type]) => positions[type])
        .map(([type, details]) => ({
          x: new Date(TimeGenerated).getTime(),
          y: positions[type],
          z: details.length,
          type,
          details,
          activeCount: details.filter((a) => a.AlertStatus === 'Active').length,
          key: `scatter-${TimeGenerated}-${type}`,
        }));
    });

    const generateTicks = (range, end = dayjs()) => {
      let start = end;
      let interval = 60 * 60 * 1000;
      let timeIncrement = 'hours';
      const roundToTen = (d) => { const r = dayjs(d).second(0).millisecond(0); return r.minute(r.minute() - (r.minute() % 10)); };

      switch (range) {
        case 'Last 1 Hour':
          start = roundToTen(end.subtract(1, 'hour'));
          end = roundToTen(end);
          interval = 10 * 60 * 1000;
          timeIncrement = 'minutes';
          break;
        case 'Last 12 Hours': start = end.subtract(12, 'hour'); break;
        case 'Last 1 Day': start = end.subtract(1, 'day'); break;
        case 'Last 1 Week': start = end.subtract(7, 'day'); interval = 24 * 60 * 60 * 1000; timeIncrement = 'days'; break;
        default: break;
      }

      if (range !== 'Last 1 Hour') start = ceilStartTimestamp(start, timeIncrement);

      const ticks = [];
      let current = start.valueOf();
      const endTime = end.valueOf();
      while (current <= endTime) { ticks.push(current); current += interval; }
      return { ticks };
    };

    const { ticks } = generateTicks(selectedTimeRange, dayjs(maxDate));
    const yValues = Object.values(positions);

    useEffect(() => {
      const handler = (e) => {
        if (e.target.closest('[data-alert-point="true"]') || e.target.closest('[data-alert-box="true"]')) return;
        if (wrapperRef.current?.contains(e.target)) {
          setSelectedAlertKey(null);
          tabValue === 0 ? setInfraAlertsAtPoint(infraAlerts) : setAppAlertsAtPoint(appAlerts);
        }
      };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, [infraAlerts, appAlerts, tabValue]);

    return (
      <Grid container spacing={2} sx={{ padding: 2, paddingBottom: 2, paddingTop: 1 }} ref={wrapperRef}>
        <Grid item xs={12} md={10.5}>
          <Paper elevation={2} sx={{ borderRadius: '8px', backgroundColor: 'rgba(245,245,245,0.3)', overflow: 'hidden' }}>
            <ResponsiveContainer width="100%" height={isApplicationTab ? 180 : 280}>
              <ScatterChart margin={{ top: 40, right: 40, bottom: 40, left: 40 }}>
                <CartesianGrid stroke="#c0c0c0" strokeWidth={isApplicationTab ? 2 : 4} vertical={false} horizontal={yValues} />
                <XAxis type="number" dataKey="x" domain={[minDate, maxDate]} ticks={ticks}
                  tick={(props) => {
                    const { x, y, payload } = props;
                    const d = new Date(payload.value);
                    const rangeMs = maxDate - minDate;
                    const oneHour = 3600000;
                    const oneDay = 86400000;
                    let line1 = '', line2 = '';
                    if (rangeMs <= oneHour) {
                      line1 = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                      line2 = `${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}`;
                    } else if (rangeMs <= oneDay) {
                      line1 = d.toLocaleTimeString([], { hour: 'numeric', hour12: true }).replace(':00', '');
                      line2 = `${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}`;
                    } else {
                      line1 = `${d.getDate()}`;
                      line2 = d.toLocaleString('default', { month: 'short' });
                    }
                    return (
                      <text x={x} y={y + 10} textAnchor="middle" fontSize={12} fill="#666">
                        <tspan x={x} dy="0">{line1}</tspan>
                        <tspan x={x} dy="14">{line2}</tspan>
                      </text>
                    );
                  }}
                  axisLine={{ stroke: '#ccc', strokeWidth: 1 }} padding={{ left: 10, right: 10 }} />
                <YAxis type="number" dataKey="y"
                  domain={Object.keys(positions).includes('cpu') ? [0, 3] : [0, 2]}
                  ticks={yValues}
                  tickFormatter={(val) => { const k = Object.entries(positions).find(([_, v]) => v === val)?.[0] || ''; return k.charAt(0).toUpperCase() + k.slice(1); }}
                  tick={{ fontSize: 12 }} tickMargin={isApplicationTab ? 15 : 25} allowDecimals={false} axisLine={false} />
                <TooltipRecharts isAnimationActive={false} cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => active && payload?.length ? (
                    <div style={{ background: '#fff', border: '1px solid #ccc', padding: 10, fontSize: 12 }}>
                      <div><strong>{payload[0].payload.type} Alerts</strong></div>
                      <div>Time: {new Date(payload[0].payload.x).toLocaleString()}</div>
                      <div>Active Alert Count: {payload[0].payload.activeCount}</div>
                    </div>
                  ) : null} />
                <Scatter name="Alerts" data={scatterData}
                  shape={({ cx, cy, payload }) => {
                    const size = 24;
                    const layers = Math.min(payload.z, 3);
                    const isSelected = selectedAlertKey === payload.key;
                    const baseFill = isSelected ? '#42a5f5' : '#ffffff';
                    return (
                      <g data-alert-point="true"
                        onClick={(e) => { e.stopPropagation(); setSelectedAlertKey(payload.key); tabValue === 0 ? setInfraAlertsAtPoint(payload.details) : setAppAlertsAtPoint(payload.details); }}
                        onMouseEnter={(e) => { e.currentTarget.style.cursor = 'pointer'; if (!isSelected) [...e.currentTarget.querySelectorAll('rect')].forEach((r) => r.setAttribute('fill', '#d9d9d9')); }}
                        onMouseLeave={(e) => { if (!isSelected) [...e.currentTarget.querySelectorAll('rect')].forEach((r) => r.setAttribute('fill', '#ffffff')); }}>
                        {[...Array(layers - 1)].map((_, i) => (
                          <rect key={i} x={cx - size / 2} y={cy - size / 2} width={size} height={size} fill={baseFill} stroke="#000" strokeWidth={1} opacity={0.4} rx={6} />
                        ))}
                        <rect x={cx - size / 2} y={cy - size / 2} width={size} height={size} fill={baseFill} stroke="#000" strokeWidth={1} rx={6} />
                        <text x={cx} y={cy + 4} textAnchor="middle" fontSize="10" fill="#000" fontWeight="bold">{payload.z}</text>
                      </g>
                    );
                  }} />
              </ScatterChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Active Alerts Panel */}
        <Grid item xs={12} md={1.5}>
          <Paper elevation={2} sx={{ borderRadius: '8px', backgroundColor: 'rgba(245,245,245,0.3)', overflow: 'hidden' }}>
            <Box sx={{ borderRadius: '8px', backgroundColor: 'rgba(245,245,245,0.3)', height: isApplicationTab ? 180 : 280, paddingY: isApplicationTab ? 0 : 6, paddingX: 2, display: 'flex', flexDirection: 'column', justifyContent: yValues.length <= 2 ? 'center' : 'space-evenly' }}>
              <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly' }}>
                {[...yValues].reverse().map((yVal) => {
                  const type = Object.entries(positions).find(([_, v]) => v === yVal)?.[0];
                  if (type?.toLowerCase() === 'port') return null;
                  const z = activeAlerts.filter((i) => i.AlertType.toLowerCase() === type.toLowerCase()).length;
                  const size = 26;
                  const key = type;
                  const isSelected = selectedAlertKey === key;
                  return (
                    <Box key={type} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Tooltip title={`Active ${type} alerts`} arrow placement="top">
                        <Box data-alert-box="true"
                          sx={{ position: 'relative', width: size, height: size, alignSelf: 'center', cursor: 'pointer' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAlertKey(key);
                            const data = activeAlerts.filter((i) => i.AlertType.toLowerCase() === key.toLowerCase());
                            tabValue === 0 ? setInfraAlertsAtPoint(data) : setAppAlertsAtPoint(data);
                          }}>
                          <Box sx={{ width: size, height: size, backgroundColor: isSelected ? '#90caf9' : '#ffffff', border: '2px solid #000', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, position: 'relative' }}>
                            <Typography fontSize={12} fontWeight="bold">{z}</Typography>
                          </Box>
                        </Box>
                      </Tooltip>
                      <Typography sx={{ fontSize: 12 }}>{type}</Typography>
                    </Box>
                  );
                })}
              </Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mt: 2, textAlign: 'center' }}>Active Alerts</Typography>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    );
  };

  // ─── BuildAlertRuleOptions ─────────────────────────────────────────────────

  const BuildAlertRuleOptions = () => (
    <Box display="flex" alignItems="center" gap={2}>
      <CustomTooltip
        title={
          <div>
            <p style={{ fontWeight: 'normal' }}><strong>Overview:</strong> This Timeline view represents the number of times the threshold was breached to help analyse patterns and provide insights on modifying the alert threshold using the actions icon.</p>
            <h6 style={{ fontWeight: 'normal' }}>Infrastructure Alerts</h6>
            <ul><li style={{ fontWeight: 'normal' }}><strong>CPU, Memory, Disk Alert</strong>: Utilization breached threshold.</li></ul>
            <h6 style={{ fontWeight: 'normal' }}>Application Alerts</h6>
            <ul>
              <li style={{ fontWeight: 'normal' }}><strong>Critical Services Alert</strong>: Service is not running.</li>
              <li style={{ fontWeight: 'normal' }}><strong>URL Alert</strong>: URL is down and unreachable.</li>
            </ul>
            <p style={{ fontWeight: 'normal' }}><em>Note: These alerts are potential alerts that can occur in the application.</em></p>
          </div>
        }
        arrow>
        <InfoOutlineIcon sx={{ color: '#00338e', fontSize: 25 }} />
      </CustomTooltip>
      <Button size="small" onClick={() => navigate('/alertSummary/alertSuppression')}
        sx={{ backgroundColor: '#00338e', color: 'white', borderRadius: '20px', '&:hover': { backgroundColor: '#002366' }, px: 1, py: 1, boxShadow: 1, textTransform: 'none', fontSize: 12, whiteSpace: 'nowrap' }}>
        - Suppress Alerts
      </Button>
      <Button size="small" disabled
        sx={{ backgroundColor: '#fff', color: '#aaa', borderRadius: '20px', border: '2px solid #ccc', '&:hover': { backgroundColor: '#fff' }, px: 1, py: 1, boxShadow: 0, textTransform: 'none', fontSize: 12, whiteSpace: 'nowrap', cursor: 'not-allowed', pointerEvents: 'auto' }}>
        + Submit Alert Request
      </Button>
    </Box>
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <Grid container xs={12} justifyContent="center" sx={{ pt: 4, px: 4 }}>
      {/* Header Tabs */}
      <Grid container alignItems="center" justifyContent="space-between" id="AlertTypes-Tabs">
        <CustomTabs value={tabValue} onChange={handleTabChange}>
          <CustomTab label="Infrastructure" sx={{ borderRadius: '8px 0 0 0' }} />
          <CustomTab label="Application" sx={{ borderRadius: '0 8px 0 0' }} />
        </CustomTabs>
        <BuildAlertRuleOptions />
      </Grid>

      {/* Filters + Timeline */}
      <Grid container item xs={12} sx={{ backgroundColor: '#fff', margin: '0 5px 5px 0', borderRadius: '0 8px 8px 8px' }}>
        {/* Filters */}
        <Grid container spacing={2} justifyContent="flex-end" alignItems="center" sx={{ gap: '10px', margin: '5px', backgroundColor: '#fff' }}>
          <Grid item md={3} lg={2.7}>
            <CustomAutocomplete multiple size="small" options={supportGroupFilterOptions} getOptionLabel={(o) => o}
              onChange={handleSupportGroupFilterChange} value={supportGroupsChosen} disabled={!supportGroupFilterOptions.length}
              renderInput={(params) => <TextField {...params} variant="outlined" label="Support Group"
                sx={{ '& .MuiInputLabel-root': { fontSize: 14 }, '& .MuiInputBase-root .MuiInputBase-input': { fontSize: 12 } }}
                placeholder={!supportGroupFilterOptions.length ? 'No options available' : ''} />} />
          </Grid>
          <Grid item md={3} lg={2.5}>
            <CustomAutocomplete multiple size="small" options={appFamilyFilterOptions} getOptionLabel={(o) => o}
              onChange={handleAppFamilyFilterChange} value={appFamiliesChosen} disabled={!appFamilyFilterOptions.length}
              renderInput={(params) => <TextField {...params} variant="outlined" label="App Family"
                sx={{ '& .MuiInputLabel-root': { fontSize: 14 }, '& .MuiInputBase-root .MuiInputBase-input': { fontSize: 12 } }}
                placeholder={!appFamilyFilterOptions.length ? 'No options available' : ''} />} />
          </Grid>
          <Grid item md={3} lg={2.5}>
            <CustomAutocomplete multiple size="small" options={appCiFilterOptions} getOptionLabel={(o) => o}
              onChange={handleAppCiFilterChange} value={appCisChosen} disabled={!appCiFilterOptions.length}
              renderInput={(params) => <TextField {...params} variant="outlined" label="App CI"
                sx={{ '& .MuiInputLabel-root': { fontSize: 14 }, '& .MuiInputBase-root .MuiInputBase-input': { fontSize: 12 } }}
                placeholder={!appCiFilterOptions.length ? 'No options available' : ''} />} />
          </Grid>
        </Grid>

        {/* Timeline Heading + Time Filter */}
        <Grid container justifyContent="space-between" alignItems="center" sx={{ margin: '5px' }}>
          <Grid item sx={{ color: '#00338e', fontSize: { xs: 16, md: 20 }, fontWeight: 'bold', ml: '20px' }}>Alert Timeline</Grid>
          <Grid item xs="auto" sx={{ color: '#00338e', mr: '10px' }}>
            <FormControl variant="standard" size="small">
              <Select value={selectedTime} onChange={(e) => handleDateChange(e.target.value)} disableUnderline
                sx={{ fontWeight: 'bold', borderRadius: '8px', '& .MuiSelect-select': { padding: '8px 12px', borderRadius: '8px' }, '&:hover .MuiSelect-select': { backgroundColor: '#f0f0f0', borderRadius: '8px' } }}>
                <MenuItem value="Last 1 Hour">Last 1 Hour</MenuItem>
                <MenuItem value="Last 12 Hours">Last 12 Hours</MenuItem>
                <MenuItem value="Last 1 Day">Last 1 Day</MenuItem>
                <MenuItem value="Last 1 Week">Last 1 Week</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>

        {/* Graph */}
        <Grid item xs={12} sx={{ backgroundColor: '#fff' }}>
          {tabValue === 0 ? (
            !allInfraLoaded ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', height: 280 }}>
                <CircularProgress sx={{ '& .MuiCircularProgress-circle': { strokeWidth: '2px' } }} />
              </Box>
            ) : (
              <BuildTimelineBar alerts={infraAlerts} selectedTimeRange={selectedTime} positions={{ cpu: 1, memory: 2, disk: 3 }} />
            )
          ) : !allAppLoaded ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', height: 280 }}>
              <CircularProgress sx={{ '& .MuiCircularProgress-circle': { strokeWidth: '2px' } }} />
            </Box>
          ) : (
            <BuildTimelineBar alerts={appAlerts} selectedTimeRange={selectedTime} positions={{ URL: 1, 'Critical Services': 2 }} />
          )}
        </Grid>
      </Grid>

      {/* Summary Table */}
      <Grid container item xs={12} sx={{ marginTop: '10px' }}>
        <Grid item xs={12} md={12} sx={{ margin: '5px 5px 5px 0', borderRadius: '8px' }}>
          {(tabValue === 0 ? !allInfraLoaded : !allAppLoaded) ? (
            <Paper sx={{ width: '100%', overflow: 'hidden', borderRadius: '8px', padding: '6px 10px' }}>
              <TableContainer sx={{ borderRadius: '8px', overflow: 'hidden' }}>
                <Table sx={{ minWidth: '100%', borderCollapse: 'separate', borderSpacing: '0 8px' }}>
                  <TableHead>
                    <TableRow>
                      {['App CI', 'Description', 'Type', 'Last Triggered', 'Actions'].map((h, i) => (
                        <TableCell key={i} sx={{ fontWeight: 'bold', color: '#00338e', backgroundColor: '#fff', width: ['20%', '30%', '10%', '20%', '20%'][i] }}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                </Table>
              </TableContainer>
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', height: 280 }}>
                <CircularProgress sx={{ '& .MuiCircularProgress-circle': { strokeWidth: '2px' } }} />
              </Box>
            </Paper>
          ) : (
            <BuildSummaryTable alertsData={tabValue === 0 ? infraAlertsAtPoint : appAlertsAtPoint} />
          )}
        </Grid>
      </Grid>
    </Grid>
  );
};

export default AlertSummary;
