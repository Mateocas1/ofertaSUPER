import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeQuery, searchSnapshotProducts, snapshotMatchRank } from "../src/lib/catalog-snapshot";

// Behavioral tests for the snapshot search ranking: exact EAN first, then
// names that start with the term, then whole-word matches not preceded by
// "de", then every other name or brand match. Stable tiebreak: more
// supermarkets with an offer first, then the name.

const LECHE = { ean: "7790001000011", name: "Leche Entera La Serenísima 1L", brand: "La Serenísima" };
const DULCE = { ean: "7790002000022", name: "Dulce de Leche Milkaut", brand: "Milkaut" };
const CHOCO = { ean: "7790003000033", name: "Chocolate Sabor Leche", brand: "Milka" };

function productsWithOffers(entries: Array<{ ean: string; supers: number }>) {
  return entries.flatMap(({ ean, supers }) =>
    Array.from({ length: supers }, (_, index) => ({ ean, source: `super${index}` })),
  );
}

describe("snapshot search ranking", () => {
  it("ranks exact EAN matches before everything else", () => {
    assert.equal(snapshotMatchRank(LECHE, "7790001000011"), 0);
    assert.ok(snapshotMatchRank(LECHE, "7790001000011") < snapshotMatchRank({ ...LECHE, ean: "1" }, "7790001000011"));
  });

  it("ranks names that start with the term above whole-word matches", () => {
    assert.equal(snapshotMatchRank(LECHE, "leche"), 1);
    assert.equal(snapshotMatchRank(CHOCO, "leche"), 2);
  });

  it("ignores whole-word matches preceded by 'de' and accents", () => {
    assert.equal(snapshotMatchRank(DULCE, "leche"), 3);
    assert.equal(snapshotMatchRank({ ean: "1", name: "Café en grano" }, "cafe"), 1);
    assert.equal(snapshotMatchRank({ ean: "2", name: "Mi Cafetera" }, "cafe"), 3);
    assert.equal(snapshotMatchRank({ ean: "3", name: "Soluble de Café" }, "cafe"), 3);
  });

  it("orders q=leche with the real milk before chocolate and dulce de leche", () => {
    const ranked = [
      { product: DULCE, offers: productsWithOffers([{ ean: DULCE.ean, supers: 1 }]) },
      { product: CHOCO, offers: productsWithOffers([{ ean: CHOCO.ean, supers: 1 }]) },
      { product: LECHE, offers: productsWithOffers([{ ean: LECHE.ean, supers: 1 }]) },
    ];
    const sorted = [...ranked].sort(
      (a, b) => snapshotMatchRank(a.product, "leche") - snapshotMatchRank(b.product, "leche"),
    );
    assert.deepEqual(sorted.map(({ product }) => product.name), [
      "Leche Entera La Serenísima 1L",
      "Chocolate Sabor Leche",
      "Dulce de Leche Milkaut",
    ]);
  });

  it("breaks ties by supermarkets with an offer, then name", () => {
    const result = searchSnapshotProducts({ query: "cafe" });
    const supersWithOffer = ({ offers }: { offers: { available: boolean; price: number | null }[] }) =>
      offers.filter((offer) => offer.available && offer.price !== null).length;
    for (let index = 0; index < result.products.length - 1; index += 1) {
      const left = result.products[index];
      const right = result.products[index + 1];
      const rankDiff = snapshotMatchRank(left.product, "cafe") - snapshotMatchRank(right.product, "cafe");
      if (rankDiff !== 0) {
        assert.ok(rankDiff < 0, "ranks must be non-decreasing");
        continue;
      }
      const supersDiff = supersWithOffer(right) - supersWithOffer(left);
      assert.ok(supersDiff <= 0, "ties must favor more supermarkets with an offer");
      if (supersDiff === 0) {
        assert.ok(left.product.name.localeCompare(right.product.name) <= 0, "ties must end in name order");
      }
    }
  });

  it("serves /buscar?q=leche with a milk product first from the committed snapshot", () => {
    const result = searchSnapshotProducts({ query: "leche" });
    assert.ok(result.total > 0);
    const firstName = normalizeQuery(result.products[0].product.name);
    assert.ok(firstName.startsWith("leche"), `expected a product whose name starts with leche, got: ${result.products[0].product.name}`);
  });

  it("serves accent-insensitive searches with the accented product first", () => {
    const result = searchSnapshotProducts({ query: "cafe" });
    assert.ok(result.total > 0);
    const firstName = normalizeQuery(result.products[0].product.name);
    assert.ok(firstName.startsWith("cafe"), `expected a product whose name starts with cafe, got: ${result.products[0].product.name}`);
  });

  it("serves an EAN search with exactly that product first", () => {
    const result = searchSnapshotProducts({ query: "2505271000004" });
    assert.equal(result.products[0].product.ean, "2505271000004");
  });
});
