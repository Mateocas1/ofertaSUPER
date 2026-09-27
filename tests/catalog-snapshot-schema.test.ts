import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// The snapshot is committed to the repo and served by the deployment, so its
// objects must not leak internal fields. This is a data contract on the JSON
// itself, not a grep of source code.
const snapshot = JSON.parse(readFileSync("data/catalog-snapshot.json", "utf8")) as {
  schemaVersion: number;
  generatedAt: string;
  sources: string[];
  products: Record<string, unknown>[];
  offers: { ean: string; source: string; promo: unknown; history: Record<string, unknown>[] }[];
};

const PRODUCT_KEYS = ["ean", "name", "brand", "imageUrl", "category", "categorySlug"].sort();
const OFFER_KEYS = ["ean", "source", "price", "listPrice", "promo", "available", "productUrl", "observedAt", "history"].sort();
const HISTORY_KEYS = ["price", "listPrice", "observedAt"].sort();
const PROMO_KEYS = ["type", "percent", "nth", "maxUnits", "label"].sort();

describe("catalog snapshot data contract", () => {
  it("exposes only the allowed keys on every product", () => {
    assert.ok(snapshot.products.length > 0);
    for (const product of snapshot.products) {
      assert.deepEqual(Object.keys(product).sort(), PRODUCT_KEYS, `product ${product.ean} leaked keys`);
    }
  });

  it("exposes only the allowed keys on every offer and history point", () => {
    assert.ok(snapshot.offers.length > 0);
    for (const offer of snapshot.offers) {
      assert.deepEqual(Object.keys(offer).sort(), OFFER_KEYS, `offer ${offer.ean}/${offer.source} leaked keys`);
      for (const point of offer.history) {
        assert.deepEqual(Object.keys(point).sort(), HISTORY_KEYS, `history point leaked keys on ${offer.ean}`);
      }
    }
  });

  it("keeps every captured promotion within the allowed shape", () => {
    for (const offer of snapshot.offers) {
      if (offer.promo === null) continue;
      assert.deepEqual(Object.keys(offer.promo as Record<string, unknown>).sort(), PROMO_KEYS, `promo leaked keys on ${offer.ean}`);
      const promo = offer.promo as { type: string; percent: number; label: string };
      assert.ok(["nth-unit", "percent-off"].includes(promo.type), `promo type invalid on ${offer.ean}`);
      assert.ok(promo.percent > 0 && promo.percent <= 99, `promo percent out of range on ${offer.ean}`);
      assert.ok(promo.label.length > 0, `promo label empty on ${offer.ean}`);
    }
  });

  it("keeps top-level metadata honest", () => {
    assert.equal(snapshot.schemaVersion, 2);
    assert.ok(!Number.isNaN(Date.parse(snapshot.generatedAt)));
    assert.deepEqual(snapshot.sources, ["carrefour", "disco", "jumbo"]);
  });
});
