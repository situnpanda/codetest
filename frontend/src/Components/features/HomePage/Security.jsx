import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  Drawer,
  Divider,
  Box,
  Paper,
  Modal,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  TextField,
  Autocomplete,
  CircularProgress,
  Alert,
  Tabs,
  Tab
} from "@mui/material";
import { tableCellClasses } from '@mui/material/TableCell';
import { styled } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import { getUrl } from "../../../environment";
import { useLocation } from "react-router-dom";
import { fetchSecurityMetrics_fromADX } from "../../shared/APIs/fetchAPIs";
import CircularProgress_Styled from '../../shared/UI Components/CircularProgress';

// ─── Category Config ─────────────────────────────────────────────────────────
// To add a new category (e.g. KeyVault Secrets), add a new entry here.
// "match" is checked against objectName from the API.
// "getName" and "getResourceId" derive display values from a result row.
const CATEGORY_CONFIG = [
  {
    key: "Venafi certificates",
    title: "Venafi Certificates",
    subtitle: "Tracked certificate expiry dates across the App CI",
    match: (objectName) => objectName?.includes("Certificate"),
    getName: (row) => row.certificateName !== 'NA' ? row.certificateName : row.secretId,
    getResourceId: (row) => (row.serverName && row.serverName !== "N/A" && row.serverName !== "NA") ? row.serverName : (row.appCI || "N/A"),
  },
  {
    key: "Service Account Passwords",
    title: "Service Account Passwords",
    subtitle: "Track service account password expiration dates",
    match: (objectName) => objectName?.includes("ServiceAccount") || objectName?.includes("Service Account"),
    getName: (row) => row.accountName !== 'NA' ? row.accountName : row.secretId,
    getResourceId: (row) => row.samAccountName || "N/A",
  },
  {
    key: "KeyVault Secrets",
    title: "KeyVault Secrets",
    subtitle: "Track Azure KeyVault secret expiration dates",
    match: (objectName) => objectName?.includes("KeyVault") || objectName?.includes("Secret"),
    getName: (row) => row.secretId || "N/A",
    getResourceId: (row) => row.keyvaultName || "N/A",
  },
  // ─── Add future categories below ─────────────────────────────────────────
  // {
  //   key: "API Keys",
  //   title: "API Keys",
  //   subtitle: "Track API key expiration",
  //   match: (objectName) => objectName?.includes("APIKey"),
  //   getName: (row) => row.secretId,
  //   getResourceId: (row) => row.serverName || "N/A",
  // },
];

// Fallback config for unknown categories not listed above
const getFallbackConfig = (objectName) => ({
  key: objectName || "Unknown",
  title: objectName || "Unknown",
  subtitle: `Track ${objectName || 'unknown'} expiration dates`,
  match: (name) => name === objectName,
  getName: (row) => row.secretId || "N/A",
  getResourceId: (row) => row.serverName || row.samAccountName || "N/A",
});

