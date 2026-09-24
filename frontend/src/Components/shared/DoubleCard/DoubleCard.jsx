import React from 'react';
import { Box, Card, CardContent, Typography } from '@mui/material';
import WhiteSquare from '../WhiteSquare/WhiteSquare';

const DoubleCard = ({ cardHeader, header1, value1, header2, value2 }) => {
  return (
    <Card
      sx={{
        backgroundColor: 'white',
        borderRadius: '16px',
        boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.1)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box
        sx={{
          backgroundColor: 'white',
          color: '#00338E',
          padding: '1rem',
          borderTopLeftRadius: '16px',
          borderTopRightRadius: '16px',
        }}
      >
        <Typography variant="h6">{cardHeader}</Typography>
      </Box>
      <CardContent
        sx={{
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          padding: '1rem',
        }}
      >
        <WhiteSquare header={header1} value={value1} />
        <WhiteSquare header={header2} value={value2} />
      </CardContent>
    </Card>
  );
};

export default React.memo(DoubleCard);


//input this way 
// cardHeader="App Insights"
// header1="Header 1"
// value1="Value 1"
// header2="Header 2"
// value2="Value 2"
