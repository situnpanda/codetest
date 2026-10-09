import React, {useEffect} from 'react';
import PropTypes from 'prop-types';
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import TablePagination from '@mui/material/TablePagination';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import Grid from '@mui/material/Unstable_Grid2';
import 'bootstrap/dist/css/bootstrap.min.css';
import "bootstrap/dist/js/bootstrap.bundle.min";
import { useState } from 'react';
import Tooltip from '@mui/material/Tooltip';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import CardMedia from '@mui/material/CardMedia';
import CardContent from '@mui/material/CardContent';
import CardActions from '@mui/material/CardActions';
import LinearProgress from '@mui/material/LinearProgress';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import { getUrl } from '../../../environment';


function RowDowntimeTable(props){
  var [open, setOpen] = useState(false);
  var {row} = props;
  return(
    <React.Fragment>
      <TableRow sx={{ '& > *': { borderBottom: 'unset' } }}>
        <TableCell>
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
        </TableCell>
        <TableCell  sx={{ textAlign:'center'}}>
          <Typography variant="subtitle2" gutterBottom component="div">
            {row.AppCI}
          </Typography>
        </TableCell>
        <TableCell component="th" scope="row" sx={{ textAlign:'center'}}>
          <Typography variant="subtitle2" gutterBottom component="div">
            {row.ItemNumber}
          </Typography>
        </TableCell>
        <TableCell sx={{ textAlign:'center'}}>
          <Typography variant="subtitle2" gutterBottom component="div">
            {row.Status}
          </Typography>  
        </TableCell>
        <TableCell sx={{ textAlign:'center'}}>
          <Typography variant="subtitle2" gutterBottom component="div">
            {row.StartTime}
          </Typography>  
        </TableCell>
      </TableRow>
      {/* Collapse icon UI code */}
      <TableRow>
        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={6}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            {row.history.map((historyRow) => (
              <Box sx={{ margin: 1 }}>
                <List>
                  <ListItem>
                    <ListItemText primary="Description" secondary={historyRow.Description} />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary="End Time" secondary={historyRow.EndTime} />
                  </ListItem>
                </List>
              </Box>
            ))}
          </Collapse>
        </TableCell>
      </TableRow>
    </React.Fragment>
  )
}


function createData(AppCI, ItemNumber, Status, StartTime, Description, EndTime) {
  return {
    AppCI,
    ItemNumber,
    Status,
    StartTime,
    history: [
      {
        Description: Description,
        EndTime: EndTime
      }
    ],
  };
}

