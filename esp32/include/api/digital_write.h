#pragma once
// API: Digital Write — set any GPIO pin HIGH or LOW
//
// Topic: /esp32/digital_write (std_msgs/msg/Int32)
// Message format: (pin << 8) | value
//   pin   = GPIO number (0-39)
//   value = 1 (HIGH) or 0 (LOW)
//
// Automatically calls pinMode(pin, OUTPUT) on first use.

#include <rcl/rcl.h>
#include <rclc/rclc.h>
#include <rclc/executor.h>
#include <std_msgs/msg/int32.h>

#define DIGITAL_WRITE_EXECUTOR_HANDLES 1

static rcl_subscription_t _dw_subscriber;
static std_msgs__msg__Int32 _dw_msg;

static void _dw_callback(const void *msgin) {
  const std_msgs__msg__Int32 *msg = (const std_msgs__msg__Int32 *)msgin;
  int pin = (msg->data >> 8) & 0xFF;
  int value = msg->data & 0xFF;

  pinMode(pin, OUTPUT);
  digitalWrite(pin, value ? HIGH : LOW);
  Serial.printf("[digital_write] G%d -> %s\n", pin, value ? "HIGH" : "LOW");
}

inline bool digitalWriteInit(rcl_node_t *node) {
  rcl_ret_t rc = rclc_subscription_init_default(
    &_dw_subscriber, node,
    ROSIDL_GET_MSG_TYPE_SUPPORT(std_msgs, msg, Int32),
    "/esp32/digital_write");
  return rc == RCL_RET_OK;
}

inline bool digitalWriteAddToExecutor(rclc_executor_t *executor) {
  rcl_ret_t rc = rclc_executor_add_subscription(
    executor, &_dw_subscriber, &_dw_msg,
    &_dw_callback, ON_NEW_DATA);
  return rc == RCL_RET_OK;
}

inline void digitalWriteFini(rcl_node_t *node) {
  rcl_subscription_fini(&_dw_subscriber, node);
}
