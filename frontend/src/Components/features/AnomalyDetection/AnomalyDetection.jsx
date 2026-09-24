import React, { useEffect,useState } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Grid from '@mui/material/Grid';
import InputAdornment from '@mui/material/InputAdornment';
import SearchIcon from '@mui/icons-material/Search';
import Paper from '@mui/material/Paper';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import LineGraph from '../../shared/LineChart/LineChart';
import { DataGrid } from '@mui/x-data-grid';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
    background: {
      default: '#f4f6f8',
    },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: '#00338e',
          color: '#fff',
          borderRadius: '12px',
          boxShadow: '0 4px 10px rgba(0, 0, 0, 0.2)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(0, 51, 142, 0.1)',
          borderRadius: '12px',
          overflow: 'hidden', // Prevents horizontal scrollbar
        },
      },
    },
  },
});

const AnomalyDetection = () => {
  const [anomalyRows, setAnomalyRows] = useState([]);
  const [anomaliesData, setAnomaliesData] = useState({ServerList:[], PeakValList:[]});

  const fetchAnomaliesDetectionData = () => {
    const params = {};
    const url = new URL('http://127.0.0.1:5000//anomaliesList');
    url.search = new URLSearchParams(params).toString();

    fetch(url)
      .then((response) => response.json())
      .then((data) => {
        console.log('API Response:', data); // Log the entire response
        if (data.anomaliesList) {
          try {
            const AnomalyList_data = JSON.parse(data.anomaliesList);
            console.log('Parsed anomaliesList:', AnomalyList_data); // Log the parsed data

            // Check if the parsed data is an object
            if (typeof AnomalyList_data === 'object' && AnomalyList_data !== null) {
              // Assuming each field contains objects with numbered keys
              const numItems = Object.keys(AnomalyList_data.SubscriptionId).length;
              const anomalyArray = Array.from({ length: numItems }, (_, index) => ({
                id: index, // Using index as a unique identifier
                serverName: AnomalyList_data.ServerName[index] || '',
                SubscriptionId: AnomalyList_data.SubscriptionId[index] || '',
                ResourceGroup: AnomalyList_data.ResourceGroup[index] || '',
                PeakTime: new Date(AnomalyList_data.PeakTime[index]).toLocaleString() || '',
                PeakValue: AnomalyList_data.PeakValue[index] || '',
                AnomalyType: AnomalyList_data.AnomalyType[index] || '',
              }));
              console.log('Anomaly Array:', anomalyArray); // Log the anomaly array
              setAnomalyRows(anomalyArray);
            } else {
              console.error('Parsed anomaliesList is not an object:', AnomalyList_data);
              setAnomalyRows([]);
            }
          } catch (error) {
            console.error('Failed to parse anomaliesList JSON:', error);
            setAnomalyRows([]);
          }
        } else {
          console.error('anomaliesList not found in the response data:', data);
          setAnomalyRows([]);
        }
      })
      .catch((error) => {
        console.error('Error fetching anomalies data:', error);
      });
  };

  const fetchAnomaliesInfo = async () => {
    try {
      const response = await fetch('http://127.0.0.1:5000/anomaliesInfo'); 
      const data = await response.json();
      setAnomaliesData(data);
    } catch (error) {
      console.error('Error fetching anomalies info:', error);
    }
  };

  useEffect(() => {
    fetchAnomaliesDetectionData();
    fetchAnomaliesInfo();
  }, []);

  const columns = [
    { field: 'serverName', headerName: 'Server Name', width: 250 },
    { field: 'SubscriptionId', headerName: 'Subscription ID', width: 250 },
    { field: 'ResourceGroup', headerName: 'Resource Group', width: 250 },
    { field: 'PeakTime', headerName: 'Peak Time', width: 200 },
    { field: 'PeakValue', headerName: 'Peak Value', width: 150 },
    { field: 'AnomalyType', headerName: 'Anomaly Type', width: 200 },
  ];
    
    
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box sx={{ width: '100%', padding: 3 }}>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6} md={4}>
              <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <TextField
                  label="Filter by Server Name"
                  variant="outlined"
                  fullWidth
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon />
                      </InputAdornment>
                    ),
                  }}
                  sx={{ marginBottom: 2 }}
                />
                <Card sx={{ flex: 1, marginBottom: 2 }}>
                  <CardContent>
                    <Typography variant="h6" component="div">
                      Servers Spiked
                    </Typography>
                    <Typography variant="h4" component="div">
                    {anomaliesData.SpikedCount}
                    </Typography>
                    <Typography variant="subtitle1">
                      {/* out of 0 servers */}
                    </Typography>
                  </CardContent>
                </Card>
                <Card sx={{ flex: 1 }}>
                  <CardContent>
                    <Typography variant="h6" component="div">
                      Avg Peak Value
                    </Typography>
                    <Typography variant="h4" component="div">
                    {anomaliesData.AvgPeakVal}
                    </Typography>
                  </CardContent>
                </Card>
              </Box>
            </Grid>
            <Grid item xs={12} sm={6} md={8}>
              <Paper elevation={3} sx={{ height: '100%', backgroundColor: '#fff' }}>
                {/* <LineGraph dataX={anomaliesData.ServerList} dataY={anomaliesData.PeakValList} label="ServerData" /> */}
                <LineGraph dataX={[]} dataY={[]} label="ServerData" />
              </Paper>
            </Grid>
          </Grid>
          <Box sx={{ width: '100%', mt: 3 }}>
            <Paper elevation={3}>
            <DataGrid 
          rows={anomalyRows} 
          columns={columns} 
          pageSize={5} 
          autoHeight 
          disableColumnMenu
          disableSelectionOnClick
        />
            </Paper>
          </Box>
        </Box>
      </ThemeProvider>
    );
  }
export default AnomalyDetection;




 
