#pragma once

#include <inkpulse_dirty_region.h>
#include <inkpulse_diagnostic_renderer.h>
#include <inkpulse_refresh_mode.h>
#include <stddef.h>
#include <stdint.h>

struct InkPulseFramebufferView {
  const uint8_t *data;
  uint16_t width;
  uint16_t height;
  uint16_t stride;
  size_t size;
};

enum class InkPulseRefreshPath { FullFrame, DirtyRegions };

struct InkPulseRefreshStats {
  uint32_t total_ms;
  uint32_t transfer_ms;
  uint32_t panel_ms;
  size_t bytes_written;
  InkPulseRefreshPath path;
};

// Initializes the persistent one-bit framebuffer used by diagnostic mode.
bool inkpulse_diagnostic_screen_begin();

// Draws into the framebuffer without communicating with the physical panel.
void inkpulse_diagnostic_screen_draw(const inkpulse::DiagnosticScreenModel &screen);

// Sends the current framebuffer to the panel. Partial refreshes use the
// supplied dirty regions when supported, with a full-frame transfer fallback.
InkPulseRefreshStats inkpulse_diagnostic_screen_refresh(
    inkpulse::RefreshMode refresh, const inkpulse::DirtyRegion *dirty_regions = nullptr,
    size_t dirty_region_count = 0);

// Exposes a read-only view for diagnostic capture after a frame is drawn.
InkPulseFramebufferView inkpulse_diagnostic_framebuffer();
