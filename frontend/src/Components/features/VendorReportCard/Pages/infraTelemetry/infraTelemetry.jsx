
import React, { useEffect, useRef, useState } from 'react';
import Button from '@mui/material/Button';
import FilterAltOutlinedIcon from '@mui/icons-material/FilterAltOutlined';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import Box from '@mui/material/Box';
import GreenCards from '../../../../shared/Cards/Cards'; 
import { styled } from '@mui/material/styles';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Unstable_Grid2';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Divider from '@mui/material/Divider';
import PieGraph from '../../../../shared/PieChart/PieChart' 
import LineGraph from '../../../../shared/LineChart/LineChart' 
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import CardMedia from '@mui/material/CardMedia';
import CardContent from '@mui/material/CardContent';
import CardActions from '@mui/material/CardActions';
import TablePagination from '@mui/material/TablePagination';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell, { tableCellClasses } from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import Switch from '@mui/material/Switch';
import SendIcon from '@mui/icons-material/Send';
import { Tooltip} from '@mui/material';
import { exportDateTime } from '../../../Header/Header';
import { AddShoppingCartSharp } from '@mui/icons-material';


function InfrastructureTelemetry(
  {
    date
  }
) {

  //var baseUrl =  "http://127.0.0.1:5000/api/"
  var baseUrl =  "https://itelemetry.providence.org/api/"
  //var baseUrl =  "http://100.100.129.88:9090/api/"
  //var baseUrl =  "http://100.100.129.88:9090/api/" 
  //var baseUrl =  "http://100.100.129.88:9090/api/"
  var [serverList,setServerList] = useState({})
  var [serverEnvironment,setServerEnvironment] = useState({})
  var [windowsEvent,setWindowsEvent] = useState({})
  var [rebootEvent, setRebootEvent] = useState({})

  var [serverEnvironmentLogs,setServerEnvironmentLogs] = useState({})
  var [windowsEventLogs,setWindowsEventLogs] = useState({})
  var [rebootEventLogs, setRebootEventLogs] = useState({})

  var [serverCpuUtilization, setServerCpuUtilization] = useState({})
  var [serverMemoryUtilization, setServerMemoryUtilization] = useState({})
  var [serverDiskUtilization, setServerDiskUtilization] = useState({})
  var [serverCpuUtilizationLogs, setServerCpuUtilizationLogs] = useState({})
  var [serverMemoryUtilizationLogs, setServerMemoryUtilizationLogs] = useState({})
  var [serverDiskUtilizationLogs, setServerDiskUtilizationLogs] = useState({})

  var [serverCpuUtilization_SubRg, setServerCpuUtilization_SubRg] = useState({})
  var [serverMemoryUtilization_SubRg, setServerMemoryUtilization_SubRg] = useState({})
  var [serverDiskUtilization_SubRg, setServerDiskUtilization_SubRg] = useState({})
  var [serverCpuUtilizationLogs_SubRg, setServerCpuUtilizationLogs_SubRg] = useState({})
  var [serverMemoryUtilizationLogs_SubRg, setServerMemoryUtilizationLogs_SubRg] = useState({})
  var [serverDiskUtilizationLogs_SubRg, setServerDiskUtilizationLogs_SubRg] = useState({})

  var [serverNameFilterCpu, setServerNameFilterCpu] = useState("")
  var [serverNameFilterMemory, setServerNameFilterMemory] = useState("")
  var [serverNameFilterDisk, setServerNameFilterDisk] = useState("")

  var [serverNameFilterCpu_SubRg, setServerNameFilterCpu_SubRg] = useState("")
  var [serverNameFilterMemory_SubRg, setServerNameFilterMemory_SubRg] = useState("")
  var [serverNameFilterDisk_SubRg, setServerNameFilterDisk_SubRg] = useState("")

  var [tabChange, setTabChange] = useState(0);

  var [dateChange, setDateChange] = useState({
    "serverInventory" : false,
    "serverMetrics" : false,
    "serverInventory_SubRg" : false,
    "serverMetrics_SubRg":  false
  })
  
  var [loading, setLoading] = useState({
    "serverList" : true,
    "serverEnvironment": true,
    "windowsEvent" : true,
    "rebootEvent": true,
    "rebootEventLogs": true,
    // "windowsEventLogs" : true,
    "serverCpuUtilization" : true,
    "serverMemoryUtilization": true,
    "serverDiskUtilization" : true,
    "serverCpuUtilizationLogs" : true,
    "serverMemoryUtilizationLogs": true,
    "serverDiskUtilizationLogs" : true
  });

  var [loading_SubRg, setLoading_SubRg] = useState({
    "serverList" : true,
    "serverEnvironment": true,
    "windowsEvent" : true,
    "rebootEvent": true,
    "serverCpuUtilization" : true,
    "serverMemoryUtilization": true,
    "serverDiskUtilization" : true,
    "serverCpuUtilizationLogs" : true,
    "serverMemoryUtilizationLogs": true,
    "serverDiskUtilizationLogs" : true
  });

  var [filterData, setFilterData] = useState({
    "appFamily": [
      "OBIX","ARIA","Mosaiq"
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
  })

  var [filterData_SubRg, setFilterData_SubRg] = useState({
    "subRg":["All"],
    "serverName":["All"]
  })

  var [filterOptions_SubRg, setFilterOptions_SubRg] = useState({
    "subRg":["All"],
    "serverName":["All"]
  })

  var [currentFilterData, setCurrentFilterData]=useState({
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
  })

  var [currentFilterData_SubRg, setCurrentFilterData_SubRg]=useState({
    "subRg":["All"],
    "serverName":["All"]
  })

  var [filterChoiceSwitchButtton, setFilterChoiceSwitchButtton] = useState(false)

  const filterHeader = ["appCI", "appFamily", "managedByGroup","supportGroup"]

  var fetchFilterData = (params) => {
    
    ////console.log("hello")
    var url = new URL(baseUrl + 'filters');
    //url.search = new URLSearchParams(params).toString();
    ////console.log(url);
    fetch(url,{
      method:'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params)
    })
      .then((response) => response.json())
      .then((data) =>{ 
        if(Object.keys(params).includes("subRg")){
          setFilterData_SubRg(JSON.parse(data))
        }
        else{
          setFilterData(data)
        }
        
      })
      .catch((error) => console.error('Error:', error));
  };

  var fetchServerListData = async(page, limit) => {
    setServerList({})
    setLoading(prevLoading=>({
      ...prevLoading,
      "serverList" : true
    })); 

    var params = {
      "page": page,
      "limit": limit,
      "filters": filterOptions
    };
    
    ////console.log("hello")
    var url = new URL(baseUrl + 'serverLogs');
    //url.search = new URLSearchParams(params).toString();
    ////console.log(url);
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
        setServerList(JSON.parse(data["ServerLogs"]))
        ////console.log(data)
        setLoading(prevLoading=>({
          ...prevLoading,
          "serverList" : false
        }));
        
      })
      .catch((error) =>{ 
        setLoading(prevLoading=>({
          ...prevLoading,
          "serverList" : false
        }));
        console.error('Error:', error)
      });
  };

  var fetchServerEnvironmentData = async(page, limit, aggregate) => {
    setServerEnvironment({})
    setLoading(prevLoading=>({
      ...prevLoading,
      "serverEnvironment" : true
    }));
    
    var params = {
      "page": page,
      "limit": limit,
      "aggregate": aggregate,
      "filters": filterOptions
    };
    
    ////console.log("hello")
    var url = new URL(baseUrl + 'serverEnvironmentLogs');
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
        setServerEnvironment(data)
        ////console.log(data)
        setLoading(prevLoading=>({
          ...prevLoading,
          "serverEnvironment" : false
          }));
        // }
        
      })
      .catch((error) =>{ 
        setLoading(prevLoading=>({
          ...prevLoading,
          "serverEnvironment" : false
        }));
        console.error('Error:', error)
      });
  };
  

  var fetchWindowsEventData = async(page, limit, aggregate) => {
    if(aggregate=="yes"){
      setWindowsEvent({})
      setLoading(prevLoading=>({
        ...prevLoading,
        "windowsEvent" : true
      }));
    }
    else{
      setWindowsEventLogs({})
      setLoading(prevLoading=>({
        ...prevLoading,
        "windowsEventLogs" : true
      }));
    }
    
    var params = {
      page: page,
      limit: limit,
      aggregate: aggregate,
      filters: filterOptions,
      start_time: date.startDate,
      end_time: date.endDate
    };
    
    ////console.log("hello")
    var url = new URL(baseUrl + 'windowEventLogs');
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
        if(aggregate=="yes"){
          setWindowsEvent(data["windowsEventLogs"])
          setLoading(prevLoading=>({
            ...prevLoading,
            "windowsEvent" : false
          }));
        }
        else{
          setWindowsEventLogs(JSON.parse(data["windowsEventLogs"]))
          setLoading(prevLoading=>({
            ...prevLoading,
            "windowsEventLogs" : false
          }));
        }
        // }
        ////console.log(data)
      })
      .catch((error) =>{ 
        if(aggregate=="yes"){
          setLoading(prevLoading=>({
            ...prevLoading,
            "windowsEvent" : false
          }));
        }
        else{
          setLoading(prevLoading=>({
            ...prevLoading,
            "windowsEventLogs" : false
          }));
        }
        
        console.error('Error:', error)
      });
  };

  var fetchVmRebootsData = async(page, limit, aggregate) => {
    if(aggregate=="yes"){
      setLoading(prevLoading=>({
        ...prevLoading,
        "rebootEvent" : true
      }));
      setRebootEvent({})
    }
    else{
      setLoading(prevLoading=>({
        ...prevLoading,
        "rebootEventLogs" : true
      }));
      setRebootEventLogs({})
    }
    
    var params = {
      "page": page,
      "limit": limit,
      "aggregate": aggregate,
      "filters": filterOptions,
      "start_time": date.startDate,
      "end_time": date.endDate
    };
    
    ////console.log("hello")
    var url = new URL(baseUrl + 'VMRebootLogs');
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
        ////console.log(data)
        if(aggregate=="yes"){
          setRebootEvent(data["vmRebootEvents"])
          
          setLoading(prevLoading=>({
            ...prevLoading,
            "rebootEvent" : false
          })); 
        }
        else{
          setRebootEventLogs(JSON.parse(data["vmRebootEvents"]))
          setLoading(prevLoading=>({
            ...prevLoading,
            "rebootEventLogs" : false
          })); 
        }
        
      })
      .catch((error) =>{ 
        if(aggregate=="yes"){
          setLoading(prevLoading=>({
            ...prevLoading,
            "rebootEvent" : false
          })); 
        }
        else{
          setLoading(prevLoading=>({
            ...prevLoading,
            "rebootEventLogs" : false
          })); 
        }
        
        console.error('Error:', error)
      });
  };

  var fetchCpuUtilizationData = (page, limit, aggregate, serverName, filterChecked) => {
    if(aggregate=="yes"){
      if(!filterChecked){
        setServerNameFilterCpu("")
        setServerCpuUtilization({})
        setServerCpuUtilizationLogs({})
        setLoading(prevLoading=>({
          ...prevLoading,
          "serverCpuUtilization" : true
        }));
      }
      else{
        setServerNameFilterCpu_SubRg("")
        setServerCpuUtilization_SubRg({})
        setServerCpuUtilizationLogs_SubRg({})
        setLoading_SubRg(prevLoading=>({
          ...prevLoading,
          "serverCpuUtilization" : true
        }));
      }
      
    }
    else{
      if(!filterChecked){
        setServerCpuUtilizationLogs({})
        setLoading(prevLoading=>({
          ...prevLoading,
          "serverCpuUtilizationLogs" : true
        }));
      }
      else{
        setServerCpuUtilizationLogs_SubRg({})
        setLoading_SubRg(prevLoading=>({
          ...prevLoading,
          "serverCpuUtilizationLogs" : true
        }));
      }
      
    }
    
    var params = {
      page: page,
      limit: limit,
      aggregate: aggregate,
      filters: filterChecked?filterOptions_SubRg: filterOptions,
      serverName: serverName,
      start_time: date.startDate,
      end_time: date.endDate,
    };
    
    ////console.log("hello")
    var url = new URL(baseUrl + 'azureServerMetricsCPUDatalogs');
    ////console.log(url);
    //url.search = new URLSearchParams(params).toString();

    if(!filterChecked){
      fetch(url,{
        method:'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params)
      })
      .then((response) => response.json())
      .then((data) =>{ 

          if(aggregate=="yes"){
            if(Object.keys(JSON.parse(data["CpuUtilization"])).length==0){
              
              setServerCpuUtilization({
                "ServerName":{},
                "SubscriptionId":{},
                "ResourceGroup":{}
              })

              setServerNameFilterCpu("")
              setServerCpuUtilizationLogs({})

              setLoading(prevLoading=>({
                ...prevLoading,
                "serverCpuUtilization" : false
              })); 

              setLoading(prevLoading=>({
                ...prevLoading,
                "serverCpuUtilizationLogs" : false
              }));
            }
            else{
              var dataSet = JSON.parse(data["CpuUtilization"])
              setServerCpuUtilization(dataSet)
              if(Object.keys(dataSet["ServerName"]).length>0){
                
                setServerNameFilterCpu(Object.values(dataSet["ServerName"])[0])
                setLoading(prevLoading=>({
                  ...prevLoading,
                  "serverCpuUtilization" : false
                }));
                ////console.log("In Cpu util: " +filterChecked.toString()+": " + dataSet["ServerName"][0])
                fetchCpuUtilizationData(-1,10,"no",dataSet["ServerName"][0], filterChecked); //Logs 
              
              }
              else{
                setServerNameFilterCpu("")
                setServerCpuUtilizationLogs({})

                setLoading(prevLoading=>({
                  ...prevLoading,
                  "serverCpuUtilization" : false
                })); 

                setLoading(prevLoading=>({
                  ...prevLoading,
                  "serverCpuUtilizationLogs" : false
                }));
              }
            }
          }
          else{
            setServerCpuUtilizationLogs(JSON.parse(data["CpuUtilization"]))
            setLoading(prevLoading=>({
              ...prevLoading,
              "serverCpuUtilizationLogs" : false
            }));
          }
  
      })
      .catch((error) =>{ 
        if(aggregate=="yes"){
          setLoading(prevLoading=>({
            ...prevLoading,
            "serverCpuUtilization" : false
          }));
        }
        else{
          setLoading(prevLoading=>({
            ...prevLoading,
            "serverCpuUtilizationLogs" : false
          }));
        }
        console.error('Error:', error)
      });
    }

    else{
      //console.log("In SubRg")
      fetch(url,{
        method:'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params)
      })
      .then((response) => response.json())
      .then((data) =>{ 
        
          if(aggregate=="yes"){
            if(Object.keys(JSON.parse(data["CpuUtilization"])).length==0){
              
              setServerCpuUtilization_SubRg({
                "ServerName":{},
                "SubscriptionId":{},
                "ResourceGroup":{}
              })

              setServerNameFilterCpu_SubRg("")
              setServerCpuUtilizationLogs_SubRg({})
              
              setLoading_SubRg(prevLoading=>({
                ...prevLoading,
                "serverCpuUtilization" : false
              }));

              setLoading_SubRg(prevLoading=>({
                ...prevLoading,
                "serverCpuUtilizationLogs" : false
              }));

            }
            else{

              var dataSet = JSON.parse(data["CpuUtilization"])
              setServerCpuUtilization_SubRg(dataSet)
              if(Object.keys(dataSet["ServerName"]).length>0){
                
                setServerNameFilterCpu_SubRg(Object.values(dataSet["ServerName"])[0])
                setLoading_SubRg(prevLoading=>({
                  ...prevLoading,
                  "serverCpuUtilization" : false
                }));
                //console.log("In Cpu util SubRg: " +filterChecked.toString()+": " + dataSet["ServerName"][0])
                fetchCpuUtilizationData(-1,10,"no",dataSet["ServerName"][0], filterChecked); //Log

              }
              else{
                setServerNameFilterCpu_SubRg("")
                setServerCpuUtilizationLogs_SubRg({})
                
                setLoading_SubRg(prevLoading=>({
                  ...prevLoading,
                  "serverCpuUtilization" : false
                }));

                setLoading_SubRg(prevLoading=>({
                  ...prevLoading,
                  "serverCpuUtilizationLogs" : false
                }));
              }
            }
          }
          else{

            setServerCpuUtilizationLogs_SubRg(JSON.parse(data["CpuUtilization"]))
            setLoading_SubRg(prevLoading=>({
              ...prevLoading,
              "serverCpuUtilizationLogs" : false
            }));
          }
        
      })
      .catch((error) =>{ 
        if(aggregate=="yes"){
          
          setLoading_SubRg(prevLoading=>({
            ...prevLoading,
            "serverCpuUtilization" : false
          }));
        }
        else{

          setLoading_SubRg(prevLoading=>({
            ...prevLoading,
            "serverCpuUtilizationLogs" : false
          }));
        }
        console.error('Error:', error)
      });
    }
    
  };

  var fetchMemoryUtilizationData = (page, limit, aggregate, serverName, filterChecked) => {
    if(aggregate=="yes"){
      if(!filterChecked){
        setServerNameFilterMemory("")
        setServerMemoryUtilization({})
        setServerMemoryUtilizationLogs({})
        setLoading(prevLoading=>({
          ...prevLoading,
          "serverMemoryUtilization" : true
        }));
      }
      else{
        setServerNameFilterMemory_SubRg("")
        setServerMemoryUtilization_SubRg({})
        setServerMemoryUtilizationLogs_SubRg({})
        setLoading_SubRg(prevLoading=>({
          ...prevLoading,
          "serverMemoryUtilization" : true
        }));
      }
      
    }
    else{
      if(!filterChecked){
        setServerMemoryUtilizationLogs({})
        setLoading(prevLoading=>({
          ...prevLoading,
          "serverMemoryUtilizationLogs" : true
        }));
      }
      else{
        setServerMemoryUtilizationLogs_SubRg({})
        setLoading_SubRg(prevLoading=>({
          ...prevLoading,
          "serverMemoryUtilizationLogs" : true
        }));
      }
    }
    
    var params = {
      page: page,
      limit: limit,
      aggregate: aggregate,
      filters: !filterChecked ? filterOptions:filterOptions_SubRg,
      serverName : serverName,
      start_time: date.startDate,
      end_time: date.endDate,
    };
    
    var url = new URL(baseUrl + 'azureServerMetricsMemoryDatalogs');
    //console.log(url)
    //url.search = new URLSearchParams(params).toString();
    if(!filterChecked){
      fetch(url,{
        method:'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params)
      })
      .then((response) => response.json())
      .then((data) =>{ 
        if(aggregate=="yes"){

          if(Object.keys(JSON.parse(data["MemoryUtilization"])).length==0){
            setServerMemoryUtilization({
              "ServerName":{},
              "SubscriptionId":{},
              "ResourceGroup":{}
            })
            setLoading(prevLoading=>({
              ...prevLoading,
              "serverMemoryUtilization" : false
            }));
            setServerNameFilterMemory("")
            setServerMemoryUtilizationLogs({})
            setLoading(prevLoading=>({
              ...prevLoading,
              "serverMemoryUtilizationLogs" : false
            }));

          }
          else{
            var dataSet = JSON.parse(data["MemoryUtilization"])
            setServerMemoryUtilization(dataSet)
            if(Object.keys(dataSet["ServerName"]).length>0){
              setServerNameFilterMemory(Object.values(dataSet["ServerName"])[0])
              setLoading(prevLoading=>({
                ...prevLoading,
                "serverMemoryUtilization" : false
              }));
              fetchMemoryUtilizationData(-1,10,"no",dataSet["ServerName"][0], filterChecked)
            }
            else{
              setLoading(prevLoading=>({
              ...prevLoading,
              "serverMemoryUtilization" : false
              }));
              setServerNameFilterMemory("")
              setServerMemoryUtilizationLogs({})
              setLoading(prevLoading=>({
                ...prevLoading,
                "serverMemoryUtilizationLogs" : false
              }));
            }
            
          }
        }
        else{

          setServerMemoryUtilizationLogs(JSON.parse(data["MemoryUtilization"]))
          setLoading(prevLoading=>({
            ...prevLoading,
            "serverMemoryUtilizationLogs" : false
          }));

        }
        
      })
      .catch((error) =>{ 
        if(aggregate=="yes"){
          
          setLoading(prevLoading=>({
            ...prevLoading,
            "serverMemoryUtilization" : false
          }));
        }
        else{

          setLoading(prevLoading=>({
            ...prevLoading,
            "serverMemoryUtilizationLogs" : false
          }));
        } 
        console.error('Error:', error)
      });
    }
    else{
      fetch(url,{
        method:'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params)
      })
      .then((response) => response.json())
      .then((data) =>{ 
        if(aggregate=="yes"){

          if(Object.keys(JSON.parse(data["MemoryUtilization"])).length==0){
            setServerMemoryUtilization_SubRg({
              "ServerName":{},
              "SubscriptionId":{},
              "ResourceGroup":{}
            })
            setLoading_SubRg(prevLoading=>({
              ...prevLoading,
              "serverMemoryUtilization" : false
            }));

            setServerNameFilterMemory_SubRg("")
            setServerMemoryUtilizationLogs_SubRg({})
            setLoading_SubRg(prevLoading=>({
              ...prevLoading,
              "serverMemoryUtilizationLogs" : false
            }));

          }
          else{
            var dataSet = JSON.parse(data["MemoryUtilization"])
            setServerMemoryUtilization_SubRg(dataSet)
            if(Object.keys(dataSet["ServerName"]).length>0){

              setServerNameFilterMemory_SubRg(Object.values(dataSet["ServerName"])[0])
              setLoading_SubRg(prevLoading=>({
                ...prevLoading,
                "serverMemoryUtilization" : false
              }));
              fetchMemoryUtilizationData(-1,10,"no",dataSet["ServerName"][0], filterChecked); //Logs 
              
            }
            else{
              setLoading_SubRg(prevLoading=>({
                ...prevLoading,
                "serverMemoryUtilization" : false
              }));
              setServerNameFilterMemory_SubRg("")
              setServerMemoryUtilizationLogs_SubRg({})
              setLoading_SubRg(prevLoading=>({
                ...prevLoading,
                "serverMemoryUtilizationLogs" : false
              }));
            }
            
          }
          
        }
        else{

          setServerMemoryUtilizationLogs_SubRg(JSON.parse(data["MemoryUtilization"]))
          
          setLoading_SubRg(prevLoading=>({
            ...prevLoading,
            "serverMemoryUtilizationLogs" : false
          }));
        }
        ////console.log(data)
      })
      .catch((error) =>{ 
        if(aggregate=="yes"){
          
          setLoading_SubRg(prevLoading=>({
            ...prevLoading,
            "serverMemoryUtilization" : false
          }));
        }
        else{

          setLoading_SubRg(prevLoading=>({
            ...prevLoading,
            "serverMemoryUtilizationLogs" : false
          }));
        } 
        console.error('Error:', error)
      });
    }
  };
   
  var fetchDiskUtilizationData = (page, limit, aggregate, serverName) => {

    if(aggregate=="yes"){
      if(!filterChoiceSwitchButtton){
        setServerNameFilterDisk("")
        setServerDiskUtilization({})
        setServerDiskUtilizationLogs({})
        setLoading(prevLoading=>({
          ...prevLoading,
          "serverDiskUtilization" : true
        }));
      }
      else{
        setServerNameFilterDisk_SubRg("")
        setServerDiskUtilization_SubRg({})
        setServerDiskUtilizationLogs_SubRg({})
        setLoading_SubRg(prevLoading=>({
          ...prevLoading,
          "serverDiskUtilization" : true
        }));
      }
      
    }
    else{
      if(!filterChoiceSwitchButtton){
        setServerDiskUtilizationLogs({})
        setLoading(prevLoading=>({
          ...prevLoading,
          "serverDiskUtilizationLogs" : true
        }));
      }
      else{
        setServerDiskUtilizationLogs_SubRg({})
        setLoading_SubRg(prevLoading=>({
          ...prevLoading,
          "serverDiskUtilizationLogs" : true
        }));
      }
    }
 
    var params = {
      page: page,
      limit: limit,
      aggregate: aggregate,
      filters: !filterChoiceSwitchButtton? filterOptions:filterOptions_SubRg,
      serverName : serverName,
      start_time: date.startDate,
      end_time: date.endDate,

    };
    
    var url = new URL(baseUrl + 'azureServerMetricsDiskDatalogs');
    
    //url.search = new URLSearchParams(params).toString();
    if(!filterChoiceSwitchButtton){
      fetch(url,{
        method:'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params)
      })
      .then((response) => response.json())
      .then((data) =>{ 
        if(aggregate=="yes"){
          // //console.log("Disk Aggregate")
          // //console.log(JSON.parse(data["DiskUtilization"]))
          if(Object.keys(JSON.parse(data["DiskUtilization"])).length==0){
            setServerDiskUtilization({
              "ServerName":{},
              "SubscriptionId":{},
              "ResourceGroup":{}
            })
          }
          else{
            setServerDiskUtilization(JSON.parse(data["DiskUtilization"]))
          }
          
          setLoading(prevLoading=>({
            ...prevLoading,
            "serverDiskUtilization" : false
          }));

        }
        else{
          // //console.log("Disk Logs")
          // //console.log(JSON.parse(data["DiskUtilization"]))
          setServerDiskUtilizationLogs(JSON.parse(data["DiskUtilization"]))
          setLoading(prevLoading=>({
            ...prevLoading,
            "serverDiskUtilizationLogs" : false
          }));
        }
        
      })
      .catch((error) =>{ 
        if(aggregate=="yes"){
          
          setLoading(prevLoading=>({
            ...prevLoading,
            "serverDiskUtilization" : false
          }));
        }
        else{
          
          setLoading(prevLoading=>({
            ...prevLoading,
            "serverDiskUtilizationLogs" : false
          }));
        }
        console.error('Error:', error)
      });
    }
    else{
      fetch(url,{
        method:'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params)
      })
      .then((response) => response.json())
      .then((data) =>{ 
        if(aggregate=="yes"){
          // //console.log("Disk Aggregate")
          // //console.log(JSON.parse(data["DiskUtilization"]))
          if(Object.keys(JSON.parse(data["DiskUtilization"])).length==0){
            setServerDiskUtilization_SubRg({
              "ServerName":{},
              "SubscriptionId":{},
              "ResourceGroup":{}
            })
          }
          else{
            setServerDiskUtilization_SubRg(JSON.parse(data["DiskUtilization"]))
          }
          
          setLoading_SubRg(prevLoading=>({
            ...prevLoading,
            "serverDiskUtilization" : false
          }));

        }
        else{
          // //console.log("Disk Logs")
          // //console.log(JSON.parse(data["DiskUtilization"]))
          setServerDiskUtilizationLogs_SubRg(JSON.parse(data["DiskUtilization"]))
          setLoading_SubRg(prevLoading=>({
            ...prevLoading,
            "serverDiskUtilizationLogs" : false
          }));
        }
        
      })
      .catch((error) =>{ 
        if(aggregate=="yes"){
          
          setLoading_SubRg(prevLoading=>({
            ...prevLoading,
            "serverDiskUtilization" : false
          }));
        }
        else{
          
          setLoading_SubRg(prevLoading=>({
            ...prevLoading,
            "serverDiskUtilizationLogs" : false
          }));
        }
        console.error('Error:', error)
      });
    }
    
  };

  const handleTabChange=(event, value)=>{
    ////console.log(filterChoiceSwitchButtton)

    setTabChange(value)

    if(!filterChoiceSwitchButtton){
      if(loading["serverList"] && loading["rebootEvent"] && loading["serverEnvironment"] && loading["windowsEvent"] && value==0){
        ////console.log("Api Calls 0")
        apiCalls(value)
      }
      if(loading["serverCpuUtilization"] && loading["serverCpuUtilizationLogs"] && loading["serverDiskUtilization"] && loading["serverDiskUtilizationLogs"] && loading["serverMemoryUtilization"] && loading["serverMemoryUtilizationLogs"] && value==1){
        apiCalls(value)
      }
    }
    else{
      if(loading_SubRg["serverList"] && loading_SubRg["rebootEvent"] && loading_SubRg["serverEnvironment"] && loading_SubRg["windowsEvent"] && value==0){
        ////console.log("Api Calls 0")
        apiCalls(value)
      }
      if(loading_SubRg["serverCpuUtilization"] && loading_SubRg["serverCpuUtilizationLogs"] && loading_SubRg["serverDiskUtilization"] && loading_SubRg["serverDiskUtilizationLogs"] && loading_SubRg["serverMemoryUtilization"] && loading_SubRg["serverMemoryUtilizationLogs"] && value==1){
        apiCalls(value)
      }
    }
    
  };

  const handleFilterChange = (event, newValue,filterType) =>{
    ////console.log("Filter Change")

    if(newValue.length==0){
      ////console.log("I am here")
      newValue=["All"]
    }
    if(Array.isArray(newValue)){
      ////console.log("I am hereee")
      setFilterOptions(prevFilter=>({
        ...prevFilter,
        [filterType] : newValue
      }))
    }
  }

  const handleFilterChange_SubRg = (event, newValue,filterType) =>{
    ////console.log("Filter Change")
    if(filterType=="serverName"){
      if(newValue=="" || newValue==null){
        newValue=["All"]
      }
      else{
        setFilterOptions_SubRg(prevFilter=>({
          ...prevFilter,
          [filterType] : [newValue]
        }))
      }
    }
    else{
      if(newValue.length==0){
        ////console.log("I am here")
        newValue=["All"]
      }
      if(Array.isArray(newValue)){
        ////console.log("I am hereee")
        setFilterOptions_SubRg(prevFilter=>({
          ...prevFilter,
          [filterType] : newValue
        }))
      }
    }
    
  }
  
  const apiCalls = async(tabValue) =>{
    ////console.log(tabValue)
    if(tabValue==0){
      await fetchServerListData(-1,10);
      await fetchServerEnvironmentData(-1,10,"yes");
      await fetchWindowsEventData(-1,10,"yes");
      await fetchVmRebootsData(-1,10,"yes");
      await fetchVmRebootsData(-1,10,"no");
      // await fetchWindowsEventData(-1,10,"no");
    }
    else if(tabValue==1){
      fetchCpuUtilizationData(-1,10,"yes","", filterChoiceSwitchButtton); //Aggergate Values 
      fetchMemoryUtilizationData(-1,10,"yes","", filterChoiceSwitchButtton);
      fetchDiskUtilizationData(-1,10,"yes","");
    }

  }

  function graphServerMetrics(obj, attribute, dataOf) {
    if(obj!=undefined && Object.keys(obj).length>0){
      
      ////console.log(serverNameFilter)
      if(dataOf=="disk"){
        const stringKeys_C = Object.keys(obj["ServerName"]).filter(key =>  obj["DriveName"][key]==="C:");
        const stringValues_C = stringKeys_C.map(key => obj[attribute][key]);
        if(attribute=="AvgValue"){
          const stringKeys_D = Object.keys(obj["ServerName"]).filter(key =>  obj["DriveName"][key]==="D:");
          const stringValues_D = stringKeys_D.map(key => obj[attribute][key]);
          return [stringValues_C, stringValues_D]
        }
        return stringValues_C
        
      }
      else{
        
        return Object.values(obj[attribute])
      }
    }
    
  }

  function graphServerLogs(obj, dataOf) {

    var serverLogs = []
    if(obj!=undefined && Object.keys(obj).length>0){
      
      if(dataOf=="disk"){
        Object.keys(obj["ServerName"]).map(key => serverLogs.push(
          {
            "TimeGenerated" : obj["TimeGenerated"][key],
            "ServerName" : obj["ServerName"][key],
            "AverageUtilization" : parseFloat(obj["AvgValue"][key]),
            "HostingType" : obj["HostingType"][key],
            "DriveName": obj["DriveName"][key]
          }
        ));
      }
      else{
        Object.keys(obj["ServerName"]).map(key => serverLogs.push(
          {
            "TimeGenerated" : obj["TimeGenerated"][key],
            "ServerName" : obj["ServerName"][key],
            "AverageUtilization" : parseFloat(obj["AvgValue"][key]),
            "HostingType" : obj["HostingType"][key]
          }
        ));
      }
    }
    ////console.log(serverLogs)

    return serverLogs
  }

  const handleFilterDisplayed =(e)=>{
    e.preventDefault();
    setFilterChoiceSwitchButtton(e.target.checked)
  }

  const isEqualJson= (json1, json2)=>{
    // //console.log(json1)
    // //console.log(json2)
    var boolValue = Object.keys(json1).map((key)=>{
      var arraysAreEqual = (json1[key].length === json2[key].length) && (json1[key].slice().sort().every((value, index) => value === json2[key].slice().sort()[index]));
      return arraysAreEqual
    }).includes(false)
    return !boolValue
  }

  const handleGetDataButtonClick = (e)=>{
    e.preventDefault();
    
    if(!filterChoiceSwitchButtton){
      if(isEqualJson(currentFilterData, filterOptions)){
        return
      }
      ////console.log(filterOptions)
      setCurrentFilterData(filterOptions)
      setLoading({
        "serverList" : true,
        "serverEnvironment": true,
        "windowsEvent" : true,
        "rebootEvent": true,
        "rebootEventLogs": true,
        "serverCpuUtilization" : true,
        "serverMemoryUtilization": true,
        "serverDiskUtilization" : true,
        "serverCpuUtilizationLogs" : true,
        "serverMemoryUtilizationLogs": true,
        "serverDiskUtilizationLogs" : true
      })
      apiCalls(tabChange)
    }
    else{
      if(isEqualJson(currentFilterData_SubRg, filterOptions_SubRg)){
        return
      }
      setCurrentFilterData_SubRg(filterOptions_SubRg)
      setLoading_SubRg({
        "serverList" : true,
        "serverEnvironment": true,
        "windowsEvent" : true,
        "rebootEvent": true,
        "serverCpuUtilization" : true,
        "serverMemoryUtilization": true,
        "serverDiskUtilization" : true,
        "serverCpuUtilizationLogs" : true,
        "serverMemoryUtilizationLogs": true,
        "serverDiskUtilizationLogs" : true
      })
      apiCalls(tabChange)
    }
  }

  useEffect(()=>{
    ////console.log(loading)
  },[loading])


  useEffect(()=>{
    setFilterData({
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
    })
    setFilterOptions({
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
    })
    setFilterOptions_SubRg({
      "subRg":["All"],
      "serverName":["All"]
    })
    fetchFilterData(filterOptions);
    fetchFilterData(filterOptions_SubRg);
    
  },[])

  useEffect(()=>{
    if(Object.keys(serverDiskUtilization).length>0){
      if(Object.keys(serverDiskUtilization["ServerName"]).length>0){
        setServerNameFilterDisk(Object.values(serverDiskUtilization["ServerName"])[0])
        fetchDiskUtilizationData(-1,10,"no",serverDiskUtilization["ServerName"][0]); //Logs 
      }
      else{
        setServerNameFilterDisk("")
        setServerDiskUtilizationLogs({})
        setLoading(prevLoading=>({
          ...prevLoading,
          "serverDiskUtilizationLogs" : false
        }));
      }
    }
  },[serverDiskUtilization])

  useEffect(()=>{
    if(Object.keys(serverDiskUtilization_SubRg).length>0){
      if(Object.keys(serverDiskUtilization_SubRg["ServerName"]).length>0){
        setServerNameFilterDisk_SubRg(Object.values(serverDiskUtilization_SubRg["ServerName"])[0])
        fetchDiskUtilizationData(-1,10,"no",serverDiskUtilization_SubRg["ServerName"][0]); //Logs 
      }
      else{
        setServerNameFilterDisk_SubRg("")
        setServerDiskUtilizationLogs_SubRg({})
        setLoading_SubRg(prevLoading=>({
          ...prevLoading,
          "serverDiskUtilizationLogs" : false
        }));
      }
    }
  },[serverDiskUtilization_SubRg])

  useEffect(()=>{
    ////console.log(tabChange);
    if(filterOptions["appFamily"]=="All" && filterOptions["appCI"]=="All" && filterOptions["supportGroup"]=="All" && filterOptions["managedByGroup"]=="All"){
      if(tabChange==0 && Object.keys(serverList).length==0){
        setLoading({
          "serverList" : true,
          "serverEnvironment": true,
          "windowsEvent" : true,
          "rebootEvent": true,
          "rebootEventLogs": true,
          "serverCpuUtilization" : true,
          "serverMemoryUtilization": true,
          "serverDiskUtilization" : true,
          "serverCpuUtilizationLogs" : true,
          "serverMemoryUtilizationLogs": true,
          "serverDiskUtilizationLogs" : true
        })
        apiCalls(tabChange)
      }
      else if(tabChange==1 && Object.keys(serverCpuUtilization).length==0){
        setLoading({
          "serverList" : true,
          "serverEnvironment": true,
          "windowsEvent" : true,
          "rebootEvent": true,
          "rebootEventLogs": true,
          "serverCpuUtilization" : true,
          "serverMemoryUtilization": true,
          "serverDiskUtilization" : true,
          "serverCpuUtilizationLogs" : true,
          "serverMemoryUtilizationLogs": true,
          "serverDiskUtilizationLogs" : true
        })
        apiCalls(tabChange)
      }
    }
  },[filterOptions])

  useEffect(()=>{
    
      setLoading({
        "serverList" : true,
        "serverEnvironment": true,
        "windowsEvent" : true,
        "rebootEvent": true,
        "rebootEventLogs": true,
        "serverCpuUtilization" : true,
        "serverMemoryUtilization": true,
        "serverDiskUtilization" : true,
        "serverCpuUtilizationLogs" : true,
        "serverMemoryUtilizationLogs": true,
        "serverDiskUtilizationLogs" : true
      })
    
      setLoading_SubRg({
        "serverList" : true,
        "serverEnvironment": true,
        "windowsEvent" : true,
        "rebootEvent": true,
        "rebootEventLogs": true,
        "serverCpuUtilization" : true,
        "serverMemoryUtilization": true,
        "serverDiskUtilization" : true,
        "serverCpuUtilizationLogs" : true,
        "serverMemoryUtilizationLogs": true,
        "serverDiskUtilizationLogs" : true
      })
    
    setDateChange({
      "serverInventory" : true,
      "serverMetrics" : true,
      "serverInventory_SubRg" : true,
      "serverInventory_SubRg":  true
    })
    apiCalls(tabChange)
  },[date])

  useEffect(()=>{
    
    if(filterOptions_SubRg["subRg"][0]=="All" && filterOptions_SubRg["serverName"][0]=="All"){
      if(tabChange==0 && Object.keys(serverList).length==0){
        setLoading_SubRg({
          "serverList" : true,
          "serverEnvironment": true,
          "windowsEvent" : true,
          "rebootEvent": true,
          "serverCpuUtilization" : true,
          "serverMemoryUtilization": true,
          "serverDiskUtilization" : true,
          "serverCpuUtilizationLogs" : true,
          "serverMemoryUtilizationLogs": true,
          "serverDiskUtilizationLogs" : true
        })
        apiCalls(tabChange)
      }
      else if(tabChange==1 && Object.keys(serverCpuUtilization_SubRg).length==0){
        setLoading_SubRg({
          "serverList" : true,
          "serverEnvironment": true,
          "windowsEvent" : true,
          "rebootEvent": true,
          "serverCpuUtilization" : true,
          "serverMemoryUtilization": true,
          "serverDiskUtilization" : true,
          "serverCpuUtilizationLogs" : true,
          "serverMemoryUtilizationLogs": true,
          "serverDiskUtilizationLogs" : true
        })
        apiCalls(tabChange)
      }
    }
    
  },[filterOptions_SubRg])

  useEffect(()=>{
    // if(Object.keys(serverCpuUtilization_SubRg).length==0 && filterChoiceSwitchButtton){
    //   apiCalls(tabChange)
    // }
    // if(filterChoiceSwitchButtton){
    //   if((tabChange==0 && !dateChange["serverInventory"]) || (tabChange==1 && !dateChange["serverMetrics"])){
    //     apiCalls(tabChange)
    //   }
    // }
    // else{
    //   if((tabChange==0 && !dateChange["serverInventory_SubRg"]) || (tabChange==1 && !dateChange["serverMetrics_SubRg"])){
    //     apiCalls(tabChange)
    //   }
    // }
    // //console.log("filter Choice Change")
    // //console.log(filterChoiceSwitchButtton)
    handleTabChange("", tabChange)
  },[filterChoiceSwitchButtton])

  function ServerInventoryTable(){
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    
    const handleChangePage = (event, newPage) => {
      setPage(newPage);
    };
    
    const handleChangeRowsPerPage = (event) => {
      ////console.log(event.target.value)
      setRowsPerPage(event.target.value);
      setPage(0);
    };

    return(
        
      <Paper sx={{ width: '100%', overflow: 'hidden' }}>
        <TableContainer>
          <Table stickyHeader aria-label="collapsible table">
            <TableHead>
              <TableRow>

                <TableCell>
                  <Typography variant="h6" gutterBottom sx={{ textAlign:'center'}}>
                    Server Name 
                  </Typography>
                </TableCell>

                <TableCell>
                  <Typography variant="h6" gutterBottom sx={{ textAlign:'center'}}>
                    App family
                  </Typography>
                </TableCell>

                <TableCell>
                  <Typography variant="h6" gutterBottom sx={{ textAlign:'center'}}>
                    App CI
                  </Typography>  
                </TableCell>

                <TableCell>
                  <Typography variant="h6" gutterBottom sx={{ textAlign:'center'}}>
                    APM Number
                  </Typography>
                </TableCell>
                
                <TableCell>
                  <Typography variant="h6" gutterBottom sx={{ textAlign:'center'}}>
                    Support Group
                  </Typography>
                </TableCell>

                <TableCell>
                  <Typography variant="h6" gutterBottom sx={{ textAlign:'center'}}>
                    Managed By Group
                  </Typography>
                </TableCell>

              </TableRow>
            </TableHead>
            <TableBody style={{ maxHeight: "300px", overflowY: "auto" }}>
              {Object.keys(serverList).length > 0?
              Object.keys(serverList["ServerName"]).slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((key) => (
                <TableRow sx={{ '& > *': { borderBottom: 'unset' } }}>

                  <TableCell  sx={{ textAlign:'center'}}>
                    <Typography variant="subtitle2" gutterBottom component="div">
                      {serverList["ServerName"][key]}
                    </Typography>
                  </TableCell>

                  <TableCell component="th" scope="row" sx={{ textAlign:'center'}}>
                    <Typography variant="subtitle2" gutterBottom component="div">
                      {serverList["AppFamily"][key]}
                    </Typography>
                  </TableCell>

                  <TableCell sx={{ textAlign:'center'}}>
                    <Typography variant="subtitle2" gutterBottom component="div">
                      {serverList["AppCI"][key]}
                    </Typography>  
                  </TableCell>

                  <TableCell sx={{ textAlign:'center'}}>
                    <Typography variant="subtitle2" gutterBottom component="div">
                      {serverList["APMNumber"][key]}
                    </Typography>  
                  </TableCell>
                  
                  <TableCell sx={{ textAlign:'center'}}>
                    <Typography variant="subtitle2" gutterBottom component="div">
                      {serverList["SupportGroup"][key]}
                    </Typography>  
                  </TableCell>

                  <TableCell sx={{ textAlign:'center'}}>
                    <Typography variant="subtitle2" gutterBottom component="div">
                      {serverList["ManagedByGroup"][key]}
                    </Typography>  
                  </TableCell>

                </TableRow>
              )):""}
            </TableBody>
          </Table>
          
        </TableContainer>
        <TablePagination
            rowsPerPageOptions={[10,20]}
            component="div"
            count={Object.keys(serverList).length>0 ? Object.keys(serverList["ServerName"]).length:0}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </Paper>
        
    );
  }

  function ServerUtilizationUI(props){
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(5);
    var [sort, setSort] = useState({
      "timeGenerated_CPU Utilization": true,
      "averageUtilization_CPU Utilization" : true,
      "timeGenerated_Memory Utilization": true,
      "averageUtilization_Memory Utilization" : true,
      "timeGenerated_Disk Utilization": true,
      "averageUtilization_Disk Utilization" : true
    });

    var {utilization, graph, logs, subHeader, label, filter} = props
    var [logsTable, setLogsTable] = useState(logs)

    const StyledTableCell = styled(TableCell)(({ theme }) => ({
      [`&.${tableCellClasses.head}`]: {
        backgroundColor: theme.palette.common.black,
        color: theme.palette.common.white,
      },
      [`&.${tableCellClasses.body}`]: {
        fontSize: 14,
      },
    }));
    
    const StyledTableRow = styled(TableRow)(({ theme }) => ({
      '&:nth-of-type(odd)': {
        backgroundColor: theme.palette.action.hover,
      },
      // hide last border
      '&:last-child td, &:last-child th': {
        border: 0,
      },
    }));
    
    const handleChangePage = (event, newPage) => {
      setPage(newPage);
    };
    
    const handleChangeRowsPerPage = (event) => {
      ////console.log(event.target.value)
      setRowsPerPage(event.target.value);
      setPage(0);
    };

    const handleSort = (key, logs, e) =>{
      e.preventDefault();
      try{
        const current = sort[key]
        setSort(prevSort=>({
          ...prevSort,
          [key] : !sort[key]
        }))
        
        if(key.includes("timeGenerated")){
          return ""
        }
        else{
          if(!current){
            ////console.log("descending")
            setLogsTable(logs.sort((a,b)=>b.AverageUtilization - a.AverageUtilization))
          }
          else{
            ////console.log("ascending")
            setLogsTable(logs.sort((a,b)=>a.AverageUtilization - b.AverageUtilization))
          }
        }
      }
      catch(e){
        //console.log(e)
      }
    };

    const handleServerThresholdFilter = (newValue, category)=>{
      window.scrollTo(0, 0)
      if(!filterChoiceSwitchButtton){
        if(category=="CPU Utilization"){
          if(newValue!=serverNameFilterCpu){
            fetchCpuUtilizationData(-1,10,"no",newValue, filterChoiceSwitchButtton)
            setServerNameFilterCpu(newValue)
            setSort(prevSort=>({
              ...prevSort,
              "timeGenerated_CPU Utilization": true,
              "averageUtilization_CPU Utilization" : true,
            }))
            // //console.log(newValue)
            // //console.log(category);
          }
        }
        else if(category=="Memory Utilization"){
          if(newValue!=serverNameFilterMemory){
            fetchMemoryUtilizationData(-1,10,"no",newValue, filterChoiceSwitchButtton)
            setServerNameFilterMemory(newValue)
            setSort(prevSort=>({
              ...prevSort,
              "timeGenerated_Memory Utilization": true,
              "averageUtilization_Memory Utilization" : true,
            }))
            // //console.log(newValue)
            // //console.log(category);
          }
        }
        else if(category=="Disk Utilization"){
          if(newValue!=serverNameFilterDisk){
            fetchDiskUtilizationData(-1,10,"no",newValue)
            setServerNameFilterDisk(newValue)
            setSort(prevSort=>({
              ...prevSort,
              "timeGenerated_Disk Utilization": true,
              "averageUtilization_Disk Utilization" : true,
            }))
            // //console.log(newValue)
            // //console.log(category);
          }
        }
      }
      else{
        if(category=="CPU Utilization"){
          if(newValue!=serverNameFilterCpu_SubRg){
            fetchCpuUtilizationData(-1,10,"no",newValue,filterChoiceSwitchButtton)
            setServerNameFilterCpu_SubRg(newValue)
            setSort(prevSort=>({
              ...prevSort,
              "timeGenerated_CPU Utilization": true,
              "averageUtilization_CPU Utilization" : true,
            }))
            // //console.log(newValue)
            // //console.log(category);
          }
        }
        else if(category=="Memory Utilization"){
          if(newValue!=serverNameFilterMemory_SubRg){
            fetchMemoryUtilizationData(-1,10,"no",newValue, filterChoiceSwitchButtton)
            setServerNameFilterMemory_SubRg(newValue)
            setSort(prevSort=>({
              ...prevSort,
              "timeGenerated_Memory Utilization": true,
              "averageUtilization_Memory Utilization" : true,
            }))
            // //console.log(newValue)
            // //console.log(category);
          }
        }
        else if(category=="Disk Utilization"){
          if(newValue!=serverNameFilterDisk_SubRg){
            fetchDiskUtilizationData(-1,10,"no",newValue)
            setServerNameFilterDisk_SubRg(newValue)
            setSort(prevSort=>({
              ...prevSort,
              "timeGenerated_Disk Utilization": true,
              "averageUtilization_Disk Utilization" : true,
            }))
            // //console.log(newValue)
            // //console.log(category);
          }
        }
      }
    };

    

    return (
      
      <Grid md={12} container alignItems='center' justifyContent='center' m={2} p={2}>
        <Grid md={2} container alignItems="center" justifyContent="center">

          <Grid md={12} m={2}>
            <Autocomplete
              id="combo-box-demo"
              options={[...new Set(filter)]}
              getOptionLabel={(option) => option}
              renderInput={(params) => <TextField {...params} label={"Servers > 80"} variant="outlined" />}
              onChange = {(e, newValue)=>handleServerThresholdFilter(newValue,subHeader)}
            />
          </Grid>

          <Grid md={12} m={2}>
            <Card sx={{ border:"2px solid red", borderRadius:"20px"}} p={4}>
              <CardHeader title="#Servers" subheader= {subHeader + " > 80"} sx={{textAlign:"center"}}/>
              <CardContent>
                <Typography variant="h2" color="text.secondary" sx={{textAlign:"center"}} className="fw-bold text-danger">
                  {utilization}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          
        </Grid>
        <Grid md={5} p={2}>
          <Paper sx={{ width: '100%', overflow: 'auto' }}>
            <LineGraph dataX={graph[0]} dataY={graph[1]} label={label}/>
          </Paper>
        </Grid>
        <Grid md={5} p={2}>
          <Paper sx={{ width: '100%', overflow: 'hidden' }}>
            <TableContainer>
              <Table stickyHeader aria-label="collapsible table">
                <TableHead>
                  <TableRow>

                    <TableCell>
                      {/* <Button color="secondary" style={{ textTransform: 'none' }} onClick={(e)=>{e.preventDefault();handleSort("timeGenerated_"+subHeader, logsTable,e)}}> */}
                        <Typography variant="subtitle1" gutterBottom sx={{ textAlign:'center'}}>
                          TimeStamp 
                          {/* {sort["timeGenerated_"+subHeader]?<ArrowDownwardIcon fontSize="small"/>:<ArrowUpwardIcon fontSize="small"/>} */}
                        </Typography>
                      {/* </Button> */}
                    </TableCell>

                    <TableCell>
                      <Typography variant="subtitle1" gutterBottom sx={{ textAlign:'center'}}>
                        Server Name
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <Button color="secondary" style={{ textTransform: 'none' }} onClick={(e)=>handleSort("averageUtilization_"+subHeader, logsTable, e)}>
                        <Typography variant="subtitle1" gutterBottom sx={{ textAlign:'center'}}>
                          Avg Util {sort["averageUtilization_"+subHeader]?<ArrowDownwardIcon fontSize="small"/>:<ArrowUpwardIcon fontSize="small"/>}
                        </Typography>  
                      </Button>
                    </TableCell>

                    {subHeader=="Disk Utilization"?
                      <TableCell>
                        <Typography variant="subtitle1" gutterBottom sx={{ textAlign:'center'}}>
                          Drive
                        </Typography>
                      </TableCell>:""
                    }
                    <TableCell>
                      <Typography variant="subtitle1" gutterBottom sx={{ textAlign:'center'}}>
                        Hosting Type
                      </Typography>
                    </TableCell>

                  </TableRow>
                </TableHead>
                <TableBody style={{ maxHeight: "300px", overflowY: "auto" }}>
                  {logsTable.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((row) => (
                    <StyledTableRow sx={{ '& > *': { borderBottom: 'unset' } }}>
                      {/* <TableCell>
                        <Tooltip title="Click for More Information">
                          <IconButton
                            aria-label="expand row"
                            size="small"
                            onClick={() => setOpen(!open)}
                            onHover
                          >
                            {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                          </IconButton>
                        </Tooltip>
                      </TableCell> */}
                      <TableCell  sx={{ textAlign:'center'}}>
                        <Typography variant="subtitle2" gutterBottom component="div">
                          {row.TimeGenerated}
                        </Typography>
                      </TableCell>
                      <TableCell component="th" scope="row" sx={{ textAlign:'center'}}>
                        <Typography variant="subtitle2" gutterBottom component="div">
                          {row.ServerName}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ textAlign:'center'}}>
                        <Typography variant="subtitle2" gutterBottom component="div">
                          {row.AverageUtilization}
                        </Typography>  
                      </TableCell>
                      {subHeader=="Disk Utilization"?
                        <TableCell sx={{ textAlign:'center'}}>
                          <Typography variant="subtitle2" gutterBottom component="div">
                            {row.DriveName}
                          </Typography>  
                        </TableCell>:""
                      }
                      <TableCell sx={{ textAlign:'center'}}>
                        <Typography variant="subtitle2" gutterBottom component="div">
                          {row.HostingType}
                        </Typography>  
                      </TableCell>
                    </StyledTableRow>
                  ))}
                </TableBody>
              </Table>
              
            </TableContainer>
            <TablePagination
                rowsPerPageOptions={[5,7]}
                component="div"
                count={logs.length}
                rowsPerPage={rowsPerPage}
                page={page}
                onPageChange={handleChangePage}
                onRowsPerPageChange={handleChangeRowsPerPage}
            />
          </Paper>
        </Grid>
      </Grid> 

    );
  }

    return (

      <Grid container m={2} p={2}>
        {(!filterChoiceSwitchButtton && (((loading["serverList"] || loading["rebootEvent"] || loading["serverEnvironment"] || loading["windowsEvent"]) && tabChange==0) 
        || 
        ((loading["serverCpuUtilization"] || loading["serverCpuUtilizationLogs"] || loading["serverDiskUtilization"] || loading["serverDiskUtilizationLogs"] || loading["serverMemoryUtilization"] || loading["serverMemoryUtilizationLogs"]) && tabChange==1)))
        ||
        (filterChoiceSwitchButtton && (((loading_SubRg["serverList"] || loading_SubRg["rebootEvent"] || loading_SubRg["serverEnvironment"] || loading_SubRg["windowsEvent"]) && tabChange==0) 
        || 
        ((loading_SubRg["serverCpuUtilization"] || loading_SubRg["serverCpuUtilizationLogs"] || loading_SubRg["serverDiskUtilization"] || loading_SubRg["serverDiskUtilizationLogs"] || loading_SubRg["serverMemoryUtilization"] || loading_SubRg["serverMemoryUtilizationLogs"]) && tabChange==1)))
         ? 
          <Grid container md={12}>
            <Grid md={12} m={0}>
              <Typography variant="h6" className="fst-italic">
                Infrastructure Telemetry
              </Typography>
            </Grid>
            <Grid md={12}>
              <LinearProgress/>
            </Grid>
          </Grid>
        :
          <Grid container md={12}>
            <Grid md={12} m={0}>
              <Divider>
                <Typography variant="h6" className="fst-italic">
                  Infrastructure Telemetry
                </Typography>
              </Divider>
            </Grid>
          </Grid>
        }

        <Grid md={12} m={2}>
          <Tabs value={tabChange} onChange={handleTabChange} centered>
            <Tab label="Server Inventory" />
            <Tab label="Server Metrics" />
            {/* <Tab label="WorkStation Metrics" /> */}
          </Tabs>
        </Grid>
        <Grid md={12} m={1} container key="filter" alignItems="center" justifyContent="center">
          <Grid md={1}>
            {(tabChange==1 && 
            ((!filterChoiceSwitchButtton && (loading["serverCpuUtilization"] || loading["serverCpuUtilizationLogs"] || loading["serverDiskUtilization"] || loading["serverDiskUtilizationLogs"] || loading["serverMemoryUtilization"] || loading["serverMemoryUtilizationLogs"]))
            ||
            (filterChoiceSwitchButtton && (loading_SubRg["serverCpuUtilization"] || loading_SubRg["serverCpuUtilizationLogs"] || loading_SubRg["serverDiskUtilization"] || loading_SubRg["serverDiskUtilizationLogs"] || loading_SubRg["serverMemoryUtilization"] || loading_SubRg["serverMemoryUtilizationLogs"]))
            ))?
            <Tooltip title="Please Wait until the page Loads">
              <Grid>
                
                  <Switch
                    disabled
                    checked={filterChoiceSwitchButtton}
                    onChange={handleFilterDisplayed}
                    inputProps={{ 'aria-label': 'controlled' }}
                  />
                
              </Grid>
            </Tooltip>
            :
            <Grid>
              <Switch
                checked={filterChoiceSwitchButtton}
                onChange={handleFilterDisplayed}
                inputProps={{ 'aria-label': 'controlled' }}
              />
            </Grid>
            }
            
            <Grid>
              <Typography variant="subtitle.1">{filterChoiceSwitchButtton?"SubRG Filter":"App Filter"}</Typography>
            </Grid>
            
          </Grid>
          {!filterChoiceSwitchButtton? 
            Object.entries(filterData).map(([key, val])=>(
              <Grid md={2} m={1}>
                <Autocomplete
                  multiple
                  id="tags-standard"
                  options={val}
                  getOptionLabel={(option) => option}
                  onChange = {(event, value)=>handleFilterChange(event, value, key)}
                  //onInputChange = {(event, value)=>handleFilterChange(event, value, key)}
                  defaultValue={filterOptions[key][0]!="All"?filterOptions[key]:[]}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      variant="standard"
                      label= {key.charAt(0).toUpperCase() + key.slice(1)}
                      placeholder=""
                    />
                  )}
                />
              </Grid> 
            )):
            <Grid container md={8} m={2} alignItems="center" justifyContent="center">
              <Grid md={5} m={2}>
                <Autocomplete
                  multiple
                  id="tags-standard"
                  options={[...new Set(Object.values(filterData_SubRg["subRg"]))]}
                  getOptionLabel={(option) => option}
                  onChange = {(event, value)=>handleFilterChange_SubRg(event, value, "subRg")}
                  defaultValue={filterOptions_SubRg["subRg"][0]!="All"?filterOptions_SubRg["subRg"]:[]}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      variant="standard"
                      label= "Subscription/RG"
                      placeholder=""
                    />
                  )}
                />
              </Grid>
              <Grid md={2} m={2}>
                <Autocomplete
                  id="tags-standard"
                  options={[...new Set(Object.values(filterData_SubRg["serverName"]))]}
                  getOptionLabel={(option) => option}
                  onChange = {(event, value)=>handleFilterChange_SubRg(event, value, "serverName")}
                  // //onInputChange = {(event, value)=>handleFilterChange(event, value, key)}
                  defaultValue={filterOptions_SubRg["serverName"][0]!="All"?filterOptions_SubRg["serverName"]:""}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      variant="standard"
                      label= "ServerName"
                      placeholder=""
                    />
                  )}
                />
              </Grid>
            </Grid>
            }
            <Grid md={2}>
              <Button variant="outlined" color="primary" onClick={(e)=>{handleGetDataButtonClick(e)}} startIcon={<SendIcon />}>
                Get Data
              </Button>
            </Grid>
        </Grid>
        
        {tabChange==0 ? 
          <Grid container md={12} mt={2}>
            <Grid md={12} container alignItems="center" justifyContent="center">
              {/* <Grid md={4}>
                <PieGraph data={[
                    { id: 0, value: serverList["VmsUp"], label: 'VM Up - ' + serverList["VmsUp"]},
                    { id: 1, value: serverList["VmsDeallocated"], label: 'VM Deallocated - '+ serverList["VmsDeallocated"]}
                  ]} 
                />
              </Grid> */}
              <Grid md={4}>
                <PieGraph data={[
                    { id: 0, value: serverEnvironment["Production"], label: 'Production ('+serverEnvironment["Production"]+')' },
                    { id: 1, value: serverEnvironment["Development"], label: 'Development ('+serverEnvironment["Development"]+')' },
                    { id: 2, value: serverEnvironment["Test"], label: 'Test ('+serverEnvironment["Test"]+')' }
                  ]} 
                />
              </Grid>

              <Grid md={4}>
                <PieGraph data={[
                    { id: 0, value: windowsEvent["ApplicationLogs"], label: 'Application Logs' },
                    { id: 1, value: windowsEvent["SystemLogs"], label: 'System Logs' },
                    { id: 2, value: windowsEvent["SecurityLogs"], label: 'Security Logs' }
                  ]} />
              </Grid>

              <Grid md={4}>
                <PieGraph data={[
                    { id: 0, value: rebootEvent["GracefulReboot"], label: 'Graceful Reboot' },
                    { id: 1, value: rebootEvent["CrashReboot"], label: 'Crash Reboot' },
                  ]} 
                /> 
              </Grid>
            </Grid>
            <Grid container md={12} mt={2} alignItems="center" justifyContent="center">
              <ServerInventoryTable/>
            </Grid>
            
          </Grid> 
          : 
          (tabChange==1 ?
            (!filterChoiceSwitchButtton ? 
            (<Grid md={12}>
              <ServerUtilizationUI 
                  subHeader="CPU Utilization" 
                  utilization={Object.keys(serverCpuUtilization).length>0? Object.keys(serverCpuUtilization["ServerName"]).length:""} 
                  graph={Object.keys(serverCpuUtilizationLogs).length>0?[graphServerMetrics(serverCpuUtilizationLogs, "TimeGenerated", "cpu"),graphServerMetrics(serverCpuUtilizationLogs, "AvgValue", "cpu")]
                        :
                        [[],[]]
                        } 
                  logs={Object.keys(serverCpuUtilizationLogs).length>0?graphServerLogs(serverCpuUtilizationLogs,"cpu")
                        :
                        []
                        }
                  label={serverNameFilterCpu}
                  filter={Object.keys(serverCpuUtilization).length>0? Object.values(serverCpuUtilization["ServerName"]):[]}
                />

                <ServerUtilizationUI 
                  subHeader="Memory Utilization" 
                  utilization={Object.keys(serverMemoryUtilization).length>0? Object.keys(serverMemoryUtilization["ServerName"]).length:""} 
                  graph={Object.keys(serverMemoryUtilizationLogs).length>0?[graphServerMetrics(serverMemoryUtilizationLogs, "TimeGenerated", "memory"),graphServerMetrics(serverMemoryUtilizationLogs, "AvgValue", "memory")]
                        :
                        [[],[]]
                        } 
                  logs={Object.keys(serverMemoryUtilizationLogs).length>0?graphServerLogs(serverMemoryUtilizationLogs,"memory")
                      :
                      []
                      }
                  label={serverNameFilterMemory}
                  filter={Object.keys(serverMemoryUtilization).length>0? Object.values(serverMemoryUtilization["ServerName"]):[]}
                />
                
                <ServerUtilizationUI 
                  subHeader="Disk Utilization" 
                  utilization={Object.keys(serverDiskUtilization).length>0? Object.keys(serverDiskUtilization["ServerName"]).length:""} 
                  graph={Object.keys(serverDiskUtilizationLogs).length>0?[graphServerMetrics(serverDiskUtilizationLogs, "TimeGenerated", "disk"),graphServerMetrics(serverDiskUtilizationLogs, "AvgValue" ,"disk")]
                        :
                        [[],[]]
                        }
                  logs={Object.keys(serverDiskUtilizationLogs).length>0?graphServerLogs(serverDiskUtilizationLogs,"disk")
                      :
                      []
                      }
                  label={serverNameFilterDisk}
                  filter={Object.keys(serverDiskUtilization).length>0? Object.values(serverDiskUtilization["ServerName"]):[]}
                /> 
              
            </Grid>) :(
            <Grid md={12}>
              <ServerUtilizationUI 
                  subHeader="CPU Utilization" 
                  utilization={Object.keys(serverCpuUtilization_SubRg).length>0? Object.keys(serverCpuUtilization_SubRg["ServerName"]).length:""} 
                  graph={Object.keys(serverCpuUtilizationLogs_SubRg).length>0?[graphServerMetrics(serverCpuUtilizationLogs_SubRg, "TimeGenerated", "cpu"),graphServerMetrics(serverCpuUtilizationLogs_SubRg, "AvgValue", "cpu")]
                        :
                        [[],[]]
                        } 
                  logs={Object.keys(serverCpuUtilizationLogs_SubRg).length>0?graphServerLogs(serverCpuUtilizationLogs_SubRg,"cpu")
                        :
                        []
                        }
                  label={serverNameFilterCpu_SubRg}
                  filter={Object.keys(serverCpuUtilization_SubRg).length>0? Object.values(serverCpuUtilization_SubRg["ServerName"]):[]}
                />
                <ServerUtilizationUI 
                  subHeader="Memory Utilization" 
                  utilization={Object.keys(serverMemoryUtilization_SubRg).length>0? Object.keys(serverMemoryUtilization_SubRg["ServerName"]).length:""} 
                  graph={Object.keys(serverMemoryUtilizationLogs_SubRg).length>0?[graphServerMetrics(serverMemoryUtilizationLogs_SubRg, "TimeGenerated", "memory"),graphServerMetrics(serverMemoryUtilizationLogs_SubRg, "AvgValue", "memory")]
                        :
                        [[],[]]
                        } 
                  logs={Object.keys(serverMemoryUtilizationLogs_SubRg).length>0?graphServerLogs(serverMemoryUtilizationLogs_SubRg,"memory")
                        :
                        []
                        }
                  label={serverNameFilterMemory_SubRg}
                  filter={Object.keys(serverMemoryUtilization_SubRg).length>0? Object.values(serverMemoryUtilization_SubRg["ServerName"]):[]}
                />
                <ServerUtilizationUI 
                  subHeader="Disk Utilization" 
                  utilization={Object.keys(serverDiskUtilization_SubRg).length>0? Object.keys(serverDiskUtilization_SubRg["ServerName"]).length:""} 
                  graph={Object.keys(serverDiskUtilizationLogs_SubRg).length>0?[graphServerMetrics(serverDiskUtilizationLogs_SubRg, "TimeGenerated", "disk"),graphServerMetrics(serverDiskUtilizationLogs_SubRg, "AvgValue", "disk")]
                        :
                        [[],[]]
                        } 
                  logs={Object.keys(serverDiskUtilizationLogs_SubRg).length>0?graphServerLogs(serverDiskUtilizationLogs_SubRg,"disk")
                        :
                        []
                        }
                  label={serverNameFilterDisk_SubRg}
                  filter={Object.keys(serverDiskUtilization_SubRg).length>0? Object.values(serverDiskUtilization_SubRg["ServerName"]):[]}
                />
            </Grid>
            )
            )
          :
          (tabChange==2 ?
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'center' }}>
              {/* {cardData.map((card, index) => (
                <GreenCards key={index} heading={card.heading} buttons={card.buttons} />
              ))} */}
            </Box>
            :
            <Grid></Grid>
          )
        )}   
      </Grid>
      
    );
}

export default InfrastructureTelemetry;