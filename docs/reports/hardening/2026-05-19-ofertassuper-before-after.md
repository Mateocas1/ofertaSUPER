# ofertasSUPER hardening before/after - 2026-05-19

Status: `P1-A, P1-B, P1-C, P1-D AND CLEANUP BEFORE/AFTER RECORDED`

## Summary

| Dimension | Before | After |
|---|---|---|
| Legacy scraper default | `runStoreScraper({ ... })` defaulted to `dryRun = false`. | `runStoreScraper({ ... })` defaults to `dryRun = true`. |
| CLI write approval | `readDryRunFlag()` only checked `--dry-run`; no dry-run flag meant real writes. | No approval means dry-run. Real writes require `--confirm-write` or `INGESTION_WRITE_APPROVED=true`. |
| Dry-run precedence | Not modeled. | `--dry-run` wins over `--confirm-write`. |
| `update-prices` workflow | Manual dispatch ran `npm run update:prices` directly. | Manual dispatch defaults to `npm run update:prices -- --dry-run`; real writes require `confirm_write: true`. |
| Data-job workflow overlap | `ingest.yml` and `update-prices.yml` had no shared workflow concurrency guard. | Both workflows share `concurrency.group: ofertas-super-data-jobs` with `cancel-in-progress: false`. |
| Scraper status reporting | Could report status for unconfirmed/default runs. | Runs only when `confirm_write == true`. |
| Test coverage | No legacy write-safety test. | `tests/legacy-write-safety.test.ts` covers CLI policy, direct scraper default, and workflow guard. |
| Public product/category/promotion runtime errors | Product/promotions route catches reused `badRequestResponse()` and could map runtime failures to `400`; categories could throw through framework handling. | Product/category/promotion APIs use `resolvePublic*` helpers: validation errors stay `400`, runtime loader failures return bounded demo fallbacks. |
| Public API fallback tests | No focused tests for preserving validation `400`s while degrading runtime failures. | `tests/public-catalog-api.test.ts` covers product, categories and promotions fallback semantics. |
| Product listing read size | `listProducts()` called `db.product.findMany()` with no `take`, then loaded relations and filtered/sorted in memory. | `findRawProducts()` applies `take: calculateProductCandidateReadLimit(filters)` before relation loading. |
| Product listing query planning tests | No direct test covered product-list candidate caps. | `tests/catalog-query-planning.test.ts` covers min/max cap and unsafe pagination normalization. |
| Ingestion concurrency test coverage | No static workflow assertion for data-job concurrency. | `tests/ingestion-concurrency.test.ts` proves ingest/update workflows serialize through the shared group. |
| Active reconciliation race guard | Reconciliation loaded pending candidates before any cross-job lock; overlapping runs could load the same pending rows. | `reconcileStageProducts()` acquires a transaction-scoped advisory lock before loading candidates and reconciles chunks inside that locked transaction. |
| Reconciliation lock tests | No deterministic test around active reconciliation locking. | `tests/reconcile-lock.test.ts` covers stable lock key, lock success, lock failure and lock-before-load ordering. |
| Accidental RED-write cleanup | 50 accidental Disco `price_history` rows from the legacy write-safety RED run remained documented but not cleaned. | After explicit approval, the 50 bounded rows were deleted transactionally and post-check confirmed `remaining_candidate_rows = 0`. |
| README | Warned against active/non-dry-run ingestion generally. | Documents that legacy scraper/update writes require explicit confirmation. |

## Evidence map

