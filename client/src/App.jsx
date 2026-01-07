import React, { useState, useEffect } from 'react';
import ROSLIB from 'roslib';
import BlocklyComponent from './components/BlocklyComponent';
import './generators/ros_generator'; // Import generator
import './App.css';

function App() {
  const [connected, setConnected] = useState(false);
  const [ros, setRos] = useState(null);
  const [generatedCode, setGeneratedCode] = useState('');
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    // Clean up any existing interval from previous mounts (hot reload fix)
    if (window.rosBlockly && window.rosBlockly.interval) {
      console.log("Mounting: Clearing existing interval", window.rosBlockly.interval);
      clearInterval(window.rosBlockly.interval);
    }

    // Initialize global state
    window.rosBlockly = {
      interval: null
    };

    // Connect to ROS
    const rosConnection = new ROSLIB.Ros({
      url: 'ws://localhost:9090', // Connect to rosbridge
    });

    rosConnection.on('connection', () => {
      console.log('Connected to websocket server.');
      setConnected(true);
      addLog('Connected to ROS');
    });

    rosConnection.on('error', (error) => {
      console.log('Error connecting to websocket server: ', error);
      setConnected(false);
      addLog('Error connecting to ROS');
    });

    rosConnection.on('close', () => {
      console.log('Connection to websocket server closed.');
      setConnected(false);
      addLog('Disconnected from ROS');
    });

    setRos(rosConnection);

    return () => {
        // Cleanup on unmount
        if (window.rosBlockly && window.rosBlockly.interval) {
            console.log("Unmounting: Clearing interval", window.rosBlockly.interval);
            clearInterval(window.rosBlockly.interval);
            window.rosBlockly.interval = null;
        }
        if(rosConnection) rosConnection.close();
    };
  }, []);

  const addLog = (msg) => {
      setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  const handleCodeChange = (code) => {
      setGeneratedCode(code);
  };

  const runCode = () => {
      if (!ros || !connected) {
          alert('Not connected to ROS!');
          return;
      }
      try {
          // Execute the generated code
          // The generated code assumes 'ros' and 'ROSLIB' are available in scope
          // We wrap it in a function to provide these
          const runBlocklyCode = new Function('ros', 'ROSLIB', 'log', generatedCode);
          runBlocklyCode(ros, ROSLIB, addLog);
          addLog('Code executed successfully');
      } catch (e) {
          console.error(e);
          addLog(`Error executing code: ${e.message}`);
      }
  };

  const handleReset = () => {
    if (!connected) {
      alert("Not connected to ROS!");
      return;
    }

    // Stop the robot first (clear interval if any)
    if (window.rosBlockly && window.rosBlockly.interval) {
      console.log("Clearing interval (Reset):", window.rosBlockly.interval);
      clearInterval(window.rosBlockly.interval);
      window.rosBlockly.interval = null;
    } else {
      console.log("No interval to clear (Reset)");
    }

    const cmdVel = new ROSLIB.Topic({
      ros: ros,
      name: '/cmd_vel',
      messageType: 'geometry_msgs/msg/Twist'
    });
    const stopTwist = new ROSLIB.Message({
      linear: { x: 0, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 }
    });
    cmdVel.publish(stopTwist);

    // Reset Pose
    const poseTopic = new ROSLIB.Topic({
      ros: ros,
      name: '/model/vehicle_blue/pose',
      messageType: 'geometry_msgs/msg/Pose'
    });

    const resetPose = new ROSLIB.Message({
      position: { x: 0, y: 0, z: 0.325 },
      orientation: { x: 0, y: 0, z: 0, w: 1 }
    });

    poseTopic.publish(resetPose);
    addLog("Reset Robot Position");
  };

  return (
    <div className="App" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header style={{ padding: '10px', backgroundColor: '#282c34', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>ROS Blockly Control</h1>
        <div>
            Status: <span style={{ color: connected ? 'green' : 'red', fontWeight: 'bold' }}>
                {connected ? 'CONNECTED' : 'DISCONNECTED'}
            </span>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1 }}>
        <div style={{ flex: 2, borderRight: '1px solid #ccc' }}>
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
        <div style={{ flex: 1, padding: '10px', display: 'flex', flexDirection: 'column' }}>
            <h3>Generated Code</h3>
            <textarea
                value={generatedCode}
                readOnly
                style={{ width: '100%', height: '200px', fontFamily: 'monospace' }}
            />
            <button
                onClick={runCode}
                style={{
                    marginTop: '10px',
                    padding: '10px',
                    fontSize: '16px',
                    backgroundColor: connected ? '#4CAF50' : '#ccc',
                    color: 'white',
                    border: 'none',
                    cursor: connected ? 'pointer' : 'not-allowed'
                }}
                disabled={!connected}
            >
                Run Code
            </button>
            <button
                onClick={handleReset}
                style={{
                    marginTop: '10px',
                    padding: '10px',
                    fontSize: '16px',
                    backgroundColor: connected ? '#f44336' : '#ccc',
                    color: 'white',
                    border: 'none',
                    cursor: connected ? 'pointer' : 'not-allowed'
                }}
                disabled={!connected}
            >
                Reset Robot
            </button>

            <h3>Logs</h3>
            <div style={{ flex: 1, border: '1px solid #ccc', padding: '5px', overflowY: 'auto', backgroundColor: '#f0f0f0', color: '#333' }}>
                {logs.map((log, i) => <div key={i} style={{ color: 'black' }}>{log}</div>)}
            </div>
        </div>
      </div>
    </div>
  );
}

export default App;
