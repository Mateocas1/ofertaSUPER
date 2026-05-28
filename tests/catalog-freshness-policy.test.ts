import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  comparePublicProducts,
  getBestDisplayPriceEntry,
  getRankFreshnessStatus,
} from "../src/lib/catalog-freshness-policy";

describe("freshness-aware public catalog policy", () => {
  it("uses the best fresh price before a cheaper stale price", () => {
    const best = getBestDisplayPriceEntry([
      {
        price: 900,
        isAvailable: true,
        freshnessStatus: "stale",
        lastCheckedAt: "2026-05-01T00:00:00.000Z",
      },
      {
        price: 1200,
        isAvailable: true,
        freshnessStatus: "fresh",
        lastCheckedAt: "2026-05-28T00:00:00.000Z",
      },
    ]);

    assert.equal(best?.price, 1200);
    assert.equal(best?.freshnessStatus, "fresh");
  });

  it("demotes stale products in public sorting and default search", () => {
    const staleCheap = {
      ean: "1",
      name: "Leche barata vieja",
      brand: null,
      minPrice: 900,
      displayPrice: 900,
      automaticDiscountPercent: null,
      latestCheckedAt: "2026-05-01T00:00:00.000Z",
      rankFreshnessStatus: "stale" as const,
    };
    const freshExpensive = {
      ean: "2",
      name: "Leche reciente",
      brand: null,
      minPrice: 1200,
      displayPrice: 1200,
      automaticDiscountPercent: null,
      latestCheckedAt: "2026-05-28T00:00:00.000Z",
      rankFreshnessStatus: "fresh" as const,
    };

    assert.equal(comparePublicProducts(freshExpensive, staleCheap, { sort: "price-asc" }) < 0, true);
    assert.equal(comparePublicProducts(staleCheap, freshExpensive, { sort: "discount" }) > 0, true);
    assert.equal(comparePublicProducts(staleCheap, freshExpensive, { query: "leche" }) > 0, true);
  });

  it("classifies unknown-only entries below stale entries", () => {
    assert.equal(
      getRankFreshnessStatus([
        { price: 1500, isAvailable: true, freshnessStatus: "unknown" },
      ]),
      "unknown",
    );
    assert.equal(
      getRankFreshnessStatus([
        { price: 1500, isAvailable: true, freshnessStatus: "unknown" },
        { price: 1700, isAvailable: true, freshnessStatus: "stale" },
      ]),
      "stale",
    );
  });
});
