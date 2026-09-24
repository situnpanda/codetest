import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Box, Paper, Typography, Divider, TextField, Chip, Autocomplete, Tooltip, Alert, Grid, CircularProgress
} from '@mui/material';
import { InfoOutlined, HubOutlined } from '@mui/icons-material';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import AreaLineChart from '../../shared/LineChart/AreaLineChart';
import { fetchCrowdstrikeConnectionData } from '../../shared/APIs/fetchAPIs';
import { convertTimeToPreferredTZ_ToUtc } from '../../shared/Timestamp/PreferenceConversion';
import CircularProgress_Styled from '../../shared/UI Components/CircularProgress';

dayjs.extend(utc);
dayjs.extend(timezone);

const toPreferredTZ = (utcLabel, preferredTZ) => {
    if (!preferredTZ) return utcLabel;
    const converted = dayjs.utc(utcLabel, 'YYYY-MM-DD HH:mm:ss').tz(preferredTZ);
    return converted.isValid() ? converted.format('YYYY-MM-DD HH:mm:ss') : utcLabel;
};


const buildChartRows = (serverData, visiblePorts, preferredTZ, selectedIPs) => {
    const timeBuckets = serverData?.timeBuckets || [];
    const series = serverData?.series || [];
    const visible = new Set(visiblePorts);
    const ipFilter = new Set(selectedIPs);
    const filterOn = ipFilter.size > 0;

    const rows = timeBuckets.map((t) => ({ name: toPreferredTZ(t, preferredTZ) }));
    const ipLookup = {};
    const allKeys = new Set();
    series.forEach((s) => {
        if (visible.size > 0 && !visible.has(s.port)) return;
        (s.points || []).forEach((p, i) => {
            if (!rows[i]) return;
            const ips = p.ips || [];
            const rowName = rows[i].name;
            if (!ipLookup[rowName]) ipLookup[rowName] = {};
            if (filterOn) {
                ips.filter((ip) => ipFilter.has(ip)).forEach((ip) => {
                    const key = `Port ${s.port} - ${ip}`;
                    allKeys.add(key);
                    rows[i][key] = (rows[i][key] || 0) + 1;
                    ipLookup[rowName][key] = [ip];
                });
            } else {
                const key = `Port ${s.port}`;
                allKeys.add(key);
                rows[i][key] = p.uniqueIPs;
                ipLookup[rowName][key] = ips;
            }
        });
    });
    if (rows.length > 0) {
        allKeys.forEach((key) => {
            if (!(key in rows[0])) rows[0][key] = null;
        });
    }
    return { rows, ipLookup };
};

