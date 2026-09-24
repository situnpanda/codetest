import * as React from 'react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { Button, Popover, MenuItem, Chip, Box, Alert, Tooltip } from '@mui/material';
import DateRangeTwoToneIcon from '@mui/icons-material/DateRangeTwoTone';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('America/Los_Angeles'); // for validation/backend

// Minimum allowed timeline start in PST
const MIN_ALLOWED_PST = dayjs.tz('2025-12-31 00:00:00', 'America/Los_Angeles');

const shortcutsItems = [
  {
    label: 'Last 30 minutes',
    getValue: () => {
      const now = dayjs();
      return [now.subtract(30, 'minute'), now];
    },
  },
  {
    label: 'Last 5 hours',
    getValue: () => {
      const now = dayjs();
      return [now.subtract(5, 'hour'), now];
    },
  },
  {
    label: 'Last 10 hours',
    getValue: () => {
      const now = dayjs();
      return [now.subtract(10, 'hour'), now];
    },
  },
  {
    label: 'Last 1 day',
    getValue: () => {
      const now = dayjs();
      return [now.subtract(1, 'day'), now];
    },
  },
  // {
  //   label: 'Last 30 Days',
  //   getValue: () => {
  //     const now = dayjs();
  //     return [now.subtract(30, 'day'), now];
  //   },
  // },
  { label: 'Choose Custom Timeline', getValue: () => [null, null] },
];

