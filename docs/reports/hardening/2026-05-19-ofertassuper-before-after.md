# ofertasSUPER hardening before/after - 2026-05-19

Status: `P1-A BEFORE/AFTER RECORDED`

## Summary

| Dimension | Before | After |
|---|---|---|
| Legacy scraper default | `runStoreScraper({ ... })` defaulted to `dryRun = false`. | `runStoreScraper({ ... })` defaults to `dryRun = true`. |
| CLI write approval | `readDryRunFlag()` only checked `--dry-run`; no dry-run flag meant real writes. | No approval means dry-run. Real writes require `--confirm-write` or `INGESTION_WRITE_APPROVED=true`. |
| Dry-run precedence | Not modeled. | `--dry-run` wins over `--confirm-write`. |
| `update-prices` workflow | Manual dispatch ran `npm run update:prices` directly. | Manual dispatch defaults to `npm run update:prices -- --dry-run`; real writes require `confirm_write: true`. |
| Scraper status reporting | Could report status for unconfirmed/default runs. | Runs only when `confirm_write == true`. |
| Test coverage | No legacy write-safety test. | `tests/legacy-write-safety.test.ts` covers CLI policy, direct scraper default, and workflow guard. |
| README | Warned against active/non-dry-run ingestion generally. | Documents that legacy scraper/update writes require explicit confirmation. |

## Evidence map

| Finding | Commit | Test / evidence | Claim |
|---|---|---|---|
| P1-A legacy write scripts are an accidental production-write footgun | `6d01b9f fix(ingestion): guard legacy write scripts` | `npx tsx --test tests/legacy-write-safety.test.ts` -> 3/3 passing; `npm test` -> 24/24 passing | Legacy scraper/update paths now default to dry-run and require explicit confirmation for writes. |

## Commands run

No build was run.

| Command | Result |
|---|---|
| `npx tsx --test tests/legacy-write-safety.test.ts` before fix | failed 3/3, proving the guard was missing |
| `npx tsx --test tests/legacy-write-safety.test.ts` after fix | passed 3/3 |
| `npm test` | passed 24/24 |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |

## Incident before/after

Before the fix, the RED test demonstrated the real risk by reaching the unguarded write path. A read-only DB check found 50 `price_history` rows in the last hour, with latest sample ids around `4990`-`4994`.

After the fix:

- the test dependency injection is honored;
- omitted `dryRun` remains safe;
- workflow default path is dry-run;
- no cleanup/delete was executed without approval.

## Remaining risk

The code-level P1-A risk is reduced, but the accidental RED write remains an operational cleanup decision. Do not claim a clean no-write sprint unless the user either approves cleanup or explicitly accepts documenting it as-is.
