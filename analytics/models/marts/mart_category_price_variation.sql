-- Per-category price index (base 100 at each category's first observed date)
-- with trailing daily, weekly and monthly variation.

with priced as (
    select price_date, gtin14, category, price
    from {{ ref('fct_price_daily') }}
    where value_reason != 'stale'
      and price is not null
      and category is not null
),

base as (
    select category, gtin14, arg_min(price, price_date) as base_price
    from priced
    group by category, gtin14
),

per_product as (
    select
        p.price_date,
        p.category,
        p.price / b.base_price * 100 as price_index
    from priced p
    inner join base b using (gtin14)
),

indexed as (
    select
        price_date,
        category,
        count(*) as product_count,
        round(avg(price_index), 4) as category_price_index
    from per_product
    group by price_date, category
)

select
    price_date,
    category,
    product_count,
    category_price_index,
    first_value(category_price_index) over (
        partition by category order by price_date
        range between interval '7 days' preceding and current row
    ) as index_7d_ago,
    first_value(category_price_index) over (
        partition by category order by price_date
        range between interval '30 days' preceding and current row
    ) as index_30d_ago,
    first_value(category_price_index) over (
        partition by category order by price_date
        rows between unbounded preceding and unbounded following
    ) as index_first,
    lag(category_price_index) over w as index_previous_day
from indexed
window w as (partition by category order by price_date)
