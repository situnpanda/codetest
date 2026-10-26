import React, {useEffect,useState} from 'react'
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import IconButton from '@mui/material/IconButton';
import Badge from '@mui/material/Badge';
import { fetchEarlyWarnings,fetchWarningEvents } from '../../shared/APIs/fetchAPIs';
import { updateEarlyWarningStatus } from '../../shared/APIs/updateAPIs';
import CircularProgress from '@mui/material/CircularProgress';
import { Menu, MenuItem, Card, CardContent, Typography, Grid, Box, Button, Divider, Table, TableBody, TableCell, tableCellClasses, TableContainer, TableHead, TableRow, Paper, Accordion, AccordionSummary, AccordionDetails, Dialog, DialogTitle, DialogContent, DialogActions, Collapse, TablePagination, TextField, Autocomplete, Chip, Tooltip } from '@mui/material';
import { convertTimeToPreferredTZ_fromUtc } from '../../shared/Timestamp/PreferenceConversion';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
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
                PaperProps={{ sx: { height: '90vh', borderRadius: 3, overflow: 'hidden', boxShadow: '0 20px 60px rgba(15, 23, 42, 0.24)' } }}
            >
                <DialogTitle sx={{ px: { xs: 1, sm: 1.5 }, py: 1, borderBottom: '1px solid #E6E8EE', bgcolor: '#FFFFFF' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.625 }}>
                        <Box sx={{ width: 32, height: 32, borderRadius: 1.5, display: 'grid', placeItems: 'center', bgcolor: '#E8F0FE', color: '#00338E' }}>
                            <WarningAmberRoundedIcon fontSize="small" />
                        </Box>
                        <Box>
                            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#1C2B3A', lineHeight: 1.2 }}>Early Warnings</Typography>
                            <Typography variant="caption" color="text.secondary">Review and manage application warning events</Typography>
                        </Box>
                    </Box>
                </DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', p: { xs: 0.75, sm: 1.25 }, bgcolor: '#F6F8FB', overflow: 'hidden' }}>
                    <ChatOpsViewAll 
                        eventsData={warningEvents} 
                        earlyWarningData={notificationsList}
                        idFilter={idFilter}
                        setIdFilter={setIdFilter}
                        applicationFamilyFilter={applicationFamilyFilter}
                        setApplicationFamilyFilter={setApplicationFamilyFilter}
                        backendSessionToken={backendSessionToken}
                        onStatusUpdated={() => { fetchEarlyWarningsData(); fetchWarningEventsData(); }}
                    />
                </DialogContent>
                <DialogActions sx={{ px: { xs: 1, sm: 1.5 }, py: 0.75, borderTop: '1px solid #E6E8EE', bgcolor: '#FFFFFF' }}>
                    <Button onClick={handleCloseDialog} size="small" variant="outlined" sx={{ textTransform: 'none', borderColor: '#B8C5D1', color: '#29445F', fontWeight: 700 }}>Close</Button>
                </DialogActions>
            </Dialog>
        </>
    )
}

