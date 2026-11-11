# Hello TRMNL — free local BYOS server

This project displays a message, date, and time on an official TRMNL device
without a paid Private Plugin, plugin ID, or webhook. It uses TRMNL's free BYOS
(Build Your Own Server) mode and runs entirely on your local Wi-Fi.

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

## Customize the screen

The existing `.env` file can contain:

```env
TRMNL_MESSAGE=Hello from my desk!
TRMNL_TIME_ZONE=America/Los_Angeles
TRMNL_REFRESH_SECONDS=300
```

Restart `npm start` after changing `.env`.

## Return the device to TRMNL cloud

Hold the round button for more than five seconds, connect to the `TRMNL` Wi-Fi,
choose **Soft reset**, then configure Wi-Fi again without a Custom server.

## Verify the project

```sh
npm test
```
