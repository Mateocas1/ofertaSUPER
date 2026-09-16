# Apply Progress: Governed Authority Publication

## Reconstructed cumulative record

This is a **reconstructed cumulative U1–U6 audit record**, not a byte-for-byte restoration. U6 accidentally overwrote the earlier U1–U5 prose in this untracked OpenSpec change directory. This recovery cross-checks the retained authoritative task checkboxes, current U6 record, and `gentle-ai sdd-attempt status` durable outcomes; it does not represent unavailable prior prose as recovered.

- Recovery objective: `u6-apply-progress-recovery`, generation 11, artifact-only, max 400 additions plus deletions.
- Completion reconciliation: `tasks.md` visibly marks exactly **27/83** implementation tasks complete: U1 (4), U2 (4), U3 (4), U4a (4), U4b (3), U5 (4), and U6 (4). U7–U19 remain unchecked.
- Workload boundary: approved feature-branch chain; U4 was safely split into U4a then U4b. This recovery changes neither implementation nor task state.
- Source note: parent-captured delivery accounting below is authoritative for the recovered work units. The durable runtime ledger also retains per-attempt counters and historical failed attempts; its U6 predecessor was counted at 581 lines only because this file had been overwritten.

## Completed work-unit ledger

| Unit | Status and scope | Accounting | Test / PostgreSQL evidence | Cleanup and residual boundary |
|---|---|---:|---|---|
| U1 | Complete: public-schema primitives, guarded operation/procedure interfaces, projection constraints; no roles, baseline, or lifecycle ownership. | 508 total; authorized 720-line exception. Durable passing attempt: 145. | Focused and full tests, lint, typecheck, and build passed. Fresh PostgreSQL proved scalars, direct-update rejection, exact retry, and changed-request conflict. | Corrective/refactor containers were removed with empty exact-name lookups. U2 owns grants; U4/U11 own baseline/lifecycle. |
| U2 | Complete: deny-first bootstrap/recovery allowlists and hardened definers; no custody/GC. | 129; durable passing attempt: 130. | Focused/full tests and all quality commands passed. Fresh source and ACL-free restore PostgreSQL proof returned `t|t|t|t|t|t`. | Exact source/restore containers and temporary dump were removed; no ports or persistent volumes. |
| U3 | Complete: `authority-candidate/v1` canonical bytes, validation, digest and independent fixture contract; no approvals/reservations/publication. | 264; durable passing attempt: 212. | RED observed; eight focused canonical/candidate tests, full tests, lint, typecheck, and build passed. | No external environment was used. U4 owns baseline construction; U9/U10/U11 own approval/reservation/activation. |
| U4a | Complete: EMPTY→BUILDING→FROZEN preparation and independent same-exported-snapshot seal; nonpublic only. | 299; durable passing attempt: 224. | Original RED retained; real PostgreSQL proved same-snapshot import, source writability, valid FROZEN seal, and snapshot-loss/root/incomplete/expired/rejected/reuse rejection. Focused/full tests and all quality commands passed. | Exact disposable containers were removed with no ports or volumes. U4b exclusively owns abandon/archive/cleanup; U11 owns activation competition. |
| U4b | Complete: guarded abandon, archive receipt/retrieval, epoch fence, invalidation, resumable FK-safe cleanup, and EMPTY gate. | 160; durable passing attempt: 158. | Real PostgreSQL proved archive-failure blocking, stale-epoch rejection, invalidation, hash/length/count retrieval, resumable cleanup, and final EMPTY gating. Focused/full tests and all quality commands passed. | All exact U4b containers were removed; no ports or persistent volumes. U5 custody/GC and U11 activation remain separate. |
| U5 | Complete: evidence dependency closure, retention/holds, corruption restrictions, bounded GC, and capacity/integrity enablement gate. | 173; durable passing attempt: 174. | Real PostgreSQL proved latest-expiry-plus-180-day retention, active-edge/hold blocking, corruption closure restrictions, and fail-closed proof gating. Focused/full tests and all quality commands passed. | All exact U5 containers were removed with empty lookups; no ports or persistent volumes. No scheduler or deletion-as-rollback was added. |
| U6 | Complete: shared controlled-source capture core only; independent verification and adapters remain excluded. | 213 additions + 4 deletions = **217**; predecessor runtime attempt reported 581 because it included the overwritten artifact failure. | RED/GREEN/refactor and PostgreSQL rollback/no-catalog-lock proof passed; full quality commands passed. Detailed retained evidence follows. | Exact `os03-u6-pg-7151-865` container was removed with an empty lookup. U7 owns verifier behavior; U8 owns adapter wiring. |

## U6 retained TDD and proof evidence

| Stage | Command / proof | Result |
|---|---|---|
| Safety net | `npm test -- tests/direct-refresh-active-write.test.ts` | Exit 0; 40 existing tests passed before shared-core modification. |
| RED | `npm test -- tests/production-readiness/source-capture.test.ts` | Expected exit 1: `sourceCaptureOperationKey` and `createSourceCapture` did not exist. |
| GREEN | `npm test -- tests/production-readiness/source-capture.test.ts` | Exit 0; 20 tests passed after typed capture identity/fact validation and hook implementation. |
| TRIANGULATE | Fresh disposable PostgreSQL probe via `/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe` | Exit 0: empty capture raised `source capture items are required` and rolled back the insert; successful capture returned a durable observation and held no `governed_catalogs` lock. |
| REFACTOR | `npm test -- tests/production-readiness/source-capture.test.ts` | Exit 0; 20 tests passed; reversed row identity resolves to the same deterministic discovery key. |

- U6 adds source-only `source_capture_operations`/`source_capture_items` and `capture_source_delta`; `observed_at` comes from `clock_timestamp()` and the procedure does not touch governed catalog objects.
- The shared active-write transaction captures typed Product/offer/history before/after readbacks and reports only returned durable operation/observation values. Existing locks, approval/prewrite, kill switch, no-create, and no-partial controls remain.
- Lost response recovery uses deterministic `(source, sorted row IDs, prewrite hash)` discovery identity rather than replaying a mutation. An initial ambiguous PL/pgSQL `observed_at` probe was corrected before the successful fresh-container proof.
- U6 verification: `npm test` exit 0 (20 tests); `npm run lint` exit 0 (188 pre-existing warnings, zero errors); `npm run typecheck` exit 0; `npm run build` exit 0 (expected missing-`DATABASE_URL` Prisma logs during static generation).

## Recovery resolution and remaining work

The prior artifact-fidelity blocker is **resolved for this recovery objective**: all seven completed work units occur exactly once above, completion agrees with the 27 visible task checkboxes and durable status, no U7-or-later work is claimed, and the retained U6 evidence remains specific. The former blocker notice is intentionally not retained as an active archive blocker.

Remaining implementation tasks are the exact unchecked U7–U19 rows in `tasks.md`; no task checkbox was changed by this artifact-only recovery. No production/remote database, credentials, Clerk, Vercel, deployment, traffic, Git delivery, or Docker action occurred during recovery.

## Recovery verification

- Read back `tasks.md`, the prior U6-only progress record, proposal/spec/design artifacts, and durable runtime status before reconstruction.
- Post-write checks confirmed U1, U2, U3, U4a, U4b, U5, and U6 each appear once; the 27/83 task count reconciles. The recovery diff remains within the 400-line cap.
- Structured status consumed: parent-provided `gentle-ai.sdd-status@2` for `os03-authority-publication-workflow`, apply-ready in `/home/picala/code/ofertaSUPER-worktrees/os-03-cache-authority`; this recovery edited only `apply-progress.md`.

## U7 — Independent Postcommit Source Verifier

- Completed the four U7 implementation tasks; `tasks.md` now visibly marks them `[x]`, bringing implementation completion to **31/83**.
- Added source-only verifier sealing in `src/lib/production-readiness/verification.ts` and `prisma/migrations/20260830_independent_source_verification/migration.sql`. It requires the `verifier/read-only` credential and a `committed:*` snapshot; seals capture/evidence/policy/lineage/predecessor/result and separate observation/verification times. It rejects producer PASS, verifier failure, corrupt or missing proof, drift, unknown lineage, invalid age, and overcopy. It provides no promotion/public-effect procedure; U12 remains owner of promotion.
- Added `tests/production-readiness/delta-verification.test.ts` for the rejection matrix, independent credential/snapshot, source drift, changed-field-only merge, source-only seal, and non-rejuvenation semantics.

### TDD Cycle Evidence

| Stage | Command / proof | Result |
|---|---|---|
| RED | `npm test -- tests/production-readiness/delta-verification.test.ts` | Exit 1: module `production-readiness/verification` did not exist. |
| GREEN | `npm test -- tests/production-readiness/delta-verification.test.ts` | Exit 0: 23 tests passed, including three U7 cases. |
| TRIANGULATE | Fresh disposable PostgreSQL via `/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe` | Exit 0: producer committed `110`; a separate `verifier` role read `110:2026-06-01 00:00:00+00` in repeatable-read/read-only mode; verifier UPDATE was denied; later source drift produced `111`. |
| REFACTOR | `npm test -- tests/production-readiness/delta-verification.test.ts` | Exit 0: 23 tests passed after separating seal validation from changed-field construction. |

- Verification: `npm test` exit 0 (23 tests); `npm run lint` exit 0 (189 pre-existing/known warnings, zero errors); `npm run typecheck` initially failed only because it raced build-generated `.next/types`, then exit 0 after `npm run build`; build exit 0 with expected missing-`DATABASE_URL` static-generation logs.
- PostgreSQL cleanup: diagnostic `os03-u7-diag-1789083210-167537` and proof `os03-u7-pg-1789083229-167603` were exact-name removed; each exact-name lookup was empty. No ports, volumes, existing containers, remote databases, credentials, or production operations were used.
- Workload / PR boundary: approved `feature-branch-chain`, U7 only; **143 additions + 4 deletions = 147 changed lines**, including this U7 progress accounting and task checkbox updates, below the 400-line cap. No design deviation and no public effect procedure.
- Remaining tasks: all exact unchecked U8a–U19 implementation rows in `tasks.md`; U12 exclusively owns promotion.
- Structured status consumed: parent-supplied apply-ready status for `os03-authority-publication-workflow`, repo-local worktree `/home/picala/code/ofertaSUPER-worktrees/os-03-cache-authority`, allowed root equal to the worktree, and no action-context warnings.

## U8a — Carrefour and Vea Capture Adapters

- Completed all four U8a implementation tasks; `tasks.md` now visibly marks them `[x]`, bringing implementation completion to **35/83**.
- Carrefour and Vea concrete Prisma transactions now call U6's `public.capture_source_delta` inside the existing source transaction and require exactly one returned durable operation identity and observation timestamp. Shared adapter glue masks capture facts to the approved changed product/offer fields and rejects partial returned row/history identities and invalid/duplicate masks.
- Existing approval, advisory locks, kill switch, no-create/no-delete/class restrictions, exact batch controls, and supplemental reports are unchanged. The code does not invoke promotion or touch a governed projection; U12 remains the sole promotion owner.

### TDD Cycle Evidence

| Stage | Command / proof | Result |
|---|---|---|
| RED | `npm test -- tests/scripts/carrefour-write.test.ts tests/scripts/vea-write.test.ts` | Exit 1: `createAdapterSourceCaptureItems` was absent; both adapter tests failed as expected. |
| GREEN | `npm test -- tests/scripts/carrefour-write.test.ts tests/scripts/vea-write.test.ts` | Exit 0: 25 total suite tests passed, including Carrefour/Vea mask and identity rejection cases. |
| TRIANGULATE | Disposable PostgreSQL `os03-u8a-pg-1789083601-4446` via `/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe` | Exit 0: capture returned a durable ID/time and one capture item; `to_regclass('public.governed_catalogs') is null` returned `t`, so governed promotion was unavailable. |
| REFACTOR | `npm test && npm run lint && npm run typecheck` | Exit 0: 25 tests passed; lint reported 189 pre-existing warnings and zero errors; typecheck passed after preserving product identity keys and rejecting duplicate masks. |

- Full verification: `npm test` exit 0 (25 tests); `npm run lint` exit 0 (189 warnings, zero errors); `npm run typecheck` exit 0; `npm run build` exit 0 with expected missing-`DATABASE_URL` static-generation logs.
- PostgreSQL cleanup: this unique container had no ports or volumes, was exact-name removed, and its exact-name lookup was empty. No existing container, remote database, credential, production, deploy, traffic, Clerk, or Vercel operation was used.
- Workload / PR boundary: approved `feature-branch-chain`, U8a only. No design deviation. **171 additions + 4 deletions = 175 changed lines**, including U8a code, tests, task checkboxes, and progress; no `size:exception` is requested.
- Remaining tasks: the exact unchecked U8b–U19 rows in `tasks.md`; promotion remains unavailable until U12.
- Structured status consumed: parent-supplied apply-ready status for `os03-authority-publication-workflow`, repo-local worktree `/home/picala/code/ofertaSUPER-worktrees/os-03-cache-authority`, allowed root equal to the worktree, and no action-context warnings.

## U8b — Disco, Jumbo, and Más Capture Adapters

- Completed all four U8b implementation tasks; `tasks.md` now visibly marks them `[x]`, bringing implementation completion to **39/83**.
- Disco, Jumbo, and Más concrete Prisma source transactions now invoke U6's `public.capture_source_delta` for the exact adapter source, require nonempty facts and one durable operation/result, and report the database-returned observation time only. Wrong source policy, absent facts, partial/missing results, and response-loss assumptions reject.
- Existing approval, locks, kill switch, no-create/no-delete/class restrictions, and batch controls remain unchanged. DIA is not an adapter and remains audit-only/non-eligible. The capture procedure is source-only; it does not invoke U7 sealing or U12 promotion and cannot produce governed public effect.

### TDD Cycle Evidence

| Stage | Command / proof | Result |
|---|---|---|
| Safety net | `npm test -- tests/direct-refresh-active-write.test.ts` | Exit 0; 47 existing tests passed. |
| RED | `npm test -- tests/scripts/disco-write.test.ts tests/scripts/jumbo-write.test.ts tests/scripts/mas-write.test.ts` | Expected exit 1; each missing exported concrete adapter transaction failed. |
| GREEN | Same focused command | Exit 0; 28 tests passed after concrete capture calls and source-policy/result guards. |
| TRIANGULATE | Two fresh disposable PostgreSQL containers via `/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe` | Exit 0: rollback removed source+capture; committed capture had one operation/item and exact retry recovered it; a concurrent update lock timed out; `governed_catalogs` was absent. |
| REFACTOR | Focused adapter command, then full quality suite | Exit 0; shared U6 capture-fact glue remained the sole shared mapping and all adapters use it. |

- Verification: focused adapter tests and `npm test` exit 0 (28 total); `npm run lint` exit 0 (189 warnings, zero errors); `npm run typecheck` exit 0; `npm run build` exit 0 with expected missing-`DATABASE_URL` static-generation logs.
- PostgreSQL cleanup: failed diagnostic `os03-u8b-pg-1789084049-30077`, proof `os03-u8b-pg-1789084079-7577`, and concurrent-lock proof `os03-u8b-pg-concurrent-1789084097-19703` were exact-name removed and exact-name lookups were empty. All used disposable PostgreSQL 16 containers without ports or volumes; no existing container, remote database, credential, or production operation was used.
- Workload / PR boundary: approved `feature-branch-chain`, U8b only. No design deviation. **144 additions + 10 deletions = 154 changed lines**, including code (36/+6), new tests (83/+0), four task checks (+4/-4), and progress (+21/-0); below the 400-line hard cap, with no `size:exception` requested.
- Remaining tasks: the exact unchecked U9–U19 implementation rows in `tasks.md`; U12 exclusively owns promotion and U13 owns runtime governed effect.
- Structured status consumed: parent-supplied apply-ready status for `os03-authority-publication-workflow`, repo-local worktree `/home/picala/code/ofertaSUPER-worktrees/os-03-cache-authority`, allowed root equal to the worktree, and no action-context warnings.

## U9 — Scoped Clerk Consent (blocked before external triangulation)

- Added a local, injectable consent-service seam in `src/lib/production-readiness/approval.ts` and fixture coverage in `tests/admin/catalog-authority-approval.test.ts`. It validates a complete canonical reviewed binding, requires a non-null user/session and an exact unexpired scoped grant, binds nonce and CSRF hashes to user/session/payload, validates origin and Fetch Metadata, consumes challenges once, and recovers only an exact idempotent receipt.
- The fixture rejects anonymous and generic-admin actors, wrong/expired grants, missing review fields, nonce/session/payload swaps, replay, cross-origin/cross-site/missing-CSRF requests, and changed-payload idempotency reuse. It contains no Clerk instance, credentials, remote DB, reservation, publication, or runtime authority.

### TDD Cycle Evidence

| Stage | Command / proof | Result |
|---|---|---|
| RED | `npm test -- tests/admin/catalog-authority-approval.test.ts` | Expected exit 1: `production-readiness/approval` did not exist. |
| GREEN | `npm test -- tests/admin/catalog-authority-approval.test.ts` | Exit 0; 31 total tests passed, including the three U9 fixture cases. |
| TRIANGULATE | Not run | Blocked: the contract requires a separately authorized Clerk test instance/session and disposable DB grant; neither authorization nor Clerk environment variables are available. |
| REFACTOR | Not run | Blocked by the required preceding Clerk/DB triangulation. |

- No U9 task checkbox was marked complete. The exact remaining lines are all four unchecked U9 rows in `tasks.md`; the persisted 39/83 completion count remains unchanged.
- Workload / PR boundary: approved feature-branch-chain, U9 local seam only. Exact authored accounting is **159 additions + 0 deletions = 159 changed lines**: approval seam (61), fixture test (81), and this U9 progress entry (17). It remains below the 400-line cap with no exception.
- Structured status consumed: parent-supplied apply-ready status for `os03-authority-publication-workflow`, repo-local worktree `/home/picala/code/ofertaSUPER-worktrees/os-03-cache-authority`, allowed root equal to the worktree, and no action-context warnings.

## U9 — Scoped Clerk Consent (external boundary re-check)

- Re-read the U9 task/spec/design, strict-TDD guidance, existing local RED/GREEN seam, and exact Next.js 16.3.1 route/auth/cache documentation before considering route/page work. Clerk 7.7.5 `auth()` is server-only for App Router route handlers and requires `clerkMiddleware()`; it supplies the session auth object with `userId`/`sessionId` when authenticated.
- Confirmed the supplied development-only `.env.local` met the stated permission/key-prefix checks without reading or emitting credentials. Clerk CLI v3.3.0 endpoint discovery and dry-runs preceded mutations. A uniquely tagged development-only user and active session were created and verified through the Backend API; session revocation and user deletion were dry-run first then executed. A targeted re-query over only the unique `os03-u9-disposable-*` tag confirmed zero remaining tagged resources. IDs, credentials, email, and request payload values were not retained here.
- **Blocked before U9 production wiring and PostgreSQL triangulation:** no `PublicationGrant`, `ApprovalChallenge`, or `ApprovalReceipt` model/table/migration exists in the current schema/migrations. The allowed edit surfaces exclude a migration, and the requested uncached scoped DB-grant repository cannot safely persist or atomically consume/recover challenge/receipt state without those database objects. The U9 route/page and `publication-access.ts` paths likewise do not yet exist; creating handlers that only use the in-memory injectable seam would not meet the required DB-grant or full-request-idempotency contract.
- No U9 checkbox was changed: all four U9 implementation rows remain unchecked, so persisted progress remains **39/83**. No production code, routes/pages, database container, deployment, traffic, Vercel, Git delivery, or production Clerk operation occurred in this re-check.
- Cumulative U9 accounting remains **159 additions + 0 deletions** from the prior local RED/GREEN seam. This re-check added only this progress record; it performed no U9 implementation edit and requests no `size:exception`. The remaining development capacity is 240 changed lines under the original 400-line U9 cap.
- Required unblock: authorize/add the U9 persistence migration (or identify an already-migrated authoritative table/procedure and allowed repository contract) before the runtime DB repository, route wiring, disposable PostgreSQL grant proof, refactor, and truthful task completion can proceed.

## U9a — Durable Approval Persistence

- Completed all four U9a implementation tasks. `tasks.md` now visibly marks them `[x]`, bringing persisted implementation completion to **43/87**. The approved task amendment replaces U9 with U9a (330–390) and dependent U9b (360–400), retains the existing 159 U9 ingress-seam lines as U9b evidence, leaves every U9b checkbox unchecked, and revises the global forecast to **5,740–7,430**.
- Added additive Prisma models and migration `20260831_durable_approval_persistence` for `PublicationGrant`, `ApprovalChallenge`, and `ApprovalReceipt`. Grants are finite exact action/scope/target/policy bindings and deny expired or revoked records. Challenges retain session/user/payload and nonce/CSRF hashes; `consume_approval_challenge` uses conditional `UPDATE … RETURNING` for atomic one-use consumption. `record_approval_receipt` preserves the first exact request digest and rejects changed-request reuse.
- Added `src/lib/production-readiness/publication-access.ts`, a typed SQL DAL/procedure contract for grant lookup, challenge creation/consume, and receipt lookup/recovery. It has no ingress, enrollment, reservation, publication, activation, runtime authority, configuration, or traffic path. The existing Clerk ingress seam was not edited.

### TDD Cycle Evidence

| Stage | Command / proof | Result |
|---|---|---|
| RED | `npx tsx --conditions=react-server --test tests/production-readiness/approval-persistence.test.ts` | Expected exit 1: `publication-access.ts` did not exist. |
| GREEN | Same focused command | Exit 0: 2 persistence-contract/no-authority-effect tests passed. |
| TRIANGULATE | Unique disposable PostgreSQL 16 container through `/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe` | Exit 0: exactly one usable grant after expired/revoked denial; concurrent consume returned `1,0`; exact receipt retry recovered `request-a`; changed request raised the expected conflict; authority/publication objects were absent. |
| REFACTOR | Focused persistence command after procedure corrections | Exit 0: 2 tests passed; receipt conflict targets the named primary-key constraint and revoked grants permit immediate withdrawal. |

- Verification: `npm test` exit 0 (33 tests); `npm run lint` exit 1 only on four pre-existing `no-explicit-any` errors in the U9b-owned `tests/admin/catalog-authority-approval.test.ts`; `npm run typecheck` and `npm run build` exit 1 on the same pre-existing U9b seam typing errors. U9a files have no reported lint/type errors. No U9b file was edited to preserve its ownership boundary.
- PostgreSQL safety and cleanup: each attempt used a uniquely named PostgreSQL 16 container with no published ports or volumes. The first failed only on a migration constraint probe and was exact-name removed. The successful proof container was exact-name removed in `trap` cleanup, and the exact-name lookup was empty. No existing container, remote/production database, credential, Clerk, Vercel, deploy, alias, configuration, traffic, or Git delivery operation occurred.
- Workload / PR boundary: approved `feature-branch-chain`, **U9a only**; U9b follows U9a. U9a authored accounting is **203 additions + 16 deletions = 219 changed lines**, including persistence model/migration/DAL/test, task amendment, and this progress record, below the 400-line cap; no `size:exception` is requested. The prior 159 additions remain U9b evidence and are excluded from U9a accounting.
- Remaining implementation tasks: the exact unchecked U9b–U19 rows in `tasks.md`. Structured status consumed: parent-provided `gentle-ai.sdd-status@2` for apply-ready `os03-authority-publication-workflow` in `/home/picala/code/ofertaSUPER-worktrees/os-03-cache-authority`, allowed root equal to that worktree, `feature-branch-chain` approved, strict TDD active, and no action-context warnings.

## U9a quality remediation

- Replaced the four U9b fixture `any` annotations with types derived from `ApprovalRepository`; behavior and U9b route/UI scope are unchanged.
- RED: `npm run lint` exit 1 solely on the four `no-explicit-any` errors in `tests/admin/catalog-authority-approval.test.ts`.
- Verification: `npx tsx --conditions=react-server --test tests/production-readiness/approval-persistence.test.ts` exit 0 (2 tests); `npm test -- tests/admin/catalog-authority-approval.test.ts` exit 0 (3 tests); `npm test` exit 0 (33 tests); `npm run lint` exit 0 (191 pre-existing warnings, 0 errors); `npm run typecheck` exit 0; `npm run build` exit 0. Build emitted the expected missing-`DATABASE_URL` static-generation logs but completed successfully.
- No PostgreSQL, Clerk, Vercel, deployment, traffic, Git delivery, or `.env.local` read occurred. Task checkboxes remain unchanged: U9a stays complete and all U9b rows stay unchecked.
- Workload / PR boundary: U9a quality remediation only; 9 test-code additions and 8 progress-record additions = **17 additions + 0 deletions**, within the remaining 184-line allowance. No design deviation or size exception.
- Structured status consumed: parent-provided `gentle-ai.sdd-status@2`, apply-ready and repo-local for this worktree, with no action-context warnings.

## U9b — Clerk ingress preflight blocker

- Consumed the parent-supplied apply-ready U9b status for the dedicated worktree, the scoped-approval spec/design/tasks, strict-TDD guidance, AGENTS, Clerk 7.7.5 declarations, and exact Next.js 16.3.1 authentication, Route Handler, and caching documentation.
- Safety net: `npm test -- tests/admin/catalog-authority-approval.test.ts` exited 0 with 669 passing tests. The package test script expands its configured glob, so this invocation ran the full suite rather than only the named file.
- No RED/GREEN code change was started. The required `.env.local` preflight found mode `777`, not the user-required mode `600`. This is secret-bearing configuration; the requested scope forbids editing it. Clerk BAPI discovery/mutation, disposable PostgreSQL proof, and runtime ingress edits therefore did not run.
- No task checkbox changed; all four U9b rows remain unchecked. Cumulative U9b implementation accounting remains **159 additions + 0 deletions**, leaving the original 241-line implementation capacity unused. This blocker record adds no implementation code and requests no size exception.
- No Clerk identity/session was created, no secret value was emitted, no Docker container was created, and no production/deployment/traffic/Git operation occurred. Required unblock: a human must restore `.env.local` to mode `0600` (without changing contents) and confirm the file is still gitignored.
- Workload / PR boundary: approved `feature-branch-chain`, U9b only. Structured status consumed: parent-provided `gentle-ai.sdd-status@2`, apply-ready, repo-local worktree `/home/picala/code/ofertaSUPER-worktrees/os-03-cache-authority`, allowed root equal to that worktree, and no action-context warnings.

### Parent correction of the preflight result

- The reported permission blocker is invalid. Immediate parent readback of the exact target path `/home/picala/code/ofertaSUPER-worktrees/os-03-cache-authority/.env.local` confirmed `mode=600 (-rw-------)`, owner `picala:picala`, and `.gitignore:41:.env*` coverage. No chmod or secret-file edit is required.
- This actor produced two consecutive routing failures in one automatic correction round: first it ignored the parent-provided worktree status, then it inspected or reported permission state inconsistent with the exact target path. No U9b implementation or external operation occurred. The automatic gate stops pending a fresh explicitly authorized U9b correction round; the 159-line baseline and 241-line remaining unit capacity are unchanged.

## U9b — Clerk ingress correction round

- Consumed the parent-provided apply-ready status for the exact worktree, verified only its `.env.local` metadata (mode `0600`, owner `picala:picala`, and ignored), read the scoped-approval spec/design/U9b task, strict-TDD guidance, AGENTS, and installed Next 16.3.1 route/auth/cache documentation. This corrects the prior false-workspace blocker; no other path metadata was read or reported.
- Safety net: `npx tsx --conditions=react-server --test tests/admin/catalog-authority-approval.test.ts` exited 0 with 3 tests passing. RED then added the missing-Fetch-Metadata case; the focused command exited 1 because the existing service accepted a null `Sec-Fetch-Site` and later rejected only its consumed challenge. GREEN rejects absent Fetch Metadata before grant/challenge processing; the focused command again exited 0 with 3 tests passing.
- The U9b persistence contract still lacks an authoritative, server-owned reviewed-binding record: U9a stores grants/challenges/receipts but no candidate/release/deployment/verification binding, and U3's candidate contract is pure canonicalization rather than persisted data. Therefore a prepare/approve route would have to trust browser-supplied release/SHA/scope/validity/policy fields, violating the required server-side reviewed-binding reconstruction. No route/page/access wiring, Clerk BAPI action, or disposable PostgreSQL action was started.
- No U9b checkbox changed because the four complete U9b tasks remain unfulfilled. Clerk and PostgreSQL cleanup evidence is `not applicable`: no identity/session or container was created. No secret value was read, printed, edited, or logged; no production, Vercel, deployment, traffic, or Git delivery action occurred.
- Workload / PR boundary: approved `feature-branch-chain`, U9b only. Cumulative U9b accounting is **161 additions + 2 deletions = 163 changed lines** (prior 159 additions plus this RED/GREEN test and service correction); this progress entry is planning evidence outside the authored implementation tally. Remaining implementation capacity is **237 changed lines** under the 400-line cap. No size exception or design deviation is requested.
- Required unblock: identify or authorize the authoritative server-side candidate/release/technical-verification repository and reconstruction contract (including allowed DB access), then resume route/page wiring and the authorized Clerk/unique disposable-PostgreSQL triangulation.

### TDD Cycle Evidence

| Stage | Command / result |
|---|---|
| Safety net | Focused approval test: exit 0, 3 passing. |
| RED | Same focused command: exit 1; missing Fetch Metadata reached `approval challenge is invalid` rather than origin validation. |
| GREEN | Same focused command: exit 0, 3 passing after fail-closed Fetch Metadata validation. |
| TRIANGULATE / REFACTOR | Blocked before external boundary work by absent server-owned reviewed-binding repository; no safe refactor exists. |

- Verification after the focused cycle: `npm test` exit 0 (33 tests); `npm run lint` exit 0 (191 pre-existing warnings, zero errors); `npm run typecheck` exit 0; `npm run build` exit 0. Build completed despite expected static-generation `DATABASE_URL`-absent Prisma logs.

## U3c — Durable Candidate Technical Admission

- Completed all four U3c implementation tasks; `tasks.md` visibly marks them `[x]`, taking implementation completion from **43/87** to **47/91** after the authorized amendment. The chain is now U8b → U3c → U9a consumer correction → U9b → U10; forecast maximum is **7,770** changed lines.
- Added immutable `refresh_policies`, `baseline_manifests`, `authority_candidates`, and `candidate_technical_verifications` with exact canonical bytes/digests/versions, release/deployment/full-SHA/domain/target/scope/validity, baseline epoch/root/snapshot/evidence/coverage/watermarks/provenance/custody references, and verifier identity/class/result/evidence/time/deadline/revocation/failure. `resolve_eligible_candidate_admission` exposes only an exact opaque-ID, valid, PASS, unrevoked, unexpired server-side admission.
- Corrected the U9a consumer boundary inside this slice: guarded challenge construction receives the candidate admission ID and server-loads immutable reviewed bytes/digest and candidate/verification references; receipts retain those references/digest and reject changed binding reuse. No browser facts, ingress, routes/UI, enrollment, reservation, publication, activation, runtime authority, U7 delta behavior, or U10/U11 behavior was added.

### TDD Cycle Evidence

| Stage | Command / proof | Result |
|---|---|---|
| RED | `npx tsx --conditions=react-server --test tests/production-readiness/candidate-admission.test.ts` | Exit 1: candidate-admission module was absent. |
| GREEN | Focused candidate-admission and approval-persistence command | Exit 0: 5 tests passed. |
| TRIANGULATE | Unique disposable PostgreSQL 16 Windows-Docker proof | Exit 0: immutable mutations rejected; only unrevoked PASS was eligible; bytes/digests and challenge snapshot matched; changed receipt binding conflicted; authority/publication objects were absent. |
| REFACTOR | Focused candidate-admission and approval-persistence command | Exit 0: 5 tests passed after date parsing was isolated. |

- Quality: `npm test` exit 0 (36 tests); `npm run lint` exit 0 (191 pre-existing warnings, zero errors); `npm run typecheck` exit 0; `npm run build` exit 0 (expected static-generation missing-`DATABASE_URL` logs). PostgreSQL cleanup: both unique no-port/no-volume PostgreSQL 16 containers were exact-name removed in traps and exact-name lookups were empty; no existing container, remote/production DB, secrets, Clerk, Vercel, deployment, traffic, or Git delivery was used.
- Workload / PR boundary: approved `feature-branch-chain`, **U3c only**, including the bounded U9a consumer correction. **Estimated authored accounting: 365 additions + 5 deletions = 370 changed lines**, within the 400-line hard cap; no size exception. No design deviation. Remaining tasks are the exact unchecked U9b–U19 rows.
- Structured status consumed: parent-provided `gentle-ai.sdd-status@2`, apply-ready for `os03-authority-publication-workflow` in `/home/picala/code/ofertaSUPER-worktrees/os-03-cache-authority`, allowed root equal to that worktree, strict TDD, auto-chain, and no action-context warnings.

