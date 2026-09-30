import React, { useEffect, useState, useMemo } from 'react';
import { Box, Typography, Button, Paper, Grid, CircularProgress, Autocomplete, TextField, Chip, Divider, Table, TableHead, TableRow, TableCell, TableBody, IconButton, CssBaseline, Snackbar, Alert, Drawer, Link, Card as MuiCard } from '@mui/material';
import { ThemeProvider, createTheme, styled } from '@mui/material/styles';
import { getUrl } from '../../../environment';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { convertTimeToPreferredTZ, setPreferredTimezone } from '../../shared/Timestamp/PreferenceConversion';
import dayjs from 'dayjs';
import { useNavigate, useLocation } from 'react-router-dom';
import { logPageVisit, startPageTracking, appInsights } from '../appInsights';
import CircularProgress_Styled from '../../shared/UI Components/CircularProgress';

const StyledCard = styled(MuiCard)({
  width: '100%',
  boxShadow: '0px 3px 6px rgba(0, 0, 0, 0.16)',
  padding: 4,
  position: 'relative',
});

var TOK = {
  pageBg: "#f5f5f5", cardBg: "#FFFFFF", cardBorder: "#E5EAF3", cardShadow: "0 1px 0 rgba(16,24,40,0.02)", radius: 4,
  titleBlue: "#1F4A93", text: "#101828", sub: "#667085", muted: "#98A2B3", headerBlue: "#DDEBFF",
  btnBlue: "#00338e", btnBlueHover: "#002366",
  chipOkBg: "#EAF7EE", chipOkText: "#1D7A3A", chipFailBg: "#FDECEC", chipFailText: "#B42318",
  red: "#B42318", yellow: "#F2B100", gray: "#D0D5DD"
};

var theme = createTheme({
  typography: { fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, sans-serif', h5: { fontWeight: 700, fontSize: { xs: 11, sm: 12, md: 13 } }, h6: { fontWeight: 700, fontSize: { xs: 11, sm: 12, md: 13 } }, subtitle2: { fontWeight: 700, fontSize: { xs: 10, sm: 11, md: 12 } }, body2: { fontWeight: 600, fontSize: { xs: 9, sm: 10, md: 11 } }, caption: { fontWeight: 700, fontSize: { xs: 9, sm: 10, md: 11 } }, h4: { fontWeight: 700, fontSize: { xs: 18, sm: 20, md: 22 } } },
  components: { MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } }, MuiButton: { styleOverrides: { root: { textTransform: "none" } } }, MuiTableCell: { styleOverrides: { root: { borderBottom: `1px solid ${TOK.cardBorder}`, paddingTop: 4, paddingBottom: 4, paddingLeft: 10, paddingRight: 10, fontSize: 12 }, head: { fontWeight: 700, color: "#344054", fontSize: 11, paddingTop: 6, paddingBottom: 6 } } } }
});

var Card = ({ children, sx }) => (
  <Paper elevation={0} sx={{ background: TOK.cardBg, border: `1px solid ${TOK.cardBorder}`, borderRadius: TOK.radius, boxShadow: TOK.cardShadow, ...sx }}>{children}</Paper>
);

var StatusChip = ({ status }) => {
  var chipStyle = status === "Operational" ? { bg: TOK.chipOkBg, color: TOK.chipOkText } : { bg: TOK.chipFailBg, color: TOK.chipFailText };
  return <Chip label={status} size="small" sx={{ height: { xs: 20, sm: 22, md: 24 }, px: { xs: 0.7, sm: 0.85, md: 1 }, borderRadius: 999, fontWeight: 700, fontSize: { xs: 9, sm: 10, md: 11 }, background: chipStyle.bg, color: chipStyle.color }} />;
};

var PageButton = ({ active, children, onClick }) => (
  <Button onClick={onClick} variant="contained" disableElevation sx={{ minWidth: { xs: 22, sm: 24, md: 26 }, width: { xs: 22, sm: 24, md: 26 }, height: { xs: 22, sm: 24, md: 26 }, p: 0, borderRadius: 999, background: active ? TOK.btnBlue : "#FFFFFF", color: active ? "#FFFFFF" : "#344054", border: `1px solid ${active ? TOK.btnBlue : TOK.cardBorder}`, fontWeight: 700, fontSize: { xs: 9, sm: 10, md: 11 }, "&:hover": { background: active ? TOK.btnBlueHover : "#F8FAFF" } }}>{children}</Button>
);

