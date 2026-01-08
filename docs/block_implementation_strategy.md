# Block Implementation Strategy

This document outlines the strategy for adding new ROS-enabled blocks to the Blockly interface in a scalable and maintainable way.

## 1. Goals
*   **Scalability**: Easily add support for new robots (e.g., UR5) without rewriting core logic.
*   **Maintainability**: Separate block UI definitions from code generation logic.
*   **Genericism**: Use generic blocks where possible (e.g., a generic "Publish to Topic" block) while offering specialized blocks for common actions (e.g., "Move Arm").

## 2. Architecture

### A. Block Definitions (`client/src/blocks/`)
Instead of defining blocks manually in a single file, we will split them by category or robot.
*   `ros_common_blocks.js`: Generic ROS blocks (Publish, Subscribe, Service Call).
*   `ur5_blocks.js`: Specialized blocks for the UR5 robot (e.g., "Move Joint 1").
*   `vehicle_blocks.js`: Specialized blocks for mobile bases.

**Pattern**:
Use JSON-style definitions where possible for readability, or helper functions to standardize the "look and feel" (color coding by message type).

### B. Code Generation (`client/src/generators/`)
We will implement a **Helper Library** for generating ROS code to avoid duplication.

**Current Problem**:
`ros_generator.js` currently hardcodes the `ROSLIB.Topic` creation inside every block generator.

**Proposed Solution**:
Create a `RosBlockly` helper class in the generated code (injected at runtime) or a generator utility that standardizes:
1.  Topic instantiation (singleton pattern to avoid creating multiple publishers for the same topic).
2.  Message creation.
3.  Publishing logic.

### C. Toolbox Management
The toolbox is currently hardcoded in `BlocklyComponent.jsx`.
We will move this to a configuration file (`client/src/config/toolbox.js`) that exports the XML structure. This allows us to dynamically load categories based on the selected robot.

## 3. Implementation Steps

### Step 1: Refactor Code Generator
Create a standard template for ROS publishers in `ros_generator.js`.

```javascript
// Pseudo-code for a generic generator helper
function generatePublisherCode(topic, msgType, msgContent) {
  return `
    var topic = new ROSLIB.Topic({ ... });
    var msg = new ROSLIB.Message(${JSON.stringify(msgContent)});
    topic.publish(msg);
  `;
}
```

### Step 2: Define UR5 Blocks
We need blocks for:
1.  **Joint Control**: Moving individual joints (shoulder, elbow, wrist).
    *   *Topic*: `/joint_trajectory_controller/joint_trajectory` (or similar, depending on the controller).
    *   *Message*: `trajectory_msgs/msg/JointTrajectory`.
2.  **Gripper Control**: Open/Close gripper.
    *   *Topic*: `/gripper_cmd` (or service).

### Step 3: Dynamic Toolbox
Update `BlocklyComponent.jsx` to import the toolbox definition from a config file.

## 4. Coding Standards
*   **Naming**: Block IDs should be prefixed (e.g., `ur5_move_joint`, `common_publish`).
*   **Colors**:
    *   Motion/Action: Blue (230)
    *   Sensing/Input: Green
    *   Logic/Control: Yellow
*   **Inputs**: Use typed inputs (Number, String) to prevent invalid data types being sent to ROS.