const Row = ({ warning, events, backendSessionToken, onStatusUpdated }) => {
    const [ackState, setAckState] = useState({ open: false, loading: false, success: null, message: '' });
    const [resolveState, setResolveState] = useState({ open: false, loading: false, submitting: false, events: [], message: '', success: null, warningId: null });

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
        var url = `${domain}/applicationHealth?Name=${encodeURIComponent(applicationFamily)}&Type=Application%20Family&EarlyWarningId=${warningId}&EarlyWarningUpdate=${actionType}`;
        window.open(url, '_blank');
    }

    var handleResolve = (warningId) => {
        setResolveState({ open: true, loading: true, submitting: false, events: [], message: '', success: null, warningId });
        fetchWarningEvents(backendSessionToken, { "EarlyWarningID": [warningId], "status": ["Acknowledged", "Resolved"] })
        .then((data) => {
            var list = Object.keys(data?.["Issue ID"] || {}).map((k) => {
                var cond = (data["Condition"]?.[k] || "").split(';');
                var status = (data["Status"]?.[k] || "").toLowerCase();
                return {
                    id: data["Issue ID"][k],
                    resourceDetails: getresourceDetails(data["Resource Name"]?.[k], (data["Resource Type"]?.[k] || "").toLowerCase()),
                    condition: (cond[0] || "").trim(),
                    reason: (cond[cond.length - 1] || "").trim(),
                    existingComments: data["Comments"]?.[k] || "",
                    isResolved: status === "resolved",
                    comment: "",
                    type: ""
                };
            });
            var hasPending = list.some(e => !e.isResolved);
            if (hasPending) {
                setResolveState((s) => ({ ...s, loading: false, events: list }));
            } else if (list.length > 0) {
                // All events already resolved -> resolve the Early Warning itself
                setResolveState((s) => ({ ...s, message: 'All warning events are resolved. Updating Early Warning status...' }));
                submitResolve(warningId, []);
            } else {
                setResolveState((s) => ({ ...s, loading: false, success: false, message: 'Early Warning is not in Acknowledged state. Please acknowledge it before resolving.' }));
            }
        })
        .catch((error) => {
            console.error("Error fetching warning events:", error);
            setResolveState((s) => ({ ...s, loading: false, success: false, message: 'Failed to load warning events. Please try again.' }));
        });
    }

    var submitResolve = (warningId, pendingEvents) => {
        setResolveState((s) => ({ ...s, loading: true, submitting: true }));
        updateEarlyWarningStatus(backendSessionToken, {
            "EarlyWarningID": [warningId],
            "StatusEarlyWarning": ["Resolved"],
            "WarningEventsID": pendingEvents.map(e => e.id),
            "StatusWarningEvents": pendingEvents.map(() => "Resolved"),
            "Comments": pendingEvents.map(e => `[${e.type}] ${e.comment.trim()}`)
        })
        .then(() => {
            setResolveState((s) => ({ ...s, loading: false, submitting: false, events: [], success: true, message: `${getID(warning["Sequential ID"])} resolved successfully.` }));
            var actionItem = localStorage.getItem("earlyWarningActionItem") || 0;
            localStorage.setItem("earlyWarningActionItem", parseInt(actionItem) + 1);
            if (onStatusUpdated) onStatusUpdated();
        })
        .catch((error) => {
            console.error("Error resolving early warning:", error);
            setResolveState((s) => ({ ...s, loading: false, submitting: false, success: false, message: 'Failed to resolve. Please try again.' }));
        });
    }

    var updateResolveEvent = (id, field, value) => {
        setResolveState((s) => ({ ...s, events: s.events.map(e => e.id === id ? { ...e, [field]: value } : e) }));
    }

    var pendingResolveEvents = resolveState.events.filter(e => !e.isResolved);
    var canSubmitResolve = pendingResolveEvents.length > 0 && pendingResolveEvents.every(e => e.comment.trim() !== '' && e.type !== '');

    var handleAcknowledge = (warningId) => {
        setAckState({ open: true, loading: true, success: null, message: 'Updating status to Acknowledged...' });
        updateEarlyWarningStatus(backendSessionToken, {
            "EarlyWarningID": [warningId],
            "StatusEarlyWarning": ["Acknowledged"],
            "WarningEventsID": [],
            "StatusWarningEvents": [],
            "Comments": []
        })
        .then(() => {
            setAckState({ open: true, loading: false, success: true, message: `${getID(warning["Sequential ID"])} acknowledged successfully.` });
            var actionItem = localStorage.getItem("earlyWarningActionItem") || 0;
            localStorage.setItem("earlyWarningActionItem", parseInt(actionItem) + 1);
            if (onStatusUpdated) onStatusUpdated();
        })
        .catch((error) => {
            console.error("Error acknowledging early warning:", error);
            setAckState({ open: true, loading: false, success: false, message: 'Failed to acknowledge. Please try again.' });
        });
    }

    return (
        <React.Fragment>
            <Dialog open={ackState.open} onClose={() => !ackState.loading && setAckState((s) => ({ ...s, open: false }))} PaperProps={{ sx: { borderRadius: 3, minWidth: { sm: 400 } } }}>
                <DialogTitle sx={{ px: 3, py: 2, borderBottom: '1px solid #E6E8EE' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                        <Box sx={{ width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: ackState.success === false ? '#FDECEC' : '#E8F5EE', color: ackState.success === false ? '#C62828' : '#16834A' }}>
                            <CheckCircleOutlineRoundedIcon fontSize="small" />
                        </Box>
                        <Box>
                            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#1C2B3A' }}>Acknowledge early warning</Typography>
                            <Typography variant="caption" color="text.secondary">{getID(warning["Sequential ID"])}</Typography>
                        </Box>
                    </Box>
                </DialogTitle>
                <DialogContent sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 3, py: 3 }}>
                    {ackState.loading && <CircularProgress size={22} />}
                    <Typography color={ackState.success === false ? 'error' : 'text.primary'}>{ackState.message}</Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 1.5, borderTop: '1px solid #E6E8EE' }}>
                    <Button disabled={ackState.loading} onClick={() => setAckState((s) => ({ ...s, open: false }))} variant="contained" sx={{ textTransform: 'none', fontWeight: 700 }}>Close</Button>
                </DialogActions>
            </Dialog>
            <Dialog open={resolveState.open} fullWidth maxWidth="lg" onClose={() => !resolveState.loading && setResolveState((s) => ({ ...s, open: false }))} PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}>
                <DialogTitle sx={{ px: 3, py: 2, borderBottom: '1px solid #E6E8EE' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                        <Box sx={{ width: 40, height: 40, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: '#E8F0FE', color: '#00338E' }}><WarningAmberRoundedIcon /></Box>
                        <Box>
                            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#1C2B3A' }}>Resolve early warning</Typography>
                            <Typography variant="caption" color="text.secondary">{getID(warning["Sequential ID"])} · {warning["Application Family"]}</Typography>
                        </Box>
                    </Box>
                </DialogTitle>
                <DialogContent sx={{ p: 3, bgcolor: '#F8FAFC' }}>
                    {resolveState.loading ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 4, justifyContent: 'center' }}>
                            <CircularProgress size={26} />
                            <Typography>{resolveState.submitting ? 'Updating status to Resolved...' : (resolveState.message || 'Checking warning events...')}</Typography>
                        </Box>
                    ) : resolveState.events.length > 0 ? (
                        <>
                            <Typography variant="body2" sx={{ mb: 1.5 }}>
                                Provide a comment and choose an event type for each warning event below.
                            </Typography>
                            <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #E1E8F0', borderRadius: 2, overflow: 'hidden' }}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <StyledTableCell>Resource Details</StyledTableCell>
                                        <StyledTableCell>Condition</StyledTableCell>
                                        <StyledTableCell>Utilization/Status</StyledTableCell>
                                        <StyledTableCell sx={{ width: '28%' }}>Comments</StyledTableCell>
                                        <StyledTableCell sx={{ width: '18%' }}>Event Type</StyledTableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {resolveState.events.map((e) => (
                                        <StyledTableRow key={e.id} sx={e.isResolved ? { opacity: 0.6 } : {}}>
                                            <StyledTableCell>
                                                {Object.entries(e.resourceDetails).map(([k, v]) => (
                                                    <Typography key={k} variant="caption" display="block"><strong>{k}:</strong> {v}</Typography>
                                                ))}
                                            </StyledTableCell>
                                            <StyledTableCell>{e.condition}</StyledTableCell>
                                            <StyledTableCell>{e.reason}</StyledTableCell>
                                            <StyledTableCell>
                                                {e.isResolved ? (e.existingComments || '-') : (
                                                    <TextField size="small" fullWidth multiline maxRows={3} value={e.comment} placeholder="Add comments"
                                                        onChange={(ev) => updateResolveEvent(e.id, 'comment', ev.target.value)} />
                                                )}
                                            </StyledTableCell>
                                            <StyledTableCell>
                                                {e.isResolved ? 'Resolved' : (
                                                    <TextField select size="small" fullWidth value={e.type}
                                                        onChange={(ev) => updateResolveEvent(e.id, 'type', ev.target.value)}>
                                                        {['True Positive', 'False Positive', 'Remove from Alerting'].map(t => (
                                                            <MenuItem key={t} value={t}>{t}</MenuItem>
                                                        ))}
                                                    </TextField>
                                                )}
                                            </StyledTableCell>
                                        </StyledTableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            </TableContainer>
                        </>
                    ) : (
                        <Typography color={resolveState.success === false ? 'error' : 'text.primary'} sx={{ py: 2 }}>{resolveState.message}</Typography>
                    )}
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 1.5, borderTop: '1px solid #E6E8EE', bgcolor: '#FFFFFF' }}>
                    {!resolveState.loading && resolveState.events.length > 0 && (
                        <Button variant="contained" disabled={!canSubmitResolve} onClick={() => submitResolve(resolveState.warningId, pendingResolveEvents)} sx={{ textTransform: 'none', fontWeight: 700 }}>Resolve warning</Button>
                    )}
                    <Button disabled={resolveState.loading} onClick={() => setResolveState((s) => ({ ...s, open: false }))} variant="outlined" sx={{ textTransform: 'none', borderColor: '#B8C5D1', color: '#29445F', fontWeight: 700 }}>Close</Button>
                </DialogActions>
            </Dialog>
            <TableRow sx={{ '& > *': { borderBottom: 'unset' }, '&:hover': { bgcolor: '#F8FBFF' } }}>
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
                    <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#00338E' }}>{getID(warning["Sequential ID"])}</Typography>
                </TableCell>
                <TableCell component="th" scope="row">
                    {warning["Application Family"]}
                </TableCell>
                <TableCell sx={{ maxWidth: 360 }}><Typography variant="body2" sx={{ color: '#34495E', lineHeight: 1.45 }}>{warning["Summary"]}</Typography></TableCell>
                <TableCell>
                    <Chip label={warning["Status"]} size="small" sx={{ fontWeight: 700, bgcolor: warning["Status"] === 'New' ? '#E8F5EE' : warning["Status"] === 'Acknowledged' ? '#FFF4D6' : '#EEF2F6', color: warning["Status"] === 'New' ? '#16834A' : warning["Status"] === 'Acknowledged' ? '#8A5A00' : '#536577' }} />
                </TableCell>
                <TableCell>{warning["Time Generated"]}</TableCell>
                <TableCell>
                    <Grid container spacing={1} alignItems="center">
                        {warning["Status"] === "New" && (
                            <Grid item md={6} xs={12}>
                                <Button
                                    variant="contained"
                                    size="small"
                                    disabled={ackState.loading}
                                    onClick={() => handleAcknowledge(warning["Early Warning ID"])}
                                    sx={{ textTransform: 'none', fontWeight: 700 }}
                                >
                                    Acknowledge
                                </Button>
                            </Grid>
                        )}
                        
                        {warning["Status"] === "Acknowledged" && (
                            <Grid item md={6} xs={12}>
                                <Button
                                    variant="contained"
                                    size="small"
                                    onClick={() => handleResolve(warning["Early Warning ID"])}
                                    sx={{ textTransform: 'none', fontWeight: 700 }}
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
                        <Box sx={{ m: 1.5, p: 1.5, bgcolor: '#F8FAFC', borderRadius: 2 }}>
                            <Typography variant="subtitle2" gutterBottom component="div" sx={{ fontWeight: 700, color: '#1C2B3A' }}>
                                Warning Events
                            </Typography>
                            <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #E1E8F0', borderRadius: 1.5, overflow: 'auto' }}>
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
                            </TableContainer>
                        </Box>
                    </Collapse>
                </TableCell>
            </TableRow>
        </React.Fragment>
    );
};

