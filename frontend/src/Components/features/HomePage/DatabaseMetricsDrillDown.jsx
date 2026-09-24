import React, { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom';
import Grid from '@mui/material/Unstable_Grid2';
import { Modal, Card, CardContent, Typography, Box, Accordion, AccordionSummary, AccordionDetails, Divider, Button, TextField, ButtonGroup, Autocomplete,MenuItem,Select,IconButton,Chip,LinearProgress } from '@mui/material';
import { styled } from '@mui/material/styles';
import {useLocation} from 'react-router-dom'
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell,{ tableCellClasses } from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import CircularProgress from '@mui/material/CircularProgress';
import AreaLineChart from '../../shared/LineChart/AreaLineChart';
import ReactSpeedometer from 'react-d3-speedometer/slim'
import Alert from '@mui/material/Alert';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import InfoOutlined from '@mui/icons-material/InfoOutlined'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { BoltRounded, KeyOff, TroubleshootRounded, TryOutlined } from '@mui/icons-material';
import UpTimeIcon from '../../Static/Images/UpTime.svg'
import ServerStatusIcon from '../../Static/Images/ServerStatus.svg'
import PatchComplianceIcon from '../../Static/Images/PatchCompliance.svg'
import TagComplianceIcon from '../../Static/Images/TagCompliance.svg'
import RebootsIcon from '../../Static/Images/Reboots.svg'
import Tooltip from '@mui/material/Tooltip';
import ClearIcon from '@mui/icons-material/Clear'; 
import '../../../assets/css/fonts.css';
import {getUrl} from '../../../environment'
import { logPageVisit,startPageTracking,appInsights } from '../appInsights';
import LocationIcon from '../../Static/Images/LocationIcon.svg'
import { convertTimeToPreferredTZ, convertTimeToPreferredTZ_ToUtc, convertTimeToPreferredTZ_fromUtc } from '../../shared/Timestamp/PreferenceConversion';
import CircularProgress_Styled from '../../shared/UI Components/CircularProgress'
import { fetchDatabaseMetrics_fromADX } from '../../shared/APIs/fetchAPIs';

// Constants - Define once, use everywhere
const DATA_COLUMNS = ["TimeGenerated", "Server Name", "Database Name", "Cpu Utilization", "Storage Utilization", "DTU Utilization", "Session Count", "Data Read Transaction", "Data Write Transaction", "Deadlocks", "Connection Failure User", "Connection Failure System", "Availability"];
const ADX_TO_COLUMN_MAP = {
    "cpu_percent": "Cpu Utilization",
    "storage_percent": "Storage Utilization",
    "dtu_consumption_percent": "DTU Utilization",
    "sessions_count": "Session Count",
    "physical_data_read_percent": "Data Read Transaction",
    "log_write_percent": "Data Write Transaction",
    "deadlock": "Deadlocks",
    "connection_failed_user_error": "Connection Failure User",
    "connection_failed": "Connection Failure System"
};

// Helper: Create empty column-based data structure
const createEmptyDataStructure = () => DATA_COLUMNS.reduce((acc, col) => ({ ...acc, [col]: {} }), {});

const StyledCard = styled(Card)({
    width: '100%',
    boxShadow: '0px 3px 6px rgba(0, 0, 0, 0.16)',
    padding: 4,
    position: 'relative',
});

function DatabaseMetrics({date,globalFilterChoice, globalFilterData, appInsights, hospitalInformation,preferredTZ, appName: appNameProp}) { 

    var [modalOpen, setModalOpen] = useState(false);
    var [modalHeader, setModalHeader] = useState("");
    var [modalTableContent, setModalTableContent] = useState({ header: [], data: [] });

    var [errorApi, setErrorApi] = useState({
        "Database" : "",
    });
    var [loading, setLoading] = useState({
        "Database" : false,
    });
    var [appName, setAppName] = useState(appNameProp || "")
    var [databaseData, setDatabaseData] = useState({})
    var [pageLoad, setPageLoad] = useState(0)
    var navigate = useNavigate()
    var location = useLocation()
    var [queryParams, setQueryParams] = useState({})

    var [selectedServer, setSelectedServer] = useState([])
    var [selectedDatabase, setSelectedDatabase] = useState([])
    var [filteredData, setFilteredData] = useState({})

    // Warning threshold and selection states
    const WARNING_THRESHOLD = 95;
    const [metricWarnings, setMetricWarnings] = useState({ cpu: [], dtu: [], storage: [] });
    const [warningSelected, setWarningSelected] = useState({ cpu: true, dtu: true, storage: true });

    // Helper: Get latest value per database for a metric
    const getLatestPerDatabase = (data, metricKey) => {
        if (!data?.["Database Name"] || !data?.[metricKey]) return {};
        const latest = {};
        Object.keys(data["Database Name"]).forEach((i) => {
            const dbKey = `${data["Server Name"][i]}/${data["Database Name"][i]}`;
            const time = new Date(data["TimeGenerated"][i]);
            const value = data[metricKey][i];
            if (value != null && (!latest[dbKey] || new Date(latest[dbKey].time) < time)) {
                latest[dbKey] = { time: data["TimeGenerated"][i], value };
            }
        });
        return latest;
    };

    // Helper: Get warnings (>=95%) and highest from latest data
    const getTargetInfo = (latestData) => {
        const sorted = Object.entries(latestData).sort((a, b) => b[1].value - a[1].value);
        return {
            warnings: sorted.filter(([_, v]) => v.value >= WARNING_THRESHOLD).map(([name, v]) => ({ name, value: v.value })),
            highest: sorted[0] ? { name: sorted[0][0], value: sorted[0][1].value } : null
        };
    };

    // Helper: Compute which databases to show based on warning selection and filter
    const computeAllowedDatabases = (warnings, highest, isWarningSelected, filterNames) => {
        const warningNames = warnings.map(w => w.name.toLowerCase());
        const filterLower = filterNames.map(x => x.toLowerCase());
        if (isWarningSelected && warnings.length > 0) return [...new Set([...warningNames, ...filterLower])];
        if (filterLower.length > 0) return filterLower;
        return highest ? [highest.name.toLowerCase()] : [];
    };

    // Helper: Get selected database names in "Server/Database" format
    const getSelectedDatabaseNames = () => {

        
        // If no databases selected but servers are selected, get all databases for those servers
        if (selectedDatabase.length === 0 && selectedServer.length > 0) {
            const names = new Set();
            Object.keys(databaseData["Database Name"] || {}).forEach((key) => {
                const serverName = databaseData["Server Name"][key];
                const dbName = databaseData["Database Name"][key];
                if (selectedServer.includes(serverName)) {
                    names.add(`${serverName}/${dbName}`);
                }
            });
            return [...names];
        }
        if (selectedDatabase.length > 0) {
            const names = new Set();
            Object.keys(databaseData["Database Name"] || {}).forEach((key) => {
                const dbName = databaseData["Database Name"][key];
                const serverName = databaseData["Server Name"][key];
                if (selectedDatabase.includes(dbName) && (selectedServer.length === 0 || selectedServer.includes(serverName))) {
                    names.add(`${serverName}/${dbName}`);
                }
            });
            return [...names];
        }
        return [];
    };

    // Reusable clickable Warning Chip component
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

    var urlParams = new URLSearchParams(location.search)
    var baseUrl = getUrl()
    const apiCalled = useRef(false)

    const getServerOptions = () => {
        if (!databaseData || !databaseData["Server Name"]) return [];
        const servers = new Set(Object.values(databaseData["Server Name"]));
        return Array.from(servers).sort();
    };

    // Get database names for selected server (or all if no server selected)
    const getDatabaseOptions = () => {
        if (!databaseData || !databaseData["Database Name"]) return [];
        const databases = new Set();
        Object.keys(databaseData["Database Name"]).forEach((key) => {
            if (selectedServer.length === 0 || selectedServer.includes(databaseData["Server Name"][key])) {
                databases.add(databaseData["Database Name"][key]);
            }
        });
        return Array.from(databases).sort();
    };
    // Filter data based on selected server and database
    useEffect(() => {
        if (!databaseData || !databaseData["Database Name"]) {
            setFilteredData({});
            return;
        }
        const serverFilter = selectedServer.length > 0 ? selectedServer : null;
        const databaseFilter = selectedDatabase.length > 0 ? selectedDatabase : null;

        if (!serverFilter && !databaseFilter) {
            setFilteredData(databaseData);
            return;
        }
        
        const newFilteredData = createEmptyDataStructure();
        let newIndex = 0;
        Object.keys(databaseData["Database Name"]).forEach((key) => {
            if ((!serverFilter || serverFilter.includes(databaseData["Server Name"][key])) &&
                (!databaseFilter || databaseFilter.includes(databaseData["Database Name"][key]))) {
                const newKey = newIndex.toString();
                DATA_COLUMNS.forEach(col => { newFilteredData[col][newKey] = databaseData[col]?.[key]; });
                newIndex++;
            }
        });

        setFilteredData(newFilteredData);
    }, [databaseData, selectedServer, selectedDatabase]);

    // Calculate warnings from full databaseData so warnings persist regardless of filter
    useEffect(() => {
        if (!databaseData?.["Database Name"] || Object.keys(databaseData["Database Name"]).length === 0) {
            setMetricWarnings({ cpu: [], dtu: [], storage: [] });
            return;
        }
        setMetricWarnings({
            cpu: getTargetInfo(getLatestPerDatabase(databaseData, "Cpu Utilization")).warnings,
            dtu: getTargetInfo(getLatestPerDatabase(databaseData, "DTU Utilization")).warnings,
            storage: getTargetInfo(getLatestPerDatabase(databaseData, "Storage Utilization")).warnings
        });
    }, [databaseData]);

    useEffect(() => {
        if (selectedServer.length > 0) {
            // Check if current databases belong to selected servers
            const dbOptions = getDatabaseOptions();
            if (selectedDatabase.length > 0) {
                const validDatabases = selectedDatabase.filter(db => dbOptions.includes(db));
                if (validDatabases.length !== selectedDatabase.length) {
                    setSelectedDatabase(validDatabases);
                }
            }
        }
    }, [selectedServer]);

    useEffect(()=>{
        var filters = {
            "appFamily": [
                "All"
            ],
            "appCI": [
                "All"
            ],
            "managedByGroup": [
                "All"
            ],
            "supportGroup": [
                "All"
            ]
        }
        if(urlParams.get("Application CI")){
            var queryParam = urlParams.get("Application CI").toString()
            setAppName(queryParam)
            filters["appCI"] = [queryParam]
            setQueryParams({"Name":queryParam,"Type":"Application CI"})
        }
        else if(urlParams.get("Application Family")){
            var queryParam = urlParams.get("Application Family").toString()
            setAppName(queryParam)
            filters["appFamily"] = [queryParam]
            setQueryParams({"Name":queryParam,"Type":"Application Family"})
        }
        // Fallback: Use appNameProp if no URL params and appNameProp is provided
        else if(appNameProp){
            setQueryParams({"Name": appNameProp, "Type": "Application CI"})
        }
    },[appNameProp])

    useEffect(()=>{
        // Only call API when date is set, queryParams has Type defined, and API hasn't been called yet
        if(date["startDate"]!=="" && queryParams["Type"] && apiCalled.current===false){
            apiCalled.current = true
            getDatabasePerformanceData_fromADX(false, ["cpu","storage","dtu","deadlock","session count","log write", "log read","user connection failure","system connection failure"])
        }
    },[date,preferredTZ,queryParams])

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
        //var paramGlobalFilter = urlParams.get("globalFilter") || ""

        if(globalFilterChoice!=undefined && Object.keys(globalFilterChoice).length>0 && pageLoad!=0){
            getRegionWiseData_GlobalFilter("globalFilter")
        }
        if(pageLoad===0){
            setPageLoad(1)
        }

    },[globalFilterChoice])

    const getRegionWiseData_GlobalFilter = () => {
        var serverList = globalFilterData
        //var hospitalInformation = JSON.parse(localStorage.getItem("HospitalInformation_HomePage"))
        const getHospital_ServerData = (appCI) =>{
          var hospital = []
          var serverDetails = {}
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

    // Transform ADX data format to column-based format expected by UI
    const transformADXDataToOldFormat = (adxData) => {
        if (!adxData?.DatabaseName) return {};
        
        // Group data by TimeGenerated + ServerName + DatabaseName, pivoting ObjectName values to columns
        const groupedData = {};
        Object.keys(adxData.DatabaseName).forEach((key) => {
            const groupKey = `${adxData.TimeGenerated?.[key]}|${adxData.ServerName?.[key]}|${adxData.DatabaseName?.[key]}`;
            if (!groupedData[groupKey]) {
                groupedData[groupKey] = { "TimeGenerated": adxData.TimeGenerated?.[key], "Server Name": adxData.ServerName?.[key], "Database Name": adxData.DatabaseName?.[key] };
            }
            const col = ADX_TO_COLUMN_MAP[adxData.ObjectName?.[key]];
            if (col) groupedData[groupKey][col] = adxData.AvgValue?.[key];
        });
        
        // Convert grouped data to column-based format
        const result = createEmptyDataStructure();
        Object.values(groupedData).forEach((row, idx) => {
            const key = idx.toString();
            DATA_COLUMNS.forEach(col => { result[col][key] = row[col] ?? (col === "Availability" ? 100 : null); });
        });
        return result;
    };

    var getDatabasePerformanceData_fromADX = async(aggregate, objectName) => {
        var keyValue = "Database"
        setDatabaseData({});
        setLoading(prevLoading=>({
            ...prevLoading,
            [keyValue] : true
        }));

        var resourceKey = queryParams["Type"]
        var resourceValue = [queryParams["Name"]]

        var params = {
            "Latest Only": aggregate,
            [resourceKey]: resourceValue,
            "Start Time": convertTimeToPreferredTZ_ToUtc(date.startDate),
            "End Time": convertTimeToPreferredTZ_ToUtc(date.endDate),
            "Object Name": objectName
        };
        try{
            var results = await fetchDatabaseMetrics_fromADX(params)
            if (Object.keys(results).length > 0) {
                var convertTimeZone = convertTimeToPreferredTZ_fromUtc(results)
                // Transform ADX data to old format
                var transformedData = transformADXDataToOldFormat(convertTimeZone);
                setDatabaseData(transformedData);
            } else {
                setDatabaseData({
                    "Database Name": {}
                });
            }
        }
        catch (error) {
            console.error(error, error.message);
            setErrorApi(prev => ({ ...prev, [keyValue]: error.message }))
        }
        finally {
            setLoading(prev=>({...prev, [keyValue] : false}));
            apiCalled.current = false
        }
    }

    const sortDatabaseKeys = (keys, data) => {
        return keys.sort((a, b) => {
            const timeA = new Date(data["TimeGenerated"][a]);
            const timeB = new Date(data["TimeGenerated"][b]);
            if (timeA.getTime() !== timeB.getTime()) return timeB - timeA;
            const serverA = data["Server Name"][a];
            const serverB = data["Server Name"][b];
            if (serverA !== serverB) return serverA.localeCompare(serverB);
            const dbA = data["Database Name"][a];
            const dbB = data["Database Name"][b];
            return dbA.localeCompare(dbB);
        });
    };
    const getUniqueServerDbCount = (data, filterCondition) => {
        if (!data || !data["Database Name"]) return 0;
        const serverDbGroups = {};
        Object.keys(data["Database Name"]).forEach((key) => {
            const combo = `${data["Server Name"][key]}-${data["Database Name"][key]}`;
            if (!serverDbGroups[combo]) {
                serverDbGroups[combo] = [];
            }
            serverDbGroups[combo].push(key);
        });
        return Object.keys(serverDbGroups).filter((combo) => {
            return filterCondition(serverDbGroups[combo], data);
        }).length;
    };

    var createModalContent = (header) => {
        setModalHeader(header)
        var data = []
        var headers = ["Time Generated","Sql Server Name", "Database Name", "Availability"]
        const dataSource = filteredData;

        if(header==="Database's Up"){
            headers = ["Time Generated","Sql Server Name", "Database Name", "Availability"]
            const filteredKeys = Object.keys(dataSource["Database Name"] || {}).filter((k)=>dataSource["Availability"][k]===100);
            const sortedKeys = sortDatabaseKeys(filteredKeys, dataSource);
            sortedKeys.map((key)=>{
                data.push([dataSource["TimeGenerated"][key], dataSource["Server Name"][key], dataSource["Database Name"][key], dataSource["Availability"][key].toString()+"%"])
            })
        }
        else if(header==="Database's Down"){
            headers = ["Time Generated","Sql Server Name", "Database Name", "Availability"]
            const filteredKeys = Object.keys(dataSource["Database Name"] || {}).filter((k)=>dataSource["Availability"][k]<100);
            const sortedKeys = sortDatabaseKeys(filteredKeys, dataSource);
            sortedKeys.map((key)=>{
                data.push([dataSource["TimeGenerated"][key], dataSource["Server Name"][key], dataSource["Database Name"][key], dataSource["Availability"][key].toString()+"%"])
            })
        }
        else if(header==="Database With No Deadlocks"){
            headers = ["Time Generated","Sql Server Name", "Database Name", "Deadlocks Count"]
            const filteredKeys = Object.keys(dataSource["Database Name"] || {}).filter((k)=>dataSource["Deadlocks"][k]===0 || dataSource["Deadlocks"][k]===null);
            const sortedKeys = sortDatabaseKeys(filteredKeys, dataSource);
            sortedKeys.map((key)=>{
                data.push([dataSource["TimeGenerated"][key], dataSource["Server Name"][key], dataSource["Database Name"][key], dataSource["Deadlocks"][key]===null ? 0 : dataSource["Deadlocks"][key]])
            })
        }
        else if(header==="Database With Deadlocks"){
            headers = ["Time Generated","Sql Server Name", "Database Name","Deadlocks Count"]
            const filteredKeys = Object.keys(dataSource["Database Name"] || {}).filter((k)=>dataSource["Deadlocks"][k]>0);
            const sortedKeys = sortDatabaseKeys(filteredKeys, dataSource);
            sortedKeys.map((key)=>{
                data.push([dataSource["TimeGenerated"][key], dataSource["Server Name"][key], dataSource["Database Name"][key], dataSource["Deadlocks"][key]===null ? 0 : dataSource["Deadlocks"][key]])
            })
        }
        else if(header==="Database With No Connection Failure(s)"){
            headers = ["Time Generated", "Sql Server Name", "Database Name","User Connection Failure Count", "System Connection Failure Count"]
            const filteredKeys = Object.keys(dataSource["Database Name"] || {}).filter((k)=> (dataSource["Connection Failure User"][k]===0 || dataSource["Connection Failure User"][k]===null) && (dataSource["Connection Failure System"][k]===0 || dataSource["Connection Failure System"][k]===null));
            const sortedKeys = sortDatabaseKeys(filteredKeys, dataSource);
            sortedKeys.map((key)=>{
                data.push([dataSource["TimeGenerated"][key], dataSource["Server Name"][key], dataSource["Database Name"][key],dataSource["Connection Failure User"][key], dataSource["Connection Failure System"][key]])
            })
        }
        else if(header==="Database With Connection Failure(s)"){
            headers = ["Time Generated", "Sql Server Name", "Database Name","User Connection Failure Count", "System Connection Failure Count"]
            const filteredKeys = Object.keys(dataSource["Database Name"] || {}).filter((k)=>dataSource["Connection Failure User"][k]>0 || dataSource["Connection Failure System"][k]>0);
            const sortedKeys = sortDatabaseKeys(filteredKeys, dataSource);
            sortedKeys.map((key)=>{
                data.push([dataSource["TimeGenerated"][key], dataSource["Server Name"][key], dataSource["Database Name"][key], dataSource["Connection Failure User"][key], dataSource["Connection Failure System"][key]])
            })
        }

        setModalTableContent((prevStatus)=>({
            ...prevStatus,
            ["header"]: headers,
            ["data"]:data
        }))
        setModalOpen(true);
    }

    var handleModalClose = () => {
        setModalOpen(false);
    }

    var ModalTable = () => {

        const StyledTableCell = styled(TableCell)(({ theme }) => ({
            [`&.${tableCellClasses.head}`]: {
              backgroundColor: theme.palette.common.black,
              color: theme.palette.common.white,
            },
            [`&.${tableCellClasses.body}`]: {
              fontSize: 14,
            },
        }));

        return(
            <TableContainer component={Paper}>
                <Table sx={{ minWidth: 700 }} aria-label="customized table">
                    <TableHead>
                        <TableRow>
                            {modalTableContent['header'].map((heading)=>{
                                return  <StyledTableCell align="center">{heading.charAt(0).toUpperCase() + heading.slice(1)}</StyledTableCell>
                            })
                            }
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {modalTableContent['data'].map((entry)=>{
                            return (<TableRow>
                                {Object.values(entry).map((val)=>{
                                    return <TableCell align="center">{val}</TableCell>
                                })}
                            </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
            </TableContainer>
        )
    }

    var getGraphData = (data, utilization, allowedDatabases = []) => {
        var graphData = {}
        if(Object.keys(data).length>1 && data["TimeGenerated"]){
            // allowedDatabases is now an array of lowercase strings (Server/Database format)
            const allowedLower = allowedDatabases.length > 0 ? allowedDatabases : null;
            
            Object.keys(data["TimeGenerated"]).map((key)=>{
                var k = data["TimeGenerated"][key]
                var v = data["Server Name"][key] + "/" + data["Database Name"][key]
                
                // Filter to only include allowed databases if specified
                if (allowedLower && !allowedLower.includes(v.toLowerCase())) {
                    return;
                }
                
                if(!(k in graphData)){
                    graphData[k] = {"name":k}
                }
                graphData[k][v] = data[utilization]?.[key]
            })
        }
        return Object.values(graphData)
    }

    return(
        <>
        {/* Modal */}
        <Modal
            open={modalOpen}
            onClose={handleModalClose}
            aria-labelledby="parent-modal-title"
            aria-describedby="parent-modal-description"
            sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                opacity: '0.90'
            }}
        >
            <Box
                sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    border:2,
                    backgroundColor:'white',
                    flexDirection: 'column',
                    gap: 2,
                    maxHeight: '70vh',
                    overFlowY:'auto'
                }}
                p={2}
            >
                <Typography variant='h4'><i>{modalHeader}</i></Typography>
                <ModalTable/>
            </Box>
        </Modal>

        <Box sx={{ minHeight: "100vh", bgcolor: "#FFFFFF" }}>
            <Paper
                elevation={0}
                sx={{
                    borderBottom: "1px solid #E6E8EE",
                    height: 48,
                    px: 2,
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    bgcolor: "#fff",
                }}
            >
                <Typography sx={{ fontSize: 13, fontWeight: 800, color: "#111827" }}>
                    {appName.toUpperCase()}
                </Typography>
                <Box sx={{ flex: 1 }} />
            </Paper>

            <Box sx={{ px: 2, py: 2 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 800, color: "#111827", mb: 2 }}>
                    Overview
                </Typography>

                <Box sx={{ mb: 2, maxWidth: { xs: '100%', md: '33%' } }}>
                    <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, overflow: "hidden" }}>
                        <Box sx={{ px: 2, py: 1.5 }}>
                            <Typography sx={{ fontSize: 13, fontWeight: 800, color: "#111827" }}>Database Overview</Typography>
                        </Box>
                        <Divider sx={{ borderColor: "#E6E8EE" }} />
                        <Box sx={{ px: 2, py: 2, minHeight: 120, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                            {Object.keys(databaseData).length === 0 ? (
                                <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
                                    <CircularProgress size={20} />
                                </Box>
                            ) : errorApi["Database"] !== "" ? (
                                <Alert severity="error" sx={{ fontSize: 11, p: 0.5 }}>API error</Alert>
                            ) : Object.keys(databaseData).length === 1 || Object.keys(databaseData["Database Name"] || {}).length === 0 ? (
                                <Alert severity="warning" sx={{ fontSize: 11, p: 0.5 }}>No Database found</Alert>
                            ) : (
                                <>
                                    <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#6B7280' }}>Deadlocks</Typography>
                                    <Box sx={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                                        <Tooltip title="No Deadlocks" arrow>
                                            <Box onClick={() => createModalContent("Database With No Deadlocks")} sx={{
                                                width: { xs: 36, sm: 40, md: 42 }, height: { xs: 36, sm: 40, md: 42 },
                                                borderRadius: '50%',
                                                background: 'linear-gradient(to bottom, #24C674, #10B981)',
                                                display: 'flex', justifyContent: 'center', alignItems: 'center',
                                                cursor: 'pointer', transition: 'transform 0.2s',
                                                '&:hover': { transform: 'scale(1.1)' }
                                            }}>
                                                <Typography sx={{ color: '#fff', fontSize: { xs: 11, sm: 12, md: 13 }, fontWeight: 700 }}>
                                                    {getUniqueServerDbCount(databaseData, (keys, data) =>
                                                        keys.every((key) => data["Deadlocks"][key] === 0 || data["Deadlocks"][key] === null)
                                                    )}
                                                </Typography>
                                            </Box>
                                        </Tooltip>
                                        <Tooltip title="With Deadlocks" arrow>
                                            <Box onClick={() => createModalContent("Database With Deadlocks")} sx={{
                                                width: { xs: 36, sm: 40, md: 42 }, height: { xs: 36, sm: 40, md: 42 },
                                                borderRadius: '50%',
                                                background: 'linear-gradient(to bottom, #d59a59, #d59a59)',
                                                display: 'flex', justifyContent: 'center', alignItems: 'center',
                                                cursor: 'pointer', transition: 'transform 0.2s',
                                                '&:hover': { transform: 'scale(1.1)' }
                                            }}>
                                                <Typography sx={{ color: '#fff', fontSize: { xs: 11, sm: 12, md: 13 }, fontWeight: 700 }}>
                                                    {getUniqueServerDbCount(databaseData, (keys, data) =>
                                                        keys.some((key) => data["Deadlocks"][key] > 0)
                                                    )}
                                                </Typography>
                                            </Box>
                                        </Tooltip>
                                    </Box>
                                </>
                            )}
                        </Box>
                    </Paper>
                </Box>

                {/* Filters Section - Right aligned, compact */}
                <Box sx={{ mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
                    <Autocomplete
                        size="small"
                        multiple
                        disableCloseOnSelect
                        options={["Select All", ...getServerOptions()]}
                        value={selectedServer}
                        onChange={(event, val) => {
                            const allServers = getServerOptions();
                            if (val.includes("Select All")) {
                                setSelectedServer(allServers);
                            } else {
                                setSelectedServer(val);
                            }
                        }}
                        sx={{ minWidth: 200, maxWidth: 280 }}
                        renderOption={(props, opt) => {
                            if (opt === "Select All") {
                                return (
                                    <Box {...props} key={opt} sx={{ py: 0.5, px: 1.5, fontWeight: 600, color: '#1976d2', borderBottom: '1px solid #E0E0E0' }}>
                                        <Typography variant="body2" sx={{ fontSize: 11, fontWeight: 600 }}>Select All</Typography>
                                    </Box>
                                );
                            }
                            const selected = selectedServer.includes(opt);
                            return (
                                <Box {...props} key={opt} sx={{ py: 0.5, px: 1.5, bgcolor: selected ? 'rgba(0, 51, 142, 0.08)' : 'transparent',
                                    borderLeft: selected ? '3px solid #00338e' : '3px solid transparent', '&:hover': { bgcolor: selected ? 'rgba(0, 51, 142, 0.12)' : 'rgba(0,0,0,0.04)' } }}>
                                    <Typography variant="body2" sx={{ fontSize: 11, fontWeight: selected ? 600 : 400 }}>{opt}</Typography>
                                </Box>
                            );
                        }}
                        renderInput={(params) => (
                            <TextField {...params} placeholder="Server" size="small" 
                                sx={{ "& .MuiOutlinedInput-root": { fontSize: 11 } }} />
                        )}
                        renderTags={(value, getTagProps) => {
                            const chipLimit = 1;
                            return (
                                <>
                                    {value.slice(0, chipLimit).map((option, index) => (
                                        <Chip {...getTagProps({ index })} key={option} label={option} size="small" 
                                            sx={{ fontSize: 10, height: 20, backgroundColor: "#fff", border: "1px solid #E0E0E0" }} />
                                    ))}
                                    {value.length > chipLimit && (
                                        <Typography sx={{ fontSize: 10, color: '#1976d2', ml: 0.5, fontWeight: 500 }}>
                                            +{value.length - chipLimit}
                                        </Typography>
                                    )}
                                </>
                            );
                        }}
                    />
                    <Autocomplete
                        size="small"
                        multiple
                        disableCloseOnSelect
                        options={["Select All", ...getDatabaseOptions()]}
                        value={selectedDatabase}
                        onChange={(event, val) => {
                            const allDatabases = getDatabaseOptions();
                            if (val.includes("Select All")) {
                                setSelectedDatabase(allDatabases);
                            } else {
                                setSelectedDatabase(val);
                            }
                        }}
                        sx={{ minWidth: 200, maxWidth: 280 }}
                        renderOption={(props, opt) => {
                            if (opt === "Select All") {
                                return (
                                    <Box {...props} key={opt} sx={{ py: 0.5, px: 1.5, fontWeight: 600, color: '#1976d2', borderBottom: '1px solid #E0E0E0' }}>
                                        <Typography variant="body2" sx={{ fontSize: 11, fontWeight: 600 }}>Select All</Typography>
                                    </Box>
                                );
                            }
                            const selected = selectedDatabase.includes(opt);
                            return (
                                <Box {...props} key={opt} sx={{ py: 0.5, px: 1.5, bgcolor: selected ? 'rgba(0, 51, 142, 0.08)' : 'transparent',
                                    borderLeft: selected ? '3px solid #00338e' : '3px solid transparent', '&:hover': { bgcolor: selected ? 'rgba(0, 51, 142, 0.12)' : 'rgba(0,0,0,0.04)' } }}>
                                    <Typography variant="body2" sx={{ fontSize: 11, fontWeight: selected ? 600 : 400 }}>{opt}</Typography>
                                </Box>
                            );
                        }}
                        renderInput={(params) => (
                            <TextField {...params} placeholder="Database" size="small" 
                                sx={{ "& .MuiOutlinedInput-root": { fontSize: 11 } }} />
                        )}
                        renderTags={(value, getTagProps) => {
                            const chipLimit = 1;
                            return (
                                <>
                                    {value.slice(0, chipLimit).map((option, index) => (
                                        <Chip {...getTagProps({ index })} key={option} label={option} size="small" 
                                            sx={{ fontSize: 10, height: 20, backgroundColor: "#fff", border: "1px solid #E0E0E0" }} />
                                    ))}
                                    {value.length > chipLimit && (
                                        <Typography sx={{ fontSize: 10, color: '#1976d2', ml: 0.5, fontWeight: 500 }}>
                                            +{value.length - chipLimit}
                                        </Typography>
                                    )}
                                </>
                            );
                        }}
                    />
                    {(selectedServer.length > 0 || selectedDatabase.length > 0) && (
                        <Button 
                            variant="outlined" 
                            size="small" 
                            onClick={() => { setSelectedServer([]); setSelectedDatabase([]); }}
                            sx={{ fontSize: 10, textTransform: 'none', height: 30, minWidth: 'auto', px: 1 }}
                        >
                            Clear
                        </Button>
                    )}
                </Box>

                {loading["Database"] ? (
                    <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, p: 3, minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <CircularProgress_Styled loadingWhat="Loading Database Metrics" fetchingFor={`Fetching data for ${appName}`} />
                    </Paper>
                ) : (
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
                        {/* CPU Utilization */}
                        <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, overflow: "visible" }}>
                            <Box sx={{ px: 2, py: 1.5, display: "flex", alignItems: "center", gap: 1 }}>
                                <Typography sx={{ fontSize: 13, fontWeight: 800, color: "#111827" }}>CPU Utilization</Typography>
                                {metricWarnings.cpu.length > 0 && (
                                    <WarningChip 
                                        tooltipText={`${metricWarnings.cpu.length} database(s) above ${WARNING_THRESHOLD}%: ${metricWarnings.cpu.map(d => `${d.name} (${d.value.toFixed(1)}%)`).join(', ')}`}
                                        isSelected={warningSelected.cpu}
                                        onClick={() => setWarningSelected(prev => ({ ...prev, cpu: !prev.cpu }))}
                                    />
                                )}
                            </Box>
                            <Divider sx={{ borderColor: "#E6E8EE" }} />
                            <Box sx={{ px: 2, py: 2 }}>
                                <AreaLineChart type="cpu" key={`cpu-${selectedServer.join(',')}-${selectedDatabase.join(',')}-${warningSelected.cpu}`} 
                                    data={getGraphData(databaseData, "Cpu Utilization", 
                                        computeAllowedDatabases(metricWarnings.cpu, getTargetInfo(getLatestPerDatabase(databaseData, "Cpu Utilization")).highest, warningSelected.cpu, getSelectedDatabaseNames())
                                    )} 
                                    yAxisLabel={"Utilization %"} domain={[0,100]}/>
                            </Box>
                        </Paper>

                        {/* Storage Utilization */}
                        <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, overflow: "visible" }}>
                            <Box sx={{ px: 2, py: 1.5, display: "flex", alignItems: "center", gap: 1 }}>
                                <Typography sx={{ fontSize: 13, fontWeight: 800, color: "#111827" }}>Storage Utilization</Typography>
                                {metricWarnings.storage.length > 0 && (
                                    <WarningChip 
                                        tooltipText={`${metricWarnings.storage.length} database(s) above ${WARNING_THRESHOLD}%: ${metricWarnings.storage.map(d => `${d.name} (${d.value.toFixed(1)}%)`).join(', ')}`}
                                        isSelected={warningSelected.storage}
                                        onClick={() => setWarningSelected(prev => ({ ...prev, storage: !prev.storage }))}
                                    />
                                )}
                            </Box>
                            <Divider sx={{ borderColor: "#E6E8EE" }} />
                            <Box sx={{ px: 2, py: 2 }}>
                                <AreaLineChart type="storage" key={`storage-${selectedServer.join(',')}-${selectedDatabase.join(',')}-${warningSelected.storage}`} 
                                    data={getGraphData(databaseData, "Storage Utilization", 
                                        computeAllowedDatabases(metricWarnings.storage, getTargetInfo(getLatestPerDatabase(databaseData, "Storage Utilization")).highest, warningSelected.storage, getSelectedDatabaseNames())
                                    )} 
                                    yAxisLabel={"Utilization %"} domain={[0,100]}/>
                            </Box>
                        </Paper>

                        {/* DTU Utilization */}
                        <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, overflow: "visible" }}>
                            <Box sx={{ px: 2, py: 1.5, display: "flex", alignItems: "center", gap: 1 }}>
                                <Typography sx={{ fontSize: 13, fontWeight: 800, color: "#111827" }}>DTU Utilization</Typography>
                                {metricWarnings.dtu.length > 0 && (
                                    <WarningChip 
                                        tooltipText={`${metricWarnings.dtu.length} database(s) above ${WARNING_THRESHOLD}%: ${metricWarnings.dtu.map(d => `${d.name} (${d.value.toFixed(1)}%)`).join(', ')}`}
                                        isSelected={warningSelected.dtu}
                                        onClick={() => setWarningSelected(prev => ({ ...prev, dtu: !prev.dtu }))}
                                    />
                                )}
                            </Box>
                            <Divider sx={{ borderColor: "#E6E8EE" }} />
                            <Box sx={{ px: 2, py: 2 }}>
                                <AreaLineChart type="dtu" key={`dtu-${selectedServer.join(',')}-${selectedDatabase.join(',')}-${warningSelected.dtu}`} 
                                    data={getGraphData(databaseData, "DTU Utilization", 
                                        computeAllowedDatabases(metricWarnings.dtu, getTargetInfo(getLatestPerDatabase(databaseData, "DTU Utilization")).highest, warningSelected.dtu, getSelectedDatabaseNames())
                                    )} 
                                    yAxisLabel={"Utilization %"} domain={[0,100]}/>
                            </Box>
                        </Paper>

                        {/* Session Count */}
                        <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, overflow: "visible" }}>
                            <Box sx={{ px: 2, py: 1.5, display: "flex", alignItems: "center", gap: 1 }}>
                                <Typography sx={{ fontSize: 13, fontWeight: 800, color: "#111827" }}>Session Count</Typography>
                            </Box>
                            <Divider sx={{ borderColor: "#E6E8EE" }} />
                            <Box sx={{ px: 2, py: 2 }}>
                                <AreaLineChart type="session" key={`session-${selectedServer.join(',')}-${selectedDatabase.join(',')}`} 
                                    data={getGraphData(databaseData, "Session Count", 
                                        computeAllowedDatabases([], getTargetInfo(getLatestPerDatabase(databaseData, "Session Count")).highest, false, getSelectedDatabaseNames())
                                    )} 
                                    yAxisLabel={"Count"}/>
                            </Box>
                        </Paper>

                        {/* Data Read Transaction */}
                        <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, overflow: "visible" }}>
                            <Box sx={{ px: 2, py: 1.5, display: "flex", alignItems: "center", gap: 1 }}>
                                <Typography sx={{ fontSize: 13, fontWeight: 800, color: "#111827" }}>Data Read Transaction</Typography>
                            </Box>
                            <Divider sx={{ borderColor: "#E6E8EE" }} />
                            <Box sx={{ px: 2, py: 2 }}>
                                <AreaLineChart type="dataRead" key={`dataRead-${selectedServer.join(',')}-${selectedDatabase.join(',')}`} 
                                    data={getGraphData(databaseData, "Data Read Transaction", 
                                        computeAllowedDatabases([], getTargetInfo(getLatestPerDatabase(databaseData, "Data Read Transaction")).highest, false, getSelectedDatabaseNames())
                                    )} 
                                    yAxisLabel={"Utilization %"} domain={[0,100]}/>
                            </Box>
                        </Paper>

                        {/* Data Write Transaction */}
                        <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, overflow: "visible" }}>
                            <Box sx={{ px: 2, py: 1.5, display: "flex", alignItems: "center", gap: 1 }}>
                                <Typography sx={{ fontSize: 13, fontWeight: 800, color: "#111827" }}>Data Write Transaction</Typography>
                            </Box>
                            <Divider sx={{ borderColor: "#E6E8EE" }} />
                            <Box sx={{ px: 2, py: 2 }}>
                                <AreaLineChart type="dataWrite" key={`dataWrite-${selectedServer.join(',')}-${selectedDatabase.join(',')}`} 
                                    data={getGraphData(databaseData, "Data Write Transaction", 
                                        computeAllowedDatabases([], getTargetInfo(getLatestPerDatabase(databaseData, "Data Write Transaction")).highest, false, getSelectedDatabaseNames())
                                    )} 
                                    yAxisLabel={"Utilization %"} domain={[0,100]}/>
                            </Box>
                        </Paper>
                    </Box>
                )}
            </Box>
        </Box>
        </>
    )
}

export default DatabaseMetrics;