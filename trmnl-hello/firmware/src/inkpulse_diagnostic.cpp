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

namespace {

inkpulse::DiagnosticState state;
bool diagnostic_ready = false;

InkPulseDiagnosticRefresh screen_refresh(inkpulse::RefreshMode refresh) {
  return refresh == inkpulse::RefreshMode::Full ? InkPulseDiagnosticRefresh::Full
                                                : InkPulseDiagnosticRefresh::Partial;
}

void render_screen(InkPulseDiagnosticRefresh refresh) {
  InkPulseDiagnosticScreen screen = {
    state.pressCount(),
    state.lastRefreshMs(),
    refresh,
  };
  const uint32_t elapsed_ms = inkpulse_diagnostic_screen_render(screen);
  state.recordRefresh(elapsed_ms);
  Serial.printf("[InkPulse] %s refresh completed in %lu ms; KEY3 count=%lu\n",
                refresh == InkPulseDiagnosticRefresh::Full ? "full" : "partial", elapsed_ms,
                state.pressCount());
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

  render_screen(InkPulseDiagnosticRefresh::Full);
  diagnostic_ready = true;
  Serial.printf("[InkPulse] Ready; KEY3 is GPIO %u and is sampled every loop\n", pDevice->interrupt_pin);
}

void inkpulse_diagnostic_loop() {
  if (!diagnostic_ready) {
    delay(100);
    return;
  }
  const bool pressed = digitalRead(pDevice->interrupt_pin) == LOW;
  if (state.updateButton(pressed, millis())) {
    render_screen(screen_refresh(state.refreshMode()));
  }
  delay(5);
}

#endif // INKPULSE_DIAGNOSTIC
