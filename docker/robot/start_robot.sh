#!/bin/bash
set -e

# Setup ROS 2 environment
source /opt/ros/jazzy/setup.bash

echo "Starting Robot Container for Model: $ROBOT_MODEL"

# Start the Bridge (Background)
export GZ_IP=$(hostname -i)
ros2 run ros_gz_bridge parameter_bridge --ros-args -p config_file:=/app/robots/$ROBOT_MODEL/bridge.yaml &
BRIDGE_PID=$!
echo "Started ros_gz_bridge (PID: $BRIDGE_PID)"

# Start UR5 Action Node if applicable
if [ "$ROBOT_MODEL" = "ur5" ]; then
    echo "Detected UR5. Starting Action/Driver Node..."
    python3 /app/robots/action_node.py &
    DRIVER_PID=$!
    echo "Started action_node.py (PID: $DRIVER_PID)"
fi

# Keep container alive
wait $BRIDGE_PID
