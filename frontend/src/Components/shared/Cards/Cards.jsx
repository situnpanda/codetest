import React from 'react';
import { Box, Card, CardHeader, CardContent, Button, Typography } from '@mui/material';

const GreenCards = ({ heading, buttons }) => {
  return (
    <Box sx={{ width: 400, margin: 'auto' }}>
      <Card sx={{ width: '100%' }}>
        <CardHeader title={heading} sx={{ backgroundColor: 'green', color: '#fff' }} />
        <CardContent>
          <Box sx={{ mt: 2, display: 'flex', flexDirection: 'row', justifyContent: 'space-between' }}>
            {buttons.map(({ header, value }, index) => (
              <Box key={index} sx={{ flex: '1', textAlign: 'center' }}>
                <Typography variant="body2" color="textSecondary">
                  {header}
                </Typography>
                <Button variant="text" sx={{ minWidth: '0', flex: '1' }}>
                  <Typography variant="body1" fontWeight="bold">
                    {value}
                  </Typography>
                </Button>
              </Box>
            ))}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default React.memo(GreenCards);
