-- Typed view over the exported dense daily price series.
--
-- `price_series_glob` points at the committed sample on a clean checkout and at
-- the exported `data/*/part.parquet` partitions on real runs. The same
-- `read_parquet` call serves both shapes.

select
    cast("date" as date) as price_date,
    cast(gtin14 as varchar) as gtin14,
    cast(store as varchar) as store,
    cast(store_name as varchar) as store_name,
    cast(product_name as varchar) as product_name,
    cast(brand as varchar) as brand,
    cast(category as varchar) as category,
    cast(price as double) as price,
    cast(list_price as double) as list_price,
    cast(promo as boolean) as is_promo,
    cast(available as boolean) as is_available,
    cast(reason as varchar) as value_reason,
    cast(observed_at as timestamp) as observed_at,
    cast(age_hours as double) as age_hours
from read_parquet('{{ var("price_series_glob") }}', union_by_name = true)
where "date" is not null
  and gtin14 is not null
  and store is not null