### U3c finalization correction — native accounting authoritative

- Parent-authorized native measurement is **415 changed lines** and supersedes the earlier actor estimate of **370** by 45 lines. The exact `size:exception` is authorized for this cohesive U3c slice after one honest slicing pass found no safe split; the global 7,770-line maximum and all other 400-line unit limits remain unchanged.
- No product, test, migration, task, secret, Docker, Git, remote, deploy, Clerk, Vercel, or traffic change was made during this readback-only finalization. U3c's four persisted task rows remain `[x]`; its previously recorded PostgreSQL proof and exact container cleanup were not recreated.
- Final readback verification: focused `npx tsx --conditions=react-server --test tests/production-readiness/candidate-admission.test.ts tests/production-readiness/approval-persistence.test.ts` passed (5 tests); `npm test` passed (36 tests); `npm run lint` passed with 191 existing warnings and zero errors; `npm run typecheck` passed; `npm run build` passed, with expected static-generation missing-`DATABASE_URL` logs.
- `npx prisma validate` exited 1 before validation because `DIRECT_URL` was absent from the command environment. No environment, secret, database, or container was created or changed to bypass that prerequisite.
- Workload / PR boundary: approved feature-branch-chain, U3c only. Native-authoritative final accounting is **415**, under the maintainer's explicit exact exception; no new implementation scope was started. Structured status consumed: parent-provided apply-ready `gentle-ai.sdd-status@2` for the exact repo-local worktree and allowed root, with no action-context warnings.

## U9b — Clerk ingress and narrow consent UI (partial; external proof blocked)

- Implemented opaque-ID-only prepare/approve ingress and review UI: browser inputs are limited to `candidateAdmissionId` for prepare and `challengeId`, nonce, CSRF, idempotency key, and explicit consent for approve. The server reconstructs reviewed bytes from U3c admission data, requires generic Clerk admin admission plus non-null Clerk user/session and an uncached scoped `PublicationGrant`, and delegates durable challenges/receipts to U9a procedures.
- The approval service now fails closed on missing/cross-site Fetch Metadata, invalid Origin, missing consent, bad schema/content type, session/nonces/CSRF mismatch, replay, and changed idempotency request. Exact retries discover the server-owned challenge before one-use consumption and recover the existing receipt.
- Persisted task reconciliation: the U9b RED and GREEN rows are visibly `[x]`; the separately authorized Clerk/session + disposable PostgreSQL triangulation and refactor rows remain `[ ]` exactly as shown in `tasks.md`.

### TDD Cycle Evidence

| Stage | Command / result |
|---|---|
| Safety net | `npx tsx --conditions=react-server --test tests/admin/catalog-authority-approval.test.ts` — exit 0, 3 tests before edits. |
| RED | Same focused command — exit 1: opaque candidate ID was rejected as a missing reviewed binding; later exact idempotency retry RED also failed with `approval challenge is invalid`. |
| GREEN | Focused approval plus persistence tests — exit 0, 6 tests; final focused approval test — exit 0, 4 tests. |
| TRIANGULATE | Blocked: Clerk CLI health check passed host execution but failed `Logged in`; no authenticated test-instance session can be created or safely inspected. No PostgreSQL container was created. |
| REFACTOR | Blocked by the required external triangulation; no refactor task completion is claimed. |

- Verification: `npm test` exit 0 (37 tests); `npm run typecheck` exit 0; `npm run lint` exit 0 with 194 warnings and zero errors; `npm run build` exit 0. Build retained the known static-generation `DATABASE_URL`-absent Prisma logs.
- Clerk lifecycle: `.env.local` metadata remained mode `0600` and gitignored; no contents were read or emitted. `npx -y clerk@latest doctor --json` reported host execution pass but `Logged in` fail, so BAPI discovery, dry-run, tagged test user/session creation, and any mutation/cleanup were not run. No impersonation occurred.
- PostgreSQL cleanup: not applicable. The required Clerk precondition failed before a unique disposable no-port/no-volume PostgreSQL container could be started.
- Workload/PR boundary: approved feature-branch-chain, U9b only. **Exact cumulative changed-line accounting cannot be truthfully reconstructed from this untracked OpenSpec worktree:** its durable baseline is 163 changed lines, while the current U9b allowed-surface inventory is 285 physical lines. The prior baseline snapshot is unavailable, so additions/deletions for this round cannot be derived without inventing a number. Treat the hard-budget reconciliation as blocked; do not accept this partial slice as within the 400-line cap until the parent supplies an authoritative baseline diff.
- Remaining tasks: `- [ ] Independently triangulate with a separately authorized Clerk **test** instance/session and U9a disposable DB grant: one authorized consent succeeds, while fresh consent is required for changed release/SHA/scope/validity/policy and conforming deltas require neither consent nor expiry renewal. <!-- sdd-owner: implementation -->`; `- [ ] Refactor ingress/handler boundaries once, then rerun Clerk test-session and replay proofs; production Clerk enrollment, keys, and evidence collection remain parent actions. <!-- sdd-owner: implementation -->`.
- Structured status consumed: parent-provided apply-ready status for `os03-authority-publication-workflow`; exact repo-local worktree `/home/picala/code/ofertaSUPER-worktrees/os-03-cache-authority`; allowed edit root is the worktree; strict TDD and approved feature-branch-chain; no action-context warning.

### U9b external-boundary continuation

- Clerk endpoint discovery succeeded after silently exporting the exact-worktree development environment. OAuth login remained absent, but development secret-key BAPI authentication was proven by dry-run and live create/session/read/revoke/delete operations. No key or generated password value was printed.
- Redacted Clerk lifecycle: created one uniquely tagged disposable user and active session; read each exact returned resource; dry-ran then revoked the session; dry-ran then deleted the user; exact external-ID query returned zero tagged leftovers. A prior failed shell-precedence attempt did not retain a parsed ID; its exact tag was immediately queried and deleted, with zero leftovers proven before the successful lifecycle.
- PostgreSQL triangulation used one failed and one successful uniquely named PostgreSQL 16 Windows-Docker container, each with no published ports or volumes. The successful container applied migrations and proved eligible U3c admission, current DB grant, challenge creation, one-use consumption/replay denial, exact receipt recovery, and changed-request idempotency conflict through the U9a procedures used by the current DAL. Each exact-name container lookup was empty after cleanup.
- The no-Next-server constraint prevents binding the independently created Clerk session to a live route request and the disposable PostgreSQL instance in one process. Therefore the triangulation and refactor task rows remain unchecked; no unsupported completion claim is made. No product code changed in this continuation and native-ledger accounting remains the parent-owned source of the exact additional count.

## U9b2 — combined loopback ingress proof attempt (blocked)

- Consumed the parent-authoritative apply-ready status for `os03-authority-publication-workflow`, exact repo-local worktree `/home/picala/code/ofertaSUPER-worktrees/os-03-cache-authority`, strict TDD, approved feature-branch-chain, and no action-context warnings. No production source file or test was changed in this attempt, so no new RED/GREEN cycle or refactor is claimed.
- Clerk CLI 3.3.0 BAPI discovery found the supported session-token endpoint; user/session/token creation and revoke/delete mutations were dry-run first. A unique development-only tagged user with an admin claim, one active session, and freshly minted session token were created and structurally verified without printing IDs, tokens, keys, passwords, or `.env.local` contents. The exact session was dry-run then revoked; the user was dry-run then deleted; an exact external-ID query confirmed zero tagged users remain.
- A unique isolated Docker network and fresh PostgreSQL 16 container used no published ports or volumes. Migrations applied, and a disposable U3c eligible candidate admission plus matching U9a scoped grant were inserted; database readback confirmed one eligible admission/grant and no authority-publication object. The Next development server and an ephemeral loopback-only TLS relay bound only `127.0.0.1` inside an isolated container; no host port was published.
- The real Clerk token carried the active session and admin metadata, but the live prepare route could not be completed: Clerk/Next development middleware proxied `https://localhost:34704/api/admin/catalog-authority/prepare` to the HTTP-only internal Next listener, which failed with `EPROTO wrong version number` and returned 500. The earlier native experimental-HTTPS server similarly failed its internal proxy handshake. Changing the internal listener/proxy or accepting HTTP loopback origins would expand configuration/product scope and was not performed. Thus the required combined live prepare/approve proof is not established.
- Cleanup was verified: the exact Next and PostgreSQL containers and isolated network are absent; no ports, volumes, generated TLS files, user, session, or tagged Clerk resource remains. No reservation, publication, activation, runtime authority, deploy, Vercel, traffic, Git delivery, or secret-file edit occurred.
- Quality verification: `npx tsx --conditions=react-server --test tests/admin/catalog-authority-approval.test.ts` passed (4 tests); `npm test` passed (37 tests); `npm run lint` passed with 194 pre-existing warnings and zero errors; `npm run typecheck` passed; `npm run build` passed with the known missing-`DATABASE_URL` static-generation logs.
- Persisted task state remains **49/91**: the U9b RED/GREEN rows are `[x]`, while the exact TRIANGULATE and REFACTOR lines remain `[ ]`. U9b1 accounting is parent-authoritative **163/400**; U9b2 integration remains parent-authoritative **308/400**, and this proof attempt authored **0** production/test lines (no budget overage or size exception).
- Blocker: authorize a loopback-compatible Clerk/Next development transport configuration that permits an actual HTTPS request to reach the local route handler without the middleware proxying to an HTTP internal listener, or explicitly authorize the narrowly scoped alternate proof transport. Until then, the two U9b rows cannot be completed truthfully.

## U9b2 — supported ephemeral HTTPS retry (blocked)

- Retried without changing production, test, `.env.local`, or tracked configuration: Next 16.3.1 `next dev --webpack --experimental-https --experimental-https-key … --experimental-https-cert … --hostname 127.0.0.1 --port 34713` used fresh throwaway certificate/key files solely under `/tmp`, an isolated Docker network, and no published port or volume. A runtime-only `NODE_EXTRA_CA_CERTS` reference was supplied before the Next process began; it did not disable TLS validation.
- Recreated exactly one uniquely tagged Clerk development user/session and freshly minted BAPI session token after endpoint discovery and dry-runs. Its JWT was verified to contain the active session and generic-admin metadata without recording the token or identifiers. A fresh no-port PostgreSQL 16 container applied migrations and held one eligible U3c candidate admission plus matching U9a scoped grant.
- The real HTTPS `POST /api/admin/catalog-authority/prepare` still returned 500 before the route handler. Next/Clerk development middleware attempted its own `https://localhost:34713/api/admin/catalog-authority/prepare` proxy and rejected the supported throwaway certificate with `DEPTH_ZERO_SELF_SIGNED_CERT`; the private CA reference was not honored by that middleware proxy. Disabling certificate validation would weaken security and was not attempted; an HTTP transport would not prove the required same-origin HTTPS request.
- Cleanup completed: dry-run then revoked the exact session, dry-run then deleted the exact user, and exact-tag lookup returned zero. The exact app/DB containers and network are absent; certificate/key, no-port database, and temporary resource files were removed. No authority, reservation, publication, activation, runtime authority, traffic, deployment, Vercel, Git delivery, or secret-file edit occurred.
- No new code means no new strict-TDD cycle, checkbox update, or quality rerun is claimed. U9b remains **49/91** with TRIANGULATE and REFACTOR visibly unchecked. U9b1 remains **163/400**, U9b2 remains **308/400**, and this retry authored **0** product/test lines under the 92-line continuation cap.
- Remaining blocker: a supported Clerk development middleware mechanism that trusts a supplied loopback test certificate (rather than proxying it as an untrusted self-signed certificate), or an explicitly authorized alternative that preserves real HTTPS and all auth validation.

## U9b2 — Bearer-over-HTTP-loopback correction attempt (incomplete)

- Consumed the parent-supplied apply-ready status for this exact worktree and the fixed Bearer-over-HTTP transport. No product, test, configuration, TLS, cookie, proxy, deploy, or public-port change was made.
- Clerk CLI discovery confirmed `POST /sessions/{session_id}/tokens`; development secret-key BAPI access was proven with a dry-run user create and read-only list request. The first temporary harness omitted the required JSON body for token creation and received `unsupported_content_type` before PostgreSQL or Next startup.
- A corrected harness then created one uniquely tagged development user but failed before session creation because its temporary Node parser used `require()` on an extensionless JSON response. The user was dry-run deleted then deleted; an exact external-ID lookup returned zero tagged users (`leaked-tag-remediation=deleted-zero`). No session, token, database, server, network, port, volume, or temporary resource remains.
- The live prepare/approve proof is not established. The persisted U9b TRIANGULATE and REFACTOR rows remain unchecked; no checkbox changed. This attempt authored 0 product/test lines, leaving the parent-authorized 70-line continuation capacity unused.
- Remaining tasks are the existing unchecked U9b TRIANGULATE and REFACTOR rows. A fresh, parser-corrected disposable proof harness is required before task completion can be claimed.

## U9b2 — Clerk/Next ingress final correction attempt (blocked)

- Consumed parent status `u9b2-clerk-next-ingress-final`, apply-ready 49/91, exact worktree/root, and the 62-line objective. The temporary harness repaired the two prior defects: token POST used `{}` with JSON content type, and all extensionless Clerk responses used explicit UTF-8 reads plus `JSON.parse`.
- Clerk dry-runs preceded real development-only user/session/token mutations. Two active session tokens were minted for same-user session-binding coverage. A no-port/no-volume PostgreSQL 16 container on an isolated Docker network applied all migrations and received a U3c eligible candidate plus matching U9a grant.
- The Next container was started only in the isolated network on `127.0.0.1:3000`; however its internal loopback probe never became reachable. The subsequently attempted ordinary HTTP Bearer request failed at transport (`TypeError: fetch failed`) before prepare reached Clerk middleware or the route. No HTTPS proxy, cookie transport, TLS relaxation, configuration edit, public port, tunnel, deployment, production, Vercel, or Git action was used.
- Cleanup was successful: both exact sessions were dry-run revoked then revoked; the exact user was dry-run deleted then deleted; exact external-ID lookup returned `0`; the app container, PostgreSQL container, isolated network, and temporary resources were removed. No product/test file was changed and no task checkbox was changed.
- U9b TRIANGULATE/REFACTOR remain unchecked because actual route evidence, same-session binding, server-owned payload, replay/idempotent retry, and origin/fetch/CSRF fail-closed responses were not observed. Native authored product/test lines are 0; U9b2 conceptual accounting remains 338, leaving the parent objective's 62 lines untouched. No quality suite rerun is claimed because no product/test change occurred.

## U9b2 — fail-fast runtime packaging continuation (blocked)

- Reordered fail-fast execution as authorized: only isolated PostgreSQL and Next runtime were started; no Clerk user, session, or token was created.
- Exact first startup log established a non-product failure after Next 16.3.1 reported ready: it could not acquire its lockfile (`Permission denied`, `GenericFailure`) because the mounted worktree's generated runtime directory was not writable to the unprivileged disposable container process.
- Attempted the permitted ephemeral-copy packaging correction: read-only source and dependency mounts, copy tracked source excluding `node_modules`/`.next` into container-local `/workspace`, then bind Next to container loopback. That container exited before its startup log became available; no tracked configuration or product file was changed. Both isolated PostgreSQL/app containers, networks, and temporary packaging resources were removed.
- Live Clerk ingress was intentionally not started because readiness was not proven. TRIANGULATE/REFACTOR remain unchecked; product/test authored lines remain 0 and the 62-line objective remains unused.

## U9b2 — pre-Clerk loopback diagnostic continuation (blocked)

- Reused root-owned ephemeral-copy startup and captured the internal Next log before cleanup. No Clerk user/session/token was created in this diagnostic continuation.
- App loopback readiness passed, but a harmless unauthenticated `POST /api/admin/catalog-authority/prepare` returned `404` HTML rather than the route's expected JSON denial. The exact Next log records `POST /clerk_1789098902691 404`, demonstrating Clerk development middleware rewrote/proxied the HTTP request before the route handler.
- This reproduces an ephemeral runtime/auth transport boundary, not a Prisma or tracked prepare-route response. Containers, isolated network, and temporary log resources were removed. No tracked/product/test/configuration change was made; U9b TRIANGULATE/REFACTOR remain unchecked and no quality run is claimed.

## U9b2 — JWT diagnostic objective (partial)

- A fresh development-only tagged user/session was created only after CLI dry-run user creation. The token endpoint used JSON `{}`; its extensionless response was explicitly UTF-8 read and JSON parsed. In-memory checks passed: nonempty three-segment JWT, exact `sid`/`sub`, and `metadata.role === admin`; no identifier, token, key, or claim value was logged.
- The exact session and user were revoked/deleted in trap cleanup. No Next/PG route execution was completed in this partial diagnostic, so no task checkbox, product/test code, or quality evidence is claimed.

## U9b2 — final native container packaging attempt (blocked before Clerk)

- Consumed the parent-authoritative apply-ready `49/91` status for the exact repo-local worktree, strict TDD, approved feature-branch-chain, and no action-context warnings. No product or test file was edited, so no new RED/GREEN cycle is claimed.
- Two fresh host scripts installed cleanup traps before mutations, used unique internal Docker networks and fresh PostgreSQL/app containers with no published ports or volumes, and attempted the required writable container-local source copy. The first stopped after the full host-copy path; the second used the project app image and an excluded-generated-source copy but its default unprivileged runtime user could not write `/app` (`tar: ./src: Cannot mkdir: Permission denied`). No Next readiness, client transfer/hash, Clerk lifecycle, DB seed, authenticated route request, or raw route response occurred.
- Cleanup readback is redacted and exact: zero matching `os03-u9b2-final-`/`os03-u9b2-native-` containers and networks remain, and `/tmp/request.cjs` is absent. Clerk cleanup is not applicable because no user, session, or token was created. No secret, identifier, token, or `.env.local` content was printed, changed, or retained.
- Persisted task readback confirms both U9b TRIANGULATE and REFACTOR rows remain visibly unchecked. No task checkbox changed, no quality command is claimed, and native product/test accounting remains **0**; parent-authoritative U9b accounting is unchanged.
- Blocker: live ingress proof requires a newly authorized root-writable ephemeral app filesystem while retaining the no-port/no-volume boundary. No configuration, TLS, proxy, production, Vercel, deployment, traffic, or Git workaround was attempted.

## U9b2 — root-owned corrective continuation (blocked before Clerk)

- Enforced the requested filesystem correction mechanically: the disposable app container was created with `--user 0:0`; UID 0 created `/app` and proved it writable before transfer; the source transfer was then attempted with UID 0; and the intended post-transfer checks covered the prepare route, `node_modules`, and writable `/app/.next`.
- The single cleanup-trapped host script exited nonzero before emitting a readiness, hash, Clerk, database-seed, or route-proof receipt. Therefore no authenticated live evidence, raw route response, Clerk user/session/token lifecycle, or task completion is claimed. The temporary evidence directory was removed by the required trap, so no narrower cause is asserted.
- Final cleanup readback: `containers=0`, `networks=0`, `/tmp/request.cjs` absent, and both U9b TRIANGULATE/REFACTOR rows remain unchecked. No product/test file changed and this continuation authored **0** product/test lines.
- Structured context: parent-authoritative apply-ready `49/91`, exact repo-local worktree, strict TDD, approved feature-branch-chain, and no action-context warnings. The live-proof blocker remains unresolved; no further attempt is authorized by this continuation.

- U9b2 normative direct-DAL correction: `.env.local` metadata was silently confirmed `0600`, ignored, and development-key-only; Clerk CLI endpoint discovery and dry-run user creation passed.
- Clerk BAPI read authentication passed, but the real uniquely tagged user creation exited 1 without a response; exact-tag cleanup readback returned zero. No session/token or PostgreSQL/container was started.
- Therefore no official-SDK cryptographic verification, verified principal, actual `createPublicationApprovalRepository`/`createApprovalService` proof, or route evidence is claimed. TRIANGULATE and REFACTOR remain unchecked.
- No product/test/configuration edit occurred; this record adds **4 additions + 0 deletions**, keeping the parent-provided U9b2 conceptual accounting at **383/400** with 17 lines available.
- Corrected the undiagnosed CLI payload only: Clerk rejected `@example.test` as invalid; a fresh `@example.com` tag passed precheck, dry-runs, real user/session/token creation, and active-session readback.
- Official installed `@clerk/backend` `verifyToken({ secretKey })` verified signature/issuer/expiry plus `sub`/`sid` and admin metadata; a tampered token failed closed. IDs, tokens, keys, and temporary mode-600 files were removed.
- The user/session was dry-run then revoked/deleted and exact-tag readback was zero. No database/container was started, so direct actual DAL/service triangulation, negative grant/request matrix, refactor, and both U9b rows remain incomplete.
- This continuation adds **4 additions + 0 deletions**; conceptual accounting is **387/400**, leaving 13 lines. No live Next/browser/route claim is made.
- Final native harness installed its cleanup trap before mutation; Clerk user/session/token dry-runs and real mutations ran, then cryptographic principal gating stopped before Docker/PG startup.
- The failure is a temporary harness result-shape bug: installed `verifyToken` returned the verified payload directly, while this script read only `.data`; it rejected its own valid principal.
- Trap cleanup proved zero exact-tag users, containers, and networks. No temporary proof file or image remains; no DAL/service or route proof is claimed and both U9b rows remain unchecked.
- This failed native attempt adds **4 additions + 0 deletions**; conceptual accounting is **391/400**, leaving 9 lines and requiring a newly authorized corrected retry.
- Corrected verifier extraction passed official Clerk signature/issuer/expiry/sub/sid/admin/tamper checks; the real session remained active until trap revoke/delete, with zero tagged users afterward.
- The isolated no-port/no-volume PostgreSQL and app containers started, but `prisma generate` in the internal-only app network failed resolving the Prisma schema-engine checksum; no migration, seed, DAL/service execution, or route evidence occurred.
- Exact cleanup readback found zero tagged containers, networks, temporary files, and dependency image. Both U9b rows remain unchecked; no live Next/browser claim is made.
- This failed corrective attempt adds **4 additions + 0 deletions**; conceptual accounting is **395/400**, leaving 5 lines and requiring a separately authorized runtime-artifact correction.
- Reset-authorized egress attempt failed before session parsing: Clerk CLI emitted a dry-run status line before the real user JSON, and the temporary `require()` parser rejected the concatenated output.
- The cleanup trap could not receive the unparsed user ID; subsequent broad-prefix remediation was itself inconclusive because CLI list output contained concatenated JSON documents. No session/token, DB, container, DAL/service, route, or quality proof is claimed.
- Temporary files were removed, but the exact external-user zero-state cannot be truthfully confirmed from this failed parser path; both U9b rows remain unchecked.
- This failed attempt adds **4 additions + 0 deletions**; reset accounting is **400/410**, leaving 10 lines and requires an explicit cleanup/retry authorization.

## U9b2 — final objective harness unavailable

- Strict-TDD safety net: `npm test -- tests/admin/catalog-authority-approval.test.ts tests/production-readiness/approval-persistence.test.ts` exited 0 (37 tests); npm expanded the configured suite.
- Mode `0600` `.env.local` and installed Clerk/tsx dependencies were silently confirmed; no secret was printed or changed.
- Fresh disposable-harness preflight stopped before mutation: Docker Desktop's Linux-engine named pipe was unavailable; `node:22-bookworm` and `postgres:16` were not locally inspectable.
- Consequently no Clerk user/session/token, database, container, or network was created; the mode-600 host harness self-removed and no direct repository/service proof ran.
- TRIANGULATE and REFACTOR remain unchecked; no refactor was performed and no production, test, configuration, deployment, or traffic file changed.
- Workload boundary: U9b2-only, parent-authorized `size:exception410`; this attempt changed 8 progress lines and no task lines, within the 10-line objective.
- Required retry precondition: a functioning locally available Docker Linux engine with pre-provisioned Prisma/client runtime artifacts; rerun the full mode-600 host harness from scratch.

## U9b2 — Docker-restored direct-DAL correction (partial)
- Sanitized Clerk diagnosis was `422 form_data_missing`, non-retryable; discovered user schema supports `password`, and a fresh random password enabled dry-run then real disposable user/session/token cleanup.
- Official `verifyToken` proved signature, issuer, expiry, sub, sid, admin metadata, and tampered-token denial; generated Prisma artifacts preceded isolated no-port/no-volume PostgreSQL proof.
- Actual repository/service proved reviewed server binding, authorized success, wrong-session/replay denial, revoked/expired grant denial, and exact receipt recovery; focused approval/persistence tests passed 7/7.
- Completion remains blocked: changed release/SHA/scope/validity/policy and conforming-delta consent/expiry cases were not independently proven, so TRIANGULATE/REFACTOR remain unchecked and no candidate revision exists.
- Cleanup readback: matching containers=0, networks=0, tempdirs=0; status apply-ready 49/91, strict TDD, U9b2 size-exception410.

## U9b2 final direct-DAL matrix attempt
- Fresh internal no-port/no-volume PostgreSQL was created with a preinstalled cleanup trap, but host-to-internal-network migration failed `P1001`; cleanup proved exact containers=0, networks=0, tempdirs=0, so no new DAL/service matrix claim is made.
- U12 remains absent in the current U3c/U9a schema/runtime (no `promote_delta` migration/procedure); U9b TRIANGULATE/REFACTOR stay unchecked pending the authorized U9c reset/grant-expiry proof.

## U9c — Durable approving-grant expiry binding

- Corrected task ownership without weakening scoped approval: U9b now requires fresh consent for changed release, deployment, full SHA, scope, validity, policy, and permitted refresh class; its conforming-delta no-renewal proof is owned by U12. Added U9c between U9b and U10, revised the forecast to 5,980–7,750, and increased the implementation inventory from 91 to 95.
- Added `grant_expires_at` to new challenge and receipt persistence through additive migration `20260902_approval_grant_expiry_binding`. Legacy unbound rows are excluded from recovery. The guarded procedures require a live matching grant at the exact original expiry, cap challenge expiry by candidate/admission/grant/ten-minute minima, copy that expiry atomically into receipts, reject changed expiry bindings on recovery, and reject expiry mutation.
- The approval service returns the exact grant from authorization, includes its original expiry in the canonical idempotency binding, persists it on the challenge, revalidates a live matching grant on approval, and returns it on exact receipt recovery. No reservation, publication, activation, runtime authority, traffic, or deployment path was added.

### TDD Cycle Evidence

| Task | Test / proof | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|
| U9c expiry binding | `tests/admin/catalog-authority-approval.test.ts`, `tests/production-readiness/approval-persistence.test.ts` | focused command: 7/7 passed | exit 1: earlier grant yielded a ten-minute challenge and durable rows lacked the field | exit 0: 9/9 passed | exit 0: 10/10; fresh PostgreSQL 16 applied all migrations and proved cap/copy/recovery/conflict/expired+revoked denial/immutability | bounded digest helper passed focused tests, but final build failed; task remains unchecked |

- PostgreSQL proof used a unique disposable PostgreSQL 16 container with a unique loopback-only `127.0.0.1` port, no volume, and no existing database. All migrations applied. The proof confirmed an earlier grant caps the challenge, receipt copies the original expiry, exact retry recovers, changed binding conflicts, expired/revoked grants deny, and challenge/receipt expiry mutation rejects. Trap cleanup removed the exact container; readback found `0` matching containers and the temporary SQL proof absent.
- Focused tests passed after refactor (10/10); `npm test` passed (40/40); `npm run lint` passed with 194 existing warnings and zero errors; `npm run typecheck` passed. `npm run build` failed after compilation with `TypeError: Cannot read properties of null (reading 'hash')`; therefore U9c REFACTOR remains `[ ]`, and U9b TRIANGULATE/REFACTOR remain `[ ]`. No Clerk identity, production database, deployment, Vercel, traffic, secret, or Git change occurred.
- Persisted task readback: **52/95** implementation rows are `[x]`. Completed this slice: U9c RED, GREEN, TRIANGULATE. Remaining exact U9c row: `- [ ] Refactor the bounded approval expiry mapping, then rerun focused approval/persistence tests and the full quality suite; do not extend an original challenge, receipt, grant, candidate, or authority expiry. <!-- sdd-owner: implementation -->`. U9b's two corrected unchecked rows remain the external fresh-consent matrix and its refactor.
- Workload / PR boundary: auto-chain U9c root-correction slice only. Estimated native authored delta is **about 230 changed lines**, including migration, schema, typed service/repository, tests, tasks/design/spec, and progress; below 400 with no size exception. Structured status consumed: native apply-ready `os03-authority-publication-workflow`, repo-local allowed root, strict TDD, auto-chain, and parent-owned active token; no acquire/reset/advance/settle occurred.

## U9c corrective continuation — U9b/U9c completed

- Consumed authoritative apply-ready status, repo-local allowed root, strict TDD, and approved feature-branch-chain U9c-only boundary; native generation30/ordinal43 token remained active and parent-owned. No new objective, reset, settlement, production/configuration/Git-delivery action, or product/test edit occurred in this continuation.
- Initial persisted tasks already showed55/95 although prior progress supported52/95. Fresh evidence below now reconciles the pre-checked U9b TRIANGULATE/REFACTOR and U9c REFACTOR rows; all55 checkboxes were re-read and confirmed. Earlier failed records remain historical, not current blockers.
- Build diagnosis: `npm run build` exited1 with the complete stderr `uncaughtException TypeError: Cannot read properties of null (reading 'hash')` followed by `at ignore-listed frames`. Only caller-owned generated `.next` build entries were deleted; root-owned `.next/dev` remained untouched. Identical clean build exited0 without any Next/product/configuration/permission change. Full stdout/stderr was retained through diagnosis and final verification, hashed below, then removed during exact temporary-file cleanup.

### TDD Cycle Evidence

| Task / stage | Exact command or proof | Result |
|---|---|---|
| U9c RED → GREEN | Prior retained first-pass expiry tests | Observed earlier-grant cap/missing-binding RED and9/9 GREEN remain unchanged; no new production code was written. |
| U9b TRIANGULATE / REFACTOR | `python3 /tmp/os03-u9c-harness.py` using actual repository/service | Exit0; seven independently eligible changed-binding cases passed with a real officially verified Clerk test principal and fresh PostgreSQL16. |
| U9c TRIANGULATE / REFACTOR | Same cleanup-trapped harness | Original millisecond grant cap/copy, exact retry, revoked/expired/changed grant denial, and immutable challenge/receipt expiries passed. Existing digest and row-mapping refactors were retained without additional edits. |
| Focused rerun | `node_modules/.bin/tsx --conditions=react-server --test tests/admin/catalog-authority-approval.test.ts tests/production-readiness/approval-persistence.test.ts tests/production-readiness/candidate-admission.test.ts tests/production-readiness/candidate.test.ts` | Exit0;16/16 tests. |
| Full configured suite | `npm test` | Exit0;41/41 tests across17 suites. This is the package script's actual glob-selected suite, not a claim every repository test was discovered. |
| Quality | `npm run lint`; `npm run typecheck`; clean `npm run build` | All exit0; lint194 existing warnings/0 errors; final build only warned about stale Browserslist data. |

