# InkPulse firmware

This project will contain the ESP32-S3 firmware installed on the Seeed Studio
TRMNL 7.5-inch OG DIY Kit.

The implementation will begin from a pinned snapshot of the official
`usetrmnl/trmnl-firmware` project. InkPulse will preserve the upstream GPLv3
license and document the exact source revision in `UPSTREAM.md`.

The first firmware milestone will provide:

- the existing Wi-Fi provisioning and recovery path;
- a persistent connection to the InkPulse server when fast mode is enabled;
- WebSocket-driven screen revision notifications;
- hash-aware BMP downloads that skip unchanged frames;
- fast or partial e-paper refresh for normal changes;
- periodic full refreshes to control ghosting;
- immediate KEY3 refresh; and
- reconnect, offline display, and OTA recovery behavior.

No firmware source has been imported yet. That is the next project milestone
after the monorepo foundation is verified.
