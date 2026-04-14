import React from 'react';
import CodeDisplay from './CodeDisplay';
import LogViewer from './LogViewer';
import { useRos } from '../../context/RosContext';
import './ControlPanel.css';

const ControlPanel = ({ generatedCode, open, onClose }) => {
  const { logs } = useRos();

  return (
    <div className={`control-panel ${open ? 'open' : ''}`}>
      <div className="panel-header">
        <span className="panel-title">Console</span>
        <button className="panel-close-btn" onClick={onClose} title="Close Panel">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="13 17 18 12 13 7"/>
            <line x1="6" y1="12" x2="18" y2="12"/>
          </svg>
        </button>
      </div>
      <CodeDisplay code={generatedCode} />
      <LogViewer logs={logs} />
    </div>
  );
};

export default ControlPanel;
