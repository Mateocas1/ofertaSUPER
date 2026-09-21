import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { buildDatabaseCatalogResponse } from "../src/lib/basket-products-contract";

const verifiedAt = "2026-08-13T11:00:00.000Z";
const unavailable = { error: "Catalog temporarily unavailable", dataSource: "unavailable", degraded: false, verifiedAt: null } as const;

for (const name of ["search", "product detail"]) {
  const build = <T extends { dataSource?: unknown }>(data: T | null) => buildDatabaseCatalogResponse(data, unavailable);
  describe(`${name} public catalog response`, () => {
    it("binds the route handler to guarded serving reads without a Redis payload cache", () => {
      const route = name === "search" ? "src/app/api/search/route.ts" : "src/app/api/products/[ean]/route.ts";
      const source = readFileSync(route, "utf8");
      if (name === "search") {
        assert.match(source, /resolvePublicCatalogDataFromGuardedRead/);
        assert.doesNotMatch(source, /export\s+(?:async\s+)?function\s+loadPublicSearchSuggestions/);
      } else assert.match(source, /resolveRouteProductDetail\(ean\)/);
      assert.doesNotMatch(source, /redis|cache/i);
    });
    it("returns fresh and historical database data as 200 with provenance", () => {
      const fresh = build({ items: [], dataSource: "database", degraded: false, verifiedAt, latestCheckedAt: null });
      assert.deepEqual(fresh, { status: 200, body: { items: [], dataSource: "database", degraded: false, verifiedAt, latestCheckedAt: null } });
      const historical = build({ items: [], dataSource: "database", degraded: true, verifiedAt, latestCheckedAt: null });
      assert.equal(historical.status, 200);
      assert.deepEqual({ dataSource: historical.body.dataSource, degraded: historical.body.degraded }, { dataSource: "database", degraded: true });
    });

    it("returns unavailable 503 and never serializes demo data", () => {
      const unavailable = build(null);
      assert.equal(unavailable.status, 503);
      assert.deepEqual(unavailable.body, { error: "Catalog temporarily unavailable", dataSource: "unavailable", degraded: false, verifiedAt: null });
      const demo = build({ items: [], dataSource: "demo", degraded: true, verifiedAt, latestCheckedAt: null } as never);
      assert.equal(demo.status, 503);
      assert.equal(JSON.stringify(demo.body).includes('"demo"'), false);
    });
  });
}