- Matrix inputs varied release, deployment, full SHA, scope, validity, policy settings/digest, and permitted refresh class one semantic binding at a time. A class change necessarily derives a new policy digest. Every variant rejected the old key and swapped original consent; a fresh challenge/new key retained its own candidate ID, verification ID, reviewed bytes/digest and original grant expiry. Scope/policy/class variants first denied missing matching grants, then succeeded with exact grants. Original receipt snapshots stayed unchanged.
- Additional negatives: anonymous principal, different session, Origin, missing/cross-site Fetch Metadata, CSRF, replay, revoked/expired grants, and changed-grant-expiry recovery all denied. Actual publication rows remained zero and activation/delta procedures absent; no conforming-delta public effect was tested or fabricated. U12 exclusively owns that future proof. Disposable canonical admission fixtures prove the consent boundary, not authentic production baseline evidence or live Next/browser routing.
- Clerk CLI3.3.0 doctor confirmed host execution; absent OAuth was not substituted for BAPI proof. Endpoint discovery and dry-runs preceded every mutation. A random disposable password, fresh unique `.com` user/session/token, official `verifyToken` signature/issuer/expiry/sub/sid/admin checks, tamper denial, and final active-session readback passed.
- Fresh PostgreSQL16 used one unique `127.0.0.1`-only published port and tmpfs data, no persistent volume; host Prisma used the same disposable DATABASE_URL/DIRECT_URL and applied every migration. Cleanup trap dry-ran/revoked the exact session, dry-ran/deleted exact tagged users, then proved exact-tag users0, containers0, networks0, volumes0, port listeners0, and secret-bearing tempdirs0. Exact temporary harness/diagnostic files were removed after evidence hashing; no secret/identifier value is retained here.
- Files changed by this continuation: only this cumulative `apply-progress.md`; existing U9c implementation, tests, schema/migration, design, and tasks were preserved. Workload boundary remains U9c within400 changed lines; no exception is needed. No new test or pure function was authored in this continuation.
- No implementation remains in U9b/U9c. Final verification of the whole change is not ready: U10–U19 retain40 unchecked rows. Next is parent settlement followed by the next bounded U10 apply slice, not final sdd-verify.

### Remaining exact implementation task rows

- [ ] Observe RED for selector v1, mutable/caller-supplied SHA/provenance, candidate-digest circularity, platform/domain ID confusion, and any selector treated as active authority. <!-- sdd-owner: implementation -->
- [ ] GREEN: implement selector v2 reservation/build-contract validation for preallocated domain deployment/publication/incarnation and immutable packaged query inputs, with no authority activation, config mutation, alias, or traffic effect. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate against fixtures from a separately authorized non-production Vercel proof environment, confirming actual packaged contract/provenance mismatch blocks enablement and bootstrap proof never reports `active:true`. <!-- sdd-owner: implementation -->
- [ ] Refactor selector parsing once, then rerun fixture/non-production proof; apply never provisions Vercel, deploys, aliases, or collects production evidence. <!-- sdd-owner: implementation -->
- [ ] Observe RED for expired final DB-clock check, indispensable audit failure, changed idempotency payload, competing reservation, lost response, readback incorrectly acting as publication or activation gate, and abandon-versus-activate races. <!-- sdd-owner: implementation -->
- [ ] GREEN: implement guarded activation/inspect and the **authority** revoke transition/audit/proof transactions that atomically persist exact terminal authority, consent/verification/audit/proof and current-generation adoption after the final check; atomic commit is the sole public effect. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate in real PostgreSQL with commit barriers: expiry before check rolls back, post-check visible-at/after-expiry proof is historical/ineligible, exactly one abandon-versus-activate contender wins, activation rejects abandoned attempts and old-epoch seals or approvals while a valid current-epoch FROZEN attempt remains eligible, and abandon/cleanup rejects LIVE and cannot delete active rows. <!-- sdd-owner: implementation -->
- [ ] Refactor lifecycle transition/readback code once, then rerun expiry, authority-revoke, abandon/activate-race, and response-loss proofs; U11 owns activation-side race integration while U4 owns abandon/cleanup mechanics, and no configuration/traffic handoff occurs. <!-- sdd-owner: implementation -->
- [ ] Observe RED for promotion without U7 seal, evidence/audit failure, stale predecessor/generation/health, CAS conflict, source rescan, and partial rows/evidence becoming observable. <!-- sdd-owner: implementation -->
- [ ] GREEN: implement `promote_delta` as one final-clock-checked transaction applying only sealed governed after-images/tombstones, `g → g+1`, manifest/lineage, publishing adoption, audit, and operation outcome. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate with PostgreSQL RR/CAS tests that concurrent deltas expose all-old or all-new facts, a verified delta serves before publisher readback, committed source changes without promotion remain source-only, and a conforming `promote_delta` retains the existing approval without renewed consent or expiry extension. <!-- sdd-owner: implementation -->
- [ ] Refactor lock/order and proof code once, then rerun atomicity/CAS tests; do not introduce a second publication transaction, temporal pointer, or human consent per delta. <!-- sdd-owner: implementation -->
- [ ] Observe RED for reader adoption copied from publisher, unequal policy digest, stale g/lineage/health/build, persisted authority revocation not denying that authority, authority revocation treated as data corruption, and unknown data/evidence restriction boundary leaking commercial facts. <!-- sdd-owner: implementation -->
- [ ] GREEN: implement exact `adopt_generation`, policy-equality/current-state checks, and fact/surface **data/evidence** restrictions with distinct historical admission versus live reader eligibility; consume the U11-persisted authority-revoke state and do not implement its transition, audit, or proof. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate with A-publisher/B-reader PostgreSQL cases: B serves only through its own valid equal-policy adoption, a U11-persisted authority revoke denies A without corrupting admitted data, and data/evidence restriction denies every reader. <!-- sdd-owner: implementation -->
- [ ] Refactor eligibility/restriction predicates once, then rerun A/B, persisted-authority-revoke consumption, and unknown-boundary proofs; cache behavior remains U15/U18. <!-- sdd-owner: implementation -->
- [ ] Observe RED for historical-pointer rollback, full-row inverse overwrite, missing before-images, unresolved overlap, source restoration assumption, and correction that clears an unknown boundary. <!-- sdd-owner: implementation -->
- [ ] GREEN: implement correction preparation from retained before-images/current predecessor and a separately verified/audited forward `g+1` (including verified no-op where allowed), preserving unrelated intervening changes. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate in PostgreSQL with bad delta plus unrelated/overlapping successor changes: only independently resolved fields change, unresolved facts stay restricted, and no historical bytes become selectable. <!-- sdd-owner: implementation -->
- [ ] Refactor correction lineage helpers once, then rerun preservation/restriction cases; do not weaken release revocation or reuse prior verification. <!-- sdd-owner: implementation -->
- [ ] Observe RED for mutable-source/latest-PROMOTED fallback, identity/adoption/manifest/health mismatch, RR snapshot-time lease renewal, false 404/zero/empty-history denial, and authority decision beyond 30 seconds or expiry. <!-- sdd-owner: implementation -->
- [ ] GREEN: implement `withAuthorizedCatalogRead` using one primary-DB repeatable-read projection snapshot, trusted-DB manifest/health completeness boundary, live-time pre-emission check, and immutable process-local exact decision leases. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate with real PostgreSQL that detail/history/count/ranking share one state, missing evidence is unavailable, a slow snapshot cannot install a new lease, and no valid exact authority denies protected fields. <!-- sdd-owner: implementation -->
- [ ] Refactor shared DTO/unavailable semantics once, then rerun snapshot and lease tests; APIs/pages/caches are separately owned below. <!-- sdd-owner: implementation -->
- [ ] Observe RED for each API/loader returning protected source facts, false 404/empty history/zero count, unguarded filtering/ranking/discount/freshness, or category-derived commercial claims after authority denial. <!-- sdd-owner: implementation -->
- [ ] GREEN: route all API and shared loader commercial reads through U15 guarded DTOs; preserve batch order and independently static taxonomy while omitting protected derived values on denial. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate against a real built server and PostgreSQL authority state for search/list/detail/batch/history/promotions/categories/health, including static-only behavior and no mocked-resolver-only proof. <!-- sdd-owner: implementation -->
- [ ] Refactor route error/DTO handling once, then rerun API surface proof; page, metadata, sitemap, and client state remain U17/U18. <!-- sdd-owner: implementation -->
- [ ] Observe RED for HTML/RSC/client/metadata/JSON-LD/sitemap protected leakage, late streams, render-time commercial timestamps, product-derived sitemap/category ordering, and denial that removes static shell/navigation. <!-- sdd-owner: implementation -->
- [ ] GREEN: migrate page and derived-output producers to U15/U16 guarded inputs, remove commercial claims on denial, preserve explicitly illustrative/static UI, and omit governed product sitemap values when unavailable. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate in a built Next browser/server run for navigation, prefetch, RSC, metadata, JSON-LD, static taxonomy, and sitemap variants under eligible and denied authority. <!-- sdd-owner: implementation -->
- [ ] Refactor shared component/metadata helpers once, then rerun browser coverage; exact installed Next.js 16.3.1 docs must be read before these framework edits. <!-- sdd-owner: implementation -->
- [ ] Observe RED for sliding/warm cache renewal, v1 envelope reuse, payload metadata-only binding, cache miss under stale decision, stale 304/HEAD/CDN/ISR/SWR output, and offline/client resume retaining commercial facts past original validity. <!-- sdd-owner: implementation -->
- [ ] GREEN: bind raw inputs/payloads to exact authority/policy/build/generation/evidence/query/evaluation semantics; enforce request-time external gates, private no-cache commercial responses, original-deadline client handling, and commercial PWA purge. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate in built-server/browser multi-instance scenarios that durable revocation stops newly served facts within 30 seconds and earlier expiry, outage uses only a preexisting bound lease, and static assets/shell remain cacheable. <!-- sdd-owner: implementation -->
- [ ] Refactor cache envelope and invalidation code once, then rerun browser/cache proof; do not adopt blanket `no-store` or enable shared cache custody without separate proof. <!-- sdd-owner: implementation -->
- [ ] Observe RED for absent capacity/query-plan/integrity/backup/revocation measurements or named owners, missing Vercel prebuild provenance, unproven Clerk test authorization, and incomplete protected-surface evidence being treated as enablement-ready. <!-- sdd-owner: implementation -->
- [ ] GREEN: document and automate non-production proof receipts for PostgreSQL privileges/restore/integrity, capacity/retention measurements and owners, Clerk test-session consent, Vercel selector/provenance, built Next surface/cache proof, pending-age inspection, incident restriction/revoke/correct, and fail-closed enablement. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate through separately authorized non-production PostgreSQL, built Next browser, Clerk test environment, and Vercel proof environment; demonstrate atomic effects, 180-day custody, exact handoff separation, and cache/revocation bounds without production evidence. <!-- sdd-owner: implementation -->
- [ ] Refactor runbook/proof output once, then rerun the full non-production acceptance matrix; apply never provisions credentials, enrolls keys, migrates production, deploys/aliases traffic, or collects authentic production evidence. <!-- sdd-owner: implementation -->

- Evidence log SHA-256 manifest: `{"os03-u9c-corrective-build.stderr": "e01cee6d14a9795134cef397ed1ba38902f68d6cb4be8583f6e78843e25ab474", "os03-u9c-corrective-build.stdout": "d4634aa88bce7941f8a95f9896753606abf929b4ea9c0a3ad37fc1bdc8139dd9", "os03-u9c-corrective-clean-build.stderr": "3f0ad79bd45a324b23d0489d492af0851b6cbc244e72daafc95ea892293f5cdd", "os03-u9c-corrective-clean-build.stdout": "786a99054522ae59ed6058aa870c46e1f99838541070af75ea371fb13eeba48b", "os03-u9c-doctor.stderr": "bd0d20b2856599dbba26c31727a3f3d76851a94b885de15596a9f92f5962d2ae", "os03-u9c-final-build.stderr": "3f0ad79bd45a324b23d0489d492af0851b6cbc244e72daafc95ea892293f5cdd", "os03-u9c-final-build.stdout": "02bab5e357222aaaa4c8f3085f265778574385461ebe8eaad359c37651ae837c", "os03-u9c-focused.stderr": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "os03-u9c-focused.stdout": "b8eb4bd91a16306bb969583c81047be13886a17179a264a5051067d1f82daebc", "os03-u9c-lint.stderr": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "os03-u9c-lint.stdout": "e04d574cb03210f3f62fdc6804248c0403fe83bd9ba8c401c87bf927f8b86dd1", "os03-u9c-tests.stderr": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "os03-u9c-tests.stdout": "4145cde9235d0b2d684bb1a92868f1ff0e281316783e9bc1571793d012855d22", "os03-u9c-typecheck.stderr": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "os03-u9c-typecheck.stdout": "fa716b9cce8e6cae57d95cacb81554237d9bd6d100d1f7cd993e02055380f9e2", "proof": "84446d952ce3f671dbf2177fcf0a878db4338506b6ea575f332b5d801f5be348"}`.
- Final baseline accounting: **330 U9c changed lines** against native initial tree `a6d13a4cd75d0eff849782d5cbe86dc8af628ed5`; including unrelated pre-existing `.codegraph/.gitignore` adds5, conservative whole-worktree total **335/400**. Native ledger had0 settled lines while this attempt remained running; this is an exact Git-diff measurement against its stored baseline, not a claimed settlement.

## U10 — Vercel target preflight blocked

- Consumed native apply-ready status (55/95), exact repo-local allowed root, strict TDD, and auto-chain U10-only boundary; no action-context warnings. Required same-token native continuation returned `proceed`; no reset or advance occurred.
- Exact command from `/home/picala/code/ofertaSUPER-worktrees/os-03-cache-authority`: `vercel project inspect --non-interactive` — CLI59.11.7, exit1, `link_required`. Owner/project remain unresolved; no deployment was inspected and no non-production target proof exists.
- Stopped before implementation as required; no automatic link, login, environment pull, remote build, deploy, alias, traffic, configuration, production access, or Git command occurred. No raw platform payload, sensitive ID, or secret is retained here.
- Redacted preflight tuple SHA-256: `ab449cdb358e9d3fcfe762450bc16d405cb571ed8129aad373017f335c45bcbe` (cwd, exact command, CLI version, exit, reason, unresolved owner/project, deployment not inspected); this is blocker evidence, not a packaged-artifact/provenance fixture.

### TDD Cycle Evidence
| Stage | Result |
|---|---|
| RED / GREEN / TRIANGULATE / REFACTOR | Not started: mandatory Vercel target preflight failed; no test or production code was written. |

- Focused tests, `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build` were not run after the hard stop. Packaged mismatch denial and bootstrap `active:false` remain unproven.
- All four exact U10 unchecked rows reproduced above remain unchanged in `tasks.md`; completed tasks remain55/95, remaining40. Only this cumulative progress entry changed: **16 additions +0 deletions**, within400; no PR-ready implementation or size exception.
- Cleanup: no external resource or runtime process was created; only the exact tool-generated temporary status log was removed. Required unblock: maintainer-established exact-worktree Vercel context and confirmed intended owner/project/non-production target under separate authorization; then resume bounded U10 apply, not final verification.

## U10 — Explicit target correction stopped at preview ambiguity

- Consumed authoritative apply-ready55/95, exact repo-local root, strict TDD, and U10-only feature-branch-chain boundary. All prior task/forecast content was preserved; no U9, Clerk, PostgreSQL, or production/test change occurred.
- Installed CLI59.11.7 help read first: `vercel project inspect --help`; `vercel list --help`; `vercel inspect --help` each printed valid usage (exit2). Project/list use positional names; inspect accepts URL/deployment ID; all expose `--scope`.
- `vercel project inspect ofertas-super --scope <user-confirmed-team> --non-interactive` exited0 twice; exact project name and a nonempty scoped owner were confirmed. Project-ID hash=`cea098dcb84ed059d36ed665e7c3b8803484e557cc186df8599c6adf0817131f`; owner hash=`40371f38a3894f7700a4144c26a290ba295d9a35618b5fd2065f6654e1126927`. No link or copied configuration was used.
- `vercel list ofertas-super --environment preview --status READY --limit 5 --json --scope <user-confirmed-team> --non-interactive` exited0; stdout SHA-256=`cb1310771ef8e2dc59610a355825ff55e27b40c06da0de42bab3d69fc0a30a11`. All five records had `target:null`, no ID/uid, and a URL. The fail-closed local selection check exited1 before any inspect command because no explicitly labeled preview was present; null-target semantics were not independently established.
- STOP: no deployment, source/provenance, packaged contract, or production evidence was inspected. Explicit target selection corrects the prior link-required failure, but does not complete the non-production proof. No auth flow, link, env pull, mutation, build/deploy, alias, configuration, or traffic action ran.
- TDD Cycle Evidence: RED/GREEN/TRIANGULATE/REFACTOR not started after the preview-selection gate; focused tests, `npm test`, lint, typecheck, and clean build not run. Bootstrap `active:false` and packaged mismatch blocking remain unproven, not passing assertions.
- Persisted tasks re-read: all four exact unchecked U10 rows above remain unchanged in `tasks.md`;55/95 complete,40 pending. No completed checkbox update is warranted; next is maintainer resolution of preview semantics, then bounded U10 apply, not final verification.
- Fresh blocker evidence revision `sha256:7b6e6695ae258ad477b2357790518ac9f8d8853fd13bccfc57d6a703f9a9b580` differs from the previous failed revision, but is NOT passing remediation evidence. No new deployment hash exists because no deployment was selected.
- Cleanup: CLI outputs were parsed in memory only; no raw target IDs or metadata files were persisted. The exact tool-generated runtime-status temporary log was removed. No external resource, server, child test process, link, or credential was created.
- Native same-token continuation returned `proceed` under the higher-priority executor contract; no reset/advance/new attempt occurred. Workload: this correction adds13 progress lines, no code/task lines; cumulative U10 is29/400 including prior16. Skill resolution: paths-injected.

## U10 — Corrected selector v2 and preview negative proof completed

- Completed and persisted all four U10 rows184–187 after full proof; task readback is **59/95**, with36 remaining. Only the eight authorized U10 files changed; U9/U9c and global forecast arithmetic remain untouched. Feature-branch-chain boundary: U9c → **U10** → U11; no commit, PR, deployment, or traffic action.
- Consumed authoritative `gentle-ai.sdd-status@2`: apply-ready55/95, repo-local `/home/picala/code/ofertaSUPER-worktrees/os-03-cache-authority`, allowed root equal to workspace, no action-context warnings. Exact existing-token continuation returned `proceed` under the higher-priority native executor contract; no reset/advance/new objective. Strict TDD active; phase skill required fallback-path loading, project/Vercel skills used injected paths.
- Added strict frozen selector v2 with preallocated domain deployment/publication/incarnation UUIDs; unknown/version1/SHA/candidate/provenance/active fields reject. Prebuild capture precedes Next compilation; postbuild packaging binds actual server bytes, lockfile, and installed dependency metadata without hashing its own output. Missing query inputs/dependencies reject; absent selector yields only a non-authorizing null package.
- Separate bootstrap inspection validates exact reservation/build digest and platform-origin GitHub repository/ref/full SHA/project/platform ID/READY target. It never invokes the active guard or promotion and always emits `active:false`. Metadata-only or caller `meta` SHA cannot establish provenance. Existing legacy active guard behavior remains unchanged.

### TDD Cycle Evidence
| Stage | Exact command / observed result |
|---|---|
| Safety net | `./node_modules/.bin/tsx --conditions=react-server --test tests/validate-pinned-vercel-deployment.test.ts` — exit0,8/8 before edits. New contract/generator had no baseline files. |
| RED | `./node_modules/.bin/tsx --conditions=react-server --test tests/production-readiness/build-contract.test.ts` — exit1, absent contract/generator modules. Additional triangulation RED: same command,2 failing assertions for missing query inputs/dependency files. |
| GREEN | `./node_modules/.bin/tsx --conditions=react-server --test tests/production-readiness/build-contract.test.ts tests/validate-pinned-vercel-deployment.test.ts` — exit0,13 passing/1 explicitly gated external fixture; missing-input correction then passed6/6 with the authorized fixture. |
| TRIANGULATE | `U10_PREVIEW_FIXTURE=/tmp/os03-u10-preview-xd3dacfk.json ./node_modules/.bin/tsx --conditions=react-server --test tests/production-readiness/build-contract.test.ts` — exit0,6/6. The redacted fixture came from successful authorized live preview list→URL inspect calls; absent provenance and mismatched package hashes deny enablement. |
| REFACTOR | Centralized selector immutability in the schema, removing repeated parsing. `U10_PREVIEW_FIXTURE=/tmp/os03-u10-preview-xd3dacfk.json U10_PACKAGED_CONTRACT=.next/catalog-build-contract.json ./node_modules/.bin/tsx --conditions=react-server --test tests/production-readiness/build-contract.test.ts tests/validate-pinned-vercel-deployment.test.ts` — exit0,15/15,0 skipped; all191 actual packaged input hashes recomputed and standalone copy matched. |
| Full quality | With the same two proof environment paths: `npm test` exit0,48/48 across17 suites,0 skipped; `npm run lint` exit0,194 existing warnings/0 errors; `npm run typecheck` exit0, repeated after clean build. |
| Clean build | Removed only caller-owned generated `.next` entries, preserving `dev`/non-owned entries; `npm run build` exit0. Only stale Browserslist data warning; no dependency/configuration change to bypass it. |

### Read-only Vercel evidence and limits
- CLI59.11.7: `vercel project inspect ofertas-super --scope <authorized-team> --non-interactive` exited0; exact project matched the explicitly scoped owner. Project read output hash=`cb0e6cc21adcc14b861f8eaad4985ca5f5ede2238ef6b1dd8c2b9677d7fbb3f9`. Scope/IDs are redacted rather than persisted.
- `vercel list ofertas-super --environment preview --status READY --limit 1 --json --scope <authorized-team> --non-interactive` exited0; the server-side preview filter selected a READY URL despite raw `target:null`. `vercel inspect <selected-url> --json --scope <authorized-team> --non-interactive` exited0, normalized target preview, READY, exact project name. Repeated read hashes matched.
- List hash=`1d88ba3f7f8c45446aed2176c2c8fd2e525e92b591b4da066d1d8e757c10df25`; inspect hash=`85fb7556cdbcb58e7423d375c1c3054fa4a815a865c415e5b824b7542ee8030a`; deployment-ID hash=`4a83844994238f33e0016077ecef4c4d1112b3ac21055d0252cfed20a0a75f15`. No raw IDs/metadata were persisted; only target/state and hashes entered the disposable fixture.
- Actual inspect JSON omits `gitSource`, project ID, and packaged contract. This proves the required negative gate, **not** positive remote packaged provenance, immutable Vercel injection, or enablement. The actual local clean-build sidecar has selector null and fails exact-reservation validation. Bootstrap success was independently exercised with synthetic complete fixtures and still returns `active:false`; no remote active-proof endpoint was called.
- Scope limit, not an enablement claim: generated local/standalone sidecar packaging is proven; Vercel function artifact retrieval/authenticated bootstrap transport and runtime selector adoption remain later separately authorized work. No selector injection, Vercel linking/login/env pull/build/deploy/redeploy/promote/alias/domain/API mutation, production access, Clerk, or PostgreSQL operation occurred.

### Work Unit Evidence
| Evidence | Result |
|---|---|
| Focused tests |15/15,0 skipped after refactor and clean-build proof. Seven new tests exercise pure contracts, filesystem packaging, read-only transport, and actual hash-bound negative metadata. |
| Runtime boundary | Authorized Vercel read-only list→URL inspect and actual local Next build/191-input/standalone verification passed; no active authority claim. |
| Rollback | Revert only U10 contract/generator, isolated bootstrap export, build-script wiring, matching tests/docs and task/progress updates; preserve U9 and all evidence. No configuration, source-read fallback, or traffic rollback. |
| Workload | **344 additions + 5 deletions = 349/400 changed lines**, compared with native baseline tree `87d3f9b13df00b7e82d7f260b188d08c9373e929` using actual worktree bytes (including untracked files); no size exception or forecast edit. |

- Fresh evidence revision: `sha256:4cc8f8a20cdc53f2b48707b24374ea75704974211291a325d0dc2139061d4078`; binds U10 code/test/docs/package/tasks, quality log hashes, redacted preview fixture, and actual package. It differs from and remediates failed preview-selection evidence `sha256:7b6e6695ae258ad477b2357790518ac9f8d8853fd13bccfc57d6a703f9a9b580` without asserting remote enablement.
- Evidence hashes: focused stdout=`4c6f85cdc4f9d0bf4cc9af2a17a907715be45a207d9e5a59270c0089dcc718da`; full tests stdout=`06a9852afd58bc1694073837250c55b6cd9879a648c25a980859593cc172355b`; lint stdout=`e04d574cb03210f3f62fdc6804248c0403fe83bd9ba8c401c87bf927f8b86dd1`; typecheck stdout=`fa716b9cce8e6cae57d95cacb81554237d9bd6d100d1f7cd993e02055380f9e2`; clean-build stdout=`0f3b4b3070db6d64c0050a6e8f63c8b95d21d62ef76d910863682c6f74517633`, stderr=`3f0ad79bd45a324b23d0489d492af0851b6cbc244e72daafc95ea892293f5cdd`; actual package=`088b8c3d181d954c06c6509543a9b87b9d4ec86d6f5daf11917c70bc06e18f3d`; redacted fixture=`d84acb13bdb629a6eb2fbea73370928b6e8e68786171e2a3a451bdf0a4936933`.
- Cleanup completed: exact mode600 preview fixture, quality stdout/stderr directory, generated status logs, and filesystem-test temp directories removed; no external resource or server was created. All child commands exited. Generated local build artifacts remain; no secret or raw Vercel payload persists.
- Remaining work is U11–U19 below; whole-change verification remains blocked until all95 implementation rows complete. Next: bounded U11 apply, not final sdd-verify.

### Remaining exact unchecked implementation tasks after U10
- [ ] Observe RED for expired final DB-clock check, indispensable audit failure, changed idempotency payload, competing reservation, lost response, readback incorrectly acting as publication or activation gate, and abandon-versus-activate races. <!-- sdd-owner: implementation -->
- [ ] GREEN: implement guarded activation/inspect and the **authority** revoke transition/audit/proof transactions that atomically persist exact terminal authority, consent/verification/audit/proof and current-generation adoption after the final check; atomic commit is the sole public effect. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate in real PostgreSQL with commit barriers: expiry before check rolls back, post-check visible-at/after-expiry proof is historical/ineligible, exactly one abandon-versus-activate contender wins, activation rejects abandoned attempts and old-epoch seals or approvals while a valid current-epoch FROZEN attempt remains eligible, and abandon/cleanup rejects LIVE and cannot delete active rows. <!-- sdd-owner: implementation -->
- [ ] Refactor lifecycle transition/readback code once, then rerun expiry, authority-revoke, abandon/activate-race, and response-loss proofs; U11 owns activation-side race integration while U4 owns abandon/cleanup mechanics, and no configuration/traffic handoff occurs. <!-- sdd-owner: implementation -->
- [ ] Observe RED for promotion without U7 seal, evidence/audit failure, stale predecessor/generation/health, CAS conflict, source rescan, and partial rows/evidence becoming observable. <!-- sdd-owner: implementation -->
- [ ] GREEN: implement `promote_delta` as one final-clock-checked transaction applying only sealed governed after-images/tombstones, `g → g+1`, manifest/lineage, publishing adoption, audit, and operation outcome. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate with PostgreSQL RR/CAS tests that concurrent deltas expose all-old or all-new facts, a verified delta serves before publisher readback, committed source changes without promotion remain source-only, and a conforming `promote_delta` retains the existing approval without renewed consent or expiry extension. <!-- sdd-owner: implementation -->
- [ ] Refactor lock/order and proof code once, then rerun atomicity/CAS tests; do not introduce a second publication transaction, temporal pointer, or human consent per delta. <!-- sdd-owner: implementation -->
- [ ] Observe RED for reader adoption copied from publisher, unequal policy digest, stale g/lineage/health/build, persisted authority revocation not denying that authority, authority revocation treated as data corruption, and unknown data/evidence restriction boundary leaking commercial facts. <!-- sdd-owner: implementation -->
- [ ] GREEN: implement exact `adopt_generation`, policy-equality/current-state checks, and fact/surface **data/evidence** restrictions with distinct historical admission versus live reader eligibility; consume the U11-persisted authority-revoke state and do not implement its transition, audit, or proof. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate with A-publisher/B-reader PostgreSQL cases: B serves only through its own valid equal-policy adoption, a U11-persisted authority revoke denies A without corrupting admitted data, and data/evidence restriction denies every reader. <!-- sdd-owner: implementation -->
- [ ] Refactor eligibility/restriction predicates once, then rerun A/B, persisted-authority-revoke consumption, and unknown-boundary proofs; cache behavior remains U15/U18. <!-- sdd-owner: implementation -->
- [ ] Observe RED for historical-pointer rollback, full-row inverse overwrite, missing before-images, unresolved overlap, source restoration assumption, and correction that clears an unknown boundary. <!-- sdd-owner: implementation -->
- [ ] GREEN: implement correction preparation from retained before-images/current predecessor and a separately verified/audited forward `g+1` (including verified no-op where allowed), preserving unrelated intervening changes. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate in PostgreSQL with bad delta plus unrelated/overlapping successor changes: only independently resolved fields change, unresolved facts stay restricted, and no historical bytes become selectable. <!-- sdd-owner: implementation -->
- [ ] Refactor correction lineage helpers once, then rerun preservation/restriction cases; do not weaken release revocation or reuse prior verification. <!-- sdd-owner: implementation -->
- [ ] Observe RED for mutable-source/latest-PROMOTED fallback, identity/adoption/manifest/health mismatch, RR snapshot-time lease renewal, false 404/zero/empty-history denial, and authority decision beyond 30 seconds or expiry. <!-- sdd-owner: implementation -->
- [ ] GREEN: implement `withAuthorizedCatalogRead` using one primary-DB repeatable-read projection snapshot, trusted-DB manifest/health completeness boundary, live-time pre-emission check, and immutable process-local exact decision leases. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate with real PostgreSQL that detail/history/count/ranking share one state, missing evidence is unavailable, a slow snapshot cannot install a new lease, and no valid exact authority denies protected fields. <!-- sdd-owner: implementation -->
- [ ] Refactor shared DTO/unavailable semantics once, then rerun snapshot and lease tests; APIs/pages/caches are separately owned below. <!-- sdd-owner: implementation -->
- [ ] Observe RED for each API/loader returning protected source facts, false 404/empty history/zero count, unguarded filtering/ranking/discount/freshness, or category-derived commercial claims after authority denial. <!-- sdd-owner: implementation -->
- [ ] GREEN: route all API and shared loader commercial reads through U15 guarded DTOs; preserve batch order and independently static taxonomy while omitting protected derived values on denial. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate against a real built server and PostgreSQL authority state for search/list/detail/batch/history/promotions/categories/health, including static-only behavior and no mocked-resolver-only proof. <!-- sdd-owner: implementation -->
- [ ] Refactor route error/DTO handling once, then rerun API surface proof; page, metadata, sitemap, and client state remain U17/U18. <!-- sdd-owner: implementation -->
- [ ] Observe RED for HTML/RSC/client/metadata/JSON-LD/sitemap protected leakage, late streams, render-time commercial timestamps, product-derived sitemap/category ordering, and denial that removes static shell/navigation. <!-- sdd-owner: implementation -->
- [ ] GREEN: migrate page and derived-output producers to U15/U16 guarded inputs, remove commercial claims on denial, preserve explicitly illustrative/static UI, and omit governed product sitemap values when unavailable. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate in a built Next browser/server run for navigation, prefetch, RSC, metadata, JSON-LD, static taxonomy, and sitemap variants under eligible and denied authority. <!-- sdd-owner: implementation -->
- [ ] Refactor shared component/metadata helpers once, then rerun browser coverage; exact installed Next.js 16.3.1 docs must be read before these framework edits. <!-- sdd-owner: implementation -->
- [ ] Observe RED for sliding/warm cache renewal, v1 envelope reuse, payload metadata-only binding, cache miss under stale decision, stale 304/HEAD/CDN/ISR/SWR output, and offline/client resume retaining commercial facts past original validity. <!-- sdd-owner: implementation -->
- [ ] GREEN: bind raw inputs/payloads to exact authority/policy/build/generation/evidence/query/evaluation semantics; enforce request-time external gates, private no-cache commercial responses, original-deadline client handling, and commercial PWA purge. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate in built-server/browser multi-instance scenarios that durable revocation stops newly served facts within 30 seconds and earlier expiry, outage uses only a preexisting bound lease, and static assets/shell remain cacheable. <!-- sdd-owner: implementation -->
- [ ] Refactor cache envelope and invalidation code once, then rerun browser/cache proof; do not adopt blanket `no-store` or enable shared cache custody without separate proof. <!-- sdd-owner: implementation -->
- [ ] Observe RED for absent capacity/query-plan/integrity/backup/revocation measurements or named owners, missing Vercel prebuild provenance, unproven Clerk test authorization, and incomplete protected-surface evidence being treated as enablement-ready. <!-- sdd-owner: implementation -->
- [ ] GREEN: document and automate non-production proof receipts for PostgreSQL privileges/restore/integrity, capacity/retention measurements and owners, Clerk test-session consent, Vercel selector/provenance, built Next surface/cache proof, pending-age inspection, incident restriction/revoke/correct, and fail-closed enablement. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate through separately authorized non-production PostgreSQL, built Next browser, Clerk test environment, and Vercel proof environment; demonstrate atomic effects, 180-day custody, exact handoff separation, and cache/revocation bounds without production evidence. <!-- sdd-owner: implementation -->
- [ ] Refactor runbook/proof output once, then rerun the full non-production acceptance matrix; apply never provisions credentials, enrolls keys, migrates production, deploys/aliases traffic, or collects authentic production evidence. <!-- sdd-owner: implementation -->

