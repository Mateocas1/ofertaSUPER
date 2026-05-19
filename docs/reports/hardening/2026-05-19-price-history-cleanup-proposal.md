# Accidental RED-write cleanup proposal - 2026-05-19

Status: `REPORT-ONLY / AWAITING USER APPROVAL`

This document identifies the exact rows created when the P1-A RED test exposed the old legacy scraper footgun. It does not execute cleanup.

## Root cause

Before commit `6d01b9f fix(ingestion): guard legacy write scripts`, `runStoreScraper()` defaulted to `dryRun = false`. The RED test intentionally asserted that omitted `dryRun` should not persist. Because the pre-fix function ignored the new test-only dependency hook and defaulted to real writes, it reached the legacy Disco write path.

The code-level issue is fixed by `6d01b9f`; this proposal covers only data cleanup.

## Read-only evidence

Read-only query window:

- start: `2026-05-19T01:19:50.000Z`
- end: `2026-05-19T01:20:10.000Z`

Observed rows:

| Field | Value |
|---|---|
| table | `price_history` |
| count | `50` |
| id range | `4945`-`4994` |
| supermarket | `disco` |
| sample timestamp range | around `2026-05-19T01:19:53.951Z` to `2026-05-19T01:19:59.212Z` |

Revalidated before any cleanup attempt:

- mode: read-only
- candidate count: `50`
- id range: `4945`-`4994`
- missing expected ids: none
- same-window `disco` rows: `50`
- cleanup still not executed

Candidate ids:

```text
4945, 4946, 4947, 4948, 4949,
4950, 4951, 4952, 4953, 4954,
4955, 4956, 4957, 4958, 4959,
4960, 4961, 4962, 4963, 4964,
4965, 4966, 4967, 4968, 4969,
4970, 4971, 4972, 4973, 4974,
4975, 4976, 4977, 4978, 4979,
4980, 4981, 4982, 4983, 4984,
4985, 4986, 4987, 4988, 4989,
4990, 4991, 4992, 4993, 4994
```

## What this proposal will clean

Only these 50 `price_history` rows.

## What this proposal will not clean automatically

It will not delete or revert `products` or `supermarket_products` rows/updates.

Reason: the legacy path uses upserts and may have updated existing product/supermarket price records. Without a before snapshot, deleting or reverting those rows could destroy legitimate catalog state. Price-history rows are the safest bounded cleanup target because they are timestamped append-only evidence of the accidental run.

## Proposed SQL

Do not run without explicit user approval.

```sql
begin;

with candidate_rows as (
  select ph.id
  from public.price_history ph
  join public.supermarket_products sp on sp.id = ph.supermarket_product_id
  join public.supermarkets s on s.id = sp.supermarket_id
  where ph.id between 4945 and 4994
    and ph.scraped_at >= timestamptz '2026-05-19T01:19:50.000Z'
    and ph.scraped_at <= timestamptz '2026-05-19T01:20:10.000Z'
    and s.slug = 'disco'
)
delete from public.price_history ph
using candidate_rows cr
where ph.id = cr.id
returning ph.id, ph.supermarket_product_id, ph.scraped_at, ph.price, ph.list_price;

-- Expected returning row count: 50.
-- If the returning row count is not 50, rollback instead of commit.

commit;
```

## Post-cleanup verification if approved

Run read-only verification:

```sql
select count(*) as remaining_candidate_rows
from public.price_history ph
join public.supermarket_products sp on sp.id = ph.supermarket_product_id
join public.supermarkets s on s.id = sp.supermarket_id
where ph.id between 4945 and 4994
  and ph.scraped_at >= timestamptz '2026-05-19T01:19:50.000Z'
  and ph.scraped_at <= timestamptz '2026-05-19T01:20:10.000Z'
  and s.slug = 'disco';
```

Expected result after cleanup:

- `remaining_candidate_rows = 0`

## Current decision needed

User must explicitly choose one:

1. Approve cleanup of the 50 bounded `price_history` rows.
2. Leave rows in place and keep the incident documented.
