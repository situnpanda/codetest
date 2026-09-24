import React, { useEffect, useState } from 'react'
import Grid from '@mui/material/Unstable_Grid2';
import { Modal, Card, CardContent, Typography, Box, Accordion, AccordionSummary, AccordionDetails, Divider, Button, TextField, ButtonGroup, Autocomplete } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { styled } from '@mui/material/styles';
import {useLocation} from 'react-router-dom'
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell,{ tableCellClasses } from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import PriorityHighOutlinedIcon from '@mui/icons-material/PriorityHighOutlined';
import LinearProgress from '@mui/material/LinearProgress';
import CircularProgress from '@mui/material/CircularProgress';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import Pagination from '@mui/material/Pagination';
import AreaLineChart from '../../shared/LineChart/AreaLineChart';
import ReactSpeedometer from 'react-d3-speedometer/slim'
import Alert from '@mui/material/Alert';
const AppName = "NETWORK STATUS";
const modalHeader = "Modal Header"; // Set a dummy modal header
const modalOpen = false; // Initially keep modal closed

const avail = [
    { name: "2024-08-01", Port1: 80, Port2: 65 },
    { name: "2024-08-02", Port1: 80, Port2: 54 },
    { name: "2024-08-03", Port1: 80, Port2: 75 },
    { name: "2024-08-04", Port1: 80, Port2: 71 },
    { name: "2024-08-05", Port1: 80, Port2: 78 }
];
const availl = [
    { name: "2024-08-01", ServerA: 80 },
    { name: "2024-08-02", ServerA: 80 },
    { name: "2024-08-03", ServerA: 80 },
    { name: "2024-08-04", ServerA: 80 },
    { name: "2024-08-05", ServerA: 80 }
];
const dummyCpuUtilizationAvg = 65;

const fetchDummyData = () => {
    return {
        uptime: "90",
        serverStatus: { up: 3, down: 2 },
        patchCompliance: { compliant: 5, nonCompliant: 3 },
        tagCompliance: { compliant: 8, nonCompliant: 2 },
        cpuUsage: 75,
        memoryUsage: 60,
        diskUsage: 50,
    };
};

