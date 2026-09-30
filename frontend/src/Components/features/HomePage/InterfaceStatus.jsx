import React, { useEffect, useState, useRef } from 'react'
import Grid from '@mui/material/Unstable_Grid2';
import { Modal, Card, CardContent, CardActionArea, Typography, Box, Accordion, AccordionSummary, AccordionDetails, Divider, Button, TextField, ButtonGroup, Autocomplete, IconButton, Select, MenuItem, Chip } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { styled } from '@mui/material/styles';
import {useLocation} from 'react-router-dom'
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell,{ tableCellClasses } from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import CircularProgress from '@mui/material/CircularProgress';
import AreaLineChart from '../../shared/LineChart/AreaLineChart';
import ReactSpeedometer from 'react-d3-speedometer/slim'
import Alert from '@mui/material/Alert';
import { CurtainsClosedOutlined, ElevatorSharp } from '@mui/icons-material';
import UpTimeIcon from '../../Static/Images/UpTime.svg'
import EventLogsIcon from '../../Static/Images/EventLog.svg'
import { CheckCircle as SuccessIcon } from '@mui/icons-material';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import SettingsIcon from '@mui/icons-material/Settings';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import AutoRestartIcon from '../../Static/Images/AutoRestart.svg'
import DataNotFoundIcon from '../../Static/Images/DataNotFound.svg'
import Tooltip from '@mui/material/Tooltip'; 
import '../../../assets/css/fonts.css';
import LocationIcon from '../../Static/Images/LocationIcon.svg'
import RebootIcon from '../../Static/Images/Reboots.svg'
import {getUrl} from '../../../environment'
import { logPageVisit,startPageTracking,appInsights } from '../appInsights'; // Import the function
import InfoOutlined from '@mui/icons-material/InfoOutlined'
import { convertTimeToPreferredTZ } from '../../shared/Timestamp/PreferenceConversion';
import dayjs from 'dayjs';
import utcPlugin from 'dayjs/plugin/utc';
import timezonePlugin from 'dayjs/plugin/timezone';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(utcPlugin);
dayjs.extend(timezonePlugin);
dayjs.extend(customParseFormat);

