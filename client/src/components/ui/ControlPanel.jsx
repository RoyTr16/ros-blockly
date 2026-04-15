import React, { useState } from 'react';
import CodeDisplay from './CodeDisplay';
import LogViewer from './LogViewer';
import FunctionPanel from './FunctionPanel';
import AiChat from './AiChat';
import { useRos } from '../../context/RosContext';
import './ControlPanel.css';

const ControlPanel = ({ generatedCode, blocklyRef, onClose, onPreviewChange }) => {
  const { logs } = useRos();
  const [tab, setTab] = useState('chat');

  return (
    <div className="control-panel">
      <div className="panel-header">
        <div className="panel-tabs">
          <button
            className={`panel-tab ${tab === 'chat' ? 'active' : ''}`}
            onClick={() => setTab('chat')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/><line x1="10" y1="22" x2="14" y2="22"/></svg>
            AI Chat
          </button>
          <button
            className={`panel-tab ${tab === 'console' ? 'active' : ''}`}
            onClick={() => setTab('console')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
            Console
          </button>
        </div>
        <button className="panel-close-btn" onClick={onClose} title="Close Panel">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="13 17 18 12 13 7"/>
            <line x1="6" y1="12" x2="18" y2="12"/>
          </svg>
        </button>
      </div>

      {tab === 'chat' ? (
        <AiChat blocklyRef={blocklyRef} generatedCode={generatedCode} onPreviewChange={onPreviewChange} />
      ) : (
        <div className="panel-console-content">
          <CodeDisplay code={generatedCode} />
          <FunctionPanel blocklyRef={blocklyRef} />
          <LogViewer logs={logs} />
        </div>
      )}
    </div>
  );
};

export default ControlPanel;
