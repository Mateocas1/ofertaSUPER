import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildBasketSummaries, computeBasketPlan } from "../src/lib/basket-mix";
import type { BasketProduct } from "../src/lib/basket-products-contract";

// Gate 5: the basket rules. The case from the plan: A x2 + B x1, with A=$1000
// only at Disco and B absent everywhere, yields subtotal $2000, 1/2 covered,
// 1 missing, and no "complete" label.

const NOW = "2026-09-27T12:00:00.000Z";

function product(ean: string, offers: Array<[string, number | null, boolean?, ("fresh" | "stale" | "unknown")?]>): BasketProduct {
  return {
    ean,
    name: `Producto ${ean}`,
    brand: null,
    imageUrl: null,
    minPrice: null,
    freshMinPrice: null,
    hasFreshPrice: false,
    priceEntries: offers.map(([slug, price, available = true, freshness = "fresh"]) => ({
      supermarket: { id: slug.length, name: slug.toUpperCase(), slug, logoUrl: null },
      price,
      listPrice: null,
      promo: null,
      isAvailable: available,
      productUrl: null,
      freshnessStatus: freshness,
    })),
    missing: [],
    dataSource: "database",
    degraded: false,
    verifiedAt: NOW,
    latestCheckedAt: null,
  } as unknown as BasketProduct;
}

describe("basket summaries (Gate 5 bug)", () => {
  it("counts an unresolvable product as missing instead of discarding it", () => {
    const summaries = buildBasketSummaries(
      [{ ean: "A", qty: 2 }, { ean: "B", qty: 1 }],
      { A: product("A", [["disco", 1000]]) },
      false,
    );

    assert.equal(summaries.length, 1);
    const disco = summaries[0];
    assert.equal(disco.slug, "disco");
    assert.equal(disco.total, 2000, "quantities multiply the price");
    assert.equal(disco.coveredItems, 1, "1/2 covered");
    assert.equal(disco.missingItems, 1, "the absent product is missing, never discarded");
    assert.equal(disco.complete, false, "no complete label when something is missing");
  });

  it("counts a resolved product without an eligible entry in the denominator of the listed supermarkets", () => {
    const summaries = buildBasketSummaries(
      [{ ean: "A", qty: 1 }, { ean: "B", qty: 1 }],
      {
        A: product("A", [["disco", 1000], ["carrefour", 1200]]),
        B: product("B", [["carrefour", 400]]),
      },
      false,
    );
    const disco = summaries.find((summary) => summary.slug === "disco");
    assert.ok(disco);
    assert.equal(disco.coveredItems, 1, "only A is covered at Disco");
    assert.equal(disco.missingItems, 1, "B has no Disco entry, so it is missing there");
    assert.equal(disco.complete, false, "Disco cannot be labeled complete with a missing product");
    const carrefour = summaries.find((summary) => summary.slug === "carrefour");
    assert.ok(carrefour);
    assert.equal(carrefour.complete, true);
  });

  it("does not count ineligible (stale) entries as coverage when freshness is required", () => {
    const summaries = buildBasketSummaries(
      [{ ean: "A", qty: 1 }],
      { A: product("A", [["disco", 1000, true, "stale"]]) },
      false,
    );
    assert.equal(summaries.length, 0, "a supermarket with no covered items is not listed");
  });

  it("accepts stale entries when the data is degraded", () => {
    const summaries = buildBasketSummaries(
      [{ ean: "A", qty: 1 }],
      { A: product("A", [["disco", 1000, true, "stale"]]) },
      true,
    );
    assert.equal(summaries[0].total, 1000);
    assert.equal(summaries[0].complete, true);
  });
});

describe("basket plan (Gate 5 mix)", () => {
  const catalog = {
    A: product("A", [["disco", 1000], ["carrefour", 1200]]),
    B: product("B", [["disco", 500], ["carrefour", 400]]),
  };

  it("assigns every product to its cheapest eligible supermarket", () => {
    const plan = computeBasketPlan([{ ean: "A", qty: 1 }, { ean: "B", qty: 1 }], catalog, {}, true);
    assert.equal(plan.mixedTotal, 1400);
    assert.deepEqual(plan.items.map((item) => item.chosenSlug), ["disco", "carrefour"]);
    assert.equal(plan.mixedMissing, 0);
  });

  it("shows the savings against the best single-supermarket basket", () => {
    const plan = computeBasketPlan([{ ean: "A", qty: 1 }, { ean: "B", qty: 1 }], catalog, {}, true);
    assert.ok(plan.bestSingle);
    assert.equal(plan.bestSingle.slug, "disco");
    assert.equal(plan.bestSingle.total, 1500);
    assert.equal(plan.savings, 100);
  });

  it("respects a manual supermarket choice and falls back when it has no eligible price", () => {
    const manual = computeBasketPlan([{ ean: "A", qty: 1 }, { ean: "B", qty: 1 }], catalog, { A: "carrefour" }, true);
    assert.equal(manual.items[0].chosenSlug, "carrefour");
    assert.equal(manual.mixedTotal, 1600);
    assert.equal(manual.savings, 0, "manual pick can erase the savings, never goes negative");

    const fallback = computeBasketPlan([{ ean: "A", qty: 1 }], catalog, { A: "jumbo" }, true);
    assert.equal(fallback.items[0].chosenSlug, "disco", "an ineligible manual pick falls back to the cheapest");
  });

  it("multiplies quantities and reports missing products in the mix", () => {
    const plan = computeBasketPlan(
      [{ ean: "A", qty: 2 }, { ean: "B", qty: 1 }, { ean: "C", qty: 1 }],
      { ...catalog, A: product("A", [["disco", 1000]]) },
      {},
      false,
    );
    const discoItem = plan.items.find((item) => item.ean === "A");
    assert.equal(discoItem?.lineTotal, 2000, "quantities multiply the price");
    assert.equal(plan.mixedMissing, 1, "the absent product is missing in the mix too");
    assert.equal(plan.savings, null, "no savings claim while the mix is incomplete");
    assert.equal(plan.mixedTotal, 2400, "A x2 at Disco plus B at its cheapest (Carrefour)");
  });
});
