-- Gate 6: simple promotion capture (Carrefour). Additive and nullable only.
ALTER TABLE "staging_product" ADD COLUMN "promo" JSONB;
ALTER TABLE "supermarket_products" ADD COLUMN "promo" JSONB;
