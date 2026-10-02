import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getSnapshotProduct,
  normalizeQuery,
  offerFreshness,
  searchSnapshotProducts,
  snapshotMatchRank,
} from "../src/lib/catalog-snapshot";
import { installSnapshotFixture } from "./helpers/snapshot-fixture";

// Behavior of the snapshot read path, proven against the committed fixture in
// tests/fixtures/catalog-snapshot.fixture.json. The daily refresh rewrites the
// served snapshot, so no expectation here may depend on its real values.
const FIXTURE = installSnapshotFixture();
const GENERATED_AT = new Date(FIXTURE.generatedAt);

function normalized(value: string): string {
  return normalizeQuery(value);
}

function productsMatching(term: string): string[] {
  const needle = normalized(term);
  return FIXTURE.products
    .filter((product) =>
      [product.name, product.brand ?? "", product.ean].some((field) =>
        normalized(field).includes(needle),
      ),
    )
    .map((product) => product.ean);
}

describe("snapshot search", () => {
  it("finds products by name without accents or case", () => {
    assert.equal(normalizeQuery("LECHE"), "leche");
    const result = searchSnapshotProducts({ query: "LECHE", now: GENERATED_AT });
    assert.deepEqual(
      result.products.map((entry) => entry.product.ean).sort(),
      productsMatching("leche").sort(),
      "the upper-case query must return exactly the products that mention leche",
    );
    for (const entry of result.products) {
      const haystack = [entry.product.name, entry.product.brand ?? "", entry.product.ean]
        .map(normalized)
        .join(" ");
      assert.ok(haystack.includes("leche"), `result ${entry.product.ean} must mention leche`);
    }
  });

  it("matches accents-insensitively on every searched field", () => {
    const accented = searchSnapshotProducts({ query: "serenísima", now: GENERATED_AT });
    const plain = searchSnapshotProducts({ query: "serenisima", now: GENERATED_AT });
    assert.ok(accented.total > 0, "the fixture has a brand with an accent");
    assert.equal(accented.total, plain.total, "accented and plain queries must return the same set");
  });

  it("returns page 2 with a different slice and honest totals", () => {
    const first = searchSnapshotProducts({ now: GENERATED_AT, page: 1 });
    const second = searchSnapshotProducts({ now: GENERATED_AT, page: 2 });
    assert.equal(first.page, 1);
    assert.equal(second.page, 2);
    assert.equal(first.total, FIXTURE.products.length);
    assert.equal(second.total, first.total);
    const firstEans = first.products.map((entry) => entry.product.ean);
    const secondEans = second.products.map((entry) => entry.product.ean);
    assert.equal(firstEans.length, 24);
    assert.deepEqual(secondEans, secondEans.filter((ean) => !firstEans.includes(ean)));
  });

  it("finds a product by any GTIN form of its key, before and after GTIN-14 canonicalization", () => {
    const { product } = searchSnapshotProducts({ now: GENERATED_AT }).products[0];
    const canonical = product.ean.padStart(14, "0");
    const shortForm = canonical.replace(/^0/, "");
    for (const form of [product.ean, canonical, shortForm]) {
      assert.equal(getSnapshotProduct(form, GENERATED_AT)?.product.ean, product.ean, form);
    }
    assert.equal(snapshotMatchRank(product, canonical), 0);
    assert.equal(snapshotMatchRank(product, shortForm), 0);
  });

  it("returns null for an unknown EAN", () => {
    assert.equal(getSnapshotProduct("0000000000000", GENERATED_AT), null);
  });

  it("reports the fixture products with offers and freshness computed per request", () => {
    const found = searchSnapshotProducts({ query: "leche", now: GENERATED_AT });
    assert.ok(found.products.length > 0);
    const entry = found.products[0];
    assert.ok(entry.offers.length > 0, "every listed product must have offers");
    for (const offer of entry.offers) {
      assert.ok(FIXTURE.sources.includes(offer.source));
      assert.ok(offer.observedAt.length > 0);
      if (offer.promo !== null) {
        assert.ok(["nth-unit", "percent-off"].includes(offer.promo.type), "captured promotions carry the parsed shape");
        assert.ok(offer.promo.label.length > 0);
      }
    }
    const stale = getSnapshotProduct(entry.product.ean, new Date(GENERATED_AT.getTime() + 8 * 86_400_000));
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
