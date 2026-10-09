import React, { useEffect, useState, useRef } from 'react'
//import Graph from 'react-vis-network-graph'
import VisNetwork from 'react-vis-network-graph'
import serverImage from '../../Static/Images/serverImage.jpg'
import winServiceImage from '../../Static/Images/winServiceImage.png'
import CpInterfaceImage from '../../Static/Images/CpInterfaceImage.jpg'
import { Gauge } from '@mui/x-charts/Gauge';
import "./NetworkGraph.css"; // Import custom network CSS
import {Tooltip} from 'react-tooltip';

export default function NetworkGraph(props) {

    var {appFamily, graphData} = props;
    var networkRef = useRef(null);
    // //console.log(graphData)
    // var [options, setOptions] = useState({})
    const [key, setKey] = useState(Date.now());
    var [events, setEvents] = useState({})

    const graph = {
      nodes:graphData.nodes,
      edges:graphData.edges
    }

    const options = {
      // physics: {
      //   enabled:false,
      //   forceAtlas2Based: {
      //     gravitationalConstant: -40000,
      //     centralGravity: 0.05,
      //     springLength: 400,
      //     springConstant: 0.001
      //   },
      //   timestep: 0.35,
      //   stabilization: true
      // },
      physics: {
        enabled: false,
        barnesHut: {
          springLength: 100, // Default spring length
          springConstant: 0.04, // Adjust as needed
        },
        stabilization : true
      },
      interaction:{
        navigationButtons : true,
      },
      height:'400px',
      nodes:{
          shape:'circularImage',
          font: {
            multi: true
          },
          scaling: {
            min: 10, // Minimum node size
            max: 15, // Maximum node size
          }
      },
      edges:{
        color:"black",
        width: 1
      }
    }

    useEffect(()=>{
      if (networkRef.current) {
        const handleStabilization = () => {
          setTimeout(() => {
            if (networkRef.current) {
              networkRef.current.fit();
            }
          }, 0); // Immediate fit after stabilization
        };
  
        networkRef.current.on('stabilized', handleStabilization);
  
        return () => {
          networkRef.current.off('stabilized', handleStabilization);
        };
      }
    },[])

    useEffect(()=>{
      //console.log("In Use Effect")
      
      // setNodes([]);
      // setEdges([]);
      // setOptions({
      //   // physics: {
      //   //   enabled:false,
      //   //   forceAtlas2Based: {
      //   //     gravitationalConstant: -40000,
      //   //     centralGravity: 0.05,
      //   //     springLength: 400,
      //   //     springConstant: 0.001
      //   //   },
      //   //   timestep: 0.35,
      //   //   stabilization: true
      //   // },
      //   physics: {
      //     enabled: false,
      //     barnesHut: {
      //       springLength: 100, // Default spring length
      //       springConstant: 0.04, // Adjust as needed
      //     },
      //     stabilization : true
      //   },
      //   interaction:{
      //     navigationButtons : true,
      //   },
      //   height:'400px',
      //   nodes:{
      //       shape:'circularImage',
      //       font: {
      //         multi: true
      //       },
      //       scaling: {
      //         min: 10, // Minimum node size
      //         max: 15, // Maximum node size
      //       }
      //   },
      //   edges:{
      //     color:"black",
      //     width: 1
      //   }
      // })
      // setEvents({
      //   select: function (event) {
      //     var { nodes, edges } = event;
          
      //   }
      // })
      // setNodes(graphData.nodes)
      // setEdges(graphData.edges)

      // const timeout = setTimeout(() => {
      //   if (networkRef.current) {
      //     networkRef.current.once('stabilizationIterationsDone', () => {
      //       networkRef.current.fit();
      //     });
      //   }
      // }, 100); // Delay to ensure the graph is fully rendered
  
      // return () => clearTimeout(timeout); // Cleanup timeout on unmount
      
    },[graphData])

    
    
    // //console.log(graph)
    
  return (
    <React.Fragment>
      <VisNetwork
        key={key}
        graph={graph}
        options={options}
        getNetwork={network => { networkRef.current = network; }}
        
      />
       
    </React.Fragment>
      
  )
}


// const graph = {
//   nodes:[
//     {id:1,label:"Application Name", shape:"box", margin:20, size:40, font:{size:15}, color:{background:"white"}},
//     {id:2, label:'server1',
//       shape: "image",
//       image: serverImage,
//       label: "Server 1",
//       size: 30,
//       //imagePadding: 20,
//       // borderWidth:2,
//       color: {
//         background:"white",
//       },
//       // shapeProperties: {
//       //   useBorderWithImage: true,
//       // },
//     //   color: {
//     //     background:"white",
//     //     border: "black",
//     //     highlight: { border: "black", borderWidth:5 },
//     //     hover: { border: "black" }
//     // }
//     },
//     {id:3, label:'server2', shape:'image', image:serverImage, size:30},
//     {id:4, label:'server3', shape:'image', image:serverImage, size:30},
//     {id:5, label:'services1', shape:'image', image:winServiceImage},
//     {id:6, label:'services2', shape:'image', image:winServiceImage},
//     {id:7, label:'interfaces1', shape:'image', image:CpInterfaceImage},
//     {id:8, label:'80%', title:"CPU Utilization", shape: 'circle', margin: 10, color:{background:"white"}, size:40, className:"customNode"},
//     {id:9, label:'interfaces2', shape:'image', image:CpInterfaceImage}
//   ],
//   edges:[
//     {id:1, from:1, to:2, color:'grey', width:2, dashes:true},
//     {id:2, from:1, to:3, color:'grey', width:2},
//     {id:3, from:1, to:4, color:'grey', width:2},
//     {id:4, from:2, to:5, color:'grey', width:2},
//     {id:5, from:2, to:6, color:'grey', width:2},
//     {id:6, from:1, to:7, color:'grey', width:2},
//     {id:7, from:3, to:8, color:'grey', width:2},
//     {id:8, from:1, to:9, color:'grey', width:2}
//   ]
// }

