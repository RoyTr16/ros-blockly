#!/bin/bash

# Start Xvfb
Xvfb :0 -screen 0 1024x768x16 &
sleep 5

# Start Window Manager
fluxbox &
sleep 1

# Start VNC Server
x11vnc -display :0 -forever -shared -rfbport 5900 -nopw &
sleep 2

# Start noVNC
websockify --web /usr/share/novnc/ 8080 localhost:5900 &

# Source ROS
source /opt/ros/jazzy/setup.bash

# Launch Gazebo (empty world for now)
# We run it in the background so we can also run the bridge
ros2 launch ros_gz_sim gz_sim.launch.py gz_args:="-r empty.sdf" &

# Wait for Gazebo to start
sleep 5

# Spawn Robot
ros2 run ros_gz_sim create -file /app/robot.sdf -z 0.5

# Launch Bridge
# Bridge /cmd_vel (ROS) to /cmd_vel (Gazebo)
# Note: Gazebo topic might need adjustment based on the model
# For now, we just start the bridge for generic topics
ros2 run ros_gz_bridge parameter_bridge /cmd_vel@geometry_msgs/msg/Twist@gz.msgs.Twist /model/vehicle_blue/pose@geometry_msgs/msg/Pose@gz.msgs.Pose &

# Keep container alive
wait
