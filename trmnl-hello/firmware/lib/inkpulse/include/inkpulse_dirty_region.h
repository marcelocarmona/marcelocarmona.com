#pragma once

#include <stddef.h>
#include <stdint.h>

namespace inkpulse {

struct DisplaySize {
  uint16_t width;
  uint16_t height;
};

// A logical rectangle whose pixels have changed in the framebuffer.
struct DirtyRegion {
  uint16_t x;
  uint16_t y;
  uint16_t width;
  uint16_t height;
};

bool isEmpty(const DirtyRegion &region);

// Clips a region to the display, then expands its horizontal edges to whole
// bytes as required by one-bit framebuffers. Returns an empty region when the
// requested rectangle does not intersect the display.
DirtyRegion prepareDirtyRegion(const DirtyRegion &region, DisplaySize display);

// Number of one-bit framebuffer bytes transferred for this prepared region.
size_t dirtyRegionByteCount(const DirtyRegion &region);

} // namespace inkpulse
