#ifdef INKPULSE_DIAGNOSTIC

#include "inkpulse_diagnostic.h"

#include <Arduino.h>
#include <board_config.h>
#include <display.h>
#include <esp_ota_ops.h>
#include <globals.h>
#include <inkpulse_diagnostic_screen.h>
#include <inkpulse_diagnostic_state.h>
#include <pins.h>

#include "inkpulse_diagnostic_capture.h"

namespace {

inkpulse::DiagnosticState state;
InkPulseDiagnosticCapture capture;
bool diagnostic_ready = false;

// Only these values change between normal KEY3 updates. Keeping the regions
// explicit makes the transfer predictable and avoids an expensive framebuffer
// diff on the microcontroller.
constexpr inkpulse::DirtyRegion dynamic_regions[] = {
  {64, 224, 384, 104},  // press count
  {512, 216, 224, 152}, // refresh time and mode
};

void render_screen(inkpulse::RefreshMode refresh) {
  const inkpulse::DiagnosticScreenModel screen = {
    state.pressCount(),
    state.lastRefreshMs(),
    refresh,
  };
  inkpulse_diagnostic_screen_draw(screen);
  const InkPulseRefreshStats stats = inkpulse_diagnostic_screen_refresh(
      refresh, dynamic_regions, sizeof(dynamic_regions) / sizeof(dynamic_regions[0]));
  state.recordRefresh(stats.total_ms);
  Serial.printf(
      "[InkPulse] %s refresh via %s: total=%lu ms, transfer=%lu ms, panel=%lu ms, "
      "bytes=%lu; KEY3 count=%lu\n",
      refresh == inkpulse::RefreshMode::Full ? "full" : "partial",
      stats.path == InkPulseRefreshPath::DirtyRegions ? "regions" : "full-frame",
      static_cast<unsigned long>(stats.total_ms), static_cast<unsigned long>(stats.transfer_ms),
      static_cast<unsigned long>(stats.panel_ms), static_cast<unsigned long>(stats.bytes_written),
      static_cast<unsigned long>(state.pressCount()));
}

} // namespace

void inkpulse_diagnostic_setup() {
  Serial.begin(115200);
  const uint32_t serial_started_ms = millis();
  while (!Serial && millis() - serial_started_ms < 2000) {
    delay(10);
  }

  Serial.println("\n[InkPulse] Offline hardware diagnostic starting");
  Serial.println("[InkPulse] Wi-Fi and server access are disabled in this build");

  esp_ota_mark_app_valid_cancel_rollback();
  hw_config_init(DEVICE_MODEL);
  if (pDevice == nullptr) {
    Serial.println("[InkPulse] Hardware profile was not found; diagnostic stopped");
    return;
  }
  pins_init();
  if (!preferences.begin("inkpulse-diag", false)) {
    Serial.println("[InkPulse] Could not open diagnostic preferences; diagnostic stopped");
    return;
  }

  display_init();
  if (!inkpulse_diagnostic_screen_begin()) {
    Serial.println("[InkPulse] Could not allocate the display buffer");
    return;
  }

  render_screen(inkpulse::RefreshMode::Full);
  diagnostic_ready = true;
  Serial.printf("[InkPulse] Ready; KEY3 is GPIO %u and is sampled every loop\n", pDevice->interrupt_pin);
  Serial.println("[InkPulse] Send 'INKPULSE SCREENSHOT' over USB serial to capture the framebuffer");
}

void inkpulse_diagnostic_loop() {
  if (!diagnostic_ready) {
    delay(100);
    return;
  }
  capture.poll(inkpulse_diagnostic_framebuffer());
  const bool pressed = digitalRead(pDevice->interrupt_pin) == LOW;
  if (state.updateButton(pressed, millis())) {
    render_screen(state.refreshMode());
  }
  delay(5);
}

#endif // INKPULSE_DIAGNOSTIC
