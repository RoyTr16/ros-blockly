# Docker Architecture

This document explains the containerized architecture of the ROS Blockly project. There are two Docker Compose files — one for **Linux** (`docker-compose.yml`) and one for **Windows** (`docker-compose.windows.yml`) — because Docker Desktop on Windows blocks UDP multicast (see `zenoh-network-architecture.md`).

Both files share the same core services. The Windows file adds extra services to work around the WSL2 NAT limitation.

## Profiles

Not all services start by default. Docker Compose **profiles** control which services are included:

```bash
docker compose up                              # Core only (rosbridge + client)
docker compose --profile sim up                # + simulator & robot
docker compose --profile ollama up             # + local Ollama LLM
docker compose --profile sim --profile ollama up  # all
```

On Windows, prepend `-f docker-compose.windows.yml`.

## Service Overview

### 1. `rosbridge`
*   **Role**: Acts as the WebSocket gateway between the React frontend (running in the browser) and the ROS 2 system.
*   **Image**: `ros:jazzy-ros-core` with `rosbridge-suite` and CycloneDDS installed.
*   **Command**: Runs `rosbridge_websocket`.
*   **RMW**: `rmw_cyclonedds_cpp` (set via `RMW_IMPLEMENTATION` env var).
*   **Networking**:
    *   **Linux**: Uses `network_mode: host` — the container shares the host's network stack directly. This allows DDS multicast to reach physical LAN robots without any tunnel. No explicit port mapping is needed.
    *   **Windows**: Runs on the `ros_net` bridge network and explicitly maps port `${ROSBRIDGE_PORT}:9090`.
*   **Communication**:
    *   **Frontend**: Accepts JSON messages over WebSockets on port 9090.
    *   **ROS**: Converts JSON messages to ROS 2 topics/services.

### 2. `robot` (profile: `sim`)
*   **Role**: Represents the "brain" of the robot. Runs the `ros_gz_bridge` to connect ROS 2 topics to the Gazebo simulator, and optionally starts driver nodes.
*   **Image**: `ros:jazzy` with `ros-gz-bridge`, `control-msgs`, `trajectory-msgs`.
*   **Command**: Executes `start_robot.sh` which:
    *   Sets `export GZ_IP=$(hostname -i)` for Gazebo Transport discovery.
    *   Starts `ros_gz_bridge parameter_bridge` with the config from `/app/robots/$ROBOT_MODEL/bridge.yaml`.
    *   If `ROBOT_MODEL=ur5`, also starts `action_node.py` (the trajectory driver node).
*   **Environment**:
    *   `ROBOT_MODEL`: Selects which robot config to load (default: `ur5`).
    *   `GZ_PARTITION`: Matches the simulator for Gazebo Transport discovery.
    *   `ROS_DOMAIN_ID`: Matches other ROS-aware containers.
*   **Volumes**: Mounts `./docker/robots` to `/app/robots` for bridge configs and SDF files.

### 3. `simulator` (profile: `sim`)
*   **Role**: Runs the Gazebo Harmonic simulation environment with VNC access.
*   **Image**: `osrf/ros:jazzy-desktop-full` with Xvfb, x11vnc, noVNC, and `ros-gz`.
*   **Command**: Executes `start.sh` which:
    *   Sets `export GZ_IP=$(hostname -i)` for Gazebo Transport discovery.
    *   Starts Xvfb (virtual display at `:0`).
    *   Starts Fluxbox window manager, `x11vnc`, and `websockify` (noVNC proxy).
    *   Launches `gz sim` with `empty.sdf`.
    *   Spawns the robot model from `/app/robots/$ROBOT_MODEL/robot.sdf`.
*   **Ports**: Exposes `${VNC_PORT}:8080` for the noVNC web interface.
*   **Environment**:
    *   `DISPLAY=:0`: For the virtual X server.
    *   `ROBOT_MODEL`: Selects which robot SDF to spawn (default: `vehicle_blue`).
    *   `GZ_PARTITION`: Matches the robot container.
*   **Volumes**: Mounts `./docker/robots` to `/app/robots`.

### 4. `client`
*   **Role**: Serves the React web application (Blockly interface).
*   **Image**: Node.js based (built from `./client`).
*   **Ports**: Exposes `${CLIENT_PORT}:5173` (Vite dev server).
*   **Volumes**: Mounts `./client` to `/app` for hot-reloading during development.
*   **Environment**:
    *   `VITE_GEMINI_API_KEY`: API key for Google Gemini AI integration.
    *   `VITE_OLLAMA_MODEL`: Model name for local Ollama LLM (default: `qwen3:8b`).

