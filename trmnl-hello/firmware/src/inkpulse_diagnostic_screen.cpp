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

  draw_value("INKPULSE", 48, 62);
  draw_label("DISPLAY RESPONSE LAB", 48, 100);
  draw_label("OFFLINE", 654, 82);
  bbep.fillRect(48, 124, 704, 3, BBEP_BLACK);

  bbep.drawRoundRect(48, 158, 440, 220, 18, BBEP_BLACK);
  draw_label("KEY3 INPUT", 78, 204);
  draw_value(String(screen.press_count), 78, 286);
  draw_label("PRESS COUNT", 78, 342);

  bbep.drawRoundRect(520, 158, 232, 220, 18, BBEP_BLACK);
  draw_label("LAST REFRESH", 546, 204);
  draw_value(screen.last_refresh_ms == 0 ? String("WAITING") : String(screen.last_refresh_ms) + " ms", 546, 256);
  draw_label("CURRENT MODE", 546, 314);
  draw_value(refresh_name(screen.refresh), 546, 354);

  bbep.fillRect(48, 408, 704, 2, BBEP_BLACK);
  draw_label("LOCAL TEST  |  WI-FI OFF", 48, 446);
  draw_label("KEY3: REFRESH", 596, 446);

  const int refresh_mode =
    screen.refresh == InkPulseDiagnosticRefresh::Full ? REFRESH_FULL : REFRESH_PARTIAL;
  const uint32_t started_ms = millis();
  display_update_epaper(refresh_mode, true, true, PLANE_0);
  return millis() - started_ms;
}

#endif // INKPULSE_DIAGNOSTIC
