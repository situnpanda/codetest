import './App.css';
import React, { useEffect, lazy, Suspense } from 'react';
import {useNavigate, useLocation} from 'react-router-dom'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Unstable_Grid2';
import Header from './Components/features/Header/Header';
const Logs = lazy(() => import('./Components/features/Logs/Logs'));
const ServiceEngineeringCentral = lazy(() => import('./Components/features/ServiceEngineering/ServiceEngineeringCentral'));
const AppsAnalysis = lazy(() => import('./Components/features/SmartscapeTopology/SmartscapeTopology'));
const AnomalyDetection = lazy(() => import('./Components/features/AnomalyDetection/AnomalyDetection'));
import { useState } from 'react';
const ValidationDrilldown = lazy(() => import('./Components/features/HomePage/AppValidation'));
const ServerDrillDown = lazy(() => import('./Components/features/HomePage/ServerDrillDown'));
const ApplicationStatus = lazy(() => import('./Components/features/HomePage/AppStatus'));
const DummyUINetwork = lazy(() => import('./Components/features/HomePage/NetworkStatus'));
const InterfaceStatus = lazy(() => import('./Components/features/HomePage/InterfaceStatus'));
const AlertManager = lazy(() => import('./Components/features/AlertManager/AlertManager'));
const AlertsCreation = lazy(() => import('./Components/features/AlertManager/AlertsCreation'));
const LeadershipMock = lazy(() => import('./Components/features/LeadershipMock'));
const AlertSummary = lazy(() => import('./Components/features/AlertManager/AlertSummary'));
const AppValidation = lazy(() => import('./Components/features/AppValidation/AppValidation'));
const DatabaseMetrics = lazy(() => import('./Components/features/HomePage/DatabaseMetricsDrillDown'));
const NavigateToAppHealth = lazy(() => import('./Components/features/HomePage/NavigateToAppHealth'));
const ApplicationDownDetailsNew = lazy(() => import('./Components/features/HomePage/ApplicationDownDetails'));
const OnboardedApplicationdata = lazy(() => import('./Components/features/LeadershipDashboard/OnboardedApplicationdata'));
const LeadershipDashboard = lazy(() => import('./Components/features/LeadershipDashboard/LeadershipDashboard'));
const FileshareMetrics = lazy(() => import('./Components/features/HomePage/FileshareMetrics'));
const SecurityMetrics = lazy(() => import('./Components/features/HomePage/Security'));
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { useMsal, useIsAuthenticated, MsalProvider } from '@azure/msal-react';
import { loginRequest, getToken, getTokenBackend } from './authConfig';
import {callMsGraph} from './graph'
import { CircularProgress } from '@mui/material';
const AppMonitoringDashboard = lazy(() => import('./Components/features/HomePage/AppExceptions'));
import {trackUserLogin,initializeAppInsights } from './Components/features/appInsights';
const ItelemetrySummary = lazy(() => import('./Components/features/LeadershipDashboard/iTelemetrySummary'));
const MiSummaryAnalysis = lazy(() => import('./Components/features/LeadershipDashboard/MiSummary'));
import './App.css';
import {getUrl} from './environment'
const NorthStarHome = lazy(() => import('./Components/features/NorthStarHome/NorthStarHome'));
const AppPodsWallboard = lazy(() => import('./Components/features/AppPodsWallboard/AppPodsWallboard'));
const SummaryOverview = lazy(() => import('./Components/features/LeadershipSummary/LeadershipSummary'));
const BakingNow = lazy(() => import('./Components/features/BakingNow/BakingNow'));
const AlertSuppression = lazy(() => import('./Components/features/AlertManager/AlertSuppression/AlertSuppression'));
const Citrix = lazy(() => import('./Components/features/Citrix/Citrix'));
const AuditReport = lazy(() => import('./Components/features/AuditReport/AuditReport'));

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('America/Los_Angeles'); 

