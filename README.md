# ROS 2 Blockly — Visual Programming for Robots

A modern web-based visual programming environment for controlling ROS 2 robots, ESP32 microcontrollers, and Gazebo simulations. Drag blocks, chat with an AI, and run programs on real hardware — all from the browser, with zero local setup.

> **Status:** actively developed research project at the Technion. Works today on Linux and Windows (Docker Desktop / WSL2) with native LAN robots, simulated UR5, mobile vehicles, and ESP32 devices.

---

## ✨ What you can do

- **Visually program robots with Blockly** — a drag-and-drop block editor (Google Blockly) with categories for logic, math, loops, variables, functions, and robot-specific actions (move joints, drive wheels, toggle GPIO, read ultrasonics, etc.).
- **Talk to the robot in natural language** — an integrated **AI chat** (Gemini, Gemma 4, or a local Ollama model) that reads your current workspace, proposes block programs, and previews them in a diff overlay before anything is applied. Supports English and Hebrew with proper RTL rendering.
- **Run on real hardware or in simulation** — the same blocks drive:
  - A simulated **UR5 arm** or **differential-drive vehicle** in Gazebo Harmonic (accessible via browser VNC).
  - **Physical ROS 2 robots** on your LAN (direct DDS on Linux; TCP-tunnelled via Zenoh on Windows).
  - **ESP32 microcontrollers** over **micro-ROS** (Wi-Fi, UDP agent).
- **Define and reuse your own functions** — create parameterized procedures in the Function Panel and call them from any chain.
- **Inspect everything** — live log viewer, connection graph, generated JavaScript viewer, action buttons for quick commands.
- **Zero native dependencies** — the entire stack is Dockerized. You only need Docker, a browser, and optionally an API key.

---

## 🏗️ Architecture

Three layers, all orchestrated by Docker Compose:

