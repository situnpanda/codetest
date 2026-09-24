import React, { useState, useEffect } from 'react';
import {Card, styled, Chip, FormLabel, FormGroup, Divider, FormControl, InputLabel,ListItemText, Select ,Alert, AlertTitle,Box,Container, FormControlLabel, Switch, ButtonGroup, ToggleButton, ToggleButtonGroup,Paper,Grid,TextField,MenuItem,CircularProgress,InputAdornment,Autocomplete,Typography,Button,Checkbox, Table, TableBody, TableCell, TableContainer, TableHead, TableRow} from '@mui/material';
import { getUrl } from '../../../../environment';
import { Modal, CssBaseline, GlobalStyles } from "@mui/material";
import TableSortLabel from "@mui/material/TableSortLabel";
import Pagination from "@mui/material/Pagination";
import dayjs from "dayjs"
import { useLocation } from 'react-router-dom';
import { logPageVisit,startPageTracking,appInsights } from "../../appInsights";
import { CreateTourCard } from "../../../shared/UI Components/PageInfo";
import CircularProgress_Styled from '../../../shared/UI Components/CircularProgress'

const steps = ["1", "2", "3"];

const StyledCard = styled(Card)({
    width: '100%',
    boxShadow: '0px 3px 6px rgba(0, 0, 0, 0.16)',
    padding: 4,
    position: 'relative',
});

