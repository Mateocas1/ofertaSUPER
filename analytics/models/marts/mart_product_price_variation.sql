-- Per-product, per-store variation: previous observed price plus the trailing
-- 7-day and 30-day windows. Stale or missing prices are excluded, so every
-- percentage is computed from real observations.

with priced as (
    select price_date, gtin14, store, price
    from {{ ref('fct_price_daily') }}
    where value_reason != 'stale'
      and price is not null
),

windowed as (
    select
        price_date,
        gtin14,
        store,
        price,
        lag(price) over w as previous_price,
        first_value(price) over (
            partition by gtin14, store order by price_date
            range between interval '7 days' preceding and current row
        ) as price_7d_ago,
        first_value(price) over (
            partition by gtin14, store order by price_date
            range between interval '30 days' preceding and current row
        ) as price_30d_ago
    from priced
    window w as (partition by gtin14, store order by price_date)
)

select
    price_date,
    gtin14,
    store,
    price,
    previous_price,
    round((price - previous_price) / previous_price * 100, 4) as change_pct_daily,
    round((price - price_7d_ago) / price_7d_ago * 100, 4) as change_pct_weekly,
    round((price - price_30d_ago) / price_30d_ago * 100, 4) as change_pct_monthly
from windowed
