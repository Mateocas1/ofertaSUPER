-- The Laspeyres base period must read exactly 100.
select *
from {{ ref('mart_basket_index_daily') }}
where price_date = base_date
  and (basket_index is null or abs(basket_index - 100) > 0.01)
