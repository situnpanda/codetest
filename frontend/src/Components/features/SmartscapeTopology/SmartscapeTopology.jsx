import React, { useState, useEffect, useRef } from 'react'
import {useLocation } from 'react-router-dom';
import Grid from '@mui/material/Unstable_Grid2';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import NetworkGraph from '../../shared/NetworkGraph/NetworkGraph'
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import CardMedia from '@mui/material/CardMedia';
import Button from '@mui/material/Button';
import AreaLineChart from '../../shared/LineChart/AreaLineChart'
import BarGraph from '../../shared/BarChart/BarChart'
import Graph from 'react-vis-network-graph'
import serverImage from '../../Static/Images/serverImage.jpg'
import winServiceImage from '../../Static/Images/winServiceImage.png'
import CpInterfaceImage from '../../Static/Images/CpInterfaceImage.jpg'
import Alert from '@mui/material/Alert';
import { CardHeader, List, ListItem, Modal } from '@mui/material';
import CircleIcon from '@mui/icons-material/Circle';
import RadioButtonCheckedOutlinedIcon from '@mui/icons-material/RadioButtonCheckedOutlined';
import Tooltip from '@mui/material/Tooltip';
import InfoIcon from '@mui/icons-material/Info';
import { keyframes } from '@mui/material';
import {getUrl} from '../../../environment'

