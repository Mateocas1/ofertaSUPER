select
    store,
    arg_max(store_name, price_date) as store_name,
    count(distinct gtin14) as product_count,
    min(price_date) as first_seen_date,
    max(price_date) as last_seen_date
from {{ ref('stg_price_series') }}
group by store
