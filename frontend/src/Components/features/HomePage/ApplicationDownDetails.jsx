import React, { useEffect, useState,useRef, useMemo} from 'react'
import {useNavigate} from 'react-router-dom'
import Grid from '@mui/material/Unstable_Grid2';
import { Fade, Card, CardContent,Chip,Menu, Typography, Box,Checkbox, Accordion, AccordionSummary, AccordionDetails, Divider, Button, TextField, ButtonGroup, Autocomplete, ButtonBase, IconButton, Tooltip, InputBase, Select, MenuItem, FormControl, Collapse, Dialog, DialogTitle, DialogContent, DialogActions, List, ListItem, ListItemText, InputAdornment, Popover } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { styled } from '@mui/material/styles';
import {useLocation} from 'react-router-dom'
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import PriorityHighOutlinedIcon from '@mui/icons-material/PriorityHighOutlined';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import LinearProgress from '@mui/material/LinearProgress';
import CircularProgress from '@mui/material/CircularProgress';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import Pagination from '@mui/material/Pagination';
import Alert from '@mui/material/Alert';
import {getUrl} from '../../../environment'
import "react-multi-carousel/lib/styles.css";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CircleIcon from "@mui/icons-material/Circle";
import SearchIcon from '@mui/icons-material/Search';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen';
import KeyboardDoubleArrowLeftIcon from '@mui/icons-material/KeyboardDoubleArrowLeft';
import KeyboardDoubleArrowRightIcon from '@mui/icons-material/KeyboardDoubleArrowRight';
import StorageRoundedIcon from '@mui/icons-material/StorageRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { logPageVisit,startPageTracking,appInsights } from '../appInsights'; // Import the function
import CircularProgress_Styled from '../../shared/UI Components/CircularProgress'
import InterfaceStatus from './InterfaceStatus';
import ApplicationStatus from './AppStatus';
import ServerDrillDown from './ServerDrillDown';
import DatabaseMetrics from './DatabaseMetricsDrillDown';

import NetworkMetrics from './NetworkMetrics';
import FileshareMetrics from './FileshareMetrics';
import {fetchEarlyWarnings, fetchWarningEvents} from '../../shared/APIs/fetchAPIs';
import PopUp from '../../shared/UI Components/PopUp';
import {updateEarlyWarningStatus, updateWarningEventsStatus} from '../../shared/APIs/updateAPIs';
import Citrix from '../Citrix/Citrix';
import SecurityMetrics from './Security';
import ResourceDialog from './ResourceDialog';
const StyledCard = styled(Card)({
    width: '100%',
    boxShadow: '0px 3px 6px rgba(0, 0, 0, 0.16)',
    padding: 4,
    position: 'relative',
});

const ReasonBox = styled(Grid)({
  backgroundColor: '#f0f0f0',
  padding: '16px',
  borderRadius: '4px',
  display: 'flex',
  gap: '8px',
});

const ApplicationName = styled(Typography)({
  color: '#00338e',
  fontWeight: 'bold',
});

// ============ NEW UI COMPONENTS ============
const APP_HEADER_OFFSET = 72;

const StatusDot = ({ tone = "good" }) => {
  const color =
    tone === "good" ? "#20A052" : tone === "warn" ? "#F5A623" : "#D0021B";
  return (
    <CircleIcon sx={{ fontSize: 12, color, ml: 0.5, verticalAlign: "middle" }} />
  );
};

const SmallCard = ({ title, statusLabel, tone, sub, onClick, selected, isBladeView }) => (
  <ButtonBase
    onClick={onClick}
    sx={{ width: "100%", textAlign: "left", borderRadius: 1, display: "block" }}
  >
    <Paper
      elevation={0}
      sx={{
        border: selected ? "2px solid #1F6FEB" : "1px solid #E6E8EB",
        borderRadius: 1,
        px: isBladeView ? 1 : { xs: 0.75, sm: 1, md: 1.25 },
        py: isBladeView ? 0.75 : { xs: 0.5, sm: 0.75, md: 1 },
        minHeight: isBladeView ? 50 : { xs: 48, sm: 54, md: 60, lg: 66 },
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: selected ? "#F0F7FF" : "white",
        width: "100%",
        transition: "all 0.2s ease",
        '&:hover': { boxShadow: 2, transform: 'scale(1.01)' }
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 0.25 }}>
        <Typography sx={{ fontSize: isBladeView ? 13 : { xs: 11, sm: 12, md: 13, lg: 14 }, fontWeight: 600, color: "#1a1a1a" }}>
          {title}
        </Typography>
        <Typography sx={{ fontSize: isBladeView ? 12 : { xs: 10, sm: 11, md: 12 }, color: "#6B7280", display: "flex", alignItems: "center" }}>
          <span style={{ marginRight: 2 }}>Status:</span>
          <span style={{ fontWeight: 600, color: "#00338e" }}>{statusLabel}</span>
          <StatusDot tone={tone} />
        </Typography>
      </Box>
      <Typography sx={{ fontSize: isBladeView ? 11 : { xs: 9, sm: 10, md: 11 }, color: "#5A626A", mt: 0.15 }}>{sub}</Typography>
    </Paper>
  </ButtonBase>
);

const ResultRow = ({ item, expanded, onToggleExpand, onCardClick, bladeOpen, selectedCardType, selectedAppName }) => {
  return (
    <Paper
      elevation={0}
      sx={{
        border: "1px solid #E6E8EB",
        borderRadius: 0.5,
        overflow: "hidden",
        mb: 0.5,
        background: "transparent",
      }}
    >
      <Box
        sx={{
          minHeight: bladeOpen ? 34 : { xs: 28, sm: 32, md: 36 },
          px: bladeOpen ? 1 : { xs: 0.75, sm: 1 },
          display: "flex",
          alignItems: "center",
          gap: 0.25,
          background: "transparent",
        }}
      >
        <Typography sx={{ fontSize: bladeOpen ? 13 : { xs: 12, sm: 13, md: 14 }, fontWeight: 700, color: "#00338e" }}>
          {item.name}
        </Typography>

        <Box sx={{ flex: 1 }} />

        <Tooltip title={expanded ? "Collapse" : "Expand"}>
          <IconButton
            size="small"
            onClick={onToggleExpand}
            sx={{ width: bladeOpen ? 24 : { xs: 24, sm: 28 }, height: bladeOpen ? 24 : { xs: 24, sm: 28 }, borderRadius: 0.5, color: "#00338e" }}
          >
            {expanded ? <ExpandLessIcon sx={{ fontSize: bladeOpen ? 18 : 18 }} /> : <ExpandMoreIcon sx={{ fontSize: bladeOpen ? 18 : 18 }} />}
          </IconButton>
        </Tooltip>
      </Box>

      <Divider sx={{ borderColor: "#EEF0F2" }} />

      <Collapse in={expanded} timeout={180} unmountOnExit>
        <Box
          sx={{
            p: bladeOpen ? 0.75 : 0,
            display: "flex",
            flexWrap: "wrap",
            gap: bladeOpen ? 0.75 : 0.25,
          }}
        >
          {item.cards.map((c, idx) => (
            <Box 
              key={idx} 
              sx={{ 
                flex: bladeOpen 
                  ? "1 1 100%" 
                  : { xs: "1 1 100%", sm: "1 1 calc(50% - 2px)", md: "1 1 calc(33.33% - 2px)", lg: "1 1 calc(25% - 2px)", xl: "1 1 calc(20% - 2px)" },
                minWidth: bladeOpen ? "auto" : { xs: "100%", sm: 140, md: 160 },
                maxWidth: "100%"
              }}
            >
              <SmallCard
                title={c.title}
                statusLabel={c.status}
                tone={c.tone}
                sub={c.sub}
                selected={selectedAppName === item.name && selectedCardType === c.type}
                onClick={() => onCardClick(item.name, c.type)}
                isBladeView={bladeOpen}
              />
            </Box>
          ))}
        </Box>
      </Collapse>
    </Paper>
  );
};

