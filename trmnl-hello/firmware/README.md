# InkPulse firmware

This project contains the ESP32-S3 firmware installed on the Seeed Studio TRMNL
7.5-inch OG DIY Kit.

The implementation begins from a pinned snapshot of the official
`usetrmnl/trmnl-firmware` project. InkPulse preserves the upstream GPLv3 license
and documents the exact source revision in `UPSTREAM.md`.

The imported baseline already provides the supported board definition, display
driver, Wi-Fi provisioning, button handling, image download, sleep behavior,
and official recovery-compatible build layout.

The next firmware-only milestone is a safe hardware validation build that:

- boots with an identifiable InkPulse version in the serial log;
- renders a local static test frame without depending on the server;
- makes KEY3 update a visible counter immediately;
- measures full and partial refresh duration; and
- preserves a documented route back to the official firmware.

That validation mode now has its own `inkpulse_7in5_diagnostic` target. It is
kept separate from the normal runtime and does not initialize Wi-Fi, call an
API, or alter the saved network credentials. On boot it draws a local test
screen; each debounced KEY3 press increments a counter and starts a refresh in
about 30 ms, before the physical e-paper update time. It uses partial refreshes
for presses 1–7 and a full refresh on every eighth press to limit ghosting.

After that hardware baseline is proven, later milestones can add:

- a persistent connection to the InkPulse server when fast mode is enabled;
- WebSocket-driven screen revision notifications;
- hash-aware BMP downloads that skip unchanged frames;
- fast or partial e-paper refresh for normal changes;
- periodic full refreshes to control ghosting;
- immediate KEY3 refresh; and
- reconnect, offline display, and OTA recovery behavior.

## Build

From the monorepo root, create the isolated PlatformIO environment once:

```sh
npm run firmware:setup
```

Compile the exact InkPulse board target:

```sh
npm run firmware:build
```

Compile the offline hardware diagnostic target:

```sh
npm run firmware:build:diagnostic
```

Its complete flash image is generated at
`.pio/build/inkpulse_7in5_diagnostic/FW1.8.19-inkpulse_7in5_diagnostic.bin`.
Building this file does not modify a connected board.

## Display pipeline and screenshots

Diagnostic screens use a small layered display pipeline:

1. `DiagnosticScreenModel` contains display data only.
2. `renderDiagnosticScreen` draws that model through the panel-independent
   `Canvas` interface.
3. The ESP32 adapter owns the bb_epaper framebuffer and panel refresh.
4. The diagnostic capture service can export the completed framebuffer over
   USB without coupling transport code to the renderer.

KEY3 updates declare two explicit dirty regions for the changing counter,
timing, and mode values. The panel adapter clips those rectangles, aligns them
to one-bit byte boundaries, and uses them only when a controller supports safe
single-plane regional updates. UC81xx panels, including the current 7.5-inch
InkPulse hardware, require coordinated old and new planes and therefore use the
existing full-frame partial-refresh path. Full refreshes, unsupported panels,
invalid orientation, or an unavailable previous panel image use that same safe
fallback. Serial timing separates framebuffer transfer time from the physical
panel operation so optimization work can target the actual bottleneck.

The versioned capture protocol includes the image dimensions, row stride, byte
count, and CRC32. It is compiled only in the diagnostic target. From the
monorepo root, capture the framebuffer with:

```sh
npm run screen:capture
```

The local tool validates the transfer and writes a PNG under the Git-ignored
`artifacts/screenshots/` directory. A framebuffer capture verifies exact
rendered pixels; use a physical photo separately to assess panel ghosting and
contrast.

The `inkpulse_7in5` PlatformIO environment extends the official
`TRMNL_7inch5_OG_DIY_Kit` target. Until the fast-mode state machine is added, it
deliberately preserves the upstream runtime behavior.

Run the imported host-side firmware tests with:

```sh
npm run firmware:test
```

Do not flash a development build until its merged binary has compiled and the
official firmware recovery path has been verified.
