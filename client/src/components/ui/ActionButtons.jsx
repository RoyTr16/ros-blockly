import React from 'react';
import './ActionButtons.css';

const ActionButtons = ({ connected, onRun, onReset }) => {
  return (
    <div className="action-buttons-container">
      <button
        className={`btn btn-run ${!connected ? 'disabled' : ''}`}
        onClick={onRun}
        disabled={!connected}
      >
        Run Code
      </button>
      <button
        className={`btn btn-reset ${!connected ? 'disabled' : ''}`}
        onClick={onReset}
        disabled={!connected}
      >
        Reset Robot
      </button>
    </div>
  );
};

export default ActionButtons;