const ServerCard = ({ serverData, isBladeView, preferredTZ }) => {
    // Direction-aware labels: 'source' mode counts source IPs, 'destination' mode
    // (i.e. filtering by source domain) counts destination IPs.
    const ipType = serverData?.ipType === "destination" ? "destination" : "source";
    const ipLabel = ipType === "destination" ? "Destination" : "Source";

    const allPorts = useMemo(
        () => (serverData?.ports || []).map((p) => p.port),
        [serverData]
    );
    const defaultPorts = useMemo(() => {
        if (serverData?.selectedPorts && serverData.selectedPorts.length > 0) {
            return serverData.selectedPorts;
        }
        return allPorts.slice(0, 1);
    }, [serverData, allPorts]);

    const [selectedPorts, setSelectedPorts] = useState(defaultPorts);

    useEffect(() => {
        setSelectedPorts(defaultPorts);
    }, [defaultPorts]);

    // IPs for the CURRENTLY SELECTED ports only, so the IP dropdown stays
    // consistent with the port filter (ports are mapped to their IPs).
    const allSourceIPs = useMemo(() => {
        const visible = new Set(selectedPorts);
        const set = new Set();
        (serverData?.series || []).forEach((s) => {
            if (visible.size > 0 && !visible.has(s.port)) return;
            (s.points || []).forEach((p) => {
                (p.ips || []).forEach((ip) => set.add(ip));
            });
        });
        return Array.from(set).sort();
    }, [serverData, selectedPorts]);

    // Empty selection = all IPs (no filtering).
    const [selectedIPs, setSelectedIPs] = useState([]);

    useEffect(() => {
        // Drop any previously-selected IPs that no longer exist after a data change.
        setSelectedIPs((prev) => prev.filter((ip) => allSourceIPs.includes(ip)));
    }, [allSourceIPs]);

    const { rows: chartRows, ipLookup } = useMemo(
        () => buildChartRows(serverData, selectedPorts, preferredTZ, selectedIPs),
        [serverData, selectedPorts, preferredTZ, selectedIPs]
    );

    // Tooltip helper: given a time label + "Port <p>" series, return its source IPs.
    const getPointDetails = useMemo(
        () => (rowName, seriesKey) => ipLookup?.[rowName]?.[seriesKey] || null,
        [ipLookup]
    );

    const hasData = allPorts.length > 0;

    return (
        <Grid item xs={12}>
            <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, overflow: "visible", height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: { xs: 1, sm: 2 }, py: 1.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography sx={{ fontSize: { xs: 11, sm: 12, md: 13 }, fontWeight: 800, color: '#111827' }}>
                            {serverData?.serverName || 'Server'}
                        </Typography>
                        <Chip
                            label={serverData?.direction === 'source' ? 'Source' : 'Destination'}
                            size="small"
                            sx={{ fontSize: { xs: 9, sm: 10 }, height: { xs: 18, sm: 20 }, fontWeight: 600,
                                color: serverData?.direction === 'source' ? '#0F766E' : '#1F6FEB',
                                bgcolor: serverData?.direction === 'source' ? 'rgba(15, 118, 110, 0.08)' : 'rgba(31, 111, 235, 0.08)',
                                border: serverData?.direction === 'source' ? '1px solid rgba(15, 118, 110, 0.25)' : '1px solid rgba(31, 111, 235, 0.25)' }}
                        />
                    </Box>
                    <Tooltip title={`Unique ${ipLabel.toLowerCase()} IPs connecting on this server over time, split by destination port`} arrow>
                        <InfoOutlined sx={{ fontSize: { xs: 14, sm: 16 }, color: '#6B7280', cursor: 'pointer' }} />
                    </Tooltip>
                </Box>
                <Divider sx={{ borderColor: "#E6E8EE" }} />

                {hasData && (
                    <Box sx={{ px: { xs: 1, sm: 2 }, py: 1 }}>
                        <Typography sx={{ fontSize: { xs: 9, sm: 10, md: 11 }, color: '#6B7280', mb: 0.75, fontStyle: 'italic' }}>
                            Tip: select the port(s) first, then narrow down to specific {ipLabel.toLowerCase()} IP(s).
                        </Typography>
                        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: { xs: 1, sm: 2 } }}>
                            <Autocomplete
                                size="small"
                                multiple
                                options={allPorts}
                                value={selectedPorts}
                                onChange={(event, newValue) => setSelectedPorts(newValue)}
                                fullWidth
                                renderInput={(params) => (
                                    <TextField {...params} label="Filter by Port" placeholder="Select Ports" size="small"
                                        sx={{ '& .MuiInputBase-input': { fontSize: { xs: 10, sm: 11, md: 12 } } }} />
                                )}
                                renderTags={(value, getTagProps) =>
                                    value.slice(0, 4).map((option, index) => (
                                        <Chip
                                            {...getTagProps({ index })}
                                            key={option}
                                            label={`Port ${option}`}
                                            size="small"
                                            sx={{ fontSize: { xs: 9, sm: 10 }, height: { xs: 18, sm: 20 } }}
                                        />
                                    )).concat(value.length > 4 ? [<Chip key="more" label={`+${value.length - 4}`} size="small" sx={{ fontSize: { xs: 9, sm: 10 }, height: { xs: 18, sm: 20 } }} />] : [])
                                }
                            />
                            <Autocomplete
                                size="small"
                                multiple
                                options={allSourceIPs}
                                value={selectedIPs}
                                onChange={(event, newValue) => setSelectedIPs(newValue)}
                                fullWidth
                                renderInput={(params) => (
                                    <TextField {...params} label={`Filter by ${ipLabel} IP`} placeholder={`All ${ipLabel} IPs`} size="small"
                                    sx={{ '& .MuiInputBase-input': { fontSize: { xs: 10, sm: 11, md: 12 } } }} />
                            )}
                            renderTags={(value, getTagProps) =>
                                value.slice(0, 3).map((option, index) => (
                                    <Chip
                                        {...getTagProps({ index })}
                                        key={option}
                                        label={option}
                                        size="small"
                                        sx={{ fontSize: { xs: 9, sm: 10 }, height: { xs: 18, sm: 20 } }}
                                    />
                                )).concat(value.length > 3 ? [<Chip key="more" label={`+${value.length - 3}`} size="small" sx={{ fontSize: { xs: 9, sm: 10 }, height: { xs: 18, sm: 20 } }} />] : [])
                            }
                        />
                        </Box>
                    </Box>
                )}

                <Box sx={{ flex: 1, minHeight: 0, height: isBladeView ? 220 : 280, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'visible', py: 1 }}>
                    {!hasData || selectedPorts.length === 0 || chartRows.length === 0 ? (
                        <Typography sx={{ fontSize: { xs: 10, sm: 11, md: 12 }, color: "#F59E0B" }}>No Graph Data</Typography>
                    ) : (
                        <Box sx={{ width: '100%', height: '100%' }}>
                            <AreaLineChart type="network" data={chartRows} yAxisLabel={`Unique ${ipLabel} IPs`} getPointDetails={getPointDetails} />
                        </Box>
                    )}
                </Box>
            </Paper>
        </Grid>
    );
};

