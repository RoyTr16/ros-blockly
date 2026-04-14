#pragma once
// API: Ultrasonic Sensor (HC-SR04) — multi-instance
//
// Config topic:  /esp32/ultrasonic_config (std_msgs/msg/Int32)
//   Message format: (id << 16) | (trig_pin << 8) | echo_pin
//   id = 0..MAX_ULTRASONIC-1. Send (id << 16) with pins=0 to disable.
//
// Output topic:  /esp32/ultrasonic (std_msgs/msg/Int32)
//   Publishes (id << 16) | (distance_cm_x10 & 0xFFFF) at 10 Hz for each enabled sensor.
//   distance_cm_x10 = distance in cm * 10 (for 0.1 cm resolution). 0xFFFF = no echo.

#include <rcl/rcl.h>
#include <rclc/rclc.h>
#include <rclc/executor.h>
#include <std_msgs/msg/int32.h>

#define ULTRASONIC_EXECUTOR_HANDLES 2  // 1 subscriber + 1 timer
#define ULTRASONIC_PUBLISH_MS 100      // 10 Hz
#define MAX_ULTRASONIC 4

static rcl_subscription_t _us_config_sub;
static rcl_publisher_t    _us_publisher;
static rcl_timer_t        _us_timer;
static std_msgs__msg__Int32 _us_config_msg;
static std_msgs__msg__Int32 _us_pub_msg;

typedef struct {
  int  trig_pin;
  int  echo_pin;
  bool enabled;
} _us_instance_t;

static _us_instance_t _us_sensors[MAX_ULTRASONIC];

static float _us_measure(int idx) {
  if (!_us_sensors[idx].enabled) return -1.0f;
  int trig = _us_sensors[idx].trig_pin;
  int echo = _us_sensors[idx].echo_pin;
  digitalWrite(trig, LOW);
  delayMicroseconds(2);
  digitalWrite(trig, HIGH);
  delayMicroseconds(10);
  digitalWrite(trig, LOW);
  long duration = pulseIn(echo, HIGH, 30000);
  if (duration == 0) return -1.0f;
  return duration * 0.0343f / 2.0f;
}

static void _us_config_callback(const void *msgin) {
  const std_msgs__msg__Int32 *msg = (const std_msgs__msg__Int32 *)msgin;
  int id   = (msg->data >> 16) & 0xFF;
  int trig = (msg->data >> 8)  & 0xFF;
  int echo =  msg->data        & 0xFF;

  if (id >= MAX_ULTRASONIC) {
    Serial.printf("[ultrasonic] id %d out of range (max %d)\n", id, MAX_ULTRASONIC - 1);
    return;
  }

  if (trig == 0 && echo == 0) {
    _us_sensors[id].enabled = false;
    Serial.printf("[ultrasonic] id=%d disabled\n", id);
    return;
  }

  _us_sensors[id].trig_pin = trig;
  _us_sensors[id].echo_pin = echo;
  pinMode(trig, OUTPUT);
  pinMode(echo, INPUT);
  _us_sensors[id].enabled = true;
  Serial.printf("[ultrasonic] id=%d configured: trig=G%d, echo=G%d\n", id, trig, echo);
}

static void _us_timer_callback(rcl_timer_t *timer, int64_t last_call_time) {
  (void)last_call_time;
  if (timer == NULL) return;
  for (int i = 0; i < MAX_ULTRASONIC; i++) {
    if (!_us_sensors[i].enabled) continue;
    float dist = _us_measure(i);
    uint16_t d10 = (dist < 0) ? 0xFFFF : (uint16_t)(dist * 10.0f);
    _us_pub_msg.data = (i << 16) | (d10 & 0xFFFF);
    rcl_publish(&_us_publisher, &_us_pub_msg, NULL);
  }
}

inline bool ultrasonicInit(rcl_node_t *node, rclc_support_t *support) {
  // Initialize all slots as disabled
  for (int i = 0; i < MAX_ULTRASONIC; i++) {
    _us_sensors[i].enabled = false;
  }

  rcl_ret_t rc;

  rc = rclc_subscription_init_default(
    &_us_config_sub, node,
    ROSIDL_GET_MSG_TYPE_SUPPORT(std_msgs, msg, Int32),
    "/esp32/ultrasonic_config");
  if (rc != RCL_RET_OK) return false;

  rc = rclc_publisher_init_default(
    &_us_publisher, node,
    ROSIDL_GET_MSG_TYPE_SUPPORT(std_msgs, msg, Int32),
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
  for (int i = 0; i < MAX_ULTRASONIC; i++) {
    _us_sensors[i].enabled = false;
  }
}
