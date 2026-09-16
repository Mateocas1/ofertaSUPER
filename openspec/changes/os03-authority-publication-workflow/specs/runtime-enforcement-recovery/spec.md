# Runtime Enforcement and Recovery Specification

## Purpose

Ensure protected commercial facts serve only through an exact eligible authority and the one current verified governed projection across runtime, derived, and cached surfaces.

## Requirements

### Requirement: Exact authority and current governed-projection enforcement

The runtime MUST serve protected commercial facts only when an exact configured authority identity matches the required publication, deployment, full commit SHA, candidate contract, scope, required terminal states, and unexpired validity, and the facts bind to the one current independently verified policy-conforming governed commercial serving projection. That projection MUST be isolated from mutable commercial source data. Direct SQL and other unsupported writers MAY modify only source data and MUST NOT confer public effect. Direct DML against the governed serving projection MUST be forbidden by the design gate. Mismatched, expired, revoked, rejected, outside-policy, unknown-lineage, missing-evidence, corrupt-evidence, or otherwise ineligible facts or authority MUST fail closed. The runtime MUST NOT fall back across identities or treat prior persisted data or authority as eligible unless it independently remains eligible for its own exact configured identity and payload binding.

#### Scenario: Exact eligible governed facts resolve

- GIVEN an exact configured authority and facts bound to the current governed projection whose evidence, policy, lineage, and validity remain eligible
- WHEN the real runtime resolves protected commercial facts
- THEN it serves only those bound facts.

#### Scenario: Unsupported source writer remains nonpublic

- GIVEN an unsupported writer commits a commercial-data change through direct SQL or another source-only path
- WHEN any runtime path evaluates the changed source facts
- THEN the source change has no public effect unless a separately verified governed delta is promoted.

#### Scenario: Direct projection DML is proposed

- GIVEN a proposed design permits a source, administrator, or runtime writer to directly modify the governed serving projection
- WHEN the design gate is reviewed
- THEN apply is blocked until that direct DML path is forbidden and governed promotion remains the only public-effect path.

### Requirement: Complete protected-surface enforcement design gate

Before apply, the design MUST inventory every public producer, entry point, derived output, and cache layer and demonstrate enforcement over commercial facts in APIs, pages, HTML/client/RSC payloads, metadata/JSON-LD, promotions, history, filtering/ranking/counts/discounts/freshness, and cached or offline representations. If an affected boundary cannot be established, the protected commercial surface MUST fail closed. Static shells, navigation, independently static descriptive metadata, and taxonomy or sitemap facts that do not depend on commercial eligibility MAY remain available. Taxonomy or sitemap values, inclusion/order, or timestamps derived from commercial facts MUST be protected. Fixture-only runners and mocked resolvers alone MUST NOT establish this proof.

#### Scenario: Derived commercial output is encountered

- GIVEN a page, API, metadata, sitemap, or cache output includes a commercial fact or a value derived from commercial eligibility
- WHEN that output is produced
- THEN it applies the same authority and governed-evidence enforcement as the source commercial fact.

#### Scenario: Static taxonomy is independently available

- GIVEN taxonomy or sitemap content has no dependency on protected commercial facts
- WHEN commercial authority is unavailable
- THEN that static content may remain available without representing commercial facts as eligible.

### Requirement: Bounded authority decision and payload cache enforcement

A positive authority decision cache entry MUST be immutable, MUST retain its original absolute deadline, and MUST have a deadline no later than 30 seconds after its successful authoritative verification or any earlier applicable expiry. Failed or unavailable revalidation MAY use only a preexisting positive decision before that original deadline, with all authority, policy, and payload/evidence bindings intact. Cache hits, retries, warm processes, database outages, revalidation failures, or unverifiable evidence MUST NOT renew, slide, or extend the deadline. Confirmed ineligibility or revocation MUST evict the decision wherever observed. Without a preexisting positive decision, or at or after its deadline, revalidation failure or unavailability MUST fail closed for protected facts. Across instances and cache paths, newly serving revoked protected facts MUST cease within 30 seconds of durable revocation and before any earlier expiry. Payload caches MAY be used only when their payload contents are verifiably bound to exact authority, policy, and governed data/evidence identities and cannot bypass required authority revalidation or disguise stale time-dependent commercial facts.

#### Scenario: Database outage follows a positive decision

- GIVEN a preexisting positive authoritative decision remains before its original deadline and applicable expiry
- WHEN database access or revalidation is temporarily unavailable
- THEN the decision may remain usable only until that original deadline, which is no more than 30 seconds after authoritative verification, and any earlier expiry.

#### Scenario: Revalidation fails without a usable decision

- GIVEN no preexisting positive decision exists or its original deadline or applicable expiry has passed
- WHEN database access or revalidation fails or is unavailable
- THEN protected commercial facts fail closed.

#### Scenario: Confirmed ineligibility reaches a warm cache

- GIVEN a warm runtime or payload cache previously served an eligible authority
- WHEN it observes confirmed ineligibility or durable revocation
- THEN it evicts the authority decision and ceases newly serving affected protected facts.

### Requirement: Mandatory database bootstrap and recovery hardening

Before authority or governed serving is enabled, the system MUST complete separately authorized database bootstrap that establishes and verifies effective least-privilege grants and revocations, including default privileges for future objects, ownership and inheritance paths, and privileged execution paths. Source and administrative writers MUST NOT be able to alter governed serving facts, consent, verification, evidence, audit, or authority, and public readers MUST NOT bypass governance through mutable commercial sources. Application checks alone MUST NOT satisfy this requirement. Recovery and regrant operations MUST preserve these boundaries and MUST be independently verified before enablement or restored serving.

#### Scenario: Bootstrap regrant is denied

- GIVEN database bootstrap or recovery has hardened grants and default privileges
- WHEN a source or administrative writer attempts to regrant itself governed-projection access or alter future-object defaults to obtain that access
- THEN the attempt is denied and authority or governed serving remains disabled if effective hardening cannot be verified.

### Requirement: Verified forward corrective generation

A bad promoted delta MUST be corrected only by a separate forward corrective generation that is independently verified and audited before public effect. The correction MUST use retained before-images and checks against the current governed predecessor, preserve unrelated intervening verified changes, satisfy the approved policy and current eligibility, and be promoted through the governed-delta publication boundary. If the correction cannot be independently verified, affected protected facts MUST remain unavailable. If the affected boundary cannot be established, the protected commercial surface MUST fail closed. Disabling a writer MUST NOT itself revoke authority or restore data.

#### Scenario: Forward correction preserves intervening changes

- GIVEN a bad promoted delta, retained before-images for its affected facts, and unrelated verified changes already present in the current governed projection
- WHEN a forward corrective generation is independently verified against the current governed predecessor and promoted
- THEN it corrects only the affected facts and preserves the unrelated intervening verified changes.

#### Scenario: Affected correction boundary is unverifiable

- GIVEN a bad promoted delta whose affected boundary, before-images, or current-predecessor checks cannot be independently verified
- WHEN correction is requested
- THEN affected protected facts fail closed and the entire protected commercial surface fails closed when the affected boundary is unknown.

## Bounds

This capability MUST NOT require universal database triggers or revision counters, all-route `no-store`, automatic traffic/configuration changes, or manual SQL `PROMOTED` seeding.
