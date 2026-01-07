import React, { createContext, useState, useEffect, useContext } from 'react';
import ROSLIB from 'roslib';

const RosContext = createContext();

export const useRos = () => useContext(RosContext);

export const RosProvider = ({ children }) => {
  const [connected, setConnected] = useState(false);
  const [ros, setRos] = useState(null);
  const [logs, setLogs] = useState([]);

  const addLog = (msg) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  useEffect(() => {
    // Initialize global state for interval management
    if (!window.rosBlockly) {
      window.rosBlockly = { interval: null };
    }

    // Connect to ROS
    const rosConnection = new ROSLIB.Ros({
      url: 'ws://localhost:9090',
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
      if (rosConnection) rosConnection.close();
      // Cleanup interval on unmount
      if (window.rosBlockly && window.rosBlockly.interval) {
        clearInterval(window.rosBlockly.interval);
        window.rosBlockly.interval = null;
      }
    };
  }, []);

  return (
    <RosContext.Provider value={{ ros, connected, logs, addLog }}>
      {children}
    </RosContext.Provider>
  );
};
