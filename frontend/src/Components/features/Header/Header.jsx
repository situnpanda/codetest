import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Alert, CircularProgress, Checkbox, Dialog, DialogTitle, DialogContent, DialogActions, Button, InputAdornment , Grid, Box, Toolbar, IconButton,ToggleButton,ToggleButtonGroup, Divider, Typography, Menu, Container, Avatar, Tooltip, MenuItem, List, CssBaseline, ListItem, ListItemButton, ListItemIcon, ListItemText, Collapse, Breadcrumbs } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import ProvidenceLogo from '../../Static/Images/ProvidenceLogo.png';
import ProvidenceIcon from '../../Static/Images/ProvidenceIcon.png';
import { styled, useTheme } from '@mui/material/styles';
import MuiDrawer from '@mui/material/Drawer';
import MuiAppBar from '@mui/material/AppBar';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TimelineFilter from '../../shared/Timestamp/Timestamp';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import FormatListBulleted from '@mui/icons-material/FormatListBulleted';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import AddAlertOutlinedIcon from '@mui/icons-material/AddAlertOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import CloudIcon from '@mui/icons-material/Cloud';
import SummarizeIcon from '@mui/icons-material/Summarize';
import {Autocomplete, TextField} from '@mui/material';
import SummarizeOutlinedIcon from '@mui/icons-material/SummarizeOutlined';
import SearchIcon from '@mui/icons-material/Search';
import DnsOutlinedIcon from '@mui/icons-material/DnsOutlined';
import DashboardIcon from '@mui/icons-material/Dashboard';
import {getUrl} from '../../../environment'
import Chip from '@mui/material/Chip';
import { Chat, ElectricScooterSharp } from '@mui/icons-material';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { setPreferredTimezone } from '../../shared/Timestamp/PreferenceConversion';
import NorthStarFeedback from '../../shared/NorthStarFeedback/NorthStarFeedback';
import ItelemetryFeedback from '../../shared/ItelemetryFeedback/ItelemetryFeedback';
import { CreateTourCard } from '../../shared/Modal/PageInfo';
import Modal from '@mui/material/Modal';
import ChatOpsHeader from '../ChatOps/ChatOps';

const drawerWidth = 260;
 
const openedMixin = (theme) => ({
  width: drawerWidth,
  transition: theme.transitions.create('width', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.enteringScreen,
  }),
  overflowX: 'hidden',
});
 
const closedMixin = (theme) => ({
  transition: theme.transitions.create('width', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  overflowX: 'hidden',
  width: `calc(${theme.spacing(7)} + 1px)`,
  [theme.breakpoints.up('sm')]: {
    width: `calc(${theme.spacing(8)} + 1px)`,
  },
});
 
const DrawerHeader = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  padding: theme.spacing(0, 1),
  ...theme.mixins.toolbar,
}));
 
