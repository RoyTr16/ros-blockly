import React from 'react';
import './ActionButtons.css';

const ActionButtons = ({ connected, onRun, onReset, onSave, onLoad }) => {
  return (
    <div className="action-buttons-container">
      <div className="action-row">
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
      <div className="action-row">
        <button className="btn btn-save" onClick={onSave}>Save</button>
        <button className="btn btn-load" onClick={onLoad}>Load</button>
      </div>
    </div>
  );
};

export default ActionButtons;
