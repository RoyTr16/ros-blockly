#pragma once
// API: RGB LED — control a 4-pin RGB LED via PWM
//
// Topics:
//   /esp32/rgb_led_config (std_msgs/msg/Int32)
//     Configure pin assignment: (r_pin << 16) | (g_pin << 8) | b_pin
//
//   /esp32/rgb_led_set (std_msgs/msg/Int32)
//     Set color: (red << 16) | (green << 8) | blue
//     Each channel 0-255.
//
// Uses ESP32 LEDC PWM for smooth analog output on any GPIO.

#include <rcl/rcl.h>
#include <rclc/rclc.h>
#include <rclc/executor.h>
#include <std_msgs/msg/int32.h>

#define RGB_LED_EXECUTOR_HANDLES 2

// LEDC PWM configuration
#define RGB_PWM_FREQ     5000
#define RGB_PWM_RESOLUTION 8  // 0-255

static rcl_subscription_t _rgb_config_subscriber;
static rcl_subscription_t _rgb_set_subscriber;
static std_msgs__msg__Int32 _rgb_config_msg;
static std_msgs__msg__Int32 _rgb_set_msg;

static uint8_t _rgb_r_pin = 0;
static uint8_t _rgb_g_pin = 0;
static uint8_t _rgb_b_pin = 0;
static bool    _rgb_configured = false;

// LEDC channels for the three color pins
static const uint8_t _rgb_ledc_ch_r = 0;
static const uint8_t _rgb_ledc_ch_g = 1;
static const uint8_t _rgb_ledc_ch_b = 2;

static void _rgb_setup_pwm() {
  ledcSetup(_rgb_ledc_ch_r, RGB_PWM_FREQ, RGB_PWM_RESOLUTION);
  ledcSetup(_rgb_ledc_ch_g, RGB_PWM_FREQ, RGB_PWM_RESOLUTION);
  ledcSetup(_rgb_ledc_ch_b, RGB_PWM_FREQ, RGB_PWM_RESOLUTION);

  ledcAttachPin(_rgb_r_pin, _rgb_ledc_ch_r);
  ledcAttachPin(_rgb_g_pin, _rgb_ledc_ch_g);
  ledcAttachPin(_rgb_b_pin, _rgb_ledc_ch_b);

  // Start off
  ledcWrite(_rgb_ledc_ch_r, 0);
  ledcWrite(_rgb_ledc_ch_g, 0);
  ledcWrite(_rgb_ledc_ch_b, 0);
}

static void _rgb_config_callback(const void *msgin) {
  const std_msgs__msg__Int32 *msg = (const std_msgs__msg__Int32 *)msgin;

  // Detach previous pins if reconfiguring
  if (_rgb_configured) {
    ledcDetachPin(_rgb_r_pin);
    ledcDetachPin(_rgb_g_pin);
    ledcDetachPin(_rgb_b_pin);
  }

  _rgb_r_pin = (msg->data >> 16) & 0xFF;
  _rgb_g_pin = (msg->data >> 8)  & 0xFF;
  _rgb_b_pin =  msg->data        & 0xFF;

  _rgb_setup_pwm();
  _rgb_configured = true;

  Serial.printf("[rgb_led] Configured: R=G%d, G=G%d, B=G%d\n",
                _rgb_r_pin, _rgb_g_pin, _rgb_b_pin);
}

static void _rgb_set_callback(const void *msgin) {
  if (!_rgb_configured) {
    Serial.println("[rgb_led] Not configured yet, ignoring set command");
    return;
  }

  const std_msgs__msg__Int32 *msg = (const std_msgs__msg__Int32 *)msgin;

  uint8_t r = (msg->data >> 16) & 0xFF;
  uint8_t g = (msg->data >> 8)  & 0xFF;
  uint8_t b =  msg->data        & 0xFF;

  ledcWrite(_rgb_ledc_ch_r, r);
  ledcWrite(_rgb_ledc_ch_g, g);
  ledcWrite(_rgb_ledc_ch_b, b);

  Serial.printf("[rgb_led] Set: R=%d, G=%d, B=%d\n", r, g, b);
}

inline bool rgbLedInit(rcl_node_t *node) {
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
  if (_rgb_configured) {
    ledcWrite(_rgb_ledc_ch_r, 0);
    ledcWrite(_rgb_ledc_ch_g, 0);
    ledcWrite(_rgb_ledc_ch_b, 0);
    ledcDetachPin(_rgb_r_pin);
    ledcDetachPin(_rgb_g_pin);
    ledcDetachPin(_rgb_b_pin);
    _rgb_configured = false;
  }
  rcl_subscription_fini(&_rgb_config_subscriber, node);
  rcl_subscription_fini(&_rgb_set_subscriber, node);
}
