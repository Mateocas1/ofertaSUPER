select
    gtin14,
    arg_max(product_name, price_date) as product_name,
    arg_max(brand, price_date) as brand,
    arg_max(category, price_date) as category,
    min(price_date) as first_seen_date,
    max(price_date) as last_seen_date
from {{ ref('stg_price_series') }}
group by gtin14
