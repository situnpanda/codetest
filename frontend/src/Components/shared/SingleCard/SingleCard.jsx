import React from 'react';

function ValueCard({ value }) {
  const color = value >= 70 ? 'green' : 'red';

  return (
    <div 
      style={{
        backgroundColor: 'white',
        borderColor: 'grey',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderRadius: '10px', 
        padding: '20px',
        textAlign: 'center',
        color: color 
      }}
    >
      {value}
    </div>
  );
}

export default React.memo(ValueCard);