import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NextRequest } from "next/server";

import { basketProductsResponseSchema } from "../src/lib/basket-products-contract";
import {
  handleProductDetail,
  handleProductHistory,
  handleProducts,
  handleProductsBatch,
  handleSearch,
  type PublicApiDeps,
} from "../src/lib/public-api";
import { installSnapshotFixture } from "./helpers/snapshot-fixture";

// Behavioral tests for the public catalog handlers reading the committed
// fixture snapshot, so the daily refresh cannot change their expectations.
// Handlers receive their collaborators through deps, so the rate limiter is a
// stub: admit, exhaust (429) or null (strict routes fail closed with 503). The
// snapshot is the only data source; an unknown EAN is 404.

// Strict admission derives the client identity at a trusted deployment
// boundary (a single-address x-forwarded-for on Vercel); tests simulate that
// boundary instead of injecting anything into the handlers.
process.env.VERCEL = "1";

const FIXTURE = installSnapshotFixture();
const SAMPLE = FIXTURE.products[1];
const SAMPLE_OFFERS = FIXTURE.offers.filter((offer) => offer.ean === SAMPLE.ean);
const SNAPSHOT_EAN = SAMPLE.ean;
// Lookups accept the short EAN; any GTIN form of the key resolves to the same product.
const SNAPSHOT_GTIN14 = SNAPSHOT_EAN.padStart(14, "0");
const UNKNOWN_EAN = "0000000000000";
const NOW = new Date(FIXTURE.generatedAt);

function request(path: string, init?: { method?: string; body?: string }): NextRequest {
  return new NextRequest(`https://ofertas-super.vercel.app${path}`, {
    ...init,
    headers: { "x-forwarded-for": "203.0.113.7" },
  });
}

function deps(mode: "admit" | "exhaust" | null): PublicApiDeps {
  if (mode === null) return { limiter: null, now: () => NOW };
  return {
    limiter: {
      limit: async () => ({
        success: mode === "admit",
        limit: 60,
        remaining: mode === "admit" ? 59 : 0,
        reset: NOW.getTime() + 60_000,
        pending: Promise.resolve(),
      }),
    },
    now: () => NOW,
  };
}

