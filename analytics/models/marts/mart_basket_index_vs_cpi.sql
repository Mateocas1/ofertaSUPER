-- The basket index next to the official INDEC IPC Nivel General (base
-- December 2016). CPI is rebased to the basket base month so both series share
-- an axis; a month with no published CPI yet keeps a null and a reason.

with monthly as (
    select * from {{ ref('mart_basket_index_monthly') }}
),

cpi as (
    select
        month,
        cpi_index,
        source_url,
        lag(cpi_index) over (order by month) as previous_cpi_index
    from {{ ref('indec_cpi') }}
),

base_cpi as (
    select c.cpi_index as base_cpi_index
    from cpi c
    inner join (select min(month) as base_month from monthly) m on m.base_month = c.month
)

select
    m.month,
    m.basket_index,
    m.basket_change_pct,
    c.cpi_index,
    c.source_url,
    round(c.cpi_index / (select base_cpi_index from base_cpi) * 100, 4) as cpi_rebased_index,
    round((c.cpi_index - c.previous_cpi_index) / c.previous_cpi_index * 100, 4) as cpi_change_pct,
    m.days_covered,
    m.avg_weight_covered,
    m.base_date,
    case when c.cpi_index is null then 'no_cpi_for_month' else null end as cpi_reason
from monthly m
left join cpi c using (month)
