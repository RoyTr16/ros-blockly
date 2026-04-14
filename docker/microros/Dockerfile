FROM microros/micro-ros-agent:jazzy

# FastDDS in this image has a known memory explosion when discovering DDS peers
# in Docker networks. Install CycloneDDS as a lightweight alternative.
RUN apt-get update && \
    apt-get install -y --no-install-recommends ros-jazzy-rmw-cyclonedds-cpp && \
    rm -rf /var/lib/apt/lists/*

ENV RMW_IMPLEMENTATION=rmw_cyclonedds_cpp
