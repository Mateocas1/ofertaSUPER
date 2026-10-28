import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getSnapshotProduct,
  parseCatalogSnapshot,
  searchSnapshotProducts,
  setSnapshotOverrideForTests,
  type CatalogSnapshot,
} from "../src/lib/catalog-snapshot";
import {
  loadSnapshotProductList,
  loadSnapshotSitemapCatalog,
  resolveSnapshotCatalogPage,
} from "../src/lib/public-pages";
import { naiveGetProduct, naiveProductList, naiveSearch, naiveSitemapEans } from "./helpers/naive-snapshot-oracle";
import { buildSnapshotFixture } from "./helpers/snapshot-fixture";

// The public read path answers from a per-EAN index built once per snapshot.
// These tests pin it to the previous full-scan algorithm (the oracle) and prove
// a full catalog pass no longer reads every offer once per product.

/** The fixture plus the shapes that make an index subtly wrong. */
function edgeSnapshot(): CatalogSnapshot {
  const fixture = buildSnapshotFixture();
  const [first, second] = fixture.products;
  const firstOffer = fixture.offers.find((offer) => offer.ean === first.ean)!;
  return parseCatalogSnapshot({
    ...fixture,
    products: [
      ...fixture.products,
      // Same EAN listed twice: both rows get the same offers.
      { ...second, name: "Leche Duplicada 1L" },
      // Older snapshots keep the source EAN-13 form instead of GTIN-14.
      { ...first, ean: `0${first.ean}`, name: "Leche Padded Twin 1L" },
      // Equal priced-offer counts and equal names exercise every tie-break.
      { ...first, ean: "7790009999990", name: "Aaa Same Name", brand: null, category: null, categorySlug: null },
      { ...first, ean: "7790009999983", name: "Aaa Same Name", brand: null, category: null, categorySlug: null },
    ],
    offers: [
      ...fixture.offers,
      // An offer without a product must never surface.
      { ...firstOffer, ean: "7790008888880" },
      { ...firstOffer, ean: `0${first.ean}`, source: "jumbo", price: null, available: false },
      { ...firstOffer, ean: "7790009999983", source: "vea" },
    ],
  });
}

const NOW = new Date("2026-01-15T12:00:00.000Z");
const QUERIES = [undefined, "", "leche", "LECHE", "serenísima", "de leche", "cafe", "7790001", "zzz"];
const SUPERMARKETS = [undefined, "carrefour", "disco", "jumbo", "vea", "unknown"];

describe("indexed snapshot read path matches the full-scan oracle", () => {
  const snapshot = edgeSnapshot();
  setSnapshotOverrideForTests(snapshot);

  it("search returns the same products, offers, ordering and totals", () => {
    for (const query of QUERIES) {
      for (const supermarket of SUPERMARKETS) {
        for (const [page, pageSize] of [[1, 24], [2, 7], [1, Number.MAX_SAFE_INTEGER]]) {
          const options = { query, supermarket, page, pageSize, now: NOW };
          assert.deepEqual(searchSnapshotProducts(options), naiveSearch(snapshot, options), JSON.stringify({ query, supermarket, page }));
        }
      }
    }
  });

  it("product lookup resolves every GTIN form to the same first product and offers", () => {
    const keys = [...snapshot.products.map((product) => product.ean), ...snapshot.products.map((product) => `0${product.ean}`), "0000000000000", "not-a-gtin", ""];
    for (const ean of keys) {
      assert.deepEqual(getSnapshotProduct(ean, NOW), naiveGetProduct(snapshot, ean, NOW), ean);
    }
  });

  it("product lists return the same page for every filter and sort", () => {
    const filterSets = [
      {},
      { category: "lácteos" },
      { category: "Almacén", sort: "price-asc" },
      { offersOnly: true, sort: "discount" },
      { supermarket: "disco", offersOnly: true, sort: "discount" },
      { query: "leche", sort: "relevance" },
      { query: "leche", sort: "updated", page: 2, limit: 5 },
      { minPrice: 1000, maxPrice: 3000, sort: "price-desc" },
      { category: "bebidas", maxPrice: 5000 },
      { category: "Inexistente" },
      { page: 3, limit: 4 },
      { sort: "constructor" },
    ];
    for (const filters of filterSets) {
      assert.deepEqual(loadSnapshotProductList(filters, NOW), naiveProductList(snapshot, filters, NOW), JSON.stringify(filters));
    }
  });

  it("sitemap catalog lists every product EAN in the same order", async () => {
    assert.deepEqual(await loadSnapshotSitemapCatalog(), { products: naiveSitemapEans(snapshot) });
  });
});

describe("catalog page resolver", () => {
  it("loads page data once per resolution", async () => {
    setSnapshotOverrideForTests(buildSnapshotFixture());
    let calls = 0;
    const page = await resolveSnapshotCatalogPage({}, () => {
      calls += 1;
      return loadSnapshotProductList({ limit: 3 }, NOW);
    });
    assert.equal(calls, 1);
    assert.equal(page.availability, "eligible");
    assert.equal(typeof page.catalog.latestCheckedAt, "string");
  });
});

/** Synthetic catalog whose offers array counts every element read. */
function countingSnapshot(productCount: number, offersPerProduct: number) {
  const reads = { count: 0 };
  const products = Array.from({ length: productCount }, (_, index) => ({
    ean: String(10_000_000 + index),
    name: `Producto ${index}`,
    brand: null,
    imageUrl: null,
    category: index % 2 === 0 ? "Almacén" : "Bebidas",
    categorySlug: null,
  }));
  const offers = products.flatMap((product, index) =>
    Array.from({ length: offersPerProduct }, (_, offerIndex) => ({
      ean: product.ean,
      source: `store-${offerIndex}`,
      price: 100 + index,
      listPrice: index % 3 === 0 ? 200 + index : null,
      promo: null,
      available: true,
      productUrl: null,
      observedAt: NOW.toISOString(),
      history: [],
    })));
  const counted = new Proxy(offers, {
    get(target, property, receiver) {
      if (typeof property === "string" && /^\d+$/.test(property)) reads.count += 1;
      return Reflect.get(target, property, receiver);
    },
  });
  const snapshot = parseCatalogSnapshot({ schemaVersion: 2, generatedAt: NOW.toISOString(), sources: [], products, offers: counted });
  return { snapshot, reads, offerCount: offers.length };
}

describe("hot paths do not scale as products times offers", () => {
  it("full catalog passes read each offer a bounded number of times", async () => {
    const { snapshot, reads, offerCount } = countingSnapshot(2_000, 2);
    setSnapshotOverrideForTests(snapshot);

    searchSnapshotProducts({ pageSize: Number.MAX_SAFE_INTEGER, now: NOW });
    searchSnapshotProducts({ supermarket: "store-1", pageSize: Number.MAX_SAFE_INTEGER, now: NOW });
    loadSnapshotProductList({ offersOnly: true, sort: "discount" }, NOW);
    loadSnapshotProductList({ category: "Almacén" }, NOW);
    await loadSnapshotSitemapCatalog();
    for (const product of snapshot.products.slice(0, 200)) getSnapshotProduct(product.ean, NOW);

    // The full scan read 2,000 x 4,000 = 8,000,000 offers per pass; the index
    // reads each offer once when it is built and never again.
    assert.ok(reads.count <= offerCount, `read ${reads.count} offers for ${offerCount} offers`);
  });
});
