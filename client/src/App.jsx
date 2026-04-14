import React, { useRef, useState, useCallback } from 'react';
import BlocklyComponent from './components/blockly/BlocklyComponent';
import Header from './components/ui/Header';
import ControlPanel from './components/ui/ControlPanel';
import GraphOverlay from './components/ui/GraphViewer';
import { RosProvider } from './context/RosContext';
import useRobotControl from './hooks/useRobotControl';
import './App.css';

const AppContent = () => {
  const { generatedCode, setGeneratedCode, runCode, stopExecution, running, resetRobot } = useRobotControl();
  const blocklyRef = useRef(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const handleCodeChange = (code) => {
    setGeneratedCode(code);
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
        </div>
      </div>

      {panelOpen && (
        <ControlPanel
          generatedCode={generatedCode}
          blocklyRef={blocklyRef}
          onClose={() => setPanelOpen(false)}
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
