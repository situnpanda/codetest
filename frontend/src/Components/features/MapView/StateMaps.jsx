// AlaskaMap.js
import React from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';


function AlaskaMap(){

    // Define the Alaska geography (replace with actual coordinates)
    const alaskaGeo = {
        type: 'Feature',
        geometry: {
        type: 'Polygon',
        coordinates: [
            [
                143,
                144,
                145,
                146,
                147
            ]
        ],
        },
    };
  return (
    <ComposableMap projection="geoAlbersUsa">
      <Geography
        key={1}
        geography={{
            "type": "Polygon",
            "coordinates": [
                [-149.49,64.20],
                [-149.49,64.20],
                [-149.49,64.20],
                [-149.49,64.20],
                [-149.49,64.20],
            ]
        }}
        fill="#EEEEEE"
        stroke="#D6D6DA"
      />
    </ComposableMap>
  );
};

export default AlaskaMap;
