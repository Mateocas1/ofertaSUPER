# OS03 Authority Publication Workflow — Organic Progress

## Method decision

- **Active implementation method:** Organic Driven Development (ODD).
- The user explicitly ended SDD selection for pending implementation. Existing OpenSpec artifacts and native SDD history remain immutable background evidence, not admission machinery for this checklist.
- Do not invoke SDD apply/remediate/verify/attempt operations for new work. Do not reset, rescope, supersede, settle, approve, or archive the former change merely to record this migration.
- Preserve repository delivery policy, RDD preference, approved functional scope, permissions, TDD, PostgreSQL checks, lint, typecheck, build, and truthful evidence reporting.
- No commit, push, deployment, global archive, dependency change, permission change, or functional scope expansion is authorized.

## Recovery references

- OpenSpec proposal: `openspec/changes/os03-authority-publication-workflow/proposal.md`
- OpenSpec design: `openspec/changes/os03-authority-publication-workflow/design.md`
- Requirements:
  - `openspec/changes/os03-authority-publication-workflow/specs/atomic-authority-publication/spec.md`
  - `openspec/changes/os03-authority-publication-workflow/specs/candidate-evidence/spec.md`
  - `openspec/changes/os03-authority-publication-workflow/specs/runtime-enforcement-recovery/spec.md`
  - `openspec/changes/os03-authority-publication-workflow/specs/scoped-approval/spec.md`
- Historical implementation list: `openspec/changes/os03-authority-publication-workflow/tasks.md` (reference only; this file is the sole operational checklist for pending work)
- Historical progress: `openspec/changes/os03-authority-publication-workflow/apply-progress.md`
- U12b2 settlement evidence: `openspec/changes/os03-authority-publication-workflow/evidence/u12b2-settlement-record.json`
- U12c ordinary evidence: `openspec/changes/os03-authority-publication-workflow/evidence/u12c-ordinary-settlement-evidence.json`
- U12c historical build evidence: `openspec/changes/os03-authority-publication-workflow/evidence/u12c-build-verification-attempt-99.txt`
- U11b4 budget-block evidence (historical SDD method only): `openspec/changes/os03-authority-publication-workflow/evidence/u11b4-budget-blocked-evidence.json`

## Approved scope and acceptance criteria

Implement the previously approved authority-publication sequence without adding functionality. For U11b4 specifically:

- Independently verify generation 0 from U11a immutable activation/baseline proof and generation >0 only from U12b immutable generation records.
- Bind adoption to exact policy, generation, lineage, health, build, and authorized serving identity.
- Never substitute publisher JSON for independent proof.
- Reject unverified, stale, drifted, and late-ineligible adoption.
- Do not reset generation, inherit authority, repair or revive admission in place, rescan source, renew approval/expiry, or perform a second publication.
- Late-ineligible admission requires separately verified forward recovery rather than revival.
- Preserve strict RED/GREEN/TRIANGULATE/REFACTOR evidence, applicable disposable PostgreSQL and guarded-route checks, rollback/cleanup, configured `npm test`, lint, typecheck, build, and `git diff --check`.
- The earlier 440-line forecast is an explanatory planning estimate, not an ODD counter or acceptance criterion. Keep cohesive behavior, tests, documentation, and evidence together.

## Verified completed results

- [x] **U12b2** — Atomic verified delta promotion completed and natively settled from preserved evidence. The authoritative evidence is the referenced U12b2 settlement record; no new check was run during migration.
- [x] **U12c** — Exact delta recovery and temporal proof completed and natively settled by attempt 101. The authoritative evidence is the referenced U12c ordinary evidence; attempt 101 and its checks must not be reopened or repeated.
- [x] **ODD-M1** — Confirm parent ODD instructions are active from the local Gentle-Pi package at commit `51636dc32b0d2fc06ba9be364e43246127b2b1fa`, including `orchestrator.md`, `orchestrator-delegation.md`, `orchestrator-memory.md`, and `extensions/gentle-ai.ts` integration.
- [x] **ODD-M2** — Confirm no implementation actor/process remained active at migration time. Historical SDD attempts 102–104 remain unchanged background history and are not code proof.

## Operational checklist

### U11b4 — Existing-LIVE adoption and lifecycle closure

