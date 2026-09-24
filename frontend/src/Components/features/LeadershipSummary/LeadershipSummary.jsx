import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Card, CardContent, Select, MenuItem, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Pagination, CircularProgress, Alert, FormControl, Autocomplete, TextField, Chip, IconButton, Menu, Checkbox, ListItemText, Tooltip, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { styled } from '@mui/material/styles';
import { tableCellClasses } from '@mui/material/TableCell';
import Grid from '@mui/material/Unstable_Grid2';
import { getUrl } from "../../../environment";
import { InfoOutlined, Settings } from '@mui/icons-material';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { convertTimeToPreferredTZ, convertTimeToPreferredTZ_ToUtc,convertTimeToPreferredTZ_fromUtc } from '../../shared/Timestamp/PreferenceConversion';
import CircularProgress_Styled from '../../shared/UI Components/CircularProgress';

dayjs.extend(utc);
dayjs.extend(timezone);

const [BLUE_MAIN, NAVY_MAIN, GREEN_MAIN, OCHRE_MAIN, NAVY_TINT, MAROON_MAIN] = 
  ['#335fa8', '#4a5b6a', '#5da44f', '#df9538', '#dddfe2', '#800000'];

const STATUS = {
  Healthy: { border: '#4CAF50', bg: '#EAF6EA', text: '#2E7D32' },
  Warning: { border: '#F4A261', bg: '#FFF3E6', text: '#C77800' },
  Critical: { border: '#D32F2F', bg: '#FFEBEE', text: '#C62828' },
  Changes: { border: '#757575', bg: '#EEEEEE', text: '#424242', icon: true }
};

const StyledTableCell = styled(TableCell)(({ theme }) => ({
  [`&.${tableCellClasses.head}`]: {
    backgroundColor: '#00338e',
    color: theme.palette.common.white,
    fontWeight: 700,
    fontSize: 12,
    // reduced header padding
    padding: '6px 8px',
    borderBottom: '2px solid #E0E0E0',
    textAlign: 'center'
  },
  [`&.${tableCellClasses.body}`]: {
    fontSize: 13,
    // reduced body padding
    padding: '6px 8px',
    textAlign: 'center'
  }
}));

const heatColor = (type) => {
  switch(type) {
    case 'healthy': return STATUS.Healthy.border;
    case 'warning': return STATUS.Warning.border;
    case 'critical': return STATUS.Critical.border;
    case 'change': return '#9E9E9E'; // Grey color for change requests
    default: return '#E0E0E0';
  }
};

const StyledCard = styled(Card)({
  width: '100%',
  boxShadow: '0px 3px 6px rgba(0, 0, 0, 0.16)',
  padding: 4,
  position: 'relative',
});

/* ---------- MAIN COMPONENT ---------- */

