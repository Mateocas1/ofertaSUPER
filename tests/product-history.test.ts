import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { handleProductHistoryRequest, loadProductPageData } from "../src/lib/product-history";

const ean = "7790001000012";
const product = { ean, name: "Test product" } as never;
const emptyHistory = { ean, days: 30, series: [], points: [] };

describe("product page history", () => {
  it("keeps successful detail and supplies empty chart data when history rejects", async () => {
    const result = await loadProductPageData(ean, 90, {
      loadDetail: async () => product,
      loadHistory: async () => { throw new Error("database details"); },
    });

    assert.equal(result.product, product);
    assert.deepEqual(result.history, { ...emptyHistory, days: 90 });
  });

  it("keeps product-detail rejection observable", async () => {
    const detailFailure = new Error("detail unavailable");
    let historyCalls = 0;

    await assert.rejects(loadProductPageData(ean, 90, {
      loadDetail: async () => { throw detailFailure; },
      loadHistory: async () => { historyCalls += 1; return emptyHistory; },
    }), (error) => error === detailFailure);
    assert.equal(historyCalls, 0);
  });
});

describe("product history endpoint", () => {
  it("preserves invalid days as 400 without calling dependencies", async () => {
    let calls = 0;
    const result = await handleProductHistoryRequest(ean, { days: "6" }, {
      loadDetail: async () => { calls += 1; return product; },
      loadHistory: async () => { calls += 1; return emptyHistory; },
    });

    assert.equal(result.status, 400);
    assert.equal(result.body.error, "Invalid query parameters");
    assert.equal(calls, 0);
  });

  it("preserves confirmed missing products as 404", async () => {
    const result = await handleProductHistoryRequest(ean, { days: "30" }, {
      loadDetail: async () => null,
      loadHistory: async () => { throw new Error("must not run"); },
    });

    assert.deepEqual(result, { status: 404, body: { error: "Product not found" } });
  });

  it("returns a stable generic 503 for runtime history failures", async () => {
    const result = await handleProductHistoryRequest(ean, { days: "30" }, {
      loadDetail: async () => product,
      loadHistory: async () => { throw new Error("secret dependency details"); },
    });

    assert.deepEqual(result, {
      status: 503,
      body: { error: "Price history temporarily unavailable" },
    });
  });
});
