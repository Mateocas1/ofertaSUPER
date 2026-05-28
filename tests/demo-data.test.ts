import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getDemoProductPage, getDemoSearchSuggestions } from "../src/lib/demo-data";

describe("demo catalog fallback", () => {
  it("returns a paginated search-shaped fallback for matching demo products", () => {
    const result = getDemoProductPage({ query: "leche", limit: 24, page: 1 });

    assert.equal(result.total, 1);
    assert.equal(result.page, 1);
    assert.equal(result.limit, 24);
    assert.equal(result.totalPages, 1);
    assert.deepEqual(
      result.items.map((product) => product.name),
      ["Leche entera larga vida 1L"],
    );
  });

  it("keeps the fallback scoped to the active supermarket filter", () => {
    const result = getDemoProductPage({ query: "leche", supermarket: "jumbo", limit: 24, page: 1 });

    assert.equal(result.total, 1);
    assert.equal(result.items[0]?.entries.every((entry) => entry.supermarket.slug === "jumbo"), true);
  });

  it("returns compact suggestions for the autocomplete fallback", () => {
    assert.deepEqual(getDemoSearchSuggestions("yerba", 1), [
      {
        ean: "7790002000022",
        name: "Yerba mate suave 1kg",
        brand: "Playadito",
        imageUrl: null,
        category: "Almacen",
        minPrice: 3100,
        displayPrice: 3100,
        latestCheckedAt: "2026-05-14T00:00:00.000Z",
        bestPriceCheckedAt: "2026-05-14T00:00:00.000Z",
        freshnessStatus: "stale",
      },
    ]);
  });
});
