# ofertasSUPER hardening sprint - 2026-05-19

Status: `P1-A IMPLEMENTED, P1-B IMPLEMENTED, P1-D IMPLEMENTED, CLEANUP DECISION PENDING`

This sprint started from the Goal 1 audit backlog. No P0 existed, so the first selected work unit was P1-A: guard legacy write scripts. P1-B normalized public catalog API fallback semantics. P1-D now has both workflow-level serialization and an application/DB-level reconciliation advisory lock while the accidental RED-write cleanup decision remains pending.

## Scope selected

| Gate | Decision |
|---|---|
| Selected slices | P1-A - Guard legacy write scripts; P1-B - public catalog API fallback semantics; P1-D - workflow and application/DB-level ingestion concurrency guard |
| Why first | P1-A had the highest data-safety and interview value. P1-B closes a public runtime resilience gap without changing UI. P1-D closes the most direct race-condition risk before schedules or active ingestion claims. |
| Not selected now | P1-C catalog scalability, P1-E admin positive path. |
| Build | Not run. |
| External dashboards | Not touched. |
| Schedules | Not re-enabled. |
| Push | Not pushed. |

## Work unit 1 - P1-A legacy write guard

Commit: `6d01b9f fix(ingestion): guard legacy write scripts`

Changed files:

- `scripts/scrapers/shared.ts`
- `.github/workflows/update-prices.yml`
- `tests/legacy-write-safety.test.ts`
- `README.md`

## What changed

- Legacy scraper helpers now default to dry-run unless writes are explicitly approved.
- Real legacy writes require either:
  - `--confirm-write`, or
  - `INGESTION_WRITE_APPROVED=true`.
- `--dry-run` wins even if `--confirm-write` is present.
- `runStoreScraper()` now defaults to `dryRun = true` when called directly without a dry-run argument.
- `update-prices.yml` now has a manual `confirm_write` input:
  - false/default path runs `npm run update:prices -- --dry-run`;
  - true path runs `npm run update:prices -- --confirm-write`;
  - scraper status reporting only runs for confirmed real writes.
- README documents the legacy write-safety boundary.

## Work unit 2 - P1-D workflow concurrency guard

Commit subject: `fix(ingestion): serialize data workflows`

Changed files:

- `.github/workflows/ingest.yml`
- `.github/workflows/update-prices.yml`
- `tests/ingestion-concurrency.test.ts`
- `docs/reports/hardening/2026-05-19-ofertassuper-hardening-sprint.md`
- `docs/reports/hardening/2026-05-19-ofertassuper-before-after.md`
- `docs/handoff.md`

What changed:

- `ingest.yml` and `update-prices.yml` now share top-level workflow `concurrency`.
- The shared group is `ofertas-super-data-jobs`.
- `cancel-in-progress: false` serializes data jobs instead of cancelling an in-flight ingestion/update.
- Schedules remain paused; this only hardens manual dispatch and future schedule readiness.
- This workflow layer is complemented by the DB transaction advisory lock in work unit 4.

## Work unit 3 - P1-B public catalog API fallback semantics

Commit subject: `fix(api): normalize public catalog fallbacks`

Changed files:

- `src/lib/public-catalog-api.ts`
- `src/app/api/products/route.ts`
- `src/app/api/categories/route.ts`
- `src/app/api/promotions/route.ts`
- `tests/public-catalog-api.test.ts`
- `docs/reports/hardening/2026-05-19-ofertassuper-hardening-sprint.md`
- `docs/reports/hardening/2026-05-19-ofertassuper-before-after.md`
- `docs/handoff.md`

What changed:

- Public product/category/promotion API runtime failures now fall back to bounded demo data instead of turning dependency failures into bad-request responses.
- Validation failures remain `400` and do not run loaders.
- Product list fallback respects query, pagination and supermarket filters through existing demo-data helpers.
- Promotion fallback respects supermarket/type/wallet filters where possible.
- This does not claim full coverage for product-detail/history routes; those remain separate if deeper public API coverage is needed.

## Work unit 4 - P1-D reconciliation advisory lock

Commit subject: `fix(ingestion): guard active reconciliation lock`

Changed files:

- `scripts/pipeline/reconcile.ts`
- `tests/reconcile-lock.test.ts`
- `docs/reports/hardening/2026-05-19-ofertassuper-hardening-sprint.md`
- `docs/reports/hardening/2026-05-19-ofertassuper-before-after.md`
- `docs/handoff.md`

What changed:

- Active reconciliation now opens one interactive transaction and acquires `pg_try_advisory_xact_lock` before loading pending staging candidates.
- If another reconciliation already owns the lock, the second run fails fast with `ReconcileLockUnavailableError` instead of loading stale pending candidates and risking duplicate promotion/history writes.
- The lock key is stable and tested: `2026051901`.
- Candidate loading and chunk reconciliation now happen inside the locked transaction.
- Tradeoff: this is safer for race prevention, but active reconciliation now holds one transaction for the full reconciliation window. The existing transaction timeout envs remain the tuning gate.