### 5. `ollama` (profile: `ollama`)
*   **Role**: Runs a local Ollama LLM server for the AI chat feature.
*   **Image**: `ollama/ollama`.
*   **Ports**: Exposes `${OLLAMA_PORT:-11434}:11434`.
*   **GPU**: Reserves all NVIDIA GPUs via Docker `deploy.resources`.
*   **Volumes**: Persistent `ollama_data` volume at `/root/.ollama` for downloaded models.

### 6. `zenoh-bridge` (Windows only)
*   **Role**: Tunnels DDS traffic over TCP to bypass the WSL2 multicast block. Works in tandem with a native Windows relay (`start_windows_relay.bat`).
*   **Image**: `eclipse/zenoh-bridge-ros2dds:latest`.
*   **Command**: `-e tcp/host.docker.internal:7447` — connects outward to the host relay.
*   **Network**: `ros_net`.
*   See `zenoh-network-architecture.md` for the full explanation.

### 7. `microros` (Windows only)
*   **Role**: Runs a micro-ROS agent for ESP32 microcontrollers communicating over UDP.
*   **Image**: Built from `./docker/microros` (`microros/micro-ros-agent:jazzy` + CycloneDDS).
*   **Ports**: Exposes `8888:8888/udp`.
*   **Command**: `udp4 --port 8888 -v4`.

## Networking & Communication

### Docker Network (`ros_net`)
The `ros_net` bridge network connects containers that need to communicate via ROS 2 DDS or Gazebo Transport. On **Linux**, `rosbridge` uses `network_mode: host` instead (for direct LAN multicast access) and is NOT on `ros_net`. On **Windows**, all services use `ros_net`.

### ROS 2 Discovery
*   **RMW**: CycloneDDS (`rmw_cyclonedds_cpp`) is used instead of the default FastDDS to avoid memory issues in Docker environments.
*   **Configuration**: `ROS_DOMAIN_ID` is set on ROS-aware containers (`robot`, `simulator`, `rosbridge`) to ensure they are on the same logical network.

### Gazebo Transport Discovery
*   **Challenge**: Gazebo Transport needs to know the IP address of the interface to bind to for discovery across containers.
*   **Solution**: We export `GZ_IP=$(hostname -i)` at runtime in both the `robot` and `simulator` containers. This ensures they advertise their correct container IP addresses, allowing the `ros_gz_bridge` in the `robot` container to find the Gazebo server in the `simulator` container.
*   **Partition**: `GZ_PARTITION` isolates the simulation topics.

## Environment Variables

| Variable | Service | Purpose |
| :--- | :--- | :--- |
| `ROS_DOMAIN_ID` | `rosbridge`, `robot`, `simulator`, `microros` | Sets the ROS 2 logical network ID. Must match for nodes to discover each other. |
| `RMW_IMPLEMENTATION` | `rosbridge`, `microros` | Forces CycloneDDS (`rmw_cyclonedds_cpp`). |
| `GZ_PARTITION` | `robot`, `simulator` | Sets the Gazebo Transport partition name. Must match for Gazebo nodes to discover each other. |
| `GZ_IP` | `robot`, `simulator` | **Dynamically set at runtime** (via `start_robot.sh` / `start.sh`). Explicitly sets the IP address for Gazebo Transport to bind to. Crucial for Docker networking. |
| `ROBOT_MODEL` | `robot`, `simulator` | Selects the robot configuration directory under `docker/robots/`. |
| `DISPLAY` | `simulator` | Tells GUI applications (Gazebo) which X server to use. |
| `VITE_GEMINI_API_KEY` | `client` | Google Gemini API key for AI chat. |
| `VITE_OLLAMA_MODEL` | `client` | Ollama model name for local AI chat. |
| `CLIENT_PORT` | `client` | Host port for the Vite dev server. |
| `VNC_PORT` | `simulator` | Host port for the noVNC web interface. |
| `ROSBRIDGE_PORT` | `rosbridge` (Windows) | Host port for the WebSocket server. |
| `OLLAMA_PORT` | `ollama` | Host port for the Ollama API (default: 11434). |
