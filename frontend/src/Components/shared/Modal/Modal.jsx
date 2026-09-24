import React from 'react';

const Modal = ({ children, onClose }) => {
  return (
    <div className="modal">
      <div className="modal-content">{children}</div>
      <div className="modal-overlay" onClick={onClose} />
    </div>
  );
};

export default React.memo(Modal);