## TDD evidence

### RED

Command:

```bash
npx tsx --test tests/legacy-write-safety.test.ts
```

Result before implementation:

- 3 tests failed.
- Failure 1 proved legacy scripts did not default to dry-run.
- Failure 2 exposed that `runStoreScraper()` without `dryRun` entered the real legacy path.
- Failure 3 proved the workflow lacked `confirm_write`, `--dry-run`, and `--confirm-write`.

### GREEN

Command:

```bash
npx tsx --test tests/legacy-write-safety.test.ts
```

Result after implementation:

- 3/3 tests passed.

### RED - P1-D workflow concurrency

Command:

```bash
npx tsx --test tests/ingestion-concurrency.test.ts
```

Result before implementation:

- 1/1 test failed.
- Failure proved `.github/workflows/ingest.yml` lacked top-level `concurrency`.
- The same assertion covers `.github/workflows/update-prices.yml`.

### GREEN - P1-D workflow concurrency

Command:

```bash
npx tsx --test tests/ingestion-concurrency.test.ts
```

Result after implementation:

- 1/1 test passed.

### RED - P1-B public API fallback semantics

Command:

```bash
npx tsx --test tests/public-catalog-api.test.ts
```

Result before implementation:

- Test failed because `src/lib/public-catalog-api.ts` did not exist.
- The desired contract was explicit before implementation: validation errors stay `400`; runtime product/category/promotion failures return bounded demo fallbacks.

### GREEN - P1-B public API fallback semantics

Command:

```bash
npx tsx --test tests/public-catalog-api.test.ts
```

Result after implementation:

- 4/4 tests passed.

### RED - P1-D reconciliation advisory lock

Command:

```bash
npx tsx --test tests/reconcile-lock.test.ts
```

Result before implementation:

- 4/4 tests failed.
- Failures proved there was no stable lock key/export, no lock helper, no lock-unavailable error, and no evidence that reconciliation acquired the lock before loading candidates.

### GREEN - P1-D reconciliation advisory lock

Command:

```bash
npx tsx --test tests/reconcile-lock.test.ts
```

Result after implementation:

- 4/4 tests passed.

## Incident note

During the RED run, the intentionally failing `runStoreScraper()` test exposed the exact production-write footgun by calling the current implementation before dependency injection existed. Because the pre-fix function ignored the test-only `dependencies` option and defaulted `dryRun = false`, it executed the real legacy Disco write path.

Read-only verification found:

- `priceHistoryRowsLastHour`: 50
- latest rows around `2026-05-19T01:19:58Z` to `2026-05-19T01:19:59Z`
- sample latest ids: `4990` to `4994` shown by the read-only check

No cleanup/delete was performed because that would be a real DB mutation and needs explicit user approval. The code guard is now fixed so this exact path no longer writes by default.

## Verification

No build was run.

| Check | Result |
|---|---|
| `npx tsx --test tests/legacy-write-safety.test.ts` | 3/3 passing |
| `npx tsx --test tests/public-catalog-api.test.ts` | 4/4 passing |
| `npx tsx --test tests/ingestion-concurrency.test.ts` | 1/1 passing |
| `npx tsx --test tests/reconcile-lock.test.ts` | 4/4 passing |
| `npm test` | 33/33 passing |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| Local public API smoke on Next dev server `127.0.0.1:3041` | 5/5 passing: products 200, products validation 400, categories 200, promotions 200, promotions validation 400 |

## Remaining Goal 2 items

| Item | Status | Reason |
|---|---|---|
| P1-A legacy write guard | Implemented in `6d01b9f` | Tests and docs included. |
| P1-B public API fallback/error semantics | Implemented | Product/category/promotion public APIs have tested runtime fallback semantics while preserving 400 validation errors. |
| P1-C product listing scalability | Deferred | Higher query-design risk; needs focused tests. |
| P1-D workflow-level ingestion/update concurrency | Implemented | Shared GitHub Actions concurrency group serializes manual data jobs without re-enabling schedules. |
| P1-D DB/application-level idempotency | Implemented | Active reconciliation now acquires a transaction advisory lock before loading candidates. |
| P1-E production admin positive path | Deferred | Requires real credentials/session. |
| Cleanup of accidental RED write | Pending user decision | Deletes/rollback require explicit approval. |

## Safe claim after this slice

Safe:

> Legacy scraper/update paths now default to dry-run and require explicit confirmation before real writes.

> Public product/category/promotion APIs preserve validation `400`s but degrade to demo data on catalog runtime failures.

> Ingest/update GitHub workflows now share a data-job concurrency group so manual runs do not overlap.

> Active reconciliation uses a transaction-scoped advisory lock before loading staging candidates, reducing duplicate promotion/history race risk.

Not safe:

- production-ready ingestion
- active ingestion schedule readiness
- complete crash/retry idempotency under every operational scenario
- full public API integration/E2E coverage for every route
- no accidental write occurred during the sprint
- full data rollback completed
