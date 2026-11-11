import assert from "node:assert/strict";
import test from "node:test";

import { createCodexUsageSource, normalizeUsageResponse } from "../src/codex/usage-source.mjs";

const rawUsage = {
  ordinaryUsageAllowed: true,
  rateLimitResetCredits: {
    availableCount: 2,
    credits: [
      { status: "available", expiresAt: 1_796_163_185 },
      { status: "available", expiresAt: 1_796_067_099 },
      { status: "used", expiresAt: 1_700_000_000 },
    ],
  },
  rateLimitsByLimitId: {
    codex: {
      primary: { usedPercent: 31, resetsAt: 1_794_374_732 },
      secondary: { usedPercent: 17, resetsAt: 1_794_473_488 },
    },
  },
};

test("normalizes Codex limits and the next available reset expiration", () => {
  const usage = normalizeUsageResponse(rawUsage, new Date("2026-11-11T03:00:00Z"));

  assert.equal(usage.primary.remainingPercent, 69);
  assert.equal(usage.secondary.remainingPercent, 83);
  assert.equal(usage.resetCredits.availableCount, 2);
  assert.equal(usage.resetCredits.nextExpiresAt.toISOString(), "2026-11-30T19:31:39.000Z");
});

test("caches usage reads and shares an in-flight read", async () => {
  let reads = 0;
  const getUsage = createCodexUsageSource({
    cacheMs: 60_000,
    readUsage: async () => {
      reads += 1;
      return normalizeUsageResponse(rawUsage);
    },
  });

  const [first, second] = await Promise.all([getUsage(), getUsage()]);
  const third = await getUsage();

  assert.equal(reads, 1);
  assert.equal(first, second);
  assert.equal(second, third);
});

test("returns stale cached data when a refresh fails", async () => {
  let reads = 0;
  const getUsage = createCodexUsageSource({
    cacheMs: 0,
    readUsage: async () => {
      reads += 1;
      if (reads === 1) return normalizeUsageResponse(rawUsage);
      throw new Error("temporary failure");
    },
  });

  await getUsage();
  const stale = await getUsage();

  assert.equal(stale.stale, true);
  assert.equal(stale.primary.remainingPercent, 69);
});
