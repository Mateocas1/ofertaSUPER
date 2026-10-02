-- The fixed basket must be a positive, normalized weight vector.
select sum(weight) as total_weight
from {{ ref('basket_weights') }}
having abs(sum(weight) - 1) > 0.0001
    or min(weight) <= 0
