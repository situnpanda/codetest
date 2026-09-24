import { CheckCircle } from "@mui/icons-material";
import React, { useState, useEffect } from 'react';
import {Divider, FormControl, InputLabel,ListItemText, Select ,Alert, AlertTitle,Box,Container, FormControlLabel, Switch, ButtonGroup, ToggleButton, ToggleButtonGroup,Paper,Grid,TextField,MenuItem,CircularProgress,InputAdornment,Autocomplete,Typography,Button,Checkbox, Table, TableBody, TableCell, TableContainer, TableHead, TableRow} from '@mui/material';
import { getUrl } from '../../../environment';
import { Modal, CssBaseline, GlobalStyles } from "@mui/material";
import TableSortLabel from "@mui/material/TableSortLabel";
import Pagination from "@mui/material/Pagination";
import dayjs from "dayjs"
import { useLocation } from 'react-router-dom';
import { logPageVisit,startPageTracking,appInsights } from "../appInsights";
const steps = ["1", "2", "3"];

export default function CustomStepper({userProfileData, appInsights, backendSessionToken, setIsSessionExpiredBackendToken}) {
  const [activeStep, setActiveStep] = useState(0);
  const [completed, setCompleted] = useState({});
  const [hostingType, setHostingType] = useState('');
  const [appFamily, setAppFamily] = useState('');
  const [appCI, setAppCI] = useState([]);
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

  const [historicalDataForAllAppFamily, setHistoricalDataForAllAppFamily] = useState([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [expandedRows, setExpandedRows] = useState([]);
  const [selectedAppFamily, setSelectedAppFamily] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const rowsPerPage = 8;

  const baseUrl = getUrl();


  var location = useLocation();

  const [entryTime, setEntryTime] = useState(null);
  
  const [demoVariant, setDemoVariant] = useState(false);
  const infraMetricOptions = ["CPU", "Memory", "Disk", "VM Health"];
  const dbMetricOptions = ["Deadlocks", "CPU Percentage", "Availability", "DTU", "Session Count", "Storage Utilization"];
  const [selectedInfraMetrics, setSelectedInfraMetrics] = useState([]);
  const [selectedDbMetrics, setSelectedDbMetrics] = useState([]);
  const [databaseName, setDatabaseName] = useState([]);
  const [databaseNameOptions, setDatabaseNameOptions] = useState([]);
  const toggleMetric = (list, setList, value) => {
    setList(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
  };
        
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
    setAppCI(newValues);
    setServerName([]);
    const filteredServerNames = fullData
      .filter((item) => newValues.includes(item.AppCI))
      .map((item) => item.ServerName);
    setServerNameOptions([...new Set(filteredServerNames)]);
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
    fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        "Authorization": `Bearer ${backendSessionToken}`
       },
      body: JSON.stringify(formData),
    })
      .then((response) => {
        if(!response.ok){
          return response.json().then(errorData => {
            console.log(`Error: ${response.status} ${errorData.Message}`)
            throw new Error(`Error: ${response.status} ${errorData.Message}`);
          });
        }
        return response.json()
      })
      .then((result) => {
        setIsSubmitting(false);
        setMessage('Maintenance request submitted successfully!');
        setMessageType('success');
        setHostingType('');
        setAppFamily('');
        setAppCI([]);
        setAppFamilyOptions([]);
        setAppCIOptions([]);
        setServerNameOptions([]);
        setJustification('');
        setStartTime('');
        setEndTime('');
        setServerName([]);
        setDistributionList("");
        setHistoricalDataForAllAppFamily([]);
        setPageReload(true);
        setActiveStep((prev) => prev - 2);
      })
      .catch((error) => {
        console.error(error);
        setIsSubmitting(false);
        if(error.toString().includes("Invalid Token")){
          setMessage("The token has Expired")
          setIsSessionExpiredBackendToken(true)
        }
        else{
          setMessage('There was an error submitting the request. Please try again!');
        }
        setMessageType('error');
      });
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

  const handleNext = () => {
    if (activeStep === 0 && (!appFamily || appCI.length === 0 || serverName.length === 0)) {
        setFillErrorMessage("Please fill all required fields!");
        return;
      }

    // if(activeStep === 1 && (!selectedFrequency || !justification || !startTime || !endTime)){
    //     setFillErrorMessage("Please fill all required fields!");
    //     return;
    // }

    if (activeStep === 1) {
      // Check required fields
      if (!selectedFrequency || !justification || !startTime || !endTime) {
        setFillErrorMessage("Please fill all required fields!");
        return;
      }
  
      // Check distribution list email
      const emailRegex = /^[^@]+@providence\.org$/;
      if (!distributionList || !emailRegex.test(distributionList)) {
        setFillErrorMessage("Please enter a valid DL!");
        return;
      }
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


  return (

    <>
      <Grid sx={{width: "90%", p: 3,boxShadow: 3,mt: 6,borderRadius: 4,mx: "auto", bgcolor: "white", position: "relative"}}>
     
        <Typography variant="h6" fontWeight="bold"  sx={{ mb: 3, color : "primary.main" }}>
            Welcome to the Alert Suppression Request Form!
        </Typography>

        <Typography variant="body2" sx={{ mt: 1, mb: 1, color: "text.primary", fontStyle: "italic" }}>
          • This form allows you to place servers into Maintenance Mode to pause alerts during scheduled downtimes or planned changes.
          <br />• Currently, this request form can be used only for <strong>Azure servers</strong>.
          <br />• You can suppress alerts only for servers that belong to your <strong>support group</strong>.
        </Typography>

        {/* Greyed-Out Overlay When RBAC is False */}
        {!rbacAccess && (
          <Grid
            container
            sx={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              bgcolor: "rgba(255, 255, 255, 0.7)", // Semi-transparent white overlay
              zIndex: 9, // Below the modal but above content
              pointerEvents: "none", // Allows modal to remain interactive, blocks background clicks
              borderRadius: 4
            }}
          />
        )}

        {/* RBAC Access Modal - Centered within Grid */}
        {!rbacAccess && (
          <Grid
            container
            sx={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "40%",
              maxWidth: 450,
              bgcolor: "background.paper",
              boxShadow: 24,
              p: 4,
              borderRadius: 2,
              textAlign: "center",
              zIndex: 10, // Ensure it's above overlay
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "auto", // Allows interaction only with modal
            }}
          >
            <Grid item>
              <Typography
                id="access-denied-title"
                variant="h9"
                color="black"
                fontWeight="bold"
                fontStyle="italic"
                sx={{ display: "flex", alignItems: "center", gap: 1 }}
              >
                ❌ Sorry, you do not have access to suppress alerts! Please reach out to CRCAMonitoringServices@providence.org
              </Typography>
            </Grid>
          </Grid>
        )}



        <Grid display="flex" alignItems="center" justifyContent="center" width="50%" mx="auto">
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


        {activeStep === 0 && (
          <>
            <Typography 
              variant="body2" 
              sx={{ mt: 1, mb: 1, color: "text.primary", fontStyle: "Italic" }}
            >
              Select the Application Family, Application CI, and provide server details.
            </Typography>

            <Divider sx={{ mb: 1, width: "100%" }} /> 


            <Grid container spacing={0.5} sx={{ width: "100%", justifyContent: "center" }}>
              {/* Row 1: App Family and App CI side by side */}
              <Grid container item spacing={0.5} sx={{ width: "100%" }}>
                <Grid item xs={6}>
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

                <Grid item xs={6}>
                  <Autocomplete
                    size="small"
                    multiple
                    value={appCI}
                    onChange={handleAppCIChange}
                    options={appCIOptions}
                    disableCloseOnSelect
                    getOptionLabel={(option) => option}
                    renderOption={(props, option, { selected }) => (
                      <li {...props}>
                        <Checkbox checked={selected} />
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

              {/* Row 2: Server Names full width */}
              <Grid item xs={12}>
                <Autocomplete
                  size="small"
                  multiple
                  value={serverName}
                  onChange={handleServerChange}
                  options={[selectAllLabel, ...serverNameOptions]}
                  disableCloseOnSelect
                  getOptionLabel={(option) => option}
                  renderOption={(props, option) => {
                    const isAllSelected = serverName.length === serverNameOptions.length;
                    const isChecked = option === selectAllLabel ? isAllSelected : serverName.includes(option);

                    return (
                      <MenuItem {...props}>
                        <Checkbox checked={isChecked} />
                        <ListItemText primary={option} />
                      </MenuItem>
                    );
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      fullWidth
                      label="Server Names"
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
                  disabled={!serverNameOptions.length}
                />
              </Grid>
            </Grid>

          </>
        )}



        {activeStep === 1 && (
          <>
            <Typography 
              variant="body2" 
              sx={{ mt: 1, mb: 1, color: "text.primary", fontStyle: "Italic" }}
            >
            Define the suppression rule, provide a justification, and select the list of people to inform.
            </Typography>

            <Divider sx={{ mb: 1, width: "100%" }} /> 

            <Grid container spacing={3} alignItems="center" justifyContent="center" sx={{ mt: 4 }}>

              <Typography sx={{ fontWeight: 500, fontSize: 12, mr: 4 }}>
                Apply the suppression rule
              </Typography>

              {/* One-Time Label */}
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

      
              {/* Toggle Switch */}
              <Switch
                checked={isRecurring} // Default: unchecked (One-Time)
                onChange={(event) => {
                  setIsRecurring(event.target.checked);
                  if (!event.target.checked) setSelectedFrequency(""); // Reset selection if switching to One-Time
                }}
                color="success"
                size="small"
              />

              {/* Recurring Label */}
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


              {/* start time, end time */}
              <Grid container item spacing={0.5} sx={{ width: "100%", justifyContent: "center" }}>
                {/* Start Time */}
                <Grid item sx={{ width: "50%" }}>
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
                <Grid item sx={{ width: "50%" }}>
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

                <Grid item sx={{ width: "100%", mt: 1 }}>
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

               

                <Grid item sx={{ width: "100%", mt: 1 }}>
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
            </Grid>

          </>
        )}
  
        {activeStep === 2 && (  // Step 3

          <>
            <Typography 
              variant="body2" 
              sx={{ mt: 1, mb: 1, color: "text.primary", fontStyle: "Italic" }}
            >
              Review your changes and submit.
            </Typography>

            <Divider sx={{ mb: 1, width: "100%" }} /> 

            <Grid container spacing={2} alignItems="center" justifyContent="center" sx={{ mt: 4 }}>
              {/* Hosting Type & App Family */}
              <Grid container item spacing={1} sx={{ width: "100%", justifyContent: "center" }}>
                {/* Hosting Type (Read-Only) */}
                <Grid item sx={{ width: "50%" }}>
                  <TextField
                    size="small"
                    value={hostingType}
                    label="Hosting Type"
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
                        color: "#000",
                      },
                    }}
                  />
                </Grid>

                {/* Application Family (Read-Only) */}
                <Grid item sx={{ width: "50%" }}>
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
                <Grid item sx={{ width: "50%" }}>
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
                <Grid item sx={{ width: "50%" }}>
                  <TextField
                    size="small"
                    value={serverName.join(", ")}  // Display multiple selected values
                    label="Server Names"
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

                {/* Start Time (Read-Only) */}
                <Grid item sx={{ width: "50%" }}>
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
                <Grid item sx={{ width: "50%" }}>
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
                <Grid item sx={{ width: "50%", mt: 1 }}>
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
                <Grid item sx={{ width: "50%", mt: 1 }}>
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
            </Grid>
          </>
        )}



        {fillErrorMessage && (
          <Typography sx={{ color: "red", fontSize: "14px", mb: 1, mt:2, textAlign: "center" }}>
            {fillErrorMessage}
          </Typography>
        )}

          
        {/* Buttons aligned with "Back" left and "Next/Submit" right */}
        <Grid item sx={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", mt:4 }}>


          {/* Back Button (align left) */}
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

          {/* Next or Submit Button (align right) */}
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

        {/* Alert Message (Success/Error) */}
        {message && (
          <Grid item xs={12} display="flex" justifyContent="center" mt={2}>
            <Alert 
            severity={messageType} 
            sx={{ width: '60%', borderRadius: 2, display: 'flex', justifyContent: 'center', textAlign: 'center' }}
            >
              {message}
            </Alert>
          </Grid>
        )}
      </Grid>

      {historicalDataForAllAppFamily.length === 0 ? (
          <p style={{ textAlign: "center", marginTop: "20px", color: "primary.main" }}>
            Fetching the latest scheduled changes...
          </p>
        ) : (
          <Grid sx={{width: "90%", p: 3, boxShadow: 3, mt: 6, borderRadius: 4, mx: "auto", bgcolor: "white",}}>
          <Typography variant="h6" fontWeight="bold"  sx={{ mb: 3, color : "primary.main" }}>
            Historical Scheduled Changes and Overview!
          </Typography>
          <Box sx={{ display: "flex", gap: 2, mb: 2, justifyContent: "flex-end" }}>
          
            {/* App Family Filter */}
            <FormControl sx={{ width: "20%" }} size="small">
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

            {/* Status Filter */}
            <FormControl sx={{ width: "20%" }} size="small">
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
          </Box>

          
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
        )}

    </>
  );  
}