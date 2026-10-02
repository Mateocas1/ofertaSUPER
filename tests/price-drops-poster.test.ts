import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import {
  buildPriceDropsDigest,
  DIGEST_MAX_DROPS,
  postPriceDropsDigest,
  readTelegramConfig,
  TELEGRAM_API_BASE,
  TELEGRAM_TEXT_LIMIT,
} from "../scripts/lib/price-drops-poster";
import { runPoster, siteUrlFromEnv } from "../scripts/post-price-drops";
import { formatDropAmount, formatDropPercent, storeLabel, type PriceDrop, type PriceDropsPayload } from "../src/lib/price-drops";

// The Telegram poster is optional infrastructure: it must be a silent no-op
// until the owner creates the bot, and its payload is checked with a fake fetch
// so no test ever talks to Telegram.

const SITE = "https://ofertas-super.vercel.app";
const TOKEN = "123456:TEST-TOKEN-NEVER-LOGGED";
const CHAT = "-1001234567890";
const DATE = "2027-01-15";

function drop(index: number, overrides: Partial<PriceDrop> = {}): PriceDrop {
  return {
    ean: `077912345000${String(index).padStart(2, "0")}`,
    date: DATE,
    source: index % 2 === 0 ? "carrefour" : "disco",
    name: `Producto ${index}`,
    brand: "Marca",
    category: "Almacén",
    imageUrl: null,
    previousPrice: 1000 + index,
    currentPrice: 700 + index,
    amountDrop: 300,
    percentDrop: 30,
    previousObservedAt: "2027-01-05T10:00:00.000Z",
    observedAt: "2027-01-15T10:00:00.000Z",
    productUrl: null,
    ...overrides,
  };
}

function payload(count: number): PriceDropsPayload {
  const drops = Array.from({ length: count }, (_, index) => drop(index + 1));
  return {
    schemaVersion: 1,
    generatedAt: "2027-01-15T12:00:00.000Z",
    date: DATE,
    rules: { minPercentDrop: 10, minAmountDrop: 100, windowDays: 14, maxAgeHours: 24, limit: 100 },
    totalDrops: drops.length,
    drops,
  };
}

type CapturedCall = { url: string; body: Record<string, unknown> };