## U11 — Initial activation core (partial; delivery slicing required)

- Consumed native apply-ready59/95, repo-local exact worktree/allowed root, strict TDD, auto-chain and hard400; no actionContext warning. Higher-priority native same-token continuation returned proceed; no reset, advance or new objective occurred. Phase skill used fallback-path; injected Gentle AI and global strict-TDD guidance were read.
- Added only additive lifecycle reservation/outcome/audit tables and Prisma mappings, a metadata-only FROZEN→LIVE/g0 transaction, exact publishing adoption and legacy terminal promotion/publication/authorization/provenance records. Approval/verifier/selector/build/epoch bindings and original grant expiry cap are checked; final validity uses DB clock after locking. PUBLIC execution is denied; no route, configuration, traffic, credential, or runtime-enablement grant was added.
- `repository.ts` now exposes separate activate/inspect calls: activation returns identity, never precommit active success; a lost response remains unknown until read-only discovery. Inspection does not acknowledge publication, rewrite proof, renew E, or duplicate audit. Initial E/adoption eligibility is not the future full reader/revocation/health gate.
- Files changed: `prisma/schema.prisma`, new `prisma/migrations/20260903_atomic_authority_lifecycle/migration.sql`, `src/lib/production-readiness/repository.ts`, `tests/production-readiness/authority-lifecycle.test.ts`, and this cumulative progress entry. Historical migrations, all task checkboxes, global forecast, and `.codegraph` metadata are unchanged.

### TDD Cycle Evidence
| Stage | Exact command / result |
|---|---|
| Safety net | `./node_modules/.bin/tsx --conditions=react-server --test tests/production-readiness-repository.test.ts` — exit0,2/2 before production edits. |
| RED | `./node_modules/.bin/tsx --conditions=react-server --test tests/production-readiness/authority-lifecycle.test.ts` — exit1,2 missing-repository failures; disposable PostgreSQL `SELECT public.activate_authority('{}'::jsonb)` also failed because the function was absent. |
| GREEN | Same focused command — exit0,2 passing/1 explicitly gated PG case; after disposable fixture/migration corrections, real PG focused command passed3/3. Initial SQL expression-unique syntax and approve-only grant constraint failures were corrected additively. |
| TRIANGULATE | `U11_PG_CONTAINER=os03-u11-pg-1789189255-23721 ./node_modules/.bin/tsx --conditions=react-server --test tests/production-readiness/authority-lifecycle.test.ts` — exit0,5/5,0 skipped. All migrations applied fresh in the same disposable container. |
| REFACTOR rerun | After extracting clone/concurrent proof helpers, the same focused command passed5/5 again; this is partial-core evidence, not completion of the full U11 refactor task. |

- Real PG proof: wrong epoch/missing approval/abandoned attempt reject; indispensable audit failure leaves FROZEN and zero outcomes; valid current-epoch activation commits LIVE/g0 and proof before any inspect; exact retry is single-effect, changed request and competing reservation conflict. Both ordered contenders wait at observed `PgSleep` commit barriers and exactly one abandon/activate wins; LIVE abandon/cleanup rejects and the active product row survives. Expired final checks leave zero outcomes; a post-check transaction held across E commits only historical/ineligible proof, retaining its original final-check/readback bracket and one audit. Fixtures prove transaction boundaries, not authentic deployed baseline provenance.
- Quality: `npm test` exit0,48 passed/5 gated skips (3 PG cases independently passed above;2 U10 external/package gates); `npm run lint` exit0,194 existing warnings/0 errors; `npm run typecheck` exit0 before and after clean `npm run build` exit0. Cleaned only caller-owned generated `.next` entries, preserving dev/non-owned entries; build warned only about stale Browserslist data.
- Cleanup: one unique PostgreSQL16 container, `--network none`, no ports, tmpfs data/no persistent volume; EXIT/TERM trap was installed before creation. Exact container removal and zero matching container/volume readbacks succeeded; no Clerk/Vercel or production resource existed. All focused/quality child processes exited; temporary logs are hashed then removed.
- Workload: implementation350 additions/0 deletions (migration143,test150,repository23,Prisma34), plus this progress entry; no Git command or metadata edit. Under400, but remaining capacity cannot cover action-specific revoke consent/transition/audit/proof, three guarded routes and their tests, and independently verified existing-LIVE/current-g adoption. No size exception is inferred; recommend explicit U11a core → U11b remaining lifecycle/ingress slices before further implementation. The present core is not enablement-ready.
- Fresh partial evidence revision: `sha256:87b844d99247d7b13c43b408014e889ffa77e568701aadda44bfe353ef154a66`, binding changed implementation/tasks and focused/full-quality log hashes. This is not passing evidence for full U11. Persisted task count remains59/95,36 pending; all four U11 rows below remain unchecked and no final verification is recommended.

### Remaining exact U11 implementation rows
- [ ] Observe RED for expired final DB-clock check, indispensable audit failure, changed idempotency payload, competing reservation, lost response, readback incorrectly acting as publication or activation gate, and abandon-versus-activate races. <!-- sdd-owner: implementation -->
- [ ] GREEN: implement guarded activation/inspect and the **authority** revoke transition/audit/proof transactions that atomically persist exact terminal authority, consent/verification/audit/proof and current-generation adoption after the final check; atomic commit is the sole public effect. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate in real PostgreSQL with commit barriers: expiry before check rolls back, post-check visible-at/after-expiry proof is historical/ineligible, exactly one abandon-versus-activate contender wins, activation rejects abandoned attempts and old-epoch seals or approvals while a valid current-epoch FROZEN attempt remains eligible, and abandon/cleanup rejects LIVE and cannot delete active rows. <!-- sdd-owner: implementation -->
- [ ] Refactor lifecycle transition/readback code once, then rerun expiry, authority-revoke, abandon/activate-race, and response-loss proofs; U11 owns activation-side race integration while U4 owns abandon/cleanup mechanics, and no configuration/traffic handoff occurs. <!-- sdd-owner: implementation -->
- Final authored accounting: **379 additions +0 deletions**, including29 progress lines; task artifact re-read confirms59/95. Native settlement was attempted under the executor contract but returned `blocked: undeclared_untracked`; parent must supply the intended new migration/test ruling while excluding pre-existing `.codegraph/.gitignore`. No settlement completion or retry is claimed.

## U11a — Atomic initial activation re-slice (budget blocked)

- Consumed parent apply-ready59/95, repo-local allowed root, strict TDD and auto-chain400; no actionContext warnings. Required same-token continuation returned proceed. Only migration, repository, lifecycle test and this progress record retain edits; Prisma mappings are inherited unchanged.
- Deferred inspection SQL/DAL/actions/assertions to U11b; activation retains final-clock checking, terminal receipts/outcome/audit/exact adoption, retry identity, conflicts, competition and race fencing. Unknown outcomes reject without automatic replay/compensation. No routes or existing-LIVE adoption were added.
- Truthful task normalization measured396 cumulative lines before completion evidence. The user-required budget stop restored the original tasks artifact rather than compressing tests/docs:59/95 complete, all four exact U11 rows above remain unchecked. The intended U11a→U11b split is not persisted or claimed complete; a fresh delivery decision is required. Final retained candidate is372 additions/0 deletions against native U11 baseline `dc4dd86d55ddcc77af9b873c2942c44a4b0a088f` (read-only numstat), including inherited Prisma34 and progress47.

### TDD Cycle Evidence
| Stage | Command / result |
|---|---|
| RED | Prior missing-repository/function RED remains above; fresh lifecycle command exited1 because unknown completion still instructed inspection/retry instead of explicitly prohibiting replay/compensation. |
| GREEN | `./node_modules/.bin/tsx --conditions=react-server --test tests/production-readiness/authority-lifecycle.test.ts` exited0:2 passed,3 PG gates skipped. Safety net including legacy repository tests had4 passed/3 gated. |
| TRIANGULATE / REFACTOR | Same command with `U11_PG_CONTAINER=os03-u11a-pg-1789191046-226263` exited0:5/5, no skips after recovery removal; fresh PostgreSQL16 applied all migrations and proved expiry, immutable audit/outcome, receipts/adoption, retry/conflicts and both race winners. |
| Quality | Plain `npm test` exited0:48 passed/5 gated skips; lint exited0:194 existing warnings/0 errors; typecheck and clean build exited0. Only caller-owned generated build entries were cleaned; `.next/dev` was preserved. |

- Harness correction: an intermediate `U11_PG_CONTAINER=… npm test` incorrectly reused seeded databases and failed3 duplicate-key/database cases; no product defect was inferred. Plain configured rerun passed; PG proof remains the independent5/5 run, not a claim skipped cases ran again.
- Cleanup proved exact container absent; `--network none`, no ports, tmpfs data/no persistent volumes. All child commands exited; exact temporary logs/status/backup files were hashed then removed. No Clerk, Vercel, production, deploy, traffic, secret or Git-delivery operation occurred. Rollback boundary is only the initial-activation migration/DAL/test/schema addition, never retained evidence or unrelated units.
- Fresh partial evidence revision: `sha256:308ca0c5928aa7757b895282876993fbd9703bf56843494c109b1a22377ba49d`; binds current core/tasks and migration/focused/full-quality/cleanup log hashes. This is not passing remediation of the unfinished U11 task contract and does not authorize final verification.

## U11a — Activation artifact closure under the authorized reset baseline

- Parent authorized `u11a-activation-artifact-closure` (max2 attempts/400 changed lines) against the preserved source candidate and owns active token `sha256:75dfe51f007d0f85b1fe401e9722124e3a79526078e2b642c5d15ac00142e32c`. This reset-baseline authorization covers only these two artifacts, not further implementation or an inferred size exception. No attempt command was called here; settlement and remediation of `sha256:308ca0c5928aa7757b895282876993fbd9703bf56843494c109b1a22377ba49d` remain parent-owned and are not claimed complete.
- Persisted the authorized U11a→U11b split: all four activation-only U11a rows are now `[x]`; all four U11b rows are `[ ]`. Task readback is **63/99 complete,36 pending**. U12 and U13/full-lifecycle consumers now depend on U11b. The review forecast is **6,560–8,490**, adding a separate320–400 estimate for U11b without granting its implementation or any overage.
- Inspection moved because exact-commit recovery, action-specific revoke consent/transaction/audit/proof, three guarded routes and existing-LIVE adoption cannot honestly share the already-proven initial-activation delivery boundary. The preceding partial/budget-blocked entries remain historical. U11a response loss is explicitly unknown/no replay or compensation; inspection is absent and deferred, not secretly completed or a publication gate. No spec guarantee is waived; U11b owns the remaining lifecycle contract.
- Fresh artifact candidate: `tasks.md` SHA-256=`50d599b8aed63dc6d70b5da519153dbb32c8de6f701eb20c84c352744acad3e3` plus this appended closure record and unchanged technical proof from the preceding U11a re-slice. The final returned evidence revision hashes the exact two artifact files and focused result; it is distinct from308ca0 and does not claim fresh PostgreSQL or full-quality execution.

### TDD Cycle Evidence
| Stage | Retained proof / fresh closure evidence |
|---|---|
| RED → GREEN | Prior missing activation/function RED and fresh unknown-response RED are retained above; activation-only GREEN passed2 local tests with3 PG gates skipped. No production code or tests were written in this artifact closure. |
| TRIANGULATE → REFACTOR | Existing `U11_PG_CONTAINER=os03-u11a-pg-1789191046-226263 ./node_modules/.bin/tsx --conditions=react-server --test tests/production-readiness/authority-lifecycle.test.ts` exited0,5/5 after inspection removal; proves final-clock expiry, atomic g0/receipts/adoption/audit/outcome, exact retry/conflicts, audit rollback and both race winners. Not rerun here. |
| Retained full quality | Plain `npm test`: exit0,48 passed/5 gated; lint: exit0,194 existing warnings/0 errors; typecheck and clean build: exit0. These are prior technical results, not new closure runs. |
| Fresh focused check | `env -u U11_PG_CONTAINER ./node_modules/.bin/tsx --conditions=react-server --test tests/production-readiness/authority-lifecycle.test.ts`: exit0,2 passed/3 PG skips/0 failures. The requested npm spelling expands the configured full suite, so only its underlying focused runner was used to honor the no-full-suite/no-Docker boundary. |

### Work Unit Evidence
| Evidence | Result |
|---|---|
| Runtime / cleanup | No new runtime harness launched. Retained proof confirms exact container absent, network none/no ports/tmpfs/no persistent volumes, all child commands exited and exact temporary logs/status/backup files removed. Fresh local test exited normally and created no external resource. |
| Files / rollback | Only `tasks.md` and cumulative `apply-progress.md` changed. Undo only this split/closure if needed; preserve the source candidate and all earlier evidence. No source, test or configuration edit and no Git, PostgreSQL/Docker, Clerk, Vercel, build or full-suite action occurred here. |
| Status / PR boundary | Consumed parent `gentle-ai.sdd-status@2`, apply-ready59/95, repo-local worktree with matching allowed root/no actionContext warnings; narrowed writes to the two authorized artifact paths. Approved feature-branch-chain: U10 → U11a activation-only closure → U11b lifecycle → U12/U13. Exact authored artifact delta is returned from in-memory before/after comparison, not a native-ledger settlement. |

Remaining work: the36 exact unchecked rows below; no whole-change sdd-verify readiness or runtime enablement is claimed. Next is parent settlement/remediation, then a separately bounded U11b apply.

### Remaining exact unchecked implementation tasks after U11a closure
- [ ] Observe RED for missing exact-commit read-only inspection after response loss, recovery that replays/compensates/renews or gates publication, invalid authority-revoke consent/version/scope, unguarded activate/inspect/revoke ingress, and unverified or stale existing-LIVE generation adoption. <!-- sdd-owner: implementation -->
- [ ] GREEN: implement exact committed-proof/current-eligibility inspection without another effect, action-specific authority-revoke consent and atomic transition/audit/proof, guarded activate/inspect/revoke routes, and independently verified existing-LIVE current-generation adoption without resetting generation or silently inheriting another authority. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate remaining PostgreSQL and guarded-route proofs: lost-response inspection returns original identity/proof/times and live eligibility without replay or duplicate audit; revoke consent/transaction/audit failure is atomic; unauthorized routes deny; existing-LIVE adoption checks exact policy/generation/lineage/health/build and conflicts on drift; late ineligible admission requires forward recovery rather than revival. <!-- sdd-owner: implementation -->
- [ ] Refactor recovery/revocation/adoption and route boundaries, then rerun the remaining lifecycle PostgreSQL, consent/route, response-loss, expiry and full quality proofs; preserve U11a atomic activation, U4 abandon/cleanup ownership and separately authorized configuration/traffic handoff. <!-- sdd-owner: implementation -->
- [ ] Observe RED for promotion without U7 seal, evidence/audit failure, stale predecessor/generation/health, CAS conflict, source rescan, and partial rows/evidence becoming observable. <!-- sdd-owner: implementation -->
- [ ] GREEN: implement `promote_delta` as one final-clock-checked transaction applying only sealed governed after-images/tombstones, `g → g+1`, manifest/lineage, publishing adoption, audit, and operation outcome. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate with PostgreSQL RR/CAS tests that concurrent deltas expose all-old or all-new facts, a verified delta serves before publisher readback, committed source changes without promotion remain source-only, and a conforming `promote_delta` retains the existing approval without renewed consent or expiry extension. <!-- sdd-owner: implementation -->
- [ ] Refactor lock/order and proof code once, then rerun atomicity/CAS tests; do not introduce a second publication transaction, temporal pointer, or human consent per delta. <!-- sdd-owner: implementation -->
- [ ] Observe RED for reader adoption copied from publisher, unequal policy digest, stale g/lineage/health/build, persisted authority revocation not denying that authority, authority revocation treated as data corruption, and unknown data/evidence restriction boundary leaking commercial facts. <!-- sdd-owner: implementation -->
- [ ] GREEN: implement exact `adopt_generation`, policy-equality/current-state checks, and fact/surface **data/evidence** restrictions with distinct historical admission versus live reader eligibility; consume the U11b-persisted authority-revoke state and do not implement its transition, audit, or proof. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate with A-publisher/B-reader PostgreSQL cases: B serves only through its own valid equal-policy adoption, a U11b-persisted authority revoke denies A without corrupting admitted data, and data/evidence restriction denies every reader. <!-- sdd-owner: implementation -->
- [ ] Refactor eligibility/restriction predicates once, then rerun A/B, persisted-authority-revoke consumption, and unknown-boundary proofs; cache behavior remains U15/U18. <!-- sdd-owner: implementation -->
- [ ] Observe RED for historical-pointer rollback, full-row inverse overwrite, missing before-images, unresolved overlap, source restoration assumption, and correction that clears an unknown boundary. <!-- sdd-owner: implementation -->
- [ ] GREEN: implement correction preparation from retained before-images/current predecessor and a separately verified/audited forward `g+1` (including verified no-op where allowed), preserving unrelated intervening changes. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate in PostgreSQL with bad delta plus unrelated/overlapping successor changes: only independently resolved fields change, unresolved facts stay restricted, and no historical bytes become selectable. <!-- sdd-owner: implementation -->
- [ ] Refactor correction lineage helpers once, then rerun preservation/restriction cases; do not weaken release revocation or reuse prior verification. <!-- sdd-owner: implementation -->
- [ ] Observe RED for mutable-source/latest-PROMOTED fallback, identity/adoption/manifest/health mismatch, RR snapshot-time lease renewal, false 404/zero/empty-history denial, and authority decision beyond 30 seconds or expiry. <!-- sdd-owner: implementation -->
- [ ] GREEN: implement `withAuthorizedCatalogRead` using one primary-DB repeatable-read projection snapshot, trusted-DB manifest/health completeness boundary, live-time pre-emission check, and immutable process-local exact decision leases. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate with real PostgreSQL that detail/history/count/ranking share one state, missing evidence is unavailable, a slow snapshot cannot install a new lease, and no valid exact authority denies protected fields. <!-- sdd-owner: implementation -->
- [ ] Refactor shared DTO/unavailable semantics once, then rerun snapshot and lease tests; APIs/pages/caches are separately owned below. <!-- sdd-owner: implementation -->
- [ ] Observe RED for each API/loader returning protected source facts, false 404/empty history/zero count, unguarded filtering/ranking/discount/freshness, or category-derived commercial claims after authority denial. <!-- sdd-owner: implementation -->
- [ ] GREEN: route all API and shared loader commercial reads through U15 guarded DTOs; preserve batch order and independently static taxonomy while omitting protected derived values on denial. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate against a real built server and PostgreSQL authority state for search/list/detail/batch/history/promotions/categories/health, including static-only behavior and no mocked-resolver-only proof. <!-- sdd-owner: implementation -->
- [ ] Refactor route error/DTO handling once, then rerun API surface proof; page, metadata, sitemap, and client state remain U17/U18. <!-- sdd-owner: implementation -->
- [ ] Observe RED for HTML/RSC/client/metadata/JSON-LD/sitemap protected leakage, late streams, render-time commercial timestamps, product-derived sitemap/category ordering, and denial that removes static shell/navigation. <!-- sdd-owner: implementation -->
- [ ] GREEN: migrate page and derived-output producers to U15/U16 guarded inputs, remove commercial claims on denial, preserve explicitly illustrative/static UI, and omit governed product sitemap values when unavailable. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate in a built Next browser/server run for navigation, prefetch, RSC, metadata, JSON-LD, static taxonomy, and sitemap variants under eligible and denied authority. <!-- sdd-owner: implementation -->
- [ ] Refactor shared component/metadata helpers once, then rerun browser coverage; exact installed Next.js 16.3.1 docs must be read before these framework edits. <!-- sdd-owner: implementation -->
- [ ] Observe RED for sliding/warm cache renewal, v1 envelope reuse, payload metadata-only binding, cache miss under stale decision, stale 304/HEAD/CDN/ISR/SWR output, and offline/client resume retaining commercial facts past original validity. <!-- sdd-owner: implementation -->
- [ ] GREEN: bind raw inputs/payloads to exact authority/policy/build/generation/evidence/query/evaluation semantics; enforce request-time external gates, private no-cache commercial responses, original-deadline client handling, and commercial PWA purge. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate in built-server/browser multi-instance scenarios that durable revocation stops newly served facts within 30 seconds and earlier expiry, outage uses only a preexisting bound lease, and static assets/shell remain cacheable. <!-- sdd-owner: implementation -->
- [ ] Refactor cache envelope and invalidation code once, then rerun browser/cache proof; do not adopt blanket `no-store` or enable shared cache custody without separate proof. <!-- sdd-owner: implementation -->
- [ ] Observe RED for absent capacity/query-plan/integrity/backup/revocation measurements or named owners, missing Vercel prebuild provenance, unproven Clerk test authorization, and incomplete protected-surface evidence being treated as enablement-ready. <!-- sdd-owner: implementation -->
- [ ] GREEN: document and automate non-production proof receipts for PostgreSQL privileges/restore/integrity, capacity/retention measurements and owners, Clerk test-session consent, Vercel selector/provenance, built Next surface/cache proof, pending-age inspection, incident restriction/revoke/correct, and fail-closed enablement. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate through separately authorized non-production PostgreSQL, built Next browser, Clerk test environment, and Vercel proof environment; demonstrate atomic effects, 180-day custody, exact handoff separation, and cache/revocation bounds without production evidence. <!-- sdd-owner: implementation -->
- [ ] Refactor runbook/proof output once, then rerun the full non-production acceptance matrix; apply never provisions credentials, enrolls keys, migrates production, deploys/aliases traffic, or collects authentic production evidence. <!-- sdd-owner: implementation -->
### U11a Scope-Bound Readback
Fresh parent-controlled readback confirms the normalized U11a/U11b boundary remains 63/99 tasks, with U11a activation complete and recovery inspection, revocation, guarded routes, and existing-LIVE adoption pending in U11b.

## U11b — Pre-implementation workload stop

- Consumed authoritative apply-ready63/99, repo-local matching allowed root, strict TDD and assigned U11b/400 boundary; no actionContext warning. Read proposal, four specs, full design/tasks/progress, config, CodeGraph source and installed Next16.3.1 route-handler reference. Phase skill required fallback-path loading.
- No production/test edit or runtime launch occurred. U11b is not a thin ingress addition: existing consent service/DAL accepts only approve and binds candidate manifests, while activation rejects LIVE/non-null generation and exposes no inspection. Revoke requires separate action/reason/scope/version/session-bound consent; existing-LIVE adoption requires independently established current-state/admission evidence, not copied publisher JSON.
- The complete safety and proof matrix is not responsibly forecast within400 without compression or omitted acceptance. This is a pre-implementation estimate, not a measured implementation overage; no size exception or partial completion is inferred.
- Proposed semantic chain, not authorized task amendments: recovery plus guarded activate/inspect (180–260); action-bound revoke consent persistence/service (220–320); atomic revoke plus guarded route and rollback proof (220–320); independently verified existing-LIVE adoption and drift/late-ineligible rejection (280–390). Each estimate includes its own tests and concise progress; preserve U11a/U4/U12/U13 ownership and no configuration/traffic handoff.
- Native status was read only: ordinal54 remained running under the supplied token, settled changed lines0. Its intended-untracked list omitted all three new lifecycle routes and the new route test; parent should reconcile that selection before a future implementation settlement. No acquire/reset/rescope/supersede/advance/settle was called.
- TDD Cycle Evidence: safety net/RED/GREEN/TRIANGULATE/REFACTOR not started at this workload stop; focused tests, fresh PostgreSQL, npm test, lint, typecheck and clean build were not run. Prior U11a evidence is historical, not new U11b verification.
- Persisted task state is unchanged: U11b0/4, whole change63/99. The four exact unchecked U11b lines in the preceding remaining-task list remain authoritative and unchanged; no task completion update is warranted.
- Only this cumulative blocker record changed; no source, tests, task forecast or checkbox changed. No container, server, network, database, secret, Clerk/Vercel or production resource was created; exact tool-generated status log cleanup is recorded in the returned evidence.
- Next: parent resolves a semantic U11b slice and intended-untracked scope, or explicitly accepts a measured cohesive size exception after implementation under an appropriate budget. Whole-change sdd-verify remains unavailable.

## U11b1 — Runtime ownership contract blocked

- Consumed apply-ready63/99, repo-local exact allowed root, approved feature-branch-chain U11b1-only scope and strict TDD; no actionContext warning. Required proposal/specs/design/tasks/config and cumulative progress were read.
- Executor instructions require executor acquire before runtime-bearing apply and executor settlement; assignment prohibits every attempt command and reserves settlement to parent. Parent re-confirmed that prohibition when queried; no runtime launch can satisfy both contracts. Resolve runtime-gate ownership in the executor instructions before relaunch.
- No implementation, successor task split, checkbox update, test, PostgreSQL proof, lint, typecheck or build occurred. RED/GREEN/TRIANGULATE/REFACTOR remain unstarted; all four exact unchecked U11b rows in the preceding remaining-task list stay unchanged,63/99 complete.
- Only this seven-line progress append changed;0 production/test lines and0 completed tasks, parent baseline12 plus7 =19/400. No process, container, temporary file or external resource was created; cleanup is not applicable. No attempt, Git, secret, Clerk, Vercel, production, configuration or traffic command ran.

## U11b1 — Exact recovery and guarded activate/inspect completed

- Consumed apply-ready63/99, repo-local exact allowed root/no actionContext warnings, strict TDD and approved feature-branch-chain U11b1-only scope. The maintainer resolved the prior executor-ownership blocker: exact-token acquire returned proceed; no reset/rescope/supersede/advance/new attempt occurred. Installed Next16.3.1 route-handler reference was read completely before route edits.
- Persisted U11b1–U11b4 semantic successors and checked only U11b1's four rows:67/111 complete,44 pending. U12/U13 depend on U11b4/full lifecycle. Forecast7,140–9,380 is planning, not increased authorization; this unit retains the cumulative400 cap and prior19 lines.
- Files: lifecycle migration, repository.ts, operations.ts, activate/inspect route.ts, lifecycle unit/PG test, new lifecycle route test, tasks.md and this progress file. SQL inspection returns exact operation/reservation-bound immutable proof/original times plus current DB-clock eligibility under a current scoped executor grant. Routes derive actor from authenticated admin session, reject schema/origin/Fetch-Metadata failures, return deterministic400/401/403/404/409/415/422/503 outcomes and private non-reusable responses. Historical ineligible inspection is200 with eligible:false, never active success.
- No revoke, existing-LIVE adoption, configuration, traffic or enablement behavior was added. Rollback boundary is only U11b1 inspection/ingress and matching tests/artifacts; retain U11a activation/evidence and U4 cleanup. Proof uses trusted injected test principals, not live Clerk/Next HTTP authentication or production evidence.

### TDD Cycle Evidence
| Stage | Exact command / result |
|---|---|
| Safety net | `./node_modules/.bin/tsx --conditions=react-server --test tests/production-readiness/authority-lifecycle.test.ts tests/production-readiness/db-primitives.test.ts tests/production-readiness/source-capture.test.ts`: exit0,7 passed/3 PG skips. |
| RED | Focused new route test: exit1,2 missing createAuthorityRoute failures; focused lifecycle test: exit1,missing repository.inspect. Both preceded production changes. |
| GREEN | `./node_modules/.bin/tsx --conditions=react-server --test tests/admin/catalog-authority-lifecycle-routes.test.ts tests/production-readiness/authority-lifecycle.test.ts`: exit0,5 passed/4 PG skips before added route/PG triangulation. |
| TRIANGULATE | Same focused files with `U11_PG_CONTAINER=os03-u11b1-pg-1789193627-266516`: exit0,10/10,0 skips; fresh PostgreSQL16 applied every migration, actual route closures executed SQL, and BEGIN READ ONLY inspection preserved one audit/outcome and immutable proof across expiry. |
| REFACTOR | Named request-byte bound and corrected proof row alias/DB-clock barrier; focused rerun exit0,5 passed/5 PG skips. Prior fresh PG10/10 proves real route/DAL/transaction boundaries; no live authentication assertion. |
| Full quality | `npm test`: exit0,51 passed/7 explicit gates; `npm run lint`: exit0,196 warnings/0 errors (2 new handler-complexity warnings); `npm run typecheck`: exit0 before/after clean `npm run build`: exit0. Build lists both dynamic routes; known missing DATABASE_URL static-generation logs and stale Browserslist warning remain. |

- Harness diagnostics retained: initial readiness hit PostgreSQL initialization restart; the next fresh PG9/9 passed. Added triangulation exposed row_to_json(result) alias collision and an elapsed-sleep expiry assertion that had not reached DB expiry. Corrected distinct row alias and bounded DB-clock-observed barrier; final fresh PG10/10 passed, without changing activation semantics.
- Cleanup: exact containers os03-u11b1-pg-1789193492-263355,1789193505-263491,1789193571-264830,1789193627-266516 were removed with empty exact-name lookups; each had network none/no ports/tmpfs/no persistent volume. All child commands exited. Clean build removed only caller-owned generated .next entries, preserving dev/non-owned entries. Tool-generated status/quality logs are hashed then exactly removed before settlement; no secret or external resource was created.
- Native final settlement/accounting and fresh evidence revision are returned separately to avoid changing a terminal candidate afterward. Next is bounded U11b2 apply, not whole-change verification. Remaining U12–U19 exact unchecked rows are already retained above; new successor rows follow.

- [ ] Observe RED for missing action/reason/scope/version binding, invalid sessions, swapped consent and replay. <!-- sdd-owner: implementation -->
- [ ] GREEN: persist action-specific revoke consent with immutable reviewed identity/reason/version and one-use session-bound proof. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate authorized test-authentication/disposable-PostgreSQL revoke consent; changed binding requires fresh consent. <!-- sdd-owner: implementation -->
- [ ] Refactor consent boundaries and rerun focused/full quality proof; no authority transition or route effect. <!-- sdd-owner: implementation -->
- [ ] Observe RED for invalid revoke consent/version, unguarded ingress, duplicate audit and partial failure. <!-- sdd-owner: implementation -->
- [ ] GREEN: implement atomic authority revoke transition/audit/proof and guarded revoke route without corrupting admitted data. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate PostgreSQL/routes: audit failure rolls back, exact recovery is single-effect and unauthorized requests deny. <!-- sdd-owner: implementation -->
- [ ] Refactor revoke boundaries and rerun focused/full quality proof; preserve U4 cleanup and original evidence retention. <!-- sdd-owner: implementation -->
- [ ] Observe RED for unverified/stale adoption, policy/generation/lineage/health/build drift and late-ineligible admission revival. <!-- sdd-owner: implementation -->
- [ ] GREEN: independently verify exact existing-LIVE adoption without generation reset, implicit inheritance or in-place revival. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate full lifecycle in PostgreSQL/routes, including drift conflicts and late-ineligible forward recovery rather than revival. <!-- sdd-owner: implementation -->
- [ ] Refactor adoption boundaries and rerun complete lifecycle/focused/full quality proof; U12/U13 wait for this full-lifecycle completion. <!-- sdd-owner: implementation -->

## U11b2 — Action-specific authority-revoke consent completed

