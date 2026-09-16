# OS-03 authority publication workflow — exploration

## Outcome

Define a legitimate, auditable operator workflow that can create the production authority consumed by the public-catalog guard. It must bind a verified catalog candidate to the exact deployment and commit, without treating traffic promotion as the same act as catalog authorization.

No implementation, database operation, or operational promotion is included in this exploration.

## Existing mechanism map

| Area | Observed mechanism | Gap for the intended workflow |
|---|---|---|
| Runtime guard | `src/lib/public-catalog-runtime.server.ts` reads a serving identity and `public-catalog-authority.server.ts` loads its publication by ID. | The guard is read-only and fail-closed; no operator path creates the identity, promotion, receipts, or verified publication. |
| Eligibility | `resolvePublicCatalogAuthority` requires exact publication, deployment, 40-char commit SHA, candidate digest, publication and promotion state `PROMOTED`, `verified_at <= now`, and unexpired promotion. | This correctly prevents shape-only authorization but does not establish how the records become independently verified. |
| Persistence shape | Prisma has promotion, receipt, and publication models; repository methods only create all three as `PENDING`. | There is no observed transition/approval writer, receipt verifier, atomic state transition, revocation workflow, or concurrency control beyond schema uniqueness. |
| Catalog writes | The production-catalog runner is fixed to fixture/shadow/dry-run and declares `writes: false`; its script loads a test fixture. | It cannot establish production catalog provenance. Direct-refresh writers operate separately with controlled evidence and no observed bridge to production-readiness authority. |
| Controlled refresh evidence | The runbook requires an approved issue, fresh prewrite PASS, exact operator confirmation, one writer execution, postwrite PASS, freshness baseline, and no-partial-write verification. | It supplies useful operational evidence, but no observed canonical candidate manifest/digest or signed receipt binding that evidence to an authority record. |
| Freshness semantics | `SupermarketProduct.last_checked_at` is the current-item observation watermark; `PriceHistory.scraped_at` is historical event time. Public readiness already classifies stale data as `degraded` rather than automatically unavailable. | The product decision must state whether degradation remains eligible and how a candidate proves its precise coverage/freshness. |

### Known production evidence limitation

The user-supplied production query for eligible authority returned no rows for candidate authority `e4d2618`. That does **not** prove both authority tables are empty: the joined fallback can omit promotion-only rows. Treat the observed result as **no eligible joined authority for that candidate**, not as table emptiness.

## Minimum safe workflow

1. **Assemble a canonical catalog candidate** from existing, already-validated catalog data; record its immutable manifest, deterministic dataset digest, source coverage, per-source watermarks, prewrite/postwrite/baseline evidence references, and generator version. A startup JSON value or operator-invented digest is not a candidate.
2. **Validate candidate eligibility before any authority write** against an approved policy: required supermarket coverage, data-integrity checks, evidence linkage, and freshness classification. This validation must distinguish PASS, degraded-but-eligible, and rejected; it must not silently turn the existing 24-hour public-readiness classifier into a hard rejection rule.
3. **Obtain independent, scoped receipts**: provenance attests to the canonical manifest and digest; authorization attests to the exact candidate, domain, target, deployment ID, commit SHA, expiry, and rollback/revocation scope. A bare SHA-256 string or an internally generated JSON hash is insufficient without retained canonical bytes, signer identity, trust policy, and verification outcome.
4. **Publish authority atomically**: create or resume an idempotent promotion keyed by candidate digest; verify receipts and expiry; write promotion/publication terminal state and `verified_at` together in one transaction with compare-and-set state guards. A retry must return the same completed authority or a clear conflict, never duplicate or partially promote it.
5. **Serve and recover**: configure the runtime identity only after catalog authority is verified, and retain a read-only verification receipt. Expiry, revocation, stale evidence, invalid receipt, failed transaction, or concurrent competing candidate must fail closed and leave the prior valid authority intact when policy permits it.

The domain authorization above is phase one. Vercel traffic promotion is a separate phase that may consume the verified authority; it is not an inevitable logical cycle because the authority can be verified against a deployment artifact before traffic is moved.

## Reuse and missing pieces

