import React, { useState, useMemo, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box,
  IconButton, TextField, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TablePagination, Paper, Tooltip, Select, MenuItem, Popover, Chip
} from '@mui/material';
import Grid from '@mui/material/Unstable_Grid2';
import CloseIcon from '@mui/icons-material/Close';
import StorageRoundedIcon from '@mui/icons-material/StorageRounded';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import CircularProgress_Styled from '../../shared/UI Components/CircularProgress';
import { fetchNetworkMetrics_fromADX } from '../../shared/APIs/fetchAPIs';
import { getUrl } from '../../../environment';

const baseUrl = getUrl();

export default function ResourceDialog({
  open, 
  onClose, 
  appFamily, 
  appFamilyAppCIs = [],
  globalFilterData,
  date 
}) {
  const [resourceType, setResourceType] = useState('servers');
  const [resourceData, setResourceData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [cache, setCache] = useState({});
  const [columnFilters, setColumnFilters] = useState({});
  const [columnOps, setColumnOps] = useState({});
  const [filterAnchors, setFilterAnchors] = useState({});
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  const fetchResourceList = async (type) => {
    setLoading(true);
    setPage(0);
    setColumnFilters({});
    setColumnOps({});
    setSortConfig({ key: null, direction: 'asc' });

    try {
      let rows = [];

      if (type === 'servers') {
        if (globalFilterData && globalFilterData["ServerName"]) {
          Object.keys(globalFilterData["ServerName"]).forEach(key => {
            const serverAppFamily = globalFilterData["AppFamily"]?.[key] || '';
            const appCI = globalFilterData["AppCI"]?.[key] || '';
            const matchesFamily = appFamily && serverAppFamily.toLowerCase() === appFamily.toLowerCase();
            if (matchesFamily) {
              rows.push({
                "Server Name": globalFilterData["ServerName"][key],
                "Application CI": appCI,
                "Hosting Type": globalFilterData["ServerHostingType"]?.[key] || '',
                "Environment": globalFilterData["Environment"]?.[key] || globalFilterData["ServerEnvironment"]?.[key] || ''
              });
            }
          });
        }
      } else if (type === 'interfaces') {
        const params = {
          aggregate: "no",
          filters: {
            appFamily: appFamily ? [appFamily] : ["All"],
            appCI: ["All"],
            managedByGroup: ["All"],
            supportGroup: ["All"]
          },
          start_time: date?.startDate || "",
          end_time: date?.endDate || ""
        };
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 20000);
          const response = await fetch(baseUrl + 'interfaceHealthLogs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          const data = await response.json();
          if (data && data["Interfaces"] && Array.isArray(data["Interfaces"]) && data["Interfaces"].length > 0) {
            const seen = new Set();
            data["Interfaces"].forEach(item => {
              const name = item.InterfaceName || item.interfaceName || '';
              const monitor = item.CorepointMonitor || item.corepointMonitor || '';
              const key = `${name.toLowerCase()}|${monitor.toLowerCase()}`;
              if (name && !seen.has(key)) {
                seen.add(key);
                rows.push({
                  "Interface Name": name,
                  "Corepoint Monitor": monitor
                });
              }
            });
          }
        } catch (err) {
          console.error('Error fetching interfaces:', err);
        }
      } else if (type === 'network') {
        try {
          const params = {
            "Latest Only": true,
            "Application CI": appFamilyAppCIs.length > 0 ? appFamilyAppCIs : [""],
            "Start Time": date?.startDate || "",
            "End Time": date?.endDate || "",
            "Object Name": ["bytes_sent_rate"]
          };
          const data = await fetchNetworkMetrics_fromADX(params);
          const getVal = (idx, variants) => {
            for (const v of variants) {
              if (data[v] && data[v][idx] !== undefined && data[v][idx] !== null && data[v][idx] !== '') return data[v][idx];
            }
            return '';
          };
          if (data && data.ServerName && Object.keys(data.ServerName).length > 0) {
            const seen = new Set();
            Object.keys(data.ServerName).forEach(idx => {
              const serverName = getVal(idx, ['ServerName', 'serverName']);
              const resourceGroup = getVal(idx, ['ResourceGroup', 'resourceGroup', 'ResourceGroupName']);
              const subscriptionId = getVal(idx, ['SubscriptionId', 'SubscriptionID', 'subscriptionId']);
              const key = `${serverName}|${resourceGroup}|${subscriptionId}`.toLowerCase();
              if (serverName && !seen.has(key)) {
                seen.add(key);
                rows.push({
                  "Subscription ID": subscriptionId,
                  "Resource Group": resourceGroup,
                  "Server Name": serverName
                });
              }
            });
          }
        } catch { /* empty */ }
      } else if (type === 'security') {
        try {
          const response = await fetch(baseUrl + 'credentialInventory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ objectType: "all" })
          });
          const result = await response.json();
          if (result.status === 200) {
            const parsed = JSON.parse(result.Data);
            const rowCount = parsed.objectName ? Object.keys(parsed.objectName).length : 0;
            const appCISet = new Set(appFamilyAppCIs.map(ci => ci.toUpperCase()));
            for (let i = 0; i < rowCount; i++) {
              const appCI = parsed.applicationCI?.[i] || '';
              if (appCISet.size === 0 || appCISet.has(appCI.toUpperCase())) {
                rows.push({
                  "Object Type": parsed.objectName?.[i] || '',
                  "Name": parsed.secretId?.[i] || parsed.accountName?.[i] || parsed.certificateName?.[i] || '',
                  "Application CI": appCI,
                  "Expiry Date": parsed.expiryDate?.[i] ? new Date(parsed.expiryDate[i]).toLocaleDateString() : '',
                  "Server Name": parsed.serverName?.[i] || ''
                });
              }
            }
          }
        } catch { /* empty */ }
      } else {
        const response = await fetch(baseUrl + 'getOnboardingList', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appFamily: appFamily || '', appCI: '', type: type })
        });
        const data = await response.json();
        const parsed = JSON.parse(data.metaData || '{}');
        const removeResourceName = (type === 'services_new' || type === 'urls' || type === 'database_new');
        const keys = Object.keys(parsed).filter(k => !(removeResourceName && k.toLowerCase().replace(/\s/g, '') === 'resourcename'));
        if (keys.length > 0) {
          const firstKey = keys[0];
          const rowCount = Object.keys(parsed[firstKey] || {}).length;
          for (let i = 0; i < rowCount; i++) {
            const row = {};
            keys.forEach(k => { row[k] = parsed[k]?.[i] ?? ''; });
            rows.push(row);
          }
        }
      }

      setCache(prev => ({ ...prev, [type]: rows }));
      setResourceData(rows);
    } catch (err) {
      console.error('Error fetching resource list:', err);
      setCache(prev => ({ ...prev, [type]: [] }));
      setResourceData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && appFamily) {
      setCache({});
      setResourceType('servers');
      fetchResourceList('servers');
    }
  }, [open, appFamily]);

  const handleResourceTypeChange = (newType) => {
    setResourceType(newType);
    setPage(0);
    setColumnFilters({});
    setColumnOps({});
    setSortConfig({ key: null, direction: 'asc' });

    if (cache[newType]) {
      setResourceData(cache[newType]);
    } else {
      fetchResourceList(newType);
    }
  };

  const applyFiltersAndSort = (rows, colFilters, colOps, sortCfg) => {
    let filtered = [...rows];

    Object.keys(colFilters).forEach(colKey => {
      const filterVal = colFilters[colKey];
      if (!filterVal || !String(filterVal).trim()) return;
      const op = colOps[colKey] || 'contains';
      filtered = filtered.filter(row => {
        const cellVal = String(row[colKey] || '').toLowerCase();
        const needle = String(filterVal).toLowerCase();
        switch (op) {
          case 'equals': return cellVal === needle;
          case 'starts': return cellVal.startsWith(needle);
          case 'ends': return cellVal.endsWith(needle);
          case 'contains':
          default: return cellVal.includes(needle);
        }
      });
    });

    if (sortCfg.key) {
      filtered.sort((a, b) => {
        const aVal = String(a[sortCfg.key] || '').toLowerCase();
        const bVal = String(b[sortCfg.key] || '').toLowerCase();
        if (aVal < bVal) return sortCfg.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortCfg.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  };

  const processedData = useMemo(() => {
    return applyFiltersAndSort(resourceData, columnFilters, columnOps, sortConfig);
  }, [resourceData, columnFilters, columnOps, sortConfig]);

  const handleSort = (colKey) => {
    setSortConfig(prev => ({
      key: colKey,
      direction: prev.key === colKey && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
    setPage(0);
  };

  const getSortIcon = (colKey) => {
    if (sortConfig.key !== colKey) {
      return <SwapVertIcon sx={{ fontSize: 14, color: '#94a3b8' }} />;
    }
    return sortConfig.direction === 'asc'
      ? <ArrowUpwardIcon sx={{ fontSize: 14, color: '#fff' }} />
      : <ArrowDownwardIcon sx={{ fontSize: 14, color: '#fff' }} />;
  };

  const resourceTypes = [
    { label: 'Servers', value: 'servers' },
    { label: 'Services', value: 'services_new' },
    { label: 'URLs', value: 'urls' },
    { label: 'Databases', value: 'database_new' },
    { label: 'File Shares', value: 'fileshare_new' },
    { label: 'Interfaces', value: 'interfaces' },
    { label: 'Network', value: 'network' },
    { label: 'Security', value: 'security' }
  ];

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="lg" 
      fullWidth
      PaperProps={{ sx: { borderRadius: 2, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', maxHeight: '85vh', overflow: 'hidden' } }}
    >
      <DialogTitle sx={{ p: 0 }}>
        <Grid
          container
          alignItems="center"
          justifyContent="space-between"
          wrap="nowrap"
          sx={{ px: 3, pt: 2, pb: 1.25, borderBottom: '1px solid #f0f0f0' }}
        >
          <Grid xs sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 15, fontWeight: 600, color: '#333' }}>
              Monitored Resources
            </Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Application Family: <strong>{appFamily || 'N/A'}</strong>
            </Typography>
          </Grid>
          <Grid xs="auto">
            <IconButton size="small" onClick={onClose} sx={{ color: '#666' }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Grid>
        </Grid>
      </DialogTitle>

      <DialogContent sx={{ p: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', bgcolor: '#fff' }}>
        <Grid
          container
          spacing={1.5}
          alignItems="center"
          sx={{ px: 3, py: 1.5, borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}
        >
          <Grid xs>
            <Grid container spacing={0.75} alignItems="center">
              {resourceTypes.map((item) => {
                const isActive = resourceType === item.value;
                return (
                  <Grid key={item.value}>
                    <Box
                      px={1.5}
                      py={0.5}
                      borderRadius={999}
                      onClick={() => handleResourceTypeChange(item.value)}
                      sx={{
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        border: isActive ? '1px solid #00338e' : '1px solid #E2E8F0',
                        bgcolor: isActive ? '#00338e' : '#fff',
                        '&:hover': { borderColor: '#00338e', bgcolor: isActive ? '#00338e' : '#F0F4FA' }
                      }}
                    >
                      <Typography fontSize={11} fontWeight={600} color={isActive ? '#fff' : '#475569'}>{item.label}</Typography>
                    </Box>
                  </Grid>
                );
              })}
            </Grid>
          </Grid>

          <Grid xs="auto">
            <Typography sx={{ fontSize: 12, color: '#666', fontWeight: 600 }}>
              {processedData.length} resource(s)
            </Typography>
          </Grid>
        </Grid>

        {Object.keys(columnFilters).filter(k => columnFilters[k]).length > 0 && (
          <Box sx={{ px: 3, py: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', borderBottom: '1px solid #f0f0f0' }}>
            <Typography sx={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Filters:</Typography>
            {Object.entries(columnFilters)
              .filter(([k, v]) => v && String(v).trim())
              .map(([colKey, filterVal]) => (
                <Box key={colKey} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.25, borderRadius: 1, bgcolor: '#f1f5f9', border: '1px solid #e2e8f0' }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#334155' }}>{colKey}</Typography>
                  <Typography sx={{ fontSize: 11, color: '#64748b' }}>{columnOps[colKey] || 'contains'}:</Typography>
                  <Typography sx={{ fontSize: 11, color: '#1f2937', maxWidth: 120, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(filterVal)}</Typography>
                  <IconButton size="small" onClick={() => setColumnFilters(f => ({ ...f, [colKey]: '' }))} sx={{ p: 0.25, ml: 0.25 }}>
                    <CloseIcon sx={{ fontSize: 12 }} />
                  </IconButton>
                </Box>
              ))}
            <Button size="small" onClick={() => { setColumnFilters({}); setColumnOps({}); }} sx={{ fontSize: 11, textTransform: 'none', color: '#64748b' }}>Clear All</Button>
          </Box>
        )}

        <Grid container direction="column" wrap="nowrap" sx={{ flex: 1, minHeight: 0, px: 3, pb: 3, pt: 2 }}>
          {loading ? (
            <Grid container justifyContent="center" alignItems="center" sx={{ flex: 1, minHeight: 220 }}>
              <CircularProgress_Styled loadingWhat="Loading Resources" fetchingFor="Fetching resource data..." />
            </Grid>
          ) : processedData.length === 0 ? (
            <Grid container direction="column" justifyContent="center" alignItems="center" sx={{ flex: 1, minHeight: 220, gap: 1 }}>
              <StorageRoundedIcon sx={{ fontSize: 30, color: '#cbd5e1' }} />
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>No resources found</Typography>
              <Typography sx={{ fontSize: 12, color: '#94a3b8' }}>Try adjusting the filters above.</Typography>
            </Grid>
          ) : (
            <Paper elevation={0} sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', borderRadius: 1.5, border: '1px solid #E6E8EB', overflow: 'hidden', bgcolor: '#fff' }}>
              <TableContainer sx={{ flex: 1, overflowX: 'hidden', overflowY: 'auto', '&::-webkit-scrollbar': { width: 8, height: 8 }, '&::-webkit-scrollbar-thumb': { background: '#cbd5e1', borderRadius: 4 } }}>
                <Table size="small" stickyHeader sx={{ tableLayout: 'fixed', width: '100%' }}>
                  <TableHead>
                    <TableRow>
                      {Object.keys(resourceData[0] || {}).map((col) => (
                        <TableCell key={col} sx={{ fontSize: 12, fontWeight: 700, color: '#fff', backgroundColor: '#00338e', whiteSpace: 'nowrap', py: 1, px: 1.5, borderBottom: 'none' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{col}</Typography>
                            <IconButton size="small" onClick={() => handleSort(col)} sx={{ p: 0.25, color: '#fff' }}>
                              {getSortIcon(col)}
                            </IconButton>
                            <IconButton size="small" onClick={(e) => setFilterAnchors(a => ({ ...a, [col]: e.currentTarget }))} sx={{ p: 0.25, color: '#fff' }}>
                              <FilterAltIcon sx={{ fontSize: 14, color: columnFilters[col] ? '#fbbf24' : '#fff' }} />
                            </IconButton>
                            <Popover
                              open={Boolean(filterAnchors[col])}
                              anchorEl={filterAnchors[col]}
                              onClose={() => setFilterAnchors(a => ({ ...a, [col]: null }))}
                              anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                              transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                            >
                              <Box sx={{ p: 1.5, minWidth: 220 }}>
                                <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#334155', mb: 1 }}>{col} Filter</Typography>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <Select
                                    value={columnOps[col] || 'contains'}
                                    onChange={(e) => setColumnOps(o => ({ ...o, [col]: e.target.value }))}
                                    size="small"
                                    sx={{ height: 28, minHeight: 28, fontSize: 11 }}
                                    MenuProps={{ PaperProps: { sx: { '& .MuiMenuItem-root': { fontSize: 11 } } } }}
                                  >
                                    <MenuItem value="contains">Contains</MenuItem>
                                    <MenuItem value="equals">Equals</MenuItem>
                                    <MenuItem value="starts">Starts</MenuItem>
                                    <MenuItem value="ends">Ends</MenuItem>
                                  </Select>
                                  <TextField
                                    value={columnFilters[col] || ''}
                                    onChange={(e) => { setColumnFilters(f => ({ ...f, [col]: e.target.value })); setPage(0); }}
                                    placeholder="Search…"
                                    size="small"
                                    sx={{ flex: 1, '& .MuiInputBase-root': { height: 28, minHeight: 28 }, '& .MuiInputBase-input': { py: 0, fontSize: 11 } }}
                                  />
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1, gap: 0.5 }}>
                                  <Button size="small" onClick={() => setColumnFilters(f => ({ ...f, [col]: '' }))} sx={{ textTransform: 'none', fontSize: 11 }}>Clear</Button>
                                  <Button size="small" variant="contained" onClick={() => setFilterAnchors(a => ({ ...a, [col]: null }))} sx={{ textTransform: 'none', fontSize: 11 }}>Done</Button>
                                </Box>
                              </Box>
                            </Popover>
                          </Box>
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {processedData.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((row, idx) => (
                      <TableRow key={idx} sx={{ borderLeft: '4px solid transparent', transition: 'all 0.15s ease', '&:nth-of-type(odd)': { backgroundColor: '#FAFBFD' }, '&:hover': { backgroundColor: 'rgba(0, 51, 142, 0.05)', borderLeft: '4px solid #00338e' } }}>
                        {Object.values(row).map((val, cIdx) => (
                          <TableCell key={cIdx} sx={{ fontSize: 12, fontWeight: 500, py: 1.1, px: 2, color: '#1e293b', borderBottom: '1px solid #f1f5f9', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                            <Tooltip title={String(val || '')} placement="top-start">
                              <span>{String(val ?? '')}</span>
                            </Tooltip>
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                component="div"
                count={processedData.length}
                page={page}
                onPageChange={(e, newPage) => setPage(newPage)}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
                rowsPerPageOptions={[10, 25, 50, 100]}
                sx={{ flexShrink: 0, borderTop: '1px solid #E6E8EE', bgcolor: '#FAFBFD', '& .MuiTablePagination-toolbar': { minHeight: 46 }, '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': { fontSize: 12, color: '#475569' } }}
              />
            </Paper>
          )}
        </Grid>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 1.5, borderTop: '1px solid #f0f0f0', bgcolor: '#fff' }}>
        <Button onClick={onClose} variant="contained" size="small" sx={{ textTransform: 'none', fontSize: 12, px: 2.5 }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
