#ifdef INKPULSE_DIAGNOSTIC

#include "inkpulse_diagnostic_screen.h"

#include <Arduino.h>
#include <display_internal.h>
#include <epd_driver.h>
#include <fonts.h>
#include <globals.h>
#include <inkpulse_canvas.h>
#include <inkpulse_diagnostic_renderer.h>

namespace {

class BbEpaperCanvas final : public inkpulse::Canvas {
public:
  void clear() override {
    bbep.fillScreen(BBEP_WHITE);
    bbep.setTextColor(BBEP_BLACK, BBEP_WHITE);
  }

  void drawText(const char *text, int x, int y, inkpulse::TextStyle style,
                inkpulse::TextAlign align) override {
    bbep.setFont(style == inkpulse::TextStyle::Label ? Inter_18 : Roboto_Black_24);
    int draw_x = x;
    if (align == inkpulse::TextAlign::Right) {
      BB_RECT bounds = {};
      bbep.setCursor(0, y);
      bbep.getStringBox(text, &bounds);
      draw_x -= bounds.w;
    }
    bbep.drawString(text, draw_x, y);
  }

  void drawHorizontalLine(int x, int y, int width, int thickness) override {
    bbep.fillRect(x, y, width, thickness, BBEP_BLACK);
  }

  void drawRoundRect(int x, int y, int width, int height, int radius) override {
    bbep.drawRoundRect(x, y, width, height, radius, BBEP_BLACK);
  }
};

BbEpaperCanvas canvas;

} // namespace

bool inkpulse_diagnostic_screen_begin() {
  display_prepare_message();
  return bbep.getBuffer() != nullptr;
}

void inkpulse_diagnostic_screen_draw(const inkpulse::DiagnosticScreenModel &screen) {
  inkpulse::renderDiagnosticScreen(canvas, screen);
}

uint32_t inkpulse_diagnostic_screen_refresh(inkpulse::RefreshMode refresh) {
  const int refresh_mode = refresh == inkpulse::RefreshMode::Full ? REFRESH_FULL : REFRESH_PARTIAL;
  const uint32_t started_ms = millis();
  display_update_epaper(refresh_mode, true, true, PLANE_0);
  return millis() - started_ms;
}

InkPulseFramebufferView inkpulse_diagnostic_framebuffer() {
  const uint16_t width = bbep.width();
  const uint16_t height = bbep.height();
  const uint16_t stride = (width + 7u) / 8u;
  return {
    static_cast<const uint8_t *>(bbep.getBuffer()),
    width,
    height,
    stride,
    static_cast<size_t>(stride) * height,
  };
}

#endif // INKPULSE_DIAGNOSTIC
