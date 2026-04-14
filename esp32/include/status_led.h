#pragma once
#include <Arduino.h>

#ifdef HAS_WS2812
  #include <FastLED.h>
  #define NUM_LEDS 1
  static CRGB _status_leds[NUM_LEDS];
  static bool _status_led_init = false;
#endif

// Initialize the on-board status LED
inline void statusLedInit() {
#ifdef HAS_WS2812
  if (!_status_led_init) {
    FastLED.addLeds<WS2812, LED_PIN, GRB>(_status_leds, NUM_LEDS);
    FastLED.setBrightness(30);
    _status_led_init = true;
  }
#else
  pinMode(LED_PIN, OUTPUT);
#endif
}

// Set status LED color (for connection state feedback only)
inline void statusLedSet(uint8_t r, uint8_t g, uint8_t b) {
#ifdef HAS_WS2812
  _status_leds[0] = CRGB(r, g, b);
  FastLED.show();
#else
  digitalWrite(LED_PIN, (r || g || b) ? HIGH : LOW);
#endif
}

// Blink status LED at given interval
inline void statusLedBlink(uint8_t r, uint8_t g, uint8_t b, unsigned long interval) {
  if ((millis() / interval) % 2) statusLedSet(r, g, b);
  else statusLedSet(0, 0, 0);
}
