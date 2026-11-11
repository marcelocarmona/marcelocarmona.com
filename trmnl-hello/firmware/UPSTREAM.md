# Upstream firmware

InkPulse firmware is based on a build-relevant snapshot of the official TRMNL
firmware repository.

- Repository: `https://github.com/usetrmnl/trmnl-firmware`
- Commit: `bd19281ff14dd5e24e02415c39951ec4540731e0`
- Imported: November 10, 2026
- License: GNU General Public License v3.0
- Hardware target: `TRMNL_7inch5_OG_DIY_Kit`

The imported snapshot excludes upstream repository metadata, editor settings,
marketing images, and the Ruby specification harness. It retains the embedded
source, PlatformIO tests, board definitions, build scripts, display assets, and
license required to build and modify the firmware.

InkPulse-specific changes should remain identifiable through the
`inkpulse_7in5` PlatformIO environment and the `INKPULSE_FIRMWARE` build flag.
Before syncing a newer upstream revision, build this target and record the new
commit here.
