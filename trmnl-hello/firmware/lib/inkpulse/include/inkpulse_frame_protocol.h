#pragma once

#include <stddef.h>
#include <stdint.h>

namespace inkpulse {

constexpr const char *frame_capture_command = "INKPULSE SCREENSHOT";
constexpr const char *frame_protocol_name = "INKPULSE_FRAME_V1";
constexpr const char *frame_protocol_end = "INKPULSE_FRAME_END";

constexpr size_t frameByteCount(uint16_t stride, uint16_t height) {
  return static_cast<size_t>(stride) * height;
}

uint32_t frameCrc32(const uint8_t *data, size_t size);

} // namespace inkpulse
