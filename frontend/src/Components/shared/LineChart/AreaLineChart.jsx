import * as React from 'react';
import { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Label } from "recharts";

const colors = [
    '#00338e', '#39892f', '#d59859', '#1a2c42', '#1f3831', '#0066FF', '#33FF57', '#FFD700', '#9C27B0', '#00CED1',
    '#FF8C00', '#7B1FA2', '#BA55D3', '#FF6600', '#4CAF50', '#00338e', '#39892f', '#d59859', '#1a2c42', '#1f3831',
    '#1E90FF', '#32CD32', '#FFA500', '#673AB7', '#00BCD4', '#FF9800', '#8E44AD', '#9575CD', '#FF7F50', '#66BB6A',
    '#00338e', '#39892f', '#d59859', '#1a2c42', '#1f3831', '#4169E1', '#00FF7F', '#FFAA33', '#5E35B1', '#40E0D0',
    '#FFB300', '#6A1B9A', '#AB47BC', '#FF8800', '#AED581', '#00338e', '#39892f', '#d59859', '#1a2c42', '#1f3831',
    '#5F9EA0', '#98FB98', '#FFD580', '#512DA8', '#48D1CC', '#FFC107', '#7E57C2', '#CE93D8', '#FF9933', '#81C784',
    '#6495ED', '#3CB371', '#FFE082', '#009688', '#FFD54F', '#CDDC39', '#B39DDB', '#80CBC4', '#C5E1A5', '#00BFFF',
    '#2E8B57', '#F0E68C', '#00ACC1', '#FFF176', '#D4E157', '#9FA8DA', '#4DB6AC', '#DCEDC8', '#1976D2', '#228B22'
];

