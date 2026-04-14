FROM ros:jazzy-ros-core

# Install rosbridge suite
# upgrade first to sync base-image DDS/fastcdr libs with newly installed packages
RUN apt-get update && apt-get upgrade -y && apt-get install -y \
    ros-jazzy-rosbridge-suite \
    ros-jazzy-ros-gz-interfaces \
    && rm -rf /var/lib/apt/lists/*

# Launch rosbridge websocket
CMD ["ros2", "run", "rosbridge_server", "rosbridge_websocket"]
