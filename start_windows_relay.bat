@echo off
SETLOCAL EnableDelayedExpansion
TITLE ROS 2 Zenoh LAN Relay

:: Default Configuration
SET ROS_DISTRO=jazzy
SET LISTEN_ADDRESS=tcp/0.0.0.0:7447

:: Allow overriding the listen address via command line argument (e.g. start_windows_relay.bat tcp/192.168.0.50:7447)
IF NOT "%~1"=="" SET LISTEN_ADDRESS=%~1

:: Auto-detect the LAN adapter IP (the one with the lowest-metric default route)
:: This ensures DDS multicast goes through the physical LAN, not VPN or virtual adapters
SET "CYCLONE_CFG=%~dp0zenoh-plugin-ros2dds-1.9.0\cyclonedds_auto.xml"
FOR /F "usebackq delims=" %%I IN (`powershell -NoProfile -Command "$r=Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue|Sort-Object RouteMetric|Select-Object -First 1; if($r){(Get-NetIPAddress -InterfaceIndex $r.InterfaceIndex -AddressFamily IPv4).IPAddress}"`) DO SET "LAN_IP=%%I"

IF NOT DEFINED LAN_IP (
    echo [WARNING] Could not detect a LAN adapter. DDS interface will be auto-selected.
    echo          Make sure you are connected to a LAN network.
    goto :start_bridge
)

:: Write CycloneDDS config that pins DDS to the LAN interface (no BOM, single line)
powershell -NoProfile -Command "[IO.File]::WriteAllText('%CYCLONE_CFG%','<CycloneDDS><Domain><General><Interfaces><NetworkInterface address=\"%LAN_IP%\" multicast=\"true\"/></Interfaces></General></Domain></CycloneDDS>',(New-Object Text.UTF8Encoding $false))"
SET "CYCLONEDDS_URI=file://%CYCLONE_CFG%"

:start_bridge
echo =======================================================
echo      Starting Native Windows Zenoh DDS LAN Relay
echo =======================================================
echo ROS_DISTRO     : %ROS_DISTRO%
echo LISTEN_ENDPOINT: %LISTEN_ADDRESS%
IF DEFINED LAN_IP (
    echo LAN INTERFACE  : %LAN_IP%
) ELSE (
    echo LAN INTERFACE  : auto
)
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
