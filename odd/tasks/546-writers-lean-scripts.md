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
