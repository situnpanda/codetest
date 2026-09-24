import React, {useEffect,useState} from 'react'
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import IconButton from '@mui/material/IconButton';
import Badge from '@mui/material/Badge';
import { fetchEarlyWarnings,fetchWarningEvents } from '../../shared/APIs/fetchAPIs';
import { Menu, MenuItem, Card, CardContent, Typography, Grid, Box, Button, Divider, Table, TableBody, TableCell, tableCellClasses, TableContainer, TableHead, TableRow, Paper, Accordion, AccordionSummary, AccordionDetails, Dialog, DialogTitle, DialogContent, DialogActions, Collapse, TablePagination, TextField, Autocomplete, Chip, Tooltip } from '@mui/material';
import { convertTimeToPreferredTZ_fromUtc } from '../../shared/Timestamp/PreferenceConversion';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { styled } from '@mui/material/styles';
import {getUrl} from "../../../environment"

var baseUrl = getUrl()

const StyledTableCell = styled(TableCell)(({ theme }) => ({
    [`&.${tableCellClasses.head}`]: {
        backgroundColor: "rgb(46, 51, 71)",
        color: theme.palette.common.white,
        fontWeight:'bold'
    },
    [`&.${tableCellClasses.body}`]: {
        fontSize: 14,
    },
}));

const StyledTableRow = styled(TableRow)(({ theme }) => ({
    '&:nth-of-type(odd)': {
        backgroundColor: theme.palette.action.hover,
    },
    // hide last border
    '&:last-child td, &:last-child th': {
        border: 0,
    },
}));

