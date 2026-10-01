-- #546: store every product GTIN as its canonical GTIN-14 (zero-left-padded), the
-- same key src/lib/identity/gtin.ts normalizeGtin produces, and merge products
-- whose EAN-8 / UPC-12 / EAN-13 / GTIN-14 forms collapse to one key.
--
-- Idempotent: only checksum-valid 8/12/13-digit keys are rewritten, so a second run
-- finds nothing to do. Invalid keys are left untouched. Runs under the reconcile
-- advisory lock so no ingestion write interleaves with the rewrite.

BEGIN;

SELECT pg_advisory_xact_lock(2026051901);

-- old key -> canonical key, for every checksum-valid non-canonical product or staged key.
CREATE TEMP TABLE gtin14_map ON COMMIT DROP AS
SELECT ean AS old_ean, lpad(ean, 14, '0') AS new_ean
FROM (SELECT ean FROM public.products UNION SELECT ean FROM public.staging_product) AS keys
WHERE ean ~ '^([0-9]{8}|[0-9]{12}|[0-9]{13})$'
  AND (
    10 - (
      SELECT sum(substr(lpad(ean, 14, '0'), i, 1)::int * CASE WHEN i % 2 = 1 THEN 3 ELSE 1 END)
      FROM generate_series(1, 13) AS i
    ) % 10
  ) % 10 = substr(ean, length(ean), 1)::int;

CREATE INDEX ON gtin14_map (new_ean);

-- 1. Create the canonical product when no GTIN-14 row exists yet, copying the
--    attributes of the most-offered form (ties: longest key, then key order).
INSERT INTO public.products (ean, name, brand, description, image_url, images, category)
SELECT DISTINCT ON (m.new_ean)
  m.new_ean, p.name, p.brand, p.description, p.image_url, p.images, p.category
FROM gtin14_map m
JOIN public.products p ON p.ean = m.old_ean
ORDER BY
  m.new_ean,
  (SELECT count(*) FROM public.supermarket_products sp WHERE sp.product_ean = p.ean) DESC,
  length(p.ean) DESC,
  p.ean
ON CONFLICT (ean) DO NOTHING;

-- 2. Fill attributes the canonical product lacks from its merged forms.
UPDATE public.products target
SET
  brand = COALESCE(target.brand, merged.brand),
  description = COALESCE(target.description, merged.description),
  image_url = COALESCE(target.image_url, merged.image_url),
  images = CASE WHEN cardinality(target.images) = 0 THEN merged.images ELSE target.images END,
  category = COALESCE(target.category, merged.category)
FROM (
  SELECT DISTINCT ON (m.new_ean)
    m.new_ean,
    first_value(p.brand) OVER w_brand AS brand,
    first_value(p.description) OVER w_description AS description,
    first_value(p.image_url) OVER w_image AS image_url,
    first_value(p.images) OVER w_images AS images,
    first_value(p.category) OVER w_category AS category
  FROM gtin14_map m
  JOIN public.products p ON p.ean = m.old_ean
  WINDOW
    w_brand AS (PARTITION BY m.new_ean ORDER BY p.brand IS NULL, p.ean),
    w_description AS (PARTITION BY m.new_ean ORDER BY p.description IS NULL, p.ean),
    w_image AS (PARTITION BY m.new_ean ORDER BY p.image_url IS NULL, p.ean),
    w_images AS (PARTITION BY m.new_ean ORDER BY cardinality(p.images) = 0, p.ean),
    w_category AS (PARTITION BY m.new_ean ORDER BY p.category IS NULL, p.ean)
  ORDER BY m.new_ean
) merged
WHERE target.ean = merged.new_ean;

-- 3. Offers: per (canonical key, supermarket) keep the most recently checked offer
--    (ties: lowest id), move every other offer's price history onto it, delete the
--    others, then point the survivor at the canonical key. This respects
--    UNIQUE (product_ean, supermarket_id).
CREATE TEMP TABLE gtin14_offers ON COMMIT DROP AS
SELECT
  sp.id,
  first_value(sp.id) OVER (
    PARTITION BY keys.new_ean, sp.supermarket_id
    ORDER BY sp.last_checked_at DESC, sp.id
  ) AS survivor_id,
  keys.new_ean
FROM public.supermarket_products sp
JOIN (
  SELECT old_ean AS ean, new_ean FROM gtin14_map
  UNION
  SELECT DISTINCT new_ean, new_ean FROM gtin14_map
) keys ON keys.ean = sp.product_ean;

UPDATE public.price_history ph
SET supermarket_product_id = o.survivor_id
FROM gtin14_offers o
WHERE ph.supermarket_product_id = o.id AND o.id <> o.survivor_id;

DELETE FROM public.supermarket_products sp
USING gtin14_offers o
WHERE sp.id = o.id AND o.id <> o.survivor_id;

UPDATE public.supermarket_products sp
SET product_ean = o.new_ean
FROM gtin14_offers o
WHERE sp.id = o.id AND o.id = o.survivor_id AND sp.product_ean <> o.new_ean;

-- 4. Promotion memberships: re-key onto the canonical product, deduplicating.
INSERT INTO public.promotion_products (promotion_id, product_ean)
SELECT pp.promotion_id, m.new_ean
FROM public.promotion_products pp
JOIN gtin14_map m ON m.old_ean = pp.product_ean
ON CONFLICT (promotion_id, product_ean) DO NOTHING;

DELETE FROM public.promotion_products pp
USING gtin14_map m
WHERE pp.product_ean = m.old_ean;

-- 5. Staged rows keep the same key reconcile will write (no constraint on this column).
UPDATE public.staging_product sp
SET ean = m.new_ean
FROM gtin14_map m
WHERE sp.ean = m.old_ean;

-- 6. The old forms are now unreferenced.
DELETE FROM public.products p
USING gtin14_map m
WHERE p.ean = m.old_ean;

COMMIT;
