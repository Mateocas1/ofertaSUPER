import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolvePublicCategories,
  resolvePublicProductList,
  resolvePublicPromotions,
} from "../src/lib/public-catalog-api";

describe("public catalog API fallback semantics", () => {
  it("keeps validation failures as 400 instead of falling back", async () => {
    let loaderCalls = 0;

    const result = await resolvePublicProductList(
      { limit: "999" },
      async () => {
        loaderCalls += 1;
        throw new Error("loader should not run");
      },
    );

    assert.equal(result.status, 400);
    assert.equal(loaderCalls, 0);
    assert.equal(result.body.error, "Invalid query parameters");
    assert.ok("issues" in result.body);
  });

  it("returns demo product page when the catalog runtime fails", async () => {
    const result = await resolvePublicProductList({ q: "leche", limit: "2" }, async () => {
      throw new Error("database unavailable");
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.total, 1);
    assert.equal(result.body.items[0]?.name, "Leche entera larga vida 1L");
  });

  it("returns demo categories when categories runtime fails", async () => {
    const result = await resolvePublicCategories(async () => {
      throw new Error("database unavailable");
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.items.length, 3);
    assert.equal(result.body.items[0]?.slug, "almacen");
  });

  it("keeps invalid promotion filters as 400 and falls back on runtime errors", async () => {
    const invalid = await resolvePublicPromotions({ type: "invalid" }, async () => []);

    assert.equal(invalid.status, 400);

    const degraded = await resolvePublicPromotions({ super: "disco" }, async () => {
      throw new Error("database unavailable");
    });

    assert.equal(degraded.status, 200);
    assert.equal(degraded.body.items.every((item) => item.supermarket.slug === "disco"), true);
  });
});
