# Simulation Concepts & Architecture

This document explains the core concepts behind the robot simulation architecture, specifically how models are loaded and where code executes.

## 1. What is an SDF file?

**SDF (Simulation Description Format)** is an XML file that describes objects and environments in the simulator. It tells Gazebo:
*   **Visuals**: What the robot looks like (meshes, colors).
*   **Physics**: Mass, inertia, friction, and joint types.
*   **Collisions**: The physical boundaries for interaction.

In our project, the `robot.sdf` file (located in `docker/robots/<model>/`) acts as the entry point. It often contains a `<include>` tag that points to a more complex model hosted online.

## 2. Model Loading: Online vs. Offline

### Online Loading (Gazebo Fuel)
By default, we use **Gazebo Fuel**, which is an online repository of robot models.
*   **Mechanism**: The `robot.sdf` contains a URI like `<uri>https://fuel.gazebosim.org/...</uri>`.
*   **Process**:
    1.  When the **Simulator** container starts, it reads this URI.
    2.  It checks its local cache (`~/.gz/fuel`).
    3.  If the model is missing, it **downloads** the full 3D assets (meshes, textures) from the internet.
    4.  If the model is cached, it loads instantly.
*   **Requirement**: The Simulator container needs internet access on the first run.

### Offline Loading
To run completely offline, one must manually download the assets (SDFs, meshes, config files) and place them in the `docker/robots/` directory, then update the `robot.sdf` to point to these local files using `model://` or relative paths.

## 3. Execution: "Body" vs. "Brain"

A common source of confusion is where the robot actually "runs". Our architecture separates the physical body from the control logic.

### The Body: Simulator Container (`simulator`)
*   **Role**: The Physical World.
*   **What runs here?**: Gazebo Harmonic, Physics Engine, Rendering.
*   **Function**:
    *   Calculates gravity, collisions, and joint dynamics.
    *   "Spawns" the robot visual model.
    *   **Note**: The Simulator is the one that downloads/reads the visual SDF assets.

### The Brain: Robot Container (`robot`)
*   **Role**: The Controller / Nervous System.
*   **What runs here?**: ROS 2, `ros_gz_bridge`.
*   **Function**:
    *   **Does NOT** need to see the 3D model or download meshes.
    *   Sends commands (e.g., "Apply 5N force to Joint 1") to the Simulator via the Bridge.
    *   Receives data (e.g., "Joint 1 is at 45 degrees") from the Simulator.

### Analogy
*   **Simulator**: The video game console running the game world (graphics, physics).
*   **Robot Container**: The game controller in your hand. It sends button presses and receives vibration feedback, but it doesn't render the graphics.
