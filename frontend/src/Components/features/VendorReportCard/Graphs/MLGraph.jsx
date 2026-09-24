// import React from 'react';
// import { Box, Typography } from '@mui/material';
// import { LineChart, Line, xAxis, yAxis, CartesianGrid, Tooltip, Legend, ReferenceLine } from '@mui/x-charts';

// const PeakValueLineGraph = ({ data, xDataKey, yDataKey }) => {
//   return (
//     <Box sx={{ width: '100%', height: 400 }}>
//       <Typography variant="h6" gutterBottom>
//         Server Peak Values
//       </Typography>
//       <LineChart  data={data}>
//         <CartesianGrid strokeDasharray="3 3" />
//         <xAxis dataKey={xDataKey} />
//         <yAxis domain={[0, 'dataMax + 20']} />
//         <Tooltip />
//         <Legend />
//         <ReferenceLine y={80} label="Peak 80" stroke="red" />
//         <Line type="monotone" dataKey={yDataKey} stroke="#8884d8" activeDot={{ r: 8 }} />
//       </LineChart>
//     </Box>
//   );
// };

// export default PeakValueLineGraph;import * as React from 'react';
import * as React from 'react';
import { ChartContainer } from '@mui/x-charts/ChartContainer';
import { ChartsReferenceLine } from '@mui/x-charts/ChartsReferenceLine';
import { LinePlot, MarkPlot } from '@mui/x-charts/LineChart';
import { ChartsXAxis } from '@mui/x-charts/ChartsXAxis';
import { ChartsYAxis } from '@mui/x-charts/ChartsYAxis';

export default function LineChartWithReferenceLines({ pData, xLabels }) {
  return (
    <ChartContainer
      series={[
        { data: pData, label: 'PeakValue', type: 'line' },
      ]}
      xAxis={[{ scaleType: 'point', data: xLabels }]}
    >
      <LinePlot />
      <MarkPlot />
      <ChartsReferenceLine
        x="Page C"
        label="Max PV PAGE"
        lineStyle={{ stroke: 'red' }}
      />
      <ChartsReferenceLine y={80} label="Threshold" lineStyle={{ stroke: 'red' }} />
      <ChartsXAxis />
      <ChartsYAxis />
    </ChartContainer>
  );
}
