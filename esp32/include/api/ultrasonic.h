#pragma once
// API: Ultrasonic Sensor (HC-SR04)
//
// Config topic:  /esp32/ultrasonic_config (std_msgs/msg/Int32)
//   Message format: (trig_pin << 8) | echo_pin
//   Send 0 to disable.
//
// Output topic:  /esp32/ultrasonic (std_msgs/msg/Float32)
//   Publishes distance in cm at 10 Hz. Publishes -1 on no echo.

#include <rcl/rcl.h>
#include <rclc/rclc.h>
#include <rclc/executor.h>
#include <std_msgs/msg/int32.h>
#include <std_msgs/msg/float32.h>

#define ULTRASONIC_EXECUTOR_HANDLES 2  // 1 subscriber + 1 timer
#define ULTRASONIC_PUBLISH_MS 100      // 10 Hz

static rcl_subscription_t _us_config_sub;
static rcl_publisher_t    _us_publisher;
static rcl_timer_t        _us_timer;
static std_msgs__msg__Int32   _us_config_msg;
static std_msgs__msg__Float32 _us_distance_msg;

static int  _us_trig_pin = -1;
static int  _us_echo_pin = -1;
static bool _us_enabled  = false;

static float _us_measure() {
  if (!_us_enabled) return -1.0f;
  digitalWrite(_us_trig_pin, LOW);
  delayMicroseconds(2);
  digitalWrite(_us_trig_pin, HIGH);
  delayMicroseconds(10);
  digitalWrite(_us_trig_pin, LOW);
  long duration = pulseIn(_us_echo_pin, HIGH, 30000);
  if (duration == 0) return -1.0f;
  return duration * 0.0343f / 2.0f;
}

static void _us_config_callback(const void *msgin) {
  const std_msgs__msg__Int32 *msg = (const std_msgs__msg__Int32 *)msgin;
  int trig = (msg->data >> 8) & 0xFF;
  int echo = msg->data & 0xFF;

  if (trig == 0 && echo == 0) {
    _us_enabled = false;
    Serial.println("[ultrasonic] disabled");
    return;
  }

  _us_trig_pin = trig;
  _us_echo_pin = echo;
  pinMode(_us_trig_pin, OUTPUT);
  pinMode(_us_echo_pin, INPUT);
  _us_enabled = true;
  Serial.printf("[ultrasonic] configured: trig=G%d, echo=G%d\n", trig, echo);
}

static void _us_timer_callback(rcl_timer_t *timer, int64_t last_call_time) {
  (void)last_call_time;
  if (timer == NULL || !_us_enabled) return;
  _us_distance_msg.data = _us_measure();
  rcl_publish(&_us_publisher, &_us_distance_msg, NULL);
}

inline bool ultrasonicInit(rcl_node_t *node, rclc_support_t *support) {
  rcl_ret_t rc;

  rc = rclc_subscription_init_default(
    &_us_config_sub, node,
    ROSIDL_GET_MSG_TYPE_SUPPORT(std_msgs, msg, Int32),
    "/esp32/ultrasonic_config");
  if (rc != RCL_RET_OK) return false;

  rc = rclc_publisher_init_default(
    &_us_publisher, node,
    ROSIDL_GET_MSG_TYPE_SUPPORT(std_msgs, msg, Float32),
    "/esp32/ultrasonic");
  if (rc != RCL_RET_OK) return false;

  rc = rclc_timer_init_default(
    &_us_timer, support,
    RCL_MS_TO_NS(ULTRASONIC_PUBLISH_MS),
    _us_timer_callback);
  if (rc != RCL_RET_OK) return false;

  return true;
}

inline bool ultrasonicAddToExecutor(rclc_executor_t *executor) {
  rcl_ret_t rc;
  rc = rclc_executor_add_subscription(
    executor, &_us_config_sub, &_us_config_msg,
    &_us_config_callback, ON_NEW_DATA);
  if (rc != RCL_RET_OK) return false;

  rc = rclc_executor_add_timer(executor, &_us_timer);
  if (rc != RCL_RET_OK) return false;

  return true;
}

inline void ultrasonicFini(rcl_node_t *node) {
  rcl_subscription_fini(&_us_config_sub, node);
  rcl_publisher_fini(&_us_publisher, node);
  rcl_timer_fini(&_us_timer);
  _us_enabled = false;
}