export default function AreaLineChart(props) {
    var { type, data, yAxisLabel,totalCapacity, freeSpace,onPointClick } = props;
    var [graphData, setGraphData] = useState([]);
    var [serverList, setServerList] = useState([]);
    var [capacityList, setCapacityList] = useState([]);
    var [freeSpaceList, setFreeSpaceList] = useState([]);
    
    useEffect(() => {
        if (Object.keys(data).length > 0) {
            if (type === "disk") {
                var arr = Object.values(data);
                var serverArr = arr.length > 0 ? Object.keys(arr[0]).filter((item) => item !== "name") : [];
                var serverArr1 = Object.values(totalCapacity); // Total disk capacity data
                var freeSpaceArr = Object.values(freeSpace);  // Free space data
 
                setGraphData(arr);
                setServerList(serverArr);
                setCapacityList(serverArr1);
                setFreeSpaceList(freeSpaceArr);
            }
            
            else {
                var arr = data;  
                var serverArr = Object.keys(data[0]).filter((item) => item !== "name");
                setGraphData(arr);
                setServerList(serverArr);
            }
        } else {
            setServerList([]);
            setGraphData([]);
        }
    }, [data, totalCapacity, freeSpace, type]);
 
   
    const CustomTooltip = ({ active, payload }) => {
        if (active && payload && payload.length) {
            const dataPoint = payload[0].payload;
            const dataIndex = graphData.findIndex(item => item.name === dataPoint.name);
            const idx = (typeof lockedIndex === 'number' && lockedIndex >= 0) ? lockedIndex : dataIndex;

            if (type === "disk") {
                const matchingCapacity = capacityList[idx] || {};
                const matchingFreeSpace = freeSpaceList[idx] || {};  
                const sortedServers = [...serverList].sort((a, b) => (dataPoint[b] || 0) - (dataPoint[a] || 0));
    
                return (
                    <div style={{ backgroundColor: 'white', border: '1px solid #ccc', padding: '10px' }}
                        onMouseEnter={() => { setIsTooltipHovered(true); if (idx != null) setLockedIndex(idx); }}
                        onMouseLeave={() => setIsTooltipHovered(false)}
                        onMouseMove={(e) => e.stopPropagation()}
                    >
                        <p>{`Time: ${dataPoint.name}`}</p>
                        {sortedServers.map((serverItem, index) => (
                            <p key={serverItem} style={{ color: colors[index] }}>
                                {`${serverItem}: ${dataPoint[serverItem]} (totaldiskcapacity: ${matchingCapacity[serverItem] || 'N/A'} GB, freespace: ${matchingFreeSpace[serverItem] || 'N/A'} GB)`}
                            </p>
                        ))}
                    </div>
                );
            }
        }
        return null;
    };

    const [tooltipPos, setTooltipPos] = useState(null);
    const [isTooltipHovered, setIsTooltipHovered] = useState(false);
    const [lockedIndex, setLockedIndex] = useState(null);


    const handleMouseMove = (state) => {
    if (!state) return;
    if (isTooltipHovered) return;

    const activeCoordinate = state.activeCoordinate || null;
    const { x, chartX, chartWidth, activeTooltipIndex } = state;

    let computedX = x;
    if (activeCoordinate && typeof activeCoordinate.x === 'number') {
        computedX = activeCoordinate.x - 150;
    }

    const padding = 10;
    let adjustedX = computedX;
    if (typeof chartX === 'number' && typeof chartWidth === 'number') {
        if (adjustedX < chartX + padding) adjustedX = chartX + padding;
        else if (adjustedX > chartX + chartWidth - padding) adjustedX = chartX + chartWidth - padding;
    }

    const itemCount = serverList.length;
    const baseY = itemCount <= 1 ? -50 : itemCount <= 3 ? -80 : -140;
    
    setTooltipPos({x: adjustedX, y: baseY});
    if (typeof activeTooltipIndex === 'number' && activeTooltipIndex !== lockedIndex) {
        setLockedIndex(activeTooltipIndex);
    }
    };

    const handleMouseLeave = () => {
    setIsTooltipHovered(false);
    setLockedIndex(null);
    };

    return (
        <div style={{ width: '100%', height: '100%' }}>
            <ResponsiveContainer width={'100%'} height={250}>
                <AreaChart data={graphData} margin={{ left: 30 }} onClick={onPointClick} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
                    <XAxis dataKey="name" interval="preserveStartEnd"
                        ticks={(() => {
                            if (!graphData || graphData.length === 0) return [];

                            const start = new Date(graphData[0].name);
                            const end = new Date(graphData[graphData.length - 1].name);
                            const durationHours = (end - start) / (1000 * 60 * 60);

                            //Only apply filtering when range > 3 hours
                            if (durationHours > 3) {
                                return graphData
                                    .map(d => d.name)
                                    .filter(name => {
                                        const date = new Date(name);
                                        const m = date.getMinutes();
                                        return m === 0 || m === 30;
                                    });
                            }

                            //For <= 3 hours (like your default 30-min load), show all ticks
                            return graphData.map(d => d.name);
                        })()}
                        tick={({ x, y, payload }) => {
                            const date = new Date(payload.value);
                            const timeStr = date.toLocaleString('en-GB', {
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true,
                            });
                            const dateStr = date.toLocaleString('en-GB', {
                                day: 'numeric',
                                month: 'short',
                            });

                            return (
                                <>
                                <text x={x} y={y + 10} textAnchor="middle" fill="#666" fontSize={12}>{timeStr} </text>
                                <text x={x} y={y + 22} textAnchor="middle" fill="#666" fontSize={12}>{dateStr} </text>
                                </>
                            );
                        }} />
                    {colors.map((val, index) => (
                        <defs key={index}>
                            <linearGradient id={index} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={colors[index]} stopOpacity={0.8} />
                                <stop offset="95%" stopColor={colors[index]} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                    ))}
                    <CartesianGrid strokeDasharray="3 3" />
                    <YAxis
                        domain={props.domain}
                        tickCount={props.yAxisLabel === "Status" ? 2 : 5} // Number of ticks
                        interval="preserveStartEnd"
                        tickFormatter={(value) => {
                            if (value >= 1000000000) return `${(value / 1000000000).toFixed(1)}B`;
                            if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                            if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
                            return value;
                        }}
                    >
                        <Label
                            value={props.yAxisLabel || "Utilization %"} // Dynamically set based on props
                            angle={-90}
                            position="InsideTopLeft"
                            dx={ props.yAxisLabel === "readBytes" || props.yAxisLabel === "writeBytes" ? -55
                                : props.yAxisLabel === " Utilization GiB" ? -35 
                                : ["Packets/sec", "Bytes/sec", "Total Bytes"].includes(props.yAxisLabel) ? -45
                                : -20 }
                            style={{ fontWeight: "bold", margin: "10px" }}
                        />
                    </YAxis>
                    {type === "dis" ? (
                        <Tooltip
                            content={<CustomTooltip />}
                            position={tooltipPos}
                          allowEscapeViewBox={{ x: true, y: true }}
                            cursor={{ stroke: 'rgba(0,0,0,0.1)', strokeWidth: 1 }}
                            wrapperStyle={{ maxHeight: '150px', overflowY: 'auto', pointerEvents: 'auto', transition: 'transform 0.1s ease-in-out' }}
                            offset={0}
                        />
                    ) : (
                        <Tooltip position={tooltipPos}
                        allowEscapeViewBox={{ x: true, y: true }} 
                            cursor={{ stroke: 'rgba(0,0,0,0.1)', strokeWidth: 1 }} offset={0}
                            wrapperStyle={{ maxHeight: '150px', maxWidth: '213px', overflowX: 'hidden', overflowY: 'auto', pointerEvents: 'auto' }}
                            content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                    const idx = (typeof lockedIndex === 'number' && lockedIndex >= 0) ? lockedIndex : graphData.findIndex(item => item.name === payload[0]?.payload?.name);
                                    const dataPoint = graphData[idx] || payload[0].payload;
                                    return (
                                        <div style={{ backgroundColor: 'white', border: '1px solid #ccc', padding: '10px' }}
                                            onMouseEnter={() => { setIsTooltipHovered(true); if (idx != null) setLockedIndex(idx); }}
                                            onMouseLeave={() => setIsTooltipHovered(false)}
                                            onMouseMove={(e) => e.stopPropagation()}
                                        >
                                            <p>{`${dataPoint.name}`}</p>
                                            {[...serverList]
                                                .sort((a, b) => (dataPoint[b] || 0) - (dataPoint[a] || 0))
                                                .map((serverItem) => {
                                                    const details = typeof props.getPointDetails === 'function'
                                                        ? props.getPointDetails(dataPoint.name, serverItem)
                                                        : null;
                                                    // No details provided -> render exactly as before (unchanged for all existing charts).
                                                    if (!Array.isArray(details) || details.length === 0) {
                                                        return (
                                                            <p key={serverItem} style={{ color: colors[serverList.indexOf(serverItem)] }}>
                                                                {`${serverItem}: ${dataPoint[serverItem]}`}
                                                            </p>
                                                        );
                                                    }
                                                    // Details provided (e.g. CrowdStrike source IPs) -> list them under the line.
                                                    return (
                                                        <div key={serverItem}>
                                                            <p style={{ color: colors[serverList.indexOf(serverItem)], margin: '2px 0' }}>
                                                                {`${serverItem}: ${dataPoint[serverItem]}`}
                                                            </p>
                                                            <div style={{ margin: '0 0 4px 10px' }}>
                                                                {details.map((d) => (
                                                                    <p key={d} style={{ margin: 0, fontSize: 11, color: '#555' }}>{d}</p>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    );
                                }
                                return null;
                            }}
                        />
                    )}
 
                    {serverList.length < 3 ? <Legend /> : ""}
                   
                    {serverList.map((serverItem, index) => (
                        <Area key={serverItem} type="monotone" dataKey={serverItem} stroke={colors[index]} fill={serverList.length > 1 ? "transparent" : `url(#${index})`} fillOpacity={serverList.length > 1 ? 0 : 0.25} />
                    ))}
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}