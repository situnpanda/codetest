import React, { useState, useEffect } from 'react';
import { ComposableMap, Geographies, Geography, Marker, Annotation,ZoomableGroup } from 'react-simple-maps';
import States from '../../Static/MapsData/States.json';
import { geoCentroid } from 'd3-geo';
import Modal from 'react-modal'; 
import './Map.css';
import StateDetailPage from './Drilldown';
import { feature } from 'topojson-client';
import stateData from '../../Static/MapsData/statesTopoJsonFile.json';


const modalStyles = {
  overlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1000,
  },
  content: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '85%',
    height: '80%',
    padding: '20px',
  },
};

export default function Map({ stateName,appStatusDown }) {
  const geoUrl = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';
  const [selectedState, setSelectedState] = useState(null);
  const [geographies, setGeographies] = useState([]);

  const offsets = {
    VT: [50, -8],
    NH: [34, 2],
    MA: [30, -1],
    RI: [28, 2],
    CT: [35, 10],
    NJ: [34, 1],
    DE: [33, 0],
    MD: [47, 10],
    DC: [49, 21],
  };

  var transform = {
    "Alaska": "translate(211.80618246977804 -1412.4231614893456) scale(3.3635856002173052)", 
    "Oregon": "translate(-16.248950068637782 -494.3359512195508) scale(4.756828349464239)",
    "Texas": "translate(-548.0501252794987 -875.5428223211532) scale(2.63901582154579)",
    "Montana" : "translate(-534.7736973877534 -287.0686883097469) scale(3.99999991737042)",
    "Washington": "translate(-81.22041512918577 -233.5271735109062) scale(4.756828349464239)",
    "California" : "translate(215.38260415591864 -391.5547813784964) scale(2.2973967099940715)",
    "Idaho":"translate(-180.87540548498407 -198.67653288999009) scale(3.4822022531844996)"
  }

  useEffect(() => {
    const fetchGeographies = async () => {
        const geojson = feature(stateData, stateData.objects[Object.keys(stateData.objects)[0]]);
        //console.log(stateData, geojson)
        setGeographies(geojson.features)
    };

    fetchGeographies();
  }, []);

  const closeModal = () => {
    setSelectedState(null);
  };
  
  return (
    
    <div className='map-states'> 
      <ComposableMap projection="geoAlbersUsa">
        <Geographies geography={geographies}> 
          {({ geographies }) => (
            <>
              {geographies.map((geo) => {
                if (geo.properties.name === stateName || stateName === "USA") {
                    const centroid = geoCentroid(geo);
                    const cur = States.find((s) => s.val === geo.id);

                    const stateColor = 'lightgrey'; // Default color for the state
                    const strokeColor = appStatusDown > 0 ? 'rgba(144, 0, 0, 0.7)': '#FFF';
                    return (
                        <>
                          <g key={geo.rsmKey + '-name'} transform={transform[stateName]}>
                              <Geography
                                  key={geo.rsmKey}
                                  stroke={strokeColor}
                                  geography={geo}
                                  fill={stateColor}
                                  style={{
                                      hover: {
                                          fill: '#00338e80', 
                                          stroke: 'none',
                                          cursor: 'pointer',
                                      },
                                  }}
                              />
                              
                              {cur &&
                                  centroid[0] > -160 &&
                                  centroid[0] < -67 &&
                                  (Object.keys(offsets).indexOf(cur.id) === -1 ? (
                                      <Marker coordinates={centroid}>
                                          <text y="2" fontSize={14} textAnchor="middle">
                                          
                                          </text>
                                      </Marker>
                                  ) : (
                                      <Annotation subject={centroid} dx={offsets[cur.id][0]} dy={offsets[cur.id][1]}>
                                          <text x={4} fontSize={14} alignmentBaseline="middle">
                                              
                                          </text>
                                      </Annotation>
                                  ))}
                          </g>
                        </>
                    );
                } 
              })}
            </>
          )}
        </Geographies>
      </ComposableMap>

      <Modal
        isOpen={selectedState !== null}
        onRequestClose={closeModal}
        style={modalStyles}
        contentLabel="State Modal"
      >
        <div>
        <h2>{selectedState}</h2>
        <StateDetailPage stateName={selectedState}/>
        </div>
        <button style={{ position: 'absolute', top: '10px', right: '10px' }} onClick={closeModal}>
          X
        </button>
      </Modal>
    </div> 
  );
}
