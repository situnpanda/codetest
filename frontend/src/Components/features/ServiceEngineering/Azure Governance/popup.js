import React, { useState } from 'react';
import TableCell from '@mui/material/TableCell';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import { styled } from '@mui/material/styles';
import TextField from '@mui/material/TextField';

const StyledPopupContainer = styled('div')({
  display: 'flex',
  justifyContent: 'center',
  flexDirection: 'column',
  alignItems: 'center',
  minHeight: '100%',
});

const StyledPopupCard = styled('div')({
  width: '500px',
  height: '580px',
  backgroundColor: 'white',
  borderRadius: '8px',
  boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
  display: 'flex',
});

const StyledLeftPane = styled('div')({
  flex: 1,
  backgroundColor: '#f0f0f0', 
  borderTopLeftRadius: '8px',
  borderBottomLeftRadius: '8px',
  display: 'flex',
  padding: '20px',
  gridTemplateColumns: 'auto 5fr', // Label column and TextField column
  gap: '30px', 
  justifyContent: 'center',
  alignItems: 'center',
});

const LabelTextFieldWrapper = styled('div')({
    display: 'flex',
    alignItems: 'center',
    marginBottom: '5px',
  });
  
  const Label = styled('div')({
    marginRight: '20px',
    minWidth: '120px', 
    fontWeight: 'bold',
  });

// const StyledRightPane = styled('div')({
//   flex: 1,
//   backgroundColor: '#ffffff', 
//   borderTopRightRadius: '8px',
//   borderBottomRightRadius: '8px',
//   display: 'flex',
//   justifyContent: 'center',
//   alignItems: 'center',
// });


const PopupButton = ({ rowData, index, color}) => {
    const [open, setOpen] = useState(false);
    //console.log('rowData:', rowData[index]);
    
  const handleOpen = () => {
    setOpen(true);
    
  };

  const handleClose = () => {
    setOpen(false);
  };
  const buttonStyles = {
    padding: '2px 4px', 
    minWidth: 'auto', 
    fontSize: '0.75rem', 
  };

  return (
    <>
      <TableCell>
        <Button variant="contained" color="primary" onClick={handleOpen} style={buttonStyles}>
          Remediate
        </Button>
      </TableCell>
      <Dialog open={open} onClose={handleClose} aria-labelledby="popup-card-title">
        <DialogContent>
          <StyledPopupContainer>
            <StyledPopupCard>
              <StyledLeftPane>
                <ul>
                <LabelTextFieldWrapper>
                  <Label>Resource Name:</Label>
                  <TextField defaultValue={rowData.name[index] || ''}fullWidth size="small" disabled={color.name == 'enabled'}/>
                </LabelTextFieldWrapper>
                <LabelTextFieldWrapper> 
                  <Label>Application ID:</Label>
                  <TextField defaultValue= {rowData.applicationId[index] || '-'}fullWidth size="small" disabled={color.applicationId == 'enabled'}/>
                </LabelTextFieldWrapper>
                <LabelTextFieldWrapper>
                  <Label>Support Group:</Label>
                  <TextField defaultValue= {rowData.supportGroup[index] || '-'}fullWidth size="small" disabled={color.supportGroup === 'enabled'}/>
                </LabelTextFieldWrapper>
                <LabelTextFieldWrapper>
                  <Label>Cost Center Tag:</Label>
                  <TextField defaultValue= {rowData.costCenter[index] || '-'}fullWidth size="small" disabled={color.costCenter === 'enabled'}/>
                </LabelTextFieldWrapper>
                <LabelTextFieldWrapper>
                  <Label>App Family:</Label>
                  <TextField defaultValue={rowData.appFamily[index] || '-'}fullWidth size="small" disabled={color.appFamily === 'enabled'}/>
                </LabelTextFieldWrapper>
                <LabelTextFieldWrapper>
                  <Label>Application CI:</Label>
                  <TextField defaultValue= {rowData.applicationCI[index] || '-'}fullWidth size="small" disabled={color.applicationCI === 'enabled'}/>
                </LabelTextFieldWrapper>
                <LabelTextFieldWrapper>
                  <Label>Backup Type:</Label>
                  <TextField defaultValue={rowData.backupType[index] || '-'}fullWidth size="small" disabled={color.backupType === 'enabled'}/>
                </LabelTextFieldWrapper>
                <LabelTextFieldWrapper>
                  <Label>Maintenance Status:</Label>
                  <TextField defaultValue={rowData.maintenanceStatus[index] || ''} fullWidth size="small" disabled={color.maintenanceStatus === 'enabled'} />
                </LabelTextFieldWrapper>
                <LabelTextFieldWrapper>
                  <Label>Maintenance Window:</Label>
                  <TextField defaultValue={rowData.maintenanceWindow[index] || ''} fullWidth size="small" disabled={color.maintenanceWindow === 'enabled'}/>
                </LabelTextFieldWrapper>
                <LabelTextFieldWrapper>
                  <Label>Managed By Group:</Label>
                  <TextField defaultValue={rowData.managedBy[index] || ''} fullWidth size="small" disabled={color.managedBy === 'enabled'}/>
                </LabelTextFieldWrapper>
                <LabelTextFieldWrapper>
                  <Label>Environment Tag:</Label>
                  <TextField defaultValue={rowData.environment[index] || ''} fullWidth size="small" disabled={color.environment === 'enabled'}/>
                </LabelTextFieldWrapper>
                </ul>
              </StyledLeftPane>
              {/* <StyledRightPane>
              <ul>
              </ul>
              </StyledRightPane> */}
            </StyledPopupCard>
          </StyledPopupContainer>
          <StyledPopupContainer style={{ justifyContent: 'flex-end', marginTop: '10px' }}>
            <Button variant="contained" color="primary" >
              Update
            </Button>
          </StyledPopupContainer>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PopupButton;
