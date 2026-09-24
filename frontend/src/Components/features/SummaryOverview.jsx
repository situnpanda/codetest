import React, { useState } from 'react';
import { Box, Typography, Card, CardContent, TextField, InputAdornment, ToggleButtonGroup, ToggleButton, Chip, Drawer, MenuItem } from '@mui/material';
import Grid from '@mui/material/Unstable_Grid2';
import { AccessTime, WarningAmberRounded, CheckCircleRounded, CancelRounded, SearchRounded, FirstPageRounded, LastPageRounded, KeyboardArrowLeftRounded, KeyboardArrowRightRounded, InfoOutlined, Circle as CircleIcon } from '@mui/icons-material';

const [BLUE_MAIN, MAROON_MAIN, NAVY_MAIN, SAND, GREEN_MAIN, RED_MAIN, OCHRE_MAIN, BLUE_TINT, NAVY_TINT] = 
  ['#335fa8', '#8f5161', '#4a5b6a', '#ede9da', '#5da44f', '#e35555', '#df9538', '#d9e0ec', '#dddfe2'];

/* ---------- DATA ---------- */

const SYSTEM_EVENTS = [
  {
    type: "Change",
    color: "orange",
    title: "Change 123 started for Deviceconx",
    time: "20 mins ago",
    tag: "Change"
  },
  {
    type: "Maintenance",
    color: "orange",
    title: "Maintenance window started for Deviceconx",
    time: "45 mins ago",
    tag: "Maintenance"
  },
  {
    type: "Backup",
    color: "orange",
    title: "Backup started for Deviceconx",
    time: "1 hour ago",
    tag: "Backup"
  },
  {
    type: "Backup",
    color: "green",
    title: "Backup complete for Deviceconx",
    time: "2 hours ago",
    tag: "Backup"
  },
  {
    type: "Incident",
    color: "red",
    title: "MI initiated for Deviceconx",
    time: "3 hours ago",
    tag: "Incident"
  },
  {
    type: "Maintenance",
    color: "green",
    title: "Maintenance complete for Deviceconx",
    time: "4 hours ago",
    tag: "Maintenance"
  },
  {
    type: "Change",
    color: "green",
    title: "Change 122 complete for Deviceconx",
    time: "5 hours ago",
    tag: "Change"
  },
  {
    type: "Backup",
    color: "green",
    title: "Backup complete for Deviceconx",
    time: "6 hours ago",
    tag: "Backup"
  },
  {
    type: "Maintenance",
    color: "orange",
    title: "Maintenance started for Deviceconx",
    time: "7 hours ago",
    tag: "Maintenance"
  },
  {
    type: "Change",
    color: "orange",
    title: "Change 121 started for Deviceconx",
    time: "8 hours ago",
    tag: "Change"
  },
  {
    type: "Backup",
    color: "orange",
    title: "Backup started for Deviceconx",
    time: "10 hours ago",
    tag: "Backup"
  },
  {
    type: "Maintenance",
    color: "green",
    title: "Maintenance complete for Deviceconx",
    time: "12 hours ago",
    tag: "Maintenance"
  }
];

const MTTR_DATA = [
  {name: 'ARIA', hours: 2.1}, {name: 'MOSAIQ', hours: 3.4}, {name: 'GE Muse', hours: 1.8}, {name: 'DeviceconX', hours: 0.9}, {name: 'Pyxis Medstation ES', hours: 2.7}
];

const TABLE_ROWS = [
  {name: 'ARIA', status: 'Up', uptime: '99.95%', plannedDowntime: '0h 0m', heatmap: Array(24).fill('empty')},
  {name: 'GE Muse', status: 'Outage', uptime: '98.50%', plannedDowntime: '1h 30m', heatmap: Array(24).fill('ok')},
  {name: 'OnBase', status: 'Down', uptime: '95.20%', plannedDowntime: '0h 45m', heatmap: ['ok','ok','ok','ok','ok','ok','ok','ok','ok','ok','ok','ok','ok','ok','critical','ok','ok','ok','ok','ok','ok','ok','ok','ok']},
  {name: 'DeviceConx', status: 'Up', uptime: '99.95%', plannedDowntime: '0h 0m', heatmap: Array(24).fill('ok')},
  {name: 'MOSAIQ', status: 'Maintenance', uptime: '98.50%', plannedDowntime: '0h 0m', heatmap: Array(24).fill('ok')},
  {name: 'Obix', status: 'Up', uptime: '99.95%', plannedDowntime: '0h 0m', heatmap: Array(24).fill('ok')},
  {name: 'Pyxis Medstation ES', status: 'Outage', uptime: '99.95%', plannedDowntime: '0h 0m', heatmap: Array(24).fill('ok')},
  {name: 'GE Smartscape', status: 'Up', uptime: '98.50%', plannedDowntime: '1h 30m', heatmap: Array(24).fill('ok')},
  {name: 'Cerner', status: 'Down', uptime: '95.20%', plannedDowntime: '0h 45m', heatmap: Array(24).fill('ok')},
];

