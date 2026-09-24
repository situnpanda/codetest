import React from 'react';
import { Box, Typography } from '@mui/material';

const DEFAULT_COLORS = {
  bg: '#fef9c3',
  border: '#fbbf24',
  titleColor: '#92400e',
  textColor: '#78350f',
  subtextColor: '#92400e',
  dotColor: '#fbbf24'
};

const AlertBanner = ({
  events = [],
  title = 'Alerts',
  icon = '⚠️',
  renderEvent,
  colors = {},
  animationDuration = 60
}) => {
  const mergedColors = { ...DEFAULT_COLORS, ...colors };

  if (!events || events.length === 0) {
    return null;
  }

  const defaultRenderEvent = (event, idx) => (
    <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
      <Typography 
        component="span" 
        sx={{ 
          color: mergedColors.textColor, 
          fontWeight: 600, 
          fontSize: { xs: 11, sm: 12, md: 13 } 
        }}
      >
        {event.title || event.message || event.number || 'Alert'}
      </Typography>
      {event.subtitle && (
        <Typography 
          component="span" 
          sx={{ 
            color: mergedColors.subtextColor, 
            fontSize: { xs: 10, sm: 11, md: 12 } 
          }}
        >
          | {event.subtitle}
        </Typography>
      )}
      <Typography 
        component="span" 
        sx={{ 
          color: mergedColors.dotColor, 
          mx: 1, 
          fontWeight: 700 
        }}
      >
        •
      </Typography>
    </Box>
  );

  const eventRenderer = renderEvent || defaultRenderEvent;

  return (
    <Box 
      sx={{
        backgroundColor: mergedColors.bg, 
        borderBottom: `2px solid ${mergedColors.border}`, 
        py: 1, 
        px: 2, 
        mb: 2, 
        borderRadius: 1, 
        width: '100%', 
        boxSizing: 'border-box'
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', height: 24 }}>
        {/* Fixed icon on the left */}
        <Typography 
          component="span"
          sx={{ 
            color: mergedColors.titleColor, 
            fontWeight: 700, 
            fontSize: { xs: 14, sm: 15, md: 16 },
            flexShrink: 0,
            mr: 1.5
          }}
        >
          {icon}
        </Typography>
        
        {/* Scrolling content */}
        <Box sx={{ position: 'relative', flex: 1, height: 24, overflow: 'hidden' }}>
          <Box 
            sx={{
              position: 'absolute', 
              left: 0, 
              top: 0, 
              display: 'flex', 
              gap: 0, 
              whiteSpace: 'nowrap', 
              animation: `alertBannerMarquee ${animationDuration}s linear infinite`,
              '&:hover': {
                animationPlayState: 'paused'
              },
              '@keyframes alertBannerMarquee': {
                '0%': { transform: 'translateX(0%)' },
                '100%': { transform: 'translateX(-50%)' }
              }
            }}
          >
            {/* Duplicate content for seamless loop */}
            {[...events, ...events, ...events].map((event, idx) => eventRenderer(event, idx))}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default AlertBanner;
