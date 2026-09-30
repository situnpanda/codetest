import React, { useEffect, useState } from 'react';
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import Box from '@mui/material/Box';
import PopupButton from './popup';
import { styled } from '@mui/material/styles';
import Card from '@mui/material/Card';
import TablePagination from '@mui/material/TablePagination';
import TableCell, { tableCellClasses } from '@mui/material/TableCell';
import SendIcon from '@mui/icons-material/Send';
import { Button, Grid, LinearProgress, Paper, Typography, Tabs, Tab, Divider, Table, TableBody, TableContainer, TableHead,
  TableRow, Switch, TextField, Autocomplete } from '@mui/material';

export default function ComplianceTelemetry() {

  const [serverList, setServerList] = useState({});
  const [tabChange, setTabChange] = useState(0);
  const [loading, setLoading] = useState({});
  const [loading_SubRg, setLoading_SubRg] = useState({});
  const [filterData, setFilterData] = useState({});
  const [filterOptions, setFilterOptions] = useState({});
  const [filterData_SubRg, setFilterData_SubRg] = useState({
    subRg: ['enterprise-clinical-apps-prod-01', 'enterprise-clinical-apps-prod-02','enterprise-clinical-apps-prod-03','enterprise-clinical-apps-prod-04',
    'enterprise-clinical-apps-test-01'],
    resourceType: ['Storage Accounts', 'Virtual Machines', 'Key Vaults'],
  });

  const [filterOptions_SubRg, setFilterOptions_SubRg] = useState({
    subRg: ['All'],
    resourceType: ['Virtual Machines'],
  });
  var [complianceData, setComplianceData] = useState({})
  const [filterChoiceSwitchButtton, setFilterChoiceSwitchButtton] = useState(false);
  //var baseUrl =  "http://127.0.0.1:5000/api/"
  var baseUrl =  "https://itelemetry.providence.org/api/"
  
  const fetchSubscriptionData = async (page, limit) => {
    setLoading((prevLoading) => ({
      ...prevLoading,
      serverList: true,
    }));
    var subscriptionId = ""
    //console.log(filterOptions_SubRg)
    if(filterOptions_SubRg["subRg"]=="All"){
      subscriptionId = Object.values(options) 
    }
    else{
      subscriptionId = []
      filterOptions_SubRg["subRg"].forEach(element => {
        subscriptionId.push(options[element])
      });
      //console.log(subscriptionId)

    }
    //console.log(subscriptionId)
    const params = {
      //filters: JSON.stringify(filterOptions_SubRg), // Check the structure of filterOptions here
      subscription_id : subscriptionId
    };
    //console.log('Params for server list:', params); 
    const url = new URL(baseUrl + 'governance');
    url.search = new URLSearchParams(params).toString();
  
    try {
      fetch(url)
      .then((response) => response.json())
      .then((data) =>{ 
        //console.log("Server List")
        //console.log(JSON.parse(data["tagComplianceData"]))
        setComplianceData(JSON.parse(data["Data"]))
        //console.log(Object.keys(JSON.parse(data)).length)
        //console.log(JSON.parse(data)["name"])
        setLoading(prevLoading=>({
          ...prevLoading,
          "serverList" : false
        }));  
      })
      // fetch(url).then((response)=> response.json()).then((data)=> console.log(data));
      // setServerList(JSON.parse(data["ServerLogs"]));
      setLoading((prevLoading) => ({
        ...prevLoading,
        serverList: false
      }));
    } catch (error) {
      setLoading((prevLoading) => ({
        ...prevLoading,
        serverList: false,
      }));
      console.error('Error:', error);
    }
  };

  const validateApplicationId = (value) => {
    if (!value || value.trim() === '') return false; 
    if (value.length !== 10) return false; 
    if (value.startsWith('BSN')) return false;
    if (value.startsWith('APM')) return true; 
    return true;
  };
  const validateCostCenter = (value) => {
    if (!value || value.trim() === '') return false; 
    if (/^0+$/.test(value)) return false; 
    return true;
  };
  const validateNotEmpty = (value) => {
    return !(!value || value.trim() === ''); 
  };
  const validateSupportGroup = (value) => {
    if (!value || value.trim() === '') return false; 
    if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/.test(value)) return false; 
    if (/^\w$/.test(value)) return false; 
    return true;
  };
  const validateBackupType = (value) => {
    if (!value || value.trim() === '') return false; 
    if (value.toLowerCase().includes('none')) return false; 
    return true;
  };
  const validateEnvironment = (value) => {
    if (!value || value.trim() === '') return false;
    if (value.toLowerCase().includes('production') ) return true; 
    if (value.toLowerCase().includes('test') || value.toLowerCase().includes('development') || value.toLowerCase().includes('prod') || value.toLowerCase().includes('staging')) return false; // Should not contain 'test', 'development', 'prod', 'staging'
    return true;
  };

  const getBackgroundColor = (columnKey, value) => {
    switch (columnKey) {
      case 'applicationID':
        return validateApplicationId(value) ? 'initial' : '#c54d4d';
      case 'costCenter':
        return validateCostCenter(value) ? 'initial' : '#c54d4d';
      case 'applicationCI':
        return validateNotEmpty(value) ? 'initial' : '#c54d4d';
      case 'supportGroup':
        return validateSupportGroup(value) ? 'initial' : '#c54d4d';
      case 'backupType':
        return validateBackupType(value) ? 'initial' : '#c54d4d';
      case 'appFamily':
        return validateNotEmpty(value) ? 'initial' : '#c54d4d';
      case 'maintenanceWindow':
      case 'maintenanceStatus':
        return validateNotEmpty(value) ? 'initial' : '#c54d4d';
      case 'environment':
        return validateEnvironment(value) ? 'initial' : '#c54d4d';
      case 'managedBy':
        return validateNotEmpty(value) ? 'initial' : '#c54d4d';
      default:
        return 'initial';
    }
  };
  const getCompliantStatus = (row, index) =>{
    var status = {}
    Object.keys(row).map((val)=>{
      var tagColor = getBackgroundColor(val, row[val][index])
      status[val] = tagColor == "#c54d4d" ? "disabled": "enabled"
    })
    return status
  }
  const raiseAdoTicket = async (rowData, index) => {
    console.log("hello rowdata",rowData);
    console.log("hello hii index",index);
    try {
      const dataToSend = {
        resourceName: rowData.name[index], 
        applicationId: rowData.applicationId[index],
        applicationCI: rowData.applicationCI[index],
        nonCompliantTags: {}
      };
      const compliantStatus = getCompliantStatus(rowData, index);
      Object.keys(compliantStatus).forEach(tag => {
        if (compliantStatus[tag] === "disabled") {
          dataToSend.nonCompliantTags[tag] = rowData[tag][index];
        }
      });
      console.log("sup",dataToSend)
      const requestOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(dataToSend)
      };
  
      const response = await fetch('http://localhost:5000/api/createUserStory', requestOptions);
      if (!response.ok) {
        throw new Error('Failed to create ADO ticket. Server responded with status ' + response.status);
      }
      const responseData = await response.json();
      console.log('ADO ticket created successfully:', responseData);
      alert('ADO ticket created successfully!');
    } catch (error) {
      console.error('Error creating ADO ticket:', error);
      alert('Failed to create ADO ticket. Please try again later.');
    }
    
  };
  
  const handleTabChange = (event, value) => {
    setTabChange(value);
    if (value === 0) {
      if (
        loading_SubRg.serverList &&
        loading_SubRg.rebootEvent &&
        loading_SubRg.serverEnvironment &&
        loading_SubRg.windowsEvent
      ) {
        apiCalls(value);
      }
    } else if (value === 1) {
      if (
        loading_SubRg.serverCpuUtilization &&
        loading_SubRg.serverMemoryUtilizationLogs
      ) {
        apiCalls(value);
      }
    }
  };
  const handleFilterChange_SubRg = async (event, value, key) => {
    console.log(value)
    setFilterOptions_SubRg((prevOptions) => ({
      ...prevOptions,
      [key]: value,
    })); 
  };
  const apiCalls = async (tabValue) => {
    await fetchSubscriptionData(-1, 10); 
  };
  const handleFilterDisplayed = (e) => {
    e.preventDefault();
    setFilterChoiceSwitchButtton(e.target.checked);
  };
  const buttonStyles = {
    padding: '2px 4px', 
    minWidth: 'auto', 
    fontSize: '0.75rem', 
  };
  const handleGetDataButtonClick = (e) => {
    e.preventDefault();
    if (!filterChoiceSwitchButtton) {
      setLoading({
        serverList: true,
        serverEnvironment: true,
        windowsEvent: true,
        rebootEvent: true,
        rebootEventLogs: true,
      });
      apiCalls(tabChange);
    } else {
      setLoading_SubRg({
        serverList: true,
        serverEnvironment: true,
        windowsEvent: true,
        rebootEvent: true,
      });
      apiCalls(tabChange);
    }
  };

  useEffect(() => {}, []);
   const options ={
    "enterprise-clinical-apps-prod-01":"ab16a144-47d7-45c5-bcb7-8affc988f8e0",
    "enterprise-clinical-apps-prod-02":"9592c342-d1fb-477e-8e91-ad39bf00933b",
    "enterprise-clinical-apps-prod-03":"5467bf57-48b4-4930-b3cb-bf039b259d04",
    "enterprise-clinical-apps-prod-04":"343a7ee0-5081-4024-82fc-498ee61867a9",
    "enterprise-clinical-apps-test-01":"6d590d81-bab9-4b9a-b011-090467b5a9a4",
   }
  useEffect(() => {
    setFilterData({});
    setFilterOptions_SubRg({
      subRg: ['All'],
      resourceType: ['Virtual Machines'],
    });
  }, []);
  useEffect(() => {
    if ( 
      filterOptions_SubRg.subRg[0] === 'All'  &&
      filterOptions_SubRg.resourceType[0] === 'Virtual Machines'
    )
     {
      if (tabChange === 0 && Object.keys(serverList).length === 0) {
        setLoading_SubRg({
          serverList: true,
          serverEnvironment: true,
          windowsEvent: true,
          rebootEvent: true,
        });
        apiCalls(tabChange);
      } else if (
        tabChange === 1 
        
      ) {
        setLoading_SubRg({
          serverList: true,
          serverEnvironment: true,
          windowsEvent: true,
          rebootEvent: true,
        });
        apiCalls(tabChange);
      }
    }
  }, [filterOptions_SubRg]);
  useEffect(() => {
    if (
      
      filterChoiceSwitchButtton
    ) {
      apiCalls(tabChange);
    }
  }, [filterChoiceSwitchButtton]);

  function TagComplianceTable(props) {
    var {complianceInfo} = props
    var count = 0
    if(complianceData!=null){
      count = Object.keys(complianceData).length>0 ?  Object.keys(complianceData["name"]).length: 0
    }
    //console.log("In Server Inventory")
    //console.log(typeof complianceData["name"])
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
  
    const handleChangePage = (event, newPage) => {
      setPage(newPage);
    };
    const handleChangeRowsPerPage = (event) => {
      setRowsPerPage(event.target.value);
      setPage(0);
    };

    return (
      // <Paper sx={{ width: '100%', overflow: 'hidden' }} p={2}>
      //   <Card variant="outlined" sx={{ backgroundColor: '#f0efef', borderRadius: 10, marginTop: 2, marginBottom: 2 }}>
          <Grid xs={12} p={2} sx={{borderRadius:5 , backgroundColor:"white"}}>
          <TableContainer>
            <Table stickyHeader aria-label="collapsible table">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ backgroundColor: '#dbe4f7' }}>
                    <Typography variant="h6" gutterBottom sx={{ textAlign: 'center' }}>Resource Name</Typography>
                  </TableCell>
                  <TableCell sx={{ backgroundColor: '#dbe4f7' }}>
                    <Typography variant="h6" gutterBottom sx={{ textAlign: 'center' }}>Application ID</Typography>
                  </TableCell>
                  <TableCell sx={{ backgroundColor: '#dbe4f7' }}>
                    <Typography variant="h6" gutterBottom sx={{ textAlign: 'center' }}>Support Group</Typography>
                  </TableCell>
                  <TableCell sx={{ backgroundColor: '#dbe4f7' }}>
                    <Typography variant="h6" gutterBottom sx={{ textAlign: 'center' }}>Cost Center Tag</Typography>
                  </TableCell>
                  <TableCell sx={{ backgroundColor: '#dbe4f7' }}>
                    <Typography variant="h6" gutterBottom sx={{ textAlign: 'center' }}>App Family</Typography>
                  </TableCell>
                  <TableCell sx={{ backgroundColor: '#dbe4f7' }}>
                    <Typography variant="h6" gutterBottom sx={{ textAlign: 'center' }}>Application CI</Typography>
                  </TableCell>
                  <TableCell sx={{ backgroundColor: '#dbe4f7' }}>
                    <Typography variant="h6" gutterBottom sx={{ textAlign: 'center' }}>Backup Type</Typography>
                  </TableCell>
                  <TableCell sx={{ backgroundColor: '#dbe4f7' }}>
                    <Typography variant="h6" gutterBottom sx={{ textAlign: 'center' }}>Maintenance Status</Typography>
                  </TableCell>
                  <TableCell sx={{ backgroundColor: '#dbe4f7' }}>
                    <Typography variant="h6" gutterBottom sx={{ textAlign: 'center' }}>Maintenance Window</Typography>
                  </TableCell>
                  <TableCell sx={{ backgroundColor: '#dbe4f7' }}>
                    <Typography variant="h6" gutterBottom sx={{ textAlign: 'center' }}>Managed By Group</Typography>
                  </TableCell>
                  <TableCell sx={{ backgroundColor: '#dbe4f7' }}>
                    <Typography variant="h6" gutterBottom sx={{ textAlign: 'center' }}>Environment Tag</Typography>
                  </TableCell>
                  <TableCell sx={{ backgroundColor: '#dbe4f7' }}></TableCell>
                  <TableCell sx={{ backgroundColor: '#dbe4f7' }}></TableCell>
                </TableRow>
              </TableHead>
              
              <TableBody style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {Object.keys(complianceData).length > 0 ? (
                  Object.keys(complianceData["name"]).slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((ind) => (
                    <TableRow key={ind} sx={{ '& > *': { borderBottom: '6px solid #fbfcfd', paddingTop: '4px', paddingBottom: '2px'} }}>                   
                      <TableCell sx={{ textAlign: 'center' }}>
                        <Typography variant="subtitle2" gutterBottom component="div">
                          {complianceData["name"][parseInt(ind)]}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ textAlign: 'center', bgcolor: getBackgroundColor('applicationId', complianceData["applicationId"][parseInt(ind)]) }}>
                        <Typography variant="subtitle2" gutterBottom component="div">
                          {complianceData["applicationId"][parseInt(ind)]}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ textAlign: 'center', bgcolor: getBackgroundColor('supportGroup', complianceData["supportGroup"][parseInt(ind)]) }}>
                        <Typography variant="subtitle2" gutterBottom component="div">
                          {complianceData["supportGroup"][parseInt(ind)]}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ textAlign: 'center', bgcolor: getBackgroundColor('costCenter', complianceData["costCenter"][parseInt(ind)]) }}>
                        <Typography variant="subtitle2" gutterBottom component="div">
                          {complianceData["costCenter"][parseInt(ind)]}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ textAlign: 'center', bgcolor: getBackgroundColor('appFamily', complianceData["appFamily"][parseInt(ind)]) }}>
                        <Typography variant="subtitle2" gutterBottom component="div">
                          {complianceData["appFamily"][parseInt(ind)]}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ textAlign: 'center', bgcolor: getBackgroundColor('applicationCI', complianceData["applicationCI"][parseInt(ind)]) }}>
                        <Typography variant="subtitle2" gutterBottom component="div">
                          {complianceData["applicationCI"][parseInt(ind)]}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ textAlign: 'center', bgcolor: getBackgroundColor('backupType', complianceData["backupType"][parseInt(ind)]) }}>
                        <Typography variant="subtitle2" gutterBottom component="div">
                          {complianceData["backupType"][parseInt(ind)]}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ textAlign: 'center', bgcolor: getBackgroundColor('maintenanceStatus', complianceData["maintenanceStatus"][parseInt(ind)]) }}>
                        <Typography variant="subtitle2" gutterBottom component="div">
                          {complianceData["maintenanceStatus"][parseInt(ind)]}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ textAlign: 'center', bgcolor: getBackgroundColor('maintenanceWindow', complianceData["maintenanceWindow"][parseInt(ind)]) }}>
                        <Typography variant="subtitle2" gutterBottom component="div">
                          {complianceData["maintenanceWindow"][parseInt(ind)]}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ textAlign: 'center', bgcolor: getBackgroundColor('managedBy', complianceData["managedBy"][parseInt(ind)]) }}>
                        <Typography variant="subtitle2" gutterBottom component="div">
                          {complianceData["managedBy"][parseInt(ind)]}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ textAlign: 'center', bgcolor: getBackgroundColor('environment', complianceData["environment"][parseInt(ind)]) }}>
                        <Typography variant="subtitle2" gutterBottom component="div">
                          {complianceData["environment"][parseInt(ind)]}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Button onClick={() => raiseAdoTicket(complianceData, parseInt(ind))}  variant="contained" color="primary" style={buttonStyles}>
                          ADO Ticket
                        </Button>
                      </TableCell>
                      <TableCell>
                        <PopupButton rowData={complianceData} index ={parseInt(ind)} color={getCompliantStatus(complianceData, ind)}/>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow key={1}>
                    <TableCell colSpan={6} align="center">
                      <Typography variant="subtitle2" gutterBottom component="div">
                        No data available
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
              rowsPerPageOptions={[10,20]}
              component="div"
              count={count}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
          />
          </Grid>
      //   </Card>
      // </Paper>
    );
  }
    return (
      <Grid container m={2} p={2}>
        {filterChoiceSwitchButtton?     
          <Grid container>
            <Grid item md={12} m={0}>
              <Typography variant="h6" className="fst-italic">
                Tag Compliance
              </Typography>
            </Grid>
            <Grid item md={12}>
              <LinearProgress/>
            </Grid>
          </Grid>
        :
          // <Grid container>
          //   <Grid item md={12} m={0}>           
          //     <Divider>
          //       <Typography variant="h6" className="fst-italic">
          //         Tag Compliance
          //       </Typography>
          //     </Divider>
          //   </Grid>
          // </Grid>
          ""
        }
        {/* <Grid item md={12} m={2}>
          <Tabs value={tabChange} onChange={handleTabChange} centered>
            <Tab label="Compliance Inventory" />
          </Tabs>
        </Grid> */}
        <Grid item md={12} m={1} container key="filter" alignItems="center" justifyContent="center">
          <Grid item md={1}>
            <Switch
              checked={filterChoiceSwitchButtton}
              onChange={handleFilterDisplayed}
              inputProps={{ 'aria-label': 'controlled' }}
              disabled
            />
          </Grid>
          {filterChoiceSwitchButtton ? (          
            <Grid container spacing={2}></Grid>

           ) : (  

            <Grid container md={8} m={2} alignItems="center" justifyContent="center">  
              <Grid item md={4} m={2}>            
              <Autocomplete
                multiple
                id="tags-standard"
                options={Object.keys(options)}  
                getOptionLabel={(key) => key}
                onChange={(event, value) => handleFilterChange_SubRg(event, value, 'subRg')}
                defaultValue={filterOptions_SubRg["subRg"][0]!="All"?filterOptions["subRg"]:[]}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    variant="standard"
                    label="Subscription/RG"
                    placeholder=""
                  />
                )}
              />
              </Grid>
              <Grid item md={3} m={2}>
                <Autocomplete
                  id="tags-standard"
                  options={[...new Set(Object.values(filterData_SubRg["resourceType"]))]}
                  getOptionLabel={(key) => key}
                  onChange={(event, value) => handleFilterChange_SubRg(event, value, 'resourceType')}
                  defaultValue={filterOptions_SubRg.resourceType[0] !== 'All' ? filterOptions_SubRg.resourceType : []}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      variant="standard"
                      label="Resource Type"
                      placeholder=""
                    />
                  )}
                />
              </Grid>
            </Grid>
          )}
            <Grid item md={2}>
              <Button variant="outlined" color="primary" onClick={(e)=>{handleGetDataButtonClick(e)}} startIcon={<SendIcon />}>
                Get Data
              </Button>
            </Grid>
        </Grid>
        
        {tabChange==0 ? 
          <Grid container >
            <Grid container alignItems="center" justifyContent="center"></Grid>
            <Grid container m={2} alignItems="center" justifyContent="center">
              <TagComplianceTable complianceInfo = {complianceData}/>
            </Grid>          
          </Grid> 
          : 
          (tabChange==1 ?
            (!filterChoiceSwitchButtton ? 
            <Grid md={12}>             
            </Grid> : 
            <Grid md={12}>         
            </Grid>
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
