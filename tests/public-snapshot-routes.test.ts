import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NextRequest } from "next/server";

import { handleProducts, handleSearch, type PublicApiDeps } from "../src/lib/public-api";

// Behavioral tests for the public catalog handlers reading the committed
// snapshot. Handlers receive their collaborators through deps, so the rate
// limiter is a stub: admit, exhaust (429) or null (strict routes fail closed
// with 503). The committed JSON is the only data source.

const NOW = new Date("2026-09-27T12:00:00Z");

// Strict admission derives the client identity at a trusted deployment
// boundary (a single-address x-forwarded-for on Vercel); tests simulate that
// boundary instead of injecting anything into the handlers.
process.env.VERCEL = "1";

function request(path: string): NextRequest {
  return new NextRequest(`https://ofertas-super.vercel.app${path}`, {
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
});
