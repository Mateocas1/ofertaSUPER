# Candidate Evidence Specification

## Purpose

Define independently verifiable evidence for an exact release-policy authority contract and its governed commercial-data lineage.

## Requirements

### Requirement: Versioned release-policy-baseline candidate

The system MUST define `authority-candidate/v1` as the digest of reproducible canonical manifest bytes binding the exact release/deployment and full commit SHA, domain/target/scope, validity, the versioned refresh/evidence policy and its digest, and initial real baseline snapshot/data/evidence digests with coverage, watermarks, provenance, and generator/canonicalization versions. The initial baseline MUST be real and consistent; fixtures, invented data, free-form identifiers, and bare operator-supplied digests MUST NOT establish a candidate. The candidate digest identifies the release-policy-baseline contract and MUST NOT be represented as consent to immutable future catalog bytes.

#### Scenario: A real baseline produces a candidate

- GIVEN a real consistent catalog baseline with reproducible canonical inputs and retained evidence
- WHEN its `authority-candidate/v1` manifest is assembled
- THEN the manifest reproduces its candidate digest and exposes every required release, policy, baseline, coverage, watermark, provenance, and canonicalization binding.

#### Scenario: Non-evidence is offered as a candidate

- GIVEN candidate input consisting only of a fixture, invented data, free-form value, or bare digest
- WHEN candidate assembly or verification is requested
- THEN no candidate is established or eligible for approval.

### Requirement: Governed delta evidence and lineage

The system MUST retain distinct meanings for baseline data digest, candidate digest, policy identity, current governed data identity, and per-delta evidence identity. Each policy-conforming governed delta, including a forward corrective generation, MUST establish machine-verifiable evidence and attributable audit of its exact affected protected commercial facts, predecessor governed state, resulting governed state, policy version, committed-source observations, independent postcommit source-verification result and time, executor, and successor linkage where assertions are superseded. A conforming delta MUST advance governed data/evidence lineage without rewriting the initial candidate digest, requiring renewed human consent, or extending authority expiry. Unknown lineage, invalid or missing required evidence, or failed verification MUST NOT be relabeled as a baseline or inherit authority.

#### Scenario: Conforming delta preserves authority continuity

- GIVEN an eligible authority and a delta that satisfies its approved policy
- WHEN independent postcommit source verification records the delta evidence and lineage
- THEN its resulting governed state may receive public effect within the existing authority without a new human approval or an extension of authority expiry.

#### Scenario: Unknown lineage is presented as a delta

- GIVEN changed protected facts with no proven governed predecessor or required evidence
- WHEN the facts are considered for public effect
- THEN they are rejected as governed output and cannot inherit the initial authority.

### Requirement: Independent verification, truthful degradation, and non-rejuvenation

The system MUST independently verify actual canonical inputs, evidence linkage, integrity, policy conformance, scope, coverage, and applicable source-age classification. A producer-declared `PASS`, receipt shape, self-attested hash, model approval, or supplied environment value alone MUST NOT establish verification, provenance, or authorization. Coverage MUST state its unit and expected universe using existing definitions; missing coverage and an unknown universe MUST remain explicit. Permitted partial coverage and historical data MAY remain eligible when required evidence and governed lineage are valid. Observation, technical-verification, approval, activation, refresh, and expiry times MUST remain distinct; verification, consent, retry, recovery, and refresh MUST NOT rejuvenate `last_checked_at`, `PriceHistory.scraped_at`, or the existing historical `verifiedAt` meaning.

#### Scenario: Permitted partial historical data is verified

- GIVEN policy-permitted partial coverage or historical observations with explicit gaps or unknown universe
- WHEN independent verification succeeds
- THEN the evidence reports its degradation truthfully and preserves original source and historical times.

#### Scenario: Evidence is producer-only or altered

- GIVEN producer-only evidence, missing or corrupt required evidence, or approval-bound evidence altered after verification
- WHEN eligibility is evaluated
- THEN the affected candidate or governed state is ineligible until required independent verification is completed.

### Requirement: Evidence custody and binding design gate

Before apply, the design MUST map the above identities to actual supported fields, reject unproven legacy meanings, and demonstrate a verifiable binding from approved baseline and governed-delta evidence to the protected facts the runtime serves. It MUST retain canonical consent/contract bytes, required evidence, attributable audit, and before-images sufficient for independent verification, attribution, and forward corrective generation through the latest referencing authority expiry plus 180 days. Earlier revocation MUST NOT shorten this retention; retention MAY be extended only for active references or explicit legal or operational holds. The design MUST define minimized retention, custodians, access/deletion rights, integrity/retrieval guarantees, and backup/restoration/revocation boundaries, and MUST NOT require indefinite full dataset bytes or unnecessary secrets or personal data. Unresolved binding, compatibility, custody, or retention safety requirements MUST return for review before apply.

#### Scenario: Required corrective evidence reaches its retention boundary

- GIVEN evidence and before-images referenced by an authority that has expired
- WHEN 180 days have not elapsed since that expiry and no permitted disposition exception applies
- THEN the evidence and before-images remain retrievable for independent verification and forward correction.

#### Scenario: Design cannot distinguish uncontrolled mutation from governed output

- GIVEN a proposed design cannot prove the evidence binding for protected facts changed outside governed publication
- WHEN the design gate is reviewed
- THEN apply is blocked until the binding and public-effect boundary are demonstrated.

## Bounds

This capability MUST NOT introduce ingestion, schedulers, a generic administration UI, a catalog freeze, per-delta human approval, or a change to direct-refresh operational controls.
