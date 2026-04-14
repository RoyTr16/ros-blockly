Import("env")
import os

# PlatformIO doesn't properly link precompiled ESP32 libraries (precompiled=true bug).
# Auto-detect the correct library variant based on the board MCU.
mcu = env.BoardConfig().get("build.mcu", "esp32")
lib_variant = "esp32s3" if "esp32s3" in mcu else "esp32"
lib_path = os.path.join(env["PROJECT_LIBDEPS_DIR"], env["PIOENV"], "micro_ros_arduino", "src", lib_variant)
env.Append(
    LIBPATH=[lib_path],
    LIBS=["microros"],
    LINKFLAGS=["-Wl,--allow-multiple-definition"]
)
