import React, { useState, useEffect, useRef } from 'react'
import {useLocation } from 'react-router-dom';
import Grid from '@mui/material/Unstable_Grid2';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import NetworkGraph from '../../shared/NetworkGraph/NetworkGraph'
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import CardMedia from '@mui/material/CardMedia';
import Button from '@mui/material/Button';
import AreaLineChart from '../../shared/LineChart/AreaLineChart'
import BarGraph from '../../shared/BarChart/BarChart'
import Graph from 'react-vis-network-graph'
import serverImage from '../../Static/Images/serverImage.jpg'
import winServiceImage from '../../Static/Images/winServiceImage.png'
import CpInterfaceImage from '../../Static/Images/CpInterfaceImage.jpg'
import Alert from '@mui/material/Alert';
import { CardHeader, List, ListItem, Modal } from '@mui/material';
import CircleIcon from '@mui/icons-material/Circle';
import RadioButtonCheckedOutlinedIcon from '@mui/icons-material/RadioButtonCheckedOutlined';
import Tooltip from '@mui/material/Tooltip';
import InfoIcon from '@mui/icons-material/Info';
import { keyframes } from '@mui/material';


export function CreateTourCard({pageHeader, pageDescription, newFeature, featureList, upcominFeature, handleModalTourClose, modalTourOpen}) {
    const style = {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 600,
        bgcolor: 'background.paper',
        boxShadow: 24,
        p: 0,
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '80vh',
    };
    const colorChange = keyframes`
        0% {
            color: blue;
        }
        50% {
            color: red;
        }
        100% {
            color: green;
        }
    `;
    var handleDisplay = () =>{
        localStorage.setItem(pageHeader +"_Tour","false")
        handleModalTourClose()
    }
    // { maxWidth: 600, maxHeight: 600}
    return(
        <Card sx={{...style, width: { xs: '95%', sm: 700, md: 850, lg: 950 }, maxWidth: 950, maxHeight: '90vh', overflow: 'auto'}}>
            <Grid container xs={12} mb={1} p={2} justifyContent="center" alignItems="center" sx={{backgroundColor:"primary.main", position:"sticky"}}>
                <Typography gutterBottom variant="h5" component="div" sx={{color:"white"}}>
                    Welcome to the i-Telemetry <strong>{pageHeader}</strong>!
                </Typography>
            </Grid>
            <div style={{overflowY:"auto", flexGrow: 1}}>
                <CardContent>
                    <Typography variant="body2" color="text.secondary">
                        {pageDescription}
                    </Typography>
                    <Divider sx={{borderColor: 'black'}}/>
                    <Grid container xs={12} mt={1}>
                        {newFeature.length>0 ? 
                            <>
                                <Grid item xs={12}>
                                    <Typography variant="h6" sx={{animation: `${colorChange} 2s infinite`}}><i>New Feature</i></Typography>
                                </Grid>
                                <Grid item xs={12}>
                                    <List>
                                        {newFeature.map((feature, index) => {
                                            return (
                                                <ListItem key={index}>
                                                    <Typography>
                                                        <RadioButtonCheckedOutlinedIcon fontSize="0.25px"/> {feature}
                                                    </Typography>
                                                </ListItem>
                                            )
                                        })}
                                    </List>
                                </Grid>
                            </>
                        :
                            null
                        }
                        
                        <Grid item xs={12}>
                            <Typography variant="h6"><i>Features & Thresholds</i></Typography>
                        </Grid>
                        <Grid item xs={12}>
                            <List>
                                { featureList.map((feature, index) => {
                                    return (<ListItem key={index}>
                                        <Typography>
                                            <RadioButtonCheckedOutlinedIcon fontSize="0.25px"/> {feature}
                                        </Typography>
                                    </ListItem>)
                                })}
                            </List>
                        </Grid>
                        <Divider sx={{borderColor: 'black', width: '100%'}}/>
                        {upcominFeature.length>0 ?
                            <>
                                <Grid item xs={12}>
                                    <Typography variant="h6"><i>Upcoming Feature</i></Typography>
                                </Grid>
                                <Grid item xs={12}>
                                    <List>
                                        {upcominFeature.map((feature, index) => {
                                            return (
                                                <ListItem key={index}>
                                                    <Typography>
                                                        <RadioButtonCheckedOutlinedIcon fontSize="0.25px"/> {feature}
                                                    </Typography>
                                                </ListItem>
                                            )
                                        })}
                                    </List>
                                </Grid>
                            </>
                            : 
                                null
                        }

                    </Grid>
                </CardContent>
                </div>
                <div style={{position:"sticky"}}>
                <CardActions justifyContent="center" alignItems="center">
                    <Button size="small" onClick={handleDisplay}>Do not Show Again</Button>
                </CardActions>
            </div>
        </Card>
    )
}
 