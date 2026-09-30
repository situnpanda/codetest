import React, { useState, useEffect, useRef } from 'react'
import Grid from '@mui/material/Unstable_Grid2';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import NetworkGraph from '../../shared/NetworkGraph/NetworkGraph'
import Button from '@mui/material/Button';
import AreaLineChart from '../../shared/LineChart/AreaLineChart'
import BarGraph from '../../shared/BarChart/BarChart'
import Graph from 'react-vis-network-graph'
import serverImage from '../../Static/Images/serverImage.jpg'
import winServiceImage from '../../Static/Images/winServiceImage.png'
import CpInterfaceImage from '../../Static/Images/CpInterfaceImage.jpg'
import Alert from '@mui/material/Alert';
import { CardHeader, List, ListItem, Modal, TableContainer, TablePagination, IconButton, InputAdornment } from '@mui/material';
import CircleIcon from '@mui/icons-material/Circle';
import RadioButtonCheckedOutlinedIcon from '@mui/icons-material/RadioButtonCheckedOutlined';
import Tooltip from '@mui/material/Tooltip';
import InfoIcon from '@mui/icons-material/Info';
import { keyframes } from '@mui/material';
import { useLocation } from "react-router-dom";
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import { styled } from '@mui/material/styles';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell,{ tableCellClasses } from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import DeleteIcon from '@mui/icons-material/Delete';
import AddCircleOutlinedIcon from '@mui/icons-material/AddCircleOutlined';
import {getUrl} from '../../../environment'
import SendIcon from '@mui/icons-material/Send';
import AddIcon from '@mui/icons-material/Add';
import PercentIcon from '@mui/icons-material/Percent';