const formatRange = (startDate, endDate, tz = dayjs.tz.guess()) => {
  var start = dayjs.tz(startDate, tz);
  var end = dayjs.tz(endDate, tz);
  const tzFullMap = {
    'Asia/Kolkata': 'Indian Standard Time',
    'Asia/Calcutta': 'Indian Standard Time',
    'America/Los_Angeles': 'Pacific Standard Time',
  };
  const tzName = tzFullMap[tz] || tz;

  return (
    <div style={{ flexGrow: 1 }}>
    <div style={{ fontWeight: 400, fontSize: '0.85rem', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
      {dayjs(start).tz(tz).format('DD MMM HH:mm')} → {dayjs(end).tz(tz).format('DD MMM HH:mm')}
    </div>
   
  </div>
  );
};

export default function TimelineFilter({ preferredTZ, onRangeSelect, location, showBetaFeatures }) {
  const [anchorEl, setAnchorEl] = React.useState(null);
  const [selectedRange, setSelectedRange] = React.useState({});
  const [customRange, setCustomRange] = React.useState([null, null]);
  const [showCustomPicker, setShowCustomPicker] = React.useState(false);
  const [selectedChip, setSelectedChip] = React.useState('');
  const [errorMessage, setErrorMessage] = React.useState('');
  const [buttonLabel, setButtonLabel] = React.useState('');

  React.useEffect(() => {

    let initialShortcut = shortcutsItems[1];
    if (
      location.pathname === '/homePage/applicationHealth/serverStatus' ||
      location.pathname === '/homePage/serverStatus' ||
      location.pathname === '/homePage/applicationHealth/AppStatus' ||
      location.pathname === '/homePage/applicationHealth/ApplicationInsights' ||
      location.pathname.toLowerCase() === '/homepage/applicationhealth/databasemetrics' ||
      location.pathname.toLowerCase() === '/homepage/databasemetrics'
    ) {
      initialShortcut = shortcutsItems[1];
    } else if (location.pathname.toLowerCase().includes('validation')) {
      initialShortcut = shortcutsItems[3];
    } else if (location.pathname.toLowerCase().includes('bakingnow')) {
      // If navigated from LeadershipSummary/heatmap with UTC URL params, show converted range
      const sp = new URLSearchParams(location.search);
      const urlStart = sp.get('startTime');
      const urlEnd = sp.get('endTime');
      if (urlStart && urlEnd) {
        const startUTC = dayjs.utc(urlStart);
        const endUTC = dayjs.utc(urlEnd);
        if (startUTC.isValid() && endUTC.isValid()) {
          const startUserTZ = startUTC.tz(preferredTZ);
          const endUserTZ = endUTC.tz(preferredTZ);
          const startPST = startUTC.tz('America/Los_Angeles');
          const endPST = endUTC.tz('America/Los_Angeles');
          setSelectedRange([startUserTZ, endUserTZ]);
          setSelectedChip('Custom');
          setButtonLabel(formatRange(startUserTZ, endUserTZ, preferredTZ));
          if (onRangeSelect) {
            onRangeSelect(
              startPST.format('YYYY-MM-DD hh:mm:ss A'),
              endPST.format('YYYY-MM-DD hh:mm:ss A'),
              preferredTZ
            );
          }
          return;
        }
      }
      initialShortcut = shortcutsItems[3]; // Last 1 day
    } else if (location.pathname.toLowerCase().includes('applicationhealth')) {
      initialShortcut = shortcutsItems[1]; 
    }
 else if (location.pathname.toLowerCase().includes('applicationhealth')) {
      initialShortcut = shortcutsItems[1]; 
    }

    const [start, end] = initialShortcut.getValue();
    setSelectedRange([start, end]);
    setSelectedChip(initialShortcut.label);
    setButtonLabel(formatRange(start, end, preferredTZ));
    handleChipClick(initialShortcut, preferredTZ);
  }, []);

  React.useEffect(() => {
    if (selectedRange && selectedRange[0] && selectedRange[1]) {
      setButtonLabel(formatRange(selectedRange[0], selectedRange[1], preferredTZ));
    }
  }, [preferredTZ]);


  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
    setShowCustomPicker(false);
    setErrorMessage('');
  };

  const handleChipClick = (shortcut, tzOverride = preferredTZ) => {
    setSelectedChip(shortcut.label);

    if (shortcut.label === 'Choose Custom Timeline') {
      setShowCustomPicker(true);
      return;
    }

    const [start, end] = shortcut.getValue();
    const startPST = start.tz('America/Los_Angeles');
    const endPST = end.tz('America/Los_Angeles');

    // Clamp to minimum allowed
    const clampedStartPST = startPST.isBefore(MIN_ALLOWED_PST) ? MIN_ALLOWED_PST : startPST;
    const clampedEndPST = endPST.isBefore(MIN_ALLOWED_PST) ? MIN_ALLOWED_PST : endPST;

    // Reflect clamp in user's TZ for display/state
    const clampedStartUserTZ = clampedStartPST.tz(tzOverride);
    const clampedEndUserTZ = clampedEndPST.tz(tzOverride);

    setSelectedRange([clampedStartUserTZ, clampedEndUserTZ]);
    setButtonLabel(formatRange(clampedStartUserTZ, clampedEndUserTZ, tzOverride));

    if (onRangeSelect) {
      onRangeSelect(
        clampedStartPST.format('YYYY-MM-DD hh:mm:ss A'),
        clampedEndPST.format('YYYY-MM-DD hh:mm:ss A'),
        tzOverride
      );
    }

    setShowCustomPicker(false);
    handleClose();
  };

  const handleCustomApply = () => {
    const nowPST = dayjs().tz('America/Los_Angeles');

    if (!customRange[0] || !customRange[1]) {
      setErrorMessage('Please enter your custom dates.');
      return;
    }

    // interpret as user-local without conversion
    const userStart = customRange[0].tz(preferredTZ, true);
    const userEnd = customRange[1].tz(preferredTZ, true);

    const startPST = userStart.tz('America/Los_Angeles');
    const endPST = userEnd.tz('America/Los_Angeles');

    if (startPST.isAfter(endPST)) {
      setErrorMessage('End date cannot be prior to start date.');
    } else if (startPST.isAfter(nowPST)) {
      setErrorMessage('Start date cannot be after the current timestamp.');
    } else if (endPST.isAfter(nowPST)) {
      setErrorMessage('End date cannot be after the current timestamp.');
    } else if (startPST.isBefore(MIN_ALLOWED_PST) || endPST.isBefore(MIN_ALLOWED_PST)) {
      setErrorMessage('Dates must be on or after Jan 1st, 2026');
    } else {
      setSelectedRange([userStart, userEnd]);
      setSelectedChip('Custom');
      setButtonLabel(formatRange(userStart, userEnd, preferredTZ));

      if (onRangeSelect) {
        onRangeSelect(
          startPST.format('YYYY-MM-DD hh:mm:ss A'),
          endPST.format('YYYY-MM-DD hh:mm:ss A'),
          preferredTZ
        );
      }

      setShowCustomPicker(false);
      handleClose();
    }
  };

  return (
    <Box>
      <Tooltip title="Filter by Timeline" arrow>
        <Button
          variant="contained"
          onClick={handleClick}
          style={{
            background: 'rgba(255,255,255,0.8)',
            color: '#333',
            borderRadius: '4px',
            textTransform: 'none',
            padding: '4px 8px',
            width: '260px',
            minHeight: '28px',
            height: 'auto',
            boxShadow: 'none',
            border: '1px solid #E6E8EB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            fontSize: 12,
          }}
          startIcon={<DateRangeTwoToneIcon style={{ fontSize: 16, color: '#666' }} />}
          endIcon={<ArrowDropDownIcon style={{ fontSize: 12, color: '#666' }} />}
        >
          {buttonLabel}
        </Button>
      </Tooltip>
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <Box p={2} display="flex" flexDirection={showCustomPicker ? 'row' : 'column'} gap={2}>
          <Box>
            {shortcutsItems.map((shortcut) => (
              <MenuItem key={shortcut.label} onClick={() => handleChipClick(shortcut)}>
                <Chip
                  label={shortcut.label}
                  clickable
                  sx={{
                    backgroundColor: selectedChip === shortcut.label ? '#00338e' : 'default',
                    color: selectedChip === shortcut.label ? 'white' : 'default',
                  }}
                />
              </MenuItem>
            ))}
          </Box>
          {showCustomPicker && (
            <Box sx={{ p: 1.5, minWidth: '300px', maxWidth: '320px' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, px: 0.5 }}>
                <Box sx={{ textAlign: 'center', flex: 1 }}>
                  <Box sx={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.25 }}>Start</Box>
                  <Box sx={{ fontSize: '12px', fontWeight: 700, color: customRange[0] ? '#00338e' : '#cbd5e1' }}>{customRange[0] ? dayjs(customRange[0]).format('MMM D, h:mm a') : '— select —'}</Box>
                </Box>
                <Box sx={{ fontSize: '16px', color: '#cbd5e1', mx: 1 }}>→</Box>
                <Box sx={{ textAlign: 'center', flex: 1 }}>
                  <Box sx={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.25 }}>End</Box>
                  <Box sx={{ fontSize: '12px', fontWeight: 700, color: customRange[1] ? '#00338e' : '#cbd5e1' }}>{customRange[1] ? dayjs(customRange[1]).format('MMM D, h:mm a') : '— select —'}</Box>
                </Box>
              </Box>
              <DatePicker
                selectsRange
                startDate={customRange[0] ? customRange[0].toDate() : null}
                endDate={customRange[1] ? customRange[1].toDate() : null}
                onChange={([start, end]) => {
                  const s = start ? dayjs(start) : null;
                  const e = end ? dayjs(end) : null;
                  const mergedStart = s && customRange[0] ? s.hour(customRange[0].hour()).minute(customRange[0].minute()) : s;
                  const mergedEnd = e && customRange[1] ? e.hour(customRange[1].hour()).minute(customRange[1].minute()) : e;
                  setCustomRange([mergedStart, mergedEnd]);
                }}
                minDate={dayjs().subtract(1, 'month').toDate()} maxDate={new Date()} inline calendarClassName="compact-cal"
              />
              <Box sx={{ display: 'flex', gap: 1, mt: 1.5, mb: 1.5 }}>
                {[['Start Time', 0], ['End Time', 1]].map(([label, idx]) => (
                  <Box key={label} sx={{ flex: 1 }}>
                    <Box sx={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.5 }}>{label}</Box>
                    <input type="time" className="time-input"
                      value={customRange[idx] ? dayjs(customRange[idx]).format('HH:mm') : ''}
                      onChange={(e) => {
                        if (!e.target.value) return;
                        const [h, m] = e.target.value.split(':');
                        const base = customRange[idx] ? dayjs(customRange[idx]) : dayjs();
                        const updated = base.hour(Number(h)).minute(Number(m)).second(0);
                        setCustomRange(idx === 0 ? [updated, customRange[1]] : [customRange[0], updated]);
                      }}
                    />
                  </Box>
                ))}
              </Box>
              {errorMessage && <Alert severity="error" sx={{ fontSize: '11px', py: 0.25, mb: 1 }}>{errorMessage}</Alert>}
              <Box display="flex" gap={1}>
                <Button onClick={handleClose} variant="outlined" size="small" fullWidth sx={{ textTransform: 'none', borderRadius: '7px', fontSize: '12px', py: 0.6 }}>Cancel</Button>
                <Button onClick={handleCustomApply} variant="contained" size="small" fullWidth sx={{ textTransform: 'none', bgcolor: '#00338e', borderRadius: '7px', fontSize: '12px', py: 0.6, '&:hover': { bgcolor: '#002870' } }}>Apply</Button>
              </Box>
            </Box>
          )}
        </Box>
      </Popover>
      <style>{`
        .compact-cal { width: 100% !important; }
        .react-datepicker { font-family: inherit; border: none !important; border-radius: 10px; box-shadow: none; font-size: 12px; width: 100%; }
        .react-datepicker__month-container { width: 100%; }
        .react-datepicker__header { background: linear-gradient(135deg, #00338e 0%, #0047b3 100%); border-bottom: none; border-radius: 8px 8px 0 0; padding: 10px 0 8px; }
        .react-datepicker__current-month { color: white; font-weight: 600; font-size: 12px; margin-bottom: 6px; }
        .react-datepicker__day-name { color: rgba(255,255,255,0.8); font-size: 10px; font-weight: 600; width: 1.9rem; line-height: 1.6rem; margin: 0.1rem; }
        .react-datepicker__day { border-radius: 50%; font-size: 11px; width: 1.9rem; line-height: 1.9rem; margin: 0.1rem; transition: background 0.12s ease; font-weight: 400; color: #334155; }
        .react-datepicker__day:hover { background-color: #e0ecff; color: #00338e; }
        .react-datepicker__day--selected, .react-datepicker__day--range-start, .react-datepicker__day--range-end { background: #00338e !important; color: white !important; font-weight: 700; border-radius: 50%; }
        .react-datepicker__day--in-range { background: #dbeafe; color: #1e40af; border-radius: 0; }
        .react-datepicker__day--in-selecting-range { background: #dbeafe !important; color: #1e40af; }
        .react-datepicker__day--range-start { border-radius: 50% 0 0 50% !important; }
        .react-datepicker__day--range-end { border-radius: 0 50% 50% 0 !important; }
        .react-datepicker__day--range-start.react-datepicker__day--range-end { border-radius: 50% !important; }
        .react-datepicker__day--today { font-weight: 700; color: #0047b3; }
        .react-datepicker__day--disabled { color: #cbd5e1 !important; background: none !important; }
        .react-datepicker__month { padding: 4px 8px; margin: 0; }
        .react-datepicker__navigation { top: 12px; }
        .react-datepicker__navigation-icon::before { border-color: white; border-width: 2px 2px 0 0; height: 6px; width: 6px; }
        .time-input { width: 100%; padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 13px; font-family: inherit; background: #f8fafc; color: #1e293b; cursor: pointer; transition: all 0.15s; box-sizing: border-box; }
        .time-input:hover { border-color: #93c5fd; background: #fff; }
        .time-input:focus { outline: none; border-color: #00338e; box-shadow: 0 0 0 3px rgba(0,51,142,0.08); background: #fff; }
        .time-input::-webkit-calendar-picker-indicator { opacity: 0.5; cursor: pointer; filter: invert(20%) sepia(80%) saturate(400%) hue-rotate(200deg); }
        .time-input::-webkit-calendar-picker-indicator:hover { opacity: 1; }
      `}</style>
    </Box>
  );
}