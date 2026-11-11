#include "inkpulse_frame_protocol.h"

namespace inkpulse {

uint32_t frameCrc32(const uint8_t *data, size_t size) {
  uint32_t crc = 0xffffffffu;
  for (size_t index = 0; index < size; index++) {
    crc ^= data[index];
    for (uint8_t bit = 0; bit < 8; bit++) {
      const uint32_t mask = -(crc & 1u);
      crc = (crc >> 1u) ^ (0xedb88320u & mask);
    }
  }
  return crc ^ 0xffffffffu;
}

} // namespace inkpulse
