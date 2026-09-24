// StateMap.js
import React from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup
} from 'react-simple-maps';

const geoUrl =
  'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';

const StateMap = ({ state }) => {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', marginTop: '2px' }}>
      <ComposableMap
        projection="geoAlbersUsa"
        projectionConfig={{ scale: 1000 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      >
        <ZoomableGroup>
          <Geographies geography={geoUrl}>
            {({ geographies }) =>
              geographies
                .filter((geo) => geo.properties.name === state)
                .map((filteredGeo) => (
                  <Geography
                    key={filteredGeo.rsmKey}
                    geography={filteredGeo}
                    fill="#EAEAEC"
                    stroke="#D6D6DA"
                    style={{
                      default: {
                        outline: 'none'
                      },
                      hover: {
                        fill: 'grey',
                        stroke:'black'
                      }
                    }}
                  />
                ))
            }
            
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>
    </div>
  );
};

export default StateMap;