| Reuse | Required design addition |
|---|---|
| Exact runtime fingerprint matching in `public-catalog-authority.ts` | Candidate manifest contract and deterministic digest procedure with immutable storage/reference rules. |
| `ProductionReadiness*` tables and pending-create repository methods | Authenticated operator command/workflow with scoped roles, approval audit, terminal transitions, revocation, and idempotency semantics. |
| Direct-refresh prewrite/postwrite/baseline and no-partial-write evidence | An explicit adapter that validates those artifacts as provenance inputs; no new ingestion pipeline and no manual SQL `PROMOTED` seeding. |
| Public readiness degradation classifier | Candidate freshness policy that preserves valid historical data where the approved business rule allows degraded serving. |
| Public guard’s expiry and exact identity checks | Receipt verification/trust model, transaction boundary, retry/recovery behavior, and a verifiable read-only publication proof. |

No generic admin panel is needed for the first scope. The smallest operator-facing surface is a deliberately scoped authenticated workflow whose inputs are canonical candidate and receipt artifacts, not free-form IDs, digest strings, or environment values.

## Product decisions required before proposal

1. **Candidate definition:** May a candidate be derived from the existing catalog snapshot only when each required supermarket has a verified current row, or may source coverage be partial with an explicit degraded label? Specify the minimum supermarket-first coverage and whether unavailable sources block publication.
2. **Freshness posture:** Which freshness outcomes are publishable: fresh only, fresh plus degraded historical data, or a per-supermarket SLA policy? Retain `last_checked_at` as the current-data basis and `PriceHistory.scraped_at` as historical corroboration; do not introduce an implicit 24-hour hard reject.
3. **Approval authority:** Which human/operator roles may request, independently approve, revoke, and execute publication, and must requestor and approver be distinct for production?
4. **Receipt trust boundary:** Where do canonical manifests and signed/verified receipts live, what signer identities are trusted, and what evidence is sufficient to prove provenance rather than only digest shape?
5. **Continuity on failure:** When a new candidate fails verification or expires, should the last unexpired verified authority remain serving, or should the public catalog become unavailable immediately? Define the maximum allowed overlap and revocation behavior.

## Verification evidence and source gap

A future proposal should require evidence from these sources, without querying production during design:

| Claim | Evidence required | Current gap |
|---|---|---|
| Candidate represents real catalog data | Canonical manifest tied to existing catalog rows, coverage, `last_checked_at`, and validation result; digest recomputed from canonical bytes. | No observed candidate-manifest producer or catalog-to-authority bridge. |
| Controlled write was valid | Existing approved-issue, prewrite, confirmation, postwrite, baseline, and no-partial-write artifacts, referenced by immutable identity. | Existing artifacts are operational evidence, not bound to readiness records. |
| Authorization is independent | Verified receipt payload, signer identity, scope, expiry, and audit actor/time; authorization must bind exact domain/deployment/commit/digest. | Schema stores a digest/signer/scope but not an observed verifier or canonical payload retention contract. |
| Publication is consistent | Transaction receipt showing exact terminal promotion/publication state plus postwrite read-back fingerprint. | Existing repository only writes `PENDING`; no observed atomic promotion transition. |
| Runtime is serving the authorized artifact | Read-only guard result matches publication, deployment, commit, candidate digest, `verified_at`, and expiry. | Runtime resolver exists; production result supplied shows no eligible candidate for `e4d2618`. |

## Explicit first-scope boundaries

- No new price ingestion, scheduler, generic administration UI, manual SQL promotion seeding, Vercel traffic promotion, or cloud configuration.
- No credential or environment-file access is needed for the design.
- Direct-refresh remains controlled manual operation; this workflow consumes validated evidence rather than changing writer policy.
- Detailed schema, migration, command syntax, and implementation task slicing wait for the product decisions above.

## Exploration basis

Targeted source review used `src/lib/public-catalog-authority.ts`, `src/lib/public-catalog-authority.server.ts`, `src/lib/public-catalog-runtime.server.ts`, `src/lib/public-catalog-readiness.ts`, `src/lib/production-readiness/repository.ts`, `src/lib/production-readiness/runner.ts`, `scripts/production-catalog-run.ts`, `prisma/schema.prisma`, `docs/direct-refresh-operational-readiness-runbook.md`, and `docs/production-readiness-vtex.md`.

CodeGraph intelligence tooling was not available in this executor, so the exploration used the permitted targeted reads and focused filesystem fallback after the capability check.