function SmartscapeTopology({
  date, appInsights
}) {
    var baseUrl =  getUrl()
    var location = useLocation()
  

    var [serverCpuUtilization, setServerCpuUtilization] = useState({})
    var [serverMemoryUtilization, setServerMemoryUtilization] = useState({})
    var [serverDiskUtilization, setServerDiskUtilization] = useState({})

    var [incidentData, setIncidentData] = useState({})
    var [changeRequestData, setChangeRequestData] = useState({})
    var [servicesData, setServicesData] = useState({})
    var [anomaliesData, setAnomaliesData] = useState({})
    var [anomaliesChart, setAnomaliesChart] = useState({})
    var [alertsData, setAlertsData] = useState({})

    var [alertsChart, setAlertsChart] = useState({})
    var [threshold, setThreshold] = useState({'cpu' : 80, 'memory': 80, 'disk': 80});

    var [loading, setLoading] = useState({
      "serverCpuUtilization" : true,
      "serverMemoryUtilization": true,
      "serverDiskUtilization" : true,
      "incidentLogs" : true,
      "changeRequestLogs": true,
      "serviceLogs" : true,
      "anomalyLogs" : true,
      "alertLogs" : true,
    });

    var [modalTourOpen, setModalTourOpen] = useState(false)

    var [graphData, setGraphData] = useState({
      "nodes":[],
      "edges":[]
    })
    var [filterChosen, setFilterChosen] = useState("Aria")
    var filterValue = "Aria"
    var [filterData, setFilterData] = useState({
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
    });

    var [filterOptions, setFilterOptions] = useState({
      "appFamily": [
        "ARIA"
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
    });
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
    

    useEffect(()=>{
      // //console.log("Date")
      // //console.log(date)
      setLoading({
        "serverCpuUtilization" : true,
        "serverMemoryUtilization": true,
        "serverDiskUtilization" : true,
        "incidentLogs" : true,
        "changeRequestLogs": true,
        "serviceLogs" : true,
        "anomalyLogs" : true,
        "alertLogs" : true,
      })
      // setFilterData()
      setFilterOptions(filterOptions)
      fetchFilterData({
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
      });

      if(localStorage.getItem("SmartscapeTour_SmartscapeTopology")==null){
        setModalTourOpen(true)
      }

    },[])

    useEffect(() => {
      if (threshold["cpu"] >= 50 && threshold["cpu"] <= 100 &&threshold["memory"] >= 50 && threshold["memory"] <= 100 &&threshold["disk"] >= 50 && threshold["disk"] <= 100  && date["startDate"] !== "") {
        
        // Reset charts and data
        setGraphData({});
        setAlertsChart({});
        setAnomaliesChart({});
  
        // Fetch data with the updated threshold
        fetchServicesData("no");
        fetchCpuUtilizationData(-1, 10, "yes", "", threshold);  // Use threshold here
        fetchMemoryUtilizationData(-1, 10, "yes", "", threshold);  // Use threshold here
        fetchDiskUtilizationData(-1, 10, "yes", "", threshold);  // Use threshold here
        fetchAnomaliesData("yes");
      }
    }, [filterOptions, date, threshold]);
    
    
    useEffect(()=>{
      // //console.log(loading)
      if(!(loading["serverCpuUtilization"] || loading["serverMemoryUtilization"] || loading["serverDiskUtilization"] 
      || loading["serviceLogs"])){

        var nodes=[{id:1,label:filterChosen, shape:"box", margin:10, size:10, color:{background:"white"}, x: 0, y: 0}]
        var edges =[]
        
        var idVal = 2

        
        var serverUtilization = {}

        Object.keys(servicesData["ServerName"]).map((ind)=>{
          if(servicesData["ServerName"][ind] in serverUtilization && servicesData["Status"][ind]!="Running"){
            if(servicesData["ServiceName"][ind] in serverUtilization[servicesData["ServerName"][ind]]){
              serverUtilization[servicesData["ServerName"][ind]][servicesData["ServiceName"][ind]]["TimeGenerated"].push(servicesData["TimeGenerated"][ind])
            }
            else{
              serverUtilization[servicesData["ServerName"][ind]][servicesData["ServiceName"][ind]] = {"TimeGenerated" : [servicesData["TimeGenerated"][ind]]}
            }
          }
          else if(servicesData["Status"][ind]!="Running"){
            serverUtilization[servicesData["ServerName"][ind]] = {[servicesData["ServiceName"][ind]]: {"TimeGenerated" : [servicesData["TimeGenerated"][ind]]}}
          }
        })
        // //console.log(serverCpuUtilization)
        Object.keys(serverCpuUtilization["ServerName"]).map((ind)=>{
          if(serverCpuUtilization["ServerName"][ind] in serverUtilization){
            serverUtilization[serverCpuUtilization["ServerName"][ind]]["CPU Utilization"] = {"Spike Frequency":serverCpuUtilization["Frequency"][ind], "Max Utilization":serverCpuUtilization["MaxUtiliztion"][ind]}
          }
          else{
            serverUtilization[serverCpuUtilization["ServerName"][ind]] = {"CPU Utilization": {"Spike Frequency":serverCpuUtilization["Frequency"][ind], "Max Utilization":serverCpuUtilization["MaxUtiliztion"][ind]}}
          }
          
        })

        Object.keys(serverMemoryUtilization["ServerName"]).map((ind)=>{
          if(serverMemoryUtilization["ServerName"][ind] in serverUtilization){
            serverUtilization[serverMemoryUtilization["ServerName"][ind]]["Memory Utilization"] = {"Spike Frequency":serverMemoryUtilization["Frequency"][ind], "Max Utilization":serverMemoryUtilization["MaxUtiliztion"][ind]}
          }
          else{
            serverUtilization[serverMemoryUtilization["ServerName"][ind]] = {"Memory Utilization": {"Spike Frequency":serverMemoryUtilization["Frequency"][ind], "Max Utilization":serverMemoryUtilization["MaxUtiliztion"][ind]}}
          }
        })

        Object.keys(serverDiskUtilization["ServerName"]).map((ind)=>{
          if(serverDiskUtilization["ServerName"][ind] in serverUtilization){
            serverUtilization[serverDiskUtilization["ServerName"][ind]]["Disk Utilization"] = {"Spike Frequency":serverDiskUtilization["Frequency"][ind], "Max Utilization":serverDiskUtilization["MaxUtiliztion"][ind]}
          }
          else{
            serverUtilization[serverDiskUtilization["ServerName"][ind]] = {"Disk Utilization": {"Spike Frequency":serverDiskUtilization["Frequency"][ind], "Max Utilization":serverDiskUtilization["MaxUtiliztion"][ind]}}
          }
        })

        // //console.log(serverUtilization)

        var position = [[200,0],[-200,0],[0,-200],[0,200],[250,-250],[-250,-250],[-250,250],[250,250],[250,-500],[-250,-500],[-250,500],[250,500]]
        var size = 12
        var currentHeight = 500
        while(Object.keys(serverUtilization).length>size){
          position.push([250,-1*(currentHeight)-250])
          position.push([-250,-1*(currentHeight)-250])
          position.push([-250,(currentHeight)+250])
          position.push([250,(currentHeight)+250])
          size+=4
          currentHeight = currentHeight+250
        }
        Object.keys(serverUtilization).map((ind, index)=>{
          nodes.push({
            id : idVal + ind,
            label: "<b>"+ind+"</b>",//"<b>"+ind+"</b>",
            shape: "image",
            image: serverImage,
            size:20, //changed,
            
            x: position[index][0],
            y: position[index][1]
          })
          edges.push({
            id : idVal + ind,
            from: 1, 
            to: idVal + ind, 
            color:'black', 
            width:1,
            length: 5,
            dashes:true
          })
          var parentId = idVal + ind
          idVal = idVal + 1 

          var childPositions = getChildNodes(position[index][0], position[index][1],Object.keys(serverUtilization[ind]).length)
          //console.log(childPositions.length)
          // //console.log(childPositions)

          Object.keys(serverUtilization[ind]).map((value, indexChild)=>{
            //console.log(indexChild)
            if(value!="CPU Utilization" && value!="Disk Utilization" && value!="Memory Utilization"){
              // //console.log(value)
              var title = "<ul>"
              serverUtilization[ind][value]["TimeGenerated"].map((timeValue, indexTime)=>{
                if(serverUtilization[ind][value]["Status"]!="Running"){
                  title+=("<li>"+timeValue+"</li>")
                }
                
              })
              title+="</ul>"
              //title.slice(0,-2)
              nodes.push({
                id: idVal + ind + value,
                label: value, 
                title : title,
                shape:'image', 
                image:winServiceImage,
                size:20, //changed,
                
                x: childPositions[indexChild][0],
                y: childPositions[indexChild][1]
              })
              // var childPositionsService = getChildNodes(childPositions[indexChild][0], childPositions[indexChild][1])
              // //console.log(childPositionsService)
              
            }
            else if(value=="CPU Utilization" || value=="Memory Utilization" || value=="Disk Utilization"){
              var title = "<ul>"
              Object.keys(serverUtilization[ind][value]).map((utilKey, utilIndex)=>{
                // //console.log(utilKey)
                var label = serverUtilization[ind][value][utilKey]
                title+=("<li>"+utilKey+":"+label.toString()+(utilKey=="Spike Frequency"?"</li>":"%</li>"))
                
              })
              title+="</ul>" 
              nodes.push({
                id: idVal + ind + value,
                label: value.split(" ")[0] + ' Spike', 
                title: title, 
                shape: 'box', 
                margin: 10, 
                color:{background:"white", border:'red'}, 
                size:20, //changed,
                
                x: childPositions[indexChild][0],
                y: childPositions[indexChild][1]
              })
              // var childPositionsUtil = getChildNodes(childPositions[indexChild][0], childPositions[indexChild][1])
              // //console.log(childPositionsUtil)
              
            }
            else{
              nodes.push({
                id: idVal + ind + value,
                label:'>80%', 
                title: value, 
                shape: 'circle', 
                margin: 5, 
                color:{background:"white", border:'red'}, 
                size:20, //changed,
                
                x: childPositions[indexChild][0],
                y: childPositions[indexChild][1]
              })
            }
            edges.push({
              id : idVal + ind + value,
              from: parentId, 
              to: idVal + ind + value, 
              color:'black', 
              width:1,
              length:1
            })

          })
        })

        // //console.log(nodes)
        // //console.log(edges)
        
        setGraphData({
          
          nodes: nodes,
          
          edges: edges
        })
      }
    },[loading])

    

    useEffect(()=>{
      var barChartData={}
      var stackKeys = ["CPU","Memory","Disk","Windows Service"]
      if(Object.keys(alertsData).length>0){
        Object.values(alertsData["AppCI"]).map((val)=>{
          if(!(val in barChartData)){
            barChartData[val] = {"AppCI":val,"CPU":0,"Memory":0,"Disk":0,"Windows Service":0}
          }
        })
        Object.keys(alertsData["AppCI"]).map((key)=>{
          barChartData[alertsData["AppCI"][key]][alertsData["MetricType"][key]] = parseInt(alertsData["AlertFrequency"][key])
        })

        setAlertsChart({"data" : Object.values(barChartData), "y" : stackKeys, "x" : "AppCI"})
      }
      else{
        setAlertsChart({"data" : [], "y" : stackKeys, "x" : "AppCI"})
      }
      
    },[alertsData])

    useEffect(()=>{
      var barChartData={}
      var stackKeys = ["CPU","Memory","Disk"]
      if(Object.keys(anomaliesData).length>0){
        Object.values(anomaliesData["AppCI"]).map((val)=>{
          if(!(val in barChartData)){
            barChartData[val] = {"AppCI":val,"CPU":0,"Memory":0}
          }
        })
        Object.keys(anomaliesData["AppCI"]).map((key)=>{
          barChartData[anomaliesData["AppCI"][key]][anomaliesData["AnomalyType"][key]] = parseInt(anomaliesData["AnomalyFrequency"][key])
        })

        setAnomaliesChart({"data" : Object.values(barChartData), "y" : stackKeys, "x" : "AppCI"})
      }
      else{
        setAnomaliesChart({"data" : [], "y" : stackKeys, "x" : "AppCI"})
      }
      
    },[anomaliesData])


    const getChildNodes = (x,y, count)=>{
      var xType = x<0 ? -125 : 125
      var yType = y<0 ? -125 : 125
      
      var childPositions = []

      if(y==0 || y>0){ //(y!=0 && x!=0)
        childPositions = [[x+xType, y+50], [x+xType, y-yType], [x+xType, y+yType], [x, y+xType]]
        while(childPositions.length<count){
          xType = x<0 ? xType-50 : xType+50
          yType = y<0 ? yType-100 : yType+100
          childPositions.push([x+xType, y-yType])
          childPositions.push([x+xType, y+yType])
        }
      }
      else if(x==0 || y<0){
        childPositions = [[x, y+yType], [x+xType, y+yType], [x-xType, y+yType], [x-yType, y]]
        while(childPositions.length<count){
          xType = x<0 ? xType-50 : xType+50
          yType = y<0 ? yType-100 : yType+100
          childPositions.push([x+xType, y+yType])
          childPositions.push([x-xType, y+yType])
        }
      }
      
      return childPositions
    }

    var fetchFilterData = (params) => {
    
      var url = new URL(baseUrl + 'filters');
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
          ////console.log("Filter Data Response:", data);
          setFilterData(data.Data)
        })
        .catch((error) => console.error('Error:', error));
    };

    // Optimized CPU Utilization Fetch
    var fetchCpuUtilizationData = async (page, limit, aggregate, serverName, threshold) => {
      ////console.log(`Fetching CPU Data with Threshold: ${threshold}`);
      ////console.log(`Filter Options:`, filterOptions); // Check current filter options

      // Reset state and set loading to true
      setServerCpuUtilization({});
      setLoading((prevLoading) => ({
        ...prevLoading,
        "serverCpuUtilization": true,
      }));
      //console.log(threshold)

      var params = {
        page: page,
        limit: limit,
        aggregate: aggregate,
        filters: filterOptions,
        serverName: serverName,
        start_time: date.startDate,
        end_time: date.endDate,
        threshold: threshold["cpu"]
      };

      ////console.log("Request Parameters:", params);

      var url = new URL(baseUrl + 'azureServerMetricsCPUDatalogs');
      url.search = new URLSearchParams(params).toString();
      ////console.log("Request URL:", url);

      fetch(url, {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      })
        .then((response) => response.json())
        .then((data) => {
          ////console.log("CPU Data Response:", data);

          // Optional: Verify if the threshold affects the data (for debugging)
          // if (data.threshold) {
          //   //console.log(`Received Data with Applied Threshold: ${data.threshold}`);
          // } else {
          //   console.warn(`Threshold might not have been applied on the backend.`);
          // }

          // Ensure that data is fetched only for the correct app family
          if (
            params["filters"]["appFamily"][0].toLowerCase() ===
            filterOptions["appFamily"][0].toLowerCase()
          ) {
              if(Object.keys(JSON.parse(data["Data"])).length>0){
                setServerCpuUtilization(JSON.parse(data["Data"]))
              }
              else{
                setServerCpuUtilization({
                  "ServerName" : {}
                })
              }

            setLoading((prevLoading) => ({
              ...prevLoading,
              serverCpuUtilization: false,
            }));
          }
        })
        .catch((error) => {
          console.error("Error Fetching CPU Data:", error);

          if(params["filters"]["appFamily"][0].toLowerCase()==filterChosen.toLowerCase()){
            setServerCpuUtilization({
              "ServerName" : {}
            })
            setLoading(prevLoading=>({
              ...prevLoading,
              "serverCpuUtilization" : false
            }));
          }
        });
    };

    var fetchMemoryUtilizationData = async (page, limit, aggregate, serverName, threshold) => {
      ////console.log(`Fetching Memory Data with Threshold: ${threshold}`);
      ////console.log(`Filter Options:`, filterOptions); // Check current filter options
    
      // Reset state and set loading to true
      setServerMemoryUtilization({});
      setLoading((prevLoading) => ({
        ...prevLoading,
        "serverMemoryUtilization": true,
      }));
      //console.log(threshold)
      var params = {
        page: page,
        limit: limit,
        aggregate: aggregate,
        filters: filterOptions,
        serverName : serverName,
        start_time: date.startDate,
        end_time: date.endDate,
        threshold:threshold["memory"] // Include threshold in the request
      };
    
      ////console.log("Request Parameters:", params);
    
      var url = new URL(baseUrl + 'azureServerMetricsMemoryDatalogs');
      url.search = new URLSearchParams(params).toString();
      ////console.log("Request URL:", url);
    
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
      })
        .then((response) => response.json())
        .then((data) => {
          ////console.log("Memory Data Response:", data);
          ////console.log("Threshold from Response:", data.threshold); 
    
          // if (data.threshold) {
          //   //console.log(`Received Data with Applied Threshold: ${data.threshold}`);
          // } else {
          //   console.warn(`Threshold might not have been applied on the backend.`);
          // }
    
          if (
            params["filters"]["appFamily"][0].toLowerCase() ===
            filterOptions["appFamily"][0].toLowerCase()
          ) {
            if(Object.keys(JSON.parse(data["Data"])).length>0){
              setServerMemoryUtilization(JSON.parse(data["Data"]))
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
          }
            
        })
        .catch((error) => {
          console.error("Error Fetching Memory Data:", error);
    
          if(params["filters"]["appFamily"][0].toLowerCase()==filterChosen.toLowerCase()){
            setServerMemoryUtilization({
              "ServerName" : {}
            })
            setLoading(prevLoading=>({
              ...prevLoading,
              "serverMemoryUtilization" : false
            }));
            
          }
        });
    };
    
    
    var fetchDiskUtilizationData = async (page, limit, aggregate, serverName, threshold = 80) => {
      ////console.log(`Fetching Disk Data with Threshold: ${threshold}`);
      ////console.log(`Filter Options:`, filterOptions); // Check current filter options
    
      // Reset state and set loading to true
      setServerDiskUtilization({});
      setLoading((prevLoading) => ({
        ...prevLoading,
        "serverDiskUtilization": true,
      }));
      //console.log(threshold)
      var params = {
        page: page,
        limit: limit,
        aggregate: aggregate,
        filters: filterOptions,
        serverName : serverName,
        start_time: date.startDate,
        end_time: date.endDate,
        threshold:threshold["disk"] // Include threshold in the request
      };
    
      ////console.log("Request Parameters:", params);
    
      var url = new URL(baseUrl + 'azureServerMetricsDiskDatalogs');
      url.search = new URLSearchParams(params).toString();
      ////console.log("Request URL:", url);
    
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
      })
        .then((response) => response.json())
        .then((data) => {
          ////console.log("Disk Data Response:", data);
    
          // if (data.threshold) {
          //   //console.log(`Received Data with Applied Threshold: ${data.threshold}`);
          // } else {
          //   console.warn(`Threshold might not have been applied on the backend.`);
          // }
    
          if (
            params["filters"]["appFamily"][0].toLowerCase() ===
            filterOptions["appFamily"][0].toLowerCase()
          ) {
            if(Object.keys(JSON.parse(data["Data"])).length>0){
              setServerDiskUtilization(JSON.parse(data["Data"]))
            }
            else{
              setServerDiskUtilization({
                "ServerName" : {}
              })
            }
            
            setLoading(prevLoading=>({
              ...prevLoading,
              "serverDiskUtilization" : false
            }));
          }
        })
        .catch((error) => {
          console.error("Error Fetching Disk Data:", error);
    
          if(params["filters"]["appFamily"][0].toLowerCase()==filterChosen.toLowerCase()){
            setServerDiskUtilization({
              "ServerName" : {}
            })
            setLoading(prevLoading=>({
              ...prevLoading,
              "serverDiskUtilization" : false
            }));
          }
        });
    };
    

    

    var fetchIncidentData = async(aggregate, miBool) => {
      setLoading(prevLoading=>({
        ...prevLoading,
        "incidentLogs" : true
      }));
      var params = {
        aggregate: aggregate,
        filters: filterOptions,
        miBool : miBool,
        start_time: date.startDate,
        end_time: date.endDate
      };
      ////console.log("hello")
      var url = new URL(baseUrl + 'incidentLogs');
      // ////console.log(url);
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
          if(Object.keys(JSON.parse(data["Data"])).length>0){
            setIncidentData(JSON.parse(data["Data"]))
          }
          else{
            setIncidentData({
              "Number":{}
            })
          }
          
          // //console.log(JSON.parse(data["incidents"]))
          setLoading(prevLoading=>({
            ...prevLoading,
            "incidentLogs" : false
          }));
        })
        .catch((error)=>{
          setLoading(prevLoading=>({
            ...prevLoading,
            "incidentLogs" : false
          }));
          //console.log(error)
        })
    }

    var fetchChangeRequestsData = async(aggregate) => {
      setLoading(prevLoading=>({
        ...prevLoading,
        "changeRequestLogs" : true
      }));
      var params = {
        aggregate: aggregate,
        filters: filterOptions,
        start_time: date.startDate,
        end_time: date.endDate
      };
      ////console.log("hello")
      var url = new URL(baseUrl + 'changeRequestLogs');
      // ////console.log(url);
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
          setChangeRequestData(JSON.parse(data["Data"]))
          // //console.log("Change Requests")
          // //console.log(JSON.parse(data["changeRequests"]))
          setLoading(prevLoading=>({
            ...prevLoading,
            "changeRequestLogs" : false
          }));
        })
        .catch((error)=>{
          setLoading(prevLoading=>({
            ...prevLoading,
            "changeRequestLogs" : false
          }));
          //console.log(error)
        })
    }

    var fetchServicesData = async(aggregate) => {
      //console.log(date)
      setLoading(prevLoading=>({
        ...prevLoading,
        "serviceLogs" : true
      }));

      var params = {
        aggregate: aggregate,
        filters: filterOptions,
        start_time: date.startDate,
        end_time: date.endDate
      };

      ////console.log("hello")
      var url = new URL(baseUrl + 'serviceLogs');
      // ////console.log(url);
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
          if(params["filters"]["appFamily"][0].toLowerCase()==filterOptions["appFamily"][0].toLowerCase()){
            if(Object.keys(JSON.parse(data["Data"])).length>0){
              setServicesData(JSON.parse(data["Data"]))
            }
            else{
              setServicesData({
                "ServerName":{}
              })
            }
            setLoading(prevLoading=>({
              ...prevLoading,
              "serviceLogs" : false
            }))
            // //console.log("Services Data")
            // //console.log(JSON.parse(data["ServicesData"]))
          }
        })
        .catch((error)=>{
          if(params["filters"]["appFamily"][0].toLowerCase()==filterChosen.toLowerCase()){
            //console.log(error)
            setServicesData({
              "ServerName":{}
            })
            setLoading(prevLoading=>({
              ...prevLoading,
              "serviceLogs" : false
            }))
          }
          
        })

    }

    var fetchAnomaliesData = async(aggregate) => {
      setLoading(prevLoading=>({
        ...prevLoading,
        "anomalyLogs" : true
      }));
      var params = {
        aggregate: aggregate,
        filters: filterOptions,
        start_time: date.startDate,
        end_time: date.endDate
      };
      ////console.log("hello")
      var url = new URL(baseUrl + 'infraAnomalies');
      // ////console.log(url);
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
          setAnomaliesData(JSON.parse(data["Data"]))
          // //console.log("Anomalies Data")
          // //console.log(JSON.parse(data["AnomaliesData"]))
        })
        .catch((error)=>console.log(error))
        setLoading(prevLoading=>({
          ...prevLoading,
          "anomalyLogs" : false
        }));
    }

    var fetchAlertsData = async(aggregate) => {
      setLoading(prevLoading=>({
        ...prevLoading,
        "alertLogs" : true
      }));
      var params = {
        aggregate: aggregate,
        filters: filterOptions,
        start_time: date.startDate,
        end_time: date.endDate
      };
      ////console.log("hello")
      var url = new URL(baseUrl + 'infraAlerts');
      // ////console.log(url);
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
          setAlertsData(JSON.parse(data["Data"]))
          // //console.log("Alerts Data")
          // //console.log(JSON.parse(data["AlertsData"]))
        })
        .catch((error)=>console.log(error))

        setLoading(prevLoading=>({
          ...prevLoading,
          "alertLogs" : false
        }));
    }


    const handleFilterChange = (event, newValue,filterType) => {
      //console.log("Filter Change")
      ////console.log(newValue)
      // setGraphData({})
      // setAlertsChart({})
      if(newValue==null || newValue==""){
        // //console.log(newValue)
        ////console.log("I am here")
        newValue=["All"]
        // setFilterChosen(null)
      }
      else{
        ////console.log(newValue)
        setFilterChosen(newValue)
        filterValue = newValue
        newValue=[newValue]
        if(Array.isArray(newValue)){
          ////console.log("I am hereee")
          setFilterOptions(prevFilter=>({
            ...prevFilter,
            [filterType] : newValue
          }))
        }
      }
      
    }

    var ThresholdFilters = ({type}) => {
      //console.log(threshold[type], type)

      var [value, setValue] = useState(threshold[type])
      var updateThreshold = (val)=>{
          
          setThreshold((prevState)=>({
            ...prevState,
            [type] : val
          }))
          
      }
      return(
        <Grid item md={1} m={1}>
              <TextField
                id="threshold-input"
                variant="standard"
                label={`${type.charAt(0).toUpperCase() + type.slice(1)} Threshold`}
                placeholder="Enter the threshold value"
                defaultValue={threshold[type] || ""} // Allow empty input
                onChange={(event) => {
                  const inputValue = event.target.value;
                  //console.log(inputValue)
                  setValue(inputValue)
                  // Allow empty input or valid numbers between 0-9
                  if (inputValue != "" && (/^[0-9]*$/.test(inputValue) && inputValue >= 50 && inputValue <= 100)) {
                    //console.log(inputValue)
                    //setThreshold(inputValue); // Set value as string temporarily
                    updateThreshold(inputValue)
                  }
                }}
                onBlur={(event) => {
                  const inputValue = event.target.value;
                  const numericValue = parseInt(inputValue, 10);
                  
                  if (inputValue === "") {
                    //console.log("Threshold value is required.");
                  } else if (numericValue < 50 || numericValue > 100) {
                    //console.log("Threshold must be between 50 and 100.");
                  } else {
                    updateThreshold(numericValue); // Store as number if valid
                    setValue(inputValue)
                  }
                }}
                error={value == '' && parseInt(value, 10) < 50 && parseInt(value, 10) > 100}
                helperText={
                  
                    !value
                    ? "Threshold value is required."
                    : parseInt(value, 10) < 50 || parseInt(value, 10) > 100
                    ? "Threshold must be between 50 and 100."
                    : ""
                }
              
      
                InputProps={{
                  inputProps: { min: 50, max: 100 }, // Allow only numbers
                  endAdornment: (
                    <Tooltip title="This threshold is used to filter servers with utilization above the selected value.">
                      <InfoIcon style={{ color: "#0d47a1", cursor: "pointer", marginLeft: 8 }} />
                    </Tooltip>
                  ),
                }}
                FormHelperTextProps={{
                  style: { color: "red", marginTop: "4px" },
                }}
                fullWidth
              />
              <div style={{ marginTop: 4, color: "#6b6b6b", fontSize: "12px" }}>
                * Must be between 50% -100%
              </div>
            </Grid>
      )

    }

    // const handleThresholdChange = (newThreshold) => {
    //   if (newThreshold == null) {
    //     //console.log('Threshold is null, assigning 80');
    //     newThreshold = 80; // Default threshold
    //   }
    
    //   //console.log(`Threshold updated to: ${newThreshold}`);
    //   setThreshold(newThreshold); // Update the state and trigger useEffect
    // };
    
    
    
    var CreateTourCard = () => {
      const style = {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 600,
        bgcolor: 'background.paper',
        boxShadow: 24,
        p: 0,
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '80vh',
      };
      const colorChange = keyframes`
        0% {
          color: blue;
        }
        50% {
          color: red;
        }
        100% {
          color: green;
        }
      `;
      var handleDisplay = () =>{
        localStorage.setItem("SmartscapeTour_SmartscapeTopology","false")
        handleModalTourClose()
      }
      // { maxWidth: 600, maxHeight: 600}
      return(
        <Card sx={style}>
          <Grid container xs={12} mb={1} p={2} justifyContent="center" alignItems="center" sx={{backgroundColor:"primary.main", position:"sticky"}}>
            <Typography gutterBottom variant="h5" component="div" sx={{color:"white"}}>
                Welcome to the i-Telemetry <strong>Smartscape</strong>!
            </Typography>
          </Grid>
          <div style={{overflowY:"auto", flexGrow: 1}}>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Smartscape provides a node-based visualization of an application's health, highlighting impacted areas in red. It offers proactive insights by tracking infrastructure utilization spikes, service dips, and daily alert counts. Support teams can swiftly identify and address issues, ensuring optimal application performance. Enhance operational efficiency with Smartscape!
              </Typography>
              <Divider sx={{borderColor: 'black'}}/>
              <Grid container xs={12} mt={1}>
              <Typography variant="h6" sx={{animation: `${colorChange} 2s infinite`}}><i>New Feature</i></Typography>
                <List>
                  <ListItem>
                    <Typography>
                      <RadioButtonCheckedOutlinedIcon fontSize="0.25px"/>  <strong>Custom Threshold </strong>can now be set based on caregiver's choice.
                    </Typography>
                  </ListItem>
                  
                </List>
                <Typography variant="h6"><i>Fetaures & Thresholds</i></Typography>
                <List>
                  <ListItem>
                    <Typography>
                      <RadioButtonCheckedOutlinedIcon fontSize="0.25px"/>  By default the page loads the <strong>last half an hour</strong> Summary of the application, visualizing the components with potential issues.
                    </Typography>
                  </ListItem>
                  <ListItem>
                    <Typography>
                      <RadioButtonCheckedOutlinedIcon fontSize="0.25px"/> The Components of application currenlty incorporated are Server's CPU, Memory and Disk Utilization, Application's Critical Services.
                    </Typography>
                  </ListItem>
                  <ListItem>
                    <Typography>
                      <RadioButtonCheckedOutlinedIcon fontSize="0.25px"/> The threshold assumed for Server Utilization(CPU, Memory, Disk) is <strong>80%</strong>.
                    </Typography>
                  </ListItem>
                  <ListItem>
                    <Typography>
                      <RadioButtonCheckedOutlinedIcon fontSize="0.25px"/> The condition assumed as potential issue for Application Critical Services is any state except <strong>Running</strong>.
                    </Typography>
                  </ListItem>
                  <ListItem>
                    <Typography>
                      <RadioButtonCheckedOutlinedIcon fontSize="0.25px"/> <strong>TimeStamp filter</strong>(PST) is provided on top right corner for choosing the time interval
                    </Typography>
                  </ListItem>
                </List>
                <Divider sx={{borderColor: 'black'}}/>
                <Typography variant="h6"><i>Upcoming Feature</i></Typography>
                <List>
                  <ListItem>
                    <Typography>
                      <RadioButtonCheckedOutlinedIcon fontSize="0.25px"/>  <strong>Corepoint Interface </strong>data integration and continuous monitoring.
                    </Typography>
                  </ListItem>
                </List>
              </Grid>
            </CardContent>
          </div>
          <div style={{position:"sticky"}}>
          <CardActions justifyContent="center" alignItems="center">
            <Button size="small" onClick={handleDisplay}>Donot Show Again</Button>
          </CardActions>
          </div>
        </Card>
      )
    }

    var handleModalTourClose = () =>{
      setModalTourOpen(false)
    }
    

    return (
      <Grid container m={4} p={2} alignItems="center" justifyContent="center">
        {(loading["serverCpuUtilization"] || loading["serverDiskUtilization"] || loading["serverMemoryUtilization"] || loading["serviceLogs"])
        ? 
          <Grid container md={12} mb={1}>
            <Grid md={12} m={0}>
              <Typography variant="h6" className="fst-italic">
                Application Analysis
              </Typography>
            </Grid>
            <Grid md={12}>
              <LinearProgress/>
            </Grid>
          </Grid>
        :
          ""
        }
        <Grid container md={12} m={1} p={2} alignItems="center" justifyContent="center" sx={{borderRadius:10, backgroundColor:'white'}}>
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
              <CreateTourCard/>
          </Modal>
          
          <Grid container md={12} m={1} alignItems="flex-start" justifyContent="center" key="filter-section">
              {/* App Family Filter */}
              <Grid item md={4} m={1}>
                <Autocomplete
                  id="tags-standard-appFamily"
                  options={Object.keys(filterData).length > 0 ? filterData["appFamily"].sort() : []}
                  getOptionLabel={(option) => option}
                  onChange={(event, value) => handleFilterChange(event, value, "appFamily")}
                  defaultValue={filterOptions["appFamily"][0] !== "All" ? filterOptions["appFamily"][0] : []}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      variant="standard"
                      label="App Family"
                      placeholder=""
                    />
                  )}
                />
              </Grid>

              {/* Threshold Filter */}
              <ThresholdFilters type="cpu"/>
              <ThresholdFilters type="memory"/>
              <ThresholdFilters type="disk"/>
              
          </Grid>

          {/* <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              '& > :not(style)': {
                m: 3,
                width: 1400,
                height: 600,
              },
            }}
            md={12}
          > */}
          <Grid container md={12} sx={{boxShadow:3}} mb={2}>
            {/* <Paper elevation={16}> */}
              <NetworkGraph 
                appFamily = {filterChosen}
                graphData = {graphData}
              />
              
            {/* </Paper> */}
          </Grid>
            
          {/* </Box> */}
          {/* <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              '& > :not(style)': {
                m: 3,
                width: 650,
                height: 400,
              },
            }}
            alignItems={'center'}
            justifyContent={'center'}
            md={12}
            sm={6}
          > */}
            {/* <Paper elevation={3} > */}
            {/* <Grid container justifyContent={"center"} alignItems={"center"} sx={{boxShadow:3}}>
              <Card p={2} sx={{ width: '100%',border: "none", boxShadow: "none" }}>
                <CardContent sx={{overflowX: "auto"}}>
                  <Typography gutterBottom variant="h6" component="div" align='center'>
                    Infrastructure Anomalies
                  </Typography>
                  <Grid container mt={3}>
                    <BarGraph data ={anomaliesChart}/>
                  </Grid>
                </CardContent>
              </Card>
            </Grid> */}
            {/* </Paper> */}
          {/* </Box> */}
        </Grid>
      </Grid>
      // </Grid>
      
    )
  
}

export default SmartscapeTopology;