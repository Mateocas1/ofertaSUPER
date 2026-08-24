import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ProductDetail } from "../src/lib/catalog";
import {
  resolveOfflineBasketProducts,
  resolveProductDetail,
  resolveRouteProductDetail,
} from "../src/lib/portfolio-catalog";

const knownEan = "7790002000022";
const offline = { CATALOG_OFFLINE_MODE: "true" };

describe("public portfolio catalog", () => {
  it("does not substitute a demo detail while offline", async () => {
    let databaseCalls = 0;
    const databaseDetail = { ean: knownEan, name: "Database product" } as ProductDetail;
    const detail = await resolveProductDetail(knownEan, async () => {
      databaseCalls += 1;
      return databaseDetail;
    }, offline);

    assert.equal(databaseCalls, 1);
    assert.equal(detail, databaseDetail);
  });

  it("keeps detail cache behavior independent of offline mode", async () => {
    const detail = { ean: knownEan, name: "Database product" } as ProductDetail;
    let reads = 0;
    const result = await resolveRouteProductDetail(knownEan, {
      loadDetail: async () => { throw new Error("cache should be used"); },
      readCache: async () => { reads += 1; return detail; },
      writeCache: async () => { throw new Error("cache should not be written"); },
    }, offline);

    assert.equal(reads, 1);
    assert.equal(result, detail);
  });


  it("preserves database failures rather than manufacturing an offline product", async () => {
    const failure = new Error("dependency unavailable");
    await assert.rejects(resolveProductDetail(knownEan, async () => { throw failure; }, offline),
      (error) => error === failure);
  });

  it("never creates an offline basket from demo data", () => {
    assert.equal(resolveOfflineBasketProducts([knownEan], offline), null);
  });

});