export default function OnboardedApplicationdata({userProfileData, appInsights}) {

    // //var baseUrl =  "http://100.100.129.88:9090/api/"
    // var baseUrl =  "http://127.0.0.1:5000/api/"
    // //var baseUrl =  "https://itelemetry.providence.org/api/"
    var baseUrl = getUrl()
    var [tabValue, setTabValue] = useState(0)
    const tabValue_keyMapping = {
        0:"Windows Services",
        1:"URL",
        2:"Custom Monitoring"
    }
    var location  = useLocation()

    //Application Onboarding Child Component - Variables
    var [serviceList, setServiceList] = useState({})
    var [urlList, setUrlList] = useState({})
    var [customRequirementList, setCustomRequirementList] = useState({})

    var [tableData, setTableData] = useState({})
    //Update Form Child Component - Variables
    var [applicationOnboarded, setApplicationOnboarded] = useState([])
    var [serverList, setServerList] = useState({})
    var [newAppOnboarding, setNewAppOnboarding] = useState(false)
    
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
    };

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

    var handleTabChange = (event, value) =>{
        setTabValue(value)
    }
    useEffect(()=>{
        //console.log("In Useeffect appOnbo", applicationOnboarded.length)
        fetchAppOnboardingSummary()
    },[])

    useEffect(()=>{
        setTableData({})
        if(tabValue==0 && Object.keys(serviceList).length<=1){
            fetchComponentMetaData("services", "", "")
        }
        else if(tabValue==0){
            //console.log(tabValue)
            setTableData(serviceList)
        }
        
        if(tabValue==1 && Object.keys(urlList).length<=1){
            fetchComponentMetaData("urls", "", "")
        }
        else if(tabValue==1){
            //console.log(tabValue)
            setTableData(urlList)
        }

        if(tabValue==2 && Object.keys(customRequirementList).length<=1){
            fetchComponentMetaData("customRequirement", "", "")
        }
        else if(tabValue==2){
            //console.log(tabValue)
            setTableData(customRequirementList)
        }
    }, [tabValue])

    useEffect(()=>{
        if(tabValue===0){
            setTableData(serviceList)
        }
        else if(tabValue===1){
            setTableData(urlList)
        }
        else if(tabValue===2){
            setTableData(customRequirementList)
        }
    },[serviceList, urlList, customRequirementList])

    useEffect(()=>{
        if(Object.keys(serverList).length===0 && applicationOnboarded.length>0){
            //console.log(Object.keys(serverList).length,applicationOnboarded.length,"In Useeffect ServList")
            filterOptions["appFamily"] = applicationOnboarded
            
            fetchServerListData(filterOptions)
            
        }
    }, [applicationOnboarded])

    var handleOnboardingClick = () => {
        setNewAppOnboarding(!newAppOnboarding)
    }

    var getApplicationCI = () => {
        var temp = []
        Object.keys(serverList).map((key)=>{
            temp = [...temp,...Object.keys(serverList[key])]
        })
        //console.log(temp)
        return temp
    }
    var getServerNames = (appFamily) => {
        var temp = []
        Object.keys(serverList[appFamily]).map((key)=>{
            temp = [...temp,...Object.values(serverList[appFamily][key])]
        })
        //console.log(temp)
        return temp
    }

    var updateOnboardedData = (updateCategory, data, setErroData) => {

        var params = {
            "updateCategory": updateCategory,
            "dataCategory": tabValue===0 ? "services":(tabValue===1 ? "urls":"custom requirement"),
            "data": data,
            "userName" : userProfileData["displayName"]
        };
        var url = new URL(baseUrl + 'updateOnboardedData');
        var typeOfData = tabValue===0 ? " Service(s) " : (tabValue===1 ? " URL(s) ":" Custom Requirement(s) ")
        var typeOfOperation = updateCategory==="add" ? "Insertion of" : "Deletion of"
        
        fetch(url,{
          method:'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(params)
        })
        .then((response) => {
            if(!response.ok){
                throw new Error(`HTTP Error Status: ${response.status}`)
            }
            if(tabValue===0){
                fetchComponentMetaData("services", "", "")
            }
            else if(tabValue===1){
                fetchComponentMetaData("urls", "", "")
            }
            else{
                fetchComponentMetaData("customRequirement", "", "")
            }
            setErroData(typeOfOperation+typeOfData+"Successful")
        })
        .catch((error) =>{ 
            setErroData(typeOfOperation+typeOfData+"UnSuccessful")
            console.error('Error:', error)
        });
    }

    var fetchAppOnboardingSummary = () => {
        //const urlParams = new URLSearchParams(params)
        const url = `${baseUrl}getOnboardingSummary`
        fetch(url)
        .then((response)=>response.json())
        .then((data)=>{
            //console.log(JSON.parse(data["appOnboardingSummary"]))
            var tempVar = JSON.parse(data["Data"])
            var appOnboarded = Object.values(tempVar["Application Family"]).filter((value, index)=>tempVar["Status"][index].toLowerCase()=="onboarded")
            setApplicationOnboarded(appOnboarded)
            //console.log(appOnboarded)
        })
        .catch((error)=>{
            console.log(error)
            //setIsLoading(false)
        })
    }

    var updateServerList = (tempVar) => {
        var tempDict = {}
        Object.keys(tempVar["ServerName"]).map((key)=>{
            var appFam = tempVar["AppFamily"][key]
            var appCI = tempVar["AppCI"][key]
            var serverName_Hosting = tempVar["ServerName"][key] + "/" + tempVar["ServerHostingType"][key]

            if(!(appFam in tempDict)){
                tempDict[appFam] = {}
            }
            if(!(appCI in tempDict[appFam])){
                tempDict[appFam][appCI] = []
            }
            tempDict[appFam][appCI].push(serverName_Hosting)
        })
        setServerList(tempDict)
    }

    var fetchServerListData = async(filterOptions) => {
            
        var params = {
          "filters": filterOptions
        };

        var url = new URL(baseUrl + 'serverLogs');
        
        fetch(url,{
          method:'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(params)
        })
        .then((response) => response.json())
        .then((data) =>{ 
            //console.log()
            if(Object.keys(serverList).length<=1){
                var tempVar = JSON.parse(data["Data"])
                console.log(tempVar)
                updateServerList(tempVar)
            }
            
        })
        .catch((error) =>{ 
            console.error('Error:', error)
        });
    };

    var fetchComponentMetaData = (type,appfamily,appCI) => {
        console.log(type,appfamily)
        var params = {
            "type" : type,
            "appFamily" : appfamily,
            "appCI" : appCI
        }
        const urlParams = new URLSearchParams(params)
        const url = `${baseUrl}getOnboardingList?${urlParams.toString()}`
        fetch(url)
        .then((response)=>response.json())
        .then((data)=>{
            // console.log(JSON.parse(data["metaData"]))
            if(type==="services"){
                setServiceList(JSON.parse(data["Data"]))
            }
            else if(type==="urls"){
                setUrlList(JSON.parse(data["Data"]))
            }
            else{
                setCustomRequirementList(JSON.parse(data["Data"]))
            }
            // console.log(JSON.parse(data["metaData"]))
        })
        .catch((error)=>{
            console.log(error)
        })
    }

    var DisplayOnboardedApplicationDetails = () => {
        
        var [checkBoxSelected, setCheckboxSelected] = useState({
            "header":false,
            "rows":[]
        })
        var [rowsPerPage, setRowsPerPage] = useState(5)
        var [page, setPage] = useState(0)
        var tabFilterHeader = {
            0 : ["Application CI", "Server Name", "Service Name"],
            1 : ["URL", "Application CI"],
            2 : ["Application Family"]
        }
        var [deleteData, setDeleteData] = useState({
            0:{"Server Name" : [],"Service Name" : []},
            1:{"Application CI" : [], "URL" : [], "Environment":[]},
            
        })
        var [errorText, setErrorText] = useState("")
        var [tableFilter, setTableFilter] = useState({0:{},1:{},2:{}})
        var [modalConfirmationOpen, setModalConfirmationOpen] = useState(false)

        const overlayLoaderStyle = ()=> ({ 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            width: '100%', 
            height :'100%',
            backgroundColor: 'rgba(0, 0, 0, 0.5)', // 20% opacity black 
            display: errorText==="Loading" ? 'flex' : 'none', 
            justifyContent: 'center', 
            alignItems: 'center', 
            opacity: 0, 
            transition: 'opacity 0.5s', 
        })
        
        var styleGrid = ()=>({
            position: 'relative', 
            margin:2,
            borderRadius:{
                xs: '4px', // Border radius for extra small screens
                sm: '6px', // Border radius for small screens
                md: '8px', // Border radius for medium screens
                lg: '10px', // Border radius for large screens
            },
            flex:1,
            background: 'white', //#f5f6fa
            overflow: 'hidden', 
            '.overlayLoader': errorText==="Loading" ? { opacity: 1, } : { opacity: 0, },
        })

        useEffect(()=>{
            setPage(0)
        }, [tabValue])

        // useEffect(()=>{
        //     console.log(checkBoxSelected)
        // },[checkBoxSelected])

        const StyledTableRow = styled(TableRow)(({ theme }) => ({
            '&:nth-of-type(odd)': {
            backgroundColor: theme.palette.action.hover,
            },
            // hide last border
            '&:last-child td, &:last-child th': {
            border: 0,
            },
        }));

        var handleCheckBoxStateChange = (type, index) => {
            if(type==="header"){
                setCheckboxSelected((prevStatus)=>({
                    ...prevStatus,
                    [type]:!checkBoxSelected[type],
                    "rows": !checkBoxSelected[type] ? 
                        Object.keys(tableData[Object.keys(tableData)[0]]).filter((key)=>{
                            var boolVal = true
                            Object.keys(tableFilter[tabValue]).filter((col)=>{
                                if(tableFilter[tabValue][col] instanceof Array){
                                    boolVal = boolVal && (tableFilter[tabValue][col].includes(tableData[col][key]) || tableFilter[tabValue][col].length==0)
                                }
                                else{
                                    boolVal = boolVal && (tableData[col][key]===tableFilter[tabValue][col] || tableFilter[tabValue][col]===null)
                                }
                            })
                            
                            //console.log(boolVal)
                            return boolVal
                        }).slice(rowsPerPage*page,rowsPerPage*page + rowsPerPage) 

                        : 
                        
                        []
                }))
            }
            else{
                if(checkBoxSelected[type].includes(index)){
                    setCheckboxSelected((prevStatus)=>({
                        ...prevStatus,
                        "header":false,
                        "rows": checkBoxSelected["rows"].filter((i)=>i!=index)
                    }))
                }
                else{
                    var temp = checkBoxSelected["rows"]
                    temp.push(index)
                    setCheckboxSelected((prevStatus)=>({
                        ...prevStatus,
                        "rows": temp
                    }))
                }
            }
        }
        var handleModalConfirmation = (val) =>{
            setModalConfirmationOpen(val)
        }

        var modalConfirmationButton = (index, temp) => {
            updateOnboardedData("delete", temp, setErrorText)
        }
        
        var handlePageChange = (event, value) =>{
            setPage(value)
        }

        var handleRowsChange = (event) => {
            // console.log(value)
            setRowsPerPage(event.target.value)
            setCheckboxSelected((prevStatus)=>({
                ...prevStatus,
                "header":false,
                "rows": []
            }))
            setPage(0)
        }

        var handleFilterChange = (key, value) => {
            setPage(0)
            var tabData = tableFilter[tabValue]
            tabData[key]=value
            // console.log(key,value)
            //tab[tabValue]=
            setTableFilter((prevFilter)=>({
                ...prevFilter,
                [tabValue]:tabData
            }))
        }

        var handleDataDelete = (index) => {
            setErrorText("Loading")
            console.log(index)
            var temp = deleteData[tabValue]
            if(index instanceof Array){
                index.map((ind)=>{
                    Object.keys(deleteData[tabValue]).map((col)=>{
                        temp[col].push(tableData[col][ind])
                    })
                })
                console.log(temp)
                setDeleteData((prevStatus)=>({
                    ...prevStatus,
                    [tabValue] : temp
                }))
            }
            else{
                Object.keys(deleteData[tabValue]).map((col)=>{
                    temp[col].push(tableData[col][index])
                })
                console.log(temp)
                setDeleteData((prevStatus)=>({
                    ...prevStatus,
                    [tabValue] : temp
                }))
            }
            //modalConfirmationButton(index, temp)
            updateOnboardedData("delete", temp, setErrorText)
            
        }

        return (
            <Grid container md={12} p={4} sx={styleGrid}>
                <Modal
                    open={modalConfirmationOpen}
                    onClose={()=>handleModalConfirmation(false)}
                    aria-labelledby="parent-modal-title"
                    aria-describedby="parent-modal-description"
                    sx={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        opacity: '0.90'
                    }}
                >
                    <Grid container>
                        <Typography variant="h5" align="center">Confimation</Typography>
                        <Typography variant="body" align="center">For Deleting x Records</Typography>
                        <Grid container>
                            <Grid item md={6}>
                                <Button severity="success" variant="outlined" startIcon={<DeleteIcon />} onClick={modalConfirmationButton}>
                                    Yes
                                </Button>
                            </Grid>
                            <Grid item md={6}>
                                <Button severity="error" variant="outlined" startIcon={<DeleteIcon />} onClick={()=>handleModalConfirmation(false)}>
                                    No
                                </Button>
                            </Grid>
                        </Grid>
                    </Grid>
                </Modal>
                <Grid container md={12}>
                    <Grid item md={6}>
                        <Typography variant="h6" sx={{color:"#162660"}}>Onboarded {tabValue_keyMapping[tabValue]}</Typography>
                    </Grid>
                    <Grid item md={6}>
                        {checkBoxSelected["rows"].length>1 ?
                        <Button variant="outlined" startIcon={<DeleteIcon />} onClick={()=>handleDataDelete(checkBoxSelected["rows"])}>
                            Delete Selected
                        </Button>
                        :
                        ""
                        }
                    </Grid>
                </Grid>
                <Grid container md={12} justifyContent={"center"} alignItems="center">
                    {
                        errorText.includes("Successful") ? 
                            <Alert severity="success" width="100%"><span sx={{fontWeight:"bold"}}>{errorText}</span></Alert>
                            :
                            (
                                errorText.includes("UnSuccessful") ? 
                                    <Alert severity="warning" width="100%"><span sx={{fontWeight:"bold"}}>{errorText}</span></Alert>
                                    :
                                    ""
                            )
                        
                    }
                </Grid>
                
                {(Object.keys(tableData).length>0?
                
                <Grid container xs={12} justifyContent={"center"} alignItems={"center"}>
                    
                    <Table aria-label="customized table">
                        <TableHead>
                            <TableRow>
                                {tabValue!=2 ? 
                                    <TableCell>
                                        <Checkbox 
                                            checked={checkBoxSelected["header"]}
                                            onChange={()=>{handleCheckBoxStateChange("header","")}}
                                        />
                                    </TableCell>
                                    :
                                    ""
                                }
                                {
                                    Object.keys(tableData).length>0 ? 
                                    (Object.keys(tableData).map((i)=>
                                        tabFilterHeader[tabValue].includes(i) ? 
                                        <TableCell>
                                            <Autocomplete
                                                multiple={i=="ServiceName" || i=="URL" ? true:false}
                                                value={tableFilter[tabValue][i]}
                                                options={[...new Set(Object.values(tableData[i]))].filter((val)=>val!=null)}
                                                renderInput={(params) => (
                                                    <TextField {...params} label={i} variant="standard" />
                                                )}
                                                //PopperComponent={(props) => <StyledPopper {...props}/>}
                                                onChange={(event,value)=>handleFilterChange(i, value)}
                                                sx={{ display:"flex", width: '100%', alignItems : "center", justifyContent:"center"}} 
                                            /> 
                                        </TableCell>
                                        :
                                        <TableCell>
                                            {i}
                                        </TableCell>
                                    ))
                                    :
                                    ""
                                }
                                {tabValue!=2 ? <TableCell align="center">Actions</TableCell>:""}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {Object.keys(tableData).length>0 ?   
                                (Object.keys(tableData[Object.keys(tableData)[0]]).filter((key)=>{
                                    var boolVal = true
                                    Object.keys(tableFilter[tabValue]).map((col)=>{
                                        if(tableFilter[tabValue][col] instanceof Array){
                                            boolVal = boolVal && (tableFilter[tabValue][col].includes(tableData[col][key]) || tableFilter[tabValue][col].length==0)
                                        }
                                        else{
                                            boolVal = boolVal && (tableData[col][key]===tableFilter[tabValue][col] || tableFilter[tabValue][col]===null)
                                        }
                                    })
                                    
                                    //console.log(boolVal)
                                    return boolVal
                                }).slice(rowsPerPage*page,rowsPerPage*page + rowsPerPage).map((index)=>{
                                    return <StyledTableRow>
                                        {tabValue!=2 ? 
                                            <TableCell>
                                                <Checkbox
                                                checked={checkBoxSelected["rows"].includes(index)}
                                                onChange={()=>{handleCheckBoxStateChange("rows",index)}}
                                                />
                                            </TableCell>
                                        :
                                            ""
                                        }
                                        
                                        {
                                        (Object.keys(tableData).map((col)=>
                                            <TableCell>{tableData[col][index]}</TableCell>
                                        ))
                                        }
                                        {tabValue!=2 ? 
                                            <TableCell>
                                                <Grid container md={12} justifyContent="center" alignItems="center">
                                                    <Grid item>
                                                        <Tooltip title="Delete Record">
                                                            <DeleteIcon sx={{cursor:"pointer"}} onClick={()=>handleDataDelete(index)}/>
                                                        </Tooltip>
                                                    </Grid>
                                                </Grid>
                                            </TableCell>
                                        :
                                            ""
                                        }
                                    </StyledTableRow>
                                })
                                )
                                :
                                ""
                            }
                        </TableBody>
                    </Table>
                    
                    <TablePagination
                        width="100%"
                        rowsPerPageOptions={[5, 10, 20]}
                        count = {Object.keys(tableData).length>0 ? 
                            Object.keys(tableData[Object.keys(tableData)[0]]).filter((key)=>{
                                var boolVal = true
                                Object.keys(tableFilter[tabValue]).map((col)=>{
                                    if(tableFilter[tabValue][col] instanceof Array){
                                        boolVal = boolVal && (tableFilter[tabValue][col].includes(tableData[col][key]) || tableFilter[tabValue][col].length==0)
                                    }
                                    else{
                                        boolVal = boolVal && (tableData[col][key]===tableFilter[tabValue][col] || tableFilter[tabValue][col]===null)
                                    }
                                })
                                //console.log(boolVal)
                                return boolVal
                            }).length 
                            : 
                            0
                        }
                        page = {page}
                        rowsPerPage={rowsPerPage}
                        onPageChange={handlePageChange}
                        onRowsPerPageChange={handleRowsChange}
                    />
                    
                </Grid>
                :
                <Grid container md={12} justifyContent={"center"}>
                    <CircularProgress size="3rem"/>
                </Grid>
                )}
                
                <Box className="overlayLoader" sx={overlayLoaderStyle}> 
                     <CircularProgress/>
                </Box>
            </Grid>
    )}

    var UpdateForm = () => {

        var [tabFilterData, setTabFilterData] = useState({
            "Application Family" : "",
            "Application CI" : "",
            "Server Name" : [],
            "URL" : [""],
            "Service Name" : [""],
            "Environment" : "",
            "Hosting Type" : "",
            "Custom Requirement" : [""]
        }) 
        
        var tabFilters = {
            0:{filterNames:["Application Family", "Application CI", "Server Name", "Service Name"], "header":"Add New Windows Services"},
            1:{filterNames:["Application CI", "Environment", "Hosting Type", "URL"], "header":"Add New URLs"},
            2:{filterNames:["Application Family", "Custom Requirement"], "header":"Add New Custom Monitoring Requirements"}
        }

        const overlayLoaderStyle = ()=> ({ 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            width: '100%', 
            height :'100%',
            backgroundColor: 'rgba(0, 0, 0, 0.5)', // 20% opacity black 
            display: submitError==="Loading" || Object.keys(serverList).length===0 ? 'flex' : 'none', 
            justifyContent: 'center', 
            alignItems: 'center', 
            opacity: 0, 
            transition: 'opacity 0.5s', 
        })
        
        var styleGrid = ()=>({
            position: 'relative', 
            marginLeft:2,
            marginRight:2,
            borderStartStartRadius:'0px',
            borderRadius:{
                xs: '4px', // Border radius for extra small screens
                sm: '6px', // Border radius for small screens
                md: '8px', // Border radius for medium screens
                lg: '10px', // Border radius for large screens
            },
            
            flex:1,
            background: 'white', //#f5f6fa
            overflow: 'hidden', 
            '.overlayLoader': submitError==="Loading" || Object.keys(serverList).length===0 ? { opacity: 1, } : { opacity: 0, },
        })

        var [submitError, setSubmitError] = useState("")

        var handleFilterChange = (key, value) => {
            // console.log(key,value)
            if(key=="Server Name" || key==="Environment" || key==="Hosting Type"){
                setTabFilterData((prevStatus)=>({
                    ...prevStatus,
                    [key]:value===null?"":value
                }))
            }
            else if(key=="Application Family"){
                setTabFilterData((prevStatus)=>({
                    ...prevStatus,
                    "Server Name" : [],
                    "Application CI" : "",
                    [key]: value===null ? "":value
                }))
            }
            else if(key=="Application CI"){
                setTabFilterData((prevStatus)=>({
                    ...prevStatus,
                    "Server Name" : [],
                    [key]: value===null ? "":value
                }))
            }
            else if(key==="Service Name" || key==="URL"){
                var temp = tabFilterData[key]
                temp[temp.length-1] = value
                //console.log(key,value, temp)
                setTabFilterData((prevStatus)=>({
                    ...prevStatus,
                    [key]: temp
                }))
            }
        }

        var handleAddIconClick = (key) => {
            var temp = tabFilterData[key]
            temp.push("")
            // console.log(key, tabFilterData[key])
            setTabFilterData((prevStatus)=>({
                ...prevStatus,
                [key]:temp
            })) 
        }

        var handleDeleteIconClick = (index, key) => {
            var temp = tabFilterData[key]
            temp = temp.filter((val, ind)=>ind!=index)
            // console.log(key, tabFilterData[key])
            setTabFilterData((prevStatus)=>({
                ...prevStatus,
                [key]:temp
            })) 
        }

        var handleNewDataSubmit = () => {
            //setSubmitError("Loading")
            var boolCheck = ""
            var errorText = ""
            console.log(tabFilterData)
            tabFilters[tabValue]["filterNames"].map((val)=>{
                var currentStatus = true
                if(tabFilterData[val] instanceof Array){
                    currentStatus = tabFilterData[val][0]!="" && tabFilterData[val].length>0
                    boolCheck = boolCheck==="" ? currentStatus : boolCheck && (currentStatus)
                }
                else{
                    currentStatus = tabFilterData[val]!=""
                    boolCheck = boolCheck==="" ? currentStatus : boolCheck && (currentStatus)
                }
                console.log(val, currentStatus)
                if(!currentStatus){
                    errorText += val+", "
                }
            })
            
            if(!boolCheck){
                setSubmitError(errorText.slice(0,-2))
            }
            else{
                setSubmitError("Loading")
                var tempDict = {}
                tabFilters[tabValue]["filterNames"].map((val)=>{
                    tempDict[val] = tabFilterData[val]
                })
                updateOnboardedData("add", tempDict, setSubmitError)
                console.log(tabFilterData)
            }
            // console.log(boolCheck)
        }

        
        
        return(
            <Grid container md={12} sx={styleGrid} p={4}>
                
                <Grid container xs={10}>
                    <Typography variant="h6" sx={{color:"#162660"}}>{tabFilters[tabValue]["header"]}</Typography>
                </Grid>
                <Grid container md={12} justifyContent={"center"} alignItems="center">
                    {submitError!="Loading" && (!submitError.includes("Successful")) && (!submitError.includes("UnSuccessful")) && submitError.length>0? 
                        <Alert severity="error" width="100%"><span sx={{fontWeight:"bold"}}>{submitError}</span> field(s) are necessary</Alert>
                    :
                        (
                        submitError.includes("Successful") ? 
                            <Alert severity="success" width="100%"><span sx={{fontWeight:"bold"}}>{submitError}</span></Alert>
                            :
                            (
                                submitError.includes("UnSuccessful") ? 
                                    <Alert severity="warning" width="100%"><span sx={{fontWeight:"bold"}}>{submitError}</span></Alert>
                                    :
                                    ""
                            )
                        )
                    }
                </Grid>
                <Grid container md={12} spacing={2} justifyContent={"center"} alignItems="center" mt={1}>
                    <Grid item md={3}>
                        <TextField fullWidth id="standard-basic" label="User Name" value={userProfileData["displayName"]} variant="standard" disabled/> 
                    </Grid>
                    {tabFilters[tabValue]["filterNames"].map((val)=>{
                        
                        return ["Service Name", "URL", "Custom Requirement"].includes(val) ? 
                        (
                        <Grid container xs={12}>
                            {tabFilterData[val].map((value, ind)=>{
                                return <Grid item lg={val==="Custom Requirement" ? 12:4} md={val==="Custom Requirement" ? 12:6} sm={12}>
                                    <TextField fullWidth id="standard-basic" label={val} variant="standard" 
                                        placeholder={`If more ${val} names to be added, click on the + icon`+ (val==="Custom Requirement"? "/ Provide description of the Requirement and the iTelemetry team will connect with you for more info":"")}
                                        InputProps={{
                                            endAdornment: (
                                                <InputAdornment position="end">
                                                    {ind===tabFilterData[val].length-1 ?
                                                    <Tooltip title="Click to Add More">
                                                        <IconButton edge="end" onClick={()=>handleAddIconClick(val)}>
                                                            <AddCircleOutlinedIcon />
                                                        </IconButton>
                                                    </Tooltip>
                                                    :
                                                    <Tooltip title="Click to Remove">
                                                        <IconButton edge="end" onClick={()=>handleDeleteIconClick(ind, val)}>
                                                            <DeleteIcon />
                                                        </IconButton>
                                                    </Tooltip>
                                                    }
                                                </InputAdornment>
                                            ),
                                        }}
                                        value={tabFilterData[val][ind]}
                                        onChange={(event)=>{
                                            var temp = tabFilterData[val]
                                            temp[ind] = event.target.value
                                            setTabFilterData((prevStatus)=>({
                                                ...prevStatus,
                                                [val] : temp
                                            }))
                                        }}
                                    /> 
                                </Grid>
                            })} 
                        </Grid>
                        )
                        :
                        (
                        <Grid item xs={12} sm={6} md={3}>
                            <Autocomplete
                                multiple={val==="Server Name" ? true:false}
                                value={tabFilterData[val]}
                                options={
                                    val=="Application Family" ? 
                                    Object.keys(serverList).filter((key)=>key!=null) 
                                    : 
                                    (
                                    val=="Application CI"? 
                                        (tabFilterData["Application Family"]!="" ? 
                                            Object.keys(serverList[tabFilterData["Application Family"]]).filter((key)=>key!=null) 
                                            : 
                                            (tabValue===1 ? 
                                                getApplicationCI()
                                                :
                                                ["Choose an Application Family"]
                                            )
                                        ) 
                                        : 
                                        (
                                            val=="Server Name" ? 
                                            (tabFilterData["Application Family"]!="" && tabFilterData["Application CI"] !="" ? Object.values(serverList[tabFilterData["Application Family"]][tabFilterData["Application CI"]]).filter((key)=>key!=null) : ["Choose an Application Family & Application CI"]) 
                                            : 
                                            (val=="Environment" ? ["Production", "Test"].filter((key)=>key!=null)
                                            :
                                            (val=="Hosting Type" ? ["Cloud", "OnPremise"].filter((key)=>key!=null) : "")
                                            )
                                        )
                                    )
                                }
                                getOptionDisabled={(option) => option === "Choose an Application Family" || option === "Choose an Application Family & Application CI"}
                                renderInput={(params) => (
                                    <TextField {...params} label={val} variant="outlined" />
                                )}
                                //popupIcon={Object.keys(serverList).length==0 && val=="Application Family" ? <CircularProgress/>:<ArrowDropDownIcon/>}
                                //PopperComponent={(props) => <StyledPopper {...props}/>}
                                onChange={(event,value)=>handleFilterChange(val, value)}
                                sx={{ display:"flex", width: '100%', alignItems : "center", justifyContent:"center"}} 
                            /> 
                        </Grid>
                        )
                    })}
                </Grid>
                <Grid container md={12} justifyContent={"center"} alignItems="center" mt={2}>
                    <Button variant="outlined" onClick={handleNewDataSubmit} endIcon={<SendIcon />}>
                        Submit
                    </Button>
                </Grid>
                <Box className="overlayLoader" sx={overlayLoaderStyle}> 
                     <CircularProgress/>
                </Box>
            </Grid>
        )
    }
    var NewAppOnboarding = () => {

        
        const overlayLoaderStyle = ()=> ({ 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            width: '100%', 
            height :'100%',
            backgroundColor: 'rgba(0, 0, 0, 0.5)', // 20% opacity black 
            display: Object.keys(serverList).length===0 ? 'flex' : 'none', 
            justifyContent: 'center', 
            alignItems: 'center', 
            opacity: 0, 
            transition: 'opacity 0.5s', 
        })
        
        var styleGrid = ()=>({
            position: 'relative', 
            marginLeft:2,
            marginRight:2,
            borderStartStartRadius:'0px',
            borderRadius:{
                xs: '4px', // Border radius for extra small screens
                sm: '6px', // Border radius for small screens
                md: '8px', // Border radius for medium screens
                lg: '10px', // Border radius for large screens
            },
            
            flex:1,
            background: 'white', //#f5f6fa
            overflow: 'hidden', 
            '.overlayLoader': Object.keys(serverList).length===0 ? { opacity: 1, } : { opacity: 0, },
        })
        var [applicationOnboardingData, setApplicationOnboardingData] = useState({
            "User Name":"",
            "Application Family": "",
            "Users Watch List": [],
            "Windows Services": {"Server Name":[[]],"Service Name":[[""]]},
            "Url":{"Application CI":[[]],"URL":[[""]]},
            "Architecture Diagram" : "",
            "Alerting": {"CPU":{"Status":false, "Threshold":80}, "Memory":{"Status":false, "Threshold":80}, "Disk":{"Status":false, "Threshold":80},"Windows Services":{"Status":false, "Threshold":5}, "URL":{"Status":false, "Threshold":5}, "Azure File Storage":{"Status":false, "Threshold":"80"}, "DL":""},
            "Corepoint Interface": [""],
            "Custom Requirement" : [""]
        })
        // var [serverList, setServerList] = useState({})

        // useEffect(()=>{
        //     if(localStorage.getItem("ServerList_HomePage")!==null){
        //         var tempVar = JSON.parse(localStorage.getItem("ServerList_HomePage"))
        //         //console.log(tempVar)
        //         updateServerList(tempVar)
        //     }
        // }, [])

        var resetApplicationOnboardingData = () =>{
            setApplicationOnboardingData({
                "User Name":"",
                "Application Family": "",
                "Users Watch List": [],
                "Windows Services": {"Server Name":[[]],"Service Name":[[""]]},
                "Url":{"Application CI":[[]],"URL":[[""]]},
                "Architecture Diagram" : {"File Name":"", "File Type":"", "File Content": ""},
                "Alerting": {"CPU":{"Status":false, "Threshold":80}, "Memory":{"Status":false, "Threshold":80}, "Disk":{"Status":false, "Threshold":80},"Windows Services":{"Status":false, "Threshold":5}, "URL":{"Status":false, "Threshold":5}, "Azure File Storage":{"Status":false, "Threshold":"80"}, "DL":""},
                "Corepoint Interface": [""],
                "Custom Requirement" : [""]
            })
        }

        var handleAddIconClick = (key) => {
            var temp = applicationOnboardingData[key]
            temp.push("")
            // console.log(key, tabFilterData[key])
            setApplicationOnboardingData((prevStatus)=>({
                ...prevStatus,
                [key]:temp
            })) 
        }


        var handleDeleteIconClick = (index, key) => {
            var temp = applicationOnboardingData[key]
            temp = temp.filter((val, ind)=>ind!=index)
            // console.log(key, tabFilterData[key])
            setApplicationOnboardingData((prevStatus)=>({
                ...prevStatus,
                [key]:temp
            })) 
        }

        return(
            <Grid container md={12} sx={styleGrid} p={4}>
                
                <Grid container xs={12}>
                    {/* User and Application info */}
                    <Grid container md={12} spacing={2} alignItems="center" my={2}>
                        <Grid item xs={2} align="right">
                            <Typography variant="body" px={1} sx={{color:"#162660"}}>User Information</Typography>
                        </Grid>
                        <Grid container sm={12} md={10} sx={{backgroundColor:"#f5f6fa"}} p={1}>
                            <Grid item xs={12} sm={6} md={4}>
                                <TextField fullWidth id="standard-basic" label="User Name" value={userProfileData["displayName"]} variant="standard" disabled/> 
                            </Grid>
                            <Grid item xs={12} sm={6} md={4}>
                                <Autocomplete
                                    value={applicationOnboardingData["Users Watch List"]}
                                    size="small"
                                    options={
                                        [] 
                                    }
                                    renderInput={(params) => (
                                        <TextField {...params} label={"Users Watch List"} variant="outlined" />
                                    )}
                                    //popupIcon={Object.keys(serverList).length==0 && val=="Application Family" ? <CircularProgress/>:<ArrowDropDownIcon/>}
                                    //PopperComponent={(props) => <StyledPopper {...props}/>}
                                    onChange={(event,value)=>{
                                        setApplicationOnboardingData((prevStatus)=>({
                                            ...prevStatus,
                                            ["Users Watch List"] : value
                                        }))
                                    }}
                                    sx={{ display:"flex", width: '100%', alignItems : "center", justifyContent:"center"}} 
                                /> 
                            </Grid>
                            <Grid item xs={12} sm={6} md={4}>
                                <Autocomplete
                                    value={applicationOnboardingData["Application Family"]}
                                    options={
                                        Object.keys(serverList).filter((key)=>key!=null) 
                                    }
                                    size="small"
                                    renderInput={(params) => (
                                        <TextField {...params} label={"Application Family"} variant="outlined" />
                                    )}
                                    //popupIcon={Object.keys(serverList).length==0 && val=="Application Family" ? <CircularProgress/>:<ArrowDropDownIcon/>}
                                    //PopperComponent={(props) => <StyledPopper {...props}/>}
                                    onChange={(event,value)=>{
                                        resetApplicationOnboardingData()
                                        setApplicationOnboardingData((prevStatus)=>({
                                            ...prevStatus,
                                            ["Application Family"]: value===null || value===undefined ? "" : value
                                        }))
                                    }}
                                    sx={{ display:"flex", width: '100%', alignItems : "center", justifyContent:"center"}} 
                                /> 
                            </Grid>
                        </Grid>
                        
                    </Grid>
                    {/* Add Windows Service */}
                    <Grid container md={12} spacing={2} my={2} alignItems={"center"}>
                        <Grid item xs={2} align="right">
                            <Typography variant="body" px={1} sx={{color:"#162660"}}>Windows Services</Typography>
                        </Grid>
                        {applicationOnboardingData["Windows Services"]["Server Name"].map((entry, index)=>(
                            <Grid container sm={12} md={10} sx={{backgroundColor:"#f5f6fa"}} p={1}>
                                <Grid item xs={12} sm={6} md={3}>
                                    <Autocomplete
                                        multiple
                                        disableCloseOnSelect
                                        value={applicationOnboardingData["Windows Services"]["Server Name"][index]}
                                        size="small"
                                        options={
                                            Object.keys(serverList).length>0 ? 
                                            (applicationOnboardingData["Application Family"]==="" ? 
                                                ["Choose an Application Family"]
                                            :
                                                getServerNames(applicationOnboardingData["Application Family"])
                                            )
                                            :
                                            ["Loading"]
                                        }
                                        getOptionDisabled={(option) => option === "Choose an Application Family"}
                                        renderInput={(params) => (
                                            <TextField {...params} label={"Server Name"} variant="outlined" />
                                        )}
                                        //popupIcon={Object.keys(serverList).length==0 && val=="Application Family" ? <CircularProgress/>:<ArrowDropDownIcon/>}
                                        //PopperComponent={(props) => <StyledPopper {...props}/>}
                                        onChange={(event,value)=>{
                                            var temp = applicationOnboardingData["Windows Services"]
                                            temp["Server Name"][index] = (value===null || value===undefined) ? []:value
                                            setApplicationOnboardingData((prevStatus)=>({
                                                ...prevStatus,
                                                ["Windows Services"] : temp
                                            }))
                                        }}
                                        sx={{ display:"flex", width: '100%', alignItems : "center", justifyContent:"center"}} 
                                    /> 
                                </Grid>
                                {applicationOnboardingData["Windows Services"]["Service Name"][index].map((val, ind)=>(
                                    <Grid item xs={12} sm={6} md={3}>
                                    
                                        <TextField fullWidth id="standard-basic" label={"Service Name"} variant="standard" size="small"
                                            placeholder={`If more Service names to be added, click on the + icon`}
                                            InputProps={{
                                                endAdornment: (
                                                    <InputAdornment position="end">
                                                        {ind===applicationOnboardingData["Windows Services"]["Service Name"][index].length-1 ?
                                                        <Tooltip title="Click to Add More">
                                                            <IconButton edge="end" onClick={()=>{
                                                                var temp = applicationOnboardingData["Windows Services"]
                                                                temp["Service Name"][index].push("")
                                                                setApplicationOnboardingData((prevStatus)=>({
                                                                    ...prevStatus,
                                                                    ["Service Name"] : temp
                                                                }))
                                                            }}>
                                                                <AddCircleOutlinedIcon />
                                                            </IconButton>
                                                        </Tooltip>
                                                        :
                                                        <Tooltip title="Click to Remove">
                                                            <IconButton edge="end" onClick={()=>{
                                                                var temp = applicationOnboardingData["Windows Services"]
                                                                temp["Service Name"][index] = temp["Service Name"][index].filter((val, ind1)=>ind1!=ind)
                                                                setApplicationOnboardingData((prevStatus)=>({
                                                                    ...prevStatus,
                                                                    ["Service Name"] : temp
                                                                }))
                                                            }}>
                                                                <DeleteIcon />
                                                            </IconButton>
                                                        </Tooltip>
                                                        }
                                                    </InputAdornment>
                                                ),
                                            }}
                                            value={applicationOnboardingData["Windows Services"]["Service Name"][index][ind]}
                                            onChange={(event)=>{
                                                var temp = applicationOnboardingData["Windows Services"]
                                                temp["Service Name"][index][ind] = event.target.value
                                                setApplicationOnboardingData((prevStatus)=>({
                                                    ...prevStatus,
                                                    ["Windows Services"] : temp
                                                }))
                                            }}
                                        />
                                    </Grid>
                                ))}
                                
                            </Grid>
                        ))}
                    </Grid>
                    {/* Add Application URL */}
                    <Grid container md={12} spacing={2} my={2} alignItems={"center"}>
                        <Grid item xs={2} align="right">
                            <Typography variant="body" px={1} sx={{color:"#162660"}}>Application URLs</Typography>
                        </Grid>
                        {applicationOnboardingData["Url"]["Application CI"].map((entry, index)=>(
                            <Grid container sm={12} md={10} sx={{backgroundColor:"#f5f6fa"}} p={1}>
                                <Grid item xs={12} sm={6} md={3}>
                                    <Autocomplete
                                        value={applicationOnboardingData["Url"]["Application CI"][index]}
                                        size="small"
                                        options={
                                            Object.keys(serverList).length>0 ? 
                                            (applicationOnboardingData["Application Family"].length===0 ? 
                                                ["Choose an Application Family"]
                                            :
                                                Object.keys(serverList[applicationOnboardingData["Application Family"]])
                                            )
                                            :
                                            ["Loading"]
                                        }
                                        getOptionDisabled={(option) => option === "Choose an Application Family"}
                                        renderInput={(params) => (
                                            <TextField {...params} label={"Application CI"} variant="outlined" />
                                        )}
                                        //popupIcon={Object.keys(serverList).length==0 && val=="Application Family" ? <CircularProgress/>:<ArrowDropDownIcon/>}
                                        //PopperComponent={(props) => <StyledPopper {...props}/>}
                                        onChange={(event,value)=>{
                                            var temp = applicationOnboardingData["Url"]
                                            temp["Application CI"][index] = (value===null || value===undefined) ? "":value
                                            setApplicationOnboardingData((prevStatus)=>({
                                                ...prevStatus,
                                                ["Url"] : temp
                                            }))
                                        }}
                                        sx={{ display:"flex", width: '100%', alignItems : "center", justifyContent:"center"}} 
                                    /> 
                                </Grid>
                                {applicationOnboardingData["Url"]["URL"][index].map((val, ind)=>(
                                    <Grid item xs={12} sm={6} md={4.5}>
                                    
                                        <TextField fullWidth id="standard-basic" label={"URLs"} variant="standard" 
                                            placeholder={`If more URLs names to be added, click on the + icon`}
                                            size="small"
                                            InputProps={{
                                                endAdornment: (
                                                    <InputAdornment position="end">
                                                        {ind===applicationOnboardingData["Url"]["URL"][index].length-1 ?
                                                        <Tooltip title="Click to Add More">
                                                            <IconButton edge="end" onClick={()=>{
                                                                var temp = applicationOnboardingData["Url"]
                                                                temp["URL"][index].push("")
                                                                setApplicationOnboardingData((prevStatus)=>({
                                                                    ...prevStatus,
                                                                    ["Url"] : temp
                                                                }))
                                                            }}>
                                                                <AddCircleOutlinedIcon />
                                                            </IconButton>
                                                        </Tooltip>
                                                        :
                                                        <Tooltip title="Click to Remove">
                                                            <IconButton edge="end" onClick={()=>{
                                                                var temp = applicationOnboardingData["Url"]
                                                                temp["URL"][index] = temp["URL"][index].filter((val, ind1)=>ind1!=ind)
                                                                setApplicationOnboardingData((prevStatus)=>({
                                                                    ...prevStatus,
                                                                    ["Url"] : temp
                                                                }))
                                                            }}>
                                                                <DeleteIcon />
                                                            </IconButton>
                                                        </Tooltip>
                                                        }
                                                    </InputAdornment>
                                                ),
                                            }}
                                            value={applicationOnboardingData["Url"]["URL"][index][ind]}
                                            onChange={(event)=>{
                                                var temp = applicationOnboardingData["Url"]
                                                temp["URL"][index][ind] = event.target.value
                                                setApplicationOnboardingData((prevStatus)=>({
                                                    ...prevStatus,
                                                    ["Url"] : temp
                                                }))
                                            }} 
                                        />
                                    </Grid>
                                ))}
                                
                            </Grid>
                        ))}
                        
                    </Grid>
                    {/* Add Application Interfaces */}
                    <Grid container md={12} spacing={2} my={2} alignItems={"center"}>
                        <Grid item xs={2} align="right">
                            <Typography variant="body" px={1} sx={{color:"#162660"}}>Corepoint Interfaces</Typography>
                        </Grid>
                        <Grid container sm={12} md={10} sx={{backgroundColor:"#f5f6fa"}} p={1}>
                            {applicationOnboardingData["Corepoint Interface"].map((val, ind)=>{
                                return <Grid item xs={12} sm={6} md={4}>
                                    <TextField fullWidth id="standard-basic" label={"Common Substring Interface name"} variant="standard" 
                                        placeholder={`If more Interfaces names to be added, click on the + icon`}
                                        InputProps={{
                                            endAdornment: (
                                                <InputAdornment position="end">
                                                    {ind===applicationOnboardingData["Corepoint Interface"].length-1 ?
                                                    <Tooltip title="Click to Add More">
                                                        <IconButton edge="end" onClick={()=>handleAddIconClick("Corepoint Interface")}>
                                                            <AddCircleOutlinedIcon />
                                                        </IconButton>
                                                    </Tooltip>
                                                    :
                                                    <Tooltip title="Click to Remove">
                                                        <IconButton edge="end" onClick={()=>handleDeleteIconClick(ind, "Corepoint Interface")}>
                                                            <DeleteIcon />
                                                        </IconButton>
                                                    </Tooltip>
                                                    }
                                                </InputAdornment>
                                            ),
                                        }}
                                        value={applicationOnboardingData["Corepoint Interface"][ind]}
                                        onChange={(event)=>{
                                            var temp = applicationOnboardingData["Corepoint Interface"]
                                            temp[ind] = event.target.value
                                            setApplicationOnboardingData((prevStatus)=>({
                                                ...prevStatus,
                                                ["Corepoint Interface"] : temp
                                            }))
                                        }} 
                                    />
                                </Grid>
                            })}
                        </Grid>
                    </Grid>
                    {/* Add Alerting */}
                    <Grid container md={12} spacing={2} my={2} alignItems={"center"}>
                        
                        <Grid item xs={2} align="right">
                            <Typography variant="body" px={1} sx={{color:"#162660"}}>Alerting Requirements</Typography>
                        </Grid>
                        <Grid container sm={12} md={10} sx={{backgroundColor:"#f5f6fa"}} p={1}>
                            <Grid item>  
                                <FormControlLabel control={<Checkbox checked={applicationOnboardingData["Alerting"]["CPU"]["Status"]} onChange={()=>{
                                    var temp = applicationOnboardingData["Alerting"]
                                    temp["CPU"]["Status"] = !temp["CPU"]["Status"]
                                    setApplicationOnboardingData((prevStatus)=>({
                                        ...prevStatus,
                                        ["Alerting"] : temp
                                    }))
                                }}/>} label={
                                    <TextField width={4} variant="standard" 
                                    value={applicationOnboardingData["Alerting"]["CPU"]["Threshold"]} 
                                    InputProps={{
                                        endAdornment: (
                                            <InputAdornment position="end">
                                                <IconButton edge="end">
                                                    <PercentIcon />
                                                </IconButton>
                                            </InputAdornment>
                                        ),
                                        }}
                                        helperText={applicationOnboardingData["Alerting"]["CPU"]["Threshold"]<=100 && applicationOnboardingData["Alerting"]["CPU"]["Threshold"]>=0 ?
                                            "CPU Utilization Threshold"
                                            :
                                            "Value should be between 0 and 100"
                                        }
                                        error={applicationOnboardingData["Alerting"]["CPU"]["Threshold"]>100 || applicationOnboardingData["Alerting"]["CPU"]["Threshold"]<0? "Above 100" :  ""}                                        onChange={(event)=>{
                                            var temp = applicationOnboardingData["Alerting"]
                                            temp["CPU"]["Threshold"] = event.target.value
                                            setApplicationOnboardingData((prevStatus)=>({
                                                ...prevStatus,
                                                ["Alerting"] : temp
                                            }))
                                        }}
                                    />
                                    } 
                                />
                            </Grid>
                            <Grid item>  
                                <FormControlLabel control={<Checkbox checked={applicationOnboardingData["Alerting"]["Memory"]["Status"]} onChange={()=>{
                                    var temp = applicationOnboardingData["Alerting"]
                                    temp["Memory"]["Status"] = !temp["Memory"]["Status"]
                                    setApplicationOnboardingData((prevStatus)=>({
                                        ...prevStatus,
                                        ["Alerting"] : temp
                                    }))
                                }}/>} label={
                                    <TextField width={4} variant="standard" value={applicationOnboardingData["Alerting"]["Memory"]["Threshold"]} InputProps={{
                                        endAdornment: (
                                            <InputAdornment position="end">
                                                <IconButton edge="end">
                                                    <PercentIcon />
                                                </IconButton>
                                            </InputAdornment>
                                        ),
                                        }}
                                        helperText={applicationOnboardingData["Alerting"]["Memory"]["Threshold"]<=100 && applicationOnboardingData["Alerting"]["Memory"]["Threshold"]>=0 ?
                                            "Memory Utilization Threshold"
                                            :
                                            "Value should be between 0 and 100"
                                        }
                                        error={applicationOnboardingData["Alerting"]["Memory"]["Threshold"]>100 || applicationOnboardingData["Alerting"]["Memory"]["Threshold"]<0? "Above 100" :  ""}
                                        
                                        onChange={(event)=>{
                                            var temp = applicationOnboardingData["Alerting"]
                                            temp["Memory"]["Threshold"] = event.target.value
                                            setApplicationOnboardingData((prevStatus)=>({
                                                ...prevStatus,
                                                ["Alerting"] : temp
                                            }))
                                        }}
                                    />
                                    }  />
                            </Grid>
                            <Grid item>  
                                <FormControlLabel control={<Checkbox checked={applicationOnboardingData["Alerting"]["Disk"]["Status"]} onChange={()=>{
                                    var temp = applicationOnboardingData["Alerting"]
                                    temp["Disk"]["Status"] = !temp["Disk"]["Status"]
                                    setApplicationOnboardingData((prevStatus)=>({
                                        ...prevStatus,
                                        ["Alerting"] : temp
                                    }))
                                }}/>} label={
                                    <TextField width={4} variant="standard" value={applicationOnboardingData["Alerting"]["Disk"]["Threshold"]} InputProps={{
                                        endAdornment: (
                                            <InputAdornment position="end">
                                                <IconButton edge="end">
                                                    <PercentIcon />
                                                </IconButton>
                                            </InputAdornment>
                                        ),
                                        }}
                                        helperText={applicationOnboardingData["Alerting"]["Disk"]["Threshold"]<=100 && applicationOnboardingData["Alerting"]["Disk"]["Threshold"]>=0 ?
                                            "Disk Utilization Threshold"
                                            :
                                            "Value should be between 0 and 100"
                                        }
                                        error={applicationOnboardingData["Alerting"]["Disk"]["Threshold"]>100 || applicationOnboardingData["Alerting"]["Disk"]["Threshold"]<0? "Above 100" :  ""}
                                        
                                        onChange={(event)=>{
                                            var temp = applicationOnboardingData["Alerting"]
                                            temp["Disk"]["Threshold"] = event.target.value
                                            setApplicationOnboardingData((prevStatus)=>({
                                                ...prevStatus,
                                                ["Alerting"] : temp
                                            }))
                                        }}
                                    />
                                    } />
                            </Grid>
                            <Grid item>  
                                <FormControlLabel control={<Checkbox checked={applicationOnboardingData["Alerting"]["URL"]["Status"]} onChange={()=>{
                                    var temp = applicationOnboardingData["Alerting"]
                                    temp["URL"]["Status"] = !temp["URL"]["Status"]
                                    setApplicationOnboardingData((prevStatus)=>({
                                        ...prevStatus,
                                        ["Alerting"] : temp
                                    }))
                                }}/>} label={
                                    <TextField width={4} variant="standard" value={applicationOnboardingData["Alerting"]["URL"]["Threshold"]} InputProps={{
                                        endAdornment: (
                                            <InputAdornment position="end">
                                                <Typography>mins</Typography>
                                            </InputAdornment>
                                        ),
                                        }}
                                        helperText={"URL Alert Threshold"}
                                        onChange={(event)=>{
                                            var temp = applicationOnboardingData["Alerting"]
                                            temp["URL"]["Threshold"] = event.target.value
                                            setApplicationOnboardingData((prevStatus)=>({
                                                ...prevStatus,
                                                ["Alerting"] : temp
                                            }))
                                        }}
                                    />
                                    } />
                            </Grid>
                            <Grid item>  
                                <FormControlLabel control={<Checkbox checked={applicationOnboardingData["Alerting"]["Windows Services"]["Status"]} onChange={()=>{
                                    var temp = applicationOnboardingData["Alerting"]
                                    temp["Windows Services"]["Status"] = !temp["Windows Services"]["Status"]
                                    setApplicationOnboardingData((prevStatus)=>({
                                        ...prevStatus,
                                        ["Alerting"] : temp
                                    }))
                                }}/>} label={
                                    <TextField width={4} variant="standard" value={applicationOnboardingData["Alerting"]["Windows Services"]["Threshold"]} InputProps={{
                                        endAdornment: (
                                            <InputAdornment position="end">
                                                <Typography>mins</Typography>
                                            </InputAdornment>
                                        ),
                                        }}
                                        helperText={"Windows Services Alert Threshold"}
                                        onChange={(event)=>{
                                            var temp = applicationOnboardingData["Alerting"]
                                            temp["Windows Services"]["Threshold"] = event.target.value
                                            setApplicationOnboardingData((prevStatus)=>({
                                                ...prevStatus,
                                                ["Alerting"] : temp
                                            }))
                                        }}
                                    />
                                    } />
                            </Grid>
                            <Grid item>  
                                <FormControlLabel control={<Checkbox checked={applicationOnboardingData["Alerting"]["Azure File Storage"]["Status"]} onChange={()=>{
                                    var temp = applicationOnboardingData["Alerting"]
                                    temp["Azure File Storage"]["Status"] = !temp["Azure File Storage"]["Status"]
                                    setApplicationOnboardingData((prevStatus)=>({
                                        ...prevStatus,
                                        ["Alerting"] : temp
                                    }))
                                }}/>} label={
                                    <TextField width={4} variant="standard" value={applicationOnboardingData["Alerting"]["Azure File Storage"]["Threshold"]} InputProps={{
                                        endAdornment: (
                                            <InputAdornment position="end">
                                                <IconButton edge="end">
                                                    <PercentIcon />
                                                </IconButton>
                                            </InputAdornment>
                                        ),
                                        }}
                                        helperText={"Azure File Storage Alert Threshold"}
                                        onChange={(event)=>{
                                            var temp = applicationOnboardingData["Alerting"]
                                            temp["Azure File Storage"]["Threshold"] = event.target.value
                                            setApplicationOnboardingData((prevStatus)=>({
                                                ...prevStatus,
                                                ["Alerting"] : temp
                                            }))
                                        }}
                                    />
                                    } />
                            </Grid>
                        </Grid>
                    </Grid>
                    {/* Application Architecture */}
                    <Grid container md={12} spacing={2} my={2} alignItems={"center"}>
                        <Grid item xs={2} align="right">
                            <Grid>
                                <Typography variant="body" px={1} sx={{color:"#162660"}}>Architecture Diagram</Typography>
                            </Grid>
                            <Grid>
                                <Typography variant="caption" px={1} sx={{color:"#162660"}}>(Image format)</Typography>
                            </Grid>
                        </Grid>
                        <Grid container sm={12} md={10} sx={{backgroundColor:"#f5f6fa"}} p={1}>
                            <Grid item xs={12} sm={6} md={3}>
                                <input type="file" accept="image/*" onChange={(event)=>{
                                    const file = event.target.files[0]
                                    const reader = new FileReader()
                                    reader.onload = (e) => {
                                        const fileContent = e.target.result
                                        setApplicationOnboardingData((prevStatus)=>({
                                            ...prevStatus,
                                            ["Architecture Diagram"] : {"File Name":file.name, "File Type":file.type, "File Content":fileContent}
                                        }))
                                        //console.log(file.name, file.type, fileContent)
                                    }
                                    reader.readAsDataURL(file)
                                }}/>
                            </Grid>
                        </Grid>
                    </Grid>
                    {/* Custom requirements */}
                    <Grid container md={12} spacing={2} my={2} alignItems={"center"}>
                        <Grid item xs={2} align="right">
                            <Typography variant="body" px={1} sx={{color:"#162660", textAlign:'right'}}>Custom Monitoring</Typography>
                        </Grid>
                        <Grid container sm={12} md={10} sx={{backgroundColor:"#f5f6fa"}} p={1}>
                            {applicationOnboardingData["Custom Requirement"].map((val, ind)=>{
                                return <Grid item xs={12} sm={12} md={12}>
                                    <TextField fullWidth id="standard-basic" label={"Custom Monitoring (Header : Description)"} variant="standard" size='small'
                                        placeholder={`If more requests to be added, click on the + icon`}
                                        InputProps={{
                                            endAdornment: (
                                                <InputAdornment position="end">
                                                    {ind===applicationOnboardingData["Custom Requirement"].length-1 ?
                                                    <Tooltip title="Click to Add More">
                                                        <IconButton edge="end" onClick={()=>handleAddIconClick("Custom Requirement")}>
                                                            <AddCircleOutlinedIcon />
                                                        </IconButton>
                                                    </Tooltip>
                                                    :
                                                    <Tooltip title="Click to Remove">
                                                        <IconButton edge="end" onClick={()=>handleDeleteIconClick(ind, "Custom Requirement")}>
                                                            <DeleteIcon />
                                                        </IconButton>
                                                    </Tooltip>
                                                    }
                                                </InputAdornment>
                                            ),
                                        }}
                                        value={applicationOnboardingData["Custom Requirement"][ind]}
                                        onChange={(event,value)=>{
                                            var temp = applicationOnboardingData["Custom Requirement"]
                                            temp[ind] = value
                                            setApplicationOnboardingData((prevStatus)=>({
                                                ...prevStatus,
                                                ["Custom Requirement"] : temp
                                            }))
                                        }} 
                                    />
                                
                                </Grid>
                            })}
                        </Grid>
                        
                    </Grid>
                </Grid>
                
                <Grid container md={12} justifyContent={"center"} alignItems="center" mt={2}>
                    <Button variant="outlined" endIcon={<SendIcon />}>
                        Submit
                    </Button>
                </Grid>
                <Box className="overlayLoader" sx={overlayLoaderStyle}> 
                     <CircularProgress/>
                </Box>
            </Grid>
        )
    }
    return(
        <Grid container mt={4}>
            {!newAppOnboarding ? 
                <Grid container>
                    <Grid container md={12} sx={{
                        display: 'flex',
                        justifyContent: 'space-between', // Distributes space between items
                        alignItems: 'center', // Centers items vertically
                    }}>
                        <Grid item justifyContent={"center"} alignItems={"center"} 
                            sx={{backgroundColor:"white", marginLeft:2, padding:1, 
                            borderStartStartRadius:{
                                xs: '4px', // Border radius for extra small screens
                                sm: '6px', // Border radius for small screens
                                md: '8px', // Border radius for medium screens
                                lg: '10px', // Border radius for large screens
                            }}} 
                        >
                            <Tabs value={tabValue} onChange={handleTabChange} position="fixed">
                                <Tab label="Windows Services" />
                                <Tab label="Url"/>
                                <Tab label="Custom Requirements"/>
                            </Tabs>
                        </Grid>
                        <Grid item sx={{ textAlign: 'right'}} p={2}>
                            <Button variant="contained" startIcon={<AddIcon />} onClick={handleOnboardingClick}>
                                Onboard a New Application
                            </Button>
                            <Typography></Typography>
                        </Grid>
                    </Grid>
                    <UpdateForm/>
                    <DisplayOnboardedApplicationDetails/>
                </Grid> 
            :
                <NewAppOnboarding/>
            }
            
        </Grid>
    )   
}
