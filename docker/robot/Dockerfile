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
# Copy startup script
COPY start_robot.sh /app/start_robot.sh
RUN chmod +x /app/start_robot.sh

CMD ["/app/start_robot.sh"]
