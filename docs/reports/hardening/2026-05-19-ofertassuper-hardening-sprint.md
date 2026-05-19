# ofertasSUPER hardening sprint - 2026-05-19

Status: `P1-A IMPLEMENTED, CLEANUP DECISION PENDING`

This sprint started from the Goal 1 audit backlog. No P0 existed, so the selected first work unit was P1-A: guard legacy write scripts.

## Scope selected

| Gate | Decision |
|---|---|
| Selected slice | P1-A - Guard legacy write scripts |
| Why first | It had the highest data-safety and interview value: accidental writes are more dangerous than polish/perf cleanup. |
| Not selected now | P1-B public API fallback, P1-C catalog scalability, P1-D ingestion idempotency, P1-E admin positive path. |
| Build | Not run. |
| External dashboards | Not touched. |
| Schedules | Not re-enabled. |
| Push | Not pushed. |

## Work unit

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
| `npm test` | 24/24 passing |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |

## Remaining Goal 2 items

| Item | Status | Reason |
|---|---|---|
| P1-A legacy write guard | Implemented in `6d01b9f` | Tests and docs included. |
| P1-B public API fallback/error semantics | Deferred | Separate API contract slice. |
| P1-C product listing scalability | Deferred | Higher query-design risk; needs focused tests. |
| P1-D ingestion idempotency/concurrency | Deferred | Separate data-correctness slice. |
| P1-E production admin positive path | Deferred | Requires real credentials/session. |
| Cleanup of accidental RED write | Pending user decision | Deletes/rollback require explicit approval. |

## Safe claim after this slice

Safe:

> Legacy scraper/update paths now default to dry-run and require explicit confirmation before real writes.

Not safe:

- production-ready ingestion
- active ingestion schedule readiness
- no accidental write occurred during the sprint
- full data rollback completed
