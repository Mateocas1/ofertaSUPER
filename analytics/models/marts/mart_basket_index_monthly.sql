-- Monthly average of the daily basket index plus month-over-month variation.

with daily as (
    select *
    from {{ ref('mart_basket_index_daily') }}
    where basket_index is not null
),

monthly as (
    select
        date_trunc('month', price_date) as month,
        round(avg(basket_index), 4) as basket_index,
        min(price_date) as first_date,
        max(price_date) as last_date,
        count(*) as days_covered,
        round(avg(weight_covered), 4) as avg_weight_covered
    from daily
    group by date_trunc('month', price_date)
),

with_change as (
    select
        *,
        lag(basket_index) over (order by month) as previous_month_index
    from monthly
)

select
    month,
    basket_index,
    previous_month_index,
    round((basket_index - previous_month_index) / previous_month_index * 100, 4) as basket_change_pct,
    first_date,
    last_date,
    days_covered,
    avg_weight_covered,
    (select base_date from {{ ref('mart_basket_index_daily') }} limit 1) as base_date
from with_change
