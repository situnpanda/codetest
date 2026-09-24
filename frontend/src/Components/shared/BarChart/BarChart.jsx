import React from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const colors = ["#8884d8", "#0b5394", "#38761d", "#674ea7"]

export default function BarGraph(props) {

  var {data} = props

  return (
    <ResponsiveContainer height={300} width={Object.keys(data).length>0 ? (data["data"].length * 80 < 600 ? 600 : data["data"].length * 80) : 0}>
    
    
      {(Object.keys(data).length>0) ?
          
        <BarChart data={data["data"]} sx={{overFlowX : 'auto'}} p={4}>
          <CartesianGrid strokeDasharray="3 3" />
          
          <XAxis dataKey={data["x"]} tick={{ fontSize: 12 }} dx={5}/>
          <YAxis />
          <Tooltip />
          <Legend verticalAlign="top"/>
          
          <Bar dataKey="CPU" stackId="a" fill={colors[0]} />
          <Bar dataKey="Memory" stackId="a" fill={colors[1]}  />
          <Bar dataKey="Disk" stackId="a" fill={colors[2]}  />
          <Bar dataKey="Windows Service" stackId="a" fill={colors[3]}  />
        </BarChart>
          
      :
        <CartesianGrid strokeDasharray="3 3" />
      }
    </ResponsiveContainer>
  )
}
