import React, { useState, useEffect, useMemo } from 'react';
import {
    Box, Paper, Typography, Divider, TextField, Chip, Autocomplete,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    LinearProgress, CircularProgress, Tooltip, Alert, Grid
} from '@mui/material';
import { InfoOutlined } from '@mui/icons-material';
import AreaLineChart from '../../shared/LineChart/AreaLineChart';
import { fetchFileStorageMetrics_fromADX } from '../../shared/APIs/fetchAPIs';
import { convertTimeToPreferredTZ_ToUtc, convertTimeToPreferredTZ_fromUtc } from '../../shared/Timestamp/PreferenceConversion';
import { useLocation } from 'react-router-dom';
import CircularProgress_Styled from '../../shared/UI Components/CircularProgress';

const FileshareMetrics = ({ date, preferredTZ, appName: appNameProp }) => {
    var appName = appNameProp
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [serverFileshareUtilization, setServerFileshareUtilization] = useState({});
    const [serverFileshareUtilizationAvg, setServerFileshareUtilizationAvg] = useState({});
    const [fileShareGraphData, setFileShareGraphData] = useState([]);
    const [selectedAccount, setSelectedAccount] = useState("");
    const [selectedFileshares, setSelectedFileshares] = useState([]);

    // Fetch fileshare data using the correct API
    const fetchFileshareData = async (aggregate) => {
        try {
            if (!appName || !date?.startDate || !date?.endDate) return;

            const params = {
                "Latest Only": aggregate,
                "Application CI": [appName],
                "Start Time": convertTimeToPreferredTZ_ToUtc(date.startDate),
                "End Time": convertTimeToPreferredTZ_ToUtc(date.endDate),
                "Object Name": ["Storage"]
            };

            // console.log("FileshareBeta fetching with params:", params);
            const results = await fetchFileStorageMetrics_fromADX(params);
            // console.log("FileshareBeta results:", results);

            if (results && typeof results === 'object' && Object.keys(results).length > 0) {
                // Convert timestamps from UTC to preferred timezone (IST/PST)
                const convertedResults = convertTimeToPreferredTZ_fromUtc(results);
                if (aggregate) {
                    setServerFileshareUtilizationAvg(convertedResults);
                    // console.log("FileshareBeta Avg data:", convertedResults);
                } else {
                    setServerFileshareUtilization(convertedResults);
                    // console.log("FileshareBeta full data:", convertedResults);
                }
            }
        } catch (err) {
            console.error("FileshareBeta error:", err);
            setError(err.message);
        }
    };

    useEffect(() => {
        const loadData = async () => {
            if (!appName || !date?.startDate || !date?.endDate) {
                setLoading(false);
                return;
            }
            // Keep loading=true if date is not yet set (waiting for Timestamp to initialize)
            if (!date?.startDate || !date?.endDate) {
                // console.log("FileshareBeta: Waiting for date - startDate:", date?.startDate, "endDate:", date?.endDate);
                // Don't set loading to false - keep showing loading indicator
                return;
            }
            
            setLoading(true);
            setError("");
            
            try {
                await Promise.all([
                    fetchFileshareData(true),
                    fetchFileshareData(false)
                ]);
            } catch (err) {
                console.error("FileshareBeta load error:", err);
            } finally {
                setLoading(false);
            }
        };
        
        loadData();
    }, [appName, date, preferredTZ]);
    const getAllStorageAccounts = () => {
        return serverFileshareUtilizationAvg && Object.keys(serverFileshareUtilizationAvg).length > 0
            ? Array.from(new Set(Object.values(serverFileshareUtilizationAvg["StorageAccountName"] || [])))
            : [];
    };

    const getAllFileshares = () => {
        if (!serverFileshareUtilizationAvg || Object.keys(serverFileshareUtilizationAvg).length === 0) return [];
        return Object.entries(serverFileshareUtilizationAvg["Fileshare"] || {}).map(
            ([index, fileshare]) =>
                `${serverFileshareUtilizationAvg["StorageAccountName"]?.[index] || ""}/${fileshare}`
        );
    };

    const getFilesharesForAccount = (account) => {
        if (!serverFileshareUtilizationAvg || Object.keys(serverFileshareUtilizationAvg).length === 0) return [];
        if (!account) return getAllFileshares();

        return Object.entries(serverFileshareUtilizationAvg["StorageAccountName"] || {})
            .filter(([index, acc]) => acc === account)
            .map(([index]) =>
                `${serverFileshareUtilizationAvg["StorageAccountName"]?.[index] || ""}/${serverFileshareUtilizationAvg["Fileshare"]?.[index] || ""}`
            );
    };

    const getCapacityForFileshare = (uniqueFileshare) => {
        if (!serverFileshareUtilizationAvg || Object.keys(serverFileshareUtilizationAvg).length === 0) return { usedCapacity: 0, provisionedCapacity: 0 };

        const [storageAccount, fileshare] = uniqueFileshare.split("/");

        const index = Object.entries(serverFileshareUtilizationAvg["Fileshare"] || {}).findIndex(
            ([idx, fs]) => fs === fileshare && serverFileshareUtilizationAvg["StorageAccountName"]?.[idx] === storageAccount
        );

        if (index >= 0) {
            const idxStr = Object.keys(serverFileshareUtilizationAvg["Fileshare"] || {})[index];
            return {
                usedCapacity: parseFloat(serverFileshareUtilizationAvg["Used Capacity (GiB)"]?.[idxStr] || 0),
                provisionedCapacity: parseFloat(serverFileshareUtilizationAvg["Provisioned Capacity (GiB)"]?.[idxStr] || 0),
            };
        }
        return { usedCapacity: 0, provisionedCapacity: 0 };
    };

    const handleAccountChange = (account) => {
        setSelectedAccount(account);
        setSelectedFileshares(getFilesharesForAccount(account));
    };

    const createGraphData_FileShare = (fileshares) => {
        if (!serverFileshareUtilization || !serverFileshareUtilization["Fileshare"]) {
            return;
        }

        const graphData = {};

        fileshares.forEach((uniqueFs) => {
            const [storageAccount, fileshare] = uniqueFs.split("/").map((str) => str.trim().toLowerCase());

            Object.keys(serverFileshareUtilization["Fileshare"]).forEach((index) => {
                const fs = serverFileshareUtilization["Fileshare"][index]?.trim().toLowerCase();
                const acc = serverFileshareUtilization["StorageAccountName"]?.[index]?.trim().toLowerCase();
                const timeGenerated = serverFileshareUtilization["TimeGenerated"]?.[index];
                var usedCapacity = parseFloat(serverFileshareUtilization["Used Capacity (GiB)"]?.[index]) || 0;
                var provisionedCapacity = parseFloat(serverFileshareUtilization["Provisioned Capacity (GiB)"]?.[index]) || 0;

                if (!fs || !acc || !timeGenerated || isNaN(usedCapacity)) {
                    return;
                }

                if (fs === fileshare && acc === storageAccount) {
                    if (!graphData[timeGenerated]) {
                        graphData[timeGenerated] = { name: timeGenerated };
                    }
                    const utilizationPercent = provisionedCapacity > 0 ? (usedCapacity / provisionedCapacity) * 100 : 0;
                    graphData[timeGenerated][uniqueFs] = utilizationPercent.toFixed(2);
                }
            });
        });

        // console.log("FileshareBeta graphData:", graphData);
        const formattedGraphData = Object.values(graphData).sort((a, b) => new Date(a.name) - new Date(b.name));
        // console.log("FileshareBeta formattedGraphData:", formattedGraphData);
        setFileShareGraphData(formattedGraphData);
    };

    // Effects for initializing data
    useEffect(() => {
        if (!serverFileshareUtilizationAvg) return;
        if (typeof serverFileshareUtilizationAvg !== 'object') return;
        if (Object.keys(serverFileshareUtilizationAvg).length === 0) return;
        if (!serverFileshareUtilizationAvg["Fileshare"]) return;
        
        if (!selectedAccount && selectedFileshares.length === 0) {
            const allFs = getAllFileshares();
            if (allFs && allFs.length > 0) {
                setSelectedFileshares(allFs);
            }
        }
    }, [serverFileshareUtilizationAvg]);

    useEffect(() => {
        if (!serverFileshareUtilization) return;
        if (typeof serverFileshareUtilization !== 'object') return;
        if (Object.keys(serverFileshareUtilization).length < 2) return;
        if (!serverFileshareUtilization["Fileshare"]) return;
        
        if (selectedFileshares.length > 0) {
            createGraphData_FileShare(selectedFileshares);
        }
    }, [serverFileshareUtilization, selectedFileshares]);

    const sortedFileshares = useMemo(() => {
        if (!selectedFileshares || selectedFileshares.length === 0) return [];
        if (!serverFileshareUtilizationAvg || Object.keys(serverFileshareUtilizationAvg).length === 0) return selectedFileshares;
        
        return [...selectedFileshares].sort((a, b) => {
            const { usedCapacity: usedA, provisionedCapacity: provA } = getCapacityForFileshare(a);
            const { usedCapacity: usedB, provisionedCapacity: provB } = getCapacityForFileshare(b);
            const utilizationA = provA > 0 ? (usedA / provA) * 100 : 0;
            const utilizationB = provB > 0 ? (usedB / provB) * 100 : 0;
            return utilizationB - utilizationA;
        });
    }, [selectedFileshares, serverFileshareUtilizationAvg]);

    // Render
    return (
        <Box sx={{ minHeight: "100vh", bgcolor: "#FFFFFF" }}>
            <Paper elevation={0} sx={{ borderBottom: "1px solid #E6E8EE", minHeight: { xs: 40, sm: 48 }, px: { xs: 1, sm: 2 }, py: 1, display: "flex", alignItems: "center", gap: 1.5, bgcolor: "#fff" }}>
                <Typography sx={{ fontSize: { xs: 11, sm: 12, md: 13 }, fontWeight: 800, color: "#111827" }}>
                    {appName?.toUpperCase() || ""} - FileShare Utilization
                </Typography>
            </Paper>

            <Box sx={{ px: { xs: 1, sm: 2 }, py: 2 }}>
                <Typography sx={{ fontSize: { xs: 12, sm: 13, md: 14 }, fontWeight: 800, color: "#111827", mb: 2 }}>FileShare Overview</Typography>

                {loading && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
                        <CircularProgress_Styled loadingWhat="Loading FileShare Data" fetchingFor="Fetching fileshare metrics..." />
                    </Box>
                )}

                {error && (
                    <Alert severity="error" sx={{ mb: 2, fontSize: { xs: 10, sm: 11, md: 12 } }}>{error}</Alert>
                )}

                {!loading && !error && (!serverFileshareUtilizationAvg || Object.keys(serverFileshareUtilizationAvg || {}).length < 2) && (
                    <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, p: { xs: 2, sm: 3 }, textAlign: 'center' }}>
                        <Typography sx={{ fontSize: { xs: 11, sm: 12, md: 13 }, color: '#F59E0B' }}>No FileShare data available</Typography>
                    </Paper>
                )}

                {!loading && serverFileshareUtilizationAvg && Object.keys(serverFileshareUtilizationAvg || {}).length >= 2 && (
                    <>
                        <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, p: { xs: 1, sm: 2 }, mb: 2 }}>
                            <Grid container spacing={{ xs: 1, sm: 2 }}>
                                <Grid item xs={12} sm={6}>
                                    <Autocomplete
                                        size="small"
                                        options={getAllStorageAccounts()}
                                        value={selectedAccount}
                                        onChange={(event, newValue) => handleAccountChange(newValue)}
                                        fullWidth
                                        renderInput={(params) => (
                                            <TextField {...params} placeholder="Select Storage Account" size="small" 
                                                sx={{ '& .MuiInputBase-input': { fontSize: { xs: 10, sm: 11, md: 12 } } }} />
                                        )}
                                    />
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <Autocomplete
                                        size="small"
                                        multiple
                                        options={getAllFileshares()}
                                        value={selectedFileshares.length === getAllFileshares().length ? [] : selectedFileshares}
                                        onChange={(event, newValue) => {
                                            if (newValue.length === 0) {
                                                setSelectedFileshares(getAllFileshares());
                                            } else {
                                                setSelectedFileshares(newValue);
                                            }
                                        }}
                                        fullWidth
                                        renderInput={(params) => (
                                            <TextField {...params} placeholder="Select Fileshare" size="small" 
                                                sx={{ '& .MuiInputBase-input': { fontSize: { xs: 10, sm: 11, md: 12 } } }} />
                                        )}
                                        renderTags={(value, getTagProps) =>
                                            value.length === getAllFileshares().length
                                                ? []
                                                : value.slice(0, 2).map((option, index) => (
                                                    <Chip
                                                        {...getTagProps({ index })}
                                                        key={option}
                                                        label={option.split('/')[1] || option}
                                                        size="small"
                                                        sx={{ fontSize: { xs: 9, sm: 10 }, height: { xs: 18, sm: 20 } }}
                                                    />
                                                )).concat(value.length > 2 ? [<Chip key="more" label={`+${value.length - 2}`} size="small" sx={{ fontSize: { xs: 9, sm: 10 }, height: { xs: 18, sm: 20 } }} />] : [])
                                        }
                                    />
                                </Grid>
                            </Grid>
                        </Paper>

                        <Grid container spacing={{ xs: 1, sm: 2 }}>
                            <Grid item xs={12} lg={5}>
                                <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, overflow: "hidden", height: '100%' }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: { xs: 1, sm: 2 }, py: 1.5 }}>
                                        <Typography sx={{ fontSize: { xs: 11, sm: 12, md: 13 }, fontWeight: 800, color: '#111827' }}>Fileshare Utilization</Typography>
                                        <Tooltip title="Shows capacity usage for each fileshare" arrow>
                                            <InfoOutlined sx={{ fontSize: { xs: 14, sm: 16 }, color: '#6B7280', cursor: 'pointer' }} />
                                        </Tooltip>
                                    </Box>
                                <Divider sx={{ borderColor: "#E6E8EE" }} />
                                <TableContainer sx={{ maxHeight: 350, overflowY: 'auto' }}>
                                    <Table size="small" stickyHeader>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell sx={{ fontWeight: 600, fontSize: { xs: 9, sm: 10, md: 11 }, bgcolor: '#F9FAFB', color: '#374151' }}>Fileshare</TableCell>
                                                <TableCell sx={{ fontWeight: 600, fontSize: { xs: 9, sm: 10, md: 11 }, bgcolor: '#F9FAFB', color: '#374151', width: '55%' }}>Utilization</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {sortedFileshares.map((fileshare) => {
                                                const { usedCapacity, provisionedCapacity } = getCapacityForFileshare(fileshare);
                                                const utilizationPercentage = provisionedCapacity > 0 ? (usedCapacity / provisionedCapacity) * 100 : 0;
                                                const [storageAccount, fileshareName] = fileshare.split("/");
                                                const progressBarColor = utilizationPercentage > 90 ? "#EF4444" : utilizationPercentage > 60 ? "#F59E0B" : "#10B981";

                                                return (
                                                    <TableRow key={fileshare} sx={{ '&:hover': { bgcolor: '#F9FAFB' } }}>
                                                        <TableCell sx={{ fontSize: { xs: 9, sm: 10, md: 11 }, py: 1 }}>
                                                            <Tooltip title={`Storage: ${storageAccount}`} arrow>
                                                                <Box sx={{ display: 'inline-block', cursor: 'pointer' }}>
                                                                    {fileshareName}
                                                                </Box>
                                                            </Tooltip>
                                                        </TableCell>
                                                        <TableCell sx={{ py: 1 }}>
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                <Box sx={{ flex: 1, position: 'relative' }}>
                                                                    <LinearProgress
                                                                        variant="determinate"
                                                                        value={Math.min(utilizationPercentage, 100)}
                                                                        sx={{
                                                                            height: { xs: 14, sm: 16 },
                                                                            borderRadius: 2,
                                                                            backgroundColor: '#E5E7EB',
                                                                            "& .MuiLinearProgress-bar": {
                                                                                backgroundColor: progressBarColor,
                                                                                borderRadius: 2,
                                                                            },
                                                                        }}
                                                                    />
                                                                    <Typography
                                                                        sx={{
                                                                            position: 'absolute',
                                                                            left: 6,
                                                                            top: '50%',
                                                                            transform: 'translateY(-50%)',
                                                                            fontSize: { xs: 8, sm: 9 },
                                                                            fontWeight: 600,
                                                                            color: '#fff',
                                                                        }}
                                                                    >
                                                                        {usedCapacity.toFixed(1)} / {provisionedCapacity.toFixed(1)} GiB
                                                                    </Typography>
                                                                </Box>
                                                                <Typography sx={{ fontSize: { xs: 9, sm: 10 }, fontWeight: 600, color: '#374151', minWidth: 45, textAlign: 'right' }}>
                                                                    {utilizationPercentage.toFixed(1)}%
                                                                </Typography>
                                                            </Box>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </Paper>
                            </Grid>

                            <Grid item xs={12} lg={7}>
                            <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, overflow: "visible", height: '100%', display: 'flex', flexDirection: 'column' }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: { xs: 1, sm: 2 }, py: 1.5 }}>
                                    <Typography sx={{ fontSize: { xs: 11, sm: 12, md: 13 }, fontWeight: 800, color: '#111827' }}>Utilization Trend</Typography>
                                    <Tooltip title="Shows utilization percentage over time" arrow>
                                        <InfoOutlined sx={{ fontSize: { xs: 14, sm: 16 }, color: '#6B7280', cursor: 'pointer' }} />
                                    </Tooltip>
                                </Box>
                                <Divider sx={{ borderColor: "#E6E8EE" }} />
                                <Box sx={{ flex: 1, minHeight: 0, maxHeight: 350, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'visible', py: 1 }}>
                                    {!fileShareGraphData || fileShareGraphData.length === 0 ? (
                                        <Typography sx={{ fontSize: { xs: 10, sm: 11, md: 12 }, color: "#F59E0B" }}>No Graph Data</Typography>
                                    ) : (
                                        <Box sx={{ width: '100%', height: 250 }}>
                                            <AreaLineChart type="fileShare" data={fileShareGraphData} yAxisLabel="Utilization %" domain={[0, 100]} />
                                        </Box>
                                    )}
                                </Box>
                            </Paper>
                            </Grid>
                        </Grid>
                    </>
                )}
            </Box>
        </Box>
    );
};

export default FileshareMetrics;
