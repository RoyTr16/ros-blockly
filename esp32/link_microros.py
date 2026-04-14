Import("env")
import os

# PlatformIO doesn't properly link precompiled ESP32 libraries (precompiled=true bug).
# Explicitly add libmicroros.a to the linker path.
lib_path = os.path.join(env["PROJECT_LIBDEPS_DIR"], env["PIOENV"], "micro_ros_arduino", "src", "esp32s3")
env.Append(
    LIBPATH=[lib_path],
    LIBS=["microros"],
    LINKFLAGS=["-Wl,--allow-multiple-definition"]
)
