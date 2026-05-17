import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { describe, it } from "node:test";

import {
  calculatePromotionalUnitPrice,
  detectAutomaticDiscount,
  getBestPromotionPrice,
} from "../src/lib/promotions/detect";
import { withFallback } from "../src/lib/safe-data";
import { searchQuerySchema } from "../src/lib/schemas/search";
import { buildVtexRequest } from "../src/lib/vtex/encode";
import { normalizeProduct } from "../src/lib/vtex/normalize";
import { getCachedJsonWithClient, setCachedJsonWithClient } from "../src/lib/redis";
import { limitRequestOrFallback } from "../src/lib/rate-limit";

describe("VTEX request builder", () => {
  it("keeps the SHA256 persisted query server-side and encodes productSuggestions variables", () => {
    const hash = "3eca26a431d4646a8bbce2644b78d3ca734bf8b4ba46afe4269621b64b0fb67d";
    const request = buildVtexRequest("leche", hash, 12);
    const params = new URLSearchParams(request.search);
    const extensions = JSON.parse(params.get("extensions") ?? "{}") as {
      persistedQuery?: {
        sha256Hash?: string;
      };
      variables?: string;
    };
    const variables = JSON.parse(Buffer.from(extensions.variables ?? "", "base64").toString("utf8")) as {
      fullText?: string;
      count?: number;
      productOriginVtex?: boolean;
    };

    assert.equal(request.pathname, "/_v/segment/graphql/v1");
    assert.equal(params.get("operationName"), "productSuggestions");
    assert.equal(params.get("locale"), "es-AR");
    assert.equal(extensions.persistedQuery?.sha256Hash, hash);
    assert.equal(variables.fullText, "leche");
    assert.equal(variables.count, 12);
    assert.equal(variables.productOriginVtex, true);
  });
});

describe("safe data fallback", () => {
  it("returns fallback data when a runtime dependency is unavailable", async () => {
    const value = await withFallback(Promise.reject(new Error("database unavailable")), {
      items: [],
      total: 0,
    });

    assert.deepEqual(value, { items: [], total: 0 });
  });

  it("fails open when Redis cache reads or writes are unavailable", async () => {
    const failingClient = {
      get: async () => {
        throw new Error("redis unavailable");
      },
      set: async () => {
        throw new Error("redis unavailable");
      },
    };

    await assert.doesNotReject(() => setCachedJsonWithClient(failingClient, "key", { ok: true }, 60));
    assert.equal(await getCachedJsonWithClient(failingClient, "key"), null);
  });

  it("fails open when the rate-limit backend is unavailable", async () => {
    const state = await limitRequestOrFallback({
      limit: async () => {
        throw new Error("rate limit backend unavailable");
      },
    }, "product-detail:unknown");

    assert.equal(state.success, true);
    assert.equal(state.limit, 60);
    assert.equal(state.remaining, 60);
  });
});

describe("promotion calculations", () => {
  it("detects automatic discounts from list price differences", () => {
    assert.deepEqual(detectAutomaticDiscount(800, 1000), {
      percentOff: 20,
      amountOff: 200,
    });
    assert.equal(detectAutomaticDiscount(1000, 800), null);
  });

  it("calculates common promotion unit prices and picks the best one", () => {
    assert.equal(calculatePromotionalUnitPrice(1000, { type: "2x1", discountValue: null }), 500);
    assert.equal(calculatePromotionalUnitPrice(1000, { type: "2nd_50", discountValue: null }), 750);
    assert.equal(calculatePromotionalUnitPrice(1000, { type: "wallet_discount", discountValue: 30 }), 700);
    assert.equal(calculatePromotionalUnitPrice(1000, { type: "percentage", discountValue: 120 }), null);

    const best = getBestPromotionPrice(1000, [
      { type: "2nd_50", discountValue: null, name: "second" },
      { type: "percentage", discountValue: 40, name: "percent" },
    ]);

    assert.equal(best?.finalPrice, 600);
    assert.equal(best?.promotion.name, "percent");
  });
});

describe("search query schema", () => {
  it("trims query text and bounds public search limits", () => {
    assert.deepEqual(searchQuerySchema.parse({ q: "  leche  ", limit: "12" }), {
      q: "leche",
      limit: 12,
    });
    assert.throws(() => searchQuerySchema.parse({ q: "x", limit: "999" }));
  });
});

describe("VTEX product normalizer", () => {
  it("extracts EAN, prices and product URL from a VTEX-like payload", () => {
    const product = normalizeProduct(
      {
        productName: "Leche Entera 1L",
        brand: "La Serenisima",
        linkText: "leche-entera-1l",
        categories: ["/Almacen/Lacteos/Leches/"],
        items: [
          {
            itemId: "sku-1",
            referenceId: [{ Value: "7790001000011" }],
            images: [{ imageUrl: "/arquivos/leche.jpg" }],
            sellers: [
              {
                sellerId: "1",
                commertialOffer: {
                  Price: 1200,
                  ListPrice: 1500,
                  AvailableQuantity: 8,
                },
              },
            ],
          },
        ],
      },
      "https://www.disco.com.ar",
    );

    assert.equal(product?.ean, "7790001000011");
    assert.equal(product?.name, "Leche Entera 1L");
    assert.equal(product?.brand, "La Serenisima");
    assert.equal(product?.price, 1200);
    assert.equal(product?.listPrice, 1500);
    assert.equal(product?.isAvailable, true);
    assert.equal(product?.productUrl, "https://www.disco.com.ar/leche-entera-1l/p");
    assert.deepEqual(product?.images, ["https://www.disco.com.ar/arquivos/leche.jpg"]);
  });

  it("rejects products without a valid EAN", () => {
    const product = normalizeProduct(
      {
        productName: "Producto sin EAN",
        items: [{ referenceId: [{ Value: "ABC" }] }],
      },
      "https://www.disco.com.ar",
    );

    assert.equal(product, null);
  });
});
