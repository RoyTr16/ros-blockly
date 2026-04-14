import React from 'react';
import { useRos } from '../../context/RosContext';
import './Header.css';

const Header = ({ onRun, onReset, onSave, onLoad, panelOpen, onTogglePanel }) => {
  const { connected } = useRos();

  return (
    <header className="app-header">
      <h1>ROS Blockly Control</h1>

      <div className="header-actions">
        <button
          className={`header-btn header-btn-run ${!connected ? 'disabled' : ''}`}
          onClick={onRun}
          disabled={!connected}
          title="Run Code"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          Run
        </button>
        <button
          className={`header-btn header-btn-reset ${!connected ? 'disabled' : ''}`}
          onClick={onReset}
          disabled={!connected}
          title="Reset Robot"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 1 9 9"/><path d="M3 21v-6h6"/></svg>
          Reset
        </button>

        <div className="header-separator" />

        <button className="header-btn header-btn-save" onClick={onSave} title="Save Program">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          Save
        </button>
        <button className="header-btn header-btn-load" onClick={onLoad} title="Load Program">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          Load
        </button>
      </div>

      <div className="header-right">
        <div className="status-container">
          <span className={`status-indicator ${connected ? 'connected' : 'disconnected'}`}>
            {connected ? 'CONNECTED' : 'DISCONNECTED'}
          </span>
        </div>
        <button
          className={`header-btn header-btn-panel ${panelOpen ? 'active' : ''}`}
          onClick={onTogglePanel}
          title={panelOpen ? 'Close Panel' : 'Open Panel'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="15" y1="3" x2="15" y2="21"/>
          </svg>
        </button>
      </div>
    </header>
  );
};

export default Header;
