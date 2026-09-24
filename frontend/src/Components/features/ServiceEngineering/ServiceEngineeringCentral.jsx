import React, { Component } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import HeaderImage from '../../shared/Slideshow/HeaderImage';
import CustomCard from '../../shared/Cards/CustomCard';
import CloudOperations from '../../Static/Images/CloudOperations.jpg'
import CloudGovernance from '../../Static/Images/CloudGovernance.jpg'
import ImageNav1 from '../../Static/Images/serviceEngineeringNav1.png'
import ImageNav2 from '../../Static/Images/serviceEngineeringNav2.png'
import ImageNav3 from '../../Static/Images/serviceEngineeringNav3.jpg'
import { useNavigate } from "react-router-dom";

export default function ServiceEngineeringCentral() {

  const navigate = useNavigate()

  const gotToNewPage=(val)=>{
    console.log(val)
    if(val == "Cloud Operations"){
      navigate("/vendor report card/infrastructureTelemetry");
    }
  }
    const images = [
      ImageNav1,
      ImageNav2,
      ImageNav3
    ];
    const cards = [
      {
        photo: CloudOperations,
        header: 'Cloud Operations',
        description: 'Helps troubleshooting CPU, Memory and Disk utlization related issues',
        path: '/vendor report card/infrastructureTelemetry'
      },
      {
        photo: CloudGovernance,
        header: 'Cloud Governance',
        description: 'Supports remediation of Azure Resource Tags and Policies',
        path: '/azureGovernance'
      }
    ];

    return (
      
      <Box sx={{ width: '100%', p:0, m:0}}>
        <Box sx={{backgroundColor:"black"}}>
          <HeaderImage images={images} interval={3000} />
        </Box>
        <Box sx={{ p: 3 }}>
          
          <Grid container spacing={3} justifyContent="center">
            {cards.map((card, index) => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={index} >
                  <CustomCard
                    photo={card.photo}
                    header={card.header}
                    description={card.description}
                    to= {card.path}
                  />
                </Grid>
            ))}
          </Grid>
        </Box>
      </Box>
    );
  };

