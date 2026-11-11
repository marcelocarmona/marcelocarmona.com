#!/usr/bin/env node

import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { pathToFileURL } from "node:url";

import { createCodexUsageSource } from "./codex/usage-source.mjs";
import { renderUsageScreen } from "./display/screen.mjs";

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

export { renderUsageScreen as renderScreen } from "./display/screen.mjs";

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
  const timeZone =
    options.timeZone || process.env.TRMNL_TIME_ZONE || "America/Los_Angeles";
  const getUsage =
    options.getUsage ||
    createCodexUsageSource({
      cacheMs: Number(process.env.TRMNL_USAGE_CACHE_SECONDS || 60) * 1000,
    });

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
        let usage;
        let errorMessage;
        try {
          usage = await getUsage();
        } catch (error) {
          console.error(`Could not read Codex usage: ${error.message}`);
          errorMessage = "Make sure Codex is installed and signed in on this Mac.";
        }

        const image = await renderUsageScreen({ usage, errorMessage, timeZone });
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
            <title>Codex Usage — TRMNL</title>
            <style>
              body { background: #eee; font: 16px system-ui; margin: 2rem auto; max-width: 850px; }
              img { background: white; border: 1px solid #aaa; display: block; max-width: 100%; }
              code { background: white; padding: .2rem .4rem; }
            </style>
          </head>
          <body>
            <h1>Codex Usage — TRMNL</h1>
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
    console.log("\nInkPulse server is running.");
    console.log(`Preview:       ${publicUrl}`);
    console.log(`Custom server: ${publicUrl}`);
    console.log("Keep this terminal and your Mac awake while the TRMNL uses it.\n");
  });
}
