import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getSnapshotProduct,
  normalizeQuery,
  offerFreshness,
  searchSnapshotProducts,
} from "../src/lib/catalog-snapshot";

const now = new Date("2026-09-27T12:00:00.000Z");
// The snapshot is generated from the local database; every committed offer is
// observed on 2026-09-20, so anything inside 24 h of the injected clock must
// be proven with an explicit observedAt rather than assumed.
const fixedNow = new Date("2026-09-21T00:00:00.000Z");

describe("snapshot search", () => {
  it("finds products by name without accents or case", () => {
    const query = normalizeQuery("LECHE");
    assert.ok(query === "leche");
    const result = searchSnapshotProducts({ query: "LECHE", now: fixedNow });
    assert.ok(result.total > 0, "leche must match at least one real product");
    for (const entry of result.products) {
      const haystack = [entry.product.name, entry.product.brand ?? "", entry.product.ean]
        .map(normalizeQuery)
        .join(" ");
      assert.ok(haystack.includes("leche"), `result ${entry.product.ean} must mention leche`);
    }
  });

  it("matches accents-insensitively on brand names", () => {
    const accented = searchSnapshotProducts({ query: "lácteos", now: fixedNow });
    const plain = searchSnapshotProducts({ query: "lacteos", now: fixedNow });
    assert.equal(
      accented.total,
      plain.total,
      "accented and plain queries must return the same set",
    );
  });

  it("returns page 2 with a different slice and honest totals", () => {
    const first = searchSnapshotProducts({ now: fixedNow, page: 1 });
    const second = searchSnapshotProducts({ now: fixedNow, page: 2 });
    assert.equal(first.page, 1);
    assert.equal(second.page, 2);
    assert.ok(first.total > 24, "the catalog must span more than one page");
    assert.equal(second.total, first.total);
    const firstEans = first.products.map((entry) => entry.product.ean);
    const secondEans = second.products.map((entry) => entry.product.ean);
    assert.deepEqual(secondEans, secondEans.filter((ean) => !firstEans.includes(ean)));
    assert.equal(first.products.length, 24);
  });

  it("returns null for an unknown EAN", () => {
    assert.equal(getSnapshotProduct("0000000000000", fixedNow), null);
  });

  it("reports real products with offers and freshness computed per request", () => {
    const found = searchSnapshotProducts({ query: "leche", now: fixedNow });
    assert.ok(found.products.length > 0);
    const entry = found.products[0];
    assert.ok(entry.offers.length > 0, "every listed product must have offers");
    for (const offer of entry.offers) {
      assert.ok(["carrefour", "disco", "jumbo"].includes(offer.source));
      assert.ok(offer.observedAt.length > 0);
      if (offer.promo !== null) {
        assert.ok(["nth-unit", "percent-off"].includes(offer.promo.type), "captured promotions carry the parsed shape");
        assert.ok(offer.promo.label.length > 0);
      }
    }
    const stale = getSnapshotProduct(entry.product.ean, new Date("2026-10-01T00:00:00.000Z"));
    assert.ok(stale);
    assert.equal(stale.freshCount, 0, "a week later nothing is fresh anymore");
  });

  it("computes freshness against the injected clock", () => {
    const offer = {
      ean: "1",
      source: "carrefour",
      price: 100,
      listPrice: null,
      promo: null as null,
      available: true,
      productUrl: null,
      observedAt: "2026-09-21T00:00:00.000Z",
      history: [],
    };
    assert.equal(offerFreshness(offer, new Date("2026-09-21T06:00:00.000Z")).fresh, true);
    assert.equal(offerFreshness(offer, new Date("2026-09-22T01:00:00.000Z")).fresh, false);
    assert.equal(offerFreshness(offer, new Date("2026-09-21T01:00:00.000Z")).ageHours, 1);
  });
});