const DummyUINetwork = () => {
    const [serverData, setServerData] = useState(fetchDummyData());

    const createModal = (title, type, status) => {
        // Modal creation logic
        console.log(`Creating modal with title: ${title}, type: ${type}, status: ${status}`);
    };

    return (
        <Grid container m={4} p={2} justifyContent='center' alignItems='center' sx={{ borderRadius: 10, backgroundColor: 'white' }}>
            <Modal
                open={modalOpen}
                onClose={() => console.log("Modal closed")}
                aria-labelledby="parent-modal-title"
                aria-describedby="parent-modal-description"
                sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    opacity: '0.90'
                }}
            >
                <Box sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    border: 2,
                    backgroundColor: 'white',
                    flexDirection: 'column',
                    gap: 2
                }}
                    p={2}
                >
                    <Typography variant='h4'><i>{modalHeader}</i></Typography>
                    {/* Placeholder for modal table */}
                    <Typography variant='body'>This is a dummy modal content</Typography>
                </Box>
            </Modal>

            <Grid xs={12} p={2}>
                <Typography variant="h5" underline="always">{AppName.toUpperCase()}</Typography>
            </Grid>
            <Grid container xs={12} justifyContent='center' key="Server Overview" p={2} m={2} sx={{ borderRadius: 5, backgroundColor: 'whiteSmoke' }}>
                <Grid container xs={12} m={0.25}>
                    <Typography variant="h6"> Overview </Typography>
                </Grid>
                <Grid container xs={12} md={3} lg={3} m={0.25} p={1} sx={{ backgroundColor: "white" }}>
                    <Grid container xs={12} justifyContent='center' alignItems='center'>
                        <Typography variant="body"> Gateways </Typography>
                    </Grid>
                    <Grid container xs={12} pt={2} justifyContent='center' alignItems='center'>
                        <Grid container xs={5} justifyContent='center' alignItems='center'>
                            <Typography variant="h3" sx={{ color: 'green', cursor: 'pointer', '&:hover': { transform: 'scale(1.1)' } }}> {serverData.uptime} </Typography>
                        </Grid>
                    </Grid>
                </Grid>
                <Grid container xs={12} md={3} lg={3} m={0.25} p={1} sx={{ backgroundColor: "white" }}>
                    <Grid container xs={12} justifyContent='center' alignItems='center'>
                        <Typography variant="body"> Latency </Typography>
                    </Grid>
                    <Grid container xs={12} pt={2} justifyContent='center' alignItems='center'>
                        <Grid container xs={5} justifyContent='center' alignItems='center'>
                            <Typography variant="h3" sx={{ color: 'green', cursor: 'pointer', '&:hover': { transform: 'scale(1.1)' } }} onClick={() => createModal("Servers Up", "Server Status", "up")}> {serverData.serverStatus.up} </Typography>
                        </Grid>
                    </Grid>
                </Grid>
                <Grid container xs={12} md={3} lg={3} m={0.25} p={1} sx={{ backgroundColor: "white" }}>
                    <Grid container xs={12} justifyContent='center' alignItems='center'>
                        <Typography variant="body"> Throughput </Typography>
                    </Grid>
                    <Grid container xs={12} pt={2} justifyContent='center' alignItems='center'>
                        <Grid container xs={5} justifyContent='center' alignItems='center'>
                            <Typography variant="h3" sx={{ color: 'green', cursor: 'pointer', '&:hover': { transform: 'scale(1.1)' } }}> {serverData.tagCompliance.compliant} </Typography>
                        </Grid>
                    </Grid>
                </Grid>
                <Grid container xs={12} m={0.25}>
                    <Typography variant="h6"> Port Health </Typography>
                </Grid>
                <Grid container xs={12} md={3} lg={3} m={0.25} p={1} sx={{ backgroundColor: "white" }}>
                    <Grid container xs={12} justifyContent='center' alignItems='center'>
                        <Typography variant="body"> Critical </Typography>
                    </Grid>
                    <Grid container xs={12} pt={2} justifyContent='center' alignItems='center'>
                        <Grid container xs={5} justifyContent='center' alignItems='center'>
                            <Typography variant="h3" sx={{ color: 'green', cursor: 'pointer', '&:hover': { transform: 'scale(1.1)' } }}> {serverData.tagCompliance.compliant} </Typography>
                        </Grid>
                    </Grid>
                </Grid>
                <Grid container xs={12} md={3} lg={3} m={0.25} p={1} sx={{ backgroundColor: "white" }}>
                    <Grid container xs={12} justifyContent='center' alignItems='center'>
                        <Typography variant="body"> Warning </Typography>
                    </Grid>
                    <Grid container xs={12} pt={2} justifyContent='center' alignItems='center'>
                        <Grid container xs={5} justifyContent='center' alignItems='center'>
                            <Typography variant="h3" sx={{ color: 'green', cursor: 'pointer', '&:hover': { transform: 'scale(1.1)' } }}> {serverData.tagCompliance.compliant} </Typography>
                        </Grid>
                    </Grid>
                </Grid>
                <Grid container xs={12} md={3} lg={3} m={0.25} p={1} sx={{ backgroundColor: "white" }}>
                    <Grid container xs={12} justifyContent='center' alignItems='center'>
                        <Typography variant="body"> Packet Count </Typography>
                    </Grid>
                    <Grid container xs={12} pt={2} justifyContent='center' alignItems='center'>
                        <Grid container xs={5} justifyContent='center' alignItems='center'>
                            <Typography variant="h3" sx={{ color: 'green', cursor: 'pointer', '&:hover': { transform: 'scale(1.1)' } }}> {serverData.tagCompliance.compliant} </Typography>
                        </Grid>
                    </Grid>
                </Grid>
                                
            </Grid>
            <Grid container xs={12} justifyContent='center' key="Server Utilization Graph" p={3} m={2} sx={{ borderRadius: 5, backgroundColor: 'whiteSmoke' }}>
                <Grid container xs={12} m={0.25}>
                    <Typography variant="h6">Availability</Typography>
                </Grid>
                <Grid container p={2} xs={12} m={0.25} justifyContent='center' sx={{ backgroundColor: "white" }}>
                    <Grid container md={12} lg={12} p={1} justifyContent='center'>
                        <Typography variant="h6">Ports</Typography>
                        <AreaLineChart type="memory" data={avail} key={"memory"} />
                    </Grid>
                </Grid>
            </Grid>
            <Grid container xs={12} justifyContent='center' key="Server Utilization Graph" p={3} m={2} sx={{ borderRadius: 5, backgroundColor: 'whiteSmoke' }}>
                <Grid container xs={12} m={0.25}>
                    <Typography variant="h6">Availability</Typography>
                </Grid>
                <Grid container p={2} xs={12} m={0.25} justifyContent='center' sx={{ backgroundColor: "white" }}>
                    <Grid container md={12} lg={12} p={1} justifyContent='center'>
                        <Typography variant="h6">Latencies</Typography>
                        <AreaLineChart type="memory" data={avail} key={"memory"} />
                    </Grid>
                </Grid>
            </Grid>
        </Grid>
    );
};

export default DummyUINetwork;