export default function SummaryOverview({ preferredTZ, globalFilterData }) {
  const navigate = useNavigate();
  const [timeRange, setTimeRange] = useState('30d');
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [selectedAppFamilies, setSelectedAppFamilies] = useState([]);
  const [selectedSupportGroups, setSelectedSupportGroups] = useState([]);
  const [selectedDowntimeFilter, setSelectedDowntimeFilter] = useState(null);
  const [selectedAvailabilityFilter, setSelectedAvailabilityFilter] = useState(null);
  const [statusFilter, setStatusFilter] = useState(null);
  const [statusCounts, setStatusCounts] = useState({ Critical: 0, Warning: 0, Healthy: 0, Changes: 0 });
  
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const [mttrData, setMttrData] = useState([]);
  const [totalAvailabilityHours, setTotalAvailabilityHours] = useState(0);
  const [availabilityPercentage, setAvailabilityPercentage] = useState(100);
  const [appFamilyTableData, setAppFamilyTableData] = useState([]);
  const [allAppFamilies, setAllAppFamilies] = useState([]);
  const [allSupportGroups, setAllSupportGroups] = useState([]);
  const [supportGroupToFamilies, setSupportGroupToFamilies] = useState({});
  const [avgMttr, setAvgMttr] = useState(0);
  const [longestOutage, setLongestOutage] = useState(0);
  const [p1p2IncidentCount, setP1p2IncidentCount] = useState(0);
  const [totalMiHours, setTotalMiHours] = useState(0);
  const [totalMiDueToChangeHours, setTotalMiDueToChangeHours] = useState(0);
  const [hoverSeg, setHoverSeg] = useState(null);
  // Raw per-family events + time bounds, so metrics can be recomputed when filters change
  const [rawIncidentEventsByFamily, setRawIncidentEventsByFamily] = useState({});
  const [dataBounds, setDataBounds] = useState({ start: 0, end: 0 });
  
  const baseUrl = getUrl();
  const hours = timeRange === '24h' ? 24 : timeRange === '14d' ? 336 : 720;

  const timeRangeOptions = [
    { label: 'Last 24 Hours', value: '24h' },
    { label: 'Last 14 Days', value: '14d' },
    { label: 'Last 30 Days', value: '30d' }
  ];

  // Get filtered app family options based on selected support groups
  const getAppFamilyOptions = () => {
    const set = new Set();
    if (selectedSupportGroups.length > 0) {
      selectedSupportGroups.forEach((sg) => {
        const sgFamilies = supportGroupToFamilies[String(sg)] || [];
        sgFamilies.forEach((fam) => { if (fam) set.add(String(fam)); });
      });
    } else {
      allAppFamilies.forEach((fam) => set.add(fam));
    }
    return Array.from(set).sort();
  };

  // ========== UTILITY FUNCTIONS ==========

  const mergeIntervals = (intervals) => {
    if (intervals.length === 0) return [];
    intervals.sort((a, b) => a[0] - b[0]);
    return intervals.reduce((merged, current) => {
      const last = merged[merged.length - 1];
      if (last && current[0] <= last[1]) {
        last[1] = Math.max(last[1], current[1]);
      } else {
        merged.push([...current]);
      }
      return merged;
    }, []);
  };

  const calculateTotalHours = (intervals) => 
    intervals.reduce((total, [start, end]) => total + (end - start), 0) / (1000 * 60 * 60);

  const restrictIntervalsToTimeRange = (intervals, startMs, endMs) => 
    intervals.map(([start, end]) => [
      Math.max(start, startMs),
      Math.min(end, endMs)
    ]).filter(([start, end]) => start < endMs && end > startMs && start < end);

  const collectEventIntervals = (eventsByFamily, currentTimeMs) => 
    Object.values(eventsByFamily).flatMap(events => 
      events.filter(e => e.startTime && e.endTime && !['None', 'null', ''].includes(String(e.endTime).trim())).map(e => [
        new Date(e.startTime).getTime(),
        new Date(e.endTime).getTime()
      ])
    );

  const calculateAvailabilityFromEvents = (familyChangeEvents, familyIncidentEvents, hours) => {
    const totalPeriodMs = hours * 60 * 60 * 1000;
    const downtimeIntervals = familyIncidentEvents
      .filter(e => e.startTime)
      .map(e => [
        new Date(e.startTime).getTime(),
        e.endTime ? new Date(e.endTime).getTime() : Date.now()
      ]);
    
    if (downtimeIntervals.length === 0) return 100;
    const totalDowntimeMs = calculateTotalHours(mergeIntervals(downtimeIntervals)) * (1000 * 60 * 60);
    return Math.max(0, Math.min(100, Number((100 - (totalDowntimeMs / totalPeriodMs) * 100).toFixed(2))));
  };

  const calculateTotalNonOverlappingHours = (eventsByFamily, timeRangeStartMs, currentTimeMs) => {
    const allIntervals = collectEventIntervals(eventsByFamily, currentTimeMs);
    if (allIntervals.length === 0) return 0;
    return calculateTotalHours(mergeIntervals(restrictIntervalsToTimeRange(allIntervals, timeRangeStartMs, currentTimeMs)));
  };

  const calculatePlannedDowntime = (familyChangeEvents, timeRangeStartMs, currentTimeMs) => {
    const downtimeIntervals = [];
    const ongoingChanges = [];
    
    familyChangeEvents.forEach(e => {
      if (e.startTime) {
        downtimeIntervals.push([
          new Date(e.startTime).getTime(),
          e.endTime ? new Date(e.endTime).getTime() : currentTimeMs
        ]);
        if (!e.endTime) ongoingChanges.push(e.number);
      }
    });
    
    if (downtimeIntervals.length === 0) return { hours: 0, label: '0h', ongoingChanges: [] };
    
    const totalHours = calculateTotalHours(mergeIntervals(restrictIntervalsToTimeRange(downtimeIntervals, timeRangeStartMs, currentTimeMs)));
    return {
      hours: totalHours,
      label: totalHours > 0 ? `${totalHours.toFixed(1)}h${ongoingChanges.length > 0 ? ' (ongoing)' : ''}` : '0h',
      ongoingChanges
    };
  };

  // ========== API FETCH FUNCTIONS ==========

  const fetchEarlyWarningsData = async () => {
    try {
      const url = new URL(baseUrl + 'applicationHealthSummary');
      url.search = new URLSearchParams({ supportGroup: "" }).toString();

      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) throw new Error('Failed to fetch application health summary');

      const data = await response.json();
      const appSummaryRaw = JSON.parse(data["Application Summary"]);

      if (!appSummaryRaw || Object.keys(appSummaryRaw).length === 0) {
        return {};
      }

      const appFamilyData = appSummaryRaw["Application Family"] || {};
      const serverHealthData = appSummaryRaw["Server Health"] || {};
      const servicesHealthData = appSummaryRaw["Services Health"] || {};
      const interfacesHealthData = appSummaryRaw["Interfaces Health"] || {};
      const databaseHealthData = appSummaryRaw["Database Health"] || {};
      const fileStorageHealthData = appSummaryRaw["File Storage Health"] || {};

      const earlyWarningsByFamily = {};

      Object.keys(appFamilyData).forEach((key) => {
        const appFamily = appFamilyData[key];
        if (!appFamily || String(appFamily).trim() === '') return;

        const appFamilyStr = String(appFamily).trim();
        if (!earlyWarningsByFamily[appFamilyStr]) {
          earlyWarningsByFamily[appFamilyStr] = 0;
        }

        let issues = 0;
        const serverHealth = serverHealthData[key] || {};
        if (Object.keys(serverHealth).length > 0) {
          const serverDown = (serverHealth["UnHealthy_Cloud"] || 0) + (serverHealth["UnHealthy_OnPremise"] || 0);
          if (serverDown > 0) issues += serverDown;
        }

        const serviceHealth = servicesHealthData[key] || {};
        if (Object.keys(serviceHealth).length > 0) {
          const servicesDown = (serviceHealth["UnHealthy_Cloud"] || 0) +
                               (serviceHealth["UnHealthy_OnPremise"] || 0) +
                               (serviceHealth["UnHealthy_Url"] || 0);
          if (servicesDown > 0) issues += servicesDown;
        }

        const interfacesHealth = interfacesHealthData[key] || {};
        if (Object.keys(interfacesHealth).length > 0) {
          const interfacesStopped = interfacesHealth["Stopped"] || 0;
          if (interfacesStopped > 0) issues += interfacesStopped;
        }

        const databaseHealth = databaseHealthData[key] || {};
        if (Object.keys(databaseHealth).length > 0) {
          const databaseDown = databaseHealth["UnHealthy_Cloud"] || 0;
          if (databaseDown > 0) issues += databaseDown;
        }

        const fileStorageHealth = fileStorageHealthData[key] || {};
        if (Object.keys(fileStorageHealth).length > 0) {
          const storageDown = fileStorageHealth["UnHealthy_Cloud"] || 0;
          if (storageDown > 0) issues += storageDown;
        }

        earlyWarningsByFamily[appFamilyStr] += issues;
      });

      return earlyWarningsByFamily;
    } catch (error) {
      console.error('Error fetching early warnings data:', error);
      return {};
    }
  };

  const fetchChangeIncidentEvents = async (hours) => {
    try {
      const [changeRes, incidentRes] = await Promise.all([
        fetch(`${baseUrl}downtimeEvents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hours, eventType: 'Change' })
        }),
        fetch(`${baseUrl}downtimeEvents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hours, eventType: 'Major Incident' })
        })
      ]);

      const changeEvents = changeRes.ok ? (await changeRes.json()).events || [] : [];
      const incidentEvents = incidentRes.ok ? (await incidentRes.json()).events || [] : [];

      // Convert timestamps using preferredTZ conversion utility
      const convertedChangeEvents = convertTimeToPreferredTZ({ events: changeEvents });
      const convertedIncidentEvents = convertTimeToPreferredTZ({ events: incidentEvents });

      console.log('Fetched Change Events:', convertedChangeEvents.events );
      console.log('Fetched Incident Events:', convertedIncidentEvents.events );

      return {
        changeEvents: convertedChangeEvents.events || changeEvents,
        incidentEvents: convertedIncidentEvents.events || incidentEvents
      };
    } catch (error) {
      console.error('Error fetching change/incident events:', error);
      return { changeEvents: [], incidentEvents: [] };
    }
  };

  const generateHeatmapFromEvents = (changeDetails, incidentDetails, periods, unit, includeChanges = false, earlyWarningsCount = 0) => {
    const now = preferredTZ ? dayjs().tz(preferredTZ) : dayjs();
    const currentMinutes = now.minute();
    const roundedMinutes = Math.floor(currentMinutes / 15) * 15;
    const roundedNow = now.minute(roundedMinutes).second(0).millisecond(0);
    const minutesPerPeriod = unit === 'hours' ? 60 : 1440;
    const alignedNow = unit === 'hours' ? roundedNow : now.startOf('day').add(1, 'day');
    
    const processEvents = (details, type) => {
      const events = [];
      details.forEach(detail => {
        detail.events.forEach(event => {
          if (event.startTime) {
            // Parse the timestamp as UTC first, then convert to preferred timezone
            const startDayjs = preferredTZ 
              ? dayjs.utc(event.startTime).tz(preferredTZ)
              : dayjs.utc(event.startTime).tz('America/Los_Angeles');
            
            const endDayjs = event.endTime 
              ? (preferredTZ 
                  ? dayjs.utc(event.endTime).tz(preferredTZ)
                  : dayjs.utc(event.endTime).tz('America/Los_Angeles'))
              : null;

            events.push({
              type,
              number: event.number,
              description: event.description,
              start: startDayjs.toDate(),
              end: endDayjs ? endDayjs.toDate() : roundedNow.toDate(),
              // Store formatted strings for display
              startFormatted: startDayjs.format('MM/DD HH:mm'),
              endFormatted: endDayjs ? endDayjs.format('MM/DD HH:mm') : null,
              // Store original (raw) timestamps for navigation
              originalStartTime: event.startTime,
              originalEndTime: event.endTime || null,
              // Store applicationCI for navigation
              applicationCI: event.applicationCI || null,
              status: event.status, 
              isOngoing: !endDayjs
            });
          }
        });
      });
      return events;
    };
    
    const incidentEvents = processEvents(incidentDetails, 'incident');
    const changeEvents = includeChanges ? processEvents(changeDetails, 'change') : [];
    
    return Array.from({ length: periods }, (_, i) => {
      const periodEnd = dayjs(alignedNow.valueOf() - ((periods - 1 - i) * minutesPerPeriod * 60 * 1000));
      const periodStart = dayjs(periodEnd.valueOf() - (minutesPerPeriod * 60 * 1000));
      
      // Check if this is the current/latest period (last one in the array)
      const isCurrentPeriod = i === periods - 1;
      
      const eventsInPeriod = [...incidentEvents, ...changeEvents].filter(e => 
        (e.start >= periodStart.toDate() && e.start < periodEnd.toDate()) || 
        (e.end >= periodStart.toDate() && e.end < periodEnd.toDate()) ||
        (e.start < periodStart.toDate() && e.end >= periodEnd.toDate())
      );
      
      const hasIncident = eventsInPeriod.some(e => e.type === 'incident');
      const hasChange = includeChanges && eventsInPeriod.some(e => e.type === 'change');
      
      // For the current period, show early warnings as yellow if there are any
      const hasEarlyWarnings = isCurrentPeriod && earlyWarningsCount > 0;
      
      let status = 'healthy';
      if (hasIncident) {
        status = 'critical';
      } else if (hasEarlyWarnings) {
        status = 'warning';
      } else if (hasChange) {
        status = 'change'; // Grey color for changes
      }
      
      return {
        status,
        events: eventsInPeriod,
        isCurrentPeriod,
        earlyWarningsCount: isCurrentPeriod ? earlyWarningsCount : 0,
        hasChange
      };
    });
  };

  const MttrBarChart = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 140, color: NAVY_TINT, fontSize: '0.8rem' }}>
        No MTTR data available
      </Box>
    );
  }

  const max = Math.max(...data.map(d => d.hours));
  const dataCount = data.length;
  const topLabelHeight = 18;
  const chartHeight = 110;
  const xAxisHeight = 48;
  const totalHeight = topLabelHeight + chartHeight + xAxisHeight;
  const dynamicBarWidth = dataCount > 20 ? 16 : dataCount > 15 ? 18 : dataCount > 12 ? 20 : dataCount > 10 ? 22 : dataCount > 8 ? 26 : 30;
  const itemWidth = dataCount > 20 ? 56 : dataCount > 15 ? 62 : dataCount > 12 ? 70 : dataCount > 8 ? 78 : 90;
  const labelFontSize = dataCount > 20 ? '0.5rem' : dataCount > 15 ? '0.55rem' : dataCount > 12 ? '0.6rem' : '0.65rem';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: totalHeight, mt: 0.4 }}>
      <Box sx={{ overflowX: 'auto', overflowY: 'hidden', pb: 0.5, '&::-webkit-scrollbar': { height: '6px' }, '&::-webkit-scrollbar-track': { backgroundColor: '#f1f1f1', borderRadius: '3px' }, '&::-webkit-scrollbar-thumb': { backgroundColor: NAVY_TINT, borderRadius: '3px', '&:hover': { backgroundColor: NAVY_MAIN } } }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: `${dataCount * itemWidth}px` }}>
          {/* Bars */}
          <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', height: topLabelHeight + chartHeight }}>
            {data.map((item, index) => {
              const heightPct = max > 0 ? (item.hours / max) * 100 : 0;
              const barHeight = item.isOngoing ? chartHeight * 0.5 : (heightPct / 100) * chartHeight;
              return (
                <Box key={`${item.name}-${index}`} sx={{ width: `${itemWidth}px`, minWidth: `${itemWidth}px`, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <Typography variant="caption" sx={{ height: topLabelHeight, lineHeight: `${topLabelHeight}px`, fontSize: '0.6rem', color: item.isOngoing ? OCHRE_MAIN : NAVY_MAIN, fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap' }}>
                    {item.isOngoing ? 'Ongoing' : `${item.hours}h`}
                  </Typography>
                  <Tooltip
                    arrow
                    title={
                      <Box sx={{ p: 0.5 }}>
                        <Typography fontSize={11} fontWeight={700} color="#fff">
                          {item.incidentNumber}
                        </Typography>
                      </Box>
                    }
                  >
                    <Box sx={{ width: dynamicBarWidth, height: `${barHeight}px`, minHeight: item.isOngoing || item.hours > 0 ? 8 : 0, backgroundColor: item.isOngoing ? OCHRE_MAIN : BLUE_MAIN, borderRadius: '3px 3px 0 0', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', transition: 'all 0.3s ease', cursor: 'pointer', '&:hover': { backgroundColor: item.isOngoing ? '#c77800' : '#2c4c8c', transform: 'scaleY(1.05)' } }} />
                  </Tooltip>
                </Box>
              );
            })}
          </Box>
          <Box sx={{ display: 'flex', minHeight: xAxisHeight, pt: 1, justifyContent: 'center' }}>
            {data.map((item, index) => (
              <Box key={`label-${item.name}-${index}`} sx={{ width: `${itemWidth}px`, minWidth: `${itemWidth}px`, flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', px: 0.5 }} title={item.name}>
                <Typography variant="caption" sx={{ fontSize: labelFontSize, color: NAVY_MAIN, fontWeight: 600, textAlign: 'center', lineHeight: 1.1, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word', width: '100%' }}>
                  {item.name}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

  const processEventsByFamily = (events, appCIToFamily) => 
    events.reduce((acc, event) => {
      if (event.applicationCI?.trim()) {
        const appFamily = appCIToFamily[event.applicationCI.toUpperCase()];
        if (appFamily) {
          if (!acc[appFamily]) acc[appFamily] = [];
          acc[appFamily].push(event);
        }
      }
      return acc;
    }, {});

  const fetchApplicationData = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      
      if (!globalFilterData || Object.keys(globalFilterData).length <= 1) {
        // setIsLoading(false);
        return;
      }
      
      const appFamilyMap = {};
      const appCIToFamily = {};
      const uniqueAppFamilies = new Set();
      const uniqueSupportGroups = new Set();
      const sgToFamiliesMap = {}; // Support group to app families mapping
      
      const { AppFamily: appFam, AppCI: appCI, SupportGroup: supportGroup } = globalFilterData;
      
      if (!appFam || !appCI) {
        console.error('AppFamily or AppCI data not found in globalFilterData');
        setErrorMessage('AppFamily or AppCI data not found in globalFilterData');
        setIsLoading(false);
        return;
      }
      
      Object.keys(appFam).forEach((index) => {
        const appFamily = String(appFam[index]).trim();
        const applicationCI = String(appCI[index]).trim().toUpperCase();
        const sg = supportGroup ? String(supportGroup[index] || '').trim() : '';
        
        if (appFamily && applicationCI) {
          uniqueAppFamilies.add(appFamily);
          if (!appFamilyMap[appFamily]) appFamilyMap[appFamily] = [];
          if (!appFamilyMap[appFamily].includes(applicationCI)) {
            appFamilyMap[appFamily].push(applicationCI);
          }
          appCIToFamily[applicationCI] = appFamily;
          
          // Build support group mappings
          if (sg) {
            uniqueSupportGroups.add(sg);
            if (!sgToFamiliesMap[sg]) sgToFamiliesMap[sg] = new Set();
            sgToFamiliesMap[sg].add(appFamily);
          }
        }
      });
      
      // Convert sgToFamiliesMap sets to arrays
      const sgToFamilies = {};
      Object.keys(sgToFamiliesMap).forEach(sg => {
        sgToFamilies[sg] = Array.from(sgToFamiliesMap[sg]);
      });
      
      if (uniqueAppFamilies.size === 0) {
        console.error('No valid app family mappings found in globalFilterData');
        setErrorMessage('No valid app family mappings found');
        setIsLoading(false);
        return;
      }
      
      setAllAppFamilies(Array.from(uniqueAppFamilies).sort());
      setAllSupportGroups(Array.from(uniqueSupportGroups).sort());
      setSupportGroupToFamilies(sgToFamilies);
      
      // Fetch early warnings data
      const earlyWarnings = await fetchEarlyWarningsData();
      
      const changeIncidentData = await fetchChangeIncidentEvents(hours);
      
      const calculatedMttrData = [];
      changeIncidentData.incidentEvents?.forEach((event) => {
        const appFamily = appCIToFamily[event.applicationCI?.toUpperCase()];
        if (!appFamily || !event.startTime) return;
        
        const start = dayjs(event.startTime);
        const isOngoing = !event.endTime || ['None', 'null', ''].includes(String(event.endTime).trim());
        
        if (!start.isValid()) return;
        
        if (isOngoing) {
          calculatedMttrData.push({
            name: appFamily,
            hours: 0,
            isOngoing: true,
            incidentNumber: event.number || 'N/A'
          });
        } else {
          const end = dayjs(event.endTime);
          if (end.isValid() && end.isAfter(start)) {
            calculatedMttrData.push({
              name: appFamily,
              hours: Number(end.diff(start, 'hour', true).toFixed(1)),
              isOngoing: false,
              incidentNumber: event.number || 'N/A'
            });
          }
        }
      });
      
      calculatedMttrData.sort((a, b) => {
        if (a.isOngoing !== b.isOngoing) return a.isOngoing ? -1 : 1;
        return b.hours - a.hours;
      });
      
      // Calculate longest outage
      let maxOutage = 0;
      changeIncidentData.incidentEvents?.forEach((event) => {
        if (appCIToFamily[event.applicationCI?.toUpperCase()] && event.startTime && event.endTime && !['None', 'null', ''].includes(String(event.endTime).trim())) {
          const start = dayjs(event.startTime);
          const end = dayjs(event.endTime);
          
          if (start.isValid() && end.isValid() && end.isAfter(start)) {
            maxOutage = Math.max(maxOutage, end.diff(start, 'hour', true));
          }
        }
      });
      
      const avgMttrCalc = calculatedMttrData.length > 0
        ? calculatedMttrData.reduce((sum, item) => sum + item.hours, 0) / calculatedMttrData.length
        : 0;
      
      setAvgMttr(Number(avgMttrCalc.toFixed(1)));
      setLongestOutage(Number(maxOutage.toFixed(1)));
      setP1p2IncidentCount(calculatedMttrData.length);
      
      const allIncidentEvents = changeIncidentData.incidentEvents || [];
      const changeEventsByFamily = processEventsByFamily(changeIncidentData.changeEvents || [], appCIToFamily);
      const incidentEventsByFamily = processEventsByFamily(allIncidentEvents, appCIToFamily);

      const hasCausedBy = (e) => !!e.additionalInformation?.caused_by && String(e.additionalInformation.caused_by).trim() !== '';

      const currentTimeMs = Date.now();
      const timeRangeStartMs = currentTimeMs - (hours * 60 * 60 * 1000);

      setTotalMiHours(Number(calculateTotalNonOverlappingHours(processEventsByFamily(allIncidentEvents.filter(e => !hasCausedBy(e)), appCIToFamily), timeRangeStartMs, currentTimeMs).toFixed(1)));
      setTotalMiDueToChangeHours(Number(calculateTotalNonOverlappingHours(processEventsByFamily(allIncidentEvents.filter(hasCausedBy), appCIToFamily), timeRangeStartMs, currentTimeMs).toFixed(1)));
      
      const periodsCount = timeRange === '24h' ? 24 : timeRange === '14d' ? 14 : 30;
      const periodUnit = timeRange === '24h' ? 'hours' : 'days';
      
      // Create case-insensitive lookup for early warnings
      const getEarlyWarnings = (name) => earlyWarnings[Object.keys(earlyWarnings).find(k => k.toLowerCase() === name.toLowerCase())] || 0;

      const appFamiliesWithData = Object.keys(appFamilyMap).map(appFamily => {
        const familyChangeEvents = changeEventsByFamily[appFamily] || [];   // real CR events → heatmap only
        const familyIncidentEvents = incidentEventsByFamily[appFamily] || [];

        const changeDetails = familyChangeEvents.length > 0 ? [{ appFamily, events: familyChangeEvents }] : [];
        const incidentDetails = familyIncidentEvents.length > 0 ? [{ appFamily, events: familyIncidentEvents }] : [];
        
        // Determine status based on incidents and early warnings
        const familyEarlyWarnings = getEarlyWarnings(appFamily);
        let status = 'Healthy';
        if (familyIncidentEvents.length > 0) {
          status = 'Critical';
        } else if (familyEarlyWarnings > 0) {
          status = 'Warning';
        }
        
        const familyAvailability = calculateAvailabilityFromEvents(familyChangeEvents, familyIncidentEvents, hours);
        
        // Heatmap uses real CR events for "changes" slot; donut uses miDueToChange separately
        const heatmap = generateHeatmapFromEvents(
          changeDetails,
          incidentDetails,
          periodsCount,
          periodUnit,
          true, // Always include changes in heatmap
          familyEarlyWarnings
        );
        
        return {
          name: appFamily,
          status,
          uptime: familyAvailability.toFixed(2) + '%',
          availability: familyAvailability,
          plannedDowntime: calculatePlannedDowntime(familyChangeEvents, timeRangeStartMs, currentTimeMs).label,
          heatmap,
          earlyWarnings: familyEarlyWarnings,
          changeCount: familyChangeEvents.length,
          incidentCount: familyIncidentEvents.length,
          miDueToChangeCount: familyIncidentEvents.filter(hasCausedBy).length
        };
      });

      const counts = { Critical: 0, Warning: 0, Healthy: 0, Changes: 0 };
      appFamiliesWithData.forEach(app => {
        counts[app.status]++;
        if (app.changeCount > 0) counts.Changes++;
      });
      setStatusCounts(counts);
      
      const totalDowntimeHours = calculateTotalNonOverlappingHours(incidentEventsByFamily, timeRangeStartMs, currentTimeMs);
      const totalUptimeHours = Math.max(0, hours - totalDowntimeHours);
      const overallAvailabilityPercent = appFamiliesWithData.length > 0 ? appFamiliesWithData.reduce((sum, app) => sum + app.availability, 0) / appFamiliesWithData.length : 100;
      
      setMttrData(calculatedMttrData);
      setTotalAvailabilityHours(Number(totalUptimeHours.toFixed(1)));
      setAvailabilityPercentage(Number(overallAvailabilityPercent.toFixed(1)));
      setAppFamilyTableData(appFamiliesWithData);
      // Persist raw per-family events + time bounds so filtered metrics can be recomputed.
      setRawIncidentEventsByFamily(incidentEventsByFamily);
      setDataBounds({ start: timeRangeStartMs, end: currentTimeMs });
      setIsLoading(false);
    } catch (err) {
      console.error('Error in fetchApplicationData:', err);
      setErrorMessage(err.message);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (globalFilterData?.AppFamily && globalFilterData?.AppCI && Object.keys(globalFilterData).length > 1) {
      fetchApplicationData();
      const interval = setInterval(fetchApplicationData, 500 * 60 * 1000);
      return () => clearInterval(interval);
    } else {
      setIsLoading(true);
    }
  }, [timeRange, globalFilterData, preferredTZ]);

  const filteredTableRows = appFamilyTableData
    .filter(row => {
      // Support group filter - check if app family belongs to selected support groups
      if (selectedSupportGroups.length > 0) {
        const appFamilyBelongsToSelectedSG = selectedSupportGroups.some(sg => {
          const familiesInSG = supportGroupToFamilies[sg] || [];
          return familiesInSG.includes(row.name);
        });
        if (!appFamilyBelongsToSelectedSG) return false;
      }

      // App family filter
      if (selectedAppFamilies.length > 0 && !selectedAppFamilies.includes(row.name)) {
        return false;
      }

      // Status filter from chips (Critical, Warning, Healthy, or Changes)
      if (statusFilter) {
        if (statusFilter === 'Changes') {
          // For Changes filter, show only app families with change requests
          if (row.changeCount === 0) return false;
        } else {
          // For Critical, Warning, Healthy - filter by status
          if (row.status !== statusFilter) return false;
        }
      }

      // Downtime filter
      if (selectedDowntimeFilter === 'incidents' && row.incidentCount === 0 || selectedDowntimeFilter === 'changes' && row.miDueToChangeCount === 0) {
        return false;
      }

      // Availability filter
      if (selectedAvailabilityFilter === 'available') {
        const uptimePercent = parseFloat(row.uptime);
        if (uptimePercent < 100) return false;
      }
      if (selectedAvailabilityFilter === 'unavailable') {
        const uptimePercent = parseFloat(row.uptime);
        if (uptimePercent >= 100) return false;
      }

      return true;
    })
    .sort((a, b) => ({ 'Critical': 0, 'Warning': 1, 'Healthy': 2 }[a.status] - { 'Critical': 0, 'Warning': 1, 'Healthy': 2 }[b.status]));

  // ===== FILTER-AWARE DERIVED METRICS =====
  const sgAfMatch = (row) =>
    (selectedSupportGroups.length === 0 || selectedSupportGroups.some(sg => (supportGroupToFamilies[sg] || []).includes(row.name))) &&
    (selectedAppFamilies.length === 0 || selectedAppFamilies.includes(row.name));
  const filteredStatusCounts = appFamilyTableData.filter(sgAfMatch).reduce(
    (a, r) => ({ ...a, [r.status]: a[r.status] + 1, Changes: a.Changes + (r.changeCount > 0 ? 1 : 0) }),
    { Critical: 0, Warning: 0, Healthy: 0, Changes: 0 }
  );

  const _famSet = new Set(filteredTableRows.map(r => r.name));
  const _hasCB = (e) => !!e.additionalInformation?.caused_by && String(e.additionalInformation.caused_by).trim() !== '';
  const _filtBy = (pred) => Object.fromEntries(Object.entries(rawIncidentEventsByFamily).filter(([f]) => _famSet.has(f)).map(([f, evs]) => [f, evs.filter(pred)]));
  const _calc = (byFam) => calculateTotalNonOverlappingHours(byFam, dataBounds.start, dataBounds.end);
  const _filtMttr = mttrData.filter(m => _famSet.has(m.name));

  const filteredAvailabilityPercentage = filteredTableRows.length > 0
    ? Number((filteredTableRows.reduce((s, r) => s + r.availability, 0) / filteredTableRows.length).toFixed(1))
    : 100;
  // Derive uptime hours from the filtered % so both metrics stay consistent.
  const filteredTotalAvailabilityHours = Number(((filteredAvailabilityPercentage / 100) * hours).toFixed(1));
  const filteredTotalMiHours = Number(_calc(_filtBy(e => !_hasCB(e))).toFixed(1));
  const filteredTotalMiDueToChangeHours = Number(_calc(_filtBy(_hasCB)).toFixed(1));
  const filteredAvgMttr = _filtMttr.length > 0 ? Number((_filtMttr.reduce((s, m) => s + m.hours, 0) / _filtMttr.length).toFixed(1)) : 0;
  const filteredLongestOutage = _filtMttr.length > 0 ? Number(Math.max(0, ..._filtMttr.map(m => m.hours)).toFixed(1)) : 0;
  const filteredP1p2IncidentCount = _filtMttr.length;

  const paginatedRows = filteredTableRows.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  const getTimeRangeLabel = () => ({
    '24h': '24h Overview',
    '14d': '14 Days Overview',
    '30d': '30 Days Overview'
  }[timeRange] || '24h Overview');

  const getTimeLabels = () => {
    // Use preferredTZ to get current time in the preferred timezone
    const now = preferredTZ ? dayjs().tz(preferredTZ) : dayjs();
    const currentMinutes = now.minute();
    const roundedMinutes = Math.floor(currentMinutes / 15) * 15;
    const roundedNow = now.minute(roundedMinutes).second(0).millisecond(0);
    
    const periods = timeRange === '24h' ? 24 : timeRange === '14d' ? 14 : 30;
    const minutesPerPeriod = timeRange === '24h' ? 60 : 1440;
    
    // For days view, align to start of day (midnight) - same as generateHeatmapFromEvents
    const alignedNow = timeRange === '24h' ? roundedNow : now.startOf('day').add(1, 'day');
    
    return Array.from({ length: periods }, (_, i) => {
      // Calculate periodEnd and periodStart same as generateHeatmapFromEvents
      const periodEnd = dayjs(alignedNow.valueOf() - ((periods - 1 - i) * minutesPerPeriod * 60 * 1000));
      const periodStart = dayjs(periodEnd.valueOf() - (minutesPerPeriod * 60 * 1000));
      
      const time = preferredTZ 
        ? periodStart.tz(preferredTZ)
        : periodStart;
      
      return timeRange === '24h'
        ? time.format('HH:mm')
        : time.format('M/D');
    });
  };

  const formatLocalTime = (date) => {
    // The date is already converted to preferredTZ in processEvents
    // Just format it directly without re-converting
    if (!date) return '';
    const d = dayjs(date);
    return d.format('MM/DD HH:mm');
  };


  const handleDowntimeChartClick = (type) => {
    setSelectedDowntimeFilter(prev => prev === type ? null : type);
    setSelectedAvailabilityFilter(null);
    setPage(1);
  };

  const handleAvailabilityChartClick = (type) => {
    setSelectedAvailabilityFilter(prev => prev === type ? null : type);
    setSelectedDowntimeFilter(null);
    setPage(1);
  };

  const handleStatusFilterClick = (status) => {
    setStatusFilter(prev => prev === status ? null : status);
    setPage(1);
  };

  const handleIncidentCellClick = (incidentEvents) => {
    if (!incidentEvents || incidentEvents.length === 0) return;
 
    const firstIncident = incidentEvents[0];
    const params = new URLSearchParams();
   
    if (firstIncident.originalStartTime) {
      // Parse the incident start time as UTC
      const incidentStartTime = dayjs.utc(firstIncident.originalStartTime);
      
      // startTime = incident start - 12 hours (in UTC)
      const calculatedStartTime = incidentStartTime.subtract(12, 'hour');
      
      // endTime = actual incident end time (in UTC) if available, otherwise current UTC time
      const calculatedEndTime = firstIncident.originalEndTime
        ? dayjs.utc(firstIncident.originalEndTime)
        : dayjs.utc();
   
      params.set('startTime', calculatedStartTime.format('YYYY-MM-DD HH:mm:ss'));
      params.set('endTime', calculatedEndTime.format('YYYY-MM-DD HH:mm:ss'));
    }
    if (firstIncident.applicationCI) {
      params.set('appCI', firstIncident.applicationCI);
    }
    if (firstIncident.number) {
      params.set('incidentNumber', firstIncident.number);
    }
    if (preferredTZ) {
      params.set('preferredTZ', preferredTZ);
    }
   
    navigate(`/bakingNow?${params.toString()}`);
  };

  // Add useEffect to calculate rows per page based on screen height
  useEffect(() => {
    const getViewportHeight = () =>
      window.visualViewport ? window.visualViewport.height : window.innerHeight;

    const computeRows = () => {
      const h = getViewportHeight();
      const reserved = 520; // approximate space for header/cards/padding
      const rowHeight = 56; // approx MUI small row + padding
      const available = Math.max(0, h - reserved);
      const rows = Math.max(3, Math.min(20, Math.floor(available / rowHeight)));
      setRowsPerPage(rows);
      setPage(1);
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

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        position: 'relative',
        width: '100%',
        minHeight: '100vh',
        maxWidth: '100%',
        mx: 0,
        px: { xs: 2, sm: 3, md: 4 },
        // py: { xs: 1, sm: 2 },
        pt: { xs: 3, sm: 4 },
      }}
    >
      {/* ===== TOP HEADER WITH FILTERS (LEFT) + TIME (RIGHT) ===== */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 0.5,
          flexWrap: 'wrap',
          gap: 1,
        }}
      >
        {/* Left side: Support Group, App Family, Status chips */}
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          {/* Support Group Filter */}
          <Box display="flex" alignItems="center" gap={0.75} minWidth={200} maxWidth={300}>
            <Autocomplete
              multiple
              size="small"
              value={selectedSupportGroups}
              onChange={(event, newValue) => {
                setSelectedSupportGroups(newValue);
                setSelectedAppFamilies([]);
                setPage(1);
              }}
              options={allSupportGroups}
              getOptionLabel={(option) => String(option)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder={selectedSupportGroups.length === 0 ? 'All Support Groups' : ''}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      bgcolor: '#fff',
                      fontSize: { xs: 10, sm: 11, md: 12 },
                      borderRadius: 2,
                      minHeight: 38,
                      maxHeight: 70,
                      px: 0.5,
                      overflowY: 'auto',
                      flexWrap: 'wrap',
                      alignContent: 'flex-start',
                      width: '100%',
                      '& fieldset': { border: '1px solid #E0E0E0' }
                    }
                  }}
                />
              )}
              renderTags={(tagValue, getTagProps) => tagValue.map((option, index) => (
                <Chip label={String(option)} {...getTagProps({ index })} size="small" sx={{ fontSize: { xs: 9, sm: 10, md: 11 }, height: 24, maxWidth: '120px' }} />
              ))}
              sx={{ flex: 1, minWidth: 0 }}
            />
          </Box>

          {/* App Family Filter */}
          <Box display="flex" alignItems="center" gap={0.5} minWidth={200} maxWidth={300}>
            <Autocomplete
              multiple
              size="small"
              value={selectedAppFamilies}
              onChange={(event, newValue) => {
                setSelectedAppFamilies(newValue);
                setPage(1);
              }}
              options={getAppFamilyOptions()}
              getOptionLabel={(option) => String(option)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder={selectedAppFamilies.length === 0 ? 'All Application Families' : ''}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      bgcolor: '#fff',
                      fontSize: { xs: 10, sm: 11, md: 12 },
                      borderRadius: 2,
                      minHeight: 38,
                      maxHeight: 70,
                      overflowY: 'auto',
                      flexWrap: 'wrap',
                      alignContent: 'flex-start',
                      width: '100%',
                      '& fieldset': { border: '1px solid #E0E0E0' }
                    }
                  }}
                />
              )}
              renderTags={(tagValue, getTagProps) => tagValue.map((option, index) => (
                <Chip label={String(option)} {...getTagProps({ index })} size="small" sx={{ fontSize: { xs: 9, sm: 10, md: 11 }, height: 24, maxWidth: '120px' }} />
              ))}
              sx={{ flex: 1, minWidth: 0 }}
            />
          </Box>

          {/* Status Filter Chips */}
          <Box display="flex" gap={0.75} flexWrap="wrap" alignItems="center">
            {['Critical', 'Warning', 'Healthy', 'Changes'].map((status) => {
              const statusStyle = STATUS[status];
              const isActive = statusFilter === status;
              const count = filteredStatusCounts[status] || 0;
              return (
                <Box
                  key={status}
                  onClick={() => handleStatusFilterClick(status)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.6,
                    px: 1.2,
                    py: 0.4,
                    borderRadius: 999,
                    bgcolor: isActive ? statusStyle.border : statusStyle.bg,
                    border: `1px solid ${statusStyle.border}`,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    '&:hover': { transform: 'scale(1.05)', boxShadow: 1 }
                  }}
                >
                  {statusStyle.icon && <Settings sx={{ fontSize: 14, color: isActive ? '#fff' : statusStyle.text }} />}
                  <Typography sx={{ fontSize: 11, fontWeight: 600, color: isActive ? '#fff' : statusStyle.text }}>
                    {status}
                  </Typography>
                  <Box
                    sx={{
                      minWidth: 18,
                      height: 18,
                      px: 0.4,
                      borderRadius: 999,
                      bgcolor: isActive ? 'rgba(255,255,255,0.3)' : '#E0E0E0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <Typography sx={{ fontSize: 10, fontWeight: 700, color: isActive ? '#fff' : '#424242' }}>
                      {count}
                    </Typography>
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>

        {/* Right side: Time Range Selector */}
        <Autocomplete
          value={timeRangeOptions.find(option => option.value === timeRange)}
          onChange={(event, newValue) => {
            if (newValue) {
              setTimeRange(newValue.value);
              setPage(1);
            }
          }}
          options={timeRangeOptions}
          getOptionLabel={(option) => option.label}
          isOptionEqualToValue={(option, value) => option.value === value.value}
          disableClearable
          size="small"
          sx={{ minWidth: { xs: 160, sm: 180 } }}
          renderInput={(params) => (
            <TextField
              {...params}
              sx={{
                bgcolor: '#fff',
                borderRadius: 2,
                '& .MuiInputBase-root': {
                  fontSize: 13,
                  fontWeight: 600,
                  height: 38
                }
              }}
            />
          )}
        />
      </Box>

      {/* ===== LOADING STATE ===== */}
      {isLoading ? (
        <StyledCard sx={{ borderRadius: 2, margin: 1 }}>
          <Grid container xs={12} justifyContent="center" alignItems="center" sx={{ minHeight: 200, height: '100%', display: 'flex' }}>
            <CircularProgress_Styled
              loadingWhat="Loading Application Heatmap"
              fetchingFor="Fetching MTTR, Availability, and App Family data"
            />
          </Grid>
        </StyledCard>
      ) : errorMessage ? (
        <Box sx={{ mt: 4 }}>
          <Alert severity="error">Error loading data: {errorMessage}</Alert>
        </Box>
      ) : (
        <>
          {/* ===== TOP ROW - RESPONSIVE CARDS ===== */}
          <Grid container spacing={{ xs: 1.5, md: 2 }}>
            {/* APPS AT A GLANCE - CLICKABLE AVAILABILITY */}
            <Grid xs={12} sm={6} md={3} lg={2.4} xl={2}>
              <Card
                sx={{
                  borderRadius: 3,
                  boxShadow: selectedAvailabilityFilter 
                    ? '0 6px 20px rgba(0,51,142,0.25)' 
                    : '0 4px 14px rgba(0,0,0,0.05)',
                  border: selectedAvailabilityFilter 
                    ? `2px solid ${BLUE_MAIN}` 
                    : `1px solid ${NAVY_TINT}`,
                  backgroundColor: '#ffffff',
                  height: '100%',
                  transition: 'all 0.3s ease',
                }}
              >
                <CardContent
                  sx={{
                    p: { xs: 1.5, sm: 2 },
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0.6,
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      mb: 0.5,
                    }}
                  >
                    <Typography
                      variant="h6"
                      sx={{
                        fontWeight: 700,
                        color: NAVY_MAIN,
                        fontSize: '0.95rem',
                      }}
                    >
                      Availability {selectedAvailabilityFilter && '(Filtered)'}
                    </Typography>
                    <Tooltip 
                      title={
                        <Box>
                          <Typography fontSize={11} fontWeight={700} mb={0.5}>Availability Calculation</Typography>
                          <Typography fontSize={10} mb={0.5}>
                            <strong>Formula:</strong> Average of all App Family availabilities
                          </Typography>
                          <Typography fontSize={10} mb={0.5}>
                            <strong>Per App Family:</strong> 100% - (Incident Downtime Hours / Total Hours) × 100
                          </Typography>
                          <Typography fontSize={10} color="#c6c6c6ff">
                            Only resolved incidents (with end time) are considered. Click segments to filter the table.
                          </Typography>
                        </Box>
                      } 
                      arrow
                    >
                      <InfoOutlined sx={{ fontSize: 18, color: NAVY_MAIN, cursor: 'pointer', '&:hover': { color: BLUE_MAIN } }} />
                    </Tooltip>
                  </Box>

                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 1.5,
                      mt: 1,
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                      }}
                    >
                      <Box
                        sx={{
                          width: 120,
                          height: 120,
                          borderRadius: '50%',
                          position: 'relative',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        {/* Available segment (green) */}
                        <Box
                          onClick={() => handleAvailabilityChartClick('available')}
                          sx={{
                            position: 'absolute',
                            width: '100%',
                            height: '100%',
                            borderRadius: '50%',
                            background: `conic-gradient(
                              ${selectedAvailabilityFilter === 'available' ? '#388E3C' : GREEN_MAIN} 0deg ${(filteredAvailabilityPercentage / 100) * 360}deg,
                              transparent ${(filteredAvailabilityPercentage / 100) * 360}deg 360deg
                            )`,
                            transition: 'all 0.3s ease',
                            opacity: selectedAvailabilityFilter && selectedAvailabilityFilter !== 'available' ? 0.3 : 1,
                            transformOrigin: 'center',
                            '&:hover': {
                              transform: 'scale(1.15)',
                              filter: 'brightness(1.15) drop-shadow(0 4px 8px rgba(93, 164, 79, 0.4))',
                              zIndex: 2,
                            },
                          }}
                        />
                        {/* Unavailable segment (red) */}
                        <Box
                          onClick={() => handleAvailabilityChartClick('unavailable')}
                          sx={{
                            position: 'absolute',
                            width: '100%',
                            height: '100%',
                            borderRadius: '50%',
                            background: `conic-gradient(
                              transparent 0deg ${(filteredAvailabilityPercentage / 100) * 360}deg,
                              ${selectedAvailabilityFilter === 'unavailable' ? '#C62828' : '#D32F2F'} ${(filteredAvailabilityPercentage / 100) * 360}deg 360deg
                            )`,
                            transition: 'all 0.3s ease',
                            opacity: selectedAvailabilityFilter && selectedAvailabilityFilter !== 'unavailable' ? 0.3 : 1,
                            transformOrigin: 'center',
                            '&:hover': {
                              transform: 'scale(1.15)',
                              filter: 'brightness(1.2) drop-shadow(0 4px 8px rgba(227, 85, 85, 0.4))',
                              zIndex: 2,
                            },
                          }}
                        />
                        <Box
                          sx={{
                            position: 'relative',
                            zIndex: 3,
                            bgcolor: 'white',
                            borderRadius: '50%',
                            width: 65,
                            height: 65,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                            pointerEvents: 'none',
                          }}
                        >
                          <Typography
                            variant="caption"
                            sx={{
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              color: NAVY_MAIN,
                            }}
                          >
                            {filteredAvailabilityPercentage}%
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                    <Box sx={{ textAlign: 'center', width: '100%' }}>
                      <Typography
                        variant="body2"
                        sx={{
                          color: NAVY_MAIN,
                          fontWeight: 600,
                          mb: 0.3,
                          fontSize: '0.7rem',
                        }}
                      >
                        Total Uptime
                      </Typography>
                      <Typography
                        variant="h4"
                        sx={{
                          fontWeight: 800,
                          color: NAVY_MAIN,
                          lineHeight: 1.1,
                          fontSize: '1.3rem',
                        }}
                      >
                        {filteredTotalAvailabilityHours}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          color: NAVY_MAIN,
                          mt: 0.3,
                          fontSize: '0.65rem',
                        }}
                      >
                        hours {timeRange === '24h' ? '/ day' : `/ ${timeRange === '14d' ? '14 days' : '30 days'}`}
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* MTTR - FURTHER INCREASED WIDTH */}
            <Grid xs={12} sm={6} md={5} lg={4.8} xl={4.5}>
              <Card
                sx={{
                  borderRadius: 3,
                  boxShadow: '0 4px 14px rgba(0,0,0,0.05)',
                  border: `1px solid ${NAVY_TINT}`,
                  backgroundColor: '#ffffff',
                  height: '100%',
                }}
              >
                <CardContent
                  sx={{
                    p: { xs: 1.5, sm: 2 },
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0.4,
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      mb: 2,
                    }}
                  >
                    <Typography
                      variant="subtitle2"
                      sx={{
                        fontWeight: 700,
                        color: NAVY_MAIN,
                        fontSize: '0.95rem',
                      }}
                    >
                      Mean Time To Recover (MTTR)
                    </Typography>
                    <Tooltip title="Average time taken to recover from major incidents for each app family" arrow>
                      <InfoOutlined sx={{ fontSize: 18, color: NAVY_MAIN, cursor: 'pointer', '&:hover': { color: BLUE_MAIN } }} />
                    </Tooltip>
                  </Box>
                  <MttrBarChart data={_filtMttr} />
                </CardContent>
              </Card>
            </Grid>

            {/* DOWNTIME ANALYTICS - CLICKABLE DONUT */}
            <Grid xs={12} sm={12} md={12} lg={4.8} xl={5.5}>
              <Card
                sx={{
                  borderRadius: 3,
                  boxShadow: selectedDowntimeFilter 
                    ? '0 6px 20px rgba(0,51,142,0.25)' 
                    : '0 4px 14px rgba(0,0,0,0.05)',
                  border: selectedDowntimeFilter 
                    ? `2px solid ${BLUE_MAIN}` 
                    : `1px solid ${NAVY_TINT}`,
                  backgroundColor: '#ffffff',
                  height: '100%',
                  transition: 'all 0.3s ease',
                }}
              >
                <CardContent
                  sx={{
                    p: { xs: 1.5, sm: 2 },
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1,
                  }}
                >
                  {/* Header */}
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      mb: 0.5,
                    }}
                  >
                    <Typography
                      variant="h6"
                      sx={{
                        fontWeight: 700,
                        color: NAVY_MAIN,
                        fontSize: '0.95rem',
                      }}
                    >
                      Downtime Analytics {selectedDowntimeFilter && '(Filtered)'}
                    </Typography>
                    <Tooltip title="This view gives the Planned and Unplanned downtime analytics in hours. Click segments to filter the table." arrow>
                      <InfoOutlined sx={{ fontSize: 18, color: NAVY_MAIN, cursor: 'pointer', '&:hover': { color: BLUE_MAIN } }} />
                    </Tooltip>
                  </Box>

                  {/* Main Content: Donut + Legend on Left, 4 Boxes on Right */}
                  <Box
                    sx={{
                      display: 'flex',
                      gap: 2,
                      alignItems: 'stretch',
                      flexWrap: { xs: 'wrap', lg: 'nowrap' },
                    }}
                  >
                    {/* Left Side: Donut + Legend */}
                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 1.5,
                        flex: { xs: '1 1 100%', lg: '0 0 auto' },
                        minWidth: { lg: 180 },
                      }}
                    >
                      {/* Donut Chart - CLICKABLE */}
                      <Box
                        sx={{
                          position: 'relative',
                          width: 120,
                          height: 120,
                          borderRadius: '50%',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        {(() => {
                          var netTotal = filteredTotalMiHours + filteredTotalMiDueToChangeHours;
                          var miPercent = netTotal > 0 ? (filteredTotalMiHours / netTotal) * 100 : 50;
                          var miDegrees = (miPercent / 100) * 360;
                          
                          return (
                            <>
                              {/* Major Incidents segment (blue) */}
                            <>
                              {/* Base: clickable chart (both segments) */}
                              <Box
                                onMouseMove={(e) => {
                                  if (netTotal === 0) return;

                                  const rect = e.currentTarget.getBoundingClientRect();
                                  const x = e.clientX - (rect.left + rect.width / 2);
                                  const y = e.clientY - (rect.top + rect.height / 2);

                                  let angle = (Math.atan2(y, x) * 180) / Math.PI + 90;
                                  if (angle < 0) angle += 360;

                                  setHoverSeg(angle <= miDegrees ? "incidents" : "changes");
                                }}
                                onMouseLeave={() => setHoverSeg(null)}
                                onClick={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  const x = e.clientX - (rect.left + rect.width / 2);
                                  const y = e.clientY - (rect.top + rect.height / 2);

                                  let angle = (Math.atan2(y, x) * 180) / Math.PI + 90;
                                  if (angle < 0) angle += 360;

                                  if (angle <= miDegrees) handleDowntimeChartClick("incidents");
                                  else handleDowntimeChartClick("changes");
                                }}
                                sx={{
                                  position: "absolute",
                                  width: "100%",
                                  height: "100%",
                                  borderRadius: "50%",
                                  cursor: netTotal === 0 ? "default" : "pointer",
      background:
        netTotal === 0
                                    ? "conic-gradient(#E0E0E0 0deg 360deg)"
                                    : `conic-gradient(
                                        ${selectedDowntimeFilter === "incidents" ? "#C62828" : "#D32F2F"} 0deg ${miDegrees}deg,
                                        ${selectedDowntimeFilter === "changes" ? "#b45309" : OCHRE_MAIN} ${miDegrees}deg 360deg
                                      )`,
                                }}
    
                              />


                              <Box
                                sx={{
                                  position: "absolute",
                                  width: "100%",
                                  height: "100%",
                                  borderRadius: "50%",
      pointerEvents: "none", // critical so clicks go to base box
                                  zIndex: 2,

      // draw only the hovered segment
      background:
        netTotal === 0 || !hoverSeg
                                    ? "transparent"
                                    : hoverSeg === "incidents"
                                      ? `conic-gradient(
                                          ${selectedDowntimeFilter === "incidents" ? "#C62828" : "#D32F2F"} 0deg ${miDegrees}deg,
                                          transparent ${miDegrees}deg 360deg
                                        )`
                                      : `conic-gradient(
                                          transparent 0deg ${miDegrees}deg,
                                          ${selectedDowntimeFilter === "changes" ? "#b45309" : OCHRE_MAIN} ${miDegrees}deg 360deg
                                        )`,

      // scale only the overlay (so other segment stays same)
                                  transformOrigin: "center",
                                  transform: hoverSeg ? "scale(1.12)" : "scale(1)",
      transition:
        "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), filter 0.3s cubic-bezier(0.4, 0, 0.2, 1)",

      // segment-specific glow (same style you used before in separate boxes)
      filter:
        !hoverSeg
                                    ? "none"
                                    : hoverSeg === "incidents"
                                      ? "brightness(1.15) drop-shadow(0 4px 12px rgba(211, 47, 47, 0.5))"
                                      : "brightness(1.15) drop-shadow(0 4px 12px rgba(223, 149, 56, 0.5))",
                                }}
                              />
</>
                            </>
                          );
                        })()}
                        
                        <Box
                          sx={{
                            width: 75,
                            height: 75,
                            borderRadius: '50%',
                            bgcolor: '#ffffff',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'relative',
                            zIndex: 3,
                            pointerEvents: 'none',
                          }}
                        >
                          <Typography
                            sx={{
                              fontSize: '1.2rem',
                              fontWeight: 800,
                              color: NAVY_MAIN,
                              lineHeight: 1,
                            }}
                          >
                            {(filteredTotalMiHours + filteredTotalMiDueToChangeHours).toFixed(1)}
                          </Typography>
                          <Typography
                            sx={{
                              fontSize: '0.6rem',
                              color: NAVY_TINT,
                              mt: 0.3,
                            }}
                          >
                            hours
                          </Typography>
                        </Box>
                      </Box>

                      {/* Legend - CLICKABLE */}
                      <Box
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 0.6,
                          width: '100%',
                        }}
                      >
                        <Box 
                          onClick={() => handleDowntimeChartClick('incidents')}
                          sx={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'space-between',
                            cursor: 'pointer',
                            p: 0.5,
                            borderRadius: 1,
                            transition: 'all 0.2s',
                            bgcolor: selectedDowntimeFilter === 'incidents' ? 'rgba(220, 38, 38, 0.1)' : 'transparent',
                            '&:hover': {
                              bgcolor: 'rgba(220, 38, 38, 0.05)',
                            }
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                            {/* change dot to red */}
                            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#D32F2F' }} />
                            <Typography variant="caption" sx={{ color: NAVY_MAIN, fontSize: '0.7rem', fontWeight: selectedDowntimeFilter === 'incidents' ? 700 : 400 }}>Major Incidents</Typography>
                          </Box>
                          <Typography variant="caption" sx={{ color: NAVY_TINT, fontSize: '0.68rem', fontWeight: 600 }}>
                            {filteredTotalMiHours.toFixed(1)}h
                          </Typography>
                        </Box>
                        <Box 
                          onClick={() => handleDowntimeChartClick('changes')}
                          sx={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'space-between',
                            cursor: 'pointer',
                            p: 0.5,
                            borderRadius: 1,
                            transition: 'all 0.2s',
                            bgcolor: selectedDowntimeFilter === 'changes' ? 'rgba(217, 119, 6, 0.1)' : 'transparent',
                            '&:hover': {
                              bgcolor: 'rgba(217, 119, 6, 0.05)',
                            }
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: OCHRE_MAIN }} />
                            <Typography variant="caption" sx={{ color: NAVY_MAIN, fontSize: '0.7rem', fontWeight: selectedDowntimeFilter === 'changes' ? 700 : 400 }}>MI due to Change</Typography>
                          </Box>
                          <Typography variant="caption" sx={{ color: NAVY_TINT, fontSize: '0.68rem', fontWeight: 600 }}>
                            {filteredTotalMiDueToChangeHours.toFixed(1)}h
                          </Typography>
                        </Box>
                        {/* {overlapHours > 0 && (
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #E0E0E0', pt: 0.5 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#9CA3AF' }} />
                              <Typography variant="caption" sx={{ color: NAVY_MAIN, fontSize: '0.65rem' }}>Overlap</Typography>
                            </Box>
                            <Typography variant="caption" sx={{ color: NAVY_TINT, fontSize: '0.65rem', fontWeight: 600 }}>
                              -{overlapHours.toFixed(1)}h
                            </Typography>
                          </Box>
                        )} */}
                      </Box>
                    </Box>

                    {/* Right Side: 4 Metric Boxes in 2x2 Grid */}
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: 1.5,
                        flex: 1,
                      }}
                    >
                      {/* MTTR */}
                      <Box
                        sx={{
                          borderRadius: 2,
                          background: 'linear-gradient(135deg, rgba(0, 51, 142, 0.12) 0%, rgba(0, 51, 142, 0.08) 100%)',
                          p: 1.4,
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          minHeight: 75,
                          position: 'relative',
                          overflow: 'hidden',
                          border: '1px solid rgba(0, 51, 142, 0.1)',
                        }}
                      >
                        {/* <Box sx={{ position: 'absolute', top: 8, right: 8, opacity: 0.15 }}>
                          <AccessTime sx={{ fontSize: 28, color: BLUE_MAIN }} />
                        </Box> */}
                        <Typography
                          sx={{
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            color: '#4b5563',
                            mb: 0.4,
                          }}
                        >
                          MTTR
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: '1.3rem',
                            fontWeight: 800,
                            color: '#111827',
                            lineHeight: 1.1,
                          }}
                        >
                          {filteredAvgMttr || 0}
                        </Typography>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.3 }}>
                          <Typography sx={{ fontSize: '0.65rem', color: '#6b7280' }}>Hours</Typography>
                        </Box>
                      </Box>

                      {/* Longest Outage */}
                      <Box
                        sx={{
                          borderRadius: 2,
                          background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.12) 0%, rgba(220, 38, 38, 0.08) 100%)',
                          p: 1.4,
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          minHeight: 75,
                          position: 'relative',
                          overflow: 'hidden',
                          border: '1px solid rgba(220, 38, 38, 0.15)',
                        }}
                      >
                        {/* <Box sx={{ position: 'absolute', top: 8, right: 8, opacity: 0.15 }}>
                          <WarningAmberRounded sx={{ fontSize: 28, color: '#dc2626' }} />
                        </Box> */}
                        <Typography
                          sx={{
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            color: '#4b5563',
                            mb: 0.4,
                          }}
                        >
                          Longest Outage
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: '1.3rem',
                            fontWeight: 800,
                            color: '#111827',
                            lineHeight: 1.1,
                          }}
                        >
                          {filteredLongestOutage || 0}
                        </Typography>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.3 }}>
                          <Typography sx={{ fontSize: '0.65rem', color: '#6b7280' }}>Hours</Typography>
                        </Box>
                      </Box>

                      {/* MI Incidents */}
                      <Box
                        sx={{
                          borderRadius: 2,
                          background: 'linear-gradient(135deg, rgba(217, 119, 6, 0.12) 0%, rgba(217, 119, 6, 0.08) 100%)',
                          p: 1.4,
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          minHeight: 75,
                          position: 'relative',
                          overflow: 'hidden',
                          border: '1px solid rgba(217, 119, 6, 0.15)',
                        }}
                      >
                        {/* <Box sx={{ position: 'absolute', top: 8, right: 8, opacity: 0.15 }}>
                          <CancelRounded sx={{ fontSize: 28, color: '#d97706' }} />
                        </Box> */}
                        <Typography
                          sx={{
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            color: '#4b5563',
                            mb: 0.4,
                          }}
                        >
                          MI Incidents
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: '1.3rem',
                            fontWeight: 800,
                            color: '#111827',
                            lineHeight: 1.1,
                          }}
                        >
                          {filteredP1p2IncidentCount || 0}
                        </Typography>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.3 }}>
                          <Typography sx={{ fontSize: '0.65rem', color: '#6b7280' }}>Count</Typography>
                        </Box>
                      </Box>

                      {/* Total MI Hours */}
                      <Box
                        sx={{
                          borderRadius: 2,
                          background: 'linear-gradient(135deg, rgba(0, 51, 142, 0.12) 0%, rgba(0, 51, 142, 0.08) 100%)',
                          p: 1.4,
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          minHeight: 75,
                          position: 'relative',
                          overflow: 'hidden',
                          border: '1px solid rgba(0, 51, 142, 0.1)',
                        }}
                      >
                        {/* <Box sx={{ position: 'absolute', top: 8, right: 8, opacity: 0.15 }}>
                          <InfoOutlined sx={{ fontSize: 28, color: BLUE_MAIN }} />
                        </Box> */}
                        <Typography
                          sx={{
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            color: '#4b5563',
                            mb: 0.4,
                          }}
                        >
                          Total MI Hours
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: '1.3rem',
                            fontWeight: 800,
                            color: '#111827',
                            lineHeight: 1.1,
                          }}
                        >
                          {filteredTotalMiHours || 0}
                        </Typography>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.3 }}>
                          <Typography sx={{ fontSize: '0.65rem', color: '#6b7280' }}>Hours</Typography>

                        </Box>
                      </Box>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* ===== TABLE - FULL WIDTH ===== */}
          <TableContainer 
            component={Paper} 
            sx={{ 
              bgcolor: '#fff', 
              borderRadius: 3, 
              boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
              border: `1px solid ${NAVY_TINT}`,
              overflowX: 'auto',
              mb: 1, // reduced gap below table
              mt: 1,
              width: '100%'
            }}
          >
            <Table
              size="small"
              sx={{ tableLayout: 'auto', width: '100%', minWidth: { xs: 800, sm: 900, md: 1000 } }}
            >
              <colgroup>
                {/* give heatmap max flexible space, slightly tighten other columns */}
                <col style={{ width: '12%', minWidth: '120px' }} />
                <col style={{ width: '7%', minWidth: '80px' }} />
                <col style={{ width: 'auto', minWidth: '420px' }} />
                <col style={{ width: '7%', minWidth: '80px' }} />
                <col style={{ width: '10%', minWidth: '100px' }} />
              </colgroup>
              <TableHead>
                <TableRow>
                  <StyledTableCell>
                    <Typography sx={{ fontWeight: 700, fontSize: 13 }}>App Family</Typography>
                  </StyledTableCell>
                  <StyledTableCell>Status</StyledTableCell>
                  <StyledTableCell>{getTimeRangeLabel()}</StyledTableCell>
                    <StyledTableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                      <Typography sx={{ fontWeight: 700, fontSize: 13 }}>Uptime</Typography>
                      <Tooltip title="Uptime calculation is based on unplanned downtime events." arrow>
                        <InfoOutlined sx={{ fontSize: 14, color: 'rgba(255,255,255,0.85)' }} />
                      </Tooltip>
                    </Box>
                  </StyledTableCell>
                  <StyledTableCell>Planned Downtime</StyledTableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                      <CircularProgress />
                    </TableCell>
                  </TableRow>
                ) : errorMessage ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                      <Alert severity="error">Error loading data: {errorMessage}</Alert>
                    </TableCell>
                  </TableRow>
                ) : paginatedRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary" fontSize={14}>No applications found</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedRows.map((row, idx) => {
                    var s = STATUS[row.status] || STATUS.Healthy;
                    var heatmapData = row.heatmap || [];
                    var timeLabels = getTimeLabels();
                    var isLastRow = idx === paginatedRows.length - 1;
                    
                    return (
                      <TableRow
                        sx={{
                          '&:hover': { bgcolor: s.bg, transition: 'background-color 0.2s' },
                          borderLeft: `4px solid ${s.border}`
                        }}
                      >
                        <StyledTableCell sx={{ fontWeight: 600, color: '#1e293b' }}>{row.name}</StyledTableCell>
                        <StyledTableCell>
                          <Box 
                            component="span" 
                            px={1.5} 
                            py={0.5} 
                            borderRadius={999} 
                            bgcolor={s.bg} 
                            color={s.text} 
                            fontSize={11} 
                            fontWeight={700} 
                            display="inline-block" 
                            border={`1px solid ${s.border}`}
                          >
                            {row.status}
                          </Box>
                        </StyledTableCell>
                        <StyledTableCell>
                          {/* heatmap: responsive grid with fixed small gap; boxes auto-fill row */}
                          <Box
                            sx={{
                              display: 'grid',
                              gridTemplateColumns: `repeat(${timeLabels.length}, minmax(22px, 1fr))`,
                              columnGap: 0.5, // fixed horizontal gap across 24h/14d/30d
                              rowGap: 0.6,
                              alignItems: 'start',
                              justifyItems: 'center',
                              width: '100%'
                            }}
                          >
                            {heatmapData.map((cell, i) => {
                              // Build tooltip content based on events and early warnings
                              const hasEvents = cell.events && cell.events.length > 0;
                              const hasEarlyWarnings = cell.isCurrentPeriod && cell.earlyWarningsCount > 0;
                              
                              const tooltipContent = (hasEvents || hasEarlyWarnings) ? (
                                <Box sx={{ maxHeight: 250, overflowY: 'auto', pr: 0.5 }}>
                                  {/* Early Warnings Section - shown first for current period */}
                                  {hasEarlyWarnings && (
                                    <Box 
                                      mb={hasEvents ? 1.5 : 0} 
                                      pb={hasEvents ? 1 : 0} 
                                      borderBottom={hasEvents ? '2px solid rgba(244, 162, 97, 0.3)' : 'none'}
                                    >
                                      <Typography 
                                        fontSize={12} 
                                        fontWeight={700} 
                                        color="#F4A261" 
                                        mb={0.5}
                                      >
                                        ⚠️ EARLY WARNINGS
                                      </Typography>
                                      <Box 
                                        sx={{ 
                                          display: 'flex', 
                                          alignItems: 'center', 
                                          gap: 1,
                                          bgcolor: '#FFF3E6',
                                          p: 0.8,
                                          borderRadius: 1,
                                          border: '1px solid #F4A261'
                                        }}
                                      >
                                        <Box
                                          sx={{
                                            minWidth: 28,
                                            height: 28,
                                            borderRadius: '50%',
                                            bgcolor: '#F4A261',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                          }}
                                        >
                                          <Typography fontSize={13} fontWeight={700} color="#fff">
                                            {cell.earlyWarningsCount}
                                          </Typography>
                                        </Box>
                                        <Typography fontSize={11} color="#333">
                                          Active infrastructure issue{cell.earlyWarningsCount > 1 ? 's' : ''} detected
                                        </Typography>
                                      </Box>
                                    </Box>
                                  )}
                                  
                                  {/* Events Section */}
                                  {hasEvents && cell.events.map((event, idx) => (
                                    <Box 
                                      key={idx}
                                      mb={idx < cell.events.length - 1 ? 1 : 0} 
                                      pb={idx < cell.events.length - 1 ? 1 : 0} 
                                      borderBottom={idx < cell.events.length - 1 ? '1px solid rgba(0,0,0,0.1)' : 'none'}
                                    >
                                      <Typography 
                                        fontSize={12} 
                                        fontWeight={700} 
                                        color={event.type === 'incident' ? '#D32F2F' : '#9E9E9E'} 
                                        mb={0.3}
                                      >
                                        {event.type === 'incident' ? '🔴 MAJOR INCIDENT' : '⚫ CHANGE REQUEST'}
                                      </Typography>
                                      {event.type === 'incident' ? (
                                        <Typography
                                          component="a"
                                          href={`https://psjh.service-now.com/now/nav/ui/classic/params/target/incident.do%3Fsysparm_query%3Dnumber%3D${event.number}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          fontSize={11}
                                          fontWeight={600}
                                          color="#1976d2"
                                          mb={0.2}
                                          sx={{
                                            textDecoration: 'underline',
                                            cursor: 'pointer',
                                            display: 'block',
                                            '&:hover': {
                                              color: '#1565c0'
                                            }
                                          }}
                                        >
                                          {event.number}
                                        </Typography>
                                      ) : (
                                        <Typography fontSize={11} fontWeight={600} color="#333" mb={0.2}>
                                          {event.number}
                                        </Typography>
                                      )}
                                      <Typography
                                        fontSize={11}
                                        color="#444"
                                        mb={0.2}
                                        title={event.description || 'No description'}
                                        sx={{
                                          display: '-webkit-box',
                                          WebkitLineClamp: 3,
                                          WebkitBoxOrient: 'vertical',
                                          overflow: 'hidden',
                                          wordBreak: 'break-word'
                                        }}
                                      >
                                        {event.description || 'No description'}
                                      </Typography>
                                      <Typography fontSize={9} color="#666">
                                        {event.startFormatted} - {event.isOngoing ? 'Ongoing' : event.endFormatted}
                                      </Typography>
                                    </Box>
                                  ))}
                                </Box>
                              ) : '';

                              return (
                                <Box
                                  key={i}
                                  sx={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: 0.4,
                                    width: '100%'
                                  }}
                                >
                                  <Typography
                                    sx={{
                                      fontSize: 8,
                                      fontWeight: 600,
                                      color: '#666',
                                      whiteSpace: 'nowrap'
                                    }}
                                  >
                                    {timeLabels[i]}
                                  </Typography>
                                  <Tooltip
                                    title={tooltipContent}
                                    arrow
                                    placement={isLastRow ? 'top' : 'bottom'}
                                    PopperProps={{
                                      sx: {
                                        '& .MuiTooltip-tooltip': {
                                          bgcolor: 'white',
                                          color: '#333',
                                          maxWidth: 200,
                                          minWidth: 180,
                                          p: 1,
                                          borderRadius: 2,
                                          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                          border: '1px solid rgba(0,0,0,0.1)'
                                        },
                                        '& .MuiTooltip-arrow': {
                                          color: 'white',
                                          '&::before': { border: '1px solid rgba(0,0,0,0.1)' }
                                        }
                                      }
                                    }}
                                  >
                                    <Box
                                      onClick={() => {
                                        // Only handle click for incident (critical/red) cells
                                        if (cell.status === 'critical' && cell.events && cell.events.length > 0) {
                                          const incidentEvents = cell.events.filter(e => e.type === 'incident');
                                          if (incidentEvents.length > 0) {
                                            handleIncidentCellClick(incidentEvents);
                                          }
                                        }
                                      }}
                                      sx={{
                                        width: '100%',   // fill grid column
                                        height: 26,
                                        borderRadius: 1.5,
                                        bgcolor: heatColor(cell.status || cell),
                                        boxShadow: cell.isCurrentPeriod && cell.earlyWarningsCount > 0 
                                          ? '0 0 0 2px #F4A261, 0 1px 3px rgba(0,0,0,0.15)' 
                                          : '0 1px 3px rgba(0,0,0,0.15)',
                                        transition: 'transform 0.2s',
                                        cursor: (cell.status === 'critical' && cell.events && cell.events.length > 0) ? 'pointer' : ((cell.events && cell.events.length > 0) || (cell.isCurrentPeriod && cell.earlyWarningsCount > 0) ? 'pointer' : 'default'),
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        '&:hover': {
                                          transform: 'scale(1.05)',
                                          zIndex: 10,
                                          boxShadow: cell.isCurrentPeriod && cell.earlyWarningsCount > 0 
                                            ? '0 0 0 2px #F4A261, 0 2px 6px rgba(0,0,0,0.25)' 
                                            : '0 2px 6px rgba(0,0,0,0.25)'
                                        }
                                      }}
                                    >
                                      {cell.status === 'change' && (
                                        <Settings sx={{ fontSize: 14, color: '#fff' }} />
                                      )}
                                    </Box>
                                  </Tooltip>
                                </Box>
                              );
                            })}
                          </Box>
                        </StyledTableCell>
                        <StyledTableCell sx={{ fontWeight: 700, color: s.text, fontSize: 13 }}>
                          {row.uptime}
                        </StyledTableCell>
                        <StyledTableCell sx={{ fontWeight: 600, color: '#475569', fontSize: 13 }}>
                          {row.plannedDowntime}
                        </StyledTableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Pagination */}
          {!errorMessage && filteredTableRows.length > rowsPerPage && (
            <Box display="flex" justifyContent="center" mt={1} mb={0}>
              <Pagination 
                count={Math.ceil(filteredTableRows.length / rowsPerPage)} 
                page={page} 
                onChange={(e, value) => setPage(value)}
                color="primary"
                size="medium"
                showFirstButton
                showLastButton
                sx={{
                  '& .MuiPaginationItem-root': {
                    fontSize: 13,
                    fontWeight: 600
                  }
                }}
              />
            </Box>
          )}
        </>
      )}
    </Box>
  );
}


