import assert from "node:assert/strict";
import { test } from "node:test";

import { createPublicCatalogPageResult } from "../src/lib/seo/public-catalog-page";
import { buildGuardedProductPageSchema } from "../src/lib/seo/schema";

const ean = "7790001000012";
const product = {
  ean,
  name: "Yerba test",
  description: null,
  images: [],
  imageUrl: null,
  brand: null,
  category: null,
  priceEntries: [{
    supermarket: { name: "Super test", slug: "super-test" },
    price: 1250,
    finalPrice: null,
    freshnessStatus: "fresh",
    isAvailable: true,
    productUrl: null,
    bestPromotion: null,
    automaticDiscountPercent: null,
  }],
} as never;

test("guarded product schema emits no Product or Offer JSON-LD on authority denial", () => {
  const page = createPublicCatalogPageResult({ ean }, {
    error: "Catalog temporarily unavailable",
    dataSource: "unavailable",
    degraded: false,
    verifiedAt: null,
  });

  assert.equal(buildGuardedProductPageSchema(page), null);
});

test("guarded product schema derives Product and Offer JSON-LD from eligible data", () => {
  const page = createPublicCatalogPageResult({ ean }, {
    product,
    history: { ean, days: 90, series: [], points: [] },
    dataSource: "database",
    degraded: false,
    verifiedAt: "2026-03-01T00:00:00.000Z",
    latestCheckedAt: null,
  });
  const schema = buildGuardedProductPageSchema(page);

  assert.ok(schema);
  assert.match(JSON.stringify(schema), /"@type":"Product"/);
  assert.match(JSON.stringify(schema), /"@type":"Offer"/);
});
