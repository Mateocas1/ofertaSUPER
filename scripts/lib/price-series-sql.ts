// SQL for the dense-series export, kept out of the CLI so the guard tests can
// assert the positional column mapping.
//
// Every selected column is aliased: the Prisma path turns a row into an object,
// so duplicate keys (for example the store and the product both named `name`)
// would silently collapse and shift the positional mapping in the CLI. The
// aliases also must stay in the exact order of PAIR_COLUMNS / CHANGE_COLUMNS.

export const PAIRS_SQL = `select sp.id::text as supermarket_product_id,
       sp.product_ean as gtin14,
       s.slug as store,
       s.name as store_name,
       p.name as product_name,
       coalesce(p.brand, '') as brand,
       coalesce(p.category, '') as category,
       sp.price::text as price,
       sp.list_price::text as list_price,
       sp.is_available::text as is_available,
       (sp.promo is not null)::text as has_promo,
       to_char(sp.last_checked_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as observed_at
from supermarket_products sp
join supermarkets s on s.id = sp.supermarket_id
join products p on p.ean = sp.product_ean
order by sp.id`;

export const CHANGES_SQL = `select ph.supermarket_product_id::text as supermarket_product_id,
       ph.price::text as price,
       ph.list_price::text as list_price,
       to_char(ph.scraped_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as observed_at
from price_history ph
order by ph.supermarket_product_id, ph.scraped_at`;

export const PAIR_COLUMNS = [
  "supermarket_product_id",
  "gtin14",
  "store",
  "store_name",
  "product_name",
  "brand",
  "category",
  "price",
  "list_price",
  "is_available",
  "has_promo",
  "observed_at",
] as const;

export const CHANGE_COLUMNS = ["supermarket_product_id", "price", "list_price", "observed_at"] as const;

export const PAIR_INDEX = Object.fromEntries(PAIR_COLUMNS.map((column, index) => [column, index])) as Record<
  (typeof PAIR_COLUMNS)[number],
  number
>;

export const CHANGE_INDEX = Object.fromEntries(CHANGE_COLUMNS.map((column, index) => [column, index])) as Record<
  (typeof CHANGE_COLUMNS)[number],
  number
>;