export default function AppValidation({ userProfileData, preferredTZ, appInsights, accounts, appValidationAccess }) {
  var navigate = useNavigate();
  var location = useLocation();
  var baseUrl = getUrl();
  var email = userProfileData?.mail || '';
  
  var [selectedRows, setSelectedRows] = useState([]);
  var [errorApi, setErrorApi] = useState({ appValidation: '' });
  var [loading, setLoading] = useState({ appValidation: false });
  var [appValidationData, setAppValidation] = useState({});
  var [runMessage, setRunMessage] = useState('');
  var [rows, setRows] = useState([]);
  var [page, setPage] = useState(1);
  var [selectedFamilies, setSelectedFamilies] = useState([]);
  var [selectedCIs, setSelectedCIs] = useState([]);
  var [selectedStatus, setSelectedStatus] = useState(null);
  var [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  var [drawerOpen, setDrawerOpen] = useState(false);
  var [selectedAppCI, setSelectedAppCI] = useState(null);
  var [drilldownData, setDrilldownData] = useState({});
  var [loadingDrilldown, setLoadingDrilldown] = useState(false);
  var [selectedTimestamp, setSelectedTimestamp] = useState('');
  var [runLoading, setRunLoading] = useState(false);

  var getUserPermissions = () => {
    console.log('getUserPermissions called, appValidationAccess:', appValidationAccess);
    if (appValidationAccess === 'NoAccess' || !appValidationAccess) return { allowedAppFamilies: [], canRun: false };
    var allowedItems = appValidationAccess.split(',').map(item => item.trim());
    return { allowedAppFamilies: allowedItems, canRun: allowedItems.length > 0 };
  };

  var userPermissions = getUserPermissions();
  var ROW_HEIGHT = 33;
  var TABLE_OVERHEAD = 258;
  var calculatePageSize = () => Math.max(5, Math.floor((window.innerHeight - TABLE_OVERHEAD) / ROW_HEIGHT));
  var [pageSize, setPageSize] = useState(calculatePageSize);

  useEffect(() => {
    var handleResize = () => setPageSize(calculatePageSize());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    startPageTracking(window.location.href);
    return () => { logPageVisit(); if (appInsights) appInsights.flush(); };
  }, [location]);

  var fetchAppValidation = () => {
    var url = baseUrl + 'appValidation';
    var params = { aggregate: 'yes', appCI: '' };
    setLoading(prev => ({ ...prev, appValidation: true }));
    setErrorApi(prev => ({ ...prev, appValidation: '' }));
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) })
      .then(response => { if (!response.ok) throw new Error('Non-200 response'); return response.json(); })
      .then(data => { 
        var parsed = JSON.parse(data.Data);
        if (parsed['TimeGenerated']) {
          parsed['TimeGenerated'] = Object.fromEntries(
            Object.entries(parsed['TimeGenerated']).map(([key, value]) => [key, dayjs(value, 'YYYY-MM-DD hh:mm:ss A').format('YYYY-MM-DD HH:mm:ss')])
          );
        }
        setPreferredTimezone(preferredTZ); 
        parsed = convertTimeToPreferredTZ(parsed); 
        setAppValidation(parsed); 
        setLoading(prev => ({ ...prev, appValidation: false })); 
      })
      .catch(error => { setLoading(prev => ({ ...prev, appValidation: false })); setErrorApi(prev => ({ ...prev, appValidation: "API didn't load" })); });
  };

  useEffect(() => {
    var raw = appValidationData['Application CI'];
    var newRows = [];
    if (raw) {
      var entries = Object.keys(raw).map(i => ({ ci: raw[i], fn: appValidationData['FunctionName'][i], status: appValidationData['Status'][i], time: appValidationData['TimeGenerated'][i], server: appValidationData['Server Name'][i] }));
      var byCI = entries.reduce((acc, e) => { acc[e.ci] = acc[e.ci] || []; acc[e.ci].push(e); return acc; }, {});
      newRows = Object.entries(byCI).map(([ci, arr]) => {
        var allSuccessful = arr.every(entry => entry.status === 'Successful' || entry.status === 'Success');
        var family = ci.includes('-') ? ci.split('-')[0].trim() : ci.includes(' ') ? ci.split(' ')[0].trim() : ci;
        var latestEntry = arr.reduce((latest, current) => current.time > latest.time ? current : latest);
        var formattedDate = latestEntry.time;
        var status = allSuccessful ? 'Operational' : 'Failed';
        return { id: ci, family, ci, lastRun: formattedDate, status: status, statusColor: allSuccessful ? '#4caf50' : '#d59a59' };
      });
    }
    setRows(newRows);
    setSelectedRows([]);
  }, [appValidationData, preferredTZ]);

  var isAppValidationAdmin = () => {
    try { return accounts && accounts[0] && accounts[0].idTokenClaims && accounts[0].idTokenClaims.roles && accounts[0].idTokenClaims.roles.includes('AppValidation.Admin'); }
    catch (error) { console.error('Error checking admin role:', error); return false; }
  };

  var canUserRunForFamily = (appFamily, appCI = '') => {
    if (isAppValidationAdmin() && !userPermissions.canRun) return true;
    if (!userPermissions.canRun) return false;
    var allowedLower = userPermissions.allowedAppFamilies.map(f => f.toLowerCase().trim());
    if (allowedLower.includes('all')) return true;
    var result = allowedLower.includes(appFamily.toLowerCase().trim()) || allowedLower.includes(appCI.toLowerCase().trim());
    console.log('canUserRunForFamily:', { appFamily, appCI, allowedLower, result, isAdmin: isAppValidationAdmin(), canRun: userPermissions.canRun });
    return result;
  };

  var handleRun = async (cisArray) => {
    if (!cisArray || cisArray.length === 0) { setSnackbar({ open: true, message: 'No applications selected', severity: 'warning' }); return; }
    
    setRunLoading(true);
    setSnackbar({ open: true, message: 'Triggering automation... Please wait.', severity: 'info' });
    
    try {
      // Separate CIs by app family (Wellsky vs ARIA)
      var wellskyCIs = [];
      var ariaCIs = [];
      
      cisArray.forEach(ci => {
        var rowData = rows.find(r => r.ci === ci);
        if (rowData && rowData.family && rowData.family.toLowerCase() === 'wellsky') {
          wellskyCIs.push(ci);
        } else {
          ariaCIs.push(ci);
        }
      });

      var successCount = 0;
      var failCount = 0;
      var pendingCount = 0;
      if (wellskyCIs.length > 0) {
        try {
          var wellskyRes = await fetch(baseUrl + 'run-process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              inputArgs: { 'in_strApplicationCIs': wellskyCIs.join(";"), 'in_strEmail': email + ';CRCAMonitoringServices@providence.org' },
              appFamily: 'wellsky'
            })
          });
          
          if (wellskyRes.status === 201) {
            var wellskyData = await wellskyRes.json();
            var wellskyState = JSON.parse(wellskyData?.Data || '{}')?.value?.[0]?.State;
            if (wellskyState === 'Pending') { pendingCount += wellskyCIs.length; } else { successCount += wellskyCIs.length; }
          } else {
            failCount += wellskyCIs.length;
          }
        } catch (err) {
          console.error('Error running Wellsky validations:', err);
          failCount += wellskyCIs.length;
        }
      }
      if (ariaCIs.length > 0) {
        try {
          var ariaRes = await fetch(baseUrl + 'run-process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              inputArgs: { 'in_strApplicationCIs': ariaCIs.join(";"), 'in_strEmail': email + ';CRCAMonitoringServices@providence.org' },
              appFamily: 'aria'
            })
          });
          
          if (ariaRes.status === 201) {
            var ariaData = await ariaRes.json();
            var ariaState = JSON.parse(ariaData?.Data || '{}')?.value?.[0]?.State;
            if (ariaState === 'Pending') { pendingCount += ariaCIs.length; } else { successCount += ariaCIs.length; }
          } else {
            failCount += ariaCIs.length;
          }
        } catch (err) {
          console.error('Error running ARIA validations:', err);
          failCount += ariaCIs.length;
        }
      }

      if (pendingCount > 0 && failCount === 0) {
        setRunMessage('Request queued');
        setSnackbar({ open: true, message: 'Your request has been added to the queue. Automation is currently running.', severity: 'info' });
      } else if (successCount > 0 && failCount === 0 && pendingCount === 0) {
        setRunMessage('Automation triggered successfully');
        setSnackbar({ open: true, message: `Automation triggered successfully for ${successCount} application${successCount > 1 ? 's' : ''}`, severity: 'success' });
      } else if ((successCount > 0 || pendingCount > 0) && failCount > 0) {
        setRunMessage('Partially successful');
        setSnackbar({ open: true, message: `${successCount + pendingCount} queued/succeeded, ${failCount} failed`, severity: 'warning' });
      } else {
        setRunMessage('Run failed');
        setSnackbar({ open: true, message: 'Run failed. Please try again.', severity: 'error' });
      }
    } catch (err) {
      setRunMessage('Run failed: ' + err.message);
      setSnackbar({ open: true, message: 'Run failed: ' + err.message, severity: 'error' });
    } finally {
      setRunLoading(false);
    }
  };

  useEffect(() => { fetchAppValidation(); }, [preferredTZ, location.search]);

  var familyOptions = useMemo(() => Array.from(new Set(rows.map(r => r.family))).sort(), [rows]);
  var ciOptions = useMemo(() => {
    if (selectedFamilies.length > 0) {
      return Array.from(new Set(rows.filter(r => selectedFamilies.includes(r.family)).map(r => r.ci))).sort();
    }
    return Array.from(new Set(rows.map(r => r.ci))).sort();
  }, [rows, selectedFamilies]);

  var filtered = useMemo(() => {
    return rows.filter((r) => {
      if (selectedStatus && r.status !== selectedStatus) return false;
      if (selectedFamilies.length > 0 && !selectedFamilies.includes(r.family)) return false;
      if (selectedCIs.length > 0 && !selectedCIs.includes(r.ci)) return false;
      return true;
    }).sort((a, b) => a.family.localeCompare(b.family) || a.ci.localeCompare(b.ci));
  }, [rows, selectedFamilies, selectedCIs, selectedStatus]);

  var totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  var pageSafe = Math.min(page, totalPages);
  var start = (pageSafe - 1) * pageSize;
  var pageRows = filtered.slice(start, start + pageSize);

  useEffect(() => setPage(1), [selectedFamilies, selectedCIs, selectedStatus]);

  var totalApps = rows.length;
  var operational = rows.filter(r => r.status === 'Operational').length;
  var failed = rows.filter(r => r.status === 'Failed').length;

  var handleRowSelection = (rowId) => {
    var row = rows.find(r => r.id === rowId);
    if (row && !canUserRunForFamily(row.family, row.ci)) return;
    setSelectedRows(prev => prev.includes(rowId) ? prev.filter(id => id !== rowId) : [...prev, rowId]);
  };
  var handleSelectAll = () => {
    var selectableRows = pageRows.filter(r => canUserRunForFamily(r.family, r.ci));
    var allSelected = selectableRows.length > 0 && selectableRows.every(r => selectedRows.includes(r.id));
    setSelectedRows(allSelected ? [] : selectableRows.map(r => r.id));
  };
  var handleRunSelected = () => { var cisToRun = pageRows.filter(r => selectedRows.includes(r.id)).map(r => r.ci); if (cisToRun.length > 0) handleRun(cisToRun); };
  var handleCloseSnackbar = () => setSnackbar({ ...snackbar, open: false });

  var handleRowClick = async (appCI) => {
    setSelectedAppCI(appCI); setDrawerOpen(true); setLoadingDrilldown(true);
    try {
      var url = baseUrl + 'appValidation';
      var response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aggregate: 'no', appCI: appCI }) });
      if (!response.ok) throw new Error('Failed to fetch drilldown data');
      var data = await response.json();
      var parsed = JSON.parse(data.Data);
      if (parsed['TimeGenerated']) {
        parsed['TimeGenerated'] = Object.fromEntries(
          Object.entries(parsed['TimeGenerated']).map(([key, value]) => [key, dayjs(value, 'YYYY-MM-DD hh:mm:ss A').format('YYYY-MM-DD HH:mm:ss')])
        );
      }
      setPreferredTimezone(preferredTZ);
      var convertedData = convertTimeToPreferredTZ(parsed);
      setDrilldownData(convertedData);
      if (convertedData['TimeGenerated']) {
        var timestamps = Object.values(convertedData['TimeGenerated']);
        var uniqueTimestamps = [...new Set(timestamps)].sort((a, b) => new Date(b) - new Date(a));
        if (uniqueTimestamps.length > 0) setSelectedTimestamp(uniqueTimestamps[0]);
      }
      setLoadingDrilldown(false);
    } catch (error) { console.error('Error fetching drilldown data:', error); setLoadingDrilldown(false); setSnackbar({ open: true, message: 'Failed to load details', severity: 'error' }); }
  };

  var handleCloseDrawer = () => { setDrawerOpen(false); setSelectedAppCI(null); setDrilldownData({}); setSelectedTimestamp(''); };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={handleCloseSnackbar} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%', fontSize: { xs: 11, sm: 12, md: 13 }, fontWeight: 600 }}>{snackbar.message}</Alert>
      </Snackbar>
      {loading.appValidation && rows.length === 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', minHeight: '100vh', mx: 0, px: { xs: 2, sm: 3, md: 4 }, pt: { xs: 3, sm: 4 } }}>
          <StyledCard sx={{ borderRadius: 2, margin: 1 }}>
            <Grid container xs={12} justifyContent="center" alignItems="center" sx={{ minHeight: 200, height: '100%', display: 'flex' }}>
              <CircularProgress_Styled loadingWhat="Loading Application Validations" fetchingFor="Fetching validation data for all applications..." />
            </Grid>
          </StyledCard>
        </Box>
      ) : (
      <Box sx={{ height: "calc(100vh - 48px)", background: TOK.pageBg, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {(!isAppValidationAdmin() && !userPermissions.canRun) && (
          <Grid container sx={{ backgroundColor: '#fef9c3', borderBottom: '2px solid #fbbf24', py: 1, px: 0, mt: { xs: 4, sm: 5, md: 6 } }}>
            <Grid item xs={12}>
              <Typography sx={{ color: '#92400e', fontWeight: 700, fontSize: { xs: 10, sm: 11, md: 12 }, textAlign: 'center' }}>
                ⚠️ You don't have access to run app validation tests
              </Typography>
            </Grid>
          </Grid>
        )}
        <Box sx={{ px: { xs: 1, sm: 1.5, md: 2 }, pt: (isAppValidationAdmin() || userPermissions.canRun) ? { xs: 3, sm: 4, md: 4 } : { xs: 0.3, sm: 0.4, md: 0.5 }, pb: 0, width: '100%', flex: 1, overflow: 'hidden', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Filter bar */}
          <Grid container spacing={{ xs: 0.5, sm: 0.75, md: 1 }} alignItems="center" sx={{ mb: { xs: 0.5, sm: 0.75, md: 1 }, flexShrink: 0 }}>
            <Grid item xs={12} sm={6} md={3} lg={2.5}>
              <Autocomplete multiple size="small" value={selectedFamilies} onChange={(e, v) => setSelectedFamilies(v)} options={familyOptions} getOptionLabel={(o) => String(o)} renderInput={(params) => <TextField {...params} placeholder={selectedFamilies.length === 0 ? 'All Families' : ''} sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#fff', fontSize: { xs: 10, sm: 11, md: 12 }, borderRadius: 2, minHeight: 34, maxHeight: 70, px: 0.5, overflowY: 'auto', flexWrap: 'wrap', alignContent: 'flex-start', width: '100%', '& fieldset': { border: 'none' } } }} />} renderTags={(tagValue, getTagProps) => tagValue.map((option, index) => <Chip label={String(option)} {...getTagProps({ index })} size="small" sx={{ fontSize: { xs: 9, sm: 10, md: 11 }, height: 22, maxWidth: '150px' }} />)} sx={{ width: '100%' }} />
            </Grid>
            <Grid item xs={12} sm={6} md={3} lg={2.5}>
              <Autocomplete multiple size="small" value={selectedCIs} onChange={(e, v) => setSelectedCIs(v)} options={ciOptions} getOptionLabel={(o) => String(o)} renderInput={(params) => <TextField {...params} placeholder={selectedCIs.length === 0 ? 'All CIs' : ''} sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#fff', fontSize: { xs: 10, sm: 11, md: 12 }, borderRadius: 2, minHeight: 34, maxHeight: 70, px: 0.5, overflowY: 'auto', flexWrap: 'wrap', alignContent: 'flex-start', width: '100%', '& fieldset': { border: 'none' } } }} />} renderTags={(tagValue, getTagProps) => tagValue.map((option, index) => <Chip label={String(option)} {...getTagProps({ index })} size="small" sx={{ fontSize: { xs: 9, sm: 10, md: 11 }, height: 22, maxWidth: '150px' }} />)} sx={{ width: '100%' }} />
            </Grid>
            <Grid item xs={12} md="auto" sx={{ ml: { md: 'auto' } }}>
              <Box display="flex" gap={1} flexWrap="wrap">
                {[{ label: 'All', count: totalApps, style: { border: '#757575', bg: '#EEEEEE', text: '#424242' } }, { label: 'Operational', count: operational, style: { border: TOK.chipOkText, bg: TOK.chipOkBg, text: TOK.chipOkText } }, { label: 'Failed', count: failed, style: { border: TOK.chipFailText, bg: TOK.chipFailBg, text: TOK.chipFailText } }].map(({ label, count, style }) => {
                  var isAll = label === 'All';
                  var isActive = selectedStatus === label || (selectedStatus === null && isAll);
                  return <Box key={label} px={1.5} py={0.3} borderRadius={999} bgcolor={isActive ? style.border : style.bg} onClick={() => setSelectedStatus(isAll ? null : (selectedStatus === label ? null : label))} sx={{ cursor: 'pointer', transition: 'all 0.2s', '&:hover': { transform: 'scale(1.05)', boxShadow: 1 } }}><Typography fontSize={{ xs: 9, sm: 10, md: 11 }} fontWeight={700} color={isActive ? '#fff' : style.text}>{count} {label}</Typography></Box>;
                })}
              </Box>
            </Grid>
          </Grid>

          {/* Data table - full width */}
          <Card sx={{ p: 0, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <Grid container alignItems="center" justifyContent="space-between" sx={{ px: { xs: 1.2, sm: 1.5, md: 2 }, py: { xs: 0.5, sm: 0.6, md: 0.8 }, flexShrink: 0 }}>
              <Grid item xs={12} md={4} lg={3}>
                <Typography variant="subtitle2" sx={{ color: TOK.text, fontWeight: 700, fontSize: { xs: 10, sm: 11, md: 12 } }}>Application validation runs</Typography>
              </Grid>
              <Grid item xs={12} md={8} lg={9} sx={{ mt: { xs: 0.3, md: 0 } }}>
                <Grid container columnSpacing={{ xs: 0.6, sm: 0.75, md: 1 }} justifyContent={{ xs: "flex-start", md: "flex-end" }}>
                  <Grid item><Button variant="outlined" disableElevation onClick={() => fetchAppValidation()} sx={{ height: { xs: 24, sm: 26, md: 28 }, px: { xs: 1, sm: 1.2, md: 1.4 }, borderRadius: 999, borderColor: TOK.cardBorder, background: "#FFFFFF", color: "#344054", fontWeight: 700, fontSize: { xs: 9, sm: 10, md: 11 }, "&:hover": { borderColor: TOK.btnBlue, background: "#F8FAFF" } }}> Refresh</Button></Grid>
                  <Grid item><Button variant="outlined" disableElevation onClick={handleRunSelected} disabled={runLoading || (!isAppValidationAdmin() && !userPermissions.canRun) || selectedRows.length === 0} startIcon={runLoading ? <CircularProgress size={12} color="inherit" /> : null} sx={{ height: { xs: 24, sm: 26, md: 28 }, px: { xs: 1, sm: 1.2, md: 1.4 }, borderRadius: 999, borderColor: TOK.btnBlue, background: "#FFFFFF", color: TOK.btnBlue, fontWeight: 700, fontSize: { xs: 9, sm: 10, md: 11 }, "&:hover": { borderColor: TOK.btnBlueHover, background: "#F8FAFF" } }}>{runLoading ? 'Running...' : `Run selected (${selectedRows.length})`}</Button></Grid>
                  <Grid item><Button variant="contained" disableElevation onClick={() => { var cisToRun = filtered.map(r => r.ci); handleRun(cisToRun); }} disabled={runLoading || (!isAppValidationAdmin() && !userPermissions.canRun) || filtered.length === 0} startIcon={runLoading ? <CircularProgress size={12} color="inherit" /> : null} sx={{ height: { xs: 24, sm: 26, md: 28 }, px: { xs: 1.2, sm: 1.5, md: 1.8 }, borderRadius: 999, background: TOK.btnBlue, fontWeight: 700, fontSize: { xs: 9, sm: 10, md: 11 }, "&:hover": { background: TOK.btnBlueHover } }}>{runLoading ? 'Running...' : 'Run all validations'}</Button></Grid>
                </Grid>
              </Grid>
            </Grid>
            <Divider sx={{ borderColor: TOK.cardBorder }} />
            {loading.appValidation ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, p: 3 }}><CircularProgress size={32} /></Box>
            ) : (
              <>
                <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow sx={{ background: TOK.headerBlue }}>
                        <TableCell sx={{ width: 44, background: TOK.headerBlue }}><Box onClick={(e) => { e.stopPropagation(); handleSelectAll(); }} sx={{ width: 16, height: 16, borderRadius: 0.5, border: `2px solid ${TOK.btnBlue}`, bgcolor: (() => { var selectable = pageRows.filter(r => canUserRunForFamily(r.family, r.ci)); return selectable.length > 0 && selectable.every(r => selectedRows.includes(r.id)); })() ? TOK.btnBlue : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', '&:hover': { transform: 'scale(1.1)' } }}>{(() => { var selectable = pageRows.filter(r => canUserRunForFamily(r.family, r.ci)); return selectable.length > 0 && selectable.every(r => selectedRows.includes(r.id)); })() && <CheckIcon sx={{ fontSize: 14, color: '#fff' }} />}</Box></TableCell>
                        <TableCell sx={{ background: TOK.headerBlue }}>App family</TableCell>
                        <TableCell sx={{ background: TOK.headerBlue }}>Application CI</TableCell>
                        <TableCell sx={{ background: TOK.headerBlue }}>Last run</TableCell>
                        <TableCell sx={{ background: TOK.headerBlue }}>Status</TableCell>
                        <TableCell sx={{ background: TOK.headerBlue }}>Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {pageRows.map((r, idx) => {
                        var isSelected = selectedRows.includes(r.id);
                        var canSelect = canUserRunForFamily(r.family, r.ci);
                        return (
                          <TableRow key={`${r.ci}-${idx}`} hover selected={isSelected} onClick={(event) => { if (!event.target.closest('button') && !event.target.closest('.checkbox-cell')) handleRowClick(r.ci); }} sx={{ cursor: 'pointer', bgcolor: isSelected ? 'rgba(11, 46, 109, 0.08)' : 'inherit' }}>
                            <TableCell className="checkbox-cell" onClick={(e) => { e.stopPropagation(); if (canSelect) handleRowSelection(r.id); }}><Box sx={{ width: 16, height: 16, borderRadius: 0.5, border: `2px solid ${canSelect ? TOK.btnBlue : '#CBD5E1'}`, bgcolor: isSelected ? TOK.btnBlue : 'transparent', opacity: canSelect ? 1 : 0.5, cursor: canSelect ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', '&:hover': canSelect ? { transform: 'scale(1.1)' } : {} }}>{isSelected && <CheckIcon sx={{ fontSize: 14, color: '#fff' }} />}</Box></TableCell>
                            <TableCell sx={{ color: TOK.text, fontWeight: 700, fontSize: { xs: 10, sm: 11, md: 12 } }}>{r.family}</TableCell>
                            <TableCell sx={{ color: TOK.text, fontWeight: 700, fontSize: { xs: 10, sm: 11, md: 12 } }}>{r.ci}</TableCell>
                            <TableCell sx={{ color: "#475467", fontWeight: 600, fontSize: { xs: 10, sm: 11, md: 12 } }}>{r.lastRun}</TableCell>
                            <TableCell><StatusChip status={r.status} /></TableCell>
                            <TableCell><Button variant="contained" size="small" startIcon={runLoading ? <CircularProgress size={10} color="inherit" /> : <PlayArrowIcon />} onClick={(e) => { e.stopPropagation(); handleRun([r.ci]); }} disabled={runLoading || !canUserRunForFamily(r.family, r.ci) || r.status === 'Under Maintenance'} sx={{ textTransform: 'none', fontSize: { xs: 9, sm: 10, md: 11 }, py: 0.5, px: 1, bgcolor: '#00338e', '&:hover': { bgcolor: '#002366' } }}>{runLoading ? '...' : 'Run'}</Button></TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Box>
                <Box sx={{ flexShrink: 0 }}>
                  <Divider sx={{ borderColor: TOK.cardBorder }} />
                  <Grid container alignItems="center" justifyContent="space-between" sx={{ px: { xs: 1, sm: 1.2, md: 1.5 }, py: { xs: 0.4, sm: 0.5, md: 0.6 } }}>
                    <Grid item xs={12} md={6}><Typography variant="caption" sx={{ color: TOK.sub, fontWeight: 700 }}>Showing {pageRows.length} of {filtered.length} application CIs</Typography></Grid>
                    <Grid item xs={12} md={6}>
                      <Grid container alignItems="center" justifyContent={{ xs: "flex-start", md: "flex-end" }} columnSpacing={{ xs: 0.5, sm: 0.6, md: 0.75 }}>
                        <Grid item><IconButton size="small" onClick={() => setPage((p) => Math.max(1, p - 1))} sx={{ width: { xs: 22, sm: 24, md: 26 }, height: { xs: 22, sm: 24, md: 26 }, borderRadius: 999, border: `1px solid ${TOK.cardBorder}`, background: "#FFFFFF", p: 0.25 }}><ChevronLeftRoundedIcon sx={{ fontSize: { xs: 14, sm: 16, md: 18 } }} /></IconButton></Grid>
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => i + 1).map((p) => <Grid item key={p}><PageButton active={p === pageSafe} onClick={() => setPage(p)}>{p}</PageButton></Grid>)}
                        {totalPages > 5 && <Grid item><Typography variant="caption" sx={{ color: TOK.sub }}>...</Typography></Grid>}
                        <Grid item><IconButton size="small" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} sx={{ width: { xs: 22, sm: 24, md: 26 }, height: { xs: 22, sm: 24, md: 26 }, borderRadius: 999, border: `1px solid ${TOK.cardBorder}`, background: "#FFFFFF", p: 0.25 }}><ChevronRightRoundedIcon sx={{ fontSize: { xs: 14, sm: 16, md: 18 } }} /></IconButton></Grid>
                      </Grid>
                    </Grid>
                  </Grid>
                </Box>
              </>
            )}
          </Card>
        </Box>

        {/* Drilldown Drawer */}
        <Drawer anchor="right" open={drawerOpen} onClose={handleCloseDrawer} sx={{ '& .MuiDrawer-paper': { width: '50%', minWidth: '600px', maxWidth: '800px', boxShadow: '-4px 0 20px rgba(0,0,0,0.15)' } }} BackdropProps={{ sx: { backdropFilter: 'blur(4px)', backgroundColor: 'rgba(0, 0, 0, 0.3)' } }}>
          <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: '#f8fafc' }}>
            <Box sx={{ p: 2, borderBottom: '2px solid #e2e8f0', backgroundColor: '#fff', position: 'relative' }}>
              <IconButton onClick={handleCloseDrawer} sx={{ position: 'absolute', top: 8, right: 8, color: '#64748b', width: 28, height: 28, '&:hover': { backgroundColor: '#f1f5f9', color: '#1e293b' } }}><CloseIcon fontSize="small" /></IconButton>
              <Typography variant="h6" sx={{ fontWeight: 700, color: '#1e293b', fontSize: 16, pr: 4 }}>{selectedAppCI}</Typography>
              <Typography variant="body2" sx={{ color: '#64748b', mt: 0.25, fontSize: 12 }}>Application Validation Details</Typography>
            </Box>
            <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
              {loadingDrilldown ? <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><CircularProgress /></Box> : (
                <>
                  {(() => {
                    var allRows = drilldownData['Application CI'] ? Object.keys(drilldownData['Status']).map(index => ({ appCI: drilldownData['Application CI'][index], functionName: drilldownData['FunctionName'][index], status: drilldownData['Status'][index], timeGenerated: drilldownData['TimeGenerated'][index], serverName: drilldownData['Server Name'][index], screenshot: drilldownData['Screenshot'][index], latencyTimestamp: drilldownData['LatencyTimestamp'] ? drilldownData['LatencyTimestamp'][index] : 'N/A' })) : [];
                    var uniqueTimestamps = [...new Set(allRows.map(row => row.timeGenerated))].sort((a, b) => new Date(b) - new Date(a));
                    var rows = selectedTimestamp ? allRows.filter(row => row.timeGenerated === selectedTimestamp) : allRows;
                    var uniqueFuncs = new Map(); rows.forEach(row => { if (!uniqueFuncs.has(row.functionName)) uniqueFuncs.set(row.functionName, row); });
                    var funcArray = Array.from(uniqueFuncs.values());
                    var healthyCount = funcArray.filter(f => f.status === 'Successful' || f.status === 'Success').length;
                    var successfulRuns = uniqueTimestamps.filter(ts => { var runsForTs = allRows.filter(row => row.timeGenerated === ts); return runsForTs.every(r => r.status === 'Successful' || r.status === 'Success'); }).length;
                    var failedRuns = uniqueTimestamps.filter(ts => { var runsForTs = allRows.filter(row => row.timeGenerated === ts); return runsForTs.some(r => r.status !== 'Successful' && r.status !== 'Success'); }).length;

                    return (
                      <Grid>
                        {uniqueTimestamps.length > 1 && (
                          <Grid container spacing={1} sx={{ mb: 1.5 }} alignItems="stretch">
                            <Grid item xs={12} sm={5}>
                              <Box sx={{ backgroundColor: '#f8fafc', px: 1, py: 0.5, borderRadius: 2, border: '1px solid #e5e7eb', height: 44, display: 'flex', alignItems: 'center', '&:hover': { borderColor: '#00338e' } }}>
                                <Autocomplete options={uniqueTimestamps} value={selectedTimestamp} onChange={(e, v) => setSelectedTimestamp(v)} disableClearable size="small" fullWidth renderInput={(params) => <TextField {...params} variant="standard" placeholder="Select Run" label="Historical Runs" InputLabelProps={{ style: { color: '#00338e', fontWeight: '600', fontSize: 10 } }} InputProps={{ ...params.InputProps, disableUnderline: true, sx: { color: '#1e293b', fontSize: 10, fontWeight: 500, '& svg': { color: '#00338e' } } }} />} />
                              </Box>
                            </Grid>
                            <Grid item xs={6} sm={3.5}>
                              <Box sx={{ px: 1, py: 0.5, borderRadius: 2, backgroundColor: '#ecfdf5', border: '1px solid #6ee7b7', textAlign: 'center', height: 44, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                <Typography sx={{ fontSize: 9, fontWeight: 600, color: '#047857' }}>Success</Typography>
                                <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#047857', lineHeight: 1 }}>{successfulRuns}</Typography>
                              </Box>
                            </Grid>
                            <Grid item xs={6} sm={3.5}>
                              <Box sx={{ px: 1, py: 0.5, borderRadius: 2, backgroundColor: '#fef2f2', border: '1px solid #fca5a5', textAlign: 'center', height: 44, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                <Typography sx={{ fontSize: 9, fontWeight: 600, color: '#dc2626' }}>Failed</Typography>
                                <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#dc2626', lineHeight: 1 }}>{failedRuns}</Typography>
                              </Box>
                            </Grid>
                          </Grid>
                        )}

                        <Box sx={{ mb: 2 }}>
                          <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#1e293b', mb: 1.5 }}>Component Health: {healthyCount}/{funcArray.length} Healthy</Typography>
                          <Grid container spacing={1.5}>
                            {funcArray.map((func, idx) => (
                              <Grid item xs={6} sm={4} md={3} key={idx}>
                                <Box sx={{ p: 1, borderRadius: 2, backgroundColor: '#fff', border: `2px solid ${(func.status === 'Successful' || func.status === 'Success') ? '#6ee7b7' : '#fca5a5'}`, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', height: '100%', minHeight: 60, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                  <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#334155', mb: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.2 }}>{func.functionName}</Typography>
                                  <Chip label={(func.status === 'Successful' || func.status === 'Success') ? 'Success' : 'Failed'} size="small" sx={{ fontSize: 9, fontWeight: 600, backgroundColor: (func.status === 'Successful' || func.status === 'Success') ? '#d1fae5' : '#fee2e2', color: (func.status === 'Successful' || func.status === 'Success') ? '#047857' : '#dc2626', border: `1px solid ${(func.status === 'Successful' || func.status === 'Success') ? '#6ee7b7' : '#fca5a5'}`, width: 'fit-content', height: 18 }} />
                                </Box>
                              </Grid>
                            ))}
                          </Grid>
                        </Box>

                        <Box sx={{ backgroundColor: '#fff', borderRadius: 2, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                          <Typography sx={{ p: 1.5, fontSize: 13, fontWeight: 700, color: '#1e293b', borderBottom: '1px solid #e2e8f0' }}>Validation Details</Typography>
                          <Table size="small">
                            <TableHead>
                              <TableRow sx={{ backgroundColor: '#f8fafc' }}>
                                {['DATE', 'SERVER', 'FUNCTION', 'STATUS', 'LATENCY', 'SCREENSHOT'].map(h => <TableCell key={h} sx={{ fontWeight: 700, fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #e2e8f0', py: 0.75 }}>{h}</TableCell>)}
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {rows.map((row, idx) => (
                                <TableRow key={idx} sx={{ '&:nth-of-type(odd)': { backgroundColor: '#fafbfc' }, '&:hover': { backgroundColor: '#f0f7ff' } }}>
                                  <TableCell sx={{ fontSize: 11, color: '#475569', py: 0.75 }}>{row.timeGenerated}</TableCell>
                                  <TableCell sx={{ fontSize: 11, color: '#1e293b', fontWeight: 600, py: 0.75 }}>{row.serverName}</TableCell>
                                  <TableCell sx={{ fontSize: 11, color: '#475569', py: 0.75 }}>{row.functionName}</TableCell>
                                  <TableCell sx={{ py: 0.75 }}><Chip label={(row.status === 'Successful' || row.status === 'Success') ? 'Success' : row.status} size="small" sx={{ fontSize: 10, fontWeight: 600, backgroundColor: (row.status === 'Successful' || row.status === 'Success') ? '#d1fae5' : '#fee2e2', color: (row.status === 'Successful' || row.status === 'Success') ? '#047857' : '#dc2626', border: `1px solid ${(row.status === 'Successful' || row.status === 'Success') ? '#6ee7b7' : '#fca5a5'}`, height: 20 }} /></TableCell>
                                  <TableCell sx={{ fontSize: 11, color: '#475569', fontWeight: 600, py: 0.75 }}>{row.latencyTimestamp}</TableCell>
                                  <TableCell sx={{ py: 0.75 }}><Link href={row.screenshot} target="_blank" underline="none" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: '#2563eb', fontWeight: 600, fontSize: 11, px: 0.75, py: 0.25, borderRadius: 1, '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.3)' } }}>View</Link></TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </Box>
                      </Grid>
                    );
                  })()}
                </>
              )}
            </Box>
          </Box>
        </Drawer>
      </Box>
      )}
    </ThemeProvider>
  );
}