function App({msalInstance, appInsights}) {
  
  const [date, setDate] = useState({
    startDate: "",
    endDate: ""
  });
  const location = useLocation();
  
  var [hospitalInformation ,setHospitalInformation] = useState({})
  var [globalFilterData, setGlobalFilterData] = useState({})
  var [globalApplicationList, setGlobalApplicationList] = useState({})
  var [globalFilterChoice, setGlobalFilterChoice] = useState({})
  var [userProfile, setUserProfile] = useState({})
  var [isInteractionInProgress, setIsInteractionInProgress] = useState(false)
  var [accessToken, setAccessToken] = useState("")
  var [accessTokenBackend, setAccessTokenBackend] = useState("")
  var [isSessionExpired, setIsSessionExpired] = useState(false)
  var [isSessionExpiredBackendToken, setIsSessionExpiredBackendToken] = useState(false)
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const [entryTime, setEntryTime] = useState(null);
  const [open, setOpen] = useState(false);
  const [supportGroupList, setSupportGroupList] = useState([]);
  const [userSupportGroups, setUserSupportGroups] = useState([]);
  const [appValidationAccess, setAppValidationAccess] = useState("NoAccess");
  const [chatOpsAccess, setChatOpsAccess] = useState("NoAccess");
  var [preferredTZ, setPreferredTZ] = useState("");
  const previousAppHealthUrlRef = React.useRef("");
  var [userRoles, setUserRoles] = useState([])
  var baseUrl =  getUrl()

  useEffect(()=>{
    if((accessTokenBackend=="" || !isSessionExpiredBackendToken) && inProgress=="none"){
      if (accounts.length > 0) {
        // console.log(accounts[0]["idTokenClaims"]["roles"])
        getAccessTokenBackend()
      }
    }
    if(accessToken=="" && inProgress=="none"){
      if (accounts.length > 0) {
        getAccessToken()
      }
    }
  },[accessTokenBackend, isSessionExpiredBackendToken, accounts, accessToken, inProgress])

  useEffect(()=>{
    if (accounts.length > 0) {
      console.log("here in the accounts useeffect")
      console.log(accounts[0]["idTokenClaims"]["roles"])
      setUserRoles(accounts[0]["idTokenClaims"]["roles"] || [])
      // getAccessTokenBackend()
    }
  },[accounts])
  // console.log("accounts: ",accounts)
  useEffect(() => {
      console.log(userProfile)
      //console.log("came inside the preferred timezone")
      console.log("userprofiledata: ",userProfile)
      const userloc = String(userProfile?.officeLocation || '').toLowerCase();
      if (userloc.includes('hyderabad') || userloc.includes('pgc')) {
        setPreferredTZ('Asia/Kolkata');
      }
      else{
        setPreferredTZ('America/Los_Angeles')
      }
  }, [userProfile]);

  useEffect(() => {
    console.log(accounts.length)
    if (accounts.length === 0 && inProgress=="none") {
      console.log("in here")
      // setIsInteractionInProgress(true)
      instance.loginRedirect(loginRequest).then(response => {
        // setIsInteractionInProgress(false)
      }).catch(error => {
        // setIsInteractionInProgress(false)
        console.error("Login error:", error)
      }) 
    }
  }, [instance, accounts, inProgress])

  const generateSessionId = () => {
    const array = new Uint8Array(16); // 16 bytes = 128 bits
    crypto.getRandomValues(array); // Fill the array with random values
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  };

  useEffect(() => {
    if (accessToken !== "") {
      // console.log(accessToken)
      callMsGraph(accessToken).then((data) => {
        console.log(data)
        setUserProfile(data);
        const currentTime = Date.now();
        const sessionTimeout = 30 * 60 * 1000; // 30 minutes in milliseconds
        const sessionExpirationTime = sessionStorage.getItem('sessionExpirationTime');
        
        // Parse sessionExpirationTime to ensure it's a valid number
        const parsedSessionExpirationTime = sessionExpirationTime ? parseInt(sessionExpirationTime, 10) : 0;
  
        if (!sessionExpirationTime || currentTime - parsedSessionExpirationTime > sessionTimeout) {
          setIsSessionExpired(true)
          console.log("Session expired or not set. Generating a new session ID.");
          const newSessionId = generateSessionId();
          sessionStorage.setItem('sessionId', newSessionId);
          sessionStorage.setItem('sessionExpirationTime', currentTime.toString()); // Store as string
          trackUserLogin(data, newSessionId);
        } else {
          console.log("Session is still valid. Using existing session ID.");
          const sessionId = sessionStorage.getItem('sessionId');
          trackUserLogin(data, sessionId);
        }
  
        sessionStorage.setItem('userId', data.id);
        sessionStorage.setItem('userName', data.displayName);
        
        console.log(data);
      });
    }
  }, [accessToken]);

  var getAccessToken = () => {
    getToken(instance, accounts)
    .then((result)=>{
      setAccessToken(result)
      return result
    })
  }

  var getAccessTokenBackend = () => {
    getTokenBackend(instance, accounts)
    .then((result)=>{
      console.log("Backend Token set")
      setAccessTokenBackend(result)
      return result
    })
  }

  useEffect(() => {
    if (Object.keys(userProfile).length > 0) {
      // Call your function here
      //console.log("The user profile data is ", userp)
      fetchUserSupportGroupsList();
    }
  }, [userProfile]);

  const fetchUserSupportGroupsList = async () => {
    console.log("came into the fetchuser support group in app.js function")
    const mailAdd = String(userProfile["mail"] || "");
    console.log("The mail address in the app.js is", mailAdd)
  
    try {
      const response = await fetch(baseUrl + 'userToSupportGroupMapping', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ mailAdd })
      });
  
      // const supportGroups = await response.json();
      // const updatedSupportGroups = supportGroups
      //setUserSupportGroups(updatedSupportGroups);
      const result = await response.json();
    
    // Handle the uniform envelope: payload is under result.Data
    const payload = (result && result.Data) ? result.Data : {};
    if (payload.supportGroups && payload.appValidation !== undefined) {
      setUserSupportGroups(payload.supportGroups);
      setAppValidationAccess(payload.appValidation || "NoAccess");
      setChatOpsAccess(payload.chatOpsAccess || "NoAccess");
    } 
  
    } catch (error) {
      console.error("Failed to fetch support groups:", error);
    }
  };
  
  // useEffect(() => {
  //   if (userSupportGroups.length > 0) {

  //     console.log("Support groups have been set:", userSupportGroups);
  //     // Perform any action you need here (e.g., call another API)
  //   }
  // }, [userSupportGroups]);


  useEffect(() => {
    localStorage.setItem("isDrawerOpen", true)
    const currentTime = Date.now();
    setEntryTime(currentTime);
    return () => {
      const exitTime = Date.now();
      const timeSpent = exitTime - currentTime;
      if (appInsights) {
        appInsights.trackMetric({
          name: 'TimeSpentInApp',
          average: timeSpent / 1000,
        });
        console.log('Time Spent:', timeSpent / 1000, 'seconds');
      }
    };
  }, []);

  return (
    <>
      {isAuthenticated && inProgress === "none" && Object.keys(userProfile).length>0 && accessToken.length>0 && accessTokenBackend.length>0 && userSupportGroups.length>0 ? (
        <Box sx={{ display: 'flex' }}>
          <div className={`app-container ${open ? 'drawer-open' : 'drawer-closed'}`}></div>
          <Header
            date={date}
            setDate={setDate}
            preferredTZ={preferredTZ} 
            setPreferredTZ ={setPreferredTZ}
            globalFilterData={globalFilterData}
            setGlobalFilterChoice={setGlobalFilterChoice}
            globalFilterChoice={globalFilterChoice}
            globalFilterUpdate={setGlobalFilterData}
            setGlobalApplicationList={setGlobalApplicationList}
            globalApplicationList={globalApplicationList}
            userSupportGroupList={userSupportGroups}
            userProfileData={userProfile}
            setHospitalInformation={setHospitalInformation}
            previousAppHealthUrl={previousAppHealthUrlRef}
            backendSessionToken={accessTokenBackend}
            chatOpsAccess={chatOpsAccess}
          />
          <Box component="main" sx={{ flexGrow: 1, backgroundColor: '#f5f5f5', height: '100vh', mt: 4, overflow: 'auto' }}>
            <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', height: '60vh' }}><CircularProgress /></Box>}>
            <Routes>
              <Route exact path="/" element={<AppPodsWallboard userProfileData={userProfile} appInsights={appInsights} supportGroup={userSupportGroups} backendSessionToken={accessTokenBackend} hospitalInformation={hospitalInformation} />}/>
              <Route exact path="/homePage" element={<NavigateToAppHealth/>}/>
              <Route exact path="/logs" element={<Logs />} />
              <Route exact path="/smartscape topology" element={<AppsAnalysis date={date} appInsights={appInsights} />} />
              <Route exact path="/leadership dashboard" element={<LeadershipDashboard appInsights={appInsights} />} />
              <Route exact path="/validation" element={<AppValidation userProfileData={userProfile} preferredTZ={preferredTZ} appInsights={appInsights} accounts ={accounts} appValidationAccess={appValidationAccess}/>} />
              <Route exact path="/serviceengineering" element={<ServiceEngineeringCentral />} />
              <Route path="/applicationHealth" element={<ApplicationDownDetailsNew  key={location.pathname+location.search} globalFilterChoice={globalFilterChoice} setGlobalFilterChoice={setGlobalFilterChoice} setGlobalFilterData={setGlobalFilterData} globalFilterData={globalFilterData} appInsights={appInsights} backendSessionToken={accessTokenBackend} setIsSessionExpiredBackendToken={setIsSessionExpiredBackendToken} supportGroup={userSupportGroups} hospitalInformation={hospitalInformation} date={date} preferredTZ={preferredTZ} previousAppHealthUrl={previousAppHealthUrlRef} globalApplicationList={globalApplicationList}/> } />

              <Route exact path="/applicationHealth/serverStatus" element={<ServerDrillDown date={date} globalFilterChoice={globalFilterChoice} setGlobalFilterData={setGlobalFilterData} globalFilterData={globalFilterData} appInsights={appInsights} hospitalInformation={hospitalInformation} preferredTZ={preferredTZ}/>} />
              <Route exact path="/serverStatus" element={<ServerDrillDown date={date} globalFilterChoice={globalFilterChoice} setGlobalFilterData={setGlobalFilterData} globalFilterData={globalFilterData} appInsights={appInsights} hospitalInformation={hospitalInformation}/>} />

              <Route exact path="/homePage/serverStatus" element={<ServerDrillDown date={date} globalFilterChoice={globalFilterChoice} setGlobalFilterData={setGlobalFilterData} globalFilterData={globalFilterData} appInsights={appInsights} preferredTZ={preferredTZ} />}/>
              <Route exact path="/leadership-mock" element={<LeadershipMock/>} />
              <Route exact path="/applicationHealth/AppStatus" element={<ApplicationStatus date={date} appInsights={appInsights} globalFilterData={globalFilterData} preferredTZ={preferredTZ}/>} />
              <Route exact path="/applicationHealth/NetworkStatus" element={<DummyUINetwork date={date} />} />
              <Route exact path="/applicationHealth/InterfaceStatus" element={<InterfaceStatus date={date} appInsights={appInsights} globalFilterChoice={globalFilterChoice} globalFilterData={globalFilterData} preferredTZ={preferredTZ} />} />
              <Route exact path="/applicationHealth/DatabaseMetrics" element={<DatabaseMetrics date={date} appInsights={appInsights} globalFilterChoice={globalFilterChoice} globalFilterData={globalFilterData} hospitalInformation={hospitalInformation} preferredTZ={preferredTZ}/>} />
              <Route exact path="/applicationHealth/AppValidation" element={<ValidationDrilldown date={date} appInsights={appInsights} globalFilterChoice={globalFilterChoice} globalFilterData={globalFilterData} hospitalInformation={hospitalInformation} preferredTZ={preferredTZ}/>} />
              <Route exact path="/applicationHealth/FileshareMetrics" element={<FileshareMetrics date={date} preferredTZ={preferredTZ}/>} />
              <Route exact path="/applicationHealth/Security" element={<SecurityMetrics />} />
               <Route exact path="/applicationHealth/Citrix" element={<Citrix backendSessionToken={accessTokenBackend} preferredTZ={preferredTZ} />} />
              <Route exact path="/leadershipDashboard" element={<LeadershipDashboard appInsights={appInsights} />} />
              <Route exact path="/majorIncidentAnalysis" element={<MiSummaryAnalysis date={date} appInsights={appInsights} globalFilterData={globalFilterData}/>} />
              <Route exact path="/applicationOnboardingSummary" element={<ItelemetrySummary appInsights={appInsights} globalFilterData={globalFilterData}/>} />
              <Route exact path="/applicationOnBoardingDetails" element={<OnboardedApplicationdata userProfileData={userProfile} appInsights={appInsights} />} />
              <Route exact path="/alertSummary/alertSuppression" element={<AlertManager userProfileData={userProfile} appInsights={appInsights} backendSessionToken={accessTokenBackend} setIsSessionExpiredBackendToken={setIsSessionExpiredBackendToken}/>} />
              <Route exact path="/alertSuppression" element={<AlertManager userProfileData={userProfile} appInsights={appInsights} backendSessionToken={accessTokenBackend} setIsSessionExpiredBackendToken={setIsSessionExpiredBackendToken} />} />
              <Route exact path="/auditReport" element={<AuditReport globalFilterData={globalFilterData} preferredTZ={preferredTZ} date={date} appInsights={appInsights} accounts = {accounts}/>} />
              <Route exact path="/alertCreation" element={<AlertsCreation userProfileData={userProfile} appInsights={appInsights} backendSessionToken={accessTokenBackend} setIsSessionExpiredBackendToken={setIsSessionExpiredBackendToken} globalFilterData={globalFilterData} supportGroup={userSupportGroups}/>} />
              <Route exact path="/alertSummary/alertCreation" element={<AlertsCreation userProfileData={userProfile} appInsights={appInsights} backendSessionToken={accessTokenBackend} setIsSessionExpiredBackendToken={setIsSessionExpiredBackendToken} globalFilterData={globalFilterData} supportGroup={userSupportGroups}/>} />
              <Route exact path="/alert Creation" element={<AlertsCreation userProfileData={userProfile} appInsights={appInsights} backendSessionToken={accessTokenBackend} setIsSessionExpiredBackendToken={setIsSessionExpiredBackendToken} globalFilterData={globalFilterData} supportGroup={userSupportGroups}/>} />
              <Route exact path="/alert Suppression" element={<AlertSuppression userProfileData={userProfile} appInsights={appInsights} backendSessionToken={accessTokenBackend} setIsSessionExpiredBackendToken={setIsSessionExpiredBackendToken} globalFilterData={globalFilterData}/>} />
              <Route exact path="/homePage/applicationHealth/ApplicationInsights" element={<AppMonitoringDashboard date={date} appInsights={appInsights} />} />
              <Route exact path="/alertSummary" element={<AlertSummary date={date} setDate={setDate} userProfile={userProfile} supportGroup={userSupportGroups} appInsights={appInsights}/>}/>
              <Route exact path="/alertSummary/serverstatus" element={<ServerDrillDown date={date} globalFilterChoice={globalFilterChoice} setGlobalFilterData={setGlobalFilterData} globalFilterData={globalFilterData} appInsights={appInsights} hospitalInformation={hospitalInformation} preferredTZ={preferredTZ}/>} />
              <Route exact path="/bakingNow" element={<BakingNow appInsights={appInsights} preferredTZ={preferredTZ} date={date}/>} />

              <Route exact path="/northStar" element={<NorthStarHome userProfileData={userProfile}/>} />
              <Route exact path="/CRCA application wallboard" element={<AppPodsWallboard userProfileData={userProfile} appInsights={appInsights} supportGroup={userSupportGroups} backendSessionToken={accessTokenBackend} hospitalInformation={hospitalInformation} />} />
              {/* <Route exact path="/leadership-mock" element={<LeadershipMock/>} /> */}
              <Route exact path="/application heatmap" element={<SummaryOverview preferredTZ={preferredTZ} globalFilterData={globalFilterData}/>} />
            </Routes>
            </Suspense>
          </Box>
        </Box>
      ) : (
        <Grid container xs={12} justifyContent={"center"} alignItems={"center"}>
          <CircularProgress />
        </Grid>
      )}
    </>
  );
}

export default App;
