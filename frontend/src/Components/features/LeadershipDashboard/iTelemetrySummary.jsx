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
import { WindowSharp } from '@mui/icons-material';

export default function ItelemetrySummary({appInsights, globalFilterData}) {
  
  var location = useLocation();
  // //var baseUrl =  "http://100.100.129.88:9090/api/"
  //var baseUrl =  "http://127.0.0.1:5000/api/"
  // //var baseUrl =  "https://itelemetry.providence.org/api/"
  var baseUrl = getUrl()
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
    //console.log(data)
    const [entryTime, setEntryTime] = useState(null);
            
    useEffect(() => {
      var {href} = window.location
      console.log(href)
      const currentTime = Date.now();
      setEntryTime(currentTime);
      console.log('Page Entry Time:', currentTime);  // Debugging statement
      var {href} = window.location
      console.log(href)
      // return () => {
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
      // };
    }, [location]);
    
    useEffect(() => {
      //console.log("hello1")
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

  var AppOnboardingSummary=()=>{

    var [appSummary, setAppSummary] = useState({})
    var [cardInfo, setCardInfo] = useState({
      "Total Applications" : "",
      "Onboarded" : "",
      "In Progress" : "",
      "Out of Scope" : ""
    })
    var icon_gradient = {
      "Total Applications" : {"icon":UpTimeIcon,"gradient":'linear-gradient(to bottom, #72ca9d 0%, #a6d8bf 20%, white 70%)', "color":"#24c674"},
      "Onboarded" : {"icon":RebootIcon,"gradient":'linear-gradient(to bottom, #72ca9d 0%, #a6d8bf 20%, white 70%)', "color":"#24c674"},
      "In Progress" : {"icon":EventLogsIcon,"gradient":'linear-gradient(to bottom, #72ca9d 0%, #a6d8bf 20%, white 70%)', "color":"#24c674"},
      "Out of Scope" : {"icon":AutoRestartIcon,"gradient":'linear-gradient(to bottom, lightgrey, white)', "color":"#000000"}
    }
    var [isClicked, setIsCLicked] = useState({
      "Total Applications" : false,
      "Onboarded": true,
      "In Progress": false,
      "Out of Scope": false
    })
    var [filter, setFilter] = useState({"Status":"Onboarded"})
    var [isLoading, setIsLoading] = useState(true)

    var [graphData, setGraphData] = useState([])

    useEffect(()=>{
      fetchAppOnboardingSummary()
    },[])

    useEffect(()=>{
      if(Object.keys(appSummary).length>1){
        setCardInfo((prevStatus)=>({
          ...prevStatus,
          "Total Applications" : Object.keys(appSummary["Application Family"]).length,
          "Onboarded" : Object.keys(appSummary["Application Family"]).filter((key)=>appSummary["Status"][key].toLowerCase()=="onboarded").length,
          "In Progress" : Object.keys(appSummary["Application Family"]).filter((key)=>appSummary["Status"][key].toLowerCase()=="in progress").length,
          "Out of Scope" : Object.keys(appSummary["Application Family"]).filter((key)=>appSummary["Status"][key].toLowerCase()=="out of scope").length,
        }))

        var tempDictionary = {}
        var prevMonth = ""
        Object.keys(appSummary["Status"]).filter((key)=>appSummary["Status"][key].toLowerCase()=="onboarded")
        .map((key)=>{
          
          if(!(appSummary["Month Onboarded"][key] in tempDictionary)){
            tempDictionary[appSummary["Month Onboarded"][key]] = {
              "name" : appSummary["Month Onboarded"][key],
              "No. of Apps Onboarded" : 0,
              "Cummulative Count" : 0
            }
          }
          tempDictionary[appSummary["Month Onboarded"][key]]["No. of Apps Onboarded"]+=1
          // prevMonth = appSummary["Month Onboarded"][key]
        })
        Object.keys(tempDictionary).map((key)=>{
          tempDictionary[key]["Cummulative Count"] = (prevMonth=="" ? tempDictionary[key]["No. of Apps Onboarded"] : tempDictionary[key]["No. of Apps Onboarded"]+tempDictionary[prevMonth]["Cummulative Count"])
          prevMonth = key
        })
        //console.log(tempDictionary)
        setGraphData(Object.values(tempDictionary))
      }
    }, [appSummary])

    var fetchAppOnboardingSummary = () => {
        //const urlParams = new URLSearchParams(params)
        const url = `${baseUrl}getOnboardingSummary`
        console.log(url)
        fetch(url,{
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          // Include any additional headers if needed
        }})
        .then((response)=>response.json())
        .then((data)=>{
            //console.log(JSON.parse(data["appOnboardingSummary"]))
            var tempVar = JSON.parse(data["appOnboardingSummary"])
            if(Object.keys(tempVar).length>0){
              Object.keys(tempVar["Month Onboarded"]).map((key)=>{
                var temp = "NIL"
                if(tempVar["Month Onboarded"][key]!=null){
                  var dateMeta = getMonthAndWeek(tempVar["Month Onboarded"][key])
                  temp = dateMeta["month"] + "-" + dateMeta["year"]
                }
                //console.log(temp["month"])
                tempVar["Month Onboarded"][key] = temp
              })
            }
            //console.log(JSON.parse(data["appOnboardingSummary"]))
            setAppSummary(tempVar)
            setIsLoading(false)
            // console.log(JSON.parse(data["metaData"]))
        })
        .catch((error)=>{
            console.log(error)
            setIsLoading(false)
        })
    }

    var handleCardClick = (id) =>{
      //setPage(0)
      Object.keys(cardInfo).map((ind)=>{
        if(ind==id){
          setIsCLicked((prevStatus)=>({
            ...prevStatus,
            [ind] : true
          }))
          if(id=="Total Applications"){
            const { "Status": _, ...newFilter } = filter;
            setFilter(newFilter);
          }
          else{
            setFilter((prevStatus)=>({
              ...prevStatus,
              "Status" : ind
            }))
          }
          
        }
        else{
          setIsCLicked((prevStatus)=>({
            ...prevStatus,
            [ind] : false
          }))
        }
      })
    }

    return (
      <Grid container mt={2} sx={{width:"100%"}}>
        {Object.keys(globalFilterData).length>0 ? 
        // <Accordion defaultExpanded sx={styleAccordian(isLoading)}>
        //   <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: '#00338e' }} />}>
        //     {/* <Grid container xs={10}>
        //       <Typography variant="h6" sx={{color:"#162660"}}>Application OnBoarding Summary</Typography>
        //     </Grid> */}
        //   </AccordionSummary>
        //   <AccordionDetails>
        <Grid container xs={12}>
          <div>
            <Grid container md={12} sx={{borderRadius:{
                xs: '4px', // Border radius for extra small screens
                sm: '8px', // Border radius for small screens
                md: '9px', // Border radius for medium screens
                lg: '10px', // Border radius for large screens
              }, backgroundColor:'#ebedf4'}}>
              <Grid container md={12} justifyContent={"center"} alignItems={"stretch"} px={4} pt={4}>
                {Object.keys(cardInfo).map((key)=>{
                  return <Grid item md={3} p={1} sx={{ display: 'flex' }}>
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
                                <img src={icon_gradient[key]["icon"]} alt="UpTime Icon" style={{ width: '100%', height: '100%', filter: (icon_gradient[key]["color"])}} />
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
              <Grid container md={12} justifyContent={"center"} alignItems={"center"} py={2}>
                <Grid item xs={12} p={2} sx={{display:"flex"}}>
                  <TableOnClick data={appSummary} headerArr={["Application Family", "Wave Number", "Month Onboarded", "Status"]} type={"appOnboarding"} filter={filter} clicked={isClicked}/>
                </Grid>
              </Grid>
            </Grid>
            <Grid container md={12} mt={1}>
              <Grid item xs={12}>
                <Typography variant="h6" sx={{color:"#162660"}} align="center">Application Onboarding Trend</Typography>
              </Grid>
              <Grid item xs={12}>
                <LineGraph data={graphData}/>
              </Grid>
            </Grid>
          </div>
          <Box className="overlayLoader" sx={overlayLoaderStyle(isLoading)}> 
            <CircularProgress/>
          </Box>
        </Grid>
        
        :
        <Grid container xs={12} justifyContent={"center"} alignItems={"center"}>
          <CircularProgress />
        </Grid>
        }
        
      </Grid>
    )
  }

  return (
    <Grid container my={2} width={"100%"}>
      <AppOnboardingSummary/>
      {/* <MiSummary/> */}
    </Grid>
  )
}
