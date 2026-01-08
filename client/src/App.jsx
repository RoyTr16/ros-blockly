import React from 'react';
import BlocklyComponent from './components/blockly/BlocklyComponent';
import Header from './components/ui/Header';
import ControlPanel from './components/ui/ControlPanel';
import { RosProvider } from './context/RosContext';
import useRobotControl from './hooks/useRobotControl';
import './App.css';

const AppContent = () => {
  const { generatedCode, setGeneratedCode, runCode, resetRobot } = useRobotControl();

  const handleCodeChange = (code) => {
    setGeneratedCode(code);
  };

  return (
    <div className="App">
      <Header />

      <div className="main-content">
        <div className="blockly-container">
            <BlocklyComponent
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
        </div>

        <ControlPanel
          generatedCode={generatedCode}
          onRun={runCode}
          onReset={resetRobot}
        />
      </div>
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
