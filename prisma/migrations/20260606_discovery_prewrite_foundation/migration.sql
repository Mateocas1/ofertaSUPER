-- Discovery pre-write foundation:
-- A source SKU can identify at most one row per supermarket when present.
-- PostgreSQL unique indexes allow multiple NULL values, but the partial
-- predicate makes the non-null boundary explicit for discovery create gates.
CREATE UNIQUE INDEX "supermarket_products_source_sku_unique_nonnull"
ON "supermarket_products" ("supermarket_id", "sku_id")
WHERE "sku_id" IS NOT NULL;
