import assert from "node:assert/strict";
import test from "node:test";

import { fetchBasketProducts } from "../src/lib/basket-products-client";

test("a batch 503 is catalog unavailable, never a missing basket product", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    JSON.stringify({ error: "Catalog temporarily unavailable", dataSource: "unavailable" }),
    { status: 503, headers: { "content-type": "application/json" } },
  );

  try {
    await assert.rejects(
      fetchBasketProducts(["7790000000001"]),
      { name: "BasketCatalogUnavailableError" },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