1. **Web Interface** (`/client`) — Vite + React app hosting the Blockly canvas, AI chat, and UI panels. Talks to the robot via [roslibjs](https://github.com/RobotWebTools/roslibjs) over WebSocket.
2. **ROS Translation Layer** (`/docker/rosbridge`) — a `rosbridge_server` container that bridges JSON over WebSocket ↔ native ROS 2 topics, services, and actions (`geometry_msgs/Twist`, `sensor_msgs/JointState`, `trajectory_msgs/JointTrajectory`, etc.).
3. **Physical Hardware Gateway** — two modes:
   - **Linux:** `rosbridge` uses `network_mode: host`, so DDS multicast reaches LAN robots natively.
   - **Windows:** a dual-node **Eclipse Zenoh TCP tunnel** intercepts DDS traffic inside Docker, tunnels it into the Windows host over TCP, and re-emits it as native UDP multicast onto your Wi-Fi/Ethernet. This works around Docker Desktop / WSL2 dropping multicast. Full deep-dive in [docs/zenoh-network-architecture.md](docs/zenoh-network-architecture.md).

### Service map

| Service | Profile | Role |
|---|---|---|
| `client` | default | React + Blockly + AI chat (port `5173`) |
| `rosbridge` | default | ROS 2 ↔ WebSocket gateway (port `9090`) |
| `robot` | `sim` | `ros_gz_bridge` + robot drivers for the selected model |
| `simulator` | `sim` | Gazebo Harmonic + noVNC (port `8080`) |
| `ollama` | `ollama` | Local LLM server (port `11434`) |
| `microros` | `microros` | micro-ROS agent for ESP32 boards (UDP `8888`) |
| `zenoh-bridge` | Windows only | DDS-over-TCP tunnel to host |

Profiles are composable: `--profile sim --profile ollama --profile microros` brings up everything.

For a full service-by-service reference see [docs/docker_architecture.md](docs/docker_architecture.md) and [PROJECT_ARCHITECTURE.md](PROJECT_ARCHITECTURE.md).

---

## 🚀 Getting started

### Prerequisites

- Docker Desktop (Windows/macOS) or Docker Engine + Compose (Linux)
- A modern browser (Chrome, Edge, Firefox)
- *(Optional)* a **Google AI Studio** API key if you want to use Gemini/Gemma, or a local Ollama install for fully-offline AI chat

### Linux

```bash
# Core stack (client + rosbridge). Connect to real LAN robots immediately.
docker compose up -d

# Add the simulated UR5 in Gazebo:
docker compose --profile sim up -d

# Add a local Ollama model for AI chat:
docker compose --profile ollama up -d
```

Open `http://localhost:5173`.

### Windows

```powershell
# 1. Start the native multicast relay (needed for physical LAN robots)
.\start_windows_relay.bat

# 2. Bring up the stack with the Windows compose file
docker compose -f docker-compose.windows.yml up -d

# Optional profiles work the same way:
docker compose -f docker-compose.windows.yml --profile sim up -d
```

The simulator's Gazebo UI is available at `http://localhost:8080` (noVNC).

---

## 🤖 AI chat integration

The chat panel supports three backends, selectable from the UI:

- **Gemini** (`gemini-3-flash-preview`, `gemini-3.1-flash-lite-preview`) — low-latency default.
- **Gemma 4** (`gemma-4-31b-it`, `gemma-4-26b-a4b-it`) — open-weights models served through the same Gemini API endpoint. Unlimited monthly tokens on the free tier, generous RPD limit.
- **Ollama** — any locally installed model (Llama 3, Qwen, Gemma edge variants, etc.).

All three go through a common tool-calling pipeline:

1. `get_block_details(types[])` — the model pulls exact schemas for the blocks it plans to use.
2. `create_program(blocks)` or `modify_program(operations)` — the model emits a tiny JSON DSL describing the program or an edit script.
3. The app compiles the DSL to a Blockly XML diff and shows a **preview overlay**: accept to apply, reject to discard.

Details and extension guide in [docs/llm_integration.md](docs/llm_integration.md).

### Internationalization

The chat UI renders Hebrew messages right-to-left with correct punctuation placement. Inline code and code blocks always stay LTR inside RTL messages, so English identifiers embedded in Hebrew prose read naturally.

---

## 🧩 Key features in more detail

- **Custom DSL** — a compact JSON representation for block programs (`[[{ "type": "...", "body": [...] }]]`). Compiles to Blockly XML; decompiles back for round-tripping with the AI.
- **Preview / Apply flow** — AI-generated programs never overwrite your workspace silently. You always see a preview and decide.
- **Modify mode** — incremental edits (`insert_after`, `replace`, `delete`, `set_field`) on an existing program, not just full rewrites.
- **Function library** — top-level procedures you define in the Function Panel appear as callable blocks in the toolbox.
- **Package loader** — robot definitions live in `client/src/packages/builtin/*.json` (currently `ur5`, `vehicle`, `esp32`) and are selectable at runtime.
- **Log viewer & graph viewer** — live view of ROS topics, services, and the active connection graph.
- **ESP32 support** — a PlatformIO project in `/esp32` that speaks micro-ROS over Wi-Fi. Pins are controlled from blocks like `esp32_set_pin_on`, `ultrasonic_read_cm`, `rgb_led_set`.

---

## 📁 Repository layout

```
client/                  React app (Vite) — UI, Blockly, AI, roslibjs
  src/ai/                Gemini + Ollama backends, DSL compiler/decompiler, prompt builder
  src/components/        Blockly canvas + UI panels (chat, logs, graph, functions, ...)
  src/packages/builtin/  Robot descriptor JSONs (ur5, vehicle, esp32)
docker/
  rosbridge/             ROS 2 ↔ WebSocket gateway
  robot/                 Robot driver container (ros_gz_bridge + action_node.py)
  simulator/             Gazebo + noVNC
  microros/              micro-ROS agent (Windows)
  robots/<model>/        bridge.yaml + robot.sdf per supported robot
esp32/                   PlatformIO firmware for ESP32 + micro-ROS
zenoh-plugin-ros2dds-*/  Zenoh bridge binaries / config for the Windows tunnel
docs/                    Architecture, networking, LLM, and subsystem docs
```

---

## 💻 Tech stack

- **Frontend:** React 18, Vite, Google Blockly, roslibjs, react-markdown
- **AI:** Google Gemini / Gemma 4 (REST v1beta), Ollama (OpenAI-compatible local endpoint), custom JSON DSL + tool-calling pipeline
- **Middleware:** ROS 2 Jazzy, rosbridge_suite, CycloneDDS, FastDDS
- **Simulation:** Gazebo Harmonic, `ros_gz_bridge`, Xvfb + x11vnc + noVNC
- **Networking:** Eclipse Zenoh (`zenoh-plugin-ros2dds`) for the Windows TCP tunnel
- **Embedded:** ESP32-S3, micro-ROS, PlatformIO
- **Deployment:** Docker Compose with profiles

---

## 📚 Documentation

- [PROJECT_ARCHITECTURE.md](PROJECT_ARCHITECTURE.md) — top-level architecture + network diagram
- [docs/docker_architecture.md](docs/docker_architecture.md) — services, profiles, env vars
- [docs/zenoh-network-architecture.md](docs/zenoh-network-architecture.md) — the Windows DDS tunnel
- [docs/llm_integration.md](docs/llm_integration.md) — AI chat, DSL, tool calling, prompts
- [docs/react_app_architecture.md](docs/react_app_architecture.md) — client-side structure
- [docs/block_implementation_strategy.md](docs/block_implementation_strategy.md) — how custom blocks are defined
- [docs/direct_joint_control.md](docs/direct_joint_control.md) & [docs/trajectory_control.md](docs/trajectory_control.md) — UR5 control modes
- [docs/async_execution.md](docs/async_execution.md) — block runtime + async semantics
- [docs/roslibjs_concepts.md](docs/roslibjs_concepts.md) — ROS 2 from the browser
- [docs/simulation_concepts.md](docs/simulation_concepts.md) — Gazebo integration
