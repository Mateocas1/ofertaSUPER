import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NextRequest } from "next/server";

import { GET as healthLive } from "../src/app/api/health/live/route";
import {
  handleCategories,
  handleProductDetail,
  handleProductHistory,
  handleProducts,
  handleProductsBatch,
  handlePromotions,
  handleSearch,
  type PublicApiDeps,
} from "../src/lib/public-api";
import { installSnapshotFixture } from "./helpers/snapshot-fixture";

// Successful public GET responses carry the catalog CDN cache header, so a
// cached URL never reaches the function or the rate limiter again within the
// hour. Errors, rate-limit answers, POST and health probes never carry it: a
// CDN must not replay a 429 or a 503 to every visitor.

process.env.VERCEL = "1";

const FIXTURE = installSnapshotFixture();
const EAN = FIXTURE.products[1].ean;
const NOW = new Date(FIXTURE.generatedAt);
const CDN_HEADER = "Vercel-CDN-Cache-Control";
const CDN_VALUE = "s-maxage=3600, stale-while-revalidate=86400";

function request(path: string, init?: { method?: string; body?: string }): NextRequest {
  return new NextRequest(`https://ofertas-super.vercel.app${path}`, { ...init, headers: { "x-forwarded-for": "203.0.113.7" } });
}

function deps(mode: "admit" | "exhaust" | null): PublicApiDeps {
  if (mode === null) return { limiter: null, now: () => NOW };
  return {
    limiter: {
      limit: async () => ({ success: mode === "admit", limit: 60, remaining: mode === "admit" ? 59 : 0, reset: NOW.getTime() + 60_000, pending: Promise.resolve() }),
    },
    now: () => NOW,
  };
}

const cdnHeader = (response: Response | null) => response?.headers.get(CDN_HEADER) ?? null;

describe("public API CDN caching", () => {
  it("caches successful GET responses for an hour and serves them stale for a day", async () => {
    const responses = [
      await handleSearch(request("/api/search?q=leche"), deps("admit")),
      await handleProducts(request("/api/products?q=leche"), deps("admit")),
      await handleProductDetail(request(`/api/products/${EAN}`), EAN, deps("admit")),
      await handleProductHistory(request(`/api/products/${EAN}/history?days=30`), EAN, deps("admit")),
      await handleCategories(request("/api/categories"), deps("admit")),
      await handlePromotions(request("/api/promotions"), deps("admit")),
    ];
    for (const response of responses) {
      assert.equal(response?.status, 200);
      assert.equal(cdnHeader(response), CDN_VALUE, response?.url);
    }
  });

  it("never caches errors, rate-limit answers, POST or health probes", async () => {
    const responses = [
      await handleSearch(request("/api/search?q="), deps("admit")),
      await handleSearch(request("/api/search?q=leche"), deps("exhaust")),
      await handleSearch(request("/api/search?q=leche"), deps(null)),
      await handleProducts(request("/api/products?page=0"), deps("admit")),
      await handleProducts(request("/api/products"), deps("exhaust")),
      await handleProductDetail(request("/api/products/0000000000000"), "0000000000000", deps("admit")),
      await handleProductHistory(request(`/api/products/${EAN}/history?days=abc`), EAN, deps("admit")),
      await handlePromotions(request("/api/promotions?type=nope"), deps("admit")),
      await handleProductsBatch(request("/api/products/batch", { method: "POST", body: JSON.stringify({ eans: [EAN] }) }), deps("admit")),
      healthLive(),
    ];
    assert.deepEqual(responses.map((response) => [response?.status === 200 ? "ok" : "error", cdnHeader(response)]).filter(([, header]) => header !== null), []);
    assert.ok(responses.some((response) => response?.status === 429));
    assert.ok(responses.some((response) => response?.status === 503));
    assert.ok(responses.some((response) => response?.status === 404));
  });
});
