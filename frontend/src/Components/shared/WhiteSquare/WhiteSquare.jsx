import React from 'react';
import { Box, Typography } from '@mui/material';

const containerSx = {
  backgroundColor: 'white',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  flex: 1,
  minWidth: '100px',
  padding: '1rem',
};

const WhiteSquare = ({ header, value }) => {
  return (
    <Box sx={containerSx}>
      <Typography variant="body2" color="textSecondary">
        {header}
      </Typography>
      <Typography variant="body1" fontWeight="bold">
        {value}
      </Typography>
    </Box>
  );
};

export default React.memo(WhiteSquare);