const CrowdstrikeTopTalkers = ({ date, preferredTZ, appName, globalFilterData, isBladeView = false, hideHeader = false }) => {
    
    const availableServers = useMemo(() => {
        if (!appName || !globalFilterData || !globalFilterData["AppCI"] || !globalFilterData["ServerName"]) {
            return [];
        }
        const target = appName.toUpperCase();
        const names = Object.keys(globalFilterData["AppCI"])
            .filter((k) => String(globalFilterData["AppCI"][k]).toUpperCase() === target)
            .map((k) => globalFilterData["ServerName"][k])
            .filter(Boolean);
        // De-duplicate while preserving order.
        return Array.from(new Set(names));
    }, [appName, globalFilterData]);

    // Independent selections per direction; both dropdowns are always active.
    //   destination -> filter destination.domain, Y-axis = unique source IPs.
    //   source      -> filter source.domain,      Y-axis = unique destination IPs.
    const [destServers, setDestServers] = useState([]);
    const [sourceServers, setSourceServers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    // Per-(direction, server) cache so already-fetched graphs aren't re-fetched.
    // Keyed by `${direction}::${serverName}` since the same server can appear in both.
    const [cache, setCache] = useState({});
    // The time window the cache belongs to; if it changes, the cache is dropped.
    // Kept in a ref (not state) so the fetch effect always sees the latest value and
    // never wipes the cache due to a stale closure firing twice.
    const windowKeyRef = useRef("");

    const cacheKey = (direction, server) => `${direction}::${server}`;

    // Data to display = cached data for every selected server across both directions.
    const serversData = useMemo(() => {
        const dest = destServers.map((s) => cache[cacheKey("destination", s)]);
        const src = sourceServers.map((s) => cache[cacheKey("source", s)]);
        return [...dest, ...src].filter(Boolean);
    }, [destServers, sourceServers, cache]);

    const totalSelected = destServers.length + sourceServers.length;

    // Prune selections that are no longer valid when the server list changes.
    useEffect(() => {
        setDestServers((prev) => prev.filter((s) => availableServers.includes(s)));
        setSourceServers((prev) => prev.filter((s) => availableServers.includes(s)));
    }, [availableServers]);

    useEffect(() => {
        const fetchData = async () => {
            if (!date?.startDate || !date?.endDate) return;

            const startTime = convertTimeToPreferredTZ_ToUtc(date.startDate);
            const endTime = convertTimeToPreferredTZ_ToUtc(date.endDate);
            const key = `${startTime}|${endTime}`;

            // If the time window changed, the cache is stale -> drop it and refetch.
            let baseCache = cache;
            if (key !== windowKeyRef.current) {
                windowKeyRef.current = key;
                baseCache = {};
                setCache({});
            }

            // Which (direction, server) pairs are not yet cached for this window.
            const jobs = [
                { direction: "destination", servers: destServers },
                { direction: "source", servers: sourceServers },
            ]
                .map(({ direction, servers }) => ({
                    direction,
                    missing: servers.filter((s) => !baseCache[cacheKey(direction, s)]),
                }))
                .filter((j) => j.missing.length > 0);

            if (jobs.length === 0) {
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                setError("");
                const results = await Promise.allSettled(
                    jobs.flatMap(({ direction, missing }) =>
                        missing.map(async (server) => {
                            const params = { serverNames: [server], startTime, endTime, direction };
                            const result = await fetchCrowdstrikeConnectionData(params);
                            const fetched = result?.servers || [];
                            const ipType = result?.ipType;
                            setCache((prev) => {
                                const next = { ...prev };
                                fetched.forEach((sd) => {
                                    next[cacheKey(direction, sd.serverName)] = { ...sd, ipType, direction };
                                });
                                return next;
                            });
                        })
                    )
                );
                if (results.length > 0 && results.every((r) => r.status === "rejected")) {
                    setError(results[0]?.reason?.message || "Failed to load connection data");
                }
            } catch (err) {
                console.error("CrowdstrikeTopTalkers error:", err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [destServers, sourceServers, date]);

    // Handle selection for a given dropdown ('destination' | 'source').
    const handleServerSelect = (mode, val) => {
        const setter = mode === "destination" ? setDestServers : setSourceServers;
        const current = mode === "destination" ? destServers : sourceServers;
        if (val.includes("Select All")) {
            const isAll = current.length === availableServers.length;
            setter(isAll ? [] : availableServers);
        } else {
            setter(val);
        }
    };

    // Renders one server dropdown for a given direction ('source' | 'destination').
    const renderServerDropdown = (mode, label) => {
        const selected = mode === "destination" ? destServers : sourceServers;
        return (
        <Autocomplete
            size="small"
            multiple
            disableCloseOnSelect
            options={["Select All", ...availableServers]}
            value={selected}
            onChange={(e, val) => handleServerSelect(mode, val)}
            sx={{ minWidth: { xs: '100%', sm: 200 }, flex: 1, maxWidth: { sm: 360 } }}
            renderOption={(props, opt) => {
                if (opt === "Select All") {
                    return (
                        <Box {...props} key={opt} sx={{ py: 0.5, px: 1.5, fontWeight: 600, color: '#1976d2', borderBottom: '1px solid #E0E0E0' }}>
                            <Typography variant="body2" sx={{ fontSize: { xs: 11, sm: 12 }, fontWeight: 600 }}>Select All</Typography>
                        </Box>
                    );
                }
                const isSel = selected.includes(opt);
                return (
                    <Box {...props} key={opt} sx={{ py: 0.5, px: 1.5, bgcolor: isSel ? 'rgba(0, 51, 142, 0.08)' : 'transparent',
                        borderLeft: isSel ? '3px solid #00338e' : '3px solid transparent', '&:hover': { bgcolor: isSel ? 'rgba(0, 51, 142, 0.12)' : 'rgba(0,0,0,0.04)' } }}>
                        <Typography variant="body2" sx={{ fontSize: { xs: 11, sm: 12 }, fontWeight: isSel ? 600 : 400 }}>{opt}</Typography>
                    </Box>
                );
            }}
            renderInput={(params) => (
                <TextField {...params} label={label} placeholder={label} size="small"
                    sx={{ "& .MuiOutlinedInput-root": { fontSize: { xs: 11, sm: 12 } } }} />
            )}
            renderTags={(value, getTagProps) => {
                const chipLimit = 2;
                return (
                    <>
                        {value.slice(0, chipLimit).map((option, index) => (
                            <Chip {...getTagProps({ index })} key={option} label={option} size="small"
                                sx={{ fontSize: { xs: 10, sm: 11 }, height: { xs: 20, sm: 22 }, backgroundColor: "#fff", border: "1px solid #E0E0E0" }} />
                        ))}
                        {value.length > chipLimit && (
                            <Typography sx={{ fontSize: { xs: 10, sm: 11 }, color: '#1976d2', ml: 0.5, fontWeight: 500 }}>
                                +{value.length - chipLimit}
                            </Typography>
                        )}
                    </>
                );
            }}
        />
        );
    };

    return (
        <Box sx={{ mt: hideHeader ? 0 : 2 }}>
            {!hideHeader && (
                <Typography sx={{ fontSize: { xs: 12, sm: 13, md: 14 }, fontWeight: 800, color: "#111827", mb: 2 }}>
                    Port Level Network Monitoring
                </Typography>
            )}

            {/* Source & Destination server filters - both always active.
                Selections in each produce their own graphs below. */}
            {availableServers.length > 0 && (
                <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, p: { xs: 1, sm: 2 }, mb: 2 }}>
                    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: { xs: 1, sm: 2 } }}>
                        {renderServerDropdown('destination', 'Destination Server')}
                        {renderServerDropdown('source', 'Source Server')}
                    </Box>
                </Paper>
            )}

            {/* Full overlay only on the initial load (nothing to show yet). */}
            {loading && serversData.length === 0 && (
                <Box sx={{ position: 'relative', minHeight: 220 }}>
                    <CircularProgress_Styled loadingWhat="Loading Port Details" fetchingFor="Fetching CrowdStrike connection data..." />
                </Box>
            )}

            {/* When adding a server to existing graphs, show a small inline hint instead of hiding them. */}
            {loading && serversData.length > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: { xs: 1, sm: 2 }, py: 1 }}>
                    <CircularProgress size={16} thickness={4} sx={{ color: '#00338e' }} />
                    <Typography sx={{ fontSize: { xs: 10, sm: 11, md: 12 }, color: '#6B7280' }}>Loading additional server…</Typography>
                </Box>
            )}

            {error && (
                <Alert severity="error" sx={{ mb: 2, fontSize: { xs: 10, sm: 11, md: 12 } }}>{error}</Alert>
            )}

            {!loading && !error && totalSelected === 0 && (
                <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, p: { xs: 2, sm: 3 }, textAlign: 'center' }}>
                    <Typography sx={{ fontSize: { xs: 11, sm: 12, md: 13 }, color: '#F59E0B' }}>Select at least one source or destination server to view Port Details</Typography>
                </Paper>
            )}

            {!loading && !error && totalSelected > 0 && serversData.length === 0 && (
                <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, p: { xs: 2, sm: 3 }, textAlign: 'center' }}>
                    <Typography sx={{ fontSize: { xs: 11, sm: 12, md: 13 }, color: '#F59E0B' }}>No Port data available</Typography>
                </Paper>
            )}

            {!error && serversData.length > 0 && (
                <Grid container spacing={{ xs: 1, sm: 2 }}>
                    {serversData.map((serverData) => (
                        <ServerCard key={`${serverData.direction}-${serverData.serverName}`} serverData={serverData} isBladeView={isBladeView} preferredTZ={preferredTZ} />
                    ))}
                </Grid>
            )}
        </Box>
    );
};

export default CrowdstrikeTopTalkers;
