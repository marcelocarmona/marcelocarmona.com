#ifdef INKPULSE_DIAGNOSTIC

#include "inkpulse_diagnostic_screen.h"

#include <Arduino.h>
#include <display_internal.h>
#include <epd_driver.h>
#include <fonts.h>
#include <globals.h>

namespace {

void draw_label(const char *text, int x, int y) {
  bbep.setFont(Inter_18);
  bbep.drawString(text, x, y);
}

void draw_value(const String &text, int x, int y) {
  bbep.setFont(Roboto_Black_24);
  bbep.drawString(text.c_str(), x, y);
}

const char *refresh_name(InkPulseDiagnosticRefresh refresh) {
  return refresh == InkPulseDiagnosticRefresh::Full ? "FULL" : "PARTIAL";
}

} // namespace

bool inkpulse_diagnostic_screen_begin() {
  display_prepare_message();
  return bbep.getBuffer() != nullptr;
}

uint32_t inkpulse_diagnostic_screen_render(const InkPulseDiagnosticScreen &screen) {
  bbep.fillScreen(BBEP_WHITE);
  bbep.setTextColor(BBEP_BLACK, BBEP_WHITE);

  draw_value("INKPULSE", 48, 64);
  draw_label("OFFLINE HARDWARE TEST", 48, 104);
  bbep.fillRect(48, 126, 704, 3, BBEP_BLACK);

  bbep.drawRoundRect(48, 162, 440, 218, 18, BBEP_BLACK);
  draw_label("KEY3 PRESSES", 78, 208);
  draw_value(String(screen.press_count), 78, 292);

  bbep.drawRoundRect(520, 162, 232, 218, 18, BBEP_BLACK);
  draw_label("PREVIOUS TIME", 546, 208);
  draw_value(screen.last_refresh_ms == 0 ? String("STARTING") : String(screen.last_refresh_ms) + " ms", 546, 258);
  draw_label((String("NOW: ") + refresh_name(screen.refresh)).c_str(), 546, 318);

  draw_label("Wi-Fi is off  |  Press KEY3 to refresh", 48, 430);

  const int refresh_mode =
    screen.refresh == InkPulseDiagnosticRefresh::Full ? REFRESH_FULL : REFRESH_PARTIAL;
  const uint32_t started_ms = millis();
  display_update_epaper(refresh_mode, true, true, PLANE_0);
  return millis() - started_ms;
}

#endif // INKPULSE_DIAGNOSTIC
