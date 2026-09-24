import React, { useState, useEffect } from "react";
import {Box,Typography,Grid,Card,CardContent,CircularProgress,Alert,TablePagination, Autocomplete,TextField} from "@mui/material";
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import { getUrl } from "../../../environment";
import { useLocation } from "react-router-dom";
import AreaLineChart from '../../shared/LineChart/AreaLineChart';
import LocationIcon from "../../Static/Images/LocationIcon.svg";
import UpTimeIcon from "../../Static/Images/UpTime.svg";
import EventLogsIcon from '../../Static/Images/EventLog.svg'
import ServerStatusIcon from '../../Static/Images/ServerStatus.svg'
import PatchComplianceIcon from '../../Static/Images/PatchCompliance.svg'
import TagComplianceIcon from '../../Static/Images/TagCompliance.svg'

function AppMonitoringDashboard({date, appInsights}) {
  const baseUrl = getUrl();
  const location = useLocation();
  const { AppName } = location.state || {};
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [noData, setNoData] = useState(false);
  const [initialLoad, setInitialLoad] = useState(false);
  const [impactedUsers, setImpactedUsers] = useState("NA");
  const [totalExceptions, setTotalExceptions] = useState("NA");
  const [distinctTypeCount, setDistinctTypeCount] = useState("NA");
  const [detailedData, setDetailedData] = useState([]);
  const [page, setPage] = useState(0); // State for current page
  const [rowsPerPage] = useState(5);
  const [tableLoading,setTableLoading] = useState(false);
  const [errorApi, setErrorApi] = useState({
    TotalExceptions: "",
    ImpactedUsers: "",
    DistinctTypeCount: "",
  });

  const [reliabilityData, setReliabilityData] = useState([]);
  const [selectedAppInsight, setSelectedAppInsight] = useState(null);
  const [filteredReliabilityData, setFilteredReliabilityData] = useState(reliabilityData);
 const [entryTime, setEntryTime] = useState(null);
         
         useEffect(() => {
           const currentTime = Date.now();
           setEntryTime(currentTime);
           console.log('Page Entry Time:', currentTime);  // Debugging statement
           var {href} = window.location
           console.log(href)
           return () => {
             const exitTime = Date.now();
             const timeSpent = exitTime - currentTime;
             console.log('Page Exit Time:', exitTime);  // Debugging statement
             console.log('Time Spent on Page (ms):', timeSpent);  // Debugging statement
         
             if (appInsights) {
               console.log("app insights are initialized")
               appInsights.trackMetric({
                 name: 'TimeSpentInApp',
                 average: timeSpent / 1000,
               });
               console.log('Time Spent Metric Sent:', timeSpent / 1000, 'seconds');  // Debugging statement
         
               appInsights.trackEvent({
                 name: 'PageVisited',
                 properties: {
                   sessionId: sessionStorage.getItem('sessionId'),
                   userId: sessionStorage.getItem('userId'),
                   userName: sessionStorage.getItem('userName'),
                   page: href,
                   timeSpent: timeSpent / 1000,  
                 },
               });
               console.log('PageVisited Event Sent:', {
                 sessionId: sessionStorage.getItem('sessionId'),
                 userId: sessionStorage.getItem('userId'),
                 userName: sessionStorage.getItem('userName'),
                 page: location.pathname,
                 timeSpent: timeSpent / 1000,  
               });  // Debugging statement
             }
             else{
               console.log("app insights not intiliazed no logs are tracked")
             }
           };
         }, [location, appInsights]);
         
         useEffect(() => {
           const handleError = (error) => {
             if (appInsights) {
               appInsights.trackException({ exception: error });
               console.log('Error Tracked:', error);  // Debugging statement
             }
             console.error('Error:', error);
           };
         
           window.onerror = (msg, url, lineNo, columnNo, error) => {
             handleError(error);
             return true; 
           };
         }, [appInsights]);


  const createPayload = (aggregate) => ({
    aggregate,
    filters: {
      appFamily: ["All"],
      appCI: [AppName],
      managedByGroup: ["All"],
      supportGroup: ["All"],
    },
    start_time: date.startDate,
    end_time: date.endDate,
  });

  const fetchExceptionsData = async (aggregate) => {
    try {
      if (aggregate === "no") {
        setTableLoading(true); 
        setDetailedData([]) // Set table loading state
      } else {
        setLoading(true);
      }
  
      const response = await fetch(baseUrl + "applicationexceptions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(createPayload(aggregate)),
      });
  
      if (!response.ok) {
        throw new Error("Failed to fetch data");
      }
  
      const data = await response.json();
  
      if (!data || Object.keys(data).length === 0) {
        setNoData(true);
        setDetailedData([]);
      } else {
        if (aggregate === "yes") {
          setImpactedUsers(data.ImpactedUsersCount || "NA");
          setTotalExceptions(data.TotalExceptions || "NA");
          setDistinctTypeCount(data.DistinctTypeCount || "NA");
        } else {
          setDetailedData(data || []);
          //console.log(data)
        }
      }
    } catch (fetchError) {
      console.error(fetchError);
      setError("Error fetching data. Please try again later.");
      setDetailedData([]);
    } finally {
      if (aggregate === "no") {
        setTableLoading(false);  
      } else {
        setLoading(false);
      }
    }
  };

  const fetchReliabilityData = async (aggregate) => {
    try {
      const response = await fetch(baseUrl + "applicationReliability", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(createPayload(aggregate)),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch reliability data");
      }

      const data = await response.json();
      //(data)

      if (Object.keys(data).length === 0 || !data) {
        setNoData(true);
      } else {
        const formattedData = data.map(item => ({
          time: item.TimeGenerated, 
          reliability: item.Reliability ,
          total: item.Total,
          success: item.Success,
          AppInsightName: item.AppInsightName

        }));

        setReliabilityData(formattedData || []);
      }
    } catch (fetchError) {
      console.error(fetchError);
      setError("Error fetching reliability data. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  const handleAppInsightFilterChange = (event, value) => {
    setSelectedAppInsight(value);

    if (value) {
        // Filter data based on selected App Insight Name
        const filteredData = reliabilityData.filter(entry => entry.AppInsightName === value);
        setFilteredReliabilityData(filteredData);
    } else {
        // Show all data if no selection is made
        setFilteredReliabilityData(reliabilityData);
    }
};

useEffect(() => {
  if (selectedAppInsight) {
     setFilteredReliabilityData(reliabilityData.filter(entry => entry.AppInsightName === selectedAppInsight));
  } else {
     setFilteredReliabilityData(reliabilityData);
  }
}, [selectedAppInsight, reliabilityData]);

  useEffect(() => {
    //console.log("useEffect Triggered - AppName:", AppName, "Date:", date);
    if (!date || (!date.startDate && !date.endDate)) {
        return;
    }
    fetchExceptionsData("yes");
    fetchExceptionsData("no");
    fetchReliabilityData("no");

}, [date]); 


  return (
    <Grid container m={2} p={2} justifyContent="center" alignItems="flex-start" sx={{ borderRadius: 10, backgroundColor: "none"}}>
      <Grid container xs={12} pb={3} alignItems="center">
        <Grid item> 
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', paddingRight: 3, height: '100%' }}>
                        <Box sx={{ width: 70, height: 70, borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'linear-gradient(to bottom, rgb(70, 150, 58,0.5), white)' }}>
                            <img src={LocationIcon} alt="Server Status Icon" style={{ width: '50%', height: '50%' }} />
                        </Box>
                    </Box>
        </Grid>
        <Grid item>
          <Typography sx={{ fontWeight: "bolder", fontSize: 24, color: "#162660" }}>
            {AppName?.toUpperCase() || "APPLICATION NAME"}
          </Typography>
       </Grid>
      </Grid>
      <Grid xs={12} pb ={3}>
                <Typography sx={{fontWeight:'bolder', fontSize: 24, color : '#162660'}}>App Exceptions</Typography>
      </Grid>

      <Grid container spacing={2}>
        {/* Total Exceptions Card */}
        <Grid item xs={12} md={3}>
          <Card sx={{ height: 190, borderRadius: 3, display: 'flex' }}>
            <CardContent sx={{ flexGrow: 1 }}>
              <Typography sx={{ pl: 2, pt: 1, fontWeight: 'bolder', fontSize: 20, color: '#7E92A2' }}>Total Exceptions</Typography>
              <Grid container alignItems="center">
                {loading ? (
                  <CircularProgress sx={{ '& .MuiCircularProgress-circle': { strokeWidth: '2px' } }} />
                ) : totalExceptions === "NA" ? (
                  <Typography sx={{ pl: 2, pt: 1, fontSize: 48, fontWeight: 'bolder', color: 'grey' }}>
                    0
                  </Typography>
                ) : (
                  <Typography sx={{ pl: 2, pt: 1, fontSize: 48, fontWeight: 'bolder', color: 'grey' }}>
                    {totalExceptions}
                  </Typography>
                )}
              </Grid>
            </CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', pr: 3, height: '100%' }}>
              <Box sx={{ width: 90, height: 90, borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', 
                  background: 'linear-gradient(to bottom, rgba(74, 217, 145, 0.4), white)' }}>
                  <img src={ServerStatusIcon} alt="Server Status Icon" style={{ width: '100%', height: '100%' }} />
              </Box>
            </Box>
          </Card>
        </Grid>

        {/* Impacted Users Card */}
        <Grid item xs={12} md={3}>
          <Card sx={{ height: 190, borderRadius: 3, display: 'flex' }}>
            <CardContent sx={{ flexGrow: 1 }}>
              <Typography sx={{ pl: 2, pt: 1, fontWeight: 'bolder', fontSize: 20, color: '#7E92A2' }}>Impacted Users</Typography>
              <Grid container alignItems="center">
                {loading ? (
                  <CircularProgress sx={{ '& .MuiCircularProgress-circle': { strokeWidth: '2px' } }} />
                ) : impactedUsers === "NA" ? (
                  <Typography sx={{ pl: 2, pt: 1, fontSize: 48, fontWeight: 'bolder', color: 'grey' }}>
                    0
                  </Typography>
                ) : (
                  <Typography sx={{ pl: 2, pt: 1, fontSize: 48, fontWeight: 'bolder', color: 'grey' }}>
                    {impactedUsers}
                  </Typography>
                )}
              </Grid>
            </CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', pr: 3, height: '100%' }}>
              <Box sx={{ width: 90, height: 90, borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', 
                  background: 'linear-gradient(to bottom, rgba(74, 217, 145, 0.4), white)' }}>
                  <img src={EventLogsIcon}  alt="Server Status Icon" style={{ width: '100%', height: '100%' }} />
              </Box>
            </Box>
          </Card>
        </Grid>

        {/* Distinct Type Count Card */}
        <Grid item xs={12} md={3}>
          <Card sx={{ height: 190, borderRadius: 3, display: 'flex' }}>
            <CardContent sx={{ flexGrow: 1 }}>
              <Typography sx={{ pl: 2, pt: 1, fontWeight: 'bolder', fontSize: 20, color: '#7E92A2' }}>
                Unique Exceptions
              </Typography>
              <Grid container alignItems="center">
                {loading ? (
                  <CircularProgress sx={{ '& .MuiCircularProgress-circle': { strokeWidth: '2px' } }} />
                ) : distinctTypeCount === "NA" ? (
                  <Typography sx={{ pl: 2, pt: 1, fontSize: 48, fontWeight: 'bolder', color: 'grey' }}>
                    0
                  </Typography>
                ) : (
                  <Typography sx={{ pl: 2, pt: 1, fontSize: 48, fontWeight: 'bolder', color: 'grey' }}>
                    {distinctTypeCount}
                  </Typography>
                )}
              </Grid>
            </CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', pr: 3, height: '100%' }}>
                <Box sx={{ width: 90, height: 90, borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', 
                    background: 'linear-gradient(to bottom, rgba(74, 217, 145, 0.4), white)' }}>
                    <img src={ServerStatusIcon} alt="Server Status Icon" style={{ width: '100%', height: '100%' }} />
                </Box>
            </Box>
          </Card>
        </Grid>
        {/* <Grid item xs={12} md={3}></Grid> */}
      </Grid>

      <Grid container justifyContent="flex-start" sx={{ mt: 3, pr :3 }}>
  <Grid item xs={12} md={12}>
    <Paper sx={{ padding: 1, boxShadow: 3, borderRadius: 2 }}>
      {tableLoading ? (
        <CircularProgress sx={{ display: 'block', margin: 'auto' }} />
      ) : detailedData.length === 0 ? (
        <Typography sx={{ pl: 2, pt: 1, fontSize: 20, color: 'grey' }}>
          No exception Information Available
        </Typography>
      ) : (
        <TableContainer sx={{ width: '100%', mr :3 }}>
          <Table sx={{ minWidth: 650 }} aria-label="detailed data table">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', width: '20%' }}>Time Generated</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: '20%' }}>AppInsight Name</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: '20%' }}>Outer Message</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: '20%' }}>Total Exceptions</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: '10%' }}>Problem ID</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: '10%' }}>Type</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {detailedData.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((row, index) => (
                <TableRow key={index}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{row.TimeGenerated}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{row.AppInsightName}</TableCell>
                  <TableCell
                    sx={{
                      wordWrap: 'break-word',
                      whiteSpace: 'normal',
                      maxWidth: '200px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {row.OuterMessage}
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{row.TotalException}</TableCell>
                  <TableCell
                    sx={{
                      fontSize: '0.9rem',
                      wordWrap: 'break-word',
                      whiteSpace: 'normal',
                      maxWidth: '200px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {row.ProblemId}
                  </TableCell>
                  <TableCell
                    sx={{
                      fontSize: '0.9rem',
                      wordWrap: 'break-word',
                      whiteSpace: 'normal',
                      maxWidth: '200px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {row.Type}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <TablePagination
            rowsPerPageOptions={[]}
            component="div"
            count={detailedData.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={(event, newPage) => setPage(newPage)}
          />
        </TableContainer>
      )}
    </Paper>
  </Grid>
</Grid>

      {reliabilityData.length > 0 && 
      (<Grid xs={12} pb ={3} sx={{ mt: 3 }}>
                <Typography sx={{fontWeight:'bolder', fontSize: 24, color : '#162660'}}>App Reliability</Typography>
            </Grid>
      )}
{reliabilityData.length > 0 && 
(<Grid container item xs={12} md={12} justifyContent="center" alignItems="center" spacing={2} sx={{ mb: 1.5 }}>
    <Grid item md={4} sx={{ backgroundColor: '#FFFFFF', padding: 1, borderRadius: 10, width: '100%' }}>
        <Autocomplete
            id="app-insight-filter"
            options={[...new Set(reliabilityData.map(entry => entry.AppInsightName))]} // Get unique AppInsightNames
            getOptionLabel={(option) => option}
            onChange={(event, value) => handleAppInsightFilterChange(event, value, "AppInsightName")}
            value={selectedAppInsight}
            clearOnEscape
            renderInput={(params) => (
                <TextField
                    {...params}
                    variant="standard"
                    placeholder="Select Application Name"
                    fullWidth
                    InputLabelProps={{
                        style: { color: '#003399', fontWeight: '500', fontSize: 16, textAlign: 'center' } 
                    }}
                    InputProps={{
                        ...params.InputProps,
                        disableUnderline: true,
                        sx: { 
                            color: '#003399', 
                            fontSize: 20, 
                            textAlign: 'center', 
                            '& .MuiInputBase-input': { color: '#003399', textAlign: 'center' },
                            '&::placeholder': { opacity: 1, color: '#003399' }, 
                            '&:hover:not(.Mui-disabled)::before': { borderBottom: 'none' }, 
                            '&::before': { borderBottom: 'none' }, 
                            '& svg': { color: '#003399' }
                        },
                    }}
                />
            )}
        />
    </Grid>
</Grid>)}
<Grid container xs={12} m={2} justifyContent='center'>
    {filteredReliabilityData.length > 0 && (
        <AreaLineChart
            type="appreliability"
            data={Object.values(
                filteredReliabilityData.reduce((acc, item) => {
                    const key = item.time; // Group by timestamp
                    const app = item.AppInsightName;

                    if (!acc[key]) {
                        acc[key] = { name: key }; // Initialize timestamp object
                    }

                    if (!acc[key][app]) {
                        acc[key][app] = { sum: 0, count: 0 }; // Track sum & count for averaging
                    }

                    acc[key][app].sum += item.reliability;
                    acc[key][app].count += 1;

                    return acc;
                }, {})
            ).map(entry => {
                // Convert sum/count into actual average values
                Object.keys(entry).forEach(key => {
                    if (key !== "name") {
                        entry[key] = entry[key].sum / entry[key].count; // Average calculation
                    }
                });
                return entry;
            })}
            yAxisLabel="Reliability %"
            key="reliabilityChart"
        />
    )}
</Grid>

    </Grid>
  );
}

export default AppMonitoringDashboard;