export default function ChatOpsHeader({ backendSessionToken, supportGroup, preferredTZ }) {
    var [notificationCount, setNotificationCount] = useState(0);
    var [error, setError] = useState({});
    var [notificationsList, setNotificationsList] = useState([]);
    var [warningEvents, setWarningEvents] = useState([]);
    const [anchorEl, setAnchorEl] = useState(null);
    const [open, setOpen] = useState(false);
    const [applicationFamilyFilter, setApplicationFamilyFilter] = useState('');
    const [idFilter, setIdFilter] = useState('');

    const handleMenu = (event) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    const handleOpenDialog = (filterId = '') => {
        setIdFilter(filterId);
        if (filterId === '') {
            setApplicationFamilyFilter('');
        }
        setOpen(true);
        handleClose();
    };

    const handleCloseDialog = () => {
        setOpen(false);
    };

    useEffect(()=>{
        var filters = localStorage.getItem("chatOpsViewAllWarningFilters") || null;
        var isOpen = sessionStorage.getItem("chatOpsViewAllWarningIsOpen") || "false";
        console.log(isOpen)
        setOpen(isOpen === "true" ? true : false);
        if (filters) {
            filters = JSON.parse(filters);
            setApplicationFamilyFilter(filters.applicationFamilyFilter || '');
            setIdFilter(filters.idFilter || '');
        }

        const handleEarlyWarningActionTypeChange = (event) => {
            console.log("Change in action type")
            if (event.key === 'earlyWarningActionItem') {
                console.log('Filters changed in another tab. Refetching data...');
                fetchEarlyWarningsData();
                fetchWarningEventsData();
            }
        };
        window.addEventListener('storage', handleEarlyWarningActionTypeChange);
        return () => {
            window.removeEventListener('storage', handleEarlyWarningActionTypeChange);
        };

    }, [])

    useEffect(()=>{
        console.log(supportGroup, backendSessionToken, preferredTZ)
        if(supportGroup && backendSessionToken && backendSessionToken.length>0 && preferredTZ!==""){
            fetchEarlyWarningsData();
            fetchWarningEventsData();
            const interval = setInterval(()=>{
                console.log("Refetching data every 2 minutes")
                fetchEarlyWarningsData();
                fetchWarningEventsData();
            }, 60000)

            return () => clearInterval(interval);
        }
    }, [supportGroup, backendSessionToken, preferredTZ])

    useEffect(()=>{
        // local storage var to store isOpen, var name : "chatOpsViewAllWarningIsOpen"
        console.log(open, open.toString())
        sessionStorage.setItem("chatOpsViewAllWarningIsOpen", open.toString());
    }, [open])

    useEffect(()=>{
        // local storage var to store filter state, var name : "chatOpsViewAllWarningFilters"
        var filters = {
            "applicationFamilyFilter": applicationFamilyFilter,
            "idFilter": idFilter
        }
        localStorage.setItem("chatOpsViewAllWarningFilters", JSON.stringify(filters));

    }, [applicationFamilyFilter, idFilter])

    var fetchEarlyWarningsData = async () => {
        var params = {
            "supportGroup": supportGroup,
        }
        
        fetchEarlyWarnings(backendSessionToken, params)
        .then((data)=>{
            console.log(data)
            data = convertTimeToPreferredTZ_fromUtc(data)
            var count = Object.keys(data).length>0 ? Object.values(data["Status"]).filter((val,ind)=>val==="New" || val==="Acknowledged").length : 0
            console.log(count)
            setNotificationsList(data)
            setNotificationCount(count)
        })
        .catch((error)=>{
            console.log(error)
            setError(error);
        })
    }

    var fetchWarningEventsData = async () => {
        var params = {
            "supportGroup": supportGroup,
        }
        
        fetchWarningEvents(backendSessionToken, params)
        .then((data)=>{
            console.log(data)
            data = convertTimeToPreferredTZ_fromUtc(data)
            setWarningEvents(data);
            // var count = Object.keys(data).length>0 ? Object.keys(data["Early Warning ID"]).length : 0
            // console.log(count)
            // setNotificationsList(data)
            // setNotificationCount(count)
        })
        .catch((error)=>{
            console.log(error)
            // setError(error);
        })
    }

    const getID = (id) => {
        if (id === undefined || id === null) return '';
        return "EW" + id.toString().padStart(7, '0');
    }

    const CreatedCard = ({ notification }) => {
        const statusColors = {
            "New": "green",
            "Acknowledged": "orange",
            "Resolved": "grey"
        };

        return (
            <Card sx={{ width: '100%', border: '1px solid #e0e0e0', borderRadius: 2 }} elevation={2}>
                <CardContent sx={{ p: 2 }}>
                    <Grid container justifyContent="space-between" alignItems="center" sx={{ width: '100%', mb: 1 }}>
                        <Grid item>
                            <Typography variant="body2" component="div" sx={{ fontWeight: 'bold' }}>
                                {getID(notification["Sequential ID"])}: {notification["Application Family"]}
                            </Typography>
                        </Grid>
                        <Grid item>
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                <Box
                                    sx={{
                                        width: 8,
                                        height: 8,
                                        borderRadius: '50%',
                                        backgroundColor: statusColors[notification["Status"]] || 'grey',
                                        mr: 1,
                                    }}
                                />
                                <Typography variant="caption" color="text.secondary">
                                    {notification["Status"]}
                                </Typography>
                            </Box>
                        </Grid>
                    </Grid>
                    <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
                        {notification["Time Generated"]}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
                        {notification["Summary"]}
                    </Typography>
                </CardContent>
            </Card>
        );
    };
    
    return (
        <>
            {/* Notifications Icon */}
            <IconButton mx={1} onClick={handleMenu}>
                <Badge badgeContent={notificationCount} color="warning" max={999}>
                    <NotificationsActiveIcon />
                </Badge>
            </IconButton>
            <Menu
                id="menu-appbar"
                anchorEl={anchorEl}
                anchorOrigin={{
                    vertical: 'bottom',
                    horizontal: 'right',
                }}
                keepMounted
                transformOrigin={{
                    vertical: 'top',
                    horizontal: 'right',
                }}
                open={Boolean(anchorEl)}
                onClose={handleClose}
                PaperProps={{
                    sx: {
                        width: 350,
                        maxHeight: '75vh',
                        '&::-webkit-scrollbar': {
                            width: '0.4em'
                        },
                        '&::-webkit-scrollbar-track': {
                            boxShadow: 'inset 0 0 6px rgba(0,0,0,0.00)',
                            webkitBoxShadow: 'inset 0 0 6px rgba(0,0,0,0.00)'
                        },
                        '&::-webkit-scrollbar-thumb': {
                            backgroundColor: 'rgba(0,0,0,.1)',
                            outline: '1px solid slategrey',
                            borderRadius: '5px',
                        }
                    },
                }}
            >
                {notificationCount > 0 ? (
                    <div>
                        {(() => {
                            const notifications = Object.values(notificationsList["Early Warning ID"] || {}).map((id, index) => ({
                                "Early Warning ID": id,
                                "Application Family": notificationsList["Application Family"][index],
                                "Status": notificationsList["Status"][index],
                                "Summary": notificationsList["Summary"][index],
                                "Time Generated": notificationsList["Time Generated"][index],
                                "Sequential ID": notificationsList["Sequential ID"][index],
                            }));

                            const statusOrder = { "New": 1, "Acknowledged": 2, "Resolved": 3 };

                            notifications.sort((a, b) => {
                                const orderA = statusOrder[a.Status] || 4;
                                const orderB = statusOrder[b.Status] || 4;
                                return orderA - orderB;
                            });

                            return notifications.slice(0, 5).map((notification, index) => {
                                const processedNotification = {
                                    ...notification,
                                    "Summary": Object.keys(notification["Summary"]["Details"] || {}).join(', ') + " component(s) have warning events",
                                };
                                return (
                                    <MenuItem key={`${notification["Early Warning ID"]}-${index}`} onClick={() => handleOpenDialog(getID(notification["Sequential ID"]))} sx={{ p: 1, width: '100%' }}>
                                        <CreatedCard notification={processedNotification} />
                                    </MenuItem>
                                );
                            });
                        })()}
                        <Divider />
                        <Box sx={{ p: 1, position: 'sticky', bottom: 0, backgroundColor: 'white' }}>
                            <Button 
                                fullWidth 
                                variant="contained" 
                                onClick={() => handleOpenDialog()}
                                sx={{
                                    backgroundColor: '#00338e',
                                    '&:hover': {
                                        backgroundColor: '#00225e',
                                    },
                                }}
                            >
                                View All Warnings
                            </Button>
                        </Box>
                    </div>
                ) : (
                    <MenuItem onClick={handleClose}>No new notifications</MenuItem>
                )}
            </Menu>
            <Dialog
                open={open}
                onClose={handleCloseDialog}
                fullWidth
                maxWidth="xl"
                sx={{ '& .MuiDialog-paper': { height: '90vh' } }}
            >
                <DialogTitle>List of Early Warnings</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column' }}>
                    <ChatOpsViewAll 
                        eventsData={warningEvents} 
                        earlyWarningData={notificationsList}
                        idFilter={idFilter}
                        setIdFilter={setIdFilter}
                        applicationFamilyFilter={applicationFamilyFilter}
                        setApplicationFamilyFilter={setApplicationFamilyFilter}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Close</Button>
                </DialogActions>
            </Dialog>
        </>
    )
}