const AppBar = styled(MuiAppBar, {
  shouldForwardProp: (prop) => prop !== 'open',
})(({ theme, open }) => ({
  zIndex: theme.zIndex.drawer + 1,
  transition: theme.transitions.create(['width', 'margin'], {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  ...(open && {
    marginLeft: drawerWidth,
    width: `calc(100% - ${drawerWidth}px)`,
    transition: theme.transitions.create(['width', 'margin'], {
      easing: theme.transitions.easing.sharp,
      duration: theme.transitions.duration.enteringScreen,
    }),
  }),
}));
 
const Drawer = styled(MuiDrawer, { shouldForwardProp: (prop) => prop !== 'open' })(
  ({ theme, open }) => ({
    width: drawerWidth,
    flexShrink: 0,
    whiteSpace: 'nowrap',
    boxSizing: 'border-box',
    ...(open && {
      ...openedMixin(theme),
      '& .MuiDrawer-paper': openedMixin(theme),
    }),
    ...(!open && {
      ...closedMixin(theme),
      '& .MuiDrawer-paper': closedMixin(theme),
    }),
  }),
);
 
const capitalize = (text) => {
  text = text.replace(/%20/g, ' ');
  return text.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};
 
const icons = [
  HomeOutlinedIcon,
  HubOutlinedIcon,
  AddAlertOutlinedIcon,
  // DnsOutlinedIcon,
  //AssessmentOutlinedIcon,
  SummarizeOutlinedIcon,
  AssessmentOutlinedIcon,
  FormatListBulleted,
  CloudIcon,
  AddAlertOutlinedIcon,
  SummarizeIcon,
  SummarizeOutlinedIcon,
  DashboardIcon,
  AssessmentOutlinedIcon,

];
 
const routes = [
  'CRCA application wallboard',
  'application heatmap',
  'bakingNow',
  'alertCreation',
  'alertSummary',
  'validation',
  'auditReport',
  'northStar',
];

const pageDevStatus = [
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
];
 
const routesLabels = [
  'App Pods Wallboard',
  'Application Heatmap',
  'Baking Now',
  'Alert Creation',
  'Threshold Violations',
  'Application Validation',
  'Audit Report',
  'North Star',
];
 
const StyledLink = styled(Link)({
  textDecoration: 'none',
  color: '#424242',
  '&:hover': {
    textDecoration: 'underline',
  },
  
});
 
function Header(  {date, setDate, globalFilterData, setGlobalFilterChoice,globalFilterChoice, userProfileData, globalFilterUpdate, setGlobalApplicationList, globalApplicationList, userSupportGroupList, setHospitalInformation,preferredTZ,setPreferredTZ, previousAppHealthUrl, backendSessionToken, chatOpsAccess }) {

  const theme = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(true);
  const [openVendor, setOpenVendor] = React.useState(false);
  const [hover, setHover] = React.useState(false);
  var [globalFilterList, setGlobalFilterList] = React.useState([])
  // var [globalFilter, setGlobalFilter] = React.useState({})
  var [pageUrl, setPageUrl] = React.useState({})
  var previousAppHealthUrl = React.useRef("");
  const location = useLocation();
  const [openPreferenceDialog, setOpenPreferenceDialog] = useState(false); // Dialog open state
  //const [selectedGroups, setSelectedGroups] = useState([]); // Selected support groups
  const [selectedGroups, setSelectedGroups] = useState(userSupportGroupList);
  const [supportGroupLoading, setSupportGroupLoading] = useState(false);
  const [loadingHandlePreferences, setLoadingHandlePreferences] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');
  const [supportGroupList, setSupportGroupList] = useState([]);
  const [pageInfoModalOpen, setPageInfoModalOpen] = useState(false);
  
  var baseUrl =  getUrl()

  const pageInfoConfig = {
    'application heatmap': {
      header: 'Leadership Summary',
      description: 'A comprehensive executive dashboard providing real-time visibility into application health, availability metrics, and incident analytics across all CRCA applications.',
      newFeature: [
        "Clickable incident links - Direct links to ServiceNow incidents for critical applications"
      ],
      featureList: [
        "Overall Availability: Calculated as the average availability across all Application Families",
        "App Family Availability: Each family's uptime percentage based on total Major Incident downtime within the selected time period",
        "MTTR (Mean Time To Recover): Average recovery time for Major Incidents, calculated per Application Family",
        "Downtime Analytics: Visual breakdown of total downtime hours from Major Incidents (unplanned) and Change Requests (planned)",
        "Heatmap Timeline: Color-coded grid showing incidents over 24 hours, 14 days, or 30 days for each app family",
        "Key Metrics: Displays longest single outage duration and count of Major Incidents affecting app families",
        "Filters: Narrow results by specific Application Families or adjust the time range (24h, 14d, 30d)",
      ],
      upcomingFeature: []
    },
    'crca application wallboard': {
      header: 'Applications Wallboard',
      description: 'A comprehensive view of all CRCA application families grouped by support groups, showing their health status, availability, and active incidents in real-time.',
      newFeature: [
        "Clickable incident links - Direct links to ServiceNow incidents for critical applications",
        "Filter persistence - Your selected filters are saved and restored when you return",
        "Affected CI details - Hover over cards to see which Application CIs have issues"
      ],
      featureList: [
        "Grid and Table views for flexible data visualization",
        "Real-time health status: Healthy (All good), Warning (iTelemetry Early Warnings detected), Critical (Incidents Active)",
        "Availability percentage based on whether an incident has occurred in the last 24hours. Availability calculated as (24 - (non overlapping incident duration)/ 24)*100%",
        "Early warnings counter showing server, service, interface, database, and storage issues",
        "The page auto-refreshes every 5 minutes to keep data upto date",
        "Click any card to navigate to detailed Application Health page"
      ],
      upcomingFeature: []
    }
  };

  const getCurrentPageInfo = () => {
    const path = location.pathname.toLowerCase();
    // Check for matching paths
    if (path.includes('heatmap')) {
      return pageInfoConfig['application heatmap'];
    }
    if (path.includes('wallboard')) {
      return pageInfoConfig['crca application wallboard'];
    }
    return null;
  };

  const handlePageInfoClick = () => {
    setPageInfoModalOpen(true);
  };

  const handlePageInfoClose = () => {
    setPageInfoModalOpen(false);
  };

  const handleCloseDialog = () => {
    setOpenPreferenceDialog(false);
    setSelectedGroups(userSupportGroupList); // Reset to defaults on cancel

  };

  const handleUserPreferencesClick = async () => {
    setOpenPreferenceDialog(true);
    setSupportGroupLoading(true);
    try {
      var supportGroupCheck = "yes"
      const response = await fetch(baseUrl + 'userToSupportGroupMapping', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ supportGroupCheck })
      });

      if (response.ok) {
        const data = await response.json();
        console.log("the support groups data is ", data)
        setSupportGroupList(data.Data); 
      } else {
        console.error('Failed to fetch support groups for user preference');
      }
    } catch (error) {
      console.error('Error fetching support groups for user preference:', error);
    } finally {
      setSupportGroupLoading(false);
    }
  };

  const getDerivedSelectedGroups = () => {
    const isAllSelected = selectedGroups.length === 1 && selectedGroups[0] === 'All';
    return isAllSelected
      ? [...userSupportGroupList, ...supportGroupList.filter(g => !userSupportGroupList.includes(g))]
      : selectedGroups;
  };

  useEffect(() => {
    const loc = String(userProfileData?.officeLocation || '').toLowerCase();
    if (loc.includes('hyderabad') || loc.includes('pgc')) {
      setPreferredTimezone('Asia/Kolkata');
    }
  }, [userProfileData]);

  useEffect(() => {
    //console.log("came inside the preferred timezone")
    const userloc = String(userProfileData?.officeLocation || '').toLowerCase();
    if (userloc.includes('hyderabad') || userloc.includes('pgc')) {
      setPreferredTZ('Asia/Kolkata');
    }
    else{
      setPreferredTZ('America/Los_Angeles')
    }
  }, [userProfileData]);


  const handleSavePreferences = async() => {
    setLoadingHandlePreferences(true);
    console.log('Requested access to support groups:', selectedGroups);

    try {
      //console.log("The user profile data is",userProfileData)
      const userName = userProfileData["displayName"]; 
      const serviceType = "Support Group Request"; 
      const status = "Pending"; 

      const isSelectAll = selectedGroups.length - userSupportGroupList.length === supportGroupList.filter((g) => !userSupportGroupList.includes(g)).length;
      let formattedSupportGroups;
      if(isSelectAll){
        formattedSupportGroups = 'All';
      }
      else{
        const additionalSupportGroups = selectedGroups.filter(
          (group) => !userSupportGroupList.includes(group)
        );
        
        if (additionalSupportGroups.length === 0) {
          setMessage("No new support groups selected.");
          setMessageType("info");
          setLoadingHandlePreferences(false);
          return;
        }
        
        formattedSupportGroups = additionalSupportGroups.join(', ');  
      }

      //const formattedSupportGroups = selectedGroups.join(', ');
      
      console.log('Requested access to support groups:', formattedSupportGroups);

      const response = await fetch(baseUrl + 'logServiceRequests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userName,
          serviceType,
          supportGroups: formattedSupportGroups,
          status
        }),
      });
  
      if (response.ok) {
        const data = await response.json();
        console.log('Preferences saved successfully:', data);
        setMessage("Access request submitted successfully!");
        setMessageType("success");

        setTimeout(() => {
          setOpenPreferenceDialog(false);
          setMessage('');
        }, 3000);
        
      } else {
        console.error('Failed to save preferences');
        setMessage("Failed to submit access request.");
        setMessageType("error");
      }
    } catch (error) {
      console.error('Error saving preferences:', error);
      setMessage("Failed to submit access request.");
      setMessageType("error");
    }
    finally {
      setLoadingHandlePreferences(false);
      //setOpenPreferenceDialog(false);
      setTimeout(() => {
        setMessage('');
      }, 3000);
    }
  
  };

  useEffect(()=>{
    //console.log(location.pathname)
    var tempVar = location.pathname.split("/")
    console.log(tempVar, tempVar.length)
    if(location.pathname==="/homePage"){
      setGlobalFilterChoice({})
    }

    if(tempVar[tempVar.length-1]===""){
      setPageUrl((prevStatus)=>({
        ...prevStatus,
        ["HomePage"] : "/homePage"
      }))
    }
    else{
      var tempPage = capitalize(tempVar[tempVar.length-1])
      setPageUrl((prevStatus)=>({
        ...prevStatus,
        [tempPage] : location.pathname+location.search
      }))
    }
    if((location.pathname+location.search).toLowerCase()==="/applicationhealth?name=all&type=all"){
      handleDrawerOpen()
    }
    else{
      handleDrawerClose()
    }
  },[location.pathname, location.search])

  var fetchApplicationList = async(supportGroups = ["All"]) => {
    const mailAdd = String(userProfileData["mail"] || "");
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
        "supportGroup": supportGroups
    }
    var params = {
      "filters": filterOptions,
      "filterType": "dataFrame"
    };
    console.log("Fetching Application List")
    var url = new URL(baseUrl + 'filters');
    // var url = new URL("http://127.0.0.1:5000/api/" + 'serverLogs');
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
        console.log("Application List data is ready")
        console.log("the data is", JSON.parse(data["Data"]))
        setGlobalApplicationList(JSON.parse(data["Data"]))
        // globalFilterUpdate(JSON.parse(data["ServerLogs"]))  
      })
      .catch((error) =>{ 
        console.log("Error error error")
        console.error('Error:', error)
      });
  }

  var fetchServerListData = async(page = -1, limit = 10, supportGroups = ["All"]) => {
    const mailAdd = String(userProfileData["mail"] || "");
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
        "supportGroup": supportGroups
    }
    // console.log("the filters in the fetchserverlist data are", filterOptions)
    var params = {
      "filters": filterOptions,
      "mailAdd": mailAdd
    };
    
    ////console.log("hello")
    var url = new URL(baseUrl + 'serverLogs');
    // var url = new URL("http://127.0.0.1:5000/api/" + 'serverLogs');
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
        console.log("Server List data is ready")
        globalFilterUpdate(JSON.parse(data["Data"]))  
      })
      .catch((error) =>{ 
        // setLoading(prevLoading=>({
        //   ...prevLoading,
        //   "serverList" : false
        // }));
        console.log("Error error error")
        console.error('Error:', error)
      });
  };

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
        console.log(JSON.parse(data["Data"]))
        setHospitalInformation({"hospitalList":JSON.parse(data["Data"])})
    })
    .catch((error) => {
      console.error('Error:', error)
    });
  };


  useEffect(() => {
    //console.log("came inside the usersupport group useeffect")
    if (userSupportGroupList.length > 0) {
      fetchServerListData(-1, 10, userSupportGroupList);
      fetchApplicationList(userSupportGroupList);
      fetchHospitalData("hospitalList")
    }
  
    if (location.pathname.split("/").length > 1 && sessionStorage.getItem("PathNamesForUrl") !== null) {
      setPageUrl(JSON.parse(sessionStorage.getItem("PathNamesForUrl")));
    }
  }, [userSupportGroupList]);

  useEffect(()=>{
    if(Object.keys(pageUrl).length>0){
      console.log(pageUrl)
      sessionStorage.setItem("PathNamesForUrl", JSON.stringify(pageUrl))
    }
  }, [pageUrl])


  const handleDrawerOpen = () => {
    setOpen(true);
    localStorage.setItem('isDrawerOpen', 'true')
    setHover(false);
  };
  const handleDrawerClose = () => {
    setOpen(false);
    localStorage.setItem('isDrawerOpen', 'false')
    if (!hover) {
      setHover(true);
    }
  };

  const handleVendorClick = () => {
    setOpenVendor(!openVendor);
  };

  const handleRangeSelect = (start, end) => {
    //console.log(start, end)
    setDate({ startDate: start, endDate: end });
  };

  useEffect(()=>{
    if(Object.keys(globalFilterData).length>1 && Object.keys(globalApplicationList).length>0){
      // var appFam = globalFilterData["AppFamily"]
      // var appCi = [...new Set(Object.values(globalFilterData["AppCI"]))]
      // var serverName = globalFilterData["ServerName"]
      // var consolidatedData = {}
      // Object.keys(appFam).map((a)=>{
      //   if((appFam[a] in consolidatedData) && !(consolidatedData[appFam[a]]["Application CI"].includes(globalFilterData["AppCI"][a]))){
      //     consolidatedData[appFam[a]]["Application CI"].push(globalFilterData["AppCI"][a])
      //   }
      //   else if(!(appFam[a] in consolidatedData)){
      //     consolidatedData[appFam[a]] = {"ResourceName":appFam[a], "ResourceType":"Application Family", "Application CI": [globalFilterData["AppCI"][a]] }
      //   }
      // })
      // appCi.map((a)=>{
      //   consolidatedData[a] = {"ResourceName":a, "ResourceType":"Application CI"}
      // })
      var appFam = globalApplicationList["AppFamily"]
      var appCi = [...new Set(Object.values(globalApplicationList["AppCI"]))]
      var serverName = globalFilterData["ServerName"]
      var consolidatedData = {}
      Object.keys(appFam).map((a)=>{
        if((appFam[a] in consolidatedData) && !(consolidatedData[appFam[a]]["Application CI"].includes(globalApplicationList["AppCI"][a]))){
          consolidatedData[appFam[a]]["Application CI"].push(globalApplicationList["AppCI"][a])
        }
        else if(!(appFam[a] in consolidatedData)){
          consolidatedData[appFam[a]] = {"ResourceName":appFam[a], "ResourceType":"Application Family", "Application CI": [globalApplicationList["AppCI"][a]] }
        }
      })
      appCi.map((a)=>{
        consolidatedData[a] = {"ResourceName":a, "ResourceType":"Application CI"}
      })

      // Object.keys(serverName).map((i)=>{
      //   if(globalFilterData["ServerHostingType"][i]){
      //     var resName = globalFilterData["ServerHostingType"][i].toLowerCase()==="cloud" ? 
      //     globalFilterData["SubscriptionID"][i]+"/"+globalFilterData["ResourceGroup"][i]+"/"+globalFilterData["ServerName"][i]
      //     :
      //     globalFilterData["ServerName"][i]
      //     consolidatedData[resName.toLowerCase()] = {"ResourceName":resName.toLowerCase(), "ResourceType":"VM"+"/"+globalFilterData["ServerHostingType"][i]+"/"+globalFilterData["AppCI"][i]}
      //   }
        
      // })
      // setApplicationMapping(consolidatedData)
      console.log(consolidatedData)
      setGlobalFilterList(Object.values(consolidatedData))
      // setGlobalFilter(consolidatedData)
    }
  },[globalFilterData, globalApplicationList])

  return (
    <header>
      <CssBaseline />
      <AppBar position="fixed" open={open} elevation={0} sx={{ backgroundColor: '#f5f5f5' }}>
        <Grid>
          <Toolbar disableGutters>
            <IconButton
              color="inherit"
              aria-label="open drawer"
              onClick={handleDrawerOpen}
              sx={{
                marginRight: 5,
                marginLeft: 2.5,
                ...(open && { display: 'none' }),
                width: 30,
                height: 30,
                padding: 0,
              }}
            >
              <ChevronRightIcon sx={{ color: '#00338e', fontSize: 28 }} />
            </IconButton>
            {(location.pathname.toLowerCase()!="/alertsummary" && location.pathname.toLowerCase()!="/validation" && !location.pathname.toLowerCase().includes("wallboard") && location.pathname.toLowerCase()!="/alertcreation" && location.pathname.toLowerCase()!="/bakingnow")}
            <Box sx={{flexGrow:0}}>
              
              <Breadcrumbs aria-label="breadcrumb" sx={{ color: '#424242' }}>
                {/* <StyledLink to="/"></StyledLink> */}
                {location.pathname.split('/').filter((x) => x).map((part, index, arr) => {
                  var url = `/${arr.slice(0, index + 1).join('/')}`;
                  url = url.slice(1)
                  const isLast = index === arr.length - 1;
                  return isLast  ? (
                    <Typography
                      key={url}
                      p={1}
                      variant={arr.length === 1 ? 'h6' : 'body2'}
                      sx={{ color: arr.length===1 ? '#00338e':'#424242',textDecoration: 'none', borderRadius:1, fontWeight:'bold' }}
                    >
                      {capitalize(part)}
                    </Typography>
                  ) : (
                    <StyledLink
                      onClick = {()=>{setGlobalFilterChoice({})}}
                      key={url}
                      to={capitalize(part) in pageUrl ? pageUrl[capitalize(part)]:"/homePage"}
                    >
                      <Typography variant={'body2'} sx={{color:'#00338e'}}> {capitalize(part)} </Typography>
                      
                    </StyledLink>
                  );
                })}
              </Breadcrumbs>
            </Box>

            

            <Box sx={{flexGrow:2}} mx={2}>
            { ! (location.pathname.toLowerCase().includes("smartscape") || location.pathname.toLowerCase().includes("appstatus")|| location.pathname.toLowerCase().includes("infrastructuretelemetry")|| location.pathname.toLowerCase().includes("serviceengineering") || location.pathname.toLowerCase().includes("applicationonboardingdetails") || location.pathname.toLowerCase().includes("leadershipdashboard") || location.pathname.toLowerCase().includes("applicationinsights")
            || location.pathname.toLowerCase().includes("/bakingnow") || location.pathname.toLowerCase().includes("/alertsuppression") || location.pathname.toLowerCase()=="/alertcreation" || location.pathname.toLowerCase().includes("validation") ||location.pathname.toLowerCase().includes("interfacestatus") || location.pathname.toLowerCase()=="/applicationonboardingsummary" || location.pathname.toLowerCase()=="/majorincidentanalysis" || location.pathname.toLowerCase()=="/alertsummary" || location.pathname.toLowerCase()=="/northstar" || location.pathname.toLowerCase().includes("wallboard") || location.pathname.toLowerCase().includes("heatmap") || location.pathname.toLowerCase()=="/auditreport" ) ?

              <Autocomplete
                  id="global-filter-autocomplete"
                  size="small"
                  fullWidth
                  width = '100%'
                  options={globalFilterList}
                  autoHighlight
                  getOptionLabel={(option) => option.ResourceName.split("/")[option.ResourceName.split("/").length-1]}
                  filterOptions={(globalFilterList, {inputValue}) => {
                    // console.log(inputValue.toLowerCase())
                    const filtered = globalFilterList.filter(option => 
                      option.ResourceName.toLowerCase().includes(inputValue.toLowerCase())
                    );
                    // console.log(filtered)
                    return inputValue ? filtered.slice(0, 100) : filtered.slice(0, 5);
                  }}
                  value={
                    globalFilterList.find(
                      (option) => option.ResourceName === globalFilterChoice.ResourceName
                    ) || null
                  }                  
                  onChange = {(event, value) => {
                    if (value != null) {
                      if (location.pathname.toLowerCase() === "/applicationhealth") {
                        previousAppHealthUrl.current = location.pathname + location.search;
                      }
                      setGlobalFilterChoice(value);
                    }
                  }}
                  // value={1}
                  renderOption={(props, option)=>{
                    return(
                      <Grid container md={12} {...props} key={option.ResourceName}>
                          <Grid md={6} sx={{ display: 'flex', alignItems: 'center'}}>
                              <Typography variant="body1">{option.ResourceName.split("/")[option.ResourceName.split("/").length-1]}</Typography>
                          </Grid>
                          <Grid md={6} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                              <Typography variant="subtitle2">{option.ResourceType}</Typography>                
                          </Grid>  
                      </Grid>
                    )
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      variant="standard"
                      InputProps={{
                        ...params.InputProps,
                        disableUnderline: true,
                        startAdornment: (
                          <InputAdornment position="start">
                            <SearchIcon sx={{ fontSize: 18 }} />
                          </InputAdornment>
                        ),
                        sx: { fontSize: 12 }
                      }}
                      // label= {"Search 'Application Family, Application CI, Server Name'"}
                      placeholder="Search 'Application Family, Application CI, Server Name'"
                    />
                  )}
                  sx={{
                    backgroundColor: "rgba(255,255,255,0.8)",
                    borderRadius: "4px",
                    px: 0.75,
                    py: 0.15,
                    border: "1px solid #E6E8EB",
                    '& .MuiAutocomplete-inputRoot': {
                      minHeight: 28,
                    }}}
              />
              :
              ""
              }
            </Box>

            


            <Box sx={{ flexGrow: 0 }} />
            {location.pathname.toLowerCase()=="/" || location.pathname.toLowerCase()=="/homepage" || location.pathname.toLowerCase()=="/homepage/applicationhealth" || location.pathname.toLowerCase()=="/applicationonboardingdetails" || location.pathname.toLowerCase()=="/leadershipdashboard" 
            || location.pathname.toLowerCase().includes("/alertsuppression") || location.pathname.toLowerCase().includes("/alertcreation") || location.pathname.toLowerCase()=="/applicationonboardingsummary" || location.pathname.toLowerCase()=="/alertsummary"|| location.pathname.toLowerCase().includes("/validation") || location.pathname.toLowerCase().includes("/applicationhealth/appValidation")|| location.pathname.toLowerCase().includes("/applicationhealth/appvalidation") || location.pathname.toLowerCase()=="/northstar" ||location.pathname.toLowerCase().includes("heatmap") || location.pathname.toLowerCase().includes("wallboard") ?
              ""
            :
              <Box id="timeline" sx={{ px: 2}}>
                <TimelineFilter preferredTZ={preferredTZ} onRangeSelect={handleRangeSelect} location={location}/>
              </Box>
            }
            
            <Box sx={{ flexGrow: 0 }} />
            {location.pathname.toLowerCase()=="/" || location.pathname.toLowerCase()=="/homepage" || location.pathname.toLowerCase()=="/homepage/applicationhealth" || location.pathname.toLowerCase()=="/applicationonboardingdetails" || location.pathname.toLowerCase()=="/leadershipdashboard" 
            || location.pathname.toLowerCase()=="/applicationonboardingsummary"|| location.pathname.toLowerCase()=="/alertsummary"|| location.pathname.toLowerCase().includes("/alertsuppression") || location.pathname.toLowerCase()==="/northstar" || location.pathname.toLowerCase()=="/alertcreation" || location.pathname.toLowerCase().includes("wallboard") ?
            ""
            :
            <ToggleButtonGroup
              value={preferredTZ}
              exclusive
              onChange={(_, newTZ) => {
                if (newTZ === 'Asia/Kolkata') {
                  setPreferredTimezone('Asia/Kolkata');
                  setPreferredTZ('Asia/Kolkata');
                } else if (newTZ === 'America/Los_Angeles') {
                  setPreferredTimezone('America/Los_Angeles');
                  setPreferredTZ('America/Los_Angeles');
                }
              }}
              size="small"
              sx={{
                backgroundColor: 'rgba(255,255,255,0.8)',
                borderRadius: '4px',
                border: '1px solid #E6E8EB',
                '& .MuiToggleButton-root': {
                  border: 'none',
                  color: '#333',
                  padding: '2px 10px',
                  fontWeight: 500,
                  fontSize: 12,
                  '&.Mui-selected': {
                    backgroundColor: '#00338e',
                    color: 'white',
                    borderRadius: '4px',
                  },
                  '&:hover': {
                    backgroundColor: '#00338e22',
                  },
                },
              }}
            >
              <ToggleButton value="Asia/Kolkata">IST</ToggleButton>
              <ToggleButton value="America/Los_Angeles">PST</ToggleButton>
            </ToggleButtonGroup>
            }

            {location.pathname.toLowerCase() === "/northstar" && <NorthStarFeedback userProfileData={userProfileData}/>}
            {location.pathname.toLowerCase() !== "/northstar" && <ItelemetryFeedback userProfileData={userProfileData}/>}

            {/* Page Info Icon - only show for pages with info config */}
            {getCurrentPageInfo() && (
              <Tooltip title="Page Information" arrow>
                <IconButton onClick={handlePageInfoClick} sx={{ mx: 0.5, color: '#757575', p: 0.5 }}>
                  <InfoOutlinedIcon sx={{ fontSize: 20 }} />
                </IconButton>
              </Tooltip>
            )}
            
            <ChatOpsHeader supportGroup={userSupportGroupList} backendSessionToken={backendSessionToken} preferredTZ={preferredTZ} chatOpsAccess={chatOpsAccess}/>

            {/* Preference Icon */}
            <IconButton onClick={handleUserPreferencesClick}>
              <ManageAccountsIcon />
            </IconButton>

            <Dialog
              open={openPreferenceDialog}
              onClose={(_, reason) => {
                if (reason !== 'backdropClick' && reason !== 'escapeKeyDown') {
                  handleCloseDialog();
                }
              }}
              fullWidth
              maxWidth="sm"
              PaperProps={{
                sx: { borderRadius: 4, p: 2, textAlign: 'center' }
              }}
            >
              {/* <DialogTitle><Typography sx={{ fontSize: '1.2rem', fontWeight: 'bold', fontStyle: 'italic' }}>Select support groups you'd like to access</Typography></DialogTitle> */}
              <DialogTitle sx={{ textAlign: 'centre', pb: 0 }}>
                <Typography sx={{ fontSize: '1.1rem', fontWeight: 'normal', fontStyle: 'italic' }}>
                  <strong> Select support groups you'd like to access </strong>
                </Typography>
              </DialogTitle>
              <DialogContent>
                <Autocomplete
                  multiple
                  options={['Select All', ...supportGroupList]}
                  value={selectedGroups}
                  disableCloseOnSelect
                  getOptionLabel={(option) => option}
                  isOptionEqualToValue={(option, value) => option === value}
                  disabled={
                    selectedGroups.length === 1 && selectedGroups[0] === 'All'
                  }
                  onChange={(event, newValue) => {
                    const isSelectAllClicked = newValue.includes('Select All');
                    const nonDefaultGroups = supportGroupList.filter(
                      (g) => !userSupportGroupList.includes(g)
                    );
                  
                    const hasSelectedAllNonDefaults =
                      selectedGroups.length - userSupportGroupList.length === nonDefaultGroups.length;
                  
                    if (isSelectAllClicked) {
                      if (hasSelectedAllNonDefaults) {
                        // Toggle off: clear all non-defaults
                        setSelectedGroups([...userSupportGroupList]);
                      } else {
                        // Toggle on: select all
                        const allGroups = [
                          ...userSupportGroupList,
                          ...nonDefaultGroups,
                        ];
                        setSelectedGroups(allGroups);
                      }
                    } else {
                      // Regular selection flow (remove Select All and merge)
                      const additionalGroups = newValue.filter(
                        (item) =>
                          !userSupportGroupList.includes(item) && item !== 'Select All'
                      );
                      setSelectedGroups([...userSupportGroupList, ...additionalGroups]);
                    }
                  }}
                  
                  renderOption={(props, option, { selected }) => {
                    const isDefault = userSupportGroupList.includes(option);
                    console.log("the isDafault is", isDefault)
                    const isSelectAll = option === 'Select All';

                    return (
                      <MenuItem
                        {...props}
                        disabled={isDefault}
                        sx={{ fontStyle: isSelectAll ? 'italic' : 'normal', fontSize: '0.8125rem'}}
                      >
                        <Checkbox
                          size="small"
                          checked={
                            isSelectAll
                              ? selectedGroups.length - userSupportGroupList.length ===
                                supportGroupList.filter((g) => !userSupportGroupList.includes(g)).length
                              : selected
                          }
                        />
                        <ListItemText
                          primary={isSelectAll ? 'Select All Support Groups' : option}
                          secondary={isDefault ? 'Assigned by default' : null}
                          primaryTypographyProps={{ fontSize: '0.8125rem' }} // Small primary text
                          secondaryTypographyProps={{ fontSize: '0.75rem' }} // Smaller secondary text
                        />
                      </MenuItem>
                    );
                  }}
                  renderTags={(value, getTagProps) =>
                    value
                      .filter((val) => val !== 'Select All')
                      .map((option, index) => (
                        <Chip
                          key={option}
                          label={
                            option === 'All'
                              ? 'You have access to all support groups'
                              : option
                          }
                          {...getTagProps({ index })}
                          onDelete={
                            userSupportGroupList.includes(option)
                              ? undefined
                              : getTagProps({ index }).onDelete
                          }
                          //disabled={userSupportGroupList.includes(option)}
                        />
                      ))
                  }
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Support Groups"
                      placeholder="Choose groups…"
                      sx={{
                        "& .MuiInputBase-root": {
                          borderRadius: 2,
                          backgroundColor: "#f4f6f8",
                          "&.Mui-focused": {
                            backgroundColor: "#e0f2f1",
                          },
                        },
                        "& .MuiOutlinedInput-notchedOutline": {
                          borderRadius: 2,
                        },
                      }}
                    />
                  )}
                  sx={{ mt: 2 }}
                />

                <Typography sx={{ mt: 2, fontStyle: 'italic', fontSize: '0.9rem', color: 'text.secondary' }}>
                  Your timezone: <strong>{preferredTZ}</strong>
                </Typography>

                {/* Alert Message */}
                {message && (
                  <Alert
                    severity={messageType}
                    sx={{
                      mt: 3,
                      mb: -1,
                      width: '100%',
                      borderRadius: 2,
                      justifyContent: 'center',
                      textAlign: 'center',
                    }}
                  >
                    {message}
                  </Alert>
                )}
              </DialogContent>
              <DialogActions sx={{ justifyContent: 'center', pb: 2 }}>
                <Button onClick={handleCloseDialog}>Cancel</Button>
                <Button
                  variant="contained"
                  onClick={handleSavePreferences}
                  disabled={loadingHandlePreferences || selectedGroups.includes('All')}
                  size="small"
                >
                  {loadingHandlePreferences ? <CircularProgress size={20} color="inherit" /> : 'Request Access'}
                </Button>
              </DialogActions>
            </Dialog>

            
            <Box sx={{ flexGrow: 0 }}>
                <Box sx={{ p: 0, display: 'flex', alignItems: 'center', color:'gray' }}>
                  <Avatar alt="Eemy Sharp" sx={{
                    width: {
                      xs: 20, // Small screen / mobile
                      sm: 24, // Medium screen / tablet
                      md: 28, // Large screen / desktop
                      lg: 30, // Extra-large screen
                      xl: 32,
                    },
                    height: {
                      xs: 20, // Small screen / mobile
                      sm: 24, // Medium screen / tablet
                      md: 28, // Large screen / desktop
                      lg: 30, // Extra-large screen
                      xl: 32,
                    },
                  }} 
                  src={"photo" in userProfileData ? userProfileData["photo"]:"/static/images/avatar/2.jpg"} />
                  <Typography variant="body2" pl={1}> Hi, <span style={{fontWeight:"bold"}}>{"displayName" in userProfileData ? userProfileData["displayName"]:""}</span></Typography>
                </Box>
            </Box>
          </Toolbar>
        </Grid>
      </AppBar>
 
      <Drawer
        variant="permanent"
        open={open}
        PaperProps={{
          sx: {
            backgroundColor: '#00338e',
            color: '#fff',
            position: 'fixed',
          },
        }}
      >
        <DrawerHeader>
          <img src={ProvidenceLogo} alt="Logo" style={{ width: '80%', height: 'auto' }} />
          <IconButton onClick={handleDrawerClose} sx={{ color: '#fff' }}>
            {theme.direction === 'rtl' ? <ChevronRightIcon /> : <ChevronLeftIcon />}
            {/* <img src={ProvidenceLogo} alt="Logo" style={{ width: '80%', height: 'auto' }} /> */}
          </IconButton>
        </DrawerHeader>
        <List>
          {routes.map((text, index) => {
            const routeName = text.split('?')[0].toLowerCase();
            
            return (
              <ListItem key={text} disablePadding sx={{ display: 'block' }}>
                <Tooltip title={!open ? routesLabels[index] : ''} placement="right" arrow>
                  <ListItemButton
                    disabled = {pageDevStatus[index]=="disabled" ? true : false}
                    component={Link}
                    onClick={(e)=>{
                        const targetUrl = `/${text}`;
                        // If already on this route, prevent navigation
                        if ((location.pathname + location.search) === targetUrl) {
                          e.preventDefault();
                          return;
                        }
                        setGlobalFilterChoice({});
                    }}
                    to={`/${text}`}
                    sx={{
                      minHeight: 48,
                      px: 2.5,
                      color: '#fff',
                      justifyContent: open ? 'initial' : 'center',
                      '&:hover': {
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        color: '#fff',
                        '& .MuiListItemIcon-root': {
                          color: '#fff',
                        },
                      },
                      ...(location.pathname === `/${text}` && {
                        backgroundColor: 'rgba(255, 255, 255, 0.2)',
                        color: '#fff',
                        '&:hover': {
                          backgroundColor: 'rgba(255, 255, 255, 0.3)',
                          color: '#fff',
                        },
                      }),
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: 0,
                        mr: open ? 3 : 'auto',
                        justifyContent: 'center',
                        color: location.pathname === `/${text}` ? '#fff' : '#fff',
                      }}
                    >
                      {React.createElement(icons[index])}
                    </ListItemIcon>
                    <ListItemText 
                      primary={routesLabels[index]} 
                      sx={{ opacity: open ? 1 : 0 }} 
                    />
                  </ListItemButton>
                </Tooltip>
              </ListItem>
            );
          })}
        </List>
      </Drawer>
      {getCurrentPageInfo() && (
        <Modal open={pageInfoModalOpen} onClose={handlePageInfoClose}>
          <Box>
            <CreateTourCard
              pageHeader={getCurrentPageInfo().header}
              pageDescription={getCurrentPageInfo().description}
              newFeature={getCurrentPageInfo().newFeature}
              featureList={getCurrentPageInfo().featureList}
              upcominFeature={getCurrentPageInfo().upcomingFeature}
              handleModalTourClose={handlePageInfoClose}
              modalTourOpen={pageInfoModalOpen}
            />
          </Box>
        </Modal>
      )}
    </header>
  );
}
 
export default Header;