const SecurityMetrics = ({ appName: appNameProp }) => {
  const appName = appNameProp;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState({ title: "", certificates: [] });
  const [modalHeader, setModalHeader] = useState("");
  const [autocompleteOptions, setAutocompleteOptions] = useState([]);
  const [originalTableData, setOriginalTableData] = useState([]);
  const [selectedCert, setSelectedCert] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [certificateNameFilter, setCertificateNameFilter] = useState([]);
  const [rawData, setRawData] = useState([]);
  const [activeTab, setActiveTab] = useState(0);
  const location = useLocation();

  const fetchSecurityData = async () => {
    try {
      if (!appName) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      const params = {
        'applicationCI': appName.toLowerCase(),
        "objectType": "all"
      };
      console.log(params)
      const result = await fetchSecurityMetrics_fromADX(params);
      console.log("Security metrics result:", result);
      
      if (result && typeof result === 'object') {
        const rowCount = result.objectName ? Object.keys(result.objectName).length : 0;
        const processedData = [];

        for (let i = 0; i < rowCount; i++) {
          const objectName = result.objectName?.[i] || '';
          
          // Dynamically resolve category config from CATEGORY_CONFIG
          const config = CATEGORY_CONFIG.find(c => c.match(objectName)) || getFallbackConfig(objectName);
          
          const row = {
            objectName,
            secretId:         result.secretId?.[i]        || '',
            expiryDate:       result.expiryDate?.[i]       || null,
            daysUntilExpiry:  result.daysUntilExpiry?.[i]  ?? null,
            certificateName:  result.certificateName?.[i]  || 'NA',
            accountName:      result.accountName?.[i]      || 'NA',
            serverName:       result.serverName?.[i]       || 'N/A',
            samAccountName:   result.samAccountName?.[i]   || 'N/A',
            keyvaultName:     result.keyvaultName?.[i]     || 'N/A',
            appCI:            result.appCI?.[i] || result.applicationCI?.[i] || appName || 'N/A',
          };

          processedData.push({
            ...row,
            category:   config.key,
            name:       config.getName(row),
            resourceId: config.getResourceId(row),
            status:     calculateDaysUntilExpiry(row.expiryDate),
            expired:    row.daysUntilExpiry !== null && row.daysUntilExpiry < 0,
          });
        }
        console.log("processedData", processedData);
        setRawData(processedData);
      }
    } catch (err) {
      console.error("Error fetching security data:", err);
      setError(err.message || "Failed to fetch security metrics");
    } finally {
      setLoading(false);
    }
  };

  const calculateDaysUntilExpiry = (expiryDate) => {
    if (!expiryDate) return "N/A";
    
    const now = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const formattedDate = expiry.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    if (diffDays < 0) return `Expired (${formattedDate})`;
    if (diffDays === 0) return "Today";
    if (diffDays <= 7) return `${diffDays} days`;
    
    return formattedDate;
  };

  const getDataByCategory = (category) => {
    return rawData.filter(item => item.category === category);
  };

  // Dynamically derive tabs from categories that actually exist in the data
  const activeCategoryKeys = [...new Set(rawData.map(item => item.category))];
  const dynamicTabs = activeCategoryKeys.map(key => {
    const config = CATEGORY_CONFIG.find(c => c.key === key) || getFallbackConfig(key);
    return config;
  });

  // Get data for currently selected tab
  const getTabData = () => {
    const currentTab = dynamicTabs[activeTab];
    if (!currentTab) return [];
    return getDataByCategory(currentTab.key);
  };

  const getStatusCounts = (category) => {
    const data = category === 'all' ? rawData : getDataByCategory(category);
    return {
      expired: data.filter(c => c.expired).length,
      upcoming: data.filter(c => !c.expired && c.daysUntilExpiry !== null && c.daysUntilExpiry <= 7).length,
      good: data.filter(c => !c.expired && (c.daysUntilExpiry === null || c.daysUntilExpiry > 7)).length
    };
  };

  const getCardStatus = (category) => {
    const counts = getStatusCounts(category);
    if (counts.expired > 0) return "critical";
    if (counts.upcoming > 0) return "warning";
    return "good";
  };

  // cardsData is now derived dynamically from tabs present in data
  const cardsData = dynamicTabs.map((config, idx) => ({
    id: idx + 1,
    title: config.title,
    subtitle: config.subtitle,
    category: config.key,
  }));

  useEffect(() => {
    fetchSecurityData();
  }, [appName]);

  // Reset filters when tab changes
  useEffect(() => {
    setCertificateNameFilter([]);
    setStatusFilter('all');
  }, [activeTab]);


  const getStatusColor = (status) => {
    switch (status) {
      case "good":
        return "#10B981";
      case "warning":
        return "#d59a59";
      case "critical":
        return "#EF4444";
      default:
        return "#6B7280";
    }
  };

  const createModal = (cardData, filter) => {
    const categoryData = getDataByCategory(cardData.category);
    let filteredCerts = [];

    if (filter === "expired") {
      filteredCerts = categoryData.filter(cert => cert.expired === true);
    } else if (filter === "upcoming") {
      filteredCerts = categoryData.filter(cert => !cert.expired && cert.daysUntilExpiry !== null && cert.daysUntilExpiry <= 7);
    } else if (filter === "good") {
      filteredCerts = categoryData.filter(cert => !cert.expired && (cert.daysUntilExpiry === null || cert.daysUntilExpiry > 7));
    }

    setAutocompleteOptions(Array.from(new Set(filteredCerts.map(cert => cert.name))));
    setOriginalTableData(filteredCerts);
    setModalData({ certificates: filteredCerts });
    setModalHeader(`${cardData.title} - ${filter === "expired" ? "Expired" : filter === "upcoming" ? "Expiring Soon (7 days)" : "All Good"}`);
    setModalOpen(true);
  };

  const handleCertChange = (event, newValue) => {
    if (newValue) {
      const filteredData = originalTableData.filter(item => item.name === newValue);
      setModalData({ certificates: filteredData });
    } else {
      setModalData({ certificates: originalTableData });
    }
  };

  const ModalTable = () => {
    const StyledTableCell = styled(TableCell)(({ theme }) => ({
      [`&.${tableCellClasses.head}`]: {
        backgroundColor: theme.palette.common.black,
        color: theme.palette.common.white,
      },
      [`&.${tableCellClasses.body}`]: {
        fontSize: 14,
      },
    }));

    return (
      <TableContainer component={Paper}>
        <Table sx={{ minWidth: 600 }} aria-label="certificate table">
          <TableHead>
            <TableRow>
              <StyledTableCell align="center">Name</StyledTableCell>
              <StyledTableCell align="center">Resource ID</StyledTableCell>
              <StyledTableCell align="center">Expiry Date</StyledTableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {modalData.certificates.map((cert, idx) => (
              <TableRow key={idx} sx={{ '&:hover': { bgcolor: '#F9FAFB' } }}>
                <TableCell align="center" sx={{ fontSize: { xs: 10, sm: 11 } }}>{cert.name}</TableCell>
                <TableCell align="center" sx={{ fontSize: { xs: 10, sm: 11 } }}>{cert.resourceId}</TableCell>
                <TableCell align="center" sx={{ 
                  fontSize: { xs: 10, sm: 11 }, 
                  fontWeight: 600,
                  color: cert.expired ? '#EF4444' : '#6B5E4A' 
                }}>
                  {cert.status}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  };

  if (loading) {
    return (
      <Grid container sx={{ bgcolor: "#FFFFFF", minHeight: "400px", display: "flex", justifyContent: "center", alignItems: "center" }}>
        <CircularProgress_Styled loadingWhat="Loading Security Metrics" fetchingFor="Fetching credential inventory data..." />
      </Grid>
    );
  }

  if (error) {
    return (
      <Grid container sx={{ bgcolor: "#FFFFFF", p: 2 }}>
        <Grid item xs={12}>
          <Alert severity="error">{error}</Alert>
        </Grid>
      </Grid>
    );
  }

  if (!rawData || rawData.length === 0) {
    return (
      <Grid container sx={{ bgcolor: "#FFFFFF", p: 2 }}>
        <Grid item xs={12}>
          <Alert severity="info">No security metrics data available for this application.</Alert>
        </Grid>
      </Grid>
    );
  }

  return (
    <Grid container sx={{ bgcolor: "#FFFFFF" }}>
      <Grid item xs={12}>
        <Paper elevation={0} sx={{ borderBottom: "1px solid #E6E8EE", minHeight: { xs: 40, sm: 48 }, px: { xs: 1, sm: 2 }, py: 1, display: "flex", alignItems: "center", gap: 1.5, bgcolor: "#fff" }}>
          <Typography sx={{ fontSize: { xs: 11, sm: 12, md: 13 }, fontWeight: 800, color: "#111827" }}>Security Metrics</Typography>
        </Paper>
      </Grid>

      {/* Tabs Section - dynamically generated from data */}
      <Grid item xs={12} sx={{ px: { xs: 1, sm: 2 }, pt: 2 }}>
        <Tabs
          value={activeTab}
          onChange={(e, newValue) => setActiveTab(newValue)}
          sx={{
            borderBottom: '1px solid #E6E8EE',
            '& .MuiTabs-indicator': { backgroundColor: '#00338e', height: 3 }
          }}
        >
          {dynamicTabs.map((config, idx) => (
            <Tab
              key={config.key}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ fontSize: { xs: 11, sm: 12 }, fontWeight: 700, textTransform: 'none' }}>
                    {config.title}
                  </Typography>
                  <Chip
                    label={getDataByCategory(config.key).length}
                    size="small"
                    sx={{
                      height: 20, fontSize: 10,
                      bgcolor: activeTab === idx ? '#00338e' : '#E6E8EE',
                      color: activeTab === idx ? '#fff' : '#111827',
                      fontWeight: 600
                    }}
                  />
                </Box>
              }
              sx={{
                textTransform: 'none', minHeight: 48,
                color: activeTab === idx ? '#00338e' : '#6B7280',
                '&.Mui-selected': { color: '#00338e' }
              }}
            />
          ))}
        </Tabs>
      </Grid>

      {/* Overview Cards Section */}
      <Grid item xs={12} sx={{ px: { xs: 1, sm: 2 }, pt: 2, pb: 2 }}>

        <Grid container spacing={2} alignItems="stretch" justifyContent="flex-start">
          {(() => {
            const currentCategory = dynamicTabs[activeTab]?.key || '';
            const categoryData = getDataByCategory(currentCategory);
            
            if (categoryData.length === 0) {
              return (
                <Grid item xs={12}>
                  <Alert severity="info">No {currentCategory.toLowerCase()} data available.</Alert>
                </Grid>
              );
            }

            const cardData = cardsData.find(card => card.category === currentCategory);
            const counts = getStatusCounts(currentCategory);
            const needAction = counts.expired + counts.upcoming;

            return (
              <Grid item xs={12} md={6} lg={4}>
                <Card sx={{ borderRadius: 2, boxShadow: "0px 4px 12px rgba(0,0,0,0.08)", backgroundColor: "#ffffff", border: "1px solid #E6E8EE", overflow: "hidden" }}>
                  <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                      <Box sx={{ flex: 1 }}>
                        <Typography sx={{ fontSize: { xs: 11, sm: 12, md: 13 }, fontWeight: 700, color: "#111827" }}>{cardData.title}</Typography>
                        <Typography sx={{ fontSize: { xs: 9, sm: 10 }, color: "#6B7280", mt: 0.5 }}>{cardData.subtitle}</Typography>
                      </Box>
                      <Tooltip title={`Total tracked: ${categoryData.length}`} arrow>
                        <InfoOutlined sx={{ fontSize: { xs: 14, sm: 16 }, color: '#6B7280', cursor: 'pointer' }} />
                      </Tooltip>
                    </Box>

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip title="Expired" arrow>
                          <Box onClick={(e) => { e.stopPropagation(); createModal(cardData, "expired"); }} sx={{ width: { xs: 22, sm: 24, md: 26 }, height: { xs: 22, sm: 24, md: 26 }, borderRadius: '50%', background: 'linear-gradient(to bottom, #EF4444, #DC2626)', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', '&:hover': { transform: 'scale(1.1)' } }}>
                            <Typography sx={{ fontSize: { xs: 8, sm: 9, md: 10 }, color: '#fff', fontWeight: 'bold' }}>{counts.expired}</Typography>
                          </Box>
                        </Tooltip>
                        <Tooltip title="Expiring Soon (7 days)" arrow>
                          <Box onClick={(e) => { e.stopPropagation(); createModal(cardData, "upcoming"); }} sx={{ width: { xs: 22, sm: 24, md: 26 }, height: { xs: 22, sm: 24, md: 26 }, borderRadius: '50%', background: 'linear-gradient(to bottom, #d59a59, #d59a59)', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', '&:hover': { transform: 'scale(1.1)' } }}>
                            <Typography sx={{ fontSize: { xs: 8, sm: 9, md: 10 }, color: '#fff', fontWeight: 'bold' }}>{counts.upcoming}</Typography>
                          </Box>
                        </Tooltip>
                        <Tooltip title="All Good" arrow>
                          <Box onClick={(e) => { e.stopPropagation(); createModal(cardData, "good"); }} sx={{ width: { xs: 22, sm: 24, md: 26 }, height: { xs: 22, sm: 24, md: 26 }, borderRadius: '50%', background: 'linear-gradient(to bottom, #24C674, #10B981)', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', '&:hover': { transform: 'scale(1.1)' } }}>
                            <Typography sx={{ fontSize: { xs: 8, sm: 9, md: 10 }, color: '#fff', fontWeight: 'bold' }}>{counts.good}</Typography>
                          </Box>
                        </Tooltip>
                      </Box>

                      <Box sx={{ textAlign: 'right' }}>
                        <Typography sx={{ fontSize: { xs: 18, sm: 20, md: 22 }, fontWeight: 700, color: "#111827" }}>{needAction}</Typography>
                        <Typography sx={{ fontSize: { xs: 8, sm: 9 }, color: "#6B7280" }}>need action</Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            );
          })()}
        </Grid>
      </Grid>

      {/* Table Section */}
      <Grid item xs={12} sx={{ px: { xs: 1, sm: 2 }, pb: 2 }}>
        <Paper elevation={0} sx={{ bgcolor: "#FFFFFF", border: "1px solid #E6E8EE", borderRadius: 2, overflow: "hidden" }}>
          <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #E6E8EE' }}>
            <Grid container justifyContent="flex-start" alignItems="center" flexWrap="wrap" gap={1}>
              <Typography sx={{ fontSize: { xs: 11, sm: 12, md: 13 }, fontWeight: 800, color: "#111827", mr: 1 }}>
                {`All ${dynamicTabs[activeTab]?.title || ''}`}
              </Typography>
              <Grid container alignItems="center" gap={0.75} flex={1} minWidth={220} maxWidth={360}>
                <Autocomplete 
                  multiple 
                  size="small" 
                  value={certificateNameFilter} 
                  onChange={(e, newValue) => setCertificateNameFilter(newValue || [])} 
                  options={Array.from(new Set(getTabData().map(item => item.name)))} 
                  renderInput={(params) => (<TextField {...params} placeholder={certificateNameFilter.length === 0 ? `Filter by ${dynamicTabs[activeTab]?.title || 'item'}...` : ""} sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#fff', fontSize: { xs: 10, sm: 11, md: 12 }, borderRadius: 2, minHeight: 38, maxHeight: 70, overflowY: 'auto', flexWrap: 'wrap', alignContent: 'flex-start', '& fieldset': { border: 'none' } } }} />)} 
                  renderTags={(tagValue, getTagProps) => tagValue.map((option, index) => (<Chip label={String(option)} {...getTagProps({ index })} size="small" sx={{ fontSize: { xs: 9, sm: 10, md: 11 }, height: 24, maxWidth: '150px' }} />))} 
                  sx={{ flex: 1, minWidth: 0 }} 
                />
              </Grid>
              <Grid container gap={1} flexWrap="wrap" flexShrink={0} width="auto">
                {[{ value: 'all', label: 'All' }, { value: 'expired', label: 'Expired' }, { value: 'active', label: 'Active' }].filter(status => {
                  const tabData = getTabData();
                  if (status.value === 'all') {
                    return tabData.length > 0;
                  } else if (status.value === 'expired') {
                    return tabData.filter(item => item.expired === true).length > 0;
                  } else if (status.value === 'active') {
                    return tabData.filter(item => item.expired === false).length > 0;
                  }
                  return true;
                }).map((status) => {
                  const isActive = statusFilter === status.value;
                  return (<Grid key={status.value} px={1.5} py={0.3} borderRadius={999} bgcolor={isActive ? (status.value === 'expired' ? '#EF4444' : status.value === 'active' ? '#4CAF50' : '#757575') : '#EEEEEE'} onClick={() => setStatusFilter(status.value)} sx={{ cursor: 'pointer', transition: 'all 0.2s', '&:hover': { transform: 'scale(1.05)', boxShadow: 1 } }}><Typography fontSize={{ xs: 9, sm: 10, md: 11 }} fontWeight={600} color={isActive ? '#fff' : '#424242'}>{status.label}</Typography></Grid>);
                })}
              </Grid>
            </Grid>
          </Box>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#00338e' }}>
                  <TableCell sx={{ fontWeight: 700, fontSize: 13, color: '#fff', py: 1.5 }}>
                    {dynamicTabs[activeTab]?.title || 'Name'}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: 13, color: '#fff', py: 1.5 }}>Resource ID</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: 13, color: '#fff', py: 1.5 }}>Expiry Date</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(() => {
                  let filteredData = getTabData();

                  // Certificate/Service Account name filter
                  if (certificateNameFilter.length > 0) {
                    filteredData = filteredData.filter(item => 
                      certificateNameFilter.some(filter => 
                        item.name.toLowerCase() === filter.toLowerCase()
                      )
                    );
                  }

                  // Status filter
                  if (statusFilter === 'expired') {
                    filteredData = filteredData.filter(item => item.expired === true);
                  } else if (statusFilter === 'active') {
                    filteredData = filteredData.filter(item => item.expired === false);
                  }

                  // Display filtered data
                  if (filteredData.length === 0) {
                    return (<TableRow><TableCell colSpan={3} align="center" sx={{ py: 4 }}><Typography sx={{ fontSize: 12, color: '#6B7280' }}>{certificateNameFilter.length > 0 || statusFilter !== 'all' ? `No ${dynamicTabs[activeTab]?.title || 'items'} match the selected filters` : `No ${dynamicTabs[activeTab]?.title || 'items'} found`}</Typography></TableCell></TableRow>);
                  }

                  return filteredData.map((cert, idx) => (
                    <TableRow key={`${cert.category}-${idx}`} sx={{ '&:hover': { bgcolor: '#f8fafc' }, borderLeft: `4px solid ${cert.expired ? '#EF4444' : '#10B981'}` }}>
                      <TableCell sx={{ fontSize: 12, py: 1, fontWeight: 600 }}>{cert.name}</TableCell>
                      <TableCell sx={{ fontSize: 11, py: 1, color: '#6B7280', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}><Tooltip title={cert.resourceId} arrow><span>{cert.resourceId}</span></Tooltip></TableCell>
                      <TableCell sx={{ py: 1 }}><Grid container sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1.5, py: 0.5, borderRadius: 999, bgcolor: cert.expired ? '#FFEBEE' : '#EAF6EA', border: `1px solid ${cert.expired ? '#EF4444' : '#4CAF50'}`, width: 'auto' }}><Grid sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: cert.expired ? '#EF4444' : '#4CAF50' }} /><Typography sx={{ fontSize: 11, fontWeight: 700, color: cert.expired ? '#C62828' : '#2E7D32' }}>{cert.status}</Typography></Grid></TableCell>
                    </TableRow>
                  ));
                })()}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Grid>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center',}}>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', border: 2, backgroundColor: 'white', flexDirection: 'column', gap: 2, maxHeight: '70vh', overflowY: 'auto', minWidth: '800px' }} p={2}>
          <Typography variant='h5'><i>{modalHeader}</i></Typography>
          <Grid container spacing={2} width="100%">
            <Grid item xs={12}>
              <Autocomplete options={autocompleteOptions} renderInput={(params) => <TextField {...params} label="Select Certificate/Service Account" variant="outlined" size="small" />} onChange={handleCertChange} fullWidth />
            </Grid>
          </Grid>
          <ModalTable />
        </Box>
      </Modal>
    </Grid>
  );
};

export default SecurityMetrics;