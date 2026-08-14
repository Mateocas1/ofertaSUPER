# Tasks: Next.js 16 Production Security Migration

## Review Workload Forecast

Authored: 1,510–1,850; five stacked-to-main PRs, 230–390 each. Generated evidence snapshot-bound, outside authored count; no `size:exception`.

Preservation authorization gate: Explicit delivery authorization is required before named WIP preservation branch/commit and clean-base allowlisted extraction; planning grants neither.

PR 0 base: clean merged main (`master`), never the dirty worktree; autonomous verified unit. `auto-chain` begins only after authorization and PR 0 proof.

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| PR / authored | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|
| 0 Foundation / 340–390 | `npx tsx --conditions=react-server --test tests/production-dependency-gate.test.ts` | N/A—baseline-only; `npx tsx scripts/production-security-evidence.ts --baseline` | Drop PR 0; WIP owns exclusions |
| 1 Graph / 330–390 | `npx tsx --conditions=react-server --test tests/next16-security-graph.test.ts tests/production-dependency-gate.test.ts` | `npm ci --ignore-scripts --no-audit --no-fund && npm audit --omit=dev --json` | Manifest, lock, Graph receipts/tests |
| 2 Proxy / 230–310 | `npx tsx --conditions=react-server --test tests/proxy-contract.test.ts tests/admin-access.test.ts` | `npx next typegen && npm run typecheck && npm run lint` | Proxy/middleware/tests/config |
| 3 PWA / 290–370 | `npx tsx --conditions=react-server --test tests/pwa-build-contract.test.ts tests/node-image-contract.test.ts` | `npm run build && npx playwright test --config=playwright.config.ts` | PWA/image/config/assets |
| 4 Runtime / 320–390 | `npx tsx --conditions=react-server --test tests/next16-rollout.test.ts` | `docker build --target runner -t ofertas-super:next16 . && npm run smoke:next16-runtime` | Rollout records/runbook; repoint once |

Strict TDD: RED precedes GREEN.

### Stable-ID Traceability

- `PRS-REQ-001`/`PRS-SCN-001–002`: 0.1–1.2.
- `PRS-REQ-002`/`PRS-SCN-003–006`: 2.1–4.2.
- `PRS-REQ-003`/`PRS-SCN-007–009`: 4.1–4.2.
- `PRS-REQ-004`/`PRS-SCN-010–011`: 4.1–4.2.

## Phase 0: Foundation — PR 0

- [x] 0.1 **RED:** In `tests/production-dependency-gate.test.ts`, reject hostile traversal/absolute/Windows/NUL, `requirements.txt`, `CMakeLists.txt`, MD/MDX, and `README.sh`; retain inert payload; deny incomplete/residual classification, shell metacharacter execution, secret leakage, stale/tampered/missing/replayed/mixed evidence, and wrong-root/staged/empty/mismatched extraction inventory.
- [x] 0.2 **GREEN:** With explicit authorization, create `wip/production-readiness-foundation` branch/commit with canonical base/status hashes; clean main restores allowlisted `src/lib/production-readiness/dependency-gate.ts`, its test, and `scripts/production-security-evidence.ts`. Keep data-only classifier, paired invariant, fixed baseline-only npm argv, redacted environment; exclude `repository.ts`/test, Prisma schema/migration, repository smoke/script, acceptance-policy hunks, and failed Next15 manifest/lock bytes. **PRS-REQ-001; PRS-SCN-001–002.**

## Phase 1: Graph and Audit Authority — PR 1

- [x] 1.1 **RED:** Add `tests/next16-security-graph.test.ts` proving unknown lifecycle `hasInstallScript`/marker execution fails and zero-audit authority rejects every finding or unclassified path.
- [x] 1.2 **GREEN:** Add Graph receipts; update fixed Next/Clerk/Prisma/Axios graph/lock; `shadcn` dev, `tsx` retained; `--ignore-scripts`, reviewed argv. **PRS-REQ-001; PRS-SCN-001–002.**

## Phase 2: Proxy and Framework — PR 2

- [x] 2.1 **RED:** Add `tests/proxy-contract.test.ts` for unchanged admin/API matching, authorized/unauthorized decisions, and public catalog access.
- [x] 2.2 **GREEN:** Rename `src/middleware.ts` to `src/proxy.ts`; preserve Clerk and `src/lib/admin/access.ts`; make only typegen/lint-proven corrections. **PRS-SCN-003.**

## Phase 3: Webpack PWA and Images — PR 3

- [ ] 3.1 **RED:** Add `tests/pwa-build-contract.test.ts`, `tests/next16-pwa.browser.ts`, and `playwright.config.ts`: `--webpack`, manifest, SW cache/update, offline fallback, unoptimized images.
- [ ] 3.2 **GREEN:** Update `package.json`, `next.config.ts`, `.github/workflows/lighthouse-ci.yml`, and PWA hashes; retain Workbox/`next build --webpack`. **PRS-SCN-004.**

## Phase 4: Standalone Rollout and Handoff — PR 4

- [ ] 4.1 **RED:** Add `tests/next16-rollout.test.ts` for standalone routes, missing runtime proof promotion block, and failure/timeout/signal/cleanup rollback; pre-cutover keeps traffic and critical failure switches once.
- [ ] 4.2 **GREEN:** Add `scripts/next16-rollout.ts`, runtime smoke, immutable records, and `docs/next16-rollout.md`; validate retained release, cut over/rehearse recovery, and hand off without `production-readiness` task-state change. **PRS-SCN-005–011.**
