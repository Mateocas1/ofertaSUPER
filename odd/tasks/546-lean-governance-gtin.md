# 546 — Lean schema: drop governance models, canonicalize GTIN-14

Issue: Mateocas1/ofertaSUPER#546 · Branch: `feat/546-lean-governance-gtin` · Base: `origin/master` 664674d

## Objective
Remove the ~45 governance/authority/approval/sealed-generation Prisma models (and the scripts
that only exist to feed them), and store every product GTIN canonically as 14 digits so
UPC-12 / EAN-13 / GTIN-14 of the same product share one key.

## Authorized scope (user, 2026-10-01)
- Drop the governance tables and migrate GTIN data. Supabase is retired (2026-09-28); the live
  database is the local Docker Postgres used by the daily cron. Take a fresh `pg_dump` before
  applying the migration.
- Out of scope here (later #546 slices): moving docs/openspec/odd, unifying the 5 writers,
  the 178 lint warnings, the <20 `package.json` scripts target.

## Constraints
- Same visible behavior: catalog snapshot, `/api/*` routes, ingestion pipeline, reconcile, freshness gate.
- Full pre-removal state preserved in tag `archive/full-governance` (664674d).
- Data migration must be idempotent and must merge rows whose GTINs collapse to the same GTIN-14.

## Tasks
- [x] T1 Archive tag `archive/full-governance` pushed (664674d). Route: inline.
- [ ] T2 Remove governance models, their scripts, tests and `package.json` entries; add a Prisma
      migration that drops the tables. Route: delegated writer (writer trigger: 2+ non-trivial files).
- [ ] T3 GTIN-14 canonicalization in the identity module + data migration that rewrites and
      merges existing rows. Test-first (RED → GREEN). Route: delegated writer (same worker).
- [ ] T4 Dump local DB, apply migrations, verify row counts and app tests. Route: inline.

## Checks
`npx prisma validate`, `npx tsc --noEmit`, unit tests (`npm test`), lint (no new warnings),
migration applied on a scratch DB restored from the latest dump before touching the live one.

## Delivery
Forecast well above 400 authored lines (mostly deletions). Strategy: `single-pr` — deletions are
mechanical; GTIN change kept as its own commit for review.

## Progress
- 2026-10-01: T1 done.

## Next step
T2.
