import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeGtin } from "../src/lib/identity/gtin";
import {
  loadSnapshotProductList,
  loadSnapshotProductPage,
  loadSnapshotSitemapCatalog,
  resolveSnapshotCatalogPage,
} from "../src/lib/public-pages";
import { useSnapshotFixture } from "./helpers/snapshot-fixture";

// Behavioral tests for the server-side page loaders reading the committed
// fixture snapshot (never the daily-refreshed data). Same shapes the guarded
// database loaders returned, so pages keep rendering identical envelopes.

const FIXTURE = useSnapshotFixture();
const NOW = new Date(FIXTURE.generatedAt);
const SAMPLE = FIXTURE.products[1];
const SAMPLE_OFFERS = FIXTURE.offers.filter((offer) => offer.ean === SAMPLE.ean);
const UNKNOWN_EAN = "0000000000000";

function fixtureCount(predicate: (product: (typeof FIXTURE.products)[number]) => boolean): number {
  return FIXTURE.products.filter(predicate).length;
}

describe("snapshot page loaders", () => {
  it("product list filters by query and paginates with the guarded page shape", () => {
    const result = loadSnapshotProductList({ query: "leche", limit: 12, page: 2 }, NOW);
    assert.equal(result.page, 2);
    assert.equal(result.limit, 12);
    assert.ok(result.total > 12, "leche matches more than one page");
    assert.equal(result.totalPages, Math.ceil(result.total / 12));
    assert.ok(result.items.length > 0 && result.items.length <= 12);
    for (const item of result.items) {
      assert.match(item.ean, /^\d{8,18}$/);
      assert.ok(typeof item.displayPrice === "number" || item.displayPrice === null);
    }
  });

  it("product list filters by category case-insensitively like the database did", () => {
    const result = loadSnapshotProductList({ category: "lácteos", limit: 48, page: 1 }, NOW);
    assert.equal(result.total, fixtureCount((product) => product.category === "Lácteos"));
    for (const item of result.items) {
      assert.equal(item.category?.toLowerCase(), "lácteos");
    }
    assert.ok(result.total > 0);
  });

  it("product list supports supermarket, offers-only, max price and price sorting", () => {
    const sorted = loadSnapshotProductList({ query: "", sort: "price-asc", limit: 48, page: 1 }, NOW);
    const prices = sorted.items.map((item) => item.minPrice ?? Number.POSITIVE_INFINITY);
    assert.deepEqual(prices, [...prices].sort((a, b) => a - b));

    const cheap = loadSnapshotProductList({ maxPrice: 1000, limit: 48, page: 1 }, NOW);
    assert.ok(cheap.total > 0, "the fixture has products under the cap");
    assert.ok(cheap.total < sorted.total, "the cap must drop at least one product");
    for (const item of cheap.items) {
      assert.ok(item.minPrice !== null && item.minPrice <= 1000);
    }

    const offers = loadSnapshotProductList({ offersOnly: true, limit: 48, page: 1 }, NOW);
    const discounted = fixtureCount((product) =>
      FIXTURE.offers.some(
        (offer) =>
          offer.ean === product.ean &&
          offer.price !== null &&
          offer.listPrice !== null &&
          offer.listPrice > offer.price,
      ));
    assert.equal(offers.total, discounted, "offers-only lists exactly the products with a list price above the price");
    for (const item of offers.items) {
      assert.ok(item.automaticDiscountPercent !== null);
    }

    const carrefour = loadSnapshotProductList({ supermarket: "carrefour", limit: 48, page: 1 }, NOW);
    assert.ok(carrefour.total > 0);
    const disco = loadSnapshotProductList({ supermarket: "disco", limit: 48, page: 1 }, NOW);
    assert.ok(disco.total > 0);
    assert.ok(disco.total < carrefour.total, "not every fixture product has a disco offer");
  });

  it("product page returns detail and dated history for a real EAN", async () => {
    const data = await loadSnapshotProductPage(SAMPLE.ean, 90, NOW);
    assert.equal(data.dataSource, "database");
    assert.equal(data.degraded, false);
    assert.equal(typeof data.verifiedAt, "string");
    assert.ok(data.product);
    assert.equal(normalizeGtin(data.product.ean), normalizeGtin(SAMPLE.ean));
    assert.equal(data.product.priceEntries.length, SAMPLE_OFFERS.length);
    assert.equal(data.history.series.length, SAMPLE_OFFERS.length);
    for (const series of data.history.series) {
      assert.match(series.color, /^#[0-9a-fA-F]{6}$/);
    }
    assert.equal(data.history.points.length, SAMPLE_OFFERS[0].history.length);
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
    assert.equal(catalog.products.length, FIXTURE.products.length);
    assert.ok(catalog.products.every((product) => /^\d{8,18}$/.test(product.ean)));
  });
});
