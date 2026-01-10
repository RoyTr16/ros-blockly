FROM ros:jazzy

# Install demo nodes for testing
RUN apt-get update && apt-get install -y \
    ros-jazzy-demo-nodes-cpp \
    ros-jazzy-ros-gz-bridge \
    ros-jazzy-control-msgs \
    ros-jazzy-trajectory-msgs \
    && rm -rf /var/lib/apt/lists/*

# Run the bridge instead of the dummy listener
# We bridge /cmd_vel (ROS) -> /cmd_vel (Gazebo) and /model/vehicle_blue/odometry (Gazebo) -> /odom (ROS)
# Also bridge the pose for reset functionality
CMD ["bash", "-c", "export GZ_IP=$(hostname -i) && ros2 run ros_gz_bridge parameter_bridge --ros-args -p config_file:=/app/robots/$ROBOT_MODEL/bridge.yaml"]
