import sharp from "sharp";

const SCREEN_WIDTH = 800;
const SCREEN_HEIGHT = 480;

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function dateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    timeZone,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day));
}

function formatReset(date, timeZone, now) {
  if (!date) return "Unknown";
  const daysAway = Math.round((dateParts(date, timeZone) - dateParts(now, timeZone)) / 86_400_000);
  const day =
    daysAway === 0
      ? "Today"
      : daysAway === 1
        ? "Tomorrow"
        : new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone }).format(date);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(date);

  return `${day} · ${time}`;
}

function formatExpiration(date, timeZone) {
  if (!date) return "Expiration unavailable";
  return `Next expires ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  })
    .format(date)
    .replace(",", " ·")}`;
}

function progressBar({ x, y, width, height, percent }) {
  const safePercent = Math.max(0, Math.min(100, percent));
  const fillWidth = Math.round(width * (safePercent / 100));

  return `
    <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#fff" stroke="#000" stroke-width="3"/>
    ${fillWidth > 0 ? `<rect x="${x}" y="${y}" width="${fillWidth}" height="${height}" fill="#000"/>` : ""}
  `;
}

function usageSvg({ usage, timeZone, now }) {
  const updated = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(usage.fetchedAt || now);
  const status = usage.stale ? `STALE · ${updated}` : `LIVE · ${updated}`;
  const primaryPercent = Math.max(0, Math.min(100, usage.primary.remainingPercent));
  const secondaryPercent = Math.max(0, Math.min(100, usage.secondary.remainingPercent));
  const resetCount = usage.resetCredits.availableCount;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="480" viewBox="0 0 800 480">
      <style>
        text { fill: #000; font-family: Arial, Helvetica, sans-serif; }
        .brand { font-size: 29px; font-weight: 900; letter-spacing: 1.5px; }
        .section { font-size: 24px; font-weight: 500; }
        .status { font-size: 16px; font-weight: 800; letter-spacing: .8px; }
        .hero-number { font-size: 112px; font-weight: 800; letter-spacing: -6px; }
        .left-label { font-size: 18px; font-weight: 800; letter-spacing: 3px; }
        .eyebrow { font-size: 18px; font-weight: 800; letter-spacing: 1.4px; }
        .reset-time { font-size: 25px; font-weight: 700; }
        .weekly-number { font-size: 43px; font-weight: 800; letter-spacing: -1px; }
        .weekly-reset { font-size: 20px; font-weight: 700; }
        .credit-number { fill: #fff; font-size: 37px; font-weight: 900; }
        .credit-title { font-size: 22px; font-weight: 900; letter-spacing: .4px; }
        .credit-detail { font-size: 17px; font-weight: 600; }
      </style>
      <rect width="800" height="480" fill="#fff"/>
      <text x="40" y="45" class="brand">INKPULSE</text>
      <text x="202" y="45" class="section">/ CODEX</text>
      <text x="760" y="44" text-anchor="end" class="status">${escapeXml(status)}</text>
      <line x1="40" y1="64" x2="760" y2="64" stroke="#000" stroke-width="3"/>

      <text x="38" y="188" class="hero-number">${primaryPercent}%</text>
      <text x="47" y="220" class="left-label">LEFT</text>
      <text x="322" y="108" class="eyebrow">5-HOUR WINDOW</text>
      <text x="322" y="146" class="reset-time">Resets ${escapeXml(formatReset(usage.primary.resetsAt, timeZone, now))}</text>
      ${progressBar({ x: 322, y: 174, width: 438, height: 25, percent: primaryPercent })}

      <line x1="40" y1="246" x2="760" y2="246" stroke="#000" stroke-width="2"/>
      <text x="40" y="280" class="eyebrow">WEEKLY WINDOW</text>
      <text x="40" y="330" class="weekly-number">${secondaryPercent}% LEFT</text>
      <text x="760" y="322" text-anchor="end" class="weekly-reset">Resets ${escapeXml(formatReset(usage.secondary.resetsAt, timeZone, now))}</text>
      ${progressBar({ x: 40, y: 344, width: 720, height: 18, percent: secondaryPercent })}

      <rect x="40" y="386" width="720" height="70" rx="8" fill="#fff" stroke="#000" stroke-width="3"/>
      <path d="M48 386 H112 V456 H48 Q40 456 40 448 V394 Q40 386 48 386 Z" fill="#000"/>
      <text x="76" y="432" text-anchor="middle" class="credit-number">${resetCount}</text>
      <text x="132" y="416" class="credit-title">RESET CREDIT${resetCount === 1 ? "" : "S"} AVAILABLE</text>
      <text x="132" y="442" class="credit-detail">${escapeXml(formatExpiration(usage.resetCredits.nextExpiresAt, timeZone))}</text>
    </svg>
  `;
}

function unavailableSvg({ message }) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="480" viewBox="0 0 800 480">
      <style>text { fill: #000; font-family: Arial, Helvetica, sans-serif; }</style>
      <rect width="800" height="480" fill="#fff"/>
      <text x="400" y="170" text-anchor="middle" font-size="38" font-weight="800">INKPULSE</text>
      <text x="400" y="245" text-anchor="middle" font-size="27" font-weight="700">Usage information unavailable</text>
      <text x="400" y="292" text-anchor="middle" font-size="19">${escapeXml(message)}</text>
      <text x="400" y="365" text-anchor="middle" font-size="18" font-weight="700">The server will try again on the next refresh.</text>
    </svg>
  `;
}

export function encodeMonochromeBmp(pixels, width, height) {
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
  bmp.set([0, 0, 0, 0, 255, 255, 255, 0], 54);

  for (let outputRow = 0; outputRow < height; outputRow += 1) {
    const sourceRow = height - 1 - outputRow;
    const outputOffset = pixelOffset + outputRow * rowBytes;

    for (let x = 0; x < width; x += 1) {
      if (pixels[sourceRow * width + x] >= 160) {
        bmp[outputOffset + Math.floor(x / 8)] |= 0x80 >> (x % 8);
      }
    }
  }

  return bmp;
}

export async function renderUsageScreen(options = {}) {
  const timeZone = options.timeZone || "America/Los_Angeles";
  const now = options.now || new Date();
  const svg = options.usage
    ? usageSvg({ usage: options.usage, timeZone, now })
    : unavailableSvg({ message: options.errorMessage || "Make sure Codex is signed in on this Mac." });
  const pixels = await sharp(Buffer.from(svg))
    .resize(SCREEN_WIDTH, SCREEN_HEIGHT)
    .flatten({ background: "white" })
    .grayscale()
    .raw()
    .toBuffer();

  return encodeMonochromeBmp(pixels, SCREEN_WIDTH, SCREEN_HEIGHT);
}
