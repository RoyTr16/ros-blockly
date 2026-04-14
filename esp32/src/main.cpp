// ESP32 micro-ROS Firmware — Thin Orchestrator
// All behaviour is driven from the web interface via ROS topics.
// This firmware just provides the hardware API.

#include <Arduino.h>
#include <micro_ros_arduino.h>
#include <rcl/rcl.h>
#include <rclc/rclc.h>
#include <rclc/executor.h>

#include "config.h"
#include "status_led.h"
#include "transport.h"

// --- API modules ---
#include "api/digital_write.h"
#include "api/ultrasonic.h"
#include "api/rgb_led.h"

// Total executor handles = sum of all API modules
#define TOTAL_EXECUTOR_HANDLES (DIGITAL_WRITE_EXECUTOR_HANDLES + ULTRASONIC_EXECUTOR_HANDLES + RGB_LED_EXECUTOR_HANDLES)

// --- ROS core ---
static rclc_support_t  support;
static rcl_allocator_t allocator;
static rcl_node_t      node;
static rclc_executor_t executor;

bool createEntities() {
  allocator = rcl_get_default_allocator();

  rcl_ret_t rc = rclc_support_init(&support, 0, NULL, &allocator);
  if (rc != RCL_RET_OK) { Serial.printf("support_init failed: %d\n", (int)rc); return false; }

  rc = rclc_node_init_default(&node, "esp32_node", "", &support);
  if (rc != RCL_RET_OK) { Serial.printf("node_init failed: %d\n", (int)rc); return false; }

  // Initialize each API module
  if (!digitalWriteInit(&node))            { Serial.println("digital_write init failed"); return false; }
  if (!ultrasonicInit(&node, &support))    { Serial.println("ultrasonic init failed");    return false; }
  if (!rgbLedInit(&node))                  { Serial.println("rgb_led init failed");       return false; }

  // Create executor and register all handles
  rc = rclc_executor_init(&executor, &support.context, TOTAL_EXECUTOR_HANDLES, &allocator);
  if (rc != RCL_RET_OK) { Serial.printf("executor_init failed: %d\n", (int)rc); return false; }

  if (!digitalWriteAddToExecutor(&executor))  { Serial.println("digital_write executor failed"); return false; }
  if (!ultrasonicAddToExecutor(&executor))    { Serial.println("ultrasonic executor failed");    return false; }
  if (!rgbLedAddToExecutor(&executor))        { Serial.println("rgb_led executor failed");       return false; }

  return true;
}

void destroyEntities() {
  digitalWriteFini(&node);
  ultrasonicFini(&node);
  rgbLedFini(&node);
  rclc_executor_fini(&executor);
  rcl_node_fini(&node);
  rclc_support_fini(&support);
}

void setup() {
  Serial.begin(115200);
  statusLedInit();
  transportInit();
}

void loop() {
  bool shouldDestroy = false;
  bool justConnected = transportUpdate(&shouldDestroy);

  if (shouldDestroy) {
    destroyEntities();
  }

  if (justConnected) {
    if (createEntities()) {
      statusLedSet(0, 255, 0);  // Green = connected
      Serial.println("micro-ROS connected — API ready");
    } else {
      Serial.println("Failed to create entities, retrying...");
      // transportUpdate will cycle back to WAITING_AGENT
    }
  }

  if (transportState() == TRANSPORT_CONNECTED) {
    rclc_executor_spin_some(&executor, RCL_MS_TO_NS(100));
  }
}
