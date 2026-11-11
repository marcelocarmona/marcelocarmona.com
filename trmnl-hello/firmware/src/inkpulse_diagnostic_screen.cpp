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

bool canRefreshDirtyRegions(inkpulse::RefreshMode refresh, size_t dirty_region_count) {
  return refresh == inkpulse::RefreshMode::Partial && dirty_region_count > 0 && bCanDoPartial &&
         // UC81xx differential updates need coordinated old and new planes.
         // InkPulse currently owns only the new framebuffer, so a region write
         // would run a refresh cycle without producing a visible change.
         bbep.getChip() != BBEP_CHIP_UC81xx &&
         bbep.hasPartialRefresh() && bbep.getMemoryMode() == BB_MODE_1BPP &&
         bbep.getRotation() == 0;
}

size_t fullFrameByteCount() {
  return static_cast<size_t>((bbep.width() + 7u) / 8u) * bbep.height();
}

} // namespace

bool inkpulse_diagnostic_screen_begin() {
  display_prepare_message();
  return bbep.getBuffer() != nullptr;
}

void inkpulse_diagnostic_screen_draw(const inkpulse::DiagnosticScreenModel &screen) {
  inkpulse::renderDiagnosticScreen(canvas, screen);
}

InkPulseRefreshStats inkpulse_diagnostic_screen_refresh(
    inkpulse::RefreshMode refresh, const inkpulse::DirtyRegion *dirty_regions,
    size_t dirty_region_count) {
  const int refresh_mode = refresh == inkpulse::RefreshMode::Full ? REFRESH_FULL : REFRESH_PARTIAL;
  const uint32_t started_ms = millis();

  if (dirty_regions != nullptr && canRefreshDirtyRegions(refresh, dirty_region_count)) {
    const inkpulse::DisplaySize display = {
      static_cast<uint16_t>(bbep.width()),
      static_cast<uint16_t>(bbep.height()),
    };
    size_t bytes_written = 0;
    size_t regions_written = 0;
    for (size_t index = 0; index < dirty_region_count; ++index) {
      const inkpulse::DirtyRegion region = inkpulse::prepareDirtyRegion(dirty_regions[index], display);
      if (inkpulse::isEmpty(region)) {
        continue;
      }
      bbep.writeRegion(region.x, region.y, region.width, region.height, PLANE_0);
      bytes_written += inkpulse::dirtyRegionByteCount(region);
      ++regions_written;
    }

    if (regions_written > 0) {
      const uint32_t transfer_ms = millis() - started_ms;
      const uint32_t panel_started_ms = millis();
      bbep.refresh(REFRESH_PARTIAL, true);
      const uint32_t panel_ms = millis() - panel_started_ms;
      return {
        millis() - started_ms,
        transfer_ms,
        panel_ms,
        bytes_written,
        InkPulseRefreshPath::DirtyRegions,
      };
    }
  }

  display_update_epaper(refresh_mode, true, true, PLANE_0);
  const uint32_t total_ms = millis() - started_ms;
  return {
    total_ms,
    static_cast<uint32_t>(bbep.dataTime()),
    static_cast<uint32_t>(bbep.opTime()),
    fullFrameByteCount(),
    InkPulseRefreshPath::FullFrame,
  };
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
