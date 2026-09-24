import React, { useEffect, useState } from 'react'
import Grid from '@mui/material/Unstable_Grid2';
import { Modal, Card, CardContent, CardActionArea, Typography, Box, Accordion, AccordionSummary, AccordionDetails, Divider, Button, TextField, ButtonGroup, Autocomplete, List, ListItem, ListItemText, ToggleButton, ToggleButtonGroup, IconButton,Chip } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import TableRowsIcon from '@mui/icons-material/TableRows';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
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
import DataNotFoundIcon from '../../Static/Images/DataNotFound.svg'
import Tooltip from '@mui/material/Tooltip'; 
import '../../../assets/css/fonts.css';
import {getUrl} from '../../../environment'
import LocationIcon from '../../Static/Images/LocationIcon.svg'
import InfoOutlined from '@mui/icons-material/InfoOutlined'
import { convertTimeToPreferredTZ, convertTimeToPreferredTZ_ToUtc,convertTimeToPreferredTZ_fromUtc } from '../../shared/Timestamp/PreferenceConversion';
import { logPageVisit,startPageTracking,appInsights } from "../appInsights";
import {fetchServicesData_fromADX} from "../../shared/APIs/fetchAPIs"
import CircularProgress_Styled from '../../shared/UI Components/CircularProgress'

const StyledCard = styled(Card)({
    width: '100%',
    boxShadow: '0px 3px 6px rgba(0, 0, 0, 0.16)',
    padding: 4,
    position: 'relative',
});

