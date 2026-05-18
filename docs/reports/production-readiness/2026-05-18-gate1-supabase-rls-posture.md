# Gate 1 - Supabase/RLS security posture (report-only) - 2026-05-18

Status: `STOPPED_PENDING_APPROVAL`

This gate verified that Supabase/Prisma connectivity is now healthy, but found a real RLS/security posture issue that should not be auto-fixed without approval. No SQL mutation was applied in this run.

## What changed since the previous checkpoint

- The old Prisma `P1001` direct-host blocker is resolved locally.
- `.env` and `.env.local` now use Supavisor session pooler on port `5432` for `DIRECT_URL`.
- `npx prisma migrate status --schema prisma/schema.prisma` reports the database schema is up to date.

## Evidence commands

| Check | Result |
|---|---|
| `npx prisma validate --schema prisma/schema.prisma` | Passed. Schema is valid. |
| `npx prisma migrate status --schema prisma/schema.prisma` | Passed. 4 migrations found; database schema is up to date. |
| Safe env summary | `.env` and `.env.local` use pooler `:6543` for `DATABASE_URL` and pooler `:5432` for `DIRECT_URL`. |
| Supabase client usage grep | No `@supabase`, `createClient`, `NEXT_PUBLIC_SUPABASE`, or `supabase.from` usage found in source files. |
| `npx supabase db advisors --db-url <DIRECT_URL> --type security --output json --fail-on none` | CLI printed `No issues found`; this conflicts with the direct table/grant evidence below, so it is not used as the only security signal. |
| Direct RLS/grants query | 11 public tables have `rls_enabled=false`, no policies, and broad grants to `anon` and `authenticated`. |
| Sequence grant query | 8 public sequences grant `USAGE` to `anon` and `authenticated`. |

## Evidence files

- `docs/reports/production-readiness/2026-05-18-gate1-supabase-security-advisors.txt`
- `docs/reports/production-readiness/2026-05-18-gate1-rls-grants-query.sql`
- `docs/reports/production-readiness/2026-05-18-gate1-rls-grants-snapshot.json`
- `docs/reports/production-readiness/2026-05-18-gate1-sequence-grants-query.sql`
- `docs/reports/production-readiness/2026-05-18-gate1-sequence-grants-snapshot.json`
- `docs/reports/production-readiness/2026-05-18-gate1-rls-remediation-proposal.sql`

## Finding

The following tables are in schema `public`, have RLS disabled, have no policies, and currently grant broad privileges to both `anon` and `authenticated` roles:

- `public._prisma_migrations`
- `public.categories`
- `public.ingestion_run`
- `public.price_history`
- `public.products`
- `public.promotion_products`
- `public.promotions`
- `public.source_health`
- `public.staging_product`
- `public.supermarket_products`
- `public.supermarkets`

The direct snapshot shows these roles have table privileges including `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, and `TRIGGER` on each listed table.

## App access model observed in code

- Runtime DB access goes through `src/lib/db.ts` and Prisma.
- No browser Supabase client usage was found in app/source scripts.
- Public APIs are Next.js API routes backed by server-side code, not direct Supabase PostgREST calls from the browser.

This means a conservative lock-down should not break the current Next/Prisma runtime path, but it can break any future direct Supabase client usage unless explicit policies are added.

## Recommended remediation proposal

Use the SQL in:

`docs/reports/production-readiness/2026-05-18-gate1-rls-remediation-proposal.sql`

High-level intent:

1. Revoke all table privileges from `anon` and `authenticated` on the listed application tables.
2. Revoke sequence usage from `anon` and `authenticated` on public sequences.
3. Enable RLS on the listed tables.
4. Do not create public policies yet, because the app currently does not need direct browser Supabase table access.

## Why this is not auto-applied

- It mutates production Supabase permissions.
- If any hidden client uses Supabase anon/authenticated access directly, this will block it.
- The goal requires explicit user approval before SQL/RLS changes.

## Gate decision

Current status: `STOPPED_PENDING_APPROVAL`.

To move this phase to `GREEN`, run the remediation SQL with approval, then verify:

- `npx prisma migrate status --schema prisma/schema.prisma`
- `npm test`
- `npm run typecheck`
- `npm run lint`
- public smoke for `/api/search` and at least one public page.

Alternative: mark as `BLOCKED_APPROVED` only if the user explicitly accepts leaving RLS remediation as a documented external security task.