/* ---------- MAIN COMPONENT ---------- */

export default function SummaryOverview({ eventsOpen: externalEventsOpen, onToggleEvents }) {
  const [internalEventsOpen, setInternalEventsOpen] = useState(false);
  const [supportGroup, setSupportGroup] = useState("");
  const [timeInterval, setTimeInterval] = useState("24h");
  const [searchQuery, setSearchQuery] = useState('');

  const eventsOpen = externalEventsOpen !== undefined ? externalEventsOpen : internalEventsOpen;

  const filteredRows = TABLE_ROWS.filter(row =>
    row.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleEvents = () => {
    if (onToggleEvents) return onToggleEvents();
    setInternalEventsOpen(prev => !prev);
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        position: 'relative',
        maxWidth: '1600px',
        mx: 'auto',
        px: 0,
        py: 1,
        pt: 0,
      }}
    >
      {/* ===== TOP GRID (same layout, but tighter) ===== */}
      <Grid container spacing={1.5} alignItems="stretch">
        {/* LEFT COLUMN */}
        <Grid xs={12} md={9}>
          <Box
            sx={{
              display: 'flex',
              gap: 1.5,
              mb: 1.2,
              flexDirection: { xs: 'column', md: 'row' },
            }}
          >
            {/* APPS AT A GLANCE – LOWER HEIGHT */}
            <Card
              sx={{
                flex: 1,
                borderRadius: 3,
                boxShadow: '0 4px 14px rgba(0,0,0,0.05)',
                border: `1px solid ${NAVY_TINT}`,
                backgroundColor: '#ffffff',
              }}
            >
              <CardContent
                sx={{
                  p: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0.6,
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    mb: 0.5,
                  }}
                >
                  <Typography
                    variant="h6"
                    sx={{
                      fontWeight: 700,
                      color: NAVY_MAIN,
                      fontSize: '0.95rem',
                    }}
                  >
                    Apps at a Glance
                  </Typography>
                  <InfoOutlined sx={{ fontSize: 16, color: NAVY_TINT }} />
                </Box>

                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    gap: 5,
                    flexWrap: 'wrap',
                    mt: 1,
                  }}
                >
                  {/* Availability pie + uptime text */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          color: NAVY_MAIN,
                          mb: 0.4,
                          fontWeight: 600,
                          fontSize: '0.72rem',
                        }}
                      >
                        Availability
                      </Typography>
                      <Box
                        sx={{
                          width: 90,
                          height: 90,
                          borderRadius: '50%',
                          background: `conic-gradient(
                            ${GREEN_MAIN} 0deg 320deg,
                            rgba(57,137,47,0.25) 320deg 340deg,
                            rgba(114,36,58,0.25) 340deg 360deg
                          )`,
                          boxShadow: '0 3px 8px rgba(0,0,0,0.12)',
                        }}
                      />
                    </Box>
                    <Box>
                      <Typography
                        variant="body2"
                        sx={{
                          color: NAVY_MAIN,
                          fontWeight: 600,
                          mb: 0.1,
                          fontSize: '0.72rem',
                        }}
                      >
                        Total Uptime
                      </Typography>
                      <Typography
                        variant="h4"
                        sx={{
                          fontWeight: 800,
                          color: NAVY_MAIN,
                          lineHeight: 1.1,
                          fontSize: '1.2rem',
                        }}
                      >
                        165.5
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          color: NAVY_MAIN,
                          mt: 0.1,
                          fontSize: '0.68rem',
                        }}
                      >
                        hours / week
                      </Typography>
                    </Box>
                  </Box>

                  {/* Performance pie + legend */}
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      flexWrap: 'wrap',
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          color: NAVY_MAIN,
                          mb: 0.4,
                          fontWeight: 600,
                          fontSize: '0.72rem',
                        }}
                      >
                        Performance
                      </Typography>
                      <Box
                        sx={{
                          width: 90,
                          height: 90,
                          borderRadius: '50%',
                          background: `conic-gradient(
                            rgba(57,137,47,0.25) 0deg 288deg,
                            rgba(217,119,6,0.25) 288deg 360deg
                          )`,
                          boxShadow: '0 3px 8px rgba(0,0,0,0.12)',
                        }}
                      />
                    </Box>
                    <Box sx={{ minWidth: 120 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          color: NAVY_MAIN,
                          fontWeight: 600,
                          mb: 0.2,
                          fontSize: '0.72rem',
                        }}
                      >
                        Performance Status
                      </Typography>
                      <Box
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 0.25,
                        }}
                      >
                        <LegendDot
                          color="rgba(57,137,47,0.5)"
                          label="Good: 80%"
                        />
                        <LegendDot
                          color="rgba(217,119,6,0.5)"
                          label="Needs Attention: 20%"
                        />
                      </Box>
                    </Box>
                  </Box>
                </Box>
              </CardContent>
            </Card>

            {/* MTTR – VERTICAL BAR CHART, LOWER HEIGHT */}
            <Card
              sx={{
                flex: 1,
                borderRadius: 3,
                boxShadow: '0 4px 14px rgba(0,0,0,0.05)',
                border: `1px solid ${NAVY_TINT}`,
                backgroundColor: '#ffffff',
              }}
            >
              <CardContent
                sx={{
                  p: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0.4,
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    mb: 0.5,
                  }}
                >
                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontWeight: 700,
                      color: NAVY_MAIN,
                      fontSize: '0.95rem',
                    }}
                  >
                    Mean Time To Recovery (MTTR)
                  </Typography>
                  <InfoOutlined sx={{ fontSize: 16, color: NAVY_TINT }} />
                </Box>
                <Typography
                  variant="caption"
                  sx={{
                    color: NAVY_TINT,
                    display: 'block',
                    fontSize: '0.68rem',
                  }}
                >
                  Average resolution time (hours) by app CI · Last 24 hours
                </Typography>
                <MttrBarChart data={MTTR_DATA} />
              </CardContent>
            </Card>
          </Box>

          {/* ===== TABLE (scrollable body) ===== */}
          <Card
            sx={{
              borderRadius: 3,
              bgcolor: '#ffffff',
              boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
              border: `1px solid ${NAVY_TINT}`,
              display: 'flex',
              flexDirection: 'column',
              maxHeight: 440,
            }}
          >
            {/* Title + Search */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                px: 3,
                py: 1.2,
                borderBottom: '1px solid #e5e7eb',
                borderTopLeftRadius: 12,
                borderTopRightRadius: 12,
                background: '#ffffff',
                flexShrink: 0,
              }}
            >
              <Typography
                variant="h6"
                sx={{
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  color: NAVY_MAIN,
                }}
              >
                Top 10 Talker Apps
              </Typography>

              <TextField
                size="small"
                placeholder="Search"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                sx={{
                  maxWidth: 260,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                    backgroundColor: '#ffffff',
                    height: 32,
                  },
                  '& .MuiOutlinedInput-input': {
                    fontSize: '0.78rem',
                    py: 0.5,
                  },
                }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRounded
                        sx={{ fontSize: 18, color: NAVY_TINT }}
                      />
                    </InputAdornment>
                  ),
                }}
              />
            </Box>

            {/* Header */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns:
                  '140px 85px 1fr 90px 120px',
                alignItems: 'center',
                px: 3,
                py: 1.2,
                columnGap: 1.5,
                borderBottom: '2px solid #e5e7eb',
                background: 'linear-gradient(to bottom, #f9fafb 0%, #f3f4f6 100%)',
                flexShrink: 0,
              }}
            >
              <HeaderCell>App Family</HeaderCell>
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <HeaderCell>Status</HeaderCell>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                <HeaderCell>24h Heatmap</HeaderCell>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 2fr 1fr',
                    alignItems: 'center',
                    borderTop: '1px solid #e5e7eb',
                    pt: 0.3,
                    gap: 0.5,
                  }}
                >
                  <Typography variant="caption" sx={{ color: '#9ca3af', fontSize: '0.62rem', textAlign: 'left' }}>
                    Morning
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#9ca3af', fontSize: '0.62rem', textAlign: 'center' }}>
                    Business Hours
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#9ca3af', fontSize: '0.62rem', textAlign: 'right' }}>
                    Evening
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <HeaderCell>Uptime</HeaderCell>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <HeaderCell>Planned Downtime</HeaderCell>
              </Box>
            </Box>

            {/* Scrollable rows */}
            <Box
              sx={{
                overflowY: 'auto',
                flex: 1,
                maxHeight: 'calc(6 * 42px)',
              }}
            >
              {filteredRows.map((row, idx) => (
                <Box
                  key={`${row.name}-${idx}`}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns:
                      '140px 85px 1fr 90px 120px',
                    alignItems: 'center',
                    px: 3,
                    py: 0.75,
                    columnGap: 1,
                    borderBottom: '1px solid #edf0f3',
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 600, color: NAVY_MAIN, fontSize: '0.84rem' }}
                  >
                    {row.name}
                  </Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                    <Box
                      sx={{
                        px: 0.8,
                        py: 0.25,
                        borderRadius: 999,
                        bgcolor: row.status === 'Up' ? '#3d7861' : row.status === 'Down' ? '#8f5161' : row.status === 'Outage' ? '#df9538' : '#4a5b6a',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        maxWidth: 'fit-content',
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          color: '#ffffff',
                          fontWeight: 600,
                          fontSize: '0.65rem',
                        }}
                      >
                        {row.status}
                      </Typography>
                    </Box>
                  </Box>
                  <Box
                    sx={{
                      display: 'flex',
                      gap: 0.3,
                      overflow: 'hidden',
                    }}
                  >
                    {row.heatmap.map((cell, i) => (
                      <Box
                        key={i}
                        sx={{
                          width: 26,
                          height: 26,
                          borderRadius: 1,
                          bgcolor: heatColor(cell),
                        }}
                      />
                    ))}
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                    <Typography
                      variant="body2"
                      sx={{ color: NAVY_MAIN, fontSize: '0.82rem' }}
                    >
                      {row.uptime}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                    <Typography
                      variant="body2"
                      sx={{ color: NAVY_MAIN, fontSize: '0.82rem' }}
                    >
                      {row.plannedDowntime}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          </Card>
        </Grid>

        {/* RIGHT COLUMN – DOWNTIME ANALYTICS (same layout, tighter content) */}
        <Grid xs={12} md={3}>
          <Card
            sx={{
              borderRadius: 3,
              boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
              border: `1px solid ${NAVY_TINT}`,
              backgroundColor: '#ffffff',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <CardContent
              sx={{
                p: 2,
                display: 'flex',
                flexDirection: 'column',
                gap: 0.9,
                flex: 1,
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mb: 0.5,
                }}
              >
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 700,
                    color: NAVY_MAIN,
                    fontSize: '0.98rem',
                  }}
                >
                  Downtime Analytics
                </Typography>
                <InfoOutlined sx={{ fontSize: 16, color: NAVY_TINT }} />
              </Box>

              {/* Donut chart section */}
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 1.5,
                  flex: 1,
                  justifyContent: 'center',
                }}
              >
                <Box
                  sx={{
                    position: 'relative',
                    width: 140,
                    height: 140,
                    borderRadius: '50%',
                    background: `conic-gradient(
                      ${BLUE_MAIN} 0deg 108deg,
                      ${BLUE_TINT} 108deg 144deg,
                      ${MAROON_MAIN} 144deg 288deg,
                      ${NAVY_MAIN} 288deg 342deg,
                      ${SAND} 342deg 360deg
                    )`,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Box
                    sx={{
                      width: 85,
                      height: 85,
                      borderRadius: '50%',
                      bgcolor: '#ffffff',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: '1.4rem',
                        fontWeight: 800,
                        color: NAVY_MAIN,
                        lineHeight: 1,
                      }}
                    >
                      120
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: '0.65rem',
                        color: NAVY_TINT,
                        mt: 0.3,
                      }}
                    >
                      hours
                    </Typography>
                  </Box>
                </Box>
                
                {/* Legend */}
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0.6,
                    width: '100%',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: BLUE_MAIN }} />
                      <Typography variant="caption" sx={{ color: NAVY_MAIN, fontSize: '0.72rem' }}>MI</Typography>
                    </Box>
                    <Typography variant="caption" sx={{ color: NAVY_TINT, fontSize: '0.7rem', fontWeight: 600 }}>36h</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: BLUE_TINT }} />
                      <Typography variant="caption" sx={{ color: NAVY_MAIN, fontSize: '0.72rem' }}>Maintenance</Typography>
                    </Box>
                    <Typography variant="caption" sx={{ color: NAVY_TINT, fontSize: '0.7rem', fontWeight: 600 }}>12h</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: MAROON_MAIN }} />
                      <Typography variant="caption" sx={{ color: NAVY_MAIN, fontSize: '0.72rem' }}>Maintenance/CR</Typography>
                    </Box>
                    <Typography variant="caption" sx={{ color: NAVY_TINT, fontSize: '0.7rem', fontWeight: 600 }}>48h</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: NAVY_MAIN }} />
                      <Typography variant="caption" sx={{ color: NAVY_MAIN, fontSize: '0.72rem' }}>Incidents</Typography>
                    </Box>
                    <Typography variant="caption" sx={{ color: NAVY_TINT, fontSize: '0.7rem', fontWeight: 600 }}>18h</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: SAND }} />
                      <Typography variant="caption" sx={{ color: NAVY_MAIN, fontSize: '0.72rem' }}>Other</Typography>
                    </Box>
                    <Typography variant="caption" sx={{ color: NAVY_TINT, fontSize: '0.7rem', fontWeight: 600 }}>6h</Typography>
                  </Box>
                </Box>
              </Box>

              {/* Bottom metric tiles */}
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 1,
                  mt: 1,
                }}
              >
                <Box
                  sx={{
                    borderRadius: 2,
                    background: 'linear-gradient(135deg, rgba(0, 51, 142, 0.12) 0%, rgba(0, 51, 142, 0.08) 100%)',
                    p: 1.4,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: 75,
                    position: 'relative',
                    overflow: 'hidden',
                    border: '1px solid rgba(0, 51, 142, 0.1)',
                  }}
                >
                  <Box sx={{ position: 'absolute', top: 8, right: 8, opacity: 0.15 }}>
                    <AccessTime sx={{ fontSize: 32, color: BLUE_MAIN }} />
                  </Box>
                  <Typography
                    sx={{
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      color: '#4b5563',
                      mb: 0.4,
                    }}
                  >
                    MTTR
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: '1.3rem',
                      fontWeight: 800,
                      color: '#111827',
                      lineHeight: 1.1,
                    }}
                  >
                    3.5
                  </Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.3 }}>
                    <Typography sx={{ fontSize: '0.65rem', color: '#6b7280' }}>hours</Typography>
                    <Typography
                      sx={{
                        fontSize: '0.65rem',
                        fontWeight: 600,
                        color: '#6b7280',
                      }}
                    >
                      avg
                    </Typography>
                  </Box>
                </Box>

                <Box
                  sx={{
                    borderRadius: 2,
                    background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.12) 0%, rgba(220, 38, 38, 0.08) 100%)',
                    p: 1.4,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: 75,
                    position: 'relative',
                    overflow: 'hidden',
                    border: '1px solid rgba(220, 38, 38, 0.15)',
                  }}
                >
                  <Box sx={{ position: 'absolute', top: 8, right: 8, opacity: 0.15 }}>
                    <WarningAmberRounded sx={{ fontSize: 32, color: '#dc2626' }} />
                  </Box>
                  <Typography
                    sx={{
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      color: '#4b5563',
                      mb: 0.4,
                    }}
                  >
                    Longest Outage
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: '1.3rem',
                      fontWeight: 800,
                      color: '#111827',
                      lineHeight: 1.1,
                    }}
                  >
                    90
                  </Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.3 }}>
                    <Typography sx={{ fontSize: '0.65rem', color: '#6b7280' }}>minutes</Typography>
                    <Typography
                      sx={{
                        fontSize: '0.65rem',
                        fontWeight: 600,
                        color: '#b91c1c',
                      }}
                    >
                      critical
                    </Typography>
                  </Box>
                </Box>

                <Box
                  sx={{
                    borderRadius: 2,
                    background: 'linear-gradient(135deg, rgba(217, 119, 6, 0.12) 0%, rgba(217, 119, 6, 0.08) 100%)',
                    p: 1.4,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: 75,
                    position: 'relative',
                    overflow: 'hidden',
                    border: '1px solid rgba(217, 119, 6, 0.15)',
                  }}
                >
                  <Box sx={{ position: 'absolute', top: 8, right: 8, opacity: 0.15 }}>
                    <CancelRounded sx={{ fontSize: 32, color: '#d97706' }} />
                  </Box>
                  <Typography
                    sx={{
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      color: '#4b5563',
                      mb: 0.4,
                    }}
                  >
                    P1/P2 Incidents
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: '1.3rem',
                      fontWeight: 800,
                      color: '#111827',
                      lineHeight: 1.1,
                    }}
                  >
                    15
                  </Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.3 }}>
                    <Typography sx={{ fontSize: '0.65rem', color: '#6b7280' }}>This Week</Typography>
                    <Typography
                      sx={{
                        fontSize: '0.65rem',
                        fontWeight: 600,
                        color: '#d97706',
                      }}
                    >
                      +12%
                    </Typography>
                  </Box>
                </Box>

                <Box
                  sx={{
                    borderRadius: 2,
                    background: 'linear-gradient(135deg, rgba(0, 51, 142, 0.12) 0%, rgba(0, 51, 142, 0.08) 100%)',
                    p: 1.4,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: 75,
                    position: 'relative',
                    overflow: 'hidden',
                    border: '1px solid rgba(0, 51, 142, 0.1)',
                  }}
                >
                  <Box sx={{ position: 'absolute', top: 8, right: 8, opacity: 0.15 }}>
                    <InfoOutlined sx={{ fontSize: 32, color: BLUE_MAIN }} />
                  </Box>
                  <Typography
                    sx={{
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      color: '#4b5563',
                      mb: 0.4,
                    }}
                  >
                    Total MI Hours
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: '1.3rem',
                      fontWeight: 800,
                      color: '#111827',
                      lineHeight: 1.1,
                    }}
                  >
                    36
                  </Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.3 }}>
                    <Typography sx={{ fontSize: '0.65rem', color: '#6b7280' }}>hours</Typography>
                    <Typography
                      sx={{
                        fontSize: '0.65rem',
                        fontWeight: 600,
                        color: BLUE_MAIN,
                      }}
                    >
                      30%
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* System Events drawer moved to shared component (SystemEventsDrawer) */}
    </Box>
  );
}