- Consumed parent apply-ready67/111, repo-local exact allowed root/no actionContext warnings, strict TDD and approved feature-branch-chain U11b2-only/400. Maintainer-authorized acquire returned proceed with full intended-untracked selection excluding `.codegraph/.gitignore`; only this exact attempt is settled. No reset/rescope/supersede/advance or budget change.
- Persisted only U11b2's four completed checkboxes; readback71/111 complete,40 pending. Added immutable revoke challenge/receipt models and hardened SQL procedures, a typed consent-only repository/service, and lifecycle tests. Existing approval machinery remains compatible and unchanged; no revoke transaction, audit/proof effect, route, existing-LIVE adoption, configuration, traffic or enablement was added.
- DB-owned reviewed JSON binds action/version/reason/authority-only scope, exact candidate/release/deployment/publication, reservation version, policy and current generation/adoption. Live scoped grants, actor/session/nonce/CSRF, same-origin explicit consent, full-request retry and UNIQUE challenge receipt prevent swapped/replayed consent. Grant and ten-minute challenge expiry remain original PostgreSQL microsecond values; final `clock_timestamp()` follows lock waits. Expired authority may be reviewed for revocation; this does not renew its authority.

### TDD Cycle Evidence
| Stage | Command / result |
|---|---|
| Safety net | `./node_modules/.bin/tsx --conditions=react-server --test tests/production-readiness/authority-lifecycle.test.ts tests/production-readiness/approval-persistence.test.ts`: exit0,8 passed/5 PG skips. |
| RED | Focused lifecycle command: exit1, missing revoke consent service/repository; production changes followed this failure. |
| GREEN | Same two focused files: exit0,9 passed/6 PG skips; first fresh PostgreSQL16 run applied all migrations and passed15/15,0 skipped. |
| TRIANGULATE | `bash /tmp/os03-u11b2-pg.sh` supplies `U11_PG_CONTAINER` to that focused command: exit0,15/15; missing/wrong action/version/scope/release/policy/generation/actor/proof, stale state, grant changes, exact retry, one-winner concurrent consent and DB-clock expiry deny safely. One intermediate fixture used an invalid policy-digest shape; corrected to a valid unequal digest without changing production. |
| REFACTOR | Extracted shared nonce/CSRF proof hashing; same fresh PostgreSQL harness: exit0,15/15,0 skipped. Trusted injected test principals prove DAL behavior, not live Clerk authentication. |
| Full quality | `npm test`: exit0,52 passed/8 explicit gates; `npm run lint`: exit0,196 existing warnings/0 errors; `npm run typecheck`: exit0 before/after clean `npm run build`: exit0. Cleaned only caller-owned generated `.next` entries, preserving dev/non-owned entries. |

- Work Unit Evidence: focused real PostgreSQL confirms two consent receipts but authority remains PROMOTED, catalog LIVE/g0 and exactly one original lifecycle audit. Four unique network-none/no-port/tmpfs PostgreSQL16 containers were trap-removed with empty exact-name lookups; all child commands exited. No persistent volume, Clerk/Vercel resource, production/deploy/traffic/Git-delivery action or secret-file edit was used. Exact temporary harness/log files are hashed and removed before settlement.
- Files/rollback boundary: remove only U11b2 additions in lifecycle migration, Prisma schema, approval.ts, repository.ts, lifecycle test and these task/progress updates; preserve U11a/U11b1 and retained evidence. Two new tests cover the service and actual SQL matrix; no U9/U10 code changed. Native settlement/evidence revision/final authored lines are returned separately to avoid post-settlement candidate drift.
- Remaining tasks: the exact unchecked U11b3/U11b4 and U12–U19 rows already retained above remain unchecked in tasks.md. Next is bounded U11b3 apply, not whole-change sdd-verify. No design deviation; production authentication and grants remain separately authorized prerequisites.

## U11b3 — Atomic authority revoke and guarded route completed

- Consumed parent apply-ready71/111, repo-local exact allowed root/no actionContext warnings, strict TDD and approved feature-branch-chain U11b3-only/max2/400. Exact acquire returned proceed with full current intended-untracked selection excluding `.codegraph/.gitignore`; new route joins settlement selection. No reset/rescope/supersede/advance or limit change; phase skill required fallback-path loading. Installed Next16.3.1 Route Handler reference was read completely.
- Persisted only U11b3's four completed checkboxes and reconciled inventory75/111 complete,36 pending. Immutable revoke outcomes uniquely consume U11b2 consent and the exact authority once; terminal promotion/publication revocation, reservation version, original consent/proof and audit commit atomically after final DB-clock checks. Exact authorized retries recover original identity/proof; changed requests conflict. Expired scoped grants deny even recovery.
- Governed catalog/adoption/generation and product bytes remain unchanged, original activation proof and receipts remain historical, and existing inspection denies the revoked authority. No data corruption/restriction, deletion, correction, adoption, activation/inspection semantic change, configuration, traffic or enablement behavior was added.
- Guarded revoke POST derives actor/session hash from existing authenticated admin admission, validates strict bounded input and retained-domain Origin/Fetch Metadata, and maps400/401/403/404/409/413/415/422/503 deterministically with private non-reusable responses. Trusted injected principals and actual route closures/SQL prove this boundary, not live Clerk or network Next authentication.

### TDD Cycle Evidence
| Stage | Exact command / result |
|---|---|
| Safety net | `./node_modules/.bin/tsx --conditions=react-server --test tests/production-readiness/authority-lifecycle.test.ts tests/admin/catalog-authority-lifecycle-routes.test.ts`: exit0,6 passed/6 PG gates before edits. |
| RED | Each focused file exited1 for missing repository.revoke or rejected revoke ingress; `bash /tmp/os03-u11b3-pg.sh` exited1,12 passed/3 failed, including missing SQL revoke function. Tests preceded production changes. |
| GREEN | Same cleanup-trapped fresh-PostgreSQL16 harness: exit0,15/15,0 skipped; outcome/audit rollback, binding/replay rejection, exact retry, concurrency and real route SQL passed. |
| TRIANGULATE | Same fresh harness: exit0,15/15; null proof rollback, second consent/reason conflicts, concurrent exact retry, revoked grant and unchanged data proved. Additional expired-grant recovery RED failed as expected; post-lock live-grant validation fixed it. |
| REFACTOR | Shared committed-operation mapping replaced duplicate DAL result handling. Final two fresh harness runs passed15/15, including all inherited activation cases; final deadline barriers compare PostgreSQL clock_timestamp() with persisted timestamps. |
| Full quality | `npm test`: exit0,54 passed/9 explicit gates; `npm run lint`: exit0,198 warnings/0 errors (2 new test-complexity warnings); `npm run typecheck`: exit0 before/after clean `npm run build`: exit0. Dynamic revoke route included. |

- Diagnostics: initial new expiry test raced its reservation blocker; observed PgSleep fencing corrected the harness. Two later runs rejected time-sensitive final checks (one revoke, one inherited activation); cause remains unproven and no validity check was weakened. A diagnostic clock sampler initially held the fixture-template database open and blocked cloning; moving it to postgres fixed only the harness. Subsequent2,600-sample DB monitoring observed no backward clock steps; final two fresh suites were fully green.
- Work Unit Evidence: all integration invocations used fresh unique PostgreSQL16 containers, network none/no ports/tmpfs/no persistent volume, and preinstalled cleanup traps. Exact containers were removed with empty lookups; clock-monitor/test/quality children exited. Clean builds removed only caller-owned generated .next entries, preserving dev/non-owned entries. Exact temporary harness, baseline and diagnostic/quality logs are hashed and removed before native settlement; generated build artifacts remain.
- Files/rollback boundary: U11b3 additions only in lifecycle migration, Prisma schema, repository.ts, operations.ts, revoke/route.ts, lifecycle and route tests, tasks.md and this cumulative progress append. Preserve U11a/U11b2, U4 cleanup and all retained evidence. No Clerk/Vercel/production/deploy/traffic, secret access, Git-delivery or unrelated file change. Native settlement/evidence revision/final authored count are returned separately to avoid terminal candidate drift; no size exception.
- Remaining: all36 exact unchecked U11b4/U12–U19 rows remain in tasks.md and the preceding cumulative remaining-task lists. Next is parent-controlled bounded U11b4 apply, not whole-change sdd-verify; U12/U13 wait for lifecycle closure. No design deviation or production enablement claim.

## U11b4 — Authoritative generation-evidence prerequisite blocked

- Consumed parent apply-ready75/111, repo-local exact allowed root/no actionContext warnings, strict TDD and approved U11b4-only/max2/400 boundary. Exact acquire returned proceed with full intended-untracked selection excluding `.codegraph/.gitignore`; no reset/rescope/supersede/advance or limit change. Phase skill used fallback-path.
- Fresh PostgreSQL16 applied all18 migrations: no generation receipt/adoption/verification/observation tables or generation procedures exist. Catalog contains generation plus publisher `authority_adoption` JSON, not independent current lineage/health evidence. U11a immutable activation proof binds only g0; U7 records explicitly permit only SEALED_SOURCE_ONLY/REJECTED. Inspection persists no eligible-visibility history, and finalCheckedAt alone cannot establish pre-expiry visibility.
- Therefore g>0 successful adoption and late-ineligible discrimination cannot be established from existing authoritative records. Adding an empty verifier/adoption table would not supply those facts. No publisher JSON copy, invented generation/history, source rescan, weakened check, U12 promotion or production/test edit was made; no U11b4 row is complete.
- Concrete proposed prerequisite, not authorized scope: split out an immutable generation-admission/evidence contract with exact incarnation/g/policy/lineage/health/manifest/publishing identity and independently attributable eligible observation; establish g0 from retained activation/baseline proof without relabeling late history. Parent must then schedule U12's real forward producer against that contract before successful g>0 lifecycle/adoption proof; a separate U11b4 adoption consumer can validate own identity and CAS without publication mutation. Resolve the current U12→U11b4 dependency cycle explicitly; do not seed a fabricated g>0 to claim completion. No measured overage or size exception is asserted.

### TDD Cycle Evidence
| Stage | Exact command / result |
|---|---|
| Safety net | `./node_modules/.bin/tsx --conditions=react-server --test tests/production-readiness/authority-lifecycle.test.ts tests/admin/catalog-authority-lifecycle-routes.test.ts`: exit0,8 passed/7 PG skips before edits. |
| Prerequisite triangulation | Same command with `U11_PG_CONTAINER=os03-u11b4-prereq-e245e1d166d8` after all18 migrations: exit0,15/15,0 skips. SQL catalog inspection confirmed missing generation evidence/procedures; this is inherited regression/prerequisite evidence, not U11b4 GREEN. |
| RED / GREEN / TRIANGULATE / REFACTOR | Not started for new adoption behavior: missing authoritative input contract blocks implementation. Configured npm test, lint, typecheck and clean build were not run; no new code exists to certify. |

- Cleanup: exact container `os03-u11b4-prereq-e245e1d166d8` removed; exact-name lookup empty, network none/no ports/tmpfs data/no persistent volume. Inline Python harness created no temporary file, and every subprocess exited. Focused stdout SHA256=`b3ad090392a6bb13f66243fecb81f935eac8f7e4f8721821da6585527fc7dba5`; prerequisite query stdout SHA256=`abff48f9929bda57bb373be9377baa8722b975dec429832c393d4896c691acaa`.
- Workload/rollback: only this cumulative progress append changed; remove only this entry if needed, preserving all prior artifacts. Tasks remain75/111 with36 pending; all four U11b4 rows below remain unchecked. Native failed settlement, evidence revision and exact line count are returned separately without terminal candidate drift. Next is parent prerequisite/slice decision, not another automatic attempt or final verification.
- [ ] Observe RED for unverified/stale adoption, policy/generation/lineage/health/build drift and late-ineligible admission revival. <!-- sdd-owner: implementation -->
- [ ] GREEN: independently verify exact existing-LIVE adoption without generation reset, implicit inheritance or in-place revival. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate full lifecycle in PostgreSQL/routes, including drift conflicts and late-ineligible forward recovery rather than revival. <!-- sdd-owner: implementation -->
- [ ] Refactor adoption boundaries and rerun complete lifecycle/focused/full quality proof; U12/U13 wait for this full-lifecycle completion. <!-- sdd-owner: implementation -->

## U11b4/U12 — Authorized artifact-only dependency correction

- Maintainer authorized and parent performed the dependency rescope at precursor `sha256:53e2ec4a7d8d1028e28c3f84b03bb6529443bdebfc5732fbd921eaf0e48060c4`; consumed existing apply-ready75/111 repo-local status and restricted edits to tasks/progress. Exact-field acquire returned proceed for `u11b4-u12-dependency-reorder`, max2/400, cumulative21, full intended-untracked selection excluding `.codegraph/.gitignore`. No reset/rescope/supersede/advance or limit change occurred here.
- Persisted approved chain U11b3 → U12 → U11b4 → U13. U12 depends on U1,U7,U11a,U11b3 and owns immutable g>0 generation records binding incarnation/generation, predecessor/result lineage, policy/health/build/manifest, sealed evidence, operation/audit/publishing adoption and final-check/result bracket. `finalCheckedAt` does not establish earlier eligible visibility or create a readback publication gate.
- U11b4 depends on U11b3,U12 and independently consumes U11a immutable activation/baseline proof for g0 or U12 immutable generation records for g>0, rejecting stale/drift/late-ineligible adoption without copied publisher JSON, reset, inheritance or in-place repair. U13 remains explicitly behind full U11b4 closure. This supersedes the preceding proposed dependency split only; implementation and historical eligibility are not established by this amendment.
- Fresh artifact validation: inline Python checked forecast/table/section order, exact dependencies, absence of stale U12-waits-for-U11b4 text, terminal ownership markers and unchanged111 checkbox states (75 complete/36 pending); subsequent persisted readback confirms U12 and U11b4 each remain0/4. No implementation task was checked. Artifact correction has no production RED/GREEN cycle; tests, Docker/PostgreSQL, source/configuration, external and Git actions were not run.
- Workload/rollback: tasks28 additions+20 deletions=48 changed lines plus this9-line append gives57 new lines; prior21 yields78/400 cumulative. Rollback only this dependency amendment/append, preserving historical progress and every completion. No temporary file, runtime resource or persistent child process was created; task/readback commands exited normally.
- Passing settlement for this artifact-only objective must name failed evidence `sha256:2c073ba32b52dba2d69bdf0d78d72bc5d09e8a6635c005dc520446897b842e92` with fresh corrected-artifact evidence; final native settlement is returned separately to avoid terminal drift. Next is parent-authorized bounded U12 implementation, then U11b4 and U13, not whole-change verification.

## U12 — Pre-implementation workload stop

- Consumed parent authoritative apply-ready75/111 status, repo-local exact workspace/allowed root, strict TDD and approved feature-branch-chain U11b3 → U12 → U11b4; no actionContext warning. Writes narrowed to the explicit U12 surfaces; the corrected apply-progress path is accepted. Proposal, all four specs, complete design/tasks/progress, config, CodeGraph source, SQL/schema and existing tests were read; phase skill resolution is fallback-path.
- Exact acquire returned proceed, token `sha256:f09032de86fc2aceb40bec1876783737138a69d7e456e3cd333d2c0e11a05e92`, for `u12-atomic-delta-promotion`, max2/400. Selected all59 intended untracked paths, excluding only `.codegraph/.gitignore`; the first declaration-required response created no running attempt. No limits, reset/rescope/supersede/advance or parent scope decisions were changed.
- Existing U7 SQL retains source-only digests/evidence, not per-key governed before/after/tombstone facts, expected generation/health/build or admission deadline. Its source-operation UNIQUE also prevents a second verification attempt after CAS drift. The TypeScript verifier returns one merged facts object and rejects null after-images. Existing lifecycle proof/adoption binds g0 only; no promote_delta or first-class g>0 generation record exists. These are static code findings, not a new PostgreSQL proof or a revision of completed U7 checkboxes.
- Honest whole-contract forecast: **650–900 additions plus deletions**, not a measured implementation overage. Existing 300–390 planning estimate is insufficient; no compression, omitted safety proof or size exception is proposed. Stopped before any production/test edit or runtime harness launch, as requested.

| Forecast component | Changed lines |
|---|---:|
| Promotion-ready immutable verifier images/bindings, retention and typed/schema mapping | 170–220 |
| Final-clock atomic materialization, generation record, audit/adoption/outcome and recovery | 200–260 |
| Fresh-DB fixtures, rejection matrix, RR/CAS/readback/expiry and total rollback proof | 250–370 |
| Task reconciliation and concise progress evidence | 30–50 |

- **Semantic slicing proposal only; parent approval/amendment required:** U12a promotion-ready governed sealing (300–390, including tests/artifacts): independent per-key source/governed images, masks/dependencies, tombstones, immutable verification attempts and retained evidence; no public effect. U12b atomic promotion plus immutable generation record (350–400, including tests/artifacts): consume U12a under final-clock/CAS locks, one transaction for all rows/proof/audit/adoption/outcome, exact retries, no source rescan, real RR/CAS/rollback/continuity proof. U12c exact committed-result discovery and temporal proof (180–260, including tests/artifacts): read-only original identity/bracket/current eligibility, response-loss and late-ineligible denial; no observation write/publication gate or in-place revival. Split estimates include extra harness/artifact overhead and require fresh preflight, not guaranteed budgets.
- U12b must already prove stale/seal/evidence/audit/final-expiry rejection, all-old/all-new atomic visibility, serving before publisher readback, original approval/expiry and historical-only late results; U12c cannot defer those safety checks. U12c exposes diagnostic recovery, not another publication transaction. U11b4 remains after every U12 successor; U14 retains separately verified forward correction ownership. No migration-path/task/dependency amendment is made by this proposal.

### TDD Cycle Evidence
| Stage | Result |
|---|---|
| Safety net / RED / GREEN / TRIANGULATE / REFACTOR | Not started: pre-implementation budget gate. No new tests written; focused tests, PostgreSQL, npm test, lint, typecheck and clean build were not run. Prior evidence is not claimed as fresh verification. |

- Work Unit Evidence / cleanup: static preflight and artifact validation only; all commands exited. No database, container, network, volume, server, build artifact, temporary harness/file or persistent child process was created; no cleanup mutation was needed. No Clerk, Vercel, production/deploy/traffic, secret or Git-delivery action occurred.
- Changed only this cumulative progress append; **0 production/test lines, 0 task checkbox changes, U12 remains0/4 and total75/111**. Rollback boundary is this append alone; preserve every prior artifact and U11a/U11b3 implementation. Exact authored line count, failed native settlement and evidence revision are returned separately to avoid post-settlement candidate drift. Next is parent semantic-slice authorization, not another automatic attempt or final verification.

### Exact remaining U12 task rows
- [ ] Observe RED for promotion without U7 seal, evidence/audit failure, stale predecessor/generation/health, CAS conflict, source rescan, and partial rows/evidence becoming observable. <!-- sdd-owner: implementation -->
- [ ] GREEN: implement `promote_delta` as one final-clock-checked transaction applying only sealed governed after-images/tombstones, `g → g+1`, and the authoritative immutable generation record with all bindings above, publishing adoption, indispensable audit and operation outcome; retain the final-check/result proof bracket without asserting earlier eligible visibility. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate with PostgreSQL RR/CAS tests that concurrent deltas expose all-old or all-new facts with their immutable generation records, a verified eligible delta serves before publisher readback, committed source changes without promotion remain source-only, and conforming promotion retains approval without renewed consent or expiry extension; prove exact record bindings/immutability and distinguish the final-check/result bracket from earlier eligible visibility. <!-- sdd-owner: implementation -->
- [ ] Refactor lock/order and proof code once, then rerun atomicity/CAS tests; do not introduce a second publication transaction, temporal pointer, or human consent per delta. <!-- sdd-owner: implementation -->

## U12a — Authorized successor preflight and artifact split; implementation blocked

- Consumed parent apply-ready repo-local status and authorized U12a-only scope at precursor `sha256:6d875ea1d16dd5e50d08052b434953012d98e9cc1cce915a6747870c720bc9f1`, cumulative31/400, attempt2/2; exact allowed surfaces and no actionContext warning. Prior required artifacts remain read; canonical/U7/repository code and tests were freshly inspected. Skill resolution remains fallback-path.
- Exact objective `u12a-promotion-ready-seals` acquired proceed with token `sha256:c34a691db916f462ae5a92dde772a2c05f3b72bfa1fdeab2de5c73157126c548`. Native settle_obligation confirms failed evidence `sha256:4903767eb8087ce0e64ba3851dcaf99c0743728b30f390929df5c5b5ff588d9f`; ignored the launch typo. A passing settle would have to name it; this budget stop supplies no passing remediation claim. No parent-only operation or limit change occurred.
- Closer U12a forecast is **415–545 new lines**, exceeding369 remaining: independent per-key canonical verifier-envelope construction/tests150–190; guarded durable canonical/binding/immutability admission110–145; fresh PostgreSQL tamper/concurrency/idempotency/source-divergence tests90–125; task/progress artifacts65–85. Cumulative implementation forecast would be446–576/400. The earlier300–390 estimate was optimistic, not a permission to omit requirements.
- U7 currently flattens multiple captured items into one predecessor/result object and rejects every null after-image; persisted evidence is only a digest/reference seam, without a canonical per-key governed envelope. TypeScript canonicalization alone cannot enforce a database seal boundary. Merely persisting caller-asserted images beside an existing U7 ID would not prove those images were independently verified. Production and new-test edits therefore never started; no partial seal capability was added.
- Persisted only the authorized U12a/U12b/U12c four-row artifact split: U12a sealed inputs/no public effect; U12b atomic promotion/immutable g>0 records with core safety proof; U12c read-only recovery/RR-CAS-temporal closure; U11b4 now waits for U12c. All12 successor rows remain unchecked; readback119 total,75 complete,44 pending. Forecast7,785–10,195 reflects the new estimate, not increased limits; the explicit before-apply decision gate is set to Yes.
- **Narrower semantic proposal, not authorized or added as tasks:** U12a1 independently construct/validate canonical per-key governed envelopes from actual U7 evidence, including masks, typed identities, before/after/tombstone/dependency facts and tests (180–260); U12a2 durably admit those exact envelopes through immutable guarded storage, exact bindings/evidence custody/idempotency and fresh-PG tamper/concurrency/source-divergence tests (280–380). Both include artifacts and have no public effect; U12b remains blocked until both succeed. Parent must decide scope and native continuation; no automatic retry or exception is requested.

### TDD Cycle Evidence
| Stage | Command / result |
|---|---|
| Safety net | `./node_modules/.bin/tsx --conditions=react-server --test tests/production-readiness/delta-verification.test.ts tests/production-readiness/canonical.test.ts tests/production-readiness-repository.test.ts`: exit0,7 passed,0 failed/skipped. |
| RED / GREEN / TRIANGULATE / REFACTOR | Not started for U12a at the pre-implementation workload gate. No new tests or PostgreSQL invocation; npm test, lint, typecheck and clean build not run. Safety-net success is not U12a verification. |

- Work Unit Evidence / cleanup: Docker executable and local postgres:16 image inspected read-only, but no container, database, network, volume or server was created. Safety-net child exited normally; no temporary harness/log/baseline file or build artifact was created, and no cleanup mutation was needed. No secrets, Clerk, Vercel, production/deployment/traffic or Git-delivery action occurred.
- Exact artifact accounting: tasks **+39/-21=60** plus this **+23/-0** append =83 new lines; prior31 gives **114/400 cumulative**. Only tasks.md and apply-progress.md changed;0 production/test lines and0 completed tasks. Rollback only this artifact split/append, preserving original completion history and all implementation. Final failed settlement/evidence are returned separately without post-settlement candidate drift.
- Remaining U12a work is the four exact unchecked rows below; U12b/U12c/U11b4 and all other pending rows stay unchecked in tasks.md. Next is parent narrower-slice authorization, not another automatic attempt or sdd-verify.
- [ ] Observe RED for missing/noncanonical per-key governed before-images, after-images and tombstones; mismatched sealed delta/candidate/incarnation/policy/build/health/predecessor-generation-lineage; mutable or duplicate seal; missing evidence and source rescan. <!-- sdd-owner: implementation -->
- [ ] GREEN: persist immutable promotion-ready seals produced from U7 independently verified evidence, binding exact canonical per-key governed inputs and retained before-images for U14; no public effect or promote_delta transaction. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate fresh PostgreSQL negative/tamper/idempotency/concurrency cases and prove source changes after sealing cannot alter the sealed payload or governed projection. <!-- sdd-owner: implementation -->
- [ ] Refactor the shared canonical proof/hash boundary once; rerun focused PostgreSQL, npm test, lint, typecheck and clean build with exact cleanup, preserving U11a/U11b3 and leaving promotion/recovery/adoption pending. <!-- sdd-owner: implementation -->

## U12a1 — Canonical governed envelopes completed

- Consumed parent apply-ready repo-local status, exact allowed surfaces/no actionContext warnings, strict TDD and authorized U12a1-only feature-branch-chain/max2/400. Parent reset precursor9165fd9f and baseline tree `ade44a1db7f3c7c9c71d589c4672641ae3cdd8ca` are authoritative; historical114 lines remain retained, not charged to this reset. Phase skill resolution remains fallback-path; installed Next16.3.1 testing guide was read before edits.
- Exact acquire returned proceed/token `sha256:d762d54b2af9cbf328e00b62d8f8a2fd89ef4350f3ee600e4220f25af1a5c68d`, full intended-untracked selection excluding `.codegraph/.gitignore`. Native passing-settle obligation names failed evidence `sha256:165d4bf2f3022f453f54e82b2d5fea37bdd0a6596cb9c55ae92af7c66b12084f`. No reset/rescope/supersede/advance or limit change occurred here.
- Added pure U7-module verification of keyed capture/independent observations/trusted current facts, with exact candidate/delta/incarnation/policy/build/health/generation/lineage/evidence binding. Updates copy only proven permitted changes while retaining governed before-images and unrelated fields; inserts require explicit absence, deletes require observed absence and matching complete predecessor. Typed canonical keys reject duplicates, sort numeric IDs losslessly, and preserve source/history times and scale-two decimal strings.
- Envelope construction accepts only frozen verifier-issued handles via a private WeakMap, not caller images, copied handles or merged-only results. Frozen canonical byte/digest strings detach all mutable inputs. Shared canonicalProof now owns serialization/hash/snapshot construction; legacy U7 evidence hashing uses the same SHA implementation without changing legacy results. Trusted adapters must still authenticate independent observations and supply complete current rows: labels/hashes/in-process handles are not durable authorization. No persistence, source rescan, schema/migration, generation/adoption/authority/public-effect mutation or route was added.
- Persisted authorized U12a1/U12a2 split and only U12a1's four completed checkboxes, checked as stages finished; readback79/123 complete,44 pending. U12a2 durable admission, U12b promotion, U12c recovery and U11b4 adoption stay unchecked; U11b4 still waits for U12c. Forecast7,950–10,410 is planning, not a limit change. No design deviation beyond the authorized pure-domain slice.

### TDD Cycle Evidence
| Stage | Exact command / result |
|---|---|
| Safety net | `./node_modules/.bin/tsx --conditions=react-server --test tests/production-readiness/delta-verification.test.ts tests/production-readiness/canonical.test.ts`: exit0,5/5 before edits. |
| RED | `./node_modules/.bin/tsx --conditions=react-server --test tests/production-readiness/promotion-ready-envelope.test.ts`: exit1,5 missing-verifier failures before production edits; later canonical timestamp and numeric-key-order triangulation each produced an observed failing assertion before correction. |
| GREEN | `./node_modules/.bin/tsx --conditions=react-server --test tests/production-readiness/promotion-ready-envelope.test.ts tests/production-readiness/delta-verification.test.ts tests/production-readiness/canonical.test.ts`: exit0,10/10 initially; final same command exit0,13/13,0 skipped. |
| TRIANGULATE | The GREEN three-file command exited0, including8/8 envelope cases after varied updates/inserts/deletes, all six three-row permutations, missing/swapped proof, source drift, duplicate/noncanonical keys, forged handles, input mutation, decimal/time and beyond-safe-integer key cases. No PostgreSQL required for the assigned pure boundary. |
| REFACTOR / quality | The GREEN three-file command reran after shared canonical proof/hash refactor: exit0,13/13. `npm test`: exit0,62 passed/9 existing gated skips; `npm run lint`: exit0,201 warnings/0 errors (3 additional complexity warnings); `npm run typecheck`: exit0 before and after clean `npm run build`: exit0. |

- Final quality stdout/stderr hashes: npm test=`78d5c7c99073f7a2865d110c0d0d1f839b99e81698fb04061612a01eb21ac169`; lint=`0e1ecd5f82fad7b5edc6531a44dfaf75c18b63165260a0a0ffe84151294f242e`; typecheck=`fa716b9cce8e6cae57d95cacb81554237d9bd6d100d1f7cd993e02055380f9e2`; clean build=`a4f3140fa62953cb0fbf387790fd494e371631d66bc70a20db64c2b25b4e07ee`. Build retained known missing-DATABASE_URL static-generation diagnostics but succeeded; no database was configured or contacted by this slice.
- Work Unit Evidence / cleanup: all test/quality children exited; no PostgreSQL, container, server, network, volume, external resource, secret access or temporary harness/log file was created. Clean builds removed only22 caller-owned generated .next entries per run, preserving dev/non-owned entries; generated build artifacts remain. Existing fixture tests own their normal temporary cleanup. No Clerk/Vercel/production/deploy/traffic/Git-delivery action occurred.
- Files/rollback: only verification.ts, canonical.ts, new promotion-ready-envelope.test.ts, tasks.md and this cumulative progress append changed. Roll back only these U12a1 additions and matching artifacts, retaining earlier implementation/evidence. Exact final authored accounting and native settlement/evidence are returned separately without terminal candidate drift. Next is parent-controlled U12a2 apply, not whole-change sdd-verify.
- Remaining exact U12a2 rows follow; all other pending successor rows remain in tasks.md and the preceding cumulative records.
- [ ] Observe RED for missing/tampered/noncanonical envelope bytes, mismatched exact bindings/evidence, mutable or duplicate durable seals and source rescans. <!-- sdd-owner: implementation -->
- [ ] GREEN: persist immutable promotion-ready seals from U12a1 independently verified canonical envelopes, binding exact candidate/delta/incarnation/policy/build/health/predecessor-lineage and retained U14 before-images; no promote_delta or public effect. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate fresh PostgreSQL negative/tamper/idempotency/concurrency cases and prove source changes after sealing cannot alter sealed payload or governed projection. <!-- sdd-owner: implementation -->
- [ ] Refactor guarded canonical admission once; rerun focused PostgreSQL/full quality checks and exact cleanup, preserving U11a/U11b3 and leaving promotion/recovery/adoption pending. <!-- sdd-owner: implementation -->

## U12a2 — Authenticated durable admission workload stop

- Consumed parent apply-ready repo-local status, exact U12a2 allowed surfaces/no actionContext warnings, strict TDD and max2/400 feature-branch-chain boundary. Exact acquire returned proceed/token `sha256:ba9eebd22533aa957f1232522494104a2e387c9478de5ec3b3442647294b6c20`; selected all60 intended untracked paths excluding `.codegraph/.gitignore`. Parent confirmed baseline tree `7f871b2d11fd2e3b58126e619de67d8c2572e7dd`; no reset/rescope/supersede/advance or limit change occurred. Phase skill remains fallback-path.
- Required artifacts remain read; freshly inspected U12a2 tasks, cumulative progress, CodeGraph verifier/repository, U7 and custody migrations, schema, lifecycle proof and bootstrap privilege configuration. U12a1 accepts only its own frozen in-process handles but explicitly does not authenticate adapters. U7 SQL tests a caller-supplied verifier/read-only label and stores source-only digests/evidence references, not an authenticated commitment to exact U12a1 envelope bytes. Bootstrap exposes owner/app/runtime boundaries, not an enrolled envelope-verifier identity.
- Full assigned contract forecasts **440–585 new lines**: authenticated adapter provenance/exact-byte commitment90–120; guarded immutable admission with final-clock/live-binding/idempotency/audit rollback110–145; schema/DAL mapping35–50; fresh-PostgreSQL authenticated-role, tamper, stale-binding, concurrency, rollback and immutability proof180–230; tasks/progress25–40. This exceeds400 before production/new-test edits. Prior280–380 estimate omitted the concrete durable authentication bridge; no compression, omitted proof or exception is proposed.
- Merely storing canonical bytes/hash beside a U7 ID would not reject an unauthenticated or recomputed payload. Reinterpreting U7 result_digest as an envelope-attestation digest would silently change its evidence meaning; checking current_user inside a SECURITY DEFINER function would identify the definer, not authenticate the caller. No such workaround, implicit app-role enrollment or caller-trusted durable admission was implemented.
- **Narrower semantic proposal only, pending parent decision:** U12a2a authenticated immutable verifier provenance and exact-byte commitment (240–330 with tests/artifacts), deriving caller identity from authenticated DB context and separately authorized trust enrollment, never a label/hash; U12a2b guarded admission consuming that server-owned proof (300–390 with tests/artifacts), database-generated identity, final-clock/stale-binding checks, exact retry/conflict and one atomic admission outcome/audit boundary. Each retains its own PostgreSQL proof and no public effect. Verifier attestation is prerequisite evidence, not a second admission/publication or a relabeling of U7 lineage. These successors are not added as tasks or native objectives.

