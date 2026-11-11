#!/usr/bin/env node

import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { pathToFileURL } from "node:url";

import sharp from "sharp";

const SCREEN_WIDTH = 800;
const SCREEN_HEIGHT = 480;
const DEFAULT_PORT = 3000;
const DEFAULT_REFRESH_SECONDS = 300;
const DEFAULT_TOKEN = "trmnl-local-free-server";

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function wrapMessage(message, maxCharacters = 30) {
  const words = message.trim().split(/\s+/);
  const lines = [];

  for (const word of words) {
    const current = lines.at(-1);

    if (!current || `${current} ${word}`.length > maxCharacters) {
      lines.push(word);
    } else {
      lines[lines.length - 1] = `${current} ${word}`;
    }
  }

  if (lines.length > 2) {
    const secondLine = lines.slice(1).join(" ");
    lines.splice(1, lines.length - 1, `${secondLine.slice(0, maxCharacters - 1)}…`);
  }

  return lines.slice(0, 2);
}

function screenSvg({ message, timeZone, now = new Date() }) {
  const date = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone,
  }).format(now);

  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(now);

  const lines = wrapMessage(message);
  const lineMarkup = lines
    .map(
      (line, index) =>
        `<text x="400" y="${350 + index * 42}" text-anchor="middle" class="message">${escapeXml(line)}</text>`,
    )
    .join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="480" viewBox="0 0 800 480">
      <style>
        text { fill: #000; font-family: Arial, Helvetica, sans-serif; }
        .date { font-size: 22px; font-weight: 700; }
        .time { font-size: 112px; font-weight: 400; }
        .message { font-size: 31px; font-weight: 700; }
        .footer { font-size: 18px; font-weight: 700; }
      </style>
      <rect width="800" height="480" fill="#fff"/>
      <rect x="274" y="74" width="252" height="38" rx="9" fill="#fff" stroke="#000" stroke-width="3"/>
      <text x="400" y="100" text-anchor="middle" class="date">${escapeXml(date)}</text>
      <text x="400" y="288" text-anchor="middle" class="time">${escapeXml(time)}</text>
      ${lineMarkup}
      <rect x="12" y="430" width="776" height="38" rx="9" fill="#ddd"/>
      <text x="30" y="456" class="footer">HELLO TRMNL</text>
      <text x="770" y="456" text-anchor="end" class="footer">FREE LOCAL SERVER</text>
    </svg>
  `;
}

function encodeMonochromeBmp(pixels, width, height) {
  const rowBytes = Math.ceil(width / 32) * 4;
  const pixelDataSize = rowBytes * height;
  const pixelOffset = 14 + 40 + 8;
  const fileSize = pixelOffset + pixelDataSize;
  const bmp = Buffer.alloc(fileSize);

  bmp.write("BM", 0, "ascii");
  bmp.writeUInt32LE(fileSize, 2);
  bmp.writeUInt32LE(pixelOffset, 10);
  bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(width, 18);
  bmp.writeInt32LE(height, 22);
  bmp.writeUInt16LE(1, 26);
  bmp.writeUInt16LE(1, 28);
  bmp.writeUInt32LE(0, 30);
  bmp.writeUInt32LE(pixelDataSize, 34);
  bmp.writeInt32LE(2835, 38);
  bmp.writeInt32LE(2835, 42);
  bmp.writeUInt32LE(2, 46);
  bmp.writeUInt32LE(2, 50);

  // Palette entries are BGRA: black, then white.
  bmp.set([0, 0, 0, 0, 255, 255, 255, 0], 54);

  for (let outputRow = 0; outputRow < height; outputRow += 1) {
    const sourceRow = height - 1 - outputRow;
    const outputOffset = pixelOffset + outputRow * rowBytes;

    for (let x = 0; x < width; x += 1) {
      const isWhite = pixels[sourceRow * width + x] >= 160;

      if (isWhite) {
        bmp[outputOffset + Math.floor(x / 8)] |= 0x80 >> (x % 8);
      }
    }
  }

  return bmp;
}

export async function renderScreen(options = {}) {
  const svg = screenSvg({
    message: options.message || "Hello from your TRMNL!",
    timeZone: options.timeZone || "America/Los_Angeles",
    now: options.now,
  });

  const pixels = await sharp(Buffer.from(svg))
    .resize(SCREEN_WIDTH, SCREEN_HEIGHT)
    .flatten({ background: "white" })
    .grayscale()
    .raw()
    .toBuffer();

  return encodeMonochromeBmp(pixels, SCREEN_WIDTH, SCREEN_HEIGHT);
}

export function findLanAddress() {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses || []) {
      if (
        address.family === "IPv4" &&
        !address.internal &&
        (address.address.startsWith("10.") ||
          address.address.startsWith("192.168.") ||
          /^172\.(1[6-9]|2\d|3[01])\./.test(address.address))
      ) {
        return address.address;
      }
    }
  }

  return "127.0.0.1";
}

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(value));
}

function friendlyId(request) {
  const mac = request.headers.id || "LOCAL1";
  return mac.replaceAll(":", "").slice(-6).toUpperCase();
}

export function createTrmnlServer(options = {}) {
  const port = options.port || Number(process.env.PORT) || DEFAULT_PORT;
  const publicUrl = (
    options.publicUrl ||
    process.env.TRMNL_PUBLIC_URL ||
    `http://${findLanAddress()}:${port}`
  ).replace(/\/$/, "");
  const refreshSeconds =
    options.refreshSeconds ||
    Number(process.env.TRMNL_REFRESH_SECONDS) ||
    DEFAULT_REFRESH_SECONDS;
  const token = options.token || process.env.TRMNL_DEVICE_TOKEN || DEFAULT_TOKEN;
  const message = options.message || process.env.TRMNL_MESSAGE || "Hello from your TRMNL!";
  const timeZone =
    options.timeZone || process.env.TRMNL_TIME_ZONE || "America/Los_Angeles";

  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", publicUrl);
    const deviceId = request.headers.id || "unknown device";
    console.log(`${request.method} ${url.pathname} — ${deviceId}`);

    if (request.method === "GET" && url.pathname === "/api/setup") {
      return sendJson(response, 200, {
        status: 200,
        api_key: token,
        friendly_id: friendlyId(request),
        image_url: `${publicUrl}/screen.bmp`,
        filename: "hello-trmnl-setup",
        message: "Welcome to your free local TRMNL server",
      });
    }

    if (request.method === "GET" && url.pathname === "/api/display") {
      const revision = Math.floor(Date.now() / 60_000);
      return sendJson(response, 200, {
        status: 0,
        image_url: `${publicUrl}/screen.bmp?v=${revision}`,
        filename: `hello-trmnl-${revision}`,
        update_firmware: false,
        firmware_url: null,
        refresh_rate: refreshSeconds,
        reset_firmware: false,
        special_function: "none",
      });
    }

    if (request.method === "POST" && url.pathname === "/api/log") {
      request.resume();
      response.writeHead(204);
      return response.end();
    }

    if (request.method === "GET" && url.pathname === "/screen.bmp") {
      try {
        const image = await renderScreen({ message, timeZone });
        response.writeHead(200, {
          "Cache-Control": "no-store",
          "Content-Length": image.length,
          "Content-Type": "image/bmp",
        });
        return response.end(image);
      } catch (error) {
        console.error(error);
        return sendJson(response, 500, { error: "Could not render screen" });
      }
    }

    if (request.method === "GET" && url.pathname === "/") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return response.end(`<!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Hello TRMNL BYOS</title>
            <style>
              body { background: #eee; font: 16px system-ui; margin: 2rem auto; max-width: 850px; }
              img { background: white; border: 1px solid #aaa; display: block; max-width: 100%; }
              code { background: white; padding: .2rem .4rem; }
            </style>
          </head>
          <body>
            <h1>Hello TRMNL — free local server</h1>
            <p>Use <code>${escapeXml(publicUrl)}</code> as the Custom server address on your TRMNL.</p>
            <img src="/screen.bmp?v=${Date.now()}" width="800" height="480" alt="TRMNL screen preview">
          </body>
        </html>`);
    }

    return sendJson(response, 404, { error: "Not found" });
  });

  return { server, port, publicUrl };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { server, port, publicUrl } = createTrmnlServer();
  server.listen(port, "0.0.0.0", () => {
    console.log("\nFree TRMNL server is running.");
    console.log(`Preview:       ${publicUrl}`);
    console.log(`Custom server: ${publicUrl}`);
    console.log("Keep this terminal and your Mac awake while the TRMNL uses it.\n");
  });
}