- [x] **U11b4-T1 (RED)** — Observed 2026-09-08: the generation-0 contract failed because `expectedLineage` was not bound to `baseline.root_digest`.
- [x] **U11b4-T2 (GREEN)** — Added guarded single-effect SQL/repository/route boundaries and focused unit/route evidence for independent generation-0 and generation>0 proof selection, policy/generation/lineage/health/build rejection, exact retry/changed-request denial, no publisher payload, and no mutation/revival path. Focused command passed (92 pass, 12 existing PostgreSQL skips).
- [x] **U11b4-T3 (TRIANGULATE)** — Disposable PostgreSQL harness passed with isolated g0 and g>0 immutable proof selection, every generation/lineage/health/build/policy drift fence, exact retry/changed-request conflict, and late-ineligible denial without a revival row. It creates a unique labelled container/database and removes the container through `trap`.
- [x] **U11b4-T4 (REFACTOR/VERIFY)** — Focused/full tests, lint, typecheck, and `git diff --check` passed after lifecycle completion. A fresh exact `npm run build` exited 0, ran the final catalog-contract packaging step, and did not reproduce `TypeError: Cannot read properties of null (reading 'hash')`. Missing-`DATABASE_URL` Prisma diagnostics remained handled and non-fatal during static generation.

### Authorized dependent work after U11b4

These IDs preserve the existing plan order and acceptance references. Reconcile detailed rows from the historical task list immediately before each unit; do not acquire or invent SDD state.

- [x] **U13** — Exact reader adoption and data/evidence restrictions. U11b4 is complete; implementation uses a distinct immutable reader-adoption relation so each reader proves its own authority without inheriting lifecycle/publication adoption. The user authorized two reviewable ODD units to keep each within the 400-line review boundary.
  - [x] **U13a — Persistence primitives and SQL proof**
    - [x] **U13a-T1 (RED)** — Observed 2026-09-16: focused persistence tests failed because the reader-adoption migration and restriction boundary module were absent.
    - [x] **U13a-T2 (GREEN)** — Serialized the immutable reader-adoption check/insert on the authority lifecycle reservation row that `revoke_authority` already locks, without changing revocation state.
    - [x] **U13a-T3 (TRIANGULATE/VERIFY)** — Deterministic disposable PostgreSQL race proof passed: reader insertion paused after its revocation check; revocation could not commit first, and post-revocation admission was denied. Focused persistence checks, env-bound Prisma validation, typecheck, and diff-check passed.
  - [x] **U13b — Guarded resolver integration and closure**
    - [x] **U13b-T1 (RED)** — Observed 2026-09-16: the resolver accepted a promoted publication without an independently guarded deployment reader-eligibility result.
    - [x] **U13b-T2 (GREEN)** — The resolver now requires the U13a guarded reader result for `reader_id === servingIdentity.deploymentId` and `catalog`, binding its exact current policy/generation/lineage/health/build tuple, lifecycle revocation, and normalized fact/surface restrictions before producing the existing authority fingerprint. Focused resolver tests passed.
    - [x] **U13b-T3 (TRIANGULATE/REFACTOR/VERIFY)** — Earlier focused resolver and PostgreSQL A/B evidence remained valid; this closure reran the full test, lint, typecheck, and diff-check gates. The exact production build exited 0 after the Serwist migration, and the existing browser offline/catalog-cache boundaries passed. The U13p correction revalidated the focused PWA contract, typecheck, default-Turbopack production build, browser boundaries, and diff-check successfully.
  - [x] **U13p — Minimal PWA build compatibility migration**
    - [x] **U13p-T1 (RED/BASELINE)** — The focused PWA contract test failed before migration because its stale Workbox contract no longer matched the preserved catalog packaging build stage; this replaced the prior `null.hash` PWA build blocker with an explicit minimal Serwist contract.
    - [x] **U13p-T2 (GREEN)** — Replaced only `@ducanh2912/next-pwa` with the documented Serwist configurator, source worker, and production provider. The worker retains `/~offline`, `/sw.js`, manifest installability, and NetworkOnly catalog navigation/API routes.
    - [x] **U13p-T3 (VERIFY)** — Focused PWA contract, full test, lint, typecheck, production build, browser cache/offline boundaries, and diff-check passed. The build wrote `public/sw.js` and reported 76 precached URLs totaling 1.73 MB. The U13p correction removed only the obsolete `--webpack` forcing: focused PWA contract, typecheck, default-Turbopack production build, browser boundaries, and diff-check all passed; the build wrote `public/sw.js` with 40 precached URLs totaling 1.68 MB. The previously measured logical U13p scope remains 161 lines.
