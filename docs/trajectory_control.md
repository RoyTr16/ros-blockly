# UR5 Trajectory Control Architecture

## Overview
This document details the "Professional Control" architecture implemented for the UR5 robot. This architecture mimics a real-world robot setup where a high-level driver accepts standard **Trajectory Messages** and handles the low-level execution.

In our simulation, we use a custom **Driver Node** (`action_node.py`) to bridge the gap between industry-standard ROS messages and the robust, individual joint position controllers required for stable simulation in Gazebo Harmonic.

## Data Flow
The following diagram illustrates the command pipeline from the web interface to the simulated hardware.

```text
+-------------------+       +-------------------+       +------------------------+
|   User / Blockly  | ----> |  JavaScript Code  | ----> |        RoslibJS        |
+-------------------+       +-------------------+       +------------------------+
                                                                    |
                                                                    | WebSocket (JSON)
                                                                    v
                                                        +------------------------+
                                                        |    Rosbridge Server    |
                                                        +------------------------+
                                                                    |
                                                                    | Deserializes
                                                                    v
                                                        +------------------------+
                                                        | ROS Topic:             |
                                                        | /ur5/trajectory        |
                                                        +------------------------+
                                                                    |
                                                                    | Subscribes
                                                                    v
      +-------------------------------------------------------------+
      |               Driver Node (action_node.py)                  |
      |          (Interpolates Trajectory & Splits to Joints)       |
      +-----------------------------+-------------------------------+
                                    |
                                    | Publishes Individual Commands
                                    v
      +-----------------------------+-------------------------------+
      |                                                             |
+-----+----------------+                                  +---------+--------------+
| Position Controller  |  (e.g., /ur5/shoulder_pan/cmd)   |  Position Controller   |
|     (Shoulder)       |                                  |       (Elbow)          |
+-----+----------------+                                  +---------+--------------+
      |                                                             |
      +-----------------------------+-------------------------------+
                                    |
                                    | ROS Topics
                                    v
                      +-----------------------------+
                      |       ros_gz_bridge         |
                      +-----------------------------+
                                    |
                                    | Gazebo Transport
                                    v
                      +-----------------------------+
                      |       Gazebo Physics        |
                      +-----------------------------+
```

## Component Details

### 1. Frontend: The "Move Block"
**File**: `client/src/blocks/ur5/joint_control.js`
*   **Role**: The User Interface.
*   **Action**: Instead of sending 6 individual numbers (which is messy and non-standard), it constructs a single `trajectory_msgs/JointTrajectory` message.
*   **Topic**: `/ur5/trajectory`
*   **Parity**: This is exactly how high-level planners (like MoveIt 2) communicate with robot drivers.

### 2. The Driver Node
**File**: `docker/robots/action_node.py`
*   **Role**: Acts as the "Robot Driver". On a real Universal Robot, this corresponding software would run on the control box.
*   **Functionality**:
    1.  Subscribes to `/ur5/trajectory`.
    2.  Extracts the target joint positions.
    3.  (Future) Handles interpolation/smoothing between points.
    4.  **Demultiplexes** the single trajectory message into 6 individual `std_msgs/Float64` commands.
    5.  Publishes these commands to the specific topics for each joint.

### 3. Simulation Interface
**File**: `docker/robots/ur5/robot.sdf` & `bridge.yaml`
*   **Role**: The "Hardware".
*   **Controllers**: We verify that `JointPositionController` plugins are significantly more stable in Dockerized Gazebo than the complex `JointTrajectoryController`. They simply snap the joint to the target angle.
*   **Bridge**: The `ros_gz_bridge` routes the simple float commands from ROS to Gazebo.

## Transitioning to a Real Robot
One of the main goals of this architecture is **Real Robot Parity**. The code you write in Blockly generates standard messages.

To switch from Simulation to a Real UR5:
1.  **Stop** the Docker Simulation.
2.  **Start** the real robot driver (e.g., `Universal_Robots_ROS2_Driver`).
    *   This driver typically listens on `/joint_trajectory_controller/joint_trajectory`.
3.  **Update** the Frontend Block to publish to that topic (or remap it).
    *   *No other logic changes are needed.* The block logic remains "Send a Trajectory".

## Why this complexity?
Why not just send 6 floats from the browser?
*   **Standardization**: Sending 6 floats is custom and brittle. `JointTrajectory` is the ROS standard.
*   **Timing**: A trajectory message includes *time_from_start*, allowing coordinated movement (all joints arriving at the same time).
*   **Safety**: A real driver validates the entire path before moving. Our `action_node.py` provides a place to add that validation logic in the future.
