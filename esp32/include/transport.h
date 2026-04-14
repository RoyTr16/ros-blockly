#pragma once
#include <Arduino.h>
#include <micro_ros_arduino.h>
#include <rmw_microros/rmw_microros.h>
#include "secrets.h"
#include "config.h"
#include "status_led.h"

enum TransportState {
  TRANSPORT_WAITING_AGENT,
  TRANSPORT_AGENT_AVAILABLE,
  TRANSPORT_CONNECTED,
  TRANSPORT_DISCONNECTED
};

static TransportState _transport_state = TRANSPORT_WAITING_AGENT;
static unsigned long _last_ping_time = 0;

// Called once in setup()
inline void transportInit() {
  Serial.println("Connecting to WiFi + micro-ROS Agent...");
  set_microros_wifi_transports(WIFI_SSID, WIFI_PASSWORD, AGENT_IP, AGENT_PORT);
  statusLedSet(0, 0, 255);  // Blue = waiting
  _transport_state = TRANSPORT_WAITING_AGENT;
}

// Returns current transport state
inline TransportState transportState() {
  return _transport_state;
}

// Drive the connection state machine. Returns true when a fresh
// connection has just been established (caller should create entities).
// Sets *shouldDestroy = true when connection is lost (caller should destroy).
inline bool transportUpdate(bool *shouldDestroy) {
  *shouldDestroy = false;

  switch (_transport_state) {
    case TRANSPORT_WAITING_AGENT:
      statusLedBlink(0, 0, 255, 500);
      if (rmw_uros_ping_agent(PING_TIMEOUT_MS, PING_ATTEMPTS) == RMW_RET_OK) {
        Serial.println("Agent found!");
        _transport_state = TRANSPORT_AGENT_AVAILABLE;
      }
      return false;

    case TRANSPORT_AGENT_AVAILABLE:
      delay(2000);  // Let transport stabilize
      _transport_state = TRANSPORT_CONNECTED;
      return true;   // Signal: create entities now

    case TRANSPORT_CONNECTED:
      if (millis() - _last_ping_time > PING_INTERVAL_MS) {
        _last_ping_time = millis();
        if (rmw_uros_ping_agent(PING_TIMEOUT_MS, PING_ATTEMPTS) != RMW_RET_OK) {
          Serial.println("Agent connection lost!");
          _transport_state = TRANSPORT_DISCONNECTED;
        }
      }
      return false;

    case TRANSPORT_DISCONNECTED:
      statusLedBlink(255, 255, 0, 300);
      *shouldDestroy = true;
      _transport_state = TRANSPORT_WAITING_AGENT;
      Serial.println("Reconnecting...");
      return false;
  }
  return false;
}
