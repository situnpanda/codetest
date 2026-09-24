import React from 'react';
import {Typography,Box} from '@mui/material';

const HeaderImage = ({ images, interval = 3000 }) => {
  const [currentImageIndex, setCurrentImageIndex] = React.useState(0);

  React.useEffect(() => {
    const switchImage = () => {
      setCurrentImageIndex((prevIndex) => (prevIndex + 1) % images.length);
    };

    const intervalId = setInterval(switchImage, interval);

    return () => clearInterval(intervalId);
  }, [images, interval]);

  return (
    <Box
      sx={{
        width: '100%',
        height: '300px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          width: '100%',
          height: '100%',
          backgroundImage: `url(${images[currentImageIndex]})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          transition: 'background-image 0.5s ease-in-out',
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography variant="h2" color="white">
          Service Engineering Central
        </Typography>
      </Box>
    </Box>
  );
};

export default React.memo(HeaderImage);
