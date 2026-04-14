#include <Arduino.h>
#include <micro_ros_arduino.h>
#include <stdio.h>
#include <rcl/rcl.h>
#include <rcl/error_handling.h>
#include <rclc/rclc.h>
#include <rclc/executor.h>
#include <rmw_microros/rmw_microros.h>
#include <std_msgs/msg/int32.h>
#include <FastLED.h>

// --- Configuration ---
#include "secrets.h"  // Copy secrets.example.h to secrets.h and fill in your values

#define RGB_LED_PIN   48
#define NUM_LEDS      1
#define PING_INTERVAL_MS  2000  // Check agent connectivity every 2 seconds
#define PING_TIMEOUT_MS   500   // Timeout for each ping attempt
#define PING_ATTEMPTS     3     // Number of ping attempts before declaring lost

CRGB leds[NUM_LEDS];
CRGB userColor = CRGB::Black;  // Track user-set color separately from status LED

rcl_subscription_t subscriber;
std_msgs__msg__Int32 msg;
rclc_executor_t executor;
rclc_support_t support;
rcl_allocator_t allocator;
rcl_node_t node;

unsigned long lastPingTime = 0;
bool agentConnected = false;

enum State { WAITING_AGENT, AGENT_AVAILABLE, AGENT_CONNECTED, AGENT_DISCONNECTED } state;

#define RCCHECK(fn) { rcl_ret_t temp_rc = fn; if((temp_rc != RCL_RET_OK)){ \
  Serial.printf("RCCHECK failed at line %d: %d\n", __LINE__, (int)temp_rc); \
  return false; }}

// Subscription callback - receives a packed RGB color (0xRRGGBB) or 0 for off
void subscription_callback(const void * msgin) {
  const std_msgs__msg__Int32 * msg = (const std_msgs__msg__Int32 *)msgin;
  int32_t color = msg->data;

  if (color == 0) {
    userColor = CRGB::Black;
    leds[0] = CRGB::Black;
    Serial.println("LED OFF");
  } else {
    userColor = CRGB((color >> 16) & 0xFF, (color >> 8) & 0xFF, color & 0xFF);
    leds[0] = userColor;
    Serial.printf("LED color: #%06X\n", color);
  }
  FastLED.show();
}

bool createEntities() {
  allocator = rcl_get_default_allocator();

  RCCHECK(rclc_support_init(&support, 0, NULL, &allocator));
  RCCHECK(rclc_node_init_default(&node, "esp32_led_node", "", &support));

  RCCHECK(rclc_subscription_init_default(
    &subscriber,
    &node,
    ROSIDL_GET_MSG_TYPE_SUPPORT(std_msgs, msg, Int32),
    "/esp32/led"));

  RCCHECK(rclc_executor_init(&executor, &support.context, 1, &allocator));
  RCCHECK(rclc_executor_add_subscription(&executor, &subscriber, &msg, &subscription_callback, ON_NEW_DATA));

  return true;
}

void destroyEntities() {
  rcl_subscription_fini(&subscriber, &node);
  rclc_executor_fini(&executor);
  rcl_node_fini(&node);
  rclc_support_fini(&support);
}

void setup() {
  Serial.begin(115200);

  FastLED.addLeds<WS2812, RGB_LED_PIN, GRB>(leds, NUM_LEDS);
  FastLED.setBrightness(30);
  leds[0] = CRGB::Blue;  // Blue = waiting for agent
  FastLED.show();

  Serial.println("Connecting to WiFi + micro-ROS Agent...");
  set_microros_wifi_transports(WIFI_SSID, WIFI_PASSWORD, AGENT_IP, AGENT_PORT);

  state = WAITING_AGENT;
}

void loop() {
  switch (state) {
    case WAITING_AGENT:
      // Blink blue while waiting for agent
      leds[0] = (millis() / 500) % 2 ? CRGB::Blue : CRGB::Black;
      FastLED.show();
      if (rmw_uros_ping_agent(PING_TIMEOUT_MS, PING_ATTEMPTS) == RMW_RET_OK) {
        state = AGENT_AVAILABLE;
        Serial.println("Agent found!");
      }
      break;

    case AGENT_AVAILABLE:
      delay(2000);  // Let transport stabilize before session creation
      if (createEntities()) {
        state = AGENT_CONNECTED;
        agentConnected = true;
        leds[0] = CRGB::Green;
        FastLED.show();
        Serial.println("micro-ROS connected! Listening on /esp32/led");
      } else {
        state = WAITING_AGENT;
        Serial.println("Failed to create entities, retrying...");
        delay(1000);
      }
      break;

    case AGENT_CONNECTED:
      rclc_executor_spin_some(&executor, RCL_MS_TO_NS(100));

      // Periodically ping the agent
      if (millis() - lastPingTime > PING_INTERVAL_MS) {
        lastPingTime = millis();
        if (rmw_uros_ping_agent(PING_TIMEOUT_MS, PING_ATTEMPTS) != RMW_RET_OK) {
          Serial.println("Agent connection lost!");
          state = AGENT_DISCONNECTED;
        }
      }
      break;

    case AGENT_DISCONNECTED:
      // Blink yellow = was connected, lost agent
      leds[0] = (millis() / 300) % 2 ? CRGB::Yellow : CRGB::Black;
      FastLED.show();
      destroyEntities();
      state = WAITING_AGENT;
      Serial.println("Reconnecting...");
      break;
  }
}