const ApplicationStatus = ({date, appInsights, globalFilterData,preferredTZ, appName}) => {
    
    var location = useLocation()
    var urlParams = new URLSearchParams(location.search)

    var {data, AppName} = location.state || {}
    
    var baseUrl =  getUrl()
    
    var [serverList, setServerList] = useState("")
    var [windowsEvent,setWindowsEvent] = useState({})
    var [servicesInfo, setServicesInfo] = useState({
        "Services":
            {"Total":-1,
            "Running":-1},
        "API":
            {"Total":-1,
            "Running":-1},
        "URL":
            {"Total":-1,
            "Running":-1}
    })
    var [servicesGraphData, setServicesGraphData] = useState({
        "Aggregate" : {},
        "NonAggregate" : {}
    })
    var [serviceStatus, setServiceStatus] = useState({})
    
    var [servicesData, setServicesData] = useState({})
    var [loading, setLoading] = useState({
        "windowsEvent" : true,
        "serviceLogs": true
    });
    var [serviceAvailabilityFilter, setServiceAvailabilityFilter] = useState("")

    var [errorApi, setErrorApi] = useState({
        "windowsEvent" : "",
        "serviceLogs": ""
    })
    var [servicesDate, setServicesDate] = useState({})
    var [retryApi, setRetryApi] = useState({
        "WindowsEvent":0,
        "Services":0
    })

    var [modalOpen, setModalOpen] = useState(false);
    var [modalHeader, setModalHeader] = useState("");
    var [modalTableContent, setModalTableContent] = useState({ header: [], data: [] });
    var [autocompleteOptions, setAutocompleteOptions] = useState([]);
    var [originalTableData, setOriginalTableData] = useState([]); 
    var [descriptionOptions, setDescriptionOptions] = useState([])
    var [selectedServer, setSelectedServer] = useState('');
    var [selectedServer, setSelectedServer] = useState(null);
    var [selectedDescription, setSelectedDescription] = useState(null);
    var [servicesViewMode, setServicesViewMode] = useState('graph');
    var [expandedServiceRow, setExpandedServiceRow] = useState(null);
    var [statusFilter, setStatusFilter] = useState('all'); // 'all', 'running', 'stopped'
    var [serviceNameFilter, setServiceNameFilter] = useState([]);
    var [tablePage, setTablePage] = useState(0);
    var [rowsPerPage, setRowsPerPage] = useState(10);
    var [modalPage, setModalPage] = useState(0);
    var [modalRowsPerPage, setModalRowsPerPage] = useState(10);

    var [windowsEventCard, setWindowsEventCard] = useState({
        "Information":-1, 
        "Warning":-1,
        "Error":-1
    })

    var [queryParams, setQueryParams] = useState({})
    
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
        window.scrollTo(0,0)
        console.log(data)
        var serverName = ""
        // Use appName prop if provided, otherwise fall back to URL params
        var nameOfResource = appName || urlParams.get("Name")?.toString() || ""
        var typeOfResource = urlParams.get("Type")?.toString() || "Application CI"
        
        if(Object.keys(globalFilterData).length>0 && nameOfResource){
            setQueryParams({
                "Name":nameOfResource,
                "Type":typeOfResource
            })
            Object.keys(globalFilterData["AppCI"]).map((k)=>{
                if(globalFilterData["AppCI"][k].toUpperCase()===nameOfResource.toUpperCase()){
                    serverName = serverName+ globalFilterData["ServerName"][k]+ ","
                }
            })
            serverName = serverName.slice(0,-1)
            console.log(serverName)
            setServerList(serverName)
        }
        
    },[globalFilterData, appName])

    useEffect(()=>{
        if(Object.keys(serviceStatus).length>1){
            var appCIArr = Object.keys(serviceStatus["AppCI"])
            .filter((item)=>serviceStatus["AppCI"][item].toLowerCase()==queryParams["Name"].toLowerCase())
            if(appCIArr.length>0){
                var servicesTotal = appCIArr.filter((item)=>serviceStatus["MonitorType"][item]=="OS-Services").length
                var servicesRunning = appCIArr.filter((item)=>(serviceStatus["MonitorType"][item]=="OS-Services" && serviceStatus["Status"][item].toLowerCase()=="running")).length
                var urlTotal = appCIArr.filter((item)=>serviceStatus["MonitorType"][item]=="URL").length
                var urlRunning = appCIArr.filter((item)=>(serviceStatus["MonitorType"][item]=="URL" && serviceStatus["Status"][item].toLowerCase()=="running")).length
                var servicesStoppedList = {"ServicesStoppedList":[],"UrlStoppedList":[]} 
                Object.keys(serviceStatus["AppCI"])
                .filter((item)=>serviceStatus["AppCI"][item].toLowerCase()==queryParams["Name"].toLowerCase() && serviceStatus["Status"][item].toLowerCase()!=="running")
                .map((key)=>{
                    if(serviceStatus["MonitorType"][key]==="OS-Services"){
                        servicesStoppedList["ServicesStoppedList"].push(serviceStatus["ServerServiceMap"][key])
                    }
                    else if(serviceStatus["MonitorType"][key]==="URL"){
                        servicesStoppedList["UrlStoppedList"].push(serviceStatus["ServerServiceMap"][key])
                    }
                })
                console.log(servicesStoppedList)
                setServicesInfo({
                    "Services":
                        {"Total":servicesTotal==0 ? "NA":servicesTotal,
                        "Running":servicesRunning, "servicesStoppedList": servicesStoppedList["ServicesStoppedList"]},
                    "API":
                        {"Total":"NA",
                        "Running":"NA"},
                    "URL":
                        {"Total":urlTotal==0 ? "NA":urlTotal,
                        "Running":urlRunning, "urlStoppedList": servicesStoppedList["UrlStoppedList"]}
                })
            }
            else{
                setServicesInfo({
                    "Services":
                        {"Total":"NA",
                        "Running":"NA", "servicesStoppedList":[]},
                    "API":
                        {"Total":"NA",
                        "Running":"NA"},
                    "URL":
                        {"Total":"NA",
                        "Running":"NA", "urlStoppedList":[]}
                })
            }
        }
        else if(Object.keys(serviceStatus).length===1){
            setServicesInfo({
                "Services":
                    {"Total":"NA",
                    "Running":"NA"},
                "API":
                    {"Total":"NA",
                    "Running":"NA"},
                "URL":
                    {"Total":"NA",
                    "Running":"NA"}
            })
        }
    }, [serviceStatus])

    useEffect(()=>{
        setServicesInfo({
            "Services":
                {"Total":-1,
                "Running":-1},
            "API":
                {"Total":-1,
                "Running":-1},
            "URL":
                {"Total":-1,
                "Running":-1}
        })
        setServicesGraphData((prevState)=>({
            ...prevState,
            "NonAggregate" : {}
        }))
        if(serverList.length>0 && date["startDate"]!="" && Object.keys(queryParams).length>0){
            setServiceAvailabilityFilter("")
            console.log("Hello1")

            fetchWindowsEventData("no")
            //fetchServicesData("yes")
            //fetchServicesData("no")
            getServicesData_fromADX(true)
            getServicesData_fromADX(false)
            
        }
        else if(Object.keys(queryParams).length>0){
            //fetchServicesData("yes")
            //fetchServicesData("no")
            getServicesData_fromADX(true)
            getServicesData_fromADX(false)
            
            setWindowsEventCard((prevStatus)=>({
                ...prevStatus,
                "Information":"NA",
                "Warning":"NA",
                "Error":"NA"
            }))
        }
    },[serverList, date, queryParams,preferredTZ])

    useEffect(()=>{
        if(Object.keys(windowsEvent).length>0){
            if(Object.keys(windowsEvent["ServerName"]).length>0){
                setWindowsEventCard({
                    "Information" : Object.values(windowsEvent["EventType"]).filter((item)=>item=="Information").length,
                    "Warning" : Object.values(windowsEvent["EventType"]).filter((item)=>item=="Warning").length,
                    "Error" : Object.values(windowsEvent["EventType"]).filter((item)=>item=="Error").length
                })
            }
            else{
                setWindowsEventCard({
                    "Information" : "NA",
                    "Warning" : "NA",
                    "Error" : "NA"
                })
            }
        }
    },[windowsEvent])

    useEffect(()=>{
        if(Object.keys(servicesGraphData["NonAggregate"]).length>1){ //Object.keys(servicesGraphData["Aggregate"]).length>1 && 
            setServiceAvailabilityFilter(Object.values(servicesGraphData["NonAggregate"]["ServerServiceMap"])[0])

        }
        
    },[servicesGraphData])

    useEffect(()=>{

        if(serviceAvailabilityFilter!=null && serviceAvailabilityFilter!=""){
            var b = {}
            var lastStatus = {}
            Object.keys(servicesGraphData["NonAggregate"]["ServiceName"]).filter((i)=>servicesGraphData["NonAggregate"]["ServerServiceMap"][i]==serviceAvailabilityFilter).map((i)=>{
                
                if(!(servicesGraphData["NonAggregate"]["TimeGenerated"][i] in b)){
                    b[servicesGraphData["NonAggregate"]["TimeGenerated"][i]] = {"name":servicesGraphData["NonAggregate"]["TimeGenerated"][i]}
                }
                b[servicesGraphData["NonAggregate"]["TimeGenerated"][i]][servicesGraphData["NonAggregate"]["ServerServiceMap"][i]] = servicesGraphData["NonAggregate"]["Status"][i]=="Running" ? 1 : 0 
            })

            setServicesData(Object.values(b))
        }
        
    },[serviceAvailabilityFilter])

    var handleModalClose = () => {
        setModalOpen(false);
    }

    var getServicesData_fromADX = async(aggregate) => {
        setLoading(prevLoading=>({
            ...prevLoading,
            "serviceLogs" : true
        }));    
        var params = {
            "Latest Only": aggregate,
            "Application CI": [
                queryParams["Name"]
            ],
            "Start Time": convertTimeToPreferredTZ_ToUtc(date.startDate),
            "End Time": convertTimeToPreferredTZ_ToUtc(date.endDate),
            "Object Name": ["services","url"]
        };
        try{
            var results = await fetchServicesData_fromADX(params)
            console.log(results)
            console.log(params)
            if(aggregate){
                var convertTimeZone = convertTimeToPreferredTZ_fromUtc(results)
                setServiceStatus(convertTimeZone)
            }
            else{
                setServicesGraphData((prevState)=>({
                    ...prevState,
                    "NonAggregate" : convertTimeToPreferredTZ_fromUtc(results)
                }))
            }
        }
        catch (error) {
            console.error(error);
            setErrorApi(prev => ({ ...prev, serviceLogs: error.message }))
        }
        finally {
            setLoading(prev => ({ ...prev, serviceLogs: false }));
        }
        
    }

    var fetchServicesData = async(aggregate)=>{
        setLoading(prevLoading=>({
            ...prevLoading,
            "serviceLogs" : true
        }));

        var params = {
            aggregate: aggregate,
            filters: {
                "appFamily": [
                  "All"
                ],
                "appCI": [
                  queryParams["Name"]
                ],
                "managedByGroup": [
                  "All"
                ],
                "supportGroup": [
                  "All"
                ]
            },
            start_time: date.startDate,
            end_time: date.endDate
        };
        var url = new URL(baseUrl + 'serviceLogs');
        url.search = new URLSearchParams(params).toString();
        
        fetch(url,{
            method:'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(params)
        })
        .then((response) => response.json())
        .then((data) =>{ 
            console.log(JSON.parse(data["ServicesData"]))
            if(Object.keys(JSON.parse(data["ServicesData"])).length>0){
                if(aggregate=="yes"){
                    
                    setServiceStatus(convertTimeToPreferredTZ(JSON.parse(data["ServicesData"])))
                }
                else{
                    setServicesGraphData((prevState)=>({
                        ...prevState,
                        "NonAggregate" : convertTimeToPreferredTZ(JSON.parse(data["ServicesData"]))
                    }))
                }
            }
            else{
                if(aggregate=="yes"){
                    setServiceStatus({
                        "ServerName":{}
                    })
                }
                else{
                    setServicesGraphData((prevState)=>({
                        ...prevState,
                        "NonAggregate" : {
                            "ServerName":{}
                        }
                    }))
                }

            }
            setLoading(prevLoading=>({
                ...prevLoading,
                "serviceLogs" : false
            }))
            
        })
        .catch((error)=>{
            //console.log(error)
            if(aggregate=="yes"){
                setServicesGraphData((prevState)=>({
                    ...prevState,
                    "Aggregate" : {
                        "ServerName":{}
                    }
                }))
            }
            else{
                setServicesGraphData((prevState)=>({
                    ...prevState,
                    "NonAggregate" : {
                        "ServerName":{}
                    }
                }))
            }
            setLoading(prevLoading=>({
                ...prevLoading,
                "serviceLogs" : false
            }))
            setErrorApi((prevState)=>({
                ...prevState,
                "Services": "API didnt load"
            }))
        })
    }

    var fetchWindowsEventData = async(aggregate) => {
        
        setWindowsEvent({})
        setWindowsEventCard({
            "Information":-1, 
            "Warning":-1,
            "Error":-1
        })
        setLoading(prevLoading=>({
            ...prevLoading,
            "windowsEvent" : true
        }));
        
        var params = {
          aggregate: aggregate,
          filters: "",
          serverName: serverList,
          start_time: date.startDate,
          end_time: date.endDate
        };
        console.log(serverList)
        
        var url = new URL(baseUrl+ 'windowEventLogs');
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
            // if(isEqualJson(currentFilterData,JSON.parse(params["filters"]))){
            //   //console.log("Changed")
            // //console.log(JSON.parse(data["windowsEventLogs"]))
            if(Object.keys(JSON.parse(data["windowsEventLogs"])).length>0){
                setWindowsEvent(convertTimeToPreferredTZ(JSON.parse(data["windowsEventLogs"])))
            }
            
            setLoading(prevLoading=>({
                ...prevLoading,
                "windowsEvent" : false
            }))
            setRetryApi((prev)=>({
                ...prev,
                "WindowsEvent" : 0
            }))
            
          })
          .catch((error) =>{ 
            setWindowsEvent({
                "ServerName" : {}
            })
            setErrorApi((prevState)=>({
                ...prevState,
                "windowsEvent" : "API didnt load"
            }))
            setLoading(prevLoading=>({
                ...prevLoading,
                "windowsEvent" : false
            }))
            console.error('Error:', error)
          });
      };
    
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
                        
                        {modalTableContent['data'].slice(modalPage * modalRowsPerPage, modalPage * modalRowsPerPage + modalRowsPerPage).map((entry)=>{
                            return (<TableRow>  
                                {Object.values(entry).map((val)=>{
                                    return <TableCell align="center">{val}</TableCell>
                                })}
                            </TableRow>
                            )
                        })}
                        
                    </TableBody>
                </Table>
                <TablePagination
                    component="div"
                    count={modalTableContent['data'].length}
                    page={modalPage}
                    onPageChange={(e, newPage) => setModalPage(newPage)}
                    rowsPerPage={modalRowsPerPage}
                    onRowsPerPageChange={(e) => { setModalRowsPerPage(parseInt(e.target.value, 10)); setModalPage(0); }}
                    rowsPerPageOptions={[5, 10, 25, 50]}
                />
            </TableContainer>
        )
    }
    const handleServerChange = (event, value) => {
        setSelectedServer(value);
    
        if (value) {
           
            const filteredDescriptions = originalTableData
                .filter(item => item["Server Name"] === value)
                .map(item => item["Description"]);
    
            setDescriptionOptions(Array.from(new Set(filteredDescriptions)));
    
            // Filter table content based on selected server and description
            const filteredData = originalTableData.filter(item => {
                const descriptionMatch = !selectedDescription || 
                    item["Description"].toLowerCase().includes(selectedDescription.toLowerCase());
                const serverMatch = item["Server Name"] === value;
    
                return descriptionMatch && serverMatch;
            });
    
            setModalTableContent({
                header: filteredData.length > 0 ? Object.keys(filteredData[0]) : [],
                data: filteredData,
            });
            setModalPage(0);
        } else {
            // If server is unselected, show all records that match the selected description
            const filteredData = originalTableData.filter(item => {
                const descriptionMatch = !selectedDescription || 
                    item["Description"].toLowerCase().includes(selectedDescription.toLowerCase());
    
                return descriptionMatch; 
            });
    
            setModalTableContent({
                header: filteredData.length > 0 ? Object.keys(filteredData[0]) : [],
                data: filteredData,
            });
            setModalPage(0);
          
            const allDescriptions = originalTableData.map(item => item["Description"]);
            setDescriptionOptions(Array.from(new Set(allDescriptions)));
        }
    };
    
    
    const handleDescriptionChange = (event, value) => {
        setSelectedDescription(value);
    
        // Filter table content based on selected description and server
        const filteredData = originalTableData.filter(item => {
            const descriptionMatch = value 
                ? item["Description"].toLowerCase().includes(value.toLowerCase()) 
                : true; 
            const serverMatch = !selectedServer || item["Server Name"] === selectedServer;
    
            return descriptionMatch && serverMatch;
        });
    
        setModalTableContent({
            header: filteredData.length > 0 ? Object.keys(filteredData[0]) : [],
            data: filteredData,
        });
        setModalPage(0);
    
        if (value) {
            const filteredServers = originalTableData
                .filter(item => item["Description"].toLowerCase().includes(value.toLowerCase()))
                .map(item => item["Server Name"]);
            setAutocompleteOptions(Array.from(new Set(filteredServers)));
        } else {
            const allServers = originalTableData.map(item => item["Server Name"]);
            setAutocompleteOptions(Array.from(new Set(allServers)));
        }
    };
    
    
    const createModal = (title, type, status) => {
        let temp = [];
        let serverNames = new Set();
        let descriptions = new Set();
    
        if (type === "Windows Event") {
            Object.keys(windowsEvent["EventType"]).forEach((key) => {
                if (windowsEvent["EventType"][key] === status) {
                    const eventEntry = {
                        "TimeGenerated": windowsEvent["TimeGenerated"][key],
                        "Server Name": windowsEvent["ServerName"][key],
                        "Event Log": windowsEvent["EventLog"][key],
                        "Event ID": windowsEvent["EventID"][key],
                        "Event Type": windowsEvent["EventType"][key],
                        "Description": windowsEvent["Description"][key],
                        "Total Log": windowsEvent["SampleCount"][key],
                    };
                    temp.push(eventEntry);
                    serverNames.add(windowsEvent["ServerName"][key]);
                    descriptions.add(windowsEvent["Description"][key]);
                }
            });
        } 
    
        setAutocompleteOptions(Array.from(serverNames));
        setDescriptionOptions(Array.from(descriptions));
        setOriginalTableData(temp);
        setModalTableContent({
            header: temp.length > 0 ? Object.keys(temp[0]) : [],
            data: temp,
        });
    
        setModalHeader(title);
        setModalPage(0);
        setModalOpen(true);
    };
    
    
    var handleAvailabilityFilter = (event, value) =>{
        if(value!=null){
            setServiceAvailabilityFilter(value)
        }
        
    }

    const formatValue = (value) => {
        if (value >= 1_000_000) {
          return (value / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
        } else if (value >= 1_000) {
          return (value / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
        }
        return value;
    };

    var getServicesDownList = (listData, type) => {
        console.log(listData)
        return(
        <List sx={{maxHeight:"50vh", overflowY:'auto', backgroundColor:"white", color:"black"}}>
            <Typography variant="h6" textAlign={"center"}>
                {type} Down List
            </Typography>
            {listData.map((item, index) => (
                <ListItem key={index}>
                    <ListItemText primary={item} 
                        sx={{
                        '&:hover': {
                            color: 'blue',
                            textDecoration: 'underline',
                            cursor:"pointer"
                        }}}
                        onClick={()=>{
                            if(Object.keys(servicesGraphData["NonAggregate"]).length>1){
                                setServiceAvailabilityFilter(item);
                                window.scrollTo({
                                    top: document.documentElement.scrollHeight,
                                    behavior: 'smooth',
                                });
                            }
                        }}
                    />
                </ListItem>
            ))}
        </List>)
    }

    const getFilteredServiceKeys = () => {
        let keys = Object.keys(serviceStatus["AppCI"] || {}).filter(
            key => serviceStatus["AppCI"][key]?.toLowerCase() === queryParams["Name"]?.toLowerCase()
        );
        if (serviceNameFilter.length > 0) {
            keys = keys.filter(key => 
                serviceNameFilter.some(filter => 
                    serviceStatus["ServerServiceMap"]?.[key]?.toLowerCase() === filter.toLowerCase()
                )
            );
        }
        if (statusFilter !== 'all') {
            keys = keys.filter(key => {
                const isRunning = serviceStatus["Status"]?.[key]?.toLowerCase() === 'running';
                return statusFilter === 'running' ? isRunning : !isRunning;
            });
        }
        return keys;
    };

    const getSortedServiceKeys = (keys) => [...keys].sort((a, b) => {
        const isRunningA = serviceStatus["Status"]?.[a]?.toLowerCase() === 'running';
        const isRunningB = serviceStatus["Status"]?.[b]?.toLowerCase() === 'running';
        return isRunningA && !isRunningB ? 1 : !isRunningA && isRunningB ? -1 : 0;
    });

    const getServiceOptions = () => Object.keys(serviceStatus["ServerServiceMap"] || {})
        .filter(key => serviceStatus["AppCI"]?.[key]?.toLowerCase() === queryParams["Name"]?.toLowerCase())
        .map(key => serviceStatus["ServerServiceMap"]?.[key] || '')
        .filter((name, index, self) => name && self.indexOf(name) === index);

    const getDowntimeIntervals = (serverServiceMap) => {
        const intervals = [];
        if (Object.keys(servicesGraphData["NonAggregate"]).length <= 1) return intervals;
        
        const dataPoints = Object.keys(servicesGraphData["NonAggregate"]["ServerServiceMap"] || {})
            .filter(k => servicesGraphData["NonAggregate"]["ServerServiceMap"][k] === serverServiceMap)
            .map(k => ({
                time: servicesGraphData["NonAggregate"]["TimeGenerated"]?.[k],
                status: servicesGraphData["NonAggregate"]["Status"]?.[k]?.toLowerCase()
            }))
            .sort((a, b) => new Date(a.time) - new Date(b.time));
        
        let intervalStart = null, lastDownStatus = null;
        dataPoints.forEach((point, idx) => {
            const isDown = point.status !== 'running';
            if (isDown && !intervalStart) {
                intervalStart = point.time;
                lastDownStatus = point.status;
            } else if (!isDown && intervalStart) {
                intervals.push({ start: intervalStart, end: point.time, status: lastDownStatus, beforeRange: idx === 1 });
                intervalStart = null;
                lastDownStatus = null;
            }
        });
        if (intervalStart) intervals.push({ start: intervalStart, end: 'Ongoing', status: lastDownStatus, beforeRange: dataPoints.length > 0 && dataPoints[0].status !== 'running' });
        return intervals;
    };

    const getServiceGraphData = (serverServiceMap) => {
        if (Object.keys(servicesGraphData["NonAggregate"]).length <= 1) return [];
        const graphPoints = {};
        Object.keys(servicesGraphData["NonAggregate"]["ServerServiceMap"] || {}).forEach(k => {
            if (servicesGraphData["NonAggregate"]["ServerServiceMap"][k] === serverServiceMap) {
                const time = servicesGraphData["NonAggregate"]["TimeGenerated"]?.[k];
                if (time) {
                    graphPoints[time] = {
                        name: time,
                        [serverServiceMap]: servicesGraphData["NonAggregate"]["Status"]?.[k]?.toLowerCase() === 'running' ? 1 : 0
                    };
                }
            }
        });
        return Object.values(graphPoints);
    };

    const isGraphDataLoading = () => Object.keys(servicesGraphData["NonAggregate"]).length <= 1;
    const isServiceDataEmpty = () => Object.keys(serviceStatus).length === 1 && Object.keys(serviceStatus["ServerName"] || {}).length === 0;

    const STATUS_STYLES = {
        all: { border: '#757575', bg: '#EEEEEE', text: '#424242' },
        running: { border: '#4CAF50', bg: '#EAF6EA', text: '#2E7D32' },
        stopped: { border: '#D32F2F', bg: '#FFEBEE', text: '#C62828' }
    };

    return (
        <>
        {/* Modal - Available in both views */}
        <Modal
            open={modalOpen}
            onClose={handleModalClose}
            aria-labelledby="parent-modal-title"
            aria-describedby="parent-modal-description"
            m={2}
            sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
            }}
        >
            <Box
                sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    border: 2,
                    backgroundColor: 'white',
                    flexDirection: 'column',
                    gap: 2,
                    maxHeight: '70vh',
                    overflowY: 'auto',
                    p: 2,
                }}
            >
                <Typography variant='h4'><i>{modalHeader}</i></Typography>
                <Box
                    sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '16px',
                        width: '100%', 
                    }}
                >
                    <Autocomplete
                        options={autocompleteOptions}
                        value={selectedServer}
                        renderInput={(params) => (
                            <TextField {...params} label="Select Server" variant="outlined" />
                        )}
                        onChange={handleServerChange}
                        sx={{ width: '50%' }} 
                    />

                    <Autocomplete
                        options={descriptionOptions}
                        value={selectedDescription}
                        freeSolo
                        renderInput={(params) => (
                            <TextField {...params} label="Select Description" variant="outlined" />
                        )}
                        onChange={handleDescriptionChange}
                        sx={{ width: '50%' }} 
                    />
                </Box>

                <ModalTable />
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
                    {(appName || urlParams.get("Name") || "").toUpperCase()}
                </Typography>
                <Box sx={{ flex: 1 }} />
            </Paper>

            <Box sx={{ px: { xs: 1, sm: 2 }, py: 2 }}>
                <Typography sx={{ fontSize: { xs: 13, sm: 14 }, fontWeight: 800, color: "#111827", mb: 2 }}>
                    Overview
                </Typography>

                <Grid container spacing={2} sx={{ mb: 2 }}>
                    {(windowsEventCard["Information"] !== "NA" && windowsEventCard["Warning"] !== "NA" && windowsEventCard["Error"] !== "NA") && (
                    <Grid item xs={12} md={4}>
                    <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, overflow: "hidden", height: '100%' }}>
                        <Box sx={{ px: { xs: 1, sm: 2 }, py: 1.5 }}>
                            <Typography sx={{ fontSize: { xs: 11, sm: 12, md: 13 }, fontWeight: 800, color: "#111827" }}>Event Logs</Typography>
                        </Box>
                        <Divider sx={{ borderColor: "#E6E8EE" }} />
                        <Box sx={{ px: 2, py: 2, minHeight: 120, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {!loading.windowsEvent ? (
                                windowsEventCard["Information"] === -1 || windowsEventCard["Warning"] === -1 || windowsEventCard["Error"] === -1 ? (
                                    <CircularProgress size={20} />
                                ) : errorApi["windowsEvent"] !== "" ? (
                                    <Alert severity="error" sx={{ fontSize: { xs: 10, sm: 11 }, p: 0.5, width: "100%" }}>API error</Alert>
                                ) : windowsEventCard["Information"] === "NA" || windowsEventCard["Warning"] === "NA" || windowsEventCard["Error"] === "NA" ? (
                                    <Alert severity="warning" sx={{ fontSize: { xs: 10, sm: 11 }, p: 0.5, width: "100%" }}>No logs found</Alert>
                                ) : (
                                    <Box sx={{ display: "flex", gap: { xs: 2, sm: 3 }, alignItems: "center" }}>
                                        <Tooltip title="Windows Event - Information" arrow>
                                            <Box onClick={() => createModal("Windows Event - Information", "Windows Event", "Information")}
                                                sx={{ width: { xs: 36, sm: 40, md: 42 }, height: { xs: 36, sm: 40, md: 42 }, borderRadius: "50%", background: "linear-gradient(to bottom, #4fe480ff, #10b95cff)",
                                                    display: "flex", justifyContent: "center", alignItems: "center", cursor: "pointer", 
                                                    transition: "transform 0.2s", "&:hover": { transform: "scale(1.1)" } }}>
                                                <Typography sx={{ color: "#fff", fontSize: { xs: 11, sm: 12, md: 13 }, fontWeight: 700 }}>{formatValue(windowsEventCard["Information"])}</Typography>
                                            </Box>
                                        </Tooltip>
                                        <Tooltip title="Windows Event - Warning" arrow>
                                            <Box onClick={() => createModal("Windows Event - Warning", "Windows Event", "Warning")}
                                                sx={{ width: { xs: 36, sm: 40, md: 42 }, height: { xs: 36, sm: 40, md: 42 }, borderRadius: "50%", background: "linear-gradient(to bottom, #ffd54f, #f9a825)",
                                                    display: "flex", justifyContent: "center", alignItems: "center", cursor: "pointer",
                                                    transition: "transform 0.2s", "&:hover": { transform: "scale(1.1)" } }}>
                                                <Typography sx={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>{formatValue(windowsEventCard["Warning"])}</Typography>
                                            </Box>
                                        </Tooltip>
                                        <Tooltip title="Windows Event - Error" arrow>
                                            <Box onClick={() => createModal("Windows Event - Error", "Windows Event", "Error")}
                                                sx={{ width: { xs: 36, sm: 40, md: 42 }, height: { xs: 36, sm: 40, md: 42 }, borderRadius: "50%", background: "linear-gradient(to bottom, #ef6f6f, #c62828)",
                                                    display: "flex", justifyContent: "center", alignItems: "center", cursor: "pointer",
                                                    transition: "transform 0.2s", "&:hover": { transform: "scale(1.1)" } }}>
                                                <Typography sx={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>{formatValue(windowsEventCard["Error"])}</Typography>
                                            </Box>
                                        </Tooltip>
                                    </Box>
                                )
                            ) : (
                                <CircularProgress size={20} />
                            )}
                        </Box>
                    </Paper>
                    </Grid>
                    )}
                    
                    
                    <Grid item xs={12} md={4}>
                        <Box sx={{ height: '100%' }} />
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Box sx={{ height: '100%' }} />
                    </Grid>
                </Grid>

                {loading["serviceLogs"] ? (
                    <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, p: { xs: 2, sm: 3 }, minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <CircularProgress_Styled loadingWhat="Loading Services Trend" fetchingFor={`Fetching data for ${"Name" in queryParams ? queryParams["Name"] : ""}`} />
                    </Paper>
                ) : (
                    <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, overflow: "visible" }}>
                        <Grid container sx={{ px: { xs: 1, sm: 2 }, py: 1.5 }}>
                            <Grid container xs={12} justifyContent="flex-start" alignItems="center" flexWrap="wrap" gap={1}>
                                <Typography sx={{ fontSize: { xs: 11, sm: 12, md: 13 }, fontWeight: 800, color: "#111827", mr: 1 }}>
                                    Services/URL Availability
                                </Typography>
                                
                                <Grid container alignItems="center" gap={0.75} flex={1} minWidth={220} maxWidth={360}>
                                    <Autocomplete
                                        multiple
                                        size="small"
                                        value={serviceNameFilter}
                                        onChange={(e, newValue) => setServiceNameFilter(newValue || [])}
                                        options={getServiceOptions()}
                                        renderInput={(params) => (
                                            <TextField 
                                                {...params} 
                                                placeholder={serviceNameFilter.length === 0 ? "Filter by service..." : ""}
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
                                                        '& fieldset': { border: 'none' }
                                                    }
                                                }}
                                            />
                                        )}
                                        renderTags={(tagValue, getTagProps) => tagValue.map((option, index) => (
                                            <Chip 
                                                label={String(option)} 
                                                {...getTagProps({ index })} 
                                                size="small" 
                                                sx={{ fontSize: { xs: 9, sm: 10, md: 11 }, height: 24, maxWidth: '150px' }} 
                                            />
                                        ))}
                                        sx={{ flex: 1, minWidth: 0 }}
                                    />
                                </Grid>

                                <Grid container gap={1} flexWrap="wrap" sx={{ ml: 'auto' }} flexShrink={0} width="auto">
                                    {['all', 'running', 'stopped'].map((status) => {
                                        const style = STATUS_STYLES[status];
                                        const isActive = statusFilter === status;
                                        return (
                                            <Grid
                                                key={status}
                                                px={1.5}
                                                py={0.3}
                                                borderRadius={999}
                                                bgcolor={isActive ? style.border : style.bg}
                                                onClick={() => setStatusFilter(status)}
                                                sx={{ cursor: 'pointer', transition: 'all 0.2s', '&:hover': { transform: 'scale(1.05)', boxShadow: 1 } }}
                                            >
                                                <Typography fontSize={{ xs: 9, sm: 10, md: 11 }} fontWeight={600} color={isActive ? '#fff' : style.text}>
                                                    {status.charAt(0).toUpperCase() + status.slice(1)}
                                                </Typography>
                                            </Grid>
                                        );
                                    })}
                                </Grid>
                            </Grid>
                        </Grid>
                        <Divider sx={{ borderColor: "#E6E8EE" }} />
                        
                        <Grid container sx={{ px: { xs: 1, sm: 2 }, py: 2 }}>
                            {Object.keys(serviceStatus).length === 0 ? (
                                <Grid container xs={12} justifyContent="center" alignItems="center" sx={{ py: 4 }}>
                                    <CircularProgress_Styled loadingWhat="Loading Services Data" fetchingFor="Fetching service status..." />
                                </Grid>
                            ) : Object.keys(serviceStatus).length > 1 ? (
                                <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #E6E8EE', borderRadius: 2 }}>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow sx={{ bgcolor: '#00338e' }}>
                                                <TableCell sx={{ color: '#fff', fontWeight: 700, fontSize: 13, width: 50, py: 1.5 }} />
                                                <TableCell sx={{ color: '#fff', fontWeight: 700, fontSize: 13, py: 1.5 }}>Service/URL Name</TableCell>
                                                <TableCell sx={{ color: '#fff', fontWeight: 700, fontSize: 13, py: 1.5 }}>Server</TableCell>
                                                <TableCell sx={{ color: '#fff', fontWeight: 700, fontSize: 13, py: 1.5 }}>Current Status</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {(() => {
                                                const filteredKeys = getFilteredServiceKeys();
                                                
                                                if (filteredKeys.length === 0) {
                                                    return (
                                                        <TableRow>
                                                            <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                                                                <Typography sx={{ fontSize: 12, color: '#6B7280' }}>
                                                                    {serviceNameFilter.length > 0 || statusFilter !== 'all' ? 'No services match the filter' : 'No services found'}
                                                                </Typography>
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                }
                                                
                                                const sortedKeys = getSortedServiceKeys(filteredKeys);
                                                const paginatedKeys = sortedKeys.slice(tablePage * rowsPerPage, tablePage * rowsPerPage + rowsPerPage);
                                                    
                                                return paginatedKeys.map((key) => {
                                                    const serviceName = serviceStatus["ServiceName"]?.[key] || 'N/A';
                                                    const serverName = serviceStatus["ServerName"]?.[key] || 'N/A';
                                                    const serverServiceMap = serviceStatus["ServerServiceMap"]?.[key] || '';
                                                    const isRunning = serviceStatus["Status"]?.[key]?.toLowerCase() === 'running';
                                                    const isExpanded = expandedServiceRow === key;
                                                    const downtimeIntervals = getDowntimeIntervals(serverServiceMap);
                                                    const serviceGraphData = getServiceGraphData(serverServiceMap);
                                                    
                                                    return (
                                                        <React.Fragment key={key}>
                                                            <TableRow 
                                                                sx={{ '&:hover': { bgcolor: '#f8fafc' }, cursor: 'pointer', borderLeft: `4px solid ${isRunning ? '#4CAF50' : '#D32F2F'}` }}
                                                                onClick={() => setExpandedServiceRow(isExpanded ? null : key)}
                                                            >
                                                                <TableCell sx={{ py: 1 }}>
                                                                    <IconButton size="small">
                                                                        {isExpanded ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                                                                    </IconButton>
                                                                </TableCell>
                                                                <TableCell sx={{ fontSize: 12, fontWeight: 600 }}>{serviceName}</TableCell>
                                                                <TableCell sx={{ fontSize: 12 }}>{serverName}</TableCell>
                                                                <TableCell>
                                                                    <Grid container sx={{ 
                                                                        display: 'inline-flex', alignItems: 'center', gap: 0.5,
                                                                        px: 1.5, py: 0.5, borderRadius: 999, 
                                                                        bgcolor: isRunning ? '#EAF6EA' : '#FFEBEE',
                                                                        border: `1px solid ${isRunning ? '#4CAF50' : '#D32F2F'}`,
                                                                        width: 'auto'
                                                                    }}>
                                                                        <Grid sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: isRunning ? '#4CAF50' : '#D32F2F' }} />
                                                                        <Typography sx={{ fontSize: 11, fontWeight: 700, color: isRunning ? '#2E7D32' : '#C62828' }}>
                                                                            {isRunning ? 'Running' : 'Stopped'}
                                                                        </Typography>
                                                                    </Grid>
                                                                </TableCell>
                                                            </TableRow>
                                                            
                                                            {isExpanded && (
                                                            <TableRow>
                                                                <TableCell colSpan={4} sx={{ p: 0, border: 'none', bgcolor: '#f8fafc' }}>
                                                                    <Grid container spacing={2} sx={{ p: 2, borderBottom: '1px solid #E6E8EE', m: 0, width: '100%' }}>
                                                                        <Grid xs={12} md={downtimeIntervals.length > 0 ? 8 : 12} sx={{ pl: 2, pr: 1 }}>
                                                                            <Paper elevation={0} sx={{ border: '1px solid #E6E8EE', borderRadius: 2, bgcolor: '#fff', height: 320, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                                                                <Grid container sx={{ px: 1.5, py: 0.75, borderBottom: '1px solid #E6E8EE', bgcolor: '#f8fafc', flexShrink: 0 }}>
                                                                                    <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#111827' }}>Historical Trend</Typography>
                                                                                </Grid>
                                                                                <Grid container sx={{ flex: 1, minHeight: 0, position: 'relative', p: 1 }}>
                                                                                    {isGraphDataLoading() ? (
                                                                                        <Grid container sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                                                                            <CircularProgress_Styled loadingWhat="Loading Historical Trend" fetchingFor="Fetching graph data..." />
                                                                                        </Grid>
                                                                                    ) : serviceGraphData.length > 0 ? (
                                                                                        <Grid container sx={{ position: 'absolute', top: 8, left: 8, right: 8, bottom: 8 }}>
                                                                                            <AreaLineChart type="service" data={serviceGraphData} key={`service-${key}`} yAxisLabel={"Status"} domain={[0, 1]} />
                                                                                        </Grid>
                                                                                    ) : (
                                                                                        <Typography sx={{ fontSize: 11, color: '#6B7280', textAlign: 'center', py: 3 }}>No historical data available</Typography>
                                                                                    )}
                                                                                </Grid>
                                                                            </Paper>
                                                                        </Grid>
                                                                        
                                                                        {downtimeIntervals.length > 0 && (
                                                                        <Grid xs={12} md={4} sx={{ pl: 1, pr: 2 }}>
                                                                            <Paper elevation={0} sx={{ border: '1px solid #E6E8EE', borderRadius: 2, bgcolor: '#fff', height: 320, display: 'flex', flexDirection: 'column' }}>
                                                                                <Grid container sx={{ px: 1.5, py: 0.75, borderBottom: '1px solid #E6E8EE', bgcolor: '#f8fafc', flexShrink: 0 }}>
                                                                                    <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#111827' }}>Downtime Intervals ({downtimeIntervals.length})</Typography>
                                                                                </Grid>
                                                                                <Grid container sx={{ p: 1.5, flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0, display: 'block' }}>
                                                                                    {downtimeIntervals.map((interval, i) => (
                                                                                        <Grid container key={i} sx={{ 
                                                                                            display: 'flex', gap: 1.5, py: 1.5, px: 1.5, borderRadius: 1,
                                                                                            bgcolor: i % 2 === 0 ? '#f8fafc' : '#fff',
                                                                                            mb: i < downtimeIntervals.length - 1 ? 1 : 0,
                                                                                            border: '1px solid #e2e8f0', transition: 'all 0.2s',
                                                                                            '&:hover': { boxShadow: '0 2px 4px rgba(0,0,0,0.05)', transform: 'translateX(2px)' }
                                                                                        }}>
                                                                                            <Grid sx={{ 
                                                                                                width: 8, height: 8, borderRadius: '50%', mt: 0.5, flexShrink: 0,
                                                                                                bgcolor: interval.end === 'Ongoing' ? '#F59E0B' : '#D32F2F',
                                                                                                boxShadow: `0 0 0 3px ${interval.end === 'Ongoing' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(211, 47, 47, 0.1)'}`
                                                                                            }} />
                                                                                            <Grid sx={{ flex: 1, minWidth: 0 }}>
                                                                                                <Grid container alignItems="center" gap={0.5} mb={0.5}>
                                                                                                    <Typography sx={{ fontSize: 11, color: '#111827', fontWeight: 700 }}>Service Down</Typography>
                                                                                                    {interval.end === 'Ongoing' && (
                                                                                                        <Chip label="Ongoing" size="small" sx={{ height: 18, fontSize: 9, fontWeight: 700, bgcolor: '#FEF3C7', color: '#92400E', '& .MuiChip-label': { px: 0.75 } }} />
                                                                                                    )}
                                                                                                </Grid>
                                                                                                <Typography sx={{ fontSize: 10, color: '#6B7280', mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                                                    <Grid component="span" sx={{ fontSize: 8 }}>▶</Grid> {interval.beforeRange ? 'Went down before selected time interval' : `Down Since: ${interval.start}`}
                                                                                                </Typography>
                                                                                                <Typography sx={{ fontSize: 10, color: interval.end === 'Ongoing' ? '#F59E0B' : '#059669', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                                                    <Grid component="span" sx={{ fontSize: 8 }}>◼</Grid> {interval.end === 'Ongoing' ? 'Still down' : `Started at: ${interval.end}`}
                                                                                                </Typography>
                                                                                            </Grid>
                                                                                        </Grid>
                                                                                    ))}
                                                                                </Grid>
                                                                            </Paper>
                                                                        </Grid>
                                                                        )}
                                                                    </Grid>
                                                                </TableCell>
                                                            </TableRow>
                                                            )}
                                                        </React.Fragment>
                                                    );
                                                });
                                            })()}
                                        </TableBody>
                                        </Table>
                                        <TablePagination
                                            component="div"
                                            count={getFilteredServiceKeys().length}
                                            page={tablePage}
                                            onPageChange={(e, newPage) => setTablePage(newPage)}
                                            rowsPerPage={rowsPerPage}
                                            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setTablePage(0); }}
                                            rowsPerPageOptions={[5, 10, 25, 50]}
                                            sx={{ borderTop: '1px solid #E6E8EE', '& .MuiTablePagination-toolbar': { minHeight: 48 } }}
                                        />
                                    </TableContainer>
                                ) : isServiceDataEmpty() ? (
                                    <Grid container xs={12} justifyContent="center" alignItems="center" sx={{ py: 4 }}>
                                        <Typography sx={{ fontSize: 12, color: '#6B7280' }}>No services data available</Typography>
                                    </Grid>
                                ) : (
                                    <Grid container xs={12} justifyContent="center" alignItems="center" sx={{ py: 4 }}>
                                        <CircularProgress_Styled loadingWhat="Loading Services Data" fetchingFor="Fetching service status..." />
                                    </Grid>
                                )}
                            </Grid>
                        </Paper>
                )}
            </Box>
        </Box>
    </>
    );
};

export default ApplicationStatus;
