# Publish verified catalog authority through an explicit operator workflow

## Intent and problem

Provide the smallest auditable operator CLI/writer bridge from an existing real catalog snapshot and its evidence to the PostgreSQL authority already consumed by the public-catalog runtime. One authorized user approves the exact candidate after separate technical verification. Catalog publication is not Vercel traffic promotion.

The repository findings cited by the original proposal describe a read-only runtime requiring exact identity matching and both promotion and publication in `PROMOTED` state. The existing repository creates only `PENDING` records. Exploration reportedly found a fixture-only shadow runner and separately controlled direct-refresh writers, but no canonical candidate-to-authority bridge. The deployment guard checks authority before promoting traffic; it does not create the first eligible authority. This identifies a missing prerequisite writer, not an inevitable logical cycle.

The original proposal reports no eligible joined authority in a production-query result associated with `e4d2618`. This does not establish that both underlying tables are empty. The full SHA, query parameters, and inspected revision must be recorded rather than treating that abbreviated identifier as an authorization identity. Evidence limitations and required traceability are listed below.

## Goals and scope of the first usable workflow

The first usable workflow is one complete capability, not necessarily one implementation diff or review unit. Its safety guarantees must hold together before operational use.

1. **Build a real candidate without new ingestion.** Derive reproducible canonical bytes and a digest from a consistent existing catalog snapshot. Bind retained evidence, source coverage, observation watermarks, and provenance. Reuse existing controlled-refresh evidence where applicable; never invent prices, sources, or provenance. Candidate content and approval-bound evidence must remain retrievable and verifiable through publication and recovery.

2. **Verify before asking for approval.** Independently check actual candidate bytes, evidence linkage, coverage, freshness, and intended publication scope; do not accept a producer's declared verification result as proof. Independence means separate technical checks, not a mandatory second person or service. Partial coverage remains eligible when supported by verifiable evidence, explicit missing coverage, and truthful historical degradation. Preserve `last_checked_at` freshness and the existing historical `verifiedAt` policy. The 24-hour classifier must not become an implicit all-fresh rejection rule.

3. **Bind one authorized user's explicit approval to the exact candidate.** Retain verifiable approving-actor identity, scope, canonical approval payload, and technical outcome. Before consent, make the candidate identity, intended scope, coverage gaps, relevant data age/degradation, verification result, and applicable expiry available for review. Authentication alone is insufficient: the actor must be authorized for that scope. Technical verification and human approval remain separate requirements, not a mandatory two-human requestor/approver system. Neither model approval nor an application's self-generated hash authorizes publication.

4. **Publish through a minimal reusable writer.** Extend the pending repository rather than bypassing it with manual SQL. Terminal promotion/publication transitions, verification metadata, and indispensable authorization/audit evidence must form one atomic activation outcome. Provide scoped idempotency, guarded concurrent transitions, and explicit conflicts. Retries must not create duplicate activation, partially eligible records, or extended validity.

5. **Support bounded recovery and audit.** Record candidate/evidence identity, technical outcome, approving and executing actors, transitions, timestamps, applicable expirations, revocation, and recovery outcomes. Provide read-back proof of the persisted authority and demonstrate resolution through the existing server/runtime path. Invalid candidates never activate. Failed publication preserves the previous persisted state, without guaranteeing that a predecessor remains eligible after time or identity changes.

## Business invariants

### Identity and authorization vocabulary

These are conceptual contracts, not a new database schema. Design must map them to existing fields and distinguish runtime comparison keys from proof and audit metadata.

| Term | Required meaning |
|---|---|
| Candidate identity | The exact canonical catalog content and its bound snapshot, evidence, coverage, observation watermarks, and provenance. A digest alone does not establish authenticity. |
| Authorization scope | The domain, target, deployment, and full commit SHA for which approval is granted. Approval also binds the exact candidate, verification outcome, and applicable expiry. |
| Runtime authority fingerprint | The exact persisted authority and identity conditions required by the existing runtime contract. It must not be broadened to accept another identity. |
| Read-back proof | Publication and promotion identifiers/states, domain/scope, target, deployment, full commit SHA, candidate digest, technical verification time, and applicable expirations. Include enough linked evidence to establish approval and current eligibility. Not every proof field is necessarily a runtime lookup key. |
| Decision metadata | Attributable approving/executing actors, approval time, state changes, revocation, and recovery history. These support authorization and audit; they are not interchangeable with candidate identity. |

