import React,{ useEffect, useRef, useState } from 'react';
import { styled } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid';
import CardComponent from '../../../../shared/CardComponent/CardComponent';
import { Typography } from '@mui/material';
import SingleCard from '../../../../shared/SingleCard/SingleCard';
import LineChart from '../../Graphs/LineChart';
import DoubleCard from '../../../../shared/DoubleCard/DoubleCard'


const Item = styled(Paper)(({ theme }) => ({
  backgroundColor: theme.palette.mode === 'dark' ? '#1A2027' : '#fff',
  ...theme.typography.body2,
  padding: theme.spacing(1),
  textAlign: 'center',
  color: theme.palette.text.secondary,
}));

function AppsTelemetry() {
    const chartContainerRef = useRef(null);

    var [kpiData, setKpiData] = useState({
      "Availability":"NA",
      "Reliability": "NA",
      "Performance":"NA"
    })
    var [servicesData, setServicesData] = useState({})
    var [interfacesData, setInterfacesData] = useState({})
    var [incidentData, setincidentData] = useState({})
    var [servicesAvailabilityData, setServicesAvailabilityData] = useState({})
    var [interfacesAvailabilityData, setInterfacesAvailabilityData] = useState({})

    //Fetching Services Data
    var fetchServicesData = (page, limit, aggregate) => {
      var params = {
        page: page,
        limit: limit,
        aggregate: aggregate
      };
      var url = new URL('http://127.0.0.1:5000/serviceLogs');
      url.search = new URLSearchParams(params).toString();
      
      fetch(url)
        .then((response) => response.json())
        .then((data) => {
          console.log(data);
          //.map((d)=> new Date(d))
          setServicesAvailabilityData({
            "TimeGenerated" : data["services"]["TimeGenerated"],
            "Availability": data["services"]["Availability"]
        })
      })
        .catch((error) => console.error('Error:', error));
    };

    //Fetching Interfaces Data
    var fetchInterfacesData = (page, limit, aggregate) => {
      var params = {
        page: page,
        limit: limit,
        aggregate: aggregate
      };
      var url = new URL('http://127.0.0.1:5000/interfaceLogs');
      url.search = new URLSearchParams(params).toString();
      
      fetch(url)
        .then((response) => response.json())
        .then((data) =>{ 
          console.log(data);
          setInterfacesAvailabilityData({
            "TimeGenerated" : data["interfaces"]["TimeGenerated"],
            "Availability": data["interfaces"]["Availability"]
        })
      })
        .catch((error) => console.error('Error:', error));
    };

    //Fetching Incident Data
    var fetchIncidentsData = (page, limit, aggregate, miBool) => {
      var params = {
        page: page,
        limit: limit,
        aggregate: aggregate,
        miBool: miBool
      };
      var url = new URL('http://127.0.0.1:5000/incidentLogs');
      url.search = new URLSearchParams(params).toString();
      console.log(url);
      fetch(url)
        .then((response) => response.json())
        .then((data) => console.log(data))
        .catch((error) => console.error('Error:', error));
    };

    //Fetching KPI Data
    var fetchKpiData = () => {
      console.log("hello")
      var url = new URL('http://127.0.0.1:5000/appsTelemetry');
      console.log(url);
      fetch(url)
        .then((response) => response.json())
        .then((data) =>{ 
          setKpiData(data["KpiData"])
          setincidentData(data["Incidents Data"])
          setServicesData(data["Services Data"])
          setInterfacesData(data["Interfaces Data"])
          console.log(data)
        })
        .catch((error) => console.error('Error:', error));
    };

    useEffect(() => {
        fetchServicesData(-1,1,"no")
        fetchInterfacesData(-1,1,"no")
        fetchIncidentsData(-1,1,"no","no")
        fetchKpiData()
        // Dummy data for testing
        const dummyData = [
          { Date: new Date('2022-01-01'), Close: 100 },
          { Date: new Date('2022-01-02'), Close: 150 },
          { Date: new Date('2022-01-03'), Close: 120 },
          // Add more data as needed
        ];
    
        // Create the chart using the dummy data
        const chartSvg = LineChart(dummyData);
        // Append the chart SVG to the component's container
        
          chartContainerRef.current.appendChild(chartSvg);
      }, []); 
      
    return (
      <Box sx={{ flexGrow: 1 }}>
      <Grid container spacing={2}>
        <Grid item xs={8}>
            
          <Item>
            <Typography>KPI</Typography>
            <Grid container spacing={2}>
                <Grid item xs={4}><SingleCard value={kpiData["Availability"]}/></Grid>
                <Grid item xs={8} ref={chartContainerRef}></Grid>
                <Grid item xs={4}><SingleCard value={kpiData["Reliability"]}/></Grid>
                <Grid item xs={8}ref={chartContainerRef}></Grid>
                <Grid item xs={4}><SingleCard value={kpiData["Performance"]}/></Grid>
                <Grid item xs={8} ref={chartContainerRef}></Grid>
            </Grid>
        </Item>
        </Grid>
        <Grid item xs={4}>
          <Item>xs=4</Item>
        </Grid>
        <Grid item xs={7}>
          <Item><CardComponent data={incidentData} heading='Incidents'/></Item>
        </Grid>
        <Grid item xs={3}>
          <Item><DoubleCard cardHeader="App Insights"
              header1="Header 1"
              value1="Value 1"
              header2="Header 2"
              value2="Value 2"/></Item>
        </Grid>
        <Grid item xs={2}>
          <Item><DoubleCard cardHeader="Users"
              header1="Header 1"
              value1="Value 1"
              header2="Header 2"
              value2="Value 2"/></Item>
        </Grid>
      </Grid>
    </Box>
    )
  }

export default AppsTelemetry