# Implementation Tasks: Governed Authority Publication

Authorized auto-chain apply is in progress; production and delivery actions remain separately controlled.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 8,110–10,615 additions + deletions |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | U1 → U2 → U3 → U4 → U5 → U6 → U7 → U8a → U8b → U3c → U9a consumer correction → U9b → U9c → U10 → U11a → U11b1 → U11b2 → U11b3 → U12a1 → U12a2-A → U12a2-B → U12a2-C → U12b → U12c → U11b4 → U13 → U14 → U15 → U16 → U17 → U18 → U19 |
| Delivery strategy | feature-branch-chain (approved) |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No — the parent selected U12a2-A → U12a2-B → U12a2-C; only the currently authorized slice may be applied. No overage or trust enrollment is authorized.
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

**Arithmetic check:** prior7,950–10,410 minus U12a2 280–380 plus revised440–585 =8,110–10,615. This is a blocking preflight forecast, not increased authorization; every work unit retains its400-line cap.

Every unit targets a reviewer-safe maximum of 400 changed lines. A future measured overage needs a fresh delivery decision; no `size:exception` is pre-approved. The approved feature-branch-chain remains the delivery boundary.

## Common Execution Boundary

Each unit starts only after its dependencies and with the affected commercial capability fail-closed. Each ends only after the four evidence steps below succeed: an observed failing RED test, its GREEN implementation, an independent triangulation using the named real boundary, and a rerun after refactor. **For every unit and each of those four stages, record in apply-progress evidence the exact focused command, exit/status, and observed expected result; do not invent or record a command during planning.** Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build` for each completed delivery slice; run the named PostgreSQL/browser/Clerk/Vercel proof where applicable. Future rollback command: `git revert <unit-commit>` only for that cohesive unit; never restore mutable-source public reads, broad grants, historical-byte selection, configuration, traffic, or deleted evidence.

| Unit | Depends on | Estimate | Scope and exact spec mapping |
|---|---|---:|---|
| U1 | — | 180–240 | DB schema/procedure primitives only. AAP atomic/delta proof; RER projection boundary. |
| U2 | U1 | 250–330 | Privileges, bootstrap, backup/recovery hardening. RER bootstrap; CE custody binding. |
| U3 | U1 | 200–280 | Canonical bytes and `authority-candidate/v1`. CE versioned candidate/independent verification. |
| U4 | U1,U3 | 280–360 | Baseline preparation, seal, expiry/rejection, abandon/archive/cleanup. CE custody; SA bootstrap trust. |
| U5 | U1,U4 | 220–300 | Evidence custody, holds, GC, integrity/capacity ownership. CE custody; RER enablement gate. |
| U6 | U1 | 240–320 | Shared controlled-source capture core. AAP verified delta; CE lineage. |
| U7 | U1,U6 | 250–340 | Independent postcommit source verifier. AAP verified delta; CE independent verification. |
| U8a | U6,U7 | 280–360 | Carrefour/Vea adapters. AAP delta; RER source-only writers. |
| U8b | U6,U7 | 330–400 | Disco/Jumbo/Más adapters. AAP delta; RER source-only writers. |
| U3c | U3,U8b | 260–340 | Durable candidate technical admission: immutable policy/baseline/candidate/verification bytes and guarded opaque-ID DAL; includes U9a consumer-boundary correction only. CE/SA exact binding; no ingress or public effect. |
| U9a | U1,U3,U3c | 330–390 | Durable approval persistence only: grants, challenges, receipts, procedures, and typed DAL. SA exact/fresh approval; unreachable from ingress or public effect. |
| U9b | U9a | 360–400 | Scoped Clerk ingress and approval flow only, using U9a persistence. SA exact/fresh approval; no reservation, publication, or runtime authority. |
| U9c | U9a,U9b | 240–320 | Durable approving-grant original-expiry binding for challenges and receipts. SA exact/fresh approval; no reservation, publication, or runtime authority. |
| U10 | U1,U3,U9a,U9b,U9c | 260–340 | Reservation/build contract and selector v2 only. SA handoff separation. |
| U11a | U1,U4,U7,U9a,U9b,U9c,U10 | 320–400 | Atomic initial FROZEN→LIVE/g0 activation only, final DB-clock eligibility, exact retry/conflicts, receipts/audit/outcome/adoption and rollback. AAP activation/idempotency; SA lifecycle. |
| U11b1 | U11a | 180–260 | Exact-commit read-only inspection and guarded activate/inspect; AAP recovery/SA lifecycle. |
| U11b2 | U11b1 | 220–320 | Action-specific authority-revoke consent; SA lifecycle. |
| U11b3 | U11b2 | 220–320 | Atomic revoke and guarded route; AAP/SA lifecycle. |
| U12a1 | U1,U7,U11a,U11b3 | 300–380 | Independently constructed canonical per-key governed envelopes in memory; no persistence/public effect. CE lineage. |
| U12a2-A | U12a1 | 180–260 | Dedicated verifier LOGIN principal, `session_user` provenance contract, fixed-safe-search-path definer boundary, and least-privilege verifier ACL; no envelope commitment or admission storage. CE independent verification; RER bootstrap. |
| U12a2-B | U12a2-A | 220–320 | Authenticated verifier-bound commitment to exact U12a1 canonical envelope bytes; no admission rows or public effect. CE lineage/custody. |
| U12a2-C | U12a2-B | 300–390 | Guarded durable immutable admission, stale-binding/idempotency/concurrency/audit boundary; no promotion or public effect. CE custody. |
| U12b | U12a2-C | 350–400 | Atomic delta promotion and authoritative immutable g>0 generation records. AAP verified delta/idempotency. |
| U12c | U12b | 180–260 | Read-only exact recovery plus RR/CAS/temporal proof. AAP recovery/idempotency; no second publication. |
| U11b4 | U11b3,U12c | 280–390 | Independently verified existing-LIVE adoption from U11a g0 proof or U12b g>0 records; full-lifecycle closure. |
| U13 | U1,U11b4,U12c | 280–370 | Exact reader adoption plus data/evidence restrictions; consumes persisted authority revocation. RER exact enforcement; AAP proof. |
| U14 | U1,U7,U12c,U13 | 250–340 | Forward corrective generation. RER correction; CE retained lineage. |
| U15 | U1,U13 | 300–390 | Shared guarded read snapshot and authority decision. RER exact enforcement/cache. |
| U16 | U15 | 300–390 | APIs and shared catalog loaders. RER protected-surface gate. |
| U17 | U15,U16 | 300–400 | Pages, metadata, JSON-LD, sitemap. RER protected-surface gate. |
| U18 | U15,U16,U17 | 260–350 | Payload/external/client/PWA cache enforcement. RER bounded cache. |
| U19 | U1–U18 | 250–340 | Non-production acceptance harness and runbook. CE custody; RER bootstrap/cache; SA handoff. |

## U1 — Database Primitive Contract

**Paths:** `prisma/schema.prisma`, additive `prisma/migrations/**`, `src/lib/production-readiness/{projection,operations}.ts`, `tests/production-readiness/db-primitives.test.ts`.

- [x] Observe RED in `tests/production-readiness/db-primitives.test.ts`: fail on missing singleton control, monotonic generation/epoch, guarded operation/idempotency records, and protected current-projection constraints. <!-- sdd-owner: implementation -->
- [x] GREEN: add only the public-schema model/migration primitives, constraints, and typed guarded procedure interfaces required by later units; preserve existing `ProductionReadiness*` public tables and add no grants, baseline lifecycle, activation, or reader behavior. <!-- sdd-owner: implementation -->
- [x] Independently triangulate against disposable PostgreSQL that direct table mutation cannot satisfy procedure-owned invariants and that schema constraints survive a fresh database. <!-- sdd-owner: implementation -->
- [x] Refactor the primitive mapping once, then rerun the failing-then-passing contract and PostgreSQL suite without moving bootstrap, baseline, or lifecycle ownership into U1. <!-- sdd-owner: implementation -->

## U2 — Bootstrap, Roles, and Recovery Hardening

**Paths:** `scripts/{postgres-operations,render-postgres-bootstrap}.ts`, `docker/compose/app-grants.sql`, `scripts/postgres-{backup-r2,recovery-r2,recovery-smoke}.mjs`, `tests/{postgres-operations,postgres-recovery}.test.ts`.

- [x] Observe RED in bootstrap/recovery tests: source/admin/runtime/PUBLIC roles can currently bypass protected facts, future defaults, definer execution, or ACL-free restore coverage. <!-- sdd-owner: implementation -->
- [x] GREEN: replace broad current/future grants with explicit role/object allowlists, hardened owners/definers/search paths, revoked default privileges and `public` CREATE/EXECUTE escape routes, plus recovery regrant checks. <!-- sdd-owner: implementation -->
- [x] Independently triangulate with disposable PostgreSQL bootstrap and ACL-free restore, including ownership, inheritance, SET ROLE, functions, sequences, future objects, and mutable-source SELECT denial. <!-- sdd-owner: implementation -->
- [x] Refactor allowlist rendering once, then rerun RED-derived privilege and restore proofs; leave DB primitives in U1 and custody/GC in U5. <!-- sdd-owner: implementation -->

## U3 — Canonical Candidate Contract

**Paths:** `src/lib/production-readiness/{canonical,candidate,refresh-policy}.ts`, `tests/production-readiness/{canonical,candidate}.test.ts`.

- [x] Observe RED for `authority-candidate/v1` canonical bytes: reject fixture/bare-digest inputs, unsupported versions, invalid Unicode/number/order/decimal handling, and conflated baseline/candidate/policy/refresh identities. <!-- sdd-owner: implementation -->
- [x] GREEN: implement versioned canonical manifest bytes/digests binding exact release/deployment/full SHA, scope/validity, policy, real baseline evidence, coverage/watermarks/provenance, and canonicalization versions. <!-- sdd-owner: implementation -->
- [x] Independently triangulate by recomputing fixtures from separately constructed canonical inputs and proving policy/release/SHA/scope/validity changes alter the candidate while a conforming future delta does not rewrite it. <!-- sdd-owner: implementation -->
- [x] Refactor canonical encoders once, then rerun reproducibility and rejection cases; do not create approvals, reservations, or publication in U3. <!-- sdd-owner: implementation -->

## U4a — Baseline Preparation and Same-Snapshot Seal

**Paths:** `prisma/schema.prisma`, U4a migration/procedures, `src/lib/production-readiness/projection.ts`, `tests/production-readiness/baseline-build.test.ts`.

- [x] Observe RED for same-exported-snapshot baseline preparation: reject producer/verifier snapshot loss, inconsistent roots, partial uploads, expired/rejected FROZEN reuse, old-epoch retry, and cleanup without archived canonical bytes. <!-- sdd-owner: implementation -->
- [x] GREEN: implement bounded EMPTY/BUILDING/FROZEN preparation, attempt/epoch binding, bounded uploads, exported/imported snapshot identities, and independent same-snapshot/root sealing; reject incomplete, snapshot-loss, expired, rejected, or FROZEN-reused seals; no activation, abandon, archive, or cleanup logic belongs here. <!-- sdd-owner: implementation -->
- [x] Independently triangulate with real PostgreSQL snapshot export/import, proving source remains writable and snapshot loss, inconsistent roots, incomplete uploads, stale/expired/rejected attempts, and FROZEN reuse reject while a valid attempt ends nonpublic FROZEN. <!-- sdd-owner: implementation -->
- [x] Refactor baseline build/seal helpers once, then rerun snapshot-loss and seal-rejection cases; activation competition remains exclusively U11a. <!-- sdd-owner: implementation -->

## U4b — Abandon, Archive, and Cleanup

**Paths:** `src/lib/production-readiness/{projection,artifacts,candidate}.ts`, U4 migrations/procedures, `tests/production-readiness/{baseline-build,baseline-archive}.test.ts`.

- [x] GREEN: implement guarded abandon, archive receipt, resumable cleanup, and epoch fence; no activation logic belongs here. <!-- sdd-owner: implementation -->
- [x] Independently triangulate retrieval/hash/length/count archive proof, demonstrating only a fully archived abandoned attempt reaches EMPTY. <!-- sdd-owner: implementation -->
- [x] Refactor build/archive state helpers once, then rerun archive and cleanup cases; activation competition is exclusively U11a. <!-- sdd-owner: implementation -->

## U5 — Evidence Custody, Integrity, Capacity, and GC Gate

**Paths:** `src/lib/production-readiness/{artifacts,projection}.ts`, custody migrations, `scripts/postgres-{backup-r2,recovery-r2,recovery-smoke}.mjs`, `docs/catalog-authority-publication-runbook.md`, `tests/production-readiness/{custody,integrity}.test.ts`.

- [x] Observe RED for evidence loss/corruption, active references, revoked authority, legal/operational holds, rejected-attempt retention, and GC attempting to delete bytes before latest referencing expiry plus 180 days. <!-- sdd-owner: implementation -->
- [x] GREEN: implement dependency closure, integrity status/restrictions, active-reference/hold-aware bounded GC, retention receipts, and named capacity/integrity measurement ownership that blocks enablement when proof is absent. <!-- sdd-owner: implementation -->
- [x] Independently triangulate using disposable PostgreSQL plus retained-artifact fixtures: revocation does not shorten retention, holds win, corruption restricts the dependency closure, and restore requires integrity/privilege proof. <!-- sdd-owner: implementation -->
- [x] Refactor retention traversal once, then rerun custody and integrity proofs; do not add a scheduler or delete evidence as a rollback action. <!-- sdd-owner: implementation -->

## U6 — Shared Controlled-Source Capture Core

**Paths:** `scripts/pipeline/direct-refresh-active-write.ts`, `src/lib/production-readiness/operations.ts`, U1 procedures, `tests/production-readiness/source-capture.test.ts`.

- [x] Observe RED for missing actual SQL BEFORE/AFTER/history capture, capture failure after a typed write, unknown source commit, uncaptured subsequent mutation, and producer report timestamps substituted for durable observations. <!-- sdd-owner: implementation -->
- [x] GREEN: extend the shared active-write transaction with deterministic typed capture, operation/item identity, actual returned facts, and same-source-transaction rollback semantics while retaining existing locks, approvals, kill switch, no-create, and no-partial controls. <!-- sdd-owner: implementation -->
- [x] Independently triangulate in PostgreSQL that capture failure rolls back source writes, lost responses require discovery, and source transactions never take catalog locks. <!-- sdd-owner: implementation -->
- [x] Refactor the shared capture API once, then rerun source transaction proofs; verifier and adapter-specific behavior remain in U7/U8. <!-- sdd-owner: implementation -->

## U7 — Independent Postcommit Source Verifier

**Paths:** `src/lib/production-readiness/{verification,operations,artifacts}.ts`, postwrite/baseline evidence adapters, `tests/production-readiness/delta-verification.test.ts`.

- [x] Observe RED for producer-only PASS, missing/corrupt evidence, committed-source drift, changed-field overcopy, invalid source age, unknown lineage, and verifier failure that would otherwise certify public facts. <!-- sdd-owner: implementation -->
- [x] GREEN: implement separate read-only postcommit verification/sealing of actual source observations, policy/mask/dependencies, governed predecessor/result, verification time, and negative pending restrictions; it has no public-effect procedure. <!-- sdd-owner: implementation -->
- [x] Independently triangulate with a separate source credential and committed snapshot that source drift conflicts, failed verification leaves source-only changes nonpublic, and observation/verification times do not rejuvenate source/history fields. <!-- sdd-owner: implementation -->
- [x] Refactor verifier evidence construction once, then rerun independent-source and negative-restriction proof; promotion remains U12. <!-- sdd-owner: implementation -->

## U8a — Carrefour and Vea Capture Adapters

**Paths:** `scripts/direct-refresh-{carrefour,vea}-write.ts`, their evidence adapters, `tests/scripts/{carrefour,vea}-write.test.ts`.

- [x] Observe RED per adapter for prohibited create/delete/class, partial batch, missing returned identities/history, wrong field mask, and lost-response report assumptions. <!-- sdd-owner: implementation -->
- [x] GREEN: connect Carrefour and Vea to U6 capture and U7 verifier inputs without changing their existing approval, lock, kill-switch, or batch controls. <!-- sdd-owner: implementation -->
- [x] Independently triangulate with focused PostgreSQL runs for allowed update/history append and verifier failure, proving the current governed projection is unchanged because promotion is unavailable. <!-- sdd-owner: implementation -->
- [x] Refactor only duplicated adapter glue, then rerun both adapter suites; both remain source-only until U12. <!-- sdd-owner: implementation -->

## U8b — Disco, Jumbo, and Más Capture Adapters

**Paths:** `scripts/direct-refresh-{disco,jumbo,mas}-write.ts`, their evidence adapters, `tests/scripts/{disco,jumbo,mas}-write.test.ts`.

- [x] Observe RED per adapter for unsupported mutation, partial batch, absent captured facts, wrong source policy, and lost-response assumptions; include DIA audit-only non-eligibility. <!-- sdd-owner: implementation -->
- [x] GREEN: connect Disco, Jumbo, and Más to U6/U7 contracts without broadening writer permissions or making any source-only writer publicly effective. <!-- sdd-owner: implementation -->
- [x] Independently triangulate with concurrent PostgreSQL adapter cases proving all-or-nothing capture, conflict-safe source behavior, and no governed effect after verification failure. <!-- sdd-owner: implementation -->
- [x] Refactor shared glue only, then rerun all three adapter suites; if measured above 400 lines, pause for a new delivery decision rather than assuming an exception. <!-- sdd-owner: implementation -->

## U3c — Durable Candidate Technical Admission

**Paths:** `prisma/schema.prisma`, additive `prisma/migrations/**`, `src/lib/production-readiness/{candidate-admission,candidate,artifacts,repository,publication-access}.ts`, `tests/production-readiness/{candidate-admission,approval-persistence}.test.ts`.

- [x] Observe RED for a missing immutable candidate technical admission contract: canonical policy/baseline/candidate/verification bytes and digests, exact identity/validity, opaque-ID server load, and no authority/publication effect. <!-- sdd-owner: implementation -->
- [x] GREEN: persist immutable `refresh_policies`, `baseline_manifests`, `authority_candidates`, and `candidate_technical_verifications`; add only a guarded server-side exact eligible-admission DAL/procedure and correct U9a challenge/receipt snapshots to retain server-loaded candidate/verification IDs and reviewed bytes/digest. <!-- sdd-owner: implementation -->
- [x] Independently triangulate with one unique disposable PostgreSQL database: prove immutable rows, canonical byte/digest equality, pass/revocation/deadline/validity eligibility, opaque-ID server loading, snapshot binding, changed-binding conflict, and no authority/publication object/effect. <!-- sdd-owner: implementation -->
- [x] Refactor the admission and U9a consumer boundary once, then rerun focused/full quality proof; do not add browser facts, routes/UI, enrollment, reservation, publication, activation, runtime authority, U7 delta conflation, or U10/U11 behavior. <!-- sdd-owner: implementation -->

## U9a — Durable Approval Persistence

**Paths:** `prisma/schema.prisma`, additive `prisma/migrations/**`, `src/lib/production-readiness/publication-access.ts`, `tests/production-readiness/approval-persistence.test.ts`.

- [x] Observe RED for absent durable grants/challenges/receipts and typed persistence contract; deny missing/wrong-scope/expired/revoked grants and retain no authority/publication path. <!-- sdd-owner: implementation -->
- [x] GREEN: add additive `PublicationGrant`, `ApprovalChallenge`, and `ApprovalReceipt` persistence with finite scope/grant expiry/revocation, session/user/payload-bound hashed nonce, atomic one-use consume, and exact full-request idempotency recovery/conflict; no ingress, enrollment, reservation, publication, activation, runtime authority, configuration, or traffic effect. <!-- sdd-owner: implementation -->
- [x] Independently triangulate with a unique disposable PostgreSQL database: deny expired/revoked grants, permit only one concurrent consume, recover exact receipt retry, reject changed-request conflict, and prove no authority/publication object exists. <!-- sdd-owner: implementation -->
- [x] Refactor the typed DAL/procedure boundary once, then rerun persistence and PostgreSQL proofs; the existing Clerk ingress seam is U9b evidence and remains unedited. <!-- sdd-owner: implementation -->

## U9b — Scoped Clerk Ingress and Approval Flow

**Paths:** `src/lib/admin/{access,access-policy}.ts`, `src/lib/production-readiness/approval.ts`, `src/app/admin/catalog-authority/[operationId]/page.tsx`, `src/app/api/admin/catalog-authority/{prepare,approve}/route.ts`, `tests/admin/catalog-authority-approval.test.ts`.

- [x] Observe RED for anonymous/generic-admin/wrong-scope/expired grant, CSRF/Origin/Fetch-Metadata failure, nonce/session/payload swap, replay, and a consent request missing reviewed binding fields against the U9a durable repository. <!-- sdd-owner: implementation -->
- [x] GREEN: wire Clerk session admission to uncached U9a scoped DB-grant validation, canonical review/challenge/receipt, one-use session-bound nonce, and full-request idempotency; this unit creates no reservation, publication, or runtime authority. <!-- sdd-owner: implementation -->
- [x] Independently triangulate with a separately authorized Clerk **test** instance/session and U9a/U9c disposable DB grant: one authorized consent succeeds; changed release, deployment, full SHA, scope, validity, policy, or permitted refresh class requires a fresh challenge, new idempotency key, and retains its own candidate/verification/reviewed digest; old consent or idempotency cannot recover a changed binding. <!-- sdd-owner: implementation -->
- [x] Refactor ingress/handler boundaries once, then rerun the Clerk test-session, changed-binding, and replay proofs; production Clerk enrollment, keys, and evidence collection remain parent actions. <!-- sdd-owner: implementation -->

## U9c — Durable Approving-Grant Expiry Binding

**Paths:** `prisma/schema.prisma`, additive `prisma/migrations/20260902_approval_grant_expiry_binding/migration.sql`, `src/lib/production-readiness/{approval,publication-access}.ts`, `tests/admin/catalog-authority-approval.test.ts`, `tests/production-readiness/approval-persistence.test.ts`.

- [x] Observe RED: prove a challenge ignores an earlier approving-grant expiry and durable challenge/receipt rows lack that binding. <!-- sdd-owner: implementation -->
- [x] GREEN: add only an additive grant-expiry persistence migration, typed repository/service binding, and server-side cap at the minimum of candidate expiry, admission deadline, original grant expiry, and ten minutes. <!-- sdd-owner: implementation -->
- [x] Independently triangulate with a fresh disposable PostgreSQL 16 database: apply all migrations; prove the earlier grant caps challenge/receipt, expired or revoked grants deny, exact retry recovers, changed grant binding conflicts, and original challenge/receipt expiry is immutable. <!-- sdd-owner: implementation -->
- [x] Refactor the bounded approval expiry mapping, then rerun focused approval/persistence tests and the full quality suite; do not extend an original challenge, receipt, grant, candidate, or authority expiry. <!-- sdd-owner: implementation -->

## U10 — Reservation and Vercel Prebuild Selector Contract

**Paths:** `src/lib/production-readiness/build-contract.ts`, `scripts/build-catalog-contract.ts`, `scripts/validate-pinned-vercel-deployment.ts`, `package.json`, `docs/portable-runtime-contract.md`, `tests/production-readiness/build-contract.test.ts`.

- [x] Observe RED for selector v1, mutable/caller-supplied SHA/provenance, candidate-digest circularity, platform/domain ID confusion, and any selector treated as active authority. <!-- sdd-owner: implementation -->
- [x] GREEN: implement selector v2 reservation/build-contract validation for preallocated domain deployment/publication/incarnation and immutable packaged query inputs, with no authority activation, config mutation, alias, or traffic effect. <!-- sdd-owner: implementation -->
- [x] Independently triangulate against fixtures from a separately authorized non-production Vercel proof environment, confirming actual packaged contract/provenance mismatch blocks enablement and bootstrap proof never reports `active:true`. <!-- sdd-owner: implementation -->
- [x] Refactor selector parsing once, then rerun fixture/non-production proof; apply never provisions Vercel, deploys, aliases, or collects production evidence. <!-- sdd-owner: implementation -->

## U11a — Atomic initial authority activation

**Paths:** `prisma/schema.prisma`, `prisma/migrations/20260903_atomic_authority_lifecycle/migration.sql`, `src/lib/production-readiness/repository.ts`, `tests/production-readiness/authority-lifecycle.test.ts`.

**Boundary:** Initial FROZEN→LIVE/g0 activation only. Response loss remains unknown: do not replay or compensate. Read-only recovery inspection is deferred to U11b, not an activation or publication gate; no guarded routes, authority revocation, existing-LIVE adoption, configuration, traffic, or enablement is claimed here.

- [x] Observe RED for missing initial activation, expired final DB-clock eligibility, indispensable audit failure, changed request identity, competing reservation, abandon-versus-activate races, and unknown response handling that must prohibit replay or compensation. <!-- sdd-owner: implementation -->
- [x] GREEN: implement the guarded, final-DB-clock-checked initial activation transaction atomically persisting FROZEN→LIVE/g0, exact terminal authority, verification/authorization receipts, indispensable audit, operation outcome and publishing adoption; return committed identity without active-success or readback-gate claims. <!-- sdd-owner: implementation -->
- [x] Independently triangulate in real PostgreSQL that expiry before the final check rolls back, a post-check commit across expiry preserves only historical proof, exact full-request retry has one effect and original expiry, changed requests/reservation conflicts reject, audit failure rolls back, both abandon/activate race orders have one winner, old-epoch/abandoned attempts reject, and LIVE cleanup cannot delete active rows. <!-- sdd-owner: implementation -->
- [x] Refactor initial activation and its proof helpers, then rerun focused PostgreSQL, unknown-response/no-replay, expiry, retry/conflict, audit-rollback and race proofs plus the quality suite; inspection, authority revoke, guarded routes and existing-LIVE generation adoption remain U11b. <!-- sdd-owner: implementation -->

## U11b1 — Recovery and guarded activate/inspect

**Depends on:** U11a; U13 waits for U11b4/full lifecycle.

- [x] Observe RED for absent exact-commit inspection, unguarded ingress, invalid input, identity conflict and unknown-response replay. <!-- sdd-owner: implementation -->
- [x] GREEN: implement scoped read-only original proof/current DB-clock eligibility and guarded activate/inspect routes without replay, compensation, renewal, acknowledgement, publication gate or duplicate audit. <!-- sdd-owner: implementation -->
- [x] Independently triangulate fresh PostgreSQL and guarded routes: original proof/times survive response loss/expiry; unauthorized access denies, conflicts/not-found are deterministic and inspection writes nothing. <!-- sdd-owner: implementation -->
- [x] Refactor recovery/route boundaries; rerun focused tests, configured npm test, lint, typecheck and clean build; preserve U11a with no revoke/adoption/configuration/traffic effect. <!-- sdd-owner: implementation -->

## U11b2 — Authority revoke consent

**Depends on:** U11b1; U13 waits for U11b4/full lifecycle.

- [x] Observe RED for missing action/reason/scope/version binding, invalid sessions, swapped consent and replay. <!-- sdd-owner: implementation -->
- [x] GREEN: persist action-specific revoke consent with immutable reviewed identity/reason/version and one-use session-bound proof. <!-- sdd-owner: implementation -->
- [x] Independently triangulate authorized test-authentication/disposable-PostgreSQL revoke consent; changed binding requires fresh consent. <!-- sdd-owner: implementation -->
- [x] Refactor consent boundaries and rerun focused/full quality proof; no authority transition or route effect. <!-- sdd-owner: implementation -->

## U11b3 — Atomic revoke and guarded route

**Depends on:** U11b2; U13 waits for U11b4/full lifecycle.

- [x] Observe RED for invalid revoke consent/version, unguarded ingress, duplicate audit and partial failure. <!-- sdd-owner: implementation -->
- [x] GREEN: implement atomic authority revoke transition/audit/proof and guarded revoke route without corrupting admitted data. <!-- sdd-owner: implementation -->
- [x] Independently triangulate PostgreSQL/routes: audit failure rolls back, exact recovery is single-effect and unauthorized requests deny. <!-- sdd-owner: implementation -->
- [x] Refactor revoke boundaries and rerun focused/full quality proof; preserve U4 cleanup and original evidence retention. <!-- sdd-owner: implementation -->

## U12a1 — Canonical Governed Envelopes

**Depends on:** U1,U7,U11a,U11b3. Pure independent verification and canonical per-key envelope construction only; trusted adapters supply committed observations and complete current facts. No persistence, source rescan or public effect.

**Paths:** `src/lib/production-readiness/{verification,canonical}.ts`, `tests/production-readiness/{delta-verification,promotion-ready-envelope}.test.ts`.

- [x] Observe RED for merged-only/caller-asserted images, tombstone rejection, duplicate/noncanonical keys, unstable ordering/hash, missing candidate/delta/incarnation/policy/build/health/predecessor-generation-lineage/evidence bindings and mutation after construction. <!-- sdd-owner: implementation -->
- [x] GREEN: derive immutable canonical per-key before-image/after-image/tombstone envelopes from independently verified U7 observations and trusted current facts, binding exact identities and proof digest; reject unverifiable fields without source rescan, caller-trusted images, durable admission or public effect. <!-- sdd-owner: implementation -->
- [x] Independently triangulate pure/property-like updates/inserts/deletes, order independence, tamper rejection, duplicate conflicts and post-construction immutability; no database is required for this in-memory contract. <!-- sdd-owner: implementation -->
- [x] Refactor one shared canonical proof/hash boundary; rerun focused tests, configured npm test, lint, typecheck and clean build with exact cleanup; leave all durable/public-effect successors pending. <!-- sdd-owner: implementation -->

## U12a2-A — Verifier Principal and ACL

**Depends on:** U12a1. Establish only the authenticated PostgreSQL verifier principal/provenance and least-privilege ACL prerequisite; no envelope commitment, admission persistence, generation, authority mutation or public effect.

**Paths:** `scripts/postgres-operations.ts`, `docker/compose/{app-grants.sql,init-app-role.sh}`, `tests/postgres-operations.test.ts`, `tests/production-readiness/verifier-principal.test.ts`.

- [x] Observe RED proving app/runtime cannot impersonate the verifier, `current_user` becomes the SECURITY DEFINER owner and is invalid provenance, and missing verifier role/grants deny the future admission capability. <!-- sdd-owner: implementation -->
- [x] GREEN: render/bootstrap one distinct verifier `LOGIN NOINHERIT` role with read-only source/current/evidence access, no protected DML, no app/runtime inheritance or `SET ROLE` route, no PUBLIC capability, and an explicit verifier-only future admission-procedure grant contract without creating that procedure or storage. <!-- sdd-owner: implementation -->
- [x] Independently triangulate fresh disposable PostgreSQL owner/app/runtime/verifier connections: prove effective ACL denial and that `session_user` remains the original caller while `current_user` changes across a fixed-safe-search-path SECURITY DEFINER boundary. <!-- sdd-owner: implementation -->
- [x] Refactor one shared deterministic role-name/grant renderer, then rerun focused PostgreSQL/full quality checks and exact cleanup; leave U12a2-B/C and every successor pending. <!-- sdd-owner: implementation -->

## U12a2-B — Authenticated Exact-Envelope Commitment

**Depends on:** U12a2-A. Bind the authenticated verifier caller to exact U12a1 canonical envelope bytes without admission rows or public effect.

- [x] Observe RED for forged verifier labels, app/runtime calls, byte/digest swaps, noncanonical envelopes, and `current_user` provenance. <!-- sdd-owner: implementation -->
- [x] GREEN: create the narrow verifier-bound exact-byte commitment boundary using `session_user` and retained canonical evidence, without admission persistence, generation, authority mutation or public effect. <!-- sdd-owner: implementation -->
- [x] Independently triangulate fresh PostgreSQL caller/tamper/concurrency cases and prove source drift cannot rewrite committed bytes. <!-- sdd-owner: implementation -->
- [x] Refactor the commitment mapping once and rerun focused/full quality checks with exact cleanup; leave U12a2-C and successors pending. <!-- sdd-owner: implementation -->

## U12a2-C — Durable Immutable Envelope Admission

**Depends on:** U12a2-B. Admit exact verifier-bound envelopes durably with retained evidence and before-images; no generation increment, publishing adoption, authority mutation or public effect.

**Paths:** `prisma/schema.prisma`, `prisma/migrations/20260904_verifier_envelope_commitment/migration.sql`, `prisma/migrations/20260905_promotion_ready_delta_admission/migration.sql`, `tests/production-readiness/{verifier-envelope-commitment,promotion-ready-admission}.test.ts`.

- [x] Observe RED for missing/tampered/noncanonical committed envelope bytes, mismatched exact bindings/evidence, mutable or duplicate durable seals and source rescans. <!-- sdd-owner: implementation -->
- [x] GREEN: persist immutable promotion-ready seals from the U12a2-B verifier commitment, binding exact candidate/delta/incarnation/policy/build/health/predecessor-lineage and retained U14 before-images; no promote_delta or public effect. <!-- sdd-owner: implementation -->
- [x] Independently triangulate fresh PostgreSQL negative/tamper/idempotency/concurrency cases and prove source changes after admission cannot alter sealed payload or governed projection. <!-- sdd-owner: implementation -->
- [x] Refactor guarded canonical admission once; rerun focused PostgreSQL/full quality checks and exact cleanup, preserving U11a/U11b3 and leaving promotion/recovery/adoption pending. <!-- sdd-owner: implementation -->

## U12b1 — Immutable Generation and Promotion Foundation

**Depends on:** U12a2-C. Owns only immutable g>0 generation-record storage and typed repository/operation contracts: exact sealed-admission, incarnation/generation, predecessor/result lineage, policy/health/build/manifest, publishing-adoption, and indispensable audit/evidence bindings. It MUST NOT change current governed rows or `governed_generation`, define `promote_delta`, rescan source, recover, renew, or create any serving/public effect.

- [x] Observe RED for absent immutable generation/promotion contract, missing required seal/lineage/adoption/audit/evidence bindings, mutable rows, and any public-effect procedure. <!-- sdd-owner: implementation -->
- [x] GREEN: add the minimum immutable relational/schema and typed repository/operation contract for U12b2, including sealed-manifest association and constraints; preserve original consent/expiry and make no current-row, generation, authority, or serving mutation. <!-- sdd-owner: implementation -->
- [x] Independently triangulate focused negative/contract cases proving required bindings and immutable storage, with no `promote_delta` or public effect available. <!-- sdd-owner: implementation -->
- [x] Refactor the foundation contract once; rerun focused/full quality checks without adding atomic promotion, source rescan, recovery, renewal, or adoption execution. <!-- sdd-owner: implementation -->

## U12b1b — Sealed Typed Delta Items

**Depends on:** U12b1. Owns immutable typed storage and deterministic validation for the admitted six-entity delta after-images/tombstones only. Every item binds to its admitted promotion-ready seal and generation manifest. It MUST NOT define `promote_delta`, alter serving/current rows, advance a generation, or create public effect.

- [x] Observe RED for absent typed item storage, missing seal/manifest binding, malformed type identity, duplicate keys, mutable rows, and any promotion/current-row mutation. <!-- sdd-owner: implementation -->
- [x] GREEN: persist and validate deterministically ordered product, supermarket, offer, history, promotion, and membership after-images/tombstones under immutable seal/manifest bindings only. <!-- sdd-owner: implementation -->
- [x] Independently triangulate valid ordering plus malformed, duplicate, unbound, and tombstone cases while proving no promotion/public-effect SQL exists. <!-- sdd-owner: implementation -->
- [x] Refactor item validation once; rerun focused/full quality checks without applying an item or changing generation. <!-- sdd-owner: implementation -->

## U12b2 — Atomic Verified Delta Promotion

**Depends on:** U12b1b. Sole owner of `promote_delta`: one final-DB-clock-checked transaction applying only sealed after-images/tombstones, CASing g→g+1, and atomically creating the U12b1 immutable generation/adoption/audit/evidence/outcome proof. Commit is the only public effect; core PostgreSQL atomicity/CAS proof is mandatory and cannot move to U12c.

- [x] Observe RED for missing/stale U12b1 foundation or U12a2 seal, evidence/audit failure, predecessor/generation/health/policy/build drift, CAS conflict, source rescan and partially observable rows/proof. <!-- sdd-owner: implementation -->
- [x] GREEN: implement `promote_delta` as the sole final-DB-clock-checked public-effect transaction, applying only sealed after-images/tombstones and preserving before-images and original consent/expiry. <!-- sdd-owner: implementation -->
- [x] Independently triangulate fresh PostgreSQL atomicity/CAS and total audit/evidence rollback; prove all-old/all-new rows with matching generation records, immediate eligible visibility before readback, source-only divergence, exact retries and historical-only late results. <!-- sdd-owner: implementation -->
- [x] Refactor lock/order and proof boundaries once; rerun focused/full quality checks and exact cleanup without source rescan, second publication transaction, temporal pointer, renewed consent or expiry extension. <!-- sdd-owner: implementation -->

## U12c — Exact Delta Recovery and Temporal Proof

**Depends on:** U12b2. Readback is observational, not publication or a prerequisite for ordinary eligible reads. finalCheckedAt alone never establishes earlier eligible visibility; late-ineligible admission requires separate forward recovery, not revival.

- [x] Observe RED for response-loss replay/compensation, changed recovery identity, renewed expiry, fabricated pre-expiry visibility, readback gating or late-ineligible in-place revival. <!-- sdd-owner: implementation -->
- [x] GREEN: expose read-only exact committed identity/proof and live DB-clock eligibility with the final-check/result-observation bracket, retaining original times and denying unproven earlier eligibility; no authority/adoption/publication write. <!-- sdd-owner: implementation -->
- [x] Independently triangulate fresh PostgreSQL RR/CAS/temporal proof: recovery is single-effect, concurrent readers see complete old/new records, an eligible delta serves before publisher readback, source-only commits stay nonpublic and late results cannot fabricate earlier eligible visibility. <!-- sdd-owner: implementation -->
- [x] Refactor recovery/proof mapping once; rerun focused PostgreSQL and full quality checks with exact cleanup, preserving U11a/U11b3 and leaving U11b4 adoption and U14 forward recovery unimplemented. <!-- sdd-owner: implementation -->

## U11b4 — Existing-LIVE adoption and lifecycle closure

**Depends on:** U11b3,U12c; U13 waits for U11b4/full lifecycle.

**Evidence boundary:** Independently verify g0 from U11a immutable activation/baseline proof and g>0 only from U12b immutable generation records, including exact policy/generation/lineage/health/build and the authorized serving identity. Publisher JSON is not independent proof; reject stale/drift/late-ineligible cases without generation reset, inherited authority or in-place repair. Late-ineligible admission requires separately verified forward recovery, never revival.

- [ ] Observe RED for unverified/stale adoption, policy/generation/lineage/health/build drift and late-ineligible admission revival. <!-- sdd-owner: implementation -->
- [ ] GREEN: independently verify and persist exact existing-LIVE adoption from U11a g0 activation/baseline proof or U12b g>0 immutable generation records; never substitute publisher JSON, reset generation, inherit authority or repair admission in place. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate full lifecycle in PostgreSQL/routes, including drift conflicts and late-ineligible forward recovery rather than revival. <!-- sdd-owner: implementation -->
- [ ] Refactor adoption boundaries and rerun complete lifecycle/focused/full quality proof; U13 waits for this full-lifecycle completion. <!-- sdd-owner: implementation -->

## U13 — Exact Reader Adoption and Data/Evidence Restrictions

**Depends on:** U1,U11b4,U12c; remains blocked until U11b4 full-lifecycle closure.

**Paths:** `src/lib/production-readiness/{projection,restrictions}.ts`, `src/lib/public-catalog-authority{,.server}.ts`, `tests/production-readiness/{generation-adoption,restriction}.test.ts`.

- [ ] Observe RED for reader adoption copied from publisher, unequal policy digest, stale g/lineage/health/build, persisted authority revocation not denying that authority, authority revocation treated as data corruption, and unknown data/evidence restriction boundary leaking commercial facts. <!-- sdd-owner: implementation -->
- [ ] GREEN: implement exact `adopt_generation`, policy-equality/current-state checks, and fact/surface **data/evidence** restrictions with distinct historical admission versus live reader eligibility; consume the U11b-persisted authority-revoke state and do not implement its transition, audit, or proof. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate with A-publisher/B-reader PostgreSQL cases: B serves only through its own valid equal-policy adoption, a U11b-persisted authority revoke denies A without corrupting admitted data, and data/evidence restriction denies every reader. <!-- sdd-owner: implementation -->
- [ ] Refactor eligibility/restriction predicates once, then rerun A/B, persisted-authority-revoke consumption, and unknown-boundary proofs; cache behavior remains U15/U18. <!-- sdd-owner: implementation -->

## U14 — Verified Forward Corrective Generation

**Paths:** `src/lib/production-readiness/{projection,verification,operations}.ts`, `tests/production-readiness/forward-correction.test.ts`.

- [ ] Observe RED for historical-pointer rollback, full-row inverse overwrite, missing before-images, unresolved overlap, source restoration assumption, and correction that clears an unknown boundary. <!-- sdd-owner: implementation -->
- [ ] GREEN: implement correction preparation from retained before-images/current predecessor and a separately verified/audited forward `g+1` (including verified no-op where allowed), preserving unrelated intervening changes. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate in PostgreSQL with bad delta plus unrelated/overlapping successor changes: only independently resolved fields change, unresolved facts stay restricted, and no historical bytes become selectable. <!-- sdd-owner: implementation -->
- [ ] Refactor correction lineage helpers once, then rerun preservation/restriction cases; do not weaken release revocation or reuse prior verification. <!-- sdd-owner: implementation -->

## U15 — Shared Guarded Read Snapshot and Authority Decision

**Paths:** `src/lib/public-catalog-{authority,authority.server,runtime.server,readiness}.ts`, projection read adapter, `tests/public-catalog-{authority,runtime}.test.ts`.

- [ ] Observe RED for mutable-source/latest-PROMOTED fallback, identity/adoption/manifest/health mismatch, RR snapshot-time lease renewal, false 404/zero/empty-history denial, and authority decision beyond 30 seconds or expiry. <!-- sdd-owner: implementation -->
- [ ] GREEN: implement `withAuthorizedCatalogRead` using one primary-DB repeatable-read projection snapshot, trusted-DB manifest/health completeness boundary, live-time pre-emission check, and immutable process-local exact decision leases. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate with real PostgreSQL that detail/history/count/ranking share one state, missing evidence is unavailable, a slow snapshot cannot install a new lease, and no valid exact authority denies protected fields. <!-- sdd-owner: implementation -->
- [ ] Refactor shared DTO/unavailable semantics once, then rerun snapshot and lease tests; APIs/pages/caches are separately owned below. <!-- sdd-owner: implementation -->

## U16 — Guarded APIs and Shared Catalog Loaders

**Paths:** `src/app/api/{search,products,promotions,categories,health/catalog}/**`, `src/lib/{catalog,basket-products,product-history,portfolio-catalog,price-freshness,public-catalog-api}.ts`, API tests.

- [ ] Observe RED for each API/loader returning protected source facts, false 404/empty history/zero count, unguarded filtering/ranking/discount/freshness, or category-derived commercial claims after authority denial. <!-- sdd-owner: implementation -->
- [ ] GREEN: route all API and shared loader commercial reads through U15 guarded DTOs; preserve batch order and independently static taxonomy while omitting protected derived values on denial. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate against a real built server and PostgreSQL authority state for search/list/detail/batch/history/promotions/categories/health, including static-only behavior and no mocked-resolver-only proof. <!-- sdd-owner: implementation -->
- [ ] Refactor route error/DTO handling once, then rerun API surface proof; page, metadata, sitemap, and client state remain U17/U18. <!-- sdd-owner: implementation -->

## U17 — Guarded Pages, Metadata, JSON-LD, and Sitemap

**Paths:** `src/app/{buscar,ofertas,categoria/[slug],producto/[ean],canasta}/**`, `src/app/sitemap.ts`, `src/lib/{seo/schema,sitemap,home-ui-data}.ts`, shared commercial components, browser tests.

- [ ] Observe RED for HTML/RSC/client/metadata/JSON-LD/sitemap protected leakage, late streams, render-time commercial timestamps, product-derived sitemap/category ordering, and denial that removes static shell/navigation. <!-- sdd-owner: implementation -->
- [ ] GREEN: migrate page and derived-output producers to U15/U16 guarded inputs, remove commercial claims on denial, preserve explicitly illustrative/static UI, and omit governed product sitemap values when unavailable. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate in a built Next browser/server run for navigation, prefetch, RSC, metadata, JSON-LD, static taxonomy, and sitemap variants under eligible and denied authority. <!-- sdd-owner: implementation -->
- [ ] Refactor shared component/metadata helpers once, then rerun browser coverage; exact installed Next.js 16.3.1 docs must be read before these framework edits. <!-- sdd-owner: implementation -->

## U18 — Payload, External, Client, and PWA Cache Enforcement

**Paths:** cache helpers, `next.config.ts`, `src/lib/{basket-products-client,basket-products-contract}.ts`, basket/favorite hooks, service-worker configuration, cache/browser tests.

- [ ] Observe RED for sliding/warm cache renewal, v1 envelope reuse, payload metadata-only binding, cache miss under stale decision, stale 304/HEAD/CDN/ISR/SWR output, and offline/client resume retaining commercial facts past original validity. <!-- sdd-owner: implementation -->
- [ ] GREEN: bind raw inputs/payloads to exact authority/policy/build/generation/evidence/query/evaluation semantics; enforce request-time external gates, private no-cache commercial responses, original-deadline client handling, and commercial PWA purge. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate in built-server/browser multi-instance scenarios that durable revocation stops newly served facts within 30 seconds and earlier expiry, outage uses only a preexisting bound lease, and static assets/shell remain cacheable. <!-- sdd-owner: implementation -->
- [ ] Refactor cache envelope and invalidation code once, then rerun browser/cache proof; do not adopt blanket `no-store` or enable shared cache custody without separate proof. <!-- sdd-owner: implementation -->

## U19 — Non-production Acceptance Harness and Runbook

**Paths:** `docs/{catalog-authority-publication-runbook,portable-runtime-contract}.md`, direct-refresh runbook/report/alert surfaces, `tests/production-readiness/**`, browser/PG harness docs.

- [ ] Observe RED for absent capacity/query-plan/integrity/backup/revocation measurements or named owners, missing Vercel prebuild provenance, unproven Clerk test authorization, and incomplete protected-surface evidence being treated as enablement-ready. <!-- sdd-owner: implementation -->
- [ ] GREEN: document and automate non-production proof receipts for PostgreSQL privileges/restore/integrity, capacity/retention measurements and owners, Clerk test-session consent, Vercel selector/provenance, built Next surface/cache proof, pending-age inspection, incident restriction/revoke/correct, and fail-closed enablement. <!-- sdd-owner: implementation -->
- [ ] Independently triangulate through separately authorized non-production PostgreSQL, built Next browser, Clerk test environment, and Vercel proof environment; demonstrate atomic effects, 180-day custody, exact handoff separation, and cache/revocation bounds without production evidence. <!-- sdd-owner: implementation -->
- [ ] Refactor runbook/proof output once, then rerun the full non-production acceptance matrix; apply never provisions credentials, enrolls keys, migrates production, deploys/aliases traffic, or collects authentic production evidence. <!-- sdd-owner: implementation -->

## Deferred Parent Actions

Production migrations; credentials/environment setup; Clerk enrollment, keys, and authorization; Vercel configuration, deployment, aliasing, and traffic; authentic production evidence; commits, pushes, PRs, and native review are parent-controlled and intentionally have no tasks here. Enablement remains fail-closed until U19's separately authorized non-production evidence is complete.

## Task Inventory Check

Implementation checkbox count: 135 (99 complete, 36 pending). All rows are implementation-owned with terminal markers. U11b1 owns recovery/activate/inspect; U11b2 consent, U11b3 revoke and U11b4 adoption remain separate. U12a1 → U12a2-A → U12a2-B → U12a2-C → U12b1 → U12b2 → U12c follows U11b3; U12b1 is immutable storage/contracts only, U12b2 alone produces immutable g>0 records through the atomic public-effect transaction, and U12c closes recovery before U11b4. U13/full-lifecycle consumers wait for U11b4. No enablement is authorized.
