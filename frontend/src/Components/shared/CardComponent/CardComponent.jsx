import React from 'react';
import { Box, Typography, Button, Stack } from '@mui/material';
import WhiteSquare from '../WhiteSquare/WhiteSquare';

const CardComponent = ({ data, heading }) => {
  const cardStyle = {
    borderRadius: '15px',
    backgroundColor: 'white',
    padding: '1rem', 
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
    position: 'relative'
  };

  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
  };

  return (
    <Box style={{display:'flex'}}>
    <Box style={cardStyle}>
      <Box style={headerStyle}>
        <Typography variant="h5">{heading}</Typography>
        <Button href="#">More info</Button>
      </Box>
      <Stack direction="row" spacing={2}>
        <WhiteSquare header="Total" value={data["Total"]} />
        <WhiteSquare header="New" value={data["New"]} />
        <WhiteSquare header="Open" value={data["Open"]} />
        <WhiteSquare header="On Hold" value={data["On Hold"]} />
        <WhiteSquare header="Resolved" value={data["Resolved"]} />
        <WhiteSquare header="Closed" value={data["Closed"]} />
        <WhiteSquare header="Cancelled" value={data["Cancelled"]} />
      </Stack>
    </Box>
    </Box>
  );
};

export default React.memo(CardComponent);
