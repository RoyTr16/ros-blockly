# Project Architecture

This document describes the architecture of the ROS Blockly Robot Control project. The system is designed to allow users to control a simulated ROS 2 robot using a visual programming interface (Blockly) running in a web browser.

## High-Level Overview

The project consists of four main services running in Docker containers, orchestrated by Docker Compose. They communicate over a shared Docker network (`ros_net`) and expose specific ports to the host machine for user interaction.

## Services & Networking

### 1. Client (Web Application)
- **Role**: Frontend User Interface.
- **Technology**: React, Vite, Google Blockly, roslibjs.
- **Networking**:
    - **Port**: `5173` (Mapped to Host).
    - **Internal**: Connects to `rosbridge` via WebSocket.
- **Communication**:
    - Sends ROS commands (JSON) to `rosbridge` via WebSocket (`ws://localhost:9090`).
    - Receives status updates from ROS.
- **Technology**: Gazebo Harmonic, `ros_gz_bridge`, Xvfb, x11vnc, noVNC.
- **Networking**:
    - **Port**: `8080` (Mapped to Host) for Web VNC.
    - **Internal**: Connects to `ros_net`.
- **Communication**:
    - **Bridge**: `ros_gz_bridge` translates ROS 2 messages (`/cmd_vel`) to Gazebo Transport messages and vice-versa.
    - **Visualization**: Runs a VNC server (`x11vnc`) and a WebSocket proxy (`websockify`) to stream the Gazebo GUI to the browser at `http://localhost:8080/vnc.html`.

## Network Diagram

```mermaid
graph TD
    User[User Browser]

    subgraph Docker Host
        subgraph "Docker Network (ros_net)"
            Client[Client Container<br/>(React App)]
            Rosbridge[Rosbridge Container<br/>(WebSocket Server)]
            Robot[Robot Container<br/>(ROS Nodes)]
            Simulator[Simulator Container<br/>(Gazebo + Bridge)]
        end
    end

    User -- "HTTP :5173" --> Client
    User -- "WebSocket :9090" --> Rosbridge
    User -- "HTTP/VNC :8080" --> Simulator

    Client -- "roslibjs" --> Rosbridge
    Rosbridge -- "ROS 2 (DDS)" --> Robot
    Rosbridge -- "ROS 2 (DDS)" --> Simulator
    Robot -- "ROS 2 (DDS)" --> Simulator
```

## Data Flow (Example: Move Robot)

1.  **User Action**: User clicks "Run Code" in the React App.
2.  **Client**:
    *   Generates JavaScript code from Blockly blocks.
    *   Executes code using `roslibjs`.
    *   Sends a JSON `publish` message to `ws://localhost:9090` for topic `/cmd_vel`.
3.  **Rosbridge**:
    *   Receives JSON.
    *   Deserializes it into a `geometry_msgs/msg/Twist` ROS 2 message.
    *   Publishes it to the `/cmd_vel` topic on the `ros_net` network.
4.  **Simulator**:
    *   `ros_gz_bridge` subscribes to `/cmd_vel` (ROS).
    *   Translates it to `gz.msgs.Twist` (Gazebo).
    *   Gazebo applies the velocity to the robot model (`vehicle_blue`).
    *   The robot moves in the simulation.
5.  **Feedback**:
    *   Gazebo physics updates the robot pose.
    *   `ros_gz_bridge` publishes `/model/vehicle_blue/odometry` (ROS).
    *   Rosbridge receives this and forwards it to the Client (if subscribed).
