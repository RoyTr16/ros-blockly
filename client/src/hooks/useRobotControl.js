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
      // Record start time for elapsed-time blocks
      if (!window.rosBlockly) window.rosBlockly = {};
      window.rosBlockly.startTime = Date.now();

      // Helper function for waiting
      const wait = (seconds) => new Promise(resolve => setTimeout(resolve, seconds * 1000));

      // Execute the generated code inside an async wrapper
      // The generated code assumes 'ros', 'ROSLIB', 'log', and 'wait' are available
      const asyncCode = `
        (async () => {
          try {
            ${generatedCode}
          } catch (err) {
            console.error(err);
            log('Error: ' + err.message);
          }
        })();
      `;

      const runBlocklyCode = new Function('ros', 'ROSLIB', 'log', 'wait', asyncCode);
      runBlocklyCode(ros, ROSLIB, addLog, wait);
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

    // Clear graph data
    if (window.rosBlockly) {
      window.rosBlockly.graphData = null;
      if (window.rosBlockly.onGraphUpdate) {
        window.rosBlockly.onGraphUpdate(null);
      }
    }

    // Unsubscribe ultrasonic sensor and disable it
    if (window.rosBlockly && window.rosBlockly.ultrasonicSub) {
      window.rosBlockly.ultrasonicSub.unsubscribe();
      window.rosBlockly.ultrasonicSub = null;
    }
    const ultrasonicConfig = new ROSLIB.Topic({
      ros: ros,
      name: '/esp32/ultrasonic_config',
      messageType: 'std_msgs/msg/Int32'
    });
    ultrasonicConfig.publish(new ROSLIB.Message({ data: 0 }));

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
        addLog("Reset Vehicle Position (Success)");
      } else {
        // Only log failure if we expected a vehicle (could be running UR5)
        // addLog("Reset Vehicle Position (Failed)");
      }
    });

    // Reset UR5 (Move to Home)
    const ur5Topic = new ROSLIB.Topic({
      ros: ros,
      name: '/ur5/trajectory',
      messageType: 'trajectory_msgs/msg/JointTrajectory'
    });

    const homePoint = new ROSLIB.Message({
      joint_names: [
        'ur5_rg2::shoulder_pan_joint', 'ur5_rg2::shoulder_lift_joint', 'ur5_rg2::elbow_joint',
        'ur5_rg2::wrist_1_joint', 'ur5_rg2::wrist_2_joint', 'ur5_rg2::wrist_3_joint'
      ],
      points: [{
        positions: [0, 0, 0, 0, 0, 0], // All zeros as requested
        time_from_start: { sec: 2, nanosec: 0 }
      }]
    });

    ur5Topic.publish(homePoint);
    addLog("Sent UR5 Home Command");
  };

  return {
    generatedCode,
    setGeneratedCode,
    runCode,
    resetRobot
  };
};

export default useRobotControl;
