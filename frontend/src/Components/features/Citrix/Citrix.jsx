import React, { useState, useEffect, useMemo } from "react";
import {
  Typography,
  Grid,
  Paper,
  Tooltip,
  Alert,
  Box,
  Autocomplete,
  TextField,
  Chip,
  Select,
  MenuItem,
  FormControl,
  Modal,
  Divider,
  IconButton,
} from "@mui/material";
import CloseIcon from '@mui/icons-material/Close';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import { useLocation } from "react-router-dom";
import { fetchCitrixMetrics_fromADX } from "../../shared/APIs/fetchAPIs";
import CircularProgress_Styled from '../../shared/UI Components/CircularProgress';
import AreaLineChart from '../../shared/LineChart/AreaLineChart';
import dayjs from 'dayjs';
import utcPlugin from 'dayjs/plugin/utc';
import timezonePlugin from 'dayjs/plugin/timezone';

dayjs.extend(utcPlugin);
dayjs.extend(timezonePlugin);

const CitrixMetrics = ({ appName: appNameProp, backendSessionToken, preferredTZ }) => {
  const appName = appNameProp;
  const targetTZ = preferredTZ || 'America/Los_Angeles';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rawData, setRawData] = useState([]);
  const [selectedResources, setSelectedResources] = useState([]);
  const location = useLocation();

  // ============ Disk metric options for the inline filter ============
  const DISK_METRIC_OPTIONS = [
    { value: "disk_reads_per_sec", label: "Disk Reads/sec", match: ["disk_reads_per_sec", "disk reads/sec", "disk_reads/sec"] },
    { value: "disk_writes_per_sec", label: "Disk Writes/sec", match: ["disk_writes_per_sec", "disk writes/sec", "disk_writes/sec"] },
    { value: "disk_transfers_per_sec", label: "Disk Transfers/sec", match: ["disk_transfers_per_sec", "disk transfers/sec", "disk_transfers/sec"] },
  ];
  const [selectedDiskMetrics, setSelectedDiskMetrics] = useState(["disk_reads_per_sec"]);

  // ============ Map ObjectName -> chart series label ============
  const OBJECT_NAME_MAP = {
    cpu: { match: ["cpu_utilization", "cpu utilization", "cpu"], label: "Average CPU (%)" },
    memory: { match: ["memory_utilization", "memory utilization", "memory"], label: "Average Memory (%)" },
    sessions: { match: ["user_sessions", "concurrent_sessions", "sessions", "session_count"], label: "User Sessions" },
  };

  // All distinct ResourceName values from the API response
  const allResources = useMemo(() => {
    if (!Array.isArray(rawData) || rawData.length === 0) return [];
    const set = new Set();
    rawData.forEach((row) => {
      const r = row?.ResourceName ?? row?.Resource ?? row?.resourceName;
      if (r) set.add(String(r));
    });
    return Array.from(set).sort();
  }, [rawData]);

  // Initialise / reconcile selected resources when allResources changes
  useEffect(() => {
    if (allResources.length === 0) {
      if (selectedResources.length > 0) setSelectedResources([]);
      return;
    }
    // Default to a single resource (the first one) on initial load
    if (selectedResources.length === 0) {
      setSelectedResources([allResources[0]]);
    } else {
      // Drop any stale selections that no longer exist in the data
      const valid = selectedResources.filter((r) => allResources.includes(r));
      if (valid.length !== selectedResources.length) {
        setSelectedResources(valid.length > 0 ? valid : [allResources[0]]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allResources]);

  // Build per-resource series: { name: TimeGenerated, <resourceName>: avgValue, ... }
  const buildSeriesFromRawData = (rawArr, matchList, resourcesToInclude, tz) => {
    if (!Array.isArray(rawArr) || rawArr.length === 0) return [];
    if (!Array.isArray(resourcesToInclude) || resourcesToInclude.length === 0) return [];

    const matches = matchList.map((m) => String(m).toLowerCase());
    const allowedResources = new Set(resourcesToInclude.map(String));

    // Convert a UTC TimeGenerated string into the preferred timezone
    const convertToTZ = (utcStr) => {
      if (!utcStr) return null;
      const d = dayjs.utc(utcStr);
      if (!d.isValid()) return String(utcStr);
      return d.tz(tz).format('YYYY-MM-DD HH:mm');
    };

    // time -> resource -> { sum, count }
    const buckets = {};
    rawArr.forEach((row) => {
      const obj = String(row?.ObjectName ?? "").toLowerCase();
      if (!matches.includes(obj)) return;
      const resource = String(row?.ResourceName ?? row?.Resource ?? row?.resourceName ?? "");
      if (!resource || !allowedResources.has(resource)) return;
      const tConverted = convertToTZ(row?.TimeGenerated);
      const v = Number(row?.AvgValue);
      if (tConverted === undefined || tConverted === null || Number.isNaN(v)) return;
      if (!buckets[tConverted]) buckets[tConverted] = {};
      if (!buckets[tConverted][resource]) buckets[tConverted][resource] = { sum: 0, count: 0 };
      buckets[tConverted][resource].sum += v;
      buckets[tConverted][resource].count += 1;
    });

    return Object.keys(buckets)
      .sort((a, b) => new Date(a) - new Date(b))
      .map((t) => {
        const point = { name: t };
        Object.keys(buckets[t]).forEach((res) => {
          const { sum, count } = buckets[t][res];
          point[res] = Number((sum / count).toFixed(2));
        });
        return point;
      });
  };

  const cpuChartData = useMemo(
    () => buildSeriesFromRawData(rawData, OBJECT_NAME_MAP.cpu.match, selectedResources, targetTZ),
    [rawData, selectedResources, targetTZ]
  );

  const memoryChartData = useMemo(
    () => buildSeriesFromRawData(rawData, OBJECT_NAME_MAP.memory.match, selectedResources, targetTZ),
    [rawData, selectedResources, targetTZ]
  );

  const sessionsChartData = useMemo(
    () => buildSeriesFromRawData(rawData, OBJECT_NAME_MAP.sessions.match, selectedResources, targetTZ),
    [rawData, selectedResources, targetTZ]
  );

  const diskChartData = useMemo(() => {
    const metrics = DISK_METRIC_OPTIONS.filter((o) => selectedDiskMetrics.includes(o.value));
    if (metrics.length === 0) return [];
    const multiMetric = metrics.length > 1;

    // Build a per-metric series, then merge by time bucket
    const merged = {};
    metrics.forEach((opt) => {
      const seriesArr = buildSeriesFromRawData(rawData, opt.match, selectedResources, targetTZ);
      seriesArr.forEach((point) => {
        const t = point.name;
        if (!merged[t]) merged[t] = { name: t };
        Object.keys(point).forEach((k) => {
          if (k === "name") return;
          // When more than one metric is picked, prefix with metric label so series stay distinct
          const seriesKey = multiMetric ? `${k} - ${opt.label}` : k;
          merged[t][seriesKey] = point[k];
        });
      });
    });

    return Object.keys(merged)
      .sort((a, b) => new Date(a) - new Date(b))
      .map((t) => merged[t]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawData, selectedResources, targetTZ, selectedDiskMetrics]);

  // ============ Resource status modal ============
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [statusModalFilter, setStatusModalFilter] = useState("all"); // 'all' | 'up' | 'down'

  // Map each ResourceName -> 'up' | 'down' based on whether ANY CPU row has AvgValue > 0
  const resourceStatusMap = useMemo(() => {
    const map = {};
    if (!Array.isArray(rawData) || rawData.length === 0) return map;
    const cpuMatches = OBJECT_NAME_MAP.cpu.match.map((m) => String(m).toLowerCase());
    // Initialise every known resource as 'down' first
    allResources.forEach((r) => { map[r] = "down"; });
    rawData.forEach((row) => {
      const obj = String(row?.ObjectName ?? "").toLowerCase();
      if (!cpuMatches.includes(obj)) return;
      const resource = String(row?.ResourceName ?? row?.Resource ?? row?.resourceName ?? "");
      if (!resource) return;
      const v = Number(row?.AvgValue);
      if (!Number.isNaN(v) && v > 0) {
        map[resource] = "up";
      }
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawData, allResources]);

  const resourceUpCount = useMemo(
    () => Object.values(resourceStatusMap).filter((s) => s === "up").length,
    [resourceStatusMap]
  );
  const resourceDownCount = useMemo(
    () => Object.values(resourceStatusMap).filter((s) => s === "down").length,
    [resourceStatusMap]
  );

  const openStatusModal = (filter) => {
    setStatusModalFilter(filter);
    setStatusModalOpen(true);
  };

  // Removed: placeholder block (kept here to anchor edit) ============

  const fetchCitrixData = async () => {
    try {
      if (!appName) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
    //   setRateLimited(false);

      // Call the backend Citrix_Metrics_Perf API
      try {
        const citrixApiData = await fetchCitrixMetrics_fromADX({ appName });
        console.log("Citrix_Metrics_Perf API response:", citrixApiData);
        console.log("Citrix_Metrics_Perf record count:", Array.isArray(citrixApiData) ? citrixApiData.length : "N/A");
        setRawData(citrixApiData || []);
      } catch (apiErr) {
        console.error("Citrix_Metrics_Perf API call failed:", apiErr);
        setRawData([]);
      }

    } catch (err) {
      console.error("Error setting citrix data:", err);
      setError(err.message || "Failed to load citrix metrics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCitrixData();
  }, [appName]);

  if (error) {
    return (
      <Grid container sx={{ bgcolor: "#FFFFFF", p: 2 }}>
        <Grid item xs={12}>
          <Alert severity="error">{error}</Alert>
        </Grid>
      </Grid>
    );
  }

  // ============ Shared chart card wrapper (modeled after NetworkMetrics.jsx) ============
  const isBladeView = true;
  const chartHeight = isBladeView ? 240 : 300;

  const renderChartCard = ({ title, tooltipText, hasData, children, titleAdornment }) => (
    <Paper
      elevation={0}
      sx={{
        bgcolor: "#FFFFFF",
        border: "1px solid #E6E8EE",
        borderRadius: 2,
        overflow: "visible",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", px: { xs: 1, sm: 2 }, py: 1.5, gap: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: { xs: 11, sm: 12, md: 13 }, fontWeight: 800, color: "#111827", whiteSpace: "nowrap" }}>{title}</Typography>
          {titleAdornment}
        </Box>
        <Tooltip title={tooltipText} arrow>
          <InfoOutlined sx={{ fontSize: { xs: 14, sm: 16 }, color: "#6B7280", cursor: "pointer" }} />
        </Tooltip>
      </Box>
      <Box sx={{ borderBottom: "1px solid #E6E8EE" }} />
      <Box sx={{ flex: 1, minHeight: 0, height: chartHeight, display: "flex", alignItems: "center", justifyContent: "center", overflow: "visible", py: 1, px: 1 }}>
        {!hasData ? (
          <Typography sx={{ fontSize: { xs: 10, sm: 11, md: 12 }, color: "#F59E0B" }}>No Graph Data</Typography>
        ) : (
          <Box sx={{ width: "100%", height: "100%" }}>{children}</Box>
        )}
      </Box>
    </Paper>
  );

  return (
    <Box sx={{ minHeight: isBladeView ? "auto" : "100vh", bgcolor: "#FFFFFF", pb: { xs: 3, sm: 4 } }}>
      <Box sx={{ px: { xs: 1, sm: 2 }, pt: 2, pb: { xs: 3, sm: 4 } }}>
        <Typography sx={{ fontSize: { xs: 12, sm: 13, md: 14 }, fontWeight: 800, color: "#111827", mb: 2 }}>
          {appName ? `${appName.toUpperCase()} - ` : ""}Citrix Metrics Overview
        </Typography>

        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 200 }}>
            <CircularProgress_Styled loadingWhat="Loading Citrix Metrics" fetchingFor="Fetching Citrix performance data..." />
          </Box>
        )}

        {!loading && (
          <>
            {/* Resource Status card (Up / Down bubbles) */}
            {allResources.length > 0 && (
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={12} md={4}>
                  <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, overflow: "hidden", height: '100%' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: { xs: 1, sm: 2 }, py: 1.5 }}>
                      <Typography sx={{ fontSize: { xs: 11, sm: 12, md: 13 }, fontWeight: 800, color: '#111827' }}>Resource Status</Typography>
                      {/* <Tooltip title="A resource is considered Up if its Average CPU utilization is greater than 0" arrow>
                        <InfoOutlined sx={{ fontSize: { xs: 14, sm: 16 }, color: '#6B7280', cursor: 'pointer' }} />
                      </Tooltip> */}
                    </Box>
                    <Divider sx={{ borderColor: '#E6E8EE' }} />
                    <Box sx={{ px: 2, py: 2, minHeight: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Box sx={{ display: 'flex', gap: { xs: 2, sm: 3 }, alignItems: 'center' }}>
                        <Tooltip title="Resources Up" arrow>
                          <Box
                            onClick={() => openStatusModal('up')}
                            sx={{ width: { xs: 36, sm: 40, md: 42 }, height: { xs: 36, sm: 40, md: 42 }, borderRadius: '50%', background: 'linear-gradient(to bottom, #4fe480ff, #10b95cff)', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', transition: 'transform 0.2s', '&:hover': { transform: 'scale(1.1)' } }}
                          >
                            <Typography sx={{ color: '#fff', fontSize: { xs: 11, sm: 12, md: 13 }, fontWeight: 700 }}>{resourceUpCount}</Typography>
                          </Box>
                        </Tooltip>
                        <Tooltip title="Resources Down" arrow>
                          <Box
                            onClick={() => openStatusModal('down')}
                            sx={{ width: { xs: 36, sm: 40, md: 42 }, height: { xs: 36, sm: 40, md: 42 }, borderRadius: '50%', background: 'linear-gradient(to bottom, #ef6f6f, #c62828)', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', transition: 'transform 0.2s', '&:hover': { transform: 'scale(1.1)' } }}
                          >
                            <Typography sx={{ color: '#fff', fontSize: { xs: 11, sm: 12, md: 13 }, fontWeight: 700 }}>{resourceDownCount}</Typography>
                          </Box>
                        </Tooltip>
                      </Box>
                    </Box>
                  </Paper>
                </Grid>
              </Grid>
            )}

            {/* Resource Name filter (renders only when API has resources) */}
            {allResources.length > 0 && (
              <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, p: { xs: 1, sm: 2 }, mb: 2 }}>
                <Grid container spacing={{ xs: 1, sm: 2 }} alignItems="center">
                  <Grid item xs={12}>
                    <Autocomplete
                      size="small"
                      multiple
                      options={["Select All", ...allResources]}
                      value={selectedResources}
                      onChange={(event, newValue) => {
                        if (newValue.includes("Select All")) {
                          setSelectedResources(
                            selectedResources.length === allResources.length ? [allResources[0]] : allResources
                          );
                        } else {
                          // Always keep at least one resource selected
                          setSelectedResources(newValue.length === 0 ? [allResources[0]] : newValue);
                        }
                      }}
                      fullWidth
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Filter by Resource Name"
                          placeholder="Select Resources"
                          size="small"
                          sx={{ "& .MuiInputBase-input": { fontSize: { xs: 10, sm: 11, md: 12 } } }}
                        />
                      )}
                      renderTags={(value, getTagProps) =>
                        value.length === allResources.length
                          ? [
                              <Chip
                                key="all"
                                label="All Resources"
                                size="small"
                                sx={{ fontSize: { xs: 9, sm: 10 }, height: { xs: 18, sm: 20 } }}
                              />,
                            ]
                          : value.slice(0, 3).map((option, index) => (
                              <Chip
                                {...getTagProps({ index })}
                                key={option}
                                label={option}
                                size="small"
                                sx={{ fontSize: { xs: 9, sm: 10 }, height: { xs: 18, sm: 20 } }}
                              />
                            )).concat(
                              value.length > 3
                                ? [
                                    <Chip
                                      key="more"
                                      label={`+${value.length - 3}`}
                                      size="small"
                                      sx={{ fontSize: { xs: 9, sm: 10 }, height: { xs: 18, sm: 20 } }}
                                    />,
                                  ]
                                : []
                            )
                      }
                      renderOption={(props, option) => (
                        <li {...props} style={{ fontWeight: option === "Select All" ? 600 : 400, fontSize: "inherit" }}>
                          {option}
                        </li>
                      )}
                    />
                  </Grid>
                </Grid>
              </Paper>
            )}

            <Grid container spacing={{ xs: 1, sm: 2 }}>
            {/* CPU Graph */}
            <Grid item xs={12}>
              {renderChartCard({
                title: "CPU Utilization Trend",
                tooltipText: "Average vs Baseline CPU utilization (%) over time",
                hasData: cpuChartData.length > 0,
                children: <AreaLineChart type="cpu" data={cpuChartData} yAxisLabel="CPU (%)" />,
              })}
            </Grid>

            {/* Memory Graph */}
            <Grid item xs={12}>
              {renderChartCard({
                title: "Memory Utilization Trend",
                tooltipText: "Average vs Baseline Memory utilization (MB) over time",
                hasData: memoryChartData.length > 0,
                children: <AreaLineChart type="memory" data={memoryChartData} yAxisLabel="Memory (MB)" />,
              })}
            </Grid>

            {/* Concurrent Sessions Graph */}
            <Grid item xs={12}>
              {renderChartCard({
                title: "User Sessions Trend",
                tooltipText: "Average user sessions over time",
                hasData: sessionsChartData.length > 0,
                children: <AreaLineChart type="sessions" data={sessionsChartData} yAxisLabel="Sessions" />,
              })}
            </Grid>

            {/* Disk Graph with inline metric selector */}
            <Grid item xs={12}>
              {renderChartCard({
                title: "Disk Trend",
                tooltipText: "Average disk activity over time (reads / writes / transfers per sec)",
                hasData: diskChartData.length > 0,
                titleAdornment: (
                  <Autocomplete
                    size="small"
                    multiple
                    disableCloseOnSelect
                    options={DISK_METRIC_OPTIONS.map((o) => o.value)}
                    value={selectedDiskMetrics}
                    onChange={(event, newValue) => {
                      // Always keep at least one metric selected
                      setSelectedDiskMetrics(newValue.length === 0 ? ["disk_reads_per_sec"] : newValue);
                    }}
                    getOptionLabel={(val) => DISK_METRIC_OPTIONS.find((o) => o.value === val)?.label || val}
                    sx={{ minWidth: { xs: 180, sm: 260 } }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        size="small"
                        placeholder={selectedDiskMetrics.length === 0 ? "Select metric(s)" : ""}
                        sx={{ "& .MuiInputBase-input": { fontSize: { xs: 10, sm: 11, md: 12 } } }}
                      />
                    )}
                    renderTags={(value, getTagProps) =>
                      value.slice(0, 2).map((option, index) => (
                        <Chip
                          {...getTagProps({ index })}
                          key={option}
                          label={DISK_METRIC_OPTIONS.find((o) => o.value === option)?.label || option}
                          size="small"
                          sx={{ fontSize: { xs: 9, sm: 10 }, height: { xs: 18, sm: 20 } }}
                        />
                      )).concat(
                        value.length > 2
                          ? [
                              <Chip
                                key="more-disk"
                                label={`+${value.length - 2}`}
                                size="small"
                                sx={{ fontSize: { xs: 9, sm: 10 }, height: { xs: 18, sm: 20 } }}
                              />,
                            ]
                          : []
                      )
                    }
                    renderOption={(props, option) => (
                      <li {...props} style={{ fontSize: "inherit" }}>
                        {DISK_METRIC_OPTIONS.find((o) => o.value === option)?.label || option}
                      </li>
                    )}
                  />
                ),
                children: (
                  <AreaLineChart
                    type="diskIO"
                    data={diskChartData}
                    yAxisLabel={
                      selectedDiskMetrics.length === 1
                        ? DISK_METRIC_OPTIONS.find((o) => o.value === selectedDiskMetrics[0])?.label
                        : "Disk"
                    }
                  />
                ),
              })}
            </Grid>
          </Grid>
          </>
        )}
      </Box>

      {/* Resource Status Modal */}
      <Modal open={statusModalOpen} onClose={() => setStatusModalOpen(false)}>
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: { xs: '92%', sm: 520 },
            maxHeight: '80vh',
            bgcolor: '#FFFFFF',
            borderRadius: 2,
            boxShadow: 24,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, py: 1.5, borderBottom: '1px solid #E6E8EE' }}>
            <Typography sx={{ fontSize: { xs: 12, sm: 13, md: 14 }, fontWeight: 800, color: '#111827' }}>
              {statusModalFilter === 'up' ? 'Resources Up' : statusModalFilter === 'down' ? 'Resources Down' : 'All Resources'}
            </Typography>
            <IconButton size="small" onClick={() => setStatusModalOpen(false)}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
          <Box sx={{ overflowY: 'auto', flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1, bgcolor: '#F9FAFB', borderBottom: '1px solid #E6E8EE' }}>
              <Typography sx={{ flex: 1, fontSize: { xs: 10, sm: 11, md: 12 }, fontWeight: 700, color: '#4B5563' }}>Resource Name</Typography>
              <Typography sx={{ width: 90, textAlign: 'right', fontSize: { xs: 10, sm: 11, md: 12 }, fontWeight: 700, color: '#4B5563' }}>Status</Typography>
            </Box>
            {allResources
              .filter((r) => statusModalFilter === 'all' ? true : resourceStatusMap[r] === statusModalFilter)
              .map((r) => {
                const status = resourceStatusMap[r] || 'down';
                const isUp = status === 'up';
                return (
                  <Box key={r} sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1, borderBottom: '1px solid #F1F3F6' }}>
                    <Typography sx={{ flex: 1, fontSize: { xs: 10, sm: 11, md: 12 }, color: '#111827', wordBreak: 'break-all' }}>{r}</Typography>
                    <Box sx={{ width: 90, display: 'flex', justifyContent: 'flex-end' }}>
                      <Chip
                        size="small"
                        label={isUp ? 'Up' : 'Down'}
                        sx={{
                          fontSize: { xs: 9, sm: 10 },
                          height: { xs: 18, sm: 20 },
                          color: '#fff',
                          fontWeight: 700,
                          bgcolor: isUp ? '#10B981' : '#DC2626',
                        }}
                      />
                    </Box>
                  </Box>
                );
              })}
            {allResources.filter((r) => statusModalFilter === 'all' ? true : resourceStatusMap[r] === statusModalFilter).length === 0 && (
              <Box sx={{ p: 3, textAlign: 'center' }}>
                <Typography sx={{ fontSize: { xs: 10, sm: 11, md: 12 }, color: '#6B7280' }}>No resources to display</Typography>
              </Box>
            )}
          </Box>
        </Box>
      </Modal>
    </Box>
  );
};

export default CitrixMetrics;