### Time and coverage semantics

Keep data observation/check time, candidate technical-verification time, human-approval time, and expiry conceptually distinct. Verifying, approving, publishing, or retrying must not rewrite observation timestamps or make historical data appear newly collected. Preserve the existing interpretation and historical-data policy of `verifiedAt`; do not repurpose it without establishing its current contract.

Design must state whether approval expiry and authority expiry are shared or distinct, which transitions each constrains, and when validity is rechecked. A retry is not a new verification, renewed approval, or expiry extension.

Coverage must identify its applicable unit and expected universe using existing project definitions where available. Missing coverage must be explicit; an unknown expected universe must remain unknown, not be presented as complete coverage. Design may resolve representation gaps, but may not invent minimum percentages or fresh-only product gates.

### Required guarantees

- **Evidence and exact consent.** No valid candidate evidence means no authorization, regardless of digest shape or supplied environment identity. Changes to the candidate, approval-bound evidence, verification outcome, scope, or approved validity require fresh verification and explicit approval.
- **Approved-to-served binding.** The authority must have a verifiable relationship to the catalog it authorizes the runtime to serve. Data outside the approved binding cannot silently inherit approval. Design must demonstrate compatibility with existing controlled-refresh behavior, without imposing a blanket catalog freeze or changing direct-refresh policy. An incompatibility must be surfaced for review, not hidden by broadening authorization.
- **Unambiguous publication.** Competing candidates for the same serving identity must not produce ambiguous runtime selection or silent replacement. Any permitted coexistence or supersession requires an explicit rule consistent with the existing resolver; otherwise report a conflict.
- **Idempotent, attributable activation.** The same retry key and exact request recover the established outcome without another activation. Reusing that key with a different candidate or authorization payload is a conflict. An activation lacking its indispensable persisted authorization/audit evidence is not a valid outcome.
- **Eligibility without fallback.** Previous authority may continue only while unexpired, unrevoked, and otherwise eligible under its own exact serving identity. There is no automatic expiry extension or runtime fallback across identities. Expired or revoked authority cannot be revived by retry or recovery.
- **Runtime enforcement.** Expiry and revocation must hold through the real server/runtime path, including existing cached paths where applicable. Design must identify the enforcement point and cache behavior; it must not introduce an undocumented grace period.
- **Traffic separation.** Domain authorization may precede traffic movement. This workflow neither grants nor performs Vercel promotion.

## Non-goals

No fresh ingestion pipeline, scheduler, generic admin UI, mandatory two-person approval, enterprise PKI or storage framework, weakened runtime guard, direct-refresh policy change, manual `PROMOTED` seeding, or automatic traffic/configuration changes.

No production writes or credential access are needed to validate this proposal. Implementation, database/cloud operations, Git/push, and native review are not authorized by this document.

## Modified capabilities and affected areas

| Area | Proposed impact |
|---|---|
| Catalog candidate and evidence | Add the canonical snapshot/evidence bridge using existing data and operational artifacts; retain reproducible bytes and explicit coverage/time semantics. |
| Production-readiness persistence | Reuse `src/lib/production-readiness/repository.ts` and existing Prisma models. Add verified lifecycle transitions, atomic authorization/audit persistence, retry/conflict handling, and revocation. Schema changes remain a design question. |
| Operator workflow | Add a narrowly scoped authenticated and authorized CLI entry point for verification, informed exact-candidate approval, publication, and recovery. Command syntax is deferred. |
| Public authority and readiness | Preserve exact fingerprint and fail-closed semantics in `src/lib/public-catalog-authority.ts` and server/runtime consumers. Retain truthful degradation in `src/lib/public-catalog-readiness.ts`; prove binding and refresh compatibility rather than weakening checks. |
| Verification and operations | Add behavior-focused tests, PostgreSQL transaction/runtime proof, and operator guidance. Keep controlled refresh and traffic promotion separate. |

## Design questions, not reopened product decisions

