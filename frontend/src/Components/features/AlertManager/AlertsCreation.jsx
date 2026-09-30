import React, { useEffect, useState } from 'react'
import Grid from '@mui/material/Unstable_Grid2';
import { Modal, Card, Stack,Chip,CardHeader,Avatar,CardContent, CardActionArea, Typography, Box, Accordion, AccordionSummary, AccordionDetails, Divider, Button, TextField, ButtonGroup, Autocomplete, Radio, InputAdornment, Skeleton } from '@mui/material';
import { styled, keyframes } from '@mui/material/styles';
import {useLocation} from 'react-router-dom'
import CircularProgress from '@mui/material/CircularProgress';
import {Alert} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import '../../../assets/css/fonts.css';
import {getUrl} from '../../../environment'
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import DeveloperBoardIcon from '@mui/icons-material/DeveloperBoard'
import CloudIcon from '@mui/icons-material/Cloud'
import EmailIcon from '@mui/icons-material/Email'
import GroupsIcon from '@mui/icons-material/Groups'
import StorageIcon from '@mui/icons-material/Storage'
import AlertCreationServerDetails from './AlertCreationFormTypes/AlertCreationServerDetails';
import AlertCreationServicesDetails from './AlertCreationFormTypes/AlertCreationServicesDetails';
import AlertCreationDatabaseDetails from './AlertCreationFormTypes/AlertCreationDatabaseDetails';
import AlertCreationFileStorageDetails from './AlertCreationFormTypes/AlertCreationFileStorageDetails';
import { logPageVisit,startPageTracking,appInsights } from '../appInsights'; // Import the function

