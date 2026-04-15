FROM ros:jazzy-ros-core

# Install rosbridge suite + CycloneDDS (must match microros agent's RMW)
# upgrade first to sync base-image DDS/fastcdr libs with newly installed packages
RUN apt-get update && apt-get upgrade -y && apt-get install -y \
    ros-jazzy-rosbridge-suite \
    ros-jazzy-ros-gz-interfaces \
    ros-jazzy-rmw-cyclonedds-cpp \
    && rm -rf /var/lib/apt/lists/*

ENV RMW_IMPLEMENTATION=rmw_cyclonedds_cpp

# Launch rosbridge websocket
CMD ["ros2", "run", "rosbridge_server", "rosbridge_websocket"]
