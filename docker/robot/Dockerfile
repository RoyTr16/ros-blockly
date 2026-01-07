FROM ros:jazzy

# Install demo nodes for testing
RUN apt-get update && apt-get install -y \
    ros-jazzy-demo-nodes-cpp \
    && rm -rf /var/lib/apt/lists/*

# Run a dummy listener or just keep alive
CMD ["ros2", "topic", "echo", "/cmd_vel", "geometry_msgs/msg/Twist"]
