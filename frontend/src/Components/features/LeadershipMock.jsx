import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import SearchIcon from '@mui/icons-material/Search';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import NotificationsIcon from '@mui/icons-material/Notifications';
import Badge from '@mui/material/Badge';
import OngoingOverview from './OngoingOverview';
import SummaryOverview from './SummaryOverview';
import { SystemEventsDrawer } from './SummaryOverview';

export default function LeadershipMock() {
  const [activeTab, setActiveTab] = useState('ongoing');
  const [timeRange, setTimeRange] = useState('24h');
  const [eventsOpen, setEventsOpen] = useState(false);
  const handleTabChange = (event, newValue) => setActiveTab(newValue);
  const handleTimeRangeChange = (event) => setTimeRange(event.target.value);
  const toggleEvents = () => setEventsOpen((s) => !s);

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: '#f5f6fa',
      }}
    >
      <Box
        sx={{
          width: '100%',
          bgcolor: '#ffffff',
          borderBottom: '1px solid #e5e7eb',
          pt: 5, // top padding
          pb: 0,
          px: 3,
        }}
      >
        {/* HEADER ROW */}
        <Box
          sx={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 3,
            pb: 1.5,
          }}
        >
          {/* LEFT: PAGE TITLE */}
          <Typography
            sx={{
              fontSize: '1.1rem',
              fontWeight: 700,
              color: '#0f172a',
              whiteSpace: 'nowrap',
            }}
          >
            {activeTab === 'ongoing' ? 'Operations Command Centre' : 'Leadership Dashboard'}
          </Typography>

          {/* CENTER: SEARCH BAR (extended) */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              px: 2,
              py: 0.7,
              borderRadius: '999px',
              border: '1px solid #d1d5db',
              flex: 1,
              maxWidth: '600px',
              bgcolor: '#ffffff',
            }}
          >
            <Typography
              sx={{
                flex: 1,
                fontSize: '0.85rem',
                color: '#6b7280',
              }}
            >
              Search &apos;Application Family, Server Name&apos;
            </Typography>

            {/* CLEAR ICON */}
            <Box
              sx={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                bgcolor: '#f3f4f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                color: '#6b7280',
                cursor: 'pointer',
                mr: 1,
              }}
            >
              ×
            </Box>

            {/* SEARCH ICON */}
            <IconButton
              size="small"
              sx={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                bgcolor: '#1d4ed8',
                '&:hover': { bgcolor: '#1d4ed8' },
              }}
            >
              <SearchIcon sx={{ color: 'white', fontSize: 18 }} />
            </IconButton>
          </Box>

        </Box>

        {/* SPLIT BANNER - RED FOR MI / OCHRE YELLOW FOR CHANGE REQUESTS - THIN LINE */}
        <Box
          sx={{
            display: 'flex',
            width: '100%',
            height: '32px',
            overflow: 'hidden',
          }}
        >
          {/* RED HALF - Major Incident */}
          <Box
            sx={{
              flex: 1,
              px: 2,
              py: 0.6,
              bgcolor: '#fee2e2',
              borderLeft: '3px solid #dc2626',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                bgcolor: '#dc2626',
                flexShrink: 0,
              }}
            />
            <Typography
              sx={{
                fontWeight: 700,
                color: '#7f1d1d',
                letterSpacing: 0.3,
                textTransform: 'uppercase',
                fontSize: '0.65rem',
                mr: 1,
              }}
            >
              Major Incident
            </Typography>
            <Typography
              sx={{ color: '#991b1b', fontSize: '0.75rem', fontWeight: 500 }}
            >
              MI-243 actively being worked on
            </Typography>
          </Box>

          {/* OCHRE YELLOW HALF - Change Request */}
          <Box
            sx={{
              flex: 1,
              px: 2,
              py: 0.6,
              bgcolor: '#fef3c7',
              borderLeft: '1px solid #fbbf24',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                bgcolor: '#d97706',
                flexShrink: 0,
              }}
            />
            <Typography
              sx={{
                fontWeight: 700,
                color: '#78350f',
                letterSpacing: 0.3,
                textTransform: 'uppercase',
                fontSize: '0.65rem',
                mr: 1,
              }}
            >
              Change Window
            </Typography>
            <Typography
              sx={{ color: '#92400e', fontSize: '0.75rem', fontWeight: 500 }}
            >
              Emergency DB fixes only - all other changes on hold
            </Typography>
          </Box>
        </Box>

        {/* TABS ROW WITH LAST UPDATED */}
        <Box
          sx={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            pt: 1.5,
            pb: 0,
          }}
        >
          <Tabs
            value={activeTab}
            onChange={handleTabChange}
            TabIndicatorProps={{
              sx: {
                height: 3,
                bgcolor: '#2563eb',
                borderRadius: '3px 3px 0 0',
              },
            }}
            sx={{
              minHeight: 38,
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.9rem',
                minHeight: 38,
                color: '#6b7280',
                px: 2,
                '&.Mui-selected': {
                  color: '#111827',
                },
              },
            }}
          >
            <Tab value="ongoing" label="Ongoing" />
            <Tab value="summary" label="Summary" />
          </Tabs>

          {activeTab === 'ongoing' ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Badge badgeContent={3} color="error" sx={{ cursor: 'pointer', ml: -6 }} onClick={toggleEvents}>
                <NotificationsIcon sx={{ color: '#6b7280', fontSize: 18 }} />
              </Badge>
              <Typography
                sx={{
                  fontSize: '0.75rem',
                  color: '#6b7280',
                  fontWeight: 700,
                  fontFamily: 'Barlow, sans-serif',
                  whiteSpace: 'nowrap',
                }}
              >
                Last updated 2 mins ago
              </Typography>
            </Box>
          ) : (
            <Select
              value={timeRange}
              onChange={handleTimeRangeChange}
              IconComponent={KeyboardArrowDownIcon}
              sx={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#111827',
                height: 32,
                minWidth: 140,
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#d1d5db',
                  borderRadius: 2,
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#9ca3af',
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#2563eb',
                  borderWidth: 1,
                },
              }}
            >
              <MenuItem value="24h" sx={{ fontSize: '0.75rem' }}>Last 24h</MenuItem>
              <MenuItem value="1week" sx={{ fontSize: '0.75rem' }}>Last 1 week</MenuItem>
              <MenuItem value="1month" sx={{ fontSize: '0.75rem' }}>Last 1 month</MenuItem>
            </Select>
          )}
        </Box>
      </Box>

      {/* ===== MAIN CONTENT AREA ===== */}
      <Box sx={{ p: 3 }}>
        {activeTab === 'ongoing' && <OngoingOverview />}
        {activeTab === 'summary' && <SummaryOverview />}
      </Box>

      {/* System events drawer controlled by header notifications icon */}
      <SystemEventsDrawer open={eventsOpen} onClose={toggleEvents} />
    </Box>
  );
}