/* ---------- HELPERS ---------- */
const HeaderCell = ({children}) => <Typography variant="caption" sx={{color: '#374151', textTransform: 'uppercase', fontWeight: 700, fontSize: '0.7rem', letterSpacing: 0.5}}>{children}</Typography>;
const StatusDot = ({status}) => <Box sx={{width: 8, height: 8, borderRadius: '50%', bgcolor: status === 'Healthy' ? BLUE_MAIN : status === 'Degraded' ? MAROON_MAIN : NAVY_MAIN}} />;
const heatColor = (type) => type === 'empty' ? SAND : type === 'critical' ? RED_MAIN : type === 'warning' ? OCHRE_MAIN : GREEN_MAIN;
const LegendDot = ({color, label}) => <Box sx={{display: 'flex', alignItems: 'center', gap: 0.7}}><Box sx={{width: 8, height: 8, borderRadius: '50%', bgcolor: color}} /><Typography variant="caption" sx={{color: NAVY_MAIN}}>{label}</Typography></Box>;

function ComponentChart({ component }) {
  // Different data patterns for each component
  const chartDataMap = {
    'Infrastructure': [
      { x: 0, y: 15 },
      { x: 12.5, y: 40 },
      { x: 25, y: 65 },
      { x: 37.5, y: 140 },
      { x: 50, y: 180 },
      { x: 62.5, y: 220 },
      { x: 75, y: 280 },
      { x: 87.5, y: 310 },
      { x: 100, y: 340 },
    ],
    'Application': [
      { x: 0, y: 25 },
      { x: 12.5, y: 55 },
      { x: 25, y: 90 },
      { x: 37.5, y: 160 },
      { x: 50, y: 210 },
      { x: 62.5, y: 280 },
      { x: 75, y: 330 },
      { x: 87.5, y: 365 },
      { x: 100, y: 400 },
    ],
    'Citrix': [
      { x: 0, y: 10 },
      { x: 12.5, y: 30 },
      { x: 25, y: 50 },
      { x: 37.5, y: 100 },
      { x: 50, y: 140 },
      { x: 62.5, y: 180 },
      { x: 75, y: 220 },
      { x: 87.5, y: 250 },
      { x: 100, y: 280 },
    ],
    'Network': [
      { x: 0, y: 30 },
      { x: 12.5, y: 65 },
      { x: 25, y: 100 },
      { x: 37.5, y: 165 },
      { x: 50, y: 200 },
      { x: 62.5, y: 240 },
      { x: 75, y: 295 },
      { x: 87.5, y: 330 },
      { x: 100, y: 360 },
    ],
  };

  const chartData = chartDataMap[component] || chartDataMap['Infrastructure'];
  const maxY = 400;
  const mapY = (y) => 40 - (y / maxY) * 32;
  
  const linePath = chartData
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${mapY(p.y)}`)
    .join(' ');

  return (
    <svg viewBox="0 0 100 40" width="100%" height="100%" preserveAspectRatio="none" style={{ display: 'block' }}>
      <path
        d={linePath}
        fill="none"
        stroke="#00338e"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {chartData.map((p, i) => (
        <circle key={i} cx={p.x} cy={mapY(p.y)} r={2} fill="#00338e" />
      ))}
    </svg>
  );
}

function MetricTile({ label, big, unit, showInfo }) {
  return (
    <Box
      sx={{
        borderRadius: 2,
        bgcolor: '#ffffff',
        border: '1px solid #e5e7eb',
        boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
        p: 1.5,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          mb: 0.5,
        }}
      >
        <Typography
          variant="caption"
          sx={{
            color: NAVY_MAIN,
            textTransform: 'none',
            fontWeight: 600,
            fontSize: '0.75rem',
          }}
        >
          {label}
        </Typography>
        {showInfo && (
          <InfoOutlined sx={{ fontSize: 13, color: NAVY_TINT }} />
        )}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
        <Typography
          variant="h6"
          sx={{
            fontWeight: 700,
            color: BLUE_MAIN,
            lineHeight: 1.1,
            fontSize: '1.35rem',
          }}
        >
          {big}
        </Typography>
        {unit && (
          <Typography
            variant="body2"
            sx={{ color: NAVY_MAIN, fontSize: '0.8rem' }}
          >
            {unit}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

function DowntimeBar({ label, percentage, color }) {
  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 0.1,
        }}
      >
        <Typography
          variant="caption"
          sx={{ color: NAVY_MAIN, fontSize: '0.72rem', fontWeight: 500 }}
        >
          {label}
        </Typography>
        <Typography
          variant="caption"
          sx={{ color: NAVY_TINT, fontSize: '0.68rem', fontWeight: 600 }}
        >
          {percentage}%
        </Typography>
      </Box>
      <Box
        sx={{
          width: '100%',
          height: 10,
          bgcolor: '#f3f4f6',
          borderRadius: 999,
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            width: `${percentage}%`,
            height: '100%',
            bgcolor: color,
            transition: 'width 0.3s ease',
          }}
        />
      </Box>
    </Box>
  );
}

/* Vertical bar chart for MTTR */
function MttrBarChart({ data }) {
  const max = Math.max(...data.map(d => d.hours));
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 0.8,
        height: 100,      // <<< smaller than before
        mt: 0.4,
      }}
    >
      {data.map(item => {
        const heightPct = (item.hours / max) * 100;
        return (
          <Box
            key={item.name}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 0.25,
              flex: 1,
            }}
          >
            <Box
              sx={{
                width: '100%',
                height: `${heightPct}%`,
                minHeight: 10,
                borderRadius: '4px 4px 0 0',
                bgcolor: BLUE_MAIN,
              }}
            />
            <Typography
              variant="caption"
              sx={{
                fontSize: '0.7rem',
                color: NAVY_MAIN,
                fontWeight: 500,
                textAlign: 'center',
              }}
            >
              {item.name}
            </Typography>
            <Typography
              variant="caption"
              sx={{ fontSize: '0.66rem', color: NAVY_MAIN, fontWeight: 700 }}
            >
              {item.hours.toFixed(1)}h
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

const StatusIcon = ({type}) => {
  const {Icon, bg} = type === 'warning' ? {Icon: WarningAmberRounded, bg: MAROON_MAIN} : type === 'ok' ? {Icon: CheckCircleRounded, bg: BLUE_MAIN} : {Icon: CancelRounded, bg: NAVY_MAIN};
  return <Box sx={{width: 30, height: 30, borderRadius: '50%', bgcolor: bg, display: 'flex', alignItems: 'center', justifyContent: 'center'}}><Icon sx={{fontSize: 17, color: '#ffffff'}} /></Box>;
};

/* ---------- REUSABLE COMPONENTS ---------- */

// Reusable drawer component for system events (exported so header can trigger it)
export function SystemEventsDrawer({ open, onClose }) {
  const [supportGroup, setSupportGroup] = useState('');
  const [eventType, setEventType] = useState('All');

  return (
    <Drawer
      anchor="right"
      open={!!open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: 450,
          borderRadius: '16px 0 0 16px',
          overflow: 'hidden',
          backgroundColor: 'rgba(245, 244, 242, 0.95)'
        }
      }}
    >
      <Box sx={{ px: 3, py: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Typography variant="h6" fontWeight={600} mb={2}>
          Recent System Events
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}>
          <TextField
            select
            value={supportGroup}
            onChange={(e) => setSupportGroup(e.target.value)}
            placeholder="Select Support Group"
            fullWidth
            size="small"
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: '50px',
                backgroundColor: '#ffffff',
                height: '40px',
                '& fieldset': { borderColor: '#e0e0e0' },
                '&:hover fieldset': { borderColor: '#bdbdbd' },
                '&.Mui-focused fieldset': { borderColor: BLUE_MAIN }
              }
            }}
            SelectProps={{ displayEmpty: true }}
          >
            <MenuItem value=""><em>Select Support Group</em></MenuItem>
            <MenuItem value="A">Group A</MenuItem>
            <MenuItem value="B">Group B</MenuItem>
          </TextField>

          <Typography sx={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: 700 }}>Last 24h</Typography>
        </Box>

        <Typography mb={1} fontSize={14} color="#000" fontWeight={600}>Filter by event type</Typography>
        <ToggleButtonGroup
          exclusive
          value={eventType}
          onChange={(e, val) => val && setEventType(val)}
          sx={{ mb: 2, display: 'flex', gap: 0.6, '& .MuiToggleButton-root': { border: 'none', borderRadius: '999px', padding: '6px 10px', textTransform: 'none', fontSize: '13px', fontWeight: 500, color: '#000', backgroundColor: '#f5f4f2', '&.Mui-selected': { backgroundColor: BLUE_MAIN, color: '#ffffff', fontWeight: 600 }, '&:hover': { backgroundColor: '#e8e7e5' } } }}
        >
          <ToggleButton value="All">All</ToggleButton>
          <ToggleButton value="Change">Change</ToggleButton>
          <ToggleButton value="Maintenance">Maintenance</ToggleButton>
          <ToggleButton value="Backup">Backup</ToggleButton>
          <ToggleButton value="Incident">Incident</ToggleButton>
        </ToggleButtonGroup>

        <Box sx={{ backgroundColor: '#ffffff', borderRadius: 3, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', p: 3, flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Box sx={{ overflowY: 'auto', flexGrow: 1, pr: 1 }}>
            {SYSTEM_EVENTS.filter(ev => eventType === 'All' || ev.tag === eventType).map((ev, index) => (
              <Box key={index} sx={{ mb: 2.5, pb: 2.5, borderBottom: index < SYSTEM_EVENTS.length - 1 ? '1px solid #f0f0f0' : 'none', display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography fontSize={14} fontWeight={500}>{ev.title}</Typography>
                  <Box sx={{ mt: 0.6 }}>
                    <Chip label={ev.tag} size="small" sx={{ height: 22, background: ev.tag === 'Change' ? '#FFE4C8' : ev.tag === 'Maintenance' ? '#DFF5E1' : ev.tag === 'Backup' ? '#E7FBEF' : '#F8D7DA', color: ev.tag === 'Change' ? '#C77A24' : ev.tag === 'Maintenance' ? '#2D8A4D' : ev.tag === 'Backup' ? '#2D8A4D' : '#A33A3A' }} />
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 88 }}>
                  <CircleIcon sx={{ color: ev.color, fontSize: 14, mt: 0.7, flexShrink: 0 }} />
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.6 }}>
                    <AccessTime sx={{ fontSize: 11, color: '#6b7280' }} />
                    <Typography fontSize={12} color="text.secondary">{ev.time}</Typography>
                  </Box>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    </Drawer>
  );
}