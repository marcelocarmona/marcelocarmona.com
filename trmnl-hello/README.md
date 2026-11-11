# InkPulse

InkPulse is a personal ambient dashboard for the signals that shape your day.
It is designed for an 800×480 monochrome e-paper display and can grow beyond
Codex usage into health, development, social, and other daily metrics.

## Projects

- [`server/`](server/) contains the Node.js data adapters, UI renderer, device
  API, and the working Codex usage dashboard.
- [`firmware/`](firmware/) contains the ESP32-S3 code installed on the Seeed
  Studio TRMNL 7.5-inch OG DIY display.

The server currently renders the working Codex usage dashboard through the
standard TRMNL BYOS protocol. The firmware starts from a pinned, buildable
snapshot of the official TRMNL firmware so InkPulse can evolve without losing
the supported board configuration, provisioning flow, or recovery path.

## Development

Install dependencies and start the server from the repository root:

```sh
npm install
npm start
```

Run the server tests:

```sh
npm test
```

Set up, build, and test the firmware:

```sh
npm run firmware:setup
npm run firmware:build
npm run firmware:test
```

After the firmware environment is installed, run both project suites with
`npm run test:all`.

See [`server/README.md`](server/README.md) for device setup and configuration,
and [`firmware/README.md`](firmware/README.md) for the firmware target and safe
development sequence.
