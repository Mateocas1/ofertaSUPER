import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { detectPriceDrops, type PriceDropRules } from "../src/lib/price-drops";
import { findLastDifferentPrice } from "../src/lib/price-movement";
import { loadSnapshotProductPage } from "../src/lib/public-pages";
import { installSnapshotFixture } from "./helpers/snapshot-fixture";

// The product page and /bajas must agree on "precio anterior": the most recent
// observation before the current one whose price differs from it, inside the
// /bajas window. The snapshot history ends with the current observation, so
// "the last history point" reported 0% next to a published drop.

const CURRENT = "2026-11-04T18:15:06.801Z";
// Shape of 07799111692473 in the 2026-11-04 snapshot: /bajas published
// $37.399 → $14.999 (−59,89%) against the 30 oct observation.
const HISTORY = [
  { price: 37399, observedAt: "2026-10-27T16:04:33.094Z" },
  { price: null, observedAt: "2026-10-28T17:58:13.844Z" },
  { price: 37399, observedAt: "2026-10-30T16:55:07.954Z" },
  { price: null, observedAt: "2026-11-01T17:47:47.446Z" },
  { price: 14999, observedAt: CURRENT },
];

describe("last different price", () => {
  it("skips the current observation and missing prices", () => {
    assert.deepEqual(findLastDifferentPrice(HISTORY, 14999, CURRENT), {
      price: 37399,
      observedAt: "2026-10-30T16:55:07.954Z",
    });
  });

  it("skips earlier observations at the current price", () => {
    const history = [
      { price: 1200, observedAt: "2026-11-01T10:00:00.000Z" },
      { price: 1000, observedAt: "2026-11-02T10:00:00.000Z" },
      { price: 1000, observedAt: "2026-11-03T10:00:00.000Z" },
      { price: 1000, observedAt: "2026-11-04T10:00:00.000Z" },
    ];
    assert.deepEqual(findLastDifferentPrice(history, 1000, "2026-11-04T10:00:00.000Z"), {
      price: 1200,
      observedAt: "2026-11-01T10:00:00.000Z",
    });
  });

  it("returns null when the price never changed or the change is outside the window", () => {
    assert.equal(findLastDifferentPrice([{ price: 500, observedAt: CURRENT }], 500, CURRENT), null);
    const old = [{ price: 900, observedAt: "2026-10-01T10:00:00.000Z" }, { price: 500, observedAt: CURRENT }];
    assert.equal(findLastDifferentPrice(old, 500, CURRENT), null);
    assert.deepEqual(findLastDifferentPrice(old, 500, CURRENT, 60), { price: 900, observedAt: "2026-10-01T10:00:00.000Z" });
  });

  it("ignores observations after the current one and a missing current price", () => {
    const later = [{ price: 900, observedAt: "2026-11-05T10:00:00.000Z" }];
    assert.equal(findLastDifferentPrice(later, 500, CURRENT), null);
    assert.equal(findLastDifferentPrice(HISTORY, null, CURRENT), null);
  });
});

describe("product page movements", () => {
  const fixture = installSnapshotFixture();
  const now = new Date(fixture.generatedAt);

  it("measures every entry against the last different price, with its date", async () => {
    const sample = fixture.products[1];
    const data = await loadSnapshotProductPage(sample.ean, 90, now);
    assert.ok(data.product);
    for (const entry of data.product.priceEntries) {
      if (entry.price === null) continue;
      const offer = fixture.offers.find((candidate) => candidate.ean === sample.ean && candidate.source === entry.supermarket.slug)!;
      const reference = offer.history[offer.history.length - 2];
      assert.equal(entry.previousPrice, reference.price);
      assert.equal(entry.previousObservedAt, reference.observedAt);
      assert.ok(entry.deltaPercent !== null && entry.deltaPercent < 0, "the fixture price fell");
      assert.equal(entry.priceDropAlert?.previousPrice, reference.price);
    }
  });

  it("agrees with every drop /bajas detects, previous price and date included", async () => {
    // No thresholds and no staleness cut, so every movement /bajas would weigh is compared.
    const rules: PriceDropRules = {
      minPercentDrop: 0, minAmountDrop: 0, windowDays: 14, maxAgeHours: 24 * 365, maxPercentDrop: 100, limit: 1000,
    };
    const detection = detectPriceDrops(fixture, rules, now);
    const drops = [...detection.published, ...detection.suspect];
    assert.ok(drops.length > 10, "the fixture has drops to compare");
    for (const drop of drops) {
      const data = await loadSnapshotProductPage(drop.ean, 90, now);
      const entry = data.product?.priceEntries.find((candidate) => candidate.supermarket.slug === drop.source);
      assert.ok(entry, `${drop.ean} ${drop.source} is on the product page`);
      assert.equal(entry.previousPrice, drop.previousPrice);
      assert.equal(entry.previousObservedAt, drop.previousObservedAt);
      assert.equal(entry.deltaPercent, -drop.percentDrop);
    }
  });

  it("reports the biggest drop across entries as the product's drop", async () => {
    const data = await loadSnapshotProductPage(fixture.products[5].ean, 90, now);
    assert.ok(data.product);
    const biggest = Math.max(...data.product.priceEntries.map((entry) => entry.priceDropAlert?.percentDrop ?? 0));
    assert.equal(data.product.bestPriceDropAlert?.percentDrop, biggest);
  });
});
