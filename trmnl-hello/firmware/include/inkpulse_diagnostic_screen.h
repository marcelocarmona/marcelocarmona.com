#pragma once

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

// Initializes the persistent one-bit framebuffer used by diagnostic mode.
bool inkpulse_diagnostic_screen_begin();

// Draws into the framebuffer without communicating with the physical panel.
void inkpulse_diagnostic_screen_draw(const inkpulse::DiagnosticScreenModel &screen);

// Sends the current framebuffer to the panel and returns the refresh duration.
uint32_t inkpulse_diagnostic_screen_refresh(inkpulse::RefreshMode refresh);

// Exposes a read-only view for diagnostic capture after a frame is drawn.
InkPulseFramebufferView inkpulse_diagnostic_framebuffer();
