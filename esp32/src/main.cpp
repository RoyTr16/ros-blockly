#include <Arduino.h>
#include <micro_ros_arduino.h>
#include <stdio.h>
#include <rcl/rcl.h>
#include <rcl/error_handling.h>
#include <rclc/rclc.h>
#include <rclc/executor.h>
#include <std_msgs/msg/bool.h>

#define LED_PIN 2

const char* SSID = "YOUR_WIFI_SSID";
const char* WPA_PASSWORD = "YOUR_WIFI_PASSWORD";

// The IP Address of your Windows PC running the Micro-ROS Agent in Docker
const char* AGENT_IP = "192.168.0.131";
const int AGENT_PORT = 8888;

rcl_subscription_t subscriber;
std_msgs__msg__Bool msg;
rclc_executor_t executor;
rclc_support_t support;
rcl_allocator_t allocator;
rcl_node_t node;

// Error block loop
#define RCCHECK(fn) { rcl_ret_t temp_rc = fn; if((temp_rc != RCL_RET_OK)){while(1){digitalWrite(LED_PIN, !digitalRead(LED_PIN)); delay(100);}}}

// Subscription callback
void subscription_callback(const void * msgin) {
  const std_msgs__msg__Bool * msg = (const std_msgs__msg__Bool *)msgin;
  if(msg->data) {
    digitalWrite(LED_PIN, HIGH);
    Serial.println("LED ON");
  } else {
    digitalWrite(LED_PIN, LOW);
    Serial.println("LED OFF");
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  Serial.println("Connecting to Agent...");
  
  // Set up Micro-ROS Wi-Fi Transport
  set_microros_wifi_transports(SSID, WPA_PASSWORD, AGENT_IP, AGENT_PORT);
  
  delay(2000);

  allocator = rcl_get_default_allocator();

  // Create init_options
  RCCHECK(rclc_support_init(&support, 0, NULL, &allocator));

  // Create node (This node will magically appear on Windows/Ubuntu!)
  RCCHECK(rclc_node_init_default(&node, "esp32_node", "", &support));

  // Create subscriber listening to /esp/led
  RCCHECK(rclc_subscription_init_default(
    &subscriber,
    &node,
    ROSIDL_GET_MSG_TYPE_SUPPORT(std_msgs, msg, Bool),
    "/esp/led"));

  // Create executor to manage incoming data
  RCCHECK(rclc_executor_init(&executor, &support.context, 1, &allocator));
  RCCHECK(rclc_executor_add_subscription(&executor, &subscriber, &msg, &subscription_callback, ON_NEW_DATA));
  
  Serial.println("Micro-ROS Agent Connected! Listening on /esp/led");
}

void loop() {
  // Let the micro-ROS framework process incoming messages
  rclc_executor_spin_some(&executor, RCL_MS_TO_NS(100));
}
