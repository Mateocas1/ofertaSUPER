-- First-to-last fresh price per product and store, for the risers/fallers
-- ranking on the public page.
--
-- Plausibility guard: the scraped catalog carries capture and unit errors
-- (3.59 -> 2890 for a prepizza, a kiwi priced per unit then per box). A move is
-- kept only when
--   1. the first-to-last ratio stays within [1/r, r] (r = mover_max_ratio, 3):
--      a 3x move in weeks is beyond any real shelf change in the window, while
--      ordinary promos (2x1, -50%) and monthly inflation stay well inside; and
--   2. both endpoints sit within [median/r, median*r] of the product's own
--      median fresh price across every store and date, so a single bad
--      endpoint cannot rank even when its ratio looks moderate; and
--   3. the GTIN is not a GS1 store-assigned variable-measure code (GTIN-13
--      prefix 2, so GTIN-14 `02...`): meat, produce and bakery sold by weight
--      are captured per kg in one run and per piece or pack in another, and
--      were nearly every remaining extreme mover in the 2026-10/11 series.

with priced as (
    select price_date, gtin14, store, price
    from {{ ref('fct_price_daily') }}
    where value_reason != 'stale'
      and price is not null
      and gtin14 not like '02%'
),

product_median as (
    select gtin14, median(price) as median_price
    from priced
    group by gtin14
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
inner join product_median m using (gtin14)
where a.first_price > 0
  and a.observations >= 2
  and a.last_price / a.first_price between 1.0 / {{ var('mover_max_ratio') }} and {{ var('mover_max_ratio') }}
  and a.first_price between m.median_price / {{ var('mover_max_ratio') }} and m.median_price * {{ var('mover_max_ratio') }}
  and a.last_price between m.median_price / {{ var('mover_max_ratio') }} and m.median_price * {{ var('mover_max_ratio') }}
