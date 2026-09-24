import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Grid from '@mui/material/Unstable_Grid2';
import {Box,Card,Typography,IconButton,CircularProgress,Pagination,Autocomplete,TextField,Chip,ToggleButton,ToggleButtonGroup,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,Paper,Collapse,Tooltip, CardContent, Link, Modal} from '@mui/material';
import { styled } from '@mui/material/styles';
import { tableCellClasses } from '@mui/material/TableCell';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import GridViewIcon from '@mui/icons-material/GridView';
import TableRowsIcon from '@mui/icons-material/TableRows';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { getUrl } from '../../../environment';
import CircularProgress_Styled from '../../shared/UI Components/CircularProgress';
import AlertBanner from '../../shared/UI Components/AlertBanner';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);
 
const STATUS = {
  Healthy: { border: '#4CAF50', bg: '#EAF6EA', text: '#2E7D32' },
  Warning: { border: '#F4A261', bg: '#FFF3E6', text: '#C77800' },
  Critical: { border: '#D32F2F', bg: '#FFEBEE', text: '#C62828' }
};
const getTier = (rank) => {
  if (rank === null || rank === undefined || rank === '' || rank === 'None') return null;
  const r = Number(rank);
  if (isNaN(r)) return null;
  if (r >= 85) return 'Tier 1';
  if (r >= 75) return 'Tier 2';
  if (r >= 25) return 'Tier 3';
  return null;
};

const SUBSCRIPTION_MAP = {
  'ab16a144-47d7-45c5-bcb7-8affc988f8e0': 'enterprise-clinical-apps-prod-01',
  '9592c342-d1fb-477e-8e91-ad39bf00933b': 'enterprise-clinical-apps-prod-02',
  '5467bf57-48b4-4930-b3cb-bf039b259d04': 'enterprise-clinical-apps-prod-03',
  '343a7ee0-5081-4024-82fc-498ee61867a9': 'enterprise-clinical-apps-prod-04',
  '6d590d81-bab9-4b9a-b011-090467b5a9a4': 'enterprise-clinical-apps-test-01',
  'accde124-a45f-47be-aefa-b09362b2c5fc': 'ste-test-01'
};

// Helper function to get subscription name from ID
const getSubscriptionName = (sub) => {
  const id = sub.subscriptionId || sub.id || sub;
  return sub.displayName || sub.subscriptionName || sub.name || SUBSCRIPTION_MAP[id] || id;
};
 
const StyledTableCell = styled(TableCell)(({ theme }) => ({
  [`&.${tableCellClasses.head}`]: {
    backgroundColor: '#00338e',
    color: theme.palette.common.white,
    fontWeight: 700,
    fontSize: 12,
    padding: '10px 16px',
    borderBottom: '1px solid #E0E0E0',
    letterSpacing: '0.3px'
  },
  [`&.${tableCellClasses.body}`]: {
    fontSize: 12,
    fontWeight: 600,
    padding: '8px 16px',
    color: '#1e293b',
    borderBottom: '1px solid #f1f5f9'
  }
}));
 
const StyledCard = styled(Card)({
  width: '100%',
  boxShadow: '0px 3px 6px rgba(0, 0, 0, 0.16)',
  padding: 4,
  position: 'relative',
});
 
