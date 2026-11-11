import { spawn } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_CACHE_MS = 60_000;

function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function toDate(unixSeconds) {
  return Number.isFinite(unixSeconds) ? new Date(unixSeconds * 1000) : null;
}

export function normalizeUsageResponse(response, now = new Date()) {
  const limitsById = response?.rateLimitsByLimitId || {};
  const rateLimit = limitsById.codex || response?.rateLimits || Object.values(limitsById)[0];

  if (!rateLimit?.primary || !rateLimit?.secondary) {
    throw new Error("Codex did not return the expected usage limits");
  }

  const credits = response?.rateLimitResetCredits;
  const availableCredits = (credits?.credits || []).filter(
    (credit) => credit.status === "available" && Number.isFinite(credit.expiresAt),
  );
  const nextCredit = availableCredits.sort((a, b) => a.expiresAt - b.expiresAt)[0];

  return {
    fetchedAt: now,
    ordinaryUsageAllowed: response.ordinaryUsageAllowed !== false,
    primary: {
      label: "5-HOUR LIMIT",
      remainingPercent: clampPercent(100 - rateLimit.primary.usedPercent),
      resetsAt: toDate(rateLimit.primary.resetsAt),
    },
    secondary: {
      label: "WEEKLY LIMIT",
      remainingPercent: clampPercent(100 - rateLimit.secondary.usedPercent),
      resetsAt: toDate(rateLimit.secondary.resetsAt),
    },
    resetCredits: {
      availableCount: Math.max(0, Number(credits?.availableCount) || 0),
      nextExpiresAt: toDate(nextCredit?.expiresAt),
    },
  };
}

export function readCodexUsage(options = {}) {
  const codexBin = options.codexBin || process.env.CODEX_BIN || "codex";
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const child = spawn(codexBin, ["app-server", "--listen", "stdio://"], {
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let finished = false;

    const finish = (error, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      child.kill();

      if (error) reject(error);
      else resolve(value);
    };

    const send = (message) => {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    };

    const timer = setTimeout(() => {
      finish(new Error(`Timed out while reading Codex usage after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on("error", (error) => finish(error));
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-2_000);
    });
    child.on("exit", (code) => {
      if (!finished) {
        const detail = stderr.trim() ? `: ${stderr.trim()}` : "";
        finish(new Error(`Codex app-server exited with code ${code}${detail}`));
      }
    });
    child.stdout.on("data", (chunk) => {
      stdout += chunk;

      while (stdout.includes("\n")) {
        const newline = stdout.indexOf("\n");
        const line = stdout.slice(0, newline);
        stdout = stdout.slice(newline + 1);

        if (!line.trim()) continue;

        let message;
        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }

        if (message.id === 1) {
          if (message.error) {
            finish(new Error(`Could not initialize Codex: ${message.error.message}`));
            return;
          }

          send({ method: "initialized" });
          send({
            id: 2,
            method: "account/rateLimits/read",
            params: {
              excludeResetCreditDetails: false,
              supportsLunaReserve: false,
            },
          });
        }

        if (message.id === 2) {
          if (message.error) {
            finish(new Error(`Could not read Codex usage: ${message.error.message}`));
            return;
          }

          try {
            finish(null, normalizeUsageResponse(message.result));
          } catch (error) {
            finish(error);
          }
        }
      }
    });

    send({
      id: 1,
      method: "initialize",
      params: {
        clientInfo: {
          name: "trmnl_usage_display",
          title: "TRMNL Usage Display",
          version: "1.0.0",
        },
      },
    });
  });
}

export function createCodexUsageSource(options = {}) {
  const cacheMs = options.cacheMs ?? DEFAULT_CACHE_MS;
  const readUsage = options.readUsage || (() => readCodexUsage(options));
  let cachedUsage = null;
  let cachedAt = 0;
  let pendingRead = null;

  return async function getUsage() {
    if (cachedUsage && Date.now() - cachedAt < cacheMs) return cachedUsage;

    if (!pendingRead) {
      pendingRead = readUsage()
        .then((usage) => {
          cachedUsage = usage;
          cachedAt = Date.now();
          return usage;
        })
        .catch((error) => {
          if (cachedUsage) {
            console.warn(`Using cached Codex usage: ${error.message}`);
            return { ...cachedUsage, stale: true };
          }
          throw error;
        })
        .finally(() => {
          pendingRead = null;
        });
    }

    return pendingRead;
  };
}
