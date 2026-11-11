# InkPulse server

This project displays your remaining Codex/ChatGPT plan usage on an official
TRMNL device without a paid Private Plugin, plugin ID, or webhook. It shows the
5-hour and weekly limits, their reset times, the number of available reset
credits, and the next credit expiration.

It uses TRMNL's free BYOS (Build Your Own Server) mode and Codex's local,
read-only app-server interface. It does not store your ChatGPT password, API
key, session token, or reset-credit identifiers, and it never consumes a reset.

Your Mac must remain powered on, awake, and connected to the same Wi-Fi as the
TRMNL. The device pulls a new screen from the Mac every five minutes.

## Start the server

```sh
cd /Users/marcelocarmona/mc/marcelocarmona/trmnl-hello
npm install
npm start
```

The server automatically finds the Mac's Wi-Fi address. It prints something
like:

```text
Preview:       http://192.168.4.21:3000
Custom server: http://192.168.4.21:3000
```

Open the Preview URL in a browser to verify the display. If macOS asks whether
Node can accept incoming connections, choose **Allow**.

## Connect the TRMNL

1. Keep `npm start` running.
2. Hold the round button on the TRMNL for more than five seconds until the
   connection instructions appear.
3. On a phone or computer, connect to the Wi-Fi network named `TRMNL`.
4. In the setup page, choose **Custom server**.
5. Select your normal Wi-Fi and enter its password.
6. Enter the Custom server address printed by `npm start`, for example
   `http://192.168.4.21:3000`. Do not use `localhost` or `127.0.0.1`.
7. Finish setup. The server terminal will show requests from the device.

## Configuration

The `server/.env` file can contain:

```env
TRMNL_TIME_ZONE=America/Los_Angeles
TRMNL_REFRESH_SECONDS=300
TRMNL_USAGE_CACHE_SECONDS=60
```

Restart `npm start` after changing `.env`.

The server normally finds `codex` automatically. If it cannot, add the full
binary path:

```env
CODEX_BIN=/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex
```

Codex must be installed and signed in on the Mac running the server. The local
app-server interface is experimental, so the Codex adapter is isolated in
`src/codex/usage-source.mjs` in case the protocol changes.

## Architecture

- `src/codex/usage-source.mjs` reads and normalizes account usage, caches successful
  reads, and falls back to the last value after a temporary failure.
- `src/display/screen.mjs` renders normalized data into the 800×480 monochrome BMP.
- `src/index.mjs` implements the TRMNL BYOS HTTP endpoints and connects those two
  layers.

## Return the device to TRMNL cloud

Hold the round button for more than five seconds, connect to the `TRMNL` Wi-Fi,
choose **Soft reset**, then configure Wi-Fi again without a Custom server.

## Verify the project

```sh
npm test
```
