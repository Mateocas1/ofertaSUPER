# 01: Fix daily catalog refresh `pg_restore` failure (`#585`)

The `Daily catalog refresh` workflow (`.github/workflows/daily-refresh.yml`) has failed on 4 consecutive runs since 2026-11-16 (`43951113692`, `43979719647`, `44156435000`, `44191861511`), tracked in issue `#585` (`[cloud-refresh] daily refresh failing`). The last green run was `43740208068` on 2026-11-15, so production (`https://ofertasuper.com`) is stuck serving the 2026-11-15 snapshot.

## Failure symptom

In runs `43951113692` and `44191861511`, the `Download and restore the database state` step fails inside `scripts/db-state.sh restore`:

```text
pg_restore: error: could not execute query: ERROR: unrecognized configuration parameter "transaction_timeout"
Command was: SET transaction_timeout = 0;
db-state: RESTORE_FAILED: pg_restore could not load /home/runner/work/_temp/state/ofertasuper-2026-11-15.dump
```

## Root cause

`.github/workflows/daily-refresh.yml` declares `runs-on: ubuntu-latest` on both jobs (`guard` at line 31 and `refresh` at line 70). On 2026-11-16, GitHub rotated the `ubuntu-latest` image from `ubuntu-24.04` (`ubuntu24/20261111.370`) to `ubuntu-26.04` (`ubuntu26/20261111.196`).

`ubuntu-26.04` ships `postgresql-client` 17/18, whose `pg_restore` emits `SET transaction_timeout = 0;` when restoring into a database. The `refresh` job's database service container is `postgres:16-bookworm` (PostgreSQL 16.16, `.github/workflows/daily-refresh.yml:77`), which does not recognize `transaction_timeout` (introduced in PostgreSQL 17). Because `scripts/db-state.sh:90` runs `pg_restore` with `--exit-on-error`, the restore aborts immediately.

## Existing test constraints

Any fix must satisfy the contract tests in `tests/cloud-refresh-workflow.test.ts` and `tests/db-state.test.ts`:

- `tests/cloud-refresh-workflow.test.ts:30-33` asserts that `.github/workflows/daily-refresh.yml` uses `postgres:16-bookworm` and `--health-cmd "pg_isready -U ofertasuper_owner -d ofertasuper"`.
- `tests/cloud-refresh-workflow.test.ts:171-172` asserts that `scripts/db-state.sh` contains the exact invocations `pg_restore --no-owner --no-acl` and `pg_dump -Fc --no-owner --no-acl`.
- `tests/db-state.test.ts` stubs `gh` and verifies `db-state: <REASON>:` prefixes and exit codes (`2` for `NO_STATE_RELEASE` and `NO_STATE_ASSET`, `1` for `MISSING_DUMP`).

## Options and recommendation

### Option A: Pin runner to `ubuntu-24.04` and match PostgreSQL 16 client (recommended)

Keep PostgreSQL 16 as the server and pin the client to version 16 so runner OS rotations cannot reintroduce version skew.

Why this is safer than upgrading to PostgreSQL 17 right now:

- `ofertasuper-2026-11-15.dump` and all 14 rolling backups in the `db-state` release were dumped on PostgreSQL 16.
- Local development (`compose.yml:4,16,32`) runs `postgres:16-bookworm`. (`docs/RUNBOOK.md` only mentions PostgreSQL 17 for the separate manual R2 recovery drill in `scripts/postgres-recovery-r2.mjs`.)
- `tests/cloud-refresh-workflow.test.ts:30-33` explicitly locks `postgres:16-bookworm` in the workflow.

### Option B: Upgrade server, client, compose, and tests to PostgreSQL 17

Change the workflow service container to `postgres:17-bookworm`, update `compose.yml` to `postgres:17-bookworm`, update `tests/cloud-refresh-workflow.test.ts:30-33`, and verify restoring the existing PostgreSQL 16 `db-state` dump under PostgreSQL 17. This requires local Docker and production backup validation that is unnecessary to unblock daily refreshes.

## Implementation steps

### 1. Pin the workflow runner OS (immediate unblock)

Edit `.github/workflows/daily-refresh.yml`:

- Line 31 (`jobs.guard.runs-on`): change `ubuntu-latest` to `ubuntu-24.04`.
- Line 70 (`jobs.refresh.runs-on`): change `ubuntu-latest` to `ubuntu-24.04`.

