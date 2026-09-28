import React, { useEffect, useMemo, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom';
import Grid from '@mui/material/Unstable_Grid2';
import { Checkbox, Modal, Card, CardContent, Typography, Box, Accordion, AccordionSummary, Tab, Tabs, AccordionDetails, Divider, Button, TextField, ButtonGroup, InputLabel, FormControl, Autocomplete, MenuItem, Select, IconButton, Chip, LinearProgress, ToggleButtonGroup, ToggleButton } from '@mui/material';
import { styled } from '@mui/material/styles';
import {useLocation} from 'react-router-dom'
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell,{ tableCellClasses } from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TablePagination from '@mui/material/TablePagination';
import CircularProgress from '@mui/material/CircularProgress';
import AreaLineChart from '../../shared/LineChart/AreaLineChart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import ReactSpeedometer from 'react-d3-speedometer/slim'
import Alert from '@mui/material/Alert';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import InfoOutlined from '@mui/icons-material/InfoOutlined'
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
dayjs.extend(utc)
import { BoltRounded, TroubleshootRounded, TryOutlined } from '@mui/icons-material';
import LineGraph from '../../shared/LineChart/LineChart';
import UpTimeIcon from '../../Static/Images/UpTime.svg'
import ServerStatusIcon from '../../Static/Images/ServerStatus.svg'
import PatchComplianceIcon from '../../Static/Images/PatchCompliance.svg'
import TagComplianceIcon from '../../Static/Images/TagCompliance.svg'
import RebootsIcon from '../../Static/Images/Reboots.svg'
import Tooltip from '@mui/material/Tooltip'; 
import ClearIcon from '@mui/icons-material/Clear'; 
import '../../../assets/css/fonts.css';
import {getUrl} from '../../../environment'
import LocationIcon from '../../Static/Images/LocationIcon.svg'
import CloseIcon from '@mui/icons-material/Close';
import { logPageVisit,startPageTracking,appInsights } from '../appInsights'; // Import the function
import {fetchServerPerformance_fromADX, fetchFileStorageMetrics_fromADX, fetchNetworkMetrics_fromADX, fetchLoadBalancerMetrics_fromADX, fetchAnalytics_fromADX, fetchPatternAnalysis_fromADX} from "../../shared/APIs/fetchAPIs"
import PatternInsightsPane from './PatternInsightsPane';
import { convertTimeToPreferredTZ, convertTimeToPreferredTZ_ToUtc,convertTimeToPreferredTZ_fromUtc } from '../../shared/Timestamp/PreferenceConversion';
import CircularProgress_Styled from '../../shared/UI Components/CircularProgress'

const BLADE_BORDER ='#E6E8EE';
const BLADE_TEXT_MUTED ="#6B7280"
const BLADE_GREEN ="#2E7D32";
const BLADE_ORANGE ="#d59a59"
const StyledCard = styled(Card)({
    width: '100%',
    boxShadow: '0px 3px 6px rgba(0, 0, 0, 0.16)',
    padding: 4,
    position: 'relative',
});


function ServerDrillDown({date,globalFilterChoice, globalFilterData, appInsights, hospitalInformation,preferredTZ,appNameFromBlade,isFileShare,preSelectedServer,preSelectedHostingType}){ //

    var [loading, setLoading] = useState({
        "serverCpuUtilization" : true,
        "serverMemoryUtilization": true,
        "serverDiskUtilization" : true,
        "serviceLogs" : true,
        "serverList" : true,
        "incidentLogs" : true,
        "serverStatus" : true, 
        "serverHungStatus" : true,
        "tagCompliance" : true,
        "serverFileshareUtilization" :true,
        "serverUptime" : true,
        "azureBackup": true,
        "patchCompliance" : true,
        "dcxPortWatcherData": true,
        "dcxPortDetails": true,
        "dcxGraphData":true,
        "rebootEvent" : true,
        "networkMetrics": true,
        "loadBalancerUtilization" : true

    });
    var navigate = useNavigate()
    var location = useLocation()
    var urlParams = new URLSearchParams(location.search)
    //var [date, setDate] = useState({})
    var [totalCapacity, setTotalCapacity] = useState({"C:":{}, "D:":{},"E:":{},"R:":{}, "L:":{},"T:":{}});
    var [freeSpace, setFreeSpace] = useState({"C:":{}, "D:":{},"E:":{},"R:":{}, "L:":{},"T:":{}});
    var [avgDiskReads, setAvgDiskReads]= useState({"C:":{}, "D:":{},"E:":{},"R:":{}, "L:":{},"T:":{}});
    var [avgDiskWrites, setAvgDiskWrites]= useState({"C:":{}, "D:":{},"E:":{},"R:":{}, "L:":{},"T:":{}});
    var [avgDiskReadBytes, setAvgDiskReadBytes]= useState({"C:":{}, "D:":{},"E:":{},"R:":{}, "L:":{},"T:":{}});
    var [avgDiskWriteBytes, setAvgDiskWriteBytes]= useState({"C:":{}, "D:":{},"E:":{},"R:":{}, "L:":{},"T:":{}});
    var [avgDiskLatency, setAvgDiskLatency]= useState({"C:":{}, "D:":{},"E:":{},"R:":{}, "L:":{},"T:":{}});
    var [serverCpuUtilization, setServerCpuUtilization] = useState({})
    var [serverMemoryUtilization, setServerMemoryUtilization] = useState({})
    var [serverDiskUtilization, setServerDiskUtilization] = useState({})
    var [serverCpuUtilizationAvg, setServerCpuUtilizationAvg] = useState(-1)
    var [serverMemoryUtilizationAvg, setServerMemoryUtilizationAvg] = useState(-1)
    var [serverDiskUtilizationAvg, setServerDiskUtilizationAvg] = useState(-1)
    var [serverCpuUtilizationGraphData, setServerCpuUtilizationGraphData] = useState({})
    var [serverMemoryUtilizationGraphData, setServerMemoryUtilizationGraphData] = useState({})
    var [fileShareGraphData, setFileShareGraphData] = useState({})
    var [selectedFileshares, setSelectedFileshares] = useState([]);
    var [serverDiskUtilizationGraphData, setServerDiskUtilizationGraphData] = useState({"C:":{}, "D:":{},"E:":{},"R:":{}, "L:":{},"T:":{}})
    var [errorApi, setErrorApi] = useState({
        "serverCpuUtilization":"", "serverMemoryUtilization":"", "serverDiskUtilization":"", "Tag Compliance":"","ServerStatus":"","serverUptime":"",  "patchCompliance": "", "azureBackup": "", "dcxServerStatus":"","dcxGraphData":"","RebootEvent":""
        ,"fileshareUtilization":"", "networkMetrics":""
    })
    var [serverUptime, setServerUptime] = useState({})
    var [serverFileshareUtilization, setServerFileshareUtilization] = useState({})

    var [serverFileshareUtilizationAvg, setServerFileshareUtilizationAvg] = useState({})
    var [networkMetrics, setNetworkMetrics] = useState({})
    var [networkMetricsGraphData, setNetworkMetricsGraphData] = useState({})
    var [selectedNetworkChart, setSelectedNetworkChart] = useState("packets")
    var [patchCompliance, setPatchCompliance] = useState({})
    var [azureBackup, setAzureBackup] = useState({})
    // var [tagCompliance, setTagCompliance] = useState({})
    var [tagComplianceData, setTagComplianceData] = useState({})
    var [tagComplianceDataCard, setTagComplianceDataCard] = useState(-1)
    var [diskDriveChoice, setDiskDriveChoice] = useState("C:")
    var [hostingTypeFilter, setHostingTypeFilter] = useState(preSelectedHostingType || "Cloud")
    var [serverNameFilter, setServerNameFilter] = useState(preSelectedServer ? [preSelectedServer] : [])
    // Track if we have pre-selected values to avoid overriding them
    var [hasPreSelection] = useState(Boolean(preSelectedServer || preSelectedHostingType))
    var [serverStatus, setServerStatus] = useState({})
    var [serverHungStatus, setServerHungStatus] = useState({})
    // Seasonal pattern insights side pane
    var [patternPaneOpen, setPatternPaneOpen] = useState(false)
    var [patternMetric, setPatternMetric] = useState("CPU")
    // Per-metric pattern availability probed once the in-scope servers are
    // known. Values: 'loading' while the probe is in-flight, 'available' when
    // ADX returned at least one pattern record, 'none' when there is nothing
    // to show. The Insights button is hidden entirely when the value is
    // 'none' so we never invite the user to open an empty pane.
    var [patternAvailability, setPatternAvailability] = useState({ CPU: 'loading', Memory: 'loading', Disk: 'loading' })
    var [modalOpen, setModalOpen] = useState(false);
    var [modalHeader, setModalHeader] = useState("");
    var [modalTableContent, setModalTableContent] = useState({ header: [], data: [] });
    var [autocompleteOptions, setAutocompleteOptions] = useState([]);
    var [portOptions,setPortOptions] = useState([]);
    var [originalTableData, setOriginalTableData] = useState([]); 
    var [selectedServer, setSelectedServer] = useState('');
    var {AppName} = location.state || {}
    var [data, setData] = useState({})
    var [serverName, setServerName] = useState("")
    var [appName, setAppName] = useState("")
    var [diskData, setDiskData] = useState([]);
    var [vmSkuDetails, setVmSkuDetails] = useState([]);
    var [errorMessage, setErrorMessage] = useState("");
    var [vmAverages, setVmAverages] = useState(null);
    var [barData,setBarData] = useState({ used: 0, provisioned: 0, fileshare: "" })
    const diskOptions = ["C:", "D:", "E:", "R:", "L:", "T:"]; 
    var [modalType, setModalType] = useState('');
    var [graphModalOpen,setGraphModalOpen] = useState(false);
    var [graphModalData,setGraphModalData] = useState(null);
    var [timeRange, setTimeRange] = useState(6);
    var[selectedFileshare,setSelectedFileshare]= useState("")
    const [selectedAccount, setSelectedAccount] = useState("");
    var [queryParams, setQueryParams] = useState({})
    var [modalFilter, setModalFilter] = useState("");
    var [selectedTab, setSelectedTab] = useState(0);
    const [selectedChart, setSelectedChart] = useState("utilization"); 
    const [entryTime, setEntryTime] = useState(null);

    // Load Balancer chart state
    const [loadBalancerMetrics, setLoadBalancerMetrics] = useState(null);
    const [loadBalancerChoice, setLoadBalancerChoice] = useState("");

    // Warning state for CPU/Memory/Disk servers above 95% threshold
    const WARNING_THRESHOLD = 95;
    const [cpuWarningServers, setCpuWarningServers] = useState([]);
    const [memoryWarningServers, setMemoryWarningServers] = useState([]);
    const [diskWarningServers, setDiskWarningServers] = useState({});
    const [drivesWithWarnings, setDrivesWithWarnings] = useState([]);
    
    // Warning chip selection states
    const [cpuWarningSelected, setCpuWarningSelected] = useState(true);
    const [memoryWarningSelected, setMemoryWarningSelected] = useState(true);
    const [diskWarningSelected, setDiskWarningSelected] = useState(true);

    // Helper: Map a server name to its HostingType from serverStatus
    const getHostingTypeForServer = (name) => {
        if (!name || !serverStatus?.ServerName) return null;
        const nameLower = name.toLowerCase();
        for (const key of Object.keys(serverStatus["ServerName"])) {
            const ssName = serverStatus["ServerName"][key];
            if (ssName.toLowerCase() === nameLower || ssName.toLowerCase().includes(nameLower) || nameLower.includes(ssName.toLowerCase())) {
                return serverStatus["HostingType"]?.[key] || null;
            }
        }
        return null;
    };

    // Helper: Get latest value per server
    const getLatestPerServer = (utilData, hostingType) => {
        const latest = {};
        Object.keys(utilData["ServerName"] || {}).forEach((i) => {
            const name = utilData["ServerName"][i];
            const time = new Date(utilData["TimeGenerated"][i]);
            if (utilData["HostingType"][i] === hostingType && (!latest[name] || new Date(latest[name].time) < time)) {
                latest[name] = { time: utilData["TimeGenerated"][i], value: utilData["AvgValue"][i] };
            }
        });
        return latest;
    };

    // Helper: Get warnings (>=95%) and highest server from latest data
    const getTargetServers = (latestData) => {
        const entries = Object.entries(latestData).sort((a, b) => b[1].value - a[1].value);
        if (entries.length === 0) return { warnings: [], highest: null };
        return {
            highest: { name: entries[0][0], value: entries[0][1].value },
            warnings: entries.filter(([_, v]) => v.value >= WARNING_THRESHOLD).map(([name, v]) => ({ name, value: v.value }))
        };
    };

    // Helper: Compute allowed servers based on warning selection and filter
    const computeAllowedServers = (warnings, highest, warningSelected, filterNames) => {
        const warningNames = warnings.map(w => w.name.toLowerCase());
        const filterLower = filterNames.map(x => x.toLowerCase());
        if (warningSelected && warnings.length > 0) return [...new Set([...warningNames, ...filterLower])];
        if (filterLower.length > 0) return filterLower;
        return highest ? [highest.name.toLowerCase()] : [];
    };

    // Returns true if any CPU/Memory/Disk server in the given hosting type is >= WARNING_THRESHOLD
    const hostingTypeHasWarning = (ht) => [serverCpuUtilization, serverMemoryUtilization, serverDiskUtilization].some(u =>
        u?.AvgValue && Object.keys(u.ServerName || {}).some(i => u.HostingType?.[i] === ht && u.AvgValue[i] >= WARNING_THRESHOLD)
    );

    // Process Details chip surfaces when a metric has any server above this
    // (lower) threshold, independent of the 95% warning logic.
    const PROCESS_THRESHOLD = 80;
    // TEMP: always show the Process Details chip so we can validate the endpoint
    // for every server regardless of utilization. Restore the threshold check
    // below once data is confirmed working.
    const hasUtilAboveProcessThreshold = (utilData) => true;
    // const hasUtilAboveProcessThreshold = (utilData) =>
    //     !!(utilData?.AvgValue) &&
    //     Object.values(getLatestPerServer(utilData, hostingTypeFilter)).some(v => v.value >= PROCESS_THRESHOLD);


    // Reusable Warning Chip component
    const WarningChip = ({ tooltipText, isSelected, onClick }) => (
        <Tooltip title={tooltipText}>
            <Chip label="Warning" size="small" onClick={onClick}
                sx={{ 
                    bgcolor: isSelected ? '#D97706' : '#FEF3C7', 
                    color: isSelected ? '#FFFFFF' : '#D97706', 
                    fontWeight: 600, fontSize: 10, height: 20, cursor: 'pointer',
                    '& .MuiChip-label': { px: 1 },
                    '&:hover': { bgcolor: isSelected ? '#B45309' : '#FDE68A' }
                }} 
            />
        </Tooltip>
    );

    // Per-process CPU/Memory breakdown (shown alongside the Warning chip).
    var [processMetrics, setProcessMetrics] = useState({})
    var [loadingProcessMetrics, setLoadingProcessMetrics] = useState(false)
    var [processModalOpen, setProcessModalOpen] = useState(false)
    var [processModalMetric, setProcessModalMetric] = useState("cpu")
    var [processServerFilter, setProcessServerFilter] = useState(null)
    var [processViewMode, setProcessViewMode] = useState("table")
    var [processPage, setProcessPage] = useState(0)
    var [processRowsPerPage, setProcessRowsPerPage] = useState(10)

    var openProcessModal = (metric) => {
        setProcessModalMetric(metric);
        setProcessModalOpen(true);
        setProcessPage(0);
        // Fetch on demand if we don't already have data for this metric.
        if (!processMetrics || !processMetrics["ProcessName"]) {
            fetchServerProcessMetrics();
        }
    };

    // Distinct server names present in the fetched process metrics.
    var getProcessServerOptions = () => {
        if (!processMetrics || !processMetrics["ServerName"]) return [];
        return Array.from(new Set(Object.values(processMetrics["ServerName"])));
    };

    // Aggregate raw process metrics into per-process rows (avg value) for the
    // chosen metric ("cpu" | "memory"), highest first.
    var getProcessRows = (metric) => {
        if (!processMetrics || !processMetrics["ProcessName"]) return [];
        var agg = {};
        Object.keys(processMetrics["ProcessName"]).forEach((key) => {
            if (processMetrics["ObjectName"][key] !== metric) return;
            var server = processMetrics["ServerName"][key];
            if (processServerFilter && server !== processServerFilter) return;
            var proc = processMetrics["ProcessName"][key];
            var rowKey = server + "|" + proc;
            if (!agg[rowKey]) agg[rowKey] = { server, proc, sum: 0, count: 0 };
            agg[rowKey].sum += Number(processMetrics["AvgValue"][key]) || 0;
            agg[rowKey].count += 1;
        });
        return Object.values(agg)
            .map((r) => ({ "Server": r.server, "Process": r.proc, "Avg Value": (r.sum / r.count).toFixed(2) }))
            .sort((a, b) => Number(b["Avg Value"]) - Number(a["Avg Value"]));
    };

    // Color palette used for the stacked-bar process segments.
    const PROCESS_COLORS = ['#00338E', '#2E7D32', '#D97706', '#8E24AA', '#0288D1', '#C62828', '#00897B', '#5E35B1',
        '#F9A825', '#3949AB', '#43A047', '#E64A19', '#6D4C41', '#546E7A', '#AD1457'];

    // Build stacked-bar data for the chosen metric: one row per server, each
    // process contributing a segment. Processes beyond the top N (by total avg
    // across servers) are grouped into "Others" to keep the legend readable.
    var getProcessChartData = (metric) => {
        var rows = getProcessRows(metric); // already filtered by server + sorted
        if (rows.length === 0) return { data: [], processKeys: [] };
        // Rank processes by total value across all servers.
        var procTotals = {};
        rows.forEach((r) => { procTotals[r.Process] = (procTotals[r.Process] || 0) + Number(r["Avg Value"]); });
        var topProcs = Object.entries(procTotals).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([p]) => p);
        var topSet = new Set(topProcs);
        var hasOthers = Object.keys(procTotals).length > topProcs.length;
        // Aggregate into { server: { proc: value } }.
        var byServer = {};
        rows.forEach((r) => {
            if (!byServer[r.Server]) byServer[r.Server] = { Server: r.Server };
            var key = topSet.has(r.Process) ? r.Process : 'Others';
            byServer[r.Server][key] = (byServer[r.Server][key] || 0) + Number(r["Avg Value"]);
        });
        var processKeys = hasOthers ? [...topProcs, 'Others'] : topProcs;
        // Sort servers by total (highest first).
        var data = Object.values(byServer).sort((a, b) => {
            var ta = processKeys.reduce((s, k) => s + (a[k] || 0), 0);
            var tb = processKeys.reduce((s, k) => s + (b[k] || 0), 0);
            return tb - ta;
        });
        return { data, processKeys };
    };

    // Chip that surfaces the per-process breakdown next to a metric graph.
    const ProcessDetailsChip = ({ metric }) => (
        <Tooltip title={`View per-process ${metric === 'cpu' ? 'CPU' : 'Memory'} breakdown`}>
            <Chip label="Process Details" size="small" onClick={() => openProcessModal(metric)}
                sx={{ bgcolor: '#EEF3FC', color: '#00338E', fontWeight: 600, fontSize: 10, height: 20, cursor: 'pointer',
                    '& .MuiChip-label': { px: 1 }, '&:hover': { bgcolor: '#DCE6F9' } }} />
        </Tooltip>
    );
    
    var gradientColors = {
        1: 'linear-gradient(135deg,rgb(255, 132, 0) 0%,rgb(234, 146, 39) 100%)', 
        2: 'linear-gradient(135deg, #F59E0B 0%, #FBBF24 100%)',
        3: 'linear-gradient(135deg, #10B981 0%, #34D399 100%)',
        0: 'linear-gradient(135deg, #DC2626 0%,rgb(233, 96, 96) 80%)'  
      };

    var [dcxFullServerDetailsData, setDcxFullServerDetailsData] = useState({});
    const [criticalDcxServers, setCriticalDcxServers] = useState([]);
    const [warningDcxServers, setWarningDcxServers] = useState([]);
    const [okayDcxServers, setOkayDcxServers] = useState([]);

    const [criticalDcxServersCount, setCriticalDcxServersCount] = useState();
    const [warningDcxServersCount, setWarningDcxServersCount] = useState();
    const [okayDcxServersCount,setOkayDcxServersCount] = useState();
    const [dcxLocationsDown,setDcxLocationsDown] = useState([]);
    const [dcxLocationsDownCount, setDcxLocationsDownCount] = useState();

    const [dcxWarningServersPortData, setDcxWarningServersPortData] = useState({})
    const [dcxCriticalServersPortData, setDcxCriticalServersPortData] = useState({})
    const [dcxOkayServersPortData, setDcxOkayServersPortData] = useState({})

    const [selectedPort,setSelectedPort] = useState("")
    const [selectedDcxServer,setSelectedDcxServer] = useState("")
    const [dcxServersGraphData, setdcxServersGraphData] = useState({})

    var [descriptionOptions, setDescriptionOptions] = useState([])
    var [rebootEvent, setRebootEvent] = useState({})
    const [rebootEventCard, setRebootEventCard] = useState({
            "Graceful":-1, 
            "Crash":-1
        })
    const [networkMetricsAccordionExpanded, setNetworkMetricsAccordionExpanded] = useState(false)
    const networkMetricsRef = useRef(null)

    var fetchVmRebootsData = async(aggregate) => { 
        setLoading(prevLoading=>({
            ...prevLoading,
            "rebootEvent" : true
        }));
        setRebootEvent({})
        setRebootEventCard({
            "Graceful":-1, 
            "Crash":-1
        })
        var params = {
            "aggregate": aggregate,
            "filters": "",
            "serverName":serverName,
            "start_time": date.startDate,
            "end_time": date.endDate
        };
        console.log("Fetching VM Reboot Data with ServerName:", serverName);
        var url = new URL(baseUrl+ 'VMRebootLogs');
        fetch(url,{
            method:'POST',
            headers: {
            'Content-Type': 'application/json',
            },
            body: JSON.stringify(params)
        })
        .then((response) => response.json())
        .then((data) =>{ 
        //console.log(JSON.parse(data["vmRebootEvents"]))
            if(Object.keys(JSON.parse(data["vmRebootEvents"])).length>0){
                setRebootEvent(convertTimeToPreferredTZ(JSON.parse(data["vmRebootEvents"])))
            }
            setLoading(prevLoading=>({
                ...prevLoading,
                "rebootEvent" : false
            }));
        })
        .catch((error) =>{ 
            setRebootEvent({
                "ServerName" : {}
            })
            setErrorApi((prevState)=>({
                ...prevState,
                "RebootEvent" : "API didnt load"
            }))
            setLoading(prevLoading=>({
                ...prevLoading,
                "rebootEvent" : false
            })); 
            console.error('Error:', error)
        });
    };

    // Fetches per-process CPU & Memory for the in-scope server(s).
    // Backend endpoint returns { "ServerProcessMetrics": <json string> }.
    var fetchServerProcessMetrics = async() => {
        setProcessMetrics({})
        setLoadingProcessMetrics(true)
        var params = {
            "serverName": serverName,
            "start_time": date.startDate,
            "end_time": date.endDate
        };
        var url = new URL(baseUrl + 'serverProcessMetrics');
        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        })
        .then((response) => response.json())
        .then((data) => {
            console.log("ServerProcessMetrics raw response:", data);
            var raw = data && data["ServerProcessMetrics"];
            var parsed = {};
            try {
                parsed = typeof raw === "string" ? JSON.parse(raw) : (raw || {});
            } catch (e) {
                console.error("Failed to parse ServerProcessMetrics:", e);
                parsed = {};
            }
            console.log("ServerProcessMetrics parsed:", parsed);
            if (parsed && parsed["ProcessName"] && Object.keys(parsed["ProcessName"]).length > 0) {
                setProcessMetrics(convertTimeToPreferredTZ(parsed))
            }
            else {
                setProcessMetrics({ "ServerName": {} })
            }
            setLoadingProcessMetrics(false)
        })
        .catch((error) => {
            setProcessMetrics({ "ServerName": {} })
            setLoadingProcessMetrics(false)
            console.error('Error fetching process metrics:', error)
        });
    };

    useEffect(()=>{
        if(Object.keys(rebootEvent).length>0){
            if(Object.keys(rebootEvent["ServerName"]).length>0){
                let gracefulCount = 0;
                let crashCount = 0;
                Object.keys(rebootEvent["ServerName"]).forEach((key) => {
                    const serverName = rebootEvent["ServerName"][key];
                    if (getHostingTypeForServer(serverName) === hostingTypeFilter) {
                        if (rebootEvent["RebootType"][key] === "Graceful") gracefulCount++;
                        if (rebootEvent["RebootType"][key] === "Crash") crashCount++;
                    }
                });
                setRebootEventCard({
                    "Graceful" : gracefulCount,
                    "Crash" : crashCount
                })
            }
            else{
                setRebootEventCard({
                    "Graceful" : "NA",
                    "Crash" : "NA"
                })
            }
        }
    },[rebootEvent, hostingTypeFilter, serverStatus])

    // useEffect(() => {
    //     console.log("Critical Servers (in useEffect):", criticalDcxServers);
    //     console.log("Critical Count (in useEffect):", criticalDcxServersCount);
    
    //     console.log("Warning Servers (in useEffect):", warningDcxServers);
    //     console.log("Warning Count (in useEffect):", warningDcxServersCount);
    
    //     console.log("Okay Servers (in useEffect):", okayDcxServers);
    //     console.log("Okay Count (in useEffect):", okayDcxServersCount);
    
    //     console.log("DCX Locations Down (in useEffect):", dcxLocationsDown);
    //     console.log("DCX Locations Down Count (in useEffect):", dcxLocationsDownCount);

    //     console.log("Okay Ports details (in useEffect):", dcxOkayServersPortData);
    //     console.log("Warning Ports Details (in useEffect):", dcxWarningServersPortData);
    //     console.log("Critical Ports Details (in useEffect):", dcxCriticalServersPortData);
    // }, [
    //     criticalDcxServers,
    //     warningDcxServers,
    //     okayDcxServers,
    //     criticalDcxServersCount,
    //     warningDcxServersCount,
    //     okayDcxServersCount,
    //     dcxLocationsDown,
    //     dcxLocationsDownCount,
    //     dcxOkayServersPortData,
    //     dcxCriticalServersPortData,
    //     dcxWarningServersPortData
    // ]);

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

    useEffect(()=>{
        if(Object.keys(globalFilterData).length>0){
            var isFileshare = isFileShare || urlParams.get("IsFileShare")?.toString() || "no"
            if(isFileshare==="yes"){
                window.scrollTo({
                    top: document.documentElement.scrollHeight,
                    behavior: 'smooth' // Optional for a smooth scroll
                  });
            }
            else{
                window.scrollTo(0,0)
            }
            
            console.log(location.pathname+location.search)
            var nameOfResource = urlParams.get("Name")?.toString() || ""
            var typeOfResource = urlParams.get("Type")?.toString() || ""
            console.log("Resource:", nameOfResource, typeOfResource)
                console.log("Blade View", appNameFromBlade)
                setQueryParams({
                    "Name":appNameFromBlade,
                    "Type":"Application CI"
                })

                console.log("Resource:", nameOfResource, typeOfResource)
                var serverName=""
                var hostingType = []

                Object.keys(globalFilterData["AppCI"]).map((k)=>{
                    if(globalFilterData["AppCI"][k].toUpperCase()===appNameFromBlade.toUpperCase()){
                        serverName = serverName+ "'"+globalFilterData["ServerName"][k]+ "',"
                        hostingType.push(globalFilterData["ServerHostingType"][k])
                    }
                })

                setLoading(prevLoading=>({
                    ...prevLoading,
                    "serverStatus" : false
                }))

                // Only set hosting type if no pre-selection was provided
                if (!hasPreSelection) {
                    setHostingTypeFilter([...new Set(hostingType)].includes("Cloud")?"Cloud":"OnPremise")
                }
                
                serverName = serverName.slice(0,-1)
                setServerName(serverName)

           
        }
    },[location.pathname+location.search, globalFilterData,appNameFromBlade])

    // Auto-expand and scroll to Network Metrics accordion when isNetworkMetrics=true
    useEffect(() => {
        const isNetworkMetricsParam = urlParams.get("isNetworkMetrics")?.toString() === "true";
        if (isNetworkMetricsParam) {
            setNetworkMetricsAccordionExpanded(true);
            // Scroll to the Network Metrics section after a short delay to ensure DOM is ready
            setTimeout(() => {
                if (networkMetricsRef.current) {
                    networkMetricsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 500);
        }
    }, [location.search]);

    // Map chart types to data
    const chartDataMap = {
        utilization: serverDiskUtilizationGraphData,
        reads: avgDiskReads,
        writes: avgDiskWrites,
        readBytes: avgDiskReadBytes,
        writeBytes: avgDiskWriteBytes,
        latency: avgDiskLatency,
    };

    // Determine if any additional data exists
    const hasAdditionalData = Object.values(chartDataMap).some(
        (data, key) => key !== "utilization" && data && Object.keys(data).length > 0
    );

    // Handle chart selection
    const handleChartChange = (event) => {
        setSelectedChart(event.target.value);
    };
    // Handle network chart selection
    const handleNetworkChartChange = (event) => {
        const newValue = event.target.value;  
        setSelectedNetworkChart(newValue);
    };

    useEffect(() => {
        if (selectedFileshares.length > 0 && Object.keys(serverFileshareUtilization).length > 1) {
            createGraphData_FileShare(selectedFileshares);
        }
    }, [serverFileshareUtilization, selectedFileshares]);

    useEffect(() => {
        if (serverFileshareUtilizationAvg && Object.keys(serverFileshareUtilizationAvg).length > 0) {
            console.log("Server Fileshare Utilization Avg:", serverFileshareUtilizationAvg);
            setLoading((prevLoading) => ({
                ...prevLoading,
                "fileshareUtilization": false,
            }));
        
            if (!selectedAccount) {
                setSelectedFileshares(getAllFileshares());
            }
        }
    }, [serverFileshareUtilizationAvg, selectedAccount]);
    
    var getAllStorageAccounts = () => {
        return serverFileshareUtilizationAvg
            ? Array.from(new Set(Object.values(serverFileshareUtilizationAvg["StorageAccountName"] || [])))
            : [];
    };

    var getAllFileshares = () => {
        console.log(serverFileshareUtilizationAvg)
        if (!serverFileshareUtilizationAvg) return [];
        return Object.entries(serverFileshareUtilizationAvg["Fileshare"] || {}).map(
            ([index, fileshare]) =>
            `${serverFileshareUtilizationAvg["StorageAccountName"][index]}/${fileshare}`
        );  
    };
    
    var getFilesharesForAccount = (account) => {
        if (!serverFileshareUtilizationAvg) return [];
        if (!account) return getAllFileshares();
        
        return Object.entries(serverFileshareUtilizationAvg["StorageAccountName"] || {})
            .filter(([index, acc]) => acc === account)
            .map(([index]) =>
            `${serverFileshareUtilizationAvg["StorageAccountName"][index]}/${serverFileshareUtilizationAvg["Fileshare"][index]}`
        );
    };

    const GraphModal = ({ timeRange, setTimeRange }) => {
        if (!graphModalOpen || !graphModalData) return null;
        
        const { Port, "Server Name": serverName } = graphModalData;
        const graphArray = dcxServersGraphData?.[serverName] || [];
        const sortedGraphArray = [...graphArray].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const packetTimestamps = sortedGraphArray.map((d) => d.timestamp);
        const packetCounts = sortedGraphArray.map((d) => d.packetCount);
        const medianLine = sortedGraphArray.map((d) => d.median);
        
        const handleTimeChange = (event) => {
            setTimeRange(event.target.value);
        };
        
        return (
            <Modal open={graphModalOpen} onClose={() => setGraphModalOpen(false)}>
                <Box
                    sx={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    width: "90vw",
                    minHeight: 600,
                    maxWidth: 1600,
                    bgcolor: "#fafafa",
                    borderRadius: "16px",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                    p: 4,
                    pt: 3,
                    outline: "none",
                    }}
                >
                    <IconButton
                    onClick={() => setGraphModalOpen(false)}
                    sx={{ position: "absolute", top: 12, right: 12, color: "#6B7280" }}
                    >
                    <CloseIcon />
                    </IconButton>
            
                    <Grid container alignItems="center" justifyContent="space-between" mb={2}>
                    <Grid item xs={12} md={4}>
                        <FormControl
                        size="small"
                        fullWidth
                        sx={{
                            backgroundColor: "#fff",
                            borderRadius: 1,
                            "& .MuiOutlinedInput-root": {
                            height: 38,
                            },
                        }}
                        >
                        <InputLabel id="time-range-label">Time Range</InputLabel>
                        <Select
                            labelId="time-range-label"
                            value={timeRange}
                            label="Time Range"
                            onChange={handleTimeChange}
                            sx={{ fontSize: 14 }}
                        >
                            <MenuItem value={6}>Last 6 hours</MenuItem>
                            <MenuItem value={12}>Last 12 hours</MenuItem>
                            <MenuItem value={24}>Last 24 hours</MenuItem>
                            <MenuItem value={48}>Last 48 hours</MenuItem>
                            <MenuItem value={120}>Last 5 days</MenuItem>
                            <MenuItem value={168}>Last 7 days</MenuItem>
                        </Select>
                        </FormControl>
                    </Grid>
            
                    <Grid item xs={12} md={8}>
                        <Typography
                        align="left"
                        sx={{
                            fontWeight: 600,
                            fontSize: { xs: 16, sm: 20 },
                            color: "#1F2937",
                            pl: 2, 
                        }}
                        >
                        Port Number: {Port} &nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp; Server: {serverName}
                        </Typography>
                    </Grid>
                    </Grid>
                    <Box
                    sx={{
                        width: "100%",
                        minHeight: 300,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        pb: 0.5,
                    }}
                    >
                    {loading["dcxGraphData"] ? (
                        <CircularProgress sx={{ "& .MuiCircularProgress-circle": { strokeWidth: "2px" } }} />
                    ) : (
                        <LineGraph
                        dataX={packetTimestamps}
                        dataY={[packetCounts, medianLine]}
                        labelx="Packet Count"
                        labely="Median"
                        timeRange= {timeRange}
                        />
                    )}
                    </Box>
                </Box>
            </Modal>
        );
    };

    var getCapacityForFileshare = (uniqueFileshare) => {
    if (!serverFileshareUtilization) return { usedCapacity: 0, provisionedCapacity: 0 };
    
    const [storageAccount, fileshare] = uniqueFileshare.split("/");
    
    const index = Object.entries(serverFileshareUtilization["Fileshare"] || {}).findIndex(
        ([idx, fs]) => fs === fileshare && serverFileshareUtilization["StorageAccountName"][idx] === storageAccount
    );
    
    if (index >= 0) {
        return {
        usedCapacity: parseFloat(serverFileshareUtilization["Used Capacity (GiB)"]?.[index] || 0),
        provisionedCapacity: parseFloat(serverFileshareUtilization["Provisioned Capacity (GiB)"]?.[index] || 0),
        };
    }
    return { usedCapacity: 0, provisionedCapacity: 0 };
    };
     
    var handleAccountChange = (account) => {
    setSelectedAccount(account);
    setSelectedFileshares(getFilesharesForAccount(account));
    };
    
    var baseUrl = getUrl()

    useEffect(()=>{
        var nameOfResource = urlParams.get("Name").toString()
        console.log("Resource:", nameOfResource, "In Global Filter Choice",globalFilterChoice, Object.keys(queryParams).length)
        if(Object.keys(queryParams).length && globalFilterChoice && "ResourceName" in globalFilterChoice && nameOfResource.toLowerCase()!=globalFilterChoice["ResourceName"].toLowerCase()){
            console.log("In Global Filter Choice Filter")
            getRegionWiseData_GlobalFilter()
        }
        setSelectedTab(0)
    },[globalFilterChoice])

    useEffect(()=>{
        if(serverName!="" && Object.keys(queryParams).length > 0){
            var appName = queryParams["Type"]==="VM" ? queryParams["ApplicationCI"] : queryParams["Name"]         
            if (appName?.toUpperCase() === "DEVICECONX-PHS") {
                fetchDCXPortWatcherServerHealthData(serverName); 
            }
            
            fetchServerStatusData("yes", serverName)
            fetchServerHungStatusData("yes", serverName)
            getServerPerformanceData_fromADX("no", ["Cpu"])
            getServerPerformanceData_fromADX("no", ["Memory"])
            getServerPerformanceData_fromADX("no", ["Disk"]) 
            fetchServerProcessMetrics()
            getLoadBalancerPerformanceData_fromADX("no", ["VipAvailability","DipAvailability","ByteCount","PacketCount","SYNCount","SnatConnectionCount"]);            

            console.log("Calling Network Metrics APIs with serverName:", serverName);
            getNetworkMetricsData_fromADX("no", ["bytes_received_rate","bytes_sent_rate","packets_received_rate","packets_sent_rate","network_in_total","network_out_total"])
            // fetchCpuUtilizationData("no",serverName)
            // fetchMemoryUtilizationData("no",serverName)
            // fetchDiskUtilizationData("no",serverName)
            if(queryParams["Type"]!=="VM"){
                getFilesharePerformanceData_fromADX(true,["Storage"])
                getFilesharePerformanceData_fromADX(false,["Storage"])
            }
            // fetchFileshareUtilizationData("no",appName)
            // fetchFileshareUtilizationData("yes",appName)

            fetchTagComplianceData(serverName)
            fetchPatchComplianceData(serverName)
        }
        if(serverName.length>0 && date["startDate"]!="" && Object.keys(queryParams).length>0){
            fetchVmRebootsData("no")
        }
        else if(Object.keys(queryParams).length>0){
            setRebootEventCard((prevStatus)=>({
                ...prevStatus,
                "Graceful":"NA",
                "Crash":"NA"
            }))
        }
    },[date, serverName, preferredTZ, queryParams])

    const sortedFileshares = [...selectedFileshares].sort((a, b) => {
        const { usedCapacity: usedA, provisionedCapacity: provA } = getCapacityForFileshare(a);
        const { usedCapacity: usedB, provisionedCapacity: provB } = getCapacityForFileshare(b);
        const utilizationA = provA > 0 ? (usedA / provA) * 100 : 0;
        const utilizationB = provB > 0 ? (usedB / provB) * 100 : 0;
        return utilizationB - utilizationA; // descending
    });

useEffect(() => {
   if (!serverCpuUtilization?.AvgValue) {
       if (serverCpuUtilization?.ServerName) { setServerCpuUtilizationAvg("NA"); setCpuWarningServers([]); }
       return;
   }
   const latestData = getLatestPerServer(serverCpuUtilization, hostingTypeFilter);
   const values = Object.values(latestData);
   setServerCpuUtilizationAvg(values.length ? (values.reduce((a, b) => a + b.value, 0) / values.length).toFixed(2) : "NA");
   
   const { warnings, highest } = getTargetServers(latestData);
   setCpuWarningServers(warnings);
   
   const allowedServers = computeAllowedServers(warnings, highest, cpuWarningSelected, serverNameFilter);
   setServerCpuUtilizationGraphData(Object.values(createGraphData(serverCpuUtilization, "cpu", allowedServers, hostingTypeFilter)));
}, [serverCpuUtilization, serverNameFilter, hostingTypeFilter, cpuWarningSelected]);

    
useEffect(() => {
   if (!serverMemoryUtilization?.AvgValue) {
       if (serverMemoryUtilization?.ServerName) { setServerMemoryUtilizationAvg("NA"); setMemoryWarningServers([]); }
       return;
   }
   const latestData = getLatestPerServer(serverMemoryUtilization, hostingTypeFilter);
   const values = Object.values(latestData);
   setServerMemoryUtilizationAvg(values.length ? (values.reduce((a, b) => a + b.value, 0) / values.length).toFixed(2) : "NA");
   
   const { warnings, highest } = getTargetServers(latestData);
   setMemoryWarningServers(warnings);
   
   const allowedServers = computeAllowedServers(warnings, highest, memoryWarningSelected, serverNameFilter);
   setServerMemoryUtilizationGraphData(Object.values(createGraphData(serverMemoryUtilization, "memory", allowedServers, hostingTypeFilter)));
}, [serverMemoryUtilization, serverNameFilter, hostingTypeFilter, memoryWarningSelected]);

    useEffect(() => {
        if (Object.keys(networkMetrics).length > 0 && networkMetrics.ObjectName) {
            const bytesGraphData = createGraphData_Network(networkMetrics, ['bytes_sent_rate', 'bytes_received_rate'], serverNameFilter, hostingTypeFilter);
            const packetsGraphData = createGraphData_Network(networkMetrics, ['packets_sent_rate', 'packets_received_rate'], serverNameFilter, hostingTypeFilter);
            const networkTotalGraphData = createGraphData_Network(networkMetrics, ['network_in_total', 'network_out_total'], serverNameFilter, hostingTypeFilter);

            if (selectedNetworkChart === "bytes") {
                setNetworkMetricsGraphData(bytesGraphData);
            } else if (selectedNetworkChart === "packets") {
                setNetworkMetricsGraphData(packetsGraphData);
            } else if (selectedNetworkChart === "total") {
                setNetworkMetricsGraphData(networkTotalGraphData);
            }
        }
    }, [networkMetrics, serverNameFilter, hostingTypeFilter, selectedNetworkChart]);


    useEffect(() => {
        if (!serverDiskUtilization?.AvgValue || !serverDiskUtilization?.DriveName) {
            if (serverDiskUtilization?.ServerName) { setServerDiskUtilizationAvg("NA"); setDiskWarningServers({}); setDrivesWithWarnings([]); }
            return;
        }

        // Build latest data per server+drive
        const latestData = {};
        Object.keys(serverDiskUtilization.ServerName).forEach(i => {
            const key = `${serverDiskUtilization.ServerName[i]}|${serverDiskUtilization.DriveName[i]}`;
            const time = new Date(serverDiskUtilization.TimeGenerated[i]);
            if (serverDiskUtilization.HostingType[i] === hostingTypeFilter && (!latestData[key] || new Date(latestData[key].time) < time)) {
                latestData[key] = { server: serverDiskUtilization.ServerName[i], drive: serverDiskUtilization.DriveName[i], time, value: serverDiskUtilization.AvgValue[i] };
            }
        });

        const entries = Object.values(latestData);
        const driveOptions = ["C:", "D:", "E:", "R:", "L:", "T:"];
        
        // Group warnings by drive
        const warningsPerDrive = Object.fromEntries(driveOptions.map(d => [d, []]));
        entries.filter(e => e.value >= WARNING_THRESHOLD).forEach(e => warningsPerDrive[e.drive]?.push({ name: e.server, value: e.value }));
        Object.values(warningsPerDrive).forEach(arr => arr.sort((a, b) => b.value - a.value));
        
        setDiskWarningServers(warningsPerDrive);
        setDrivesWithWarnings(driveOptions.filter(d => warningsPerDrive[d].length > 0));

        // Determine servers to plot
        // Always pick the highest utilised server based on C: drive only, and use it across all drives.
        const warnings = warningsPerDrive[diskDriveChoice] || [];
        const cDriveEntries = entries.filter(e => e.drive === "C:").sort((a, b) => b.value - a.value);
        const highest = cDriveEntries[0] ? { name: cDriveEntries[0].server } : null;
        
        const allowedServers = computeAllowedServers(warnings, highest, diskWarningSelected, serverNameFilter);

        const { graphData, totalCapacity, freeSpace, avgDiskReads, avgDiskWrites, avgDiskReadBytes, avgDiskWriteBytes, avgDiskLatency } = createGraphData(serverDiskUtilization, "disk", allowedServers, hostingTypeFilter);
        const toValues = data => Object.fromEntries(driveOptions.map(d => [d, Object.values(data[d])]));

        // Compute avg (max value per unique server)
        const uniqueServers = {};
        entries.forEach(e => { if (!uniqueServers[e.server] || uniqueServers[e.server] < e.value) uniqueServers[e.server] = e.value; });
        setServerDiskUtilizationAvg(Object.keys(uniqueServers).length ? (Object.values(uniqueServers).reduce((a, b) => a + b, 0) / Object.keys(uniqueServers).length).toFixed(2) : "NA");

        setServerDiskUtilizationGraphData(toValues(graphData));
        setTotalCapacity(toValues(totalCapacity));
        setFreeSpace(toValues(freeSpace));
        setAvgDiskReads(toValues(avgDiskReads));
        setAvgDiskWrites(toValues(avgDiskWrites));
        setAvgDiskReadBytes(toValues(avgDiskReadBytes));
        setAvgDiskWriteBytes(toValues(avgDiskWriteBytes));
        setAvgDiskLatency(toValues(avgDiskLatency));
    }, [serverDiskUtilization, serverNameFilter, hostingTypeFilter, diskDriveChoice, diskWarningSelected]);

    // Auto-select first drive with warning on initial load (only when diskWarningSelected is true)
    useEffect(() => {
        if (diskWarningSelected && drivesWithWarnings.length > 0 && !drivesWithWarnings.includes(diskDriveChoice)) {
            setDiskDriveChoice(drivesWithWarnings[0]);
        }
    }, [drivesWithWarnings, diskWarningSelected]);
    useEffect(() => {
        if (Object.keys(tagComplianceData).includes('APMNumber')) {
            var complianceResults = {};
    
            Object.keys(tagComplianceData['ServerName']).forEach((index) => {
                complianceResults[tagComplianceData['ServerName'][index]] = [];
                Object.keys(tagComplianceData).filter((key) => key !== 'ServerName').forEach((tag) => {
    
                    switch (tag) {
                        case 'APMNumber':
                            if (!validateApplicationId(tagComplianceData[tag][index])) {
                                complianceResults[tagComplianceData['ServerName'][index]].push(tag);
                            }
                            break;
    
                        case 'costCenter':
                            if (!validateCostCenter(tagComplianceData[tag][index])) {
                                complianceResults[tagComplianceData['ServerName'][index]].push(tag);
                            }
                            break;
    
                        case 'Application CI':
                            if (!validateNotEmpty(tagComplianceData[tag][index])) {
                                complianceResults[tagComplianceData['ServerName'][index]].push(tag);
                            }
                            break;
    
                        case 'Support Group':
                            if (!validateSupportGroup(tagComplianceData[tag][index])) {
                                complianceResults[tagComplianceData['ServerName'][index]].push(tag);
                            }
                            break;
    
                        case 'BackupType':
                            if (!validateBackupType(tagComplianceData[tag][index])) {
                                complianceResults[tagComplianceData['ServerName'][index]].push(tag);
                            }
                            break;
    
                        case 'appFamily':
                            if (!validateNotEmpty(tagComplianceData[tag][index])) {
                                complianceResults[tagComplianceData['ServerName'][index]].push(tag);
                            }
                            break;
    
                        case 'Maintenance Window':
                        case 'Maintenance Status':
                            if (!validateNotEmpty(tagComplianceData[tag][index])) {
                                complianceResults[tagComplianceData['ServerName'][index]].push(tag);
                            }
                            break;
    
                        case 'Environment':
                            if (!validateEnvironment(tagComplianceData[tag][index])) {
                                complianceResults[tagComplianceData['ServerName'][index]].push(tag);
                            }
                            break;
    
                        
    
                        default:
                            break;
                    }
                });
            });

            console.log(complianceResults)
            
            setTagComplianceDataCard(complianceResults);
        } else {
            setTagComplianceDataCard("NA");
        }
    }, [tagComplianceData]);

   

    useEffect(()=>{
        if(Object.keys(serverStatus).length>1){
            var data = {}
            Object.keys(serverStatus["ServerName"]).map((key)=>{
                data[serverStatus["ServerName"][key]] = {"Status": serverStatus["Status"][key], "HostingType":serverStatus["HostingType"][key]}
            })
            setData(data)
            // data = serverStatus
        }
    },[serverStatus])

    // Auto-switch hostingTypeFilter if current selection has no data
    useEffect(() => {
        const types = [...new Set(Object.values(data).map(d => d?.HostingType).filter(Boolean))];
        if (types.length && !types.includes(hostingTypeFilter)) setHostingTypeFilter(types.includes("Cloud") ? "Cloud" : types[0]);
    }, [data])

    const validateApplicationId = (value) => {
        if (!value || value.trim() === '') return false; 
        if (value.length !== 10) return false; 
        if (value.startsWith('BSN')) return false;
        if (value.startsWith('APM')) return true; 
        return true;
      };
    const validateCostCenter = (value) => {
        if (!value || value.trim() === '') return false; 
        if (/^0+$/.test(value)) return false; 
        return true;
    };
    const validateNotEmpty = (value) => {
        return !(!value || value.trim() === ''); 
    };
    const validateSupportGroup = (value) => {
        if (!value || value.trim() === '') return false; 
        if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/.test(value)) return false; 
        if (/^\w$/.test(value)) return false; 
        return true;
    };
    const validateBackupType = (value) => {
        if (!value || value.trim() === '') return false; 
        if (value.toLowerCase().includes('none')) return false; 
        return true;
    };
    const validateEnvironment = (value) => {
        if (!value || value.trim() === '') return false;
        if (value.toLowerCase().includes('production') || value.toLowerCase().includes('test')) return true; 
        if (value.toLowerCase().includes('development') || value.toLowerCase().includes('prod') || value.toLowerCase().includes('staging')) return false; // Should not contain 'test', 'development', 'prod', 'staging'
        return true;
    };
    
    var createGraphData = (utilData, type, serverNameFilter,hostingTypeFilter) => {

        serverNameFilter = serverNameFilter || [];
        var serverFilterKeys = []

        if (type !== "loadbalancer") {
            serverFilterKeys = Object.keys(utilData['TimeGenerated'])
                                .filter((i)=>utilData["HostingType"][i]==hostingTypeFilter)

            if (hostingTypeFilter === "Cloud") {
                if (serverNameFilter.length !== 0) {
                    serverFilterKeys = serverFilterKeys.filter(i =>
                        serverNameFilter.includes(utilData["ServerName"][i].toLowerCase())
                    );
                }
            } 
            else {
                // normalize to array for OnPrem
                const selectedServers = Array.isArray(serverNameFilter)
                    ? serverNameFilter
                    : serverNameFilter ? [serverNameFilter] : [];

                if (selectedServers.length !== 0) {
                    serverFilterKeys = serverFilterKeys.filter(i =>
                        selectedServers.includes(utilData["ServerName"][i].toLowerCase())
                    );
                }
            }
        }
            //console.log("Onprem")
            //console.log(hostingTypeFilter)
            //console.log(utilData)
            //get 1st Server Name for OnPremise from Server List Data
            //var serverNameDefault = Object.keys(utilData["HostingType"]).filter((i)=>utilData["HostingType"][i]==hostingTypeFilter) //data to utilData
            // var serverNameDefault = utilData["ServerName"][serverFilterKeys[0]]
            // //console.log(serverNameDefault)
            // if(serverNameFilter==""){
            //     serverFilterKeys = serverFilterKeys.length>0 ? serverFilterKeys.filter((i)=>utilData["ServerName"][i].toLowerCase()==serverNameDefault):[]
            // }
            // else{
            //     serverFilterKeys = serverFilterKeys.filter((i)=>serverNameFilter.includes(utilData["ServerName"][i].toLowerCase()))
            // }
            //console.log(serverFilterKeys)
        
        
    //Object.keys(data['TimeGenerated']).filter((i)=>data["HostingType"][i]==hostingTypeFilter && (serverNameFilter.includes(data["ServerName"][i]) || serverNameFilter.length==0))
    var graphData = {}
    if (type === "disk") {
            graphData = { "C:": {}, "D:": {}, "E:": {}, "R:": {}, "L:": {}, "T:": {} };
            const totalCapacity = { "C:": {}, "D:": {}, "E:": {}, "R:": {}, "L:": {}, "T:": {} };
            const freeSpace = { "C:": {}, "D:": {}, "E:": {}, "R:": {}, "L:": {}, "T:": {} };
            const avgDiskReads = { "C:": {}, "D:": {}, "E:": {}, "R:": {}, "L:": {}, "T:": {} };
            const avgDiskWrites = { "C:": {}, "D:": {}, "E:": {}, "R:": {}, "L:": {}, "T:": {} };
            const avgDiskReadBytes = { "C:": {}, "D:": {}, "E:": {}, "R:": {}, "L:": {}, "T:": {} };
            const avgDiskWriteBytes = { "C:": {}, "D:": {}, "E:": {}, "R:": {}, "L:": {}, "T:": {} };
            const avgDiskLatency = { "C:": {}, "D:": {}, "E:": {}, "R:": {}, "L:": {}, "T:": {} };
   
            serverFilterKeys.forEach(key => {
                const driveName = utilData['DriveName'][key];
   
                if (driveName && graphData[driveName]) {
                    const timeGenerated = utilData['TimeGenerated'][key];
                    const serverName = utilData['ServerName'][key];
                    const avgValue = utilData['AvgValue'][key];
                    // const total = utilData['TotalSpace'][key];
                    // const free = utilData['FreeSpace'][key];
                    // const diskreads = utilData['AvgDiskReads'][key];
                    // const diskwrites = utilData['AvgDiskWrites'][key];
                    // const diskreadbytes = utilData['AvgDiskReadBytes'][key];
                    // const diskwritebytes = utilData['AvgDiskWriteBytes'][key];
                    // const disklatency = utilData['AvgDiskLatency'][key];
   
                    // Initialize drive data for each metric
                    if (!graphData[driveName][timeGenerated]) {
                        graphData[driveName][timeGenerated] = { name: timeGenerated };
                    }
                    // if (!totalCapacity[driveName][timeGenerated]) {
                    //     totalCapacity[driveName][timeGenerated] = { name: timeGenerated };
                    // }
                    // if (!freeSpace[driveName][timeGenerated]) {
                    //     freeSpace[driveName][timeGenerated] = { name: timeGenerated };
                    // }
                    // if (!avgDiskReads[driveName][timeGenerated]) {
                    //     avgDiskReads[driveName][timeGenerated] = { name: timeGenerated };
                    // }
                    // if (!avgDiskWrites[driveName][timeGenerated]) {
                    //     avgDiskWrites[driveName][timeGenerated] = { name: timeGenerated };
                    // }
                    // if (!avgDiskReadBytes[driveName][timeGenerated]) {
                    //     avgDiskReadBytes[driveName][timeGenerated] = { name: timeGenerated };
                    // }
                    // if (!avgDiskWriteBytes[driveName][timeGenerated]) {
                    //     avgDiskWriteBytes[driveName][timeGenerated] = { name: timeGenerated };
                    // }
                    // if (!avgDiskLatency[driveName][timeGenerated]) {
                    //     avgDiskLatency[driveName][timeGenerated] = { name: timeGenerated };
                    // }
   
                    // Store values for each metric
                    graphData[driveName][timeGenerated][serverName] = avgValue;
                    // totalCapacity[driveName][timeGenerated][serverName] = total;
                    // freeSpace[driveName][timeGenerated][serverName] = free;
                    // avgDiskReads[driveName][timeGenerated][serverName] = diskreads;
                    // avgDiskWrites[driveName][timeGenerated][serverName] = diskwrites;
                    // avgDiskReadBytes[driveName][timeGenerated][serverName] = diskreadbytes;
                    // avgDiskWriteBytes[driveName][timeGenerated][serverName] = diskwritebytes;
                    // avgDiskLatency[driveName][timeGenerated][serverName] = disklatency;
                }
            });
   
            return {
                graphData,
                totalCapacity,
                freeSpace,
                avgDiskReads,
                avgDiskWrites,
                avgDiskReadBytes,
                avgDiskWriteBytes,
                avgDiskLatency
            };
        } else if (type === "loadbalancer") {
            
            if (utilData["TimeGenerated"]) {
                serverFilterKeys = Object.keys(utilData["TimeGenerated"]).filter(
                    (i) => utilData["HostingType"] && utilData["HostingType"][i] === hostingTypeFilter
                );

                // Optional filter by serverNameFilter for Cloud, based on SqlServerName in ResourceId
                if (hostingTypeFilter === "Cloud" && serverNameFilter && serverNameFilter.length !== 0) {
                    serverFilterKeys = serverFilterKeys.filter((i) => {
                        const resourceId = utilData["ResourceId"] ? utilData["ResourceId"][i] : "";
                        const serverMatch = resourceId.match(/SqlServerName\/([^/]+)/i);
                        const serverName = serverMatch ? serverMatch[1].toLowerCase() : "";
                        return serverNameFilter.includes(serverName);
                    });
                }
            }

            const vipAvailability = {};
            const dipAvailability = {};
            const throughput = {};
            const requestCount = {};
            const inboundConnections = {};
            const outboundConnections = {};

            serverFilterKeys.forEach((key) => {
                const timeGenerated = utilData["TimeGenerated"][key];

                const resourceId = utilData["ResourceId"] ? utilData["ResourceId"][key] : "";
                const lbMatch = resourceId.match(/LoadBalancerName\/([^/]+)/i);
                const lb = lbMatch ? lbMatch[1] : "Unknown LB";

                const serverMatch = resourceId.match(/SqlServerName\/([^/]+)/i);
                const server = serverMatch ? serverMatch[1] : "all";

                const objectName = utilData["ObjectName"] ? utilData["ObjectName"][key] : null;
                const avgVal = utilData["AvgValue"] ? utilData["AvgValue"][key] : null;

                if (!vipAvailability[lb]) vipAvailability[lb] = {};
                if (!dipAvailability[lb]) dipAvailability[lb] = {};
                if (!throughput[lb]) throughput[lb] = {};
                if (!requestCount[lb]) requestCount[lb] = {};
                if (!inboundConnections[lb]) inboundConnections[lb] = {};
                if (!outboundConnections[lb]) outboundConnections[lb] = {};

                if (!vipAvailability[lb][timeGenerated]) {
                    vipAvailability[lb][timeGenerated] = { name: timeGenerated };
                }
                if (!dipAvailability[lb][timeGenerated]) {
                    dipAvailability[lb][timeGenerated] = { name: timeGenerated };
                }
                if (!throughput[lb][timeGenerated]) {
                    throughput[lb][timeGenerated] = { name: timeGenerated };
                }
                if (!requestCount[lb][timeGenerated]) {
                    requestCount[lb][timeGenerated] = { name: timeGenerated };
                }
                if (!inboundConnections[lb][timeGenerated]) {
                    inboundConnections[lb][timeGenerated] = { name: timeGenerated };
                }
                if (!outboundConnections[lb][timeGenerated]) {
                    outboundConnections[lb][timeGenerated] = { name: timeGenerated };
                }

                if (avgVal == null) {
                    return;
                }
               
                const windowSeconds = 15 * 60; // 15 minutes
                const value = Number(avgVal);
                if (Number.isNaN(value)) {
                    return;
                }

                if (objectName === "VipAvailability") {
                    vipAvailability[lb][timeGenerated][server] = Math.round(value);
                } else if (objectName === "DipAvailability") {
                    dipAvailability[lb][timeGenerated][server] = Math.round(value);
                } else if (objectName === "ByteCount") {
                    const bits = value * 8;
                    const bps = bits / windowSeconds;
                    const mbps = bps / 1_000_000;
                    throughput[lb][timeGenerated][server] = Number(mbps.toFixed(2));
                } else if (objectName === "PacketCount") {
                    requestCount[lb][timeGenerated][server] = Math.round(value);
                } else if (objectName === "SYNCount") {
                    const inboundPerSec = value / windowSeconds;
                    inboundConnections[lb][timeGenerated][server] = Number(inboundPerSec.toFixed(2));
                } else if (objectName === "SnatConnectionCount") {
                    const outboundPerSec = value / windowSeconds;
                    outboundConnections[lb][timeGenerated][server] = Number(outboundPerSec.toFixed(2));
                }
            });

            return {
                vipAvailability,
                dipAvailability,
                throughput,
                requestCount,
                inboundConnections,
                outboundConnections,
            };
        } else {
            serverFilterKeys.forEach(key => {
                const timeGenerated = utilData['TimeGenerated'][key];
                const serverName = utilData['ServerName'][key];
                const avgValue = utilData['AvgValue'][key];

                if (!graphData[timeGenerated]) {
                    graphData[timeGenerated] = { name: timeGenerated };
                }
                graphData[timeGenerated][serverName] = avgValue;
            });

            return graphData;
        }
    };

    const createGraphData_FileShare = (fileShares) => {

        if (!serverFileshareUtilization || !serverFileshareUtilization["Fileshare"]) {
          return;
        }
     
        const graphData = {};
    
        fileShares.forEach((uniqueFs) => {
            const [storageAccount, fileshare] = uniqueFs.split("/").map((str) => str.trim().toLowerCase());
        
            Object.keys(serverFileshareUtilization["Fileshare"]).forEach((index) => {
                const fs = serverFileshareUtilization["Fileshare"][index]?.trim().toLowerCase();
                const acc = serverFileshareUtilization["StorageAccountName"]?.[index]?.trim().toLowerCase();
                const timeGenerated = serverFileshareUtilization["TimeGenerated"]?.[index];
                var usedCapacity = parseFloat(serverFileshareUtilization["Used Capacity (GiB)"]?.[index]) || 0;
                var provisionedCapacity = parseFloat(serverFileshareUtilization["Provisioned Capacity (GiB)"]?.[index]) || 0;
                var utilization = provisionedCapacity > 0 ? (usedCapacity / provisionedCapacity) * 100 : 0;
                utilization = utilization.toFixed(2);
                if (!fs || !acc || !timeGenerated || isNaN(usedCapacity)) {
                    return;
                }
        
                if (fs === fileshare && acc === storageAccount) {
                    if (!graphData[timeGenerated]) {
                        graphData[timeGenerated] = { name: timeGenerated };
                    }
                    graphData[timeGenerated][uniqueFs] = utilization;
                }
            });
        });
        console.log(graphData)
        const formattedGraphData = Object.values(graphData).sort((a, b) => new Date(a.name) - new Date(b.name));
        if (formattedGraphData.length === 0) {
          console.warn("No data for graph! Check data structure.");
        }
        console.log(formattedGraphData)
        setFileShareGraphData(formattedGraphData);
    };

    const createGraphData_Network = (networkData, objectNameFilters, serverNameFilter, hostingTypeFilter) => {
        if (!networkData || !networkData.ObjectName || Object.keys(networkData).length === 0) {
            return [];
        }

        // Convert to array if single string is passed
        const objectNameArray = Array.isArray(objectNameFilters) ? objectNameFilters : [objectNameFilters];

        // Define label mappings for sent/received pairs
        const labelMap = {
            'bytes_sent_rate': 'Sent',
            'bytes_received_rate': 'Received',
            'packets_sent_rate': 'Sent',
            'packets_received_rate': 'Received',
            'network_in_total': 'In',
            'network_out_total': 'Out'
        };

        // Filter data by objectNames and hostingType
        const filteredKeys = Object.keys(networkData.TimeGenerated || {}).filter((key) => {
            const objectNameMatch = objectNameArray.includes(networkData.ObjectName[key]);
            const hostingMatch = networkData.HostingType ? networkData.HostingType[key] === hostingTypeFilter : true;
            return objectNameMatch && hostingMatch;
        });

        // Further filter by serverNameFilter if provided
        let serverFilteredKeys = filteredKeys;
        if (serverNameFilter && serverNameFilter.length > 0) {
            serverFilteredKeys = filteredKeys.filter((key) =>
                serverNameFilter.includes(networkData.ServerName[key]?.toLowerCase())
            );
        }

        // Calculate total/average value per server per objectName to find the highest
        const serverTotals = {};
        serverFilteredKeys.forEach((key) => {
            const serverName = networkData.ServerName[key];
            const avgValue = networkData.AvgValue[key] || 0;
            const objectName = networkData.ObjectName[key];

            const serverKey = `${serverName}_${objectName}`;
            if (!serverTotals[serverKey]) {
                serverTotals[serverKey] = { serverName, objectName, total: 0, count: 0 };
            }
            serverTotals[serverKey].total += avgValue;
            serverTotals[serverKey].count += 1;
        });

        // Find the server with highest average for each objectName
        const highestServerPerObject = {};
        Object.values(serverTotals).forEach(({ serverName, objectName, total, count }) => {
            const avg = total / count;
            if (!highestServerPerObject[objectName] || avg > highestServerPerObject[objectName].avg) {
                highestServerPerObject[objectName] = { serverName, avg };
            }
        });

        // Build graph data grouped by TimeGenerated, only for highest servers
        const graphDataMap = {};
        serverFilteredKeys.forEach((key) => {
            const timeGenerated = networkData.TimeGenerated[key];
            const serverName = networkData.ServerName[key];
            const avgValue = networkData.AvgValue[key];
            const objectName = networkData.ObjectName[key];

            // Only include if this server is the highest for this objectName
            if (highestServerPerObject[objectName]?.serverName !== serverName) {
                return;
            }

            if (!graphDataMap[timeGenerated]) {
                graphDataMap[timeGenerated] = { name: timeGenerated };
            }

            // Add label suffix if multiple objectNames are being combined
            const label = objectNameArray.length > 1 ? `${serverName} (${labelMap[objectName] || objectName})` : serverName;
            graphDataMap[timeGenerated][label] = avgValue;
        });

        // Convert to sorted array format for AreaLineChart
        const sortedTimestamps = Object.keys(graphDataMap).sort();
        return sortedTimestamps.map((time) => graphDataMap[time]);
    };

    useEffect(()=>{
        console.log(fileShareGraphData, "In useEffect for fileshare graph data")
    }, [fileShareGraphData])
    
    var getServerStatus = (type) => {
        var count = 0
        console.log(data, type)
        if(Object.keys(serverStatus).length>1){
            Object.keys(serverStatus['Status']).map((item)=>{
                if (serverStatus['HostingType']?.[item] === hostingTypeFilter) {
                    count = serverStatus['Status'][item]==type? (count + 1) : count
                }
            })
        }
        return count
    }

    var getServerHungStatus = () => {
        var count = 0
        if(Object.keys(serverHungStatus).length>1 && serverHungStatus['Status']){
            Object.keys(serverHungStatus['Status']).map((item)=>{
                if (serverHungStatus['HostingType']?.[item] === hostingTypeFilter) {
                    count = serverHungStatus['Status'][item]=="Hung"? (count + 1) : count
                }
            })
        }
        return count
    }

    var calculateAverageUptime = () => {
        if (Object.keys(serverStatus).length===0) {
            return null; // Handle cases where serverUptime is undefined or missing data
        }
        let totalUptime = 0;
        let count = 0;
        console.log("In avg function serveruptime");
        Object.keys(serverStatus['ServerName']).forEach((key) => {
           if (serverStatus['HostingType']?.[key] === hostingTypeFilter) {
               totalUptime += serverStatus['Up Time'][key];
               count++;
           }
        });
        console.log("count: ", count);
        if (count === 0) {
            return null; 
        }
    
        const avgUptime = totalUptime / count;
        console.log("Average uptime:  ", avgUptime);
        return avgUptime > 24 ? `${Math.round(avgUptime / 24)}d` : `${Math.round(avgUptime)}h`;
    };
     // Default to utilization chart

    var handleDiskFilterChange = (e, value) =>{
        
        if(value!=undefined){
            // If warning is selected and clicking on a different drive, deselect warning
            if (diskWarningSelected && value !== diskDriveChoice) {
                setDiskWarningSelected(false);
            }
            setDiskDriveChoice(value)
        }
    }

    var handleModalClose = () => {
        setModalOpen(false);
    }

    var handleServerChange = (event, newValue) => {
        setSelectedServer(newValue);
    
        if (newValue) {            
            const filteredData = originalTableData.filter(item => item["Server Name"] === newValue);
            setModalTableContent(prev => ({
                ...prev,
                data: filteredData, 
            }));
            if ((modalType === 'Server Uptime')||(modalType === 'Backup Status')) {
                setSelectedTab(0);
              }
        } else {
            // If no server is selected, reset to the full original data
            setModalTableContent(prev => ({
                ...prev,
                data: originalTableData, 
            }));
        }
    };
    var handlePortChange = (event, newValue) => {
        setSelectedServer(newValue);
    
        if (newValue) {
            
            const filteredData = originalTableData.filter(item => item["Port"] === newValue);
            setModalTableContent(prev => ({
                ...prev,
                data: filteredData, 
            }));
        } else {
            // If no server is selected, reset to the full original data
            setModalTableContent(prev => ({
                ...prev,
                data: originalTableData, 
            }));
        }
    };
    var handleDescriptionChange = (event, newValue) => {
        if (newValue) {
            const filteredData = originalTableData.filter(item => item["Description"] === newValue);
            setModalTableContent(prev => ({
                ...prev,
                data: filteredData, 
            }));
        } else {
            setModalTableContent(prev => ({
                ...prev,
                data: originalTableData, 
            }));
        }
    };
    var createModal = (header, type, filter) => {
        let serverNames = new Set(); 
        if(type=="Server Status"){
            var temp = []
            setModalType(type)
            Object.keys(data).map((key)=>{
                if(key!="Incidents"){
                    if(data[key]["Status"].toLowerCase()==filter.toLowerCase() && data[key]["HostingType"] === hostingTypeFilter){
                        temp.push({
                            "Server Name" : key.split("/")[0],
                            "Status" : filter.toUpperCase(),
                            "Hosting Type" : data[key]["HostingType"]
                            // "To" : date.endDate,
                            // "From": new Date(date.endDate).setMinutes(date.endDate.getMinutes() - 5)
                        })
                        serverNames.add(key.split("/")[0]);
                    }
                }
            })
            setModalTableContent({
                'header' : temp.length>0 ? Object.keys(temp[0]) : [] , 
                'data' : temp
            })
            // //console.log({
            //     'header' : temp.length>0 ? Object.keys(temp[0]) : [] , 
            //     'data' : temp
            // })
            // //console.log(temp)
        }
        if (type === "DCX Port Watcher") {
            var temp = []
            let portNumbers= new Set()
            let sourceData = null;
            setModalType(type)
            setModalFilter(filter);
            switch (filter) {
                case "Critical":
                    sourceData = dcxCriticalServersPortData;
                    break;
                case "Warning":
                    sourceData = dcxWarningServersPortData;
                    break;
                case "Healthy":
                    sourceData = dcxOkayServersPortData;
                    break;
                case "Down":
                    sourceData = dcxLocationsDown;
                    console.log("dcx locations down: ",dcxLocationsDown)
                    break;
            }
     
            if (!sourceData || sourceData.error) {
                temp.push({
                  Error: sourceData?.error || "No data available for this condition.",
                });
            } else if (filter === "Down") {
            sourceData.forEach((entry) => {
                const region = entry.location;
                const servers = entry.servers || [];
                servers.forEach((serverName) => {
                temp.push({
                    Region: region,
                    "Server Name": serverName,
                });
                serverNames.add(serverName);
                });
            });
            } else {
            Object.keys(sourceData).forEach((serverKey) => {
                const serverData = sourceData[serverKey];
                if (Array.isArray(serverData) && serverData.length > 0) {
                serverData.forEach((entry) => {
                    temp.push({
                    "Server Name": serverKey,
                    Port: entry.port,
                    "Packet Count": entry.packetCount,
                    Timestamp: entry.roundedTimestamp,
                    Region:entry.region,
                    Median: entry.median,
                    });
                    serverNames.add(serverKey);
                    portNumbers.add(entry.port)
                });
                }
            });
            }
            
            setModalTableContent({
                header: temp.length > 0 ? Object.keys(temp[0]) : [],
                data: temp,
            });
            setPortOptions(Array.from(portNumbers))
        }
        else if (type === "Tag Compliance") {
            var temp = []
            setModalType(type)
            let serverList = (filter == 0 
                ? Object.keys(tagComplianceDataCard).filter((item) => tagComplianceDataCard[item].length === 0 && getHostingTypeForServer(item) === hostingTypeFilter)
                : Object.keys(tagComplianceDataCard).filter((item) => tagComplianceDataCard[item].length > 0 && getHostingTypeForServer(item) === hostingTypeFilter)
            );
    
            Object.keys(tagComplianceData['ServerName']).forEach((key) => {
                if (serverList.includes(tagComplianceData['ServerName'][key])) {
                    temp.push({
                        'Server Name': tagComplianceData['ServerName'][key],
                        "APM Number": tagComplianceData['APMNumber'][key],
                        "Application CI": tagComplianceData['Application CI'][key],
                        "Backup Type": tagComplianceData['BackupType'][key],
                        "Environment": tagComplianceData['Environment'][key],
                        "Maintenance Status": tagComplianceData['Maintenance Status'][key],
                        "Maintenance Window": tagComplianceData['Maintenance Window'][key],
                        "Subscription ID": tagComplianceData['SubscriptionID'][key],
                        "Support Group": tagComplianceData['Support Group'][key],
                    });
                    serverNames.add(tagComplianceData['ServerName'][key]);
                }
            });
        }
        else if(type=="Server Uptime"){
            var temp = []
            setModalType(type)
            Object.keys(serverStatus["ServerName"]).forEach((key)=>{
                if (serverStatus['HostingType']?.[key] !== hostingTypeFilter) return;
                let serverName = serverStatus['ServerName'][key];
                let uptimeHours = serverStatus['Up Time'][key];
                if(uptimeHours!==null){
                    let uptimeDisplay = uptimeHours > 24 
                    ? `${Math.floor(uptimeHours / 24)} days ${uptimeHours % 24} hours `
                    : `${uptimeHours} hours`;
            
                    temp.push({
                        "Server Name": serverName,
                        "Uptime": uptimeDisplay,
                        "Uptime_Hours":uptimeHours
                    });
            
                    serverNames.add(serverName);
                }
                
            });
        }
                    
        else  if (type === "Backup Status") {
            var temp = []
            setModalType(type)
            Object.keys(serverStatus["Backup Status"] || {}).forEach((key) => {
                if (serverStatus['HostingType']?.[key] !== hostingTypeFilter) return;
                let backupStatus = serverStatus["Backup Status"][key]?.trim().toLowerCase();
                let serverName = serverStatus.ServerName[key];
                
                // Check condition based on filter (Complete or Failed)
                const isSuccess = backupStatus === "completed" || backupStatus === "success";
                const isFailed = !isSuccess;
                if ((filter === "Complete" && isSuccess) || 
                    (filter === "Failed" && isFailed)) {
                    temp.push({
                        "Server Name": serverName,
                        "Backup Status": serverStatus["Backup Status"][key],
                        "Last Backup Date": serverStatus["Last Backup Date"][key],
                    });
                    serverNames.add(serverName);
                        }
                    });

            setModalTableContent({
                'header' : temp.length>0 ? Object.keys(temp[0]) : [] , 
                'data' : temp
            })
        }

        else if (type === "Patch Compliance") {
            var temp = []
            setModalType(type)
            Object.keys(patchCompliance?.IsServerCompliant || {}).forEach((key) => {
                let serverName = patchCompliance?.ServerName?.[key] || "Unknown Server";
                if (getHostingTypeForServer(serverName) !== hostingTypeFilter) return;
                let isCompliant = patchCompliance?.IsServerCompliant?.[key] === "1" ? "Compliant" : "Non-Compliant";
                let patchWindow = patchCompliance?.PatchWindow?.[key] || "N/A";
                let lastUpdated = patchCompliance?.ServerComplianceUpdatedDate?.[key]
                    ? new Date(parseInt(patchCompliance.ServerComplianceUpdatedDate[key], 10)).toLocaleString()
                    : "N/A";
                let state = patchCompliance?.State?.[key] || "N/A";
                let status = patchCompliance?.Status?.[key] || "N/A";
                let collectionName = patchCompliance?.collectionName?.[key] || "N/A";
                
                // Apply filter
                if ((filter === 1 && patchCompliance.IsServerCompliant[key] === "1") || (filter === 0 && patchCompliance.IsServerCompliant[key] === "0" && status.toLowerCase() !== "installed") || filter === "All") {
                    temp.push({
                        "Server Name": serverName,
                        "Compliance Status": isCompliant,
                        "Patch Window": patchWindow,
                        "Last Updated": lastUpdated,
                        "State": state,
                        "Status": status,
                        "Collection Name": collectionName
                    });
                    serverNames.add(serverName);
                }
            });

            setModalTableContent({
                'header' : temp.length>0 ? Object.keys(temp[0]) : [] , 
                'data' : temp
            })
        }
        else if (type === "Reboot Event") {
            var temp = [];
            var descriptions = new Set();
            setModalType(type)
            console.log("Reboot Event Data:", rebootEvent);
            Object.keys(rebootEvent["EventType"]).forEach((key) => {
                if (rebootEvent["RebootType"][key] === filter && getHostingTypeForServer(rebootEvent["ServerName"][key]) === hostingTypeFilter) {
                    const eventEntry = {
                        "TimeGenerated": rebootEvent["TimeGenerated"][key],
                        "Server Name": rebootEvent["ServerName"][key],
                        "Event Log": rebootEvent["EventLog"][key],
                        "Event ID": rebootEvent["EventID"][key],
                        "Event Type": rebootEvent["EventType"][key],
                        "Description": rebootEvent["Description"][key],
                        "User Name": rebootEvent["UserName"][key],
                    };
                    temp.push(eventEntry);
                    serverNames.add(rebootEvent["ServerName"][key]);
                    descriptions.add(rebootEvent["Description"][key]);
                }
            });
            console.log("temp Event Data:", temp);
            setModalTableContent({
                'header' : temp.length>0 ? Object.keys(temp[0]) : [] , 
                'data' : temp
            })
            setDescriptionOptions(Array.from(descriptions));
        }
        setAutocompleteOptions(Array.from(serverNames)); 
        setOriginalTableData(temp);
        // Set modal table content
        setModalTableContent({
            header: temp.length > 0 ? Object.keys(temp[0]) : [],
            data: temp,
        });
        // //console.log(header)
        setModalOpen(true)
        setModalHeader(header)
    }

    const handleApplicationGlobalFilter = (value, metric, upDown, type) => {
        
        if(type.includes("VM")){
            var appName = value.split("/").length==2 ? value.split("/")[1] : value.split("/")[value.split("/").length-1]
            var hostingType = type.split(" ")[0]
            var resName = value.split("/").length==2 ? value.split("/")[0] : value.split("/")[0]+"/"+value.split("/")[1]+"/"+value.split("/")[2]
            navigate('/serverStatus?Name='+resName+"&HostingType="+hostingType+"&ApplicationCI="+appName+"&Type=VM&IsFileShare=no", {state:{AppName:appName}}) //metric[appName]["AppMetrics"]
        }
        else{
            navigate('/applicationHealth?Name='+value+"&Type="+type, {state:{metric:metric}})
        }
    };
  
    const getRegionWiseData_GlobalFilter = () => {
        var serverList = globalFilterData
        const getHospital_ServerData = (appCI) =>{
          var hospital = []
          var serverDetails = {}
          ////console.log(hospitalInformation["hospitalList"]["AppCI"])
          var index = Object.keys(hospitalInformation["hospitalList"]["AppCI"]).filter((key)=>hospitalInformation["hospitalList"]["AppCI"][key].toLowerCase()==appCI.toLowerCase())
          index.map((ind)=>{
            var s = hospitalInformation["hospitalList"]["State"][ind]
            hospital.push(hospitalInformation["hospitalList"]["Hospital"][ind])
          })
          var serverIndex = Object.keys(serverList["ServerName"]).filter((key)=>serverList["AppCI"][key].toLowerCase()==appCI.toLowerCase())
          serverIndex.map((key)=>{
            var s = serverList["ServerName"][key].toLowerCase()
            serverDetails[s] = {"Status":"NA","CPU":0,"Memory":0,"Disk":0,"Services":0,"HostingType":serverList["ServerHostingType"][index]}
          })
          resourceWiseAvailability[appCI.toLowerCase()]={"Hospitals" : hospital, "AppMetrics": serverDetails, "Weightage": 0}
        }
  
        var type = globalFilterChoice["ResourceType"]
        var resourceName = globalFilterChoice["ResourceName"]
        var resourceWiseAvailability = {}
        
        if(type == "Application Family"){
            var appCi = globalFilterChoice["Application CI"]
            appCi.map((appCI)=>{
            getHospital_ServerData(appCI)
            })
            //console.log(resourceWiseAvailability)
            handleApplicationGlobalFilter(resourceName, resourceWiseAvailability, "", "Application Family")
        }
        else if(type == "Application CI"){
            getHospital_ServerData(resourceName)
            handleApplicationGlobalFilter(resourceName, resourceWiseAvailability, "","Application CI")
        }
        else if(type.includes("VM")){
            var appCI = type.split("/")[2]
            var hostingType = type.split("/")[1]
            handleApplicationGlobalFilter(resourceName+"/"+appCI, resourceWiseAvailability, "", hostingType + " VM")
        }
    }

    const ModalTable = () => {
        const StyledTableCell = styled(TableCell)(({ theme }) => ({
          [`&.${tableCellClasses.head}`]: {
            backgroundColor: theme.palette.common.black,
            color: theme.palette.common.white,
          },
          [`&.${tableCellClasses.body}`]: {
            fontSize: 14,
          },
        }));
      
        const renderTabbedTable = (groupedData, excludedHeaderKey, replaceMap = {}) => {
            const handleTabChange = (event, newValue) => {
              setSelectedTab(newValue);
            };
          
            return (
              <Box sx={{ px: 1, maxHeight: '65vh', overflowY: 'auto', width: '100%' }}>
                <Tabs
                  value={selectedTab}
                  onChange={handleTabChange}
                  sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
                >
                  {groupedData.map((tab, idx) => (
                    <Tab key={idx} label={`${tab.label} (${tab.data.length})`} />
                  ))}
                </Tabs>
                {groupedData.map((tab, idx) => (
                  selectedTab === idx && (
                    <Box key={idx} sx={{ width: '100%' }}>
                      <TableContainer component="div" sx={{ width: '100%' }}>
                        <Table size="small" sx={{ width: '100%' }}>
                          <TableHead>
                            <TableRow>
                              {modalTableContent['header']
                                .filter((h) => h !== excludedHeaderKey)
                                .map((heading) => (
                                  <StyledTableCell align="center" key={heading}>
                                    {replaceMap[heading] || heading}
                                  </StyledTableCell>
                                ))}
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {tab.data.map((entry, rowIdx) => (
                              <TableRow key={rowIdx}>
                                {modalTableContent['header']
                                  .filter((h) => h !== excludedHeaderKey)
                                  .map((key, cellIdx) => (
                                    <TableCell align="center" key={cellIdx}>
                                      {entry[key]}
                                    </TableCell>
                                  ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Box>
                  )
                ))}
              </Box>
            );
          };
          
          // SERVER UPTIME — without UNKNOWN tab
          if (modalType === 'Server Uptime') {
            const last24h = [], last1Week = [], over1Week = [];
          
            modalTableContent['data'].forEach((entry) => {
              const hours = entry['Uptime_Hours'];
              if (hours == null) return; // skip nulls
              if (hours <= 24) last24h.push(entry);
              else if (hours <= 168) last1Week.push(entry);
              else over1Week.push(entry);
            });
          
            last24h.sort((a, b) => a['Uptime_Hours'] - b['Uptime_Hours']);
            last1Week.sort((a, b) => a['Uptime_Hours'] - b['Uptime_Hours']);
            over1Week.sort((a, b) => a['Uptime_Hours'] - b['Uptime_Hours']);
          
            const tabData = [
              { label: 'Last 24 Hours', data: last24h },
              { label: 'Last 1 Week', data: last1Week },
              { label: 'Over a Week', data: over1Week },
            ].filter(tab => tab.data.length > 0);
          
            return renderTabbedTable(tabData, 'Uptime_Hours', { 'Uptime': 'Last Restarted' });
          }
        
          // BACKUP STATUS — using PST for "now"
          if (modalType === 'Backup Status') {
            const now = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
            const nowPST = new Date(now);
          
            const last24h = [], last1Week = [], over1Week = [];
          
            modalTableContent['data'].forEach((entry) => {
              const backupDate = new Date(entry['Last Backup Date']);
              const hoursAgo = (nowPST - backupDate) / (1000 * 60 * 60);
          
              if (hoursAgo <= 24) last24h.push(entry);
              else if (hoursAgo <= 168) last1Week.push(entry);
              else over1Week.push(entry);
            });
          
            last24h.sort((a, b) => new Date(b['Last Backup Date']) - new Date(a['Last Backup Date']));
            last1Week.sort((a, b) => new Date(b['Last Backup Date']) - new Date(a['Last Backup Date']));
            over1Week.sort((a, b) => new Date(b['Last Backup Date']) - new Date(a['Last Backup Date']));
          
            const tabData = [
              { label: 'Last 24 Hours', data: last24h },
              { label: 'Last 1 Week', data: last1Week },
              { label: 'Over a Week', data: over1Week },
            ].filter(tab => tab.data.length > 0);
          
            return renderTabbedTable(tabData, '', {});
        }
        return (
          <TableContainer component={Paper}>
            {/* {modalType === 'DCX Port Watcher' && loading.dcxPortDetails &&(
               <CircularProgress size={18}/>
            )} */}
            <Table sx={{ minWidth: 1000 }} aria-label="customized table">
              <TableHead>
                <TableRow>
                  {modalTableContent['header'].map((heading) => (
                    <StyledTableCell align="center" key={heading}>
                      {heading.charAt(0).toUpperCase() + heading.slice(1)}
                    </StyledTableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {modalTableContent['data'].map((entry, rowIdx) => {
                  const isDCX = modalType === 'DCX Port Watcher';
                                    const serverName = entry['Server Name'];
                  const isDownCase = modalType === "DCX Port Watcher" && modalFilter === "Down";
                  const serverHasCriticalData = serverName && dcxCriticalServersPortData[serverName];
                  const isAffectedServer = isDownCase && serverHasCriticalData;
                  const handleRowClick = () => {
                    // const serverName = entry['Server Name'];
                    // const isDownCase = modalType === "DCX Port Watcher" && modalFilter === "Down";
                    if (isDownCase && serverHasCriticalData) {
                      const criticalData = dcxCriticalServersPortData[serverName] || [];
                      const temp = criticalData.map((entry) => ({
                        "Server Name": serverName,
                        Port: entry.port,
                        "Packet Count": entry.packetCount,
                        Timestamp: entry.roundedTimestamp,
                        Region: entry.region,
                        Median: entry.median,
                      }));
                      setModalTableContent({
                        header: temp.length > 0 ? Object.keys(temp[0]) : [],
                        data: temp,
                      });
                      setModalType("DCX Port Watcher");
                      setModalFilter("Critical");
                    } else if (modalType === "DCX Port Watcher" && entry['Port']) {
                      setGraphModalData(entry);
                      setGraphModalOpen(true);
                      setTimeRange(6);
                      fetchDCXGraphData(serverName, entry['Port'], '6');
                    }
                  };

                 var bgColor = 'white';
                  var isClickable = false;
                    if (isDCX) {
                         if (isDownCase) {
                      if (isAffectedServer) {
                        bgColor = 'rgba(255,0,0,0.15)';
                        isClickable = true;
                      }
                    } else if (entry['Packet Count'] != null && entry['Median'] != null) {
                      const pct = entry['Packet Count'] / entry['Median'];
                      if (pct < 0.1) bgColor = 'rgba(255,0,0,0.1)';
                      else if (pct < 0.25) bgColor = 'rgba(255,165,0,0.1)';
                      else bgColor = 'rgba(0,128,0,0.1)';
                      isClickable = true;
                    }
                }
      
                  return (
                    <TableRow
                      key={rowIdx}
                     onClick={isClickable || (isDCX && entry['Port']) ? handleRowClick : undefined}
                      style={{ cursor: (isClickable || (isDCX && entry['Port'])) ? 'pointer' : 'default', backgroundColor: bgColor }}
                    >
                      {Object.values(entry).map((val, cellIdx) => (
                        <TableCell align="center" key={cellIdx}>
                          {val}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <GraphModal timeRange={timeRange} setTimeRange={setTimeRange} />
          </TableContainer>
        );
    };

    var fetchDCXGraphData = (serverName, port, time) => {
        console.log("Fetching DCX Critical Servers graph data");
        console.log("The server name passed in the graph are", serverName);
    
        if (!serverName) {
            console.warn("No server name provided.");
            setdcxServersGraphData({});
            return;
        }
    
        if (!Array.isArray(serverName)) {
            console.log("serverName was not an array. Converting to array.");
            serverName = [serverName];
        }
    
        if (serverName.length === 0) {
            console.warn("Empty server list.");
            setdcxServersGraphData({});
            return;
        }
    
        const url = baseUrl + 'dcxPortWatcher';
        const params = {
            servers: serverName,
            mode: "graphDetails",
            port,
            time
        };
    
        // Set loading + clear error state
        setLoading(prev => ({
            ...prev,
            "dcxGraphData": true
        }));
        setErrorApi(prev => ({
            ...prev,
            "dcxGraphData": ""
        }));
    
        fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(params)
        })
        .then((response) => {
            if (!response.ok) throw new Error("Non-200 response");
            return response.json();
        })
        .then((data) => {
            console.log("Fetched graph Servers DCX Data:", data);
            setdcxServersGraphData(data);
    
            setLoading(prev => ({
                ...prev,
                "dcxGraphData": false
            }));
        })
        .catch((error) => {
            console.error("Error fetching Critical Servers port DCX Data:", error);
    
            setdcxServersGraphData({});
            setLoading(prev => ({
                ...prev,
                "dcxGraphData": false
            }));
            setErrorApi(prev => ({
                ...prev,
                "dcxGraphData": "Graph API didn’t load"
            }));
        });
    };

    // var getServerPerformanceData_fromADX = async(aggregate, objectName) => {
    //     var keyValue = "server"+objectName[0]+"Utilization"
    //     console.log(keyValue);
    //     setLoading(prevLoading=>({
    //         ...prevLoading,
    //         [keyValue] : true
    //     }));    
    //     var resourceKey = queryParams["Type"]==="VM" ? "Resource Name" : "Application CI"
    //     var nameOfResource = queryParams["Name"] || urlParams.get("Name")?.toString() || ""
    //     var resourceValue = []
    //     if(queryParams["Type"]==="VM"){
    //         var splitRes = nameOfResource.split("/")
    //         var resName = splitRes.length==1 ?  "ServerName/"+splitRes[0]+"/ApplicationCI/"+queryParams["ApplicationCI"] 
    //         : 
    //         "SubscriptionId/"+splitRes[0]+"/ResourceGroup/"+splitRes[1]+"/ServerName/"+splitRes[2]+"/ApplicationCI/"+queryParams["ApplicationCI"]
    //         resourceValue = [resName]
    //     }
    //     else{
    //         resourceValue = [queryParams["Name"]]
    //     }
    //     var params = {
    //         "Latest Only": aggregate,
    //         [resourceKey]: resourceValue,
    //         "Start Time": convertTimeToPreferredTZ_ToUtc(date.startDate),
    //         "End Time": convertTimeToPreferredTZ_ToUtc(date.endDate),
    //         "Object Name": objectName
    //     };
    //     console.log(params)
    //     try{
    //         var results = await fetchServerPerformance_fromADX(params)
    //         console.log(results)
    //         console.log(params)
    //         var convertTimeZone = convertTimeToPreferredTZ_fromUtc(results)
    //         if(objectName[0]==="Cpu"){
    //             setServerCpuUtilization(convertTimeZone)
    //         }
    //         else if(objectName[0]==="Memory"){
    //             setServerMemoryUtilization(convertTimeZone)
    //         }
    //         else if(objectName[0]==="Disk"){
    //             setServerDiskUtilization(convertTimeZone)
    //         }
    //     }
    //     catch (error) {
    //         console.error(error);
    //         setErrorApi(prev => ({ ...prev, [keyValue]: error.message }))
    //     }
    //     finally {
    //         setLoading(prev=>({...prev, [keyValue] : false}));
    //     }
    // }
    var getServerPerformanceData_fromADX = async(aggregate, objectName) => {
        var keyValue = "server"+objectName[0]+"Utilization"
        console.log(keyValue);
        setLoading(prevLoading=>({
            ...prevLoading,
            [keyValue] : true
        }));    
        var resourceKey = queryParams["Type"]==="VM" ? "Resource Name" : "Application CI"
        var nameOfResource = urlParams.get("Name").toString()
        var resourceValue = []
        if(queryParams["Type"]==="VM"){
            var splitRes = nameOfResource.split("/")
            var resName = splitRes.length==1 ?  "ServerName/"+splitRes[0]+"/ApplicationCI/"+queryParams["ApplicationCI"]
            :
            "SubscriptionId/"+splitRes[0]+"/ResourceGroup/"+splitRes[1]+"/ServerName/"+splitRes[2]+"/ApplicationCI/"+queryParams["ApplicationCI"]
            resourceValue = [resName]
        }
        else{
            resourceValue = [queryParams["Name"]]
        }
        var params = {
            "Latest Only": aggregate,
            [resourceKey]: resourceValue,
            "Start Time": convertTimeToPreferredTZ_ToUtc(date.startDate),
            "End Time": convertTimeToPreferredTZ_ToUtc(date.endDate),
            "Object Name": objectName
        };
        console.log(params)
        try{
            var results = await fetchServerPerformance_fromADX(params)
            console.log(results)
            console.log(params)
            var convertTimeZone = convertTimeToPreferredTZ_fromUtc(results)
            if(objectName[0]==="Cpu"){
                setServerCpuUtilization(convertTimeZone)
            }
            else if(objectName[0]==="Memory"){
                setServerMemoryUtilization(convertTimeZone)
            }
            else if(objectName[0]==="Disk"){
                setServerDiskUtilization(convertTimeZone)
            }
        }
        catch (error) {
            console.error(error);
            setErrorApi(prev => ({ ...prev, [keyValue]: error.message }))
        }
        finally {
            setLoading(prev=>({...prev, [keyValue] : false}));
        }
    }

    // Pattern Analysis pane uses its own fixed 30-day window so the chart is
    // not bound to this page's time filter (which may be as short as a few
    // hours). Builds the same resource scoping as getServerPerformanceData_fromADX
    // and returns the raw ADX response untouched.
    const fetchPaneUtilizationLast30d = async (paneMetric) => {
        const objectName = paneMetric === 'CPU' ? ['Cpu'] : paneMetric === 'Memory' ? ['Memory'] : ['Disk'];
        const resourceKey = queryParams["Type"] === "VM" ? "Resource Name" : "Application CI";
        const nameOfResource = urlParams.get("Name").toString();
        let resourceValue = [];
        if (queryParams["Type"] === "VM") {
            const splitRes = nameOfResource.split("/");
            const resName = splitRes.length === 1
                ? "ServerName/" + splitRes[0] + "/ApplicationCI/" + queryParams["ApplicationCI"]
                : "SubscriptionId/" + splitRes[0] + "/ResourceGroup/" + splitRes[1] + "/ServerName/" + splitRes[2] + "/ApplicationCI/" + queryParams["ApplicationCI"];
            resourceValue = [resName];
        } else {
            resourceValue = [queryParams["Name"]];
        }
        const tsFmt = 'YYYY-MM-DD hh:mm:ss A';
        const params = {
            "Latest Only": false,
            [resourceKey]: resourceValue,
            "Start Time": dayjs.utc().subtract(30, 'day').format(tsFmt),
            "End Time": dayjs.utc().format(tsFmt),
            "Object Name": objectName,
        };
        return await fetchServerPerformance_fromADX(params);
    };

    var getNetworkMetricsData_fromADX = async(aggregate, objectName) => {
        var keyValue = "networkMetrics" 
        setLoading(prevLoading=>({
            ...prevLoading,
            [keyValue] : true
        }));    
        
        var resourceKey = queryParams["Type"]==="VM" ? "Resource Name" : "Application CI"
        var nameOfResource = urlParams.get("Name").toString()
        var resourceValue = []
        
        if(queryParams["Type"]==="VM"){
            var splitRes = nameOfResource.split("/")
            var resName = splitRes.length==1 ?  "ServerName/"+splitRes[0]+"/ApplicationCI/"+queryParams["ApplicationCI"]
            :
            "SubscriptionId/"+splitRes[0]+"/ResourceGroup/"+splitRes[1]+"/ServerName/"+splitRes[2]+"/ApplicationCI/"+queryParams["ApplicationCI"]
            resourceValue = [resName]
        }
        else{
            resourceValue = [queryParams["Name"]]
        }
        var params = {
            "Latest Only": aggregate,
            [resourceKey]: resourceValue,
            "Start Time": convertTimeToPreferredTZ_ToUtc(date.startDate),
            "End Time": convertTimeToPreferredTZ_ToUtc(date.endDate),
            "Object Name": objectName
        };
        try{
            var results = await fetchNetworkMetrics_fromADX(params)
            var convertTimeZone = convertTimeToPreferredTZ_fromUtc(results)
            setNetworkMetrics(convertTimeZone)
        }
        catch (error) {
            console.error("Network Metrics Error:", error);
            setErrorApi(prev => ({ ...prev, [keyValue]: error.message }))
            setNetworkMetrics({})
        }
        finally {
            setLoading(prev=>({...prev, [keyValue] : false}));
        }
    }

    var getFilesharePerformanceData_fromADX = async(aggregate, objectName) => {
        var keyValue = "fileshareUtilization"
        setServerFileshareUtilizationAvg({});
        setServerFileshareUtilization({});
        setLoading(prevLoading=>({
            ...prevLoading,
            [keyValue] : true
        }));
        
        var resourceKey = queryParams["Type"]==="VM" ? "Resource Name" : "Application CI"
        var resourceValue = queryParams["Type"]==="VM" ? [queryParams["ApplicationCI"]] : [queryParams["Name"]]
        
        var params = {
            "Latest Only": aggregate,
            [resourceKey]: resourceValue,
            "Start Time": convertTimeToPreferredTZ_ToUtc(date.startDate),
            "End Time": convertTimeToPreferredTZ_ToUtc(date.endDate),
            "Object Name": objectName
        };
        console.log(params)
        try{
            var results = await fetchFileStorageMetrics_fromADX(params)
            console.log(results)
            console.log(params)

            if (Object.keys(results).length > 0) {
                var convertTimeZone = convertTimeToPreferredTZ_fromUtc(results)
                if (aggregate){
                    setServerFileshareUtilizationAvg(convertTimeZone);
                    console.log("Filesharedata",convertTimeZone)}
                else{
                    setServerFileshareUtilization(convertTimeZone);
                    console.log("Filesharedataaggregate no: ",convertTimeZone)}
            } else {
                setServerFileshareUtilization({
                    "ServerName": {}
                });
            }
        }
        catch (error) {
            console.error(error, error.message);
            setErrorApi(prev => ({ ...prev, [keyValue]: error.message }))
        }
        finally {
            setLoading(prev=>({...prev, [keyValue] : false}));
        }
    }

    var getLoadBalancerPerformanceData_fromADX = async(aggregate, objectName) => {
        var keyValue = "loadBalancerUtilization";
        setLoading(prevLoading => ({
            ...prevLoading,
            [keyValue]: true
        }));

        var resourceKey = queryParams["Type"] === "VM" ? "Resource Name" : "Application CI";
        var nameOfResource = urlParams.get("Name").toString();
        var resourceValue = [];

        if (queryParams["Type"] === "VM") {
            var splitRes = nameOfResource.split("/");
            var resName = splitRes.length === 1
                ? "ServerName/" + splitRes[0] + "/ApplicationCI/" + queryParams["ApplicationCI"]
                : "SubscriptionId/" + splitRes[0] + "/ResourceGroup/" + splitRes[1] + "/ServerName/" + splitRes[2] + "/ApplicationCI/" + queryParams["ApplicationCI"];
            resourceValue = [resName];
        } else {
            resourceValue = [queryParams["Name"]];
        }

        var params = {
            "Latest Only": aggregate,
            [resourceKey]: resourceValue,
            "Start Time": convertTimeToPreferredTZ_ToUtc(date.startDate),
            "End Time": convertTimeToPreferredTZ_ToUtc(date.endDate),
            "Object Name": objectName
        };
        console.log("Load Balancer Metrics Params", params);

        try {
            var results = await fetchLoadBalancerMetrics_fromADX(params);
            console.log("Load Balancer Metrics Results", results);
            var convertTimeZone = convertTimeToPreferredTZ_fromUtc(results);

            setLoadBalancerMetrics(convertTimeZone);
        } catch (error) {
            console.error(error);
            setErrorApi(prev => ({ ...prev, [keyValue]: error.message }));
        } finally {
            setLoading(prev => ({ ...prev, [keyValue]: false }));
        }
    }

  
    useEffect(() => {
        if (!loadBalancerMetrics) return;
        // Use vipAvailability keys for loadBalancerChoice
        const { vipAvailability } = createGraphData(loadBalancerMetrics, "loadbalancer", serverNameFilter, "Cloud");
        const lbKeys = Object.keys(vipAvailability || {});
        if (lbKeys.length > 0) {
            if (!loadBalancerChoice || !lbKeys.includes(loadBalancerChoice)) {
                setLoadBalancerChoice(lbKeys[0]);
            }
        } else {
            setLoadBalancerChoice("");
        }
    }, [serverNameFilter, hostingTypeFilter, loadBalancerMetrics]);

    var fetchCpuUtilizationData = async(aggregate, serverName) => {
        setServerCpuUtilizationAvg(-1)
        // setServerCpuUtilization({})
        setLoading(prevLoading=>({
            ...prevLoading,
            "serverCpuUtilization" : true
        }));
        //console.log(date["startDate"])
        var params = {
            aggregate: aggregate,
            filters: {},
            serverName: serverName.replace(/'/g, ""),
            start_time: date.startDate,
            end_time: date.endDate
        };
        console.log(params)
        var url = new URL(baseUrl+ 'azureServerMetricsCPUDatalogs');
        
        console.log(url)
        fetch(url,{
          method:'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(params)
        })
        .then((response) => response.json())
        .then((data) =>{ 
        
            // //console.log("CPU Logs")
            console.log(data)
            console.log(JSON.parse(data["CpuUtilization"]))
            
            if(Object.keys(JSON.parse(data["CpuUtilization"])).length>0){
                setServerCpuUtilization(convertTimeToPreferredTZ(JSON.parse(data["CpuUtilization"])))
            }
            else{
                setServerCpuUtilization({
                "ServerName" : {}
                })
            }
            
            setLoading(prevLoading=>({
                ...prevLoading,
                "serverCpuUtilization" : false
            }));
        
        })
        .catch((error) =>{ 
            setServerCpuUtilization({
                "ServerName" : {}
            })
            setErrorApi((prevState)=>({
                ...prevState,
                "CPU" : "API didnt load"
            }))
            setLoading(prevLoading=>({
                ...prevLoading,
                "serverCpuUtilization" : false
            }));
        
            console.error('Error:', error)
        });
    };
    const fetchServerUptimeData = async (serverName) => {
        setServerUptime({});
        setLoading(prevLoading => ({
            ...prevLoading,
            "serverUptime": true
        }));
    
        setErrorApi(prevState => ({
            ...prevState,
            "serverUptime": ""
        }));
    
        const url = new URL(baseUrl + 'serverUptime');
        const params = { "serverName": serverName };
    
        try {
            // Fetch data from the server uptime API
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(params)
            });
    
            const data = await response.json();
    
            if (data["ServerUptime"]) {
                const parsedData = JSON.parse(data["ServerUptime"]);
    
                // Check if all values inside ServerUptime are empty
                const allEmpty = Object.values(parsedData).every(
                    value => value === null || 
                             value === undefined || 
                             (typeof value === "object" && Object.keys(value).length === 0)
                );
    
                if (allEmpty) {
                    console.log("No valid data returned, setting to NA");
                    setServerUptime("NA");
                } else {
                    setServerUptime(parsedData);
                    console.log("Data set successfully");
                }
            } else {
                console.log("No data returned, setting to NA");
                setServerUptime("NA");
            }
        } catch (error) {
            console.error('Error:', error);
            setServerUptime("NA");
            setErrorApi(prevState => ({
                ...prevState,
                "serverUptime": "API didn't load or there was an error"
            }));
        } finally {
            setLoading(prevLoading => ({
                ...prevLoading,
                "serverUptime": false
            }));
        }
    };

    var fetchMemoryUtilizationData = async(aggregate, serverName) => {
        setServerMemoryUtilizationAvg(-1)
        // setServerMemoryUtilization({})
        setLoading(prevLoading=>({
          ...prevLoading,
          "serverMemoryUtilization" : true
        }));
        
        var params = {
          aggregate: aggregate,
          filters: "",
          serverName : serverName.replace(/'/g, ""),
          start_time: date.startDate,
          end_time: date.endDate
        };
        
        var url = new URL(baseUrl+ 'azureServerMetricsMemoryDatalogs');
        ////console.log(url);
        //url.search = new URLSearchParams(params).toString();
        
        fetch(url,{
          method:'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(params)
        })
        .then((response) => response.json())
        .then((data) =>{ 

            // //console.log("Memory Logs")
            // //console.log(JSON.parse(data["MemoryUtilization"]))

            if(Object.keys(JSON.parse(data["MemoryUtilization"])).length>0){
                setServerMemoryUtilization(convertTimeToPreferredTZ(JSON.parse(data["MemoryUtilization"])))
            }
            else{
                setServerMemoryUtilization({
                "ServerName" : {}
                })
            }

            setLoading(prevLoading=>({
                ...prevLoading,
                "serverMemoryUtilization" : false
            }));
        
        ////console.log(data)
        })
        .catch((error) =>{ 
          setServerMemoryUtilization({
            "ServerName" : {}
            })
            setErrorApi((prevState)=>({
                ...prevState,
                "Memory" : "API didnt load"
            }))
            setLoading(prevLoading=>({
                ...prevLoading,
                "serverMemoryUtilization" : false
            }));
            
            console.error('Error:', error)
        });
  
    };

    useEffect(()=>{
        console.log("File Share avfg", serverFileshareUtilizationAvg)
        var isFileshare = isFileShare || urlParams.get("IsFileShare")?.toString() || "no"
        if(Object.keys(serverFileshareUtilizationAvg).length>0 && isFileshare==="yes"){
            window.scrollTo({
                top: document.documentElement.scrollHeight,
                behavior: 'smooth' // Optional for a smooth scroll
            });
        }
    }, [serverFileshareUtilizationAvg])

    useEffect(() => {
        if (graphModalOpen && graphModalData) {
          const { "Server Name": serverName, Port } = graphModalData;
          fetchDCXGraphData(serverName, Port, String(timeRange));
        }
      }, [ timeRange]);

    var fetchFileshareUtilizationData = async (aggregate,AppName) => {
        // Set loading state and initial data
        setServerFileshareUtilizationAvg({});
        setServerFileshareUtilization({});
        setLoading(prevLoading => ({
            ...prevLoading,
            "serverFileshareUtilization": true
        }));
    
        var filters = {
            "appFamily": [
              "All"
            ],
            "appCI": [AppName],
            "managedByGroup": [
              "All"
            ],
            "supportGroup": [
              "All"
            ]
        }
        // Prepare request parameters
        var params = {
            filters: filters,
            start_time: date.startDate, // assuming date.startDate is defined elsewhere
            end_time: date.endDate,
            appname: AppName,
            aggregate:aggregate
        };
        var url = new URL(baseUrl + 'azureServerMetricsFileshareDatalogs'); // assuming baseUrl is defined elsewhere
    
        try {
            // Send the POST request to the API
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(params) // Send params as JSON in the body
            });
    
            // Parse the response data
            const data = await response.json();
    
            // Check if the response contains fileshare utilization data
            if (Object.keys(JSON.parse(data["FileshareUtilization"])).length > 0) {
                if (aggregate==='yes'){
                    setServerFileshareUtilization(JSON.parse(data["FileshareUtilization"]));
                    console.log("Filesharedata",serverFileshareUtilization)}
                else{
                    setServerFileshareUtilizationAvg(convertTimeToPreferredTZ(JSON.parse(data["FileshareUtilization"])));
                    console.log("Filesharedataaggregate yes: ",serverFileshareUtilizationAvg)}
            } else {
                setServerFileshareUtilization({
                    "ServerName": {}
                });
            }
    
        } catch (error) {
            // Handle error if the API request fails
            setServerFileshareUtilization({
                "ServerName": {}
            });
    
            // Set error state for the API
            setErrorApi((prevState) => ({
                ...prevState,
                "Fileshare": "API didn't load"
            }));
    
            // Update loading state
            setLoading(prevLoading => ({
                ...prevLoading,
                "serverFileshareUtilization": false
            }));
    
            console.error('Error:', error);
        } finally {
            // Update the loading state once the request is complete (success or failure)
            setLoading(prevLoading => ({
                ...prevLoading,
                "serverFileshareUtilization": false
            }));
        }
    };

    
    var fetchDiskUtilizationData = async(aggregate, serverName) => {
        setServerDiskUtilizationAvg(-1)
        // setServerDiskUtilization({})
        setLoading(prevLoading=>({
          ...prevLoading,
          "serverDiskUtilization" : true
        }));
        
        var params = {
            aggregate: aggregate,
            filters: "",
            serverName : serverName.replace(/'/g, ""),
            start_time: date.startDate,
            end_time: date.endDate
        };
        ////console.log("hello")
        // //console.log(params)
        var url = new URL(baseUrl+ 'azureServerMetricsDiskDatalogs');
        
        fetch(url,{
          method:'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(params)
        })
        .then((response) => response.json())
        .then((data) =>{ 
        
            //console.log("Disk Logs")
            //console.log(JSON.parse(data["DiskUtilization"]))

            if(Object.keys(JSON.parse(data["DiskUtilization"])).length>0){
                setServerDiskUtilization(convertTimeToPreferredTZ(JSON.parse(data["DiskUtilization"])))
            }
            else{
                setServerDiskUtilization({
                    "ServerName" : {}
                })
                // setErrorApi((prevState)=>({
                //     ...prevState,
                //     "Disk" : "API didnt load"
                // }))
            }
            //setServerDiskUtilization(JSON.parse(data["DiskUtilization"]))
            setLoading(prevLoading=>({
                ...prevLoading,
                "serverDiskUtilization" : false
            }));

        })
        .catch((error) =>{ 
            setServerDiskUtilization({
              "ServerName" : {}
            })
            setErrorApi((prevState)=>({
                ...prevState,
                "Disk" : "API didnt load"
            }))
            setLoading(prevLoading=>({
                ...prevLoading,
                "serverDiskUtilization" : false
            }));

            console.error('Error:', error)
        });
        
    };

    var fetchPatchComplianceData = async (serverName) => {
        setPatchCompliance({});
        setLoading(prevLoading => ({
            ...prevLoading,
            "patchCompliance": true
        }));
    
        setErrorApi(prevState => ({
            ...prevState,
            "patchCompliance": ""
        }));
    
        var params = {
            "serverName": serverName.replace(/'/g, "")
        };
    
        var url = new URL(baseUrl + 'PatchCompliance'); 
    
        fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(params)
        })
        .then((response) => response.json())
        .then((data) => { 
            // console.log("Azure Patch Compliance Data:", JSON.parse(data["PatchCompliance"]));
            const patchData = data["PatchCompliance"];
    
            if (!patchData || Object.keys(patchData).length === 0) {
                setPatchCompliance("NA");  // Indicate that data is not available
            } else {
                var d = JSON.parse(patchData)
                setPatchCompliance(JSON.parse(patchData));
            }

            setLoading(prevLoading => ({
                ...prevLoading,
                "patchCompliance": false
            }));
        })
        .catch((error) => { 
            console.error('Error:', error);
            setPatchCompliance(null);  // Set to null to indicate API failure
            setLoading(prevLoading => ({
                ...prevLoading,
                "patchCompliance": false
            }));
            setErrorApi(prevState => ({
                ...prevState,
                "patchCompliance": "API didn't load"
            }));
        });
    };

   
 var fetchTagComplianceData = async (serverName) => {
    setTagComplianceData({});
    setLoading(prevLoading => ({
        ...prevLoading,
        "tagCompliance": true
    })); 

    setErrorApi(prevState => ({
        ...prevState,
        "tagCompliance": ""
    }));

    var params = {
        "serverName": serverName.replace(/'/g, "")
    };

    var url = new URL(baseUrl + 'TagCompliance');  // Updated endpoint for Tag Compliance

    fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(params)
    })
    .then((response) => response.json())
    .then((data) => { 
        // console.log("Azure Tag Compliance Data:", JSON.parse(data["TagCompliance"]));
        
        if (Object.keys(JSON.parse(data["TagCompliance"])).length > 0) {
            setTagComplianceData(JSON.parse(data["TagCompliance"]));
        } else {
            setTagComplianceData({
                "tagCompliance": {}
            });
        }
        
        setLoading(prevLoading => ({
            ...prevLoading,
            "tagCompliance": false
        }));
    })
    .catch((error) => { 
        console.error('Error:', error);
        setTagComplianceData({
            "tagCompliance": {}
        });
        setLoading(prevLoading => ({
            ...prevLoading,
            "tagCompliance": false
        }));
        setErrorApi(prevState => ({
            ...prevState,
            "tagCompliance": "API didn't load"
        }));
    });
};

var fetchServerBackup = async (serverName) => {
    setAzureBackup({});
    setLoading(prevLoading => ({
        ...prevLoading,
        "azureBackup": true
    })); 
    setErrorApi(prevState => ({
        ...prevState,
        "azureBackup": ""
    }));

    var params = {
        "serverName": serverName
    };

    var url = new URL(baseUrl + 'ServerBackup');

    fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(params)
    })
    .then((response) => response.json())
    .then((data) => { 
        console.log("Azure Server Backup Data issss:", data);

        if (!data["ServerBackup"] || data["ServerBackup"] === "NA" || Object.keys(JSON.parse(data["ServerBackup"] || "{}")).length === 0) {
            console.log("came inside if cond")
            setAzureBackup("NA");  // Mark as "Data yet to be integrated"
        } else {
            console.log("The backup data is", data["ServerBackup"])
            setAzureBackup(JSON.parse(data["ServerBackup"]));
        }

        setLoading(prevLoading => ({
            ...prevLoading,
            "azureBackup": false
        }));
    })
    .catch((error) => { 
        console.error('Error:', error);
        setErrorApi(prevState => ({
            ...prevState,
            "azureBackup": "API didn't load"
        }));

        setAzureBackup("NA"); // Ensure empty API calls still show "Data yet to be integrated"

        setLoading(prevLoading => ({
            ...prevLoading,
            "azureBackup": false
        }));
    });
};
    
    var fetchServerStatusData = async(aggregate, serverName) => {
        
        setServerStatus({})
        setLoading(prevLoading=>({
            ...prevLoading,
            "serverStatus" : true
        })); 
        setErrorApi((prevState)=>({
            ...prevState,
            "ServerStatus": ""
        }))
        var appName = queryParams["Type"]==="VM" ? queryParams["ApplicationCI"] : queryParams["Name"]
        ////console.log("In server Status : ", serverName)
        var params = {
            "filters": {
                "appFamily": ["All"],
                "appCI": [appName],
                "managedByGroup": ["All"],
                "supportGroup": ["All"]
            },
            "serverName": serverName.replace(/'/g, ""),
            "aggregate" : aggregate,
            "startTime": date.startDate,
            "endTime": date.endDate
        };
    
        var url = new URL(baseUrl + 'serverStatus');
        
        fetch(url,{
          method:'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(params)
        })
        .then((response) => response.json())
        .then((data) =>{ 
            console.log("Server Status - " + appName)
            console.log(JSON.parse(data["ServerStatus"]))
            if(Object.keys(JSON.parse(data["ServerStatus"])).length>0){
                setServerStatus(JSON.parse(data["ServerStatus"]))
            }
            else{
                setServerStatus({
                "ServerName" : {}
                })
            }
            
            setLoading(prevLoading=>({
                ...prevLoading,
                "serverStatus" : false
            }));
        })
        .catch((error) =>{ 
            console.error('Error:', error)
            setServerStatus({
                "ServerName" : {}
            })
            setLoading(prevLoading=>({
                ...prevLoading,
                "serverStatus" : false
            }));
            setErrorApi((prevState)=>({
                ...prevState,
                "ServerStatus": "API didnt load"
            }))
        });
    };
    
    var fetchServerHungStatusData = async(aggregate, serverName) => {
        
        setServerHungStatus({})
        setLoading(prevLoading=>({
            ...prevLoading,
            "serverHungStatus" : true
        })); 
        setErrorApi((prevState)=>({
            ...prevState,
            "ServerHungStatus": ""
        }))
        var appName = queryParams["Type"]==="VM" ? queryParams["ApplicationCI"] : queryParams["Name"]
        var params = {
            "appCI": appName,
            "serverName": serverName.replace(/'/g, ""),
            "CounterName": 'Status',
            "DataFilter": 'Hung'
        };
    
        try {
            const data = await fetchAnalytics_fromADX(params);
            console.log("Server Hung Status (ADX) - " + appName);
            console.log(data);
            if(data && Object.keys(data).length > 0){
                setServerHungStatus(data);
            } else {
                setServerHungStatus({ "ServerName": {} });
            }
        } catch(error) {
            console.error('Error fetching hung status:', error);
            setServerHungStatus({ "ServerName": {} });
            setErrorApi((prevState)=>({
                ...prevState,
                "ServerHungStatus": "API didnt load"
            }));
        } finally {
            setLoading(prevLoading=>({
                ...prevLoading,
                "serverHungStatus" : false
            }));
        }
    };


    var fetchDCXPortData = (criticalServerNames, warningServerNames, okayServerNames,locationToServers) => {
        console.log("Fetching DCX Critical Servers data");
        console.log("The server names passed for critical servers are", criticalServerNames);

        if (Array.isArray(criticalServerNames)) {
            console.log("criticalserverNames is an array");
        } else {
            console.log("serverNames is NOT an array");
        }
      
        if (!Array.isArray(criticalServerNames)) {
            console.log("critical serverNames was not an array. Converting to array.");
            criticalServerNames = [criticalServerNames];
        }
    
        var url = new URL(baseUrl + 'dcxPortWatcher');
        var params = {
            "servers": criticalServerNames,
            "condition": "critical", mode: "portDetails"
        };
    
        fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(params)
        })
        .then((response) => {
            if (!response.ok) {
                throw new Error("Non-200 response");
            }
            return response.json();
        })
        .then((data) => {
            console.log("Fetched Critical Servers DCX Data:", data);
            console.log("The port details for critical are", data)
            Object.keys(data).forEach(server => {
                let region = "Unknown";
                for (const loc in locationToServers) {
                  if (locationToServers[loc].some(s => s.toLowerCase() === server.toLowerCase())) {
                    region = loc;
                    break;
                  }
                }
              
                // Now add region to each port object
                data[server] = data[server].map(entry => ({
                  ...entry,
                  region
                }));
              });
            setDcxCriticalServersPortData(data);
            setLoading(prevLoading=>({
                ...prevLoading,
                "dcxPortDetails" : false
            }));
        })
        .catch((error) => {
            console.error("Error fetching Critical Servers port DCX Data:", error);
            setDcxCriticalServersPortData({});
        });



        //fetch dcx servers warning data
        console.log("Fetching DCX Warning Servers data");
        console.log("The server names passed for warning servers are", warningServerNames);
    
        if (Array.isArray(warningServerNames)) {
            console.log("waningserverNames is an array");
        } else {
            console.log("serverNames is NOT an array");
        }
    
    
        if (!Array.isArray(warningServerNames)) {
            console.log("serverNames was not an array. Converting to array.");
            warningServerNames = [warningServerNames];
        }
    
        var url = new URL(baseUrl + 'dcxPortWatcher');
        var params = {
            "servers": warningServerNames,
            "condition": "warning", mode: "portDetails"
        };
    
        fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(params)
        })
        .then((response) => {
            if (!response.ok) {
                throw new Error("Non-200 response");
            }
            return response.json();
        })
        .then((data) => {
            console.log("Fetched Warning Servers DCX Data:", data);
            console.log("The port details for warning are", data);
            Object.keys(data).forEach(server => {
                let region = "Unknown";
                for (const loc in locationToServers) {
                  if (locationToServers[loc].some(s => s.toLowerCase() === server.toLowerCase())) {
                    region = loc;
                    break;
                  }
                }
              
                // Now add region to each port object
                data[server] = data[server].map(entry => ({
                  ...entry,
                  region
                }));
              });
            setDcxWarningServersPortData(data);
            setLoading(prevLoading=>({
                ...prevLoading,
                "dcxPortDetails" : true
            }));
        })
        .catch((error) => {
            console.error("Error fetching Warning Servers port DCX Data:", error);
            setDcxWarningServersPortData({})
        });


        //fetch dcx servers okay data
        console.log("Fetching DCX okay Servers ports data");
        console.log("The server names passed for warning servers are", okayServerNames);
    
        if (Array.isArray(okayServerNames)) {
            console.log("okay serverNames is an array");
        } else {
            console.log("serverNames is NOT an array");
        }
    
        if (!Array.isArray(okayServerNames)) {
            console.log("serverNames was not an array. Converting to array.");
            okayServerNames = [okayServerNames];
        }
    
        var url = new URL(baseUrl + 'dcxPortWatcher');
        var params = {
            "servers": okayServerNames,
            "condition": "okay", mode: "portDetails"
        };
    
        fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(params)
        })
        .then((response) => {
            if (!response.ok) {
                throw new Error("Non-200 response");
            }
            return response.json();
        })
        .then((data) => {
            console.log("Fetched okay Servers DCX Data:", data);
            console.log("The port details for okay are", data);
            Object.keys(data).forEach(server => {
                let region = "Unknown";
                for (const loc in locationToServers) {
                  if (locationToServers[loc].some(s => s.toLowerCase() === server.toLowerCase())) {
                    region = loc;
                    break;
                  }
                }
              
                data[server] = data[server].map(entry => ({
                  ...entry,
                  region
                }));
              });
            setDcxOkayServersPortData(data);
            setLoading(prevLoading=>({
                ...prevLoading,
                "dcxPortDetails" : false
            }));
        })
        .catch((error) => {
            console.error("Error fetching OKay Servers port DCX Data:", error);
            setDcxOkayServersPortData({})
        });


    };

      

    var fetchDCXPortWatcherServerHealthData = async (serverName) => {
        console.log("DCX port watcher")
        console.log("The server names passed for dcx portwatcher are", serverName)
        var url = new URL(baseUrl + 'dcxPortWatcher');
        var params = { "serverName": serverName.replace(/'/g, ""), mode: "allServers" };
        setLoading(prevLoading => ({
            ...prevLoading,
            "dcxPortWatcherData": true
        }));
        setErrorApi((prevState)=>({
            ...prevState,
            "dcxServerStatus": ""
        }))
        
        fetch(url, {
            method: 'POST', // because your Flask route expects GET
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(params)
            // No body needed for GET
        })
        .then((response) => {
            if (!response.ok) {
                throw new Error("Non-200 response");
            }
            return response.json();
        })
        .then((data) => {
            console.log("Fetched DCX Server Data:", data);
            setDcxFullServerDetailsData(data);

            const criticalServers = data.ServerStatus.filter(server => server.critical > 0).map(server => server.server);
            console.log("The fetched critical servers are", criticalServers)
            const warningServers = data.ServerStatus.filter(server => server.warning > 0 && server.critical === 0).map(server => server.server);
            const okayServers = data.ServerStatus.filter(server => server.okay > 0 && server.warning === 0 && server.critical === 0).map(server => server.server);
            
            const criticalServersCount = criticalServers.length;
            const warningServersCount = warningServers.length;
            const okayServersCount = okayServers.length;
            

            // Log or set the critical servers data
            console.log("Critical Servers:", criticalServers);
            console.log("Warning servers", warningServers)
            console.log("okay Servers:",okayServers)
            console.log("Critical servers count is", criticalServersCount)
            console.log("Warning server count is", warningServersCount)
            console.log("okay server count is", okayServersCount)
            
          
            setCriticalDcxServers(criticalServers)
            setWarningDcxServers(warningServers)
            setOkayDcxServers(okayServers)
           
            setCriticalDcxServersCount(criticalServersCount)
            setWarningDcxServersCount(warningServersCount)
            setOkayDcxServersCount(okayServersCount)
      

            const locationToServers = data.LocationToServersMapping; 
            let locationsDownList = [];
            let locationsDownCount = 0;

            Object.entries(locationToServers).forEach(([location, servers]) => {
                const [server1, server2] = servers;

                if (criticalServers.includes(server1) || criticalServers.includes(server2)) {
                    locationsDownList.push({
                        location: location,
                        servers: [server1, server2]
                    });
                    locationsDownCount += 1; // +2 if both servers are critical
                }
            });

            console.log("Locations fully down (with servers):", locationsDownList);
            console.log("Locations down count:", locationsDownCount);

            // Set the state with the updated lists
            setDcxLocationsDown(locationsDownList);
            setDcxLocationsDownCount(locationsDownCount);

            // fetchCriticalServersDCXPortData(criticalServers)
            // fetchWarningServersDCXPortData(warningServers)
            // fetchOkayServersDCXPortData(okayServers)

            fetchDCXPortData(criticalServers, warningServers, okayServers,locationToServers);


            setLoading(prevLoading => ({
                ...prevLoading,
                "dcxPortWatcherData": false
            }));
        })
        .catch((error) => {
            console.log("in catch errorrrrrrrrrrrrrrrr")
            setLoading(prevLoading => ({
                ...prevLoading,
                "dcxPortWatcherData": false
            }));
            
            setErrorApi((prevState)=>({
                ...prevState,
                "dcxServerStatus": "API didnt load"
            }))
            
            console.log("Error fetching DCX Server Data:", error);
        });
    }


    var fetchDiskDetailsForCloud = async (serverName) => {
        // Reset VM details and set loading state for the disk details
        setVmSkuDetails([]);
    
        // Prepare parameters for the API request
        var params = { vm: serverName };
    
        // Construct the API URL
        var urldisk = new URL(baseUrl + 'diskSkuRecommendation');
    
        // Fetch data from the API
        fetch(urldisk, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(params),
        })
        .then((response) => {
            if (!response.ok) {
                throw new Error("Non-200 response");
            }
            return response.json();
        })
        .then((data) => {
            if (data && data.length > 0) {
                setVmSkuDetails(data); // Update the VM details state
                const averages = calculateAverages(data); // Calculate and set averages
                setVmAverages(averages);
            } else {
                setVmSkuDetails([]); // Reset the VM details state if no data is available
            }
            setLoading((prevLoading) => ({
                ...prevLoading,
                "diskDetails": false,
            }));
        })
        .catch((error) => {
            console.error("Error fetching disk details:", error);
            setVmSkuDetails([]); // Reset the VM details state on error
            setLoading((prevLoading) => ({
                ...prevLoading,
                "diskDetails": false,
            }));
            setErrorApi((prevState) => ({
                ...prevState,
                "diskDetails": "Error fetching disk details.",
            }));
        });
    };

var handleUtilizationFilterChange = (event, value, type) => {
   console.log("Inside filter change", type, value);

   if (type === "ServerName") {
       const normalizedValue = value || [];
       setServerNameFilter(normalizedValue);
       if (hostingTypeFilter === "Cloud" && normalizedValue.length > 0) {
           fetchDiskDetailsForCloud(normalizedValue);
       }
       if (hostingTypeFilter === "OnPremise") {
           setVmSkuDetails([]);
       }
       return;
   }
   if (type === "HostingType") {
       if (value !== null && value !== "") {
           setHostingTypeFilter(value);
       }
       setServerNameFilter([]);      
       if (value === "OnPremise") {
           setVmSkuDetails([]);
       }
       return;
   }
}

    // Helper function to calculate averages for disk automation, treating null values as 0
    const calculateAverages = (details) => {
        const totalVMs = details.length;

        const average = {
            cachedThroughput: details.reduce((sum, vm) => sum + (vm.cachedThroughput || 0), 0) / totalVMs,
            uncachedThroughput: details.reduce((sum, vm) => sum + (vm.uncachedThroughput || 0), 0) / totalVMs,
            cachedIOPS: details.reduce((sum, vm) => sum + (vm.cachedIOPS || 0), 0) / totalVMs,
            uncachedIOPS: details.reduce((sum, vm) => sum + (vm.uncachedIOPS || 0), 0) / totalVMs,
        };
        Object.keys(average).forEach(key => average[key] = average[key].toFixed(1));
        return average;
    };

    // Blade view is now the only UI (removed isBladeView check)
    const isDcxApp = Object.keys(queryParams).length > 0 && (
        (queryParams["Type"] === "Application CI" && queryParams["Name"]?.toLowerCase() === 'deviceconx-phs') ||
        (queryParams["Type"] === "VM" && ['devicappvevn2rg', 'devicappvgsbqgv', 'devicappv97889v', 'devicappvj7glso', 'devicappvows6vq', 'devicappvq5vy63', 'devicappv6dxb24', 'devicappv9qldlm'].includes(queryParams["Name"]?.toLowerCase()))
    );

    // Seasonal pattern insights — resolve the servers currently in view and open the side pane
    const getPatternServers = () => {
        if (Array.isArray(serverNameFilter) && serverNameFilter.length) {
            return serverNameFilter.map((s) => String(s).toLowerCase());
        }
        const names = new Set();
        [serverCpuUtilization, serverMemoryUtilization, serverDiskUtilization].forEach((d) => {
            Object.values((d && d.ServerName) || {}).forEach((n) => { if (n) names.add(String(n).toLowerCase()); });
        });
        return Array.from(names);
    };
    const openPatternPane = (metric) => { setPatternMetric(metric); setPatternPaneOpen(true); };

    // Stable key for the in-scope servers so the availability probe only fires
    // when the actual server set changes, not on every utilization re-render.
    const patternServersKey = useMemo(
        () => getPatternServers().slice().sort().join('|'),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [serverCpuUtilization, serverMemoryUtilization, serverDiskUtilization, serverNameFilter]
    );

    // Probe ADX once per (metric, server-set) to decide whether to render the
    // Insights button at all. Each metric is probed independently so one
    // missing dataset (e.g. Disk) does not hide the button for the others.
    useEffect(() => {
        if (!patternServersKey) {
            setPatternAvailability({ CPU: 'none', Memory: 'none', Disk: 'none' });
            return;
        }
        const servers = patternServersKey.split('|').filter(Boolean);
        if (servers.length === 0) {
            setPatternAvailability({ CPU: 'none', Memory: 'none', Disk: 'none' });
            return;
        }
        let cancelled = false;
        setPatternAvailability({ CPU: 'loading', Memory: 'loading', Disk: 'loading' });
        ['CPU', 'Memory', 'Disk'].forEach(async (metric) => {
            try {
                const res = await fetchPatternAnalysis_fromADX({ domain: 'utilization', metric, servers });
                if (cancelled) return;
                const has = Array.isArray(res) && res.some((r) => r && r.Data);
                setPatternAvailability((prev) => ({ ...prev, [metric]: has ? 'available' : 'none' }));
            } catch {
                if (!cancelled) setPatternAvailability((prev) => ({ ...prev, [metric]: 'none' }));
            }
        });
        return () => { cancelled = true; };
    }, [patternServersKey]);

    // Renders the per-metric Insights affordance: a small spinner while the
    // probe is in-flight, the bordered button when data exists, and nothing
    // at all when ADX has no pattern records for this appCI / metric.
    const renderInsightsButton = (metric) => {
        const state = patternAvailability[metric];
        if (state === 'none') return null;
        if (state === 'loading') {
            return (
                <Box sx={{ ml: 1.5, display: 'flex', alignItems: 'center', height: 22 }}>
                    <CircularProgress size={14} sx={{ color: '#00338E' }} />
                </Box>
            );
        }
        return (
            <Tooltip title="Seasonal pattern insights" arrow>
                <Button
                    size="small"
                    variant="outlined"
                    startIcon={<InsightsOutlinedIcon sx={{ fontSize: 14 }} />}
                    onClick={() => openPatternPane(metric)}
                    sx={{
                        ml: 1.5,
                        minWidth: 0,
                        px: 0.9,
                        py: 0.15,
                        fontSize: 10.5,
                        fontWeight: 600,
                        lineHeight: 1.2,
                        color: '#00338E',
                        borderColor: '#00338E',
                        borderRadius: 1,
                        textTransform: 'none',
                        '&:hover': { borderColor: '#00338E', bgcolor: '#EEF3FC' },
                        '& .MuiButton-startIcon': { mr: 0.5 },
                    }}
                >
                    Insights
                </Button>
            </Tooltip>
        );
    };

    return (
        <Box sx={{ minHeight: "100vh", bgcolor: "#FFFFFF" }}>
               
                <Modal
                    open={modalOpen}
                    onClose={handleModalClose}
                    sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', opacity: '0.90' }}
                >
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', border: 2, backgroundColor: 'white', flexDirection: 'column', gap: 2, maxHeight: '70vh', overflowY: 'auto', minWidth: '800px' }} p={2}>
                        <Typography variant='h5'><i>{modalHeader}</i></Typography>
                        <Grid container spacing={2} width="100%">
                            <Grid item xs={12} md={modalType === "DCX Port Watcher" || modalType === "Reboot Event" ? 6 : 12}>
                                <Autocomplete
                                    options={autocompleteOptions}
                                    renderInput={(params) => <TextField {...params} label="Select Server" variant="outlined" size="small" />}
                                    onChange={handleServerChange}
                                    fullWidth
                                />
                            </Grid>
                            {modalType === "DCX Port Watcher" && (
                                <Grid item xs={12} md={6}>
                                    <Autocomplete
                                        options={portOptions}
                                        renderInput={(params) => <TextField {...params} label="Select Port" variant="outlined" size="small" />}
                                        onChange={handlePortChange}
                                        fullWidth
                                    />
                                </Grid>
                            )}
                            {modalType === "Reboot Event" && (
                                <Grid item xs={12} md={6}>
                                    <Autocomplete
                                        options={descriptionOptions}
                                        renderInput={(params) => <TextField {...params} label="Select Description" variant="outlined" size="small" />}
                                        onChange={handleDescriptionChange}
                                        fullWidth
                                    />
                                </Grid>
                            )}
                        </Grid>
                        <ModalTable />
                    </Box>
                </Modal>

                {/* Per-process CPU/Memory breakdown modal */}
                <Modal
                    open={processModalOpen}
                    onClose={() => { setProcessModalOpen(false); setProcessServerFilter(null); }}
                    sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', opacity: '0.98' }}
                >
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, backgroundColor: 'white', border: 2, p: 2, maxHeight: '80vh', overflowY: 'auto', width: '75vw', maxWidth: 1100 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                            <Typography variant='h5'><i>{processModalMetric === 'cpu' ? 'CPU' : 'Memory'} - Process Details</i></Typography>
                            <ToggleButtonGroup
                                size="small"
                                exclusive
                                value={processViewMode}
                                onChange={(e, val) => { if (val) setProcessViewMode(val); }}
                                sx={{ height: 30 }}
                            >
                                <ToggleButton value="table" sx={{ textTransform: 'none', fontSize: 11, px: 1.5,
                                    '&.Mui-selected': { bgcolor: '#00338E', color: '#fff', '&:hover': { bgcolor: '#002766' } } }}>Table</ToggleButton>
                                <ToggleButton value="graph" sx={{ textTransform: 'none', fontSize: 11, px: 1.5,
                                    '&.Mui-selected': { bgcolor: '#00338E', color: '#fff', '&:hover': { bgcolor: '#002766' } } }}>Graph</ToggleButton>
                            </ToggleButtonGroup>
                        </Box>
                        {!loadingProcessMetrics && getProcessServerOptions().length > 0 && (
                            <Autocomplete
                                size="small"
                                options={getProcessServerOptions()}
                                value={processServerFilter}
                                onChange={(e, val) => { setProcessServerFilter(val); setProcessPage(0); }}
                                renderInput={(params) => <TextField {...params} label="Filter by Server" variant="outlined" size="small" />}
                                sx={{ minWidth: 260, maxWidth: 360 }}
                            />
                        )}
                        {loadingProcessMetrics ? (
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1.5, py: 5, minWidth: 400 }}>
                                <CircularProgress size={40} sx={{ color: '#00338E' }} />
                                <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#00338E' }}>Fetching process details…</Typography>
                                <Typography sx={{ fontSize: 11, color: '#6B7280' }}>Querying per-process {processModalMetric === 'cpu' ? 'CPU' : 'Memory'} usage for the selected server(s)</Typography>
                            </Box>
                        ) : getProcessRows(processModalMetric).length === 0 ? (
                            <Typography sx={{ fontSize: 13, color: '#F59E0B', textAlign: 'center', py: 2 }}>No process data available</Typography>
                        ) : processViewMode === 'graph' ? (() => {
                            const { data, processKeys } = getProcessChartData(processModalMetric);
                            // Height scales with number of servers so bars stay readable; scrolls when tall.
                            const chartHeight = Math.max(220, data.length * 42 + 60);
                            const axisLabel = processModalMetric === 'cpu' ? 'Avg CPU (%)' : 'Avg Memory (%)';
                            return (
                                <Box sx={{ border: '1px solid #E6E8EE', borderRadius: 2, p: 1.5, bgcolor: '#fff' }}>
                                    <Box sx={{ maxHeight: '58vh', overflowY: 'auto', overflowX: 'hidden' }}>
                                        <ResponsiveContainer width="100%" height={chartHeight}>
                                            <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#EEF2F6" />
                                                <XAxis type="number" tick={{ fontSize: 11, fill: '#6B7280' }}
                                                    label={{ value: axisLabel, position: 'insideBottom', offset: -2, fontSize: 11, fill: '#6B7280' }} />
                                                <YAxis type="category" dataKey="Server" width={140} tick={{ fontSize: 11, fill: '#374151' }} />
                                                <RechartsTooltip
                                                    contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E6E8EE' }}
                                                    formatter={(value, name) => [Number(value).toFixed(2), name]} />
                                                <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
                                                {processKeys.map((proc, i) => (
                                                    <Bar key={proc} dataKey={proc} stackId="proc"
                                                        fill={proc === 'Others' ? '#9CA3AF' : PROCESS_COLORS[i % PROCESS_COLORS.length]}
                                                        maxBarSize={26} />
                                                ))}
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </Box>
                                </Box>
                            );
                        })() : (() => {
                            const rows = getProcessRows(processModalMetric);
                            const metricLabel = processModalMetric === 'cpu' ? 'Avg CPU (%)' : 'Avg Memory (%)';
                            // Group processes under their server.
                            const groups = {};
                            rows.forEach((r) => {
                                if (!groups[r.Server]) groups[r.Server] = [];
                                groups[r.Server].push(r);
                            });
                            // Order servers by their highest process value (desc).
                            const serverList = Object.entries(groups).sort((a, b) =>
                                Number(b[1][0]?.["Avg Value"] || 0) - Number(a[1][0]?.["Avg Value"] || 0));
                            const paginatedServers = serverList.slice(processPage * processRowsPerPage, processPage * processRowsPerPage + processRowsPerPage);
                            return (
                                <Box sx={{ border: '1px solid #E6E8EE', borderRadius: 2, overflow: 'hidden' }}>
                                    <Box sx={{ maxHeight: '58vh', overflowY: 'auto' }}>
                                        {paginatedServers.map(([server, procRows]) => {
                                            const total = procRows.reduce((s, r) => s + Number(r["Avg Value"]), 0);
                                            return (
                                                <Accordion key={server} disableGutters elevation={0}
                                                    defaultExpanded={paginatedServers.length === 1}
                                                    sx={{ '&:before': { display: 'none' }, borderBottom: '1px solid #E6E8EE' }}>
                                                    <AccordionSummary expandIcon={<ExpandMoreIcon />}
                                                        sx={{ bgcolor: '#F8FAFC', minHeight: 44, '& .MuiAccordionSummary-content': { alignItems: 'center', justifyContent: 'space-between', pr: 1 } }}>
                                                        <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{server}</Typography>
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                            <Chip label={`${procRows.length} process${procRows.length > 1 ? 'es' : ''}`} size="small"
                                                                sx={{ fontSize: 10, height: 20, bgcolor: '#EEF3FC', color: '#00338E', fontWeight: 600 }} />
                                                            <Chip label={`${metricLabel.split(' ')[1]}: ${total.toFixed(2)}`} size="small"
                                                                sx={{ fontSize: 10, height: 20, bgcolor: '#EAF6EA', color: '#2E7D32', fontWeight: 600 }} />
                                                        </Box>
                                                    </AccordionSummary>
                                                    <AccordionDetails sx={{ p: 0 }}>
                                                        <Table size="small">
                                                            <TableHead>
                                                                <TableRow>
                                                                    <TableCell sx={{ fontWeight: 700, fontSize: 11, color: '#374151', bgcolor: '#fff' }}>Process</TableCell>
                                                                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: 11, color: '#374151', bgcolor: '#fff' }}>{metricLabel}</TableCell>
                                                                </TableRow>
                                                            </TableHead>
                                                            <TableBody>
                                                                {procRows.map((row, idx) => (
                                                                    <TableRow key={idx} sx={{ '&:hover': { bgcolor: '#f8fafc' } }}>
                                                                        <TableCell sx={{ fontSize: 12 }}>{row["Process"]}</TableCell>
                                                                        <TableCell align="right" sx={{ fontSize: 12, fontWeight: 600 }}>{row["Avg Value"]}</TableCell>
                                                                    </TableRow>
                                                                ))}
                                                            </TableBody>
                                                        </Table>
                                                    </AccordionDetails>
                                                </Accordion>
                                            );
                                        })}
                                    </Box>
                                    <TablePagination
                                        component="div"
                                        count={serverList.length}
                                        page={processPage}
                                        onPageChange={(e, newPage) => setProcessPage(newPage)}
                                        rowsPerPage={processRowsPerPage}
                                        onRowsPerPageChange={(e) => { setProcessRowsPerPage(parseInt(e.target.value, 10)); setProcessPage(0); }}
                                        rowsPerPageOptions={[5, 10, 25, 50]}
                                        labelRowsPerPage="Servers per page:"
                                        sx={{ borderTop: '1px solid #E6E8EE', '& .MuiTablePagination-toolbar': { minHeight: 48 } }}
                                    />
                                </Box>
                            );
                        })()}
                    </Box>
                </Modal>

                <Paper elevation={0} sx={{ borderBottom: "1px solid #E6E8EE", px: { xs: 1, sm: 2 }, py: 1, bgcolor: "#fff" }}>
                    <Grid container alignItems="center" spacing={1} sx={{ flexWrap: { xs: 'wrap', md: 'nowrap' } }}>
                        <Grid item xs={12} md="auto">
                            <Typography sx={{ fontSize: { xs: 12, sm: 13, md: 14 }, fontWeight: 800, color: "#111827" }}>
                                {Object.keys(queryParams).length > 0 ? (queryParams["Type"] === "VM" ? queryParams["ApplicationCI"]?.toUpperCase() : queryParams["Name"]?.toUpperCase()) : ""}
                            </Typography>
                        </Grid>
                        
                        <Grid item sx={{ flex: 1, display: { xs: 'none', md: 'block' } }} />
                        
                        <Grid item xs="auto">
                            <ToggleButtonGroup
                                size="small"
                                value={hostingTypeFilter}
                                exclusive
                                onChange={(e, val) => { if (val) setHostingTypeFilter(val); }}
                                sx={{ height: { xs: 26, sm: 28 } }}
                            >
                                {["Cloud", "OnPremise"].filter(ht => Object.keys(data).length === 0 || Object.keys(data).some(s => data[s]?.HostingType === ht)).map((ht) => {
                                    const hasData = Object.keys(data).some(s => data[s]?.HostingType === ht);
                                    const warn = hasData && hostingTypeHasWarning(ht);
                                    const sel = hostingTypeFilter === ht;
                                    return (
                                        <ToggleButton key={ht} value={ht} disabled={!hasData}
                                            title={warn ? `${ht} has server(s) above ${WARNING_THRESHOLD}% utilization` : ''}
                                            sx={{ fontSize: { xs: 10, sm: 11 }, px: { xs: 1, sm: 1.5 }, textTransform: 'none',
                                                ...(warn && { color: sel ? '#FFFFFF !important' : '#D97706', backgroundColor: sel ? '#D97706 !important' : '#FEF3C7', '&:hover': { backgroundColor: sel ? '#B45309' : '#FDE68A' } })
                                            }}>
                                            {ht}
                                        </ToggleButton>
                                    );
                                })}
                            </ToggleButtonGroup>
                        </Grid>

                        {Object.keys(data).length > 0 && (
                            <Grid item xs={12} sm="auto">
                                <Autocomplete
                                    size="small"
                                    multiple
                                    disableCloseOnSelect
                                    options={["Select All", ...Object.keys(data).filter(s => data[s]?.HostingType === hostingTypeFilter)]}
                                    value={serverNameFilter}
                                    onChange={(e, val) => {
                                        const allServers = Object.keys(data).filter(s => data[s]?.HostingType === hostingTypeFilter);
                                        if (val.includes("Select All")) {
                                            setServerNameFilter(allServers);
                                        } else {
                                            setServerNameFilter(val);
                                        }
                                    }}
                                    sx={{ minWidth: { xs: '100%', sm: 200 }, maxWidth: { sm: 280 } }}
                                    renderOption={(props, opt) => {
                                        if (opt === "Select All") {
                                            return (
                                                <Box {...props} key={opt} sx={{ py: 0.5, px: 1.5, fontWeight: 600, color: '#1976d2', borderBottom: '1px solid #E0E0E0' }}>
                                                    <Typography variant="body2" sx={{ fontSize: { xs: 11, sm: 12 }, fontWeight: 600 }}>Select All</Typography>
                                                </Box>
                                            );
                                        }
                                        const selected = serverNameFilter.includes(opt);
                                        return (
                                            <Box {...props} key={opt} sx={{ py: 0.5, px: 1.5, bgcolor: selected ? 'rgba(0, 51, 142, 0.08)' : 'transparent',
                                                borderLeft: selected ? '3px solid #00338e' : '3px solid transparent', '&:hover': { bgcolor: selected ? 'rgba(0, 51, 142, 0.12)' : 'rgba(0,0,0,0.04)' } }}>
                                                <Typography variant="body2" sx={{ fontSize: { xs: 11, sm: 12 }, fontWeight: selected ? 600 : 400 }}>{opt}</Typography>
                                            </Box>
                                        );
                                    }}
                                    renderInput={(params) => (
                                        <TextField {...params} placeholder="Server Name" size="small" 
                                            sx={{ "& .MuiOutlinedInput-root": { fontSize: { xs: 11, sm: 12 } } }} />
                                    )}
                                    renderTags={(value, getTagProps) => {
                                        const chipLimit = 1;
                                        return (
                                            <>
                                                {value.slice(0, chipLimit).map((option, index) => (
                                                    <Chip {...getTagProps({ index })} key={option} label={option} size="small" 
                                                        sx={{ fontSize: { xs: 10, sm: 11 }, height: { xs: 20, sm: 22 }, backgroundColor: "#fff", border: "1px solid #E0E0E0" }} />
                                                ))}
                                                {value.length > chipLimit && (
                                                    <Typography sx={{ fontSize: { xs: 10, sm: 11 }, color: '#1976d2', ml: 0.5, fontWeight: 500 }}>
                                                        +{value.length - chipLimit}
                                                    </Typography>
                                                )}
                                            </>
                                        );
                                    }}
                                />
                            </Grid>
                        )}
                    </Grid>
                </Paper>

                <Box sx={{ px: { xs: 1, sm: 2 }, py: 2 }}>
                    <Typography sx={{ fontSize: { xs: 13, sm: 14 }, fontWeight: 800, color: "#111827", mb: 2 }}>Overview</Typography>

                    <Grid container spacing={2} sx={{ mb: 2 }}>
                        
                        <Grid item xs={12} md={isDcxApp ? 4 : 6}>
                        <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, overflow: "hidden", height: '100%' }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: { xs: 1, sm: 2 }, py: 1 }}>
                                <Typography sx={{ fontSize: { xs: 11, sm: 12, md: 13 }, fontWeight: 800, color: '#7E92A2' }}>Server Availability</Typography>
                                <Tooltip title="Shows server uptime and status" arrow>
                                    <InfoOutlined sx={{ fontSize: { xs: 14, sm: 16 }, color: '#6B7280', cursor: 'pointer' }} />
                                </Tooltip>
                            </Box>
                            <Divider sx={{ bgcolor: '#D1D5DB', height: 2, mx: 1 }} />
                            <Grid container alignItems="center" sx={{ px: 1, py: 0.5 }}>
                                <Grid item xs={4} sx={{ textAlign: 'center' }}>
                                    <Typography sx={{ fontSize: { xs: 9, sm: 10, md: 11 }, fontWeight: 500, color: '#4B5563' }}>Avg Uptime</Typography>
                                </Grid>
                                <Grid item xs={4} sx={{ textAlign: 'center' }}>
                                    <Typography sx={{ fontSize: { xs: 9, sm: 10, md: 11 }, fontWeight: 500, color: '#4B5563' }}>Status</Typography>
                                </Grid>
                                <Grid item xs={4} sx={{ textAlign: 'center' }}>
                                    <Typography sx={{ fontSize: { xs: 9, sm: 10, md: 11 }, fontWeight: 500, color: '#4B5563' }}>Reboots</Typography>
                                </Grid>
                            </Grid>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1, py: 1.5 }}>
                                <Box sx={{ flex: 1, textAlign: 'center' }}>
                                    {loading["serverStatus"] ? <CircularProgress size={16} /> : errorApi["serverStatus"] ? (
                                        <Alert severity="error" sx={{ fontSize: { xs: 8, sm: 9 }, p: 0.25 }}>Error</Alert>
                                    ) : (
                                        <Tooltip title="Avg Uptime" arrow>
                                            <Typography onClick={() => createModal("Uptime Hours", "Server Uptime")} sx={{ fontSize: { xs: 18, sm: 20, md: 22 }, fontWeight: 'bold', color: '#24C674', cursor: 'pointer', '&:hover': { transform: 'scale(1.05)' } }}>
                                                {calculateAverageUptime()}
                                            </Typography>
                                        </Tooltip>
                                    )}
                                </Box>
                                <Divider orientation="vertical" flexItem sx={{ height: 40, mx: 0.5, borderRightWidth: 2, borderColor: '#9CA3AF' }} />
                                <Box sx={{ flex: 1, textAlign: 'center' }}>
                                    {loading["serverStatus"] ? <CircularProgress size={16} /> : errorApi["ServerStatus"] ? (
                                        <Alert severity="error" sx={{ fontSize: { xs: 8, sm: 9 }, p: 0.25 }}>Error</Alert>
                                    ) : (
                                        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
                                            <Tooltip title="Servers Up" arrow>
                                                <Box onClick={() => createModal("Servers Up", "Server Status", "up")} sx={{ width: { xs: 22, sm: 24, md: 26 }, height: { xs: 22, sm: 24, md: 26 }, borderRadius: '50%', background: 'linear-gradient(to bottom, #24C674, #10B981)', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', '&:hover': { transform: 'scale(1.1)' } }}>
                                                    <Typography sx={{ fontSize: { xs: 8, sm: 9, md: 10 }, color: '#fff', fontWeight: 'bold' }}>{getServerStatus("Up")}</Typography>
                                                </Box>
                                            </Tooltip>
                                            <Tooltip title="Servers Down" arrow>
                                                <Box onClick={() => createModal("Servers Down", "Server Status", "down")} sx={{ width: { xs: 22, sm: 24, md: 26 }, height: { xs: 22, sm: 24, md: 26 }, borderRadius: '50%', background: '#DC2626', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', '&:hover': { transform: 'scale(1.1)' } }}>
                                                    <Typography sx={{ fontSize: { xs: 8, sm: 9, md: 10 }, color: '#fff', fontWeight: 'bold' }}>{getServerStatus("Down")}</Typography>
                                                </Box>
                                            </Tooltip>
                                            <Tooltip title="Servers Hung" arrow>
                                                <Box onClick={() => createModal("Servers Hung", "Server Status", "Hung")} sx={{ width: { xs: 22, sm: 24, md: 26 }, height: { xs: 22, sm: 24, md: 26 }, borderRadius: '50%', background: 'linear-gradient(to bottom, #d59a59, #d59a59)', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', '&:hover': { transform: 'scale(1.1)' } }}>
                                                    <Typography sx={{ fontSize: { xs: 8, sm: 9, md: 10 }, color: '#fff', fontWeight: 'bold' }}>{loading["serverHungStatus"] ? <CircularProgress size={8} sx={{color:'#fff'}} /> : getServerHungStatus()}</Typography>
                                                </Box>
                                            </Tooltip>
                                        </Box>
                                    )}
                                </Box>
                                <Divider orientation="vertical" flexItem sx={{ height: 40, mx: 0.5, borderRightWidth: 2, borderColor: '#9CA3AF' }} />
                                <Box sx={{ flex: 1, textAlign: 'center' }}>
                                    {loading["rebootEvent"] ? <CircularProgress size={16} /> : errorApi["RebootEvent"] ? (
                                        <Alert severity="error" sx={{ fontSize: { xs: 8, sm: 9 }, p: 0.25 }}>Error</Alert>
                                    ) : rebootEventCard["Graceful"] === "NA" || rebootEventCard["Crash"] === "NA" ? (
                                        <Typography sx={{ fontSize: { xs: 8, sm: 9 }, color: '#24C674', fontWeight: 'bold' }}>No Reboots</Typography>
                                    ) : (
                                        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
                                            <Tooltip title="Graceful Reboot" arrow>
                                                <Box onClick={() => createModal("Graceful Reboot", "Reboot Event", "Graceful")} sx={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(to bottom, #24C674, #10B981)', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', '&:hover': { transform: 'scale(1.1)' } }}>
                                                    <Typography sx={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>{rebootEventCard["Graceful"]}</Typography>
                                                </Box>
                                            </Tooltip>
                                            <Tooltip title="Crash Reboot" arrow>
                                                <Box onClick={() => createModal("Crash Reboot", "Reboot Event", "Crash")} sx={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(to bottom, #d59a59, #d59a59)', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', '&:hover': { transform: 'scale(1.1)' } }}>
                                                    <Typography sx={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>{rebootEventCard["Crash"]}</Typography>
                                                </Box>
                                            </Tooltip>
                                        </Box>
                                    )}
                                </Box>
                            </Box>
                        </Paper>
                        </Grid>

                        <Grid item xs={12} md={isDcxApp ? 4 : 6}>
                        <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, overflow: "hidden", height: '100%' }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: { xs: 1, sm: 2 }, py: 1 }}>
                                <Typography sx={{ fontSize: { xs: 11, sm: 12, md: 13 }, fontWeight: 800, color: '#7E92A2' }}>Server Compliance</Typography>
                                <Tooltip title="Patch compliance, tag compliance and backup status" arrow>
                                    <InfoOutlined sx={{ fontSize: { xs: 14, sm: 16 }, color: '#6B7280', cursor: 'pointer' }} />
                                </Tooltip>
                            </Box>
                            <Divider sx={{ bgcolor: '#D1D5DB', height: 2, mx: 1 }} />
                            <Grid container alignItems="center" sx={{ px: 1, py: 0.5 }}>
                                <Grid item xs={4} sx={{ textAlign: 'center' }}>
                                    <Typography sx={{ fontSize: { xs: 9, sm: 10, md: 11 }, fontWeight: 500, color: '#4B5563' }}>Patch</Typography>
                                </Grid>
                                <Grid item xs={4} sx={{ textAlign: 'center' }}>
                                    <Typography sx={{ fontSize: { xs: 9, sm: 10, md: 11 }, fontWeight: 500, color: '#4B5563' }}>Tag</Typography>
                                </Grid>
                                <Grid item xs={4} sx={{ textAlign: 'center' }}>
                                    <Typography sx={{ fontSize: { xs: 9, sm: 10, md: 11 }, fontWeight: 500, color: '#4B5563' }}>Backup</Typography>
                                </Grid>
                            </Grid>
                            <Box sx={{ display: 'flex', alignItems: 'center', px: 1, py: 1.5 }}>
                                <Box sx={{ width: '33.3%', textAlign: 'center' }}>
                                    {loading["patchCompliance"] ? <CircularProgress size={16} /> : errorApi["patchCompliance"] ? (
                                        <Alert severity="error" sx={{ fontSize: { xs: 8, sm: 9 }, p: 0.25 }}>Error</Alert>
                                    ) : !patchCompliance?.ServerName ? (
                                        <Typography sx={{ fontSize: { xs: 8, sm: 9 }, color: '#F59E0B' }}>No Data</Typography>
                                    ) : (
                                        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
                                            <Tooltip title="Compliant" arrow>
                                                <Box onClick={() => createModal("Compliant Servers", "Patch Compliance", 1)} sx={{ width: { xs: 22, sm: 24, md: 26 }, height: { xs: 22, sm: 24, md: 26 }, borderRadius: '50%', background: 'linear-gradient(to bottom, #24C674, #10B981)', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', '&:hover': { transform: 'scale(1.1)' } }}>
                                                    <Typography sx={{ fontSize: { xs: 8, sm: 9, md: 10 }, color: '#fff', fontWeight: 'bold' }}>
                                                        {new Set(Object.keys(patchCompliance.ServerName).filter(key => parseInt(patchCompliance.IsServerCompliant[key], 10) === 1 && getHostingTypeForServer(patchCompliance.ServerName[key]) === hostingTypeFilter).map(key => patchCompliance.ServerName[key])).size}
                                                    </Typography>
                                                </Box>
                                            </Tooltip>
                                            <Tooltip title="Non-Compliant" arrow>
                                                <Box onClick={() => createModal("Non-Compliant Servers", "Patch Compliance", 0)} sx={{ width: { xs: 22, sm: 24, md: 26 }, height: { xs: 22, sm: 24, md: 26 }, borderRadius: '50%', background: 'linear-gradient(to bottom, #d59a59, #d59a59)', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', '&:hover': { transform: 'scale(1.1)' } }}>
                                                    <Typography sx={{ fontSize: { xs: 8, sm: 9, md: 10 }, color: '#fff', fontWeight: 'bold' }}>
                                                        {new Set(Object.keys(patchCompliance.ServerName).filter(key => parseInt(patchCompliance.IsServerCompliant[key], 10) === 0 && getHostingTypeForServer(patchCompliance.ServerName[key]) === hostingTypeFilter).map(key => patchCompliance.ServerName[key])).size}
                                                    </Typography>
                                                </Box>
                                            </Tooltip>
                                        </Box>
                                    )}
                                </Box>
                                <Divider orientation="vertical" flexItem sx={{ height: 40, mx: 0.5, borderRightWidth: 2, borderColor: '#9CA3AF' }} />
                                {/* Tag Compliance */}
                                <Box sx={{ width: '33.3%', textAlign: 'center' }}>
                                    {loading["tagCompliance"] ? <CircularProgress size={16} /> : errorApi["Tag Compliance"] ? (
                                        <Alert severity="error" sx={{ fontSize: { xs: 8, sm: 9 }, p: 0.25 }}>Error</Alert>
                                    ) : tagComplianceDataCard === -1 || tagComplianceDataCard === "NA" ? (
                                        <Typography sx={{ fontSize: { xs: 8, sm: 9 }, color: '#F59E0B' }}>No Data</Typography>
                                    ) : (
                                        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
                                            <Tooltip title="Compliant" arrow>
                                                <Box onClick={() => createModal("Tag Compliant Servers", "Tag Compliance", 0)} sx={{ width: { xs: 22, sm: 24, md: 26 }, height: { xs: 22, sm: 24, md: 26 }, borderRadius: '50%', background: 'linear-gradient(to bottom, #24C674, #10B981)', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', '&:hover': { transform: 'scale(1.1)' } }}>
                                                    <Typography sx={{ fontSize: { xs: 8, sm: 9, md: 10 }, color: '#fff', fontWeight: 'bold' }}>
                                                        {Object.entries(tagComplianceDataCard).filter(([server, issues]) => issues.length === 0 && getHostingTypeForServer(server) === hostingTypeFilter).length}
                                                    </Typography>
                                                </Box>
                                            </Tooltip>
                                            <Tooltip title="Non-Compliant" arrow>
                                                <Box onClick={() => createModal("Tag Non-Compliant Servers", "Tag Compliance", 1)} sx={{ width: { xs: 22, sm: 24, md: 26 }, height: { xs: 22, sm: 24, md: 26 }, borderRadius: '50%', background: 'linear-gradient(to bottom, #d59a59, #d59a59)', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', '&:hover': { transform: 'scale(1.1)' } }}>
                                                    <Typography sx={{ fontSize: { xs: 8, sm: 9, md: 10 }, color: '#fff', fontWeight: 'bold' }}>
                                                        {Object.entries(tagComplianceDataCard).filter(([server, issues]) => issues.length > 0 && getHostingTypeForServer(server) === hostingTypeFilter).length}
                                                    </Typography>
                                                </Box>
                                            </Tooltip>
                                        </Box>
                                    )}
                                </Box>
                                <Divider orientation="vertical" flexItem sx={{ height: 40, mx: 0.5, borderRightWidth: 2, borderColor: '#9CA3AF' }} />
                                {/* Backup */}
                                <Box sx={{ width: '33.3%', textAlign: 'center' }}>
                                    {loading["serverStatus"] ? <CircularProgress size={16} /> : errorApi["serverStatus"] ? (
                                        <Alert severity="error" sx={{ fontSize: { xs: 8, sm: 9 }, p: 0.25 }}>Error</Alert>
                                    ) : (
                                        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
                                            <Tooltip title="Backup Complete" arrow>
                                                <Box onClick={() => createModal("Backup Complete", "Backup Status", "Complete")} sx={{ width: { xs: 22, sm: 24, md: 26 }, height: { xs: 22, sm: 24, md: 26 }, borderRadius: '50%', background: 'linear-gradient(to bottom, #24C674, #10B981)', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', '&:hover': { transform: 'scale(1.1)' } }}>
                                                    <Typography sx={{ fontSize: { xs: 8, sm: 9, md: 10 }, color: '#fff', fontWeight: 'bold' }}>
                                                        {Object.keys(serverStatus["Backup Status"] || {}).filter(key => { let s = serverStatus["Backup Status"][key]?.trim().toLowerCase(); return (s === "completed" || s === "success") && serverStatus["HostingType"]?.[key] === hostingTypeFilter; }).length}
                                                    </Typography>
                                                </Box>
                                            </Tooltip>
                                            <Tooltip title="Backup Failed" arrow>
                                                <Box onClick={() => createModal("Backup Fail", "Backup Status", "Failed")} sx={{ width: { xs: 22, sm: 24, md: 26 }, height: { xs: 22, sm: 24, md: 26 }, borderRadius: '50%', background: 'linear-gradient(to bottom, #d59a59, #d59a59)', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', '&:hover': { transform: 'scale(1.1)' } }}>
                                                    <Typography sx={{ fontSize: { xs: 8, sm: 9, md: 10 }, color: '#fff', fontWeight: 'bold' }}>
                                                        {Object.keys(serverStatus["Backup Status"] || {}).filter(key => { let s = serverStatus["Backup Status"][key]?.trim().toLowerCase(); return !(s === "completed" || s === "success") && serverStatus["HostingType"]?.[key] === hostingTypeFilter; }).length}
                                                    </Typography>
                                                </Box>
                                            </Tooltip>
                                        </Box>
                                    )}
                                </Box>
                            </Box>
                        </Paper>
                        </Grid>

                        {/* DCX Port Status Card - Only for DCX apps */}
                        {isDcxApp && (
                            <Grid item xs={12} md={4}>
                            <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, overflow: "hidden", height: '100%', boxShadow: (criticalDcxServersCount > 0 || warningDcxServersCount > 0) ? '2px 2px 2px rgba(238, 0, 0, 0.5)' : 'none' }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: { xs: 1, sm: 2 }, py: 1 }}>
                                    <Typography sx={{ fontSize: { xs: 11, sm: 12, md: 13 }, fontWeight: 800, color: '#7E92A2' }}>Port Status</Typography>
                                    <Tooltip title="Shows counts of servers in different statuses and how many regions are down" arrow>
                                        <InfoOutlined sx={{ fontSize: { xs: 14, sm: 16 }, color: '#6B7280', cursor: 'pointer' }} />
                                    </Tooltip>
                                </Box>
                                <Divider sx={{ bgcolor: '#D1D5DB', height: 2, mx: 1 }} />
                                {/* Labels */}
                                <Grid container alignItems="center" sx={{ px: 1, py: 0.5 }}>
                                    <Grid item xs={7} sx={{ textAlign: 'center' }}>
                                        <Typography sx={{ fontSize: { xs: 9, sm: 10, md: 11 }, fontWeight: 500, color: '#4B5563' }}>Servers</Typography>
                                    </Grid>
                                    <Grid item xs={5} sx={{ textAlign: 'center' }}>
                                        <Typography sx={{ fontSize: { xs: 9, sm: 10, md: 11 }, fontWeight: 500, color: '#4B5563' }}>Region</Typography>
                                    </Grid>
                                </Grid>
                                {/* Content */}
                                <Box sx={{ display: 'flex', alignItems: 'center', px: 1, py: 1.5 }}>
                                    {loading["dcxPortWatcherData"] || loading["dcxPortDetails"] ? <CircularProgress size={16} /> : errorApi["dcxServerStatus"] !== "" ? (
                                        <Alert severity="error" sx={{ fontSize: { xs: 8, sm: 9 }, p: 0.25, width: '100%' }}>Error</Alert>
                                    ) : !dcxFullServerDetailsData ? (
                                        <Typography sx={{ fontSize: { xs: 8, sm: 9 }, color: '#F59E0B' }}>No Data</Typography>
                                    ) : (
                                        <>
                                            {/* Server Statuses */}
                                            <Box sx={{ width: '60%', textAlign: 'center' }}>
                                                <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
                                                    {[
                                                        { label: 'Critical', value: criticalDcxServersCount, level: 1 },
                                                        { label: 'Warning', value: warningDcxServersCount, level: 2 },
                                                        { label: 'Healthy', value: okayDcxServersCount, level: 3 }
                                                    ].map((s, i) => (
                                                        <Box key={i} textAlign="center" onClick={s.value > 0 ? () => createModal(`Servers with Ports in ${s.label} State`, 'DCX Port Watcher', s.label) : undefined} sx={{ cursor: s.value > 0 ? 'pointer' : 'default', '&:hover': { transform: s.value > 0 ? 'scale(1.1)' : 'none' } }}>
                                                            <Box sx={{ width: { xs: 22, sm: 24, md: 26 }, height: { xs: 22, sm: 24, md: 26 }, borderRadius: '50%', backgroundImage: gradientColors[s.level], display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 0.25 }}>
                                                                <Typography sx={{ color: '#fff', fontWeight: 'bold', fontSize: { xs: 8, sm: 9, md: 10 } }}>{s.value}</Typography>
                                                            </Box>
                                                            <Typography sx={{ fontSize: { xs: 7, sm: 8 }, color: s.label === 'Critical' && criticalDcxServersCount > 0 ? '#d59a59' : s.label === 'Warning' && warningDcxServersCount > 0 ? '#D97706' : '#6B7280' }}>{s.label}</Typography>
                                                        </Box>
                                                    ))}
                                                </Box>
                                            </Box>
                                            <Divider orientation="vertical" flexItem sx={{ height: 40, mx: 0.5, borderRightWidth: 2, borderColor: '#9CA3AF' }} />
                                            {/* Down Regions */}
                                            <Box sx={{ width: '40%', textAlign: 'center' }}>
                                                 <Box
                                                    onClick={dcxLocationsDownCount > 0 ? () => createModal('Servers with Ports Down', 'DCX Port Watcher', 'Down') : undefined}
                                                    sx={{
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        cursor: dcxLocationsDownCount > 0 ? 'pointer' : 'default',
                                                        transition: 'transform 0.2s',
                                                        '&:hover': { transform: dcxLocationsDownCount > 0 ? 'scale(1.1)' : 'none' }
                                                    }}
                                                >
                                                    <Box
                                                        sx={{
                                                            width: { xs: 22, sm: 24, md: 26 },
                                                            height: { xs: 22, sm: 24, md: 26 },
                                                            borderRadius: '50%',
                                                            backgroundImage: dcxLocationsDownCount > 0 ? gradientColors[0] : gradientColors[3],
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            mb: 0.25
                                                        }}
                                                    >
                                                        <Typography sx={{ color: '#fff', fontWeight: 'bold', fontSize: { xs: 8, sm: 9, md: 10 } }}>
                                                            {dcxLocationsDownCount}
                                                        </Typography>
                                                    </Box>
                                                    <Typography sx={{ fontSize: { xs: 7, sm: 8 }, color: dcxLocationsDownCount > 0 ? '#DC2626' : '#6B7280' }}>Down</Typography>
                                                </Box>  
                                                {/* <Typography sx={{ fontSize: { xs: 7, sm: 8 }, color: dcxLocationsDown.length > 0 ? '#d59a59' : '#6B7280', mt: 0.25 }}>Down</Typography> */}
                                            </Box>
                                        </>
                                    )}
                                </Box>
                            </Paper>
                            </Grid>
                        )}
                    </Grid>

                    {/* Performance Metrics Section - Graphs */}
                    <Typography sx={{ fontSize: 14, fontWeight: 800, color: "#111827", mb: 2, mt: 3 }}>Performance Metrics</Typography>
                    
                    {/* Disk Graph - First */}
                    <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, overflow: "visible", mb: 2 }}>
                        <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                            {/* Left side: Title, Drive Buttons, and Dropdown */}
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                <Typography sx={{ fontSize: 13, fontWeight: 800, color: "#111827", mr: 1 }}>Disk</Typography>
                                {/* Disk Drive Buttons */}
                                <ButtonGroup variant="text" size="small" sx={{ mr: hasAdditionalData && hostingTypeFilter === "Cloud" ? 1 : 0 }}>
                                    {diskOptions.map((disk) => {
                                        const hasWarning = drivesWithWarnings.includes(disk);
                                        const isSelected = diskDriveChoice === disk;
                                        // Only show yellow warning styling when warning chip is selected
                                        const showWarningStyle = hasWarning && diskWarningSelected;
                                        // Grey out (disable) drives where the selected server has no data
                                        const hasData = serverDiskUtilizationGraphData[disk]?.length > 0;
                                        
                                        return (
                                            <Tooltip 
                                                key={disk}
                                                title={!hasData ? 'No data for this drive on the selected server' : (hasWarning ? `${diskWarningServers[disk]?.length || 0} server(s) above ${WARNING_THRESHOLD}%` : '')}
                                            >
                                                <span>
                                                <Button 
                                                    disabled={!hasData}
                                                    onClick={(e) => handleDiskFilterChange(e, disk)} 
                                                    sx={{ 
                                                        fontSize: 10, 
                                                        minWidth: 30,
                                                        color: !hasData
                                                            ? '#9CA3AF'
                                                            : isSelected 
                                                                ? 'white' 
                                                                : showWarningStyle ? '#D97706' : '#00338E',
                                                        backgroundColor: !hasData
                                                            ? '#F3F4F6'
                                                            : isSelected 
                                                                ? (showWarningStyle ? '#D97706' : '#00338E') 
                                                                : (showWarningStyle ? '#FEF3C7' : 'white'),
                                                        border: `1px solid ${!hasData ? '#E5E7EB' : showWarningStyle ? '#D97706' : '#00338E'}`,
                                                        '&.Mui-disabled': {
                                                            color: '#9CA3AF',
                                                            backgroundColor: '#F3F4F6',
                                                            border: '1px solid #E5E7EB',
                                                        },
                                                        '&:hover': {
                                                            backgroundColor: isSelected 
                                                                ? (showWarningStyle ? '#B45309' : '#001F5C') 
                                                                : (showWarningStyle ? '#FDE68A' : '#f0f0f0'),
                                                        },
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 0.25
                                                    }}
                                                >
                                                    {disk}
                                                </Button>
                                                </span>
                                            </Tooltip>
                                        );
                                    })}
                                </ButtonGroup>
                                {/* Utilization / Reads / Writes Dropdown - Only for Cloud */}
                                {hostingTypeFilter === "Cloud" && hasAdditionalData && (
                                    <Select
                                        value={selectedChart}
                                        onChange={handleChartChange}
                                        size="small"
                                        sx={{
                                            minWidth: 100,
                                            maxHeight: 28,
                                            backgroundColor: "#00338E",
                                            borderRadius: 2,
                                            color: "white",
                                            fontWeight: "bold",
                                            fontSize: 11,
                                            fontFamily: "Barlow, sans-serif",
                                            "& .MuiSelect-icon": { color: "white" },
                                            "&:hover": { backgroundColor: "#002766" },
                                            "& .MuiOutlinedInput-notchedOutline": { border: "none" },
                                        }}
                                    >
                                        {Object.entries(chartDataMap)
                                            .filter(([key, data]) => key === "utilization" || (data && Object.keys(data).length > 0))
                                            .map(([key]) => (
                                                <MenuItem 
                                                    key={key} 
                                                    value={key} 
                                                    disabled={key !== "utilization"}
                                                    sx={{ 
                                                        color: key === "utilization" ? "#00338E" : "#9CA3AF", 
                                                        fontWeight: "bold", 
                                                        fontSize: 12,
                                                        fontFamily: "Barlow, sans-serif",
                                                        "&.Mui-disabled": { opacity: 0.6 }
                                                    }}
                                                >
                                                    {key === "utilization" ? "Utilization"
                                                        : key === "reads" ? "Average Reads"
                                                        : key === "writes" ? "Average Writes"
                                                        : key === "readBytes" ? "Avg Read Bytes"
                                                        : key === "writeBytes" ? "Avg Write Bytes"
                                                        : "Average Latency"}
                                                </MenuItem>
                                            ))}
                                    </Select>
                                )}
                                 {renderInsightsButton('Disk')}
                            </Box>
                            {/* Right side: Warning chip - shown if any drive has warnings */}
                            {drivesWithWarnings.length > 0 && (
                                <WarningChip 
                                    tooltipText={diskWarningSelected 
                                        ? `${diskWarningServers[diskDriveChoice]?.length || 0} server(s) above ${WARNING_THRESHOLD}% on ${diskDriveChoice}: ${(diskWarningServers[diskDriveChoice] || []).map(s => `${s.name} (${s.value.toFixed(1)}%)`).join(', ') || 'None on this drive'}`
                                        : `Click to show warnings. Drives with warnings: ${drivesWithWarnings.join(', ')}`
                                    }
                                    isSelected={diskWarningSelected}
                                    onClick={() => {
                                        if (diskWarningSelected) {
                                            // Deselecting: just toggle off, keep current drive
                                            setDiskWarningSelected(false);
                                        } else {
                                            // Selecting: switch to first drive with warning
                                            setDiskWarningSelected(true);
                                            if (drivesWithWarnings.length > 0 && !drivesWithWarnings.includes(diskDriveChoice)) {
                                                setDiskDriveChoice(drivesWithWarnings[0]);
                                            }
                                        }
                                    }}
                                />
                            )}
                        </Box>
                        <Divider sx={{ borderColor: "#E6E8EE" }} />
                        <Box sx={{ px: 2, py: 2, height: { xs: 220, sm: 260, md: 300 } }}>
                            {loading["serverDiskUtilization"] ? (
                                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><CircularProgress size={24} /></Box>
                            ) : errorApi["serverDiskUtilization"] ? (
                                <Alert severity="error" sx={{ fontSize: 11 }}>API error</Alert>
                            ) : !chartDataMap[selectedChart]?.[diskDriveChoice] || chartDataMap[selectedChart][diskDriveChoice].length === 0 ? (
                                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><Typography sx={{ fontSize: 12, color: "#F59E0B" }}>No Data</Typography></Box>
                            ) : (
                                <AreaLineChart 
                                    type="disk"
                                    data={chartDataMap[selectedChart][diskDriveChoice]}
                                    yAxisLabel={selectedChart === "utilization" ? "Utilization %" : selectedChart}
                                    domain={selectedChart === "utilization" ? [0, 100] : []}
                                    key={selectedChart}
                                    drive={diskDriveChoice}
                                    totalCapacity={totalCapacity[diskDriveChoice]}
                                    freeSpace={freeSpace[diskDriveChoice]}
                                />
                            )}
                        </Box>
                    </Paper>

                    {/* CPU Graph */}
                    <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, overflow: "visible", mb: 2 }}>
                        <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Typography sx={{ fontSize: 13, fontWeight: 800, color: "#111827" }}>CPU Utilization</Typography>
                                {renderInsightsButton('CPU')}
                            </Box>
                            {(cpuWarningServers.length > 0 || hasUtilAboveProcessThreshold(serverCpuUtilization)) && <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                {cpuWarningServers.length > 0 && <WarningChip 
                                    tooltipText={`${cpuWarningServers.length} server(s) above ${WARNING_THRESHOLD}%: ${cpuWarningServers.map(s => `${s.name} (${s.value.toFixed(1)}%)`).join(', ')}`}
                                    isSelected={cpuWarningSelected}
                                    onClick={() => setCpuWarningSelected(!cpuWarningSelected)}
                                />}
                                <ProcessDetailsChip metric="cpu" />
                            </Box>}
                        </Box>
                        <Divider sx={{ borderColor: "#E6E8EE" }} />
                        <Box sx={{ px: 2, py: 2, height: { xs: 220, sm: 260, md: 300 } }}>
                            {loading["serverCpuUtilization"] ? (
                                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><CircularProgress size={24} /></Box>
                            ) : errorApi["serverCpuUtilization"] ? (
                                <Alert severity="error" sx={{ fontSize: 11 }}>API error</Alert>
                            ) : Object.keys(serverCpuUtilizationGraphData).length === 0 ? (
                                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><Typography sx={{ fontSize: 12, color: "#F59E0B" }}>No Data</Typography></Box>
                            ) : (
                                <AreaLineChart type="cpu" data={serverCpuUtilizationGraphData} key={`cpu-${cpuWarningSelected}`} yAxisLabel={"Utilization %"} domain={[0, 100]} />
                            )}
                        </Box>
                    </Paper>

                    {/* Memory Graph */}
                    <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, overflow: "visible", mb: 2 }}>
                        <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Typography sx={{ fontSize: 13, fontWeight: 800, color: "#111827" }}>Memory Utilization</Typography>
                                {renderInsightsButton('Memory')}
                            </Box>
                            {(memoryWarningServers.length > 0 || hasUtilAboveProcessThreshold(serverMemoryUtilization)) && <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                {memoryWarningServers.length > 0 && <WarningChip 
                                    tooltipText={`${memoryWarningServers.length} server(s) above ${WARNING_THRESHOLD}%: ${memoryWarningServers.map(s => `${s.name} (${s.value.toFixed(1)}%)`).join(', ')}`}
                                    isSelected={memoryWarningSelected}
                                    onClick={() => setMemoryWarningSelected(!memoryWarningSelected)}
                                />}
                                <ProcessDetailsChip metric="memory" />
                            </Box>}
                        </Box>
                        <Divider sx={{ borderColor: "#E6E8EE" }} />
                        <Box sx={{ px: 2, py: 2, height: { xs: 220, sm: 260, md: 300 } }}>
                            {loading["serverMemoryUtilization"] ? (
                                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><CircularProgress size={24} /></Box>
                            ) : errorApi["serverMemoryUtilization"] ? (
                                <Alert severity="error" sx={{ fontSize: 11 }}>API error</Alert>
                            ) : Object.keys(serverMemoryUtilizationGraphData).length === 0 ? (
                                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><Typography sx={{ fontSize: 12, color: "#F59E0B" }}>No Data</Typography></Box>
                            ) : (
                                <AreaLineChart type="memory" data={serverMemoryUtilizationGraphData} key={`memory-${memoryWarningSelected}`} yAxisLabel={"Utilization %"} domain={[0, 100]} />
                            )}
                        </Box>
                    </Paper>

                    {/* Load Balancer Section — only shown when Cloud hosting type is selected */}
                    {(() => {
                        if (hostingTypeFilter !== "Cloud") return null;

                        const lbGraphData = !loading["loadBalancerUtilization"] && loadBalancerMetrics && Object.keys(loadBalancerMetrics).length >= 2
                            ? createGraphData(loadBalancerMetrics, "loadbalancer", serverNameFilter, "Cloud")
                            : null;
                        const hasLbData = lbGraphData && lbGraphData.vipAvailability && Object.keys(lbGraphData.vipAvailability).length > 0;

                        if (!loading["loadBalancerUtilization"] && !hasLbData) return null;

                        return (
                            <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, overflow: "visible", mb: 2 }}>
                                <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                    <Typography sx={{ fontSize: 13, fontWeight: 800, color: "#111827", mr: 1 }}>Load Balancer Metrics</Typography>
                                    {hasLbData && (
                                        <Select
                                            value={loadBalancerChoice}
                                            onChange={(e) => setLoadBalancerChoice(e.target.value)}
                                            size="small"
                                            sx={{
                                                minWidth: 200,
                                                maxHeight: 28,
                                                backgroundColor: "#00338E",
                                                borderRadius: 2,
                                                color: "white",
                                                fontWeight: "bold",
                                                fontSize: 11,
                                                fontFamily: "Barlow, sans-serif",
                                                "& .MuiSelect-icon": { color: "white" },
                                                "&:hover": { backgroundColor: "#002766" },
                                                "& .MuiOutlinedInput-notchedOutline": { border: "none" },
                                            }}
                                        >
                                            {Object.keys(lbGraphData.vipAvailability).map((lb) => (
                                                <MenuItem key={lb} value={lb} sx={{ color: "#00338E", fontWeight: "bold", fontSize: 12, fontFamily: "Barlow, sans-serif" }}>
                                                    {lb}
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    )}
                                </Box>
                                <Divider sx={{ borderColor: "#E6E8EE" }} />
                                <Box sx={{ px: 2, py: 2 }}>
                                    {loading["loadBalancerUtilization"] ? (
                                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: { xs: 220, sm: 260, md: 300 } }}><CircularProgress size={24} /></Box>
                                    ) : !hasLbData ? (
                                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: { xs: 220, sm: 260, md: 300 } }}>
                                            <Typography sx={{ fontSize: 12, color: "#F59E0B" }}>No Load Balancer Data</Typography>
                                        </Box>
                                    ) : (() => {
                                        const loadBalancerMetricsConfig = [
                                            { key: "vipAvailability", yAxisLabel: "VIP Availability %", domain: [0, 100] },
                                            { key: "dipAvailability", yAxisLabel: "DIP Availability %", domain: [0, 100] },
                                            { key: "throughput", yAxisLabel: "Throughput (mbps)", domain: [] },
                                            { key: "requestCount", yAxisLabel: "Request Count", domain: [] },
                                            { key: "inboundConnections", yAxisLabel: "Inbound Connections/sec", domain: [] },
                                            { key: "outboundConnections", yAxisLabel: "Outbound Connections/sec", domain: [] },
                                        ];
                                        return (
                                            <Grid container spacing={2} justifyContent="center" alignItems="center">
                                                {loadBalancerMetricsConfig.map((metric) => {
                                                    const lbData = lbGraphData[metric.key]?.[loadBalancerChoice] || {};
                                                    const chartData = Object.values(lbData).map(entry => {
                                                        if (!entry || typeof entry !== 'object') return { name: '' };
                                                        const { name, ...servers } = entry;
                                                        const firstServerValue = Object.values(servers)[0];
                                                        return { name, [loadBalancerChoice]: firstServerValue };
                                                    }).filter(d => d.name);

                                                    return (
                                                        <Grid item xs={12} md={6} key={`${loadBalancerChoice}-${metric.key}`}>
                                                            <Box sx={{ height: { xs: 220, sm: 260, md: 300 } }}>
                                                                <AreaLineChart
                                                                    type="loadbalancer"
                                                                    data={chartData.length > 0 ? chartData : []}
                                                                    yAxisLabel={metric.yAxisLabel}
                                                                    domain={metric.domain}
                                                                    objectName={metric.key}
                                                                />
                                                            </Box>
                                                        </Grid>
                                                    );
                                                })}
                                            </Grid>
                                        );
                                    })()}
                                </Box>
                            </Paper>
                        );
                    })()}
                    
                    {/* Fileshare Section - Hidden in blade view, user should use FileshareBeta component instead */}
                    {false && queryParams["Type"] !== "VM" && !loading["fileshareUtilization"] && Object.keys(serverFileshareUtilization).length >= 2 && (
                        <>
                            <Typography sx={{ fontSize: 14, fontWeight: 800, color: "#111827", mb: 2, mt: 3 }}>FileShare Utilization</Typography>
                            
                            {/* Fileshare Filters */}
                            <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, p: 2, mb: 2 }}>
                                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                    <Autocomplete
                                        size="small"
                                        options={getAllStorageAccounts()}
                                        value={selectedAccount}
                                        onChange={(event, newValue) => handleAccountChange(newValue)}
                                        sx={{ minWidth: 180, flex: 1 }}
                                        renderInput={(params) => (
                                            <TextField {...params} placeholder="Storage Account" size="small" sx={{ "& .MuiOutlinedInput-root": { fontSize: 11 } }} />
                                        )}
                                    />
                                    <Autocomplete
                                        size="small"
                                        multiple
                                        options={getAllFileshares()}
                                        value={selectedFileshares.length === getAllFileshares().length ? [] : selectedFileshares}
                                        onChange={(event, newValue) => {
                                            if (newValue.length === 0) {
                                                setSelectedFileshares(getAllFileshares());
                                            } else {
                                                setSelectedFileshares(newValue);
                                            }
                                        }}
                                        sx={{ minWidth: 180, flex: 1 }}
                                        renderInput={(params) => (
                                            <TextField {...params} placeholder="Fileshare" size="small" sx={{ "& .MuiOutlinedInput-root": { fontSize: 11 } }} />
                                        )}
                                        renderTags={(value, getTagProps) =>
                                            value.length === getAllFileshares().length
                                                ? []
                                                : value.slice(0, 2).map((option, index) => (
                                                    <Chip {...getTagProps({ index })} key={option} label={option.split('/')[1] || option} size="small" sx={{ fontSize: 9, height: 18 }} />
                                                )).concat(value.length > 2 ? [<Chip key="more" label={`+${value.length - 2}`} size="small" sx={{ fontSize: 9, height: 18 }} />] : [])
                                        }
                                    />
                                </Box>
                            </Paper>

                            {/* Fileshare Content Grid */}
                            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '5fr 7fr' }, gap: 2, mb: 2 }}>
                                {/* Fileshare Table */}
                                <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, overflow: "visible" }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, py: 1 }}>
                                        <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>Capacity Usage</Typography>
                                    </Box>
                                    <Divider sx={{ borderColor: "#E6E8EE" }} />
                                    <TableContainer sx={{ maxHeight: 220, overflowY: 'auto' }}>
                                        <Table size="small" stickyHeader>
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell sx={{ fontWeight: 600, fontSize: 10, bgcolor: '#F9FAFB', color: '#374151', py: 0.5 }}>Fileshare</TableCell>
                                                    <TableCell sx={{ fontWeight: 600, fontSize: 10, bgcolor: '#F9FAFB', color: '#374151', width: '55%', py: 0.5 }}>Usage</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {sortedFileshares.map((fileshare) => {
                                                    const { usedCapacity, provisionedCapacity } = getCapacityForFileshare(fileshare);
                                                    const utilizationPercentage = provisionedCapacity > 0 ? (usedCapacity / provisionedCapacity) * 100 : 0;
                                                    const [storageAccount, fileshareName] = fileshare.split("/");
                                                    const progressBarColor = utilizationPercentage > 80 ? "#EF4444" : utilizationPercentage > 60 ? "#F59E0B" : "#10B981";

                                                    return (
                                                        <TableRow key={fileshare} sx={{ '&:hover': { bgcolor: '#F9FAFB' } }}>
                                                            <TableCell sx={{ fontSize: 10, py: 0.5 }}>
                                                                <Tooltip title={`Storage: ${storageAccount}`} arrow>
                                                                    <Box sx={{ display: 'inline-block', cursor: 'pointer' }}>{fileshareName}</Box>
                                                                </Tooltip>
                                                            </TableCell>
                                                            <TableCell sx={{ py: 0.5 }}>
                                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                    <Box sx={{ flex: 1, position: 'relative' }}>
                                                                        <LinearProgress
                                                                            variant="determinate"
                                                                            value={Math.min(utilizationPercentage, 100)}
                                                                            sx={{
                                                                                height: 14,
                                                                                borderRadius: 2,
                                                                                backgroundColor: '#E5E7EB',
                                                                                "& .MuiLinearProgress-bar": { backgroundColor: progressBarColor, borderRadius: 2 },
                                                                            }}
                                                                        />
                                                                        <Typography sx={{ position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)', fontSize: 8, fontWeight: 600, color: '#fff' }}>
                                                                            {usedCapacity.toFixed(1)}/{provisionedCapacity.toFixed(1)} GiB
                                                                        </Typography>
                                                                    </Box>
                                                                    <Typography sx={{ fontSize: 9, fontWeight: 600, color: '#374151', minWidth: 35, textAlign: 'right' }}>
                                                                        {utilizationPercentage.toFixed(1)}%
                                                                    </Typography>
                                                                </Box>
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                </Paper>

                                {/* Fileshare Graph */}
                                <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, overflow: "hidden" }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, py: 1 }}>
                                        <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>Utilization Trend</Typography>
                                    </Box>
                                    <Divider sx={{ borderColor: "#E6E8EE" }} />
                                    <Box sx={{ px: 2, py: 1, height: 180 }}>
                                        {Object.keys(fileShareGraphData).length === 0 ? (
                                            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                                                <Typography sx={{ fontSize: 11, color: "#F59E0B" }}>No Graph Data</Typography>
                                            </Box>
                                        ) : (
                                            <AreaLineChart type="fileShare" data={fileShareGraphData} yAxisLabel="Utilization %" />
                                        )}
                                    </Box>
                                </Paper>
                            </Box>
                        </>
                    )}
                </Box>

                <PatternInsightsPane
                    open={patternPaneOpen}
                    onClose={() => setPatternPaneOpen(false)}
                    domain="utilization"
                    metric={patternMetric}
                    servers={getPatternServers()}
                    fetchUtilization={fetchPaneUtilizationLast30d}
                />
            </Box>
        );
}

export default ServerDrillDown;