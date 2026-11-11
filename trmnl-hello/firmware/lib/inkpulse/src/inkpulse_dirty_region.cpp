#include "inkpulse_dirty_region.h"

#include <algorithm>

namespace inkpulse {

bool isEmpty(const DirtyRegion &region) { return region.width == 0 || region.height == 0; }

DirtyRegion prepareDirtyRegion(const DirtyRegion &region, DisplaySize display) {
  if (isEmpty(region) || display.width == 0 || display.height == 0 || region.x >= display.width ||
      region.y >= display.height) {
    return {0, 0, 0, 0};
  }

  const uint32_t requested_right = static_cast<uint32_t>(region.x) + region.width;
  const uint32_t requested_bottom = static_cast<uint32_t>(region.y) + region.height;
  const uint16_t clipped_right = static_cast<uint16_t>(
      std::min<uint32_t>(requested_right, static_cast<uint32_t>(display.width)));
  const uint16_t clipped_bottom = static_cast<uint16_t>(
      std::min<uint32_t>(requested_bottom, static_cast<uint32_t>(display.height)));

  const uint16_t aligned_left = static_cast<uint16_t>(region.x & ~uint16_t{7});
  const uint16_t aligned_right = static_cast<uint16_t>(
      std::min<uint32_t>((static_cast<uint32_t>(clipped_right) + 7u) & ~uint32_t{7},
                         static_cast<uint32_t>(display.width)));

  return {
    aligned_left,
    region.y,
    static_cast<uint16_t>(aligned_right - aligned_left),
    static_cast<uint16_t>(clipped_bottom - region.y),
  };
}

size_t dirtyRegionByteCount(const DirtyRegion &region) {
  if (isEmpty(region)) {
    return 0;
  }
  return static_cast<size_t>((region.width + 7u) / 8u) * region.height;
}

} // namespace inkpulse
