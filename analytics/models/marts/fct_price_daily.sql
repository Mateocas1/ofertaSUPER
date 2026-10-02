select
    s.price_date,
    s.gtin14,
    s.store,
    p.product_name,
    p.brand,
    p.category,
    s.price,
    s.list_price,
    s.is_promo,
    s.is_available,
    s.value_reason,
    s.observed_at,
    s.age_hours
from {{ ref('stg_price_series') }} s
inner join {{ ref('dim_product') }} p using (gtin14)
