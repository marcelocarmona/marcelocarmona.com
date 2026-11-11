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

The `inkpulse_7in5` PlatformIO environment extends the official
`TRMNL_7inch5_OG_DIY_Kit` target. Until the fast-mode state machine is added, it
deliberately preserves the upstream runtime behavior.

Run the imported host-side firmware tests with:

```sh
npm run firmware:test
```

Do not flash a development build until its merged binary has compiled and the
official firmware recovery path has been verified.