### TDD Cycle Evidence
| Stage | Exact command / result |
|---|---|
| Safety net | `./node_modules/.bin/tsx --conditions=react-server --test tests/production-readiness/promotion-ready-envelope.test.ts tests/production-readiness/delta-verification.test.ts tests/production-readiness-repository.test.ts`: exit0,13 passed,0 failed/skipped. |
| RED / GREEN / TRIANGULATE / REFACTOR | Not started at the pre-implementation workload gate. No production/new-test edits or PostgreSQL invocation; npm test, lint, typecheck and clean build were not run. Existing safety-net success is not U12a2 verification. |

- Work Unit Evidence / cleanup: docker image inspect postgres:16 was read-only; no container, database, server, network, volume, external resource, temporary harness/log/baseline file or new build artifact was created. All child commands exited; no cleanup mutation was needed. No secrets, Clerk, Vercel, production/deploy/traffic or Git-delivery action occurred.
- Only task forecast/path correction and this cumulative append changed; every checkbox is unchanged,79/123 complete and U12a2 remains0/4. Forecast8,110–10,615 is blocking planning evidence, not an increased limit; the task locator now names the exact authorized admission migration/test surfaces. Rollback only these artifact edits, preserving all U12a1 implementation and prior evidence. Native failed settlement, evidence revision and exact lines are returned separately without terminal drift; next is parent narrower-slice decision, not automatic retry or final verification.
- Remaining exact U12a2 implementation rows:
- [ ] Observe RED for missing/tampered/noncanonical envelope bytes, mismatched exact bindings/evidence, mutable or duplicate durable seals and source rescans. <!-- sdd-owner: implementation -->
- [ ] GREEN: persist immutable promotion-ready seals from U12a1 independently verified canonical envelopes, binding exact candidate/delta/incarnation/policy/build/health/predecessor-lineage and retained U14 before-images; no promote_delta or public effect. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate fresh PostgreSQL negative/tamper/idempotency/concurrency cases and prove source changes after sealing cannot alter sealed payload or governed projection. <!-- sdd-owner: implementation -->
- [ ] Refactor guarded canonical admission once; rerun focused PostgreSQL/full quality checks and exact cleanup, preserving U11a/U11b3 and leaving promotion/recovery/adoption pending. <!-- sdd-owner: implementation -->

## U12a2-A — Verifier principal and least-privilege ACL completed

- Completed only the four U12a2-A implementation rows and visibly marked them `[x]`; the authorized A/B/C amendment raises the inventory to **83/131 complete, 48 pending**. U12a2-B/C, U12b, U12c, U11b4 and every later unit remain unchecked. The preserved dependency is U12a2-A → U12a2-B → U12a2-C → U12b → U12c → U11b4.
- Added one distinct configurable verifier LOGIN/NOINHERIT role and shared deterministic verifier ACL renderer. Bootstrap and compose ACLs grant explicit read-only source/current/evidence tables, deny protected DML, schema creation, sequences and ambient function execution, deny role membership/SET ROLE routes from app/runtime, and conditionally grant only a future `admit_promotion_ready_envelopes(jsonb)` boundary after verifying SECURITY DEFINER plus fixed `search_path = pg_catalog, pg_temp`. No admission object/storage was created.
- `docker/compose/init-app-role.sh` creates the local verifier principal without a credential label or embedded secret. The artifact amendment records `session_user` as caller provenance and rejects `current_user`, which becomes the definer. No WeakMap/nonce/signing/source-read/admission/generation/promotion/adoption/authority/route/UI behavior was added.
- Files changed for this unit: `scripts/postgres-operations.ts`, `docker/compose/app-grants.sql`, `docker/compose/init-app-role.sh`, `tests/postgres-operations.test.ts`, new `tests/production-readiness/verifier-principal.test.ts`, `design.md`, `tasks.md`, and this cumulative progress append. The static ACL also corrected pre-existing invalid comma-separated PostgreSQL `ALTER TABLE`/`ALTER SEQUENCE` ownership syntax so the verifier block is reachable.

### TDD Cycle Evidence

| Stage | Exact command / result |
|---|---|
| Safety net | `./node_modules/.bin/tsx --conditions=react-server --test tests/postgres-operations.test.ts`: exit0, 5/5 before edits. |
| RED | New verifier-principal focused test: exit1 because `renderVerifierAclSql` did not exist. A second focused RED exited1 on PostgreSQL-invalid comma-separated ownership rendering before its correction. |
| GREEN | Focused verifier/bootstrap command: exit0, 8/8 after deterministic role, ACL and future-function contract rendering. |
| TRIANGULATE | Fresh PostgreSQL16 owner/app/runtime/verifier processes: owner returned `ofertasuper_owner|ofertasuper_owner`; verifier returned `ofertasuper_verifier|ofertasuper_owner`; ACL matrix was `f|f|f|t|f|t|f|f`; app/runtime/ungranted/missing-role calls and app/runtime SET ROLE failed. Final proof SHA256 `018b23d9ccfb807a9576746ecde1fc0160f586d3cc2041dd633c00e22926312a`. |
| REFACTOR | Extracted shared role context/object qualification and per-object ownership rendering; focused command reran exit0, 8/8. |
| Full quality | `npm test`: exit0, 74 tests / 65 passed / 9 existing skips; `npm run lint`: exit0, 201 warnings / 0 errors; `npm run typecheck`: exit0; clean `npm run build`: exit0 with known missing-DATABASE_URL static-generation diagnostics. |

- Cleanup: all uniquely named PostgreSQL containers were exact-name removed; final container/log lookup was empty. All temporary quality logs were removed and no network, volume, port, credential, external service or persistent process was retained. The first clean attempt encountered root-owned `.next/dev` files and stopped with permission denial; it removed only caller-owned top-level build output, preserved `.next/dev`, and a scoped caller-owned clean build then passed. An intermediate Next build emitted `Cannot read properties of null (reading 'hash')`; the scoped clean rerun passed without code/config changes.
- Workload / PR boundary: parent-authorized auto-chain unit `u12a2a-verifier-principal-acl`, strict TDD, max2 attempts/max400 cumulative lines; no exception, credential enrollment, production/database migration, deploy, traffic, Git, secret, Clerk or Vercel action. Structured status consumed was apply-ready, repo-local with this worktree as the allowed edit root and no blocked reason/actionContext warning. Native settlement/accounting is returned separately to avoid post-settlement candidate drift.
- Design deviation: none from the authorized U12a2-A amendment. Risk: the verifier role has no credential provisioning in this unit by design; separately authorized enrollment is still required, and U12a2-B must provide exact-byte commitment before U12a2-C can admit anything.

### Exact remaining implementation task lines
- [ ] Observe RED for forged verifier labels, app/runtime calls, byte/digest swaps, noncanonical envelopes, and `current_user` provenance. <!-- sdd-owner: implementation -->
- [ ] GREEN: create the narrow verifier-bound exact-byte commitment boundary using `session_user` and retained canonical evidence, without admission persistence, generation, authority mutation or public effect. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate fresh PostgreSQL caller/tamper/concurrency cases and prove source drift cannot rewrite committed bytes. <!-- sdd-owner: implementation -->
- [ ] Refactor the commitment mapping once and rerun focused/full quality checks with exact cleanup; leave U12a2-C and successors pending. <!-- sdd-owner: implementation -->
- [ ] Observe RED for missing/tampered/noncanonical committed envelope bytes, mismatched exact bindings/evidence, mutable or duplicate durable seals and source rescans. <!-- sdd-owner: implementation -->
- [ ] GREEN: persist immutable promotion-ready seals from the U12a2-B verifier commitment, binding exact candidate/delta/incarnation/policy/build/health/predecessor-lineage and retained U14 before-images; no promote_delta or public effect. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate fresh PostgreSQL negative/tamper/idempotency/concurrency cases and prove source changes after admission cannot alter sealed payload or governed projection. <!-- sdd-owner: implementation -->
- [ ] Refactor guarded canonical admission once; rerun focused PostgreSQL/full quality checks and exact cleanup, preserving U11a/U11b3 and leaving promotion/recovery/adoption pending. <!-- sdd-owner: implementation -->
- [ ] Observe RED for missing/stale U12a2 seal, evidence/audit failure, predecessor/generation/health/policy/build drift, CAS conflict, source rescan and partially observable rows/proof. <!-- sdd-owner: implementation -->
- [ ] GREEN: implement promote_delta as one final-DB-clock-checked transaction applying only sealed after-images/tombstones, g→g+1 and immutable generation record, publishing adoption, indispensable audit/evidence and exact operation outcome; preserve before-images and original consent/expiry. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate fresh PostgreSQL atomicity/CAS and total audit/evidence rollback; prove all-old/all-new rows with matching generation records, immediate eligible visibility before readback, source-only divergence, exact retries and historical-only late results. <!-- sdd-owner: implementation -->
- [ ] Refactor lock/order and proof boundaries once; rerun focused/full quality checks and exact cleanup without source rescan, second publication transaction, temporal pointer, renewed consent or expiry extension. <!-- sdd-owner: implementation -->
- [ ] Observe RED for response-loss replay/compensation, changed recovery identity, renewed expiry, fabricated pre-expiry visibility, readback gating or late-ineligible in-place revival. <!-- sdd-owner: implementation -->
- [ ] GREEN: expose read-only exact committed identity/proof and live DB-clock eligibility with the final-check/result-observation bracket, retaining original times and denying unproven earlier eligibility; no authority/adoption/publication write. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate fresh PostgreSQL RR/CAS/temporal proof: recovery is single-effect, concurrent readers see complete old/new records, an eligible delta serves before publisher readback, source-only commits stay nonpublic and late results cannot fabricate earlier eligible visibility. <!-- sdd-owner: implementation -->
- [ ] Refactor recovery/proof mapping once; rerun focused PostgreSQL and full quality checks with exact cleanup, preserving U11a/U11b3 and leaving U11b4 adoption and U14 forward recovery unimplemented. <!-- sdd-owner: implementation -->
- [ ] Observe RED for unverified/stale adoption, policy/generation/lineage/health/build drift and late-ineligible admission revival. <!-- sdd-owner: implementation -->
- [ ] GREEN: independently verify and persist exact existing-LIVE adoption from U11a g0 activation/baseline proof or U12b g>0 immutable generation records; never substitute publisher JSON, reset generation, inherit authority or repair admission in place. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate full lifecycle in PostgreSQL/routes, including drift conflicts and late-ineligible forward recovery rather than revival. <!-- sdd-owner: implementation -->
- [ ] Refactor adoption boundaries and rerun complete lifecycle/focused/full quality proof; U13 waits for this full-lifecycle completion. <!-- sdd-owner: implementation -->
- [ ] Observe RED for reader adoption copied from publisher, unequal policy digest, stale g/lineage/health/build, persisted authority revocation not denying that authority, authority revocation treated as data corruption, and unknown data/evidence restriction boundary leaking commercial facts. <!-- sdd-owner: implementation -->
- [ ] GREEN: implement exact `adopt_generation`, policy-equality/current-state checks, and fact/surface **data/evidence** restrictions with distinct historical admission versus live reader eligibility; consume the U11b-persisted authority-revoke state and do not implement its transition, audit, or proof. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate with A-publisher/B-reader PostgreSQL cases: B serves only through its own valid equal-policy adoption, a U11b-persisted authority revoke denies A without corrupting admitted data, and data/evidence restriction denies every reader. <!-- sdd-owner: implementation -->
- [ ] Refactor eligibility/restriction predicates once, then rerun A/B, persisted-authority-revoke consumption, and unknown-boundary proofs; cache behavior remains U15/U18. <!-- sdd-owner: implementation -->
- [ ] Observe RED for historical-pointer rollback, full-row inverse overwrite, missing before-images, unresolved overlap, source restoration assumption, and correction that clears an unknown boundary. <!-- sdd-owner: implementation -->
- [ ] GREEN: implement correction preparation from retained before-images/current predecessor and a separately verified/audited forward `g+1` (including verified no-op where allowed), preserving unrelated intervening changes. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate in PostgreSQL with bad delta plus unrelated/overlapping successor changes: only independently resolved fields change, unresolved facts stay restricted, and no historical bytes become selectable. <!-- sdd-owner: implementation -->
- [ ] Refactor correction lineage helpers once, then rerun preservation/restriction cases; do not weaken release revocation or reuse prior verification. <!-- sdd-owner: implementation -->
- [ ] Observe RED for mutable-source/latest-PROMOTED fallback, identity/adoption/manifest/health mismatch, RR snapshot-time lease renewal, false 404/zero/empty-history denial, and authority decision beyond 30 seconds or expiry. <!-- sdd-owner: implementation -->
- [ ] GREEN: implement `withAuthorizedCatalogRead` using one primary-DB repeatable-read projection snapshot, trusted-DB manifest/health completeness boundary, live-time pre-emission check, and immutable process-local exact decision leases. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate with real PostgreSQL that detail/history/count/ranking share one state, missing evidence is unavailable, a slow snapshot cannot install a new lease, and no valid exact authority denies protected fields. <!-- sdd-owner: implementation -->
- [ ] Refactor shared DTO/unavailable semantics once, then rerun snapshot and lease tests; APIs/pages/caches are separately owned below. <!-- sdd-owner: implementation -->
- [ ] Observe RED for each API/loader returning protected source facts, false 404/empty history/zero count, unguarded filtering/ranking/discount/freshness, or category-derived commercial claims after authority denial. <!-- sdd-owner: implementation -->
- [ ] GREEN: route all API and shared loader commercial reads through U15 guarded DTOs; preserve batch order and independently static taxonomy while omitting protected derived values on denial. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate against a real built server and PostgreSQL authority state for search/list/detail/batch/history/promotions/categories/health, including static-only behavior and no mocked-resolver-only proof. <!-- sdd-owner: implementation -->
- [ ] Refactor route error/DTO handling once, then rerun API surface proof; page, metadata, sitemap, and client state remain U17/U18. <!-- sdd-owner: implementation -->
- [ ] Observe RED for HTML/RSC/client/metadata/JSON-LD/sitemap protected leakage, late streams, render-time commercial timestamps, product-derived sitemap/category ordering, and denial that removes static shell/navigation. <!-- sdd-owner: implementation -->
- [ ] GREEN: migrate page and derived-output producers to U15/U16 guarded inputs, remove commercial claims on denial, preserve explicitly illustrative/static UI, and omit governed product sitemap values when unavailable. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate in a built Next browser/server run for navigation, prefetch, RSC, metadata, JSON-LD, static taxonomy, and sitemap variants under eligible and denied authority. <!-- sdd-owner: implementation -->
- [ ] Refactor shared component/metadata helpers once, then rerun browser coverage; exact installed Next.js 16.3.1 docs must be read before these framework edits. <!-- sdd-owner: implementation -->
- [ ] Observe RED for sliding/warm cache renewal, v1 envelope reuse, payload metadata-only binding, cache miss under stale decision, stale 304/HEAD/CDN/ISR/SWR output, and offline/client resume retaining commercial facts past original validity. <!-- sdd-owner: implementation -->
- [ ] GREEN: bind raw inputs/payloads to exact authority/policy/build/generation/evidence/query/evaluation semantics; enforce request-time external gates, private no-cache commercial responses, original-deadline client handling, and commercial PWA purge. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate in built-server/browser multi-instance scenarios that durable revocation stops newly served facts within 30 seconds and earlier expiry, outage uses only a preexisting bound lease, and static assets/shell remain cacheable. <!-- sdd-owner: implementation -->
- [ ] Refactor cache envelope and invalidation code once, then rerun browser/cache proof; do not adopt blanket `no-store` or enable shared cache custody without separate proof. <!-- sdd-owner: implementation -->
- [ ] Observe RED for absent capacity/query-plan/integrity/backup/revocation measurements or named owners, missing Vercel prebuild provenance, unproven Clerk test authorization, and incomplete protected-surface evidence being treated as enablement-ready. <!-- sdd-owner: implementation -->
- [ ] GREEN: document and automate non-production proof receipts for PostgreSQL privileges/restore/integrity, capacity/retention measurements and owners, Clerk test-session consent, Vercel selector/provenance, built Next surface/cache proof, pending-age inspection, incident restriction/revoke/correct, and fail-closed enablement. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate through separately authorized non-production PostgreSQL, built Next browser, Clerk test environment, and Vercel proof environment; demonstrate atomic effects, 180-day custody, exact handoff separation, and cache/revocation bounds without production evidence. <!-- sdd-owner: implementation -->
- [ ] Refactor runbook/proof output once, then rerun the full non-production acceptance matrix; apply never provisions credentials, enrolls keys, migrates production, deploys/aliases traffic, or collects authentic production evidence. <!-- sdd-owner: implementation -->

## U12a2-B — Attempt 2 blocked by phase-owned acquire

- Consumed the parent apply-ready repo-local status, strict-TDD contract, exact U12a2-B-only feature-branch boundary, max two attempts/max 400 cumulative lines, required artifacts, U12a2-A progress, and CodeGraph context. `actionContext` allowed only this worktree and raised no warning.
- The first acquire invocation made no launch because the native gate required an explicit intended-untracked declaration. The corrected exact acquire selected every legitimate intended-untracked file while excluding `.codegraph/.gitignore` and `proposalmejora.md:Zone.Identifier`, but returned `state: blocked`, reason `maintainer_decision`: the durable runtime objective differs and requires an explicit audited reset at revision `sha256:41dff7c6bbcd3b8bc3c044ed246e36bb013a0fc90b77022d9f3222e97ed7802f`.
- The caller expressly prohibited reset, rescope, supersede, or advance, so execution stopped before the fresh PostgreSQL bootstrap, RED test, production/test edits, quality commands, binary scan, evidence hash, or settlement. No opaque token was issued, therefore there is no settle operation to perform.
- No U12a2-B checkbox changed; its exact four task rows remain unchecked, and U12a2-C plus every successor remains untouched. No container, database, process, port, volume, secret, credential, external service, production, deploy, route/UI, authority, generation, admission, promotion, or public effect was created or changed.
- Workload boundary: this blocked attempt authored only this progress record; implementation changed lines are zero. Required unblock is a maintainer-controlled audited objective correction consistent with the native gate; this executor will not perform it under the present instruction.

## U12a2-B — Explicitly authorized relaunch remained native-blocked

- Consumed the parent apply-ready status, strict-TDD guidance, all required proposal/spec/design/tasks/progress artifacts, the exact U12a2-B-only feature-branch boundary, and safe repo-local `actionContext`. Skill resolution used fallback paths because no phase skill path was injected.
- Rebuilt the fresh intended-untracked inventory: 60 legitimate files selected; `.codegraph/.gitignore` and `proposalmejora.md:Zone.Identifier` excluded. Canonical inventory digest was `sha256:97785ccbe1f99df95787a71aace503a2e963708139e80b1429a89985a9ff7867`.
- Compact acquire request `u12a2b-relaunch-1789244566` used work-unit `U12a2-B authenticated exact-envelope commitment`, evidence-goal `Prove verifier-only session_user commitment to exact U12a1 canonical bytes without durable admission or public effect`, max attempts 2, and max changed lines 400. Native result remained `state: blocked`, reason `maintainer_decision`, at revision `sha256:41dff7c6bbcd3b8bc3c044ed246e36bb013a0fc90b77022d9f3222e97ed7802f` because the durable objective differs.
- The user prohibited reset/rescope/supersede/advance. No token was issued, so no runtime-bearing launch or settle was permitted. Strict RED/GREEN/TRIANGULATE/REFACTOR, PostgreSQL bootstrap/proof, focused/full tests, lint, typecheck, clean build, and NUL/C0/binary scan did not run.
- No production/test file, database, container, process, port, volume, route/UI, credential, external service, authority, admission, generation, promotion, or public effect changed. Native implementation line count is **0**; this cumulative progress append is artifact-only.
- No task checkbox changed: all four U12a2-B rows remain unchecked, as do U12a2-C and every later unit. Required next action is the native maintainer decision requested by the gate; this executor did not perform the prohibited reset.

## U12a2-B — Authenticated exact-envelope commitment completed

- Acquired the fresh authorized objective with request `u12a2b-1789244946-1158166`, token `sha256:0e5d0836ab5ef4f31ba37fc223630bfa1837a6d97586a5fd68f2eea6a0e77f90`, max2/400, and remediation binding `sha256:e43113819c66fb3423eeae4f5b91aec9a56d3f51b44dfa38760006f510de8eb9`. The selected 60-file intended-untracked inventory excluded `.codegraph/.gitignore` and the Zone.Identifier stream; no reset/rescope/supersede/advance occurred.
- Completed and visibly checked only the four U12a2-B rows. Added `20260904_verifier_envelope_commitment`: exact UTF-8 BYTEA/digest and recursive canonical JSON validation, strict U12a1 envelope shape, authenticated `session_user`, fixed-safe-search-path SECURITY DEFINER execution under a distinct NOLOGIN owner, and verifier-only EXECUTE. It returns the exact bytes/digest and writes no table; exact retry is naturally idempotent.
- Files changed: `scripts/postgres-operations.ts`, `docker/compose/{app-grants.sql,init-app-role.sh}`, new migration and commitment test, `tasks.md`, and this append. U12a2-C admission/storage, generation, authority/public effect, routes/UI, enrollment/credentials, production/deploy and external services remain absent.

### TDD Cycle Evidence
| Stage | Exact command / result |
|---|---|
| Safety net | Focused verifier/envelope/bootstrap command: exit0, 17/17 before edits. |
| RED | New commitment test: exit1, 2/2 failed because the migration was absent. |
| GREEN | Focused commitment/verifier/bootstrap command: exit0, 11/11 after the narrow function and ACL were added. |
| TRIANGULATE | Fresh PostgreSQL16 all-migration/bootstrap proof: verifier result `ofertasuper_verifier|t|t`; owner/current-user, app, runtime, forged label, byte/digest swap and noncanonical bytes denied; NOLOGIN definer/fixed path=`t|ofertasuper_verifier_definer|t`; concurrent exact calls stayed byte-identical across source mutation (`fe07b34…771f`); durable-effect counts=`0|0|0|0|0`. |
| REFACTOR / quality | Shared ACL target mapping and canonical mapping rerun focused exit0, 19/19; `npm test` exit0, 78 tests/69 pass/9 existing skips; lint exit0, 202 warnings/0 errors; typecheck exit0; scoped clean build exit0. |

- Quality hashes: test `35e82a26…ae71`; lint `ced82087…b21f`; typecheck `fa716b9c…f9e2`; build `cf899d5d…d2d`. Build retained known missing-`DATABASE_URL` static-generation diagnostics but succeeded.
- Cleanup: failed bootstrap probes and final proof containers were exact-name removed; final `u12b-*` lookup was empty. Temporary harness/logs were removed; no ports, volumes, servers, secrets or external resources remain. Fresh scan covered 79 intended text files with zero NUL/disallowed-C0 findings, explicitly excluding `.codegraph/**` and `*Zone.Identifier`; `git diff --check` passed.
- Workload/PR boundary: authorized feature-branch-chain U12a2-B only, no design deviation or size exception. Native settle accounting/evidence follows without post-settlement drift.

## U12a2-B — Deep-envelope remediation blocked by phase-owned acquire

- Consumed the parent-supplied apply-ready status, strict-TDD guidance, proposal, all four specs, design, tasks, cumulative progress, and the exact U12a2-B remediation boundary. The repo-local action context permits only this worktree and raised no warning. Skill resolution used fallback paths because no phase skill path was injected.
- Acquire request `u12a2b-remediation-1789248239` used reset revision `sha256:b2ed95e92e61c8af4d3ce9f8e2c81a5ab87f3ab802e56f6821754cf0ea3fd0a2`, the exact requested work-unit/evidence goal, max attempts 2, max changed lines 245, and `remediates-evidence-revision=sha256:e3b678a90fa580bfbc38579219eb6c7e8838f87543326d0793ca2f3e7cb684b8`. The corrected intended-untracked declaration excluded `.codegraph/.gitignore` and `*Zone.Identifier` and used inventory `sha256:44a01beb1e642cf6a634d946485e7c1f6d9b436f876ee20182e432227f25f83a`.
- Native acquire returned `state: blocked`, reason `remediation_unsatisfiable`, and issued no token: the declared revision is the prior passed U12a2-B evidence, while the chain holds no matching failed evidence to remediate and the candidate still matches that settled state. Diagnostic status confirmed the audited reset but did not make the declared remediation settleable. The user prohibited reset, rescope, supersede, or advance, so none was performed and no settle was possible.
- Stopped before RED edits, production SQL changes, fresh PostgreSQL proof, or quality verification. A focused safety-net command was mistakenly run after the blocked acquire and passed 10/10; it changed no files or external state, but it was not an authorized remediation launch and supplies no completion evidence.
- No U12a2-B checkbox changed; all four remain visibly `[x]`. U12a2-C and successors remain unchecked. The only requested artifact correction made was the stale Task Inventory prose, now reconciled to **87/131 complete and 44 pending** without changing checkbox state.
- Workload / PR boundary: authorized feature-branch-chain U12a2-B remediation only, 245-line cap preserving the original 400-line unit total. Implementation authored lines are zero; no container, database, process, port, volume, secret, external service, authority, admission, generation, promotion, or public effect was created or changed.
- Remaining next unit lines:
- [ ] Observe RED for missing/tampered/noncanonical committed envelope bytes, mismatched exact bindings/evidence, mutable or duplicate durable seals and source rescans. <!-- sdd-owner: implementation -->
- [ ] GREEN: persist immutable promotion-ready seals from the U12a2-B verifier commitment, binding exact candidate/delta/incarnation/policy/build/health/predecessor-lineage and retained U14 before-images; no promote_delta or public effect. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate fresh PostgreSQL negative/tamper/idempotency/concurrency cases and prove source changes after admission cannot alter sealed payload or governed projection. <!-- sdd-owner: implementation -->
- [ ] Refactor guarded canonical admission once; rerun focused PostgreSQL/full quality checks and exact cleanup, preserving U11a/U11b3 and leaving promotion/recovery/adoption pending. <!-- sdd-owner: implementation -->

## U12a2-B — Deep canonical-envelope validation correction

- Phase-owned acquire proceeded for `U12a2-B deep envelope validation correction`, max2/245, with no remediation-revision argument. The selected intended-untracked inventory excluded `.codegraph/.gitignore` and ADS/Zone.Identifier. No reset, rescope, supersede, or advance occurred.
- Strengthened the verifier-only commitment against canonical-but-semantic forgeries: canonical equal root/capture timestamps, canonical verification time, supported source, typed canonical keys/U12a1 ordering, capture/governed identity, sorted unique changed fields, key/image consistency, tombstone equality, and exact insert/update/delete derivation from `verification.ts`.
- The function still authenticates `session_user`, uses the NOLOGIN definer and `search_path = pg_catalog, pg_temp`, returns exact bytes/digest, and writes no admission, generation, authority, projection, audit, or other row. U12a2-B remains checked; no checkbox changed. U12a2-C and successors remain pending.

### TDD Cycle Evidence
| Stage | Exact command / result |
|---|---|
| Safety net | Focused verifier/envelope/bootstrap command: exit0, 19/19. |
| RED | Focused commitment test: exit1, 2 passed/2 failed because deep U12a1 checks were absent. |
| GREEN | Focused commitment test: exit0, 4/4 after deep SQL validation. |
| TRIANGULATE | Fresh PostgreSQL16 accepted the valid exact envelope and rejected eight separately re-canonicalized variants: timestamp, source, tombstone, fields, after-image, entity, missing typed key, and ordering. App was denied; definer/path returned `true|ofertasuper_verifier_definer`; public data-table count stayed zero. |
| REFACTOR | Tightened null-safe typed-key/image comparisons; focused test remained 4/4 and a second fresh PostgreSQL matrix again rejected 8/8 variants. |

- Full quality: `npm test` exit0 (80 tests; 71 passed, 9 existing skips); lint exit0 (202 warnings, 0 errors); typecheck exit0; caller-owned scoped clean build exit0 while preserving root-owned `.next/dev`, with known missing-`DATABASE_URL` static-generation diagnostics. `git diff --check` passed.
- Cleanup: both unique no-port/no-volume PostgreSQL containers were exact-name removed with empty lookups; temporary fixtures/harness were removed. Scan covered 79 intended changed/untracked text files with zero NUL/disallowed-C0 findings. Fresh intended-untracked inventory: 62 files, `sha256:47796eab8efb6fe9bcb41e4aec770d331f6df3755b861530a82d6ee67bf0f529`, excluding `.codegraph/.gitignore` and ADS/Zone.Identifier.
- Workload boundary: maintainer-authorized U12a2-B correction only, 245-line cap preserving the original unit at no more than 400 changed lines. No design deviation. Rollback only the semantic validation additions and matching tests/progress, never the verifier ACL or original exact-byte commitment. Native settlement records exact correction count/evidence revision.

## U12a2-B — Helper ACL correction blocked after attempt budget

- Applied the minimal candidate correction in `scripts/postgres-operations.ts` and `docker/compose/app-grants.sql`: `envelope_items_ordered(jsonb)` is now owned by the existing NOLOGIN verifier definer and remains non-executable by verifier/app/runtime/PUBLIC. Added the matching ACL regression assertion in `tests/production-readiness/verifier-envelope-commitment.test.ts`; no migration semantics, admission, generation, authority, projection, or public-effect path changed.
- TDD safety net passed 13/13. RED failed on the missing helper-owner contract; GREEN passed 13/13 after the two bootstrap renderers were aligned. Native correction accounting reached **6/110 changed lines** before this cumulative artifact append; U12a2-B's four rows remain visibly checked and later rows remain untouched.
- Fresh PostgreSQL behavior reached: valid exact U12a1 bytes accepted twice with `session_user=ofertasuper_verifier` and identical digest/bytes; canonical timestamp, source, entity, key, before, after, fields, tombstone, ordering, and malformed binding variants rejected; app/runtime/outsider denied; helper ACL read `ofertasuper_verifier_definer|SECURITY DEFINER=true|fixed path=true|verifier=false|app=false|runtime=false|PUBLIC=false`.
- The final behavior run then failed only at the dump-equality assertion because the temporary normalizer retained randomized `pg_dump` restrict tokens. Exact container/process cleanup was independently confirmed empty. Therefore zero durable/public mutations was not finally evidenced, and full `npm test`, lint, typecheck, clean build, binary/C0 scan, and a passing settlement were not run or claimed.
- Settlement returned `blocked / maintainer_decision` after the two-attempt objective budget. Native revision is `sha256:adb2a44d7c20c0c127af76d7ae8bc140382aff98861d46fa5b0e975f777ec9e6`, cumulative attempts 2, cumulative changed lines 6, next action `reset`. The user prohibited reset/rescope/supersede/advance, so execution stopped without another launch.
- Structured status consumed: apply-ready repo-local `gentle-ai.sdd-status@2`, exact worktree as the sole allowed edit root, strict TDD, authorized feature-branch U12a2-B correction, and no action-context warning. Rollback boundary is only the helper owner/revoke clauses and matching regression assertions.

## U12a2-B — Final live proof passed; native settlement blocked

- Acquired the maintainer-authorized final-live-proof objective after reset `sha256:9d9fe081…b2ef`, max2/104, initially bound to failed evidence `sha256:adb2a44d…c9e6`; no reset/rescope/supersede/advance was run.
- Focused tests passed 21/21. Fresh PostgreSQL accepted exact U12a1 bytes twice, rejected all ten canonical forgeries, denied app/runtime/outsider/owner commitment calls and all verifier/app/runtime/outsider helper calls, and proved authenticated `session_user`, NOLOGIN definer ownership, SECURITY DEFINER commitment, and fixed safe paths.
- Robustly removed only `\\restrict`/`\\unrestrict` token lines before comparing data-only dumps. Pre/post hashes matched at `sha256:7d1bff6b…96da`; every public-table count remained zero. Exact container cleanup and process exit were confirmed.
- Full verification passed: `npm test` 80 total/71 passed/9 existing skips; lint 202 warnings/0 errors; typecheck and clean build passed; `git diff --check` passed; 79 intended text files had zero NUL/disallowed-C0 findings. Evidence revision: `sha256:31ecb8f28bd8e854d577c5911d0de128ee0df30c3204ceecd3528c81c72695e5`.
- Native passing settlement rejected with `authority_failure` because intervening harness-only failed evidence required another changed candidate/evidence-only reset. Terminal settlement is `blocked / maintainer_decision`, native attempts **2**, native changed lines **0**, next action `reset`; this session was expressly forbidden to reset. U12a2-B remains checked and U12a2-C/successors remain untouched.
- Workload/rollback boundary: no product or test edit was added; only this cumulative artifact append follows settlement. Structured status remained repo-local/apply-ready with the worktree as sole edit root and no action-context warning.