Check `.github/workflows/lighthouse-ci.yml` (lines 15 and 35) and `.github/workflows/analytics.yml` (line 29) for `ubuntu-latest`. Both workflows do not call `pg_restore`, so leave them out of this PR unless an image regression shows up there.

### 2. Decouple `pg_restore` and `pg_dump` from the host OS client (durable fix)

Pinning `ubuntu-24.04` buys time until `ubuntu-24.04` is deprecated or updated. To prevent future runner upgrades from breaking `db-state`, also pin the PostgreSQL client version used by `restore` and `dump` in this same PR.

Two options preserve `tests/cloud-refresh-workflow.test.ts:171-172`:

1. Install `postgresql-client-16` in `.github/workflows/daily-refresh.yml` before `Download and restore the database state` (verify during the dry run with `apt-cache policy postgresql-client-16` whether Ubuntu 24.04 Noble ships it directly in main or needs the PGDG apt repo), and assert that `pg_restore --version` starts with `pg_restore (PostgreSQL) 16.`.
2. Invoke `pg_restore` and `pg_dump` inside a `postgres:16-bookworm` container (for example via a wrapper or `docker run --rm --network host` mounting the dump directory), keeping the literal `pg_restore --no-owner --no-acl` and `pg_dump -Fc --no-owner --no-acl` command strings in `scripts/db-state.sh` intact so `tests/cloud-refresh-workflow.test.ts` still matches.

Installing `postgresql-client-16` and checking `pg_restore --version` in `.github/workflows/daily-refresh.yml` (alongside `runs-on: ubuntu-24.04`) is the smallest change with zero risk to `scripts/db-state.sh` quoting or file permissions.

### 3. Add a regression guard in `tests/cloud-refresh-workflow.test.ts`

Add a test case inside `describe("cloud refresh workflow contract", ...)` in `tests/cloud-refresh-workflow.test.ts` asserting that `.github/workflows/daily-refresh.yml`:

- Does not contain `runs-on: ubuntu-latest`.
- Pins `ubuntu-24.04` (or pins the PG 16 client explicitly).

### 4. Optional non-blocking follow-up

Recent logs emit Node 20 deprecation warnings from `actions/checkout` (`11d5960a326750d5838078e36cf38b85af677262`, v4.4.0) and `actions/setup-node` (`49933ea5288caeca8642d1e84afbd3f7d6820020`, v4.4.0) ahead of GitHub's Node 24 transition. Updating those pinned SHAs is optional and separate from fixing `#585`; if deferred, record it for repo hygiene.

## Verification

Run local checks before pushing the PR branch:

```bash
npm test
npm run typecheck
npm run lint
npm run audit:complexity
```

Note: `npm test` runs `tests/cloud-refresh-workflow.test.ts` and `tests/db-state.test.ts` without needing a live Postgres instance.

Test the workflow safely on the PR branch before merging (`.github/workflows/daily-refresh.yml:100` checks out `github.ref` when `dry_run` is `true`, and skips upload, analytics, and commit):

```bash
gh workflow run daily-refresh.yml --ref <branch-name> -f dry_run=true
```

Inspect the dry-run workflow log and confirm:

1. `Download and restore the database state` restores `ofertasuper-2026-11-15.dump` with exit code `0`.
2. `Apply migrations` (`npx prisma migrate deploy`) succeeds.
3. `Refresh the catalog (gates enforced)` completes without error.
4. No dump is uploaded and nothing is committed to `master`.

After merging to `master`, run a live dispatch (or wait for the next scheduled window) and verify the production pipeline end to end:

```bash
gh workflow run daily-refresh.yml --ref master -f dry_run=false
```

Confirm after completion:

1. A new `ofertasuper-YYYY-MM-DD.dump` asset appears in the `db-state` GitHub release.
2. `data/catalog-snapshot.json` is committed to `master` with today's UTC date (`chore(catalog): refresh YYYY-MM-DD [cloud]`).
3. `https://ofertasuper.com` serves the new snapshot date after Vercel deploys.
4. Issue `#585` is closed automatically by `npx tsx scripts/cloud-refresh-report.ts resolve`.

## Acceptance criteria

- `.github/workflows/daily-refresh.yml` no longer uses floating `ubuntu-latest` and runs `pg_restore` / `pg_dump` with PostgreSQL 16 client tooling matching `postgres:16-bookworm`.
- `tests/cloud-refresh-workflow.test.ts` enforces the runner/client pin.
- `dry_run=true` passes on the PR branch and `dry_run=false` succeeds on `master`, closing `#585` and updating `https://ofertasuper.com` past 2026-11-15.
