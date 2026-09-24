import React from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardMedia from '@mui/material/CardMedia';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';
import CardActionArea from '@mui/material/CardActionArea';
import { useNavigate } from "react-router-dom";

const ZoomCard = styled(Card)(({ theme }) => ({
  transition: 'transform 0.3s ease-in-out',
  '&:hover': {
    transform: 'scale(1.05)',
  },
}));

const CustomCard = ({ photo, header, description, to }) => {

  const navigate = useNavigate()

  const gotToNewPage=(url)=>{
    
    navigate(url);
    
  }
  return (
    <ZoomCard sx={{ maxWidth: 345 }} onClick={()=>gotToNewPage(to)}>
      <CardActionArea>
        <CardMedia
          component="img"
          height="140"
          image={photo}
          alt={header}
        />
        <CardContent>
          <Typography gutterBottom variant="h5" component="div">
            {header}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {description}
          </Typography>
        </CardContent>
      </CardActionArea>
    </ZoomCard>
  );
}

export default React.memo(CustomCard);
