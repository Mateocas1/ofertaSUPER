INSERT INTO supermarkets (name, slug, base_url, freshness_sla_hours)
VALUES ('Compose Market', 'compose-market', 'http://compose.invalid', 24);
INSERT INTO products (ean, name, brand, category, images)
VALUES ('7799999000001', 'Compose Smoke Saffron', 'Harness', 'Smoke', '{}');
INSERT INTO supermarket_products (product_ean, supermarket_id, price, list_price, is_available, last_checked_at)
SELECT '7799999000001', id, 123.45, 150.00, true, TIMESTAMPTZ '2026-08-12 12:00:00+00'
FROM supermarkets WHERE slug = 'compose-market';
