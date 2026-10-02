-- First-to-last fresh price per product and store, for the risers/fallers
-- ranking on the public page.

with priced as (
    select price_date, gtin14, store, price
    from {{ ref('fct_price_daily') }}
    where value_reason != 'stale'
      and price is not null
),

aggregated as (
    select
        gtin14,
        store,
        count(*) as observations,
        min(price_date) as first_date,
        max(price_date) as last_date,
        arg_min(price, price_date) as first_price,
        arg_max(price, price_date) as last_price
    from priced
    group by gtin14, store
)

select
    a.gtin14,
    a.store,
    p.product_name,
    p.brand,
    p.category,
    a.first_date,
    a.last_date,
    a.first_price,
    a.last_price,
    a.observations,
    date_diff('day', a.first_date, a.last_date) as window_days,
    round((a.last_price - a.first_price) / a.first_price * 100, 4) as change_pct
from aggregated a
inner join {{ ref('dim_product') }} p using (gtin14)
where a.first_price > 0
  and a.observations >= 2
