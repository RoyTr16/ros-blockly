import React, { useRef, useState, useCallback } from 'react';
import BlocklyComponent from './components/blockly/BlocklyComponent';
import Header from './components/ui/Header';
import ControlPanel from './components/ui/ControlPanel';
import GraphOverlay from './components/ui/GraphViewer';
import { RosProvider } from './context/RosContext';
import useRobotControl from './hooks/useRobotControl';
import './App.css';

const AppContent = () => {
  const { generatedCode, setGeneratedCode, setCodeGroups, setPreamble, runCode, stopExecution, running, resetRobot } = useRobotControl();
  const blocklyRef = useRef(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [previewActive, setPreviewActive] = useState(false);

  const handleCodeChange = (code, groups, preamble) => {
    setGeneratedCode(code);
    if (groups) setCodeGroups(groups);
    if (preamble !== undefined) setPreamble(preamble);
  };

  const handleSave = useCallback(() => blocklyRef.current?.save(), []);
  const handleLoad = useCallback(() => blocklyRef.current?.load(), []);

  return (
    <div className="App">
      <Header
        onRun={runCode}
        onStop={stopExecution}
        onReset={resetRobot}
        running={running}
        onSave={handleSave}
        onLoad={handleLoad}
        panelOpen={panelOpen}
        onTogglePanel={() => setPanelOpen(o => !o)}
      />

      <div className="main-content">
        <div className="blockly-container">
            <BlocklyComponent
                ref={blocklyRef}
                readOnly={false}
                trashcan={true}
                media={'https://blockly-demo.appspot.com/static/media/'}
                move={{
                    scrollbars: true,
                    drag: true,
                    wheel: true
                }}
                initialXml={`<xml xmlns="http://www.w3.org/1999/xhtml"></xml>`}
                onCodeChange={handleCodeChange}
            />
            <GraphOverlay blocklyRef={blocklyRef} />
            {previewActive && (
              <div className="blockly-preview-overlay">
                <span className="blockly-preview-badge">PREVIEW</span>
              </div>
            )}
        </div>
      </div>

      {panelOpen && (
        <ControlPanel
          generatedCode={generatedCode}
          blocklyRef={blocklyRef}
          onClose={() => setPanelOpen(false)}
          onPreviewChange={setPreviewActive}
        />
      )}
    </div>
  );
};

function App() {
  return (
    <RosProvider>
      <AppContent />
    </RosProvider>
  );
}

export default App;