- Choose minimal canonical serialization, a consistent snapshot boundary, and evidence retention/retrieval mechanisms. Map the candidate to the catalog represented at activation and subsequent serving, including permitted controlled refresh. Prevent unnoticed mutation between verification and activation.
- Map the identity vocabulary and read-back proof to actual repository/runtime fields. Document comparison keys, linked evidence, timestamp meanings, expiry rules, and coverage units without creating a new product hard gate.
- Select the smallest real trust mechanism for independent technical checks and scope-authorized operator approval, including tamper/replay protection and retrievable canonical payloads. The original proposal reports that receipt `payload_digest`, `signer`, and `scope` fields validate shape, not authenticity or candidate provenance; design must establish the actual verification boundary.
- Determine transactional boundaries, indispensable audit evidence, retry-key scope, and concurrent publication/supersession rules. Recheck required validity at activation and define recovery after a committed transaction whose response was lost.
- Specify revocation enforcement through the actual runtime and any caches, read-only proof, bounded rollback, and an explicitly authorized identity handoff for later execution. Prefer existing mechanisms.

No command syntax, schema, cache TTL, coverage percentage, or cryptographic architecture is prescribed here. Unresolved compatibility or trust questions must be resolved or explicitly escalated before implementation, not filled with assumptions.

## Success criteria

Future implementation acceptance must demonstrate, in an authorized non-production environment:

- [ ] **Real, reproducible candidate.** An existing real, non-fixture snapshot produces retained canonical bytes and a reproducible digest linked to verifiable evidence. Coverage units, missing/unknown coverage, observation watermarks, and historical degradation remain explicit.
- [ ] **Positive partial/historical path.** A candidate with partial coverage and historical data that satisfies the existing policy completes verification, approval, publication, and runtime resolution. Original observation/check timestamps and truthful degradation are preserved; no implicit all-fresh rule rejects it.
- [ ] **Separate verification and authorized consent.** Technical verification succeeds before one scope-authorized user's explicit exact-candidate approval is accepted. Bare hashes, model approval, unauthorized actors, missing/tampered evidence, and altered approval payloads are rejected.
- [ ] **Binding survives the publication boundary.** Mutation of approved candidate content or bound evidence between verification and activation is detected and cannot inherit prior approval. Runtime proof establishes the approved-to-served relationship and compatibility with permitted controlled refresh, not merely matching metadata while serving unrelated data.
- [ ] **Atomic publication and complete proof.** The approved candidate progresses through the reusable pending repository to atomically eligible PostgreSQL promotion/publication records with required verification and authorization/audit evidence. Read-back satisfies the proof contract defined above.
- [ ] **Real runtime eligibility.** The existing server/runtime path resolves the expected authority for its matching identity. Mismatched, expired, revoked, or otherwise ineligible authority fails closed. A fixture-only runner or mocked resolver alone is insufficient end-to-end evidence.
- [ ] **Idempotency and payload conflict.** Repeated requests for the same operation do not duplicate activation or extend validity. The same retry key with a different candidate, scope, or approval payload produces an explicit conflict.
- [ ] **Competing candidates.** Concurrent attempts for different candidates under the same serving identity exercise the documented conflict/supersession rule without ambiguous selection, silent replacement, or partially eligible state.
- [ ] **Expiry and failure boundaries.** Expiry during execution, injected transaction failure, and failure to persist indispensable authorization/audit evidence prevent invalid activation. Previous persisted state survives failure, but is served only if it remains independently eligible; no expiry extension or identity fallback occurs.
- [ ] **Commit followed by lost response.** When the transaction commits but the CLI loses its response, recovery discovers the persisted result and returns its proof without a second activation or renewed validity.
- [ ] **Revocation after runtime use.** Revoking previously resolved authority is enforced through the real runtime, including cached paths where present, according to the documented enforcement contract. Recovery cannot bypass it.
- [ ] **Audited recovery and rollback.** Interrupted-operation recovery, revocation, and bounded rollback retain attributable evidence and cannot reauthorize rejected, expired, revoked, or wrong-identity authority.

These are future acceptance obligations, not claims of tests, repository revalidation, or operational checks performed during proposal writing.

## Risks and rollback