export default function AlertSuppression({userProfileData, appInsights, backendSessionToken, setIsSessionExpiredBackendToken}) {
  
    const [activeStep, setActiveStep] = useState(0);
    const [completed, setCompleted] = useState({});
    const [hostingType, setHostingType] = useState('');
    
    const [serverName, setServerName] = useState([]);
    const [fullData, setFullData] = useState([]);
    const [appFamilyOptions, setAppFamilyOptions] = useState([]);
    const [appCIOptions, setAppCIOptions] = useState([]);
    const [serverNameOptions, setServerNameOptions] = useState([]);
    const [loadingAppFamily, setLoadingAppFamily] = useState(false);
    const [justification, setJustification] = useState('');
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState('');
    const [historicalData, setHistoricalData] = useState([]);
    const [allowSubmit, setAllowSubmit] = useState(true);
    const [fillErrorMessage, setFillErrorMessage] = useState("");
    const [toggleValue, setToggleValue] = React.useState("one-time"); // Default to "One-Time"
    const [isRecurring, setIsRecurring] = React.useState(false);
    const [selectedFrequency, setSelectedFrequency] = useState("OneTime"); 
    const [historicalDataForAllAppFamilies, setHistoricalDataForAllAppFamilies] = useState([]); // Stores fetched data
    const [loading, setLoading] = useState(true); // Tracks loading state
    const [rbacAccess, setRbacAccess] = useState(true);
    const [distributionList, setDistributionList] = useState("");
    const [pageReload, setPageReload] = useState(true);
    var [apiLoading, setApiLoading] = useState({"getAlertData":false, "submitRequest": false,})
    var [alertMetaData, setAlertMetaData] = useState({})
    const [appFamily, setAppFamily] = useState('');
    const [appCI, setAppCI] = useState([]);
    const [historicalDataForAllAppFamily, setHistoricalDataForAllAppFamily] = useState([]);
    const [currentPage, setCurrentPage] = useState(0);
    const [expandedRows, setExpandedRows] = useState([]);
    const [selectedAppFamily, setSelectedAppFamily] = useState("");
    const [selectedStatus, setSelectedStatus] = useState("");
    const pageInfo = {
      "PageHeader" : "Alert Suppression",
      "PageDescription" : "This feature allows teams to pause alerts during planned maintenance, preventing unnecessary notifications and reducing alert fatigue. By temporarily suppressing non‑critical alerts, it ensures monitoring systems remain meaningful and actionable, helping teams stay focused on real issues while maintaining operational efficiency.",
      "NewFeature" : [],
      "FeatureList" : ["Users can select one or more servers to suppress alerts for, and specify the duration of suppression.", "The form validates user inputs to ensure all required fields are completed and that the distribution list email is in the correct format.", "After submission, the form provides feedback on the success or failure of the request, and resets for new entries."],
      "UpcomingFeature" : []
    }
    var [alertConfigs, setAlertConfigs] = useState({
    //   "Server Alerts" : {"Metrics" : ["CPU", "Memory"], "Data" : {}, "SuppressResource":[]},
    //   "Services/URL Alerts" : {"Metrics" : ["Service", "URL"], "Data" : {}, "SuppressResource":[]},
    //   "File Storage Alerts" : {"Metrics" : ["Storage Capacity"], "Data" : {}, "SuppressResource":[]}
    // 
    })

    var [alertSuppress, setAlertSuppress] = useState({})

    var [error, setError] = useState({
      // "submitRequest": "",
      "getAlertData" : ""
    })

    const rowsPerPage = 8;

    var [modalTourOpen, setModalTourOpen] = useState(false)

    const baseUrl = getUrl();

    var location = useLocation();

    useEffect(() => {
      console.log("locationnnnnn", window.location.href) 
      startPageTracking(window.location.href);
      return () => {
        logPageVisit();      
        if (appInsights) {
            appInsights.flush();
            console.log('[Page] Flushed telemetry on unmount.');
        }
      };
    }, [location]);

    useEffect(() => {
      if(Object.keys(alertMetaData).length){
        var tempDict = {}
        Object.keys(alertMetaData).map((alertType) => {
          tempDict[alertType] = {}
          alertMetaData[alertType].map((item)=>{
            var resName = []
            Object.keys(item).map((key)=>{
              if(key.includes("Resources")){
                resName = item[key].map((val)=>val)
              }
              else if(key.includes("Custom Threshold")){
                var keyValue = key.split(" ")[0].toUpperCase()
                if(!(keyValue in tempDict[alertType])){
                  tempDict[alertType][keyValue] = []
                }
              }
            })
            if(resName.length){
              tempDict[alertType]["All"] = [...(tempDict[alertType]["All"] || []), ...resName]
              Object.keys(tempDict[alertType]).map((key)=>{
                tempDict[alertType][key] = [...tempDict[alertType][key], ...resName]
              })
            }
          })
          if("All" in tempDict[alertType]){
            console.log("The temp dict is ", tempDict)
            var tempStore = {"Data":{}, "Metrics":[], "SuppressResource":{}}
            tempStore["Data"] = {...tempDict[alertType]}
            tempStore["Metrics"] = Object.keys(tempDict[alertType]).filter((key)=> key !== "All")
            tempStore["SuppressResource"] = {}
            setAlertConfigs((prev) => ({
              ...prev,
              [alertType + " Alerts"]: {...tempStore}
            }))
            console.log("The temp dict is ", tempDict)
          }
        })
      }
    }, [alertMetaData])

    useEffect(()=>{
      console.log("The alert configs are ", alertConfigs)
    }, [alertConfigs])

    useEffect(() => {
      if(appFamily!="" && appFamily!=null){
        getAlertData();
      }
    }, [appFamily])

    const fetchData = async (mailAdd) => {
      const url = new URL(baseUrl + 'filteralertmanagement');
      setLoadingAppFamily(true);
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({mailAdd }),
        });
        if (response.ok) {
          const data = await response.json();

          setFullData(data.full_data);
          if (Array.isArray(data.full_data) && data.full_data.length === 0) {
            console.log("No matching records found.");
            setRbacAccess(false)
          }
          const filteredAppFamilies = [...new Set(data.full_data.map((item) => item.AppFamily))];
          const exists = filteredAppFamilies.includes("RightFax");

          if (exists) {
            console.log("AppFamily exists!");
          } else {
            console.log("AppFamily not found.");
          }
          console.log("The app family are", filteredAppFamilies)
          setAppFamilyOptions(filteredAppFamilies);
        } else {
          console.error('Failed to fetch data from backend');
        }
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoadingAppFamily(false);
      }
    };

    const handleHostingTypeChange = (newValue) => {
      setHostingType(newValue); // Use the new value directly
      setAppFamily('');
      setAppCI([]);
      setServerName([]);
      setAppFamilyOptions([]);
      const mailAdd = String(userProfileData["mail"] || "");
      fetchData(newValue, mailAdd); // Use the new value directly for fetching data
    };

    const handleAppFamilyChange = (event, newValue) => {
      setAppFamily(newValue);
      setAppCI([]);
      setServerName([]);
      setAllowSubmit(true);
      setAlertConfigs({})
      const filteredAppCIs = fullData.filter((item) => item.AppFamily === newValue).map((item) => item.AppCI);
      setAppCIOptions([...new Set(filteredAppCIs)]);
      const filteredServerNames = fullData.filter((item) => item.AppFamily === newValue).map((item) => item.ServerName);
      setServerNameOptions([...new Set(filteredServerNames)]);

      var url = new URL(baseUrl + 'getDataByAppFamily');
      fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ newValue }), // Send the app family name to the backend
        })
          .then((response) => {
            if (!response.ok) {
              throw new Error('Network response was not ok');
            }
            return response.json();
          })
          .then((data) => {
            // Assuming the response contains monthly values and historical data
            const { g, tableData } = data;
      
            // Update the state with the fetched data
            setHistoricalData(tableData); // Create this state to hold historical data
          })
          .catch((error) => {
            console.error('Error fetching data:', error);
          });
    };

    const handleAppCIChange = (event, newValues) => {
      if(newValues.includes("Select All")){
        if(appCI.length === appCIOptions.length){
          setAppCI([]);
        }
        else{
          setAppCI(appCIOptions);
        }
        
        return;
      }
      setAppCI(newValues);
      // setServerName([]);
      // const filteredServerNames = fullData
      //   .filter((item) => newValues.includes(item.AppCI))
      //   .map((item) => item.ServerName);
      // setServerNameOptions([...new Set(filteredServerNames)]);
    };

    const handleSubmit = (event) => {
      
      event.preventDefault();

      // Validate required fields
      if (!appFamily || !appCI || !justification || !startTime || !endTime || !serverName.length || !distributionList) {
        setMessage('Please complete all required fields!');
        setMessageType('error');
        return;
      }

      setCompleted({ ...completed, [activeStep]: true });
      // Clear previous messages
      setMessage('');
      setMessageType('');

      // Helper to format date/time
      const formatDateTime = (dateTime) => {
        const date = new Date(dateTime);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${day}-${month}-${year} ${hours}:${minutes}`;
      };

      const formattedStartTime = formatDateTime(startTime);
      const formattedEndTime = formatDateTime(endTime);
      const mailAdd = String(userProfileData["mail"] || "");
      console.log("The user data is ", userProfileData)
      console.log("The mail is", mailAdd)
      const formData = {
        appFamily,
        appCI,
        serverName,
        justification,
        startTime: formattedStartTime,
        endTime: formattedEndTime,
        mailAdd,
        selectedFrequency,
        distributionList
      };

      const url = new URL(baseUrl + 'submitMaintenance');
      setIsSubmitting(true);
      // fetch(url, {
      //   method: 'POST',
      //   headers: { 
      //     'Content-Type': 'application/json',
      //     "Authorization": `Bearer ${backendSessionToken}`
      //   },
      //   body: JSON.stringify(formData),
      // })
      //   .then((response) => {
      //     if(!response.ok){
      //       return response.json().then(errorData => {
      //         console.log(`Error: ${response.status} ${errorData.Message}`)
      //         throw new Error(`Error: ${response.status} ${errorData.Message}`);
      //       });
      //     }
      //     return response.json()
      //   })
      //   .then((result) => {
      //     setIsSubmitting(false);
      //     setMessage('Maintenance request submitted successfully!');
      //     setMessageType('success');
      //     setHostingType('');
      //     setAppFamily('');
      //     setAppCI([]);
      //     setAppFamilyOptions([]);
      //     setAppCIOptions([]);
      //     setServerNameOptions([]);
      //     setJustification('');
      //     setStartTime('');
      //     setEndTime('');
      //     setServerName([]);
      //     setDistributionList("");
      //     setHistoricalDataForAllAppFamily([]);
      //     setPageReload(true);
      //     setActiveStep((prev) => prev - 2);
      //   })
      //   .catch((error) => {
      //     console.error(error);
      //     setIsSubmitting(false);
      //     if(error.toString().includes("Invalid Token")){
      //       setMessage("The token has Expired")
      //       setIsSessionExpiredBackendToken(true)
      //     }
      //     else{
      //       setMessage('There was an error submitting the request. Please try again!');
      //     }
      //     setMessageType('error');
      //   });
    };

    useEffect(() => {
      if (message) {
        const timer = setTimeout(() => {
          setMessage(''); // Clear the message after 5 seconds
        }, 5000); // 5000ms = 5 seconds

        return () => clearTimeout(timer);
      }
    }, [message]);
    

    const selectAllLabel = "Select All";

    const handleServerChange = (event, value) => {
      if (value.includes(selectAllLabel)) {
        if (serverName.length === serverNameOptions.length) {
          setServerName([]); // Unselect all
        } else {
          setServerName([...serverNameOptions]); // Select all
        }
      } else {
        setServerName(value.filter((item) => item !== selectAllLabel)); // Remove "Select All"
      }
    };

    const handleResourceFilterChange = (event, value, alertType) => {
      
      var tempDict = JSON.parse(JSON.stringify(alertConfigs[alertType]));
      Object.keys(tempDict["SuppressResource"]).map((key)=>{
        tempDict["SuppressResource"][key] = value
      })
      
      setAlertConfigs((prev) => ({
        ...prev,
        [alertType]: tempDict
      }))
    }

    const handleCheckboxChange = (event, alertType, metric) => {
      console.log(alertType, metric, event.target.checked)
      var tempDict = JSON.parse(JSON.stringify(alertConfigs[alertType]));
      var resName = []
      console.log(tempDict["SuppressResource"])
      
      Object.keys(tempDict["SuppressResource"]).map((key)=>{
        resName = [...resName, ...tempDict["SuppressResource"][key]]
      })
      console.log(tempDict["SuppressResource"], event.target.checked)
      if(event.target.checked){
        tempDict["SuppressResource"][metric] = resName
      }
      else{
        delete tempDict["SuppressResource"][metric]
      }
      setAlertConfigs((prev) => ({
        ...prev,
        [alertType]: tempDict
      }));
    }

    const handleNext = () => {
      // if (activeStep === 0 && (!appFamily || appCI.length === 0 || serverName.length === 0)) {
      //     setFillErrorMessage("Please fill all required fields!");
      //     return;
      //   }

      if (activeStep === 1) {
          // Check required fields
          // if (!selectedFrequency || !justification || !startTime || !endTime) {
          //     setFillErrorMessage("Please fill all required fields!");
          //     return;
          // }
    
          // Check distribution list email
          const emailRegex = /^[^@]+@providence\.org$/;
          // if (!distributionList || !emailRegex.test(distributionList)) {
          //     setFillErrorMessage("Please enter a valid DL!");
          //     return;
          // }
      }

      setFillErrorMessage("");
      setCompleted({ ...completed, [activeStep]: true });
      setActiveStep((prev) => prev + 1);
    };

    const handleBack = () => {
      const newCompleted = { ...completed };
      delete newCompleted[activeStep - 1];
      setCompleted(newCompleted);
      setActiveStep((prev) => Math.max(prev - 1, 0));
    };

    useEffect(() => {
      const mailAdd = String(userProfileData["mail"] || "");
      fetchData(mailAdd); 
        
    }, []);

    const fetchHistoricalData = async () => {
      setLoading(true);
      try {
        const response = await fetch(baseUrl + 'getHistoricalDataForAllAppFamilies');
        const data = await response.json();
        setHistoricalDataForAllAppFamily(data.tableData);
        console.log("Fetch historical data")
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
        setPageReload(false);
      }
    };
    
    useEffect(() => {
      console.log("Updated historical data:", historicalDataForAllAppFamily);
    }, [historicalDataForAllAppFamily]);
    
    useEffect(() => {
      if (pageReload) {
          console.log("into the function")
          fetchHistoricalData();
      }
    }, [pageReload]);

    const toggleShowMore = (index) => {
      setExpandedRows((prev) =>
        prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
      );
    };

    const filteredData = historicalDataForAllAppFamily.filter((item) =>
        (selectedAppFamily ? item.appFamily === selectedAppFamily : true) &&
        (selectedStatus ? item.status === selectedStatus : true)
    );
    
    const paginatedData = filteredData.slice(
        currentPage * rowsPerPage,
        (currentPage + 1) * rowsPerPage
    );

    const handlePageChange = (event, newPage) => {
        setCurrentPage(newPage - 1);
    };

    var handleModalTourClose = () =>{
        setModalTourOpen(false)
    }

    const getAlertData = () => {
      setError((prevStatus)=>({
          ...prevStatus,
          "getAlertData" : ""
      }))
      setApiLoading((prevStatus)=>({
          ...prevStatus,
          "getAlertData" : true
      }))
      var params = { "applicationFamily" : appFamily }
      // const url = new URL("http://127.0.0.1:5000/api/" + "AlertRules/ReadAlertRules");
      const url = new URL(baseUrl + "AlertRules/ReadAlertRules");
      fetch(url,{
          method:"POST",
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params)
      }).then((response)=>response.json())
      .then((data)=>{
          var temp = JSON.parse(JSON.stringify(data))["Data"]
          var state = JSON.parse(JSON.stringify(data))["status"]
          data = JSON.parse(JSON.stringify(data))["Data"]
          if(state!=200){
              throw new Error("Exception")
          }
          console.log(temp)
          Object.keys(data).map((metricType)=>{
              data[metricType].map((val, ind)=>{
                if (Object.keys(val).includes("Resources")){
                  temp[metricType][ind]["Resources"] = []
                  if(metricType==="Services"){
                    temp[metricType][ind]["Service Custom Threshold"] = "Not Running"
                  }
                  val["Resources"].map((value)=>{
                      var resourceName = value.split(",")[0]
                      // .split("/")
                      if(metricType==="Services"){
                        var serviceName = value.split(",")[1]
                        var appCI = resourceName.split("/")[resourceName.split("/").length - 1]
                        var serverName = resourceName.split("/")[resourceName.split("/").length - 2]
                        temp[metricType][ind]["Resources"].push({"ResourceName":resourceName, "ServiceName":serviceName, "ApplicationCI":appCI, labelValue:serverName + "-" + serviceName})
                      }
                      else if(metricType==="Server"){
                        var labelName = resourceName.split("/")[resourceName.split("/").length - 1]
                        var appCI = value.split(",")[1]
                        temp[metricType][ind]["Resources"].push({"ResourceName":resourceName, "ApplicationCI":appCI, labelValue:labelName})
                      }
                      else{
                        var labelName = resourceName.split("/")[resourceName.split("/").length - 2] + "/" +resourceName.split("/")[resourceName.split("/").length - 1]
                        var appCI = value.split(",")[1]
                        temp[metricType][ind]["Resources"].push({"ResourceName":resourceName, "ApplicationCI":appCI, labelValue:labelName})
                      }
                  })
                }
              })
          })
          setAlertMetaData(temp)
          setApiLoading((prevStatus)=>({
              ...prevStatus,
              "getAlertData" : false
          }))
      })
      .catch((error)=>{
          console.log(error)
          setApiLoading((prevStatus)=>({
              ...prevStatus,
              "getAlertData" : false
          }))
          setError((prevStatus)=>({
              ...prevStatus,
              "getAlertData" : "Fetch Alert configuration API didnot load as expected. Please Try again and if issue persists reach out to iTelemetry team."
          }))
      })
    }

    var ScheduledMaintenanceInfo = () => {
      return (
        <Grid container px={2} py={2} spacing={2}>
          <Grid container spacing={2} justifyContent={"end"} mb={2}>
            <Grid item xs={6} justifyContent={"center"} alignItems={"center"}>
                <Typography variant="h6" fontWeight="bold"  sx={{ color : "primary.main" }}>
                  Historical Scheduled Changes and Overview!
                </Typography>
            </Grid>
            <Grid item md={3}>
              {/* App Family Filter */}
              <FormControl component="fieldset" fullWidth size="small">
                <InputLabel sx={{ backgroundColor: "#e9ecf1", px: 0.5, color: "#555"}}>
                  App Family
                </InputLabel>
                <Select fullWidth value={selectedAppFamily} onChange={(e) => setSelectedAppFamily(e.target.value)} sx={{backgroundColor: "#e9ecf1", borderRadius: 2, "&.Mui-focused": {backgroundColor: "#c7dfc5",},"& .MuiOutlinedInput-notchedOutline": { borderRadius: 2,},}}>
                  <MenuItem value="">All</MenuItem>
                  {[...new Set(historicalDataForAllAppFamily.map((item) => item.appFamily))].map((appFamily) => (
                    <MenuItem key={appFamily} value={appFamily}>{appFamily}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item md={3}>
              {/* Status Filter */}
              <FormControl component="fieldset" fullWidth size="small">
                <InputLabel sx={{ backgroundColor: "#e9ecf1", px: 0.5, color: "#555" }}>
                  Status
                </InputLabel>
                {/* <Select fullWidth value={selectedAppFamily} onChange={(e) => setSelectedAppFamily(e.target.value)} sx={{backgroundColor: "#e9ecf1",borderRadius: 2,"&.Mui-focused": {backgroundColor: "#c7dfc5",},"& .MuiOutlinedInput-notchedOutline": {borderRadius: 2,},}}> */}
                <Select fullWidth value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)} sx={{backgroundColor: "#e9ecf1",borderRadius: 2,"&.Mui-focused": {backgroundColor: "#c7dfc5",},"& .MuiOutlinedInput-notchedOutline": {borderRadius: 2,},}}>
                  <MenuItem value="">All</MenuItem>
                  {[...new Set(historicalDataForAllAppFamily.map((item) => item.status))].map((status) => (
                    <MenuItem key={status} value={status}>{status}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          <TableContainer component={Paper} sx={{ borderRadius: 3, overflow: "hidden" }}>
            <Table>
              <TableHead sx={{ bgcolor: "primary.main" }}>
                <TableRow>
                  <TableCell align="left" sx={{ color: "white", fontWeight: "bold" }}>
                    App Family
                  </TableCell>
                  <TableCell align="left" sx={{ color: "white", fontWeight: "bold" }}>
                    Server Names
                  </TableCell>
                  <TableCell align="left" sx={{ color: "white", fontWeight: "bold" }}>
                    Start Time
                  </TableCell>
                  <TableCell align="left" sx={{ color: "white", fontWeight: "bold" }}>
                    End Time
                  </TableCell>
                  <TableCell align="left" sx={{ color: "white", fontWeight: "bold" }}>
                    Status
                  </TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {paginatedData.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell align="left">{item.appFamily}</TableCell>
                    <TableCell align="left">
                      {item.serverNames.slice(0, 1).join(", ")}
                      {item.serverNames.length > 2 && (
                        <>
                          ,{" "}
                          <Button
                            size="small"
                            onClick={() => toggleShowMore(index)}
                            sx={{ textTransform: "none", fontSize: "0.8rem", color: "primary.main" }}
                          >
                            {expandedRows.includes(index) ? "Show Less" : "Show More"}
                          </Button>
                        </>
                      )}
                      {expandedRows.includes(index) && <p>{item.serverNames.join(", ")}</p>}
                    </TableCell>
                    <TableCell align="left">{new Date(item.startTime).toLocaleString()}</TableCell>
                    <TableCell align="left">{new Date(item.endTime).toLocaleString()}</TableCell>
                    <TableCell align="left">{item.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          
          <Grid item xs={12}>
            <Pagination
              count={Math.ceil(filteredData.length / rowsPerPage)}
              page={currentPage + 1}
              onChange={handlePageChange}
              sx={{
                mt: 2,
                display: "flex",
                justifyContent: "center",
                "& .MuiPaginationItem-root": {
                  border: "1px solid",
                  borderColor: "primary.main", // Border color for the page numbers
                  color: "primary.main", // Text color
                },
                "& .Mui-selected": {
                  backgroundColor: "primary.main !important", // Selected page background
                  color: "white !important", // Selected page text color
                },
                // Remove circle around left & right arrows
                "& .MuiPaginationItem-previousNext": {
                  border: "none", // Remove border for left/right arrows
                  backgroundColor: "transparent", // Remove background
                  color: "primary.main", // Keep arrow color
                }
              }}
            />  
          </Grid>
        </Grid>
      )
    }

  return(
    <Grid container my={4} p={2} mb={0} justifyContent='center' alignItems='center'>
      <Modal
        open={modalTourOpen}
        onClose={handleModalTourClose}
        aria-labelledby="parent-modal-title"
        aria-describedby="parent-modal-description"
        sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            opacity: '0.90'
        }}
      >
          <CreateTourCard pageHeader={pageInfo["PageHeader"]} pageDescription={pageInfo["PageDescription"]} newFeature={pageInfo["NewFeature"]} featureList={pageInfo["FeatureList"]} upcominFeature={pageInfo["UpcomingFeature"]} handleModalTourClose={handleModalTourClose} modalTourOpen={modalTourOpen}/>
      </Modal>
        
      <Grid container sx={{backgroundColor:"background.paper", borderRadius: 2, boxShadow: 3}} alignItems='center' justifyContent='center'>
        <Grid container px={2} pt={2} alignItems="center" justifyContent="center"> 
          <Grid item sm={12} md={6} mb={2} display="flex" alignItems="center" justifyContent="center">
            {steps.map((label, index) => (
              <React.Fragment key={index}>
                {/* Step Circle */}
                <Grid
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    border: 2,
                    borderColor: "primary.main",
                    fontSize: 18,
                    fontWeight: "bold",
                    backgroundColor: index <= activeStep ? "primary.main" : "transparent", // Fill previous & current steps
                    color: index <= activeStep ? "white" : "primary.main", // White text for previous & current steps
                    position: "relative",
                    zIndex: 1,
                  }}
                >
                  {label}
                </Grid>
  
                {/* Dynamic Connector */}
                {index < steps.length - 1 && (
                  <Box
                    sx={{
                      width: { xs: 30, sm: 50, md: 80 }, // Adjust spacing dynamically
                      height: 2,
                      backgroundColor: "primary.main",
                      mx: 0.5,
                      flexGrow: 1,
                      zIndex: 0,
                    }}
                  />
                )}
              </React.Fragment>
            ))}
          </Grid>
        </Grid>

        {activeStep === 0 ?
          <Page1
            appFamily={appFamily}
            setAppFamily={setAppFamily}
            appFamilyOptions={appFamilyOptions}
            loadingAppFamily={loadingAppFamily}
            handleAppFamilyChange={handleAppFamilyChange}
            appCI={appCI}
            setAppCI={setAppCI}
            appCIOptions={appCIOptions}
            handleAppCIChange={handleAppCIChange}
            alertConfigs={alertConfigs}
            apiLoading={apiLoading}
            handleCheckboxChange={handleCheckboxChange}
            handleResourceFilterChange={handleResourceFilterChange}
          />
        : 
          (activeStep ===1 ? 
            <Page2
              isRecurring={isRecurring}
              setIsRecurring={setIsRecurring}
              selectedFrequency={selectedFrequency}
              setSelectedFrequency={setSelectedFrequency}
              startTime={startTime}
              setStartTime={setStartTime}
              endTime={endTime}
              setEndTime={setEndTime}
              justification={justification}
              setJustification={setJustification}
              distributionList={distributionList}
              setDistributionList={setDistributionList}
            />
          :
            (activeStep ===2 ? 
              <Page3
                appFamily={appFamily}
                appCI={appCI}
                serverName={serverName}
                startTime={startTime}
                endTime={endTime}
                justification={justification}
                distributionList={distributionList}
                alertConfigs={alertConfigs}
              />      
            :
              null
            )
          )
        }

        <Grid container spacing={2} px={2} py={2} alignItems="center" justifyContent="end">
          {/* Back Button (align left) */}
          <Grid item>
            {activeStep !== 0 ? (
              <Button
                size="small"
                onClick={handleBack} // Call your back function
                variant="contained" // Ensures filled color
                color="primary" // Uses primary theme color
                sx={{ borderRadius: 5, color: "#fff" }} // Ensures white text
              >
                Back
              </Button>
            ) : (
              <div style={{ flex: 1 }} /> // Spacer to maintain alignment
            )}
          </Grid>
          {/* Next Button (align left) */}
          <Grid item>
            {activeStep === 2 ? (
            <Button
              size="small"
              onClick={handleSubmit} // Call your submit function
              variant="contained"
              color="success"
              sx={{ borderRadius: 5 }} // Adds border radius
            >
              {isSubmitting ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Submit'}
            </Button>
          ) : (
            <Button
              size="small"
              onClick={handleNext} // Call your next function
              variant="contained"
              color="success"
              disabled={activeStep >= steps.length}
              sx={{ borderRadius: 5 }} // Adds border radius
            >
              Next
            </Button>
          )}
          </Grid>
          
        </Grid>
      </Grid>
      
      <Grid container p={2} mt={2} sx={{backgroundColor:"background.paper", borderRadius: 2, boxShadow: 3}} alignItems='center' justifyContent='center'>
        <ScheduledMaintenanceInfo/>
      </Grid>
      
    </Grid>
  )

}


function Page1({
    appFamily,
    setAppFamily,
    appFamilyOptions,
    loadingAppFamily,
    handleAppFamilyChange,
    appCI,
    setAppCI,
    appCIOptions,
    handleAppCIChange,
    alertConfigs,
    apiLoading,
    handleCheckboxChange,
    handleResourceFilterChange
  }) {
  return (
    <>
      {/* First Page */}
      <Grid container px={2} py={2} spacing={2}>
        <Grid item md={6} id={"select-app-family"}>
          <Autocomplete
            size="small"
            value={appFamily}
            onChange={handleAppFamilyChange}
            options={appFamilyOptions}
            renderInput={(params) => (
              <TextField
                {...params}
                fullWidth
                label="Application Family"
                required
                InputProps={{
                  ...params.InputProps,
                  endAdornment: loadingAppFamily ? (
                    <InputAdornment position="end">
                      <CircularProgress size={16} />
                    </InputAdornment>
                  ) : null,
                }}
                sx={{
                  "& .MuiInputBase-root": {
                    borderRadius: 2,
                    backgroundColor: "#e9ecf1",
                    transition: "background-color 0.3s ease",
                    "&.Mui-focused": {
                      backgroundColor: "#c7dfc5",
                    },
                  },
                  "& .MuiOutlinedInput-notchedOutline": { borderRadius: 2 },
                  "& .MuiInputLabel-root": { color: "#555" },
                  width: "100%",
                }}
              />
            )}
            disabled={!appFamilyOptions.length || loadingAppFamily}
            freeSolo
          />
        </Grid>

        <Grid item md={6} id={"select-app-ci"}>
          <Autocomplete
            size="small"
            multiple
            value={appCI}
            onChange={handleAppCIChange}
            options={[...["Select All"], ...appCIOptions]}
            disableCloseOnSelect
            getOptionLabel={(option) => option}
            renderOption={(props, option, { selected }) => (
              <li {...props}>
                <Checkbox checked={appCI.length===appCIOptions.length ? true : selected} />
                {option}
              </li>
            )}
            renderInput={(params) => (
              <TextField
                {...params}
                fullWidth
                label="Application CI"
                required
                sx={{
                  "& .MuiInputBase-root": {
                    borderRadius: 2,
                    backgroundColor: "#e9ecf1",
                    transition: "background-color 0.3s ease",
                    "&.Mui-focused": { backgroundColor: "#c7dfc5" },
                  },
                  "& .MuiOutlinedInput-notchedOutline": { borderRadius: 2 },
                  "& .MuiInputLabel-root": { color: "#555" },
                  width: "100%",
                }}
              />
            )}
            disabled={!appCIOptions.length}
          />
        </Grid>
      </Grid>

      {/* <Grid item md={3} id={"suppress-all-server-alerts"}>
          <Box display="flex" alignItems="center" justifyContent={"center"}>
            <Switch />
            <Typography variant="body1" ml={1}>
              Suppress all Server alerts
            </Typography>
          </Box>
        </Grid> */}
      <Grid container spacing={2} px={2} py={2} alignItems="center" justifyContent="center">
        {(apiLoading["getAlertData"] ?
          <StyledCard sx={{borderRadius: 2}} m = {1}>
            <Grid container xs={12} justifyContent="center" alignItems="center" sx={{ minHeight: 200, height:'100%', display: 'flex' }}>
              <CircularProgress_Styled loadingWhat='Loading Alert Components if Any' fetchingFor='Fetching Alert Configuration Resources'/>
            </Grid>
          </StyledCard> 
          : 
          null
        )}
        {appFamily!==null && appFamily!=="" && !apiLoading["getAlertData"] && Object.keys(alertConfigs).length === 0 ?
          <Alert severity="info" sx={{width:'100%'}}>
            <AlertTitle>No Alert Configurations</AlertTitle>
            There are no alert configurations available for the selected application family. Please reach out to iTelemetry team if you think there should be alert configurations for this application family.
          </Alert>
        : 
          null
        }
      </Grid>

        {Object.keys(alertConfigs). map((alertType) => (
          <Grid container spacing={2} px={2} py={2} alignItems="center" justifyContent="center">
            <Grid item md={3} id={"title-metrics-to-suppress"}>
              <Typography variant="subtitle1" fontWeight="bold">
                {alertType} Configuration
              </Typography>
            </Grid>
            <Grid item md={2} id={`select-${alertType.split(" ").slice(0, -1).join("-").toLowerCase()}-metrics-to-suppress`}>
              <FormControl component="fieldset">
                <FormLabel component="legend">Metrics *</FormLabel>
                <FormGroup aria-label="position" row>
                  {alertConfigs[alertType]["Metrics"].map((metric) => (
                    <FormControlLabel
                      value={metric}
                      control={
                        <Checkbox 
                          checked={Object.keys(alertConfigs[alertType]["SuppressResource"]).includes(metric)}
                          onClick={(event)=>handleCheckboxChange(event, alertType, metric)}
                        />
                      }
                      label={metric}
                      labelPlacement="right"
                    />
                  ))}
                </FormGroup>
              </FormControl>
            </Grid>
            <Grid item md={7} id={`select-${alertType.split(" ").slice(0, -1).join("-").toLowerCase()}-to-suppress`}>
              <Autocomplete
                size="small"
                multiple
                disableCloseOnSelect
                value = {
                  Object.keys(alertConfigs[alertType]["SuppressResource"]).map((key)=> 
                    (alertConfigs[alertType]["SuppressResource"][key] || []).map((item)=> item)
                  ).flat()
                }
                onChange={(event, value) => handleResourceFilterChange(event, value, alertType)}
                options={
                  Array.from(
                    new Map(
                      (
                        Object.keys(alertConfigs[alertType]["SuppressResource"] || {})
                          .reduce((acc, key) => {
                            var arr = Array.isArray(alertConfigs[alertType]["Data"][key])
                              ? alertConfigs[alertType]["Data"][key]
                              : [];
                            console.log(arr[0])
                            arr = arr.filter((item) => appCI.length===0 || appCI.map((val)=>val.toLowerCase()).includes(item.ApplicationCI.toLowerCase()))
                            return acc.concat(arr);
                          }, [])
                      ).map(item => [
                        item.ResourceName + (item.ServiceName ? `-${item.ServiceName}` : ""),
                        item
                      ])
                    ).values()
                  )
                }
                disabled = {Object.keys(alertConfigs[alertType]["SuppressResource"] || {}).length === 0}
                getOptionLabel={(option) => option.ResourceName}
                renderOption={(props, option, { selected })=>{
                    return(
                        <Grid container m={1} xs={12} {...props} key={option.ResourceName} spacing={2}>
                            {option.ResourceName.split("/").map((val,ind)=>{
                                return (
                                    <Grid md={ind==0 || ind==1?3:2} lg={ind==0 || ind==1?3:2} sx={{ display: 'flex', alignItems: 'center' }}>
                                        <Typography variant="body2" sx={{ fontSize: 12 }}>{val}</Typography>
                                    </Grid> 
                                )
                            })}
                            {option.ServiceName && (
                                <Grid md={2} lg={2} sx={{ display: 'flex', alignItems: 'center'}}>
                                    <Typography variant="caption" sx={{ fontSize: 12 }}>{option.ServiceName}</Typography>                
                                </Grid>  
                            )}
                            <Grid md={2} lg={2} sx={{ display: 'flex', alignItems: 'center'}}>
                                <Typography variant="caption" sx={{ fontSize: 12 }}>{option.ApplicationCI}</Typography>                
                            </Grid>  
                        </Grid>
                    )
                }}
                renderTags={(value, getTagProps) => {
                  var arr = [];
                  return value.map((option, index) => {
                    let label = option.labelValue;
                    if(arr.includes(label)) return null;
                    arr.push(label);
                    return (
                      <Chip
                        {...getTagProps({ index })}
                        key={index}
                        label={label}
                        size="small"
                        sx={{ height: 22, fontSize: 11, pl: 0.5, pr: 0.5 }}
                      />
                    );
                  })
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    fullWidth
                    label={"Alert Enabled "+alertType.split(" ").slice(0, -1).join(" ") + " Names"}
                    required
                    sx={{
                      "& .MuiInputBase-root": {
                        borderRadius: 2,
                        backgroundColor: "#e9ecf1",
                        transition: "background-color 0.3s ease",
                        "&.Mui-focused": { backgroundColor: "#c7dfc5" },
                      },
                      "& .MuiOutlinedInput-notchedOutline": { borderRadius: 2 },
                      "& .MuiInputLabel-root": { color: "#555" },
                      width: "100%",
                    }}
                  />
                )}
              />
            </Grid>
          </Grid>
        ))
      }
    </>
  )
}

function Page2({
  isRecurring,
  setIsRecurring,
  selectedFrequency,
  setSelectedFrequency,
  startTime,
  setStartTime,
  endTime,
  setEndTime,
  justification,
  setJustification,
  distributionList,
  setDistributionList
}){
  return(
    <>
      <Grid container px={2} py={2} spacing={2}>
        <Grid container py={2} spacing={2} id={"select-frequency"} justifyContent={"center"} alignItems={"center"}>
          <Grid item>
            <Typography sx={{ fontWeight: 500, fontSize: 12, mr: 4 }}>
              Apply the suppression rule
            </Typography>
          </Grid>

          {/* One-Time Label */}
          <Grid item>
            <Typography
              sx={{
                fontWeight: 500,
                fontSize: 12,
                color: isRecurring ? "#888" : "#000",
                transition: "color 0.3s",
                mr: 1,
              }}
            >
              One-Time
            </Typography>
          </Grid>
  
          {/* Toggle Switch */}
          <Grid item>
            <Switch
              checked={isRecurring} // Default: unchecked (One-Time)
              onChange={(event) => {
                setIsRecurring(event.target.checked);
                if (!event.target.checked) setSelectedFrequency(""); // Reset selection if switching to One-Time
              }}
              color="success"
              size="small"
            />
          </Grid>
          
          {/* Recurring Label */}
          <Grid item>
            <Typography
              sx={{
                fontWeight: 500,
                fontSize: 12,
                color: isRecurring ? "#000" : "#bbb", // Greyed out when One-Time is selected
                transition: "color 0.3s",
                ml: 1,
                mr: 2,
              }}
            >
              Recurring
            </Typography>
          </Grid>
          
          {/* Frequency Buttons (Disabled when One-Time is selected) */}
          {["Daily", "Weekly", "Monthly"].map((option) => (
            <Button
              key={option}
              onClick={() => setSelectedFrequency(option)}
              disabled={!isRecurring} // Disabled when One-Time is selected
              sx={{
                mr: 2, // Space between buttons
                borderRadius: 3, // Rounded corners
                fontSize: 12,
                padding: "2px 8px",
                border: `2px solid ${isRecurring ? "green" : "#bbb"}`, // Green border when enabled, grey when disabled
                backgroundColor: selectedFrequency === option ? "green" : "white", // Green when selected
                color: selectedFrequency === option ? "white" : isRecurring ? "green" : "#bbb", // White text when selected, otherwise green/grey
                "&:hover": {
                  backgroundColor: isRecurring ? "lightgreen" : "white", // Hover effect only when enabled
                },
              }}
            >
              {option}
            </Button>
          ))}
        </Grid>
        <Grid item md={6} id={"select-start-time"}>
          <TextField
            type="datetime-local"
            size="small"
            fullWidth
            label="Start Time (PST)"
            value={startTime}
            onChange={(e) => {
              const value = e.target.value;
              setStartTime(value);

              // Reset endTime if it exceeds the allowed 7-day window
              if (endTime) {
                const diffDays =
                  (new Date(endTime) - new Date(value)) / (1000 * 60 * 60 * 24);
                if (diffDays > 7 || diffDays < 0) {
                  setEndTime("");
                }
              }
            }}
            required
            InputLabelProps={{ shrink: true }}
            inputProps={{
              max: endTime
                ? (() => {
                    const end = new Date(endTime);
                    return end.toISOString().slice(0, 16);
                  })()
                : undefined,
              min: endTime
                ? (() => {
                    const end = new Date(endTime);
                    end.setDate(end.getDate() - 7);
                    return end.toISOString().slice(0, 16);
                  })()
                : undefined,
            }}
            sx={{
              "& .MuiInputBase-root": {
                borderRadius: 2,
                backgroundColor: "#e9ecf1",
                transition: "background-color 0.3s ease",
                "&.Mui-focused": {
                  backgroundColor: "#c7dfc5",
                },
              },
              "& .MuiOutlinedInput-notchedOutline": { borderRadius: 2 },
              "& .MuiInputLabel-root": { color: "#555" },
              width: "100%",
            }}
          />
        </Grid>

        {/* End Time */}
        <Grid item md={6} id={"select-end-time"}>
          <TextField
            type="datetime-local"
            size="small"
            label="End Time (PST)"
            fullWidth
            value={endTime}
            onChange={(e) => {
              const value = e.target.value;
              setEndTime(value);

              // Reset startTime if it exceeds the allowed 7-day window
              if (startTime) {
                const diffDays =
                  (new Date(value) - new Date(startTime)) / (1000 * 60 * 60 * 24);
                if (diffDays > 7 || diffDays < 0) {
                  setStartTime("");
                }
              }
            }}
            required
            InputLabelProps={{ shrink: true }}
            inputProps={{
              min: startTime || undefined,
              max: startTime
                ? (() => {
                    const start = new Date(startTime);
                    start.setDate(start.getDate() + 7);
                    return start.toISOString().slice(0, 16);
                  })()
                : undefined,
            }}
            sx={{
              "& .MuiInputBase-root": {
                borderRadius: 2,
                backgroundColor: "#e9ecf1",
                transition: "background-color 0.3s ease",
                "&.Mui-focused": {
                  backgroundColor: "#c7dfc5",
                },
              },
              "& .MuiOutlinedInput-notchedOutline": { borderRadius: 2 },
              "& .MuiInputLabel-root": { color: "#555" },
              width: "100%",
            }}
          />
        </Grid>
        <Grid item md={6} id={"justification-for-suppression"}>
          <TextField
            size="small"
            label="Justification"
            fullWidth
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            placeholder="Provide a brief justification..."
            required
            sx={{
              "& .MuiInputBase-root": {
                borderRadius: 2,
                backgroundColor: "#e9ecf1", // Default background color
                transition: "background-color 0.3s ease",
                "&.Mui-focused": {
                  backgroundColor: "#c7dfc5", // Light green when focused
                },
              },
              "& .MuiOutlinedInput-notchedOutline": {
                borderRadius: 2, // Match border-radius for outline
              },
              "& .MuiInputLabel-root": {
                color: "#555", // Label color
              },
              width: "100%",
            }}
          />
        </Grid>
        <Grid item md={6} id={"DL-for-notifications"}>
          <TextField
            size="small"
            label="Team Distribution List (Email)"
            fullWidth
            value={distributionList}
            onChange={(e) => setDistributionList(e.target.value)}
            placeholder="e.g. team-alerts@providence.org"
            required
            error={
              distributionList !== "" &&
              !/^[^@]+@providence\.org$/.test(distributionList)
            }
            helperText={
              distributionList !== "" &&
              !/^[^@]+@providence\.org$/.test(distributionList)
                ? "Must be a valid providence.org email"
                : ""
            }
            sx={{
              "& .MuiInputBase-root": {
                borderRadius: 2,
                backgroundColor: "#e9ecf1", // Default background color
                transition: "background-color 0.3s ease",
                "&.Mui-focused": {
                  backgroundColor: "#c7dfc5", // Light green when focused
                },
              },
              "& .MuiOutlinedInput-notchedOutline": {
                borderRadius: 2, // Match border-radius for outline
              },
              "& .MuiInputLabel-root": {
                color: "#555", // Label color
              },
              width: "100%",
            }}
          />
        </Grid>
      </Grid>
    </>
  )
}

function Page3({
  appFamily,
  appCI,
  serverName,
  startTime,
  endTime,
  justification,
  distributionList,
  alertConfigs
}) {
  var [paginatedData, setPaginatedData] = useState([]);
  var [rowsPerPage, setRowsPerPage] = useState(3);
  var [page, setPage] = useState(0);
  useEffect(()=>{
    var tempArr = []
    Object.keys(alertConfigs).map((alertType)=>{
      Object.keys(alertConfigs[alertType]["SuppressResource"] || {}).map((metric)=>{
        (alertConfigs[alertType]["SuppressResource"][metric] || []).map((resName)=>{
          tempArr.push([resName.labelValue, alertType+": "+metric])
        })
      })
    })
    setPaginatedData(tempArr)
  }, [alertConfigs])

  useEffect(()=>{
    console.log(paginatedData)
  }, [paginatedData])

  var handlePageChange = (event, value) => {
    setPage(value-1);
  }

  return(
    <>
      <Grid container px={2} py={2} spacing={2}>
        {/* Application Family (Read-Only) */}
        <Grid item md={6}>
          <TextField
            size="small"
            value={appFamily}
            label="Application Family"
            fullWidth
            disable
            sx={{
              "& .MuiInputBase-root": {
                borderRadius: 2,
                backgroundColor: "#e9ecf1",
              },
              "& .MuiOutlinedInput-notchedOutline": {
                borderRadius: 2,
              },
              "& .MuiInputBase-input": {
                  color: "#1a237e", // Dark blue text for values
                  fontWeight: "bold", // Make values bold (optional)
                },
              "& .MuiInputLabel-root": {
                color: "#555",
              },
            }}
          />
        </Grid>
      

        {/* Application CI (Read-Only) */}
        <Grid item md={6}>
          <TextField
            size="small"
            value={appCI.join(", ")}  // Display multiple selected values
            label="Application CI"
            fullWidth
            disabled
            sx={{
              "& .MuiInputBase-root": {
                borderRadius: 2,
                backgroundColor: "#e9ecf1",
              },
              "& .MuiOutlinedInput-notchedOutline": {
                borderRadius: 2,
              },
              "& .MuiInputBase-input": {
                color: "#1a237e", // Dark blue text for values
                fontWeight: "bold", // Make values bold (optional)
              },
              "& .MuiInputLabel-root": {
                color: "#555",
              },
            }}
          />
        </Grid>

        {/* Server Names (Read-Only) */}
        <Grid item md={12} >
          {/* Table Of resources */}
          <TableContainer md={6} component={Paper} sx={{ borderRadius: 3, overflow: "hidden" }} justifyContent={"center"} alignItems={"center"}>
            <Table>
              <TableHead sx={{ bgcolor: "primary.main" }}>
                <TableRow>
                  <TableCell align="left" sx={{ color: "white", fontWeight: "bold" }}>
                    Resource Name
                  </TableCell>
                  <TableCell align="left" sx={{ color: "white", fontWeight: "bold" }}>
                    Resource Type
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedData.slice(page*rowsPerPage, page*rowsPerPage+rowsPerPage).map((item, index) => (
                  <TableRow key={index}>
                    <TableCell align="left">{item[0]}</TableCell>
                    <TableCell align="left">{item[1]}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          
          <Grid item xs={12}>
            <Pagination
              count={Math.ceil(paginatedData.length / rowsPerPage)}
              page={page + 1}
              onChange={handlePageChange}
              sx={{
                mt: 2,
                display: "flex",
                justifyContent: "center",
                "& .MuiPaginationItem-root": {
                  border: "1px solid",
                  borderColor: "primary.main", // Border color for the page numbers
                  color: "primary.main", // Text color
                },
                "& .Mui-selected": {
                  backgroundColor: "primary.main !important", // Selected page background
                  color: "white !important", // Selected page text color
                },
                // Remove circle around left & right arrows
                "& .MuiPaginationItem-previousNext": {
                  border: "none", // Remove border for left/right arrows
                  backgroundColor: "transparent", // Remove background
                  color: "primary.main", // Keep arrow color
                }
              }}
            />  
          </Grid>
        </Grid>

        {/* Start Time (Read-Only) */}
        <Grid item md={6}>
          <TextField
            type="datetime-local"
            size="small"
            label="Start Time"
            fullWidth
            value={startTime}
            disabled
            InputLabelProps={{ shrink: true }}
            sx={{
              "& .MuiInputBase-root": {
                borderRadius: 2,
                backgroundColor: "#e9ecf1",
              },
              "& .MuiOutlinedInput-notchedOutline": {
                borderRadius: 2,
              },
              
              "& .MuiInputBase-input": {
                color: "#1a237e", // Dark blue text for values
                fontWeight: "bold", // Make values bold (optional)
              },
              "& .MuiInputLabel-root": {
                color: "#555",
              },
              width: "100%",
            }}
          />
        </Grid>

        {/* End Time (Read-Only) */}
        <Grid item md={6}>
          <TextField
            type="datetime-local"
            size="small"
            label="End Time"
            fullWidth
            value={endTime}
            disabled
            InputLabelProps={{ shrink: true }}
            sx={{
              "& .MuiInputBase-root": {
                borderRadius: 2,
                backgroundColor: "#e9ecf1",
              },
              "& .MuiOutlinedInput-notchedOutline": {
                borderRadius: 2,
              },
              "& .MuiInputBase-input": {
                color: "#1a237e", // Dark blue text for values
                fontWeight: "bold", // Make values bold (optional)
              },
              "& .MuiInputLabel-root": {
                color: "#555",
              },
              width: "100%",
            }}
          />
        </Grid>

        {/* Justification (Read-Only) */}
        <Grid item md={6}>
          <TextField
            size="small"
            label="Justification"
            fullWidth
            value={justification}
            disabled
            placeholder="Provide a brief justification..."
            sx={{
              "& .MuiInputBase-root": {
                borderRadius: 2,
                backgroundColor: "#e9ecf1",
              },
              "& .MuiOutlinedInput-notchedOutline": {
                borderRadius: 2,
              },
              "& .MuiInputBase-input": {
                color: "#1a237e", // Dark blue text for values
                fontWeight: "bold", // Make values bold (optional)
              },
              "& .MuiInputLabel-root": {
                color: "#555",
              },
              width: "100%",
            }}
          />
        </Grid>

        {/* DL (Read-Only) */}
        <Grid item md={6}>
          <TextField
            size="small"
            label="Distribution List"
            fullWidth
            value={distributionList}  // Display selected values as a comma-separated list
            disabled
            sx={{
              "& .MuiInputBase-root": {
                borderRadius: 2,
                backgroundColor: "#e9ecf1",
              },
              "& .MuiOutlinedInput-notchedOutline": {
                borderRadius: 2,
              },
              "& .MuiInputLabel-root": {
                color: "#555",
              },
              "& .MuiInputBase-input": {
                color: "#1a237e", // Dark blue text for values
                fontWeight: "bold", // Make values bold (optional)
              },
              width: "100%",
            }}
          />
        </Grid>
      </Grid>
    </>
  )
}