# Eclipse Zenoh Edge Routing Architecture

This document outlines the zero-configuration ROS 2 network architecture utilized in this project. It explains why a traditional `rosbridge` configuration was structurally insufficient, and how the **Eclipse Zenoh** protocol acts as a flawless middleware wrapper to ensure bidirectional communication between our containerized web interface and physical unconfigured edge robots.

## 1. The Core Problem: Docker Desktop Multicast Blocking

The primary goal of this architecture is to allow a React Web Application running natively in a browser to control external physical ROS 2 robots (like UAVs, robot arms, or mobile platforms) on a physical Wi-Fi/Ethernet network. 

To achieve this, the web app's JSON `WebSocket` commands must be translated into native ROS 2 `FastDDS` protocol messages. Normally, running `rosbridge_server` inside a Docker container handles this translation securely. 

However, ROS 2 relies inherently on **UDP Multicast** (specifically Layer 2 network broadcasts) to organically discover other robots on the network. When deploying Docker Desktop on a Windows host machine, the underlying WSL2 hypervisor forces all containers behind a strict NAT virtual switch (`wsl0`). **Microsoft strictly prevents outbound and inbound UDP Multicast packets from crossing this virtual boundary.** 

As a result, any FastDDS packets broadcasted by `rosbridge` are swallowed by Docker and never reach the external physical LAN, resulting in complete isolation.

## 2. The Solution: Eclipse Zenoh

To solve this hardware routing limitation without abandoning Docker or requiring configuration files on physical robots, we implemented **Eclipse Zenoh** (`zenoh-bridge-ros2dds`). 

Zenoh is an inherently OS-agnostic, edge-computing routing protocol that excels at crossing firewalls and NATs by wrapping high-volume UDP multicast DDS structures into highly efficient **Unicast TCP** envelopes.

### How It Works (The TCP Tunnel)

Instead of forcing Docker UDP to break through the hypervisor, we built a dual-node tunnel:
1. **The Internal Extractor:** A `zenoh-bridge` Docker container runs securely inside the `ros_net` subnet alongside `rosbridge`. It silently listens to the internal Docker domain, intercepts all FastDDS traffic from `rosbridge`, compresses it, and pipes it outward via a standard TCP connection (bypassing the multicast ban) aiming at the Windows Host IP (Port 7447).
2. **The Native Injector:** A tiny, standalone executable (`zenoh-bridge.exe`) runs quietly in the background directly on the Windows host machine. Because it is a native Windows app, it has direct access to the physical Ethernet/Wi-Fi adapters without hypervisor constraints. It accepts the incoming TCP tunnel stream, unpacks the data back into FastDDS formatting, and natively broadcasts the Multicast payload onto the physical LAN!

## 3. Bidirectional Duplexing (Sensors & Telemetry)

A critical feature of the Zenoh Bridge architecture is that it is **strictly symmetric and fully duplexed**. The system doesn't just broadcast commands to physical robots—it acts as an open microphone for the entire physical network.

If an external mobile robot powers up on the local Ethernet/Wi-Fi and organically begins natively publishing sensor data (e.g. `/scan` LIDAR telemetry or `/camera/image_raw` streams) without ever knowing that Zenoh or Docker exists:
- The Windows Host `zenoh-bridge.exe` intercepts the physical FastDDS Multicast sensor packets.
- The packets are tunneled backwards through the TCP socket into the Docker container.
- The internal Docker `zenoh-bridge` unzips the packets and authentically re-broadcasts them onto the localized Docker subnet.
- `rosbridge` ingests the sensor data and pipes it up the WebSocket straight into the React UI!

This allows the UI to not just drive the robot, but to subscribe to massive telemetry streams from zero-configured robots directly out-of-the-box.
