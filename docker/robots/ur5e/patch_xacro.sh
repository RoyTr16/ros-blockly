#!/bin/bash
find /app/robots/ur5e/ur_description -name '*.xacro' -type f -exec sed -i 's|\$(find ur_description)|/app/robots/ur5e/ur_description|g' {} +
find /app/robots/ur5e/ur_description -name '*.xacro' -type f -exec sed -i 's|package://ur_description|file:///app/robots/ur5e/ur_description|g' {} +
