# UR5 Direct Joint Control Architecture

## Overview
In addition to the "Professional Trajectory Control" (which uses a driver node to manage trajectories), we have implemented a **Direct Joint Control** method. This method allows for simple, immediate control of individual joints by bypassing the driver node and communicating directly with the ROS 2 topics bridged to Gazebo.

## Data Flow
The following diagram illustrates the simplified pipeline for controlling a single joint.

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
                                                        | /ur5/[joint_name]/cmd  |
                                                        +------------------------+
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
                      | (JointPositionController)   |
                      +-----------------------------+
```

## Component Details

### 1. Frontend: The "Move Single Joint" Block
**File**: `client/src/packages/builtin/ur5.json` (block type: `ur5_move_single_joint`)
*   **Role**: The User Interface.
*   **Action**: Publishes a single `std_msgs/Float64` message to a specific topic.
*   **Topic**: `/ur5/shoulder_pan/cmd`, `/ur5/shoulder_lift/cmd`, etc.

### 2. The Bridge
**File**: `docker/robots/ur5/bridge.yaml`
*   **Role**: The "Bridge".
*   **Functionality**: It maps the ROS 2 topic (e.g. `/ur5/shoulder_pan/cmd`) directly to the Gazebo topic (e.g. `/ur5/shoulder_pan_joint/cmd`).

### 3. Simulation
**File**: `docker/robots/ur5/robot.sdf`
*   **Role**: The "Hardware".
*   **Controller**: The `JointPositionController` receives the position command and immediately moves the joint to that angle.

## Use Case
This method is perfect for:
*   **Debugging**: Testing individual joints without the complexity of a full trajectory.
*   **Simple Logic**: When you just want to "move X to Y" without coordinating multiple joints.
