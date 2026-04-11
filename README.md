# ROS 2 Blockly Interface

This repository provides a complete, modern web-based visual programming environment for seamlessly controlling ROS 2 robots. By leveraging React, Google Blockly, Docker, and Eclipse Zenoh, it allows zero-configuration control over complex robotic hardware through a beautifully simple drag-and-drop interface.

## 🏗️ Architecture & Structure

The project is natively Dockerized and composed of three primary functional layers:

1. **The Web Interface (`/client`)**
   A fast, Vite-powered React front-end application hosting the Google Blockly canvas. It communicates its spatial/logic commands downstream via high-speed WebSockets (JSON).
2. **The ROS Translation Layer (`rosbridge`)**
   A Dockerized `rosbridge_server` that acts as the middleware ingestor, seamlessly translating the React WebSockets into authentic ROS 2 structures (like `geometry_msgs/Twist`).
3. **The Physical Hardware Gateway (`zenoh-bridge`)**
   Because Docker Desktop on Windows inherently drops UDP Multicast (preventing native ROS 2 physical discovery), this project implements a bleeding-edge dual-node **Eclipse Zenoh TCP Tunnel**. It intercepts ROS 2 traffic inside Docker, tunnels it into the Windows Host via TCP, and natively unravels it back into pristine FastDDS UDP Multicast.
   *For an in-depth breakdown of this networking implementation, read [`docs/zenoh-network-architecture.md`](docs/zenoh-network-architecture.md).*

---

## 🚀 Getting Started

### 1. Launch the Windows Multicast Gateway
If you are developing on a Windows host and want unconfigured physical robots on your Wi-Fi/Ethernet to hear your commands, you must start the native Gateway relayer.
Simply double-click the script in the root directory:
```bash
start_windows_relay.bat
```
*(This native process actively bridges the Docker Subnet with your physical Local Area Network).*

### 2. Boot the Core Infrastructure
Once the gateway is listening, boot the lightning-fast Core Interface stack. This consumes very little RAM and avoids launching heavy physics simulations.
```bash
docker-compose up -d
```
Access the interface in your browser at `http://localhost:<CLIENT_PORT>` (typically port 5173).

### 3. (Optional) Boot the Physics Simulator
If you do not have physical hardware on your desk and want to visually simulate a UR5 robot arm, you can invoke the simulation profile.
```bash
docker-compose --profile sim up -d
```
This forces Docker to spin up the heavy 3D Gazebo engine alongside the core infrastructure.

---

## 💻 Tech Stack
- **Frontend**: React 18, Vite, Google Blockly
- **Middleware**: ROS 2 Jazzy, Rosbridge Suite
- **Networking**: Eclipse Zenoh, FastDDS
- **Deployment**: Docker Compose