const Row = ({ warning,events }) => {

    useEffect(()=>{
        console.log(warning, events)
    }, [])

    const [open, setOpen] = useState(false);
    const statusColors = {
        "New": "green",
        "Acknowledged": "orange",
        "Resolved": "grey"
    };
    const resolvedCount = events.filter(e => e.Status === "Resolved").length;
    const totalCount = events.length;

    var getresourceDetails = (resourceName, resourceType) => {
        var resourceComponentMapping = {
            "subscriptionid": "Subscription ID",
            "resourcegroup": "Resource Group",
            "servername": "Server Name",
            "databasename": "Database Name",
            "sqlservername": "SQL Server Name",
            "storagename": "Storage Account Name",
            "filesharename": "File Share Name"
        };
        var resourceDetails = {};
        // console.log(resourceName, resourceType)
        if (resourceType === "windows service") {
            var resName = (resourceName || "").split("-");
            var serverName = resName.slice(0, -1).join("-");
            var serviceName = resName[resName.length - 1] || "";
            resourceDetails["Server Name"] = serverName;
            resourceDetails["Service Name"] = serviceName;
        } 
        else if(resourceType === "url"){
            var resName = (resourceName || "").split("-");
            resourceDetails["URL"] = resName[resName.length - 1] || "";
        }
        else if (resourceType === "corepoint interfaces") {
            resourceDetails["Interface Name"] = resourceName || "";
        } 
        else {
            var resName = (resourceName || "").split("/");
            if(resName.length===1 && resourceType.toLowerCase()==="vm"){
                resourceDetails["Server Name"] = resName[0] || "";
            }
            for (var i = 0; i < resName.length - 1; i += 2) {
                var sourceKey = (resName[i] || "").toLowerCase();
                var label = resourceComponentMapping[sourceKey] || "Unknown";
                if(label !== "Unknown"){
                    resourceDetails[label] = resName[i + 1];
                }
            }
        }

        return resourceDetails;
    }

    var getID = (id) => {
        if (id === undefined || id === null) return '';
        return "EW" + id.toString().padStart(7, '0');
    }

    var handleButtonClick = (actionType, warningId, applicationFamily) => {
        var domain = baseUrl.slice(0,-5)
        console.log(domain)
        var url = `${domain}/applicationHealth?Name=${applicationFamily}&Type=Application%20Family&EarlyWarningId=${warningId}&EarlyWarningUpdate=${actionType}`;
        window.open(url, '_blank');
    }

    return (
        <React.Fragment>
            <TableRow sx={{ '& > *': { borderBottom: 'unset' } }}>
                <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <IconButton
                            aria-label="expand row"
                            size="small"
                            onClick={() => setOpen(!open)}
                        >
                            {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                        </IconButton>
                        {resolvedCount > 0 && resolvedCount < totalCount && (
                            <Tooltip title={`${resolvedCount}/${totalCount} warning events updated`} arrow>
                                <Box 
                                    sx={{ 
                                        backgroundColor: '#E5E7EB',
                                        color: '#374151',
                                        fontSize: '11px',
                                        fontWeight: 500,
                                        px: 0.8,
                                        py: 0.2,
                                        borderRadius: '4px',
                                        ml: 0.5,
                                        cursor: 'default'
                                    }}
                                >
                                    {resolvedCount}/{totalCount}
                                </Box>
                            </Tooltip>
                        )}
                    </Box>
                </TableCell>
                <TableCell component="th" scope="row">
                    {getID(warning["Sequential ID"])}
                </TableCell>
                <TableCell component="th" scope="row">
                    {warning["Application Family"]}
                </TableCell>
                <TableCell>{warning["Summary"]}</TableCell>
                <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Box
                            sx={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                backgroundColor: statusColors[warning["Status"]] || 'grey',
                                mr: 1,
                            }}
                        />
                        <Typography variant="caption" color="text.secondary">
                            {warning["Status"]}
                        </Typography>
                    </Box>
                </TableCell>
                <TableCell>{warning["Time Generated"]}</TableCell>
                <TableCell>
                    <Grid container spacing={1} alignItems="center">
                        {warning["Status"] === "New" && (
                            <Grid item md={6} xs={12}>
                                <Button
                                    variant="outlined"
                                    size="small"
                                    onClick={() => handleButtonClick('acknowledge', warning["Early Warning ID"], warning["Application Family"])}
                                >
                                    Acknowledge
                                </Button>
                            </Grid>
                        )}
                        
                        {warning["Status"] === "Acknowledged" && (
                            <Grid item md={6} xs={12}>
                                <Button
                                    variant="outlined"
                                    size="small"
                                    onClick={() => handleButtonClick('resolve', warning["Early Warning ID"], warning["Application Family"])}
                                >
                                    Resolve
                                </Button>
                            </Grid>
                        )}
                    </Grid>
                </TableCell>
            </TableRow>
            <TableRow>
                <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={7}>
                    <Collapse in={open} timeout="auto" unmountOnExit>
                        <Box sx={{ margin: 1 }}>
                            <Typography variant="h6" gutterBottom component="div">
                                Warning Events
                            </Typography>
                            <Table size="small" aria-label="events">
                                <TableHead>
                                    <TableRow>
                                        <StyledTableCell>Time Generated</StyledTableCell>
                                        <StyledTableCell>Application CI</StyledTableCell>
                                        <StyledTableCell>Resource Type</StyledTableCell>
                                        <StyledTableCell>Resource Details</StyledTableCell>
                                        <StyledTableCell>Metric Impacted</StyledTableCell>
                                        <StyledTableCell>Condition</StyledTableCell>
                                        <StyledTableCell>Warning Reason</StyledTableCell>
                                        <StyledTableCell>Comments</StyledTableCell>
                                        <StyledTableCell>Status</StyledTableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {events.map((event, index) => {
                                        const resourceDetails = getresourceDetails(event['Resource Name'], event['Resource Type'].toLowerCase());
                                        return (
                                            <StyledTableRow key={index}>
                                                <StyledTableCell>{event['Time Generated']}</StyledTableCell>
                                                <StyledTableCell>{event['Application CI']}</StyledTableCell>
                                                <StyledTableCell>{event['Resource Type']}</StyledTableCell>
                                                <StyledTableCell>
                                                    <ul style={{ margin: 0, paddingLeft: '20px' }}>
                                                        {Object.entries(resourceDetails).map(([key, value]) => (
                                                            <li key={key}>
                                                                <Typography variant="caption"><strong>{key}:</strong> {value}</Typography>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </StyledTableCell>
                                                <StyledTableCell>{event['Metrics Impacted']}</StyledTableCell>
                                                <StyledTableCell>{event['Warning Condition']}</StyledTableCell>
                                                <StyledTableCell>{event['Warning Reason']}</StyledTableCell>
                                                <StyledTableCell>{event['Comments']}</StyledTableCell>
                                                <StyledTableCell>{event['Status']}</StyledTableCell>
                                            </StyledTableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </Box>
                    </Collapse>
                </TableCell>
            </TableRow>
        </React.Fragment>
    );
};

export function ChatOpsViewAll({ eventsData, earlyWarningData, idFilter, setIdFilter, applicationFamilyFilter, setApplicationFamilyFilter }) {
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [statusFilter, setStatusFilter] = useState('All');

    const getID = (id) => {
        if (id === undefined || id === null) return '';
        return "EW" + id.toString().padStart(7, '0');
    }

    const { warnings, groupedEvents } = React.useMemo(() => {
        console.log(eventsData)
        const tempWarnings = Object.keys(earlyWarningData["Early Warning ID"] || {}).map(key => ({
            "Early Warning ID": earlyWarningData["Early Warning ID"][key],
            "Application Family": earlyWarningData["Application Family"][key],
            "Summary": earlyWarningData["Summary"][key] ? (earlyWarningData["Summary"][key]["Summary"] || "No Summary") : "No Summary",
            "Status": earlyWarningData["Status"][key],
            "Time Generated": earlyWarningData["Time Generated"][key],
            "Sequential ID": earlyWarningData["Sequential ID"][key]
        }));
        var tempGroupedEvents = {}
        Object.keys(eventsData["Issue ID"] || {}).forEach(key => {
            const earlyWarningId = eventsData["Early Warning ID"][key];
            if (!tempGroupedEvents[earlyWarningId]) {
                tempGroupedEvents[earlyWarningId] = [];
            }
            tempGroupedEvents[earlyWarningId].push({
                "Time Generated": eventsData["Time Generated"][key],
                "Resource Name": eventsData["Resource Name"][key],
                "Resource Type": eventsData["Resource Type"][key],
                "Application CI": eventsData["Application CI"][key],
                "Metrics Impacted": eventsData["Metrics Impacted"][key],
                "Warning Condition": eventsData["Condition"][key].split(';')[0],
                "Warning Reason": eventsData["Condition"][key].split(';')[1] || "N/A",
                "Comments": eventsData["Comments"][key],
                "Status" : eventsData["Status"][key],
            });
        })
        return { warnings: tempWarnings, groupedEvents: tempGroupedEvents };
    }, [earlyWarningData, eventsData]);

    const { appFamilyOptions, idOptions } = React.useMemo(() => {
        const appFamilySet = new Set();
        const ids = [];
        warnings.forEach(warning => {
            appFamilySet.add(warning["Application Family"]);
            ids.push(getID(warning["Sequential ID"]));
        });
        return {
            appFamilyOptions: Array.from(appFamilySet),
            idOptions: ids
        };
    }, [warnings]);

    const filteredWarnings = React.useMemo(() => {
        
        return warnings.filter(warning => {
            const statusMatch = statusFilter === 'All' || warning.Status === statusFilter;
            const appFamilyMatch = !applicationFamilyFilter || (warning["Application Family"] && warning["Application Family"].toLowerCase().includes(applicationFamilyFilter.toLowerCase()));
            const idMatch = !idFilter || getID(warning["Sequential ID"]).toLowerCase().includes(idFilter.toLowerCase());
            return statusMatch && appFamilyMatch && idMatch;
        });
    }, [warnings, statusFilter, applicationFamilyFilter, idFilter]);

    const handleChangePage = (event, newPage) => {
        setPage(newPage);
    };

    const handleChangeRowsPerPage = (event) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Box display="flex" alignItems="center" gap={2} sx={{ mb: 2 }}>
                <Autocomplete
                    freeSolo
                    size="small"
                    options={appFamilyOptions}
                    value={applicationFamilyFilter}
                    onInputChange={(event, newValue) => {
                        setApplicationFamilyFilter(newValue || '');
                    }}
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            label="Application Family"
                            sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#fff', fontSize: { xs: 10, sm: 11, md: 12 }, borderRadius: 2, minHeight: 38, width: '100%', '& fieldset': { border: '1px solid #ccc' } }}}
                        />
                    )}
                    sx={{ width: 300 }}
                />
                <Autocomplete
                    freeSolo
                    size="small"
                    options={idOptions}
                    value={idFilter}
                    onInputChange={(event, newValue) => {
                        setIdFilter(newValue || '');
                    }}
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            label="ID"
                            sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#fff', fontSize: { xs: 10, sm: 11, md: 12 }, borderRadius: 2, minHeight: 38, width: '100%', '& fieldset': { border: '1px solid #ccc' } }}}
                        />
                    )}
                    sx={{ width: 200 }}
                />
                <Box sx={{ flexGrow: 1 }} />
                <Box display="flex" gap={1} flexWrap="wrap">
                    {['All', 'New', 'Acknowledged', 'Resolved'].map((status) => {
                        const statusStyle = {
                            'All': { border: '#757575', bg: '#EEEEEE', text: '#424242' },
                            'New': { border: 'green', bg: '#EAF6EA', text: '#2E7D32' },
                            'Acknowledged': { border: 'orange', bg: '#FFF3E6', text: '#C77800' },
                            'Resolved': { border: 'grey', bg: '#f5f5f5', text: '#616161' }
                        };
                        const isActive = statusFilter === status;
                        return (
                            <Box
                                key={status}
                                px={1.5}
                                py={0.3}
                                borderRadius={999}
                                bgcolor={isActive ? statusStyle[status].border : statusStyle[status].bg}
                                onClick={() => setStatusFilter(status)}
                                sx={{ cursor: 'pointer', transition: 'all 0.2s', '&:hover': { transform: 'scale(1.05)', boxShadow: 1 } }}
                            >
                                <Typography fontSize={{ xs: 9, sm: 10, md: 11 }} fontWeight={600} color={isActive ? '#fff' : statusStyle[status].text}>{status}</Typography>
                            </Box>
                        );
                    })}
                </Box>
            </Box>
            <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
                <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #E6E8EE', borderRadius: 2 }}>
                    <Table size="small" aria-label="collapsible table">
                        <TableHead>
                            <TableRow sx={{ bgcolor: '#00338e' }}>
                                <TableCell />
                                <TableCell sx={{ color: '#fff', fontWeight: 700, fontSize: 13, py: 1.5 }}>ID</TableCell>
                                <TableCell sx={{ color: '#fff', fontWeight: 700, fontSize: 13, py: 1.5 }}>Application Family</TableCell>
                                <TableCell sx={{ color: '#fff', fontWeight: 700, fontSize: 13, py: 1.5 }}>Summary</TableCell>
                                <TableCell sx={{ color: '#fff', fontWeight: 700, fontSize: 13, py: 1.5 }}>Status</TableCell>
                                <TableCell sx={{ color: '#fff', fontWeight: 700, fontSize: 13, py: 1.5 }}>Time Generated</TableCell>
                                <TableCell sx={{ color: '#fff', fontWeight: 700, fontSize: 13, py: 1.5 }}>Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {filteredWarnings.slice(page * rowsPerPage, filteredWarnings.length < (page * rowsPerPage + rowsPerPage) ? filteredWarnings.length : (page * rowsPerPage + rowsPerPage)).map((warning, index) => (
                                <Row key={`${warning['Early Warning ID']}-${index}`} warning={warning} events={groupedEvents[warning['Early Warning ID']] || []} />
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Box>
            <TablePagination
                rowsPerPageOptions={[10, 25, 100]}
                component="div"
                count={filteredWarnings.length}
                rowsPerPage={rowsPerPage}
                page={page}
                onPageChange={handleChangePage}
                onRowsPerPageChange={handleChangeRowsPerPage}
            />
        </Box>
    );
}

