import React from 'react';
import '../styles/StatusBar.css';

function StatusBar({ message }) {
  return (
    <div className="status-bar">
      <div className="status-message">{message}</div>
    </div>
  );
}

export default StatusBar;
