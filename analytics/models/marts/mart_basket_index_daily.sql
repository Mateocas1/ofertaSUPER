-- Laspeyres basket index over the fixed seed basket.
--
-- Base period = the first date whose fresh-price coverage of the fixed basket
-- cleared `basket_min_coverage`. On that date every product is compared with
-- itself, so the index reads exactly 100. Dates below the coverage threshold
-- publish a null index with an explicit reason instead of a thin number.

with basket as (
    select gtin14, weight from {{ ref('basket_weights') }}
),

priced as (
    select price_date, gtin14, avg(price) as price
    from {{ ref('fct_price_daily') }}
    where value_reason != 'stale'
      and price is not null
    group by price_date, gtin14
),

date_spine as (
    select distinct price_date
    from {{ ref('fct_price_daily') }}
    where value_reason != 'stale'
),

coverage as (
    select
        p.price_date,
        count(distinct p.gtin14) as products_covered,
        sum(b.weight) as weight_covered
    from priced p
    inner join basket b using (gtin14)
    group by p.price_date
),

eligible as (
    select price_date
    from coverage
    where weight_covered >= {{ var('basket_min_coverage') }}
),

base_date as (
    select min(price_date) as base_date from eligible
),

base_prices as (
    select p.gtin14, p.price as base_price
    from priced p
    cross join base_date b
    where p.price_date = b.base_date
      and p.gtin14 in (select gtin14 from basket)
),

joined as (
    select
        p.price_date,
        p.gtin14,
        b.weight,
        p.price / bp.base_price * 100 as price_index
    from priced p
    inner join basket b using (gtin14)
    inner join base_prices bp using (gtin14)
),

index_agg as (
    select
        price_date,
        sum(weight * price_index) / sum(weight) as basket_index,
        count(distinct gtin14) as products_covered,
        sum(weight) as weight_covered
    from joined
    group by price_date
)

select
    d.price_date,
    bd.base_date,
    case
        when a.weight_covered is null then 'no_basket_price'
        when a.weight_covered < {{ var('basket_min_coverage') }} then 'low_coverage'
        else null
    end as index_reason,
    case
        when a.weight_covered >= {{ var('basket_min_coverage') }} then round(a.basket_index, 4)
    end as basket_index,
    coalesce(a.products_covered, 0) as products_covered,
    coalesce(round(a.weight_covered, 4), 0.0) as weight_covered
from date_spine d
cross join base_date bd
left join index_agg a using (price_date)
