import React from 'react'
import Grid from '@mui/material/Unstable_Grid2';
import { Modal, Card, Stack,Chip,CardHeader,Avatar,CardContent, CardActionArea, Typography, Box, Accordion, AccordionSummary, AccordionDetails, Divider, Button, TextField, ButtonGroup, Autocomplete, Radio, InputAdornment, Skeleton } from '@mui/material';
import { styled, keyframes } from '@mui/material/styles';
import {useLocation} from 'react-router-dom'
import CircularProgress from '@mui/material/CircularProgress';
import {Alert} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

export default function CircularProgress_Styled({loadingWhat = "", fetchingFor = ""}) {
    const shimmer = keyframes`
        0% { background-position: -1000px 0; }
        100% { background-position: 1000px 0; }
    `;
    const pulse = keyframes`
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
    `;

    return (
        <Box sx={{ 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            width: '100%', 
            height: '100%',
            display:'flex',
            background: 'linear-gradient(135deg, rgba(0, 51, 142, 0.96) 0%, rgba(0, 51, 142, 0.94) 100%)',
            // background: 'linear-gradient(135deg, #bdbdbd 0%, #757575 100%)',

            flexDirection: 'column',
            justifyContent: 'center', 
            alignItems: 'center', 
            opacity: 0.8, 
            transition: 'opacity 0.3s ease-in-out', 
            color: 'white',
            zIndex: 10,
            backdropFilter: 'blur(4px)'
        }}>
            <Box sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                gap: 1.5, // reduced gap
            }}>
                <Box sx={{ position: 'relative' }}>
                    <CircularProgress 
                        size={36} // reduced from 60
                        thickness={3}
                        sx={{ 
                            color: '#fff',
                            filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.4))'
                        }}
                    />
                    <Box sx={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: 22, // reduced from 40
                        height: 22,
                        borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%)',
                        animation: `${pulse} 2s ease-in-out infinite`
                    }} />
                </Box>
                <Stack spacing={0.5} alignItems="center">
                    <Typography 
                        variant="subtitle2" // smaller than h6
                        sx={{ 
                            fontWeight: 600,
                            fontSize: 16, // smaller font
                            background: 'linear-gradient(90deg, #fff 0%, #e0e7ff 50%, #fff 100%)',
                            backgroundSize: '200% auto',
                            color: 'transparent',
                            WebkitBackgroundClip: 'text',
                            backgroundClip: 'text',
                            animation: `${shimmer} 2s linear infinite`
                        }}
                    >
                        {loadingWhat}
                    </Typography>
                    <Typography 
                        variant="caption" // smaller than body2
                        sx={{ 
                            color: 'rgba(255,255,255,0.8)',
                            fontSize: 13,
                            animation: `${pulse} 1.5s ease-in-out infinite`
                        }}
                    >
                        {fetchingFor}
                    </Typography>
                </Stack>
                <Stack direction="row" spacing={0.5}>
                    {[0, 1, 2].map((i) => (
                        <Box
                            key={i}
                            sx={{
                                width: 5, // reduced from 8
                                height: 5,
                                borderRadius: '50%',
                                bgcolor: 'rgba(255,255,255,0.8)',
                                animation: `${pulse} 1s ease-in-out infinite`,
                                animationDelay: `${i * 0.2}s`
                            }}
                        />
                    ))}
                </Stack>
            </Box>
        </Box>
    )
}