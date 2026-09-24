import React, { useState, useEffect, useMemo } from 'react';
import {
    Box, Paper, Typography, Divider, TextField, Chip, Autocomplete,
    Tooltip, Alert, Grid, IconButton, Accordion, AccordionSummary, AccordionDetails,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination
} from '@mui/material';
import { InfoOutlined, InsightsOutlined } from '@mui/icons-material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import AreaLineChart from '../../shared/LineChart/AreaLineChart';
import { fetchNetworkMetrics_fromADX, fetchMoxaMetricsWithLatest } from '../../shared/APIs/fetchAPIs';
import { convertTimeToPreferredTZ_ToUtc, convertTimeToPreferredTZ_fromUtc } from '../../shared/Timestamp/PreferenceConversion';
import CircularProgress_Styled from '../../shared/UI Components/CircularProgress';
import CrowdstrikeTopTalkers from './CrowdstrikeTopTalkers';
import PatternInsightsPane from './PatternInsightsPane';

const NetworkMetrics = ({ date, preferredTZ, appName: appNameProp, globalFilterData, isBladeView = false }) => {
    const appName = appNameProp;
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [networkMetrics, setNetworkMetrics] = useState({});
    const [selectedServers, setSelectedServers] = useState([]);
    
    // Processed data for different chart types
    const [bytesGraphData, setBytesGraphData] = useState([]);
    const [packetsGraphData, setPacketsGraphData] = useState([]);
    const [totalGraphData, setTotalGraphData] = useState([]);
    
    // All available servers
    const [allServers, setAllServers] = useState([]);

    // Network seasonal pattern insights side pane
    const [patternPaneOpen, setPatternPaneOpen] = useState(false);

    // Moxa switch monitoring
    const [moxaData, setMoxaData] = useState([]);
    const [moxaLatest, setMoxaLatest] = useState([]);
    const [moxaLatestLoading, setMoxaLatestLoading] = useState(true);
    const [moxaHistLoading, setMoxaHistLoading] = useState(false);
    const [moxaExpanded, setMoxaExpanded] = useState(false);
    const [moxaIpFilter, setMoxaIpFilter] = useState([]);
    const [moxaStatusFilter, setMoxaStatusFilter] = useState('all');
    const [moxaTablePage, setMoxaTablePage] = useState(0);
    const [moxaRowsPerPage, setMoxaRowsPerPage] = useState(10);
    const [expandedMoxaRow, setExpandedMoxaRow] = useState(null);

    const isMoxaRunning = (status) => {
        const s = String(status ?? '').toLowerCase().trim();
        return ['running', 'up', 'success', 'online', 'reachable', 'true', '1'].includes(s);
    };

    const fetchMoxaData = async () => {
        try {
            if (!appName || !date?.startDate || !date?.endDate) return;

            const baseParams = {
                "Application CI": [appName],
                "Start Time": convertTimeToPreferredTZ_ToUtc(date.startDate),
                "End Time": convertTimeToPreferredTZ_ToUtc(date.endDate)
            };

            const toRows = (res) => {
                const converted = convertTimeToPreferredTZ_fromUtc(res);
                if (!converted || !converted.MoxaIP) return [];
                return Object.keys(converted.MoxaIP).map((k) => ({
                    time: converted.TimeGenerated?.[k],
                    moxaIp: converted.MoxaIP?.[k],
                    appCI: converted.ApplicationCI?.[k],
                    status: converted.Status?.[k]
                }));
            };

            setMoxaLatestLoading(true);
            setMoxaHistLoading(true);
            try {
                const { data, latest } = await fetchMoxaMetricsWithLatest(baseParams);
                setMoxaLatest(toRows(latest));
                setMoxaData(toRows(data));
            } finally {
                setMoxaLatestLoading(false);
                setMoxaHistLoading(false);
            }
        } catch (err) {
            console.error("Moxa fetch error:", err);
            setMoxaLatest([]);
            setMoxaData([]);
            setMoxaLatestLoading(false);
            setMoxaHistLoading(false);
        }
    };

    useEffect(() => {
        if (!appName || !date?.startDate || !date?.endDate) {
            setMoxaLatestLoading(false);
            return;
        }
        setMoxaLatestLoading(true);
        fetchMoxaData();
    }, [appName, date, preferredTZ]);

    const hasMoxa = moxaLatest.length > 0;

    const moxaLatestByIp = useMemo(() => {
        const map = {};
        moxaLatest.forEach((r) => { map[r.moxaIp] = { status: r.status, appCI: r.appCI, time: r.time }; });
        return map;
    }, [moxaLatest]);

    const getMoxaIpOptions = () => Object.keys(moxaLatestByIp);

    const moxaCounts = useMemo(() => {
        const ips = Object.keys(moxaLatestByIp);
        const running = ips.filter((ip) => isMoxaRunning(moxaLatestByIp[ip].status)).length;
        return { total: ips.length, running, stopped: ips.length - running };
    }, [moxaLatestByIp]);

    const getFilteredMoxaIps = () => {
        let ips = Object.keys(moxaLatestByIp);
        if (moxaIpFilter.length > 0) ips = ips.filter((ip) => moxaIpFilter.includes(ip));
        if (moxaStatusFilter !== 'all') {
            ips = ips.filter((ip) => {
                const running = isMoxaRunning(moxaLatestByIp[ip].status);
                return moxaStatusFilter === 'running' ? running : !running;
            });
        }
        return ips.sort((a, b) => {
            const ra = isMoxaRunning(moxaLatestByIp[a].status);
            const rb = isMoxaRunning(moxaLatestByIp[b].status);
            return ra && !rb ? 1 : !ra && rb ? -1 : 0;
        });
    };

    const getMoxaGraphData = (ip) => {
        const points = {};
        moxaData
            .filter((r) => r.moxaIp === ip)
            .sort((a, b) => new Date(a.time) - new Date(b.time))
            .forEach((r) => {
                if (r.time) points[r.time] = { name: r.time, [ip]: isMoxaRunning(r.status) ? 1 : 0 };
            });
        return Object.values(points);
    };

    // Fetch network metrics data
    const fetchNetworkData = async () => {
        try {
            if (!appName || !date?.startDate || !date?.endDate) return;

            setLoading(true);
            setError("");

            const params = {
                "Latest Only": false,
                "Application CI": [appName],
                "Start Time": convertTimeToPreferredTZ_ToUtc(date.startDate),
                "End Time": convertTimeToPreferredTZ_ToUtc(date.endDate),
                "Object Name": ["bytes_sent_rate", "bytes_received_rate", "packets_sent_rate", "packets_received_rate", "network_in_total", "network_out_total"]
            };

            // console.log("NetworkBeta fetching with params:", params);
            const results = await fetchNetworkMetrics_fromADX(params);
            // console.log("NetworkBeta results:", results);

            if (results && typeof results === 'object' && Object.keys(results).length > 0) {
                const convertedResults = convertTimeToPreferredTZ_fromUtc(results);
                setNetworkMetrics(convertedResults);
            }
        } catch (err) {
            console.error("NetworkBeta error:", err);
            setError(err.message);
            setNetworkMetrics({});
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!appName || !date?.startDate || !date?.endDate) {
            setLoading(false);
            return;
        }
        fetchNetworkData();
    }, [appName, date, preferredTZ]);

    // Process network metrics when data changes
    useEffect(() => {
        if (!networkMetrics || Object.keys(networkMetrics).length === 0 || !networkMetrics.ObjectName) {
            return;
        }

        const bytesSentData = {};
        const bytesReceivedData = {};
        const packetsSentData = {};
        const packetsReceivedData = {};
        const networkInData = {};
        const networkOutData = {};
        const serverTotals = { bytes: {}, packets: {}, total: {} };
        const timestamps = new Set();
        const serversSet = new Set();

        Object.keys(networkMetrics.TimeGenerated || {}).forEach((index) => {
            const objectName = networkMetrics.ObjectName[index];
            const timeGenerated = networkMetrics.TimeGenerated[index];
            const avgValue = networkMetrics.AvgValue[index];
            const serverName = networkMetrics.ServerName[index];

            timestamps.add(timeGenerated);
            serversSet.add(serverName);

            if (!serverTotals.bytes[serverName]) serverTotals.bytes[serverName] = 0;
            if (!serverTotals.packets[serverName]) serverTotals.packets[serverName] = 0;
            if (!serverTotals.total[serverName]) serverTotals.total[serverName] = 0;

            // Group by object name and accumulate totals
            if (objectName === 'bytes_sent_rate') {
                if (!bytesSentData[timeGenerated]) bytesSentData[timeGenerated] = {};
                bytesSentData[timeGenerated][serverName] = avgValue;
                serverTotals.bytes[serverName] += avgValue;
            } else if (objectName === 'bytes_received_rate') {
                if (!bytesReceivedData[timeGenerated]) bytesReceivedData[timeGenerated] = {};
                bytesReceivedData[timeGenerated][serverName] = avgValue;
                serverTotals.bytes[serverName] += avgValue;
            } else if (objectName === 'packets_sent_rate') {
                if (!packetsSentData[timeGenerated]) packetsSentData[timeGenerated] = {};
                packetsSentData[timeGenerated][serverName] = avgValue;
                serverTotals.packets[serverName] += avgValue;
            } else if (objectName === 'packets_received_rate') {
                if (!packetsReceivedData[timeGenerated]) packetsReceivedData[timeGenerated] = {};
                packetsReceivedData[timeGenerated][serverName] = avgValue;
                serverTotals.packets[serverName] += avgValue;
            } else if (objectName === 'network_in_total') {
                if (!networkInData[timeGenerated]) networkInData[timeGenerated] = {};
                networkInData[timeGenerated][serverName] = avgValue;
                serverTotals.total[serverName] += avgValue;
            } else if (objectName === 'network_out_total') {
                if (!networkOutData[timeGenerated]) networkOutData[timeGenerated] = {};
                networkOutData[timeGenerated][serverName] = avgValue;
                serverTotals.total[serverName] += avgValue;
            }
        });

        // Set all servers
        const serversList = Array.from(serversSet).sort();
        setAllServers(serversList);

        // Find server with highest values for each metric type
        const getTopServer = (totals) => {
            let topServer = null;
            let maxTotal = -1;
            Object.keys(totals).forEach(server => {
                if (totals[server] > maxTotal) {
                    maxTotal = totals[server];
                    topServer = server;
                }
            });
            return topServer;
        };

        const topServerForPackets = getTopServer(serverTotals.packets);

        // Initialize selected servers if empty - select top server by default
        if (selectedServers.length === 0 && serversSet.size > 0) {
            const topServer = topServerForPackets || serversList[0];
            if (topServer) {
                setSelectedServers([topServer]);
            }
        }

    }, [networkMetrics]);

    // Create graph data when selectedServers changes
    useEffect(() => {
        if (!networkMetrics || Object.keys(networkMetrics).length === 0 || !networkMetrics.ObjectName) {
            return;
        }

        const bytesSentData = {};
        const bytesReceivedData = {};
        const packetsSentData = {};
        const packetsReceivedData = {};
        const networkInData = {};
        const networkOutData = {};
        const timestamps = new Set();

        Object.keys(networkMetrics.TimeGenerated || {}).forEach((index) => {
            const objectName = networkMetrics.ObjectName[index];
            const timeGenerated = networkMetrics.TimeGenerated[index];
            const avgValue = networkMetrics.AvgValue[index];
            const serverName = networkMetrics.ServerName[index];

            timestamps.add(timeGenerated);

            if (objectName === 'bytes_sent_rate') {
                if (!bytesSentData[timeGenerated]) bytesSentData[timeGenerated] = {};
                bytesSentData[timeGenerated][serverName] = avgValue;
            } else if (objectName === 'bytes_received_rate') {
                if (!bytesReceivedData[timeGenerated]) bytesReceivedData[timeGenerated] = {};
                bytesReceivedData[timeGenerated][serverName] = avgValue;
            } else if (objectName === 'packets_sent_rate') {
                if (!packetsSentData[timeGenerated]) packetsSentData[timeGenerated] = {};
                packetsSentData[timeGenerated][serverName] = avgValue;
            } else if (objectName === 'packets_received_rate') {
                if (!packetsReceivedData[timeGenerated]) packetsReceivedData[timeGenerated] = {};
                packetsReceivedData[timeGenerated][serverName] = avgValue;
            } else if (objectName === 'network_in_total') {
                if (!networkInData[timeGenerated]) networkInData[timeGenerated] = {};
                networkInData[timeGenerated][serverName] = avgValue;
            } else if (objectName === 'network_out_total') {
                if (!networkOutData[timeGenerated]) networkOutData[timeGenerated] = {};
                networkOutData[timeGenerated][serverName] = avgValue;
            }
        });

        // Create graph data helper function
        const createNetworkGraphData = (sentData, receivedData, useInOutLabels = false) => {
            const sortedTimestamps = Array.from(timestamps).sort();

            // Determine which servers to show
            const serversToShow = selectedServers.length > 0 ? selectedServers : allServers.slice(0, 1);

            const firstLabel = useInOutLabels ? "Out" : "Sent";
            const secondLabel = useInOutLabels ? "In" : "Received";

            return sortedTimestamps.map(time => {
                const dataPoint = { name: time };

                serversToShow.forEach(server => {
                    if (sentData[time] && sentData[time][server] !== undefined) {
                        dataPoint[`${server} (${firstLabel})`] = sentData[time][server];
                    }
                    if (receivedData[time] && receivedData[time][server] !== undefined) {
                        dataPoint[`${server} (${secondLabel})`] = receivedData[time][server];
                    }
                });

                return dataPoint;
 }).filter(dataPoint => Object.keys(dataPoint).length > 1);

        };

        // Create graph data for each metric type
        const bytesData = createNetworkGraphData(bytesSentData, bytesReceivedData, false);
        const packetsData = createNetworkGraphData(packetsSentData, packetsReceivedData, false);
        const totalData = createNetworkGraphData(networkOutData, networkInData, true);

        setBytesGraphData(bytesData);
        setPacketsGraphData(packetsData);
        setTotalGraphData(totalData);

    }, [networkMetrics, selectedServers, allServers]);

    const handleServerChange = (event, newValue) => {
        setSelectedServers(newValue);
    };

    // Accordion expand state - CrowdStrike open by default, Network Metrics Overview collapsed.
    const [networkExpanded, setNetworkExpanded] = useState(false);
    const [crowdstrikeExpanded, setCrowdstrikeExpanded] = useState(true);

    // Whole page waits until both the network data and the Moxa presence check are done.
    const pageLoading = loading || moxaLatestLoading;

    // Render
    return (
        <Box sx={{ minHeight: isBladeView ? "auto" : "100vh", bgcolor: "#FFFFFF" }}>
            {!isBladeView && (
                <Paper elevation={0} sx={{ borderBottom: "1px solid #E6E8EE", minHeight: { xs: 40, sm: 48 }, px: { xs: 1, sm: 2 }, py: 1, display: "flex", alignItems: "center", gap: 1.5, bgcolor: "#fff" }}>
                    <Typography sx={{ fontSize: { xs: 11, sm: 12, md: 13 }, fontWeight: 800, color: "#111827" }}>
                        {appName?.toUpperCase() || ""} - Network Metrics
                    </Typography>
                </Paper>
            )}

            {pageLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
                    <CircularProgress_Styled loadingWhat="Loading Network Metrics" fetchingFor="Fetching network performance data..." />
                </Box>
            ) : (
            <Box sx={{ px: { xs: 1, sm: 2 }, py: 2 }}>
                {/* Network Metrics Overview accordion */}
                <Accordion
                    expanded={networkExpanded}
                    onChange={() => setNetworkExpanded((prev) => !prev)}
                    disableGutters
                    elevation={0}
                    sx={{ border: "1px solid #E6E8EE", borderRadius: 2, mb: 2, '&:before': { display: 'none' }, overflow: 'hidden' }}
                >
                    <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: "#F9FAFB", minHeight: 48 }}>
                        <Typography sx={{ fontSize: { xs: 12, sm: 13, md: 14 }, fontWeight: 800, color: "#111827" }}>Server NIC Monitoring</Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{ p: { xs: 1, sm: 2 } }}>
                        {loading && (
                            <Box sx={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
                                <CircularProgress_Styled loadingWhat="Loading Network Metrics" fetchingFor="Fetching network performance data..." />
                            </Box>
                        )}

                        {error && (
                            <Alert severity="error" sx={{ mb: 2, fontSize: { xs: 10, sm: 11, md: 12 } }}>{error}</Alert>
                        )}

                        {!loading && !error && (!networkMetrics || Object.keys(networkMetrics || {}).length === 0) && (
                    <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, p: { xs: 2, sm: 3 }, textAlign: 'center' }}>
                        <Typography sx={{ fontSize: { xs: 11, sm: 12, md: 13 }, color: '#F59E0B' }}>No Network Metrics data available</Typography>
                    </Paper>
                )}

                        {!loading && networkMetrics && Object.keys(networkMetrics || {}).length > 0 && (
                            <>
                        {/* Server Filter */}
                        <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, p: { xs: 1, sm: 2 }, mb: 2 }}>
                            <Grid container spacing={{ xs: 1, sm: 2 }} alignItems="center">
                                <Grid item xs={12}>
                                    <Autocomplete
                                        size="small"
                                        multiple
                                        options={['Select All', ...allServers]}
                                        value={selectedServers}
                                        onChange={(event, newValue) => {
                                            if (newValue.includes('Select All')) {
                                                setSelectedServers(selectedServers.length === allServers.length ? [] : allServers);
                                            } else {
                                                setSelectedServers(newValue);
                                            }
                                        }}
                                        fullWidth
                                        renderInput={(params) => (
                                            <TextField {...params} label="Filter by Server" placeholder="Select Servers" size="small"
                                                sx={{ '& .MuiInputBase-input': { fontSize: { xs: 10, sm: 11, md: 12 } } }} />
                                        )}
                                        renderTags={(value, getTagProps) =>
                                            value.length === allServers.length
                                                ? [<Chip key="all" label="All Servers" size="small" sx={{ fontSize: { xs: 9, sm: 10 }, height: { xs: 18, sm: 20 } }} />]
                                                : value.slice(0, 3).map((option, index) => (
                                                    <Chip
                                                        {...getTagProps({ index })}
                                                        key={option}
                                                        label={option}
                                                        size="small"
                                                        sx={{ fontSize: { xs: 9, sm: 10 }, height: { xs: 18, sm: 20 } }}
                                                    />
                                                )).concat(value.length > 3 ? [<Chip key="more" label={`+${value.length - 3}`} size="small" sx={{ fontSize: { xs: 9, sm: 10 }, height: { xs: 18, sm: 20 } }} />] : [])
                                        }
                                        renderOption={(props, option) => (
                                            <li {...props} style={{ fontWeight: option === 'Select All' ? 600 : 400, fontSize: 'inherit' }}>
                                                {option === 'Select All' ? (selectedServers.length === allServers.length ? 'Select All' : 'Select All') : option}
                                            </li>
                                        )}
                                    />
                                </Grid>
                            </Grid>
                        </Paper>

                        {/* Three Graphs in a Grid */}
                        <Grid container spacing={{ xs: 1, sm: 2 }}>
                            {/* Packets Graph */}
                            <Grid item xs={12} >
                                <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, overflow: "visible", height: '100%', display: 'flex', flexDirection: 'column' }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: { xs: 1, sm: 2 }, py: 1.5 }}>
                                        <Typography sx={{ fontSize: { xs: 11, sm: 12, md: 13 }, fontWeight: 800, color: '#111827' }}>
                                            Packets Sent/Received
                                        </Typography>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                            <Tooltip title="Network packet insights" arrow>
                                                <IconButton size="small" onClick={() => setPatternPaneOpen(true)} sx={{ p: 0.25, color: '#00338E' }}>
                                                    <InsightsOutlined sx={{ fontSize: { xs: 15, sm: 17 } }} />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Shows packets sent and received per second over time" arrow>
                                                <InfoOutlined sx={{ fontSize: { xs: 14, sm: 16 }, color: '#6B7280', cursor: 'pointer' }} />
                                            </Tooltip>
                                        </Box>
                                        <Tooltip title="Shows packets sent and received per second over time" arrow>
                                            <InfoOutlined sx={{ fontSize: { xs: 14, sm: 16 }, color: '#6B7280', cursor: 'pointer' }} />
                                        </Tooltip>
                                    </Box>
                                    <Divider sx={{ borderColor: "#E6E8EE" }} />
                                    <Box sx={{ flex: 1, minHeight: 0, height: isBladeView ? 220 : 280, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'visible', py: 1 }}>
                                        {!packetsGraphData || packetsGraphData.length === 0 ? (
                                            <Typography sx={{ fontSize: { xs: 10, sm: 11, md: 12 }, color: "#F59E0B" }}>No Graph Data</Typography>
                                        ) : (
                                            <Box sx={{ width: '100%', height: '100%' }}>
                                                <AreaLineChart type="network" data={packetsGraphData} yAxisLabel="Packets/sec" />
                                            </Box>
                                        )}
                                    </Box>
                                </Paper>
                            </Grid>

                            {/* Bytes Graph */}
                            <Grid item xs={12}>
                                <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, overflow: "visible", height: '100%', display: 'flex', flexDirection: 'column' }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: { xs: 1, sm: 2 }, py: 1.5 }}>
                                        <Typography sx={{ fontSize: { xs: 11, sm: 12, md: 13 }, fontWeight: 800, color: '#111827' }}>
                                            Bytes Sent/Received
                                        </Typography>
                                        <Tooltip title="Shows bytes sent and received per second over time" arrow>
                                            <InfoOutlined sx={{ fontSize: { xs: 14, sm: 16 }, color: '#6B7280', cursor: 'pointer' }} />
                                        </Tooltip>
                                    </Box>
                                    <Divider sx={{ borderColor: "#E6E8EE" }} />
                                    <Box sx={{ flex: 1, minHeight: 0, height: isBladeView ? 220 : 280, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'visible', py: 1 }}>
                                        {!bytesGraphData || bytesGraphData.length === 0 ? (
                                            <Typography sx={{ fontSize: { xs: 10, sm: 11, md: 12 }, color: "#F59E0B" }}>No Graph Data</Typography>
                                        ) : (
                                            <Box sx={{ width: '100%', height: '100%' }}>
                                                <AreaLineChart type="network" data={bytesGraphData} yAxisLabel="Bytes/sec" />
                                            </Box>
                                        )}
                                    </Box>
                                </Paper>
                            </Grid>

                            {/* Network Total Graph */}
                            <Grid item xs={12} >
                                <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, overflow: "visible", height: '100%', display: 'flex', flexDirection: 'column' }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: { xs: 1, sm: 2 }, py: 1.5 }}>
                                        <Typography sx={{ fontSize: { xs: 11, sm: 12, md: 13 }, fontWeight: 800, color: '#111827' }}>
                                            Network In/Out Total
                                        </Typography>
                                        <Tooltip title="Shows total network in and out bytes over time" arrow>
                                            <InfoOutlined sx={{ fontSize: { xs: 14, sm: 16 }, color: '#6B7280', cursor: 'pointer' }} />
                                        </Tooltip>
                                    </Box>
                                    <Divider sx={{ borderColor: "#E6E8EE" }} />
                                    <Box sx={{ flex: 1, minHeight: 0, height: isBladeView ? 220 : 280, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'visible', py: 1 }}>
                                        {!totalGraphData || totalGraphData.length === 0 ? (
                                            <Typography sx={{ fontSize: { xs: 10, sm: 11, md: 12 }, color: "#F59E0B" }}>No Graph Data</Typography>
                                        ) : (
                                            <Box sx={{ width: '100%', height: '100%' }}>
                                                <AreaLineChart type="network" data={totalGraphData} yAxisLabel="Total Bytes" />
                                            </Box>
                                        )}
                                    </Box>
                                </Paper>
                            </Grid>
                        </Grid>
                    </>
                )}
                    </AccordionDetails>
                </Accordion>

                {/* Top Talkers (CrowdStrike) accordion - open by default */}
                <Accordion
                    expanded={crowdstrikeExpanded}
                    onChange={() => setCrowdstrikeExpanded((prev) => !prev)}
                    disableGutters
                    elevation={0}
                    sx={{ border: "1px solid #E6E8EE", borderRadius: 2, '&:before': { display: 'none' }, overflow: 'hidden' }}
                >
                    <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: "#F9FAFB", minHeight: 48 }}>
                        <Typography sx={{ fontSize: { xs: 12, sm: 13, md: 14 }, fontWeight: 800, color: "#111827" }}>Port Level Network Monitoring</Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{ p: { xs: 1, sm: 2 } }}>
                        <CrowdstrikeTopTalkers
                            date={date}
                            preferredTZ={preferredTZ}
                            appName={appName}
                            globalFilterData={globalFilterData}
                            isBladeView={isBladeView}
                            hideHeader
                        />
                    </AccordionDetails>
                </Accordion>

                {/* Moxa Switch Monitoring accordion - only when Moxa switches exist for this app */}
                {hasMoxa && (
                <Accordion
                    expanded={moxaExpanded}
                    onChange={() => setMoxaExpanded((prev) => !prev)}
                    disableGutters
                    elevation={0}
                    sx={{ border: "1px solid #E6E8EE", borderRadius: 2, mt: 2, '&:before': { display: 'none' }, overflow: 'hidden' }}
                >
                    <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: "#F9FAFB", minHeight: 48 }}>
                        <Typography sx={{ fontSize: { xs: 12, sm: 13, md: 14 }, fontWeight: 800, color: "#111827" }}>Moxa Switch Monitoring</Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{ p: { xs: 1, sm: 2 } }}>
                        <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, overflow: "hidden" }}>
                            {/* Header + filters */}
                            <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #E6E8EE' }}>
                                <Grid container alignItems="center" flexWrap="wrap" gap={1}>
                                    <Typography sx={{ fontSize: { xs: 12, sm: 13 }, fontWeight: 800, color: '#111827', mr: 1 }}>
                                        Moxa Switch Status
                                    </Typography>
                                    <Grid container alignItems="center" gap={0.75} flex={1} minWidth={220} maxWidth={360}>
                                        <Autocomplete
                                            multiple
                                            size="small"
                                            value={moxaIpFilter}
                                            onChange={(e, newValue) => { setMoxaIpFilter(newValue || []); setMoxaTablePage(0); }}
                                            options={getMoxaIpOptions()}
                                            renderInput={(params) => (
                                                <TextField {...params} placeholder={moxaIpFilter.length === 0 ? "Filter by Moxa IP..." : ""}
                                                    sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#fff', fontSize: { xs: 10, sm: 11, md: 12 }, borderRadius: 2, minHeight: 38, maxHeight: 70, overflowY: 'auto', flexWrap: 'wrap', alignContent: 'flex-start', '& fieldset': { border: 'none' } } }} />
                                            )}
                                            renderTags={(tagValue, getTagProps) => tagValue.map((option, index) => (
                                                <Chip label={String(option)} {...getTagProps({ index })} size="small" sx={{ fontSize: { xs: 9, sm: 10, md: 11 }, height: 24, maxWidth: '150px' }} />
                                            ))}
                                            sx={{ flex: 1, minWidth: 0 }}
                                        />
                                    </Grid>
                                    <Grid container gap={1} flexWrap="wrap" sx={{ ml: 'auto' }} flexShrink={0} width="auto">
                                        {[
                                            { value: 'all', label: `All (${moxaCounts.total})`, border: '#757575', bg: '#EEEEEE', text: '#424242' },
                                            { value: 'running', label: `Running (${moxaCounts.running})`, border: '#4CAF50', bg: '#EAF6EA', text: '#2E7D32' },
                                            { value: 'stopped', label: `Not Running (${moxaCounts.stopped})`, border: '#D32F2F', bg: '#FFEBEE', text: '#C62828' }
                                        ].map((status) => {
                                            const isActive = moxaStatusFilter === status.value;
                                            return (
                                                <Grid key={status.value} px={1.5} py={0.3} borderRadius={999}
                                                    bgcolor={isActive ? status.border : status.bg}
                                                    onClick={() => { setMoxaStatusFilter(status.value); setMoxaTablePage(0); }}
                                                    sx={{ cursor: 'pointer', transition: 'all 0.2s', '&:hover': { transform: 'scale(1.05)', boxShadow: 1 } }}>
                                                    <Typography fontSize={{ xs: 9, sm: 10, md: 11 }} fontWeight={600} color={isActive ? '#fff' : status.text}>
                                                        {status.label}
                                                    </Typography>
                                                </Grid>
                                            );
                                        })}
                                    </Grid>
                                </Grid>
                            </Box>

                            {/* Table */}
                            <TableContainer component={Paper} elevation={0}>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow sx={{ '& th': { bgcolor: '#00338e' } }}>
                                            <TableCell sx={{ color: '#fff', fontWeight: 700, fontSize: 13, width: 50, py: 1.5, bgcolor: '#00338e' }} />
                                            <TableCell sx={{ color: '#fff', fontWeight: 700, fontSize: 13, py: 1.5, bgcolor: '#00338e' }}>Moxa IP</TableCell>
                                            <TableCell sx={{ color: '#fff', fontWeight: 700, fontSize: 13, py: 1.5, bgcolor: '#00338e' }}>Application CI</TableCell>
                                            <TableCell sx={{ color: '#fff', fontWeight: 700, fontSize: 13, py: 1.5, bgcolor: '#00338e' }}>Current Status</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {(() => {
                                            const filteredIps = getFilteredMoxaIps();
                                            if (filteredIps.length === 0) {
                                                return (
                                                    <TableRow>
                                                        <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                                                            <Typography sx={{ fontSize: 12, color: '#6B7280' }}>No Moxa switches match the filter</Typography>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            }
                                            const paginated = filteredIps.slice(moxaTablePage * moxaRowsPerPage, moxaTablePage * moxaRowsPerPage + moxaRowsPerPage);
                                            return paginated.map((ip) => {
                                                const info = moxaLatestByIp[ip];
                                                const running = isMoxaRunning(info.status);
                                                const isExpanded = expandedMoxaRow === ip;
                                                const graphData = getMoxaGraphData(ip);
                                                return (
                                                    <React.Fragment key={ip}>
                                                        <TableRow
                                                            sx={{ '&:hover': { bgcolor: '#f8fafc' }, cursor: 'pointer', borderLeft: `4px solid ${running ? '#4CAF50' : '#D32F2F'}` }}
                                                            onClick={() => setExpandedMoxaRow(isExpanded ? null : ip)}
                                                        >
                                                            <TableCell sx={{ py: 1 }}>
                                                                <IconButton size="small">
                                                                    {isExpanded ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                                                                </IconButton>
                                                            </TableCell>
                                                            <TableCell sx={{ fontSize: 12, fontWeight: 600 }}>{ip}</TableCell>
                                                            <TableCell sx={{ fontSize: 12 }}>{info.appCI || 'N/A'}</TableCell>
                                                            <TableCell>
                                                                <Grid container sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1.5, py: 0.5, borderRadius: 999, bgcolor: running ? '#EAF6EA' : '#FFEBEE', border: `1px solid ${running ? '#4CAF50' : '#D32F2F'}`, width: 'auto' }}>
                                                                    <Grid sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: running ? '#4CAF50' : '#D32F2F' }} />
                                                                    <Typography sx={{ fontSize: 11, fontWeight: 700, color: running ? '#2E7D32' : '#C62828' }}>
                                                                        {running ? 'Running' : 'Not Running'}
                                                                    </Typography>
                                                                </Grid>
                                                            </TableCell>
                                                        </TableRow>
                                                        {isExpanded && (
                                                            <TableRow>
                                                                <TableCell colSpan={4} sx={{ p: 0, border: 'none', bgcolor: '#f8fafc' }}>
                                                                    <Box sx={{ p: 2, borderBottom: '1px solid #E6E8EE' }}>
                                                                        <Paper elevation={0} sx={{ border: '1px solid #E6E8EE', borderRadius: 2, bgcolor: '#fff', height: 300, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                                                            <Box sx={{ px: 1.5, py: 0.75, borderBottom: '1px solid #E6E8EE', bgcolor: '#f8fafc' }}>
                                                                                <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#111827' }}>Historical Trend - {ip}</Typography>
                                                                            </Box>
                                                                            <Box sx={{ flex: 1, minHeight: 0, position: 'relative', p: 1 }}>
                                                                                {moxaHistLoading ? (
                                                                                    <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                                        <CircularProgress_Styled loadingWhat="Loading Historical Trend" fetchingFor="Fetching Moxa switch trend..." />
                                                                                    </Box>
                                                                                ) : graphData.length > 0 ? (
                                                                                    <Box sx={{ position: 'absolute', top: 8, left: 8, right: 8, bottom: 8 }}>
                                                                                        <AreaLineChart type="service" data={graphData} key={`moxa-${ip}`} yAxisLabel={"Status"} domain={[0, 1]} />
                                                                                    </Box>
                                                                                ) : (
                                                                                    <Typography sx={{ fontSize: 11, color: '#6B7280', textAlign: 'center', py: 3 }}>No historical data available</Typography>
                                                                                )}
                                                                            </Box>
                                                                        </Paper>
                                                                    </Box>
                                                                </TableCell>
                                                            </TableRow>
                                                        )}
                                                    </React.Fragment>
                                                );
                                            });
                                        })()}
                                    </TableBody>
                                </Table>
                            </TableContainer>

                            <TablePagination
                                component="div"
                                count={getFilteredMoxaIps().length}
                                page={moxaTablePage}
                                onPageChange={(e, newPage) => setMoxaTablePage(newPage)}
                                rowsPerPage={moxaRowsPerPage}
                                onRowsPerPageChange={(e) => { setMoxaRowsPerPage(parseInt(e.target.value, 10)); setMoxaTablePage(0); }}
                                rowsPerPageOptions={[5, 10, 25, 50]}
                                sx={{ borderTop: '1px solid #E6E8EE', '& .MuiTablePagination-toolbar': { minHeight: 48 } }}
                            />
                        </Paper>
                    </AccordionDetails>
                </Accordion>
                )}
            </Box>
            )}

            <PatternInsightsPane
                open={patternPaneOpen}
                onClose={() => setPatternPaneOpen(false)}
                domain="network"
                metric="Packets"
                servers={selectedServers && selectedServers.length ? selectedServers : allServers}
            />
        </Box>
    );
};

export default NetworkMetrics;
