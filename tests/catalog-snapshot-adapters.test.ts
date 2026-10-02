import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { findSnapshotAdaptedProduct, searchSnapshotSummaries } from "../src/lib/catalog-snapshot-adapters";
import { normalizeQuery } from "../src/lib/catalog-snapshot";
import { installSnapshotFixture } from "./helpers/snapshot-fixture";

// The daily refresh rewrites the served snapshot, so these adaptation tests run
// against the committed fixture and derive their clocks from its generatedAt:
// at generation the offers are fresh, eight days later none of them is.
const FIXTURE = installSnapshotFixture();
const generatedAt = new Date(FIXTURE.generatedAt);
const freshNow = generatedAt;
const staleNow = new Date(generatedAt.getTime() + 8 * 24 * 60 * 60 * 1000);

function findAdapted(query: string) {
  const result = searchSnapshotSummaries({ query, now: freshNow });
  assert.ok(result.products.length > 0, `${query} must match a fixture product`);
  const summary = result.products[0];
  const detail = findSnapshotAdaptedProduct(summary.ean, freshNow);
  assert.ok(detail, "the matched product must adapt to a detail");
  return { summary, detail };
}

describe("snapshot adapters produce the guarded shapes", () => {
  it("adapts a real search hit to a full ProductSummary", () => {
    const { summary } = findAdapted("leche");
    assert.equal(summary.ean.length >= 8, true);
    assert.ok(summary.entries.length > 0, "a listed product must have entries");
    for (const entry of summary.entries) {
      assert.ok(FIXTURE.sources.includes(entry.supermarket.slug));
      assert.equal(entry.freshnessSlaHours, 24);
      assert.ok(["fresh", "stale", "unknown"].includes(entry.freshnessStatus));
      assert.ok(Number.isFinite(entry.supermarketProductId));
    }
    assert.ok(summary.displayPrice !== null, "an available offer yields a display price");
  });

  it("adapts the same product to a ProductDetail with history-derived fields", () => {
    const { detail } = findAdapted("aceite");
    assert.ok(detail.images.length > 0 || detail.imageUrl !== null);
    assert.equal(detail.promotions.length, 0, "promotions are a Gate 4 concern");
    for (const entry of detail.priceEntries) {
      assert.equal(entry.bestPromotion, null, "promotions stay empty until Gate 4");
      assert.equal(entry.finalPrice, entry.price);
      if (entry.priceDropAlert !== null) {
        assert.ok(entry.priceDropAlert.percentDrop > 0);
        assert.equal(entry.previousPrice, entry.priceDropAlert.previousPrice);
      }
      if (entry.listPrice !== null && entry.price !== null && entry.listPrice > entry.price) {
        assert.ok(
          entry.automaticDiscountPercent !== null && entry.automaticDiscountPercent > 0,
          "list price above price must surface the automatic discount",
        );
      }
    }
  });

  it("flips freshness verdicts when the injected clock moves", () => {
    const query = "arroz";
    const fresh = searchSnapshotSummaries({ query, now: freshNow });
    assert.ok(fresh.products.length > 0, "arroz must match fixture products");
    const stale = searchSnapshotSummaries({ query, now: staleNow });
    for (const entry of stale.products) {
      assert.equal(
        entry.hasFreshPrice,
        false,
        "a week later no offer of this product may be reported fresh",
      );
      for (const offer of entry.entries) {
        assert.equal(offer.freshnessStatus, "stale");
      }
    }
    const freshEntry = fresh.products.find((entry) => entry.ean === stale.products[0].ean);
    assert.ok(freshEntry);
    assert.equal(freshEntry.hasFreshPrice, true, "the same product is fresh when the snapshot is generated");
  });

  it("keeps pagination and identity stable across adapter and reader", () => {
    const first = searchSnapshotSummaries({ now: freshNow, page: 1 });
    assert.equal(first.products.length, 24);
    const second = searchSnapshotSummaries({ now: freshNow, page: 2 });
    const seen = new Set(first.products.map((entry) => entry.ean));
    for (const entry of second.products) {
      assert.equal(seen.has(entry.ean), false, "page 2 must not repeat page 1");
    }
    const entry = first.products[0];
    const detail = findSnapshotAdaptedProduct(entry.ean, freshNow);
    assert.ok(detail);
    assert.equal(detail.ean, entry.ean);
    assert.equal(detail.priceEntries.length, entry.entries.length);
  });

  it("normalizes queries the same way the reader does", () => {
    assert.equal(normalizeQuery("LÁCTEOS"), "lacteos");
  });
});
