# ROSLIBJS Concepts & Networking

This document explains how `roslibjs` is used to communicate between a web browser (React App) and a ROS 2 system running in Docker.

## 1. Overview

**roslibjs** is a JavaScript library that allows web browsers to talk to ROS. Since browsers cannot speak native TCP/UDP (which ROS uses), `roslibjs` communicates via **WebSockets** to a bridge server called `rosbridge_server`.

## 2. Networking Flow

The communication pipeline works as follows:

1.  **Browser (Client)**:
    *   Runs the React App.
    *   Uses `roslibjs` to create a WebSocket connection.
    *   Sends JSON messages (e.g., `{ "op": "publish", "topic": "/cmd_vel", ... }`).
    *   **URL**: `ws://localhost:9090` (mapped to the host).

2.  **Rosbridge Server (Docker Container)**:
    *   Listens on port 9090.
    *   Receives the JSON message from the browser.
    *   Deserializes it into a native ROS 2 message (e.g., `geometry_msgs/msg/Twist`).
    *   Publishes this message to the ROS network.

3.  **ROS Robot / Simulator (Docker Container)**:
    *   Subscribes to the ROS topic (e.g., `/cmd_vel`).
    *   Receives the native ROS message and executes the command.

## 3. Core Concepts & Usage

### A. Connecting to ROS
The entry point is the `ROS` object. It manages the WebSocket connection.

```javascript
const ros = new ROSLIB.Ros({
  url: 'ws://localhost:9090'
});

ros.on('connection', () => {
  console.log('Connected to websocket server.');
});

ros.on('error', (error) => {
  console.log('Error connecting to websocket server: ', error);
});
```

### B. Topics (Publish/Subscribe)
Topics are used for streaming data (e.g., robot velocity, sensor readings).

**Publishing (Sending Data):**
To move the robot, we publish to `/cmd_vel`.

```javascript
// 1. Define the Topic
const cmdVel = new ROSLIB.Topic({
  ros: ros,
  name: '/cmd_vel',
  messageType: 'geometry_msgs/msg/Twist'
});

// 2. Create the Message
const twist = new ROSLIB.Message({
  linear: { x: 0.5, y: 0, z: 0 },
  angular: { x: 0, y: 0, z: 0 }
});

// 3. Publish
cmdVel.publish(twist);
```

**Subscribing (Receiving Data):**
To read the robot's position, we subscribe to `/odom`.

```javascript
const odom = new ROSLIB.Topic({
  ros: ros,
  name: '/odom',
  messageType: 'nav_msgs/msg/Odometry'
});

odom.subscribe((message) => {
  console.log('Received message on ' + odom.name + ': ' + message);
  // Don't forget to unsubscribe when done to save bandwidth!
  // odom.unsubscribe();
});
```

### C. Services (Request/Response)
Services are used for synchronous actions (e.g., "Reset Simulation").

```javascript
// 1. Define the Client
const resetClient = new ROSLIB.Service({
  ros: ros,
  name: '/world/empty/set_pose', // Service name
  serviceType: 'ros_gz_interfaces/srv/SetEntityPose' // Service Type
});

// 2. Create the Request
const request = new ROSLIB.ServiceRequest({
  entity: {
    name: 'vehicle_blue',
    type: 2 // MODEL
  },
  pose: {
    position: { x: 0, y: 0, z: 0.5 },
    orientation: { x: 0, y: 0, z: 0, w: 1 }
  }
});

// 3. Call the Service
resetClient.callService(request, (result) => {
  console.log('Result for service call on ' + resetClient.name + ': ' + result);
});
```

## 4. Common Pitfalls

*   **CORS / Connection Refused**: Ensure the `rosbridge` container exposes port 9090 and that the browser can reach `localhost:9090`.
*   **Message Types**: The `messageType` (e.g., `geometry_msgs/msg/Twist`) MUST match exactly what the ROS system expects.
*   **Topic Names**: Ensure topic names match (use `ros2 topic list` in the container to verify).
