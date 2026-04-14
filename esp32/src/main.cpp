#include <Arduino.h>
#include <micro_ros_arduino.h>
#include <stdio.h>
#include <rcl/rcl.h>
#include <rcl/error_handling.h>
#include <rclc/rclc.h>
#include <rclc/executor.h>
#include <rmw_microros/rmw_microros.h>
#include <std_msgs/msg/int32.h>
#include <std_msgs/msg/float32.h>

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
#define ULTRASONIC_PUBLISH_MS 100  // 10Hz publish rate

// --- Ultrasonic sensor state ---
int ultrasonicTrigPin = -1;  // -1 = not configured
int ultrasonicEchoPin = -1;
bool ultrasonicEnabled = false;

// --- LED abstraction ---
void setLed(uint8_t r, uint8_t g, uint8_t b) {
#ifdef HAS_WS2812
  leds[0] = CRGB(r, g, b);
  FastLED.show();
#else
  digitalWrite(LED_PIN, (r || g || b) ? HIGH : LOW);
#endif
}

void blinkLed(uint8_t r, uint8_t g, uint8_t b, unsigned long interval) {
  bool on = (millis() / interval) % 2;
  if (on) setLed(r, g, b); else setLed(0, 0, 0);
}

// --- Ultrasonic measurement ---
float measureDistanceCm() {
  if (!ultrasonicEnabled) return -1.0f;
  digitalWrite(ultrasonicTrigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(ultrasonicTrigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(ultrasonicTrigPin, LOW);
  long duration = pulseIn(ultrasonicEchoPin, HIGH, 30000); // 30ms timeout (~5m max)
  if (duration == 0) return -1.0f;  // No echo
  return duration * 0.0343f / 2.0f;  // Speed of sound / 2
}

// --- ROS entities ---
rcl_subscription_t led_subscriber;
rcl_subscription_t ultrasonic_config_subscriber;
rcl_publisher_t ultrasonic_publisher;
rcl_timer_t ultrasonic_timer;
std_msgs__msg__Int32 led_msg;
std_msgs__msg__Int32 config_msg;
std_msgs__msg__Float32 distance_msg;
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
void led_callback(const void * msgin) {
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

// Subscription callback - receives packed pin config (trig << 8 | echo)
void ultrasonic_config_callback(const void * msgin) {
  const std_msgs__msg__Int32 * msg = (const std_msgs__msg__Int32 *)msgin;
  int32_t packed = msg->data;
  int newTrig = (packed >> 8) & 0xFF;
  int newEcho = packed & 0xFF;

  if (newTrig == 0 && newEcho == 0) {
    // Disable ultrasonic
    ultrasonicEnabled = false;
    Serial.println("Ultrasonic disabled");
    return;
  }

  ultrasonicTrigPin = newTrig;
  ultrasonicEchoPin = newEcho;
  pinMode(ultrasonicTrigPin, OUTPUT);
  pinMode(ultrasonicEchoPin, INPUT);
  ultrasonicEnabled = true;
  Serial.printf("Ultrasonic configured: trig=G%d, echo=G%d\n", ultrasonicTrigPin, ultrasonicEchoPin);
}

// Timer callback - publish distance reading
void ultrasonic_timer_callback(rcl_timer_t * timer, int64_t last_call_time) {
  (void)last_call_time;
  if (timer == NULL || !ultrasonicEnabled) return;
  distance_msg.data = measureDistanceCm();
  Serial.printf("US: %.1f cm\n", distance_msg.data);
  rcl_publish(&ultrasonic_publisher, &distance_msg, NULL);
}

bool createEntities() {
  allocator = rcl_get_default_allocator();

  RCCHECK(rclc_support_init(&support, 0, NULL, &allocator));
  RCCHECK(rclc_node_init_default(&node, "esp32_node", "", &support));

  // LED subscriber
  RCCHECK(rclc_subscription_init_default(
    &led_subscriber, &node,
    ROSIDL_GET_MSG_TYPE_SUPPORT(std_msgs, msg, Int32),
    "/esp32/led"));

  // Ultrasonic config subscriber
  RCCHECK(rclc_subscription_init_default(
    &ultrasonic_config_subscriber, &node,
    ROSIDL_GET_MSG_TYPE_SUPPORT(std_msgs, msg, Int32),
    "/esp32/ultrasonic_config"));

  // Ultrasonic distance publisher
  RCCHECK(rclc_publisher_init_default(
    &ultrasonic_publisher, &node,
    ROSIDL_GET_MSG_TYPE_SUPPORT(std_msgs, msg, Float32),
    "/esp32/ultrasonic"));

  // Timer for ultrasonic publishing at 10Hz
  RCCHECK(rclc_timer_init_default(
    &ultrasonic_timer, &support,
    RCL_MS_TO_NS(ULTRASONIC_PUBLISH_MS),
    ultrasonic_timer_callback));

  // Executor: 2 subscribers + 1 timer = 3 handles
  RCCHECK(rclc_executor_init(&executor, &support.context, 3, &allocator));
  RCCHECK(rclc_executor_add_subscription(&executor, &led_subscriber, &led_msg, &led_callback, ON_NEW_DATA));
  RCCHECK(rclc_executor_add_subscription(&executor, &ultrasonic_config_subscriber, &config_msg, &ultrasonic_config_callback, ON_NEW_DATA));
  RCCHECK(rclc_executor_add_timer(&executor, &ultrasonic_timer));

  return true;
}

void destroyEntities() {
  rcl_subscription_fini(&led_subscriber, &node);
  rcl_subscription_fini(&ultrasonic_config_subscriber, &node);
  rcl_publisher_fini(&ultrasonic_publisher, &node);
  rcl_timer_fini(&ultrasonic_timer);
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