function ApplicationDownDetailsNew({globalFilterChoice, setGlobalFilterChoice, setGlobalFilterData, globalFilterData, appInsights, backendSessionToken, setIsSessionExpiredBackendToken, supportGroup, hospitalInformation, date, preferredTZ, previousAppHealthUrl, globalApplicationList}) {
    var location = useLocation()
    var navigate = useNavigate()
    var urlParams = new URLSearchParams(location.search)
    if(location.state!=null){
      if(sessionStorage.getItem("ApplicationHealth")!==null){
        sessionStorage.removeItem("ApplicationHealth")
      }
      sessionStorage.setItem("ApplicationHealth", JSON.stringify(location.state))
    }
    var {metric} = location.state || (JSON.parse(sessionStorage.getItem("ApplicationHealth")) || {})
    var [metricAllApplications, setMetricAllApplications] = useState({})
    var [header, setHeader] = useState("")
    var [queryParams, setQueryParams] = useState({})
    var [error, setError] = useState({"ApplicationHealthSummary":""})
    var pageStateRef = useRef({});
    var baseUrl =  getUrl()
    var [networkMetricsServerCounts, setNetworkMetricsServerCounts] = useState([])
    var [networkMetricsLoaded, setNetworkMetricsLoaded] = useState(false)
    
    var [securityMetricsCounts, setSecurityMetricsCounts] = useState([])
    var [securityMetricsLoaded, setSecurityMetricsLoaded] = useState(false)

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
      console.log(globalFilterChoice, globalFilterData, appInsights, backendSessionToken, supportGroup, hospitalInformation, date, preferredTZ, previousAppHealthUrl)
      var nameOfResource = urlParams.get("Name")?.toString() || ""
      var typeOfResource = urlParams.get("Type")?.toString() || ""
      setQueryParams({
        "Name":nameOfResource,
        "Type":typeOfResource
      })
    }, [])

    useEffect(()=>{
      window.scrollTo(0,0)
      
      var nameOfResource = urlParams.get("Name")?.toString() || ""
      var typeOfResource = urlParams.get("Type")?.toString() || ""

      if(Object.keys(hospitalInformation).length>0 && "hospitalList" in hospitalInformation && Object.keys(globalFilterData).length>0 && Object.keys(globalApplicationList).length>0){
        console.log("Resource:", nameOfResource, typeOfResource, hospitalInformation)
        if(nameOfResource=="All" && typeOfResource=="All"){
          console.log("hello in if in useeffect")
          getRegionWiseData_GlobalFilter("All applications")
        }
        else{
          console.log("hello in Else in useeffect metric", metric, hospitalInformation)
          if(metric===undefined || Object.keys(metric).length===0){
            getRegionWiseData_GlobalFilter("urlParams")
          }
          else{
            setMetricAllApplications(metric)
          }
        }

      }
      
    }, [location.pathname+location.search, globalFilterData, hospitalInformation, globalApplicationList])

    useEffect(()=>{
      var nameOfResource = urlParams.get("Name")?.toString() || ""
      console.log(globalFilterChoice, nameOfResource)
      if("ResourceName" in globalFilterChoice){
        // Skip if already on the same resource (prevents double navigation on back)
        if(globalFilterChoice["ResourceName"].toLowerCase() === nameOfResource?.toLowerCase()){
          return;
        }
        getRegionWiseData_GlobalFilter("globalFilter")
      }
    }, [globalFilterChoice])

    // Fetch network server count by App CI
    useEffect(() => {
      const fetchNetworkServerCountByAppCI = async () => {
        try {
          const response = await fetch(baseUrl + 'networkServerCountByAppCI', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              filters: {}
            })
          });
          const data = await response.json();
          console.log("Network Server Count by App CI:", data);
          setNetworkMetricsServerCounts(data.data || []);
        } catch (error) {
          console.error("Error fetching network server count by App CI:", error);
        } finally {
          setNetworkMetricsLoaded(true);
        }
      };

      fetchNetworkServerCountByAppCI();
    }, [baseUrl]);

    useEffect(() => {
      const fetchSecurityMetricsCountByAppCI = async () => {
        try {
          if (!globalFilterData || Object.keys(globalFilterData).length === 0) {
            setSecurityMetricsLoaded(true);
            return;
          }

          const response = await fetch(baseUrl + 'credentialInventory', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              objectType: "all"
            })
          });
          
          const data = await response.json();
          
          if (data.status === 200) {
            const parsedData = JSON.parse(data.Data);
            const rowCount = parsedData.objectName ? Object.keys(parsedData.objectName).length : 0;
            const appCIMap = new Map();
            
            for (let i = 0; i < rowCount; i++) {
              const appCI = parsedData.applicationCI?.[i];
              if (!appCI) continue;
              
              const appCIUpper = appCI.toUpperCase();
              
              if (!appCIMap.has(appCIUpper)) {
                appCIMap.set(appCIUpper, { Total: 0, Expired: 0 });
              }
              
              const counts = appCIMap.get(appCIUpper);
              counts.Total++;
              
              const daysUntilExpiry = parsedData.daysUntilExpiry?.[i];
              if (daysUntilExpiry !== undefined && daysUntilExpiry !== null && daysUntilExpiry < 0) {
                counts.Expired++;
              }
            }
            const securityData = Array.from(appCIMap.entries()).map(([appCI, counts]) => ({
              ApplicationCI: appCI,
              Total: counts.Total,
              Expired: counts.Expired
            }));
            
            console.log("Security Metrics Count by App CI :", securityData);
            setSecurityMetricsCounts(securityData);
          } else {
            setSecurityMetricsCounts([]);
          }
        } catch (error) {
          console.error("Error fetching security metrics count by App CI:", error);
          setSecurityMetricsCounts([]);
        } finally {
          setSecurityMetricsLoaded(true);
        }
      };

      if (globalFilterData && Object.keys(globalFilterData).length > 0) {
        fetchSecurityMetricsCountByAppCI();
      } else {
        setSecurityMetricsLoaded(true);
      }
    }, [baseUrl, globalFilterData]);
    
    var fetchApplicationHealthSummary = (val, type, setApplicationHealthSummary) => {

      var s = ""
   
      setApplicationHealthSummary({})
      val.map((i)=>{
        s= s+"'"+i+"',"
      })
      s = s.slice(0,-1)
      console.log(s)

      var params = {
        [type] : s
      }

      var url = new URL( baseUrl + 'applicationHealthSummary');
      url.search = new URLSearchParams(params).toString();
      fetch(url,{
        method:'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      .then((response)=>response.json())
      .then((data)=>{
        if(Object.keys(JSON.parse(data["Application Summary"])).length>0){
          console.log(JSON.parse(data["Application Summary"]))
          setApplicationHealthSummary(JSON.parse(data["Application Summary"]))
        }
      })
      .catch((error) =>{
        setApplicationHealthSummary(-1)
        console.log("Error fetching Application Health Summary data")
        console.log(error)
      })
    }

    const handleApplicationGlobalFilter = (value, metric, upDown, type) => {
        if(type.includes("VM")){
          var appName = value.split("/").length==2 ? value.split("/")[1] : value.split("/")[value.split("/").length-1]
          var hostingType = type.split(" ")[0]
          var resName = value.split("/").length==2 ? value.split("/")[0] : value.split("/")[0]+"/"+value.split("/")[1]+"/"+value.split("/")[2]
          
          // Navigate to App CI page with server info in state to open server blade
          navigate('/applicationHealth?Name='+appName+"&Type=Application CI", {
            state: {
              metric: metric,
              openServerBlade: true,
              selectedServer: resName,
              hostingType: hostingType
            }
          });
        }
        else{
          navigate('/applicationHealth?Name='+value+"&Type="+type, {state:{metric:metric}})
        }
    };

    const getRegionWiseData_GlobalFilter = (typeOfFilter) => {
      var serverList = globalFilterData
      var applicationListGlobal = globalApplicationList
      var resourceWiseAvailability = {}

      const getHospital_ServerData = (appCI) =>{
        if(!(appCI.toLowerCase() in resourceWiseAvailability)){
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
      }

      const getAppCI = (appFamily) => {
          var appCI = []
          console.log("AppFamily", appFamily)
          Object.keys(applicationListGlobal["AppFamily"]).map((key)=>{
            if(applicationListGlobal["AppFamily"][key].toLowerCase()==appFamily.toLowerCase()){
                appCI.push(applicationListGlobal["AppCI"][key])
            }
          })
          console.log(appCI)
          return appCI
      }

      if(typeOfFilter==="globalFilter"){
        var type = globalFilterChoice["ResourceType"]
        var resourceName = globalFilterChoice["ResourceName"]
        if(type == "Application Family"){
          var appCi = globalFilterChoice["Application CI"]
          appCi.map((appCI)=>{
            getHospital_ServerData(appCI)
          })
          handleApplicationGlobalFilter(resourceName, resourceWiseAvailability, "", "Application Family")
        }
        else if(type == "Application CI"){
          getHospital_ServerData(resourceName)
          handleApplicationGlobalFilter(resourceName, resourceWiseAvailability,"", "Application CI")
        }
        else if(type.includes("VM")){
          var appCI = type.split("/")[2]
          var hostingType = type.split("/")[1]
          handleApplicationGlobalFilter(resourceName+"/"+appCI, resourceWiseAvailability, "", hostingType + " VM")
        }
      }
      else if(typeOfFilter==="urlParams"){
        var nameOfResource = urlParams.get("Name")?.toString() || ""
        var typeOfResource = urlParams.get("Type")?.toString() || ""
        var appCI = []
        if(typeOfResource.toLowerCase()==="application family"){
            appCI = getAppCI(nameOfResource)
        }
        else if(typeOfResource.toLowerCase()==="application ci"){
            appCI = [nameOfResource]
        }
        else{
          appCI = []
        }
        appCI.map((appCI)=>{
          getHospital_ServerData(appCI)
        })
        setMetricAllApplications(resourceWiseAvailability)
      }
      else{
        setHeader('All Applications')
        Object.values(serverList["AppCI"]).map((val)=>{
          getHospital_ServerData(val)
        })
        setMetricAllApplications(resourceWiseAvailability)
      }
    }

    const HospitalAccordion = ({ hospital }) => {

      var [allApplicationList, setAllApplicationList] = useState([])
      var [applicationList, setApplicationList] = useState([])
      var [subsetApplicationList, setSubsetApplicationList] = useState([])
      var [length, setLength] = useState(0)
      var [numberOfRecords, setNumberOfRecords] = useState(3)
      var [page, setPage] = useState(1);
      
      var [rowsPerPage, setRowsPerPage] = useState(3);
      var [hospitalDataChosen, setHospitalDataChosen] = useState([])
      var [appCiDataChosen, setAppCiDataChosen] = useState([])
      var [hospitalToApp, setHospitalToApp] = useState([])
      var [cardData, setCardData] = useState({})
      var [filters, setFilters] = useState({})
      var filterChange = useRef(false)

      var [applicationHealthSummary, setApplicationHealthSummary] = useState({})

      var [supportGroupToAppFam, setSupportGroupToAppFam] = useState({})
      var [appFamToAppCi, setAppFamToAppCi] = useState({})
      var [validAppCIs, setValidAppCIs] = useState([])

      var [applicationPotentialIssues, setApplicationPotentialIssues] = useState([])
      var [affectedCount , setAffectedCount] = useState(0)
      var [toggleState, setToggleState] = useState(false)
      var hasAutoEnabledToggle = useRef(false)
      var [tempState, setTempState] = useState({})
      const [bladeView, setBladeView] = useState({ open: true, component: 'server', appName: null });
      const [bladeExpanded, setBladeExpanded] = useState(false);
      const [previousState, setPreviousState] = useState(null);
      const [expandedMap, setExpandedMap] = useState({});
      const [appCiDialogOpen, setAppCiDialogOpen] = useState(false);
      const [hospitalDialogOpen, setHospitalDialogOpen] = useState(false);
      const [isBladeContentLoading, setIsBladeContentLoading] = useState(false);
      var [earlyWarningPopUpData, setEarlyWarningPopUpData] = useState({})
      var [warningEvents, setWarningEvents] = useState([])
      const warningEventsRef = useRef([]);

      const [resourceDialogOpen, setResourceDialogOpen] = useState(false);
      const [resourceDialogAppFamily, setResourceDialogAppFamily] = useState('');

      const getAppFamilyForAppCI = (selectedAppName) => {
        if (!selectedAppName) {
          return "";
        }

        const normalizedAppName = String(selectedAppName).trim().toUpperCase();
        const matchedAppFamily = Object.keys(appFamToAppCi).find((appFamily) =>
          Array.isArray(appFamToAppCi[appFamily]) && appFamToAppCi[appFamily].some((appCI) => String(appCI).trim().toUpperCase() === normalizedAppName)
        );

        return matchedAppFamily || "";
      };

      const handleResourceInfoClick = (appName) => {
        const appFamily = getAppFamilyForAppCI(appName);
        setResourceDialogAppFamily(appFamily);
        setResourceDialogOpen(true);
      };

      useEffect(()=>{
        console.log("Entered Hospital Accordian", securityMetricsLoaded, networkMetricsLoaded, Object.keys(globalFilterData).length>0, Object.keys(hospitalInformation).length>0, applicationHealthSummary,metricAllApplications, queryParams,header)
        const handleResize=()=>{
            var v = Math.ceil(window.innerHeight/246)
            console.log(v, numberOfRecords)
            setNumberOfRecords(v)
            setRowsPerPage(v)
        }
        window.addEventListener('resize',handleResize)
        handleResize()

        window.handleWarningFieldChange = function (id, uiType, value) {
          console.log("Warning field changed:", { id, uiType, value });
          setWarningEvents(currentWarningEvents => {
            const eventIndex = currentWarningEvents.findIndex(event => String(event.ID) === String(id));
            if (eventIndex === -1) {
              console.log("Event not found for ID:", id);
              return currentWarningEvents;
            }
            
            const updatedEvents = [...currentWarningEvents];
            const updatedEvent = {
              ...updatedEvents[eventIndex]
            };
            if (value === "") {
              delete updatedEvent[uiType];
            } else {
              updatedEvent[uiType] = value;
            }

            var comments = updatedEvent["Comments"] || ""
            var status = updatedEvent["Status"] || ""
            console.log("Comments:", comments, "Status:", status)
            const updateButton = document.getElementById(`update-btn-${id}`);
            if(comments.trim() !== "" && status.trim() !== ""){
              if(updateButton){
                updateButton.disabled = false;
                updateButton.style.opacity = '1';
                updateButton.style.cursor = 'pointer';
              }
            }
            else{
              if(updateButton){
                updateButton.disabled = true;
                updateButton.style.opacity = '0.5';
                updateButton.style.cursor = 'not-allowed';
              }
            }
            // Assign the modified event object back to the new array
            updatedEvents[eventIndex] = updatedEvent;
            warningEventsRef.current = updatedEvents;
            return updatedEvents;
          });
        };

        window.handleUpdateSingleWarningEvent = function (id) {
          console.log("Update single warning event:", id);
          const event = warningEventsRef.current.find(e => String(e.ID) === String(id));
          if (event && event.Comments && event.Status) {
            // Map UI status to backend status
            const statusMapping = {
              "True Positive": "Resolved",
              "False Positive": "Resolved", 
              "Remove from Alerting": "Resolved"
            };
            const backendStatus = statusMapping[event.Status] || "Resolved";
            const commentsWithType = `[${event.Status}] ${event.Comments}`;
            
            // Disable button during update
            const updateButton = document.getElementById(`update-btn-${id}`);
            if (updateButton) {
              updateButton.disabled = true;
              updateButton.textContent = 'Updating...';
              updateButton.style.opacity = '0.5';
            }
            
            // Call the update API
            const params = {
              "WarningEventsID": [id],
              "Status": [backendStatus],
              "Comments": [commentsWithType]
            };
            updateWarningEventsStatus(backendSessionToken, params)
              .then((data) => {
                console.log(`Warning Event ${id} updated successfully:`, data);
                // Update local state to mark as resolved
                setWarningEvents(currentWarningEvents => {
                  return currentWarningEvents.map(e => {
                    if (String(e.ID) === String(id)) {
                      return { ...e, ResolvedLocally: true, IsResolved: true };
                    }
                    return e;
                  });
                });
                // Show success in the row
                if (updateButton) {
                  updateButton.textContent = 'Updated!';
                  updateButton.style.backgroundColor = '#107C10';
                }
                // Trigger refresh for other tabs
                var actionItem = localStorage.getItem("earlyWarningActionItem") || 0;
                localStorage.setItem("earlyWarningActionItem", parseInt(actionItem) + 1);
              })
              .catch((error) => {
                console.error(`Error updating warning event ${id}:`, error);
                if (updateButton) {
                  updateButton.disabled = false;
                  updateButton.textContent = 'Update';
                  updateButton.style.opacity = '1';
                }
              });
          }
        };
        
        // Fetch Early Warning Details if EarlyWarningId is present in URL params
        getEarlyWarningPopUpData()

        const restoreState=()=>{
          var pageState_temp = localStorage.getItem("ApplicationHealthSummary_PageState")
          var pageLocation = (location.pathname + location.search).toLowerCase()
          if(pageState_temp){
            pageState_temp = JSON.parse(pageState_temp)
            setTempState(pageState_temp)
            if(pageLocation in pageState_temp && pageState_temp[pageLocation] && Object.keys(pageState_temp[pageLocation]).length>0){
              const stateToRestore_local = pageState_temp[pageLocation]
              console.log("Found State to Restore from localStorage", stateToRestore_local)
              setToggleState(stateToRestore_local.potentialIssueToggle)
              setAppCiDataChosen(stateToRestore_local.appCiFilter)
              setHospitalDataChosen(stateToRestore_local.hospitalFilter)
              setPage(stateToRestore_local.page)
              if (stateToRestore_local.bladeView) {
                setBladeView({ open: true, component: null, appName: null })
              }
              if (stateToRestore_local.bladeExpanded !== undefined) {
                setBladeExpanded(stateToRestore_local.bladeExpanded)
              }
              if (stateToRestore_local.expandedMap) {
                setExpandedMap(stateToRestore_local.expandedMap)
              }
            }
          }
        }
        window.addEventListener('restoreState',restoreState)
        restoreState()

        callFunctionsForPotentialIssues()
        const intervalId = setInterval(() => {
          callFunctionsForPotentialIssues()
        }, 120000);
        
        // Cleanup interval on component unmount
        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('restoreState', restoreState);
            clearInterval(intervalId)
            delete window.handleWarningFieldChange;
            delete window.handleUpdateSingleWarningEvent;
        };
      },[])

      useEffect(()=>{
        var flag = true
        console.log("warningEvents changed:", warningEvents)
        if(warningEvents.length>0){
          // Only check events that are NOT already resolved
          const pendingEvents = warningEvents.filter(e => !e.IsResolved && !e.ResolvedLocally);
          if (pendingEvents.length === 0) {
            // All events are resolved
            flag = true;
          } else {
            pendingEvents.forEach((event)=>{
              if(!("Comments" in event) || !("Status" in event)){
                flag = false
              }
              else if(event["Comments"].trim()==="" || event["Status"].trim()===""){
                flag = false
              }
            })
          }
          setEarlyWarningPopUpData((prev)=>({
            ...prev,
            "buttons": prev.buttons ? [{
              ...prev.buttons[0],
              "enabled": flag
            }] : []
          }));
        }
        
      }, [warningEvents])

      useEffect(()=>{
        setTimeout(()=>{
          if("actionResponse" in earlyWarningPopUpData && Object.keys(earlyWarningPopUpData["actionResponse"]).length>0){
            setEarlyWarningPopUpData((prev)=>({
              ...prev,
              "actionResponse": {}
            }))
          }
        }, 5000)
      }, [earlyWarningPopUpData.actionResponse])

      var getEarlyWarningPopUpData = () => {
        var earlyWarningId = urlParams.get("EarlyWarningId")?? null;
        var earlyWarningUpdateState = urlParams.get("EarlyWarningUpdate")?? null;
        if(earlyWarningId!==null && earlyWarningUpdateState!==null && earlyWarningUpdateState.toLowerCase() === "acknowledge"){
          // Call API to fetch Early Warning and Potenital Issues
          fetchEarlyWarnings(backendSessionToken, { "issueID": [earlyWarningId], "status": ["New", "Acknowledged"] })
          .then((data)=>{
            console.log("Early Warning Data:", data)
            var temp = {}
            if(Object.keys(data).length>0 && "Status" in data && data["Status"][0]==="New"){
              Object.keys(data["Application Family"]).map((key)=>{
                temp["popUpHeader"] = "Early Warning Detected"
                
                // Build HTML popUpBody
                const summary = data["Summary"][key]["Summary"] || "";
                const details = data["Summary"][key]["Details"] || {};
                const uniqueDetails = [...new Set(Object.keys(details))];
                const detailsHtml = uniqueDetails.length > 0 
                  ? `<ul style="margin: 8px 0; padding-left: 24px;">${uniqueDetails.map(d => `<li style="margin: 4px 0; font-size: 0.9em; color: #26374D;">${d}</li>`).join('')}</ul>`
                  : "";
                
                temp["popUpBody"] = `
                  <p style="margin: 0 0 12px 0; font-size: 0.96em; line-height: 1.6; color: #26374D;">
                    ${summary} The components with potential issues are:
                  </p>
                  ${detailsHtml}
                  <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(26, 115, 232, 0.2); font-size: 0.9em; color: #26374D;">
                    <strong style="color: #1A73E8;">NOTE:</strong> The Yellow/Red Chips will show where the warning is found. Please Acknowledge to track troubleshooting efforts.
                  </div>
                `;
                temp["buttons"] = [{
                  "label":"Acknowledge",
                  "function": () => 
                    {
                      callUpdateEarlyWarning("Acknowledged", earlyWarningId, []); 
                      setEarlyWarningPopUpData((prev)=>({
                        ...prev,
                        "isOpen": false
                      }));
                    },
                  "enabled": true
                }]
                temp["isLoading"] = false
                temp["isOpen"] = true
                temp["actionResponse"] = {}
              })
            }
            else{
              if(Object.keys(data).length>0 && "Status" in data && data["Status"][0].toLowerCase()==="acknowledged"){
                temp["actionResponse"] = {"status": 200, "message": "Early Warning is already Acknowledged"}
              }
              else{
                temp["actionResponse"] = {"status": 200, "message": "Early Warning is already Resolved"}
              }
              
            }
            console.log(temp)
            setEarlyWarningPopUpData(temp)
          })
          .catch((error)=>{
            console.error("Error fetching early warning data:", error)
          })
        }
        else if(earlyWarningId!==null && earlyWarningUpdateState!==null && earlyWarningUpdateState.toLowerCase() === "resolve"){
          fetchWarningEvents(backendSessionToken, { "EarlyWarningID": [earlyWarningId], "status": ["Acknowledged", "Resolved"] })
          .then((data)=>{
            var temp = {}
            console.log(data)
            // Check if there are any events with "Acknowledged" status (not yet resolved)
            const hasAcknowledgedEvents = Object.keys(data).length > 0 && "Status" in data && 
              Object.values(data["Status"]).some(status => status.toLowerCase() === "acknowledged");
            
            if(hasAcknowledgedEvents){
              temp["popUpHeader"] = "Resolve Early Warning";
              const summary = "Resolve the early warning by providing comments and by choosing the correctness to each warning event shown in the table below";
              var tempDict = htmlTable_For_Resolution({ data });
              const tableHtml = tempDict["htmlBody"];
              setWarningEvents(tempDict["warningEvents"])
              warningEventsRef.current = tempDict["warningEvents"]  // Initialize ref with server data
              temp["popUpBody"] = `
                <p style="margin: 0 0 12px 0; font-size: 0.96em; line-height: 1.6; color: #26374D;">
                  ${summary}
                </p>
                ${tableHtml}
                <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(26, 115, 232, 0.2); font-size: 0.9em; color: #26374D;">
                  <strong style="color: #1A73E8;">NOTE:</strong> Add comments and select an event type for each warning event before resolving.
                </div>
              `;
              temp["buttons"] = [{
                "label":"Resolve",
                "function": () => 
                  {
                    callUpdateEarlyWarning("Resolved", earlyWarningId); 
                    setEarlyWarningPopUpData((prev)=>({
                      ...prev,
                      "isOpen": false
                    }));
                  }
              }]
              temp["isLoading"] = false
              temp["isOpen"] = true
              temp["actionResponse"] = {}
            }
            else{
              var message = "Early Warning is not in Acknowledged state. Please acknowledge the Early Warning before resolving."
              if(Object.keys(data).length>0 && "Status" in data){
                // Check if all events are resolved
                const allResolved = Object.values(data["Status"]).every(status => status.toLowerCase() === "resolved");
                if(allResolved){
                  message = "All warning events have been resolved. Updating Early Warning status..."
                  // Auto-update Early Warning to Resolved
                  const ewParams = {
                    "EarlyWarningID": [earlyWarningId],
                    "StatusEarlyWarning": ["Resolved"],
                    "WarningEventsID": [],
                    "StatusWarningEvents": [],
                    "Comments": []
                  };
                  updateEarlyWarningStatus(backendSessionToken, ewParams)
                    .then((ewData) => {
                      console.log("Early Warning status updated to Resolved:", ewData);
                      setEarlyWarningPopUpData((prev) => ({
                        ...prev,
                        "actionResponse": { "status": 200, "message": "All warning events resolved. Early Warning is now Resolved." }
                      }));
                      // Trigger refresh for other tabs
                      var actionItem = localStorage.getItem("earlyWarningActionItem") || 0;
                      localStorage.setItem("earlyWarningActionItem", parseInt(actionItem) + 1);
                    })
                    .catch((ewError) => {
                      console.error("Error updating Early Warning status:", ewError);
                      setEarlyWarningPopUpData((prev) => ({
                        ...prev,
                        "actionResponse": { "status": 500, "message": "Failed to update Early Warning status" }
                      }));
                    });
                } else {
                  data["Status"].map((status)=>{
                    if(status.toLowerCase()!=="acknowledged"){
                      message = "Early Warning is already resolved"
                    }
                  })
                }
              }
              
              temp["actionResponse"] = {"status": 200, "message": message}
            }
            console.log(temp)
            setEarlyWarningPopUpData(temp)
          })
          .catch((error)=>{
            console.error("Error fetching warning events data:", error)
          })
        }
      }

      var callUpdateEarlyWarning = (status,earlyWarningId) => {
        // Call API to update Early Warning status to Acknowledged
        setEarlyWarningPopUpData((prev)=>({
          ...prev,
          "isLoading": true
        }));
        
        var requestBody = {
          "EarlyWarningID": [earlyWarningId], 
          "StatusEarlyWarning": [status],
          "WarningEventsID": [],
          "StatusWarningEvents": [],
          "Comments": []
        }
        var currentWarningEvents = warningEventsRef.current;
        console.log(currentWarningEvents)
        currentWarningEvents.map((event)=>{
          // Skip events that are already resolved (from server or locally updated)
          if (event.IsResolved || event.ResolvedLocally) {
            return;
          }
          // Map UI status to backend status for new events
          const statusMapping = {
            "True Positive": "Resolved",
            "False Positive": "Resolved", 
            "Remove from Alerting": "Resolved"
          };
          const backendStatus = statusMapping[event["Status"]] || event["Status"];
          const commentsWithType = event["Status"] && event["Comments"] && statusMapping[event["Status"]]
            ? `[${event["Status"]}] ${event["Comments"]}` 
            : event["Comments"];
          
          requestBody["WarningEventsID"].push(event["ID"])
          requestBody["StatusWarningEvents"].push(backendStatus)
          requestBody["Comments"].push(commentsWithType)
        })
        console.log(requestBody)
        
        updateEarlyWarningStatus(backendSessionToken, requestBody)
        .then((data) => {
          console.log(`Early Warning ${status} Successfully:`, data);
          setEarlyWarningPopUpData((prev)=>({
            ...prev,
            "actionResponse": {"status": 200, "message": `Early Warning ${status} Successfully`}
          }));
        })
        .catch((error) => {
          console.error(`Error ${status.toLowerCase()} early warning:`, error);
          setEarlyWarningPopUpData((prev)=>({
            ...prev,
            "actionResponse": {"status": 500, "message": `Error ${status.toLowerCase()} early warning`}
          }));
        })
        .finally(()=>{
          var actionItem = localStorage.getItem("earlyWarningActionItem") || 0
          localStorage.setItem("earlyWarningActionItem", parseInt(actionItem) + 1);

          setEarlyWarningPopUpData((prev)=>({
            ...prev,
            "isLoading": false
          }));
        });
      }

      var callUpdateWarningEvents = (status, warningEventsId, comments) => {
        var params = {
          "WarningEventsID": [warningEventsId],
          "Status" : [status],
          "Comments" : [comments]
        }
        updateWarningEventsStatus(backendSessionToken, params)
        .then((data) => {
          console.log(`Warning Events ${status} Successfully:`, data);
          setEarlyWarningPopUpData((prev)=>({
            ...prev,
            "actionResponse": {"status": 200, "message": `Warning Events ${status} Successfully`}
          }));
        })
        .catch((error) => {
          console.error(`Error ${status.toLowerCase()} warning events:`, error);
          setEarlyWarningPopUpData((prev)=>({
            ...prev,
            "actionResponse": {"status": 500, "message": `Error ${status.toLowerCase()} warning events`}
          }));
        })
        .finally(()=>{
          var actionItem = localStorage.getItem("earlyWarningActionItem") || 0
          localStorage.setItem("earlyWarningActionItem", parseInt(actionItem) + 1);

          setEarlyWarningPopUpData((prev)=>({
            ...prev,
            "isLoading": false
          }));
        });
      }

      // Handle navigation from global filter with server selection - open server blade automatically
      useEffect(() => {
        const { openServerBlade, selectedServer, hostingType } = location.state || {};
        if (openServerBlade && selectedServer) {
          // Get the app name from URL params
          const appName = urlParams.get("Name")?.toString();
          if (appName) {
            // Set the blade view to server health with the selected server
            setBladeView({ 
              open: true, 
              component: 'serverHealth', 
              appName: appName,
              selectedServer: selectedServer,
              hostingType: hostingType || 'Cloud'
            });
            // Clear the state so it doesn't re-open on refresh
            navigate(location.pathname + location.search, { replace: true, state: { metric } });
          }
        }
      }, [location.state]);  

      useEffect(()=>{
          var hosList = {}
          var appArray = Object.keys(metricAllApplications).length>0 ?
            Object.keys(hospital)
            :
            []

          Object.keys(hospital).map((key)=>{
            hospital[key]['Hospitals'].map((item)=>{
              if(!(item in hosList)){
                hosList[item]=[]
              }
              hosList[item].push(key)
            })
          })
          console.log(hosList)
          var filter = {
            "appFamily": [
              "All"
            ],
            "appCI": appArray,
            "managedByGroup": [
              "All"
            ],
            "supportGroup": [
              "All"
            ]
          }
          setFilters(filter)
          setAllApplicationList(appArray)
          setHospitalToApp(hosList)
      }, [metricAllApplications])

      useEffect(() => {
        pageStateRef.current = {
            potentialIssueToggle: toggleState,
            page:page,
            rowsPerPage: rowsPerPage,
            appCiFilter: appCiDataChosen,
            hospitalFilter: hospitalDataChosen,
            bladeView: bladeView,
            bladeExpanded: bladeExpanded,
            expandedMap: expandedMap
        }
        console.log(pageStateRef.current)
        setTempState((prev)=>({
          ...prev,
          [(location.pathname+location.search).toLowerCase()]:pageStateRef.current
        }))
      }, [toggleState, page, rowsPerPage, appCiDataChosen, hospitalDataChosen, bladeView, bladeExpanded, expandedMap]);

      useEffect(()=>{
        if(tempState && Object.keys(tempState).length>0){
          localStorage.setItem('ApplicationHealthSummary_PageState', JSON.stringify(tempState));
        }
      },[tempState])
      

      useEffect(()=>{
          // tempPageState.current.potentialIssueToggle = toggleState;
          console.log("state:", toggleState, filters, allApplicationList,applicationPotentialIssues)
          if(!toggleState && Object.keys(filters).length>0){
            console.log("state:", toggleState, filters, allApplicationList)
            setApplicationList(allApplicationList)
          }
          else if(toggleState && applicationPotentialIssues.length>0){
            console.log("state:", toggleState, filters, applicationPotentialIssues)
            setApplicationList(applicationPotentialIssues)
          }
          else if(toggleState && Object.keys(filters).length>0 && applicationPotentialIssues.length===0){
            // No potential issues but toggle is on (e.g. restored from localStorage) — reset to show all
            setToggleState(false)
          }
      }, [toggleState, filters, applicationPotentialIssues])

      useEffect(()=>{
        var arr=[]
        if(appCiDataChosen.length>0){
          arr = [...arr,...appCiDataChosen]
        }
        if(hospitalDataChosen.length>0){
          if(toggleState){
            hospitalDataChosen.map((item)=>{
              arr = [
              ...arr,
              ...hospitalToApp[item].filter(app =>
                applicationPotentialIssues.includes(app)
              )
            ];
            })
          }
          else{
            hospitalDataChosen.map((item)=>{
              arr= [...arr,...hospitalToApp[item]]
            })
          }
          
        }
        var tempLength = 0
        arr=[...new Set(arr)]
        console.log(arr)
        if(arr.length==0){
          console.log(applicationList)
          setSubsetApplicationList(applicationList)
          setLength(Math.ceil(applicationList.length/(numberOfRecords)))
          tempLength = Math.ceil(applicationList.length/(numberOfRecords))
        }
        else{
          console.log("Hello", arr)
          setSubsetApplicationList(arr)
          setLength(Math.ceil(arr.length/(numberOfRecords)))
          tempLength = Math.ceil(arr.length/(numberOfRecords))
        }
        
        if(filterChange.current || page>tempLength){
          setPage(1)
        }
        
      },[appCiDataChosen, hospitalDataChosen, applicationList])

      useEffect(()=>{
        if(Object.keys(applicationHealthSummary).length>0){
          var temp = []
          var affectedCount = 0 
          var tempDict = {}
          var supAf = {}
          var afAc = {}
          Object.keys(applicationHealthSummary["Application CI"]).map((key)=>{
            var appCI = applicationHealthSummary["Application CI"][key]
            var appFam = applicationHealthSummary["Application Family"][key]
            var supGrp = applicationHealthSummary["Support Group"][key]

            if(supGrp in supAf && !(appFam in afAc)){
              supAf[supGrp].push(appFam)
            }
            else if(!(supGrp in supAf)){
              supAf[supGrp]=[appFam]
            }

            if(appFam in afAc){
              afAc[appFam].push(appCI)
            }
            else{
              afAc[appFam]=[appCI]
            }

            
            var appCI = applicationHealthSummary["Application CI"][key]
            tempDict[appCI] = {"Server Health":{"Total":0, "Down":0}, "Windows Services":{"Total":0, "Down":0}, "Critical Interfaces":{"Total":0, "Down":0},"Azure File Storage":{"Total":0, "Down":0}, "SQL Database Health":{"Total":0, "Down":0}}

            var serverHealth = applicationHealthSummary["Server Health"][key]
            var serviceHealth = applicationHealthSummary["Services Health"][key]
            var interfacesHealth = applicationHealthSummary["Interfaces Health"][key]
            var databaseHealth = applicationHealthSummary["Database Health"][key]
            var fileStorageHealth = applicationHealthSummary["File Storage Health"][key]

            if(Object.keys(serverHealth).length>0){
              if(serverHealth["UnHealthy_Cloud"]>0 || serverHealth["UnHealthy_OnPremise"]>0){
                temp.push(appCI)
                affectedCount++
              }
              tempDict[appCI]["Server Health"]["Total"] = serverHealth["Total_Cloud"] + serverHealth["Total_OnPremise"]
              tempDict[appCI]["Server Health"]["Down"] = serverHealth["UnHealthy_Cloud"] + serverHealth["UnHealthy_OnPremise"]

            }
            if(Object.keys(serviceHealth).length>0){
              if(serviceHealth["UnHealthy_Cloud"]>0 || serviceHealth["UnHealthy_OnPremise"]>0 || serviceHealth["UnHealthy_Url"]>0){
                temp.push(appCI)
                affectedCount++
                }
                tempDict[appCI]["Windows Services"]["Total"] = serviceHealth["Total_Cloud"] + serviceHealth["Total_OnPremise"] + serviceHealth["Total_Url"]
                tempDict[appCI]["Windows Services"]["Down"] = serviceHealth["UnHealthy_Cloud"] + serviceHealth["UnHealthy_OnPremise"] + serviceHealth["UnHealthy_Url"]

            }
            if(Object.keys(interfacesHealth).length>0){
              if(interfacesHealth["Stopped"]>0){
                temp.push(appCI)
                affectedCount++
              }
              tempDict[appCI]["Critical Interfaces"]["Total"] = interfacesHealth["Total_Interfaces"]
              tempDict[appCI]["Critical Interfaces"]["Down"] = interfacesHealth["Stopped"]

            }
            if(Object.keys(databaseHealth).length>0){
              if(databaseHealth["UnHealthy_Cloud"]>0){
                temp.push(appCI)
                affectedCount++

              }
              tempDict[appCI]["SQL Database Health"]["Total"] = databaseHealth["Total_Cloud"]
              tempDict[appCI]["SQL Database Health"]["Down"] = databaseHealth["UnHealthy_Cloud"]

            }
            if(Object.keys(fileStorageHealth).length>0){
              if(fileStorageHealth["UnHealthy_Cloud"]>0){
                temp.push(appCI)
                affectedCount++
              }
              tempDict[appCI]["Azure File Storage"]["Total"] = fileStorageHealth["Total_Cloud"]
              tempDict[appCI]["Azure File Storage"]["Down"] = fileStorageHealth["UnHealthy_Cloud"]

            }
          })
           setAffectedCount(affectedCount)
          temp = [...new Set(temp.map((i)=>i))]
          setAppFamToAppCi(afAc)
          setSupportGroupToAppFam(supAf)
          setCardData(tempDict)
          setApplicationPotentialIssues(temp)
          console.log(temp.length)
        }
      }, [applicationHealthSummary])

      useEffect(() => {
        // Also include apps with expired security metrics as potential issues
        if (securityMetricsCounts.length > 0) {
          const securityIssueApps = securityMetricsCounts
            .filter(item => (item.Expired || 0) > 0)
            .map(item => item.ApplicationCI);
          if (securityIssueApps.length > 0) {
            setApplicationPotentialIssues(prev => {
              const merged = [...new Set([...prev, ...securityIssueApps])];
              return merged.length !== prev.length ? merged : prev;
            });
          }
        }
      }, [securityMetricsCounts])

      useEffect(() => {
        if (applicationPotentialIssues.length > 0 && !hasAutoEnabledToggle.current) {
          setToggleState(true)
          hasAutoEnabledToggle.current = true
        }
      }, [applicationPotentialIssues])

      useEffect(()=>{
        console.log(appFamToAppCi)
        if(Object.keys(appFamToAppCi).length>0){
          setValidAppCIs(Object.values(appFamToAppCi).flat().map(val => val.toUpperCase()));
        }
        else{
          console.log("No Data in AppFam to AppCi", appFamToAppCi)
        }
      },[appFamToAppCi])

      var callFunctionsForPotentialIssues = () => {
          console.log(supportGroup)
          var type = queryParams["Type"]=="All"?"supportGroup" : (queryParams["Type"]=="Application Family"?"appFamily":"appCI")
          var value = queryParams["Type"]=="All"? supportGroup : [queryParams["Name"]]
          if (!value || value.includes(undefined) || value.includes("undefined")) {
            return;
          }
          console.log(type, value)
          fetchApplicationHealthSummary(value, type, setApplicationHealthSummary)
      }
      const handleChangePage = (event, newPage) => {
        setPage(newPage);
      };

      var handleAppCiFilterChange = (e, value) => {
        e.preventDefault()
        filterChange.current = true
        setAppCiDataChosen([...new Set(value.map(i => i.toLowerCase()))])
        sessionStorage.setItem("ApplicationDetails_AppCiFilter",JSON.stringify(value.map(i => i.toLowerCase())))
        handleHospitalFilterChange(e, [])
      }

      var handleHospitalFilterChange = (e, value) => {
        e.preventDefault()
        filterChange.current = true
        setHospitalDataChosen(value)
        sessionStorage.setItem("ApplicationDetails_HospitalFilter",JSON.stringify(value))
      }

      // ============ NEW UI DATA & HANDLERS ============
      const filteredApps = useMemo(() => {
        let apps = subsetApplicationList.filter(app => validAppCIs.includes(app.toUpperCase()));
        if (appCiDataChosen.length > 0) {
          const chosenSet = new Set(appCiDataChosen.map(a => a.toLowerCase()));
          apps = apps.filter(a => chosenSet.has(a.toLowerCase()));
        }
        if (hospitalDataChosen.length > 0) {
          const hospitalSet = new Set(hospitalDataChosen);
          apps = apps.filter(a => {
            return Object.keys(hospitalToApp).some(h => hospitalSet.has(h) && hospitalToApp[h].map(x => x.toLowerCase()).includes(a.toLowerCase()));
          });
        }
        return apps.sort();
      }, [subsetApplicationList, validAppCIs, appCiDataChosen, hospitalDataChosen, hospitalToApp]);

      const newUIData = useMemo(() => {
        return filteredApps.map((app) => {
          const appKey = app.toUpperCase();
          const appCardData = cardData?.[appKey] || {};
          const cards = [];
          
          const addCard = (key, title, type) => {
            const total = appCardData[key]?.Total || 0;
            const down = appCardData[key]?.Down || 0;
            if (toggleState ? down > 0 : total > 0) {
              cards.push({ title, type, status: down > 0 ? "Warning" : "Good", tone: down > 0 ? "warn" : "good", sub: `Impacted (${down} out of ${total})`, total, down });
            }
          };
          
          addCard("Server Health", "Server Health", "server");
          addCard("Windows Services", "Windows Services", "services");
          addCard("Critical Interfaces", "Critical Interfaces", "interfaces");
          addCard("Azure File Storage", "Azure File Storage", "fileShare");
          addCard("SQL Database Health", "SQL Database Health", "database");
          
          // Network Metrics card - always shown (has network data -> impacted; else CrowdStrike Top Talkers).
          if (!toggleState) {
            const networkData = Array.isArray(networkMetricsServerCounts)
              ? networkMetricsServerCounts.find((item) => item.ApplicationCI?.toUpperCase() === appKey)
              : null;
            const networkTotal = networkData && networkData.ServerCount > 0 ? networkData.ServerCount : 0;
            cards.push({
              title: "Network Metrics",
              type: "networkMetrics",
              status: "Good",
              tone: "good",
              sub: networkTotal > 0 ? `Impacted (0 out of ${networkTotal})` : "Top talkers by destination port",
              total: networkTotal,
              down: 0
            });
          }
          
          // Add Security Metrics card if App CI exists in securityMetricsCounts and has count > 0
          // Show when toggle is OFF (all apps) or when toggle is ON and there are warnings
          if (securityMetricsCounts.length > 0) {
            const securityData = securityMetricsCounts.find(
              (item) => item.ApplicationCI?.toUpperCase() === appKey
            );
            if (securityData && securityData.Total > 0) {
              const securityTotal = securityData.Total;
              const securityDown = securityData.Expired || 0;
              if (toggleState ? securityDown > 0 : true) {
                cards.push({ 
                  title: "Security Metrics", 
                  type: "security", 
                  status: securityDown > 0 ? "Warning" : "Good", 
                  tone: securityDown > 0 ? "warn" : "good", 
                  sub: `Impacted (${securityDown} out of ${securityTotal})`, 
                  total: securityTotal, 
                  down: securityDown 
                });
              }
            }
          }
          if (!toggleState && appKey.includes('TRANSFUSION')) {
            cards.push({
              title: "Citrix Health",
              type: "citrix",
              status: "Good",
              tone: "good",
              sub: "Citrix session & resource metrics",
              total: 0,
              down: 0
            });
          }
          
          if (cards.length === 0 && !toggleState) {
            ["Server Health", "Windows Services", "Critical Interfaces", "Azure File Storage", "SQL Database Health"].forEach((key, idx) => {
              const types = ["server", "services", "interfaces", "fileShare", "database"];
              const total = appCardData[key]?.Total || 0;
              const down = appCardData[key]?.Down || 0;
              cards.push({ title: key, type: types[idx], status: down > 0 ? "Warning" : "Good", tone: down > 0 ? "warn" : "good", sub: total > 0 ? `Impacted (${down} out of ${total})` : "Data Not Onboarded", total, down });
            });
          }
          
          const issueCount = applicationPotentialIssues.some((x) => x.toUpperCase() === appKey) ? 1 : 0;
          return { id: app, name: appKey, issueCount, cards };
        });
      }, [filteredApps, cardData, toggleState, applicationPotentialIssues, networkMetricsServerCounts, securityMetricsCounts]);

      // Auto-open first card in blade view when data loads
      useEffect(() => {
        // Only auto-open if we have data and no app is currently selected
        if (newUIData.length > 0 && bladeView.open && !bladeView.appName) {
          const firstApp = newUIData[0];
          if (firstApp && firstApp.cards && firstApp.cards.length > 0) {
            const firstIssueCard = firstApp.cards.find(c => c.tone === 'warn') || firstApp.cards[0];
            setBladeView({ open: true, component: firstIssueCard.type, appName: firstApp.name });
            setExpandedMap((m) => ({ ...m, [firstApp.name]: true }));
          }
        }
      }, [newUIData]);

      // Safety net: prevent the blade spinner from hanging if a panel never reports completion (e.g. no interfaces)
      useEffect(() => {
        if (!isBladeContentLoading) return;
        const timeoutId = setTimeout(() => setIsBladeContentLoading(false), 8000);
        return () => clearTimeout(timeoutId);
      }, [isBladeContentLoading]);

      // Calculate total number of warning cards across all applications
      const totalWarningCards = useMemo(() => {
        return newUIData.reduce((total, app) => {
          const warningCards = app.cards.filter(card => card.tone === 'warn').length;
          return total + warningCards;
        }, 0);
      }, [newUIData]);

      const handleBladeCardClick = (appName, cardType) => {
        // Save current state before opening blade only if coming from main view
        if (!bladeView.open) {
          setPreviousState({
            appCiDataChosen: [...appCiDataChosen],
            hospitalDataChosen: [...hospitalDataChosen],
            page: page,
            toggleState: toggleState
          });
        }
        
        setBladeView({ open: true, component: cardType, appName: appName });
        setBladeExpanded(false); // Reset expanded state when opening new blade
        setExpandedMap((m) => ({ ...m, [appName]: true }));
      };

      const handleBackClick = () => {
        if (bladeView.open) {
          // Just close blade without restoring state
          setBladeView({ open: false, component: null, appName: null });
          setBladeExpanded(false);
          return;
        }
        
        // Check if already at All apps view
        var urlParams = new URLSearchParams(location.search);
        var nameParam = urlParams.get("Name");
        var typeParam = urlParams.get("Type");
        
        if (nameParam === "All" && typeParam === "All") {
          // Navigate back to app pods wallboard
          navigate('/crca application wallboard');
        } else {
          // Navigate to All apps view
          navigate('/applicationHealth?Name=All&Type=All');
        }
      };

      const renderBladeContent = () => {
        if (!bladeView.open || !bladeView.appName) return null;

        const componentType = bladeView.component;
        const appNameForQuery = bladeView.appName;
        const bladeKey = `${appNameForQuery}-${componentType}-${date?.startDate}-${date?.endDate}`;
        
        // Render based on component type
        if (componentType === 'services') {
          return (
            <ApplicationStatus 
              key={bladeKey}
              date={date} 
              appInsights={appInsights} 
              globalFilterData={globalFilterData} 
              preferredTZ={preferredTZ}
              appName={appNameForQuery}
              onLoadingChange={setIsBladeContentLoading}
            />
          );
        } else if (componentType === 'interfaces') {
          return (
            <InterfaceStatus 
              key={bladeKey}
              date={date} 
              appInsights={appInsights} 
              globalFilterChoice={globalFilterChoice}
              globalFilterData={globalFilterData}
              preferredTZ={preferredTZ}
              appName={appNameForQuery}
              appFamily={getAppFamilyForAppCI(appNameForQuery)}
              onLoadingChange={setIsBladeContentLoading}
            />
          );
        } else if (componentType === 'server' || componentType === 'serverHealth') {
          return (
            <ServerDrillDown 
              key={bladeKey}
              date={date} 
              appInsights={appInsights} 
              globalFilterData={globalFilterData}
              preferredTZ={preferredTZ}
              appNameFromBlade={appNameForQuery}
              backendSessionToken={backendSessionToken}
              setIsSessionExpiredBackendToken={setIsSessionExpiredBackendToken}
              isFileShare="no"
              preSelectedServer={bladeView.selectedServer}
              preSelectedHostingType={bladeView.hostingType}
              onLoadingChange={setIsBladeContentLoading}
            />
          );
        } else if (componentType === 'database') {
          return (
            <DatabaseMetrics
              key={bladeKey}
              date={date} 
              appInsights={appInsights} 
              preferredTZ={preferredTZ}
              appName={appNameForQuery}
              onLoadingChange={setIsBladeContentLoading}
            />
          );
        } else if (componentType === 'fileShare') {
          return (
            <FileshareMetrics 
              key={bladeKey}
              date={date} 
              preferredTZ={preferredTZ}
              appName={appNameForQuery}
              onLoadingChange={setIsBladeContentLoading}
            />
          );
        } else if (componentType === 'networkMetrics') {
          return (
            <NetworkMetrics 
              key={bladeKey}
              date={date} 
              preferredTZ={preferredTZ}
              appName={appNameForQuery}
              globalFilterData={globalFilterData}
              onLoadingChange={setIsBladeContentLoading}
            />
          );
        } else if (componentType === 'security') {
          return (
            <SecurityMetrics 
              key={bladeKey}
              appName={appNameForQuery}
            />
          );
        }
        else if (componentType === 'citrix') {
          return (
            <Citrix
              key={bladeKey}
              appName={appNameForQuery}
              backendSessionToken={backendSessionToken}
              preferredTZ={preferredTZ}
            />
          );
        }

        return null;
      };

      // Blade view is now the only UI
        const pagedData = bladeView.open ? newUIData : newUIData.slice((page - 1) * rowsPerPage, page * rowsPerPage);
        const totalPages = Math.ceil(newUIData.length / rowsPerPage);
        const appCiOptions = validAppCIs.length > 0 ? applicationList.filter(app => validAppCIs.includes(app.toUpperCase())).sort().map(val => val.toUpperCase()) : [];
        const hospitalOptions = Object.keys(hospitalToApp).sort();
        const chipLimitTags = 1;
        
        return (
          <Grid
            container
            sx={{
              position: "relative",
            }}
          >
            {!isBladeContentLoading && Object.keys(globalFilterData).length > 0 && validAppCIs.length > 0 && Object.keys(earlyWarningPopUpData).length > 0 && "popUpHeader" in earlyWarningPopUpData && (
              <PopUp
                popUpHeader={earlyWarningPopUpData["popUpHeader"]}
                popUpBody={earlyWarningPopUpData["popUpBody"]}
                buttons={earlyWarningPopUpData["buttons"]}
                isOpen={earlyWarningPopUpData["isOpen"]}
                isLoading={earlyWarningPopUpData["isLoading"]}
              />
            )}

            <Grid
              xs={12}
              sx={{
                position: "absolute",
                top: 12,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 1200,
                width: { xs: "calc(100% - 24px)", sm: "auto" },
                minWidth: { sm: 360 },
                maxWidth: 640,
                pointerEvents: "none",
                display: "flex",
                justifyContent: "center",
              }}
              mt={4}
            >
              <Fade in={Object.keys(earlyWarningPopUpData).length > 0 && Object.keys(earlyWarningPopUpData["actionResponse"] || {}).length > 0} timeout={{ enter: 250, exit: 500 }}>
                <Grid sx={{ pointerEvents: "auto", width: "100%" }} >
                  {Object.keys(earlyWarningPopUpData).length > 0 &&
                    Object.keys(earlyWarningPopUpData["actionResponse"] || {}).length > 0 ? (
                      earlyWarningPopUpData["actionResponse"]["status"] === 200 ? (
                        <Alert 
                          severity="success" 
                          sx={{ boxShadow: 3 }}
                          onClose={() => setEarlyWarningPopUpData((prev) => ({ ...prev, "actionResponse": {} }))}
                        >
                          {earlyWarningPopUpData["actionResponse"]["message"] || "Action completed successfully."}
                        </Alert>
                      ) : (
                        <Alert 
                          severity="error" 
                          sx={{ boxShadow: 3 }}
                          onClose={() => setEarlyWarningPopUpData((prev) => ({ ...prev, "actionResponse": {} }))}
                        >
                          {earlyWarningPopUpData["actionResponse"]["message"] || "Action failed. Please try again."}
                        </Alert>
                      )
                    ) 
                    : 
                    null
                  }
                </Grid>
              </Fade>
            </Grid>

            <Grid xs={12}>
              <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', background: "rgba(0, 51, 142, 0.015)", overflow: 'hidden', pt: 4, pb: 0 }}>
                <Box sx={{ px: 0.5, py: 0.25, background: "transparent", flexShrink: 0 }}>
                  <Grid
                    container
                    alignItems="center"
                    spacing={0.5}
                    sx={{
                      backgroundColor: "transparent",
                      padding: { xs: "2px 4px", sm: "2px 6px" },
                      flexWrap: { xs: 'wrap', md: 'nowrap' }
                    }}
                  >
                    <Grid item xs="auto">
                      <Tooltip title="Go Back">
                        <Box 
                          onClick={() => {
                            const targetUrl = previousAppHealthUrl?.current;
                            setGlobalFilterChoice({});
                            previousAppHealthUrl.current = "";
                            if (targetUrl && targetUrl !== location.pathname + location.search) {
                              navigate(targetUrl);
                            } else {
                              window.history.back();
                            }
                          }}
                          sx={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            cursor: 'pointer', 
                            color: "#00338e", 
                            mr: 0.5,
                            '&:hover': { opacity: 0.7 }
                          }}
                        >
                          <ArrowBackIosNewIcon sx={{ fontSize: 14, mr: 0.5 }} />
                          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>Back</Typography>
                        </Box>
                      </Tooltip>
                    </Grid>
                    <Grid item xs sm={5} md>
                      <Autocomplete
                        size="small"
                        multiple
                        disableCloseOnSelect
                        options={appCiOptions}
                        value={appCiDataChosen.map(v => v.toUpperCase())}
                        onChange={(e, v) => handleAppCiFilterChange(e, v)}
                        renderOption={(props, opt) => {
                          const selected = appCiDataChosen.map(v => v.toUpperCase()).includes(opt);
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
                              {value.slice(0, chipLimitTags).map((opt, idx) => (
                                <Chip {...getTagProps({ index: idx })} key={idx} label={opt} size="small" 
                                  sx={{ height: 24, fontSize: { xs: 11, sm: 12 }, backgroundColor: "#fff", border: "1px solid #E0E0E0" }} />
                              ))}
                              {numTags > chipLimitTags && (
                                <Typography
                                  sx={{ fontSize: { xs: 11, sm: 12 }, color: '#1976d2', cursor: 'pointer', ml: 0.5, fontWeight: 500, '&:hover': { textDecoration: 'underline' } }}
                                  onClick={(e) => { e.stopPropagation(); setAppCiDialogOpen(true); }}
                                >+{numTags - chipLimitTags} more</Typography>
                              )}
                            </>
                          );
                        }}
                        renderInput={(params) => (
                          <TextField 
                            {...params} 
                            variant="standard" 
                            placeholder={appCiDataChosen.length === 0 ? "Filter by App CI" : ""} 
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
                            minHeight: 28,
                          }
                        }}
                        ListboxProps={{ sx: { maxHeight: 280 } }}
                      />
                    </Grid>

                    <Grid item xs sm={5} md sx={{ ml: { xs: 0, sm: 0.5 } }}>
                      <Autocomplete
                        size="small"
                        multiple
                        disableCloseOnSelect
                        options={hospitalOptions}
                        value={hospitalDataChosen}
                        onChange={(e, v) => handleHospitalFilterChange(e, v)}
                        renderOption={(props, opt) => {
                          const selected = hospitalDataChosen.includes(opt);
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
                              {value.slice(0, chipLimitTags).map((opt, idx) => (
                                <Chip {...getTagProps({ index: idx })} key={idx} label={opt} size="small" 
                                  sx={{ height: 24, fontSize: { xs: 11, sm: 12 }, backgroundColor: "#fff", border: "1px solid #E0E0E0" }} />
                              ))}
                              {numTags > chipLimitTags && (
                                <Typography
                                  sx={{ fontSize: { xs: 11, sm: 12 }, color: '#1976d2', cursor: 'pointer', ml: 0.5, fontWeight: 500, '&:hover': { textDecoration: 'underline' } }}
                                  onClick={(e) => { e.stopPropagation(); setHospitalDialogOpen(true); }}
                                >+{numTags - chipLimitTags} more</Typography>
                              )}
                            </>
                          );
                        }}
                        renderInput={(params) => (
                          <TextField 
                            {...params} 
                            variant="standard" 
                            placeholder={hospitalDataChosen.length === 0 ? "Filter by Hospital" : ""} 
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
                            minHeight: 28,
                          }
                        }}
                        ListboxProps={{ sx: { maxHeight: 280 } }}
                      />
                    </Grid>

                    {(Object.keys(globalFilterData).length > 0 && validAppCIs.length > 0 && networkMetricsLoaded) && (
                    <Grid item xs="auto" sm="auto" sx={{ ml: { xs: 0, sm: 0.5 } }}>
                      <Box sx={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: { xs: 'center', sm: 'flex-start' },
                        backgroundColor: toggleState ? "rgba(255, 152, 0, 0.1)" : "rgba(255,255,255,0.8)", 
                        borderRadius: "4px", 
                        px: 1, 
                        py: 0.25,
                        border: toggleState ? "1px solid #a59d59" : "1px solid #E6E8EB",
                        transition: "all 0.2s ease"
                      }}>
                        {applicationPotentialIssues.length === 0 ?
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, p: 0.6}}>
                          <WarningAmberIcon sx={{ fontSize: 16, color: "#757575" }} />
                          <Typography sx={{ fontSize: { xs: 10, sm: 11 }, fontWeight: 600, color: "#00338e" }}>
                            No Components Affected
                          </Typography>
                        </Box>
                        : <FormControlLabel
                          control={
                            <Switch 
                              checked={toggleState} 
                              onChange={() => { 
                                setAppCiDataChosen([]); 
                                setHospitalDataChosen([]); 
                                setToggleState(!toggleState); 
                              }} 
                              size="small"
                              sx={{
                                '& .MuiSwitch-switchBase.Mui-checked': {
                                  color: '#FF9800',
                                },
                                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                  backgroundColor: '#FF9800',
                                },
                              }}
                            />
                          }
                          label={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <WarningAmberIcon sx={{ fontSize: 16, color: toggleState ? "#F57C00" : "#757575" }} />
                              <Typography sx={{ fontSize: { xs: 10, sm: 11 }, fontWeight: 600, color: toggleState ? "#E65100" : "#00338e" }}>
                                {affectedCount} Component(s) Affected
                              </Typography>
                            </Box>
                          }
                          sx={{ m: 0, gap: 0.5 }}
                        />}
                      </Box>
                    </Grid>
                    )}
                  </Grid>
                </Box>

                <Box sx={{ display: "flex", flex: 1, overflow: "hidden" }}>
              
                  {!bladeExpanded && (
                    <Box sx={{ 
                      width: bladeView.open ? { xs: "40%", sm: "35%", md: "30%", lg: "25%" } : "100%", 
                      minWidth: bladeView.open ? { xs: 200, sm: 260, md: 300 } : 0, 
                      maxWidth: bladeView.open ? { xs: 320, sm: 360, md: 400 } : "100%",
                      transition: "width 180ms", 
                      borderRight: bladeView.open ? "1px solid #E6E8EB" : "none", 
                      background: "rgba(0, 51, 142, 0.015)", 
                      display: "flex", 
                      flexDirection: "column",'&:hover .cards-scroll::-webkit-scrollbar-thumb': { background: '#a4a3a3ff' }
                    }}>
                      <Box sx={{ minHeight: { xs: 28, sm: 32 }, display: "flex", alignItems: "center", px: 0.75, background: "transparent", flexShrink: 0 }}>
                      </Box>

                    <Box className="cards-scroll" mb={2.5} sx={{ p: 0, overflowY: "auto", overflowX: "hidden", flex: 1, position: "relative",  '&::-webkit-scrollbar': { width: 6 }, '&::-webkit-scrollbar-thumb': { background: 'transparent', borderRadius: 3 } }}>
                      {(isBladeContentLoading || Object.keys(globalFilterData).length === 0 || validAppCIs.length === 0 || !networkMetricsLoaded) ? (
                        <Box sx={{ position: "absolute",top: 0,left: 0,right: 0,bottom: 0,display: "flex", justifyContent: "center", alignItems: "center",overflow: "hidden",
                          '& > *': {
                            maxWidth: '100%',
                            maxHeight: '100%',
                          }
                        }}>
                          <CircularProgress_Styled loadingWhat="Loading Applications" fetchingFor="Fetching application data..." />
                        </Box>
                      ) : pagedData.length === 0 ? (
                        <Typography sx={{ textAlign: "center", py: 3, color: "#00338e", fontSize: { xs: 12, sm: 13, md: 14 } }}>No applications found</Typography>
                      ) : (           
                        pagedData.map((item) => {
                          return <ResultRow
                            key={item.id}
                            item={item}
                            expanded={expandedMap[item.id] ?? true}
                            onToggleExpand={() => setExpandedMap((m) => ({ ...m, [item.id]: !(m[item.id] ?? true) }))}
                            onCardClick={handleBladeCardClick}
                            bladeOpen={bladeView.open}
                            selectedCardType={bladeView.component}
                            selectedAppName={bladeView.appName}
                          />
                        })           
                      )}
                    </Box>
                  </Box>
                  )}

                  {bladeView.open && (
                    <Box sx={{ flex: 1, display: "flex", flexDirection: "column", background: "rgba(0, 51, 142, 0.015)", overflow: "hidden", minWidth: 0, '&:hover .blade-scroll::-webkit-scrollbar-thumb': { background: '#a4a3a3ff' } }}>
                      <Paper elevation={0} sx={{ minHeight: { xs: 24, sm: 28 }, background: "transparent", display: "flex", alignItems: "center", justifyContent: "flex-end", px: { xs: 0.5, sm: 1 }, gap: 0.5, flexShrink: 0 }}>
                        <Tooltip title="View Onboarded Resources">
                          <IconButton size="small" onClick={() => handleResourceInfoClick(bladeView.appName)} sx={{ color: "#00338e" }}>
                            <InfoOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={bladeExpanded ? "Show Sidebar" : "Hide Sidebar"}>
                          <IconButton size="small" onClick={() => setBladeExpanded(!bladeExpanded)} sx={{ color: "#00338e" }}>
                            {bladeExpanded ? <KeyboardDoubleArrowRightIcon fontSize="small" /> : <KeyboardDoubleArrowLeftIcon fontSize="small" />}
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Close">
                          <IconButton size="small" onClick={() => { setBladeView({ open: false, component: null, appName: null }); setBladeExpanded(false); }} sx={{ color: "#00338e" }}>
                            <CloseIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Paper>
                      <Box className="blade-scroll" sx={{ flex: 1, overflow: "auto", position: "relative", '&::-webkit-scrollbar': { width: 6 }, '&::-webkit-scrollbar-thumb': { background: 'transparent', borderRadius: 3 } }}>
                        {(validAppCIs.length === 0 || !networkMetricsLoaded) ? (
                          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200, pt: 3 }}>
                          </Box>
                        ) : (
                          <Box sx={{ position: 'relative', minHeight: '100%' }}>
                            {isBladeContentLoading && (
                              <Box sx={{ position: 'absolute', inset: 0, zIndex: 2, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200, pt: 3, background: 'rgba(255,255,255,0.9)' }}>
                                <CircularProgress_Styled loadingWhat="Loading Component Data" fetchingFor="Fetching latest data..." />
                              </Box>
                            )}
                            {renderBladeContent()}
                          </Box>
                        )}
                      </Box>
                    </Box>
                  )}
                </Box>
                {validAppCIs.length > 0 && newUIData.length > 0 && !bladeView.open && (
                  <Box sx={{ 
                    position: "fixed", 
                    bottom: 0, 
                    left: 0, 
                    right: 0, 
                    height: 48, 
                    display: "flex", 
                    alignItems: "center", 
                    justifyContent: "center", 
                    background: "rgba(245, 247, 250, 0.95)", 
                    borderTop: "1px solid #E6E8EB",
                    zIndex: 10,
                    backdropFilter: "blur(4px)"
                  }}>
                    <Pagination 
                      count={totalPages} 
                      page={page} 
                      onChange={handleChangePage}
                      size="small"
                      sx={{
                        '& .MuiPaginationItem-root': {
                          minWidth: { xs: 26, sm: 30 },
                          height: { xs: 26, sm: 30 },
                          fontSize: { xs: 11, sm: 12, md: 13 },
                          borderRadius: '50%',
                          color: '#00338e',
                        }
                      }}
                    />
                  </Box>
                )}

                <Dialog open={appCiDialogOpen} onClose={() => setAppCiDialogOpen(false)} maxWidth="sm" fullWidth
                  PaperProps={{ sx: { borderRadius: 2, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', maxHeight: '72vh' } }}>
                  <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 2, pt: 2.5, px: 3, borderBottom: '1px solid #f0f0f0' }}>
                    <Typography variant="h6" sx={{ fontSize: 15, fontWeight: 600, color: '#333' }}>
                      Select Application CI
                      <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary', ml: 1 }}>({appCiDataChosen.length})</Typography>
                    </Typography>
                    <IconButton size="small" onClick={() => setAppCiDialogOpen(false)} sx={{ color: '#666' }}><CloseIcon fontSize="small" /></IconButton>
                  </DialogTitle>
                  <DialogContent sx={{ p: 0, overflow: 'auto' }}>
                    <Box sx={{ p: 2, borderBottom: '1px solid #f0f0f0' }}>
                      <Autocomplete
                        size="small" multiple disableCloseOnSelect options={appCiOptions}
                        value={appCiDataChosen.map(v => v.toUpperCase())}
                        onChange={(e, val) => handleAppCiFilterChange(e, val)}
                        renderOption={(props, opt) => {
                          const selected = appCiDataChosen.map(v => v.toUpperCase()).includes(opt);
                          return (
                            <Box {...props} key={opt} sx={{ py: 1, px: 1.5, bgcolor: selected ? 'rgba(0, 51, 142, 0.08)' : 'transparent',
                              borderLeft: selected ? '3px solid #00338e' : '3px solid transparent', '&:hover': { bgcolor: selected ? 'rgba(0, 51, 142, 0.12)' : 'rgba(0,0,0,0.04)' } }}>
                              <Typography variant="body2" sx={{ fontSize: 12, fontWeight: selected ? 600 : 400 }}>{opt}</Typography>
                            </Box>
                          );
                        }}
                        renderTags={(val, getTagProps) => (
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, maxHeight: 100, overflowY: 'auto', py: 0.5 }}>
                            {val.map((opt, idx) => (<Chip {...getTagProps({ index: idx })} key={idx} label={opt} size="small" sx={{ height: 22, fontSize: 11, m: 0.25 }} />))}
                          </Box>
                        )}
                        renderInput={(params) => (
                          <TextField {...params} placeholder="Search App CI..." variant="outlined" size="small"
                            InputProps={{ ...params.InputProps, startAdornment: (<><InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: '#999' }} /></InputAdornment>{params.InputProps.startAdornment}</>) }} />
                        )}
                        ListboxProps={{ sx: { maxHeight: 200 } }}
                      />
                    </Box>
                    <Box sx={{ px: 2, py: 1.5 }}>
                      <Typography variant="subtitle2" sx={{ fontSize: 12, fontWeight: 600, mb: 1, color: '#666' }}>Selected ({appCiDataChosen.length})</Typography>
                      <List sx={{ border: '1px solid #f0f0f0', borderRadius: 1, bgcolor: '#fafafa', maxHeight: 200, overflow: 'auto' }}>
                        {appCiDataChosen.length > 0 ? appCiDataChosen.map((val, idx) => (
                          <ListItem key={idx} sx={{ py: 0.75, px: 1.5, borderBottom: idx < appCiDataChosen.length - 1 ? '1px solid #f0f0f0' : 'none', '&:hover': { bgcolor: '#f5f5f5' } }}
                            secondaryAction={<IconButton edge="end" size="small" onClick={() => handleAppCiFilterChange({ preventDefault: () => {} }, appCiDataChosen.filter((_, i) => i !== idx))} sx={{ color: '#d32f2f' }}><DeleteOutlineIcon fontSize="small" /></IconButton>}>
                            <ListItemText primary={val.toUpperCase()} primaryTypographyProps={{ fontSize: 12, fontWeight: 500 }} />
                          </ListItem>
                        )) : <Box sx={{ p: 2, textAlign: 'center' }}><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>No App CI selected</Typography></Box>}
                      </List>
                    </Box>
                  </DialogContent>
                  <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid #f0f0f0' }}>
                    <Button onClick={() => setAppCiDialogOpen(false)} variant="contained" size="small" sx={{ textTransform: 'none', fontSize: 12, px: 2.5 }}>Done</Button>
                  </DialogActions>
                </Dialog>

              
                <Dialog open={hospitalDialogOpen} onClose={() => setHospitalDialogOpen(false)} maxWidth="sm" fullWidth
                  PaperProps={{ sx: { borderRadius: 2, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', maxHeight: '72vh' } }}>
                  <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 2, pt: 2.5, px: 3, borderBottom: '1px solid #f0f0f0' }}>
                    <Typography variant="h6" sx={{ fontSize: 15, fontWeight: 600, color: '#333' }}>
                      Select Hospital
                      <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary', ml: 1 }}>({hospitalDataChosen.length})</Typography>
                    </Typography>
                    <IconButton size="small" onClick={() => setHospitalDialogOpen(false)} sx={{ color: '#666' }}><CloseIcon fontSize="small" /></IconButton>
                  </DialogTitle>
                  <DialogContent sx={{ p: 0, overflow: 'auto' }}>
                    <Box sx={{ p: 2, borderBottom: '1px solid #f0f0f0' }}>
                      <Autocomplete
                        size="small" multiple disableCloseOnSelect options={hospitalOptions}
                        value={hospitalDataChosen}
                        onChange={(e, val) => handleHospitalFilterChange(e, val)}
                        renderOption={(props, opt) => {
                          const selected = hospitalDataChosen.includes(opt);
                          return (
                            <Box {...props} key={opt} sx={{ py: 0.5, px: 1.5, bgcolor: selected ? 'rgba(0, 51, 142, 0.08)' : 'transparent',
                              borderLeft: selected ? '3px solid #00338e' : '3px solid transparent', '&:hover': { bgcolor: selected ? 'rgba(0, 51, 142, 0.12)' : 'rgba(0,0,0,0.04)' } }}>
                              <Typography variant="body2" sx={{ fontSize: 12, fontWeight: selected ? 600 : 400 }}>{opt}</Typography>
                            </Box>
                          );
                        }}
                        renderTags={(val, getTagProps) => (
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, maxHeight: 100, overflowY: 'auto', py: 0.5 }}>
                            {val.map((opt, idx) => (<Chip {...getTagProps({ index: idx })} key={idx} label={opt} size="small" sx={{ height: 22, fontSize: 11, m: 0.25 }} />))}
                          </Box>
                        )}
                        renderInput={(params) => (
                          <TextField {...params} placeholder="Search Hospital..." variant="outlined" size="small"
                            InputProps={{ ...params.InputProps, startAdornment: (<><InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: '#999' }} /></InputAdornment>{params.InputProps.startAdornment}</>) }} />
                        )}
                        ListboxProps={{ sx: { maxHeight: 200 } }}
                      />
                    </Box>
                    <Box sx={{ px: 2, py: 1.5 }}>
                      <Typography variant="subtitle2" sx={{ fontSize: 12, fontWeight: 600, mb: 1, color: '#666' }}>Selected ({hospitalDataChosen.length})</Typography>
                      <List sx={{ border: '1px solid #f0f0f0', borderRadius: 1, bgcolor: '#fafafa', maxHeight: 200, overflow: 'auto' }}>
                        {hospitalDataChosen.length > 0 ? hospitalDataChosen.map((val, idx) => (
                          <ListItem key={idx} sx={{ py: 0.75, px: 1.5, borderBottom: idx < hospitalDataChosen.length - 1 ? '1px solid #f0f0f0' : 'none', '&:hover': { bgcolor: '#f5f5f5' } }}
                            secondaryAction={<IconButton edge="end" size="small" onClick={() => handleHospitalFilterChange({ preventDefault: () => {} }, hospitalDataChosen.filter((_, i) => i !== idx))} sx={{ color: '#d32f2f' }}><DeleteOutlineIcon fontSize="small" /></IconButton>}>
                            <ListItemText primary={val} primaryTypographyProps={{ fontSize: 12, fontWeight: 500 }} />
                          </ListItem>
                        )) : <Box sx={{ p: 2, textAlign: 'center' }}><Typography sx={{ fontSize: 12, color: 'text.secondary' }}>No Hospital selected</Typography></Box>}
                      </List>
                    </Box>
                  </DialogContent>
                  <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid #f0f0f0' }}>
                    <Button onClick={() => setHospitalDialogOpen(false)} variant="contained" size="small" sx={{ textTransform: 'none', fontSize: 12, px: 2.5 }}>Done</Button>
                  </DialogActions>
                </Dialog>

                {/* Resource List Dialog */}
                <ResourceDialog
                  open={resourceDialogOpen}
                  onClose={() => setResourceDialogOpen(false)}
                  appFamily={resourceDialogAppFamily}
                  appFamilyAppCIs={appFamToAppCi[resourceDialogAppFamily] || []}
                  globalFilterData={globalFilterData}
                  date={date}
                />
              </Box>
            </Grid>
          </Grid>
          
        );
    }

    // Always render blade view UI (new default)
    // No full page loading - panels handle their own loading states
    return (
      <>
      {
        Object.keys(globalFilterData).length>0 && Object.keys(globalApplicationList).length>0 && networkMetricsLoaded && securityMetricsLoaded ?
          <HospitalAccordion hospital={metricAllApplications} />
          :
          <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', minHeight: '100vh', mx: 0, px: { xs: 2, sm: 3, md: 4 }, pt: { xs: 3, sm: 4 } }}>
            <StyledCard sx={{ borderRadius: 2, margin: 1 }}>
              <Grid container xs={12} justifyContent="center" alignItems="center" sx={{ minHeight: 200, height: '100%', display: 'flex' }}>
                <CircularProgress_Styled loadingWhat='Loading Application Health Summary' fetchingFor='Fetching Application Components and its Metrics'/>
              </Grid>
            </StyledCard>
          </Box>
      }
    </>
      
    );
}
export default ApplicationDownDetailsNew;

