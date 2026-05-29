import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { readDryRunFlag, runStoreScraper } from "../scripts/scrapers/shared";
import type { NormalizedProduct } from "../src/lib/vtex/normalize";

const sampleProduct: NormalizedProduct = {
  ean: "7790000000001",
  name: "Leche Test",
  brand: "TEST",
  description: null,
  imageUrl: null,
  images: [],
  category: "Lacteos",
  skuId: "sku-test",
  sellerId: "seller-test",
  productUrl: "https://example.com/leche-test",
  price: 1200,
  listPrice: 1400,
  referencePrice: null,
  referenceUnit: null,
  isAvailable: true,
};

test("legacy scrapers default to dry-run and reject production freshness writes", () => {
  assert.equal(readDryRunFlag(["node", "script"], {}), true);
  assert.equal(readDryRunFlag(["node", "script", "--confirm-write"], {}), true);
  assert.equal(readDryRunFlag(["node", "script", "--confirm-write", "--dry-run"], {}), true);
  assert.equal(readDryRunFlag(["node", "script"], { INGESTION_WRITE_APPROVED: "true" }), true);
  assert.equal(
    readDryRunFlag(["node", "script", "--confirm-write"], {
      INGESTION_WRITE_APPROVED: "true",
      LEGACY_PRICE_WRITE_APPROVED: "true",
    }),
    false,
  );
});

test("runStoreScraper does not persist when dryRun is omitted", async () => {
  let persistCalls = 0;

  const result = await runStoreScraper({
    slug: "disco",
    queryTerms: ["leche"],
    dependencies: {
      getSupermarketBySlug: () => ({
        slug: "disco",
        name: "Disco",
        logoUrl: "https://example.com/logo.png",
        baseUrl: "https://example.com",
        adapter: "vtex",
      }),
      resolveQueryTerms: async () => ["leche"],
      fetchVtexProducts: async () => [sampleProduct],
      persistPricing: async () => {
        persistCalls += 1;
        return { persisted: 1, skipped: 0 };
      },
    },
  });

  assert.equal(persistCalls, 0);
  assert.equal(result.persisted, 0);
  assert.equal(result.fetched, 1);
});

test("update prices workflow is dry-run only and does not report fake write status", async () => {
  const workflow = await readFile(".github/workflows/update-prices.yml", "utf8");

  assert.match(workflow, /confirm_write:/);
  assert.match(workflow, /Deprecated legacy path/);
  assert.match(workflow, /--dry-run/);
  assert.doesNotMatch(workflow, /--confirm-write/);
  assert.match(workflow, /LEGACY_PRICE_WRITE_APPROVED: "false"/);
  assert.doesNotMatch(workflow, /report-scraper-status/);
});