export default function AlertsCreation({userProfileData, appInsights, backendSessionToken, setIsSessionExpiredBackendToken, globalFilterData, supportGroup}) {

    var baseUrl =  getUrl()
    const location = useLocation();
    var urlParams = new URLSearchParams(location.search)
    var [metricsType, setMetricsType] = useState({
        0:"Server", 1:"Services", 2:"Database", 3:"File Storage", 4: "Review + Save"
    })

    var [error, setError] = useState({
        "servicesList" : "",
        "infraList" : "",
        "dbList" : "",
        "submitRequest": "",
        "fileshareList" :"",
        "getAlertData" : ""
    })

    var [submitSuccess, setSubmitSuccess] = useState(false)
    var [apiLoading, setApiLoading] = useState({"getAlertData":false, "submitRequest": false,})
    var [tabValue, setTabValue] = useState(0)
    var [lastFormTab,setLastFormTab] = useState(0)
    var [applicationFamily, setApplicationFamily] = useState("")
    var [applicationFamilyList, setApplicationFamilyList] = useState([])
    var [showReview,setShowReview] = useState(false)
    var [infraFilterData, setInfraFilterData] = useState([])
    var [servicesFilterData, setServicesFilterData] = useState([])
    var [dbFilterData, setDbFilterData] = useState([])
    var [fileshareFilterData, setFileshareFilterData] = useState([])
    var [watchlistOptions, setWatchlistOptions] = useState([])

    var [alertMetaData, setAlertMetaData] = useState({
        "Services":[{}],
        "Server":[{}],
        "Database" : [{}],
        "File Storage" : [{}]
    })
    const [formErrors, setFormErrors] = useState({});

    useEffect(()=>{
        console.log("Entered Alert Creation")
        fetchWatchlist()
    },[])

    useEffect(() => {
        startPageTracking(window.location.href);
        return () => {
            logPageVisit();      
            if (appInsights) {
                appInsights.flush();
                console.log('[Page] Flushed telemetry on unmount.');
            }
        };
    }, [location]);

    useEffect(()=>{
        // Check if supportGroup is valid and NOT ['All']
        const hasSpecificSupportGroups = supportGroup && supportGroup.length > 0 && !supportGroup.includes('All');
        
        if(Object.keys(globalFilterData).length>0 && hasSpecificSupportGroups){
            // Filter AppFamily based on user's support groups
            var filteredAppFamilies = []
            var appFam = globalFilterData["AppFamily"]
            var supportGroupData = globalFilterData["SupportGroup"]
            if(appFam && supportGroupData){
                Object.keys(appFam).forEach((index) => {
                    var appFamily = appFam[index]
                    var sg = supportGroupData[index]
                    // Include if the support group matches one of user's support groups
                    if(supportGroup.includes(sg) && !filteredAppFamilies.includes(appFamily)){
                        filteredAppFamilies.push(appFamily)
                    }
                })
            }
            setApplicationFamilyList([...new Set(filteredAppFamilies)])
        } else if(Object.keys(globalFilterData).length>0){
            // Show all if supportGroup is ['All'] or no supportGroup filter
            var appFam = Object.values(globalFilterData["AppFamily"])
            setApplicationFamilyList([...new Set(appFam)])
        }
    },[globalFilterData, supportGroup])

    useEffect(()=>{
        if(applicationFamily!="" && applicationFamily!=null){
            getServicesList()
            getInfraList()
            getAlertData()
            getDbList()
            getfileshareList()
        }
        else{
            setApiLoading((prevStatus)=>({
                ...prevStatus,
                "getAlertData" : false
            }))
        }
    },[applicationFamily])

    useEffect(()=>{
        console.log(apiLoading)
    }, [apiLoading])


    // ✅ When moving onto the Review tab, flip showReview on;
    // moving off it flips showReview off. Also remember the
    // last non-review form tab to return to.
    var handleTabChange = (e, value) => {
        const nextLabel = metricsType[value]
        setSubmitSuccess(false)
        if (nextLabel === "Review + Save") {
            setLastFormTab(tabValue)
            validateForm()
            setShowReview(true)
        } else {
            setShowReview(false)
        }
        setTabValue(value)
    }

    // Keyframe animations for loading effects
    const shimmer = keyframes`
        0% {
            background-position: -1000px 0;
        }
        100% {
            background-position: 1000px 0;
        }
    `;

    const pulse = keyframes`
        0%, 100% {
            opacity: 1;
        }
        50% {
            opacity: 0.5;
        }
    `;

    const fadeIn = keyframes`
        from {
            opacity: 0;
            transform: translateY(10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    `;

    var styleAccordian = (loading)=>({
        position: 'relative', 
        flex:1,
        background: 'white',
        borderRadius:"5px",
        overflow: 'hidden', 
        padding: "10px",
        '.overlayLoader': loading ? { opacity: 1, } : { opacity: 0, },
    })

    const overlayLoaderStyle = (isLoading)=> ({ 
        position: 'absolute', 
        top: 0, 
        left: 0, 
        width: '100%', 
        height: '100%',
        background: 'linear-gradient(135deg, rgba(0, 51, 142, 0.96) 0%, rgba(0, 51, 142, 0.94) 100%)',
        display: isLoading ? 'flex' : 'none', 
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center', 
        opacity: 0, 
        transition: 'opacity 0.3s ease-in-out', 
        color: 'white',
        zIndex: 10,
        backdropFilter: 'blur(4px)'
    })

    var handleApplicationFamilyChange = (e, value) => {
        setInfraFilterData([])
        setServicesFilterData([])
        setDbFilterData([])
        setFileshareFilterData([])
        setAlertMetaData({
            "Services":[{}],
            "Server":[{}],
            "Database" : [{}],
            "File Storage" : [{}]
        })
        setApplicationFamily(value)
        setFormErrors({})
        setApiLoading((prevStatus)=>({
            ...prevStatus,
            "getAlertData" : true
        }))
    }

    const getInfraList = () => {
        var options = []
        // console.log(globalFilterData)
        Object.values(globalFilterData["AppFamily"]).map((val, index)=>{

            var serverName = globalFilterData["ServerName"][index]
            var resName = ""
            
            if(globalFilterData["ServerHostingType"][index]==="Cloud"){
              var subId = globalFilterData["SubscriptionID"][index]
              var rg = globalFilterData["ResourceGroup"][index]
              resName = subId+"/"+rg+"/"+serverName
            }
            else{
              resName = serverName
            }
            
            var appCI = globalFilterData["AppCI"][index]

            if(val.toLowerCase()===applicationFamily.toLowerCase()){
                options.push({"ResourceName":resName, "ApplicationCI":appCI})
            }
        })
        setInfraFilterData(options)
    }

    const getDbList = () => {
    
        setError((prevStatus)=>({
            ...prevStatus,
            "databaseList" : ""
        }))

        var params = {
            "appFamily" : applicationFamily,
            "type" : "database_new"
        }

        // const url = new URL("http://127.0.0.1:5000/api/" + "getOnboardingList");
        const url = new URL(baseUrl + "getOnboardingList");
        
        fetch(url,{
            method:"POST",
            headers: {
            'Content-Type': 'application/json',
            // "Authorization": Bearer ${backendSessionToken}
            },
            body: JSON.stringify(params)
        }).then((response)=>response.json())
        .then((data)=>{
            var tempData = JSON.parse(data["Data"])
            // console.log(tempData)
            if(Object.keys(tempData).length>0){
                var temp = []
                Object.values(tempData["Server Name"]).map((val,index)=>{
                    var serverName = val
                    var resourceParts = tempData["Resource Name"][index].split("/")
                    var resName = tempData["Hosting Type"][index]==="Cloud" ? (resourceParts[1]+"/"+resourceParts[3]+"/"+resourceParts[5]+"/"+resourceParts[7]):resourceParts[1]+"/"+resourceParts[3]
                    var databaseName =  tempData["Database Name"][index]
                    var appCI = tempData["Application CI"][index]
                    temp.push({"ResourceName":resName, "ApplicationCI":appCI})
                })
                console.log(temp)
                setDbFilterData(temp)
            }
        })
        .catch((error)=>{
            console.log(error)
            setError((prevStatus)=>({
                ...prevStatus,
                "databaseList" : error
            }))
        })
    }

    const getfileshareList = () => {
    
        setError((prevStatus)=>({
            ...prevStatus,
            "fileshareList" : ""
        }))

        var params = {
            "appFamily" : applicationFamily,
            "type" : "fileshare_new"
        }

        // const url = new URL("http://127.0.0.1:5000/api/" + "getOnboardingList");
        const url = new URL(baseUrl + "getOnboardingList");
        fetch(url,{
            method:"POST",
            headers: {
            'Content-Type': 'application/json',
            // "Authorization": Bearer ${backendSessionToken}
            },
            body: JSON.stringify(params)
        }).then((response)=>response.json())
        .then((data)=>{
            var tempData = JSON.parse(data["Data"])
            // console.log(tempData)
            if(Object.keys(tempData).length>0){
                var temp = []
                Object.values(tempData["Storage Name"]).map((val,index)=>{
                    var resourceParts = tempData["Resource Name"][index].split("/")
                    var resName = tempData["Hosting Type"][index]==="Cloud" ? (resourceParts[1]+"/"+resourceParts[3]+"/"+resourceParts[5]+"/"+resourceParts[7]):resourceParts[1]+"/"+resourceParts[3]
                    var appCI = tempData["Application CI"][index]
                    temp.push({"ResourceName":resName, "ApplicationCI":appCI})
                })
                console.log(temp)
                setFileshareFilterData(temp)
            }
        })
        .catch((error)=>{
            console.log(error)
            setError((prevStatus)=>({
                ...prevStatus,
                "databaseList" : error
            }))
        })
    }

    const getServicesList = () => {
        setError((prevStatus)=>({
            ...prevStatus,
            "servicesList" : ""
        }))
        var params = {
            "appFamily" : applicationFamily,
            "type" : "services_new"
        }
        // const url = new URL("http://127.0.0.1:5000/api/" + "getOnboardingList");
        const url = new URL(baseUrl + "getOnboardingList");
        fetch(url,{
            method:"POST",
            headers: { 'Content-Type': 'application/json'},
            body: JSON.stringify(params)
        })
        .then((response)=>response.json())
        .then((data)=>{
            var tempData = JSON.parse(data["Data"])
            if(Object.keys(tempData).length>0){
                var temp = []
                Object.values(tempData["Server Name"]).map((val,index)=>{
                    var serverName = val
                    var resourceParts = tempData["Resource Name"][index].split("/")
                    var resName = tempData["Hosting Type"][index]==="Cloud" ? (resourceParts[1]+"/"+resourceParts[3]+"/"+resourceParts[5]+"/"+resourceParts[7]):resourceParts[1]+"/"+resourceParts[3]
                    var serviceName =  tempData["Service Name"][index]
                    var appCI = tempData["Application CI"][index]
                    // resName = appCI+"/"+serverName
                    temp.push({"ResourceName":resName, "ServiceName":serviceName})
                })
                console.log(temp);
                setServicesFilterData(temp)
            }
        })
        .catch((error)=>{
            console.log(error)
            setError((prevStatus)=>({
                ...prevStatus,
                "servicesList" : error
            }))
        })
    }

    const getAlertData = () => {
        setError((prevStatus)=>({
            ...prevStatus,
            "getAlertData" : ""
        }))
        setApiLoading((prevStatus)=>({
            ...prevStatus,
            "getAlertData" : true
        }))
        var params = { "applicationFamily" : applicationFamily }
        // const url = new URL("http://127.0.0.1:5000/api/" + "AlertRules/ReadAlertRules");
        const url = new URL(baseUrl + "AlertRules/ReadAlertRules");
        fetch(url,{
            method:"POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        }).then((response)=>response.json())
        .then((data)=>{
            var temp = JSON.parse(JSON.stringify(data))["Data"]
            var state = JSON.parse(JSON.stringify(data))["status"]
            data = JSON.parse(JSON.stringify(data))["Data"]
            if(state!=200){
                throw new Error("Exception")
            }
            console.log(temp)
            Object.keys(data).map((metricType)=>{
                data[metricType].map((val, ind)=>{
                    if (Object.keys(val).includes("Resources")){
                        temp[metricType][ind]["Resources"] = []
                        val["Resources"].map((value)=>{
                            var resourceName = value.split(",")[0]
                            var appCI = value.split(",")[1]
                            if(metricType==="Services"){
                                 temp[metricType][ind]["Resources"].push({"ResourceName":resourceName, "ServiceName":appCI})
                            }
                            else{
                                temp[metricType][ind]["Resources"].push({"ResourceName":resourceName, "ApplicationCI":appCI})
                            }
                        })
                    }
                })
            })
            setAlertMetaData(temp)
            setApiLoading((prevStatus)=>({
                ...prevStatus,
                "getAlertData" : false
            }))
        })
        .catch((error)=>{
            console.log(error)
            setApiLoading((prevStatus)=>({
                ...prevStatus,
                "getAlertData" : false
            }))
            setError((prevStatus)=>({
                ...prevStatus,
                "getAlertData" : "Fetch Alert configuration API didnot load as expected. Please Try again and if issue persists reach out to iTelemetry team."
            }))
        })
    }

    const submitRequest = () => {
        setError((prevStatus)=>({
            ...prevStatus,
            "submitRequest" : ""
        }))
        setSubmitSuccess(false)
        setApiLoading((prevStatus)=>({
            ...prevStatus,
            "submitRequest" : true
        }))
        var params = { "applicationFamily" : applicationFamily, "data" : alertMetaData }
        // const url = new URL("http://127.0.0.1:5000/api/" + "AlertRules/UpdateAlertRules");
        const url = new URL(baseUrl + "AlertRules/UpdateAlertRules");
        fetch(url,{
            method:"POST",
            headers: { 
                'Content-Type': 'application/json',
                "Authorization": `Bearer ${backendSessionToken}`
            },
            body: JSON.stringify(params)
        }).then((response)=>response.json())
        .then((data)=>{ 
            console.log(data)
            if(data["status"]!==200){
                throw new Error("Exception")
            } 
            setApiLoading((prevStatus)=>({
                ...prevStatus,
                "submitRequest" : false
            }))
            setSubmitSuccess(true)
        })
        .catch((error)=>{ 
            setApiLoading((prevStatus)=>({
                ...prevStatus,
                "submitRequest" : false
            }))
            setError((prevStatus)=>({
                ...prevStatus,
                "submitRequest" : "Alert configuration API didnot work as expected. Please Try again and if issue persists reach out to iTelemetry team."
            }))
            console.log(error) 
        })
    }

    const fetchWatchlist = async () => {
        try {
          // setLoadingWatchlist(true); // Set loading to true when fetching data
    
          const response = await fetch(baseUrl + 'getUserWatchlistAlertManager', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
    
          if (!response.ok) {
            throw new Error('Failed to fetch watchlist');
          }
    
          const data = await response.json();
    
          // Extract non-empty emails
          const emails = data.Data.emailAddress
            .map(item => item.Emails)
            .filter(email => email.trim() !== "");
    
          setWatchlistOptions(emails); // Store in state
          console.log(emails)
        } catch (error) {
          console.error('Error fetching watchlist:', error);
          setWatchlistOptions([]);
        } finally {
          // setLoadingWatchlist(false); // Set loading to false after data is fetched
        }
    };

    var handleFooterbuttonClick = (val) => {
        setSubmitSuccess(false)
        if(val=="Previous"){
            if(tabValue!=0){
                setTabValue(tabValue-1)
            }
        }
        else if(val=="Next"){
            if(tabValue!=Object.keys(metricsType).length-1){
                setTabValue(tabValue+1)
                // flip showReview if we just landed on the Review tab
                const nextLabel = metricsType[tabValue+1]
                if(nextLabel==="Review + Save"){
                    validateForm()
                    setShowReview(true)
                }
            }
            else {
                validateForm()
                setShowReview(true)
                setLastFormTab(tabValue)
            }
        }
        else if(val==="Review + Save"){
            validateForm()
            setShowReview(true)
            setLastFormTab(tabValue)
            setTabValue(4) // Set to Review tab index
        }
    }
    
    useEffect(()=>{
        console.log("Error Validating Form")
        console.log(formErrors)
    }, [formErrors])

    var validateForm = () => {
        var tempDict = {}
        // console.log(alertMetaData)
        Object.keys(alertMetaData).map((type)=>{
            // console.log(type)
            tempDict[type]={}
            alertMetaData[type].map((val, ind)=>{
                if(Object.keys(val).length===0){
                    return
                }
                // Required Paramters Validation
                if(type !== "Services" &&  "Data Aggregation" in val){
                    if(val["Data Aggregation"]==null || val["Data Aggregation"]===""){
                        if(ind in Object.keys(tempDict[type])){
                            tempDict[type][ind].push('Data Aggregation value is invalid/missing')
                        }
                        else{
                            tempDict[type][ind]=['Data Aggregation value is invalid/missing']
                        }
                    }
                }
                else if(type !== "Services" &&  (!("Data Aggregation" in val))){
                    if(ind in Object.keys(tempDict[type])){
                        tempDict[type][ind].push('Data Aggregation value is invalid/missing')
                    }
                    else{
                        tempDict[type][ind]=['Data Aggregation value is invalid/missing']
                    }
                }

                if("Resources" in val){
                    if(val["Resources"]==null || val["Resources"].length===0){
                        if(ind in Object.keys(tempDict[type])){
                            tempDict[type][ind].push('Resources list cannot be empty')
                        }
                        else{
                            tempDict[type][ind]=['Resources list cannot be empty']
                        }
                    }
                }
                else{
                    if(ind in Object.keys(tempDict[type])){
                        tempDict[type][ind].push('Resources list cannot be empty')
                    }
                    else{
                        tempDict[type][ind]=['Resources list cannot be empty']
                    }
                }

                if("Communication" in val){
                    if(val["Communication"]["Type"]=="Email" && (!("DL" in val["Communication"]) ||val["Communication"]["DL"].length===0)){
                        if(ind in Object.keys(tempDict[type])){
                            tempDict[type][ind].push('Email Ids are invalid/missing')
                        }
                        else{
                            tempDict[type][ind]=['Email Ids are invalid/missing']
                        }
                    }
                }
                else{
                    if(ind in Object.keys(tempDict[type])){
                        tempDict[type][ind].push('Communication details are missing')
                    }
                    else{
                        tempDict[type][ind]=['Communication details are missing']
                    }
                }

                if("Alert Frequency" in val){
                    if(val["Alert Frequency"]==null || val["Alert Frequency"]===""){
                        if(ind in Object.keys(tempDict[type])){
                            tempDict[type][ind].push('Alert Frequency value is invalid/missing')
                        }
                        else{
                            tempDict[type][ind]=['Alert Frequency value is invalid/missing']
                        }
                    }
                }
                else{
                    if(ind in Object.keys(tempDict[type])){
                        tempDict[type][ind].push('Alert Frequency value is invalid/missing')
                    }
                    else{
                        tempDict[type][ind]=['Alert Frequency value is invalid/missing']
                    }
                }

                // Threshold Validations
                if(type==="Server" && ("CPU Custom Threshold" in val || "Memory Custom Threshold" in val)){
                    if((val["CPU Custom Threshold"]===null || val["CPU Custom Threshold"]==="") && (val["Memory Custom Threshold"]===null || val["Memory Custom Threshold"]==="")){
                        if(ind in Object.keys(tempDict[type])){
                            tempDict[type][ind].push('Atleast one Custom Threshold value(CPU/Memory) is required')
                        }
                        else{
                            tempDict[type][ind]=['Atleast one Custom Threshold value(CPU/Memory) is required']
                        }
                    }
                }
                else if(type==="Server" && !("CPU Custom Threshold" in val) && !("Memory Custom Threshold" in val)){
                    if(ind in Object.keys(tempDict[type])){
                        tempDict[type][ind].push('Atleast one Custom Threshold value(CPU/Memory) is required')
                    }
                    else{
                        tempDict[type][ind]=['Atleast one Custom Threshold value(CPU/Memory) is required']
                    }
                }

                if(type==="Database" && ("DTU Custom Threshold" in val || "Storage Custom Threshold" in val || "CPU Custom Threshold" in val)){
                    if((val["DTU Custom Threshold"]===null || val["DTU Custom Threshold"]==="") && (val["Storage Custom Threshold"]===null || val["Storage Custom Threshold"]==="") && (val["CPU Custom Threshold"]===null || val["CPU Custom Threshold"]==="")){
                        if(ind in Object.keys(tempDict[type])){
                            tempDict[type][ind].push('Atleast one Custom Threshold value(DTU/Storage/CPU) is required')
                        }
                        else{
                            tempDict[type][ind]=['Atleast one Custom Threshold value(DTU/Storage/CPU) is required']
                        }
                    }
                }
                else if(type==="Database" && !("DTU Custom Threshold" in val) && !("Storage Custom Threshold" in val) && !("CPU Custom Threshold" in val)){
                    if(ind in Object.keys(tempDict[type])){
                        tempDict[type][ind].push('Atleast one Custom Threshold value(DTU/Storage/CPU) is required')
                    }
                    else{
                        tempDict[type][ind]=['Atleast one Custom Threshold value(DTU/Storage/CPU) is required']
                    }
                }

                if(type==="File Storage" && ("Storage Custom Threshold" in val)){
                    if((val["Storage Custom Threshold"]===null || val["Storage Custom Threshold"]==="")){
                        if(ind in Object.keys(tempDict[type])){
                            tempDict[type][ind].push('Storage Custom Threshold value is required')
                        }
                        else{
                            tempDict[type][ind]=['Storage Custom Threshold value is required']
                        }
                    }
                }
                else if(type==="File Storage" && !("Storage Custom Threshold" in val)){
                    if(ind in Object.keys(tempDict[type])){
                        tempDict[type][ind].push('Storage Custom Threshold value is required')
                    }
                    else{
                        tempDict[type][ind]=['Storage Custom Threshold value is required']
                    }
                }
            })
        })
        tempDict = Object.fromEntries(
            Object.entries(tempDict).filter(([k, v]) => Object.keys(v).length > 0)
        );
        setFormErrors(tempDict);
    }

    var FormData = ({type}) => {
        var [modalOpen, setModalOpen] = useState(false)
        var [deleteInd, setDeleteInd] = useState(null)
        var [tempAlertMetaData, setTempAlertMetaData] = useState(alertMetaData)
        

        useEffect(()=>{
          console.log(tempAlertMetaData);
        },[tempAlertMetaData])

        // ---- MODAL ----
        var handleModalClose = () => setModalOpen(false)
        var handleModalOpen = (ind) => { setDeleteInd(ind); setModalOpen(true) }

        // ---- FIELD CHANGE ----
        var handleFormChange = (ind, dataType, data) => {
            var temp = tempAlertMetaData
            if(dataType.includes("Communication-")){
                var tempSplit = dataType.split("-")
                if(tempSplit[1]==="Type"){
                    temp[type][ind]["Communication"]={"Type":data}
                    if("teams channel" === data.toLowerCase()){
                        temp[type][ind]["Communication"]["Group ID"] = "fc6329d4-9fc4-47f7-aad2-95dd2d5e6839"
                        temp[type][ind]["Communication"]["Teams Channel ID"] = "19%3Ae6906b3303df4e6d9958604bf07e4690%40thread.tacv2"
                    }
                }
                else{
                    temp[type][ind]["Communication"] = temp[type][ind]["Communication"] || {}
                    if(Array.isArray(data)){
                      data.sort()
                    }
                    temp[type][ind]["Communication"][tempSplit[1]] = data
                }
            }
            else if (dataType === "Communication-Type") {
                temp[type][ind]["Communication"] = { Type: data }
            }
            else{
                if(!(dataType in Object.keys(temp[type][ind]))){
                    temp[type][ind][dataType] = null
                }
                temp[type][ind][dataType] = data
            }
            if(!Object.keys(temp[type][ind]).includes("Hosting Type")){
                temp[type][ind]["Hosting Type"] = "Cloud"
            }

            setTempAlertMetaData((prevStatus)=>({
                ...prevStatus,
                [type] : temp[type]
            }))
        }

        var handleAddIconClick = () => {
            var temp = tempAlertMetaData[type]
            temp.push({})
            setAlertMetaData((prevStatus)=>({
                ...prevStatus,
                [type] : temp
            }))
            setTempAlertMetaData((prevStatus)=>({
                ...prevStatus,
                [type] : temp
            }))
        }

        var handleDeleteIconClick = () => {
            var temp = tempAlertMetaData[type]
            setFormErrors({})
            temp = temp.filter((val, index)=>index!=deleteInd)
            if(temp.length==0){
                temp.push({})
            }
            setAlertMetaData((prevStatus)=>({
                ...prevStatus,
                [type] : temp
            }))
            setTempAlertMetaData((prevStatus)=>({
                ...prevStatus,
                [type] : temp
            }))
            // setFormErrors(prev => {
            //   const next = { ...prev }
            //   delete next[deleteInd]
            //   return next
            // })
            setModalOpen(false)
        }

        return(
            <React.Fragment>
                {type==="Server"?
                <AlertCreationServerDetails infraFilterData={infraFilterData} watchlistOptions={watchlistOptions} setTempAlertMetaData={setTempAlertMetaData} tempAlertMetaData={tempAlertMetaData} modalOpen={modalOpen} handleModalOpen={handleModalOpen} handleModalClose={handleModalClose} handleDeleteIconClick={handleDeleteIconClick} handleAddIconClick={handleAddIconClick} handleFormChange={handleFormChange} formErrors={formErrors}/>
                :
                (type==="Services" ? 
                    <AlertCreationServicesDetails servicesFilterData={servicesFilterData} watchlistOptions={watchlistOptions} setTempAlertMetaData={setTempAlertMetaData} tempAlertMetaData={tempAlertMetaData} modalOpen={modalOpen} handleModalOpen={handleModalOpen} handleModalClose={handleModalClose} handleDeleteIconClick={handleDeleteIconClick} handleAddIconClick={handleAddIconClick} handleFormChange={handleFormChange} formErrors={formErrors}/>
                    :
                    (type==="Database" ? 
                    <AlertCreationDatabaseDetails dbFilterData={dbFilterData} watchlistOptions={watchlistOptions} setTempAlertMetaData={setTempAlertMetaData} tempAlertMetaData={tempAlertMetaData} modalOpen={modalOpen} handleModalOpen={handleModalOpen} handleModalClose={handleModalClose} handleDeleteIconClick={handleDeleteIconClick} handleAddIconClick={handleAddIconClick} handleFormChange={handleFormChange} formErrors={formErrors}/>
                    :
                    (type==="File Storage" ?
                        <AlertCreationFileStorageDetails fileshareFilterData={fileshareFilterData} watchlistOptions={watchlistOptions} setTempAlertMetaData={setTempAlertMetaData} tempAlertMetaData={tempAlertMetaData} modalOpen={modalOpen} handleModalOpen={handleModalOpen} handleModalClose={handleModalClose} handleDeleteIconClick={handleDeleteIconClick} handleAddIconClick={handleAddIconClick} handleFormChange={handleFormChange} formErrors={formErrors}/>
                        :
                        ""
                    )
                    )
                )
                }
                
                {/* Create a wrapper div that naturally extends the button row */}
                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    width: '100%',
                    marginTop: '16px',
                    paddingLeft: '0px',
                    paddingRight: '16px'
                }}>
                    <div></div> {/* Empty div to push buttons to the right */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {/* Removed inline buttons as per the change request */}
                    </div>
                </div>

            </React.Fragment>
        )
    }

    return (
        <Grid container my={4} p={2} mb={0} justifyContent='center' alignItems='center' sx={{ backgroundColor: 'white'}}>
            {applicationFamily==="" || applicationFamily===null ? 
                <Grid container m={1}> 
                    <Alert severity="info" m={1}>This is to inform that a selction of <b>Application Family</b> is mandatory for Alert related data to load.</Alert>
                </Grid>
            :
                ""
            }
            <Grid container xs={12} spacing={2}>
                <Grid item sm={12} md={3}>
                    <Autocomplete 
                        size="small"
                        options = {applicationFamilyList}
                        renderInput={(params) => <TextField {...params} label="Application Family" />}
                        onChange={handleApplicationFamilyChange}
                    />
                </Grid>
                <Grid item sm={12} md={9} sx={{display: 'flex', justifyContent: 'flex-end'}}>
                    <Tabs 
                        value={tabValue} 
                        onChange={handleTabChange} 
                        sx={{
                            backgroundColor:"#f5f5f5", 
                            borderTopLeftRadius:"5px", 
                            borderTopRightRadius:"5px",
                            '& .MuiTab-root': {
                                color: '#666',
                                fontSize: '0.72rem',
                                minHeight: 30,
                                maxWidth: 40,
                                paddingLeft: 8,
                                paddingRight: 8,
                                '&.Mui-selected': {
                                    backgroundColor: 'rgba(0, 51, 142, 0.1)',
                                    color: '#00338e'
                                }
                            }
                        }}
                    >
                        {Object.values(metricsType).map((val)=>
                            <Tab key={val} label={val} disabled={val ==="Load Balancer" || val === "Database"}/>
                        )}
                    </Tabs>
                </Grid>
            </Grid>

            <Grid container xs={12} mt={2} p={2} sx={styleAccordian(applicationFamily===null || apiLoading["getAlertData"])} >
                {apiLoading["submitRequest"] ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300, width: '100%' }}>
                        <Box sx={{ textAlign: 'center' }}>
                            <CircularProgress size={50} sx={{ color: '#00338e', mb: 2 }} />
                            <Typography sx={{ fontSize: '.95rem', fontWeight: 600, color: '#00338e' }}>Submitting Alert Configuration...</Typography>
                            <Typography sx={{ fontSize: '.80rem', color: 'text.secondary', mt: 0.5 }}>Please wait while we save your changes</Typography>
                        </Box>
                    </Box>
                ) : submitSuccess && tabValue===4 ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300, width: '100%' }}>
                        <Box sx={{ textAlign: 'center', maxWidth: 600, p: 4 }}>
                            <Box sx={{ 
                                width: 70, 
                                height: 70, 
                                borderRadius: '50%', 
                                bgcolor: 'rgba(34, 197, 94, 0.15)', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                margin: '0 auto',
                                mb: 3
                            }}>
                                <Typography sx={{ fontSize: '2rem', color: '#22c55e', fontWeight: 300 }}>✓</Typography>
                            </Box>
                            <Typography sx={{ fontSize: '1.3rem', fontWeight: 700, color: '#1e293b', mb: 1 }}>
                                Configuration Submitted Successfully!
                            </Typography>
                            <Typography sx={{ fontSize: '.90rem', color: 'text.secondary', mb: 4, lineHeight: 1.6 }}>
                                Your alert configuration for <strong>{applicationFamily}</strong> has been saved and will be active shortly.
                            </Typography>
                            <Button 
                                variant="contained" 
                                onClick={() => { 
                                    setSubmitSuccess(false); 
                                    setShowReview(false); 
                                    setTabValue(0); 
                                    getAlertData();
                                }} 
                                sx={{ 
                                    textTransform: 'none', 
                                    fontSize: '.90rem', 
                                    bgcolor: '#00338e',
                                    px: 4,
                                    py: 1,
                                    boxShadow: '0 4px 12px rgba(0, 51, 142, 0.2)',
                                    '&:hover': {
                                        bgcolor: '#002870',
                                        boxShadow: '0 6px 16px rgba(0, 51, 142, 0.3)'
                                    }
                                }}
                            >
                                Submit Another Configuration
                            </Button>
                        </Box>
                    </Box>
                ) : error["submitRequest"] ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300, width: '100%' }}>
                        <Box sx={{ textAlign: 'center', maxWidth: 500 }}>
                            <WarningAmberIcon sx={{ fontSize: 60, color: '#d32f2f', mb: 2 }} />
                            <Typography sx={{ fontSize: '1.1rem', fontWeight: 600, color: '#d32f2f', mb: 1 }}>Submission Failed</Typography>
                            <Typography sx={{ fontSize: '.85rem', color: 'text.secondary', mb: 3 }}>{error["submitRequest"]}</Typography>
                            <Button variant="contained" onClick={() => { setError((prev) => ({ ...prev, submitRequest: "" })); setShowReview(false); setTabValue(lastFormTab); }} 
                                sx={{ textTransform: 'none', fontSize: '.85rem', bgcolor: '#00338e' }}>Go Back</Button>
                        </Box>
                    </Box>
                ) : !showReview ? (
                    <FormData type={metricsType[tabValue]}/>
                ) : (
                    <ReviewTable data={alertMetaData} onBack={()=>{ setShowReview(false);setTabValue(lastFormTab)}} onSubmit={submitRequest} formErrors={formErrors}/>
                )}
                
                {
                (apiLoading["getAlertData"]) && (applicationFamily!="" || applicationFamily!=null) ?
                    <Box className="overlayLoader" sx={overlayLoaderStyle(applicationFamily!==null || apiLoading["getAlertData"])}> 
                        <Box sx={{ 
                            display: 'flex', 
                            flexDirection: 'column', 
                            alignItems: 'center', 
                            gap: 3,
                            animation: `${fadeIn} 0.5s ease-out`
                        }}>
                            <Box sx={{ position: 'relative' }}>
                                <CircularProgress 
                                    size={60} 
                                    thickness={4}
                                    sx={{ 
                                        color: '#fff',
                                        filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.5))'
                                    }}
                                />
                                <Box sx={{
                                    position: 'absolute',
                                    top: '50%',
                                    left: '50%',
                                    transform: 'translate(-50%, -50%)',
                                    width: 40,
                                    height: 40,
                                    borderRadius: '50%',
                                    background: 'radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%)',
                                    animation: `${pulse} 2s ease-in-out infinite`
                                }} />
                            </Box>
                            <Stack spacing={1} alignItems="center">
                                <Typography 
                                    variant="h6" 
                                    sx={{ 
                                        fontWeight: 600,
                                        background: 'linear-gradient(90deg, #fff 0%, #e0e7ff 50%, #fff 100%)',
                                        backgroundSize: '200% auto',
                                        color: 'transparent',
                                        WebkitBackgroundClip: 'text',
                                        backgroundClip: 'text',
                                        animation: `${shimmer} 2s linear infinite`
                                    }}
                                >
                                    Loading Existing Alert Configurations
                                </Typography>
                                <Typography 
                                    variant="body2" 
                                    sx={{ 
                                        color: 'rgba(255,255,255,0.8)',
                                        animation: `${pulse} 1.5s ease-in-out infinite`
                                    }}
                                >
                                    Fetching data for {applicationFamily}...
                                </Typography>
                            </Stack>
                            <Stack direction="row" spacing={1}>
                                {[0, 1, 2].map((i) => (
                                    <Box
                                        key={i}
                                        sx={{
                                            width: 8,
                                            height: 8,
                                            borderRadius: '50%',
                                            bgcolor: 'rgba(255,255,255,0.8)',
                                            animation: `${pulse} 1s ease-in-out infinite`,
                                            animationDelay: `${i * 0.2}s`
                                        }}
                                    />
                                ))}
                            </Stack>
                        </Box>
                    </Box>
                :
                    ""
                }
                
            </Grid>

            {!apiLoading["submitRequest"] && !submitSuccess && !error["submitRequest"] && (
                <Box sx={{ position: 'fixed', right: 16, bottom: 16, zIndex: 1400 }}>
                    {!showReview ? (
                        <Stack direction='row' spacing={1}>
                            <Button
                                variant='outlined'
                                onClick={() => handleFooterbuttonClick("Previous")}
                                sx={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.08em', px: 2.5, py: 0.5, height: 32 }}
                            >
                                Previous
                            </Button>
                            <Button
                                variant='outlined'
                                onClick={() => handleFooterbuttonClick("Next")}
                                sx={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.08em', px: 2.5, py: 0.5, height: 32 }}
                            >
                                Next
                            </Button>
                            <Button
                                variant='contained'
                                onClick={() => handleFooterbuttonClick("Review + Save")}
                                sx={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.08em', px: 2.5, py: 0.5, height: 32 }}
                            >
                                Review + Save
                            </Button>
                        </Stack>
                    ) : (
                        <Stack direction='row' spacing={1}>
                            <Button
                                variant='outlined'
                                onClick={() => { setShowReview(false); setTabValue(lastFormTab); }}
                                sx={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.08em', px: 2.5, py: 0.5, height: 32 }}
                            >
                                Previous
                            </Button>
                            <Button
                                disabled={applicationFamily==="" || applicationFamily===null || (formErrors && Object.keys(formErrors).length > 0)}
                                variant='contained'
                                onClick={() => submitRequest()}
                                sx={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.08em', px: 2.5, py: 0.5, height: 32 }}
                            >
                                Submit
                            </Button>
                        </Stack>
                    )}
                </Box>
            )}
        </Grid>
    )
}

function ReviewTable({ data: alertMetaData, onBack = () => {}, onSubmit = () => {}, formErrors = {} }) {
    const [expanded, setExpanded] = React.useState({});
    const toggleExpanded = (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

    const fontSize = { label: '.72rem', body: '.78rem', chip: '.60rem', notif: '.68rem' };
    const textStyle = { 
        nowrap: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
        label: { color: '#6b7280', fontWeight: 700, letterSpacing: 0.3, fontSize: fontSize.label },
        body: { fontSize: fontSize.body, lineHeight: 1.15 },
        chip: { height: 16, borderRadius: 1, px: 0.35, '& .MuiChip-label': { px: 0.35, fontSize: fontSize.chip, lineHeight: 1 } }
    };
    const colors = { 
        accent: '#3d5a98', providence: '#00338e', providenceChip: 'rgba(0, 51, 142, 0.1)', 
        providenceTint: 'rgba(0, 51, 142, 0.08)', thresholdBg: '#ffe9ed', thresholdText: '#a61b2b', gray: '#6b7280' 
    };

    const formatResourceName = (name, sectionType) => {
        if (!name?.includes('/')) return name || '';
        const parts = name.split('/');
        if (sectionType === 'Services') return parts.length > 2 ? parts.slice(2).join('/') : name;
        if (sectionType === 'Database') return parts.length > 1 ? parts.slice(1).join('/') : name;
        return parts[parts.length - 1];
    };

    const sectionIcons = { Server: DeveloperBoardIcon, Services: GroupsIcon, Database: StorageIcon, 'File Storage': CloudIcon };
    const getIcon = (type, size, color) => {
        const IconComponent = sectionIcons[type] || 
            (type === 'email' ? EmailIcon : type === 'servicenow' ? SettingsIcon : type === 'teams channel' ? GroupsIcon : null);
        return IconComponent ? <IconComponent sx={{ fontSize: size, color }} /> : null;
    };

    const renderResources = (row, sectionType) => {
        const resourcesList = (row.Resources || []).filter(resource => resource?.ResourceName);
        const resourceId = row.__id;
        const isExpanded = !!expanded[resourceId];
        const maxVisible = 4;
        const visibleResources = isExpanded ? resourcesList : resourcesList.slice(0, maxVisible);
        const hiddenCount = Math.max(0, resourcesList.length - maxVisible);

        return (
            <Stack spacing={0.7}>
                <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                    {visibleResources.map((resource, index) => (
                        <React.Fragment key={`r-${index}`}>
                            {sectionType === 'Services' && resource.ServiceName && 
                                <Chip key={`s-${index}`} size="small" 
                                    label={<Typography sx={{ fontSize: fontSize.chip, fontWeight: 500 }}>{resource.ServiceName.trim()}</Typography>}
                                    sx={{ height: 20, bgcolor: colors.providenceChip, color: colors.providence, borderRadius: 1.5, '& .MuiChip-label': { px: 0.8 } }} />}
                            <Chip key={`n-${index}`} size="small" 
                                label={<Typography sx={{ fontSize: fontSize.chip, fontWeight: 500 }}>{formatResourceName(resource.ResourceName, sectionType)}</Typography>}
                                sx={{ height: 20, bgcolor: colors.providenceChip, color: colors.providence, borderRadius: 1.5, '& .MuiChip-label': { px: 0.8 } }} />
                        </React.Fragment>
                    ))}
                </Stack>
                {hiddenCount > 0 && (
                    <Button size="small" variant="text" onClick={() => toggleExpanded(resourceId)}
                        sx={{ textTransform: 'none', fontSize: fontSize.chip, color: colors.providence, alignSelf: 'flex-start', px: 0.5, py: 0.2, minHeight: 'auto' }}>
                        {isExpanded ? 'Show Less' : `+${hiddenCount} more resources`}
                    </Button>
                )}
            </Stack>
        );
    };

    const renderThresholds = (row, fields) => {
        const thresholdItems = fields.map(field => row[field] && `${field.split(' ')[0]} ${row[field]}%`).filter(Boolean);
        return thresholdItems.length ? (
            <Stack spacing={0.35}>
                {thresholdItems.map((text, index) => 
                    <Box key={index} sx={{ display: 'inline-flex' }}>
                        <Chip size="small" title={text} 
                            label={<Typography noWrap sx={{ maxWidth: 160, fontSize: fontSize.body, lineHeight: 1 }}>{text}</Typography>}
                            sx={{ ...textStyle.chip, bgcolor: colors.providenceChip }} />
                    </Box>
                )}
            </Stack>
        ) : <Typography sx={textStyle.body} color="text.secondary">—</Typography>;
    };

    const renderNotification = (row) => {
        const communication = row.Communication || {};
        const notificationType = communication.Type || '';
        const notificationId = `${row.__id}-n`;
        const isExpanded = !!expanded[notificationId];
        
        const activeDot = <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#22c55e', border: '2px solid #fff', ml: 0.5 }} />;
        const typeChip = (
            <Chip size="small" icon={getIcon(notificationType.toLowerCase(), 'small')} label={notificationType || '—'}
                sx={{ bgcolor: colors.providence, color: '#fff', height: 20, fontSize: fontSize.label, borderRadius: 1, '& .MuiChip-icon': { color: '#fff' } }} />
        );
        
        const extraChips = [];

        // Email notification
        if (notificationType.toLowerCase() === 'email' && communication.DL) {
            const dlText = Array.isArray(communication.DL) ? communication.DL.join(',') : communication.DL;
            extraChips.push(
                <Chip key="dl" size="small" 
                    label={<Typography noWrap sx={{ maxWidth: 200, fontSize: fontSize.notif }}>{dlText}</Typography>}
                    sx={{ height: 18, borderRadius: 1, bgcolor: colors.providenceChip, color: colors.providence, fontSize: fontSize.notif }} />
            );
        }

        // Helper to add expandable chip groups
        const addExpandableChips = (chipItems) => {
            if (!chipItems.length) return;
            const maxVisible = 2;
            const visibleChips = isExpanded ? chipItems : chipItems.slice(0, maxVisible);
            const hiddenCount = Math.max(0, chipItems.length - maxVisible);
            
            extraChips.push(
                <Stack key={chipItems[0].key} direction="row" spacing={0.4} sx={{ flexWrap: 'wrap', maxWidth: '100%' }}>
                    {visibleChips}
                    {hiddenCount > 0 && (
                        <Chip size="small" label={isExpanded ? 'Hide' : `+${hiddenCount}`}
                            sx={{ ...textStyle.chip, bgcolor: colors.providenceChip, color: colors.providence, cursor: 'pointer' }} 
                            onClick={() => toggleExpanded(notificationId)} />
                    )}
                </Stack>
            );
        };

        // ServiceNow notification
        if (notificationType.toLowerCase() === 'servicenow') {
            const serviceNowChips = [];
            if (communication['Assignment Group']) {
                serviceNowChips.push(
                    <Chip key='ag' size='small' 
                        label={<Typography sx={{ fontSize: fontSize.notif }}>AG: {communication['Assignment Group']}</Typography>}
                        sx={{ height: 18, borderRadius: 1, bgcolor: colors.providenceChip, color: colors.providence, fontSize: fontSize.notif }} />
                );
            }
            if (communication['X']) {
                serviceNowChips.push(
                    <Chip key='x' size='small' 
                        label={<Typography sx={{ fontSize: fontSize.notif }}>X: {communication['X']}</Typography>}
                        sx={{ height: 18, borderRadius: 1, bgcolor: colors.providenceChip, color: colors.providence, fontSize: fontSize.notif }} />
                );
            }
            addExpandableChips(serviceNowChips);
        }

        // Teams Channel notification
        if (notificationType.toLowerCase() === 'teams channel') {
            const teamsChips = [];
            if (communication['Teams Channel ID']) {
                teamsChips.push(
                    <Chip key='tc' size='small' 
                        label={<Typography sx={{ fontSize: fontSize.notif }}>Channel: {communication['Teams Channel ID']}</Typography>}
                        sx={{ height: 18, borderRadius: 1, bgcolor: colors.providenceChip, color: colors.providence, fontSize: fontSize.notif }} />
                );
            }
            if (communication['Teams Group ID']) {
                teamsChips.push(
                    <Chip key='tg' size='small' 
                        label={<Typography sx={{ fontSize: fontSize.notif }}>Group: {communication['Teams Group ID']}</Typography>}
                        sx={{ height: 18, borderRadius: 1, bgcolor: colors.providenceChip, color: colors.providence, fontSize: fontSize.notif }} />
                );
            }
            addExpandableChips(teamsChips);
        }

        return (
            <Stack spacing={0.25}>
                <Stack direction='row' spacing={0.5} alignItems='center' sx={textStyle.nowrap}>
                    {typeChip}{activeDot}
                </Stack>
                {extraChips.length > 0 ? (
                    <Stack direction='row' spacing={0.4} sx={{ flexWrap: 'wrap', overflow: 'hidden', '& .MuiChip-root': { maxWidth: 170 } }}>
                        {extraChips}
                    </Stack>
                ) : <Typography sx={textStyle.body} color='text.secondary'>—</Typography>}
            </Stack>
        );
    };

    const getColumnsForSection = (sectionType) => {
        const columns = [
            { 
                id: 'section', 
                label: 'TYPE', 
                flex: 0.95, 
                render: () => (
                    <Stack direction='row' spacing={0.6} alignItems='center'>
                        <Box sx={{ minWidth: 16 }}>{getIcon(sectionType, 15, colors.gray)}</Box>
                        <Typography sx={{ ...textStyle.body, fontWeight: 700 }}>{sectionType}</Typography>
                    </Stack>
                )
            },
            { 
                id: 'hosting', 
                label: 'HOSTING', 
                flex: 0.85, 
                render: () => (
                    <Stack direction='row' spacing={0.6} alignItems='center'>
                        <CloudIcon sx={{ fontSize: 16, color: '#5aa4f2' }} />
                        <Typography sx={textStyle.body} noWrap>Cloud</Typography>
                    </Stack>
                )
            },
            { 
                id: 'resources', 
                label: 'RESOURCES', 
                flex: 2.2, 
                render: (row) => renderResources(row, sectionType) 
            }
        ];

        // Section-specific threshold columns
        if (sectionType === 'Server') {
            columns.push({ 
                id: 'metrics', 
                label: 'METRICS', 
                flex: 1.2, 
                render: (row) => renderThresholds(row, ['CPU Custom Threshold', 'Memory Custom Threshold', 'Disk Custom Threshold']) 
            });
        }
        
        if (sectionType === 'Database') {
            columns.push({ 
                id: 'thresholds', 
                label: 'THRESHOLDS', 
                flex: 1.6, 
                render: (row) => renderThresholds(row, ['Storage Custom Threshold', 'DTU Custom Threshold', 'CPU Custom Threshold']) 
            });
        }
        
        if (sectionType === 'File Storage') {
            columns.push({ 
                id: 'threshold', 
                label: 'THRESHOLD', 
                flex: 0.9, 
                render: (row) => row['Custom Threshold'] ? (
                    <Box sx={{ bgcolor: colors.thresholdBg, color: colors.thresholdText, px: 0.8, py: 0.25, borderRadius: 1, 
                        textAlign: 'center', minWidth: 48, display: 'inline-block', fontWeight: 700, fontSize: fontSize.label }}>
                        {row['Custom Threshold']}%
                    </Box>
                ) : <Typography sx={textStyle.body} color="text.secondary">—</Typography>
            });
        }

    
        columns.push({ 
            id: 'frequency', 
            label: 'FREQUENCY', 
            flex: 0.95, 
            render: (row) => (
                <Typography sx={textStyle.body} noWrap>
                    {row['Alert Frequency'] ? `Every ${row['Alert Frequency']} mins` : '—'}
                </Typography>
            )
        });
        
        if (sectionType !== 'Services') {
            columns.push({ 
                id: 'aggregation', 
                label: 'AGGREGATION', 
                flex: 0.95, 
                render: (row) => (
                    <Typography sx={textStyle.body} noWrap>
                        {row['Data Aggregation'] || '10 mins'}
                    </Typography>
                )
            });
        }

        columns.push({ 
            id: 'notification', 
            label: 'NOTIFICATION', 
            flex: 2, 
            render: renderNotification 
        });

        return columns;
    };

    return (
        <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', height: 'min(86vh, calc(100vh - 150px))' }}>
            {formErrors && Object.keys(formErrors).length > 0 &&
                <Alert severity="error" m={1}>
                    There are errors found in the alert configurations. Tabs where errors are found include <b>{Object.keys(formErrors).join(', ')}</b>. Please navigate to tabs suggested to get more information about the errors.
                </Alert>
            }
            <Box sx={{ flex: 1, overflowY: 'auto' }}>
                {(() => {
                    const allSections = ['Server', 'Services', 'Database', 'File Storage'].map((sectionType) => {
                        const sectionData = alertMetaData?.[sectionType] || [];
                        return sectionData.filter(Boolean).filter((row) => Array.isArray(row.Resources) && row.Resources.some((resource) => !!resource?.ResourceName));
                    });
                    const hasAnyConfigs = allSections.some(section => section.length > 0);
                    
                    if (!hasAnyConfigs) {
                        return (
                            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200, px: 2 }}>
                                <Box sx={{ bgcolor: 'rgba(0, 51, 142, 0.05)', borderRadius: 2, p: 3, border: '2px dashed rgba(0, 51, 142, 0.2)', display: 'flex', alignItems: 'center', gap: 2, maxWidth: 800 }}>
                                    <SettingsIcon sx={{ fontSize: 40, color: 'rgba(0, 51, 142, 0.4)' }} />
                                    <Box>
                                        <Typography sx={{ fontSize: '.95rem', fontWeight: 600, color: '#00338e', mb: 0.5 }}>No Alert Rules Configured</Typography>
                                        <Typography sx={{ fontSize: '.80rem', color: 'text.secondary' }}>Configured alert rules will appear here. Please add at least one alert configuration to proceed with submission.</Typography>
                                    </Box>
                                </Box>
                            </Box>
                        );
                    }
                })()}
                {['Server', 'Services', 'Database', 'File Storage'].map((sectionType) => {
                    const sectionData = alertMetaData?.[sectionType] || [];
                    const validRows = sectionData
                        .filter(Boolean)
                        .filter((row) => Array.isArray(row.Resources) && row.Resources.some((resource) => !!resource?.ResourceName))
                        .map((row, index) => ({ __id: `${sectionType}-${index}`, ...row }));
                    
                    if (validRows.length === 0) return null;
                    
                    const sectionId = `section-${sectionType}`;
                    const isSectionExpanded = !!expanded[sectionId];
                    const visibleRows = isSectionExpanded ? validRows : validRows.slice(0, 1);
                    const hiddenRowsCount = Math.max(0, validRows.length - 1);
                    const columns = getColumnsForSection(sectionType);

                    return (
                        <Card key={sectionType} sx={{ width: '100%', mb: 2, borderRadius: 2, boxShadow: '0 6px 18px rgba(0,0,0,.06)', bgcolor: '#fff', overflow: 'hidden' }}>
                            <CardHeader
                                avatar={<Avatar sx={{ bgcolor: colors.accent, width: 24, height: 24 }}>{getIcon(sectionType, '1rem', '#fff')}</Avatar>}
                                title={<Typography variant='subtitle2' sx={{ fontWeight: 800, ml: 1, fontSize: fontSize.body }}>{sectionType} Monitoring</Typography>}
                                action={
                                    <Stack direction='row' spacing={1} alignItems='center'>
                                        <Chip label={`${validRows.length} Configurations`} size='small'
                                            sx={{ bgcolor: colors.accent, color: '#fff', fontWeight: 800, fontSize: fontSize.label, borderRadius: 1 }} />
                                        {hiddenRowsCount > 0 && (
                                            <Button size='small' variant='text' onClick={() => toggleExpanded(sectionId)}
                                                sx={{ textTransform: 'none', fontSize: fontSize.label, color: colors.providence }}>
                                                {isSectionExpanded ? 'See Less' : `See More (${hiddenRowsCount})`}
                                            </Button>
                                        )}
                                    </Stack>
                                }
                                sx={{ px: 2, py: 0.6, background: 'linear-gradient(90deg,#f6f9ff,transparent)', '.MuiCardHeader-action': { alignSelf: 'center' } }}
                            />

                            <CardContent sx={{ px: 1.25, pt: 0.3, pb: 1.25 }}>
                                {visibleRows.length === 0 ? (
                                    <Typography color='text.secondary' sx={{ px: 1, py: 1, fontSize: fontSize.body }}>
                                        No configurations added yet.
                                    </Typography>
                                ) : (
                                    visibleRows.map((rowData, rowIndex) => (
                                        <Box key={rowIndex}
                                            sx={{ 
                                                mb: rowIndex === visibleRows.length - 1 ? 0 : 1, 
                                                borderRadius: 1.25, 
                                                border: '1px solid #e0e0e0',
                                                borderLeft: `4px solid ${colors.providence}`, 
                                                background: `linear-gradient(90deg, ${colors.providenceTint}, transparent)`,
                                                position: 'relative', 
                                                overflow: 'hidden', 
                                                minHeight: 60 
                                            }}>
                                            <Stack direction='row' spacing={1.5} sx={{ px: 1.5, pt: 0.35, pb: 0 }}>
                                                {columns.map((column) => (
                                                    <Box key={column.id} sx={{ flex: column.flex }}>
                                                        <Typography variant='caption' sx={textStyle.label}>{column.label}</Typography>
                                                    </Box>
                                                ))}
                                            </Stack>
                                            <Stack direction='row' spacing={1.5} alignItems='center' sx={{ px: 1.5, py: 0.6 }}>
                                                {columns.map((column) => (
                                                    <Box key={column.id} sx={{ flex: column.flex, display: 'flex', alignItems: 'center', ...textStyle.nowrap }}>
                                                        {column.render(rowData)}
                                                    </Box>
                                                ))}
                                            </Stack>
                                        </Box>
                                    ))
                                )}
                            </CardContent>
                        </Card>
                    );
                })}
            </Box>

            <Box sx={{ position: 'sticky', bottom: 0, display: 'none', bgcolor: '#fff', borderTop: '1px solid #e5e7eb', py: 1, px: 1, boxShadow: '0 -6px 12px rgba(0,0,0,.04)' }}>
                <Stack direction='row' spacing={1}>
                    <Button variant='outlined' onClick={onBack} 
                        sx={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.08em', px: 2.5, py: 0.5, height: 32 }}>
                        Previous
                    </Button>
                    <Button variant='contained' onClick={onSubmit}
                        sx={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.08em', px: 2.5, py: 0.5, height: 32,
                            bgcolor: colors.accent, ':hover': { bgcolor: '#324a80' } }}>
                        Submit
                    </Button>
                </Stack>
            </Box>
        </Box>
    );
}