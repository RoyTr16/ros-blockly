# Docker Architecture

This document explains the containerized architecture of the ROS Blockly project. The system is composed of four main services defined in `docker-compose.yml`.

## Service Overview

### 1. `rosbridge`
*   **Role**: Acts as the WebSocket gateway between the React frontend (running in the browser) and the ROS 2 system.
*   **Image**: `ros:jazzy-ros-core` with `rosbridge-suite` installed.
*   **Command**: Runs `rosbridge_websocket`.
*   **Ports**: Exposes `9090` for WebSocket connections.
*   **Communication**:
    *   **Frontend**: Accepts JSON messages over WebSockets.
    *   **ROS**: Converts JSON messages to ROS 2 topics/services and publishes/subscribes on the `ros_net` network.

### 2. `robot`
*   **Role**: Represents the "brain" of the robot. In a real deployment, this container would run on the physical robot. In this simulation, it runs the bridge to Gazebo.
*   **Image**: `ros:jazzy` with `ros-gz-bridge`.
*   **Command**: Runs `ros_gz_bridge parameter_bridge` to bridge topics between ROS 2 and Gazebo Transport.
    *   `/cmd_vel` (ROS) <-> `/cmd_vel` (Gazebo)
    *   `/model/vehicle_blue/odometry` (Gazebo) -> `/odom` (ROS)
    *   `/world/empty/set_pose` (ROS Service) <-> Gazebo Service
*   **Environment**:
    *   `GZ_IP=$(hostname -i)`: Dynamically sets the IP for Gazebo Transport discovery.
    *   `GZ_PARTITION=sim`: Ensures it connects to the same Gazebo partition as the simulator.

### 3. `simulator`
*   **Role**: Runs the Gazebo Harmonic simulation environment.
*   **Image**: `osrf/ros:jazzy-desktop-full` with VNC/noVNC installed.
*   **Command**: Executes `start.sh` which:
    *   Starts Xvfb (virtual display).
    *   Starts `x11vnc` and `websockify` (for browser-based viewing).
    *   Launches `gz sim` with a headless server.
    *   Spawns the robot model (`vehicle_blue`) from `robot.sdf`.
*   **Ports**: Exposes `8080` for the VNC web interface (http://localhost:8080).
*   **Environment**:
    *   `DISPLAY=:0`: For the virtual X server.
    *   `GZ_PARTITION=sim`: Matches the robot container.
    *   `GZ_IP`: Dynamically set in `start.sh`.

### 4. `client`
*   **Role**: Serves the React web application.
*   **Image**: Node.js based (built from `./client`).
*   **Ports**: Exposes `5173` (Vite dev server).
*   **Volumes**: Mounts `./client` to `/app` for hot-reloading during development.

## Networking & Communication

### Docker Network (`ros_net`)
All services are connected to a custom bridge network `ros_net`. This allows them to communicate using their service names as hostnames.

### ROS 2 Discovery
*   **Mechanism**: Multicast (default DDS).
*   **Configuration**: `ROS_DOMAIN_ID=0` is set on all ROS-aware containers (`robot`, `simulator`, `rosbridge`) to ensure they are on the same logical network.

### Gazebo Transport Discovery
*   **Challenge**: Gazebo Transport needs to know the IP address of the interface to bind to for discovery across containers.
*   **Solution**: We export `GZ_IP=$(hostname -i)` in both the `robot` and `simulator` containers. This ensures they advertise their correct container IP addresses, allowing the `ros_gz_bridge` in the `robot` container to find the Gazebo server in the `simulator` container.
*   **Partition**: `GZ_PARTITION=sim` isolates the simulation topics.

## Environment Variables

| Variable | Service | Purpose |
| :--- | :--- | :--- |
| `ROS_DOMAIN_ID` | `robot`, `simulator` | Sets the ROS 2 logical network ID. Must match for nodes to discover each other. |
| `GZ_PARTITION` | `robot`, `simulator` | Sets the Gazebo Transport partition name. Must match for Gazebo nodes to discover each other. |
| `GZ_IP` | `robot`, `simulator` | **Dynamically set at runtime** (via `CMD` or `start.sh`). Explicitly sets the IP address for Gazebo Transport to bind to. Crucial for Docker networking. |
| `DISPLAY` | `simulator` | Tells GUI applications (Gazebo) which X server to use. |
