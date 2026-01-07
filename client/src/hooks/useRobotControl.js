import { useState } from 'react';
import ROSLIB from 'roslib';
import { useRos } from '../context/RosContext';

const useRobotControl = () => {
  const { ros, connected, addLog } = useRos();
  const [generatedCode, setGeneratedCode] = useState('');

  const runCode = () => {
    if (!ros || !connected) {
      alert('Not connected to ROS!');
      return;
    }
    try {
      // Execute the generated code
      // The generated code assumes 'ros' and 'ROSLIB' are available in scope
      const runBlocklyCode = new Function('ros', 'ROSLIB', 'log', generatedCode);
      runBlocklyCode(ros, ROSLIB, addLog);
      addLog('Code executed successfully');
    } catch (e) {
      console.error(e);
      addLog(`Error executing code: ${e.message}`);
    }
  };

  const resetRobot = () => {
    if (!connected) {
      alert("Not connected to ROS!");
      return;
    }

    // Stop the robot first (clear interval if any)
    if (window.rosBlockly && window.rosBlockly.interval) {
      console.log("Clearing interval (Reset):", window.rosBlockly.interval);
      clearInterval(window.rosBlockly.interval);
      window.rosBlockly.interval = null;
    }

    // Stop command
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

    // Reset Pose using Service
    const setPoseClient = new ROSLIB.Service({
      ros: ros,
      name: '/world/empty/set_pose',
      serviceType: 'ros_gz_interfaces/srv/SetEntityPose'
    });

    const request = new ROSLIB.ServiceRequest({
      entity: {
        name: 'vehicle_blue',
        type: 2 // MODEL
      },
      pose: {
        position: { x: 0, y: 0, z: 0.325 },
        orientation: { x: 0, y: 0, z: 0, w: 1 }
      }
    });

    setPoseClient.callService(request, (result) => {
      if (result.success) {
        addLog("Reset Robot Position (Success)");
      } else {
        addLog("Reset Robot Position (Failed)");
      }
    });
  };

  return {
    generatedCode,
    setGeneratedCode,
    runCode,
    resetRobot
  };
};

export default useRobotControl;
