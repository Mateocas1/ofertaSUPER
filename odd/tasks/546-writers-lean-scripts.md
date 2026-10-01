# 546 — Lean scripts: unify writers, drop the legacy path, trim package.json

Issue: Mateocas1/ofertaSUPER#546 · Branch: `feat/546-writers` · Base: `origin/master` 23f3828

## Objective
One parameterized direct-refresh writer entry, no legacy scraper path, no 90-day history
cleanup, `package.json` under 20 scripts, and only live scripts left on disk. Lint warnings
reduced last, by fixing code.

## Authorized scope (orchestrator brief, 2026-10-01)
- Unify `scripts/direct-refresh-{carrefour,vea,disco,jumbo,mas}-write.ts` behind one entry.
- Delete the legacy `scripts/scrapers/` path once nothing live depends on it.
- Remove `scripts/cleanup-history.ts` (history is never deleted; #547 owns retention).
- Delete dead audit/probe/smoke scripts and the files that only existed for them; trim
  `package.json` to the keep list (dev, build, start, lint, typecheck, test, refresh:catalog,
  db scripts really used, audit:complexity, lighthouse).
- Fix the lint warnings; never add `eslint-disable`.

## Live-vs-dead map (file:line evidence)
- Cron: `scripts/cron-refresh-entry.sh:52` execs `scripts/cron-refresh.sh`; `scripts/cron-refresh.sh:105`
  runs `npm run refresh:catalog` inside the `migrate` image.
- `refresh:catalog` → `scripts/refresh-catalog.ts` → `scripts/acquire-cmvp-catalog-batch.ts` +
  `scripts/pipeline/{cmvp-catalog-batch,topup}.ts`; `scripts/refresh-catalog.ts:99` spawns
  `scripts/export-catalog-snapshot.ts`.
- CI `.github/workflows/lighthouse-ci.yml`: `audit:complexity` (:31), `npm test` (:56),
  `typecheck` (:59), `lint` (:62), `build` (:65), `start` (:68).
- Docker: `Dockerfile:14,17` (`db:generate`, `build`), `Dockerfile:29` job image,
  `Dockerfile:43` job CMD `tsx scripts/ingest.ts`; `compose.yml` runs `prisma migrate deploy`
  and `tsx prisma/seed.ts`.
- The five `direct-refresh:*-write` scripts are operator tools (no cron, CI, Docker or compose
  caller); they are identical modulo source name (see diff evidence in the report).
- Legacy path `scripts/scrapers/shared.ts` has no live caller: no cron/CI/Docker/compose entry,
  and the pipeline (`src/lib/ingestion/adapters`) covers every source it served.

## Tasks
- [ ] T1 Unified writer + prewrite repository extraction. Route: inline (mechanical refactor,
      behavior-preserving, covered by the existing pipeline tests).
- [ ] T2 Remove the legacy scraper path and its static-guard test.
- [ ] T3 Remove the 90-day history cleanup.
- [ ] T4 Delete dead audit/probe/smoke scripts and their tests.
- [ ] T5 Trim `package.json` below 20 scripts.
- [ ] T6 Fix lint warnings.

## Checks
`npx tsc --noEmit`, `npm test`, `npm run lint` (no new warnings), `npm run audit:complexity`,
`npx next build --webpack`.

## Progress
- 2026-10-01: map done; baseline recorded (828 tests pass, lint 156 warnings, prisma generate ok).

## Progress (continued)

- T1 unified writer: commit 73658d8. `scripts/direct-refresh-write.ts --source <slug>` replaces the five
  `direct-refresh-*-write.ts` files; the DB-backed prewrite repository moved to
  `scripts/pipeline/direct-refresh-prewrite-repository.ts`; the prewrite gate CLI is now
  `scripts/direct-refresh-prewrite-gate.ts` (`direct-refresh:prewrite`). Per-source tests in
  `tests/direct-refresh-write.test.ts`.
- T2 legacy path: commit 4bf1f0f. `scripts/scrapers/**`, `populateDb.ts`, `updatePrices.ts`, `scrape:*`,
  `populate`, `update:prices` deleted; the `strategy: "legacy"` branch in `resolveIngestionQueryTerms`
  removed with its only caller.
- T3 history cleanup: commit b2b41ad. `scripts/cleanup-history.ts` and `cleanup:history` deleted; a
  static guard fails the suite if any script prunes price history by timestamp.
- T4/T5 deletions + package.json: commit adfd89d. 75 scripts, 36 test files and ~35k lines removed
  (audit-direct-refresh-*, audit-cmvp-*, category pagination, coverage, ingest-run, price-drift,
  freshness baseline, ops freshness, refresh throughput, the direct-refresh discovery family, vtex
  probes, compose/job-image/postgres recovery smoke harnesses). `package.json` 61 -> 19 scripts.
  Complexity baseline pruned 131 -> 39 findings.
- T6 lint: commits 2d4dab1, b34fffa, d40228b, ca9bde2, 887869e, b9cb259, 95c4ad8, 5d5fcb2, c6e6ae8.
  156 -> 0 warnings, all by extracting named helpers; no rule disabled and no eslint-disable added.
  Baseline is now empty (0 over-threshold functions).

### Checks
- `npx tsc --noEmit`: 0 errors.
- `npm test`: 414/414 pass (was 828; the delta is deleted audit-tooling tests).
- `npm run lint`: 0 problems (was 156 warnings).
- `npm run audit:complexity`: PASS, 0 over-threshold.
- `npx next build --webpack`: see report.
