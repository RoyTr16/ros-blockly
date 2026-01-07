import React from 'react';
import { useRos } from '../../context/RosContext';
import './Header.css';

const Header = () => {
  const { connected } = useRos();

  return (
    <header className="app-header">
      <h1>ROS Blockly Control</h1>
      <div className="status-container">
        Status:
        <span className={`status-indicator ${connected ? 'connected' : 'disconnected'}`}>
          {connected ? 'CONNECTED' : 'DISCONNECTED'}
        </span>
      </div>
    </header>
  );
};

export default Header;
