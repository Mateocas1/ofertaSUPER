#!/usr/bin/env node
// Posts the daily price-drops digest to the public Telegram channel (#548
// slice 2). Reads the committed data/price-drops.json; without both
// TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID it logs
// "skipped: not configured" and exits 0, so the cloud job stays green while the
// channel does not exist yet. Setup: docs/RUNBOOK.md -> "Price drop alerts".

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parsePriceDrops, type PriceDropsPayload } from "../src/lib/price-drops";
import { postPriceDropsDigest, readTelegramConfig, type PostOutcome } from "./lib/price-drops-poster";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SITE_URL = "https://ofertas-super.vercel.app";
const DEFAULT_PAYLOAD_PATH = resolve(repoRoot, "data", "price-drops.json");

export type PosterRun = {
  outcome: PostOutcome;
  payload: PriceDropsPayload;
};

export type PosterOptions = {
  env: Record<string, string | undefined>;
  payloadPath?: string;
  now?: Date;
  fetchImpl?: typeof fetch;
};

export function siteUrlFromEnv(env: Record<string, string | undefined>): string {
  const configured = env.NEXT_PUBLIC_SITE_URL?.trim();
  return (configured && configured !== "" ? configured : DEFAULT_SITE_URL).replace(/\/$/, "");
}

function readPayload(path: string): PriceDropsPayload {
  return parsePriceDrops(JSON.parse(readFileSync(path, "utf8")));
}

/** Exported for tests: the same path the workflow runs, with injectable inputs. */
export async function runPoster(options: PosterOptions): Promise<PosterRun> {
  const payload = readPayload(options.payloadPath ?? DEFAULT_PAYLOAD_PATH);
  const today = (options.now ?? new Date()).toISOString().slice(0, 10);

  // A failed export leaves yesterday's payload in place; posting it again would
  // repeat the previous digest in the channel.
  if (payload.date !== today) {
    return { outcome: { action: "skipped", reason: `skipped: payload is from ${payload.date}, not ${today}` }, payload };
  }

  return {
    outcome: await postPriceDropsDigest({
      payload,
      config: readTelegramConfig(options.env),
      siteUrl: siteUrlFromEnv(options.env),
      fetchImpl: options.fetchImpl,
    }),
    payload,
  };
}

export async function main(): Promise<void> {
  const { outcome, payload } = await runPoster({ env: process.env });

  if (outcome.action === "skipped") {
    console.log(`post-price-drops: ${outcome.reason}`);
    return;
  }
  if (outcome.action === "failed") {
    console.error(`post-price-drops: failed: ${outcome.reason}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `post-price-drops: posted the ${payload.date} digest (${payload.drops.length} of ` +
      `${payload.totalDrops} drops, message ${outcome.messageId ?? "unknown"})`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
