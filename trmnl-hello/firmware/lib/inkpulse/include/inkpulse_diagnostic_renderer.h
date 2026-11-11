#pragma once

#include <inkpulse_canvas.h>
#include <inkpulse_refresh_mode.h>
#include <stdint.h>

namespace inkpulse {

struct DiagnosticScreenModel {
  uint32_t press_count;
  uint32_t last_refresh_ms;
  RefreshMode refresh;
};

// Draws a complete diagnostic frame without communicating with the panel.
void renderDiagnosticScreen(Canvas &canvas, const DiagnosticScreenModel &screen);

} // namespace inkpulse
