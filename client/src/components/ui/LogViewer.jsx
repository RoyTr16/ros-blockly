import React, { useEffect, useRef } from 'react';
import './LogViewer.css';

const LogViewer = ({ logs }) => {
  const logsEndRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="log-viewer-container">
      <h3>Logs</h3>
      <div className="logs-list">
        {logs.length === 0 && <div className="log-empty">No logs yet...</div>}
        {logs.map((log, i) => (
          <div key={i} className="log-entry">{log}</div>
        ))}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
};

export default LogViewer;
