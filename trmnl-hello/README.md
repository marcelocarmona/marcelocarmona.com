# InkPulse

InkPulse is a personal ambient dashboard for the signals that shape your day.
It is designed for an 800×480 monochrome e-paper display and can grow beyond
Codex usage into health, development, social, and other daily metrics.

## Projects

- [`server/`](server/) contains the Node.js data adapters, UI renderer, device
  API, and—next—the real-time event service.
- [`firmware/`](firmware/) will contain the ESP32-S3 firmware installed on the
  Seeed Studio TRMNL 7.5-inch DIY display.

The server currently renders the working Codex usage dashboard through the
standard TRMNL BYOS protocol. The firmware project is the next implementation
milestone and will add persistent Wi-Fi, event-driven updates, and partial
e-paper refresh.

## Development

Install dependencies and start the server from the repository root:

```sh
npm install
npm start
```

Run all implemented project tests:

```sh
npm test
```

See [`server/README.md`](server/README.md) for device setup and configuration.
