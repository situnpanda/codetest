import React, { useState, useEffect } from 'react';
import Map from './Map';

const UseMap = () => {
  const [regionColors, setRegionColors] = useState({});

  useEffect(() => {
    // Dummy data 
    const dummyData = {
      California: 100,
      Texas: 98,
      Washington: 90,
      Alaska:100,
      'New Mexico':100,
      Oregon: 90,
      Montana:90,
  
    };

    const getColor = (value) => {
      if (value === 100) {
        return 'green';
      } else if (value >= 98 && value < 100) {
        return 'yellow';
      } else {
        return 'red';
      }
    };

    const processedData = {};
    Object.keys(dummyData).forEach((state) => {
      processedData[state] = getColor(dummyData[state]);
    });

    setRegionColors(processedData);
  }, []);

  return (
    <Map regionColor={regionColors}/>
  );
};

export default UseMap;