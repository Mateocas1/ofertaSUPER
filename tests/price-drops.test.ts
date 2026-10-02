import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import {
  buildPriceDropsPayload,
  buildPriceDropsView,
  DEFAULT_PRICE_DROP_RULES,
  detectPriceDrops,
  formatDropPercent,
  loadPriceDrops,
  parsePriceDrops,
  PriceDropsUnavailableError,
  type PriceDropDetection,
  type PriceDropRules,
  type PriceDropsPayload,
  type PriceDropSnapshot,
  type PriceDropSnapshotOffer,
} from "../src/lib/price-drops";
import { parseFlags, resolveRules, runExport } from "../scripts/export-price-drops";
import { buildPriceDropsDigest, postPriceDropsDigest } from "../scripts/lib/price-drops-poster";
import { buildPriceDropsFeed } from "../src/lib/price-drops-feed";

// Detection is proven against synthetic snapshots with explicit clocks: the
// daily refresh rewrites the real ones, so no expectation here depends on it.

const NOW = new Date("2027-01-15T12:00:00.000Z");
const EAN = "7791234500000";
const VALID_EANS = ["7791234500000", "7791234500017", "7791234500024", "7791234500031", "7791234500048"];

function daysBefore(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

function hoursBefore(hours: number): string {
  return new Date(NOW.getTime() - hours * 3_600_000).toISOString();
}

function offer(overrides: Partial<PriceDropSnapshotOffer> = {}): PriceDropSnapshotOffer {
  return {
    ean: EAN,
    source: "carrefour",
    price: 800,
    listPrice: null,
    promo: null,
    available: true,
    productUrl: `https://www.carrefour.test/producto/${EAN}`,
    observedAt: NOW.toISOString(),
    history: [
      { price: 1000, listPrice: null, observedAt: daysBefore(12) },
      { price: 900, listPrice: null, observedAt: daysBefore(5) },
      { price: 800, listPrice: null, observedAt: NOW.toISOString() },
    ],
    ...overrides,
  };
}

function snapshot(offers: PriceDropSnapshotOffer[], generatedAt = NOW.toISOString()): PriceDropSnapshot {
  const eans = [...new Set(offers.map((entry) => entry.ean))];
  return {
    generatedAt,
    products: eans.map((ean) => ({
      ean,
      name: `Producto ${ean}`,
      brand: "Marca",
      imageUrl: `https://cdn.test/${ean}.jpg`,
      category: "Almacén",
      categorySlug: "almacen",
    })),
    offers,
  };
}

function detect(offers: PriceDropSnapshotOffer[], rules: Partial<PriceDropRules> = {}) {
  return detectPriceDrops(snapshot(offers), { ...DEFAULT_PRICE_DROP_RULES, ...rules }, NOW).published;
}

describe("price drop detection", () => {
  it("compares the current price against the last different observation", () => {
    const drops = detect([offer()]);
    assert.equal(drops.length, 1);
    const [drop] = drops;
    assert.equal(drop.previousPrice, 900);
    assert.equal(drop.currentPrice, 800);
    assert.equal(drop.amountDrop, 100);
    assert.equal(drop.percentDrop, 11.11);
    assert.equal(drop.previousObservedAt, daysBefore(5));
    assert.equal(drop.observedAt, NOW.toISOString());
    assert.equal(drop.date, "2027-01-15");
    assert.equal(drop.name, `Producto ${EAN}`);
    assert.equal(drop.productUrl, `https://www.carrefour.test/producto/${EAN}`);
  });

  it("skips repeated observations and keeps the last genuinely different price", () => {
    const drops = detect([
      offer({
        history: [
          { price: 1000, listPrice: null, observedAt: daysBefore(12) },
          { price: 800, listPrice: null, observedAt: daysBefore(5) },
          { price: 800, listPrice: null, observedAt: daysBefore(2) },
          { price: 800, listPrice: null, observedAt: NOW.toISOString() },
        ],
      }),
    ]);
    assert.equal(drops.length, 1);
    assert.equal(drops[0].previousPrice, 1000);
    assert.equal(drops[0].percentDrop, 20);
  });

  it("ignores a reference observation older than the window", () => {
    const drops = detect([
      offer({ history: [{ price: 1000, listPrice: null, observedAt: daysBefore(40) }] }),
    ]);
    assert.deepEqual(drops, []);
  });

  it("honors a configurable window", () => {
    const stale = [offer({ history: [{ price: 1000, listPrice: null, observedAt: daysBefore(20) }] })];
    assert.deepEqual(detect(stale), []);
    assert.equal(detect(stale, { windowDays: 30 }).length, 1);
  });

  it("accepts a drop exactly at both thresholds", () => {
    const drops = detect([offer({ price: 900, history: [{ price: 1000, listPrice: null, observedAt: daysBefore(5) }] })]);
    assert.equal(drops.length, 1);
    assert.equal(drops[0].percentDrop, 10);
    assert.equal(drops[0].amountDrop, 100);
  });

  it("rejects a drop below the percent threshold even when the amount is large", () => {
    const drops = detect([
      offer({ price: 9050, history: [{ price: 10000, listPrice: null, observedAt: daysBefore(5) }] }),
    ]);
    assert.deepEqual(drops, []);
  });

  it("rejects a drop below the amount threshold even when the percent is large", () => {
    const drops = detect([
      offer({ price: 80, history: [{ price: 100, listPrice: null, observedAt: daysBefore(5) }] }),
    ]);
    assert.deepEqual(drops, []);
  });

  it("honors configurable thresholds", () => {
    const offers = [offer({ price: 800, history: [{ price: 850, listPrice: null, observedAt: daysBefore(5) }] })];
    assert.deepEqual(detect(offers), []);
    assert.equal(detect(offers, { minPercentDrop: 5, minAmountDrop: 40 }).length, 1);
  });

  it("excludes stale, unavailable and priceless offers", () => {
    const stale = offer({ observedAt: hoursBefore(25), history: [{ price: 1000, listPrice: null, observedAt: daysBefore(12) }] });
    const unavailable = offer({ available: false });
    const priceless = offer({ price: null });
    const unparseable = offer({ observedAt: "not-a-date" });
    assert.deepEqual(detect([stale, unavailable, priceless, unparseable]), []);
    assert.equal(detect([offer({ observedAt: hoursBefore(23) })]).length, 1);
  });

  it("excludes a drop a captured percentage promotion fully explains", () => {
    const promoOnly = offer({
      price: 850,
      promo: { type: "percent-off", percent: 15 },
      history: [{ price: 1000, listPrice: null, observedAt: daysBefore(5) }],
    });
    assert.deepEqual(detect([promoOnly]), []);

    const deeperThanThePromo = offer({
      price: 800,
      promo: { type: "percent-off", percent: 5 },
      history: [{ price: 1000, listPrice: null, observedAt: daysBefore(5) }],
    });
    assert.equal(detect([deeperThanThePromo]).length, 1);

    const nthUnit = offer({
      price: 800,
      promo: { type: "nth-unit", percent: 20 },
      history: [{ price: 1000, listPrice: null, observedAt: daysBefore(5) }],
    });
    assert.equal(detect([nthUnit]).length, 1, "a second-unit promo does not explain a unit price cut");
  });

  it("ignores a drop without a matching product", () => {
    const orphan = offer();
    assert.deepEqual(
      detectPriceDrops({ generatedAt: NOW.toISOString(), products: [], offers: [orphan] }, DEFAULT_PRICE_DROP_RULES, NOW),
      { published: [], suspect: [] },
    );
  });

  it("canonicalizes the published EAN to GTIN-14", () => {
    const [drop] = detect([offer({ ean: VALID_EANS[1] })]);
    assert.equal(drop.ean, "07791234500017");
  });

  it("sorts deterministically by percent, amount and EAN", () => {
    const small = offer({
      ean: VALID_EANS[1],
      price: 850,
      history: [{ price: 1000, listPrice: null, observedAt: daysBefore(5) }],
    });
    const big = offer({
      ean: VALID_EANS[2],
      price: 500,
      history: [{ price: 1000, listPrice: null, observedAt: daysBefore(5) }],
    });
    const first = detect([small, big]);
    const second = detect([big, small]);
    assert.deepEqual(first.map((drop) => drop.ean), ["07791234500024", "07791234500017"]);
    assert.deepEqual(second, first, "input order must not change the result");
    assert.deepEqual(detect([small, big]), first, "the same input must always produce the same output");
  });

  it("applies the limit in the payload while reporting the real total", () => {
    const offers = VALID_EANS.map((ean) =>
      offer({
        ean,
        price: 500,
        history: [{ price: 1000, listPrice: null, observedAt: daysBefore(5) }],
      }));
    const payload = buildPriceDropsPayload(snapshot(offers), { ...DEFAULT_PRICE_DROP_RULES, limit: 3 }, NOW);
    assert.equal(payload.totalDrops, 5);
    assert.equal(payload.drops.length, 3);
    assert.equal(payload.schemaVersion, 2);
    assert.equal(payload.date, "2027-01-15");
    assert.equal(payload.generatedAt, NOW.toISOString());
    assert.deepEqual(payload.rules, { ...DEFAULT_PRICE_DROP_RULES, limit: 3 });
  });
});

describe("price drops payload contract", () => {
  it("parses a valid payload and rejects a malformed one", () => {
    const payload = buildPriceDropsPayload(snapshot([offer()]), DEFAULT_PRICE_DROP_RULES, NOW);
    assert.deepEqual(parsePriceDrops(JSON.parse(JSON.stringify(payload))), payload);
    assert.throws(() => parsePriceDrops({}), PriceDropsUnavailableError);
    assert.throws(() => parsePriceDrops({ ...payload, schemaVersion: 1 }), PriceDropsUnavailableError);
    assert.throws(() => parsePriceDrops({ ...payload, drops: [{ ean: "1" }] }), PriceDropsUnavailableError);
    assert.throws(() => parsePriceDrops({ ...payload, rules: { minPercentDrop: 10 } }), PriceDropsUnavailableError);
    assert.throws(() => parsePriceDrops({ ...payload, suspect: "not-an-array" }), PriceDropsUnavailableError);
    assert.throws(() => parsePriceDrops({ ...payload, suspectDrops: "many" }), PriceDropsUnavailableError);
  });

  it("loads the committed payload through the same gate, without pinning its values", () => {
    const payload = loadPriceDrops();
    assert.equal(payload.schemaVersion, 2);
    assert.ok(!Number.isNaN(Date.parse(payload.generatedAt)));
    assert.match(payload.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(payload.drops.length <= payload.rules.limit);
    assert.equal(payload.suspectDrops >= payload.suspect.length, true);
    for (const drop of payload.drops) {
      assert.ok(drop.previousPrice > drop.currentPrice, `${drop.ean} must be a real drop`);
      assert.ok(drop.percentDrop >= payload.rules.minPercentDrop - 1e-9);
      assert.ok(drop.amountDrop >= payload.rules.minAmountDrop - 1e-9);
    }
  });
});

describe("price drops view", () => {
  it("renders the unavailable state instead of data when the payload is missing", () => {
    const view = buildPriceDropsView(null);
    assert.equal(view.unavailable, true);
    assert.equal(view.isEmpty, true);
    assert.deepEqual(view.drops, []);
    assert.match(view.summary, /falta o está corrupto/);
  });

  it("renders an honest empty state", () => {
    const view = buildPriceDropsView({
      schemaVersion: 1,
      generatedAt: NOW.toISOString(),
      date: "2027-01-15",
      rules: DEFAULT_PRICE_DROP_RULES,
      totalDrops: 0,
      drops: [],
      suspectDrops: 0,
      suspect: [],
    });
    assert.equal(view.unavailable, false);
    assert.equal(view.isEmpty, true);
    assert.match(view.summary, /2027-01-15/);
    assert.doesNotMatch(view.summary, /bajas;/);
  });

  it("summarizes the published drops with the configured thresholds", () => {
    const payload: PriceDropsPayload = buildPriceDropsPayload(snapshot([offer()]), DEFAULT_PRICE_DROP_RULES, NOW);
    const view = buildPriceDropsView(payload);
    assert.equal(view.unavailable, false);
    assert.equal(view.isEmpty, false);
    assert.equal(view.drops.length, 1);
    assert.match(view.summary, /2027-01-15/);
    assert.match(view.summary, /1 baja;/);
    assert.match(view.thresholdsNote, /10%/);
    assert.match(view.thresholdsNote, /14 días/);
  });

  it("formats a drop percent without a sign and with one decimal", () => {
    assert.equal(formatDropPercent(11.11), "11,1%");
    assert.equal(formatDropPercent(80), "80%");
  });
});

describe("price drops export over the committed snapshot", () => {
  const workDir = mkdtempSync(join(tmpdir(), "price-drops-export-"));
  after(() => rmSync(workDir, { recursive: true, force: true }));

  it("writes the same schema-valid payload twice for the same snapshot and clock", () => {
    const snapshotPath = "data/catalog-snapshot.json";
    const generatedAt = (JSON.parse(readFileSync(snapshotPath, "utf8")) as { generatedAt: string }).generatedAt;
    const now = new Date(generatedAt);
    const firstPath = join(workDir, "first.json");
    const secondPath = join(workDir, "second.json");

    const first = runExport({ snapshotPath, outputPath: firstPath, now });
    const second = runExport({ snapshotPath, outputPath: secondPath, now });

    assert.deepEqual(second.payload, first.payload, "the same input and clock must produce the same payload");
    assert.deepEqual(JSON.parse(readFileSync(firstPath, "utf8")), first.payload);
    assert.equal(readFileSync(firstPath, "utf8"), readFileSync(secondPath, "utf8"));
    assert.deepEqual(parsePriceDrops(first.payload), first.payload);
    assert.equal(first.payload.generatedAt, now.toISOString());
    assert.ok(first.payload.drops.every((drop) => drop.currentPrice < drop.previousPrice));
  });
});

describe("price drops export flags", () => {
  it("reads --flag=value pairs and ignores arguments without a name", () => {
    assert.deepEqual(parseFlags(["--limit=10", "--min-amount=250", "extra", "--window-days=7"]), {
      limit: "10",
      "min-amount": "250",
      "window-days": "7",
    });
  });

  it("prefers flags over environment variables and keeps the published defaults", () => {
    assert.deepEqual(resolveRules({}, {}), DEFAULT_PRICE_DROP_RULES);
    assert.deepEqual(resolveRules({ PRICE_DROP_MIN_PERCENT: "20" }, {}).minPercentDrop, 20);
    assert.deepEqual(resolveRules({ PRICE_DROP_MIN_PERCENT: "20" }, { "min-percent": "5" }).minPercentDrop, 5);
  });

  it("rejects a non-numeric threshold instead of silently defaulting", () => {
    assert.throws(() => resolveRules({ PRICE_DROP_LIMIT: "many" }, {}), /non-negative number/);
    assert.throws(() => resolveRules({}, { "min-amount": "-5" }), /non-negative number/);
  });
});

// ---------------------------------------------------------------------------
// Orchestrator review #1: a suspicious movement is recorded but NEVER published.
// A drop that a pack-size change or a data error explains must not reach
// /bajas, the Atom feed or the Telegram digest.
//
// The cases below are written against the shape of the real coffee case the
// current snapshot produced: Carrefour, 3765 -> 753 (80%), list price moving
// with the price and no unit price recorded for either point.
// ---------------------------------------------------------------------------

const COFFEE = {
  price: 753,
  listPrice: 753,
  history: [{ price: 3765, listPrice: 3765, observedAt: daysBefore(4) }],
};

function rawOffer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ean: EAN,
    source: "carrefour",
    price: 800,
    listPrice: null,
    promo: null,
    available: true,
    productUrl: `https://www.carrefour.test/producto/${EAN}`,
    observedAt: NOW.toISOString(),
    history: [{ price: 1000, listPrice: null, observedAt: daysBefore(12) }],
    ...overrides,
  };
}