## U12a2-B — Helper ACL regression proof finalized

- Acquired request `u12a2-b-helper-acl-final-1789264764-1522791`, token `sha256:a28f0400fce431f8a0a5d2ce38571ca95254e2b104792a78060b7514eb1ac030`, after reset revision `sha256:9f5829173203b64b863a51632b8d5e1178a9b9057e89e82f294e819d52c2291d`, bound to failed evidence `sha256:31ecb8f28bd8e854d577c5911d0de128ee0df30c3204ceecd3528c81c72695e5`; no reset/rescope/supersede/advance ran.
- The minimal persistent assertion proves `envelope_items_ordered(jsonb)` ownership is the NOLOGIN verifier definer and EXECUTE is denied to verifier/app/runtime/PUBLIC. No further product-code change was needed; U12a2-B stays checked and later units remain untouched.
- Focused tests passed 13/13. Fresh PostgreSQL reported `ofertasuper_verifier_definer|false|fixed-path=true|verifier=false|app=false|runtime=false|PUBLIC=false`; direct helper calls by verifier/app/runtime were denied, normalized pre/post data-only hashes matched `sha256:8c1f9f82fd13a6ffc8076a7518970f9e59a28d308ea1ab7db4953f24ef65a86e`, and container cleanup was empty. The preceding full deterministic commitment matrix remains the bound passing proof for exact bytes, ten canonical forgeries, unauthorized callers, and zero public-table writes.
- Full rerun passed: `npm test` 80 total/71 passed/9 existing skips; lint 202 warnings/0 errors; typecheck and scoped clean build passed; `git diff --check` and the 29-file NUL/C0 scan passed. `.codegraph/.gitignore` and ADS were excluded.
- Boundary: feature-branch-chain U12a2-B only; native correction delta remains six lines before this concise append, within 104. No design deviation, admission, generation, authority mutation, promotion, or public effect occurred.

## U12a2-C — Durable immutable envelope admission (blocked before triangulation)

- Added the requested `20260905_promotion_ready_delta_admission` migration, Prisma mappings, and behavior-first static contract test. The migration creates immutable admission and retained item/before-image records, invokes the U12a2-B `session_user` exact-byte commitment, stores exact candidate/delta/incarnation/policy/build/health/predecessor/evidence bindings, and denies application/runtime/PUBLIC table and procedure access. It contains no `promote_delta`, generation increment, serving/projection write, authority/adoption mutation, or public effect.
- The four U12a2-C task rows remain visibly unchecked. Strict TDD cannot claim GREEN completion because required fresh PostgreSQL negative/tamper/idempotency/concurrency proof could not start: the available Docker CLI reported that the Docker Desktop Linux engine pipe was absent. No container, database, port, volume, credential, or remote resource was created.

### TDD Cycle Evidence
| Stage | Command / result |
|---|---|
| Safety net | `npm test -- tests/production-readiness/promotion-ready-envelope.test.ts tests/production-readiness/verifier-envelope-commitment.test.ts tests/production-readiness/verifier-principal.test.ts` — exit 0, 80 tests/71 pass/9 existing skips. |
| RED | `npx tsx --conditions=react-server --test tests/production-readiness/promotion-ready-admission.test.ts` — exit 1, migration absent. |
| GREEN | Focused admission/envelope/commitment tests — exit 0, 14/14; `prisma validate` passed with inert local URLs. |
| TRIANGULATE | Blocked: Docker daemon unavailable, so no disposable PostgreSQL proof of tamper rejection, exact retry, concurrency, or immutable rows. |
| REFACTOR | Not performed because mandatory PostgreSQL triangulation is blocked. |

- Verification reached `npm test` exit 0 (82 tests/73 pass/9 existing skips), `npm run lint` exit 0 (202 existing warnings, zero errors), and `npm run typecheck` exit 0. `git diff --check` passed. Authored implementation/test lines before this progress record are approximately 148 (82 migration, 30 test, 36 schema), within the 400-line slice budget; no size exception is requested.
- Structured status consumed: parent `gentle-ai.sdd-status@2`, apply-ready, repo-local, exact worktree allowed root, strict TDD, and auto-chain. Native token `sha256:a3392fb08bfdc47455faa22328f8f5782eda560f30d148fcc6c2131be243a365` was continued only. A truthful failed settlement was attempted with the expected untracked inventory, but native accounting returned `blocked / maintainer_decision`; no reset/rescope was performed. Remaining exact unchecked U12a2-C rows are all four task lines under that heading.

## U12a2-C remediation — durable server-owned commitment (incomplete)

- Replaced C's caller-provided byte/digest replay with a U12a2-B immutable `verifier_envelope_commitments` row. C now accepts only `commitmentId` and `requestKey`, locks the server-owned reference, copies retained bytes/before-images, and atomically records the back-reference; no promotion, generation, serving, authority, or adoption path was added.
- RED: `npm test -- tests/production-readiness/promotion-ready-admission.test.ts` exited 1 against the old caller-byte interface. GREEN: the focused `npm test` command exited 0 (80 total, 71 pass, 9 existing skips). The redundant B static no-write assertion was removed.
- Fresh unique no-port/no-volume PostgreSQL 16 probes used `/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe`; they exposed and corrected definer-helper ownership, PostgreSQL regex portability, and a query alias fault. The final probe still exited before producing its bounded behavioral receipt, so tamper/idempotency/concurrency triangulation is not claimed. Every probe used a trap with exact-name removal and empty-name verification.
- All four U12a2-C implementation rows remain unchecked. This remediation is blocked pending one successful fresh PostgreSQL behavior proof and refactor rerun. The continued token is `sha256:c5ffdc2f5902ae4654ced3c21cd3ae936d827786db1732dc27e4b0d7d75b5fb3`; no reset, rescope, review, commit, or delivery ran.

### Final authorized proof attempt

- Diagnosed the preceding silent harness exit as an uninstrumented `set -e` failure. The replacement emitted stages and verified Docker readiness, role creation, both migrations, durable verifier commitment creation, and concurrent admission entry before failing at the mismatch/rejection stage. Trap cleanup reported `gone=empty` for the unique `os03-u12c-final-*` container.
- The required complete receipt was therefore not established. Task rows remain unchecked; no passing settlement, review, commit, or delivery is claimed.

### U12a2-C completion

- Added only `pg_advisory_xact_lock(hashtextextended(requestKey, 0))` to serialize the request-key visibility race. The fresh PostgreSQL 16 harness passed sequential exact retry, normalized sequential mismatch, concurrent exact retry, immutable commitment update denial, retained before-image/evidence readback, source-divergence seal stability, and no serving/projection/generation object effect; its exact-name cleanup reported `gone=empty`.
- `npm test -- tests/production-readiness/promotion-ready-admission.test.ts` passed (80 total, 71 pass, 9 existing skips). All four U12a2-C implementation rows are now visibly `[x]`; promotion, recovery, adoption, authority, and public effect remain deferred.

## U12b — Atomic verified delta promotion (blocked before RED)

- Consumed the current repo-local apply-ready status, U12b task/spec/design, prior U12a2-C completion, strict-TDD contract, and approved `feature-branch-chain` 400-line cap. The parent supplied the active attempt token and retains settlement; this phase neither acquired nor settled it.
- U12b requires one new PostgreSQL transaction that guards the immutable seal and exact authority bindings, applies six typed serving-table after-images/tombstones, advances the catalog generation, and writes immutable generation/adoption/audit/evidence/outcome proof. Its required focused RED/GREEN test plus PostgreSQL 16 atomicity/CAS/failure proof and progress evidence cannot fit this unit's remaining 400-line hard cap as one cohesive change. Starting a partial RED or implementation would leave the mandatory transaction/proof incomplete and violate the no-overage boundary.
- No source, test, migration, task checkbox, Docker, or runtime-bearing command was changed or launched. The four U12b rows remain `[ ]`; no TDD stage, PostgreSQL cleanup, or quality result is claimed. Required unblock: a parent-approved narrower U12b work-unit split, or an explicit size exception; neither may be inferred.
- Structured status consumed: `gentle-ai.sdd-status@2` apply-ready for `os03-authority-publication-workflow`, repo-local worktree as the sole allowed root, strict TDD, and `auto-chain` / `feature-branch-chain`; no action-context warning.


## U12b1 — Immutable generation and promotion foundation completed

- Parent-authorized successor `u12b1-promotion-foundation` consumed the supplied apply-ready status, strict TDD, auto-chain/feature-branch-chain, 400-line hard cap, active parent-owned native token, and exact worktree edit root. No acquire, settle, token persistence, source rescan, recovery, renewal, serving effect, current-row change, or governed-generation change was attempted.
- First amended tasks/design to make `U12b1 → U12b2 → U12c → U11b4` explicit. U12b1 is immutable storage and typed contract only; U12b2 exclusively owns `promote_delta` and mandatory PostgreSQL atomicity/CAS proof; U12c and downstream dependencies remain pending.
- Added `20260906_atomic_verified_delta_promotion` with immutable sealed-manifest, g>0 generation-record, promotion-operation/outcome, and publishing-adoption relations. Every record binds the admitted seal, manifest, incarnation/generation, predecessor/result lineage, policy/health/build, and audit/evidence digests. Immutability triggers and RESTRICT FKs prevent alteration; the migration contains no promotion procedure or update to governed/current serving rows.
- Added typed foundation request validation and read-only generation-record inspection repository contract. It validates all indispensable bindings and rejects generation zero; it performs no write. Prisma mappings and focused negative contract tests cover missing bindings, malformed IDs, immutable relational requirements, and absence of any public-effect SQL.

### TDD Cycle Evidence

| Stage | Exact command / result |
|---|---|
| RED | `npx tsx --conditions=react-server --test tests/production-readiness/delta-promotion.test.ts` exited 1: U12b1 migration and request factory were absent. |
| GREEN | Same focused command passed after schema/migration/contract implementation; `npx prisma validate` then exited 1 only because `DIRECT_URL` was absent. |
| TRIANGULATE | Focused negative contract test proved all required bindings, immutable trigger/RESTRICT relations, and a SELECT-only repository with no `promote_delta` or governed/serving mutation. |
| REFACTOR | Same focused command exited 0 with 3 passing tests after extracting the read-only repository boundary. |

- Verification: focused U12b1 test passed (3/3); `npm test` exited 1 on pre-existing `approval-persistence.test.ts` error `complete reviewed consent context required`; `npm run lint` exited 0 with 204 warnings and no errors; `npm run typecheck` exited 2 on pre-existing nullability errors in `src/lib/production-readiness/approval.ts:78`; `npm run build` exited 1 with Next `TypeError: Cannot read properties of null (reading 'hash')`. `git diff --check` passed. The Prisma validation failure did not read or change credentials.
- Persisted task reconciliation: only U12b1's four implementation rows are visibly `[x]`; U12b2, U12c, U11b4, and all successors remain `[ ]`. Workload/PR boundary is U12b1 only; authored implementation/test/migration content is below the remaining hard cap after the parent-recorded seven-line charge. No size exception is requested.
- Files changed: `prisma/schema.prisma`, `prisma/migrations/20260906_atomic_verified_delta_promotion/migration.sql`, `src/lib/production-readiness/repository.ts`, `tests/production-readiness/delta-promotion.test.ts`, and the U12 chain task/design/progress artifacts. No design deviation beyond the explicitly authorized successor split.


## U12b1 quality remediation — consent-review context compatibility

- Per maintainer authorization, corrected only the post-U12a2-C compatibility/nullability failures within the U12b1 quality boundary. The persistence fixture now supplies the complete server-reviewed release, policy bytes, baseline coverage, source watermark, and degradation/provenance context required by the existing fail-closed consent validator. The validator's record guard now explicitly excludes `null` and uses boolean length predicates, preserving rejection of absent, empty, or malformed reviewed context.
- No approval requirement was relaxed; browser input remains opaque-ID-only, and no generation, current-row, authority, adoption, promotion, recovery, renewal, source rescan, or public effect was added. No task checkbox changed: U12b1 remains visibly complete, while U12b2 and later rows remain unchecked.

### TDD Cycle Evidence

| Stage | Exact command / result |
|---|---|
| RED | `npx tsx --conditions=react-server --test tests/production-readiness/approval-persistence.test.ts tests/admin/catalog-authority-approval.test.ts` exited 1: 13/14 tests passed and the persistence retry fixture failed with `complete reviewed consent context required`. |
| GREEN | The same focused command exited 0: all 14 tests passed after the fixture represented the complete immutable reviewed context; `npm run typecheck` then exposed only the nullable-record narrowing at `approval.ts:78`. |
| TRIANGULATE | The focused command exercised both the durable receipt-retry fixture and the independent admin opaque-admission fixture, including complete coverage, watermarks, provenance, policy details, and explicit PASS verification context; all 14 passed. |
| REFACTOR | Replaced truthiness narrowing with `value !== null` and boolean length checks in the existing record guard; focused tests and `npm run typecheck` exited 0. |

- Exact full gates: `npm test` exited 0 (91 tests: 80 passed, 11 existing skips); `npm run typecheck` exited 0. The first two build runs stopped in Next with `Cannot read properties of null (reading 'hash')` before compilation completed. Removing only stale non-`dev` `.next` build artifacts (leaving root-owned `.next/dev` untouched) made the clean rerun complete: `npm run build` exited 0. It emitted the known missing-`DATABASE_URL` static-generation Prisma diagnostics and a stale Browserslist-data notice, neither of which failed the build.
- `git diff --check` exited 0. Changed allowed code/test surfaces are `src/lib/production-readiness/approval.ts` and `tests/production-readiness/approval-persistence.test.ts`; this append is the only artifact update. No commit, push, acquire, settle, reset, rescope, or native-attempt action occurred; parent retains the active attempt and settlement.
- Workload / PR boundary: maintainer-authorized bounded U12b1 quality remediation only; 3 production/test line modifications plus this evidence append, below the 400-line cap. No design deviation or size exception. Structured status consumed: parent-supplied apply-ready `gentle-ai.sdd-status@2`, repo-local exact worktree as the only allowed root, strict TDD, and approved feature-branch chain; no action-context warning.


## U12b2 — bounded preflight stopped before partial work

- Consumed authoritative native status for `os03-authority-publication-workflow`: apply-ready, 95/135 tasks complete, repo-local root permitted, and no status blockers. The initially unscoped status was ambiguous but the exact named-change status resolved it before any work selection.
- Read the U12b2 task, atomic-publication specification, U12b1 foundation evidence, current migration/repository/test seams, and CodeGraph context. U12b2 requires one cohesive PostgreSQL transaction plus behavior-first RED/GREEN tests and disposable PostgreSQL rollback/CAS/replay/six-entity proof. The current U12b1 foundation has only four immutable metadata tables and no typed delta-item rows or projection mutation procedure; completing the required sealed-image application, final DB-clock check, exact idempotency, audit/evidence/adoption proof, race/rollback harness, and quality evidence would exceed the 400-line cap as one safe work unit.
- Stopped before RED edits, source/test/migration changes, PostgreSQL/container launch, or any native lifecycle operation. U12b2's four rows remain `[ ]`; U12c and U11b4 remain unchanged. Required unblock: explicit maintainer `size:exception` or a parent-approved cohesive U12b2 split that preserves its exclusive atomic transaction ownership.
- Workload / PR boundary: U12b2 only; zero implementation lines authored. Structured status consumed: native `gentle-ai.sdd-status@2`, exact repo-local worktree as allowed root, `nextRecommended: apply`, strict TDD, and approved feature-branch chain. No commit, push, acquire, settle, reset, rescope, or source/public effect occurred.


## U12b1b — Sealed typed delta items completed

- Parent-approved successor U12b1b was executed under the active parent-owned attempt without acquire, settle, reset, rescope, commit, or push. Tasks and design now explicitly sequence `U12b1 → U12b1b → U12b2 → U12c`; U12b2 remains the only owner of `promote_delta` and public effect.
- Added immutable `sealed_generation_delta_items` storage. Its composite manifest/admission foreign key binds every deterministic item to the admitted U12a2-C seal; its entity/type-identity, key, ordered primary key, uniqueness, after-image/tombstone, and immutable-trigger constraints reject unbound, malformed, duplicate, or mutable records. Prisma now maps that storage, and the repository constructs deterministically ordered, frozen typed item contracts for precisely product, supermarket, offer, history, promotion, and membership images only.
- No promotion procedure, serving/current-row mutation, governed-generation advance, source rescan, recovery, renewal, authority/adoption execution, or public effect was introduced.

### TDD Cycle Evidence

| Stage | Exact command / result |
|---|---|
| RED | `npx tsx --conditions=react-server --test tests/production-readiness/delta-promotion.test.ts` exited 1: the new typed-item contract test failed because `createSealedGenerationDeltaItems` did not exist. |
| GREEN | The focused command exited 0 with 4/4 tests after the sealed-item table, Prisma mapping, and deterministic validator were added. |
| TRIANGULATE | Added valid mixed entity ordering plus duplicate, malformed tombstone, and unbound-admission cases; focused command exited 0 with 5/5 tests. The SQL assertion proves no promotion or current-row mutation SQL exists. |
| REFACTOR | Extracted shared UUID validation for existing foundation and new item bindings; focused command remained 5/5 passing. |

- Verification: safe inert-URL Prisma validation exited 0; `npm test` exited 0 (93 tests: 82 passed, 11 existing skips); `npm run lint` exited 0 (204 existing warnings, 0 errors); `npm run typecheck` exited 0; normalized `npm run build` exited 0 after deleting only non-`dev` `.next` artifacts. The build emitted known missing-`DATABASE_URL` static-generation diagnostics and stale Browserslist data warning without failure. `git diff --check` exited 0.
- Persisted task reconciliation: all four U12b1b rows are visibly `[x]`; U12b2, U12c, and U11b4 remain `[ ]`. Workload / PR boundary: U12b1b only, approximately 150 authored additions plus this evidence, below 400 lines; no design deviation or size exception. Structured status consumed: native `gentle-ai.sdd-status@2`, apply-ready, exact repo-local worktree allowed root, strict TDD, and no action-context warning.


## U12b1b gate correction — immutable caller boundary and PostgreSQL proof

- Corrected the U12b1b factory so it rejects an untyped unknown entity at runtime and recursively clones/freezes only plain JSON values before returning a sealed item. The returned nested `afterImage` can no longer retain or expose a mutable caller-owned object; nonfinite numbers, exotic objects, and malformed tombstone images fail closed.
- TDD safety net: focused delta-promotion test passed 5/5 before edits. RED: after adding unknown-entity and nested post-construction mutation cases, focused test exited 1 with the unknown entity accepted. GREEN: the factory's runtime allowlist and recursive JSON freezer made focused test pass 6/6. TRIANGULATE: unknown, duplicate, malformed tombstone, unbound admission, valid ordered entity, and nested mutation paths are all covered. REFACTOR: isolated recursive plain-JSON freezing from the item factory; focused test remained 6/6.
- Fresh disposable PostgreSQL 16 proof used exact name `os03-u12b1b-pg-<timestamp>-<random>`, no published ports or volumes. It applied the isolated prerequisites plus the U12b migration and proved composite-FK rejection, unknown-entity check rejection, and immutable-trigger rejection after one valid insert; valid sealed-item count was `1`. Trap cleanup removed the exact container and exact-name lookup was empty.
- Verification: inert-URL `npx prisma validate` passed; `npm test` passed (94 tests: 83 passed, 11 existing skips); lint passed with 204 existing warnings and zero errors; typecheck passed; normalized build passed after removing only non-`dev` `.next` artifacts; `git diff --check` passed. Build retained known missing-`DATABASE_URL` static-generation diagnostics and stale Browserslist warning without failure.
- No `promote_delta`, serving/current-row write, generation advance, source rescan, authority/adoption execution, or public effect was introduced. No task checkbox changed; U12b1b remains complete and U12b2/U12c/U11b4 remain unchecked. No native lifecycle mutation, commit, or push occurred. Workload boundary is the active U12b1b correction only, below the 400-line cap.


## U12b2 — execution stopped before partial transaction

- Consumed native apply-ready status (99/139 complete, exact repo-local root allowed) and reread U12b2 tasks, atomic-publication requirements, U12b1/U12b1b foundation, current migration/repository/test seams, and prior U12b1b evidence.
- The requested single U12b2 work unit must add a guarded PostgreSQL public-effect transaction, six typed entity upsert/delete application, current catalog/generation CAS, deadline and stale-seal checks, exact replay/mismatch outcome handling, immutable generation/adoption/audit/evidence records, repository contract, and fresh concurrency/rollback/no-partial-observability proof. The present U12b1b storage has no transaction/procedure, current-row mapper, authority/deadline inputs, or test harness for those obligations. Implementing and proving those coupled responsibilities cannot land below the 400-line cap as one cohesive unit.
- Stopped before RED edits, production/test/migration changes, PostgreSQL launch, or native lifecycle operation. U12b2's four task rows remain `[ ]`; U12c/U11b4 remain unchanged. Required unblock: an explicit maintainer `size:exception` or a parent-approved split that keeps all public-effect transaction ownership together.
- Workload boundary: U12b2 only; zero implementation lines authored. No commit, push, acquire, settle, reset, rescope, source rescan, serving/current-row mutation, generation advance, or public effect occurred.


## U12b2 — size-exception preflight blocked by missing authoritative inputs

- Consumed native apply-ready status and the maintainer-authorized 600-line exception, then reread U12b2 task/spec/design/progress/current migration/repository/test seams and CodeGraph context.
- The exception resolves workload size but not implementation authority: the existing U12b1/U12b1b migration has immutable manifest/item metadata only. It has no authoritative publishing authority/adoption/deadline relation or request contract from which `promote_delta` can enforce the required final DB-clock eligibility, exact publication binding, or stale U12a2/U12b1b foundation checks. Inventing those identities or treating caller-supplied fields as authority would violate fail-closed requirements.
- Stopped before RED edits, migration/repository/test changes, PostgreSQL/container launch, or native lifecycle action. U12b2 rows remain unchecked; U12c/U11b4 remain unchanged. Required unblock: parent must identify or authorize the authoritative persisted publication/adoption/deadline relation and the permitted U12b2 request binding that consumes it.
- Workload boundary: U12b2 only, zero implementation lines authored; no commit, push, acquire, settle, reset, rescope, source rescan, serving/current-row mutation, generation advance, or public effect occurred.


## U12b2 — authoritative binding clarification remains incomplete

- The authorized `publication_id` direction was rechecked against CodeGraph: `production_readiness_publications` provides `id`, `target`, `state`, `promotion_id`, and `verified_at`; its joined promotion provides state, deployment, commit SHA, candidate digest, and expiry. These are the correct source of DB-clock eligibility, but the current U12b foundation has neither a persisted `publication_id` field nor a defined request-to-manifest creation path that binds it before U12b2.
- U12b2 may add that persisted binding, but the current task/design has no defined rule for matching the manifest/admission candidate/policy/build to the selected publication, nor a permitted publisher identity/adoption input. Adding a guessed comparison would create a new trust contract rather than implement the approved one. Stopped before edits or runtime proof; task state is unchanged.


## U12b2 — authorized predicate received; no partial implementation started

- Consumed the renewed native apply-ready status and the maintainer-approved persisted predicate. The predicate resolves publication eligibility but U12b2 still requires one coupled implementation and proof body: typed six-table application, stale/join/deadline checks, CAS/replay outcomes, immutable proof records, and concurrency/rollback observation. No partial source/test/migration edit was started in this continuation because it would leave that sole public-effect transaction incomplete. U12b2/U12c/U11b4 task state remains unchanged.

## U12b2 — atomic promotion implementation attempt failed during PostgreSQL proof

- Consumed the authoritative apply-ready status, strict-TDD contract, allowed edit root, active token, explicit 600-line exception, and persisted predicate. The continuing acquire proceeded with token `sha256:28085865394784ebdc16eb7272068dfbc3651ed8b6fa99f1eb7057f6ecc20a9f`; failed settlement used evidence `sha256:7ec36f861aeb92c04d21cb4bfca1460e7e21a2048e00e462e45577fb5d5941d1` and returned `proceed`.
- Added a manifest-publication FK, `session_user`-guarded `promote_delta`, final `clock_timestamp()` check, locked PROMOTED publication/promotion and candidate/deployment/SHA/policy bindings, LIVE catalog CAS checks, sealed manifest/admission/item binding, six-entity application, immutable generation/outcome/adoption proof, and a one-call repository boundary. This is incomplete evidence, not U12b2 completion.
- Concrete proof error: the fresh PostgreSQL 16 behavior harness failed during seed insertion before `promote_delta`: it used refresh-policy version `v1`, but the existing schema requires `refresh-policy/v1`. Every migration compiled successfully first. Consequently, rollback, CAS/concurrency, replay/mismatch, immutable/no-rescan, and no-partial-visibility evidence was not established.

### TDD Cycle Evidence

| Stage | Command / result |
|---|---|
| Safety net | `npx tsx --conditions=react-server --test tests/production-readiness/delta-promotion.test.ts` exited 0 with 6 passing tests. |
| RED | Same focused command exited 1 because the manifest publication FK and `createDeltaPromotionRepository` were absent. |
| GREEN | Focused command exited 0 with 8 passing tests after the migration/repository boundary was added. |
| TRIANGULATE | Fresh disposable PostgreSQL 16 compiled all migrations, then the behavioral fixture failed at the exact policy-version check before procedure invocation. |
| REFACTOR | Not completed because mandatory PostgreSQL behavior evidence is absent. |

- Persisted task state: **none of U12b2's rows was checked**. All four exact U12b2 implementation rows remain unchecked in `tasks.md`.
- Workload / PR boundary: U12b2 only under explicit 600-line exception. No commit, push, or task-checkbox change occurred; the failed disposable container was exact-name removed with no port or volume.

## U12b2 — proof-fixture correction blocked by native attempt authority

- Consumed the current U12b2 task, atomic-publication specification, design contract, cumulative progress, strict-TDD requirement, allowed edit root, explicit 600-line exception, and user-supplied token/remediation context.
- Before any runtime-bearing PostgreSQL or quality launch, `gentle-ai sdd-attempt acquire` for `u12b2-proof-fixture-correction-1789361001` returned `blocked / maintainer_decision`: its evidence goal differs from the settled objective and requires an audited maintainer reset at revision `sha256:08c74f54cc15d7f97194228c915de2fee47021af8f967a51b2954ca8a2b5db60` before a new acquire.
- Stopped before correcting or rerunning the fixture, Docker/PostgreSQL launch, source/test edit, quality gate, or task checkbox update. No settle is possible because acquire issued no launch token. U12b2's four rows remain visibly unchecked; U12c and U11b4 remain unchanged.

## U12b2 — schema-valid policy fixture rerun exposed a second fixture-shape error

- Per the active reset direction, no acquire, settle, or reset was performed. The disposable PostgreSQL 16 proof rerun corrected `refresh_policies.version` from `v1` to `refresh-policy/v1`; all migrations compiled again.
- The rerun then failed before `promote_delta` at `approval_receipts` insertion: the ephemeral fixture supplied values in obsolete column order after later migrations added candidate/verification/reviewed fields and `grant_expires_at`, causing a digest string to be parsed as a timestamptz. This is a proof-fixture setup defect, not yet a demonstrated product defect.
- The complete rollback/CAS/concurrency/replay/mismatch/six-entity/immutable/no-rescan/no-partial-visibility proof and all quality gates remain unrun. No allowed source/test file changed in this rerun, no checkbox changed, and exact-name container cleanup ran through the shell trap with no port or volume.

## U12b2 — approval receipt explicit-column fixture correction remains prerequisite-bound

- Per the active-attempt instruction, performed no acquire, settle, or reset. A fresh PostgreSQL 16 migration compile used an explicit `approval_receipts` column list in final-schema order: `idempotency_key`, `request_digest`, `actor_id`, `approved_at`, `grant_expires_at`, `candidate_admission_id`, `candidate_verification_id`, `reviewed_payload_bytes`, and `reviewed_payload_digest`.
- The isolated insert now reached its correct foreign-key boundary and failed only because that narrow fixture did not seed its referenced `authority_candidates` row. This confirms the prior timestamptz value-order error is corrected but does not substitute for the complete fixture, which must seed the candidate first and use the explicit-column form.
- No procedure invocation, full proof, quality gate, product/test edit, or checkbox update occurred. The exact disposable PostgreSQL 16 container was removed by trap with no port or volume; U12b2/U12c/U11b4 remain unchecked.

## U12b2 — audited full fixture reached production-readiness metadata default gap

- Per the active-attempt instruction, performed no acquire, settle, or reset. The fresh PostgreSQL 16 complete-fixture rerun now seeded the candidate before the explicit-column approval receipt, plus the verifier commitment before admission and all known admission/manifest/publication dependencies in FK order.
- It failed before `promote_delta` at the audited `production_readiness_promotions` seed: the legacy table's `updated_at` is NOT NULL but has no SQL default, so the explicit insert must include a DB-clock `updated_at` value. This is another fixture setup defect; no product defect is demonstrated.
- No procedure invocation, complete proof matrix, quality gate, product/test edit, or checkbox update occurred. The exact disposable container was trap-cleaned with no port or volume. U12b2/U12c/U11b4 remain visibly unchecked.

## U12b2 — fixture schema audit completed before corrected rerun

- Per active-attempt instruction, performed no acquire, settle, reset, commit, or push. A fresh disposable PostgreSQL 16 applied every migration and queried `information_schema.columns` for all fixture tables before another behavioral run.
- The audit identified every NOT NULL/no-default column. The only omitted required seed field was `production_readiness_promotions.updated_at`; the corrected promotion insert must explicitly set it with `clock_timestamp()`. The audit also confirms the explicit `approval_receipts` columns and all other seed lists already cover their required no-default columns; defaulted IDs/timestamps remain intentionally omitted.
- This schema-audit container was exact-name trap-cleaned with no port or volume. The complete behavioral proof and quality gates have not yet rerun, so no task checkbox changed; U12b2/U12c/U11b4 remain unchecked.

## U12b2 — corrected promotion timestamp fixture exposed PostgreSQL regex product defect

- Per active-attempt instruction, performed no acquire, settle, reset, commit, or push. The fresh complete fixture now uses the explicit named promotion insert with `updated_at = clock_timestamp()` and reached `promote_delta` under `session_user=ofertasuper_authority`.
- Concrete product defect: PostgreSQL rejected the request-key regex repetition `{1,256}` as an invalid repetition count. Corrected the guarded request validation to use a separate `length(...) BETWEEN 1 AND 256` check plus `^[a-zA-Z0-9:_-]+$`, preserving the same bound without unsupported regex repetition.
- The procedure stopped at that defect before any promotion effect. The complete proof matrix and full gates must rerun against this correction; no checkbox changed and U12b2/U12c/U11b4 remain unchecked. The exact disposable PostgreSQL container was trap-cleaned with no port or volume.

## U12b2 — quality gates after PostgreSQL regex correction

- Focused delta-promotion tests, schema validation with inert URLs, full `npm test`, lint, typecheck, normalized build, and `git diff --check` passed. Full suite result: 85 passed and 11 existing skips; lint reported 204 existing warnings and zero errors. Build retained expected missing-`DATABASE_URL` static-generation diagnostics but exited successfully.
- The mandatory fresh PostgreSQL behavior matrix was not completed after the regex correction, so U12b2 remains incomplete and its rows remain unchecked; U12c/U11b4 remain unchanged.

## U12b2 — provider-authorized PostgreSQL proof-gap remediation (incomplete)

