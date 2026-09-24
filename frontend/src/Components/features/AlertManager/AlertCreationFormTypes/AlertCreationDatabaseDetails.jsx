import React, { useEffect, useState } from 'react'
import Grid from '@mui/material/Unstable_Grid2';
import { Modal, Card, Stack,Chip,CardHeader,Avatar,CardContent, CardActionArea, Typography, Box, Accordion, AccordionSummary, AccordionDetails, Divider, Button, TextField, ButtonGroup, Autocomplete, Radio, InputAdornment, Dialog, DialogTitle, DialogContent, DialogActions, IconButton, List, ListItem, ListItemText } from '@mui/material';
import {useLocation} from 'react-router-dom'
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import CancelIcon from '@mui/icons-material/Cancel';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

const accordionSx = {
  width: '100%',
  borderRadius: 1,
  boxShadow: '0px 2px 3px rgba(0,0,0,0.12)',
  borderBottom: '1px solid #e0e0e0',   
  borderTop: 'none',
  borderLeft: 'none',
  borderRight: 'none',
  backgroundColor: '#ffffff',
  fontSize: '11px'
};

const summarySx = {
  bgcolor: '#f5f5f5',
  px: 2,
  py: 0.75,
  minHeight: 34,
  '& .MuiAccordionSummary-content': { margin: 0, alignItems: 'center' },
  '& .MuiAccordionSummary-content.Mui-expanded': { margin: 0 }
};

