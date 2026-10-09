import React from 'react';
import {
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Card,
  CardContent,
  CardActions,
  CardHeader,
  TableContainer,
  ThemeProvider,
  createTheme,
} from '@mui/material';
import BlueSquare from '../WhiteSquare/WhiteSquare';

const dummyData = [
  { id: 1, column1: 'Dummy Data 1', column2: 'Value 1' },
  { id: 2, column1: 'Dummy Data 2', column2: 'Value 2' },
  { id: 3, column1: 'Dummy Data 3', column2: 'Value 3' },
];

const theme = createTheme({
  palette: {
    primary: {
      main: '#00338E',
    },
  },
});

const TableComponent = () => {
  return (
    <ThemeProvider theme={theme}>
      <Card sx={{ borderRadius: 15, marginBottom: 16 }}>
        <CardHeader
          title={<Typography variant="h5">Exceptions</Typography>}
          sx={{ backgroundColor: 'white', color: 'primary.main', boxShadow:'0 2px 8px rgba(0, 0, 0, 0.15)' }}
        />
        <CardContent>
          <TableContainer>
            <Table stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Exception Type</TableCell>
                  <TableCell>Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {dummyData.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.column1}</TableCell>
                    <TableCell>{row.column2}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
        <CardActions sx={{ display: 'flex', justifyContent: 'space-around', padding: '16px',backgroundColor:'primary.main' }}>
          <BlueSquare header="Total" value="Value" />
          <BlueSquare header="Unique" value="Value" />
        </CardActions>
      </Card>
    </ThemeProvider>
  );
};

export default TableComponent;
