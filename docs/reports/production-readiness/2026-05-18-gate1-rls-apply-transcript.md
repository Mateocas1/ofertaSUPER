# Gate 1 RLS apply transcript - 2026-05-18

Executed proposal statements one-by-one because Supabase CLI query rejects multi-command prepared statements.
DIRECT_URL was passed from local env and is intentionally not logged.

## Statement 1
```sql
begin;
```
- exit_code: 0
- stdout:
```text
BEGIN
```
- stderr:
```text
Connecting to remote database...
```

## Statement 2
```sql
revoke all on table public._prisma_migrations from anon, authenticated;
```
- exit_code: 0
- stdout:
```text
REVOKE
```
- stderr:
```text
Connecting to remote database...
```

## Statement 3
```sql
revoke all on table public.categories from anon, authenticated;
```
- exit_code: 0
- stdout:
```text
REVOKE
```
- stderr:
```text
Connecting to remote database...
```

## Statement 4
```sql
revoke all on table public.ingestion_run from anon, authenticated;
```
- exit_code: 0
- stdout:
```text
REVOKE
```
- stderr:
```text
Connecting to remote database...
```

## Statement 5
```sql
revoke all on table public.price_history from anon, authenticated;
```
- exit_code: 0
- stdout:
```text
REVOKE
```
- stderr:
```text
Connecting to remote database...
```

## Statement 6
```sql
revoke all on table public.products from anon, authenticated;
```
- exit_code: 0
- stdout:
```text
REVOKE
```
- stderr:
```text
Connecting to remote database...
```

## Statement 7
```sql
revoke all on table public.promotion_products from anon, authenticated;
```
- exit_code: 0
- stdout:
```text
REVOKE
```
- stderr:
```text
Connecting to remote database...
```

## Statement 8
```sql
revoke all on table public.promotions from anon, authenticated;
```
- exit_code: 0
- stdout:
```text
REVOKE
```
- stderr:
```text
Connecting to remote database...
```

## Statement 9
```sql
revoke all on table public.source_health from anon, authenticated;
```
- exit_code: 0
- stdout:
```text
REVOKE
```
- stderr:
```text
Connecting to remote database...
```

## Statement 10
```sql
revoke all on table public.staging_product from anon, authenticated;
```
- exit_code: 0
- stdout:
```text
REVOKE
```
- stderr:
```text
Connecting to remote database...
```

## Statement 11
```sql
revoke all on table public.supermarket_products from anon, authenticated;
```
- exit_code: 0
- stdout:
```text
REVOKE
```
- stderr:
```text
Connecting to remote database...
```

## Statement 12
```sql
revoke all on table public.supermarkets from anon, authenticated;
```
- exit_code: 0
- stdout:
```text
REVOKE
```
- stderr:
```text
Connecting to remote database...
```

## Statement 13
```sql
revoke all on all sequences in schema public from anon, authenticated;
```
- exit_code: 0
- stdout:
```text
REVOKE
```
- stderr:
```text
Connecting to remote database...
```

## Statement 14
```sql
alter table public._prisma_migrations enable row level security;
```
- exit_code: 0
- stdout:
```text
ALTER TABLE
```
- stderr:
```text
Connecting to remote database...
```

## Statement 15
```sql
alter table public.categories enable row level security;
```
- exit_code: 0
- stdout:
```text
ALTER TABLE
```
- stderr:
```text
Connecting to remote database...
```

## Statement 16
```sql
alter table public.ingestion_run enable row level security;
```
- exit_code: 0
- stdout:
```text
ALTER TABLE
```
- stderr:
```text
Connecting to remote database...
```

## Statement 17
```sql
alter table public.price_history enable row level security;
```
- exit_code: 0
- stdout:
```text
ALTER TABLE
```
- stderr:
```text
Connecting to remote database...
```

## Statement 18
```sql
alter table public.products enable row level security;
```
- exit_code: 0
- stdout:
```text
ALTER TABLE
```
- stderr:
```text
Connecting to remote database...
```

## Statement 19
```sql
alter table public.promotion_products enable row level security;
```
- exit_code: 0
- stdout:
```text
ALTER TABLE
```
- stderr:
```text
Connecting to remote database...
```

## Statement 20
```sql
alter table public.promotions enable row level security;
```
- exit_code: 0
- stdout:
```text
ALTER TABLE
```
- stderr:
```text
Connecting to remote database...
```

## Statement 21
```sql
alter table public.source_health enable row level security;
```
- exit_code: 0
- stdout:
```text
ALTER TABLE
```
- stderr:
```text
Connecting to remote database...
```

## Statement 22
```sql
alter table public.staging_product enable row level security;
```
- exit_code: 0
- stdout:
```text
ALTER TABLE
```
- stderr:
```text
Connecting to remote database...
```

## Statement 23
```sql
alter table public.supermarket_products enable row level security;
```
- exit_code: 0
- stdout:
```text
ALTER TABLE
```
- stderr:
```text
Connecting to remote database...
```

## Statement 24
```sql
alter table public.supermarkets enable row level security;
```
- exit_code: 0
- stdout:
```text
ALTER TABLE
```
- stderr:
```text
Connecting to remote database...
```

## Statement 25
```sql
commit;
```
- exit_code: 0
- stdout:
```text
COMMIT
```
- stderr:
```text
Connecting to remote database...
WARNING (25P01): there is no transaction in progress
```