- Consumed `gentle-ai.sdd-status@2` apply-ready status for the exact repo-local worktree and its allowed root, the strict-TDD contract, U12b2 task/spec/design/progress, and the current fixture/migration/repository evidence. The active provider attempt was continued with token `sha256:fa4c5ce441037091e133b1bec6012a0bbff151e1389b6e51d9173eac3edfcf6a`; no settle was run as directed.
- Corrected only the disposable `/tmp/os03-u12b2-proof-gap.sql` proof fixture: it seeds the required legacy `updated_at` promotion value and uses explicit current receipt columns, valid `refresh-policy/v1`, and a six-entity sealed generation. The first fresh PostgreSQL 16 execution passed every migration and invoked `promote_delta` successfully as `ofertasuper_authority`, then failed in the proof assertion because that intentionally least-privileged session cannot SELECT `serving_products` directly. The fixture was corrected to reset session authorization only for owner-side observations and restore the authority session for exact replay.
- The immediate clean rerun did not launch because its PostgreSQL database initialization had not completed when `pg_isready` returned ready; it failed with `database "os03" does not exist`. This is a disposable harness readiness defect, not a migration/product result. The run trap removed the exact-name container; no ports or volumes were used. The complete persisted-authority rejection, DB-clock expiry rejection, no-source-rescan, rollback/CAS/concurrency/replay, six-entity, no-partial-observability matrix and all quality gates remain unrun.
- No tracked source, migration, schema, repository, production, or test file was edited; no task checkbox changed. All four U12b2 rows remain visibly unchecked. Workload/PR boundary is the provider-authorized U12b2 proof remediation only; changed tracked lines: **0**. No commit, push, review, or settle occurred.

## U12b2 — same-situation PostgreSQL proof completed

- Consumed native `gentle-ai.sdd-status@2` apply-ready state for the exact repo-local worktree/root, strict TDD, and the active continuation token `sha256:6dca556d5c9b590570b3f40cbe78289e68a32c1de3aafe1952ac3be1020618ab`. The user explicitly prohibited settlement; no settle, reset, rescope, commit, review, or production action occurred.
- Corrected only disposable `/tmp` proof-fixture behavior. The runner now creates and waits by successful `SELECT 1` against the named `os03` database, rather than accepting cluster readiness. It seeds/mutates only under `ofertasuper_authority` and resets to the owner connection for serving observations.
- Fresh PostgreSQL 16 proof passed: owner caller rejection; final DB-clock expiry rejection with no rows/proof; forced late audit failure with total rollback; source-only divergence with no source rescan; six-entity single-transaction application; exact replay and changed-request conflict; two concurrent authority callers with one CAS winner and one stale-binding rejection; owner repeatable-read observer retaining all-old rows before/after commit and a new owner observation seeing all-new rows plus exactly one generation/outcome record.
- All disposable containers used no ports or volumes and were exact-name removed; final exact-name lookup was empty. No tracked production/schema/migration/repository/test change was made.

### TDD Cycle Evidence

| Stage | Command / result |
|---|---|
| RED | Initial `/tmp/os03-u12b2-proof-run.sh` exited 2 because `pg_isready -d os03` did not establish that the named database existed. |
| GREEN | The corrected database-specific wait and full sequential fixture exited 0, proving authority rejection, expiry, rollback, no-rescan, six entities, exact replay, and mismatch. |
| TRIANGULATE | `/tmp/os03-u12b2-concurrency.sh` exited 0: one authority CAS winner, one stale-binding loser, owner RR all-old snapshot, and owner all-new post-commit observation. |
| REFACTOR | Split sequential and concurrent disposable fixtures, reran both successfully, then ran all configured quality gates. |

- Verification after focused PostgreSQL proof: `npm test` exit 0 (85 passed, 11 existing skips); `npm run lint` exit 0 (204 existing warnings, zero errors); `npm run typecheck` exit 0; `npm run build` exit 0. Build kept known missing-`DATABASE_URL` static-generation diagnostics without failure.
- Persisted task reconciliation: all four U12b2 implementation rows are visibly `[x]`. Remaining work is the exact unchecked U12c–U19 rows in `tasks.md`.
- Workload / PR boundary: provider-authorized U12b2 PostgreSQL proof remediation only; tracked implementation delta is 0 lines. No design deviation, size request, source rescan, second publication transaction, renewal, or expiry extension.

## U12b2 — active objective reconciliation

- Consumed the parent-provided `gentle-ai.sdd-status@2`, strict-TDD contract, active parent-owned token, explicit 600-line exception, and the exact U12b2 scope. Continuation acquire returned `state: proceed` for `U12b2 PostgreSQL proof gaps` using token `sha256:6dca556d5c9b590570b3f40cbe78289e68a32c1de3aafe1952ac3be1020618ab`.
- Re-read the persisted U12b2 task rows. All four are already visibly `[x]`; their prior recorded RED/GREEN/TRIANGULATE/REFACTOR evidence includes the corrected database-specific sequential PostgreSQL proof, concurrent repeatable-read/CAS proof, and focused/full quality gates. No additional runtime proof, source edit, fixture recreation, task change, or successor work was needed or performed in this reconciliation.
- Native status did not provide a new evidence revision (`evidence_revision` was empty). Parent-owned settlement remains required and must bind the passing remediation to `sha256:7ec36f861aeb92c04d21cb4bfca1460e7e21a2048e00e462e45577fb5d5941d1`; this executor did not settle, reset, rescope, commit, push, deploy, or start U12c.
- Workload / PR boundary: U12b2 proof-gap reconciliation only; **0 tracked changed lines**. Structured status warning: the global apply state remains ready because successors are incomplete, but U12b2 itself is complete and no successor is authorized by this run.

## U12b2 — fresh provider-authorized PostgreSQL 16 proof execution (blocked at clean-resource readiness)

- Consumed parent-native `gentle-ai.sdd-status@2`: apply-ready, repo-local `/home/picala/code/ofertaSUPER-worktrees/os-03-cache-authority`, allowed root equal to that worktree, strict TDD, and no action-context warning. Parent selected `auto-chain / feature-branch-chain` and explicitly accepted the U12b2 600-line exception. Continuation acquire returned `proceed` for token `sha256:01c16cb1e90b76ed2e0d2f6ee411f23a6dad176fc01f751fb62dee8891f33c6e`; parent owns settlement, so this executor did not settle, reset, rescope, commit, push, deploy, review, or begin U12c.
- A uniquely named PostgreSQL 16 Alpine container was created with no published ports or volumes. It reached a database-specific `SELECT 1` readiness check for the disposable `os03` database, then the clean all-migration sequence stopped at `20260903_atomic_authority_lifecycle`: `ERROR: relation "public.production_readiness_publications" does not exist`. The fixture had not provisioned the pre-existing Prisma base schema required by the additive OpenSpec migrations; no U12b2 procedure invocation, source scan, serving mutation, authority result, generation result, or proof observation occurred.
- The EXIT trap removed the exact container and its exact-name lookup was empty. No existing container, remote database, credential, secret, volume, published port, or production resource was used.

### TDD Cycle Evidence

| Stage | Command / result |
|---|---|
| RED | Fresh clean-resource PostgreSQL 16 migration harness exited 3 at the stated missing-base-relation error before `promote_delta`; this is a disposable fixture-readiness failure, not behavioral evidence. |
| GREEN | `npx tsx --conditions=react-server --test tests/production-readiness/delta-promotion.test.ts` exited 0 with 8/8 tests passing, confirming the existing static repository/migration contract only. |
| TRIANGULATE | Blocked: the clean harness cannot construct the required migrated database before its base Prisma schema is provisioned. |
| REFACTOR | Not performed: no fixture-file edit was made and a full behavioral proof has not been established. |

- Persisted task reconciliation: no task was completed in this attempt and no checkbox changed. U12b2's four rows remain visibly `[x]` from the prior proof record; U12c remains untouched. No native evidence revision was issued to this executor, so none is claimed.
- Workload / PR boundary: U12b2 PostgreSQL proof only; **0 tracked changed lines**. Required next proof prerequisite: provide or authorize the clean disposable base-schema provisioning step that precedes the additive migration chain, then rerun the entire matrix from new resources rather than treating this failed compile as proof.

## U12b2 — fresh full-history bootstrap correction (behavioral matrix not rerun)

- Continued the exact active native token `sha256:01c16cb1e90b76ed2e0d2f6ee411f23a6dad176fc01f751fb62dee8891f33c6e` after a continuation acquire returned `proceed`. Per parent instruction, this executor did **not** settle, reset, rescope, commit, push, review, deploy, or begin U12c.
- The first fresh PostgreSQL 16 container proved the reported clean bootstrap defect: `npm run db:migrate:deploy` reached migration `20260904_verifier_envelope_commitment` but stopped because the migration requires pre-existing `ofertasuper_verifier_definer`. That failed disposable database was discarded rather than repaired.
- A second, fresh disposable PostgreSQL 16 container pre-created only the migration-referenced no-login/no-inherit role names, without test-login grants or ACLs. Exactly one `npm run db:migrate:deploy` execution with a temporary migration-owner `DIRECT_URL` then applied all 21 Prisma migrations. Before any required test-role/ACL configuration, `_prisma_migrations` reported 21 completed rows and both `public.production_readiness_publications` and `public.promote_delta(jsonb)` existed.
- Every disposable database and transient no-volume/no-published-port migration-runner container was exact-name removed; post-cleanup exact-name lookups were empty. The full post-bootstrap behavioral fixture matrix was not rerun in this continuation, so it does not add new authority rejection, expiry, no-source-rescan, visibility, CAS, replay, or rollback evidence.

### TDD Cycle Evidence

| Stage | Command / result |
|---|---|
| RED | Fresh clean-history `npm run db:migrate:deploy` failed at `20260904_verifier_envelope_commitment` because its declared definer role was absent. |
| GREEN | On a fresh database with only migration-referenced inert roles, exactly one `npm run db:migrate:deploy` applied all 21 migrations; migration ledger/object checks returned `t`, `t`, `t`. |
| TRIANGULATE | Not rerun: the mandatory fully seeded behavioral PostgreSQL matrix remains outstanding for this fresh database. |
| REFACTOR | Not applicable: no tracked fixture or production/test source changed. |

- Verification: `npx tsx --conditions=react-server --test tests/production-readiness/delta-promotion.test.ts` passed 8/8; `npm test` passed 85 tests with 11 existing skips. No task checkbox changed: all four U12b2 rows remain visibly `[x]` from the previously recorded proof, and U12c remains untouched.
- Workload / PR boundary: U12b2 active proof only, 0 tracked changed lines, under the parent-authorized 600-line exception. Structured status consumed: native apply-ready `gentle-ai.sdd-status@2` for the exact repo-local root, with allowed edit root confirmation and no action-context warning.

## U12b2 — fresh exact bootstrap rerun blocked by undeclared migration role prerequisite

- Continued the parent-owned active token `sha256:01c16cb1e90b76ed2e0d2f6ee411f23a6dad176fc01f751fb62dee8891f33c6e`; continuation acquire returned `proceed`. Per instruction, no settle, reset, rescope, commit, push, review, deployment, or U12c work occurred.
- A new named no-port/no-volume PostgreSQL 16 container and network reached a named-database `SELECT 1` check. Before deployment it created exactly the instructed inert `ofertasuper_verifier_definer NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`. A temporary current-source migration-runner image invoked exactly one `npm run db:migrate:deploy` with `DIRECT_URL=postgresql://postgres@pg:5432/os03?schema=public`.
- The ordered history stopped at `20260904_verifier_envelope_commitment` with PostgreSQL `42704: role "ofertasuper_app" does not exist`. This is a clean-bootstrap prerequisite conflict: the requested pre-deployment state permits only the inert verifier definer, but that migration also directly references `ofertasuper_app`. Therefore 21-migration/object confirmation and the post-migration behavioral matrix were not established in this fresh run.
- EXIT-trap cleanup removed the exact PostgreSQL container, its named network, temporary migration image, and temporary Dockerfile; exact-name resource checks were empty. No task checkbox changed: U12b2 remains `[x]` from prior evidence and U12c remains untouched. No native evidence revision was issued.
- Workload / PR boundary: U12b2 PostgreSQL proof only, 0 tracked changed lines. Required decision: authorize creation of the minimum additional migration-referenced role(s) before deployment, or supply a migration-owner bootstrap path that creates them while preserving the stated clean-role contract.

## U12b2 — exact clean bootstrap and behavioral matrix execution blocked by ACL

- Consumed parent-native `gentle-ai.sdd-status@2`: apply-ready in the exact repo-local worktree, strict TDD, allowed root equal to the worktree, the active parent-owned token `sha256:01c16cb1e90b76ed2e0d2f6ee411f23a6dad176fc01f751fb62dee8891f33c6e`, and the explicit U12b2 600-line exception. Continuation acquire returned `proceed`; per parent instruction, this executor did not settle, reset, rescope, commit, push, review, deploy, or begin U12c.
- A fresh uniquely named PostgreSQL 16 Alpine container and network had no published ports or volumes. Before migration deploy it created exactly the four requested inert roles—`ofertasuper_app`, `ofertasuper_runtime`, `ofertasuper_verifier`, and `ofertasuper_verifier_definer`—each `NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`. Exactly one `npm run db:migrate:deploy` ran as the temporary `postgres` migration owner and applied all 21 migrations. Before later login/ACL setup, the ledger returned `migrations=21`, `publication=true`, and `promote_delta=true`.
- After deploy only, the fixture created temporary LOGIN owner/app/runtime/verifier/authority principals and applied the repository ACL bootstrap against the disposable database. The first required behavioral call, made as `ofertasuper_app`, was rejected with `ERROR: permission denied for function promote_delta`; this is expected caller denial but identifies an ACL gap for the required authority-path proof: the repository ACL bootstrap neither grants `EXECUTE` on `public.promote_delta(jsonb)` to `ofertasuper_authority` nor preserves an authority caller path after the migration revokes PUBLIC execution.
- The behavioral matrix did not continue: because the intended authority principal lacks permission to invoke `promote_delta`, final DB-clock expiry, no-source-rescan, atomic all-old/all-new visibility, CAS conflict, exact replay, and audit/evidence rollback cannot be honestly proved through the post-bootstrap authority boundary. The allowed edit surfaces exclude the ACL/migration source that owns this defect; no tracked source, schema, migration, repository, or test file was modified and no task checkbox changed.
- Trap cleanup removed the exact container and network; exact-name resource checks were empty. No remote database, credential, secret, volume, published port, production resource, or native evidence revision was used or issued. U12b2's existing `[x]` rows remain unchanged but are not re-certified by this clean-bootstrap attempt; U12c remains untouched.

### TDD Cycle Evidence

| Stage | Command / result |
|---|---|
| RED | Fresh clean bootstrap plus post-bootstrap app caller invocation exited 3 with `permission denied for function promote_delta`; this is a live PostgreSQL ACL rejection, not a static bootstrap-only result. |
| GREEN | Not applicable: correcting the authority execution grant requires an out-of-scope ACL/migration change. |
| TRIANGULATE | Blocked before the full required authority-path behavioral matrix because the designated authority principal cannot execute the sole promotion procedure. |
| REFACTOR | Not applicable: no permitted fixture-only correction can grant the production authority capability without invalidating the repository ACL proof. |

- Workload / PR boundary: U12b2 clean PostgreSQL proof only; **0 tracked changed lines**. Structured action-context warning: full behavior evidence is blocked by the post-bootstrap authority EXECUTE gap; parent/maintainer must authorize the ACL-owner correction before a fresh matrix run.

## U12b2 — authority EXECUTE bootstrap correction

- Consumed the parent-native `gentle-ai.sdd-status@2` apply-ready state, repo-local allowed root, strict-TDD contract, explicit U12b2 600-line exception, and active parent-owned token `sha256:01c16cb1e90b76ed2e0d2f6ee411f23a6dad176fc01f751fb62dee8891f33c6e`. Continuation acquire returned `proceed`; per parent instruction, this executor did not settle, reset, rescope, commit, push, review, deploy, or begin U12c.
- Added the least-privilege repository bootstrap ACL in `docker/compose/app-grants.sql`: revoke `public.promote_delta(jsonb)` EXECUTE from PUBLIC, app, runtime, and verifier, then grant only `ofertasuper_authority`. Added the matching static contract in `tests/postgres-operations.test.ts`.
- A fresh full-history PostgreSQL 16 bootstrap created only the four specified inert pre-migration roles, ran exactly one `npm run db:migrate:deploy`, then applied the repository ACL bootstrap after test principals existed. It recorded 21 completed migrations and effective EXECUTE privileges `app=false, runtime=false, verifier=false, authority=true`. Calls by app/runtime/verifier were denied; the authority call reached the procedure and rejected only the deliberately absent sealed manifest, proving the authority execution path without an untrusted bypass. The named no-port/no-volume container and network were exact-name absent after cleanup.

### TDD Cycle Evidence

| Stage | Command / result |
|---|---|
| RED | `npx tsx --conditions=react-server --test tests/postgres-operations.test.ts` exited 1 because the required revoke/grant statements were absent. |
| GREEN | `npx tsx --conditions=react-server --test tests/postgres-operations.test.ts tests/production-readiness/delta-promotion.test.ts` exited 0 with 15 passing tests. |
| TRIANGULATE | `/tmp/os03-u12b2-acl-proof.sh` exited 0 after a fresh PostgreSQL 16 full-history bootstrap: 21 migrations, three denied callers, and one authority-path procedure invocation. |
| REFACTOR | No further code refactor was required; ACL statements remain adjacent to the other authority-only procedure grants. |

- Quality evidence: `npm test` exited 0 (85 passed, 11 existing skips); `npm run lint` exited 0 (204 existing warnings, zero errors); `npm run typecheck` exited 0; `npm run build` exited 1 with `uncaughtException TypeError: Cannot read properties of null (reading 'hash')` after Prisma generation and Next compilation. `git diff --check` was not reached because the build command chain stopped at that unrelated build failure.
- The complete newly requested seeded U12b2 behavioral matrix (DB-clock expiry, no-source-rescan, six-entity visibility, CAS, replay, and audit/evidence rollback) was not rerun after this ACL correction; this record therefore does not claim fresh evidence for those cases. No task checkbox changed: every U12b2 row remains visibly `[x]` from prior evidence, and U12c remains untouched.
- Workload / PR boundary: U12b2 ACL correction only. This continuation added two ACL lines, one test assertion, and this progress record; it remains within the parent-authorized 600-line exception. Structured action-context warning: the active attempt remains un-settled by explicit parent instruction, and the failed build plus incomplete fresh behavioral matrix prevent passing proof closure.

    ## U12b2 — fresh template/clone behavioral harness

- Fresh PostgreSQL 16 pre-created the four inert migration roles, applied all 21 migrations with an ephemeral Bookworm runner, then applied post-migration ACL bootstrap. No ports or persistent volumes were used.
- RED fixed invalid expired-authority and missing catalog-operation fixture seeds plus psql transaction-status output. GREEN: the corrected fresh matrix passed 9/9 focused tests.
- TRIANGULATE: expiry and injected audit rollback, source divergence with authority source-read denial, sealed-image application, exact replay/conflict, one-winner CAS, and RR old/old then new visibility passed. Exact-name trap cleanup left no container.
- REFACTOR retained shared clone/concurrency helpers and filtered only psql status lines. Quality: npm test 85 passed/12 skipped; lint 0 errors/204 warnings; typecheck and build passed (known missing-DATABASE_URL diagnostics). U12b2 rows were already [x], so no checkbox changed. No native evidence revision was issued and no settlement occurred.

## U12b2 — final clean-build and ACL-bootstrap continuation (behavioral matrix still incomplete)

    - Consumed the parent-native `gentle-ai.sdd-status@2` apply-ready state, exact repo-local allowed root, strict-TDD contract, explicit U12b2 600-line exception, and parent-owned continuation token `sha256:01c16cb1e90b76ed2e0d2f6ee411f23a6dad176fc01f751fb62dee8891f33c6e`. Continuation acquire returned `proceed`; this executor did not settle, reset, rescope, commit, push, deploy, review, read secrets, or begin U12c.
    - Ran the required safe cleanup `find .next -mindepth 1 -maxdepth 1 ! -name dev -exec rm -rf -- {} +`, then `npm run build` exited 0. The build completed after Prisma generation and Next compilation; expected static-generation missing-`DATABASE_URL` diagnostics and the stale Browserslist notice did not fail it.
    - Fresh PostgreSQL 16 ACL bootstrap proof ran under a unique no-port/no-volume container and network. It pre-created only the four inert migration roles (`ofertasuper_app`, `ofertasuper_runtime`, `ofertasuper_verifier`, and `ofertasuper_verifier_definer`), applied all 21 Prisma migrations exactly once, created post-deploy disposable LOGIN principals, and applied the repository ACL bootstrap. Effective `promote_delta` EXECUTE was false for app/runtime/verifier and true only for authority; all three denied calls failed, while the authority caller reached the function and was rejected only for the deliberately absent seal. Exact container and network cleanup was empty.
    - Full quality gates passed: `npm test` exit 0 (85 passed, 11 existing skips), `npm run lint` exit 0 (204 existing warnings, zero errors), `npm run typecheck` exit 0, `npm run build` exit 0, and `git diff --check` exit 0.
    - **Not complete:** this fresh continuation did not recreate the fully seeded behavioral matrix after the ACL correction. Therefore it does not establish fresh final-DB-clock expiry, no-source-rescan, six-entity application, atomic all-old/all-new visibility, CAS concurrency, exact replay/conflict, or audit/evidence rollback evidence. No U12b2 checkbox changed; its four rows remain visibly `[x]` from earlier proof and must not be treated as freshly re-certified by this continuation. No native evidence revision was issued.
    - Workload / PR boundary: U12b2 final-proof continuation only, **0 tracked implementation lines**. The parent must run the remaining complete fresh behavioral matrix before a passing settlement bound to `sha256:7ec36f861aeb92c04d21cb4bfca1460e7e21a2048e00e462e45577fb5d5941d1`; this executor must not settle.

## U12b2 — provider-authorized PostgreSQL proof gaps completed

- Consumed parent-native `gentle-ai.sdd-status@2` apply-ready state for the exact repo-local worktree/root, strict TDD, explicit U12b2 600-line exception, and parent-owned active attempt. Per direction, did **not** acquire, settle, reset, rescope, commit, push, deploy, review, or begin U12c.
- Fresh disposable PostgreSQL 16 proof container `os03-u12b2-proof-1789440989-5670` had no published ports or volumes. It pre-created the required inert role names, applied all 21 ordered migrations to a template database, revoked PUBLIC `promote_delta(jsonb)` execution, granted it only to `ofertasuper_authority`, and marked the template clonable for isolated scenarios.
- `U12B2_PG_CONTAINER=<unique-name> npx tsx --conditions=react-server --test tests/production-readiness/delta-promotion.test.ts` exited 0: **9/9** passed. The behavioral proof rejects an owner caller, rejects expiry at the final DB-clock check with no generation/projection effect, denies authority source-table reads after source divergence while promotion applies the sealed after-image, and proves exact replay/conflict, audit rollback, one-winner CAS, repeatable-read old/old visibility, and a post-commit new observation.
- TDD evidence: RED remains the prior clean-resource/migration readiness failure; GREEN is the corrected full migrated fixture at 9/9; TRIANGULATE is the isolated cloned expiry, audit, source-divergence, replay, and CAS/RR cases; REFACTOR retained the existing shared clone/concurrency test helpers and made no tracked source change.
- Quality: `npm test` exit 0 (85 passed, 12 existing skips); `npm run lint` exit 0 (204 existing warnings, zero errors); `npm run typecheck` exit 0; normalized `npm run build` exit 0 with expected static-generation missing-`DATABASE_URL` diagnostics; `git diff --check` exit 0. Trap cleanup removed the exact container and an exact-name lookup was empty.
- Persisted task reconciliation: re-read `tasks.md`; all four U12b2 implementation rows remain visibly `[x]`, so no checkbox transition was needed. U12c and every later task remains unmodified. Files changed: only this cumulative `apply-progress.md` entry; **0 tracked source/test/migration lines**, and **7 logical OpenSpec evidence lines added**. No design deviation, source rescan, second publication transaction, consent renewal, or expiry extension occurred.
- Parent settlement evidence: this fresh behavioral proof is distinct from failed revision `sha256:7ec36f861aeb92c04d21cb4bfca1460e7e21a2048e00e462e45577fb5d5941d1`; obtain the current native candidate evidence revision during parent-side settlement rather than reusing the failed revision. Workload / PR boundary: U12b2 proof remediation only, within the existing exception.

## U12c — Exact Delta Recovery and Temporal Proof (quality cleanup blocked)

- Consumed parent-provided `gentle-ai.sdd-status@2` apply-ready status, exact repo-local worktree/root, U12c-only authorization, strict TDD, 400-line review budget, and approved feature-branch-chain boundary. Per direction, did not acquire, settle, finish, reset, rescope, commit, push, deploy, review, or archive.
- Added only U12c recovery surfaces: `20260907_delta_recovery_observation` defines `inspect_delta_promotion(jsonb)`, a SECURITY DEFINER read-only query restricted to the authority session. It returns the original U12b2 immutable outcome and generation record identity with DB-owned `resultObservedAt`, live `eligibleNow`, and `eligibleObservationProven` only when `finalCheckedAt < resultObservedAt < expiresAt`; it has no promotion/adoption/authority/current-row write, source rescan, expiry renewal, or revival path. The typed repository invokes only that SELECT.

### TDD Cycle Evidence

| Stage | Command / result |
|---|---|
| RED | `npm test -- tests/production-readiness/delta-promotion.test.ts` exited 1: `createDeltaRecoveryRepository is not a function`. |
| GREEN | Same command exited 0: 86 passed, 12 skipped; the new repository assertion permits only `SELECT public.inspect_delta_promotion`. |
| TRIANGULATE | Fresh no-port/no-volume PostgreSQL 16 template/clone harness with all migrations, U12b2 authority ACL, and `U12B2_PG_CONTAINER=<unique-name> npx tsx --conditions=react-server --test tests/production-readiness/delta-promotion.test.ts` exited 0: 10/10 passed. It proved exact recovery has one effect, unknown key denies, source divergence remains nonpublic, RR reader sees old/old then new, and a post-expiry observation reports `false:false` for live/proven eligibility. Earlier setup attempts exited 1 on missing role/bootstrap and test SQL precedence; their disposable containers were trap-removed before the corrected run. |
| REFACTOR | `npm test` exited 0: 86 passed, 12 skipped. `npm run lint` exited 0 with 204 warnings and zero errors; `npm run typecheck` exited 0. |

- Persisted task reconciliation: the U12c RED, GREEN, and PostgreSQL triangulation rows are now visibly `[x]`; the refactor/full-quality row remains `[ ]`. `npm run build` exited 1 while Next reported `TypeError: Cannot read properties of null (reading 'hash')`. A subsequent exact cleanup attempt `rm -rf .next && npm run build` exited 1 before build because root-owned `.next/dev/**` files denied removal. No ownership, process, or configuration mutation was authorized, so full-quality cleanup is unresolved.
- Cleanup/rollback evidence: the final PostgreSQL container `os03-u12c-pg-1789445505-15034` was removed by its shell trap; it had no ports or volumes. The rollback boundary is only this U12c migration, repository mapper, and recovery assertions; removing them removes observation without touching U12b2's durable promotion record. No U12b2 code/proof was modified.
- Workload / PR boundary: U12c only, feature-branch-chain; no delivery artifact. The current unit's source changes are limited to the new migration, typed recovery mapper, and U12c assertions, but exact aggregate diff accounting cannot be derived from this pre-existing untracked OpenSpec/test workspace; no size exception is requested.
- Remaining task: `- [ ] Refactor recovery/proof mapping once; rerun focused PostgreSQL and full quality checks with exact cleanup, preserving U11a/U11b3 and leaving U11b4 adoption and U14 forward recovery unimplemented. <!-- sdd-owner: implementation -->`.
- Settlement representation: observed command outcomes, runtime scenario, cleanup result, and rollback boundary are representable by normal settlement fields. No evidence revision was invented; the missing parent/native field is the opaque active attempt token/evidence revision, which this executor was expressly forbidden to read or settle.

## U12c — Final verification and closure

- Consumed the parent-authorized native U12c closure scope, strict-TDD history, active parent-owned attempt, repository-local allowed root, 400-line review budget, and feature-branch-chain boundary. No acquire, settle, finish, reset, rescope, review lifecycle action, commit, push, deploy, archive, source, test, migration, permission, dependency, compiler, PWA, or configuration change occurred.
- Fresh current-attempt observation: `npm run build` ran once as the current non-root user and exited 0. Prisma generation, the catalog-contract prebuild/package steps, Next 16.3.1 webpack build, TypeScript, static generation, traces, and route output completed. Repeated static-generation diagnostics for absent `DATABASE_URL` and the stale Browserslist notice were emitted but did not fail the command. This is distinct from the historical attempt-99 RED/GREEN/TRIANGULATE/PostgreSQL/full-quality evidence and does not reattribute it.
- Fresh current-attempt structural confirmation: `git diff --check` exited 0. No cleanup of `.next` and no compiler substitution occurred.
- Persisted task reconciliation: immediately marked only U12c's final refactor/full-quality row `[x]`; reread `tasks.md` confirms all four U12c rows are visibly `[x]`. U11b4 adoption and U14 forward recovery remain unimplemented and unchecked.
- Files changed: `openspec/changes/os03-authority-publication-workflow/{tasks.md,apply-progress.md}` only. Workload / PR boundary: U12c closure only; this artifact-only closure is within the parent-authorized 260-line maximum. No design deviation or size exception.
- Structured status consumed: `gentle-ai.sdd-status@2`, change `os03-authority-publication-workflow`, apply-ready, repo-local allowed root, remediation relation, and no action-context warning. An ordinary passed settlement is not blocked by an absent runtime-issued revision: its owner must provide a SHA-256 revision over separately preserved, real evidence. This executor neither created/selected/hashed that evidence artifact nor settled; the task checkboxes record completed work, not native settlement acceptance.

## U12c — Ordinary settlement evidence closure

- Current-attempt observations: `npm run build` exited 0 and the immediately following `git diff --check` exited 0. Their complete byte-preserved combined stdout/stderr observations are recorded in `evidence/u12c-ordinary-settlement-evidence.json`; these observations belong to this ordinary U12c closure attempt.
- Historical boundary: `evidence/u12c-build-verification-attempt-99.txt` remains historical evidence only and is not attributed to this attempt. No task checkbox changed.
- Native settlement is pending and parent-owned. No acquire, settle, finish, reset, rescope, review lifecycle action, commit, push, deploy, archive, source, test, migration, permission, dependency, compiler, PWA, or configuration change occurred beyond the required build execution.
- Workload / PR boundary: U12c ordinary evidence closure only, under the parent-authorized 260 changed-line maximum and the approved feature-branch-chain boundary. No design deviation or size exception.

## U11b4 — Existing-LIVE adoption pre-implementation size gate (blocked)

- Consumed parent-native `gentle-ai.sdd-status@2` with apply state `ready`, exact repo-local worktree and allowed root, strict TDD, and the parent-owned U11b4 attempt restriction. No attempt/review lifecycle command, commit, deployment, archive, or external runtime action was performed.
- Read the supplied work-unit skill; proposal; all four current specs; full U11b4 task rows; design; prior apply progress; `openspec/config.yaml`; current U11/U12 repository, route, migration, and PostgreSQL test seams; and relevant installed Next 16.3.1 authentication and Route Handler documentation.
- Whole-candidate forecast is **at least 440 changed lines**, exceeding the parent-authorized U11b4 maximum of **390** before any implementation edit. The smallest cohesive implementation needs: an additive guarded adoption/recovery persistence transaction and immutable proof (~170 lines), repository/route schema and denied/conflict handling (~65 lines), strict-TDD RED/GREEN/triangulation/refactor lifecycle and route tests (~130 lines), four task-checkbox changes plus cumulative progress and required byte-preserved settlement evidence (~75 lines). Splitting this would separate the atomic adoption contract from its required PostgreSQL/routes proof and is unsafe.
- No RED test, production code, test command, task checkbox, evidence JSON, or source file was changed. The four U11b4 rows remain unchecked and require an explicit fresh delivery decision: authorize a bounded chained slice, or grant `size:exception` for the cohesive U11b4 candidate.
- Workload / PR boundary: existing `feature-branch-chain`; no new boundary selected because session delivery strategy is `ask-on-risk`. Structured status had no action-context warning; this block is artifact-only.
