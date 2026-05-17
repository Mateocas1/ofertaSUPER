-- FASE 4.3: Covering partial index for AVG(price) aggregations in the validate step.
-- Enables index-only scans on price_history when computing historical price averages
-- (price IS NOT NULL is the only predicate used; INCLUDE allows reading price from the index leaf).
CREATE INDEX IF NOT EXISTS "price_history_supermarket_product_id_price_idx"
    ON "price_history"("supermarket_product_id")
    INCLUDE ("price")
    WHERE "price" IS NOT NULL;
