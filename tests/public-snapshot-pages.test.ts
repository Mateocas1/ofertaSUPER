import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  loadSnapshotProductList,
  loadSnapshotProductPage,
  loadSnapshotSitemapCatalog,
  resolveSnapshotCatalogPage,
} from "../src/lib/public-pages";

// Behavioral tests for the server-side page loaders reading the committed
// snapshot. Same shapes the guarded database loaders returned, so pages keep
// rendering identical envelopes with real data.

const SNAPSHOT_EAN = "2505271000004";
const UNKNOWN_EAN = "0000000000000";
const NOW = new Date("2026-09-27T12:00:00Z");

describe("snapshot page loaders", () => {
  it("product list filters by query and paginates with the guarded page shape", () => {
    const result = loadSnapshotProductList({ query: "leche", limit: 12, page: 2 }, NOW);
    assert.equal(result.page, 2);
    assert.equal(result.limit, 12);
    assert.ok(result.total > 12, "leche matches more than one page");
    assert.ok(result.totalPages >= 2);
    assert.ok(result.items.length > 0 && result.items.length <= 12);
    for (const item of result.items) {
      assert.match(item.ean, /^\d{8,18}$/);
      assert.ok(typeof item.displayPrice === "number" || item.displayPrice === null);
    }
  });

  it("product list filters by category case-insensitively like the database did", () => {
    const result = loadSnapshotProductList({ category: "lácteos", limit: 48, page: 1 }, NOW);
    assert.ok(result.total > 0);
    for (const item of result.items) {
      assert.equal(item.category?.toLowerCase(), "lácteos");
    }
  });

  it("product list supports supermarket, offers-only, max price and price sorting", () => {
    const sorted = loadSnapshotProductList({ query: "", sort: "price-asc", limit: 48, page: 1 }, NOW);
    const prices = sorted.items.map((item) => item.minPrice ?? Number.POSITIVE_INFINITY);
    assert.deepEqual(prices, [...prices].sort((a, b) => a - b));

    const cheap = loadSnapshotProductList({ maxPrice: 1000, limit: 48, page: 1 }, NOW);
    for (const item of cheap.items) {
      assert.ok(item.minPrice !== null && item.minPrice <= 1000);
    }

    const offers = loadSnapshotProductList({ offersOnly: true, limit: 48, page: 1 }, NOW);
    assert.ok(offers.total > 0, "the snapshot has list prices above registered prices");
    for (const item of offers.items) {
      assert.ok(item.automaticDiscountPercent !== null);
    }

    const disco = loadSnapshotProductList({ supermarket: "disco", limit: 48, page: 1 }, NOW);
    assert.ok(disco.total > 0);
  });

  it("product page returns detail and dated history for a real EAN", async () => {
    const data = await loadSnapshotProductPage(SNAPSHOT_EAN, 90, NOW);
    assert.equal(data.dataSource, "database");
    assert.equal(data.degraded, false);
    assert.equal(typeof data.verifiedAt, "string");
    assert.ok(data.product);
    assert.equal(data.product.ean, SNAPSHOT_EAN);
    assert.ok(data.product.priceEntries.length > 0);
    assert.ok(data.history.series.length > 0);
    for (const series of data.history.series) {
      assert.match(series.color, /^#[0-9a-fA-F]{6}$/);
    }
  });

  it("product page returns a null product for an unknown EAN", async () => {
    const data = await loadSnapshotProductPage(UNKNOWN_EAN, 90, NOW);
    assert.equal(data.product, null);
    assert.deepEqual(data.history, { ean: UNKNOWN_EAN, days: 90, series: [], points: [] });
  });

  it("catalog page resolver wraps snapshot data with provenance and keeps the shell", async () => {
    const page = await resolveSnapshotCatalogPage({ query: "leche" }, () =>
      loadSnapshotProductList({ query: "leche", limit: 24, page: 1 }, NOW));
    assert.equal(page.availability, "eligible");
    assert.equal(page.shell.query, "leche");
    assert.equal(page.catalog.dataSource, "database");
    assert.equal(page.catalog.degraded, false);
    assert.equal(typeof page.catalog.verifiedAt, "string");
    assert.equal(typeof page.catalog.latestCheckedAt, "string");
  });

  it("sitemap catalog lists every snapshot EAN", async () => {
    const catalog = await loadSnapshotSitemapCatalog();
    assert.ok(catalog.products.length >= 500);
    assert.ok(catalog.products.every((product) => /^\d{8,18}$/.test(product.ean)));
  });
});
