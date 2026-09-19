import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PublicCatalogUnavailableError } from "../src/lib/public-catalog-api";
import { handleProductHistoryRequest, loadProductPageData } from "../src/lib/product-history";

const ean = "7790001000012";
const product = { ean, name: "Test product" } as never;
const emptyHistory = { ean, days: 30, series: [], points: [] };
const pageData = async () => ({ product, history: emptyHistory }) as never;

describe("product page history", () => {
  it("uses the guarded page-data result without manufacturing an empty history", async () => {
    const result = await loadProductPageData(ean, 90, pageData);
    assert.equal(result.product, product);
    assert.equal(result.history, emptyHistory);
  });

  it("keeps authority denial observable to the page caller", async () => {
    await assert.rejects(loadProductPageData(ean, 90, async () => {
      throw new PublicCatalogUnavailableError();
    }), PublicCatalogUnavailableError);
  });
});

describe("product history endpoint", () => {
  it("preserves invalid days as 400 without calling dependencies", async () => {
    let calls = 0;
    const result = await handleProductHistoryRequest(ean, { days: "6" }, async () => {
      calls += 1;
      return pageData();
    });
    assert.equal(result.status, 400);
    assert.equal(result.body.error, "Invalid query parameters");
    assert.equal(calls, 0);
  });

  it("returns 404 only after an eligible guarded read confirms absence", async () => {
    const result = await handleProductHistoryRequest(ean, { days: "30" }, async () => ({
      product: null, history: emptyHistory,
    }) as never);
    assert.deepEqual(result, { status: 404, body: { error: "Product not found" } });
  });

  it("maps authority denial to 503 rather than an empty history", async () => {
    const result = await handleProductHistoryRequest(ean, { days: "30" }, async () => {
      throw new PublicCatalogUnavailableError();
    });
    assert.deepEqual(result, { status: 503, body: { error: "Price history temporarily unavailable" } });
  });
});
