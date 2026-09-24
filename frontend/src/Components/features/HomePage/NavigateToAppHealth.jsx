import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom';
import CircularProgress from '@mui/material/CircularProgress';
import Grid from '@mui/material/Unstable_Grid2';

export default function NavigateToAppHealth() {
    var navigate = useNavigate()

    useEffect(()=>{
        localStorage.setItem('showBetaFeatures', 'false');
        navigate("/CRCA application wallboard")
    },[])
    
    return (
        <Grid container xs={12} justifyContent={"center"} alignItems={"center"}>
            <CircularProgress />
        </Grid>
    )
}