const InterfaceStatus = ({date,appInsights,preferredTZ,appName,appFamily,globalFilterData,globalFilterChoice}) => {

    var baseUrl =  getUrl()
    const location = useLocation();
    var urlParams = new URLSearchParams(location.search)
    const { cardData } = location.state || {};
    var [interfaceStatusMetric, setInterfaceStatusMetric] = useState({ "Simulated": 0, "Not Connected": 0, "Waiting For Reply": 0, "Connecting": 0, "Stopped": 0, "Connected": 0 , "QueueDepthNotZero": 0})
  const [interfaceStatusData, setInterfaceStatusData] = useState({})
    const [loading, setLoading] = useState({ interfaceStatus: false, isInitialLoadComplete: false, loadingTable: true });
  
    const [interfaceStatusDataCheck, setInterfaceStatusDataCheck] = useState({})
  const [selectedConnectionStatuses, setSelectedConnectionStatuses] = useState([]);
  const [selectedInterfaceNames, setSelectedInterfaceNames] = useState([]);
  const [queueDepthThreshold, setQueueDepthThreshold] = useState('');
  const connectionStatusOptions = ['Connected', 'Connecting','Not Connected', 'Waiting For Reply', 'Simulated', 'Stopped'];
  // Map of unique interface key (InterfaceName|CorepointMonitor) -> assigned category per precedence
  const [interfaceCategoryByKey, setInterfaceCategoryByKey] = useState({});
  // Normalizer to avoid duplicate keys due to case/spacing/NULL variants
  const normalizeKeyPart = (val) => {
    const raw = String(val ?? '').trim().toLowerCase();
    if (!raw || raw === 'null' || raw === '(null)' || raw === 'na' || raw === 'n/a' || raw === 'none' || raw === 'undefined') {
      return '';
    }
    // Collapse internal whitespace to single space
    return raw.replace(/\s+/g, ' ');
  };
    var [queryParams, setQueryParams] = useState({})
    const [entryTime, setEntryTime] = useState(null);
    const [validationReportModal, setValidationReportModal] = useState({
      open: false,
      loading: false,
      data: [],
      error: '',
      exceptions: {}
    });

    const convertTimestamp = (timeStr) => {
        if (!timeStr) return timeStr;
        return dayjs.tz(timeStr, 'America/Los_Angeles').tz(preferredTZ || 'America/Los_Angeles').format('YYYY-MM-DD HH:mm:ss');
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

    const fetchInterfaceStatus = async (aggregate) => {
        // Reset interface status data and loading states
        //console.log("came into the function!!")
        setInterfaceStatusData({});
        setLoading((prevLoading) => ({
            ...prevLoading,
            interfaceStatus: true,
            loadingTable:true
        }));
    
        // Extract AppName from location.state
        const AppName = queryParams["Name"] // Use AppName from location state
        
        if (!AppName) {
            // Handle the case when AppName is not provided in location.state
            console.error('AppName is not available');
            setLoading((prevLoading) => ({
                ...prevLoading,
                interfaceStatus: false,
            }));
            return;
        }
    
        // Set parameters for the request
        const params = {
            aggregate: aggregate,
            filters: {
                appFamily: ["All"],
                appCI: [AppName], // Using AppName from location.state here
                managedByGroup: ["All"],
                supportGroup: ["All"]
            },
            start_time: date.startDate,
            end_time: date.endDate,
        };
    
        // URL for fetching interface status data
        const url = new URL(baseUrl + "interfaceHealthLogs"); //interfaceHealthLogs
    
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(params),
            });
    
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
    
            const data = await response.json();
    
            // Check if data contains expected structure and has interface status
            if (data && data["Data"] && data["Data"]["Interfaces"] && data["Data"]["Interfaces"].length > 0) {
                // Update the state with fetched data
                
                setInterfaceStatusData((data["Data"]["Interfaces"]));
                console.log("dataaaaaaaaa interfaces: ",data["Data"]["Interfaces"])
                setInterfaceStatusDataCheck((data["Data"]["Interfaces"]));
            } else {
                //console.log("Came into the else condition")
                setInterfaceStatusData({}); // Set to empty if no data
                setInterfaceStatusDataCheck({});
            }
    
            // Update loading state to false after data is fetched
            setLoading((prevLoading) => ({
                ...prevLoading,
                interfaceStatus: false,
                isInitialLoadComplete: true
            }));
            //setIsInitialLoadComplete(true);
    
        } catch (error) {
            // Handle errors and update states
            //console.log("Erorr error eorrr")
            setInterfaceStatusData({});
            setLoading((prevLoading) => ({
                ...prevLoading,
                interfaceStatus: false,
                isInitialLoadComplete: true
            }));
            console.error("Error fetching interface status:", error);
            // Ensure the flag is updated even on failure
           // setIsInitialLoadComplete(true);
        }
    };
    
    useEffect(() => {
        console.log("Came into date useeffect")
        if (date && date.startDate && Object.keys(queryParams).length>0) {
            setSelectedConnectionStatuses([]);
            setSelectedInterfaceNames([]);
            setQueueDepthThreshold('');
            fetchInterfaceStatus("no");
        }
    }, [date, queryParams,preferredTZ])

    // Execute only after fetchInterfaceStatus completes
    useEffect(() => {
        if (loading.isInitialLoadComplete) {
            console.log("Came into useEffect of interfaceStatusData");
            interfaceStatusCardMetrics();
        }
    }, [interfaceStatusDataCheck])

    useEffect(()=>{
      // Use appName prop if provided, otherwise fall back to URL params
      var nameOfResource = appName || location.state?.AppName?.toString() || urlParams.get("Name")?.toString() || ""
      var typeOfResource = urlParams.get("Type")?.toString() || "Application CI"
      
      if(nameOfResource){
        setQueryParams({
          "Name":nameOfResource,
          "Type":typeOfResource
        })
      }
      
      if(cardData===undefined){

      }
    }, [appName])

  const interfaceNameOptions = React.useMemo(() => {
    const sourceArray = Array.isArray(interfaceStatusData) ? interfaceStatusData : [];
    const names = new Set();
    sourceArray.forEach(item => {
      const name = item.InterfaceName ?? item.interfaceName ?? '';
      if (name && name.trim()) {
        names.add(name.trim());
      }
    });
    return Array.from(names).sort();
  }, [interfaceStatusData]);

  const resolvedAppFamily = React.useMemo(() => {
    if (appFamily) {
      return String(appFamily).trim();
    }

    const activeAppName = queryParams["Name"] || location.state?.AppName?.toString() || appName || "";

    if (location.state?.AppFamily) {
      return String(location.state.AppFamily).trim();
    }

    let matchedAppFamily = "";

    if (activeAppName && globalFilterData && globalFilterData["AppCI"] && globalFilterData["AppFamily"]) {
      Object.keys(globalFilterData["AppCI"]).some((key) => {
        const appCI = String(globalFilterData["AppCI"][key] ?? '').trim().toLowerCase();
        if (appCI === activeAppName.trim().toLowerCase()) {
          matchedAppFamily = String(globalFilterData["AppFamily"][key] ?? '').trim();
          return true;
        }
        return false;
      });
    }

    if (!matchedAppFamily && globalFilterChoice && globalFilterChoice["ResourceType"] === "Application Family") {
      const appCiList = Array.isArray(globalFilterChoice["Application CI"]) ? globalFilterChoice["Application CI"] : [];
      if (!activeAppName || appCiList.some((item) => String(item ?? '').trim().toLowerCase() === activeAppName.trim().toLowerCase())) {
        matchedAppFamily = String(globalFilterChoice["ResourceName"] ?? '').trim();
      }
    }

    if (!matchedAppFamily && location.state?.stateName && globalFilterChoice && globalFilterChoice["ResourceType"] === "Application Family") {
      matchedAppFamily = String(location.state.stateName).trim();
    }

    return matchedAppFamily;
  }, [appFamily, appName, globalFilterChoice, globalFilterData, location.state, queryParams]);

  const closeValidationReportModal = () => {
    setValidationReportModal((prevState) => ({
      ...prevState,
      open: false
    }));
  };

  const downloadValidationReportCsv = () => {
    const data = validationReportModal.data;
    if (!Array.isArray(data) || data.length === 0) return;

    const headers = ['Time Generated', 'Interface Name', 'Connection State', 'Queue Depth', 'Idle Time', 'Peer IP', 'Corepoint Monitor'];
    const getField = (item, ...keys) => {
      for (const k of keys) { if (item[k] != null && item[k] !== '') return String(item[k]); }
      return '';
    };
    const escapeCsv = (val) => {
      const s = String(val ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const rows = data.map((item) => [
      escapeCsv(getField(item, 'TimeGenerated', 'timeGenerated', 'Time Generated')),
      escapeCsv(getField(item, 'InterfaceName', 'interfaceName', 'Interface Name')),
      escapeCsv(getField(item, 'ConnectionStatus', 'connectionStatus', 'Connection State', 'Connection Status')),
      escapeCsv(getField(item, 'QueueDepth', 'queueDepth', 'Queue Depth')),
      escapeCsv(getField(item, 'IdleTime', 'idleTime', 'Idle Time')),
      escapeCsv(getField(item, 'PeerIp', 'peerip', 'Peer IP')),
      escapeCsv(getField(item, 'CorepointMonitor', 'corepointMonitor', 'Corepoint Monitor'))
    ].join(','));
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Validation_Report_${resolvedAppFamily || 'Unknown'}_${dayjs().format('YYYY-MM-DD_HH-mm-ss')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const fetchValidationReport = async () => {
    const applicationFamily = resolvedAppFamily;

    setValidationReportModal({
      open: true,
      loading: true,
      data: [],
      error: '',
      exceptions: {}
    });

    if (!applicationFamily) {
      setValidationReportModal({
        open: true,
        loading: false,
        data: [],
        error: 'Unable to resolve the Application Family for this AppCI from the global filter data.',
        exceptions: {}
      });
      return;
    }

    const payload = {
      "Application family": [applicationFamily]
    };

    try {
      const response = await fetch(new URL(baseUrl + 'applicationMetrics/onDemand/interfaceStatus'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => null);
      const responseStatus = Number(result?.status ?? response.status);

      if (!response.ok || responseStatus >= 400) {
        throw new Error(result?.error?.message || result?.Data || 'Failed to generate interface validation report.');
      }

      setValidationReportModal({
        open: true,
        loading: false,
        data: Array.isArray(result?.Data) ? result.Data : [],
        error: '',
        exceptions: result?.meta?.Exceptions || {}
      });
    } catch (error) {
      console.error('Error fetching interface validation report:', error);
      setValidationReportModal({
        open: true,
        loading: false,
        data: [],
        error: error.message || 'Failed to generate interface validation report.',
        exceptions: {}
      });
    }
  };

  const InterfaceStatusGridTable = ({
    sourceData,
    loadingTable,
    loadingMessage,
    selectedInterfaceNamesFilter = [],
    selectedConnectionStatusesFilter = [],
    queueDepthThresholdFilter = ''
  }) => {
    const tableWrapperRef = useRef(null);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(25);
    const [columnFilters, setColumnFilters] = useState({
      interfaceName: '',
      connectionStatus: '',
      queueDepth: '',
      idleTime: '',
      timeGenerated: '',
      peerip: '',
      corepointMonitor: ''
    });
    const [columnOps, setColumnOps] = useState({
      interfaceName: 'contains',
      connectionStatus: 'contains',
      queueDepth: 'contains',
      idleTime: 'contains',
      timeGenerated: 'contains',
      peerip: 'contains',
      corepointMonitor: 'contains'
    });
    const [headerSearchActive, setHeaderSearchActive] = useState({
      interfaceName: false,
      connectionStatus: false,
      queueDepth: false,
      idleTime: false,
      timeGenerated: false,
      peerip: false,
      corepointMonitor: false
    });
    const [sortConfig, setSortConfig] = useState({ key: 'timeGenerated', direction: 'desc' });

    useEffect(() => { setPage(0); }, [JSON.stringify(selectedConnectionStatusesFilter), JSON.stringify(selectedInterfaceNamesFilter), queueDepthThresholdFilter]);
    useEffect(() => { setPage(0); }, [JSON.stringify(columnFilters)]);

    const parseTimeTs = (val) => {
      if (!val) return Number.NEGATIVE_INFINITY;
      const m = dayjs(val, [
        'YYYY-MM-DD HH:mm:ss',
        'YYYY-MM-DD HH:mm',
        'MM/DD/YYYY HH:mm:ss',
        'MM/DD/YYYY HH:mm',
      ], true);
      if (m.isValid()) return m.valueOf();
      const iso = dayjs(val);
      if (iso.isValid()) return iso.valueOf();
      const d = Date.parse(val);
      return Number.isNaN(d) ? Number.NEGATIVE_INFINITY : d;
    };

    const applyOp = (haystack, needle, op) => {
      const h = String(haystack ?? '').toLowerCase();
      const n = String(needle ?? '').toLowerCase();
      if (!n) return true;
      switch (op) {
        case 'equals': return h === n;
        case 'starts': return h.startsWith(n);
        case 'ends': return h.endsWith(n);
        case 'contains':
        default: return h.includes(n);
      }
    };

    const handleSort = (key) => {
      setSortConfig((prev) => ({
        key,
        direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
      }));
    };

    const getSortIconComp = (columnKey) => {
      const inactiveColor = '#cbd5e1';
      const activeColor = '#475569';
      if (sortConfig.key !== columnKey) {
        return <SwapVertIcon sx={{ fontSize: '0.9rem', color: inactiveColor }} />;
      }
      return sortConfig.direction === 'asc'
        ? <ArrowUpwardIcon sx={{ fontSize: '0.9rem', color: activeColor }} />
        : <ArrowDownwardIcon sx={{ fontSize: '0.9rem', color: activeColor }} />;
    };

    const sourceArray = Array.isArray(sourceData) ? sourceData : [];
    const hasActiveSearch = Object.values(columnFilters).some((value) => String(value ?? '').trim() !== '');
    const prevHasSearchRef = useRef(hasActiveSearch);

    useEffect(() => {
      if (hasActiveSearch && !prevHasSearchRef.current) {
        setSortConfig({ key: 'timeGenerated', direction: 'desc' });
      }
      prevHasSearchRef.current = hasActiveSearch;
    }, [hasActiveSearch]);

    const allRows = loadingTable
      ? []
      : sourceArray
          .map((item) => {
            const rawTimeGenerated = item.TimeGenerated ?? item.timeGenerated ?? item["Time Generated"] ?? '';
            const interfaceName = item.InterfaceName ?? item.interfaceName ?? item["Interface Name"] ?? '';
            const connectionStatus = item.ConnectionStatus ?? item.connectionStatus ?? item["Connection State"] ?? item["Connection Status"] ?? '';
            const queueDepth = item.QueueDepth ?? item.queueDepth ?? item["Queue Depth"] ?? '';
            const peerip = item.PeerIp ?? item.peerip ?? item["Peer IP"] ?? '';
            const idleTime = item.IdleTime ?? item.idleTime ?? item["Idle Time"] ?? '';
            const corepointMonitor = item.CorepointMonitor ?? item.corepointMonitor ?? item["Corepoint Monitor"] ?? '';

            return {
              interfaceName,
              connectionStatus,
              queueDepth,
              idleTime,
              timeGenerated: convertTimestamp(rawTimeGenerated),
              timeGeneratedTs: parseTimeTs(rawTimeGenerated),
              peerip,
              corepointMonitor
            };
          })
          .filter((row) => {
            const name = String(row.interfaceName ?? '').trim();
            return name !== '' && name !== '-';
          })
          .filter((row) => {
            if (selectedInterfaceNamesFilter.length === 0) return true;
            const name = String(row.interfaceName ?? '').trim();
            return selectedInterfaceNamesFilter.some((value) => value.toLowerCase() === name.toLowerCase());
          })
          .filter((row) => {
            if (selectedConnectionStatusesFilter.length === 0) return true;
            const status = String(row.connectionStatus ?? '').trim();
            return selectedConnectionStatusesFilter.some((value) => value.toLowerCase() === status.toLowerCase());
          })
          .filter((row) => {
            if (!queueDepthThresholdFilter || queueDepthThresholdFilter.trim() === '') return true;
            const threshold = Number(queueDepthThresholdFilter);
            if (isNaN(threshold)) return true;
            const depth = Number(row.queueDepth) || 0;
            return depth > threshold;
          })
          .filter((row) => applyOp(row.interfaceName, columnFilters.interfaceName, columnOps.interfaceName))
          .filter((row) => applyOp(row.connectionStatus, columnFilters.connectionStatus, columnOps.connectionStatus))
          .filter((row) => applyOp(String(row.queueDepth ?? ''), columnFilters.queueDepth, columnOps.queueDepth))
          .filter((row) => applyOp(row.timeGenerated, columnFilters.timeGenerated, columnOps.timeGenerated))
          .filter((row) => applyOp(row.peerip ?? '', columnFilters.peerip, columnOps.peerip))
          .filter((row) => applyOp(String(row.idleTime ?? ''), columnFilters.idleTime, columnOps.idleTime))
          .filter((row) => applyOp(String(row.corepointMonitor ?? ''), columnFilters.corepointMonitor, columnOps.corepointMonitor))
          .sort((a, b) => {
            let av;
            let bv;
            switch (sortConfig.key) {
              case 'interfaceName':
                av = (a.interfaceName || '').toLowerCase();
                bv = (b.interfaceName || '').toLowerCase();
                break;
              case 'connectionStatus':
                av = (a.connectionStatus || '').toLowerCase();
                bv = (b.connectionStatus || '').toLowerCase();
                break;
              case 'queueDepth':
                av = Number(a.queueDepth) || 0;
                bv = Number(b.queueDepth) || 0;
                break;
              case 'peerip':
                av = (a.peerip || '').toLowerCase();
                bv = (b.peerip || '').toLowerCase();
                break;
              case 'idleTime':
                av = (a.idleTime || '').toLowerCase();
                bv = (b.idleTime || '').toLowerCase();
                break;
              case 'corepointMonitor':
                av = String(a.corepointMonitor ?? '').toLowerCase();
                bv = String(b.corepointMonitor ?? '').toLowerCase();
                break;
              case 'timeGenerated':
              default:
                av = typeof a.timeGeneratedTs === 'number' ? a.timeGeneratedTs : Number.NEGATIVE_INFINITY;
                bv = typeof b.timeGeneratedTs === 'number' ? b.timeGeneratedTs : Number.NEGATIVE_INFINITY;
                break;
            }
            if (av < bv) return sortConfig.direction === 'asc' ? -1 : 1;
            if (av > bv) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
          });

    const rows = allRows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

    const handleChangePage = (event, newPage) => {
      setPage(newPage);
    };

    const handleChangeRowsPerPage = (event) => {
      setRowsPerPage(parseInt(event.target.value, 10));
      setPage(0);
    };

    return (
      <Box display="flex" justifyContent="center" alignItems="center" width="100%">
        {loadingTable ? (
          <Box display="flex" justifyContent="center" alignItems="center" height={200}>
            <CircularProgress sx={{ mr: 2 }} />
            <Typography variant="h6">{loadingMessage}</Typography>
          </Box>
        ) : (
          <Box ref={tableWrapperRef} sx={{ position: 'relative', border: "1px solid #e5e7eb", borderRadius: 2, overflow: "visible", boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)", mt: 1.5, width: '100%', backgroundColor: '#ffffff' }}>
            <Box sx={{ borderRadius: 2 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "13%" }} />
                  <col style={{ width: "24%" }} />
                  <col style={{ width: "13%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "13%" }} />
                  <col style={{ width: "13%" }} />
                  <col style={{ width: "14%" }} />
                </colgroup>
                <thead>
                  <tr style={{ backgroundColor: "#f8fafc", borderBottom: "2px solid #e2e8f0", height: 30 }}>
                    <th style={{ position: 'sticky', top: 0, zIndex: 2, background: '#f8fafc', textAlign: "left", padding: "0 14px", height: 30, fontWeight: 700, color: "#475569", userSelect: "none" }}>
                      {headerSearchActive.timeGenerated ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <TextField autoFocus value={columnFilters.timeGenerated} onChange={(e) => setColumnFilters((prev) => ({ ...prev, timeGenerated: e.target.value }))} placeholder="Search Time Generated…" size="small" sx={{ flex: 1, '& .MuiInputBase-root': { height: 28, minHeight: 28 }, '& .MuiInputBase-input': { py: 0, fontSize: '0.75rem' } }} />
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); setHeaderSearchActive((prev) => ({ ...prev, timeGenerated: false })); }} sx={{ color: 'text.secondary', width: 26, height: 26 }}>
                            <CloseIcon fontSize="inherit" />
                          </IconButton>
                        </Box>
                      ) : (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                          <Typography variant="caption" sx={{ fontWeight: 700, color: '#475569', fontSize: { xs: '0.5rem', sm: '0.5625rem', md: '0.625rem' } }}>Time Generated</Typography>
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleSort('timeGenerated'); }} sx={{ ml: 0.25, color: 'text.secondary', width: 22, height: 22 }}>
                            {getSortIconComp('timeGenerated')}
                          </IconButton>
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); setHeaderSearchActive((prev) => ({ ...prev, timeGenerated: true })); }} sx={{ ml: 0.5, color: headerSearchActive.timeGenerated ? 'primary.main' : 'text.disabled', width: 26, height: 26 }}>
                            <SearchIcon fontSize="inherit" />
                          </IconButton>
                        </Box>
                      )}
                    </th>
                    <th style={{ position: 'sticky', top: 0, zIndex: 2, background: '#f8fafc', textAlign: "left", padding: "0 14px", height: 30, fontWeight: 700, color: "#475569", userSelect: "none" }}>
                      {headerSearchActive.interfaceName ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <TextField autoFocus value={columnFilters.interfaceName} onChange={(e) => setColumnFilters((prev) => ({ ...prev, interfaceName: e.target.value }))} placeholder="Search Interface Name…" size="small" sx={{ flex: 1, '& .MuiInputBase-root': { height: 28, minHeight: 28 }, '& .MuiInputBase-input': { py: 0, fontSize: '0.75rem' } }} />
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); setHeaderSearchActive((prev) => ({ ...prev, interfaceName: false })); }} sx={{ color: 'text.secondary', width: 26, height: 26 }}>
                            <CloseIcon fontSize="inherit" />
                          </IconButton>
                        </Box>
                      ) : (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                          <Typography variant="caption" sx={{ fontWeight: 700, color: '#475569', fontSize: { xs: '0.5rem', sm: '0.5625rem', md: '0.625rem' } }}>Interface Name</Typography>
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleSort('interfaceName'); }} sx={{ ml: 0.25, color: 'text.secondary', width: 22, height: 22 }}>
                            {getSortIconComp('interfaceName')}
                          </IconButton>
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); setHeaderSearchActive((prev) => ({ ...prev, interfaceName: true })); }} sx={{ ml: 0.5, color: headerSearchActive.interfaceName ? 'primary.main' : 'text.disabled', width: 26, height: 26 }}>
                            <SearchIcon fontSize="inherit" />
                          </IconButton>
                        </Box>
                      )}
                    </th>
                    <th style={{ position: 'sticky', top: 0, zIndex: 2, background: '#f8fafc', textAlign: "left", padding: "0 14px", height: 30, fontWeight: 700, color: "#475569", userSelect: "none" }}>
                      {headerSearchActive.connectionStatus ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <TextField autoFocus value={columnFilters.connectionStatus} onChange={(e) => setColumnFilters((prev) => ({ ...prev, connectionStatus: e.target.value }))} placeholder="Search Connection Status…" size="small" sx={{ flex: 1, '& .MuiInputBase-root': { height: 28, minHeight: 28 }, '& .MuiInputBase-input': { py: 0, fontSize: '0.75rem' } }} />
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); setHeaderSearchActive((prev) => ({ ...prev, connectionStatus: false })); }} sx={{ color: 'text.secondary', width: 26, height: 26 }}>
                            <CloseIcon fontSize="inherit" />
                          </IconButton>
                        </Box>
                      ) : (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                          <Typography variant="caption" sx={{ fontWeight: 700, color: '#475569', fontSize: { xs: '0.5rem', sm: '0.5625rem', md: '0.625rem' } }}>Connection Status</Typography>
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleSort('connectionStatus'); }} sx={{ ml: 0.25, color: 'text.secondary', width: 22, height: 22 }}>
                            {getSortIconComp('connectionStatus')}
                          </IconButton>
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); setHeaderSearchActive((prev) => ({ ...prev, connectionStatus: true })); }} sx={{ ml: 0.5, color: headerSearchActive.connectionStatus ? 'primary.main' : 'text.disabled', width: 26, height: 26 }}>
                            <SearchIcon fontSize="inherit" />
                          </IconButton>
                        </Box>
                      )}
                    </th>
                    <th style={{ position: 'sticky', top: 0, zIndex: 2, background: '#f8fafc', textAlign: "left", padding: "0 14px", height: 30, fontWeight: 700, color: "#475569", userSelect: "none" }}>
                      {headerSearchActive.queueDepth ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <TextField autoFocus value={columnFilters.queueDepth} onChange={(e) => setColumnFilters((prev) => ({ ...prev, queueDepth: e.target.value }))} placeholder="Search Queue Depth…" size="small" sx={{ flex: 1, '& .MuiInputBase-root': { height: 28, minHeight: 28 }, '& .MuiInputBase-input': { py: 0, fontSize: '0.75rem' } }} />
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); setHeaderSearchActive((prev) => ({ ...prev, queueDepth: false })); }} sx={{ color: 'text.secondary', width: 26, height: 26 }}>
                            <CloseIcon fontSize="inherit" />
                          </IconButton>
                        </Box>
                      ) : (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                          <Typography variant="caption" sx={{ fontWeight: 700, color: '#475569', fontSize: { xs: '0.5rem', sm: '0.5625rem', md: '0.625rem' } }}>Queue Depth</Typography>
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleSort('queueDepth'); }} sx={{ ml: 0.25, color: 'text.secondary', width: 22, height: 22 }}>
                            {getSortIconComp('queueDepth')}
                          </IconButton>
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); setHeaderSearchActive((prev) => ({ ...prev, queueDepth: true })); }} sx={{ ml: 0.5, color: headerSearchActive.queueDepth ? 'primary.main' : 'text.disabled', width: 26, height: 26 }}>
                            <SearchIcon fontSize="inherit" />
                          </IconButton>
                        </Box>
                      )}
                    </th>
                    <th style={{ position: 'sticky', top: 0, zIndex: 2, background: '#f8fafc', textAlign: "left", padding: "0 14px", height: 30, fontWeight: 700, color: "#475569", userSelect: "none" }}>
                      {headerSearchActive.idleTime ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <TextField autoFocus value={columnFilters.idleTime} onChange={(e) => setColumnFilters((prev) => ({ ...prev, idleTime: e.target.value }))} placeholder="Search Idle Time…" size="small" sx={{ flex: 1, '& .MuiInputBase-root': { height: 28, minHeight: 28 }, '& .MuiInputBase-input': { py: 0, fontSize: '0.75rem' } }} />
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); setHeaderSearchActive((prev) => ({ ...prev, idleTime: false })); }} sx={{ color: 'text.secondary', width: 26, height: 26 }}>
                            <CloseIcon fontSize="inherit" />
                          </IconButton>
                        </Box>
                      ) : (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                          <Typography variant="caption" sx={{ fontWeight: 700, color: '#475569', fontSize: { xs: '0.5rem', sm: '0.5625rem', md: '0.625rem' } }}>Idle Time</Typography>
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleSort('idleTime'); }} sx={{ ml: 0.25, color: 'text.secondary', width: 22, height: 22 }}>
                            {getSortIconComp('idleTime')}
                          </IconButton>
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); setHeaderSearchActive((prev) => ({ ...prev, idleTime: true })); }} sx={{ ml: 0.5, color: headerSearchActive.idleTime ? 'primary.main' : 'text.disabled', width: 26, height: 26 }}>
                            <SearchIcon fontSize="inherit" />
                          </IconButton>
                        </Box>
                      )}
                    </th>
                    <th style={{ position: 'sticky', top: 0, zIndex: 2, background: '#f8fafc', textAlign: "left", padding: "0 14px", height: 30, fontWeight: 700, color: "#475569", userSelect: "none" }}>
                      {headerSearchActive.peerip ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <TextField autoFocus value={columnFilters.peerip} onChange={(e) => setColumnFilters((prev) => ({ ...prev, peerip: e.target.value }))} placeholder="Search Peer IP…" size="small" sx={{ flex: 1, '& .MuiInputBase-root': { height: 28, minHeight: 28 }, '& .MuiInputBase-input': { py: 0, fontSize: '0.75rem' } }} />
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); setHeaderSearchActive((prev) => ({ ...prev, peerip: false })); }} sx={{ color: 'text.secondary', width: 26, height: 26 }}>
                            <CloseIcon fontSize="inherit" />
                          </IconButton>
                        </Box>
                      ) : (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                          <Typography variant="caption" sx={{ fontWeight: 700, color: '#475569', fontSize: { xs: '0.5rem', sm: '0.5625rem', md: '0.625rem' } }}>Peer IP</Typography>
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleSort('peerip'); }} sx={{ ml: 0.25, color: 'text.secondary', width: 22, height: 22 }}>
                            {getSortIconComp('peerip')}
                          </IconButton>
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); setHeaderSearchActive((prev) => ({ ...prev, peerip: true })); }} sx={{ ml: 0.5, color: headerSearchActive.peerip ? 'primary.main' : 'text.disabled', width: 26, height: 26 }}>
                            <SearchIcon fontSize="inherit" />
                          </IconButton>
                        </Box>
                      )}
                    </th>
                    <th style={{ position: 'sticky', top: 0, zIndex: 2, background: '#f8fafc', textAlign: "left", padding: "0 14px", height: 30, fontWeight: 700, color: "#475569", userSelect: "none" }}>
                      {headerSearchActive.corepointMonitor ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <TextField autoFocus value={columnFilters.corepointMonitor} onChange={(e) => setColumnFilters((prev) => ({ ...prev, corepointMonitor: e.target.value }))} placeholder="Search Corepoint Monitor…" size="small" sx={{ flex: 1, '& .MuiInputBase-root': { height: 28, minHeight: 28 }, '& .MuiInputBase-input': { py: 0, fontSize: '0.75rem' } }} />
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); setHeaderSearchActive((prev) => ({ ...prev, corepointMonitor: false })); }} sx={{ color: 'text.secondary', width: 26, height: 26 }}>
                            <CloseIcon fontSize="inherit" />
                          </IconButton>
                        </Box>
                      ) : (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                          <Typography variant="caption" sx={{ fontWeight: 700, color: '#475569', fontSize: { xs: '0.5rem', sm: '0.5625rem', md: '0.625rem' } }}>Corepoint Monitor</Typography>
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleSort('corepointMonitor'); }} sx={{ ml: 0.25, color: 'text.secondary', width: 22, height: 22 }}>
                            {getSortIconComp('corepointMonitor')}
                          </IconButton>
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); setHeaderSearchActive((prev) => ({ ...prev, corepointMonitor: true })); }} sx={{ ml: 0.5, color: headerSearchActive.corepointMonitor ? 'primary.main' : 'text.disabled', width: 26, height: 26 }}>
                            <SearchIcon fontSize="inherit" />
                          </IconButton>
                        </Box>
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {allRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: "10px 14px", fontSize: "0.8125rem", color: "#6b7280", textAlign: "center" }}>
                        No matching records.
                      </td>
                    </tr>
                  ) : rows.map((row, index) => (
                    <tr key={`${row.interfaceName}-${row.corepointMonitor}-${row.timeGeneratedTs}-${index}`} style={{ borderBottom: "1px solid #f3f4f6", backgroundColor: index % 2 === 0 ? "#ffffff" : "#fafafa", transition: "all 0.2s ease", cursor: "pointer" }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#f0f9ff"; e.currentTarget.style.transform = "scale(1.002)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.08)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = index % 2 === 0 ? "#ffffff" : "#fafafa"; e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "none"; }}>
                      <td style={{ padding: "6px 8px", fontSize: "0.75rem", color: "#1f2937", fontWeight: 500, overflow: "hidden" }}>
                        <Typography variant="body2" sx={{ fontSize: { xs: '0.5625rem', sm: '0.625rem', md: '0.6875rem' }, color: '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {row.timeGenerated}
                        </Typography>
                      </td>
                      <td style={{ padding: "6px 8px", fontSize: "0.75rem", color: "#374151", overflow: "hidden" }}>
                        <Tooltip title={row.interfaceName || "—"}>
                          <Typography variant="body2" sx={{ fontWeight: 500, fontSize: { xs: '0.625rem', sm: '0.6875rem', md: '0.75rem' }, whiteSpace: 'normal', wordBreak: 'break-word', overflow: 'hidden' }}>
                            {row.interfaceName || "—"}
                          </Typography>
                        </Tooltip>
                      </td>
                      <td style={{ padding: "6px 8px", fontSize: "0.75rem", color: "#374151", overflow: "hidden" }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: { xs: '0.625rem', sm: '0.6875rem', md: '0.75rem' }, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {row.connectionStatus || "—"}
                        </Typography>
                      </td>
                      <td style={{ padding: "6px 8px", fontSize: "0.75rem", color: "#374151", overflow: "hidden" }}>
                        <Typography variant="body2" sx={{ fontSize: { xs: '0.625rem', sm: '0.6875rem', md: '0.75rem' }, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {row.queueDepth}
                        </Typography>
                      </td>
                      <td style={{ padding: "6px 8px", fontSize: "0.75rem", color: "#1f2937", fontWeight: 500, overflow: "hidden" }}>
                        <Typography variant="body2" sx={{ fontSize: { xs: '0.5625rem', sm: '0.625rem', md: '0.6875rem' }, color: '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {row.idleTime || "—"}
                        </Typography>
                      </td>
                      <td style={{ padding: "6px 8px", fontSize: "0.75rem", color: "#1f2937", fontWeight: 500, overflow: "hidden" }}>
                        <Typography variant="body2" sx={{ fontSize: { xs: '0.5625rem', sm: '0.625rem', md: '0.6875rem' }, color: '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {row.peerip ?? "NULL"}
                        </Typography>
                      </td>
                      <td style={{ padding: "6px 8px", fontSize: "0.75rem", color: "#1f2937", fontWeight: 500, overflow: "hidden" }}>
                        <Typography variant="body2" sx={{ fontSize: { xs: '0.5625rem', sm: '0.625rem', md: '0.6875rem' }, color: '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {row.corepointMonitor !== null && row.corepointMonitor !== undefined ? String(row.corepointMonitor) : '—'}
                        </Typography>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
            {!loadingTable && allRows.length > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', p: 1 }}>
                <TablePagination
                  component="div"
                  count={allRows.length}
                  page={page}
                  onPageChange={handleChangePage}
                  rowsPerPage={rowsPerPage}
                  onRowsPerPageChange={handleChangeRowsPerPage}
                  rowsPerPageOptions={[10, 25, 50, 100]}
                  labelRowsPerPage="Rows per page:"
                />
              </Box>
            )}
          </Box>
        )}
      </Box>
    );
  };

  const InterfaceStatusTable = () => {
    return (
      <InterfaceStatusGridTable
        sourceData={interfaceStatusData}
        loadingTable={loading.loadingTable}
        loadingMessage="Fetching the interface details..."
        selectedInterfaceNamesFilter={selectedInterfaceNames}
        selectedConnectionStatusesFilter={selectedConnectionStatuses}
        queueDepthThresholdFilter={queueDepthThreshold}
      />
    );
  };

    var interfaceStatusCardMetrics = () => {
      // Validate data
      if (!interfaceStatusData || !Array.isArray(interfaceStatusData) || interfaceStatusData.length === 0) {
        setLoading((prevLoading) => ({ ...prevLoading, loadingTable: false }));
        setInterfaceStatusMetric({ "Simulated": 0, "Not Connected": 0, "Waiting For Reply": 0, "Connecting": 0, "Stopped": 0, "Connected": 0, "QueueDepthNotZero": 0 });
        setInterfaceCategoryByKey({});
        return;
      }

      setLoading((prevLoading) => ({ ...prevLoading, loadingTable: false }));

      // Group by unique interface: InterfaceName + CorepointMonitor
      const byInterface = new Map();

      interfaceStatusData.forEach((item) => {
        const name = item.InterfaceName ?? item.interfaceName ?? '';
        const corepoint = item.CorepointMonitor ?? item.corepointMonitor ?? '';
        const normName = normalizeKeyPart(name);
        const normCorepoint = normalizeKeyPart(corepoint);
        // Skip if we don't have a meaningful interface name
        if (!normName) return;
        const key = `${normName}|${normCorepoint}`;

        if (!byInterface.has(key)) {
          byInterface.set(key, {
            hasConnected: false,
            hasConnecting: false,
            hasWaiting: false,
            hasNotConnected: false,
            hasSimulated: false,
            hasStopped: false,
            hasQueueDepthNonZero: false,
          });
        }

        const agg = byInterface.get(key);
        const statusRaw = (item.ConnectionStatus ?? item.connectionStatus ?? '').toString().trim().toLowerCase();
        const qd = Number(item.QueueDepth ?? item.queueDepth ?? 0);

        if (!Number.isNaN(qd) && qd > 0) {
          agg.hasQueueDepthNonZero = true;
        }

        // Normalize common statuses
        switch (statusRaw) {
          case 'connected':
            agg.hasConnected = true; break;
          case 'connecting':
            agg.hasConnecting = true; break;
          case 'waiting for reply':
            agg.hasWaiting = true; break;
          case 'not connected':
            agg.hasNotConnected = true; break;
          case 'simulated':
            agg.hasSimulated = true; break;
          case 'stopped':
            agg.hasStopped = true; break;
          default:
           
            break;
        }
      });

      let counts = {
        Connected: 0,
        Connecting: 0,
        "Not Connected": 0,
        "Waiting For Reply": 0,
        Simulated: 0,
        QueueDepthNotZero: 0,
        Stopped: 0,
      };

      const categoryByKey = {};
      byInterface.forEach((agg, key) => {
        if (agg.hasConnected) counts['Connected'] += 1;
        if (agg.hasConnecting) counts['Connecting'] += 1;
        if (agg.hasNotConnected) counts['Not Connected'] += 1;
        if (agg.hasWaiting) counts['Waiting For Reply'] += 1;
        if (agg.hasSimulated) counts['Simulated'] += 1;
        if (agg.hasQueueDepthNonZero) counts['QueueDepthNotZero'] += 1;
        if (agg.hasStopped) counts['Stopped'] += 1;

        // Keep precedence-based category for the key mapping
        let category = null;
        if (agg.hasStopped) category = 'Stopped';
        else if (agg.hasQueueDepthNonZero) category = 'QueueDepthNotZero';
        else if (agg.hasSimulated) category = 'Simulated';
        else if (agg.hasWaiting) category = 'Waiting For Reply';
        else if (agg.hasNotConnected) category = 'Not Connected';
        else if (agg.hasConnecting) category = 'Connecting';
        else if (agg.hasConnected) category = 'Connected';

        if (category) {
          categoryByKey[key] = category;
        }
      });

      setInterfaceStatusMetric(counts);
      setInterfaceCategoryByKey(categoryByKey);
    }

    return (
        <>
        <Box sx={{ minHeight: "100vh", bgcolor: "#FFFFFF" }}>
            <Paper
                elevation={0}
                sx={{
                    borderBottom: "1px solid #E6E8EE",
                    height: { xs: 40, sm: 48 },
                    px: { xs: 1, sm: 2 },
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    bgcolor: "#fff",
                }}
            >
                <Typography sx={{ fontSize: { xs: 11, sm: 12, md: 13 }, fontWeight: 800, color: "#111827" }}>
                    {Object.keys(queryParams).length > 0 ? queryParams["Name"].toUpperCase() : ""}
                </Typography>
                <Box sx={{ flex: 1 }} />
                <Button
                  variant="contained"
                  onClick={fetchValidationReport}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 700,
                    borderRadius: 1.5,
                    backgroundColor: '#00338e',
                    '&:hover': { backgroundColor: '#00296f' }
                  }}
                >
                  Generate Latest Report
                </Button>
            </Paper>

            <Box sx={{ px: { xs: 1, sm: 2 }, py: 2 }}>
                <Typography sx={{ fontSize: { xs: 12, sm: 13, md: 14 }, fontWeight: 800, color: "#111827", mb: 2 }}>
                    Overview
                </Typography>

                <Grid container spacing={2} sx={{ mb: 2 }}>
                    <Grid item xs={12} md={4}>
                      <Autocomplete
                        size="small"
                        multiple
                        disableCloseOnSelect
                        options={interfaceNameOptions}
                        value={selectedInterfaceNames}
                        onChange={(e, v) => setSelectedInterfaceNames(v)}
                        renderOption={(props, opt) => {
                          const selected = selectedInterfaceNames.includes(opt);
                          return (
                            <Box {...props} key={opt} sx={{ py: 0.5, px: 1.5, bgcolor: selected ? 'rgba(0, 51, 142, 0.08)' : 'transparent',
                              borderLeft: selected ? '3px solid #00338e' : '3px solid transparent', '&:hover': { bgcolor: selected ? 'rgba(0, 51, 142, 0.12)' : 'rgba(0,0,0,0.04)' } }}>
                              <Typography variant="body2" sx={{ fontSize: { xs: 12, sm: 13 }, fontWeight: selected ? 600 : 400 }}>{opt}</Typography>
                            </Box>
                          );
                        }}
                        renderTags={(value, getTagProps) => {
                          const numTags = value.length;
                          return (
                            <>
                              {value.slice(0, 1).map((opt, idx) => (
                                <Chip {...getTagProps({ index: idx })} key={idx} label={opt} size="small" 
                                  sx={{ height: 24, fontSize: { xs: 11, sm: 12 }, backgroundColor: "#fff", border: "1px solid #E0E0E0", maxWidth: 120, '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }} />
                              ))}
                              {numTags > 1 && (
                                <Typography sx={{ fontSize: { xs: 11, sm: 12 }, color: '#1976d2', ml: 0.5, fontWeight: 500 }}>+{numTags - 1} more</Typography>
                              )}
                            </>
                          );
                        }}
                        renderInput={(params) => (
                          <TextField 
                            {...params} 
                            variant="standard" 
                            placeholder={selectedInterfaceNames.length === 0 ? "Filter by Interface Name" : ""} 
                            InputProps={{
                              ...params.InputProps,
                              disableUnderline: true,
                              sx: { fontSize: { xs: 11, sm: 12 } }
                            }}
                          />
                        )}
                        sx={{ 
                          width: '100%',
                          backgroundColor: "rgba(255,255,255,0.8)",
                          borderRadius: "4px",
                          px: 0.75,
                          py: 0.15,
                          border: "1px solid #E6E8EB",
                          '& .MuiAutocomplete-inputRoot': { 
                            flexWrap: 'nowrap',
                            minHeight: 32,
                          }
                        }}
                        ListboxProps={{ sx: { maxHeight: 280 } }}
                      />
                    </Grid>

                    <Grid item xs={12} md={4}>
                      <Autocomplete
                        size="small"
                        multiple
                        disableCloseOnSelect
                        options={connectionStatusOptions}
                        value={selectedConnectionStatuses}
                        onChange={(e, v) => setSelectedConnectionStatuses(v)}
                        renderOption={(props, opt) => {
                          const selected = selectedConnectionStatuses.includes(opt);
                          const count = interfaceStatusMetric[opt] || 0;
                          return (
                            <Box {...props} key={opt} sx={{ py: 0.5, px: 1.5, bgcolor: selected ? 'rgba(0, 51, 142, 0.08)' : 'transparent',
                              borderLeft: selected ? '3px solid #00338e' : '3px solid transparent', '&:hover': { bgcolor: selected ? 'rgba(0, 51, 142, 0.12)' : 'rgba(0,0,0,0.04)' } }}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                <Typography variant="body2" sx={{ fontSize: { xs: 12, sm: 13 }, fontWeight: selected ? 600 : 400 }}>{opt}</Typography>
                                <Chip size="small" label={count} sx={{ height: 20, minWidth: 28, fontSize: 11, bgcolor: (opt === 'Stopped' || opt === 'Not Connected') ? '#FFEBEE' : '#E8F5E9', color: (opt === 'Stopped' || opt === 'Not Connected') ? '#C62828' : '#2E7D32' }} />
                              </Box>
                            </Box>
                          );
                        }}
                        renderTags={(value, getTagProps) => {
                          const numTags = value.length;
                          return (
                            <>
                              {value.slice(0, 2).map((opt, idx) => (
                                <Chip {...getTagProps({ index: idx })} key={idx} label={opt} size="small" 
                                  sx={{ height: 24, fontSize: { xs: 11, sm: 12 }, backgroundColor: "#fff", border: "1px solid #E0E0E0" }} />
                              ))}
                              {numTags > 2 && (
                                <Typography sx={{ fontSize: { xs: 11, sm: 12 }, color: '#1976d2', ml: 0.5, fontWeight: 500 }}>+{numTags - 2} more</Typography>
                              )}
                            </>
                          );
                        }}
                        renderInput={(params) => (
                          <TextField 
                            {...params} 
                            variant="standard" 
                            placeholder={selectedConnectionStatuses.length === 0 ? "Filter by Connection Status" : ""} 
                            InputProps={{
                              ...params.InputProps,
                              disableUnderline: true,
                              sx: { fontSize: { xs: 11, sm: 12 } }
                            }}
                          />
                        )}
                        sx={{ 
                          width: '100%',
                          backgroundColor: "rgba(255,255,255,0.8)",
                          borderRadius: "4px",
                          px: 0.75,
                          py: 0.15,
                          border: "1px solid #E6E8EB",
                          '& .MuiAutocomplete-inputRoot': { 
                            flexWrap: 'nowrap',
                            minHeight: 32,
                          }
                        }}
                        ListboxProps={{ sx: { maxHeight: 280 } }}
                      />
                    </Grid>

                    <Grid item xs={12} md={4}>
                      <TextField
                        size="small"
                        type="number"
                        value={queueDepthThreshold}
                        onChange={(e) => setQueueDepthThreshold(e.target.value)}
                        placeholder="Enter a value"
                        variant="standard"
                        InputProps={{
                          disableUnderline: true,
                          startAdornment: (
                            <Typography sx={{ fontSize: { xs: 11, sm: 12 }, color: '#6B7280', mr: 0.5, whiteSpace: 'nowrap' }}>
                              Queue Depth <Box component="span" sx={{ fontWeight: 1000 }}>&gt;</Box>
                            </Typography>
                          ),
                          sx: { fontSize: { xs: 11, sm: 12 } }
                        }}
                        sx={{ 
                          width: '100%',
                          backgroundColor: "rgba(255,255,255,0.8)",
                          borderRadius: "4px",
                          px: 0.75,
                          py: 0.15,
                          border: "1px solid #E6E8EB",
                          '& .MuiInputBase-root': { 
                            minHeight: 32,
                          },
                          '& input[type=number]': {
                            MozAppearance: 'textfield',
                          },
                          '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button': {
                            WebkitAppearance: 'none',
                            margin: 0,
                          }
                        }}
                      />
                    </Grid>
                </Grid>

                {/* Interface Status Table */}
                <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, overflow: "hidden" }}>
                    <Box sx={{ px: { xs: 1, sm: 2 }, py: 1.5 }}>
                        <Typography sx={{ fontSize: { xs: 11, sm: 12, md: 13 }, fontWeight: 800, color: "#111827" }}>Interface Status Details</Typography>
                    </Box>
                    <Divider sx={{ borderColor: "#E6E8EE" }} />
                    <Box sx={{ px: { xs: 1, sm: 2 }, py: 2 }}>
                        <InterfaceStatusTable />
                    </Box>
                </Paper>
            </Box>
        </Box>

        <Modal open={validationReportModal.open} onClose={closeValidationReportModal}>
          <Box
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: { xs: '96%', md: '90%' },
              maxWidth: '1440px',
              maxHeight: '90vh',
              bgcolor: '#FFFFFF',
              borderRadius: 2,
              boxShadow: 24,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1.5, borderBottom: '1px solid #E6E8EE' }}>
              <Box>
                <Typography sx={{ fontSize: { xs: 13, sm: 14, md: 16 }, fontWeight: 800, color: '#111827' }}>
                  Latest Interface Validation Report
                </Typography>
                <Typography sx={{ fontSize: { xs: 11, sm: 12 }, color: '#6B7280' }}>
                  {resolvedAppFamily ? `Application Family: ${resolvedAppFamily}` : 'Application Family unavailable'}
                </Typography>
              </Box>
              <Box sx={{ flex: 1 }} />
              <Tooltip title="Download CSV">
                <span>
                  <IconButton
                    onClick={downloadValidationReportCsv}
                    size="small"
                    disabled={validationReportModal.loading || !validationReportModal.data?.length}
                    sx={{ mr: 1 }}
                  >
                    <FileDownloadIcon />
                  </IconButton>
                </span>
              </Tooltip>
              <IconButton onClick={closeValidationReportModal} size="small">
                <CloseIcon />
              </IconButton>
            </Box>

            <Box sx={{ p: 2, overflow: 'auto' }}>
              {validationReportModal.error ? (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {validationReportModal.error}
                </Alert>
              ) : null}

              {!validationReportModal.loading && validationReportModal.exceptions && Object.keys(validationReportModal.exceptions).length > 0 ? (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  Partial exceptions were returned while fetching the latest interface validation data.
                </Alert>
              ) : null}

              <InterfaceStatusGridTable
                sourceData={validationReportModal.data}
                loadingTable={validationReportModal.loading}
                loadingMessage="Generating the latest interface validation report..."
              />
            </Box>
          </Box>
        </Modal>
    </>
    );
};

export default InterfaceStatus;
