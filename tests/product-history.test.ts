import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PublicCatalogUnavailableError } from "../src/lib/public-catalog-api";
import { handleProductHistoryRequest, loadProductPageData } from "../src/lib/product-history";
import { createGuardedProductPageLoader } from "../src/lib/seo/public-catalog-page";

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

  it("shares one guarded result between metadata and HTML consumers for identical page inputs", async () => {
    let guardedLoads = 0;
    const memoize = <Args extends unknown[], Result>(load: (...args: Args) => Promise<Result>) => {
      const results = new Map<string, Promise<Result>>();
      return (...args: Args) => {
        const key = JSON.stringify(args);
        const result = results.get(key) ?? load(...args);
        results.set(key, result);
        return result;
      };
    };
    const loadPage = createGuardedProductPageLoader(async (loadedEan, days) => {
      guardedLoads += 1;
      return {
        product: { ean: loadedEan, name: `Product ${guardedLoads}` } as never,
        history: { ean: loadedEan, days, series: [], points: [] } as never,
        dataSource: "database",
        degraded: false,
        verifiedAt: "2026-03-01T00:00:00.000Z",
        latestCheckedAt: null,
      };
    }, memoize);

    const metadataPage = await loadPage(ean, 90);
    const htmlPage = await loadPage(ean, 90);

    assert.equal(guardedLoads, 1);
    assert.equal(metadataPage, htmlPage);
    assert.equal(metadataPage.availability, "eligible");
    assert.equal(htmlPage.availability, "eligible");
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
