import './App.css';
import React, { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { useLocation, Routes, Route } from 'react-router-dom';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Unstable_Grid2';
import Header from './Components/features/Header/Header';
const Logs = lazy(() => import('./Components/features/Logs/Logs'));
const ServiceEngineeringCentral = lazy(() => import('./Components/features/ServiceEngineering/ServiceEngineeringCentral'));
const AppsAnalysis = lazy(() => import('./Components/features/SmartscapeTopology/SmartscapeTopology'));
const AnomalyDetection = lazy(() => import('./Components/features/AnomalyDetection/AnomalyDetection'));
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
import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import { loginRequest, getToken, getTokenBackend } from './authConfig';
import {callMsGraph} from './graph'
import { CircularProgress } from '@mui/material';
const AppMonitoringDashboard = lazy(() => import('./Components/features/HomePage/AppExceptions'));
import {trackUserLogin,initializeAppInsights } from './Components/features/appInsights';
const ItelemetrySummary = lazy(() => import('./Components/features/LeadershipDashboard/iTelemetrySummary'));
const MiSummaryAnalysis = lazy(() => import('./Components/features/LeadershipDashboard/MiSummary'));
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

  const [hospitalInformation, setHospitalInformation] = useState({})
  const [globalFilterData, setGlobalFilterData] = useState({})
  const [globalApplicationList, setGlobalApplicationList] = useState({})
  const [globalFilterChoice, setGlobalFilterChoice] = useState({})
  const [userProfile, setUserProfile] = useState({})
  const [accessToken, setAccessToken] = useState("")
  const [accessTokenBackend, setAccessTokenBackend] = useState("")
  const [isSessionExpired, setIsSessionExpired] = useState(false)
  const [isSessionExpiredBackendToken, setIsSessionExpiredBackendToken] = useState(false)
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const [entryTime, setEntryTime] = useState(null);
  const [open, setOpen] = useState(false);
  const [userSupportGroups, setUserSupportGroups] = useState([]);
  const [appValidationAccess, setAppValidationAccess] = useState("NoAccess");
  const [chatOpsAccess, setChatOpsAccess] = useState("NoAccess");
  const [supportGroupsLoaded, setSupportGroupsLoaded] = useState(false);
  const [preferredTZ, setPreferredTZ] = useState("");
  const previousAppHealthUrlRef = React.useRef("");
  const [userRoles, setUserRoles] = useState([])
  const baseUrl = getUrl()

  const generateSessionId = () => {
    const array = new Uint8Array(16); // 128 bits of randomness
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  };

  const getTokens = useCallback(() => {
    const needGraph = accessToken === "";
    const needBackend = accessTokenBackend === "" || isSessionExpiredBackendToken;
    if (!needGraph && !needBackend) {
      return;
    }
    // Fetch both tokens in parallel rather than chaining them sequentially.
    Promise.all([
      needGraph ? getToken(instance, accounts) : Promise.resolve(accessToken),
      needBackend ? getTokenBackend(instance, accounts) : Promise.resolve(accessTokenBackend),
    ]).then(([graphTok, backendTok]) => {
      if (needGraph) {
        setAccessToken(graphTok)
      }
      if (needBackend) {
        setAccessTokenBackend(backendTok)
      }
    })
  }, [instance, accounts, accessToken, accessTokenBackend, isSessionExpiredBackendToken])

  useEffect(() => {
    if (inProgress !== "none" || accounts.length === 0) {
      return
    }
    getTokens()
  }, [accounts, inProgress, getTokens])

  useEffect(() => {
    if (accounts.length > 0) {
      setUserRoles(accounts[0]["idTokenClaims"]["roles"] || [])
    }
  }, [accounts])

  useEffect(() => {
    const userloc = String(userProfile?.officeLocation || '').toLowerCase();
    if (userloc.includes('hyderabad') || userloc.includes('pgc')) {
      setPreferredTZ('Asia/Kolkata');
    } else {
      setPreferredTZ('America/Los_Angeles')
    }
  }, [userProfile]);

  useEffect(() => {
    if (accounts.length === 0 && inProgress === "none") {
      instance.loginRedirect(loginRequest).catch(error => {
        console.error("Login error:", error)
      })
    }
  }, [instance, accounts, inProgress])

  useEffect(() => {
    if (accessToken !== "") {
      callMsGraph(accessToken).then((data) => {
        setUserProfile(data);
        const currentTime = Date.now();
        const sessionTimeout = 30 * 60 * 1000; // 30 minutes in milliseconds
        const sessionExpirationTime = sessionStorage.getItem('sessionExpirationTime');
        const parsedSessionExpirationTime = sessionExpirationTime ? parseInt(sessionExpirationTime, 10) : 0;

        if (!sessionExpirationTime || currentTime - parsedSessionExpirationTime > sessionTimeout) {
          setIsSessionExpired(true)
          const newSessionId = generateSessionId();
          sessionStorage.setItem('sessionId', newSessionId);
          sessionStorage.setItem('sessionExpirationTime', currentTime.toString());
          trackUserLogin(data, newSessionId);
        } else {
          const sessionId = sessionStorage.getItem('sessionId');
          trackUserLogin(data, sessionId);
        }

        sessionStorage.setItem('userId', data.id);
        sessionStorage.setItem('userName', data.displayName);
      });
    }
  }, [accessToken]);

  useEffect(() => {
    if (Object.keys(userProfile).length > 0) {
      fetchUserSupportGroupsList();
    }
  }, [userProfile]);

  const fetchUserSupportGroupsList = async () => {
    const mailAdd = String(userProfile["mail"] || "");

    try {
      const response = await fetch(baseUrl + 'userToSupportGroupMapping', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ mailAdd })
      });

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
    } finally {
      setSupportGroupsLoaded(true);
    }
  };

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
      }
    };
  }, []);

  const isBootstrapped =
    isAuthenticated &&
    inProgress === "none" &&
    Object.keys(userProfile).length > 0 &&
    accessToken.length > 0 &&
    accessTokenBackend.length > 0 &&
    supportGroupsLoaded;

  return (
    <>
      {isBootstrapped ? (
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
              <Route path="/" element={<AppPodsWallboard userProfileData={userProfile} appInsights={appInsights} supportGroup={userSupportGroups} backendSessionToken={accessTokenBackend} hospitalInformation={hospitalInformation} />}/>
              <Route path="/homePage" element={<NavigateToAppHealth/>}/>
              <Route path="/logs" element={<Logs />} />
              <Route path="/smartscape topology" element={<AppsAnalysis date={date} appInsights={appInsights} />} />
              <Route path="/leadership dashboard" element={<LeadershipDashboard appInsights={appInsights} />} />
              <Route path="/validation" element={<AppValidation userProfileData={userProfile} preferredTZ={preferredTZ} appInsights={appInsights} accounts ={accounts} appValidationAccess={appValidationAccess}/>} />
              <Route path="/serviceengineering" element={<ServiceEngineeringCentral />} />
              <Route path="/applicationHealth" element={<ApplicationDownDetailsNew  key={location.pathname+location.search} globalFilterChoice={globalFilterChoice} setGlobalFilterChoice={setGlobalFilterChoice} setGlobalFilterData={setGlobalFilterData} globalFilterData={globalFilterData} appInsights={appInsights} backendSessionToken={accessTokenBackend} setIsSessionExpiredBackendToken={setIsSessionExpiredBackendToken} supportGroup={userSupportGroups} hospitalInformation={hospitalInformation} date={date} preferredTZ={preferredTZ} previousAppHealthUrl={previousAppHealthUrlRef} globalApplicationList={globalApplicationList}/> } />

              <Route path="/applicationHealth/serverStatus" element={<ServerDrillDown date={date} globalFilterChoice={globalFilterChoice} setGlobalFilterData={setGlobalFilterData} globalFilterData={globalFilterData} appInsights={appInsights} hospitalInformation={hospitalInformation} preferredTZ={preferredTZ}/>} />
              <Route path="/serverStatus" element={<ServerDrillDown date={date} globalFilterChoice={globalFilterChoice} setGlobalFilterData={setGlobalFilterData} globalFilterData={globalFilterData} appInsights={appInsights} hospitalInformation={hospitalInformation}/>} />

              <Route path="/homePage/serverStatus" element={<ServerDrillDown date={date} globalFilterChoice={globalFilterChoice} setGlobalFilterData={setGlobalFilterData} globalFilterData={globalFilterData} appInsights={appInsights} preferredTZ={preferredTZ} />}/>
              <Route path="/leadership-mock" element={<LeadershipMock/>} />
              <Route path="/applicationHealth/AppStatus" element={<ApplicationStatus date={date} appInsights={appInsights} globalFilterData={globalFilterData} preferredTZ={preferredTZ}/>} />
              <Route path="/applicationHealth/NetworkStatus" element={<DummyUINetwork date={date} />} />
              <Route path="/applicationHealth/InterfaceStatus" element={<InterfaceStatus date={date} appInsights={appInsights} globalFilterChoice={globalFilterChoice} globalFilterData={globalFilterData} preferredTZ={preferredTZ} />} />
              <Route path="/applicationHealth/DatabaseMetrics" element={<DatabaseMetrics date={date} appInsights={appInsights} globalFilterChoice={globalFilterChoice} globalFilterData={globalFilterData} hospitalInformation={hospitalInformation} preferredTZ={preferredTZ}/>} />
              <Route path="/applicationHealth/AppValidation" element={<ValidationDrilldown date={date} appInsights={appInsights} globalFilterChoice={globalFilterChoice} globalFilterData={globalFilterData} hospitalInformation={hospitalInformation} preferredTZ={preferredTZ}/>} />
              <Route path="/applicationHealth/FileshareMetrics" element={<FileshareMetrics date={date} preferredTZ={preferredTZ}/>} />
              <Route path="/applicationHealth/Security" element={<SecurityMetrics />} />
              <Route path="/applicationHealth/Citrix" element={<Citrix backendSessionToken={accessTokenBackend} preferredTZ={preferredTZ} />} />
              <Route path="/leadershipDashboard" element={<LeadershipDashboard appInsights={appInsights} />} />
              <Route path="/majorIncidentAnalysis" element={<MiSummaryAnalysis date={date} appInsights={appInsights} globalFilterData={globalFilterData}/>} />
              <Route path="/applicationOnboardingSummary" element={<ItelemetrySummary appInsights={appInsights} globalFilterData={globalFilterData}/>} />
              <Route path="/applicationOnBoardingDetails" element={<OnboardedApplicationdata userProfileData={userProfile} appInsights={appInsights} />} />
              <Route path="/alertSummary/alertSuppression" element={<AlertManager userProfileData={userProfile} appInsights={appInsights} backendSessionToken={accessTokenBackend} setIsSessionExpiredBackendToken={setIsSessionExpiredBackendToken}/>} />
              <Route path="/alertSuppression" element={<AlertManager userProfileData={userProfile} appInsights={appInsights} backendSessionToken={accessTokenBackend} setIsSessionExpiredBackendToken={setIsSessionExpiredBackendToken} />} />
              <Route path="/auditReport" element={<AuditReport globalFilterData={globalFilterData} preferredTZ={preferredTZ} date={date} appInsights={appInsights} accounts = {accounts}/>} />
              <Route path="/alertCreation" element={<AlertsCreation userProfileData={userProfile} appInsights={appInsights} backendSessionToken={accessTokenBackend} setIsSessionExpiredBackendToken={setIsSessionExpiredBackendToken} globalFilterData={globalFilterData} supportGroup={userSupportGroups}/>} />
              <Route path="/alertSummary/alertCreation" element={<AlertsCreation userProfileData={userProfile} appInsights={appInsights} backendSessionToken={accessTokenBackend} setIsSessionExpiredBackendToken={setIsSessionExpiredBackendToken} globalFilterData={globalFilterData} supportGroup={userSupportGroups}/>} />
              <Route path="/alert Creation" element={<AlertsCreation userProfileData={userProfile} appInsights={appInsights} backendSessionToken={accessTokenBackend} setIsSessionExpiredBackendToken={setIsSessionExpiredBackendToken} globalFilterData={globalFilterData} supportGroup={userSupportGroups}/>} />
              <Route path="/alert Suppression" element={<AlertSuppression userProfileData={userProfile} appInsights={appInsights} backendSessionToken={accessTokenBackend} setIsSessionExpiredBackendToken={setIsSessionExpiredBackendToken} globalFilterData={globalFilterData}/>} />
              <Route path="/homePage/applicationHealth/ApplicationInsights" element={<AppMonitoringDashboard date={date} appInsights={appInsights} />} />
              <Route path="/alertSummary" element={<AlertSummary date={date} setDate={setDate} userProfile={userProfile} supportGroup={userSupportGroups} appInsights={appInsights}/>}/>
              <Route path="/alertSummary/serverstatus" element={<ServerDrillDown date={date} globalFilterChoice={globalFilterChoice} setGlobalFilterData={setGlobalFilterData} globalFilterData={globalFilterData} appInsights={appInsights} hospitalInformation={hospitalInformation} preferredTZ={preferredTZ}/>} />
              <Route path="/bakingNow" element={<BakingNow appInsights={appInsights} preferredTZ={preferredTZ} date={date}/>} />

              <Route path="/northStar" element={<NorthStarHome userProfileData={userProfile}/>} />
              <Route path="/CRCA application wallboard" element={<AppPodsWallboard userProfileData={userProfile} appInsights={appInsights} supportGroup={userSupportGroups} backendSessionToken={accessTokenBackend} hospitalInformation={hospitalInformation} />} />
              <Route path="/application heatmap" element={<SummaryOverview preferredTZ={preferredTZ} globalFilterData={globalFilterData}/>} />
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
