# Scoped Approval Specification

## Purpose

Require one informed, attributable approval of an independently verified exact release-policy-baseline authority contract.

## Requirements

### Requirement: Exact release-policy approval binding

The system MUST present the exact release/deployment, full commit SHA, domain/target/scope, validity, `authority-candidate/v1` identity, versioned refresh/evidence policy, baseline evidence, coverage gaps, source-age/degradation, technical-verification result, expiry, revocation, and retention boundaries before consent. One authenticated human actor authorized for that scope MUST explicitly approve the exact release-policy contract after independent technical verification. The approval payload MUST retain this binding, the approving actor and time, and tamper/replay protection. Independent verification MUST precede approval but MUST NOT require a second human or service approval.

#### Scenario: Authorized user approves an exact contract

- GIVEN independent verification has accepted an exact release-policy-baseline contract
- AND an authenticated user is authorized for its scope
- WHEN the user explicitly approves after reviewing the required information
- THEN one attributable approval is retained for that exact release-policy contract without requiring another human or service approval.

#### Scenario: An unauthorized or untrusted approval is submitted

- GIVEN an actor lacks scope authorization or an approval payload lacks established authenticity, authorization, tamper protection, or replay protection
- WHEN approval is requested
- THEN no approval or authority is established.

### Requirement: Fresh-approval boundary

The system MUST require fresh independent verification and explicit human approval when the approved release/deployment, full commit SHA, scope, validity, policy, or permitted refresh class changes or widens. A change to the initial baseline or manifest MUST NOT be disguised as a governed delta. A delta that remains within the approved policy and authority validity MUST require machine-verifiable evidence and audit but MUST NOT require renewed human consent. Retrying, recovery, verification, or refresh MUST NOT extend approval or authority expiry.

#### Scenario: Conforming price delta continues under approval

- GIVEN an unexpired authority and a delta whose mutation class and evidence satisfy its approved policy
- WHEN the delta is independently verified after its source commit
- THEN it may receive public effect without another human approval and without extending expiry.

#### Scenario: Policy widening is requested

- GIVEN an approved authority policy does not permit a requested mutation class, scope, or broader validity
- WHEN the change is requested
- THEN the change cannot receive public effect until fresh independent verification and explicit human approval establish a new exact contract.

### Requirement: Trust, lifecycle, and handoff separation design gate

Before apply, the design MUST resolve trusted verification, approval, execution, and privileged-custody identities; their authorization boundaries; and shared versus distinct verification, approval, activation, refresh, and expiry limits, including activation-time rechecks. The authentication and approval mechanism, including whether it uses Clerk, MUST remain a design decision while preserving the exact release/policy approval requirement. Trust/scope enrollment and initial technical verification/publication MUST work before public traffic and before a configured serving authority exists. Handing a persisted authority identity to runtime configuration MUST be a separately authorized configuration step; publication, approval, refresh, revocation, recovery, or forward correction MUST NOT automatically alter runtime configuration or traffic routing. Environment identity, database access, and deployment guards MUST NOT create approval.

#### Scenario: Initial authority is published before handoff

- GIVEN an independently verified and approved initial contract with no configured serving authority
- WHEN its authority is published
- THEN publication succeeds without public traffic or circular configuration and does not perform configuration handoff or traffic promotion.

#### Scenario: Expired approval is retried

- GIVEN an approval or authority whose applicable validity has expired
- WHEN publication, recovery, or refresh is retried
- THEN the retry does not renew validity or establish serving eligibility without newly valid required approval.

## Bounds

This capability MUST NOT perform traffic promotion, automatic configuration handoff, mandatory two-person consent, per-price human reapproval, or mandate a particular authentication or approval mechanism.