function detectRaw(
  offers: Array<Record<string, unknown>>,
  rules: Partial<PriceDropRules> = {},
): PriceDropDetection {
  const rawSnapshot = {
    generatedAt: NOW.toISOString(),
    products: offers.map((entry) => ({
      ean: String(entry.ean),
      name: `Producto ${String(entry.ean)}`,
      brand: "Marca",
      imageUrl: null,
      category: "Almacén",
      categorySlug: "almacen",
    })),
    offers,
  } as unknown as PriceDropSnapshot;
  return detectPriceDrops(rawSnapshot, { ...DEFAULT_PRICE_DROP_RULES, ...rules }, NOW);
}

function payloadWith(offers: Array<Record<string, unknown>>, rules: Partial<PriceDropRules> = {}) {
  const rawSnapshot = {
    generatedAt: NOW.toISOString(),
    products: offers.map((entry) => ({
      ean: String(entry.ean),
      name: `Producto ${String(entry.ean)}`,
      brand: "Marca",
      imageUrl: null,
      category: "Almacén",
      categorySlug: "almacen",
    })),
    offers,
  } as unknown as PriceDropSnapshot;
  return buildPriceDropsPayload(rawSnapshot, { ...DEFAULT_PRICE_DROP_RULES, ...rules }, NOW);
}

