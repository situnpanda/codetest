

import React, { useEffect, useState } from 'react';
import DrilldownTable from '../../shared/DataTable/DrilldownTable';

const StateDetailPage = ({stateName}) => {
  console.log(stateName)
  const [regionData, setRegionData] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      const dummyData = [
        { id: 1, state: 'California', availability: 90, reliability: 95, incidents: 2, remarks: 'Good' },
        { id: 2, state: 'Texas', availability: 100, reliability: 98, incidents: 1, remarks: 'OK' },
        { id: 3, state: 'New York', availability: 100, reliability: 99, incidents: 0, remarks: 'Excellent' },
      ];

      if (stateName) {
        const filteredData = dummyData.filter((item) => item.state.toLowerCase()=== stateName.toLowerCase());

        setRegionData(filteredData);
        // console.log(filteredData)
      }
    };

    fetchData();
  }, [stateName,regionData]);

  if (!stateName) {
    return <div>Loading...</div>; 
  }

  return (
    <div>
      <DrilldownTable data={regionData} />
    </div>
  );
};

export default StateDetailPage;