| Finding | Commit | Test / evidence | Claim |
|---|---|---|---|
| P1-A legacy write scripts are an accidental production-write footgun | `6d01b9f fix(ingestion): guard legacy write scripts` | `npx tsx --test tests/legacy-write-safety.test.ts` -> 3/3 passing; `npm test` -> 24/24 passing | Legacy scraper/update paths now default to dry-run and require explicit confirmation for writes. |
| P1-B DB-down degradation is inconsistent outside search | `fix(api): normalize public catalog fallbacks` | `npx tsx --test tests/public-catalog-api.test.ts` -> 4/4 passing; `npm test` -> 29/29 passing | Public product/category/promotion APIs preserve validation `400`s and degrade runtime failures to bounded demo fallback data. |
| P1-C product listing reads broad result sets before pagination | `perf(catalog): bound product listing candidate reads` | `npx tsx --test tests/catalog-query-planning.test.ts` -> 2/2 passing; `npm test` -> 35/35 passing | Product listing now caps candidate reads before loading relation data. |
| P1-D ingestion lacks explicit cross-job concurrency/idempotency guard | `fix(ingestion): serialize data workflows` | `npx tsx --test tests/ingestion-concurrency.test.ts` -> 1/1 passing; `npm test` -> 25/25 passing | Ingest/update workflows now share a GitHub Actions concurrency group, reducing overlap risk for manual data jobs. |
| P1-D active reconciliation can load stale pending candidates during overlap | `fix(ingestion): guard active reconciliation lock` | `npx tsx --test tests/reconcile-lock.test.ts` -> 4/4 passing; `npm test` -> 33/33 passing | Active reconciliation acquires a transaction advisory lock before loading candidates, failing fast if another reconcile is in progress. |
| Accidental RED-write operational residue | docs-only cleanup proposal, then approved execution | Cleanup preflight -> 50 rows, ids `4945`-`4994`; cleanup transaction -> deleted 50; post-check -> 0 remaining | Accidental append-only price history rows were removed without touching product or supermarket product state. |

## Commands run

No build was run.

| Command | Result |
|---|---|
| `npx tsx --test tests/legacy-write-safety.test.ts` before fix | failed 3/3, proving the guard was missing |
| `npx tsx --test tests/legacy-write-safety.test.ts` after fix | passed 3/3 |
| `npx tsx --test tests/public-catalog-api.test.ts` before fix | failed because the helper/contract did not exist |
| `npx tsx --test tests/public-catalog-api.test.ts` after fix | passed 4/4 |
| `npx tsx --test tests/catalog-query-planning.test.ts` before fix | failed because the helper/contract did not exist |
| `npx tsx --test tests/catalog-query-planning.test.ts` after fix | passed 2/2 |
| `npx tsx --test tests/ingestion-concurrency.test.ts` before fix | failed 1/1, proving workflow concurrency was missing |
| `npx tsx --test tests/ingestion-concurrency.test.ts` after fix | passed 1/1 |
| `npx tsx --test tests/reconcile-lock.test.ts` before fix | failed 4/4, proving no advisory-lock contract existed |
| `npx tsx --test tests/reconcile-lock.test.ts` after fix | passed 4/4 |
| `npm test` | passed 35/35 |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| Local public API smoke on Next dev server `127.0.0.1:3041` | passed 5/5 for changed public API surfaces |
| Local product-list smoke on Next dev server `127.0.0.1:3042` | passed 2/2 after bounded-read change |
| Cleanup preflight | passed: 50 candidates, ids `4945`-`4994`, `disco`, no missing ids |
| Cleanup transaction | passed: deleted 50 rows, post-check `remaining_candidate_rows = 0` |

## Incident before/after

Before the fix, the RED test demonstrated the real risk by reaching the unguarded write path. A read-only DB check found 50 `price_history` rows in the last hour, with latest sample ids around `4990`-`4994`.

After the fix:

- the test dependency injection is honored;
- omitted `dryRun` remains safe;
- workflow default path is dry-run;
- no cleanup/delete was executed before approval;
- after explicit approval, the bounded `price_history` cleanup deleted exactly 50 rows and left 0 matching candidates.

## Remaining risk

The code-level P1-A risk is reduced and the bounded append-only `price_history` residue was cleaned. Do not claim a perfect full data rollback because `products` and `supermarket_products` were intentionally not reverted without a safe before snapshot.

P1-B is improved for product/category/promotion APIs, but product-detail/history route coverage is not claimed as fully normalized until separate integration tests cover those routes.

P1-C now reduces unbounded relation-heavy reads, but it is not a full search/index strategy. Larger catalogs still need DB-native search, indexing and pagination design.

P1-D now has workflow-level serialization and a DB transaction advisory lock. Remaining risk is operational: active reconciliation uses one transaction for the full reconciliation window, so larger future volumes need timeout monitoring and possibly a later staging-claim design.