const Header = ({ value, onChange, supportGroups, statusFilter, onStatusFilterChange, appFamilies, appFamilyValue, onAppFamilyChange, tierFilter, onTierFilterChange, viewMode, onViewModeChange }) => (
  <Box mb={3}>
    {/* <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={0.5}>
      <Box display="flex" alignItems="center" gap={1}>
        <Typography fontSize={{ xs: 14, sm: 16, md: 18 }} fontWeight={700}>CRCA Applications Wallboard</Typography>
      </Box>
      <ToggleButtonGroup value={viewMode} exclusive onChange={onViewModeChange} size="small" sx={{ ml: 2 }}>
        <Tooltip title="Grid View" arrow>
          <ToggleButton value="grid" aria-label="grid view"><GridViewIcon fontSize="small" /></ToggleButton>
        </Tooltip>
        <Tooltip title="Table View" arrow>
          <ToggleButton value="table" aria-label="table view"><TableRowsIcon fontSize="small" /></ToggleButton>
        </Tooltip>
      </ToggleButtonGroup>
    </Box> */}
   
    <Box mt={1} display="flex" justifyContent="flex-start" alignItems="center" flexWrap="wrap" gap={0.5}>
      <Box display="flex" alignItems="center" gap={0.75} flex={1} minWidth={220} maxWidth={360}>
        <Autocomplete
          multiple
          size="small"
          value={value}
          onChange={(event, newValue) => onChange(newValue)}
          options={supportGroups}
          getOptionLabel={(option) => String(option)}
          renderInput={(params) => (
            <TextField {...params} placeholder={value.length === 0 ? 'All Support Groups' : ''}
              sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#fff', fontSize: { xs: 10, sm: 11, md: 12 }, borderRadius: 2, minHeight: 38, maxHeight: 70, px: 0.5, overflowY: 'auto', flexWrap: 'wrap', alignContent: 'flex-start', width: '100%', '& fieldset': { border: 'none' } }}}
            />
          )}
          renderTags={(tagValue, getTagProps) => tagValue.map((option, index) => (
            <Chip label={String(option)} {...getTagProps({ index })} size="small" sx={{ fontSize: { xs: 9, sm: 10, md: 11 }, height: 24, maxWidth: '150px' }} />
          ))}
          sx={{ flex: 1, minWidth: 0 }}
        />
      </Box>
 
      <Box display="flex" alignItems="center" gap={0.5} flex={1} minWidth={220} maxWidth={360}>
        <Autocomplete
          multiple
          size="small"
          value={appFamilyValue}
          onChange={(event, newValue) => onAppFamilyChange(newValue)}
          options={appFamilies}
          getOptionLabel={(option) => String(option)}
          renderInput={(params) => (
            <TextField {...params} placeholder={appFamilyValue.length === 0 ? 'All Application Families' : ''}
              sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#fff', fontSize: { xs: 10, sm: 11, md: 12 }, borderRadius: 2, minHeight: 38, maxHeight: 70, overflowY: 'auto', flexWrap: 'wrap', alignContent: 'flex-start', width: '100%', '& fieldset': { border: 'none' } }}}
            />
          )}
          renderTags={(tagValue, getTagProps) => tagValue.map((option, index) => (
            <Chip label={String(option)} {...getTagProps({ index })} size="small" sx={{ fontSize: { xs: 9, sm: 10, md: 11 }, height: 24, maxWidth: '150px' }} />
          ))}
          sx={{ flex: 1, minWidth: 0 }}
        />
      </Box>

      <Box display="flex" alignItems="center" gap={0.5} minWidth={200} maxWidth={260}>
        <Autocomplete
          multiple
          size="small"
          value={tierFilter}
          onChange={(event, newValue) => onTierFilterChange(newValue)}
          options={['Tier 1', 'Tier 2', 'Tier 3']}
          getOptionLabel={(option) => String(option)}
          renderInput={(params) => (
            <TextField {...params} placeholder={tierFilter.length === 0 ? 'All Tiers' : ''}
              sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#fff', fontSize: { xs: 10, sm: 11, md: 12 }, borderRadius: 2, minHeight: 38, maxHeight: 70, overflowY: 'auto', flexWrap: 'wrap', alignContent: 'flex-start', width: '100%', '& fieldset': { border: 'none' } }}}
            />
          )}
          renderTags={(tagValue, getTagProps) => tagValue.map((option, index) => (
            <Chip label={String(option)} {...getTagProps({ index })} size="small" sx={{ fontSize: { xs: 9, sm: 10, md: 11 }, height: 24 }} />
          ))}
          sx={{ flex: 1, minWidth: 0 }}
        />
      </Box>
 
      <Box display="flex" gap={1} flexWrap="wrap" sx={{ ml: 'auto' }} flexShrink={0}>
        {['All', 'Healthy', 'Warning', 'Critical'].map((status) => {
          var isAll = status === 'All';
          var statusStyle = isAll ? { border: '#757575', bg: '#EEEEEE', text: '#424242' } : STATUS[status];
          var isActive = statusFilter === status || (statusFilter === null && isAll);
          return (
            <Box
              key={status}
              px={1.5}
              py={0.3}
              borderRadius={999}
              bgcolor={isActive ? statusStyle.border : statusStyle.bg}
              onClick={() => onStatusFilterChange(isAll ? null : (statusFilter === status ? null : status))}
              sx={{ cursor: 'pointer', transition: 'all 0.2s', '&:hover': { transform: 'scale(1.05)', boxShadow: 1 } }}
            >
              <Typography fontSize={{ xs: 9, sm: 10, md: 11 }} fontWeight={600} color={isActive ? '#fff' : statusStyle.text}>{status}</Typography>
            </Box>
          );
        })}
      </Box>
 
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={0.5}>
        <ToggleButtonGroup value={viewMode} exclusive onChange={onViewModeChange} size="small" sx={{ ml: 2 }}>
          <Tooltip title="Grid View" arrow>
            <ToggleButton value="grid" aria-label="grid view"><GridViewIcon fontSize="small" /></ToggleButton>
          </Tooltip>
          <Tooltip title="Table View" arrow>
            <ToggleButton value="table" aria-label="table view"><TableRowsIcon fontSize="small" /></ToggleButton>
          </Tooltip>
        </ToggleButtonGroup>
      </Box>
    </Box>
  </Box>
);

