import React from 'react';
import { Gauge, gaugeClasses } from '@mui/x-charts/Gauge';

// Modern replacement for react-d3-speedometer (and /slim) built on @mui/x-charts Gauge.
// Accepts the common react-d3-speedometer props and maps them to a MUI Gauge.
export default function ReactSpeedometer({
  value = 0,
  minValue = 0,
  maxValue = 100,
  currentValueText,
  textColor = '#333',
  startColor,
  endColor,
  segmentColors = [],
  width = 200,
  height = 150,
  valueFormatter,
  ...rest
}) {
  const color =
    segmentColors && segmentColors.length
      ? segmentColors[Math.min(segmentColors.length - 1, Math.floor(((value - minValue) / Math.max(1, maxValue - minValue)) * segmentColors.length))]
      : endColor || '#00338e';

  const label =
    currentValueText && typeof currentValueText === 'string'
      ? currentValueText.replace('${value}', value).replace('#{value}', value)
      : `${value}`;

  return (
    <Gauge
      width={width}
      height={height}
      value={Number(value)}
      valueMin={Number(minValue)}
      valueMax={Number(maxValue)}
      startAngle={-110}
      endAngle={110}
      text={() => label}
      sx={{
        [`& .${gaugeClasses.valueText}`]: { fontSize: 18, fill: textColor },
        [`& .${gaugeClasses.valueArc}`]: { fill: color },
        [`& .${gaugeClasses.referenceArc}`]: { fill: '#e0e0e0' },
      }}
    />
  );
}
