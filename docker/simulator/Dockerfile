FROM osrf/ros:jazzy-desktop-full

# Install VNC tools (Gazebo is already included)
# Install VNC tools (Gazebo is already included)
RUN apt-get update && apt-get install -y xvfb x11vnc fluxbox && rm -rf /var/lib/apt/lists/*

RUN apt-get update && apt-get install -y novnc python3-websockify python3-numpy && rm -rf /var/lib/apt/lists/*

# Install ROS-GZ bridge (this might be large)
RUN apt-get update && apt-get install -y ros-jazzy-ros-gz && rm -rf /var/lib/apt/lists/*

# Create a symbolic link for novnc if installed via apt
RUN ln -s /usr/share/novnc/vnc.html /usr/share/novnc/index.html

# Setup environment variables for display
ENV DISPLAY=:0
ENV ROS_DOMAIN_ID=0

WORKDIR /app

# Copy startup script and robot model
COPY start.sh .
COPY apps /root/.fluxbox/apps
COPY init /root/.fluxbox/init
RUN chmod +x start.sh

# Expose VNC web port
EXPOSE 8080

CMD ["./start.sh"]
