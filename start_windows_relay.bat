@echo off
TITLE ROS 2 Zenoh LAN Relay

:: Default Configuration
SET ROS_DISTRO=jazzy
SET LISTEN_ADDRESS=tcp/0.0.0.0:7447

:: Allow overriding the listen address via command line argument (e.g. start_windows_relay.bat tcp/192.168.0.50:7447)
IF NOT "%~1"=="" SET LISTEN_ADDRESS=%~1

echo =======================================================
echo      Starting Native Windows FastDDS Multicast Relay
echo =======================================================
echo ROS_DISTRO     : %ROS_DISTRO%
echo LISTEN_ENDPOINT: %LISTEN_ADDRESS%
echo.
echo Waiting for Docker connection... (Press Ctrl+C to stop)
echo.

:: Execute the downloaded bridge
.\zenoh-plugin-ros2dds-1.9.0\zenoh-bridge-ros2dds.exe -l %LISTEN_ADDRESS%

IF %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] The Zenoh bridge executable crashed or was not found!
    echo Please ensure the 'zenoh-plugin-ros2dds-1.9.0' folder is in the exact same directory as this script.
    pause
)
