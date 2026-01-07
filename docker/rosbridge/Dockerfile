FROM ros:jazzy-ros-core

# Install rosbridge suite
RUN apt-get update && apt-get install -y \
    ros-jazzy-rosbridge-suite \
    ros-jazzy-ros-gz-interfaces \
    && rm -rf /var/lib/apt/lists/*

# Launch rosbridge websocket
CMD ["ros2", "run", "rosbridge_server", "rosbridge_websocket"]
