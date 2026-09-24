import React, { useState, useEffect } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Slide from '@mui/material/Slide';
import Box from '@mui/material/Box'

const Transition = React.forwardRef(function Transition(props, ref) {
    return <Slide direction="up" ref={ref} {...props} />;
});

export default function PopUp({popUpHeader, popUpBody, buttons, isOpen}){

    const isHtmlString = typeof popUpBody === 'string' && /<[^>]+>/.test(popUpBody);

    const [open, setOpen] = React.useState(isOpen);

    useEffect(()=>{
        setOpen(isOpen)
    }, [isOpen])

    const handleClose = () => {
        setOpen(false);
    };

    return (
        <React.Fragment>
            <Dialog
                open={open}
                slots={{ transition: Transition }}
                keepMounted
                onClose={handleClose}
                aria-describedby="alert-dialog-slide-description"
                BackdropProps={{
                    sx: {
                    backdropFilter: 'blur(6px)',
                    backgroundColor: 'rgba(7, 16, 38, 0.35)',
                    },
                }}
                PaperProps={{
                    sx: {
                        width: { xs: '100%', sm: '100%', md: '100%' },
                        maxWidth: 1200,
                        borderRadius: 3,
                        overflow: 'hidden',
                        border: '1px solid rgba(255,255,255,0.22)',
                        boxShadow: '0 22px 60px rgba(0, 24, 65, 0.35)',
                        background:
                            'linear-gradient(145deg, rgba(255,255,255,0.96) 0%, rgba(247,250,255,0.95) 55%, rgba(236,244,255,0.96) 100%)',
                        animation: 'popupIntro 320ms ease-out',
                        '@keyframes popupIntro': {
                            '0%': { opacity: 0, transform: 'translateY(14px) scale(0.98)' },
                            '100%': { opacity: 1, transform: 'translateY(0) scale(1)' },
                        },
                    },
                }}
            >
                <DialogTitle
                    sx={{
                        px: 2.5,
                        py: 1.8,
                        fontWeight: 800,
                        fontSize: '1.03rem',
                        letterSpacing: 0.2,
                        color: '#EAF2FF',
                        background: 'linear-gradient(90deg, #0D3B85 0%, #1459C2 55%, #1A73E8 100%)',
                        borderBottom: '1px solid rgba(255,255,255,0.18)',
                    }}
                    mb={1}
                >
                    {popUpHeader}
                </DialogTitle>

                <DialogContent sx={{ px: 2.5, pt: 2.2, pb: 1.2 }}>
                    <Box
                        sx={{
                            borderLeft: '4px solid #1A73E8',
                            background: 'rgba(26, 115, 232, 0.06)',
                            borderRadius: 1.5,
                            px: 1.5,
                            py: 1.2,
                        }}
                    >
                        {isHtmlString ? (
                            <Box
                                id="alert-dialog-slide-description"
                                sx={{
                                    m: 0,
                                    color: '#26374D',
                                    fontSize: '0.96rem',
                                    lineHeight: 1.62,
                                    fontWeight: 500,
                                    '& p': { m: 0 },
                                    '& ul': { my: 1, pl: 3 },
                                    '& li': { mt: 0.5 },
                                }}
                                dangerouslySetInnerHTML={{ __html: popUpBody }}
                            />
                        ) : (
                            <DialogContentText
                                id="alert-dialog-slide-description"
                                sx={{
                                m: 0,
                                color: '#26374D',
                                fontSize: '0.96rem',
                                lineHeight: 1.62,
                                fontWeight: 500,
                                }}
                            >
                                {popUpBody}
                            </DialogContentText>
                        )}
                    </Box>
                </DialogContent>

                <DialogActions
                    sx={{
                    px: 2.2,
                    pb: 2,
                    pt: 0.8,
                    gap: 1,
                    justifyContent: 'flex-end',
                    background:
                        'linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(233,242,255,0.55) 100%)',
                    }}
                >
                    {buttons.map((button, index) => (
                    <Button
                        key={index}
                        onClick={button.function}
                        variant={index === 0 ? 'contained' : 'outlined'}
                        disableElevation
                        disabled = {!button.enabled}
                        sx={{
                        textTransform: 'none',
                        borderRadius: 2,
                        px: 2,
                        py: 0.75,
                        fontWeight: 700,
                        letterSpacing: 0.2,
                        transition: 'all 0.22s ease',
                        ...(index === 0
                            ? {
                                color: '#FFFFFF',
                                background:
                                'linear-gradient(90deg, #0E4EB0 0%, #1A73E8 100%)',
                                '&:hover': {
                                background:
                                    'linear-gradient(90deg, #0B439A 0%, #155FC2 100%)',
                                transform: 'translateY(-1px)',
                                boxShadow: '0 8px 20px rgba(26, 115, 232, 0.35)',
                                },
                            }
                            : {
                                color: '#0D3B85',
                                borderColor: 'rgba(13, 59, 133, 0.35)',
                                backgroundColor: 'rgba(255,255,255,0.75)',
                                '&:hover': {
                                borderColor: '#0D3B85',
                                backgroundColor: '#EEF5FF',
                                },
                            }),
                        }}
                    >
                        {button.label}
                    </Button>
                    ))}
                </DialogActions>
            </Dialog>
        </React.Fragment>
    );
}