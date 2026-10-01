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
- [x] T2 Remove governance models, their scripts, tests and `package.json` entries; add a Prisma
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

- 2026-10-01: T2 done (route: delegated writer). Evidence below.

### T2 evidence
- Removed 39 Prisma models + 2 enums (`ProductionReadiness*`, `PublicationGrant`, `Approval*`,
  `RefreshPolicy`, `Baseline*`, `Authority*`, `CandidateTechnicalVerification`, `Governed*`,
  `CatalogOperation`, `Serving*`, `VerifierEnvelopeCommitment`, `PromotionReadyEnvelope*`,
  `SealedGeneration*`, `Generation*`, `ForwardCorrectiveGenerationLink`, `ExistingLiveAdoption`,
  `ReaderGenerationAdoption`, `CatalogRestriction*`). Schema: 50 → 11 models.
- Kept as ambiguous: `SourceHealth` (admin ingestion page, health-check), `DirectRefreshRunLedger`
  (direct-refresh prewrite foundation; writers are a later slice).
- Public DB read path (authority-guarded `serving_*` projection) removed; `/api/categories`,
  `/api/promotions`, `/api/health/catalog` now always serve the committed snapshot, as production
  already did. Source-capture hook removed from the 5 direct-refresh writers (writes unchanged).
- Migration `prisma/migrations/20261001000000_drop_governance_models`: drops 54 tables (39 modeled
  + 15 unmodeled evidence/source-capture/baseline tables), 2 enums, 44 functions. Scratch DB
  (all 27 migrations, seeded core rows): tables 66 → 12, functions 44 → 0, core row counts
  unchanged; `prisma migrate diff` migrations→schema and DB→schema both empty.
- Files deleted: 109 (src 33, scripts 20, tests 55, workflow 1). `package.json` scripts 83 → 73;
  `build` no longer runs the catalog build contract.
- Checks: `prisma validate` ok, `tsc --noEmit` 0 errors, `npm test` 810/810 pass (was 1073 with
  17 DB-only skips), lint 178 → 156 warnings (0 new, diffed per rule), `audit:complexity` PASS,
  `next build --webpack` ok.

## Next step
T3.
