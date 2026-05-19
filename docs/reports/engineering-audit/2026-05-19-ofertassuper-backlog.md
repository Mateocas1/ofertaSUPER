# ofertasSUPER engineering audit backlog - 2026-05-19

Status: `READY FOR GOAL 2 PLANNING`

This backlog converts the report-only audit into reviewable hardening slices. It avoids feature expansion unless a slice directly reduces risk or creates strong technical proof for interviews.

## P0

No P0 item was found during the report-only audit. Current public smoke is green and verification commands pass.

## P1 slices for Goal 2

### P1-A - Guard legacy write scripts

Objective: make accidental real writes impossible from legacy scraper/update paths.

Probable files:

- `scripts/updatePrices.ts`
- `scripts/scrapers/shared.ts`
- `scripts/scrapers/*.ts`
- `.github/workflows/update-prices.yml`
- `package.json`
- tests under `tests/`

Implementation direction:

- Default legacy scripts to dry-run/no-write.
- Require explicit `--confirm-write` or `INGESTION_WRITE_APPROVED=true` for real writes.
- Make manual GitHub workflow use dry-run or require an explicit input gate.
- Preserve `probe:vtex` as the safe VTEX health check.

Test gate:

- `npm test`
- new tests proving no confirmation means no persistence call
- workflow trigger/static assertion if feasible
- `npm run typecheck`
- `npm run lint`

Risk: medium. Script behavior changes, but it is safer and localized.

Suggested commit: `fix(ingestion): guard legacy write scripts`

### P1-B - Normalize public API runtime-error behavior and DB-down degradation

Objective: keep validation errors as 400, but stop mapping runtime DB failures to generic bad request and define consistent public fallbacks.

Probable files:

- `src/lib/api.ts`
- `src/lib/safe-data.ts`
- `src/app/api/products/route.ts`
- `src/app/api/products/[ean]/route.ts`
- `src/app/api/products/[ean]/history/route.ts`
- `src/app/api/categories/route.ts`
- `src/app/api/promotions/route.ts`
- public pages that call catalog functions directly
- tests under `tests/`

Implementation direction:

- Add a route error helper that distinguishes Zod validation failures from runtime dependency failures.
- Add safe empty/demo fallback where product UX can degrade safely.
- Avoid hiding server errors as 400.
- Keep search behavior stable.

Test gate:

- route-level tests with mocked catalog errors
- validation tests proving malformed query still returns 400
- smoke for public routes
- `npm test`, `npm run typecheck`, `npm run lint`

Risk: medium. Public API contract changes around error status and fallback bodies.

Suggested commit: `fix(api): normalize public fallback errors`

### P1-C - Make product listing scalable before larger ingestion volume

Objective: reduce broad in-memory listing work and make the search/list path ready for larger catalog data.

Probable files:

- `src/lib/catalog.ts`
- `prisma/schema.prisma`
- a new migration if indexes are added
- tests under `tests/`

Implementation direction:

- Decide the search strategy first: DB pagination/sort, normalized search column, Postgres full-text/trigram, or a constrained current-scope improvement.
- Move pagination earlier where behavior allows.
- Avoid changing relevance semantics without tests.

Test gate:

- seeded catalog fixture/integration tests for search, category, supermarket, price filters, offers-only, pagination and sort
- Prisma validate/migrate status if schema changes
- `npm test`, `npm run typecheck`, `npm run lint`

Risk: medium-high if schema/query semantics change. Keep this as a separate work unit.

Suggested commit: `perf(catalog): tighten product listing query path`

### P1-D - Add ingestion single-flight/idempotency guard

Objective: prevent overlapping active ingestion jobs from double-promoting or duplicating price history.

Probable files:

- `.github/workflows/ingest.yml`
- `.github/workflows/update-prices.yml`
- `scripts/ingest.ts`
- `scripts/pipeline/reconcile.ts`
- possible Prisma migration if adding claim columns/unique constraints
- tests under `tests/`

Implementation direction:

- Add workflow-level `concurrency`.
- Add application/DB-level guard before active reconciliation: advisory lock or staging claim pattern.
- Add idempotency tests before re-enabling schedules.

Test gate:

- mocked/deterministic reconcile idempotency test
- static workflow assertion for concurrency
- Prisma validate/status if schema changes
- `npm test`, `npm run typecheck`, `npm run lint`

Risk: medium-high. Data correctness work; should not be mixed with UI or product changes.

Suggested commit: `fix(ingestion): add active job idempotency guard`

### P1-E - Verify production admin positive path without overclaiming

Objective: prove an authorized admin can reach production admin surfaces, while keeping writes bounded or avoided.

Probable files:

- docs/report artifact first
- if code gaps appear: `src/lib/admin/access.ts`, `src/app/admin/**`, `src/app/api/admin/**`
- tests only if code changes

Implementation direction:

- Do not invent credentials or `ADMIN_EMAILS`.
- Verify with user-approved production Clerk state/session.
- First smoke read-only admin surfaces.
- Only test create/update/delete promotion if a temporary record and cleanup plan are approved.

Test gate:

- existing `tests/admin-access.test.ts`
- bounded authenticated smoke evidence
- if write tested: create/read/delete evidence
- `npm test`, `npm run typecheck`, `npm run lint` if code/docs changed

Risk: operational, not primarily code. Requires real credentials/session.

Suggested commit: `docs(admin): record production admin positive-path evidence`

### P1-F - Add focused integration tests around risk, not vanity coverage

Objective: make the next claims stronger by testing the surfaces that can actually break.

Probable files:

- `tests/api-*.test.ts`
- `tests/ingestion-*.test.ts`
- `tests/catalog-*.test.ts`
- test helpers/mocks if needed

Implementation direction:

- Start with P1-A/P1-B/P1-D tests.
- Avoid broad Playwright fan-out unless necessary; keep tests serial and bounded.
- Keep each test with the slice it verifies.

Test gate:

- `npm test`
- `npm run typecheck`
- `npm run lint`

Risk: low-medium. Main risk is overbuilding a test harness. Keep KISS.

Suggested commit: `test(api): cover public dependency failure paths`

## P2 slices

| Slice | Objective | Suggested commit |
|---|---|---|
| P2-A | Add batch product/basket endpoint to remove basket N+1 calls. | `perf(canasta): batch basket product loading` |
| P2-B | Replace VTEX `queue.shift()` traversal with O(n) cursor/stack traversal. | `perf(vtex): make payload traversal linear` |
| P2-C | Restrict `next.config.ts` image remote hosts to known supermarket/CDN domains. | `chore(config): restrict remote image hosts` |
| P2-D | Clean historical PWA docs and possible unused UI shells after type-aware confirmation. | `chore(repo): remove stale docs and unused UI shells` |
| P2-E | Move Prisma config out of deprecated `package.json#prisma` before Prisma 7. | `chore(prisma): move seed config to prisma config` |

## Recommended Goal 2 order

1. P1-A legacy write-script guard.
2. P1-B public API/runtime error semantics.
3. P1-D ingestion concurrency/idempotency guard.
4. P1-F focused tests as part of the above slices, not as a separate vanity test sprint.
5. P1-E admin positive path when credentials/session are available.
6. P1-C catalog query scalability after safety gates, unless public latency becomes the immediate issue.
7. P2 cleanup/perf items.

## Non-goals for Goal 2

- No redesign.
- No new product-detail or deep-basket feature unless tied to P2-A.
- No active ingestion writes without explicit approval.
- No schedules re-enabled until secrets, concurrency and idempotency gates are closed.
- No production-ready claim until admin, monitoring, backup/restore, schedules and broader smoke/E2E are closed.
