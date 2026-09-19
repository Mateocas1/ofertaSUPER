import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { loadPublicSearchSuggestions } from "../src/lib/public-catalog-api";

test("maps an eligible guarded projection into search suggestions", async () => {
  const projection = {
    servingProduct: {
      findMany: async (query: { select: { ean: boolean; name?: boolean } }) => query.select.name
        ? [{ ean: "7790000000001", name: "Yerba", brand: "Marca", image_url: null, category: "Almacen" }]
        : [{ ean: "7790000000001" }],
    },
    servingOffer: {
      findMany: async (query: { select: { supermarket_id?: boolean } }) => query.select.supermarket_id
        ? [{ product_ean: "7790000000001", supermarket_id: 1, price: 100, list_price: null, reference_price: null, reference_unit: null, is_available: true, product_url: null, last_checked_at: new Date("2099-01-01T00:00:00.000Z") }]
        : [{ product_ean: "7790000000001" }],
    },
    servingSupermarket: {
      findMany: async () => [{ id: 1, name: "Market", slug: "market", logo_url: null, freshness_sla_hours: 24 }],
    },
  };

  const suggestions = await loadPublicSearchSuggestions(projection as never, "yerba", 8);

  assert.deepEqual(suggestions, [{
    ean: "7790000000001",
    name: "Yerba",
    brand: "Marca",
    imageUrl: null,
    category: "Almacen",
    minPrice: 100,
    displayPrice: 100,
    latestCheckedAt: "2099-01-01T00:00:00.000Z",
    bestPriceCheckedAt: "2099-01-01T00:00:00.000Z",
    freshnessStatus: "fresh",
  }]);
});

test("maps a valid search request denied before its commercial load to unavailable", () => {
  const script = `
    delete process.env.PUBLIC_CATALOG_SERVING_IDENTITY_JSON;
    const { NextRequest } = await import("next/server");
    const route = await import("./src/app/api/search/route.ts");
    const handler = route.GET ?? route.default.GET;
    const response = await handler(new NextRequest("http://catalog.test/api/search?q=yerba"));
    console.log(JSON.stringify({ status: response.status, body: await response.json() }));
  `;
  const result = spawnSync(process.execPath, ["--import", "tsx", "--conditions=react-server", "--input-type=module", "--eval", script], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    status: 503,
    body: {
      error: "Catalog temporarily unavailable",
      dataSource: "unavailable",
      degraded: false,
      verifiedAt: null,
    },
  });
});
