# Production Runtime Security Specification

## Purpose

Close production dependency vulnerabilities while preserving production runtime behavior and a reversible public rollout.

## Requirements

### Requirement PRS-REQ-001: Complete production audit closure

The system MUST establish and retain a bounded dependency-gate/foundation baseline that deterministically classifies every production dependency path by package, version, advisory status, path, and remediation state. A final production audit MUST report zero findings across Next.js, Clerk, Prisma, Axios, and every other production dependency. Risk acceptance, suppression, or an unclassified path MUST NOT satisfy closure.

#### Scenario PRS-SCN-001: Complete audit closure
- GIVEN the bounded foundation baseline records classifications for all production dependency paths
- WHEN the final production audit is evaluated
- THEN it MUST report zero production findings
- AND the migration MAY enter runtime validation

#### Scenario PRS-SCN-002: Residual or unclassified finding
- GIVEN the audit reports a finding or a production path lacks classification
- WHEN closure is evaluated
- THEN the migration MUST remain incomplete
- AND the finding or path MUST NOT be accepted as closed by risk acceptance

### Requirement PRS-REQ-002: Production runtime continuity

The migrated runtime MUST preserve authenticated and unauthorized access decisions, public catalog availability, PWA installation, cache and offline fallback behavior, representative image rendering, production build success, and standalone startup. Each boundary MUST have production-like evidence before promotion.

#### Scenario PRS-SCN-003: Authenticated and public continuity
- GIVEN a validated migration candidate
- WHEN authorized, unauthorized, and public catalog requests are exercised
- THEN authorization decisions and public catalog behavior MUST match the approved baseline

#### Scenario PRS-SCN-004: PWA and image continuity
- GIVEN the candidate is served as a production build
- WHEN installation, offline fallback, cache behavior, and representative images are exercised
- THEN each MUST remain available with its approved behavior

#### Scenario PRS-SCN-005: Build and standalone continuity
- GIVEN the candidate is prepared for release
- WHEN its production build and standalone runtime are evaluated
- THEN both MUST start successfully and serve representative public and protected routes

#### Scenario PRS-SCN-006: Runtime regression
- GIVEN any required runtime boundary fails or has no production-like evidence
- WHEN promotion is requested
- THEN promotion MUST be blocked and the candidate MUST remain unpromoted

### Requirement PRS-REQ-003: Interruption-free reversible rollout

The rollout MUST retain a last verified release, preserve public availability during cutover, and be reversibly recoverable. A critical regression in authentication, catalog, PWA/offline, images, build, or standalone runtime MUST trigger rollback.

#### Scenario PRS-SCN-007: Verified promotion
- GIVEN audit closure and all runtime evidence are current
- WHEN the candidate is promoted
- THEN public availability MUST continue without interruption
- AND the prior verified release MUST remain recoverable

#### Scenario PRS-SCN-008: Critical regression rollback
- GIVEN a promoted candidate has a critical boundary regression
- WHEN the regression is detected
- THEN the system MUST restore the prior verified release
- AND public availability MUST be preserved during recovery

#### Scenario PRS-SCN-009: Pre-cutover failure
- GIVEN validation or cutover fails before promotion completes
- WHEN recovery is initiated
- THEN the prior release MUST continue serving the public
- AND the migration state MUST be recorded as incomplete or rolled back

### Requirement PRS-REQ-004: Evidence handoff without cross-change completion

The change MUST produce traceable audit, runtime, rollout, and migration-state evidence for `production-readiness` task 1.3. This handoff MUST NOT modify that task's completion state or claim its gate is complete; that change SHALL evaluate and record its own gate.

#### Scenario PRS-SCN-010: Evidence is handed off
- GIVEN this change has complete evidence
- WHEN the evidence is referenced by `production-readiness`
- THEN task 1.3 MUST remain pending until its own evaluation records completion

#### Scenario PRS-SCN-011: Incomplete evidence handoff
- GIVEN this change is incomplete or rolled back
- WHEN evidence is handed off
- THEN the handoff MUST identify the failed or missing gate
- AND it MUST NOT imply completion of task 1.3
