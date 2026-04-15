import { useState, useRef } from 'react';
import ROSLIB from 'roslib';
import { useRos } from '../context/RosContext';
import { getAllResetActions } from '../packages/PackageLoader';

const useRobotControl = () => {
  const { ros, connected, addLog } = useRos();
  const [generatedCode, setGeneratedCode] = useState('');
  const [codeGroups, setCodeGroups] = useState([]);
  const [preamble, setPreamble] = useState('');
  const [running, setRunning] = useState(false);
  const abortRef = useRef(null);
  // Keep refs in sync with state so runCode always reads fresh values
  const codeGroupsRef = useRef(codeGroups);
  const preambleRef = useRef(preamble);
  const generatedCodeRef = useRef(generatedCode);
  codeGroupsRef.current = codeGroups;
  preambleRef.current = preamble;
  generatedCodeRef.current = generatedCode;

  const stopExecution = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setRunning(false);
    addLog('Execution stopped');
  };

  const runCode = () => {
    if (!ros || !connected) {
      alert('Not connected to ROS!');
      return;
    }
    try {
      // Abort any previous run
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const abortController = new AbortController();
      abortRef.current = abortController;
      setRunning(true);

      // Record start time for elapsed-time blocks
      if (!window.rosBlockly) window.rosBlockly = {};
      window.rosBlockly.startTime = Date.now();

      // Reset multi-instance ID counters so each run starts from 0
      window.rosBlockly._usNextId = 0;
      window.rosBlockly._rgbNextId = 0;

      // Unsubscribe any leftover ultrasonic subscriptions from previous runs
      if (window.rosBlockly._usSubs) {
        Object.values(window.rosBlockly._usSubs).forEach(s => s.unsubscribe());
        window.rosBlockly._usSubs = {};
      }

      // Helper function for waiting — checks abort signal
      const signal = abortController.signal;
      const wait = (seconds) => new Promise((resolve, reject) => {
        if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
        const timer = setTimeout(resolve, seconds * 1000);
        signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
      });

      // Execute the generated code inside an async wrapper
      // If there are multiple disconnected groups, run them concurrently with Promise.all
      // The generated code assumes 'ros', 'ROSLIB', 'log', and 'wait' are available
      let asyncCode;
      const currentGroups = codeGroupsRef.current;
      const currentPreamble = preambleRef.current;
      const currentCode = generatedCodeRef.current;
      console.log(`[RunCode] codeGroups: ${currentGroups.length}, preamble length: ${currentPreamble.length}`);
      if (currentGroups.length > 1) {
        console.log('[RunCode] Running', currentGroups.length, 'groups concurrently');
        // Run disconnected block groups concurrently
        // Preamble contains shared variable declarations and function definitions
        const groupsCode = currentGroups.map((g, i) => `
          async function __group${i}__() {
            ${g}
          }
        `).join('\n');
        const allPromises = currentGroups.map((_, i) => `__group${i}__()`).join(', ');
        asyncCode = `
          return (async () => {
            try {
              ${currentPreamble}
              ${groupsCode}
              await Promise.all([${allPromises}]);
            } catch (err) {
              if (err.name === 'AbortError') return;
              console.error(err);
              log('Error: ' + err.message);
            }
          })();
        `;
      } else {
        asyncCode = `
          return (async () => {
            try {
              ${currentCode}
            } catch (err) {
              if (err.name === 'AbortError') return;
              console.error(err);
              log('Error: ' + err.message);
            }
          })();
        `;
      }

      const runBlocklyCode = new Function('ros', 'ROSLIB', 'log', 'wait', asyncCode);
      const promise = runBlocklyCode(ros, ROSLIB, addLog, wait);
      if (promise && promise.then) {
        promise.then(() => {
          if (!signal.aborted) setRunning(false);
        });
      }
      addLog('Code executed successfully');
    } catch (e) {
      console.error(e);
      addLog(`Error executing code: ${e.message}`);
      setRunning(false);
    }
  };

  const resetRobot = () => {
    if (!connected) {
      alert("Not connected to ROS!");
      return;
    }

    // Stop any running execution
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setRunning(false);
    }

    // Clear interval-based movement
    if (window.rosBlockly && window.rosBlockly.interval) {
      clearInterval(window.rosBlockly.interval);
      window.rosBlockly.interval = null;
    }

    // Clear graph data
    if (window.rosBlockly) {
      window.rosBlockly.graphs = {};
      if (window.rosBlockly.onGraphUpdate) {
        window.rosBlockly.onGraphUpdate();
      }
    }

    // Unsubscribe all ultrasonic subscriptions
    if (window.rosBlockly && window.rosBlockly._usSubs) {
      Object.values(window.rosBlockly._usSubs).forEach(s => s.unsubscribe());
      window.rosBlockly._usSubs = {};
    }
    if (window.rosBlockly && window.rosBlockly.ultrasonicSub) {
      window.rosBlockly.ultrasonicSub.unsubscribe();
      window.rosBlockly.ultrasonicSub = null;
    }

    // Execute all package-defined reset actions
    const actions = getAllResetActions();
    for (const action of actions) {
      if (action.topic) {
        const topic = new ROSLIB.Topic({
          ros: ros,
          name: action.topic,
          messageType: action.type,
        });
        topic.publish(new ROSLIB.Message(action.data));
        addLog(`Reset: published to ${action.topic}`);
      } else if (action.service) {
        const client = new ROSLIB.Service({
          ros: ros,
          name: action.service,
          serviceType: action.type,
        });
        client.callService(new ROSLIB.ServiceRequest(action.request), (result) => {
          if (result.success) {
            addLog(`Reset: ${action.service} (Success)`);
          }
        });
      }
    }

    addLog('Reset complete');
  };

  return {
    generatedCode,
    setGeneratedCode,
    setCodeGroups,
    setPreamble,
    runCode,
    stopExecution,
    running,
    resetRobot
  };
};

export default useRobotControl;
