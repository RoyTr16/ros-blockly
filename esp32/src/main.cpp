#include <Arduino.h>
#include <micro_ros_arduino.h>
#include <stdio.h>
#include <rcl/rcl.h>
#include <rcl/error_handling.h>
#include <rclc/rclc.h>
#include <rclc/executor.h>
#include <rmw_microros/rmw_microros.h>
#include <std_msgs/msg/int32.h>

#ifdef HAS_WS2812
  #include <FastLED.h>
  #define NUM_LEDS 1
  CRGB leds[NUM_LEDS];
#endif

// --- Configuration ---
#include "secrets.h"  // Copy secrets.example.h to secrets.h and fill in your values

// LED_PIN is defined via build_flags in platformio.ini
// ESP32-S3-DevKitC: GPIO 48 (on-board WS2812, HAS_WS2812=1)
// ESP32-WROOM-32:   GPIO 2  (built-in blue LED, on/off only)
#define PING_INTERVAL_MS  2000
#define PING_TIMEOUT_MS   500
#define PING_ATTEMPTS     3

// --- LED abstraction ---
void setLed(uint8_t r, uint8_t g, uint8_t b) {
#ifdef HAS_WS2812
  leds[0] = CRGB(r, g, b);
  FastLED.show();
#else
  // Plain LED: on if any color component is non-zero
  digitalWrite(LED_PIN, (r || g || b) ? HIGH : LOW);
#endif
}

void blinkLed(uint8_t r, uint8_t g, uint8_t b, unsigned long interval) {
  bool on = (millis() / interval) % 2;
  if (on) setLed(r, g, b); else setLed(0, 0, 0);
}

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
    setLed(0, 0, 0);
    Serial.println("LED OFF");
  } else {
    setLed((color >> 16) & 0xFF, (color >> 8) & 0xFF, color & 0xFF);
    Serial.printf("LED color: #%06X\n", color);
  }
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

#ifdef HAS_WS2812
  FastLED.addLeds<WS2812, LED_PIN, GRB>(leds, NUM_LEDS);
  FastLED.setBrightness(30);
#else
  pinMode(LED_PIN, OUTPUT);
#endif
  setLed(0, 0, 255);  // Blue = waiting for agent

  Serial.println("Connecting to WiFi + micro-ROS Agent...");
  set_microros_wifi_transports(WIFI_SSID, WIFI_PASSWORD, AGENT_IP, AGENT_PORT);

  state = WAITING_AGENT;
}

void loop() {
  switch (state) {
    case WAITING_AGENT:
      blinkLed(0, 0, 255, 500);  // Blink blue
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
        setLed(0, 255, 0);  // Green = connected
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
      blinkLed(255, 255, 0, 300);  // Blink yellow
      destroyEntities();
      state = WAITING_AGENT;
      Serial.println("Reconnecting...");
      break;
  }
}