- [ ] **U14 — Forward corrective generation** — U14a is complete; U14b remains a separate, unstarted ODD unit.
  - [x] **U14a — Pure correction preparation**
    - [x] **U14a-T1 (RED)** — Observe fail-closed gaps for historical-pointer/whole-row inverse input, missing retained before-images, overlapping current edits, source-restoration assertions, and unknown correction boundaries.
    - [x] **U14a-T2 (GREEN)** — Prepare a detached correction only from immutable original images and the exact current predecessor; invoke a fresh verifier callback and return only its matching governed handle, with no persistence or public effect.
    - [x] **U14a-T3 (VERIFY)** — Focused correction test, `npm test` (98 pass, 12 skips), typecheck, lint (0 errors, 206 warnings), and diff-check passed.
  - [ ] **U14b — Durable guarded correction lifecycle**
    - [ ] **U14b-T1 (GREEN)** — Persist immutable correction linkage and route the freshly verified envelope through existing guarded promotion to create `g+1` with new lineage/audit reference; retain catalog restriction on ambiguity.
    - [ ] **U14b-T2 (TRIANGULATE)** — Prove in disposable PostgreSQL bad delta → unrelated successor → fresh correction, no selectable historical row, and unresolved overlap remaining restricted.
    - [ ] **U14b-T3 (VERIFY)** — Run focused lifecycle, PostgreSQL, full test, typecheck, lint, build, and diff checks without entering U15.
- [ ] **U15** — Shared guarded read snapshot and authority decision.
- [ ] **U16** — APIs and shared catalog loaders.
- [ ] **U17** — Pages, metadata, JSON-LD, and sitemap enforcement.
- [ ] **U18** — Payload, external, client, and PWA cache enforcement.
- [ ] **U19** — Non-production acceptance harness and runbook.

## Current status and next action

- **Current result:** U11b4-T1 through U11b4-T4 are implemented and independently checked. U11b4 is complete. The disposable harness exposed and fixed a PostgreSQL regular-expression defect: PostgreSQL rejects `{1,256}` because its repetition upper bound is 255; the SQL now uses a length fence plus a character-class expression.
- **U13 closure:** U13p replaced the unsupported Webpack plugin with Serwist configurator mode. The U13p correction removed obsolete `--webpack` forcing, and the exact default-Turbopack production build exited 0, generated `public/sw.js` (40 URLs, 1.68 MB), and the existing browser suite passed all manifest, catalog NetworkOnly, and offline fallback checks; U13b and U13 remain closed. The previously measured logical U13p scope remains 161 lines.
- **Observed checks (2026-09-08):** focused U11b4 tests exited 0 (92 pass, 12 existing PostgreSQL skips); the updated disposable PostgreSQL harness exited 0 after exercising g0/g>0 selection, all drift fields, exact retry/conflict, and late-ineligible denial; `npm test` exited 0 (92 pass, 12 skips); `npm run lint` exited 0 (204 existing warnings, 0 errors); `npm run typecheck` and `git diff --check` exited 0. Independent verification repeated the focused tests, PostgreSQL harness, and `git diff --check` successfully and found no actionable security/correctness defect in those boundaries. `npm run build` remains the preserved current-candidate failure: `TypeError: Cannot read properties of null (reading 'hash')`; the verifier did not rerun it because that run writes `.next` under its read-only constraints.
- **PostgreSQL harness:** `scripts/test-existing-live-adoption-postgres.sh` creates a unique labelled PostgreSQL container/database, applies migrations, seeds only database-held immutable proofs, exercises the lifecycle, and always removes the container through `trap`.
- **Build closure (2026-09-15):** the exact `npm run build`, captured through `/tmp/u11b4-build.U69Ayf.log`, exited 0. It completed the chained catalog-contract packaging step and did not reproduce `Cannot read properties of null (reading 'hash')`. Prisma emitted handled missing-`DATABASE_URL` diagnostics during static generation; all 31 static pages and build finalization completed.
- **Next action:** U13 is complete. Do not enter U14/U15 without separate authorization.
- Update this checklist only from observed worker/check results. It is the sole operational task list; OpenSpec files remain referenced historical artifacts.
