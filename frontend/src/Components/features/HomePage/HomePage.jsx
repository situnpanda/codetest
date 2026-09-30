import React, { useEffect, useState } from 'react'
import {useNavigate,useLocation} from 'react-router-dom'
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Unstable_Grid2';
import {Card,CardContent} from '@mui/material';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import CircularProgress from '@mui/material/CircularProgress';
import Map from '../MapView/Map'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
dayjs.extend(customParseFormat)
import ButtonBase from '@mui/material/ButtonBase';
import AddHomeTwoToneIcon from '@mui/icons-material/AddHomeTwoTone';
import { useMsal, useIsAuthenticated, MsalProvider } from '@azure/msal-react';
import {getUrl} from '../../../environment'
import { logPageVisit,startPageTracking,appInsights } from '../appInsights'; // Import the function


export default function HomePage({globalFilterUpdate, globalFilterChoice, globalFilterData, appInsights}) {
    var baseUrl =  getUrl()
    var location = useLocation()

    const { instance } = useMsal();
    const isAuthenticated = useIsAuthenticated();

    const getDate=()=>{
        var currentDate = new Date();
        // //console.log(currentDate)
        currentDate.setSeconds(0)
        const options = { timeZone: 'America/Los_Angeles', hour12: true };
        var startDate = dayjs(new Date(currentDate.setMinutes(currentDate.getMinutes() - 10)).toLocaleString('en-US', options), 'M/D/YYYY, h:mm:ss A').format('YYYY-MM-DD hh:mm:ss A')
        var endDate = dayjs(new Date(currentDate.setMinutes(currentDate.getMinutes() + 10)).toLocaleString('en-US', options), 'M/D/YYYY, h:mm:ss A').format('YYYY-MM-DD hh:mm:ss A')
        var diff = new Date(endDate) - new Date(startDate)
        const minutesDifference_byTen = Math.ceil((diff / (1000 * 60)) / 10);
        const minutesDifference = Math.floor((diff / (1000 * 60)));
      
        ////console.log(minutesDifference)
        return {"endDate": endDate,
                "startDate": startDate,
                "minutesDifference_byTen": minutesDifference_byTen,
                "minutesDifference" : minutesDifference
            }
    }

    let navigate = useNavigate();
    var [date,setDate] = useState(getDate());

    var [states, setStates]=useState({"Alaska":"AK","Oregon":"OR","Texas":"TX","Washington":"WA","California":"CA","Montana":"MT", "Idaho":"ID", "USA":"USA"})
    var [regionAppData, setRegionAppData] = useState({})
    var [hospitalInformation, setHospitalInformation] = useState({
      hospitalList : {},
      hospitalMetaInformation : {}
    })
      
    var [serverList, setServerList] = useState({})
    var [serverStatus, setServerStatus] = useState({})
    // var [serverCpuUtilization, setServerCpuUtilization] = useState({})
    // var [serverMemoryUtilization, setServerMemoryUtilization] = useState({})
    // var [serverDiskUtilization, setServerDiskUtilization] = useState({})
    // var [servicesData, setServicesData] = useState({})
    var [incidentData, setIncidentData] = useState({})
    var [homePageData, setHomePageData] = useState({})
    var [countApi, setCountApi] = useState(0)
    var [error,setError] = useState(null);
    
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
    });

    var [errorApi, setErrorApi] = useState({'HospitalList':""})
    var [zoomLevel, setZoomLevel] = useState(0.75)
    var [loading, setLoading] = useState({
        "serverCpuUtilization" : true,
        "serverMemoryUtilization": true,
        "serverDiskUtilization" : true,
        "serviceLogs" : true,
        "serverList" : true,
        "incidentLogs" : true,
        "serverStatus" : true
    });

    const [entryTime, setEntryTime] = useState(null);
    
    

      useEffect(() => {
        // Start page tracking (entry + visibility handling)
        startPageTracking();
    
        return () => {
          // On unmount, log page visit + flush
          const { href } = window.location;
          logPageVisit(href, location.pathname);
    
          if (appInsights) {
            appInsights.flush();
            console.log('[Page] Flushed telemetry on unmount.');
          }
        };
      }, [location]);

    useEffect(()=>{
      // console.log(isAuthenticated)
      // console.log(getUrl())
      // console.log(window.innerWidth, window.innerHeight)

      
      
      if(sessionStorage.getItem("ApplicationDetails_AppCiFilter")!=null){
        sessionStorage.removeItem("ApplicationDetails_AppCiFilter")
      }
      if(sessionStorage.getItem("ApplicationDetails_HospitalFilter")!=null){
        sessionStorage.removeItem("ApplicationDetails_HospitalFilter")
      }
      
      if(localStorage.getItem("HospitalInformation_HomePage")==null){
        fetchHospitalData("hospitalList")
      }
      else{
        setHospitalInformation(JSON.parse(localStorage.getItem("HospitalInformation_HomePage")))
      }
      if(localStorage.getItem("ServerList_HomePage")!==null){
        setServerList(JSON.parse(localStorage.getItem("ServerList_HomePage")))
      }
      
    },[])

    useEffect(()=>{
      if(Object.keys(globalFilterData).length>1){
        setServerList(globalFilterData)
      }
    }, [globalFilterData])

    useEffect(()=>{
      if(Object.keys(serverList).length>1){
        setLoading(prevLoading=>({
          ...prevLoading,
          "serverList" : false
        }));
      }
    }, [serverList])

    useEffect(()=>{
        // //console.log(hospitalInformation)
        //console.log(globalFilterChoice)
        if(globalFilterChoice!=undefined && Object.keys(globalFilterChoice).length>0){
          getRegionWiseData_GlobalFilter()
        }
       
    },[globalFilterChoice])

    useEffect(()=>{
        //console.log(date)
        setLoading(prevLoading=>({
          ...prevLoading,
          "incidentLogs" : true
        }));
        setLoading(prevLoading=>({
          ...prevLoading,
          "serverList" : true
        }));
        //fetchServerListData(-1,10)
        fetchIncidentData("no", "yes")
        const incID = setInterval(()=>fetchIncidentData("no","yes"),120000)
        return () => clearInterval(incID);
    },[date])

    useEffect(()=>{
      
      if(countApi>=2){
        // //console.log("Count Api" + countApi)
        getRegionWiseData()
      }
    },[countApi])
    

    useEffect(()=>{
      if(Object.keys(hospitalInformation['hospitalList']).length>0){
        sessionStorage.setItem("hospitalInformation", hospitalInformation)
      }
    },[hospitalInformation])

    useEffect(()=>{
        //  || loading["serverStatus"] 
        if(!(loading["incidentLogs"] || loading["serverList"])){
            if(Object.keys(serverList).length>0){
                setCountApi((prevCount) => prevCount+1)
                var serverApiList = {}
                
                Object.keys(serverList["AppCI"]).map((index)=>{
                  if(!(serverList["AppCI"][index].toLowerCase() in serverApiList)){
                    serverApiList[serverList["AppCI"][index].toLowerCase()] = {}
                  }
                  serverApiList[serverList["AppCI"][index].toLowerCase()][serverList["ServerName"][index].toLowerCase()] = {"Status":"NA","CPU":0,"Memory":0,"Disk":0,"Services":0,"HostingType":serverList["ServerHostingType"][index]}
                  serverApiList[serverList["AppCI"][index].toLowerCase()]["Incidents"] = {"MI":0,"Normal":0}
 
                })

                // if(Object.keys(serverStatus["ServerName"]).length>0){
                //   Object.keys(serverStatus["ServerName"]).map((index)=>{
                //     if(serverStatus["AppCI"][index].toLowerCase() in serverApiList && 
                //     serverStatus["ServerName"][index].toLowerCase() in serverApiList[serverStatus["AppCI"][index].toLowerCase()]){
                //         serverApiList[serverStatus["AppCI"][index].toLowerCase()][serverStatus["ServerName"][index].toLowerCase()]["Status"] = serverStatus["Status"][index]
                //     }
                //   })
                //   setCountApi((prevCount) => prevCount+1)
                // }
                // else{
                //   setCountApi((prevCount) => prevCount+1)
                // }
                
                if(Object.keys(incidentData["Number"]).length>0){
                  Object.keys(incidentData["AppCI"]).map((index)=>{
                    if(incidentData["AppCI"][index].toLowerCase() in serverApiList){
                      if(incidentData["u_major_incident"][index] == "Accepted"){
                        serverApiList[incidentData["AppCI"][index].toLowerCase()]["Incidents"]["MI"] = serverApiList[incidentData["AppCI"][index].toLowerCase()]["Incidents"]["MI"] + 1
                      }
                      else{
                        var priority = parseInt(incidentData["PriorityLabel"][index].split("-")[0][0])
                        if(priority<=3){
                          serverApiList[incidentData["AppCI"][index].toLowerCase()]["Incidents"]["Normal"] = serverApiList[incidentData["AppCI"][index].toLowerCase()]["Incidents"]["Normal"] + 1
                        } 
                      }
                    }
                  })
                  setCountApi((prevCount) => prevCount+1)
                }
                else{
                  setCountApi((prevCount) => prevCount+1)
                }

              setHomePageData(serverApiList)
              console.log("Data Updated")
            }
        }
    },[loading, incidentData])

    const handleApplicationGlobalFilter = (value, metric, upDown, type) => {
      if(type.includes("VM")){
        // //console.log("In VM if")
        // //console.log(value, value.split("/"))
        var appName = value.split("/").length==2 ? value.split("/")[1] : ""
        var hostingType = type.split(" ")[0]
        navigate('/homePage/serverStatus', {state:{serverData:metric ,AppName:appName, serverNameChoice:value.split("/")[0]+"/"+hostingType, navigationType:"navigate_globalFilter"}}) //metric[appName]["AppMetrics"]
      }
      else{
        navigate('/homePage/applicationHealth?globalFilter='+value, {state:{stateName:value, metric:metric, countOfApplicationsImpacted:"", boolAppUp_Down:true, navigationType:"navigate_globalFilter"}})
      }
      
    };

    const getRegionWiseData_GlobalFilter = () =>{

      const getHospital_ServerData = (appCI) =>{
        var hospitalRegion = {}
        var hospital = []
        var serverDetails = {}
        ////console.log(hospitalInformation["hospitalList"]["AppCI"])
        var index = Object.keys(hospitalInformation["hospitalList"]["AppCI"]).filter((key)=>hospitalInformation["hospitalList"]["AppCI"][key].toLowerCase()==appCI.toLowerCase())
        index.map((ind)=>{
          var s = hospitalInformation["hospitalList"]["State"][ind]
          var r = states[s]==undefined ? "USA":states[s]
          if(!(r in hospitalRegion)){
            hospitalRegion[r] = []
          }
          hospitalRegion[r].push(hospitalInformation["hospitalList"]["Hospital"][ind])
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
      //console.log(globalFilterChoice)
      //console.log(type)
      //console.log(resourceName)
      if(type == "Application Family"){
        
        var appCi = globalFilterChoice["Application CI"]
        appCi.map((appCI)=>{
          getHospital_ServerData(appCI)
        })
        //console.log(resourceWiseAvailability)
        handleApplicationGlobalFilter(resourceName, resourceWiseAvailability, "", "ApplicationFamily")

      }
      else if(type == "Application CI"){
        getHospital_ServerData(resourceName)
        handleApplicationGlobalFilter(resourceName, resourceWiseAvailability, "", "ApplicationCI")
      }
      else if(type.includes("VM")){
        var appCI = type.split("/")[2]
        var hostingType = type.split("/")[1]
        handleApplicationGlobalFilter(resourceName+"/"+appCI, resourceWiseAvailability, "", hostingType + " VM")
      }
    }

    const getRegionWiseData = () => {
      // //console.log("In region wise data gathering")
      // //console.log(homePageData)
      var regionWiseAvailability = {}
      Object.keys(homePageData).map((appCI)=>{
          // //console.log(appCI.split("-")[1])
          var state = " "
          
          var hospitalRegion = {}
          var region = ""
          var hospital = []
          var index = []
          if(Object.keys(hospitalInformation["hospitalList"]).length>0){
            var index = Object.keys(hospitalInformation["hospitalList"]["AppCI"]).filter((key)=>hospitalInformation["hospitalList"]["AppCI"][key]==appCI)
            
            if(index.length==0){
              // //console.log(appCI)
              return
            }
            var ind = index[0]
            state = hospitalInformation["hospitalList"]["State"][ind]
            
            region = states[state]
            index.map((ind)=>{
              var s = hospitalInformation["hospitalList"]["State"][ind]
              var r = states[s]==undefined ? "USA":states[s]
              if(!(r in hospitalRegion)){
                hospitalRegion[r] = []
              }
              hospitalRegion[r].push(hospitalInformation["hospitalList"]["Hospital"][ind])
              hospital.push(hospitalInformation["hospitalList"]["Hospital"][ind])
            })
            
          }
          //var region = appCI.split("-").length>1 ? appCI.split("-")[1].trim().toUpperCase() : " "
      
          var totalWeightageServers = 0
          var totalWeightageIncidents = 0
          var appWeightageMetric = {}
          var appMetrics = {}
          Object.keys(homePageData[appCI]).map((serverName)=>{
            if(serverName == "Incidents"){
              
              // var normalInc = ((parseInt(homePageData[appCI]["Incidents"]["Normal"])/(Math.ceil(date.minutesDifference/5)))*0.2)
              var majorInc = (parseInt(homePageData[appCI]["Incidents"]["MI"])*0.4)
              var s = (majorInc>0.4 ? 0.4 : majorInc) //(normalInc>0.2 ? 0.2 : normalInc)  
              // appWeightageMetric["Incidents"] = {"Incidents": (normalInc>0.2 ? 0.2 : normalInc), "MI": (majorInc>0.4 ? 0.4 : majorInc)}
              appMetrics["Incidents"] = homePageData[appCI]["Incidents"]
              totalWeightageIncidents = totalWeightageIncidents + s
            }
            else{
              appMetrics[serverName] = homePageData[appCI][serverName]
            }
          })
          
          if(totalWeightageServers>0){
            totalWeightageServers = totalWeightageServers / (Object.keys(homePageData[appCI]).length)
          }

          var totalWeightage = totalWeightageIncidents + totalWeightageServers
          
          Object.keys(hospitalRegion).map((region)=>{
            if(!(region in regionWiseAvailability)){
              regionWiseAvailability[region] = {[appCI]:{"Weightage":totalWeightage*100, "AppMetrics":appMetrics, "Hospitals":hospitalRegion[region]}} //"WeightageMetrics":appWeightageMetric,
            }
            else{
              regionWiseAvailability[region][appCI] = {"Weightage":totalWeightage*100, "AppMetrics":appMetrics, "Hospitals":hospitalRegion[region]} //"WeightageMetrics":appWeightageMetric,
            }
          })
      })
      //sessionStorage.setItem("regionAppData", regionWiseAvailability)
      setRegionAppData(regionWiseAvailability)
      setCountApi(0)
      console.log(regionWiseAvailability)
    }

    var fetchIncidentData = async(aggregate, miBool) => {
      var params = {
        aggregate: aggregate,
        filters: filterOptions,
        miBool : miBool,
        start_time: "",
        end_time: "",
        active : "yes"
      };
      ////console.log("hello")
      var url = new URL(baseUrl + 'incidentLogs');
      // ////console.log(url);
      url.search = new URLSearchParams(params).toString();
      
      fetch(url,{
        method:'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control':'no-store'
        },
        body: JSON.stringify(params)
      })
        .then((response) => response.json())
        .then((data) =>{ 
          console.log("Incidents Data")
          console.log(JSON.parse(data["Data"]))
          if(Object.keys(JSON.parse(data["Data"])).length>0){
            console.log("Hereeee1")
            setIncidentData(JSON.parse(data["Data"]))
          }
          else{
            console.log("Hereeee")
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
          console.log(error)
        })
    }

    var fetchHospitalData = (typeOfQuery) => {
        
        var params = {
            queryType : typeOfQuery == "hospitalList" ? "list" : "metaData"
        }

        ////console.log("hello")
        var url = new URL(baseUrl + 'hospitalList');
        url.search = new URLSearchParams(params).toString();
        
        fetch(url,{
          method:'GET',
          headers: {
            'Content-Type': 'application/json',
        }})
        .then((response) => response.json())
        .then((data) =>{ 
            // //console.log(JSON.parse(data["hospitalData"]))
            setHospitalInformation(prevState => ({
                ...prevState,
                [typeOfQuery]: JSON.parse(data["Data"])
            }))
            localStorage.setItem('HospitalInformation_HomePage', JSON.stringify({
              [typeOfQuery]: JSON.parse(data["Data"])
            }))
        })
        .catch((error) => {
          console.error('Error:', error)
          setErrorApi((prevState)=>({
            ...prevState,
            "HospitalList" : "API didnt load"
          }))
          
        });
    };

    var fetchServerListData = async(page, limit) => {
        if(localStorage.getItem("ServerList_HomePage")==null){
          setServerList({})
          setLoading(prevLoading=>({
            ...prevLoading,
            "serverList" : true
          })); 
        }
    
        var params = {
          "page": page,
          "limit": limit,
          "filters": filterOptions
        };
        
        ////console.log("hello")
        var url = new URL(baseUrl + 'serverLogs');
        
        fetch(url,{
          method:'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control':'no-store'
          },
          body: JSON.stringify(params)
        })
          .then((response) => response.json())
          .then((data) =>{ 
            //console.log("Server List")
            //console.log(JSON.parse(data["ServerLogs"]))
            setServerList(JSON.parse(data["Data"]))
            //globalFilterUpdate(JSON.parse(data["ServerLogs"]))
            setLoading(prevLoading=>({
              ...prevLoading,
              "serverList" : false
            }));
            // if(localStorage.getItem('ServerList_HomePage')!==null){
            //   localStorage.removeItemItem('ServerList_HomePage')
            // }
            // localStorage.setItem('ServerList_HomePage', data["ServerLogs"])
            
          })
          .catch((error) =>{ 
            setLoading(prevLoading=>({
              ...prevLoading,
              "serverList" : false
            }));
            console.error('Error:', error)
          });
    };
    
    const mapCard = (stateName) => {
      if (stateName == null) {
          stateName = "USA";
      }
      if (!(stateName in states)) {
          return null;
      }
  
      var d = {
          appStatusDown: Object.keys(regionAppData).includes(states[stateName])
              ? Object.values(regionAppData[states[stateName]]).filter(
                  (item) => item["Weightage"] >= 20
              ).length
              : "NA",
      };
      d["appStatusUp"] = Object.keys(regionAppData).includes(states[stateName])
          ? Object.values(regionAppData[states[stateName]]).length - d["appStatusDown"]
          : "NA";
  
      const handleApplicationStatus = (value, stateName, upDown) => {
          if (value != "NA" && value != 0) {
              var indexOfState = Object.values(states).findIndex((item) => item == stateName);
              var state = Object.keys(states)[indexOfState];
              navigate('/homePage/applicationHealth', {
                  state: { stateName: state, metric: regionAppData[stateName], countOfApplicationsImpacted: value, boolAppUp_Down: upDown, navigationType:"navigate_regionFilter" },
              });
          }
      };
  
      const transparentCircleStyle = (color) => ({
          width: '30px', 
          height: '30px',
          borderRadius: '50%',
          backgroundColor: `rgba(${color}, 0.1)`, 
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: {'xl':3, 'lg':2, 'md':2, 'sm':0}
      });
  
      const textStyle = (color) => ({
          color: `rgba(${color}, 1)`, 
          fontWeight: 'bold',
      });
  
      return (
        <Card 
        sx={{ 
          m: 1, 
          p: 1, 
          boxShadow: '0px 12px 24px rgba(0, 0, 0, 0.1)', 
          borderRadius: 8, 
          backgroundColor: 'white', 
          width: { xs: '100%', sm: '45%', md: '30%', lg: '23%' }, 
          height: { xs: 'auto', sm: 'auto', md: '19%' }, 
          marginBottom: '12px',
          transition: 'transform 0.3s ease-in-out, box-shadow 0.3s ease-in-out', 
          '&:hover': {
            transform: 'translateY(-7px)', 
            boxShadow: '0px 16px 32px rgba(0, 0, 0, 0.15)', 
          }
        }} 
        key={stateName}
      >
        <CardContent>
            <Typography
                variant="h6"
                sx={{ textAlign: 'center', fontWeight: 'bold', color: 'black', fontSize: '0.875rem' }} 
            >
                {stateName == "USA" ? "USA (Region Unknown)" : stateName}
            </Typography>
      
            <Box sx={{ display: 'flex', justifyContent: 'center', my: 1.2 }}>
                <Box
                    sx={{
                        width: '80%', 
                        height: '80%', 
                        backgroundColor: 'white',
                    }}
                >
                    <Map stateName={stateName} appStatusDown={d["appStatusDown"]} />
                </Box>
            </Box>
      
            <Typography
                variant="body1"
                sx={{ textAlign: 'center', color: 'grey', fontWeight: 'bold', mb: 1.5, fontSize: '0.75rem' }} 
            >
                Application Status
            </Typography>
      
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}> 
                {d["appStatusUp"] == "NA" || d["appStatusDown"] == "NA" ? (
                    <CircularProgress
                        sx={{
                            '& .MuiCircularProgress-circle': {
                                strokeWidth: '2px',
                            },
                        }}
                    />
                ) : (
                    <>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <ButtonBase
                                onClick={(e) => handleApplicationStatus(d["appStatusUp"], states[stateName], true)}
                                sx={transparentCircleStyle('0, 128, 0')} 
                            >
                                <Typography variant="body1" sx={textStyle('0, 128, 0')}>
                                    {d["appStatusUp"]}
                                </Typography>
                            </ButtonBase>
                            <Typography variant="body2" sx={{ color: 'green', ml: 0.5 }}>
                                UP
                            </Typography>
                        </Box>
      
                        <Box sx={{ display: 'flex', alignItems: 'center', ml: 2 }}> 
                            <ButtonBase
                                onClick={(e) => handleApplicationStatus(d["appStatusDown"], states[stateName], false)}
                                sx={
                                    d["appStatusDown"] == 0
                                        ? transparentCircleStyle('128, 128, 128')
                                        : transparentCircleStyle('255, 0, 0')
                                }
                            >
                                <Typography variant="body1" sx={textStyle(d["appStatusDown"] == 0 ? '128, 128, 128' : '255, 0, 0')}>
                                    {d["appStatusDown"]}
                                </Typography>
                            </ButtonBase>
                            <Typography variant="body2" sx={{ color: d["appStatusDown"] == 0 ? 'grey' : 'red', ml: 0.5 }}>
                                DOWN
                            </Typography>
                        </Box>
                    </>
                )}
            </Box>
        </CardContent>
      </Card>
      
      );
  };
  
  return (
    
    <Grid container m={3} justifyContent='center' alignItems='center'>
        {(Object.keys(hospitalInformation['hospitalList']).length==0 && errorApi['HospitalList']=="")

        ? 
          <Grid container md={12} mb={1} m={2} >
            <Grid md={12} m={0}>
              <Typography variant="h6" className="fst-italic">
                Loading..
              </Typography>
            </Grid>
            <Grid md={12}>
              <LinearProgress/>
            </Grid>
          </Grid>
        :
          
          ""
        }
            
        <Grid container md={12} sx={{my:{lg:3,md:2,sm:2,xs:2}}}>
    
            <Grid sx={{ display: 'flex', alignItems: 'center'}}>
              <Box sx={{ display: 'flex', alignItems: 'center', pr: 1 }}>
                  <Box sx={{ width: 50, height: 50, borderRadius: '50%', background: 'linear-gradient(to bottom, rgba(95,153,20,0.5), white)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <AddHomeTwoToneIcon style={{width:'100%'}}/>
                  </Box>
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 'bold' }}>Health Overview by Region</Typography>
            </Grid>
            {/* <Grid xs={6} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'right'}}>
                <Typography variant="h6" sx={{fontWeight:'bold',mr:5}}>States: {Object.keys(hospitalInformation["hospitalList"]).length>0 ? (Object.keys(hospitalInformation["hospitalList"]["State"]).length>0 ? [...new Set(Object.values(hospitalInformation["hospitalList"]["State"]).filter((val)=>(val!="Telangana" && val!=null)))].length : 0) : 0 }</Typography>                
            </Grid>   */}
        
        </Grid>
        <Grid container spacing={5} alignItems="center" />
            {Object.keys(hospitalInformation["hospitalList"]).length> 0 ?
                [...new Set(Object.values(hospitalInformation["hospitalList"]["State"]))].map((data)=>{
                    return (mapCard(data))
                })
                :
                ""
            }            
        </Grid>
  )
}
