# Delta for catalog-comparison-evidence-loop

## ADDED Requirements

### Requirement: Evidence-only scope

The system MUST keep this change read-only and MUST NOT perform ingestion, apply, DB writes, production writes, or live all-source audits.

#### Scenario: Read-only plan execution
- GIVEN the evidence loop is running
- WHEN the plan is drafted or audited
- THEN no write-oriented action is permitted
- AND the scope stays artifact-only

#### Scenario: Write attempt rejected
- GIVEN a task would change DB or production state
- WHEN the task is considered
- THEN it MUST be out of scope and stopped

### Requirement: Provenance gate

The system MUST require documented approval for every candidate fixture and catalog snapshot before use or generation.
For the Vea first slice, the catalog identity snapshot MUST remain blocked until its repo-relative path, source, issue or review reference, approver, approval timestamp, and hash are documented.

#### Scenario: Approved snapshot accepted
- GIVEN provenance and approval are documented
- WHEN a snapshot is referenced
- THEN it MAY be used for the evidence loop

#### Scenario: Unapproved snapshot blocked
- GIVEN provenance is missing or unclear
- WHEN a snapshot is proposed
- THEN the loop MUST stop until approved provenance exists

#### Scenario: Vea catalog identity snapshot gated
- GIVEN the Vea catalog identity snapshot path or approval record is missing
- WHEN the first slice is prepared
- THEN comparison execution MUST remain blocked
- AND the missing snapshot identity fields MUST be recorded as a provenance gate

### Requirement: Vea #295 artifact decision gate

The system MUST not assume the Vea #295 local artifact exists. The plan MUST prefer restoring/reusing the previously approved artifact first; if restoration cannot locate or validate that artifact, regeneration MUST remain a controlled read-only fallback under explicit provenance approval.

#### Scenario: Artifact present locally
- GIVEN the Vea #295 artifact is found locally
- WHEN its provenance is verified
- THEN the slice MAY proceed using that artifact

#### Scenario: Artifact absent locally
- GIVEN the Vea #295 artifact is not found locally
- WHEN the slice is planned
- THEN the plan MUST require restoration of the previously approved artifact before regeneration is considered
- AND the restoration source, timestamp, and validation result MUST be documented

#### Scenario: Restoration fails validation
- GIVEN the approved Vea #295 artifact cannot be located or validated
- WHEN fallback regeneration is requested
- THEN regeneration MUST be explicitly approved as bounded read-only evidence
- AND regenerated evidence MUST be labeled as regenerated rather than equivalent to the prior approved artifact

### Requirement: Candidate interpretation discipline

The system MUST treat `likely missing` as an investigation candidate only and MUST NOT present it as confirmed absence.

#### Scenario: Candidate label retained
- GIVEN an item is labeled `likely missing`
- WHEN the result is reported
- THEN it MUST remain candidate-only

#### Scenario: Confirmed absence not inferred
- GIVEN evidence is incomplete
- WHEN conclusions are drafted
- THEN the system MUST avoid claiming a confirmed missing product

### Requirement: Output boundaries and first-slice order

The system MUST write artifacts only under `audit/catalog-comparison/issue-<issue>/<source>/category-pagination/`, MUST start with Vea, and MUST follow the expansion order Vea, Disco/Jumbo/Carrefour, MAS, then DIA. Before any comparison output is written, `<issue>` MUST be replaced with the concrete approved issue number for that execution slice.

#### Scenario: Vea first slice
- GIVEN the first execution slice is planned
- WHEN outputs are defined
- THEN only Vea is in scope
- AND later sources remain deferred

#### Scenario: Output path enforced
- GIVEN an output file is created
- WHEN it is written
- THEN it MUST stay under the approved boundary path
- AND the output path MUST include the concrete approved issue number rather than the `<issue>` placeholder

### Requirement: Double fresh-audit loop

The system MUST use draft -> audit1 -> improvements -> audit2 -> final plan, and MUST stop if audits reveal invented claims, vague tasks, unsafe writes, missing provenance, or overreach.

#### Scenario: Improvement pass after audit1
- GIVEN audit1 reports concrete issues
- WHEN the draft is revised
- THEN only those findings are applied

#### Scenario: Second audit blocks overreach
- GIVEN audit2 finds unsafe scope
- WHEN the final plan is reviewed
- THEN the loop MUST stop before execution
