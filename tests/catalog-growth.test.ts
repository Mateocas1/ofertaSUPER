import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { catalogGrowth, formatCatalogGrowth, formatPhaseTimings, readSnapshotKeys, snapshotKeys } from "../scripts/lib/catalog-growth";

const snapshot = (products: string[], offers: Array<[string, string]>) => ({
  products: products.map((ean) => ({ ean })),
  offers: offers.map(([ean, source]) => ({ ean, source })),
});

describe("catalog growth", () => {
  it("counts new and gone products and offers against the previous snapshot", () => {
    const before = snapshotKeys(snapshot(["a", "b"], [["a", "disco"], ["b", "jumbo"]]));
    const after = snapshotKeys(snapshot(["b", "c", "d"], [["b", "jumbo"], ["b", "disco"], ["c", "carrefour"], ["d", "disco"]]));

    const growth = catalogGrowth(before, after);

    assert.deepEqual(growth, { products: 3, offers: 4, newProducts: 2, goneProducts: 1, newOffers: 3, goneOffers: 1 });
    assert.equal(formatCatalogGrowth(growth), "[refresh] catalog: products=3 (+2 new, -1 gone); offers=4 (+3 new, -1 gone)");
  });

  it("treats a missing or malformed snapshot as empty", () => {
    assert.equal(readSnapshotKeys("does/not/exist.json").products.size, 0);
    assert.equal(snapshotKeys(null).offers.size, 0);
    assert.equal(snapshotKeys({ products: "nope" }).products.size, 0);
  });

  it("formats the phase timings in minutes", () => {
    assert.equal(formatPhaseTimings([{ name: "searches", ms: 366_000 }, { name: "topup", ms: 1_578_000 }]), "[refresh] timings: searches=6.1m topup=26.3m");
  });
});
