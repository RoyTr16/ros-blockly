#pragma once
// API: RGB LED — multi-instance control of 4-pin RGB LEDs via PWM
//
// Topics:
//   /esp32/rgb_led_config (std_msgs/msg/Int32)
//     Configure pin assignment: (id << 24) | (r_pin << 16) | (g_pin << 8) | b_pin
//     id = 0..MAX_RGB_LED-1
//
//   /esp32/rgb_led_set (std_msgs/msg/Int32)
//     Set color: (id << 24) | (red << 16) | (green << 8) | blue
//     Each channel 0-255.
//
// Uses ESP32 LEDC PWM for smooth analog output on any GPIO.
// Each LED instance uses 3 consecutive LEDC channels starting at id*3.

#include <rcl/rcl.h>
#include <rclc/rclc.h>
#include <rclc/executor.h>
#include <std_msgs/msg/int32.h>

#define RGB_LED_EXECUTOR_HANDLES 2
#define MAX_RGB_LED 4

// LEDC PWM configuration
#define RGB_PWM_FREQ       5000
#define RGB_PWM_RESOLUTION 8  // 0-255

static rcl_subscription_t _rgb_config_subscriber;
static rcl_subscription_t _rgb_set_subscriber;
static std_msgs__msg__Int32 _rgb_config_msg;
static std_msgs__msg__Int32 _rgb_set_msg;

typedef struct {
  uint8_t r_pin;
  uint8_t g_pin;
  uint8_t b_pin;
  uint8_t ch_r;  // LEDC channel for red
  uint8_t ch_g;  // LEDC channel for green
  uint8_t ch_b;  // LEDC channel for blue
  bool    configured;
} _rgb_instance_t;

static _rgb_instance_t _rgb_leds[MAX_RGB_LED];

static void _rgb_setup_instance(int id) {
  _rgb_instance_t *led = &_rgb_leds[id];
  led->ch_r = id * 3;
  led->ch_g = id * 3 + 1;
  led->ch_b = id * 3 + 2;

  ledcSetup(led->ch_r, RGB_PWM_FREQ, RGB_PWM_RESOLUTION);
  ledcSetup(led->ch_g, RGB_PWM_FREQ, RGB_PWM_RESOLUTION);
  ledcSetup(led->ch_b, RGB_PWM_FREQ, RGB_PWM_RESOLUTION);

  ledcAttachPin(led->r_pin, led->ch_r);
  ledcAttachPin(led->g_pin, led->ch_g);
  ledcAttachPin(led->b_pin, led->ch_b);

  ledcWrite(led->ch_r, 0);
  ledcWrite(led->ch_g, 0);
  ledcWrite(led->ch_b, 0);
}

static void _rgb_config_callback(const void *msgin) {
  const std_msgs__msg__Int32 *msg = (const std_msgs__msg__Int32 *)msgin;

  int id = (msg->data >> 24) & 0xFF;
  if (id >= MAX_RGB_LED) {
    Serial.printf("[rgb_led] id %d out of range (max %d)\n", id, MAX_RGB_LED - 1);
    return;
  }

  _rgb_instance_t *led = &_rgb_leds[id];

  // Detach previous pins if reconfiguring
  if (led->configured) {
    ledcDetachPin(led->r_pin);
    ledcDetachPin(led->g_pin);
    ledcDetachPin(led->b_pin);
  }

  led->r_pin = (msg->data >> 16) & 0xFF;
  led->g_pin = (msg->data >> 8)  & 0xFF;
  led->b_pin =  msg->data        & 0xFF;

  _rgb_setup_instance(id);
  led->configured = true;

  Serial.printf("[rgb_led] id=%d configured: R=G%d, G=G%d, B=G%d\n",
                id, led->r_pin, led->g_pin, led->b_pin);
}

static void _rgb_set_callback(const void *msgin) {
  const std_msgs__msg__Int32 *msg = (const std_msgs__msg__Int32 *)msgin;

  int id = (msg->data >> 24) & 0xFF;
  if (id >= MAX_RGB_LED || !_rgb_leds[id].configured) {
    Serial.printf("[rgb_led] id %d not configured, ignoring\n", id);
    return;
  }

  _rgb_instance_t *led = &_rgb_leds[id];

  uint8_t r = (msg->data >> 16) & 0xFF;
  uint8_t g = (msg->data >> 8)  & 0xFF;
  uint8_t b =  msg->data        & 0xFF;

  ledcWrite(led->ch_r, r);
  ledcWrite(led->ch_g, g);
  ledcWrite(led->ch_b, b);

  Serial.printf("[rgb_led] id=%d set: R=%d, G=%d, B=%d\n", id, r, g, b);
}

inline bool rgbLedInit(rcl_node_t *node) {
  for (int i = 0; i < MAX_RGB_LED; i++) {
    _rgb_leds[i].configured = false;
  }

  rcl_ret_t rc;

  rc = rclc_subscription_init_default(
    &_rgb_config_subscriber, node,
    ROSIDL_GET_MSG_TYPE_SUPPORT(std_msgs, msg, Int32),
    "/esp32/rgb_led_config");
  if (rc != RCL_RET_OK) return false;

  rc = rclc_subscription_init_default(
    &_rgb_set_subscriber, node,
    ROSIDL_GET_MSG_TYPE_SUPPORT(std_msgs, msg, Int32),
    "/esp32/rgb_led_set");
  return rc == RCL_RET_OK;
}

inline bool rgbLedAddToExecutor(rclc_executor_t *executor) {
  rcl_ret_t rc;

  rc = rclc_executor_add_subscription(
    executor, &_rgb_config_subscriber, &_rgb_config_msg,
    &_rgb_config_callback, ON_NEW_DATA);
  if (rc != RCL_RET_OK) return false;

  rc = rclc_executor_add_subscription(
    executor, &_rgb_set_subscriber, &_rgb_set_msg,
    &_rgb_set_callback, ON_NEW_DATA);
  return rc == RCL_RET_OK;
}

inline void rgbLedFini(rcl_node_t *node) {
  for (int i = 0; i < MAX_RGB_LED; i++) {
    if (_rgb_leds[i].configured) {
      ledcWrite(_rgb_leds[i].ch_r, 0);
      ledcWrite(_rgb_leds[i].ch_g, 0);
      ledcWrite(_rgb_leds[i].ch_b, 0);
      ledcDetachPin(_rgb_leds[i].r_pin);
      ledcDetachPin(_rgb_leds[i].g_pin);
      ledcDetachPin(_rgb_leds[i].b_pin);
      _rgb_leds[i].configured = false;
    }
  }
  rcl_subscription_fini(&_rgb_config_subscriber, node);
  rcl_subscription_fini(&_rgb_set_subscriber, node);
}
