import React from 'react';
import CodeDisplay from './CodeDisplay';
import ActionButtons from './ActionButtons';
import LogViewer from './LogViewer';
import GraphViewer from './GraphViewer';
import { useRos } from '../../context/RosContext';
import './ControlPanel.css';

const ControlPanel = ({ generatedCode, onRun, onReset, onSave, onLoad }) => {
  const { logs, connected } = useRos();

  return (
    <div className="control-panel">
      <CodeDisplay code={generatedCode} />
      <ActionButtons
        connected={connected}
        onRun={onRun}
        onReset={onReset}
        onSave={onSave}
        onLoad={onLoad}
      />
      <GraphViewer />
      <LogViewer logs={logs} />
    </div>
  );
};

export default ControlPanel;