export function ChatOpsViewAll({ eventsData, earlyWarningData, idFilter, setIdFilter, applicationFamilyFilter, setApplicationFamilyFilter, backendSessionToken, onStatusUpdated }) {
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

    const warningCounts = React.useMemo(() => ({
        All: warnings.length,
        New: warnings.filter((warning) => warning.Status === 'New').length,
        Acknowledged: warnings.filter((warning) => warning.Status === 'Acknowledged').length,
        Resolved: warnings.filter((warning) => warning.Status === 'Resolved').length,
    }), [warnings]);

    const handleChangePage = (event, newPage) => {
        setPage(newPage);
    };

    const handleChangeRowsPerPage = (event) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Box sx={{ p: { xs: 0.75, sm: 1 }, mb: 1, border: '1px solid #E1E8F0', borderRadius: 2, bgcolor: '#FFFFFF' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.625, flexWrap: 'wrap' }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: '#1C2B3A', mr: 0.25 }}>Filters</Typography>
                    <Autocomplete
                        freeSolo
                        size="small"
                        options={appFamilyOptions}
                        value={applicationFamilyFilter}
                        onInputChange={(event, newValue) => setApplicationFamilyFilter(newValue || '')}
                        renderInput={(params) => <TextField {...params} label="Application family" placeholder="Search application" />}
                        sx={{ width: { xs: '100%', sm: 250 }, '& .MuiOutlinedInput-root': { bgcolor: '#fff', borderRadius: 1.5, minHeight: 34, fontSize: 12 }, '& .MuiInputLabel-root': { fontSize: 12 } }}
                    />
                    <Autocomplete
                        freeSolo
                        size="small"
                        options={idOptions}
                        value={idFilter}
                        onInputChange={(event, newValue) => setIdFilter(newValue || '')}
                        renderInput={(params) => <TextField {...params} label="Early warning ID" placeholder="EW0000001" />}
                        sx={{ width: { xs: '100%', sm: 190 }, '& .MuiOutlinedInput-root': { bgcolor: '#fff', borderRadius: 1.5, minHeight: 34, fontSize: 12 }, '& .MuiInputLabel-root': { fontSize: 12 } }}
                    />
                    <Box sx={{ flexGrow: 1 }} />
                    <Box display="flex" gap={0.375} flexWrap="wrap">
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
                                px={0.75}
                                py={0.3}
                                borderRadius={999}
                                bgcolor={isActive ? statusStyle[status].border : statusStyle[status].bg}
                                onClick={() => setStatusFilter(status)}
                                sx={{ cursor: 'pointer', transition: 'all 0.2s', border: `1px solid ${isActive ? statusStyle[status].border : 'transparent'}`, '&:hover': { boxShadow: '0 2px 6px rgba(15, 23, 42, 0.14)' } }}
                            >
                                <Typography fontSize={10} fontWeight={600} color={isActive ? '#fff' : statusStyle[status].text}>{status} ({warningCounts[status]})</Typography>
                            </Box>
                        );
                    })}
                    </Box>
                </Box>
            </Box>
            <Paper elevation={0} sx={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column', border: '1px solid #E1E8F0', borderRadius: 2, bgcolor: '#FFFFFF', overflow: 'hidden', '& .MuiTableCell-root': { py: 0.75, fontSize: 12 } }}>
                <TableContainer sx={{ flexGrow: 1, overflow: 'auto' }}>
                    <Table size="small" aria-label="Early warnings table" stickyHeader>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ bgcolor: '#00338E', color: '#fff' }} />
                                <TableCell sx={{ bgcolor: '#00338E', color: '#fff', fontWeight: 700, fontSize: 11, py: 0.75 }}>ID</TableCell>
                                <TableCell sx={{ bgcolor: '#00338E', color: '#fff', fontWeight: 700, fontSize: 11, py: 0.75 }}>Application family</TableCell>
                                <TableCell sx={{ bgcolor: '#00338E', color: '#fff', fontWeight: 700, fontSize: 11, py: 0.75 }}>Summary</TableCell>
                                <TableCell sx={{ bgcolor: '#00338E', color: '#fff', fontWeight: 700, fontSize: 11, py: 0.75 }}>Status</TableCell>
                                <TableCell sx={{ bgcolor: '#00338E', color: '#fff', fontWeight: 700, fontSize: 11, py: 0.75 }}>Time generated</TableCell>
                                <TableCell sx={{ bgcolor: '#00338E', color: '#fff', fontWeight: 700, fontSize: 11, py: 0.75 }}>Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {filteredWarnings.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} sx={{ py: 7, textAlign: 'center', color: '#60758D' }}>
                                        <WarningAmberRoundedIcon sx={{ color: '#B8C5D1', mb: 1 }} />
                                        <Typography sx={{ fontWeight: 700, color: '#38516A' }}>No early warnings found</Typography>
                                        <Typography variant="body2">Try changing the status, application family, or ID filters.</Typography>
                                    </TableCell>
                                </TableRow>
                            )}
                            {filteredWarnings.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((warning, index) => (
                                <Row key={`${warning['Early Warning ID']}-${index}`} warning={warning} events={groupedEvents[warning['Early Warning ID']] || []} backendSessionToken={backendSessionToken} onStatusUpdated={onStatusUpdated} />
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
                <Box sx={{ borderTop: '1px solid #E1E8F0', bgcolor: '#F8FAFC' }}>
                    <TablePagination
                        rowsPerPageOptions={[10, 25, 100]}
                        component="div"
                        count={filteredWarnings.length}
                        rowsPerPage={rowsPerPage}
                        page={page}
                        onPageChange={handleChangePage}
                        onRowsPerPageChange={handleChangeRowsPerPage}
                        sx={{ fontSize: 12, '& .MuiTablePagination-toolbar': { minHeight: 40, px: { xs: 0.5, sm: 1 } }, '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': { fontSize: 12 }, '& .MuiIconButton-root': { p: 0.5 } }}
                    />
                </Box>
            </Paper>
        </Box>
    );
}

