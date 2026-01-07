import React from 'react';
import CodeDisplay from './CodeDisplay';
import ActionButtons from './ActionButtons';
import LogViewer from './LogViewer';
import { useRos } from '../../context/RosContext';
import './ControlPanel.css';

const ControlPanel = ({ generatedCode, onRun, onReset }) => {
  const { logs, connected } = useRos();

  return (
    <div className="control-panel">
      <CodeDisplay code={generatedCode} />
      <ActionButtons
        connected={connected}
        onRun={onRun}
        onReset={onReset}
      />
      <LogViewer logs={logs} />
    </div>
  );
};

export default ControlPanel;