| Risk | Constraint or mitigation |
|---|---|
| Self-attested hashes or authenticated-but-unauthorized actors mistaken for trust | Verify retained bytes, bound evidence, technical outcome, actor authenticity, and scope permission. Digest shape is never approval. |
| Snapshot drift or unrelated served data | Prove the approved-to-served binding and refresh compatibility; reject unproven changes without inventing a catalog freeze. |
| Partial/historical coverage presented as complete or recent | Preserve observation semantics, expose gaps and unknown coverage, and test the allowed degraded path positively. |
| Races, retries, expiry, or missing audit create invalid authority | Atomic activation, guarded transitions, explicit conflict rules, scoped idempotency, validity rechecks, and failure tests. |
| Lost CLI response causes duplicate publication | Recover the persisted outcome and proof; distinguish committed success from failure without guessing. |
| Revocation or recovery bypassed through cache or another identity | Enforce eligibility on the real runtime path; no undocumented grace period, predecessor revival, or cross-identity fallback. |
| Minimal bridge expands into infrastructure redesign | Prefer existing repository/evidence mechanisms; justify additions against required acceptance outcomes. |

Rollback disables further writer use without weakening the read-only guard; disabling the writer alone does not revoke existing authority. A bad newly published authority must be revoked through an audited path.

Returning to previous authority is allowed only if it remains unexpired, unrevoked, eligible, and explicitly selected under its matching serving identity. Otherwise remain unavailable. Preserve evidence and audit history. Migration rollback and identity/configuration handoff require design and separate operational authorization.

## Planning boundary and next step

Explicit user review of this proposal is required before creating specifications, design, or tasks. Approval of the proposal does not itself authorize implementation or operations. The retained product decisions—one authorized human, separate technical verification, evidence-backed partial/historical eligibility, unchanged controlled-refresh policy, and separation from traffic promotion—are constraints for design, not open questions to resolve by silently choosing different behavior.

A credible full size forecast is deferred to tasks. Planning must include the complete existing and proposed workload, tests, documentation, and migrations if needed, retaining the reported **400-line review budget** and **auto-chain strategy**. Slice by cohesive behavior with verification and rollback; do not omit safety guarantees to fit a review unit or imply an ungrounded small diff or size exception.

The original proposal reports the prior OS-03 aggregate as `1261/1300`. Its unit/counting convention, parent reference, and measurement revision are not supplied here. Preserve and reconcile that historical accounting in the parent tracking artifact before estimating; this proposal neither resets it nor establishes remaining capacity. Keep changing totals in that artifact and link the applicable budget/counting rules in subsequent planning.

## Evidence

This revision is based on the supplied proposal and its cited repository findings. The referenced files, full query output, and decision records were not supplied or independently inspected for this revision. Reported observations below must not be mistaken for newly verified repository facts. The acceptance contracts above are proposed requirements, not evidence that the behavior already exists.

| Claim or constraint | Basis cited by the supplied proposal | Traceability to establish before implementation |
|---|---|---|
| Missing canonical bridge; fixture-only shadow runner; separately controlled refresh | [Exploration](exploration.md) | Inspected revision, relevant section, and scope of the mechanism search. |
| Repository creates pending records; runtime requires exact eligible authority | `src/lib/production-readiness/repository.ts`; `src/lib/public-catalog-authority.ts` | Full revision and relevant symbols/lines; identify comparison keys, states, validity checks, and actual serving path. |
| No eligible joined authority for the cited production identity | Query finding summarized in `exploration.md` | Exact read-only query, parameters, full commit SHA, observation time, and retained result; no inference that both tables are empty. |
| Partial/historical eligibility and existing freshness semantics | Business decisions stated in the supplied proposal; `src/lib/public-catalog-readiness.ts` and exploration cited as context | Link the governing product decision and existing code contract, including `last_checked_at`, `verifiedAt`, coverage units, and the 24-hour classifier. |
| Receipt field shape does not establish authenticity/provenance | Design question recorded in the supplied proposal | Identify the inspected validation path and actual trust guarantees before selecting a mechanism. |
| One-human approval, operational limits, review budget, and auto-chain planning | Decisions stated in the supplied proposal; `AGENTS.md` cited as project standard; OS-03 parent accounting reported | Link applicable decisions, the project-standard revision, and the parent/counting convention. Do not attribute unverified constraints to a specific file. |

Missing references must be made explicit and resolved during authorized specification/design work. Any contradiction with these reported findings or retained product decisions must be brought back for review before implementation; do not manufacture a SHA, query result, policy, or completed check to close the gap.
