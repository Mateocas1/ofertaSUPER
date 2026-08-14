# Design: Next.js 16 Production Security Migration

## Technical Approach

Use five fail-closed slices: PR 0 Foundation, Graph, Proxy, PWA, Runtime. Foundation extracts a baseline; Graph moves `next`, `@next/env`, and `eslint-config-next` together to 16.3.1 and coordinates fixed Clerk, Prisma, Axios, and production paths to zero findings. Retain React 19.2, Node 22, TypeScript 5.9, async inputs, revalidation, standalone, and `next build --webpack`. Server Actions, Cache Components, PPR, AMP, runtime config, and PWA replacement are excluded.

## Architecture Decisions

| Decision | Choice and rationale |
|---|---|
| Foundation extraction | Build PR 0 from clean `master`; selective ownership prevents task 1.4 becoming an implicit prerequisite. |
| Security authority | Foundation records every path; Graph alone requires zero findings. Existing signed acceptance semantics never satisfy PRS closure. |
| Evidence/bundler | Hash-linked CI artifacts reject invalid snapshots; Webpack remains because PWA injects webpack/Workbox. |

## Exact PR 0 Boundary

PR 0 owns only:

- `src/lib/production-readiness/dependency-gate.ts`: data-only JSON validation from current `assertJsonAuditInput`, deterministic supplied-tree/audit classification, and missing-path/finding denial. `evaluateDependencyGate` acceptance stays only on the preservation branch and is not PRS authority.
- `tests/production-dependency-gate.test.ts`: hostile-path/inert-payload, paired-package, complete-classification, and residual/unclassified tests; exclude hard-coded 15.5.23 assertions.
- `scripts/production-security-evidence.ts`: baseline-only fixed npm argv, protected environment, canonical output; no install, manifest mutation, lifecycle, or remediation.
- Generated clean-base tree, audit, `foundation-baseline.json`, and hashes; excluded from authored counts.

Excluded: `repository.ts`, its test, Prisma schema/migration, repository smoke/script (task 1.4), and every failed 15.5.23 manifest/lock byte. Only the paired-version invariant is retained.

Record base SHA, status paths, and hashes in a `production-readiness` WIP preservation commit. Create PR 0 from `master` and restore only allowlisted hunks. That branch—not a stash—retains every exclusion; preflight verifies its inventory before switching.

## Data and Evidence Flow

```text
clean base -> Foundation baseline -> Graph candidate + zero audit
 -> Proxy proof -> Webpack/PWA proof -> standalone/cutover/handoff
                                      failure -> retained release
```

`manifest.json` binds lineage, times, tools, status, and sorted `{path,kind,sha256}`. `snapshotId` includes authored files, lockfile, PWA assets, baseline/audit, and release digest. Graph paths record `{package,version,path,advisories,remediation}` plus lifecycle inventory. Suppression, acceptance, or missing classification denies closure.

## Reversible Slices

| Slice (<400 authored) | Start → end | Rollback; evidence |
|---|---|---|
| 0. Foundation | Preserved mixed tree + clean base → bounded classifier baseline | Drop PR 0 only; baseline/inventory receipts. |
| 1. Graph | Foundation → coordinated lock, zero findings | Revert manifest/lock/Graph tests; graph, audit, lifecycle receipts. |
| 2. Proxy | Graph → `src/proxy.ts`, unchanged protection | Restore middleware; matcher, auth/public, type/lint proof. |
| 3. PWA | Proxy → Webpack build, offline/cache/image continuity | Revert PWA proof/corrections or chain; generated asset hashes, Chromium proof. |
| 4. Runtime | PWA → standalone, cutover rehearsal, handoff | Repoint once to retained release; runtime/rollback/handoff receipts. |

Generated lock/PWA/evidence stays snapshot-bound but excluded from authored counts. No size exception.

## File Changes and Counts

Planned chain: 8 authored files created, 2 modified, 1 renamed, 0 deleted; generated lockfile, PWA assets, and evidence. Excluded mixed-tree files are not counted.

## Testing Strategy

PR 0 RED proves path safety, classification, VCS extraction, argv, and redaction. Graph adds lifecycle/zero-audit; Proxy matcher/auth; PWA Chromium offline/images; Runtime standalone, rollback, and handoff. Typegen, test, lint, typecheck, Webpack build, container, and final audit gate promotion.

## Threat Matrix

| Boundary | Assignment; safe/failure behavior; planned RED |
|---|---|
| Documentation-like paths | Foundation: repo-relative JSON only; RED covers `requirements.txt`, `CMakeLists.txt`, MD/MDX, `README.sh`, traversal/absolute/NUL, inert shell text. |
| Git repository selection | Foundation: canonical root/base only; RED rejects wrong `git -C`, relative, and absolute selectors. |
| Commit state | Foundation: preservation then allowlisted diff; RED covers staged exclusion, `commit -a`, empty/mismatched inventory. |
| Shell/argv | Foundation/Graph: fixed argv, `shell:false`; RED injects metacharacters. |
| Protected environment | Foundation/Graph/Runtime: allowlist names, never values; RED uses secret canaries. |
| Lifecycle scripts | Graph: `--ignore-scripts`, explicit setup; RED rejects unknown `hasInstallScript`/marker execution. |
| Evidence integrity | All: recompute identity/freshness/lineage; RED covers stale, edited, missing, replayed, mixed evidence. |
| Rollback process | Runtime: pre-cutover leaves traffic; critical failure switches back once; RED covers failure, timeout, signal, cleanup. |
| Push state | N/A: no push/refspec automation. |
| PR commands | N/A: no PR command composition. |

## Migration / Rollout

Deploy beside the retained release, validate, atomically switch under liveness, then repeat critical smoke. Failure switches back without rebuilding; pre-cutover failure changes nothing. `handoff.json` exposes digest/missing gates. Task 1.3 consumes it independently; this change never edits task state.

## Traceability

| Requirement | Scenarios → slices |
|---|---|
| PRS-REQ-001 | PRS-SCN-001–002 → Foundation baseline + Graph closure/denial |
| PRS-REQ-002 | PRS-SCN-003 → Proxy; 004 → PWA; 005–006 → PWA/Runtime gate |
| PRS-REQ-003 | PRS-SCN-007–009 → Runtime cutover/rollback/continuity |
| PRS-REQ-004 | PRS-SCN-010–011 → Runtime complete/incomplete handoff |

## Open Questions

None.
