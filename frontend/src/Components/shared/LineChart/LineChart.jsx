import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Area, LabelList,
} from 'recharts';
import React, { useMemo } from 'react';

function LineGraph({ dataX, dataY, labelx, labely,timeRange }) {
  const isLongRange = timeRange === 120 || timeRange === 168;
  const data = useMemo(
    () => dataX.map((timestamp, i) => ({
      timestamp,
      packet: dataY[0]?.[i],
      median: dataY[1]?.[i],
      packetLabel: isLongRange ? (i % 5 === 0 ? dataY[0]?.[i] : null) : dataY[0]?.[i]
    })),
    [dataX, dataY, isLongRange]
  );

  return (

    <ResponsiveContainer width="100%" height={460}>
      <LineChart data={data} margin={{ top: 30, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid stroke="#d1d5db" strokeDasharray="3 3" horizontal vertical />
        <XAxis dataKey="timestamp" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" interval={isLongRange? 3:0} height={60} />
        <YAxis tick={{ fontSize: 12 }} domain={['auto', 'auto']} />
        <Tooltip />
        <Legend verticalAlign="top" height={36} />
        <Line
          type="monotone" dataKey="packet" name={labelx}
          stroke="rgba(0, 51, 142, 0.6)" strokeWidth={2.5}
          dot={{ r: isLongRange? 2:4, fill: '#00338e', stroke: '#00338e' }}
          activeDot={{ r: isLongRange? 3:5, fill: '#00338e', stroke: '#001f5c', strokeWidth: 2 }}
        >
          <LabelList dataKey="packetLabel" position="top" offset={10} fill="#00338e" fontSize={12} />
        </Line>
        <Line
          type="monotone" dataKey="median" name={labely}
          stroke="#3b82f6" strokeDasharray="4 4" strokeWidth={2}
          dot={false} isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default React.memo(LineGraph);