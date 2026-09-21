# Atomic Authority Publication Specification

## Purpose

Publish exact authority and verified governed commercial-data effects with complete durable proof, unambiguous recovery, and no partially eligible public state.

## Requirements

### Requirement: Atomic terminal authority activation

The system MUST atomically persist terminal promotion/publication states, technical-verification metadata, indispensable authorization and audit evidence, and recoverable operation proof for an activation. It MUST guard lifecycle transitions and recheck required validity at activation. The final DB-clock-checked transactional transition MUST be the authoritative validity decision; atomic commit SHALL be the sole public-effect point; and read-back SHALL be observational. If expiry occurs before or at that final check, the transaction MUST roll back, MUST NOT activate authority, and MUST preserve prior persisted state. If the clock crosses expiry after that final check during durable commit, the committed terminal and selection outcome MAY exist but MUST be immediately historical and ineligible, MUST never serve, MUST NOT be called active success, and MUST NOT extend or renew any validity. Recovery MUST report exact committed-but-ineligible proof without a compensating rewrite or second activation. Prior selection is not guaranteed preserved in this post-check interval. Other transaction or indispensable-audit failures MUST roll back atomically and preserve prior persisted state. A prior persisted state MAY serve only when independently eligible for its own exact identity.

#### Scenario: Activation commits after authoritative validity decision

- GIVEN an unexpired independently verified and explicitly approved exact contract
- WHEN the final DB-clock check determines the activation valid before atomic commit
- THEN terminal authority state, verification metadata, approval, indispensable audit evidence, and operation proof are persisted as one observable outcome at the sole public-effect point.

#### Scenario: Expiry occurs before or at authoritative validity decision

- GIVEN a candidate whose applicable expiry occurs before or at the final DB-clock check
- WHEN publication is attempted
- THEN the transaction rolls back, no activation is persisted, no partially eligible authority is visible, and any prior persisted authority is unchanged.

#### Scenario: Expiry crosses during durable commit after authoritative validity decision

- GIVEN a candidate passes the final DB-clock check before expiry
- WHEN the clock crosses expiry after that check during durable commit and the terminal and selection outcome commits
- THEN that outcome is immediately historical and ineligible, never serves, is not reported as active success, does not extend or renew validity, and is recoverable only as exact committed-but-ineligible proof without a compensating rewrite or second activation.

#### Scenario: Transaction or indispensable audit fails during activation

- GIVEN a candidate whose transaction or indispensable audit write fails
- WHEN publication is attempted
- THEN the transaction rolls back, no partially eligible authority is visible, and any prior persisted authority is unchanged.

### Requirement: Atomic verified-delta promotion

The system MUST maintain one current governed commercial serving projection that is isolated from mutable commercial source data. A governed delta MUST receive public effect only after independent verification of committed source facts and required postwrite source evidence succeeds under the approved policy. Promotion of a verified delta MUST atomically make durable its indispensable attributable evidence and audit, the updated current governed serving projection, and a monotonically advancing generation. The evidence MUST bind the predecessor and resulting governed states, policy identity, affected facts, source observations, verification result/time, generation, and authority identity that permits public effect. No interval, including source verification, verification-to-promotion, or concurrent delta processing, MAY expose new protected facts under predecessor-only, missing, or invalid evidence.

#### Scenario: Verified delta receives public effect

- GIVEN an eligible authority and a policy-conforming delta whose committed source facts and postwrite source evidence have been independently verified
- WHEN the delta is promoted
- THEN its evidence and audit, current governed projection, and next monotonically advancing generation become durable as one observable outcome before or with public effect.

#### Scenario: Source commit succeeds but postwrite verification fails

- GIVEN a source mutation commits for a proposed governed delta
- WHEN independent postwrite source verification, required evidence persistence, or indispensable audit fails before promotion
- THEN the proposed delta receives no public effect and the current governed serving projection continues only subject to its existing source-age, policy, authority, and expiry limits.

#### Scenario: Concurrent delta cannot expose partial promotion

- GIVEN a delta is awaiting promotion while another delta is processed
- WHEN either operation fails or competes for public effect
- THEN no new protected fact is publicly observable without its matching durable evidence, audit, current-projection state, and monotonic generation.

### Requirement: Attributable proof, idempotency, and competition

The system MUST provide read-back proof for a completed activation, governed-delta promotion, or recovered committed result. Proof MUST identify applicable publication/promotion IDs and states, domain/scope, target, deployment, full commit SHA, candidate digest, policy identity, governed data/evidence identity, generation, technical-verification time, expirations, linked approval/evidence, approving and executing actors, and relevant transitions. Idempotency MUST scope to the authorization or delta operation and compare the entire request: the same key and exact request MUST recover one result without duplicate effect or extended validity, while changed candidate, policy, approval, scope, delta evidence, or other bound payload MUST conflict. Concurrent operations MUST NOT duplicate activation or delta public effect, ambiguously select authority, or silently replace governed state; any required coexistence, supersession, or conflict rule MUST be resolved before apply.

#### Scenario: Exact retry recovers one result

- GIVEN an activation or governed-delta operation has established an outcome
- WHEN the exact full request is retried with the same scoped key
- THEN the established result and proof are returned without duplicate effect or renewed validity.

#### Scenario: Competing operation changes the bound payload

- GIVEN an existing operation key or a concurrent operation targeting the same serving identity
- WHEN the request changes a bound payload or competes for public effect
- THEN it conflicts or follows a pre-resolved explicit rule without ambiguous selection or silent replacement.

### Requirement: Committed-result recovery after response loss

The system MUST discover an exact committed result and current eligibility when an activation or governed-delta operation commits but the caller loses the response. Recovery MUST NOT activate or promote again, duplicate audit, renew validity, perform a compensating rewrite, or silently select another identity.

#### Scenario: Commit succeeds but response is lost

- GIVEN an authority activation or governed-delta operation committed and its caller did not receive the response
- WHEN the caller performs scoped recovery
- THEN the committed result, proof, and current eligibility are returned without another public effect or renewed validity.
