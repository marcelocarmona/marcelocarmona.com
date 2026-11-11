#pragma once

#include <stdint.h>

enum class InkPulseDiagnosticRefresh { Full, Partial };

struct InkPulseDiagnosticScreen {
  uint32_t press_count;
  uint32_t last_refresh_ms;
  InkPulseDiagnosticRefresh refresh;
};

// Initializes the persistent one-bit framebuffer used by diagnostic mode.
bool inkpulse_diagnostic_screen_begin();

// Draws the diagnostic screen and returns the measured panel refresh time.
uint32_t inkpulse_diagnostic_screen_render(const InkPulseDiagnosticScreen &screen);
