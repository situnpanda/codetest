import * as React from 'react';
import { PieChart } from '@mui/x-charts/PieChart';

function PieGraph(props) {
    var {data,name} = props
    return (
      <PieChart 
        series={[
          {
            data: data,
            highlightScope: { faded: 'global', highlighted: 'item' },
            faded: { innerRadius: 30, additionalRadius: -30, color: 'gray' },
          },
        ]}
        height={200}
      /> 
    );
}

export default React.memo(PieGraph);