export default function AlertCreationDatabaseDetails({dbFilterData, watchlistOptions, setTempAlertMetaData, tempAlertMetaData, modalOpen, handleModalOpen, handleModalClose, handleDeleteIconClick, handleAddIconClick, handleFormChange, formErrors}) {
    const [expandedResources, setExpandedResources] = useState({});
    const [resourceDialogOpen, setResourceDialogOpen] = useState(false);
    const [currentResourceIndex, setCurrentResourceIndex] = useState(null);

    return (
        <React.Fragment>
            {tempAlertMetaData["Database"].map((content, ind)=>{
                console.log(content["Storage Custom Threshold"], content)
                return(
                    <Grid container xs={12} mb={2} key={ind}>
                        <Modal
                            open={modalOpen}
                            onClose={handleModalClose}
                            aria-labelledby="modal-modal-title"
                            aria-describedby="modal-modal-description"
                        >
                            <Grid container xs={12} p={2} justifyContent="center" alignItems="center" sx={{backgroundColor:'background.paper'}} width='40%'>
                                <Grid item xs={12}>
                                    <Typography id="modal-modal-title" variant="h6">
                                        Confirmation
                                    </Typography>
                                    <Divider sx={{border:'1px black solid'}}/>
                                </Grid>
                                <Grid item xs={12}>
                                    <Typography id="modal-modal-description" sx={{ mt: 2 }}>
                                        Are you sure, you want to Delete the records from Alerting?
                                    </Typography>
                                </Grid>
                                <Grid container spacing={2} mt={1}>
                                    <Grid item>
                                        <Button variant='contained' onClick={handleDeleteIconClick}>Yes</Button>
                                    </Grid>
                                    <Grid item>
                                        <Button variant='contained' onClick={handleModalClose}>No</Button>
                                    </Grid>
                                </Grid>
                            </Grid>
                        </Modal>

                        <Accordion disableGutters square defaultExpanded sx={accordionSx}>
                            <AccordionSummary
                                sx={summarySx}
                                expandIcon={
                                    <Stack direction="row" spacing={0.5} alignItems="center">
                                        <Button
                                            color="error"
                                            sx={{ minWidth: 0, p: 0.25, ":hover": { opacity: "70%" } }}
                                            onClick={() => handleModalOpen(ind)}
                                        >
                                            <CancelIcon fontSize="small" />
                                        </Button>
                                        <ExpandMoreIcon fontSize="small" />
                                    </Stack>
                                }
                            >
                                <Grid container alignItems="center">
                                    <Grid item xs={12}>
                                        <Typography
                                            variant="subtitle2"
                                            sx={{
                                                color: '#f57c00',
                                                fontWeight: 600,
                                                fontSize: 13,
                                                lineHeight: '16px'
                                            }}
                                        >
                                            Create Alert Rule - Database
                                            {formErrors?.Database && formErrors.Database[ind] && formErrors.Database[ind].length > 0 && (
                                                <span style={{ color: 'red', marginLeft: 8, fontWeight: 400, fontSize: 12 }}>
                                                    {formErrors.Database[ind].join(', ')}
                                                </span>
                                            )}
                                        </Typography>
                                    </Grid>
                                </Grid>
                            </AccordionSummary>

                            <AccordionDetails sx={{ px: 2, pt: 1.25, pb: 1.75, fontSize: '11px' }}>
                                <Grid container xs={12} spacing={2} justifyContent="space-between" alignItems="center">
                                    <Grid item sm={12} md={3}>
                                        <Autocomplete 
                                            disabled
                                            value = "Cloud"
                                            size="small"
                                            options = {["Cloud", "OnPremise"]}
                                            renderInput={(params) => <TextField {...params} label="Hosting Type" variant="standard" fullWidth InputLabelProps={{ style: { fontSize: 12 } }} />}
                                        />
                                    </Grid> 
                                    <Grid item sm={12} md={9}>
                                        <Autocomplete 
                                            id='Resource Name with Meta Data'
                                            size="small"
                                            multiple
                                            disableCloseOnSelect
                                            options={(dbFilterData || []).length > 0 ? [{ __selectAll: true, ResourceName: (("Resources" in content && content["Resources"]?.length === (dbFilterData || []).length) ? 'Deselect all' : 'Select all') }, ...(dbFilterData || [])] : []}
                                            getOptionLabel={(option) => option && option.__selectAll ? (("Resources" in content && content["Resources"]?.length === (dbFilterData || []).length) ? 'Deselect all' : 'Select all') : option.ResourceName}
                                            renderOption={(props, option)=>{
                                                return(
                                                    <Grid container xs={12} {...props} key={option.ResourceName} spacing={2}>
                                                        {option.ResourceName.split("/").map((val,ind)=>{
                                                            return (
                                                                <Grid md={ind==0 || ind==1?3:2} lg={ind==0 || ind==1?3:2} sx={{ display: 'flex', alignItems: 'center' }}>
                                                                    <Typography variant="body2" sx={{ fontSize: 12 }}>{val}</Typography>
                                                                </Grid> 
                                                            )
                                                        })}
                                                        <Grid md={2} lg={2} sx={{ display: 'flex', alignItems: 'center'}}>
                                                            <Typography variant="caption" sx={{ fontSize: 12 }}>{option.ApplicationCI}</Typography>                
                                                        </Grid>  
                                                    </Grid>
                                                )
                                            }}
                                            onChange={(e, newValue)=>{
                                                if (newValue && newValue.some(v=>v && v.__selectAll)){
                                                    const allSelected = ("Resources" in content && content["Resources"]?.length === (dbFilterData || []).length);
                                                    handleFormChange(ind, "Resources", allSelected ? [] : (dbFilterData || []));
                                                    setExpandedResources(prev => ({ ...prev, [ind]: false }));
                                                    return;
                                                }
                                                console.log(newValue);
                                                handleFormChange(ind,"Resources",newValue);
                                                if (newValue.length <= 2) {
                                                    setExpandedResources(prev => ({ ...prev, [ind]: false }));
                                                }
                                            }}
                                            value = {"Resources" in content && content["Resources"].length>0 ? 
                                                content["Resources"].map((option)=> option )
                                                : 
                                                []
                                            }
                                            renderTags={(value, getTagProps) => {
                                                const numTags = value.length;
                                                const limitTags = 1;
                                                const isExpanded = expandedResources[ind];
                                                
                                                return (
                                                    <>
                                                        {(isExpanded ? value : value.slice(0, limitTags)).map((option, index) => (
                                                            <Chip
                                                                {...getTagProps({ index })}
                                                                key={index}
                                                                label={option.ResourceName.split("/").at(-2) + "/" + option.ResourceName.split("/").at(-1)}
                                                                size="small"
                                                                sx={{ height: 22, fontSize: 11, pl: 0.5, pr: 0.5 }}
                                                            />
                                                        ))}
                                                        {numTags > limitTags && !isExpanded && (
                                                        <Typography 
                                                            variant="body2" 
                                                            sx={{ fontSize: 10, ml: 0.5, cursor: 'pointer', color: '#1976d2', '&:hover': { textDecoration: 'underline' } }}
                                                            onClick={() => { setCurrentResourceIndex(ind); setResourceDialogOpen(true); }}
                                                        >
                                                            +{numTags - limitTags} more
                                                        </Typography>
                                                        )}
                                                    </>
                                                );
                                            }}
                                            renderInput={(params) => 
                                                <TextField 
                                                    {...params} 
                                                    label={"Resource Name - Application CI"}
                                                    variant="standard"
                                                    error={"Resources" in content && content["Resources"].length==0}
                                                    helperText={"Resources" in content && content["Resources"].length==0 ? "Cannot Be Empty":[]}
                                                    fullWidth
                                                    InputLabelProps={{ style: { fontSize: 12 } }}
                                                    InputProps={{
                                                        ...params.InputProps,
                                                        sx: (expandedResources[ind] || ("Resources" in content && content["Resources"].length > 2)) 
                                                            ? { maxHeight: 40, overflowY: 'auto', overflowX: 'hidden' } 
                                                            : {}
                                                    }}
                                                />
                                            }
                                        />
                                    </Grid>
                                </Grid>
                                
                                <Grid container mt={1} xs={12} spacing={2}>
                                    <Grid item sm={12} md={3}>
                                        <TextField
                                            size="small"
                                            label="Storage Threshold in %"
                                            variant="standard"
                                            value={("Storage Custom Threshold" in content && content["Storage Custom Threshold"]!=0) ? content["Storage Custom Threshold"] : ""}
                                            onChange={(e)=>handleFormChange(ind, "Storage Custom Threshold", e.target.value)}
                                            error={"Storage Custom Threshold" in content && content["Storage Custom Threshold"].toString().length==0}
                                            helperText={"Storage Custom Threshold" in content && content["Storage Custom Threshold"].toString().length==0 ? "Cannot Be Empty":[]}
                                            inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
                                            fullWidth
                                            InputLabelProps={{ style: { fontSize: 12 } }}
                                        />
                                    </Grid>
                                    <Grid item sm={12} md={3}>
                                        <TextField
                                            size="small"
                                            label="DTU Threshold in %"
                                            variant="standard"
                                            value={("DTU Custom Threshold" in content && content["DTU Custom Threshold"]!=0) ? content["DTU Custom Threshold"] : ""}
                                            onChange={(e)=>handleFormChange(ind, "DTU Custom Threshold", e.target.value)}
                                            error={"DTU Custom Threshold" in content && content["DTU Custom Threshold"].toString().length==0}
                                            helperText={"DTU Custom Threshold" in content && content["DTU Custom Threshold"].toString().length==0 ? "Cannot Be Empty":[]}
                                            inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
                                            fullWidth
                                            InputLabelProps={{ style: { fontSize: 12 } }}
                                        />
                                    </Grid>
                                    <Grid item sm={12} md={3}>
                                        <TextField
                                            size="small"
                                            label="CPU Threshold in %"
                                            variant="standard"
                                            value={("CPU Custom Threshold" in content && content["CPU Custom Threshold"]!=0) ? content["CPU Custom Threshold"] : ""}
                                            onChange={(e)=>handleFormChange(ind, "CPU Custom Threshold", e.target.value)}
                                            error={"CPU Custom Threshold" in content && content["CPU Custom Threshold"].toString().length==0}
                                            helperText={"CPU Custom Threshold" in content && content["CPU Custom Threshold"].toString().length==0 ? "Cannot Be Empty":[]}
                                            inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
                                            fullWidth
                                            InputLabelProps={{ style: { fontSize: 12 } }}
                                        />
                                    </Grid>
                                    <Grid item sm={12} md={3}>
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            <Typography variant="body2" sx={{ fontSize: 12 }}>
                                                DB Health
                                            </Typography>
                                            <ToggleButtonGroup
                                                size="small"
                                                value={"Database Heartbeat Custom Threshold" in content ? content["Database Heartbeat Custom Threshold"]:0}
                                                exclusive
                                                onChange={(e,newVal)=>handleFormChange(ind, "Database Heartbeat Custom Threshold", newVal)}
                                                aria-label="db-heartbeat"
                                            >
                                                <ToggleButton value={0}>
                                                    <Typography variant="body2" sx={{ fontSize: 12 }}>Disable</Typography>
                                                </ToggleButton>
                                                <ToggleButton value={1}>
                                                    <Typography variant="body2" sx={{ fontSize: 12 }}>Enable</Typography>
                                                </ToggleButton>
                                            </ToggleButtonGroup>
                                        </Stack>
                                    </Grid>
                                </Grid>
                                
                                <Grid container mt={1} xs={12} spacing={2} justifyContent="space-between" alignItems="center">
                                    <Grid item sm={12} md={3}>
                                        <Autocomplete 
                                            size="small"
                                            options = {[5, 10, 15, 20, 30, 45, 60]}
                                            value = {"Alert Frequency" in content ? content["Alert Frequency"] : ""}
                                            onChange={(e, newValue)=>handleFormChange(ind, "Alert Frequency", newValue)}
                                            renderInput={(params) => (
                                                <TextField 
                                                    {...params} 
                                                    label="Alert Frequency in Mins"
                                                    variant="standard"
                                                    error={"Resources" in content && "Alert Frequency" in content && content["Alert Frequency"]==null}
                                                    helperText={"Resources" in content && "Alert Frequency" in content && content["Alert Frequency"]==null ? "Cannot be Empty":""}
                                                    fullWidth
                                                    InputLabelProps={{ style: { fontSize: 12 } }}
                                                />
                                            )}
                                        />
                                    </Grid>
                                    <Grid item sm={12} md={3}>
                                        <Autocomplete 
                                            size="small"
                                            options = {[5, 10, 15, 20, 30, 45, 60]}
                                            value = {"Data Aggregation" in content ? content["Data Aggregation"] : ""}
                                            onChange={(e, newValue)=>handleFormChange(ind, "Data Aggregation", newValue)}
                                            renderInput={(params) => (
                                                <TextField 
                                                    {...params} 
                                                    label={"Data Aggregation in Mins"}
                                                    variant="standard"
                                                    error={"Resources" in content && "Data Aggregation" in content && content["Data Aggregation"]==null}
                                                    helperText={"Resources" in content && "Data Aggregation" in content && content["Data Aggregation"]==null ? "Cannot be Empty":""}
                                                    fullWidth
                                                    InputLabelProps={{ style: { fontSize: 12 } }}
                                                />
                                            )}
                                        />
                                    </Grid>
                                    <Grid item sx={{ display:"flex", alignItems:"center" }} sm={12} md={6}>
                                        <Stack direction="row" spacing={3} alignItems="center">
                                            {["ServiceNow", "Email", "Teams Channel"].map((val)=>{
                                                return (
                                                    <Stack key={`${val}-${ind}`} direction="row" spacing={1} alignItems="center">
                                                        <Radio
                                                            onChange={()=>handleFormChange(ind,"Communication-Type",val)}
                                                            checked={
                                                                content?.Communication?.Type?.toLowerCase() === val.toLowerCase()
                                                            }
                                                            disabled={val === "ServiceNow"}
                                                        />
                                                        <Typography variant="subtitle2" sx={{ fontSize: 12, color: val === "ServiceNow" ? 'text.disabled' : 'inherit' }}>{val}</Typography>
                                                    </Stack>
                                                )
                                            })}
                                        </Stack>
                                    </Grid>
                                </Grid>

                                {"Communication" in content && "Type" in content["Communication"] ?
                                    (content["Communication"]["Type"]==="Email"?
                                        <Grid container mt={1} xs={12} spacing={2}>
                                            <Grid item md={6}>
                                                <Autocomplete 
                                                    size="small"
                                                    multiple
                                                    disableCloseOnSelect
                                                    options = {watchlistOptions}
                                                    value={"Communication" in content && "DL" in content["Communication"] ? content["Communication"]["DL"]:[]}
                                                    onChange={(e, newValue)=>handleFormChange(ind, "Communication-DL", newValue)}
                                                    renderTags={(value, getTagProps) =>
                                                        value.map((option, index) => (
                                                            <Chip
                                                                {...getTagProps({ index })}
                                                                key={index}
                                                                label={typeof option === 'string' ? option : (option?.Email || option?.email || option?.name || option?.displayName || option?.ResourceName || '')}
                                                                size="small"
                                                                sx={{ height: 22, fontSize: 11, pl: 0.5, pr: 0.5 }}
                                                            />
                                                        ))
                                                    }
                                                    renderInput={(params) => (
                                                        <TextField 
                                                            {...params} 
                                                            label={"Email IDs"}
                                                            variant="standard"
                                                            error={content["Communication"]["DL"]==[]}
                                                            helperText={content["Communication"]["DL"]==[] ? "Cannot be Empty" : ""}
                                                            fullWidth
                                                            InputLabelProps={{ style: { fontSize: 12 } }}
                                                        />
                                                    )}
                                                />
                                            </Grid>
                                        </Grid>
                                    :
                                        (content["Communication"]["Type"] === "Teams Channel" ? 
                                            <Grid container mt={1} xs={12} spacing={2}>
                                                <Grid item md={6}>
                                                    <TextField
                                                        disabled
                                                        size="small"
                                                        label={"Teams Channel ID"}
                                                        variant="standard"
                                                        onChange={(e)=>handleFormChange(ind,"Communication-Teams Channel ID",e.target.value)}
                                                        value={"Teams Channel ID" in content["Communication"] ? content["Communication"]["Teams Channel ID"]:"19%3Ae6906b3303df4e6d9958604bf07e4690%40thread.tacv2"}
                                                        fullWidth
                                                        InputLabelProps={{ style: { fontSize: 12 } }}
                                                    />
                                                </Grid>
                                                <Grid item md={6}>
                                                    <TextField
                                                        disabled
                                                        size="small"
                                                        label={"Teams Group ID"}
                                                        variant="standard"
                                                        onChange={(e)=>handleFormChange(ind,"Communication-Group ID",e.target.value)}
                                                        value={"Group ID" in content["Communication"] ? content["Communication"]["Group ID"]:"fc6329d4-9fc4-47f7-aad2-95dd2d5e6839"}
                                                        fullWidth
                                                        InputLabelProps={{ style: { fontSize: 12 } }}
                                                    />
                                                </Grid>
                                            </Grid>
                                            :
                                            <Grid container mt={1} xs={12} spacing={2}>
                                                <Grid item md={6}>
                                                    <TextField
                                                        size="small"
                                                        label={"Teams Channel ID"}
                                                        variant="standard"
                                                        onChange={(e)=>handleFormChange(ind,"Communication-Teams Channel ID",e.target.value)}
                                                        value={"Teams Channel ID" in content["Communication"] ? content["Communication"]["Teams Channel ID"]:""}
                                                        fullWidth
                                                        InputLabelProps={{ style: { fontSize: 12 } }}
                                                    />
                                                </Grid>
                                                <Grid item md={6}>
                                                    <TextField
                                                        size="small"
                                                        label={"Teams Group ID"}
                                                        variant="standard"
                                                        onChange={(e)=>handleFormChange(ind,"Communication-Teams Group ID",e.target.value)}
                                                        value={"Teams Group ID" in content["Communication"] ? content["Communication"]["Teams Group ID"]:""}
                                                        fullWidth
                                                        InputLabelProps={{ style: { fontSize: 12 } }}
                                                    />
                                                </Grid>
                                            </Grid>
                                        )
                                    )
                                :
                                    null
                                }
                            </AccordionDetails>
                        </Accordion>
                    </Grid>
                )
            })}

            <Grid container xs={12} mt={2} columnSpacing={2}>
                <Grid item>
                    <Button
                        variant="outlined"
                        startIcon={<AddOutlinedIcon fontSize="small" />}
                        sx={{
                            textTransform: 'uppercase',
                            fontSize: 11,
                            letterSpacing: '0.08em',
                            px: 2.5,
                            py: 0.5,
                            height: 32
                        }}
                        onClick={handleAddIconClick}
                    >
                        Add New Rule
                    </Button>
                </Grid>
            </Grid>

            {/* Resource Dialog */}
            <Dialog open={resourceDialogOpen} onClose={() => setResourceDialogOpen(false)} maxWidth="sm" fullWidth
                PaperProps={{ sx: { borderRadius: 2, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', maxHeight: '72vh' } }}>
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 2, pt: 2.5, px: 3, borderBottom: '1px solid #f0f0f0' }}>
                    <Typography variant="h6" sx={{ fontSize: 15, fontWeight: 600, color: '#333' }}>
                        Manage Resources
                        <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary', ml: 1 }}>
                            ({currentResourceIndex !== null ? tempAlertMetaData["Database"][currentResourceIndex]?.Resources?.length || 0 : 0})
                        </Typography>
                    </Typography>
                    <IconButton size="small" onClick={() => setResourceDialogOpen(false)} sx={{ color: '#666' }}>
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </DialogTitle>
                <DialogContent sx={{ p: 0, overflow: 'auto' }}>
                    {currentResourceIndex !== null && tempAlertMetaData["Database"][currentResourceIndex] && (
                        <>
                            <Box sx={{ p: 2, borderBottom: '1px solid #f0f0f0' }}>
                                <Typography variant="subtitle2" sx={{ fontSize: 12, fontWeight: 600, mb: 1.5, color: '#666' }}>Add Resources</Typography>
                                <Autocomplete
                                    size="small" multiple disableCloseOnSelect options={dbFilterData}
                                    getOptionLabel={(opt) => opt.ResourceName}
                                    value={tempAlertMetaData["Database"][currentResourceIndex]["Resources"] || []}
                                    onChange={(e, val) => handleFormChange(currentResourceIndex, "Resources", val)}
                                    renderOption={(props, opt) => {
                                        const selected = tempAlertMetaData["Database"][currentResourceIndex]["Resources"]?.some(r => r.ResourceName === opt.ResourceName);
                                        return (
                                            <Box {...props} key={opt.ResourceName} sx={{ display: 'flex', justifyContent: 'space-between', py: 1, px: 1.5,
                                                bgcolor: selected ? 'rgba(0, 51, 142, 0.08)' : 'transparent',
                                                borderLeft: selected ? '3px solid #00338e' : '3px solid transparent',
                                                '&:hover': { bgcolor: selected ? 'rgba(0, 51, 142, 0.12)' : 'rgba(0,0,0,0.04)' } }}>
                                                <Typography variant="body2" sx={{ fontSize: 12, fontWeight: selected ? 600 : 400 }}>{opt.ResourceName}</Typography>
                                                <Typography variant="caption" sx={{ fontSize: 11, color: selected ? '#00338e' : 'text.secondary', fontWeight: selected ? 500 : 400 }}>{opt.ApplicationCI}</Typography>
                                            </Box>
                                        );
                                    }}
                                    renderTags={(val, getTagProps) => (
                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, maxHeight: 140, overflowY: 'auto', py: 0.5 }}>
                                            {val.map((opt, idx) => (
                                                <Chip {...getTagProps({ index: idx })} key={idx} label={opt.ResourceName} size="small" sx={{ height: 22, fontSize: 11, m: 0.25 }} />
                                            ))}
                                        </Box>
                                    )}
                                    renderInput={(params) => (
                                        <TextField {...params} placeholder="Search and select..." variant="outlined" size="small"
                                            InputProps={{ ...params.InputProps, startAdornment: (<><InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: '#999' }} /></InputAdornment>{params.InputProps.startAdornment}</>) }}
                                            sx={{ }} />
                                    )}
                                    ListboxProps={{ sx: { maxHeight: 200 } }}
                                />
                            </Box>
                            <Box sx={{ px: 2, py: 1.5 }}>
                                <Typography variant="subtitle2" sx={{ fontSize: 12, fontWeight: 600, mb: 1, color: '#666' }}>Selected Resources</Typography>
                                <List sx={{ border: '1px solid #f0f0f0', borderRadius: 1, bgcolor: '#fafafa' }}>
                                    {tempAlertMetaData["Database"][currentResourceIndex]["Resources"]?.length > 0 ? 
                                        tempAlertMetaData["Database"][currentResourceIndex]["Resources"].map((res, idx) => (
                                            <ListItem key={idx} sx={{ py: 1, px: 1.5, borderBottom: idx < tempAlertMetaData["Database"][currentResourceIndex]["Resources"].length - 1 ? '1px solid #f0f0f0' : 'none', '&:hover': { bgcolor: '#f5f5f5' } }}
                                                secondaryAction={<IconButton edge="end" size="small" onClick={() => handleFormChange(currentResourceIndex, "Resources", tempAlertMetaData["Database"][currentResourceIndex]["Resources"].filter((_, i) => i !== idx))} sx={{ color: '#d32f2f', '&:hover': { bgcolor: 'rgba(211, 47, 47, 0.08)' } }}><DeleteOutlineIcon fontSize="small" /></IconButton>}>
                                                <ListItemText primary={res.ResourceName} secondary={res.ApplicationCI} primaryTypographyProps={{ fontSize: 12, fontWeight: 500 }} secondaryTypographyProps={{ fontSize: 11 }} />
                                            </ListItem>
                                        )) : 
                                        <Box sx={{ p: 3, textAlign: 'center' }}><Typography variant="body2" sx={{ fontSize: 12, color: 'text.secondary' }}>No resources selected</Typography></Box>
                                    }
                                </List>
                            </Box>
                        </>
                    )}
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid #f0f0f0' }}>
                    <Button onClick={() => setResourceDialogOpen(false)} variant="contained" size="small" sx={{ textTransform: 'none', fontSize: 12, px: 2.5 }}>Done</Button>
                </DialogActions>
            </Dialog>
        </React.Fragment>
    );
}
