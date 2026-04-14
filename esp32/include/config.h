#pragma once

// --- Hardware ---
// LED_PIN and HAS_WS2812 are defined via build_flags in platformio.ini

// --- Agent connection ---
#define PING_INTERVAL_MS    2000
#define PING_TIMEOUT_MS     500
#define PING_ATTEMPTS       3

// --- Executor sizing ---
// Each API module declares how many executor handles it needs.
// main.cpp sums them to size the executor.
