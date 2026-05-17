# Gate 1 — Supabase / Prisma / migrations readiness — 2026-05-17

Status: `STOPPED`

This gate was executed from `goal.md` as the first production/portfolio readiness phase. It is not green because the direct Supabase/admin connection still fails.

## Commands run

| Check | Command | Result |
|---|---|---|
| Workspace root | `git rev-parse --show-toplevel` | `C:/Users/picala/Documents/ofertasSUPER` |
| Workspace status | `git status --short` | Only expected input file: `?? goal.md` |
| Env ignore safety | `git check-ignore -v .env .env.local` | `.env` and `.env.local` ignored by `.gitignore` |
| Prisma schema | `npx prisma validate --schema prisma/schema.prisma` | Exit 0, schema valid |
| Migration status | `npx prisma migrate status --schema prisma/schema.prisma` | Exit 1, `P1001` cannot reach direct DB host |
| Runtime pooler TCP | `Test-NetConnection aws-1-sa-east-1.pooler.supabase.com -Port 6543` | TCP true, DNS true |
| Direct DB TCP | `Test-NetConnection db.gbpgqhasveytpptxsztw.supabase.co -Port 5432` | TCP false, DNS false |

## Safe env endpoint summary

No secret values were printed.

| Env | Host | Port | Result |
|---|---|---:|---|
| `DATABASE_URL` | `aws-1-sa-east-1.pooler.supabase.com` | 6543 | Reachable |
| `DIRECT_URL` | `db.gbpgqhasveytpptxsztw.supabase.co` | 5432 | Not reachable; DNS resolution failed |

## Schema surfaces observed

- Enums: `PromotionType`, `RunStatus`, `StagingStatus`.
- Models: `Supermarket`, `Product`, `SupermarketProduct`, `PriceHistory`, `Promotion`, `PromotionProduct`, `Category`, `IngestionRun`, `StagingProduct`, `SourceHealth`.

## Migrations observed

- `20260320_init`
- `20260322_ingestion_sprint1`
- `20260322_price_history_avg_idx`
- `20260322_staging_unlogged`

## Seed behavior

`prisma/seed.ts` imports `SUPERMARKETS` and upserts supermarket rows. It does not seed the complete product catalog.

## Env audit notes

`.env.example` includes the expected app/runtime keys for local setup. The scan also found ambient runtime/CI keys (`GITHUB_REPOSITORY`, `GITHUB_RUN_ID`, `GITHUB_SERVER_URL`, `NODE_ENV`) that should not be required as local secrets.

Some keys are consumed indirectly by frameworks/helpers and may not appear as direct `process.env.KEY` references:

- Clerk SDK keys: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`.
- Reconcile timing helpers: `RECONCILE_TX_MAX_WAIT_MS`, `RECONCILE_TX_TIMEOUT_MS`.
- VTEX delay helpers: `VTEX_REQUEST_MIN_DELAY_MS`, `VTEX_REQUEST_MAX_DELAY_MS`.

## Interpretation

The schema is valid and the runtime/pooler endpoint is reachable, but direct/admin database readiness is not closed. Prisma migrations use `DIRECT_URL`, and that host currently fails DNS resolution. This is consistent with an invalid/stale Supabase project ref, paused/deleted project, DNS issue, or outdated direct connection string.

## Required decision before Fase 2

Per `goal.md`, do not continue to Build/PWA unless the user explicitly approves marking Fase 1 as `BLOCKED_APPROVED`, or the direct Supabase issue is fixed and `npx prisma migrate status --schema prisma/schema.prisma` passes.