function LandingPage() {

  var baseUrl = getUrl()
  var [outageRows, setOutageRows] = useState([])
  var [hospitalRows, setHospitalRows] = useState({})
  var [loading, setLoading] = useState(0)
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(2);
  var [outageAppCIfilter, setoutageAppCIfilter] = useState([])
  var [outageStatusfilter, setoutageStatusfilter] = useState([])
  var [outageNumberfilter, setoutageNumberfilter] = useState([])
  var [outageAppCIfilter, setoutageAppCIfilter] = useState([])
  
  useEffect(()=>{
    fetchFilterData()
    setOutageRows([])
    setPage(0)
    setRowsPerPage(2)
    
    fetchMiData(-1,10,"no","yes");
    fetchChangeRequestData();
    fetchHospitalListData();
  },[])

  useEffect(()=>{
    const updatedArray = removeDuplicatesInOutageRows()
    setOutageRows(updatedArray)
  },[outageRows])

  useEffect(()=>{
    console.log(loading)
  },[loading])

  var fetchFilterData = () => {
    var params = {
      "appFamily": [
        "Mosaiq", "ARIA", "OBIX"
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
    //console.log("hello")
    var url = new URL(baseUrl + 'filters');
    url.search = new URLSearchParams(params).toString();
    //console.log(url);
    fetch(url,{
      method:'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params)
    })
      .then((response) => response.json())
      .then((data) =>{ 
        //setFilterData(data)
        console.log("Filter Data:")
        console.log(data)
      })
      .catch((error) => console.error('Error:', error));
  };

  const removeDuplicatesInOutageRows = () => {
    const uniqueKeys = new Set();
    return outageRows.filter(obj => {
      if (!uniqueKeys.has(obj["ItemNumber"])) {
        uniqueKeys.add(obj["ItemNumber"]);
        return true;
      }
      return false;
    });
  };

  const addItemToArray = (row) => {
    setOutageRows((prevOutageRows)=>[...prevOutageRows,row]);
  };

  const fetchMiData = (page, limit, aggregate, miBool) => {
    
    setLoading(prevLoading=>prevLoading+1)
    
    var params = {
      page: page,
      limit: limit,
      aggregate: aggregate,
      miBool: miBool
    };
    var url = new URL(baseUrl + 'incidentLogs');
    url.search = new URLSearchParams(params).toString();
    //console.log(url);
    fetch(url)
      .then((response) => response.json())
      .then((data) => {
        var incidents = JSON.parse(data["Data"])
        //console.log(changeRequest)
        for(var i=0;i<Object.keys(incidents["Number"]).length;i++){
          var row = createData(incidents["AppCI"][i],incidents["Number"][i], incidents["Status"][i], incidents["StartDateTime"][i], incidents["ShortDescription"][i], incidents["EndDateTime"][i])
          console.log(row);
          addItemToArray(row);
        }
        console.log("MiFetch:")
        setLoading(prevLoading=>prevLoading-1)
      })
      .catch((error) => {
        console.log("MiFetch:")
        //console.error('Error:', error)
        setLoading(prevLoading=>prevLoading-1)
      });
  };
  
  const fetchChangeRequestData = () => {
    setLoading(prevLoading=>prevLoading+1)

    var params = {
      
    };
    var url = new URL(baseUrl + 'changeRequestLogs');
    url.search = new URLSearchParams(params).toString();
    //console.log(url);
    fetch(url)
      .then((response) => response.json())
      .then((data) => {
        var changeRequest = JSON.parse(data["Data"])
        for(var i=0;i<Object.keys(changeRequest["Number"]).length;i++){
          var row = createData(changeRequest["AppCI"][i],changeRequest["Number"][i], changeRequest["Status"][i], changeRequest["StartDateTime"][i], changeRequest["ShortDescription"][i], changeRequest["EndDateTime"][i])
          console.log("In ChangeRequests")
          addItemToArray(row); 
        }
        console.log("CHFetch:")
        setLoading(prevLoading=>prevLoading-1)
      })
      .catch((error) => {
        console.log("CHFetch:")
        //console.error('Error:', error)
        setLoading(prevLoading=>prevLoading-1)
      });
  };

  const fetchHospitalListData = () => {
    setLoading(prevLoading=>prevLoading+1)

    var params = {
      
    };
    var url = new URL(baseUrl + 'hospitalList');
    url.search = new URLSearchParams(params).toString();
    //console.log(url);
    fetch(url)
      .then((response) => response.json())
      .then((data) => {
        //setLoading(false)
        var hospitalList_data = JSON.parse(data["Data"])        
        var regionToHospital={}
        for(var i=0;i<Object.keys(hospitalList_data["Region"]).length;i++){
          if(hospitalList_data["Region"][i] in regionToHospital){
            regionToHospital[hospitalList_data["Region"][i]].push(hospitalList_data["SiteCode"][i])
          }
          else{
            regionToHospital[hospitalList_data["Region"][i]]=[hospitalList_data["SiteCode"][i]]
          }
        }
        setHospitalRows(regionToHospital);
        console.log("HosListFetch:")
        setLoading(prevLoading=>prevLoading-1)
      })
      .catch((error) =>{
        console.log("HosListFetch:")
        setLoading(prevLoading=>prevLoading-1)
        console.error('Error:', error)});
  }

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    console.log(event.target.value)
    setRowsPerPage(event.target.value);
    setPage(0);
  };

  const handleOutageAppCiFilter = (event, newValueFilter)=>{
    
    console.log("In outage Handle")
    var inputParam = event.target.id
    console.log(inputParam)
    console.log(newValueFilter)
    setoutageAppCIfilter(newValueFilter)
    setRowsPerPage(rowsPerPage)
    setPage(0)
  }

  const handleOutageNumberFilter = (event, newValueFilter)=>{
    console.log("In outage Handle Number")
    var inputParam = event.target.id
    console.log(inputParam)
    console.log(newValueFilter)
    setoutageNumberfilter(newValueFilter)
    setRowsPerPage(rowsPerPage)
    setPage(0)
    //console.log(newValueFilter)
  }

  const handleOutageStatusFilter = (event, newValueFilter)=>{
    console.log("In outage Handle Status")
    var inputParam = event.target.id
    console.log(inputParam)
    console.log(newValueFilter)
    setoutageStatusfilter(newValueFilter)
    setRowsPerPage(rowsPerPage)
    setPage(0)
    //console.log(newValueFilter)
  }

    return (
      <Grid container>
        {loading==0 ? 
          <Grid container md={12}>
            <Grid md={12} m={0}>
              <Divider>
                <Typography variant="h6" className="fst-italic">
                  Home Page
                </Typography>
              </Divider>
            </Grid>
          </Grid>
        :
          <Grid container md={12}>
            <Grid md={12} m={0}>
              <Typography variant="h6" className="fst-italic">
                Home Page
              </Typography>
            </Grid>
            <Grid md={12}>
              <LinearProgress/>
            </Grid>
          </Grid>
        }
        

        <Grid container md={12} m={3}>
          <Grid container md={5} alignItems="center" justifyContent="center">
              <Grid md={5}>
                <Card sx={{ border:"2px solid red", borderRadius:"20px"}}>
                  <CardHeader title="Apps Critical" sx={{textAlign:"center"}}/>
                    <CardContent>
                      <Typography variant="h2" color="text.secondary" sx={{textAlign:"center"}} className="fw-bold text-danger">
                        6
                      </Typography>
                    </CardContent>
                </Card>
              </Grid>
              <Grid md={1}>

              </Grid>
              <Grid md={5}>
                <Card sx={{ border:"2px solid green", borderRadius:"20px"}}>
                  <CardHeader title="Apps Healthy" sx={{textAlign:'center'}}/>
                    <CardContent>
                      <Typography variant="h2" color="text.secondary" sx={{textAlign:"center"}}  className="fw-bold text-success p-0 m-0">
                        4
                      </Typography>
                    </CardContent>
                </Card>
              </Grid>
            </Grid>
          
          <Grid md={7} p={1}>
            <Paper sx={{ width: '100%', overflow: 'hidden' }}>
              <TableContainer>
                <Table stickyHeader aria-label="collapsible table">
                  <TableHead>
                    <TableRow>
                      <TableCell/>

                      <TableCell>
                        <Typography variant="h6" gutterBottom sx={{ textAlign:'center'}}>
                            Application CI
                        </Typography>
                        <Autocomplete
                          multiple
                          id="AppCI"
                          options={[...new Set(outageRows.map(obj => obj.AppCI))]}
                          getOptionLabel={(option) => option}
                          
                          // defaultValue={[]}
                          onChange={handleOutageAppCiFilter}
                          onInputChange={handleOutageAppCiFilter}
                          renderInput={(params) => (
                            <TextField
                              {...params}
                              variant="standard"
                              label= "Search App CI"
                              placeholder=""
                              
                            />
                          )}
                        />

                      </TableCell>
                      <TableCell>
                        <Typography variant="h6" gutterBottom sx={{ textAlign:'center'}}>
                            CH Request / MI
                        </Typography>
                        <Autocomplete
                          multiple
                          id="Number"
                          onChange={handleOutageNumberFilter}
                          onInputChange={handleOutageNumberFilter}
                          options={[...new Set(outageRows.map(obj => obj.ItemNumber))]}
                          getOptionLabel={(option) => option}
                          // defaultValue={[]}
                          renderInput={(params) => (
                            <TextField
                              {...params}
                              variant="standard"
                              label= "Search CH/MI"
                              placeholder=""
                            />
                          )}  
                        />

                      </TableCell>
                      <TableCell>
                        <Typography variant="h6" gutterBottom sx={{ textAlign:'center'}}>
                            Current Status
                        </Typography>
                        <Autocomplete
                          multiple
                          id="Status"
                          onChange={handleOutageStatusFilter}
                          onInputChange={handleOutageStatusFilter}
                          options={[...new Set(outageRows.map(obj => obj.Status))]}
                          getOptionLabel={(option) => option}
                          // defaultValue={[]}
                          renderInput={(params) => (
                            <TextField
                              {...params}
                              variant="standard"
                              label= "Search Status"
                              placeholder=""
                            />
                          )}  
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="h6" gutterBottom sx={{ textAlign:'center'}}>
                            Downtime From
                        </Typography>
                        {/* <Autocomplete
                          multiple
                          id="tags-standard"
                          options={outageRows.map(obj => obj.AppCI)}
                          getOptionLabel={(option) => option}
                          // defaultValue={[]}
                          renderInput={(params) => (
                            <TextField
                              {...params}
                              variant="standard"
                              label= "Search App CI"
                              placeholder=""
                            />
                          )}  
                        /> */}
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {outageRows.filter((item)=>((outageAppCIfilter.includes(item.AppCI) || outageAppCIfilter.length==0) && (outageStatusfilter.includes(item.Status) || outageStatusfilter.length==0) && (outageNumberfilter.includes(item.ItemNumber) || outageNumberfilter.length==0)))
                    .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((row) => (
                      <RowDowntimeTable key={row.ItemNumber} row={row} />
                    ))}
                  </TableBody>
                </Table>
                
              </TableContainer>
              <TablePagination
                  rowsPerPageOptions={[2,5]}
                  component="div"
                  count={outageRows.filter((item)=>((outageAppCIfilter.includes(item.AppCI) || outageAppCIfilter.length==0) && (outageStatusfilter.includes(item.Status) || outageStatusfilter.length==0) && (outageNumberfilter.includes(item.ItemNumber) || outageNumberfilter.length==0))).length}
                  rowsPerPage={rowsPerPage}
                  page={page}
                  onPageChange={handleChangePage}
                  onRowsPerPageChange={handleChangeRowsPerPage}
              />
            </Paper>
          </Grid>
        </Grid>
        <Grid container>
          <Grid md={12} m={2}>
            <TableContainer component={Paper}>
              <Table >
                <TableBody>
                  {Object.keys(hospitalRows).map((key)=>(
                    <TableRow sx={{width:"500px"}}>
                      <TableCell>
                        <Typography variant="h6">
                          {key}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <TableRow>
                          <TableCell>Hospital Name</TableCell>
                          {hospitalRows[key].map((val)=>(
                            <TableCell>{val}</TableCell>
                          ))}
                        </TableRow>
                        <Divider/>
                        <TableRow>
                          Hospital Status
                        </TableRow>
                      </TableCell>
                      {/* {hospitalRows[key].map((val)=>(
                        <TableCell key={val}>{val}</TableCell>
                      ))} */}
                      
                        {/* {hospitalsData.map((hospital, index) => (
                          <TableCell key={index}>
                          <div
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: '50%',
                              backgroundColor: hospital.isHealthy ? 'green' : 'red',
                            }} 
                          />
                          </TableCell>
                        ))} */}
                  </TableRow>
                  ))}
                  
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>
        </Grid>
      </Grid>
    )
}

export default LandingPage