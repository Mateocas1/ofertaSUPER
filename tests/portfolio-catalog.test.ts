import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PublicCatalogUnavailableError } from "../src/lib/public-catalog-api";
import { loadPublicProductDetail, loadPublicProductHistory, resolveOfflineBasketProducts, resolveRouteProductDetail } from "../src/lib/portfolio-catalog";

const knownEan = "7790002000022";

describe("public portfolio catalog", () => {
  it("does not substitute an offline basket from demo data", () => {
    assert.equal(resolveOfflineBasketProducts([knownEan], { CATALOG_OFFLINE_MODE: "true" }), null);
  });

  it("does not invoke a product projection loader when authority denies the read", async () => {
    let callbacks = 0;
    await assert.rejects(resolveRouteProductDetail(knownEan, async () => {
      callbacks += 1;
      return { available: false };
    }), PublicCatalogUnavailableError);
    assert.equal(callbacks, 1);
  });

  it("maps serving offer identity, second-newest history, and governed promotion pricing into the legacy detail DTO", async () => {
    const now = new Date();
    const detail = await loadPublicProductDetail(knownEan, {
      servingProduct: { findUnique: async () => ({ ean: knownEan, name: "Product", brand: "Brand", description: null, image_url: null, images: [], category: "Pantry" }) },
      servingOffer: { findMany: async () => [{ supermarket_id: 1, sku_id: "sku-42", price: 80, list_price: 100, reference_price: null, reference_unit: null, is_available: true, product_url: "https://market.test/p/42", last_checked_at: now }] },
      servingHistory: { findMany: async () => [{ supermarket_id: 1, price: 90 }, { supermarket_id: 1, price: 100 }] },
      servingPromotion: { findMany: async () => [
        { id: BigInt(1), supermarket_id: 1, type: "PERCENTAGE", title: "20% off", discount_value: 20, wallet_provider: null, bank_name: null, conditions: null, start_date: null, end_date: null },
        { id: BigInt(2), supermarket_id: 1, type: "PERCENTAGE", title: "Other product", discount_value: 50, wallet_provider: null, bank_name: null, conditions: null, start_date: null, end_date: null },
      ] },
      servingMembership: { findMany: async () => [{ promotion_id: BigInt(1), product_ean: knownEan }, { promotion_id: BigInt(2), product_ean: "7790002000099" }] },
      servingSupermarket: { findMany: async () => [{ id: 1, name: "Market", slug: "market", logo_url: null, freshness_sla_hours: 24 }] },
    } as never);

    assert.ok(detail);
    assert.deepEqual(detail.promotions.map((promotion) => promotion.title), ["20% off"]);
    assert.deepEqual(detail.priceEntries[0], {
      supermarket: { id: 1, name: "Market", slug: "market", logoUrl: null }, supermarketProductId: "sku-42",
      price: 80, listPrice: 100, referencePrice: null, referenceUnit: null, isAvailable: true,
      productUrl: "https://market.test/p/42", lastCheckedAt: now.toISOString(), freshnessSlaHours: 24, freshnessStatus: "fresh",
      previousPrice: 100, deltaPercent: -20, priceDropAlert: { previousPrice: 100, currentPrice: 80, amountDrop: 20, percentDrop: 20 },
      automaticDiscountPercent: 20, bestPromotion: detail.promotions[0], finalPrice: 64,
    });
    assert.equal(detail.automaticDiscountPercent, 20);
    assert.equal(detail.bestFinalPrice, 64);
    assert.deepEqual(detail.bestPriceDropAlert, { previousPrice: 100, currentPrice: 80, amountDrop: 20, percentDrop: 20 });
  });

  it("builds history only from serving history and supermarket projections", async () => {
    const history = await loadPublicProductHistory(knownEan, 30, {
      servingHistory: { findMany: async () => [{ supermarket_id: 1, price: 10, scraped_at: new Date("2026-01-02T00:00:00.000Z") }] },
      servingSupermarket: { findMany: async () => [{ id: 1, name: "Market", slug: "market" }] },
    } as never);
    assert.deepEqual(history, {
      ean: knownEan, days: 30,
      series: [{ slug: "market", name: "Market", color: "#d24726" }],
      points: [{ date: "2026-01-02", market: 10 }],
    });
  });
});
