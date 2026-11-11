import assert from "node:assert/strict";
import test from "node:test";

import { createTrmnlServer, renderScreen } from "./server.mjs";

test("renders an 800x480 monochrome BMP", async () => {
  const bmp = await renderScreen({
    message: "Hello from the test!",
    timeZone: "America/Los_Angeles",
    now: new Date("2026-11-11T02:30:00Z"),
  });

  assert.equal(bmp.subarray(0, 2).toString("ascii"), "BM");
  assert.equal(bmp.readInt32LE(18), 800);
  assert.equal(bmp.readInt32LE(22), 480);
  assert.equal(bmp.readUInt16LE(28), 1);
  assert.equal(bmp.length, 48_062);
});

test("serves the TRMNL setup, display, and image endpoints", async (context) => {
  const { server } = createTrmnlServer({
    port: 3000,
    publicUrl: "http://127.0.0.1:3000",
    message: "Test screen",
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;

  const setupResponse = await fetch(`${origin}/api/setup`, {
    headers: { ID: "AA:BB:CC:12:34:56" },
  });
  const setup = await setupResponse.json();
  assert.equal(setup.status, 200);
  assert.equal(setup.friendly_id, "123456");

  const displayResponse = await fetch(`${origin}/api/display`, {
    headers: { ID: "AA:BB:CC:12:34:56" },
  });
  const display = await displayResponse.json();
  assert.equal(display.status, 0);
  assert.match(display.image_url, /screen\.bmp/);

  const imageResponse = await fetch(`${origin}/screen.bmp`);
  const image = Buffer.from(await imageResponse.arrayBuffer());
  assert.equal(imageResponse.headers.get("content-type"), "image/bmp");
  assert.equal(image.subarray(0, 2).toString("ascii"), "BM");
});
