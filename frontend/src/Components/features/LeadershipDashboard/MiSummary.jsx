import React, { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom';
import TimelineFilter from '../../shared/Timestamp/Timestamp';
import Grid from '@mui/material/Unstable_Grid2';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import { BarChart, Bar, Area, LineChart, Line, CartesianGrid, XAxis, YAxis, Legend, LabelList, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart } from 'recharts';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import NetworkGraph from '../../shared/NetworkGraph/NetworkGraph'
import Button from '@mui/material/Button';
import AreaLineChart from '../../shared/LineChart/AreaLineChart'
import Graph from 'react-vis-network-graph'
import serverImage from '../../Static/Images/serverImage.jpg'
import winServiceImage from '../../Static/Images/winServiceImage.png'
import CpInterfaceImage from '../../Static/Images/CpInterfaceImage.jpg'
import Alert from '@mui/material/Alert';
import { Popper, CardHeader, List, ListItem, Modal, TableContainer, TablePagination,Accordion, AccordionSummary, AccordionDetails, Card, CardContent, CardActions } from '@mui/material';
import CircleIcon from '@mui/icons-material/Circle';
import RadioButtonCheckedOutlinedIcon from '@mui/icons-material/RadioButtonCheckedOutlined';
import Tooltip from '@mui/material/Tooltip';
import InfoIcon from '@mui/icons-material/Info';
import { keyframes } from '@mui/material';
import CircularProgress from '@mui/material/CircularProgress';
import { styled } from '@mui/material/styles';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell,{ tableCellClasses } from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import SendIcon from '@mui/icons-material/Send';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import IconButton from '@mui/material/IconButton';
import UpTimeIcon from '../../Static/Images/UpTime.svg'
import RebootIcon from '../../Static/Images/Reboots.svg'
import AutoRestartIcon from '../../Static/Images/AutoRestart.svg'
import EventLogsIcon from '../../Static/Images/EventLog.svg'
import {getUrl} from '../../../environment'

export default function MiSummaryAnalysis({date, appInsights, globalFilterData}) {

  // if(appInsights){
  //   console.log("AppInsights in MI summary")
  // }
  // else{
  //   console.log("AppInsights not present in MI")
  // }

  
  
  var location = useLocation();

  // //var baseUrl =  "http://100.100.129.88:9090/api/"
  //var baseUrl =  "http://127.0.0.1:5000/api/"

  // //var baseUrl =  "https://itelemetry.providence.org/api/"
  console.log(location.pathname)
  var baseUrl = getUrl()

  const [entryTime, setEntryTime] = useState(null);
              
  useEffect(() => {
    const currentTime = Date.now();
    setEntryTime(currentTime);
    console.log('Page Entry Time:', currentTime);  // Debugging statement
  
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
            page: location.pathname,
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

  var styleCard = (clicked)=>({
    position: 'relative', 
    flex:1,
    background: clicked ? 'linear-gradient(to right, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.1) 70%, rgba(0,0,0,0.3) 100%)' : 'white',
    overflow: 'hidden', 
    '&:hover .overlay': clicked ? { opacity: 0, } : { opacity: 1, },
    transition: 'background 0.5s', 
    '&:hover': 
    { 
      background: 'linear-gradient(to right, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.1) 70%, rgba(0,0,0,0.3) 100%)', //#ff7e5f, #feb47b
      color: 'white' //linear-gradient(to right, rgba(0,51,142,0.2) 0%, rgba(0,51,142,0.6) 100%)
    },
    cursor: "pointer",
    opacity:1,
    borderRadius:{
      xs: '4px', // Border radius for extra small screens
      sm: '6px', // Border radius for small screens
      md: '8px', // Border radius for medium screens
      lg: '10px', // Border radius for large screens
    }
  })

  const overlayStyle = { 
    position: 'absolute', 
    bottom: 0, 
    left: 0, width: '100%', 
    backgroundColor: 'rgba(0, 0, 0, 0.2)', // 20% opacity black 
    display: 'flex', justifyContent: 'center', 
    alignItems: 'center', opacity: 0, transition: 'opacity 0.5s', 
    color: 'white'
  }

  const overlayLoaderStyle = (isLoading)=> ({ 
    position: 'absolute', 
    top: 0, 
    left: 0, width: '100%', height :'100%',
    backgroundColor: 'rgba(0, 0, 0, 0.5)', // 20% opacity black 
    display: isLoading ? 'flex' : 'none', 
    justifyContent: 'center', 
    alignItems: 'center', opacity: 0, transition: 'opacity 0.5s', 
    color: 'white'
  })

  var styleAccordian = (loading)=>({
    position: 'relative', 
    flex:1,
    background: '#f5f6fa',
    overflow: 'hidden', 
    padding: "10px",
    '.overlayLoader': loading ? { opacity: 1, } : { opacity: 0, },
  })

  var LineGraph = ({data}) => {
    var [yMax, setYMax] = useState(0)
    useEffect(()=>{
      var maxValue = []
      data.forEach(element => {
        Object.keys(element).filter((key)=>key!="name").map((key)=>{
          maxValue.push(element[key])
        })
      });
      setYMax(Math.max(...maxValue))
    },[data])

    const colors = [
      "#8884d8", '#2986cc'
    ];

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
    //console.log(data)
    return <ResponsiveContainer width="100%" height={300}> 
    
      <AreaChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        {colors.map((val,index)=>(
          <defs>
            <linearGradient id={index} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={colors[index]} stopOpacity={0.8} />
              <stop offset="95%" stopColor={colors[index]} stopOpacity={0} />
            </linearGradient>
          </defs>
        ))}
        
        {/* <CartesianGrid stroke="#ccc" strokeDasharray="5 5" />  */}
        <XAxis dataKey="name" /> 
        <YAxis domain={[0,yMax+3]} /> 
        <RechartsTooltip /> 
        <Legend /> 
        {data.length>0 ? 
          Object.keys(data[0]).filter((key)=>key!="name").map((key, index)=>{
            return <Area type="monotone" dataKey={key} stroke={colors[index]} fillOpacity={1} fill={"url(#"+index+")"} dot={true}> 
              <LabelList dataKey={key} position="top" />
            </Area>
          })
          :
          ""
        }
      </AreaChart>
    </ResponsiveContainer>
  }

  var BarGraph = ({data, colors}) => {
    var [yMax, setYMax] = useState(0)

    useEffect(()=>{
      var maxValue = []
      data.forEach(element => {
        Object.keys(element).filter((key)=>key!="name").map((key)=>{
          maxValue.push(element[key])
        })
      });
      //console.log(Math.max(...maxValue))
      setYMax(Math.max(...maxValue))
    },[data])

    const renderCustomLabel = (props) => {
      const { x, y, width, height, value } = props;
      return (
        <text
          x={x + width / 2}
          y={y + height / 2}
          fill="white"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {value==0?"":value}
        </text>
      );
    };
    
    //console.log(data)
    return <ResponsiveContainer width="100%" height={300}> 
      <BarChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}> 
        {/* <CartesianGrid stroke="#ccc" strokeDasharray="5 5" />  */}
          <XAxis dataKey="name" /> 
          <YAxis domain={[0,yMax+2]} /> 
          <RechartsTooltip /> 
          <Legend /> 
          {data.length>0 ? 
            Object.keys(data[0]).filter((key)=>key!="name").map((key, index)=>{
              return <Bar dataKey={key} stackId={"a"} fill={colors[index]}>
                <LabelList dataKey={key} content={renderCustomLabel} />
              </Bar>
            })
            :
            ""
          }
        </BarChart> 
    </ResponsiveContainer>
  }

  var TableOnClick = ({data, headerArr, type, filter, clicked}) =>{

    var [rowsPerPage, setRowsPerPage] = useState(5)
    var [page, setPage] = useState(0)
    var [tableData, setTableData] = useState({})
    var [tableCount, setTableCount] = useState(0)
    var [filterTable, setFilterTable] = useState("")
    var [filterKeys, setFilterKeys] = useState([])
    
    useEffect(()=>{
      setPage(0)
    },[clicked])

    useEffect(()=>{
      //console.log(data, filter)
      setTableData(data)
    },[data])

    useEffect(()=>{
      setFilterTable(filter)
    },[filter])

    useEffect(()=>{
      
      if(Object.keys(data).length>0){
        
        var filterKeysLocal = []
        Object.keys(filterTable).map((col)=>{
          var keys = Object.keys(data[headerArr[0]]).filter((key)=>data[col][key]==filterTable[col])
          if(filterKeysLocal.length==1){
            var key1 = filterKeysLocal.pop()
            const intersection = key1.filter(value => keys.includes(value));
            filterKeysLocal.push(intersection)
          }
          else{
            filterKeysLocal.push(keys)
          }
        })
        //console.log(filterKeysLocal)
        if(filterKeysLocal.length==0){
          setFilterKeys(Object.keys(data[headerArr[0]]))
        }
        else{
          setFilterKeys(filterKeysLocal[0])
        }
        
      }
    },[tableData, filterTable])

    useEffect(()=>{
      setTableCount(filterKeys.length)
    },[filterKeys])

    var handlePageChange = (event, value) =>{
        // console.log(value)
        setPage(value)
    }

    var handleRowsChange = (event) => {
        // console.log(value)
        setRowsPerPage(event.target.value)
        setPage(0)
    }

    var handleFilterChange = (value, key) => {
      console.log(value, key)
      if(value==null){
        console.log(value, key)
        var {[key]:_, ...newFilterTable} = filterTable
        setFilterTable(newFilterTable)
      }
      else{
        setFilterTable((prevStatus)=>({
          ...prevStatus,
          [key]:value
        }))
      }
      
    }
    var getOptionsFilter = (header) => {
      var options=[]
      Object.keys(tableData[header]).filter((key)=>filterKeys.includes(key)).map((key)=>{
        options.push(tableData[header][key])
      })
      return options
    }

    var TableCustomRow = ({index}) => {
      //console.log(index)
      const [open, setOpen] = useState(false);
      
      return(
        <React.Fragment>
          <TableRow sx={{cursor:'pointer'}} onClick={()=>type=="appOnboarding"?"":setOpen(!open)}>
            {type=="miSummary" ?
              <Tooltip title="Click for More Info">
                
                <TableCell>
                  <IconButton
                    aria-label="expand row"
                    size="small"
                    onClick={() => setOpen(!open)}
                  >
                    {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                  </IconButton>
                </TableCell> 
                
              </Tooltip>
              : 
              ""
            }
            {headerArr.map((col)=>{
              return( 
                  <TableCell>{tableData[col][index]}</TableCell>
              )
            })}
            {type=="miSummary" ? 
              // <TableCell>
              //   <Grid container md={12} spacing={1} direction={"row"}>
              //     <Typography>This Text is a rough one</Typography>
              //   </Grid>
              // </TableCell>    
              ""
            :
              (clicked["Onboarded"] ? 
                (<TableCell>
                  <Grid container spacing={1} direction={"row"} justifyContent={"center"} alignItems={"center"}>
                    <Tooltip title="This feature is under development">
                      <Grid item xs={12} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        <Button variant="outlined" endIcon={<SendIcon />} disabled>
                          More Details
                        </Button>       
                      </Grid>
                    </Tooltip>
                  </Grid>
                </TableCell>)
              : 
              ""
              )
            }
          </TableRow>
          <TableRow>
            <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={12}>
              <Collapse in={open} timeout="auto" unmountOnExit>
                <Box sx={{ margin: 1 }}>
                  <Typography variant="h6" gutterBottom component="div">
                    More Information
                  </Typography>
                  <Table size="small">
                    <TableBody>
                      {Object.keys(tableData).filter((col)=>!(headerArr.includes(col))).map((column) => (
                        <TableRow key={index}>
                          <TableCell component="th" scope="row">
                            {column}
                          </TableCell>
                          <TableCell>{tableData[column][index]}</TableCell>
                        </TableRow>
                      ))}
                      {/* <TableRow>
                        <TableCell component="th" scope="row">
                          Itelemetry Observation
                        </TableCell>
                        <TableCell>Lorem, ipsum dolor sit amet consectetur adipisicing elit. Laudantium laboriosam eaque vero molestiae blanditiis ipsa assumenda voluptatem! Et, delectus necessitatibus. Culpa iste aspernatur minus quisquam maxime doloremque temporibus nihil quam?</TableCell>
                      </TableRow> */}
                    </TableBody>
                  </Table>
                </Box>
              </Collapse>
            </TableCell>
          </TableRow>
        </React.Fragment>
      )
    }

    return (
      <TableContainer>
        <Table aria-label="customized table" > 
            <TableHead stickyHeader>
              <TableRow>
                  {type=="miSummary" ? <TableCell ></TableCell>:""}
                  {Object.keys(tableData).map((header)=>{
                    return (headerArr.includes(header)) ? 
                    (["Application Family"].includes(header) ? 
                      <Autocomplete
                        options={getOptionsFilter(header)}
                        renderInput={(params) => (
                            <TextField {...params} label={header} variant="standard" />
                        )}
                        //PopperComponent={(props) => <StyledPopper {...props}/>}
                        onChange={(event,value)=>handleFilterChange(value, header)}
                        sx={{ display:"flex", width: '80%', alignItems : "center" }} 
                      /> 
                      : 
                      <TableCell>{header}</TableCell>
                    )
                    :
                    ("")
                  })}
                  {/* {type=="miSummary" && Object.keys(tableData).length>0 ? <TableCell>Alerts Summary</TableCell>:<TableCell></TableCell>} */}
              </TableRow>
            </TableHead>
            {Object.keys(tableData).length>1 ? 
            <TableBody>
              {Object.keys(tableData[headerArr[0]]).filter((key)=>filterKeys.includes(key)).slice(page*rowsPerPage,(page*rowsPerPage)+rowsPerPage).map((ind)=>{
                return <TableCustomRow index={ind}/>
              })}
            </TableBody> 
            : 
            ""
            }
        </Table>
        <TablePagination
            component="div"
            rowsPerPageOptions={[5, 10, 20]}
            count = {tableCount}
            page = {page}
            rowsPerPage={rowsPerPage}
            onPageChange={handlePageChange}
            onRowsPerPageChange={handleRowsChange}
        />
      </TableContainer>
    )
  }

  const getWeekOfMonth = (date) => { 
    const now = new Date(date); 
    const start = new Date(now.getFullYear(), now.getMonth(), 1); 
    const diff = now.getDate() - start.getDate() + start.getDay(); 
    return Math.ceil(diff / 7); 
  }; 
  
  const getMonthAndWeek = (startDate) => { 
    const start = new Date(startDate); 
    var weeks = []; 
    let current = start; 
    
    const week = getWeekOfMonth(current); 
    const month = current.toLocaleString('default', { month: 'long' }); 
    const year = current.getFullYear()
    weeks={ 
      week, 
      month,
      year
    }; 
    return weeks; 
  };

  var MiSummary=()=>{
    var [cardInfo, setCardInfo] = useState({
      "Total MI's" : "",
      "MI 1" : "",
      "MI 2" : "",
      "MI 3" : "",
    })
    var [isClicked, setIsCLicked] = useState({
      "Total MI's" : true,
      "MI 1" : false,
      "MI 2" : false,
      "MI 3" : false,
    })
    const miNameMapping = {
      "Total MI's" : "",
      "MI 1" : "1 - Critical",
      "MI 2" : "2 - High",
      "MI 3" : "3 - Moderate",
    }
    var icon_gradient = {
      "Total MI's" : {"icon":UpTimeIcon,"gradient":'linear-gradient(to bottom, lightgrey, white)', "color":"#000000"},
      "MI 1" : {"icon":UpTimeIcon,"gradient":'linear-gradient(to bottom, lightgrey, white)', "color":"#000000"},
      "MI 2" : {"icon":UpTimeIcon,"gradient":'linear-gradient(to bottom, lightgrey, white)', "color":"#000000"},
      "MI 3" : {"icon":UpTimeIcon,"gradient":'linear-gradient(to bottom, lightgrey, white)', "color":"#000000"}
    }
    var [isLoading, setIsLoading] = useState(true)

    // var [date, setDate] = useState({
    //   startDate: "", endDate: ""
    // })

    const [expanded, setExpanded] = useState(true); 

    var [graphData, setGraphData] = useState([])
    var [incidentCountGraphData, setIncidentCountGraphData] = useState([])
    var [incidentDurationGraphData, setIncidentDurationGraphData] = useState([])
    var [accountabilityGraphData, setAccountabilityGraphData] = useState([])
    var [incidentData, setIncidentData] = useState({})
    var [incidentTableData, setIncidentTableData] = useState({})
    var [filter, setFilter] = useState({})
    var [trendFilter, setTrendFilter] = useState("Weekly")

    // const handleRangeSelect = (start, end) => {
    //   //console.log(start, end)
    //   setDate({ startDate: start, endDate: end });
    // };
    
    const handleAccordionChange = (event, newExpanded) => { 
      setExpanded(true);
    }

    var handleCardClick = (id) =>{
      //setPage(0)
      Object.keys(cardInfo).map((ind)=>{
        if(ind==id){
          if(id=="Total MI's"){
            const { "PriorityLabel": _, ...newFilter } = filter;
            setFilter(newFilter); 
          }
          else{
            setFilter({"PriorityLabel":miNameMapping[ind]})
          }
          setIsCLicked((prevStatus)=>({
            ...prevStatus,
            [ind] : true
          }))
          
        }
        else{
          setIsCLicked((prevStatus)=>({
            ...prevStatus,
            [ind] : false
          }))
        }
      })
    }

    var handleTrendFilterChange = (value) => {
      setTrendFilter(value)
    }

    useEffect(()=>{
      //console.log(date)
      if(date["startDate"]!=""){
        setIsLoading(true)
        //console.log(getMonthAndWeek(date["startDate"]))
        setAccountabilityGraphData([])
        setGraphData([])
        setIncidentTableData({})
        setIncidentCountGraphData([])
        setIncidentDurationGraphData([])
        fetchIncidentData("no", "yes")
      }
    }, [date])

    useEffect(()=>{
      if(Object.keys(incidentData).length>=1){
        setCardInfo((prevStatus)=>({
          ...prevStatus,
          "Total MI's" : Object.keys(incidentData["Number"]).length,
          "MI 1" : Object.keys(incidentData["Number"]).filter((key)=>incidentData["PriorityLabel"][key].startsWith('1')).length,
          "MI 2" : Object.keys(incidentData["Number"]).filter((key)=>incidentData["PriorityLabel"][key].startsWith('2')).length,
          "MI 3" : Object.keys(incidentData["Number"]).filter((key)=>[3,4,5].includes(parseInt(incidentData["PriorityLabel"][key][0],10))).length
        }))
      }
      if(Object.keys(incidentData).length>1){
        fetchIncidentObservation()
        var miLabel_filter = []
        var tempDictionary = {}
        var tempDictionary_AppWiseCount = {}
        var tempDictionary_AppWiseDuration = {}
        Object.keys(isClicked).filter((i)=>isClicked[i]===true)
        .map((i)=>{
          if(i==="Total MI's"){
            miLabel_filter = ["MI 1", "MI 2", "MI 3"]
          }
          else{
            miLabel_filter.push(i)
          }
        })
        Object.keys(incidentData["Number"]).map((ind)=>{
          var miLabel = parseInt(incidentData["PriorityLabel"][ind][0], 10)
          miLabel = miLabel>=3 ? "3" : incidentData["PriorityLabel"][ind][0]
          if(miLabel_filter.includes("MI "+miLabel)){
            var weekMonth = getMonthAndWeek(incidentData["StartDateTime"][ind])
            if(trendFilter=="Weekly"){
              var key = "Week "+weekMonth["week"]+" - "+weekMonth["month"]
            }
            else{
              var key = weekMonth["month"]
            }
            if(!(key in tempDictionary)){
              tempDictionary[key] = {
                "name" : key,
                // "MI 1(Count)" : 0,
                // "MI 2(Count)" : 0,
                // "MI 3(Count)" : 0
              }
              miLabel_filter.map((i)=>{
                tempDictionary[key][i+"(Count)"] = 0
              })
              
            }
            
            tempDictionary[key]["MI "+miLabel+"(Count)"]+=1

            var appFamily = incidentData["AppFamily"][ind]
            if(!(appFamily in tempDictionary_AppWiseCount)){
              tempDictionary_AppWiseCount[appFamily] = {"name":appFamily
                // , "MI 1(Count)":0, "MI 2(Count)":0, "MI 3(Count)":0
              }
              miLabel_filter.map((i)=>{
                tempDictionary_AppWiseCount[appFamily][i+"(Count)"] = 0
              })
            } 
            if(!(appFamily in tempDictionary_AppWiseDuration)){
              tempDictionary_AppWiseDuration[appFamily] = {"name":appFamily, 
                // "MI 1(Duration in hours)":0, "MI 2(Duration in hours)":0, "MI 3(Duration in hours)":0
              }
              miLabel_filter.map((i)=>{
                tempDictionary_AppWiseDuration[appFamily][i+"(Duration in hours)"] = 0
              })
            } 
            tempDictionary_AppWiseCount[appFamily]["MI "+miLabel+"(Count)"]+=1
            tempDictionary_AppWiseDuration[appFamily]["MI "+miLabel+"(Duration in hours)"]+=parseInt(incidentData["Resolution Time(Hours)"][ind])
          }
          
        })
        console.log(tempDictionary_AppWiseDuration)
        console.log(tempDictionary)
        console.log(tempDictionary_AppWiseCount)
        setIncidentCountGraphData(Object.values(tempDictionary_AppWiseCount))
        setIncidentDurationGraphData(Object.values(tempDictionary_AppWiseDuration))
        setGraphData(Object.keys(tempDictionary).length>0 ? Object.values(tempDictionary) : [])
      }
      
    }, [incidentData, trendFilter, isClicked])

    useEffect(()=>{
      if(Object.keys(incidentTableData).length>1){
        var miLabel_filter = []
        Object.keys(isClicked).filter((i)=>isClicked[i]===true)
        .map((i)=>{
          if(i==="Total MI's"){
            miLabel_filter = ["MI 1", "MI 2", "MI 3"]
          }
          else{
            miLabel_filter.push(i)
          }
        })
        var tempDictionary = {}
        Object.keys(incidentTableData["Number"]).map((ind)=>{
          var miLabel = parseInt(incidentData["PriorityLabel"][ind][0], 10)
          miLabel = miLabel>=3 ? "3" : incidentData["PriorityLabel"][ind][0]
          if(miLabel_filter.includes("MI "+miLabel)){
            var weekMonth = getMonthAndWeek(incidentTableData["StartDateTime"][ind])
            if(trendFilter=="Weekly"){
              var key = "Week "+weekMonth["week"]+" - "+weekMonth["month"]
            }
            else{
              var key = weekMonth["month"]
            }
            
            if(!(key in tempDictionary)){
              tempDictionary[key] = {
                "name" : key,
                "CRCA" : 0,
                "TEO" : 0,
                "Vendor" : 0,
                "TEO/CRCA" : 0
              }
            }
            //console.log(incidentTableData["Accountability"][ind])
            var accountabilityLabel = incidentTableData["Accountability"][ind].split("-")[0].trim()
            if(accountabilityLabel!="NA"){
              tempDictionary[key][accountabilityLabel]+=1
            }
          }
        })
        setAccountabilityGraphData(Object.values(tempDictionary))
        console.log(tempDictionary)
      }
    }, [incidentTableData, trendFilter, isClicked])

    var fetchIncidentObservation = () => {
      var incidentList = Object.values(incidentData["Number"])
      var incString = ""
      var incList = []
      incidentList.map((inc)=>{
        incString= incString + "'"+ inc +"',"
        incList.push(inc)
      })
      incString = incString.slice(0,-1)
      console.log(incString)

      var params = {"incidentList" : incList}
      var url = new URL(baseUrl + 'incidentObservation');
      
      //url.search = new URLSearchParams(params).toString();
      console.log(url)
      fetch(url,{
        method:'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params)
      })
        .then((response) => response.json())
        .then((data) =>{ 
          // console.log("Incidents Observation")
          console.log(data)
          console.log(JSON.parse(data["incidentObservation"]))
          var obsData = JSON.parse(data["incidentObservation"])
          var dictObservation = {}
          if(Object.keys(obsData).length>0){
            Object.keys(obsData["Number"]).map((key)=>{
              dictObservation[obsData["Number"][key]] = {
                "iTelemetry Observation":obsData["iTelemetry Observation"][key],
                "Problem Category":obsData["Problem Category"][key],
                "Accountability":obsData["Accountability"][key],
                "Alert Summary":obsData["Alert Summary"][key]
              }
            })
          }
          var incTableData = incidentData
          incTableData["iTelemetry Observation"] = {}
          incTableData["Problem Category"] = {}
          incTableData["Accountability"] = {}
          incTableData["Alert Summary"] = {}
          
          Object.keys(incTableData["Number"]).map((key)=>{
            var inc = incTableData["Number"][key]
            incTableData["iTelemetry Observation"][key] = inc in dictObservation ? dictObservation[inc]["iTelemetry Observation"]:"NA"
            incTableData["Problem Category"][key] = inc in dictObservation ? dictObservation[inc]["Problem Category"]:"NA"
            incTableData["Accountability"][key] = inc in dictObservation ? dictObservation[inc]["Accountability"]:"NA"
            incTableData["Alert Summary"][key] = inc in dictObservation ? dictObservation[inc]["Alert Summary"]:"NA"
          })
          console.log(incTableData)

          setIncidentTableData(incTableData)
          setIsLoading(false)
          // setIsLoading(false)
        })
        .catch((error)=>{
          console.log(error)
          setIsLoading(false)
          setIncidentTableData(incidentData)
        })
    }

    var fetchIncidentData = async(aggregate, miBool) => {

      var filterOptions = {
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
      }

      var params = {
        aggregate: aggregate,
        filters: filterOptions,
        miBool : miBool,
        start_time: date.startDate,
        end_time: date.endDate,
        active : "no"
      };
      console.log(params)
      
      var url = new URL(baseUrl + 'incidentLogs');
      
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
          console.log("Incidents Data")
          console.log(JSON.parse(data["incidents"]))
          if(Object.keys(JSON.parse(data["incidents"])).length>0){
            var inc = JSON.parse(data["incidents"])
            inc["Resolution Time(Hours)"]={}
            Object.keys(inc["Resolve_Time_Seconds"]).map((key)=>{
              inc["Resolution Time(Hours)"][key] = parseFloat(inc["Resolve_Time_Seconds"][key]/3600).toFixed(2)
            })
            console.log(inc)
            var {"u_major_incident":_,...newInc} = inc
            var {"Resolve_Time_Seconds":_, ...newInc} = newInc
            console.log(newInc)
            setIncidentData(newInc)
          }
          else{
            setIncidentData({
              "Number":{}
            })
            setIsLoading(false)

          }
          
        })
        .catch((error)=>{
          console.log(error)
          setIsLoading(false)
          setIncidentData({
            "Number":{}
          })
        })
    }

    return (
      // <Grid item sx={{width:"100%", height: '100vh'}}>
          <Grid container sx={styleAccordian(isLoading)}>
            <Grid container md={12} 
                // sx={{borderRadius:{
                //   xs: '4px', // Border radius for extra small screens
                //   sm: '8px', // Border radius for small screens
                //   md: '9px', // Border radius for medium screens
                //   lg: '10px', // Border radius for large screens
                // }, backgroundColor:'#ebedf4'}}
                
            >
              <Grid container md={12} justifyContent={"center"} alignItems={"center"} px={4} pt={4}>
                {Object.keys(cardInfo).map((key)=>{
                  return <Grid item md={3} p={1}>
                    <Card sx={styleCard(isClicked[key])} onClick={()=>handleCardClick(key)}>
                      <CardContent>
                        <Typography variant="body" sx={{ color: '#7e92a2'}}>
                            {key.toUpperCase()}
                        </Typography>
                        <Grid container my={1}>
                          <Grid item xs={6} style={{ display: 'flex' }} alignItems="flex-end">
                            <Typography variant="h3" sx={{ color: '#848484'}}>
                              {cardInfo[key]}
                            </Typography>
                          </Grid>
                          <Grid item xs={6} style={{ display: 'flex' }} justifyContent="flex-end">
                            <Box sx={{ width: 80, height: 80, borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', background: icon_gradient[key]["gradient"]}}>
                                <img src={icon_gradient[key]["icon"]} alt="UpTime Icon" style={{ width: '100%', height: '100%', filter: icon_gradient[key]["color"] }} />
                            </Box>
                          </Grid>
                        </Grid>
                      </CardContent>
                      <Box className="overlay" sx={overlayStyle}> 
                        <Typography variant="h6"> 
                          Click 
                        </Typography> 
                      </Box>
                    </Card>
                  </Grid>
                })}
              </Grid>
              
            </Grid>
            <Grid container md={12} mt={1}>
              <Grid container md={12} my={2} direction="column">
                <Grid container justifyContent={"flex-end"}>
                  <Grid item xs={2}>
                    <Autocomplete
                        value={trendFilter}
                        options={["Weekly", "Monthly"]}
                        renderInput={(params) => (
                            <TextField {...params} label={""} variant="outlined" />
                        )}
                        //PopperComponent={(props) => <StyledPopper {...props}/>}
                        onChange={(event,value)=>handleTrendFilterChange(value)}
                        sx={{ display:"flex", width: '100%', alignItems : "center", justifyContent:"center"}} 
                    />
                  </Grid>
                </Grid>
              </Grid>
              <Grid container lg={graphData.length>5 || accountabilityGraphData.length>5 ? 12 : 6} mt={1} p={2}>
                <Grid container  sx={{backgroundColor:'white', borderRadius:{
                    xs: '4px', // Border radius for extra small screens
                    sm: '6px', // Border radius for small screens
                    md: '8px', // Border radius for medium screens
                    lg: '10px', // Border radius for large screens
                  }}}
                >
                  <Grid item xs={12} p={2}>
                    <Typography variant="h6" sx={{color:"#162660"}} align="center">MI Trend</Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <BarGraph data={graphData} colors={['#CC5500', '#1E3A5F','#2E8B57']}/>
                  </Grid>
                </Grid>
              </Grid>
              <Grid container lg={graphData.length>5 || accountabilityGraphData.length>5 ? 12 : 6} mt={1} p={2}>
                <Grid container  sx={{backgroundColor:'white', borderRadius:{
                    xs: '4px', // Border radius for extra small screens
                    sm: '6px', // Border radius for small screens
                    md: '8px', // Border radius for medium screens
                    lg: '10px', // Border radius for large screens
                  }}}
                >
                  <Grid item xs={12} p={2}>
                    <Typography variant="h6" sx={{color:"#162660"}} align="center">MI Ownership</Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <BarGraph data={accountabilityGraphData} colors={['#003366', '#008080', '#FF8C00', '#708090']}/>
                  </Grid>
                </Grid>
              </Grid>
              <Grid container lg={graphData.length>5 || incidentCountGraphData.length>5 ? 12 : 6} mt={1} p={2}>
                <Grid container  sx={{backgroundColor:'white', borderRadius:{
                    xs: '4px', // Border radius for extra small screens
                    sm: '6px', // Border radius for small screens
                    md: '8px', // Border radius for medium screens
                    lg: '10px', // Border radius for large screens
                  }}}
                >
                  <Grid item xs={12} p={2}>
                    <Typography variant="h6" sx={{color:"#162660"}} align="center">Application Family to MI Count</Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <BarGraph data={incidentCountGraphData} colors={['#003366', '#008080', '#FF8C00', '#708090']}/>
                  </Grid>
                </Grid>
              </Grid>
              <Grid container lg={graphData.length>5 || incidentDurationGraphData.length>5 ? 12 : 6} mt={1} p={2}>
                <Grid container  sx={{backgroundColor:'white', borderRadius:{
                    xs: '4px', // Border radius for extra small screens
                    sm: '6px', // Border radius for small screens
                    md: '8px', // Border radius for medium screens
                    lg: '10px', // Border radius for large screens
                  }}}
                >
                  <Grid item xs={12} p={2}>
                    <Typography variant="h6" sx={{color:"#162660"}} align="center">Application Family to MI Outage Duration(In Hours)</Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <BarGraph data={incidentDurationGraphData} colors={['#003366', '#008080', '#FF8C00', '#708090']}/>
                  </Grid>
                </Grid>
              </Grid>
              <Grid container md={12} justifyContent={"center"} alignItems={"center"} py={2}>
                <Grid item xs={12} p={2} sx={{display:"flex"}}>
                  <TableOnClick data={incidentTableData} headerArr={["Number", "AppCI", "Assignment Group", "Status", "PriorityLabel", "Resolution Time(Hours)", "Alert Summary"]} type={"miSummary"} filter={filter} clicked={isClicked}/>
                </Grid>
              </Grid>
            </Grid>
            <Box className="overlayLoader" sx={overlayLoaderStyle(isLoading)}> 
              <CircularProgress/>
            </Box>
          </Grid>
      //</Grid>
    )
  }

  return (
    <Grid container my={2} width={"100%"}>
      {/* <AppOnboardingSummary/> */}
      {Object.keys(globalFilterData).length>0 ? 
        <MiSummary/>
      :
        <Grid container xs={12} my={2} justifyContent={"center"} alignItems={"center"}>
          <CircularProgress />
        </Grid>
      }
    </Grid>
  )
}