function capturingFetch(status = 200, body: unknown = { ok: true, result: { message_id: 42 } }) {
  const calls: CapturedCall[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

describe("telegram price-drops poster", () => {
  it("is a no-op without a token or a channel", async () => {
    for (const config of [
      { token: null, chatId: null },
      { token: TOKEN, chatId: null },
      { token: null, chatId: CHAT },
    ]) {
      const outcome = await postPriceDropsDigest({ payload: payload(3), config, siteUrl: SITE });
      assert.deepEqual(outcome, { action: "skipped", reason: "skipped: not configured" });
    }
  });

  it("treats blank environment values as missing", () => {
    assert.deepEqual(readTelegramConfig({}), { token: null, chatId: null });
    assert.deepEqual(readTelegramConfig({ TELEGRAM_BOT_TOKEN: "  ", TELEGRAM_CHANNEL_ID: "" }), {
      token: null,
      chatId: null,
    });
    assert.deepEqual(readTelegramConfig({ TELEGRAM_BOT_TOKEN: " tok ", TELEGRAM_CHANNEL_ID: " chat " }), {
      token: "tok",
      chatId: "chat",
    });
  });

  it("exits 0 with 'skipped: not configured' when the workflow has no secrets", () => {
    const env = { ...process.env, TELEGRAM_BOT_TOKEN: "", TELEGRAM_CHANNEL_ID: "" };
    const run = spawnSync(process.execPath, ["--import", "tsx", "scripts/post-price-drops.ts"], {
      encoding: "utf8",
      env,
    });

    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /post-price-drops: skipped: not configured/);
  });

  it("posts the top 10 of the day as a short digest", async () => {
    const { calls, fetchImpl } = capturingFetch();
    const payloadForDay = payload(25);
    const outcome = await postPriceDropsDigest({
      payload: payloadForDay,
      config: { token: TOKEN, chatId: CHAT },
      siteUrl: SITE,
      fetchImpl,
    });

    assert.deepEqual(outcome, { action: "posted", messageId: 42 });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${TELEGRAM_API_BASE}/bot${TOKEN}/sendMessage`);
    assert.equal(calls[0].body.chat_id, CHAT);
    assert.equal(calls[0].body.disable_web_page_preview, true);

    const text = String(calls[0].body.text);
    assert.ok(text.startsWith(`Bajas de precio · ${DATE}`));
    assert.equal(text.split("\n").filter((line) => /^\d+\. /.test(line)).length, DIGEST_MAX_DROPS);
    assert.ok(text.includes(`Top ${DIGEST_MAX_DROPS} de 25 bajas`));
    assert.ok(text.includes(`${SITE}/bajas`));
    assert.ok(!text.includes("Producto 11"), "the digest stops at the top 10");
    assert.ok(!text.includes(TOKEN), "the token never reaches the message");

    const first = payloadForDay.drops[0];
    assert.ok(
      text.includes(
        `1. ${first.name} (${storeLabel(first.source)}): ${formatDropAmount(first.previousPrice)} → ` +
          `${formatDropAmount(first.currentPrice)} (-${formatDropPercent(first.percentDrop)})`,
      ),
      text,
    );
  });

  it("skips a day with no published drops instead of posting noise", async () => {
    const { calls, fetchImpl } = capturingFetch();
    const outcome = await postPriceDropsDigest({
      payload: { ...payload(0), totalDrops: 0, drops: [] },
      config: { token: TOKEN, chatId: CHAT },
      siteUrl: SITE,
      fetchImpl,
    });

    assert.deepEqual(outcome, { action: "skipped", reason: "skipped: no drops published" });
    assert.equal(calls.length, 0);
  });

  it("reports a rejected request without throwing or leaking the token", async () => {
    const rejected = await postPriceDropsDigest({
      payload: payload(3),
      config: { token: TOKEN, chatId: CHAT },
      siteUrl: SITE,
      fetchImpl: capturingFetch(400, { ok: false, description: "chat not found" }).fetchImpl,
    });
    assert.deepEqual(rejected, { action: "failed", reason: "telegram responded 400" });

    const notOk = await postPriceDropsDigest({
      payload: payload(3),
      config: { token: TOKEN, chatId: CHAT },
      siteUrl: SITE,
      fetchImpl: capturingFetch(200, { ok: false, description: "chat not found" }).fetchImpl,
    });
    assert.deepEqual(notOk, { action: "failed", reason: "telegram rejected the message" });

    const brokenFetch = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const failed = await postPriceDropsDigest({
      payload: payload(3),
      config: { token: TOKEN, chatId: CHAT },
      siteUrl: SITE,
      fetchImpl: brokenFetch,
    });
    assert.deepEqual(failed, { action: "failed", reason: "network down" });
  });

  it("truncates a digest longer than the Telegram limit", () => {
    const longNames = payload(40).drops.map((entry) => ({ ...entry, name: "x".repeat(300) }));
    const text = buildPriceDropsDigest({ ...payload(40), drops: longNames }, SITE, 40);

    assert.equal(text.length, TELEGRAM_TEXT_LIMIT);
    assert.ok(text.endsWith("…"));
  });

  it("posts today's payload and refuses to repeat an older day", async () => {
    const workDir = mkdtempSync(join(tmpdir(), "price-drops-poster-"));
    after(() => rmSync(workDir, { recursive: true, force: true }));
    const payloadPath = join(workDir, "price-drops.json");
    const env = { TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHANNEL_ID: CHAT };
    const now = new Date("2027-01-15T12:00:00.000Z");

    writeFileSync(payloadPath, JSON.stringify(payload(3)));
    const posted = await runPoster({ env, payloadPath, now, fetchImpl: capturingFetch().fetchImpl });
    assert.deepEqual(posted.outcome, { action: "posted", messageId: 42 });
    assert.equal(posted.payload.date, DATE);

    writeFileSync(payloadPath, JSON.stringify({ ...payload(3), date: "2027-01-14" }));
    const stale = capturingFetch();
    const skipped = await runPoster({ env, payloadPath, now, fetchImpl: stale.fetchImpl });
    assert.deepEqual(skipped.outcome, {
      action: "skipped",
      reason: "skipped: payload is from 2027-01-14, not 2027-01-15",
    });
    assert.equal(stale.calls.length, 0, "an old payload must never be posted twice");
  });

  it("reads the public site url from the environment", () => {
    assert.equal(siteUrlFromEnv({}), "https://ofertas-super.vercel.app");
    assert.equal(siteUrlFromEnv({ NEXT_PUBLIC_SITE_URL: "https://example.test/" }), "https://example.test");
  });
});
