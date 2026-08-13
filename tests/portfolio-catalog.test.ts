import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ProductDetail } from "../src/lib/catalog";
import {
  resolveOfflineBasketProducts,
  resolveProductDetail,
  resolveRouteProductDetail,
} from "../src/lib/portfolio-catalog";

const knownEan = "7790002000022";
const unknownEan = "7799999999999";
const offline = { CATALOG_OFFLINE_MODE: "true" };

describe("explicit offline portfolio catalog", () => {
  it("isolates route cache reads and writes from offline detail", async () => {
    const databaseDetail = { ean: knownEan, name: "Database product" } as ProductDetail;
    let sharedCache = databaseDetail;
    let reads = 0;
    let writes = 0;
    const dependencies = {
      loadDetail: async () => databaseDetail,
      readCache: async () => { reads += 1; return sharedCache; },
      writeCache: async (_ean: string, product: ProductDetail) => { writes += 1; sharedCache = product; },
    };

    const demo = await resolveRouteProductDetail(knownEan, dependencies, offline);
    assert.equal(demo?.name, "Yerba mate suave 1kg");
    assert.deepEqual([reads, writes], [0, 0]);
    assert.equal(await resolveRouteProductDetail(knownEan, dependencies, {}), databaseDetail);
  });

  it("preserves production route cache hits and misses", async () => {
    const detail = { ean: knownEan, name: "Database product" } as ProductDetail;
    let cached: typeof detail | null = detail;
    let loads = 0;
    let writes = 0;
    const dependencies = {
      loadDetail: async () => { loads += 1; return detail; },
      readCache: async () => cached,
      writeCache: async (_ean: string, product: ProductDetail) => { writes += 1; cached = product; },
    };

    assert.equal(await resolveRouteProductDetail(knownEan, dependencies, {}), detail);
    assert.deepEqual([loads, writes], [0, 0]);
    cached = null;
    assert.equal(await resolveRouteProductDetail(knownEan, dependencies, {}), detail);
    assert.deepEqual([loads, writes, cached], [1, 1, detail]);
  });

  it("resolves a known demo detail without calling the database", async () => {
    let databaseCalls = 0;
    const detail = await resolveProductDetail(knownEan, async () => {
      databaseCalls += 1;
      throw new Error("database must not be called");
    }, offline);

    assert.equal(databaseCalls, 0);
    assert.equal(detail?.ean, knownEan);
    assert.equal(detail?.name, "Yerba mate suave 1kg");
    assert.equal(detail?.displayPriceFreshnessStatus, "stale");
    assert.equal(detail?.priceEntries.length, 3);
    assert.deepEqual(detail?.promotions, []);
  });

  it("keeps unknown demo EANs honestly missing", async () => {
    const detail = await resolveProductDetail(unknownEan, async () => {
      throw new Error("database must not be called");
    }, offline);
    assert.equal(detail, null);
  });

  it("preserves database results and failures when offline mode is disabled", async () => {
    const databaseDetail = { ean: knownEan, name: "Database product" } as never;
    assert.equal(await resolveProductDetail(knownEan, async () => databaseDetail, {}), databaseDetail);
    const failure = new Error("dependency unavailable");
    await assert.rejects(resolveProductDetail(knownEan, async () => { throw failure; }, {}),
      (error) => error === failure);
  });

  it("resolves known basket items in request order and reports unknown EANs", () => {
    const result = resolveOfflineBasketProducts([knownEan, unknownEan, "7790001000011"], offline);
    assert.deepEqual(result?.items.map(({ ean }) => ean), [knownEan, "7790001000011"]);
    assert.deepEqual(result?.missing, [unknownEan]);
    assert.equal(result?.items[0]?.priceEntries.every((entry) => entry.freshnessStatus === "stale"), true);
    assert.equal(resolveOfflineBasketProducts([knownEan], {}), null);
  });

  it("isolates nested supermarket data mutated through detail results", async () => {
    const detail = await resolveProductDetail(knownEan, async () => null, offline);
    assert.ok(detail);
    const originalName = detail.priceEntries[0].supermarket.name;

    try {
      detail.priceEntries[0].supermarket.name = "Mutated detail supermarket";

      const subsequentDetail = await resolveProductDetail(knownEan, async () => null, offline);
      const subsequentBasket = resolveOfflineBasketProducts([knownEan], offline);
      assert.equal(subsequentDetail?.priceEntries[0].supermarket.name, originalName);
      assert.equal(subsequentBasket?.items[0].priceEntries[0].supermarket.name, originalName);
    } finally {
      detail.priceEntries[0].supermarket.name = originalName;
    }
  });

  it("isolates nested supermarket data mutated through basket results", async () => {
    const basket = resolveOfflineBasketProducts([knownEan], offline);
    assert.ok(basket);
    const originalName = basket.items[0].priceEntries[0].supermarket.name;

    try {
      basket.items[0].priceEntries[0].supermarket.name = "Mutated basket supermarket";

      const subsequentBasket = resolveOfflineBasketProducts([knownEan], offline);
      const subsequentDetail = await resolveProductDetail(knownEan, async () => null, offline);
      assert.equal(subsequentBasket?.items[0].priceEntries[0].supermarket.name, originalName);
      assert.equal(subsequentDetail?.priceEntries[0].supermarket.name, originalName);
    } finally {
      basket.items[0].priceEntries[0].supermarket.name = originalName;
    }
  });
});