describe("public catalog handlers serve the committed snapshot", () => {
  it("search returns real snapshot products with the database provenance envelope", async () => {
    const response = await handleSearch(request("/api/search?q=leche"), deps("admit"));
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      dataSource: string;
      degraded: boolean;
      verifiedAt: string | null;
      latestCheckedAt: string | null;
      items: Record<string, unknown>[];
    };
    assert.equal(body.dataSource, "database");
    assert.equal(body.degraded, false);
    assert.equal(typeof body.verifiedAt, "string");
    assert.ok(body.items.length > 0, "leche must match real products");
    assert.ok(body.items.length <= 8, "the default suggestion limit is 8");
    const allowedKeys = [
      "ean", "name", "brand", "imageUrl", "category", "minPrice", "displayPrice",
      "latestCheckedAt", "bestPriceCheckedAt", "freshnessStatus",
    ];
    for (const item of body.items) {
      assert.ok(Object.keys(item).every((key) => allowedKeys.includes(key)), "suggestion shape leaked keys");
      assert.match(item.ean as string, /^\d{8,18}$/);
    }
  });

  it("search respects the requested limit", async () => {
    const response = await handleSearch(request("/api/search?q=leche&limit=1"), deps("admit"));
    assert.equal(response.status, 200);
    const body = (await response.json()) as { items: unknown[] };
    assert.equal(body.items.length, 1);
  });

  it("search rejects invalid queries with 400 before reading data", async () => {
    const response = await handleSearch(request("/api/search?q="), deps("admit"));
    assert.equal(response.status, 400);
  });

  it("search fails closed with 503 when the strict limiter is unavailable", async () => {
    const response = await handleSearch(request("/api/search?q=leche"), deps(null));
    assert.equal(response.status, 503);
    const body = (await response.json()) as { dataSource: string };
    assert.equal(body.dataSource, "unavailable");
  });

  it("search rejects exhausted limiter budgets with 429", async () => {
    const response = await handleSearch(request("/api/search?q=leche"), deps("exhaust"));
    assert.equal(response.status, 429);
    const body = (await response.json()) as { error: string };
    assert.match(body.error, /Rate limit/i);
  });

  it("products list keeps the guarded page envelope and honors pagination params", async () => {
    const response = await handleProducts(request("/api/products?page=2&limit=12"), deps("admit"));
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      dataSource: string;
      degraded: boolean;
      verifiedAt: string | null;
      latestCheckedAt: string | null;
      items: { ean: string }[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
    assert.equal(body.dataSource, "database");
    assert.equal(body.page, 2);
    assert.equal(body.limit, 12);
    assert.ok(body.total > 0);
    assert.ok(body.items.length > 0 && body.items.length <= 12);
    assert.ok(body.totalPages >= 2);
  });

  it("products list rejects invalid queries with 400", async () => {
    const response = await handleProducts(request("/api/products?page=0"), deps("admit"));
    assert.equal(response.status, 400);
  });

  it("product detail returns 404 for an unknown EAN", async () => {
    const response = await handleProductDetail(request(`/api/products/${UNKNOWN_EAN}`), UNKNOWN_EAN, deps("admit"));
    assert.equal(response.status, 404);
    const body = (await response.json()) as { error: string };
    assert.equal(body.error, "Product not found");
  });

  it("product detail returns the full guarded envelope for a real EAN", async () => {
    const response = await handleProductDetail(request(`/api/products/${SNAPSHOT_EAN}`), SNAPSHOT_EAN, deps("admit"));
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      dataSource: string;
      degraded: boolean;
      verifiedAt: string | null;
      latestCheckedAt: string | null;
      item: { ean: string; priceEntries: { supermarket: { slug: string }; freshnessStatus: string }[] };
    };
    assert.equal(body.item.ean, SNAPSHOT_EAN);
    assert.equal(body.item.ean.padStart(14, "0"), SNAPSHOT_GTIN14);
    assert.equal(body.dataSource, "database");
    assert.equal(body.degraded, false);
    assert.equal(typeof body.verifiedAt, "string");
    assert.equal(body.latestCheckedAt, null);
    assert.equal(body.item.priceEntries.length, SAMPLE_OFFERS.length);
    for (const entry of body.item.priceEntries) {
      assert.ok(FIXTURE.sources.includes(entry.supermarket.slug));
      assert.ok(["fresh", "stale", "unknown"].includes(entry.freshnessStatus));
    }
  });

  it("product detail fails closed with 503 when the strict limiter is unavailable", async () => {
    const response = await handleProductDetail(request(`/api/products/${SNAPSHOT_EAN}`), SNAPSHOT_EAN, deps(null));
    assert.equal(response.status, 503);
    const body = (await response.json()) as { dataSource: string };
    assert.equal(body.dataSource, "unavailable");
  });

  it("product history builds series and dated points from the snapshot history", async () => {
    const response = await handleProductHistory(request(`/api/products/${SNAPSHOT_EAN}/history?days=7`), SNAPSHOT_EAN, deps("admit"));
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      ean: string;
      days: number;
      series: { slug: string; name: string; color: string }[];
      points: Record<string, number | string | null>[];
    };
    assert.equal(body.ean, SNAPSHOT_EAN);
    assert.equal(body.days, 7);
    assert.ok(body.series.length > 0, "every supermarket with history needs a series");
    for (const series of body.series) {
      assert.ok(series.name.length > 0);
      assert.match(series.color, /^#[0-9a-fA-F]{6}$/, "series color must come from the supermarket color constant");
    }
    assert.ok(body.points.length > 0);
    for (const point of body.points) {
      assert.match(point.date as string, /^\d{4}-\d{2}-\d{2}$/);
    }
    const carrefourOffer = SAMPLE_OFFERS.find((offer) => offer.source === "carrefour");
    assert.ok(carrefourOffer && carrefourOffer.price !== null);
    const carrefourValue = body.points.flatMap((point) => point.carrefour ?? []);
    assert.ok(
      carrefourValue.includes(carrefourOffer.price),
      "the fixture history price must surface as a chart point",
    );
  });

  it("product history returns 404 for an unknown EAN and 400 for invalid days", async () => {
    const missing = await handleProductHistory(request(`/api/products/${UNKNOWN_EAN}/history`), UNKNOWN_EAN, deps("admit"));
    assert.equal(missing.status, 404);
    const invalid = await handleProductHistory(request(`/api/products/${SNAPSHOT_EAN}/history?days=1`), SNAPSHOT_EAN, deps("admit"));
    assert.equal(invalid.status, 400);
  });

  it("products batch serves the basket contract for found and missing EANs", async () => {
    const response = await handleProductsBatch(
      request("/api/products/batch", { method: "POST", body: JSON.stringify({ eans: [SNAPSHOT_EAN, UNKNOWN_EAN] }) }),
      deps("admit"),
    );
    assert.equal(response.status, 200);
    const body = basketProductsResponseSchema.parse(await response.json());
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].ean, SNAPSHOT_EAN);
    assert.deepEqual(body.missing, [UNKNOWN_EAN]);
    assert.equal(body.dataSource, "database");
    assert.equal(typeof body.verifiedAt, "string");
    assert.ok(body.items[0].priceEntries.length > 0);
    const withListPrice = body.items[0].priceEntries.filter((entry) => entry.listPrice !== null);
    assert.ok(withListPrice.length > 0, "entries must expose the list price so the cart can strike it through");
    for (const entry of withListPrice) {
      assert.ok(entry.listPrice !== null && entry.price !== null && entry.listPrice > entry.price, "a struck price needs list above registered");
    }
  });

  it("products batch answers each basket key in the form the client stored it", async () => {
    const canonical = SNAPSHOT_EAN.padStart(14, "0");
    for (const stored of [SNAPSHOT_EAN, canonical]) {
      const response = await handleProductsBatch(
        request("/api/products/batch", { method: "POST", body: JSON.stringify({ eans: [stored] }) }),
        deps("admit"),
      );
      const body = basketProductsResponseSchema.parse(await response.json());
      assert.deepEqual(body.items.map((item) => item.ean), [stored], stored);
      assert.deepEqual(body.missing, [], stored);
    }
  });

  it("products batch rejects invalid bodies with 400 and exhausted budgets with 429", async () => {
    const invalid = await handleProductsBatch(
      request("/api/products/batch", { method: "POST", body: "not json" }),
      deps("admit"),
    );
    assert.equal(invalid.status, 400);
    const exhausted = await handleProductsBatch(
      request("/api/products/batch", { method: "POST", body: JSON.stringify({ eans: [SNAPSHOT_EAN] }) }),
      deps("exhaust"),
    );
    assert.equal(exhausted.status, 429);
  });
});
