import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

import { loadPublicCategories, loadPublicProductList, loadPublicPromotions } from "../src/lib/catalog";

function runRoutes() {
  const script = `
    delete process.env.PUBLIC_CATALOG_SERVING_IDENTITY_JSON;
    const { NextRequest } = await import("next/server");
    const [productModule, categoryModule, promotionModule] = await Promise.all([
      import("./src/app/api/products/route.ts"),
      import("./src/app/api/categories/route.ts"),
      import("./src/app/api/promotions/route.ts"),
    ]);
    const products = productModule.GET ?? productModule.default.GET;
    const categories = categoryModule.GET ?? categoryModule.default.GET;
    const promotions = promotionModule.GET ?? promotionModule.default.GET;
    const responses = await Promise.all([
      products(new NextRequest("http://catalog.test/api/products?limit=999")),
      products(new NextRequest("http://catalog.test/api/products?q=yerba")),
      categories(new NextRequest("http://catalog.test/api/categories")),
      promotions(new NextRequest("http://catalog.test/api/promotions?type=invalid")),
      promotions(new NextRequest("http://catalog.test/api/promotions?wallet=billetera")),
    ]);
    console.log(JSON.stringify(await Promise.all(responses.map(async (response) => ({ status: response.status, body: await response.json() })))));
  `;
  const result = spawnSync(process.execPath, ["--import", "tsx", "--conditions=react-server", "--input-type=module", "--eval", script], {
    cwd: process.cwd(), encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as Array<{ status: number; body: { error?: string } }>;
}

describe("guarded catalog collection routes", () => {
  it("preserves invalid queries and withholds collections without serving authority", () => {
    const [invalidProducts, products, categories, invalidPromotions, promotions] = runRoutes();

    assert.equal(invalidProducts.status, 400);
    assert.equal(products.status, 503);
    assert.equal(categories.status, 503);
    assert.equal(invalidPromotions.status, 400);
    assert.equal(promotions.status, 503);
    assert.equal(products.body.error, "Catalog temporarily unavailable");
    assert.equal(categories.body.error, "Catalog temporarily unavailable");
    assert.equal(promotions.body.error, "Catalog temporarily unavailable");
  });
});

describe("guarded catalog projection loaders", () => {
  it("returns eligible products ranked by price with their total", async () => {
    const product = { servingProduct: { findMany: async (query: { select: { ean: boolean; name?: boolean } }) =>
      query.select.name ? [
        { ean: "a", name: "Alpha", brand: null, image_url: null, category: "Bebidas" },
        { ean: "b", name: "Beta", brand: null, image_url: null, category: "Bebidas" },
      ] : [{ ean: "a" }, { ean: "b" }] }, servingOffer: { findMany: async (query: { select: { supermarket_id?: boolean } }) =>
      query.select.supermarket_id ? [
        { product_ean: "a", supermarket_id: 1, price: 20, list_price: 20, reference_price: null, reference_unit: null, is_available: true, product_url: null, last_checked_at: new Date("2099-01-01T00:00:00.000Z") },
        { product_ean: "b", supermarket_id: 1, price: 10, list_price: 10, reference_price: null, reference_unit: null, is_available: true, product_url: null, last_checked_at: new Date("2099-01-01T00:00:00.000Z") },
      ] : [{ product_ean: "a" }, { product_ean: "b" }] }, servingSupermarket: { findMany: async () => [{ id: 1, name: "Market", slug: "market", logo_url: null, freshness_sla_hours: 24 }] } };

    const result = await loadPublicProductList(product as never, { sort: "price-asc", limit: 1 });

    assert.equal(result.total, 2);
    assert.deepEqual(result.items.map(({ ean }) => ean), ["b"]);
    assert.equal(result.totalPages, 2);
  });

  it("projects serving counts onto the static category taxonomy", async () => {
    const categories = await loadPublicCategories({ servingProduct: { groupBy: async () => [
      { category: "Bebidas", _count: 3 }, { category: "Unknown", _count: 7 },
    ] } } as never);

    assert.equal(categories.length, 15);
    assert.deepEqual(categories.find(({ slug }) => slug === "bebidas"), {
      id: "bebidas", name: "Bebidas", slug: "bebidas", icon: "bebidas", count: 3, children: [],
    });
  });

  it("filters eligible promotions and maps their projected memberships", async () => {
    const promotions = await loadPublicPromotions({
      servingPromotion: { findMany: async () => [
        { id: BigInt(1), title: "Wallet", type: "WALLET_DISCOUNT", discount_value: 20, wallet_provider: "MODO", bank_name: null, conditions: null, start_date: null, end_date: null, supermarket_id: 1, is_active: true },
        { id: BigInt(2), title: "Other", type: "PERCENTAGE", discount_value: 10, wallet_provider: null, bank_name: null, conditions: null, start_date: null, end_date: null, supermarket_id: 1, is_active: true },
      ] },
      servingSupermarket: { findMany: async () => [{ id: 1, name: "Market", slug: "market", logo_url: null }] },
      servingMembership: { findMany: async () => [{ promotion_id: BigInt(1), product_ean: "7790000000001" }] },
    } as never, { supermarket: "market", wallet: "modo", type: "wallet_discount" });

    assert.deepEqual(promotions, [{
      id: 1, title: "Wallet", type: "wallet_discount", discountValue: 20, walletProvider: "MODO", bankName: null,
      conditions: null, startDate: null, endDate: null, supermarket: { id: 1, name: "Market", slug: "market", logoUrl: null }, productCount: 1,
    }]);
  });
});
