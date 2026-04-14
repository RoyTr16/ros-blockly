import React, { useState, useEffect, useCallback } from 'react';
import {
  getSavedFunctions,
  deleteFunction,
  loadFunction,
  importFunctionFile,
} from '../../functions/FunctionLibrary';
import './FunctionPanel.css';

const FunctionPanel = ({ blocklyRef }) => {
  const [functions, setFunctions] = useState([]);

  const refresh = useCallback(() => {
    setFunctions(getSavedFunctions());
  }, []);

  useEffect(() => {
    refresh();
    // Listen for custom event from context menu actions
    window.addEventListener('functionLibraryChanged', refresh);
    return () => window.removeEventListener('functionLibraryChanged', refresh);
  }, [refresh]);

  const handleLoad = (func) => {
    const ws = blocklyRef.current?.getWorkspace?.();
    if (ws) {
      loadFunction(ws, func);
    }
  };

  const handleDelete = (name) => {
    deleteFunction(name);
    refresh();
  };

  const handleImport = async () => {
    const ws = blocklyRef.current?.getWorkspace?.();
    if (ws) {
      await importFunctionFile(ws);
      refresh();
    }
  };

  return (
    <div className="function-panel">
      <div className="function-panel-header">
        <span className="function-panel-title">My Functions</span>
        <button className="function-panel-import" onClick={handleImport} title="Import .func.json">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Import
        </button>
      </div>
      {functions.length === 0 ? (
        <div className="function-panel-empty">
          No saved functions yet. Right-click a function definition block to save it to your library.
        </div>
      ) : (
        <div className="function-panel-list">
          {functions.map((f) => (
            <div key={f.name} className="function-item">
              <div className="function-item-info">
                <span className="function-item-name">{f.name}</span>
                <span className="function-item-meta">
                  {f.params.length > 0 ? f.params.join(', ') : 'no params'}
                  {f.hasReturn ? ' → returns' : ''}
                </span>
              </div>
              <div className="function-item-actions">
                <button onClick={() => handleLoad(f)} title="Add to workspace">Use</button>
                <button onClick={() => handleDelete(f.name)} title="Remove from library" className="delete">×</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FunctionPanel;