function htmlTable_For_Resolution({ data }) {
  var resourceComponentMapping = {
    "subscriptionid": "Subscription ID",
    "resourcegroup": "Resource Group",
    "servername": "Server Name",
    "databasename": "Database Name",
    "sqlservername": "SQL Server Name",
    "storagename": "Storage Account Name",
    "filesharename": "File Share Name",
    "applicationci": "Application CI",
  };

  var escapeHtml = (value) => {
    if (value === null || value === undefined) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  var temp = [];
  console.log(data)
  Object.keys(data?.["Resource Name"] || {}).forEach((key) => {
    var splitConditionColumn = (data?.["Condition"]?.[key] || "").split(";");
    var condition = (splitConditionColumn[0] || "").trim();
    var utilizationOrStatus = (splitConditionColumn[splitConditionColumn.length - 1] || "").trim();
    var resourceType = (data?.["Resource Type"]?.[key] || "").toLowerCase();
    var id = data?.["Issue ID"][key]
    var resourceDetails = {};

    if (resourceType === "windows service") {
      var resName = (data["Resource Name"][key] || "").split("-");
      var serverName = resName.slice(0, -1).join("-");
      var serviceName = resName[resName.length - 1] || "";
      resourceDetails["Server Name"] = serverName;
      resourceDetails["Service Name"] = serviceName;
    } else if(resourceType === "url"){
        var resName = (data["Resource Name"][key] || "").split("-");
        resourceDetails["URL"] = resName[resName.length - 1] || "";
    }
    else if (resourceType === "corepoint interfaces") {
      resourceDetails["Interface Name"] = data["Resource Name"][key] || "";
    } else {
      var resName = (data["Resource Name"][key] || "").split("/");
      for (var i = 0; i < resName.length - 1; i += 2) {
        var sourceKey = (resName[i] || "").toLowerCase();
        var label = resourceComponentMapping[sourceKey] || resName[i];
        resourceDetails[label] = resName[i + 1];
      }
    }

    var eventStatus = (data?.["Status"]?.[key] || "").toLowerCase();
    var existingComments = data?.["Comments"]?.[key] || "";

    temp.push({
      "Resource Name": resourceDetails,
      "Condition": condition,
      "Utilization/Status": utilizationOrStatus,
      "ID" : id,
      "Comments": existingComments,
      "Status": "",
      "EventStatus": eventStatus,
      "IsResolved": eventStatus === "resolved"
    });
  });
  console.log(temp)

  var htmlBody = `
    <div style="margin-top: 8px; border: 1px solid #D7E4F9; border-radius: 8px; overflow: hidden; background: #fff;">
      <table style="width:100%; border-collapse: collapse; font-family: 'Segoe UI', Arial, sans-serif; table-layout: fixed;">
        <thead>
          <tr style="background: linear-gradient(90deg, #EAF2FF 0%, #F4F8FF 100%);">
            <th style="border: 1px solid #D7E4F9; padding: 8px; text-align: left; color: #0D3B85; font-size: 12px;">Resource Name</th>
            <th style="border: 1px solid #D7E4F9; padding: 8px; text-align: left; color: #0D3B85; font-size: 12px;">Condition</th>
            <th style="border: 1px solid #D7E4F9; padding: 8px; text-align: left; color: #0D3B85; font-size: 12px;">Utilization/Status</th>
            <th style="border: 1px solid #D7E4F9; padding: 8px; text-align: left; color: #0D3B85; font-size: 12px;">Comments</th>
            <th style="border: 1px solid #D7E4F9; padding: 8px; text-align: left; color: #0D3B85; font-size: 12px;">Event Type</th>
            <th style="border: 1px solid #D7E4F9; padding: 8px; text-align: left; color: #0D3B85; font-size: 12px;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${
            temp.length > 0
              ? temp
                  .map((item, index) => {
                    var resourceName = Object.entries(item["Resource Name"] || {})
                      .map(([k, v]) => `<div><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}</div>`)
                      .join("");

                    // If already resolved, show greyed out row
                    if (item.IsResolved) {
                      return `
                        <tr style="background: #F3F4F6; opacity: 0.7;">
                          <td style="border: 1px solid #D7E4F9; padding: 8px; text-align: left; vertical-align: top; font-size: 12px; color:#6B7280; word-wrap: break-word; word-break: break-all;">${resourceName}</td>
                          <td style="border: 1px solid #D7E4F9; padding: 8px; text-align: left; vertical-align: top; font-size: 12px; color:#6B7280;">${escapeHtml(item["Condition"])}</td>
                          <td style="border: 1px solid #D7E4F9; padding: 8px; text-align: left; vertical-align: top; font-size: 12px; color:#6B7280;">${escapeHtml(item["Utilization/Status"])}</td>
                          <td style="border: 1px solid #D7E4F9; padding: 8px; vertical-align: top; font-size: 12px; color:#6B7280;">${escapeHtml(item["Comments"]) || "-"}</td>
                          <td style="border: 1px solid #D7E4F9; padding: 8px; vertical-align: top; font-size: 12px; color:#6B7280;">-</td>
                          <td style="border: 1px solid #D7E4F9; padding: 8px; vertical-align: middle; text-align: center;">
                            <span style="display: inline-block; padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 600; color: #107C10; background-color: #DFF6DD;">
                              ✓ Updated
                            </span>
                          </td>
                        </tr>
                      `;
                    }

                    return `
                      <tr style="background:${index % 2 === 0 ? "#FFFFFF" : "#F8FBFF"};">
                        <td style="border: 1px solid #D7E4F9; padding: 8px; text-align: left; vertical-align: top; font-size: 12px; color:#1F2D3D; word-wrap: break-word; word-break: break-all;">${resourceName}</td>
                        <td style="border: 1px solid #D7E4F9; padding: 8px; text-align: left; vertical-align: top; font-size: 12px; color:#1F2D3D;">${escapeHtml(item["Condition"])}</td>
                        <td style="border: 1px solid #D7E4F9; padding: 8px; text-align: left; vertical-align: top; font-size: 12px; color:#1F2D3D;">${escapeHtml(item["Utilization/Status"])}</td>
                        <td style="border: 1px solid #D7E4F9; padding: 8px; vertical-align: top;">
                          <textarea
                            placeholder="Add comment"
                            data-row-index="${index}"
                            data-id="${item["ID"]}"
                            rows="2"
                            style="width: 100%; min-height: 56px; box-sizing: border-box; padding: 7px 8px; border: 1px solid #C8D8F5; border-radius: 6px; font-size: 12px; color: #1F2D3D; background: #fff; resize: vertical; overflow-wrap: break-word; word-break: break-word;"
                            data-id="${item["ID"]}"
                            oninput="window.handleWarningFieldChange('${item["ID"]}', 'Comments', this.value)"
                          ></textarea>
                        </td>
                        <td style="border: 1px solid #D7E4F9; padding: 8px; vertical-align: top;">
                          <select
                            data-row-index="${index}"
                            style="width: 100%; box-sizing: border-box; padding: 7px 8px; border: 1px solid #C8D8F5; border-radius: 6px; font-size: 12px; color: #1F2D3D; background: #fff;"
                            onchange="window.handleWarningFieldChange('${item["ID"]}', 'Status', this.value)"
                          >
                            <option value="" disabled selected>Select Event Type</option>
                            <option value="True Positive">True Positive</option>
                            <option value="False Positive">False Positive</option>
                            <option value="Remove from Alerting">Remove from Alerting</option>
                          </select>
                        </td>
                        <td style="border: 1px solid #D7E4F9; padding: 8px; vertical-align: middle; text-align: center;">
                          <button
                            id="update-btn-${item["ID"]}"
                            disabled
                            style="width: 100%; padding: 8px 12px; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; color: #fff; background-color: #0078D4; cursor: pointer; opacity: 0.5;"
                            onmouseover="this.style.opacity=this.disabled ? '0.5' : '0.85'"
                            onmouseout="this.style.opacity=this.disabled ? '0.5' : '1'"
                            onclick="window.handleUpdateSingleWarningEvent('${item["ID"]}')"
                          >
                            Update
                          </button>
                        </td>
                      </tr>
                    `;
                  })
                  .join("")
              : 
              `<tr><td colspan="5" style="border: 1px solid #D7E4F9; padding: 10px; text-align: center; font-size: 12px; color: #6B7280;">No warning events found.</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;

  return {"htmlBody":htmlBody, "warningEvents":temp};
}