import React, { useEffect, useRef } from 'react';
import { Card, CardHeader, CardContent } from '@mui/material';
import * as d3 from 'd3';

const DonutChart = ({ data }) => {
  const chartContainerRef = useRef(null);

  useEffect(() => {
    const handleResize = () => {
      d3.select(chartContainerRef.current).selectAll('*').remove();

      const width = chartContainerRef.current.clientWidth;
      const height = chartContainerRef.current.clientHeight;
      const radius = Math.min(width, height) / 4;

      const svg = d3
        .select(chartContainerRef.current)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', `translate(${width / 3}, ${height / 2})`);

      const colorScale = d3.scaleOrdinal().range(d3.schemeCategory10);
      const pie = d3.pie().value((d) => d.value);
      const arc = d3.arc().outerRadius(radius * 0.8).innerRadius(radius * 0.5);

      const arcs = svg.selectAll('arc').data(pie(data)).enter().append('g');

      arcs
        .append('path')
        .attr('d', arc)
        .attr('fill', (d, i) => colorScale(i))
        .on('mouseover', function (event, d) {
          d3.select(this)
            .transition()
            .duration(200)
            .attr('fill', d3.rgb(colorScale(d.index)).darker(0.7))
            .attr('d', d3.arc().innerRadius(radius * 0.6).outerRadius(radius * 0.7));
        })
        .on('mouseout', function (event, d) {
          d3.select(this)
            .transition()
            .duration(200)
            .attr('fill', colorScale(d.index))
            .attr('d', arc);
        });

      arcs
        .append('line')
        .attr('x1', (d) => arc.centroid(d)[0] * 1.5)
        .attr('y1', (d) => arc.centroid(d)[1] * 1.5)
        .attr('x2', (d) => arc.centroid(d)[0] * 1.7)
        .attr('y2', (d) => arc.centroid(d)[1] * 1.7)
        .style('stroke', 'black');

      arcs
        .append('text')
        .attr('transform', (d) => `translate(${arc.centroid(d)[0] * 2}, ${arc.centroid(d)[1] * 2})`)
        .attr('dy', '.35em')
        .attr('text-anchor', 'middle')
        .style('fill', 'black')
        .text((d) => `${d.data.value}%`);

      const legend = svg
        .selectAll('.legend')
        .data(pie(data))
        .enter()
        .append('g')
        .attr('class', 'legend')
        .attr('transform', (d, i) => `translate(${radius * 1.5}, ${i * 20})`);

      legend
        .append('rect')
        .attr('width', 18)
        .attr('height', 18)
        .style('fill', (d, i) => colorScale(i));

      legend
        .append('text')
        .attr('x', 24)
        .attr('y', 9)
        .attr('dy', '.35em')
        .text((d) => `${d.data.label} `);
    };

    handleResize();


    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [data]); 

  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardHeader title="App Request" sx={{ backgroundColor: 'white', color: '#00338E' }} />
      <CardContent ref={chartContainerRef} sx={{ height: '300px' }} />
    </Card>
  );
};

export default DonutChart;
