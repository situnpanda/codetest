import React, { useEffect, useState,useMemo } from 'react'
import { useNavigate } from 'react-router-dom';
import Grid from '@mui/material/Unstable_Grid2';
import { Modal, Card, CardContent, Typography, Box, Accordion, AccordionSummary, AccordionDetails, Divider,Link, Button, TextField, ButtonGroup, InputLabel,FormControl,Autocomplete,MenuItem,Select,IconButton,Chip,LinearProgress } from '@mui/material';
import {useLocation} from 'react-router-dom'
import {Cell} from 'recharts'
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell,{ tableCellClasses } from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip'; 
import '../../../assets/css/fonts.css';
import {getUrl} from '../../../environment'
import {logPageVisit,startPageTracking,appInsights } from '../appInsights';
import LocationIcon from '../../Static/Images/LocationIcon.svg'
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid,  Legend, ResponsiveContainer
  } from 'recharts';
import { convertTimeToPreferredTZ } from '../../shared/Timestamp/PreferenceConversion';
function ValidationDrilldown({date,globalFilterChoice, globalFilterData, appInsights,preferredTZ}){ //

    var [loading, setLoading] = useState({
        "appValidation":true
    });
    var navigate = useNavigate()
    var location = useLocation()
    var urlParams = new URLSearchParams(location.search)
    //var [date, setDate] = useState({})
    var [serverCpuUtilization, setServerCpuUtilization] = useState({})
    var [appValidationData, setAppValidation] = useState({})
    var [serverMemoryUtilization, setServerMemoryUtilization] = useState({})
    var [serverDiskUtilization, setServerDiskUtilization] = useState({})

    var [errorApi, setErrorApi] = useState({
        "appValidation":""
    })
    var [hostingTypeFilter, setHostingTypeFilter] = useState("Cloud")
    var [serverNameFilter, setServerNameFilter] = useState([])
    var [serverStatus, setServerStatus] = useState({})
    var getColor = (index) => {
        const palette = ['#60a5fa', '#34d399', '#facc15', '#f87171', '#a78bfa'];
        return palette[index % palette.length];
      };
    var {AppName} = location.state || {}
    var [data, setData] = useState({})
    var [serverName, setServerName] = useState("")
    var [appName, setAppName] = useState("")
    var [vmSkuDetails, setVmSkuDetails] = useState([]);
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

    const [selectedChart, setSelectedChart] = useState("utilization"); 
    const [entryTime, setEntryTime] = useState(null);

  const [appValidationArray, setAppValidationArray] = useState([]);
  const [selectedTimestamp, setSelectedTimestamp] = useState('');
 
    const [selectedServer, setSelectedServer] = useState("");
    const COLORS = {
      Success: '#22c55e',
      Fail: '#ef4444',
      Running: '#3b82f6',
      NotRunning: '#9ca3af'
    };
    
    useEffect(() => {
      if (!appValidationData || !appValidationData["Status"]) return;
      const rows = Object.keys(appValidationData["Status"]).map(index => ({
        "Application ci": appValidationData["Application CI"][index],
        Description: appValidationData["Description"][index],
        FunctionName: appValidationData["FunctionName"][index],
        Screenshot: appValidationData["Screenshot"][index],
        Status: appValidationData["Status"][index],
        "Server Name": appValidationData["Server Name"][index],
        TimeGenerated: appValidationData["TimeGenerated"][index]
      }));
      setAppValidationArray(rows);
      // Set default timestamp to latest
      if (rows.length > 0) {
        const sorted = [...new Set(rows.map(r => r.TimeGenerated))].sort((a, b) => new Date(b) - new Date(a));
        setSelectedTimestamp(sorted[0]);
      }
    }, [appValidationData]);


    
    // Filter by selected timestamp
    const uniqueTimestamps = useMemo(() => {
      return [...new Set(appValidationArray.map(row => row.TimeGenerated))].sort((a, b) => new Date(b) - new Date(a));
    }, [appValidationArray]);

    const requiredFns = [
      'Login into Citrix Workspace',
      'Search test patient',
      'Open test patient document'
    ];

    // Group rows by timestamp
    const runsByTimestamp = useMemo(() => {
      const map = new Map();
      appValidationArray.forEach(row => {
        if (!map.has(row.TimeGenerated)) map.set(row.TimeGenerated, []);
        map.get(row.TimeGenerated).push(row);
      });
      return map;
    }, [appValidationArray]);

    // For selected timestamp, get all rows
    const filteredByTimestamp = useMemo(() => {
      return appValidationArray.filter(row => row.TimeGenerated === selectedTimestamp);
    }, [appValidationArray, selectedTimestamp]);

    // For all unique timestamps, count success/fail runs
    const runResults = useMemo(() => {
      const results = [];
      runsByTimestamp.forEach((rows, ts) => {
        // For each required function, check if there is a row with Status === 'Successful'
        const fnStatus = requiredFns.map(fn =>
          rows.find(r => r.FunctionName === fn && r.Status === 'Successful')
        );
        const isSuccess = fnStatus.every(Boolean);
        results.push({ timestamp: ts, isSuccess });
      });
      return results;
    }, [runsByTimestamp]);

    const successCount = runResults.filter(r => r.isSuccess).length;
    const failCount = runResults.length - successCount;
    const successRate = Math.round((successCount / (runResults.length || 1)) * 100);
    const failureRate = 100 - successRate;
    
    const serverList = [...new Set(filteredByTimestamp.map(x => x["Application ci"]))];
    const serverData = filteredByTimestamp.reduce((acc, cur) => {
      const srv = cur["Server Name"];
      const key = cur.Status === "Successful" ? "Success" : "Fail";
      acc[srv] = acc[srv] || { server: srv, Success: 0, Fail: 0 };
      acc[srv][key]++;
      return acc;
    }, {});
    const serverStackData = Object.values(serverData);


    useEffect(() => {
      console.log("locationnnnnn", window.location.href) 
 // Start tracking for THIS page
 startPageTracking(window.location.href);
 return () => {
   // Log time spent on the *previous* page
   logPageVisit();      // ⬅️ REMOVE all parameters
   if (appInsights) {
     appInsights.flush();
     console.log('[Page] Flushed telemetry on unmount.');
   }
 };
}, [location]);
  

    useEffect(()=>{
        if(Object.keys(globalFilterData).length>0){
            var isFileshare = urlParams.get("IsFileShare").toString()
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
            var nameOfResource = urlParams.get("Name").toString()
            var typeOfResource = urlParams.get("Type").toString()

            if(typeOfResource==="Application CI"){
                setQueryParams({
                    "Name":nameOfResource,
                    "Type":typeOfResource
                })
                console.log("Resource:", nameOfResource, typeOfResource)
                var serverName=""
                var hostingType = []

                Object.keys(globalFilterData["AppCI"]).map((k)=>{
                    if(globalFilterData["AppCI"][k].toUpperCase()===AppName.toUpperCase()){
                        serverName = serverName+ "'"+globalFilterData["ServerName"][k]+ "',"
                        hostingType.push(globalFilterData["ServerHostingType"][k])
                    }
                })

                setLoading(prevLoading=>({
                    ...prevLoading,
                    "serverStatus" : false
                }))

                setHostingTypeFilter([...new Set(hostingType)][0])
                
                serverName = serverName.slice(0,-1)
                setServerName(serverName)
            }
            else{
                var hostingType = urlParams.get("HostingType").toString()
                console.log("Resource:", nameOfResource, typeOfResource, hostingType)
                setQueryParams({
                    "Name":nameOfResource,
                    "Type":typeOfResource,
                    "HostingType":hostingType
                })
                var serverName = nameOfResource
                var hostingType = hostingType
                setHostingTypeFilter(hostingType)
                //setServerNameFilter(serverName)
                setServerCpuUtilization({})
                setServerDiskUtilization({})
                setServerMemoryUtilization({})
                setErrorApi(
                    {
                        "CPU":"", "Memory":"", "Disk":"", "Tag Compliance":"","ServerStatus":""
                    }
                )
                
                if(hostingType=="Cloud"){
                    //fetchDiskDetailsForCloud([serverName])
                    setServerNameFilter([serverName])
                }
                else{
                    setServerNameFilter(serverName)
                    setVmSkuDetails([]);
                }
                setServerName(serverName)
                
            }
        }
    },[location.pathname+location.search, globalFilterData])

      //var baseUrl =  "http://100.100.129.88:9090/api/"
      //var baseUrl =  "http://127.0.0.1:5000/api/"
      //var baseUrl =  "http://100.100.129.88:9090/api/"
      //var baseUrl =  "https://itelemetry.providence.org/api/"
    //var baseUrl =  "http://100.100.129.88:9090/api/"
    var baseUrl = getUrl()

    useEffect(()=>{
        var nameOfResource = urlParams.get("Name").toString()
        console.log("Resource:", nameOfResource, "In Global Filter Choice",globalFilterChoice, Object.keys(queryParams).length)
        if(Object.keys(queryParams).length && "ResourceName" in globalFilterChoice && nameOfResource.toLowerCase()!=globalFilterChoice["ResourceName"].toLowerCase()){
            console.log("In Global Filter Choice Filter")
            getRegionWiseData_GlobalFilter()
        }
        
    },[globalFilterChoice])

    useEffect(()=>{
        if(serverName!=""){
            fetchAppValidation()
        }
        //console.log(date)
    },[date, serverName,preferredTZ])

    useEffect(() => {
        console.log("Updated appValidationData:", appValidationData);
      }, [appValidationData]);

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
    const handleApplicationGlobalFilter = (value, metric, upDown, type) => {
        sessionStorage.removeItem("ApplicationDetails_AppCiFilter")
        sessionStorage.removeItem("ApplicationDetails_HospitalFilter")
        //console.log(type)
        sessionStorage.removeItem("ApplicationDetails_AppCiFilter")
        sessionStorage.removeItem("ApplicationDetails_HospitalFilter")
        if(type.includes("VM")){
          //console.log("In VM if")
          //console.log(value)
          // //console.log(value, value.split("/"))
          var appName = value.split("/").length==2 ? value.split("/")[1] : ""
          var hostingType = type.split(" ")[0]
          ////console.log(value,appName,value.split("/")[0],metric)
          navigate('/serverStatus?Name='+value.split("/")[0]+"&HostingType="+hostingType+"&Type=VM&IsFileShare=no", {state:{AppName:appName}}) //metric[appName]["AppMetrics"]
        }
        else{
            navigate('/applicationHealth?Name='+value+"&Type="+type, {state:{metric:metric}})
        }
        
    };
  
    const getRegionWiseData_GlobalFilter = () => {
        console.log(globalFilterData) //globalFilterData
        var serverList = globalFilterData
        var hospitalInformation = JSON.parse(localStorage.getItem("HospitalInformation_HomePage"))
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

      var fetchAppValidation = () => {
    
        const url = baseUrl + 'appValidation';
        var params = {
            appCI: AppName,
        };
        // Set loading + clear error state
        setLoading(prev => ({
            ...prev,
            "appValidation": true
        }));
        setErrorApi(prev => ({
            ...prev,
            "appValidation": ""
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
            console.log("Fetched Data APPPP VALIDATIONNNN :", data);
            setAppValidation(convertTimeToPreferredTZ(JSON.parse(data['Data'])))
            console.log("vaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: ",appValidationData)
            setLoading(prev => ({
                ...prev,
                "appValidation": false
            }));
        })
        .catch((error) => {
            console.error("Error fetching Data:", error);
            setLoading(prev => ({
                ...prev,
                "appValidation": false
            }));
            setErrorApi(prev => ({
                ...prev,
                "appValidation": "API didn’t load"
            }));
        });
    };
    return(
        <Grid container m={4} p={2} justifyContent='center' alignItems='center' sx={{borderRadius:10, backgroundColor:'none'}}>
           
            <Grid container xs={12} pb={3} alignItems="center">
                <Grid item> 
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', paddingRight: 3, height: '100%' }}>
                        <Box sx={{ width: 70, height: 70, borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'linear-gradient(to bottom, rgb(70, 150, 58,0.5), white)' }}>
                            <img src={LocationIcon} alt="Server Status Icon" style={{ width: '50%', height: '50%' }} />
                        </Box>
                    </Box>
                </Grid>
                <Grid item>
                    <Typography sx={{ fontSize: 24, color: '#162660',fontWeight:'bold'}}>{Object.keys(queryParams).length>0 ? (queryParams["Type"]==="VM" ? queryParams["ApplicationCI"]?.toUpperCase() : queryParams["Name"]?.toUpperCase()) : ""}</Typography>
                </Grid>
            </Grid>
            {/* <Grid xs={12} pb ={2}> 
                <Typography sx={{ fontFamily: 'BarlowSemiBold', fontSize: 28, color : '#162660'}}>{AppName.toUpperCase()}</Typography>
            </Grid>   */}  
            {loading.appValidation ? (
              <Grid item xs={12} display="flex" justifyContent="center" alignItems="center" minHeight={300}>
                <CircularProgress sx={{ '& .MuiCircularProgress-circle': { strokeWidth: 2 } }} />
              </Grid>
            ) : (
              <>

                <Grid container spacing={2} alignItems="stretch" sx={{width:'100%', mb:2}}  >
                <Grid item xs={12} md={6}>
                <Box sx={{
                  background: '#fff',
                  borderRadius: 2,
                  p: 2,
                  height: '100%',
                  border: '1px solid #e5e7eb',
                  display: 'flex',
                  flexDirection: 'column'
                }}>
                  {/* Header */}
                  <Box>
                    <Typography fontWeight={700} fontSize={14} color="#111827">App Availability</Typography>
                    <Box
                      mt={2}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        fontSize: 14,
                        fontWeight: 600,
                        color: '#059669',
                        backgroundColor: '#ecfdf5',
                        px: 2,
                        py: 0.8,
                        borderRadius: 2,
                        width: 'fit-content'
                      }}
                    >
                      <CheckCircleIcon sx={{ fontSize: 16 }} />
                      Validation Window: 24h | Status: Operational
                    </Box>
                  </Box>

                  {/* Success / Fail */}
                  <Box display="flex" justifyContent="space-between" mt={2}>
                    <Box>
                      <Typography fontSize={11} color="#6b7280">Successful Runs</Typography>
                      <Typography fontSize={18} fontWeight={700} color="#059669">{successCount}</Typography>
                    </Box>
                    <Box textAlign="right">
                      <Typography fontSize={11} color="#6b7280">Failed Runs</Typography>
                      <Typography fontSize={18} fontWeight={700} color="#dc2626">{failCount}</Typography>
                    </Box>
                  </Box>

                  {/* Stretching Progress Bar */}
                  <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', mt: 1 }}>
                    <LinearProgress
                      variant="determinate"
                      value={successRate}
                      sx={{
                        height: '60%',
                        borderRadius: 6,
                        backgroundColor: '#f3f4f6',
                        '& .MuiLinearProgress-bar': {
                          backgroundColor: '#10b981'
                        }
                      }}
                    />
                    <Typography fontSize={11} fontWeight={600} color="#4b5563" textAlign="right" mt={0.5}>
                      {successRate}% Success Rate
                    </Typography>
                  </Box>
                </Box>
              </Grid>

            <Grid item xs={12} md={6}>
              <Box sx={{
                background: '#fff',
                borderRadius: 2,
                p: 1.5,
                height: '100%',
                border: '1px solid #e5e7eb',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}>
                <Typography fontWeight={700} fontSize={13}>Server Runs</Typography>
                <Typography fontSize={11} color="#6b7280">Performance across multiple servers</Typography>

                <Box mt={1} flexGrow={1}>
                  <ResponsiveContainer width="100%" height={130}>
                    <BarChart data={serverStackData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="server" fontSize={10} />
                      <YAxis fontSize={10} />
                      <Tooltip />
                      <Bar
                        dataKey="Success"
                        radius={[4, 4, 0, 0]}
                        fill="#8884d8"
                        isAnimationActive={false}
                      >
                        {serverStackData.map((entry, index) => (
                          <Cell key={index} fill={getColor(index)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Box>

                <Box mt={1}>
                  {serverStackData.map((server, i) => (
                    <Box key={i} display="flex" justifyContent="space-between" fontSize={11} mb={0.5}>
                      <Box display="flex" alignItems="center">
                        <Box sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: getColor(i), mr: 1 }} />
                        <Typography fontWeight={600}>{server.server}</Typography>
                      </Box>
                      <Typography>Success: {server.Success} &nbsp; Fails: {server.Fail}</Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            </Grid>
                </Grid>
              
                <Grid item xs={12}>
              <Box sx={{ background: '#fff', borderRadius: 2, p: 3, border: '1px solid #e5e7eb' }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography fontWeight={600} fontSize={16}>Component Health Status</Typography>
                  <Box display="flex" gap={2} alignItems="center">
                    <Grid item md={2} sx={{ 
                      backgroundColor: '#FFFFFF', 
                      padding: 1, 
                      borderRadius: 10, 
                      minWidth: 200,
                      border: '2px solid #e5e7eb',
                      '&:hover': {
                        borderColor: '#003399'
                      }
                    }}>
                      <Autocomplete
                        options={uniqueTimestamps}
                        getOptionLabel={(option) => option}
                        onChange={(event, value) => setSelectedTimestamp(value)}
                        value={selectedTimestamp}
                        disableClearable
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            variant="standard"
                            placeholder="Historical Runs"
                            label={!selectedTimestamp ? "Historical Runs" : ""}
                            fullWidth
                            InputLabelProps={{ 
                              style: { 
                                color: '#003399', 
                                fontWeight: '500', 
                                fontSize: 16, 
                                textAlign: 'center', 
                                display: 'flex', 
                                justifyContent: 'center', 
                                width: '100%' 
                              }
                            }}
                            InputProps={{
                              ...params.InputProps,
                              disableUnderline: true,
                              sx: { 
                                color: '#003399', 
                                fontSize: 14, 
                                textAlign: 'center', 
                                '& .MuiInputBase-input': { 
                                  color: '#003399', 
                                  textAlign: 'center', 
                                  '&::placeholder': { 
                                    opacity: 1, 
                                    color: '#003399' 
                                  } 
                                }, 
                                '&:hover:not(.Mui-disabled)::before': { 
                                  borderBottom: 'none' 
                                }, 
                                '&::before': { 
                                  borderBottom: 'none' 
                                }, 
                                '& svg': { 
                                  color: '#003399' 
                                } 
                              },
                            }}
                          />
                        )}
                      />
                    </Grid>
                    <Button variant="outlined" size="small" onClick={() => {
                      const headers = ["Date", "Server", "Application CI", "Function", "Status"];
                      const rows = filteredByTimestamp.map(row => [
                        row.TimeGenerated,
                        row["Server Name"],
                        row["Application ci"],
                        row.FunctionName,
                        row.Status
                      ]);
                      const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].map(e => e.join(",")).join("\n");
                      const link = document.createElement("a");
                      link.setAttribute("href", encodeURI(csvContent));
                      link.setAttribute("download", "functionality_details.csv");
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}>
                      Export CSV
                    </Button>
                  </Box>
                </Box>

                {(() => {
                  // Get all unique functions from the filtered timestamp data
                  const uniqueFuncs = new Map();
                  filteredByTimestamp.forEach(row => {
                    if (!uniqueFuncs.has(row.FunctionName)) {
                      uniqueFuncs.set(row.FunctionName, row);
                    }
                  });
                  const funcArray = Array.from(uniqueFuncs.values());
                  const healthyCount = funcArray.filter(f => f.Status === "Successful").length;

                  return (
                    <>
                      <Grid container spacing={2} mb={3} sx ={{backgroundColor: '#e6ecf7', borderRadius:2,p:2}}>
                      <Grid item xs={12}>
                        <Typography fontSize={16} fontWeight={700} color="#2563eb" mt={1}>
                          {healthyCount}/{funcArray.length} Components Healthy
                        </Typography>
                        </Grid>
                        {funcArray.map((func, idx) => (
                          <Grid item xs={12} sm={4} md={3} key={idx}>
                            <Box
                              sx={{
                                p: 2,
                                borderRadius: 2,
                                backgroundColor: '#fff',
                                border: `1px solid ${func.Status === 'Successful' ? '#bbf7d0' : '#fecaca'}`,
                                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                                textAlign: 'center',
                                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                                '&:hover': {
                                transform: 'scale(1.03)',
                                boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
                                }
                              }}
                            >
                              <Typography fontSize={13} fontWeight={600} mb={1}>{func.FunctionName}</Typography>
                              <Typography
                                sx={{
                                  backgroundColor: func.Status === 'Successful' ? '#ecfdf5' : '#fef2f2',
                                  color: func.Status === 'Successful' ? '#059669' : '#dc2626',
                                  px: 2,
                                  py: 0.5,
                                  fontWeight: 600,
                                  fontSize: 12,
                                  borderRadius: 1,
                                  display: 'inline-block'
                                }}
                              >
                                {func.Status === 'Successful' ? 'Success' : 'Failed'}
                              </Typography>
                            </Box>
                          </Grid>
                        ))}
                      </Grid>

                      {/* Function Table */}
                      <TableContainer component={Paper} elevation={0}>
                        <Table size="small" sx={{ width: '100%', tableLayout: 'fixed' }}>
                          <TableHead>
                            <TableRow>
                              {["DATE", "SERVER", "APPLICATION CI", "FUNCTION", "STATUS", "SCREENSHOT"].map(header => (
                                <TableCell key={header} sx={{ fontWeight: 600, color: '#6b7280', textAlign: 'center' }}>{header}</TableCell>
                              ))}
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {filteredByTimestamp.map((row, idx) => (
                              <TableRow key={idx}>
                                <TableCell align="center">{row.TimeGenerated}</TableCell>
                                <TableCell align="center">{row["Server Name"]}</TableCell>
                                <TableCell align="center">{row["Application ci"]}</TableCell>
                                <TableCell align="center">{row.FunctionName}</TableCell>
                                <TableCell align="center">
                                  <Box sx={{
                                    display: 'inline-block',
                                    minWidth: 80,
                                    textAlign: 'center',
                                    px: 1,
                                    py: 0.5,
                                    borderRadius: 1,
                                    fontSize: 12,
                                    fontWeight: 500,
                                    color: row.Status === 'Successful' ? 'green' : 'maroon',
                                    backgroundColor: row.Status === 'Successful' ? '#d1fae5' : '#fee2e2'
                                  }}>
                                    {row.Status}
                                  </Box>
                                </TableCell>
                                <TableCell align="center">
                                  <Link href={row.Screenshot} underline="none" target="_blank" sx={{ display: 'inline-flex', alignItems: 'center', color: '#1d4ed8', fontWeight: 500 }}>
                                    <img src="https://img.icons8.com/ios-glyphs/18/1d4ed8/visible--v1.png" alt="View" style={{ marginRight: 6 }} />
                                    View
                                  </Link>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </>
                  );
                })()}
              </Box>
            </Grid>
              </>
            )}
            
        </Grid>
    )
}

export default ValidationDrilldown;