const PodCard = ({ title, status, percent, issues, onClick, supportGroup, affectedCIs, recoveryRanking }) => {
  var titleStr = String(title || 'Unknown');
  var statusStr = String(status || 'Healthy');
  var percentNum = percent !== undefined && percent !== null ? Number(percent) : 100;
  var issuesNum = Number(issues) || 0;
  var supportGroupStr = String(supportGroup || '');
  var s = STATUS[statusStr] || STATUS.Healthy;
  var tier = getTier(recoveryRanking);
  var tooltipContent = (
    <Box sx={{ whiteSpace: 'pre-line', fontSize: '0.7rem', maxWidth: 300 }}>
      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, mb: affectedCIs && affectedCIs.length > 0 ? 0.75 : 0, borderBottom: affectedCIs && affectedCIs.length > 0 ? '1px solid rgba(255,255,255,0.3)' : 'none', pb: affectedCIs && affectedCIs.length > 0 ? 0.5 : 0 }}>
        {titleStr}{supportGroupStr && ` - ${supportGroupStr}`}
      </Typography>
      {affectedCIs && affectedCIs.length > 0 && (
        <>
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, mb: 0.5 }}>Application CIs with issues:</Typography>
          <Box sx={{ fontSize: '0.65rem', maxHeight: 200, overflowY: 'auto' }}>
            {affectedCIs.map((ciData, idx) => (
              <Box key={idx} sx={{ mb: 0.75 }}>
                <Typography sx={{ fontSize: '0.65rem', mb: 0.25, fontWeight: 600 }}>• {ciData.name || ciData}</Typography>
                {ciData.incidents && ciData.incidents.length > 0 && (
                  <Box sx={{ ml: 1.5, mt: 0.25 }}>
                    {ciData.incidents.map((incident, incIdx) => (
                      <Box key={incIdx} sx={{ mb: 0.5 }}>
                        <Link
                          href={`https://psjh.service-now.com/now/nav/ui/classic/params/target/incident.do%3Fsysparm_query%3Dnumber%3D${incident.number}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 0.5,
                            bgcolor: 'rgba(255,255,255,0.15)',
                            color: '#fff',
                            textDecoration: 'none',
                            fontSize: '0.6rem',
                            fontWeight: 600,
                            px: 1,
                            py: 0.4,
                            borderRadius: 1,
                            border: '1px solid rgba(255,255,255,0.3)',
                            transition: 'all 0.2s ease',
                            '&:hover': {
                              bgcolor: '#fff',
                              color: '#D32F2F',
                              borderColor: '#fff',
                              transform: 'translateX(2px)',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                            }
                          }}
                        >
                          <Box component="span" sx={{ fontSize: '0.7rem' }}>🔴</Box>
                          <Box component="span">{incident.number}</Box>
                          <Box component="span" sx={{ fontSize: '0.55rem', opacity: 0.8 }}>→ View</Box>
                        </Link>
                        {incident.description && (
                          <Typography sx={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.75)', ml: 0.5, mt: 0.3, lineHeight: 1.3 }}>
                            {incident.description}
                          </Typography>
                        )}
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        </>
      )}
    </Box>
  );

  return (
    <Tooltip title={tooltipContent} arrow placement="top">
      <Card 
        onClick={onClick} 
        sx={{ 
          width: '100%',
          height: '100%',
          minWidth: '10vw',
          minHeight: '8vh',
          borderRadius: 2, 
          borderLeft: `6px solid ${s.border}`, 
          bgcolor: s.bg, 
          p: { xs: '1vh', sm: '1.2vh', md: '1.5vh' }, 
          display: 'flex', 
          flexDirection: 'column', 
          transition: 'box-shadow 0.2s, transform 0.2s', 
          cursor: onClick ? 'pointer' : 'default', 
          '&:hover': onClick ? { transform: 'scale(1.02)', boxShadow: 2 } : undefined 
        }}
      >
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={{ xs: 0.5, md: 0.75 }}>
          <Typography 
            fontSize={{ xs: '0.55rem', sm: '0.62rem', md: '0.68rem', lg: '0.75rem' }} 
            fontWeight={700} 
            sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}
          >
            {titleStr.toUpperCase()}
          </Typography>
          {tier && (
            <Box px={{ xs: 0.75, md: 1 }} py={0.2} bgcolor={s.border} borderRadius={1} ml={0.5} flexShrink={0}>
              <Typography fontSize={{ xs: '0.48rem', sm: '0.54rem', md: '0.6rem' }} fontWeight={600} color="#fff">{tier}</Typography>
            </Box>
          )}
        </Box>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start" flex={1}>
          <Box display="flex" flexDirection="column" gap={{ xs: 0.5, md: 0.75 }}>
            <Box display="flex" alignItems="center" gap={0.5}>
              <Box px={{ xs: 0.75, md: 1 }} py={0.2} bgcolor="#fff" borderRadius={1} display="inline-block">
                <Typography fontSize={{ xs: '0.48rem', sm: '0.54rem', md: '0.6rem' }} fontWeight={600} color={s.text}>{statusStr}</Typography>
              </Box>
            </Box>
            <Box display="flex" alignItems="center" gap={{ xs: 0.4, md: 0.6 }}>
              <Typography fontSize={{ xs: '0.48rem', sm: '0.54rem', md: '0.6rem' }} color="text.secondary" whiteSpace="nowrap">Early Warnings</Typography>
              <Box 
                minWidth={{ xs: 14, md: 16 }} 
                height={{ xs: 14, md: 16 }} 
                px={0.5} 
                borderRadius={999} 
                bgcolor="#E0E0E0" 
                display="flex" 
                alignItems="center" 
                justifyContent="center"
              >
                <Typography fontSize={{ xs: '0.45rem', sm: '0.5rem', md: '0.56rem' }} fontWeight={600}>{issuesNum}</Typography>
              </Box>
            </Box>
          </Box>
          <Box 
            width={{ xs: '4.5vh', sm: '5vh', md: '5.5vh' }} 
            height={{ xs: '4.5vh', sm: '5vh', md: '5.5vh' }} 
            borderRadius="50%" 
            border={`2px solid ${s.border}`} 
            bgcolor="#fff" 
            display="flex" 
            alignItems="center" 
            justifyContent="center" 
            flexShrink={0}
          >
            <Typography fontSize={{ xs: '0.4rem', sm: '0.46rem', md: '0.52rem' }} fontWeight={700} color={s.text}>{percentNum}%</Typography>
          </Box>
        </Box>
      </Card>
    </Tooltip>
  );
};

const CarouselRow = ({ title, items, onCardClick }) => {
  var [page, setPage] = useState(0);
  var itemsPerPage = items.length > 12 ? 12 : 6;
  var totalPages = Math.ceil(items.length / itemsPerPage);
  var currentItems = items.slice(page * itemsPerPage, (page + 1) * itemsPerPage);

  var handlePrev = () => setPage((prev) => Math.max(0, prev - 1));
  var handleNext = () => setPage((prev) => Math.min(totalPages - 1, prev + 1));
 
  return (
    <Box mb={1}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.5}>
        <Typography fontSize={{ xs: 11, sm: 12 }} fontWeight={700} color="#1E4FA1">{title}</Typography>
        {totalPages > 1 && (
          <Box display="flex" alignItems="center" gap={1}>
            <IconButton size="small" disabled={page === 0} onClick={handlePrev}>
              <ChevronLeftIcon fontSize="small" />
            </IconButton>
            <Typography fontSize={{ xs: 9, sm: 10 }} color="text.secondary">{page + 1}/{totalPages}</Typography>
            <IconButton size="small" disabled={page >= totalPages - 1} onClick={handleNext} sx={{ p: 0.25 }}>
              <ChevronRightIcon fontSize="small" />
            </IconButton>
          </Box>
        )}
      </Box>
      <Grid container spacing={1.5}>
        {currentItems.map((item, i) => (
          <Grid item xs={12} sm={6} md={4} lg={2} key={i}>
            <PodCard {...item} onClick={onCardClick ? () => onCardClick(item) : undefined} />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};
 
// Compact row: multiple small support groups side-by-side, cards stay same size
const CompactSupportGroupRow = ({ groups, onCardClick }) => {
  var getGroupLgWidth = (itemCount) => Math.min(12, itemCount * 2);
  var getCardLgSize = (itemCount) => Math.floor(12 / itemCount);
 
  return (
    <Box mb={1}>
      <Grid container spacing={1.5}>
        {groups.map((group, groupIdx) => {
          var lgWidth = getGroupLgWidth(group.items.length);
          var cardLgSize = getCardLgSize(group.items.length);
          var mdWidth = Math.min(12, group.items.length * 4);
          var cardMdSize = Math.floor(12 / Math.min(group.items.length, 3));
          return (
            <Grid item xs={12} sm={12} md={mdWidth} lg={lgWidth} key={groupIdx}>
              <Box>
                <Typography fontSize={{ xs: 11, sm: 12 }} fontWeight={700} color="#1E4FA1" mb={0.5} sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }} title={group.title}>{group.title}</Typography>
                <Grid container spacing={1.5}>
                  {group.items.map((item, i) => (
                    <Grid item xs={12} sm={6} md={cardMdSize} lg={cardLgSize} key={i}>
                      <PodCard {...item} onClick={onCardClick ? () => onCardClick(item) : undefined} />
                    </Grid>
                  ))}
                </Grid>
              </Box>
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
};
 
export default function PodsWallboard({ backendSessionToken, hospitalInformation, supportGroup }) {
  var navigate = useNavigate();
  var location = useLocation();
  
  var saved = sessionStorage.getItem('podsFilters');
  var initial = saved ? JSON.parse(saved) : {};
  
  var [selectedSupportGroups, setSelectedSupportGroups] = useState(initial.selectedSupportGroups || []);
  var [selectedAppFamilies, setSelectedAppFamilies] = useState(initial.selectedAppFamilies || []);
  var [selectedStatus, setSelectedStatus] = useState(initial.selectedStatus || null);
  var [selectedTiers, setSelectedTiers] = useState(initial.selectedTiers || []);
  var [page, setPage] = useState(initial.page || 1);
  var [viewMode, setViewMode] = useState(initial.viewMode || 'grid');
  
  var [isLoading, setIsLoading] = useState(true);
  var [isInitialLoad, setIsInitialLoad] = useState(true);
  var [errorMessage, setErrorMessage] = useState(null);
  var [supportGroupToFamilies, setSupportGroupToFamilies] = useState({});
  var [allSupportGroups, setAllSupportGroups] = useState([]);
  var [openAccordions, setOpenAccordions] = useState({});
  var [itemsPerPage, setItemsPerPage] = useState(24);
  var [serviceHealthEvents, setServiceHealthEvents] = useState([]);
  var baseUrl = getUrl();

  const isCriticalEvent = (event) => {
    const priority = (event.priority || event.Priority || '').toLowerCase();
    const isPriorityMatch = priority === 'critical' || priority === 'warning';
    
    // Check if description contains 'network impaired'
    const description = (event.description || event.Description || '').toLowerCase();
    const isNetworkImpaired = description.includes('network impaired');
    
    return isPriorityMatch || isNetworkImpaired;
  };
  const criticalServiceHealthEvents = serviceHealthEvents.filter(isCriticalEvent);
  const hasCriticalBanner = criticalServiceHealthEvents.length > 0;


  useEffect(() => {
    const calculateItemsPerPage = () => {
      // Use larger rowHeight when banner is displayed to fit fewer rows
      const rowHeight = hasCriticalBanner ? 200 : 165;
      const rowsPerPage = Math.ceil(window.innerHeight / rowHeight);
      setItemsPerPage(Math.max(6, rowsPerPage * 6));
    };

    calculateItemsPerPage();
    window.addEventListener('resize', calculateItemsPerPage);
    return () => window.removeEventListener('resize', calculateItemsPerPage);
  }, [hasCriticalBanner]);
 
  const fetchChangeIncidentEvents = async (hours) => {
    try {
      const incidentRes = await fetch(`${baseUrl}downtimeEvents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours, eventType: 'Major Incident' })
      });
     
      const incidentEvents = incidentRes.ok ? (await incidentRes.json()).events || [] : [];
     
      console.log('Fetched incident events:', incidentEvents);

      // Fetch Service Health events
      const serviceHealthRes = await fetch(`${baseUrl}downtimeEvents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours, eventType: 'Service Health' })
      });
      const serviceHealthEvents = serviceHealthRes.ok ? (await serviceHealthRes.json()).events || [] : [];

      return {
        incidentEvents,
        serviceHealthEvents
      };
    } catch (error) {
      console.error('Error fetching incident events:', error);
      console.error('Error fetching Service Health events:', error);
      return { incidentEvents: [], serviceHealthEvents: [] };
    }
  };
 
  var getAppFamilyOptions = () => {
    var set = new Set();
    if (selectedSupportGroups.length > 0) {
      selectedSupportGroups.forEach((sg) => {
        var sgItems = supportGroupToFamilies[String(sg)] || [];
        sgItems.forEach((it) => { if (it.title) set.add(String(it.title)); });
      });
    } else {
      Object.values(supportGroupToFamilies || {}).forEach((arr) => {
        (arr || []).forEach((it) => { if (it.title) set.add(String(it.title)); });
      });
    }
    return Array.from(set).sort();
  };

  var filterItems = (items, supportGroupStr) => {
    var res = Array.isArray(items) ? items : [];
    if (selectedStatus) res = res.filter((item) => item.status === selectedStatus);
    if (selectedSupportGroups.length === 0 && selectedAppFamilies.length === 0) return res;
   
    var isSupportGroupSelected = selectedSupportGroups.length > 0 && selectedSupportGroups.includes(supportGroupStr);
   
    if (selectedAppFamilies.length > 0) {
      var hasSelectedAppFamiliesInThisGroup = res.some((it) => {
        var fam1 = String(it.title);
        var fam2 = it.AppFamily ? String(it.AppFamily) : '';
        return selectedAppFamilies.includes(fam1) || (fam2 && selectedAppFamilies.includes(fam2));
      });
     
      if (hasSelectedAppFamiliesInThisGroup) {
        return res.filter((it) => {
          var fam1 = String(it.title);
          var fam2 = it.AppFamily ? String(it.AppFamily) : '';
          return selectedAppFamilies.includes(fam1) || (fam2 && selectedAppFamilies.includes(fam2));
        });
      }
      if (isSupportGroupSelected) return res;
      return [];
    }
    return isSupportGroupSelected ? res : [];
  };

  var fetchApplicationData = async () => {
    try {
      // Only show loading on initial load
      if (isInitialLoad) {
        setIsLoading(true);
      }
      var hasAllAccess = (supportGroup || []).some(sg => String(sg).trim().toLowerCase() === 'all');
      var supportGroupParam = "";
      if (!hasAllAccess && supportGroup && supportGroup.length > 0) {
        supportGroupParam = supportGroup.map(sg => `'${sg}'`).join(",");
      }

      var url = new URL(baseUrl + 'applicationHealthSummary');
      url.search = new URLSearchParams({ supportGroup: supportGroupParam  }).toString();
 
      var response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
 
      if (!response.ok) throw new Error('Failed to fetch application data');
 
      var data = await response.json();
      var appSummaryRaw = JSON.parse(data["Application Summary"]);
 
      if (!appSummaryRaw || Object.keys(appSummaryRaw).length === 0) {
        if (isInitialLoad) {
          setIsLoading(false);
          setIsInitialLoad(false);
        }
        return;
      }
 
      const { incidentEvents, serviceHealthEvents: fetchedServiceHealthEvents } = await fetchChangeIncidentEvents(24);
      setServiceHealthEvents(fetchedServiceHealthEvents || []);

 
      // Build AppCI to AppFamily mapping from applicationHealthSummary
      var appCIToAppFamilyMap = {};
      var appCIData = appSummaryRaw["Application CI"] || {};
      var appFamilyData = appSummaryRaw["Application Family"] || {};
 
      Object.keys(appCIData).forEach((key) => {
        var appCI = appCIData[key];
        var appFamily = appFamilyData[key];
        if (appCI && appFamily) {
          var appCIKey = String(appCI).trim().toLowerCase();
          var appFamilyValue = String(appFamily).trim();
          appCIToAppFamilyMap[appCIKey] = appFamilyValue;
        }
      });
 
      console.log('AppCI to AppFamily mapping:', appCIToAppFamilyMap);
 
      var calculateAvailabilityByAppFamily = (incidents, ciToFamilyMap) => {
        if (!Array.isArray(incidents) || incidents.length === 0) return {};
        var downtimeByAppFamily = {};
 
        incidents.forEach((incident) => {
          if (!incident) return;
          // Get AppCI from incident and convert to lowercase
          const appCI = incident.applicationCI || incident.AppCI;
          const startTime = incident.startTime || incident.start_time || incident.StartDateTime;
          const endTime = incident.endTime || incident.end_time || incident.EndDateTime;
         
          if (!appCI || !startTime) return;
 
          // Map AppCI to AppFamily using the mapping from applicationHealthSummary
          var appCIKey = String(appCI).trim().toLowerCase();
          var appFamily = ciToFamilyMap[appCIKey];
 
          if (!appFamily) return;
 
          var afKey = String(appFamily).trim().toLowerCase();
          if (!downtimeByAppFamily[afKey]) downtimeByAppFamily[afKey] = [];
 
          var start = dayjs(startTime).valueOf();
          var end;
          if (endTime && endTime !== 'None' && endTime !== 'null' && endTime !== null && String(endTime).trim() !== '') {
            end = dayjs(endTime).valueOf();
          } else {
            // If no end time, use current time (ongoing incident)
            end = dayjs().valueOf();
          }
          if (!isNaN(start) && !isNaN(end) && end >= start) downtimeByAppFamily[afKey].push([start, end]);
        });
 
        var availabilityByAppFamily = {};
        Object.keys(downtimeByAppFamily).forEach((afKey) => {
          var intervals = downtimeByAppFamily[afKey].sort((a, b) => a[0] - b[0]);
          if (!intervals || intervals.length === 0) return;
          var totalMs = 0;
          var [prevStart, prevEnd] = intervals[0];
 
          for (var i = 1; i < intervals.length; i++) {
            var [start, end] = intervals[i];
            if (start <= prevEnd) {
              prevEnd = Math.max(prevEnd, end);
            } else {
              totalMs += prevEnd - prevStart;
              prevStart = start;
              prevEnd = end;
            }
          }
          totalMs += prevEnd - prevStart;
          var downtimeHours = totalMs / (1000 * 60 * 60);
          
          // If downtime exceeds 24 hours, set availability to 0
          if (downtimeHours >= 24) {
            availabilityByAppFamily[afKey] = 0;
          } else {
            var availabilityPercent = 100 - (downtimeHours / 24) * 100;
            availabilityByAppFamily[afKey] = Math.max(0, Number(availabilityPercent.toFixed(2)));
          }
        });
        return availabilityByAppFamily;
      };
 
      var incidentsData = {};
      var availabilityByAppFamily = calculateAvailabilityByAppFamily(incidentEvents || [], appCIToAppFamilyMap);
     
      // Count active incidents per AppCI
      if (Array.isArray(incidentEvents)) {
        incidentEvents.forEach((incident) => {
          if (!incident) return;
          const appCI = incident.applicationCI || incident.AppCI;
          const status = incident.status || incident.Status;
          
          if (appCI && status && status.toLowerCase() !== 'resolved' && status.toLowerCase() !== 'closed') {
            var appCIKey = String(appCI).trim().toLowerCase();
            if (!incidentsData[appCIKey]) incidentsData[appCIKey] = [];
            // Store incident details including number
            incidentsData[appCIKey].push({
              number: incident.number || incident.Number || 'N/A',
              description: incident.description || incident.Description || '',
              status: status
            });
          }
        });
      }
 
      var categorizedData = {};
      var uniqueSupportGroups = new Set();
      var tempAggregation = {};
      var supportGroupData = appSummaryRaw["Support Group"] || {};
      var serverHealthData = appSummaryRaw["Server Health"] || {};
      var servicesHealthData = appSummaryRaw["Services Health"] || {};
      var interfacesHealthData = appSummaryRaw["Interfaces Health"] || {};
      var databaseHealthData = appSummaryRaw["Database Health"] || {};
      var fileStorageHealthData = appSummaryRaw["File Storage Health"] || {};
      var recoveryRankingData = appSummaryRaw["Recovery Ranking"] || {};
 
      Object.keys(appCIData).forEach((key) => {
        var appCI = appCIData[key];
        var appFamily = appFamilyData[key];
        var supportGroup = supportGroupData[key];
 
        if (!supportGroup || !appCI || !appFamily || String(supportGroup).trim() === '' ||
            String(appFamily).trim() === '' || String(appCI).trim() === '') return;
 
        var supportGroupStr = String(supportGroup).trim();
        var appFamilyStr = String(appFamily).trim();
        uniqueSupportGroups.add(supportGroupStr);
 
        if (!tempAggregation[supportGroupStr]) tempAggregation[supportGroupStr] = {};
        if (!tempAggregation[supportGroupStr][appFamilyStr]) {
          tempAggregation[supportGroupStr][appFamilyStr] = {
            totalIssues: 0,
            totalIncidents: 0,
            hasIssues: false,
            hasIncidents: false,
            affectedCIs: [],
            maxRecoveryRanking: null
          };
        }
 
        var issues = 0;
        var hasIssueForThisCI = false;
        var serverHealth = serverHealthData[key] || {};
        if (Object.keys(serverHealth).length > 0) {
          var serverDown = (serverHealth["UnHealthy_Cloud"] || 0) + (serverHealth["UnHealthy_OnPremise"] || 0);
          if (serverDown > 0) { 
            issues += serverDown;
            hasIssueForThisCI = true;
          }
        }
 
        var serviceHealth = servicesHealthData[key] || {};
        if (Object.keys(serviceHealth).length > 0) {
          var servicesDown = (serviceHealth["UnHealthy_Cloud"] || 0) +
                             (serviceHealth["UnHealthy_OnPremise"] || 0) +
                             (serviceHealth["UnHealthy_Url"] || 0);
          if (servicesDown > 0) { 
            issues += servicesDown;
            hasIssueForThisCI = true;
          }
        }
 
        var interfacesHealth = interfacesHealthData[key] || {};
        if (Object.keys(interfacesHealth).length > 0) {
          var interfacesStopped = interfacesHealth["Stopped"] || 0;
          if (interfacesStopped > 0) { 
            issues += interfacesStopped;
            hasIssueForThisCI = true;
          }
        }
 
        var databaseHealth = databaseHealthData[key] || {};
        if (Object.keys(databaseHealth).length > 0) {
          var databaseDown = databaseHealth["UnHealthy_Cloud"] || 0;
          if (databaseDown > 0) { 
            issues += databaseDown;
            hasIssueForThisCI = true;
          }
        }
 
        var fileStorageHealth = fileStorageHealthData[key] || {};
        if (Object.keys(fileStorageHealth).length > 0) {
          var storageDown = fileStorageHealth["UnHealthy_Cloud"] || 0;
          if (storageDown > 0) { 
            issues += storageDown;
            hasIssueForThisCI = true;
          }
        }

        var appCIKeyLower = String(appCI).trim().toLowerCase();
        var incidentDetails = incidentsData[appCIKeyLower] || [];
        var incidentCount = incidentDetails.length;
        
        // Track affected CIs with incident details
        if (hasIssueForThisCI || incidentCount > 0) {
          tempAggregation[supportGroupStr][appFamilyStr].affectedCIs.push({
            name: String(appCI).trim(),
            incidents: incidentDetails
          });
        }
        
        tempAggregation[supportGroupStr][appFamilyStr].totalIssues += issues;
        tempAggregation[supportGroupStr][appFamilyStr].totalIncidents += incidentCount;
        if (issues > 0) tempAggregation[supportGroupStr][appFamilyStr].hasIssues = true;
        if (incidentCount > 0) tempAggregation[supportGroupStr][appFamilyStr].hasIncidents = true;
        var recoveryRank = recoveryRankingData[key];
        if (recoveryRank !== null && recoveryRank !== undefined && recoveryRank !== '' && recoveryRank !== 'None') {
          var rankNum = Number(recoveryRank);
          if (!isNaN(rankNum)) {
            var curMax = tempAggregation[supportGroupStr][appFamilyStr].maxRecoveryRanking;
            if (curMax === null || rankNum > curMax) {
              tempAggregation[supportGroupStr][appFamilyStr].maxRecoveryRanking = rankNum;
            }
          }
        }
      });

      Object.keys(tempAggregation).forEach((supportGroupStr) => {
        categorizedData[supportGroupStr] = [];
        Object.keys(tempAggregation[supportGroupStr]).forEach((appFamilyStr) => {
          var familyData = tempAggregation[supportGroupStr][appFamilyStr];
          var status = "Healthy";
          if (familyData.hasIncidents) {
            status = "Critical";
          } else if (familyData.hasIssues) {
            status = "Warning";
          }
          var availabilityPercent = availabilityByAppFamily[appFamilyStr.toLowerCase()] !== undefined
            ? availabilityByAppFamily[appFamilyStr.toLowerCase()] : 100;

          categorizedData[supportGroupStr].push({
            title: String(appFamilyStr),
            status: String(status),
            percent: Number(availabilityPercent),
            issues: Number(familyData.totalIssues),
            incidents: Number(familyData.totalIncidents),
            affectedCIs: familyData.affectedCIs || [],
            recoveryRanking: familyData.maxRecoveryRanking
          });
        });
      });

      var supportGroupsArray = Array.from(uniqueSupportGroups).sort();
      setSupportGroupToFamilies(categorizedData);
      setAllSupportGroups(supportGroupsArray);
      
      if (isInitialLoad) {
        setIsLoading(false);
        setIsInitialLoad(false);
      }
    } catch (err) {
      // Only show error on initial load
      if (isInitialLoad) {
        setErrorMessage(err.message);
        setIsLoading(false);
        setIsInitialLoad(false);
      }
    }
  };
 
  useEffect(() => {
    fetchApplicationData();
    var interval = setInterval(fetchApplicationData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [baseUrl]);
 
  useEffect(() => {
    if (allSupportGroups.length > 0) {
      var initialOpenState = {};
      allSupportGroups.forEach(function(sg) { initialOpenState[String(sg)] = false; });
      setOpenAccordions(initialOpenState);
    }
  }, [allSupportGroups]);
  useEffect(() => {
    sessionStorage.setItem('podsFilters', JSON.stringify({
      selectedSupportGroups, selectedAppFamilies, selectedStatus, page, viewMode
    }));
  }, [selectedSupportGroups, selectedAppFamilies, selectedStatus, page, viewMode]);
 
  // Only show loading on initial load before any data is available
  if (isLoading && Object.keys(supportGroupToFamilies).length === 0) {
    return (
      // <Box p={3} pt={6} bgcolor="#F5F7FA" minHeight="100vh" display="flex" justifyContent="center" alignItems="center">
      //   <StyledCard sx={{ borderRadius: 2, maxWidth: 700 }}>
      //     <CardContent>
      //       <Box display="flex" justifyContent="center" alignItems="flex-start" sx={{ minHeight: 200, height: '100%' }}>
      //         <CircularProgress_Styled loadingWhat="Loading Applications Wallboard" fetchingFor="Fetching application health data and incident logs..." />
      //       </Box>
      //     </CardContent>
      //   </StyledCard>
      // </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', minHeight: '100vh', mx: 0, px: { xs: 2, sm: 3, md: 4 }, pt: { xs: 3, sm: 4 } }}>
        <StyledCard sx={{ borderRadius: 2, margin: 1 }}>
          <Grid container xs={12} justifyContent="center" alignItems="center" sx={{ minHeight: 200, height: '100%', display: 'flex' }}>
            <CircularProgress_Styled loadingWhat="Loading Applications Wallboard" fetchingFor="Fetching application health data and incident logs..." />
          </Grid>
        </StyledCard>
      </Box>
    );
  }
 
  if (errorMessage) {
    return (<Box p={3} pt={6} bgcolor="#F5F7FA" minHeight="100vh"><Typography color="error">Error loading data: {errorMessage}</Typography></Box>);
  }

  // Flatten all app families from all support groups
  var allAppFamilies = [];
  Object.keys(supportGroupToFamilies).forEach((supportGroupStr) => {
    var items = supportGroupToFamilies[supportGroupStr] || [];
    items.forEach((item) => {
      allAppFamilies.push({
        ...item,
        supportGroup: supportGroupStr
      });
    });
  });

  // Apply filters
  var filteredAppFamilies = allAppFamilies.filter((item) => {
    // Status filter
    if (selectedStatus && item.status !== selectedStatus) return false;
    
    // Support Group filter
    if (selectedSupportGroups.length > 0 && !selectedSupportGroups.includes(item.supportGroup)) return false;
    
    // App Family filter
    if (selectedAppFamilies.length > 0) {
      var fam1 = String(item.title);
      var fam2 = item.AppFamily ? String(item.AppFamily) : '';
      if (!selectedAppFamilies.includes(fam1) && (!fam2 || !selectedAppFamilies.includes(fam2))) return false;
    }
    if (selectedTiers.length > 0 && !selectedTiers.includes(getTier(item.recoveryRanking))) return false;

    return true;
  });

  // Sort by status priority (Critical > Warning > Healthy), then by title
  filteredAppFamilies.sort((a, b) => {
    var statusOrder = { 'Critical': 0, 'Warning': 1, 'Healthy': 2 };
    var pa = statusOrder[a.status] !== undefined ? statusOrder[a.status] : 3;
    var pb = statusOrder[b.status] !== undefined ? statusOrder[b.status] : 3;
    if (pa !== pb) return pa - pb;
    return String(a.title).localeCompare(String(b.title));
  });

  // Dynamic pagination - itemsPerPage is calculated based on screen size
  var totalPages = Math.ceil(filteredAppFamilies.length / itemsPerPage);
  var safePage = Math.min(page, Math.max(1, totalPages)) || 1;
  
  if (safePage !== page && filteredAppFamilies.length > 0) {
    setTimeout(() => setPage(safePage), 0);
  }
  
  var startIdx = (safePage - 1) * itemsPerPage;
  var endIdx = startIdx + itemsPerPage;
  var currentAppFamilies = viewMode === 'grid' ? filteredAppFamilies.slice(startIdx, endIdx) : filteredAppFamilies;

  var handlePageChange = (event, value) => {
    setPage(value);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
 
  var handleAppFamilyCardClick = (item) => {
    if (!item) return;
    var appFamilyName = String(item.title || '').trim();
    if (!appFamilyName) return;
    navigate('/applicationHealth?Name=' + appFamilyName + '&Type=Application Family', {
      state: { 
        metric: {},
        appFamilyName: appFamilyName
      }
    });
  };
 
  return (
    <Box p={3} pt={4} pb={totalPages > 1 ? 7 : 3} bgcolor="#F5F7FA" minHeight="100vh" overflow="auto" position="relative" display="flex" flexDirection="column">
      <Header
        value={selectedSupportGroups}
        onChange={(newGroups) => { setSelectedSupportGroups(newGroups); setPage(1); }}
        supportGroups={allSupportGroups}
        statusFilter={selectedStatus}
        onStatusFilterChange={(newStatus) => { setSelectedStatus(newStatus); setPage(1); }}
        appFamilies={getAppFamilyOptions()}
        appFamilyValue={selectedAppFamilies}
        onAppFamilyChange={(newFamilies) => { setSelectedAppFamilies(newFamilies); setPage(1); }}
        tierFilter={selectedTiers}
        onTierFilterChange={(newTiers) => { setSelectedTiers(newTiers); setPage(1); }}
        viewMode={viewMode}
        onViewModeChange={(event, newMode) => { if (newMode !== null) setViewMode(newMode); }}
      />

      {hasCriticalBanner && (
        <AlertBanner
          events={criticalServiceHealthEvents.map(event => ({
            ...event,
            title: event.title || event.number || 'Service Health Issue',
            subtitle: event.affectedSubscriptions && event.affectedSubscriptions.length > 0 
              ? `Affected Subscriptions: ${event.affectedSubscriptions.map(sub => getSubscriptionName(sub)).join(', ')}`
              : null
          }))}
          icon="⚠️"
          animationDuration={140}
        />
      )}
 
 
      {viewMode === 'grid' ? (
        <>
          {filteredAppFamilies.length === 0 ? (
            <Box textAlign="center" mt={4} mb={4}>
              <Typography fontSize={{ xs: 14, sm: 16, md: 18 }} fontWeight={600} color="text.secondary">
                {selectedStatus ? (selectedStatus === 'Warning' ? 'No Warnings in the last 24h' : selectedStatus === 'Critical' ? 'No Critical Applications as of now' : 'No data available') : 'No data available'}
              </Typography>
              <Typography fontSize={{ xs: 11, sm: 12, md: 14 }} color="#64748b" fontWeight={500} mt={1}>
                Try clearing filters or select a different support group.
              </Typography>
            </Box>
          ) : (
            <Grid container spacing={1.5}>
              {currentAppFamilies.map((item, idx) => (
                <Grid item xs={12} sm={6} md={4} lg={2} key={idx}>
                  <PodCard {...item} onClick={() => handleAppFamilyCardClick(item)} />
                </Grid>
              ))}
            </Grid>
          )}
        </>
      ) : (
        <>
          {filteredAppFamilies.length === 0 ? (
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#fff', borderRadius: 3, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)' }}>
              <Box textAlign="center" p={6}>
                <Typography fontSize={{ xs: 14, sm: 16, md: 20 }} fontWeight={700} color="#1e293b" mb={1.5}>{selectedStatus ? (selectedStatus === 'Warning' ? 'No Warnings in the last 24h' : selectedStatus === 'Critical' ? 'No Critical Applications as of now' : 'No data available') : 'No data available'}</Typography>
                <Typography fontSize={{ xs: 11, sm: 12, md: 14 }} color="#64748b" fontWeight={500}>Try clearing filters or select a different support group.</Typography>
              </Box>
            </Box>
          ) : (
            <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', borderRadius: 3, bgcolor: '#fff', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
              <Table sx={{ tableLayout: 'fixed', width: '100%', flexShrink: 0 }}>
                <colgroup>
                  <col style={{ width: '30%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '10%' }} />
                </colgroup>
                <TableHead>
                  <TableRow>
                    <StyledTableCell sx={{ fontSize: { xs: 10, sm: 11, md: 12 } }}>Application Family</StyledTableCell>
                    <StyledTableCell sx={{ fontSize: { xs: 10, sm: 11, md: 12 } }}>Support Group</StyledTableCell>
                    <StyledTableCell sx={{ fontSize: { xs: 10, sm: 11, md: 12 } }}>Status</StyledTableCell>
                    <StyledTableCell sx={{ fontSize: { xs: 10, sm: 11, md: 12 } }}>Availability</StyledTableCell>
                    <StyledTableCell sx={{ fontSize: { xs: 10, sm: 11, md: 12 } }}>Warnings</StyledTableCell>
                  </TableRow>
                </TableHead>
              </Table>
 
              <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0, '&::-webkit-scrollbar': { width: '8px' }, '&::-webkit-scrollbar-track': { background: '#f1f5f9', borderRadius: '4px' }, '&::-webkit-scrollbar-thumb': { background: '#cbd5e1', borderRadius: '4px', '&:hover': { background: '#94a3b8' } } }}>
                <Table sx={{ tableLayout: 'fixed', width: '100%' }}>
                  <colgroup>
                    <col style={{ width: '30%' }} />
                    <col style={{ width: '20%' }} />
                    <col style={{ width: '20%' }} />
                    <col style={{ width: '20%' }} />
                    <col style={{ width: '10%' }} />
                  </colgroup>
                  <TableBody>
                    {filteredAppFamilies.map((item, idx) => {
                      var s = STATUS[item.status] || STATUS.Healthy;
                      return (
                        <TableRow key={idx} onClick={() => handleAppFamilyCardClick(item)} sx={{ cursor: 'pointer', bgcolor: '#fff', transition: 'all 0.15s ease', borderLeft: '4px solid transparent', '&:hover': { bgcolor: s.bg, borderLeft: `4px solid ${s.border}`, transform: 'translateX(4px)', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' } }}>
                          <TableCell sx={{ py: 1.25, pl: 2.5, pr: 2.5, borderBottom: '1px solid #f1f5f9', fontSize: { xs: 10, sm: 11, md: 12 } }}>
                            <Box display="flex" alignItems="center" gap={1.25}>
                              <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: s.border, flexShrink: 0 }} />
                              <Typography fontSize={{ xs: 10, sm: 11, md: 12 }} fontWeight={700} color="#0f172a" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</Typography>
                              {(() => { var t = getTier(item.recoveryRanking); var sc = STATUS[item.status] || STATUS.Healthy; return t ? <Box px={1} py={0.2} borderRadius={1} bgcolor={sc.border} flexShrink={0}><Typography fontSize={9} fontWeight={600} color="#fff">{t}</Typography></Box> : null; })()}
                            </Box>
                          </TableCell>
                          <TableCell sx={{ py: 1.25, px: 2.5, borderBottom: '1px solid #f1f5f9', fontSize: { xs: 10, sm: 11, md: 12 } }}>
                            <Typography fontSize={{ xs: 10, sm: 11, md: 12 }} fontWeight={600} color="#64748b" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.supportGroup}</Typography>
                          </TableCell>
                          <TableCell sx={{ py: 1.25, px: 2.5, borderBottom: '1px solid #f1f5f9', fontSize: { xs: 10, sm: 11, md: 12 } }}>
                            <Chip label={item.status} size="small" sx={{ bgcolor: s.bg, color: s.text, fontWeight: 700, fontSize: { xs: 9, sm: 9.5, md: 10 }, height: 24, borderRadius: '6px', border: `1.5px solid ${s.border}`, '& .MuiChip-label': { px: 1.25 } }} />
                          </TableCell>
                          <TableCell sx={{ py: 1.25, px: 2.5, borderBottom: '1px solid #f1f5f9', fontSize: { xs: 10, sm: 11, md: 12 } }}>
                            <Box display="flex" alignItems="center" gap={1}>
                              <Box sx={{ flex: 1, height: 5, bgcolor: '#f1f5f9', borderRadius: '2.5px', overflow: 'hidden', position: 'relative' }}>
                                <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${item.percent}%`, bgcolor: item.percent >= 99 ? STATUS.Healthy.border : item.percent >= 95 ? STATUS.Warning.border : STATUS.Critical.border, transition: 'width 0.3s ease' }} />
                              </Box>
                              <Typography fontSize={{ xs: 10, sm: 11, md: 12 }} fontWeight={700} color={item.percent >= 99 ? STATUS.Healthy.text : item.percent >= 95 ? STATUS.Warning.text : STATUS.Critical.text} sx={{ minWidth: 40, textAlign: 'right' }}>{item.percent}%</Typography>
                            </Box>
                          </TableCell>
                          <TableCell sx={{ py: 1.25, px: 2.5, borderBottom: '1px solid #f1f5f9', fontSize: { xs: 10, sm: 11, md: 12 } }}>
                            <Box display="flex" alignItems="center" justifyContent="center">
                              <Box sx={{ bgcolor: item.issues > 0 ? '#FEF3C7' : '#F1F5F9', color: item.issues > 0 ? '#92400E' : '#64748B', fontWeight: 700, fontSize: { xs: 10, sm: 11, md: 12 }, px: 1.75, py: 0.4, borderRadius: '6px', minWidth: 36, textAlign: 'center', border: item.issues > 0 ? '1.5px solid #FCD34D' : '1.5px solid #E2E8F0' }}>{item.issues}</Box>
                            </Box>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Box>
            </Box>
          )}
        </>
      )}

      {viewMode === 'grid' && totalPages > 1 && (
        <Box position="fixed" bottom={0} left={0} right={0} bgcolor="#F5F7FA" py={0.75} display="flex" justifyContent="center" borderTop="1px solid #E0E0E0" zIndex={100}>
          <Pagination count={totalPages} page={page} onChange={handlePageChange} color="primary" size="small" showFirstButton showLastButton siblingCount={0} boundaryCount={1} />
        </Box>
      )}
    </Box>
  );
}