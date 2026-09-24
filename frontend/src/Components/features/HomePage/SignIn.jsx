import React from 'react'
import CircularProgress from '@mui/material/CircularProgress';
import React, { useEffect, useState,useRef } from 'react'
import {useNavigate} from 'react-router-dom'

export default function SignIn({userProfileData}) {

    var navigate = useNavigate()

    useEffect(()=>{
        if(Object.keys(userProfileData).length>0 && 'displayName' in userProfileData){
            navigate('/homePage')
        }
    },[userProfileData])

    return (
        <Grid container justifyContent="center" alignItems="center" sx={{ mt: 2 , maxHeight:'100vw'}}>
            <CircularProgress sx={{ '& .MuiCircularProgress-circle': { strokeWidth: '2px' } }} />
        </Grid>
    )
}
