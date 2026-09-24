import * as React from 'react';
import { useMemo } from 'react';
import { useTheme, TableCell } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';

const baseColumns = [
  { field: 'applicationfamily', headerName: 'Application Family', width: 200 },
  { field: 'availability', headerName: 'Availability', width: 200},
  { field: 'reliability', headerName: 'Reliability', width: 200 },
  { field: 'incidents', headerName: 'Incidents', width: 200 },
  { field: 'remarks', headerName: 'Remarks', width: 200 },
];

const CellComponent = React.memo(({ value }) => {
  const theme = useTheme();

  return (
    <TableCell
      style={{
        backgroundColor: value === 100 ? theme.palette.success.main : theme.palette.error.main,
      }}
    >
      {value}
    </TableCell>
  );
});

const DrilldownTable = ({ data }) => {
  const columns = useMemo(
    () =>
      baseColumns.map((column) => ({
        ...column,
        renderCell: (params) =>
          column.field === 'availability' ? <CellComponent value={params.value} /> : params.value,
      })),
    []
  );

  return (
    <div style={{ height: 400, minWidth: '100%', maxWidth: '100%' }}>
      <DataGrid
        rows={data}
        columns={columns}
        pageSize={5}
        rowsContainerStyle={{ overflowY: 'auto' }}
        containerStyle={{ height: '100%' }}
      />
    </div>
  );
};

export default React.memo(DrilldownTable);