describe("suspicious drops are never published", () => {
  it("records a drop above the maximum percent as suspect instead of publishing it", () => {
    const detection = detectRaw([rawOffer({ ...COFFEE })]);

    assert.deepEqual(detection.published, []);
    assert.equal(detection.suspect.length, 1);
    const [suspect] = detection.suspect;
    assert.equal(suspect.reason, "drop_above_max_percent");
    assert.equal(suspect.percentDrop, 80);
    assert.equal(suspect.previousPrice, 3765);
    assert.equal(suspect.currentPrice, 753);
    assert.equal(suspect.date, "2027-01-15");
    assert.equal(suspect.source, "carrefour");
  });

  it("keeps a large drop public when the unit price proves the fall", () => {
    const detection = detectRaw([
      rawOffer({
        price: 753,
        unitPrice: 6024,
        history: [{ price: 3765, listPrice: 3765, observedAt: daysBefore(4), unitPrice: 7530 }],
      }),
    ]);

    assert.equal(detection.published.length, 1);
    assert.equal(detection.published[0].percentDrop, 80);
    assert.deepEqual(detection.suspect, []);
  });

  it("records a suspect drop when the unit price did not fall", () => {
    const detection = detectRaw([
      rawOffer({
        price: 753,
        unitPrice: 9000,
        history: [{ price: 3765, listPrice: 3765, observedAt: daysBefore(4), unitPrice: 7530 }],
      }),
    ]);

    assert.deepEqual(detection.published, []);
    assert.equal(detection.suspect.length, 1);
    assert.equal(detection.suspect[0].reason, "unit_price_did_not_fall");
    assert.equal(detection.suspect[0].percentDrop, 80);
  });

  it("honors a configurable maximum percent", () => {
    assert.equal(detectRaw([rawOffer({ ...COFFEE })], { maxPercentDrop: 90 }).published.length, 1);
    assert.equal(detectRaw([rawOffer({ ...COFFEE })], { maxPercentDrop: 70 }).suspect.length, 1);
  });

  it("publishes an ordinary drop even without unit price evidence", () => {
    const detection = detectRaw([offer()]);

    assert.equal(detection.published.length, 1);
    assert.deepEqual(detection.suspect, []);
  });

  it("publishes only the safe drops and records the suspects in the payload", () => {
    const payload = payloadWith([
      rawOffer({ ean: VALID_EANS[1], ...COFFEE }),
      rawOffer({ ean: VALID_EANS[2] }),
    ]);

    assert.equal(payload.schemaVersion, 2);
    assert.equal(payload.rules.maxPercentDrop, 60);
    assert.equal(payload.drops.length, 1);
    assert.equal(payload.totalDrops, 1);
    assert.equal(payload.suspectDrops, 1);
    assert.equal(payload.suspect?.length, 1);
    assert.equal(payload.suspect?.[0].reason, "drop_above_max_percent");
    assert.deepEqual(parsePriceDrops(JSON.parse(JSON.stringify(payload))), payload);
  });

  it("rejects a payload whose suspect entry carries an unknown reason", () => {
    const payload = payloadWith([rawOffer({ ...COFFEE })]);
    const suspect = payload.suspect ?? [];

    assert.throws(
      () => parsePriceDrops({ ...payload, suspect: [{ ...suspect[0], reason: "because" }] }),
      PriceDropsUnavailableError,
    );
  });

  it("keeps suspects out of the Atom feed", () => {
    const payload = payloadWith([
      rawOffer({ ean: VALID_EANS[1], ...COFFEE }),
      rawOffer({ ean: VALID_EANS[2] }),
    ]);
    const feed = buildPriceDropsFeed(payload);

    assert.equal((feed.match(/<entry>/g) ?? []).length, 1);
    assert.ok(!feed.includes(`Producto ${VALID_EANS[1]}`), "the suspect product must not appear in the feed");
  });

  it("keeps suspects out of the Telegram digest and skips a day that only has suspects", async () => {
    const mixed = payloadWith([
      rawOffer({ ean: VALID_EANS[1], ...COFFEE }),
      rawOffer({ ean: VALID_EANS[2] }),
    ]);
    const digest = buildPriceDropsDigest(mixed, "https://example.test");
    assert.ok(!digest.includes(`Producto ${VALID_EANS[1]}`), "the suspect product must not be posted");

    const onlySuspects = payloadWith([rawOffer({ ...COFFEE })]);
    let called = false;
    const outcome = await postPriceDropsDigest({
      payload: onlySuspects,
      config: { token: "t", chatId: "c" },
      siteUrl: "https://example.test",
      fetchImpl: (async () => {
        called = true;
        return new Response("{}", { status: 200 });
      }) as unknown as typeof fetch,
    });
    assert.equal(called, false);
    assert.equal(outcome.action, "skipped");
  });

  it("excludes suspects from the page view", () => {
    const payload = payloadWith([
      rawOffer({ ean: VALID_EANS[1], ...COFFEE }),
      rawOffer({ ean: VALID_EANS[2] }),
    ]);
    const view = buildPriceDropsView(payload);

    assert.equal(view.drops.length, 1);
    assert.ok(!view.drops.some((drop) => drop.ean === VALID_EANS[1]));
  });

  it("never publishes a suspect movement from the committed payload", () => {
    const payload = loadPriceDrops();
    const maxPercent = payload.rules.maxPercentDrop;

    for (const drop of payload.drops) {
      assert.ok(
        drop.percentDrop <= maxPercent,
        `published drop ${drop.ean} at ${drop.percentDrop}% must not exceed the suspect threshold`,
      );
    }
    for (const suspect of payload.suspect) {
      assert.ok(["drop_above_max_percent", "unit_price_did_not_fall"].includes(suspect.reason));
      assert.ok(
        suspect.percentDrop > maxPercent,
        `suspect ${suspect.ean} must have a reason to be withheld`,
      );
    }
  });
});
