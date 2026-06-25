# Delta for catalog-comparison-evidence-loop

## ADDED Requirements

### Requirement: Calibration-only triage slice

The system MUST support a Vea-only calibration slice for `likelyMissingCandidates` and MUST NOT present the sample as decision-grade evidence.

#### Scenario: Calibration summary produced
- GIVEN the approved Vea evidence set is available
- WHEN the slice is run
- THEN the output MUST describe the run as calibration-only
- AND the sample MUST remain investigation-only

#### Scenario: Decision-grade claim blocked
- GIVEN a report draft claims confirmed missing products
- WHEN the report is reviewed
- THEN the claim MUST be rejected

### Requirement: Deterministic stratified sample

The system MUST sample 50 items using strata derived from `categoryPath` and MUST record the deterministic seed used to select the sample.

#### Scenario: Seeded sample is reproducible
- GIVEN the same approved input set and seed
- WHEN the sample is regenerated
- THEN the same 50-item sample MUST be selected

#### Scenario: Stratification missing
- GIVEN `categoryPath` is unavailable for an item
- WHEN sampling is attempted
- THEN the item MUST be excluded from the stratified sample and reported as a sampling constraint

### Requirement: Triage taxonomy and follow-up field

The system MUST classify each sampled item as `already_present_alternate_identity`, `equivalent_variant_or_pack`, `source_or_candidate_artifact`, `valid_investigation_candidate`, or `insufficient_evidence`. The system MUST keep `followUpReason` as a field and MUST NOT use it as a taxonomy bucket.

#### Scenario: Item gets one taxonomy value
- GIVEN a sampled candidate has been reviewed
- WHEN the classification is recorded
- THEN exactly one taxonomy value MUST be assigned
- AND `followUpReason` MAY explain the disposition

#### Scenario: Follow-up reason is separate
- GIVEN a reviewer adds a follow-up note
- WHEN the report is written
- THEN the note MUST populate `followUpReason`
- AND it MUST NOT alter the taxonomy value

### Requirement: Approved artifact gate and triage outputs

Before execution, the system MUST verify the required issue #334 artifact paths and hashes, or an approved equivalent input boundary, before using the evidence set. The system MUST emit JSON report and Markdown summary under `audit/triage/issue-<approved-issue>/vea/category-pagination/`.

#### Scenario: Required artifacts verified
- GIVEN the candidate audit, catalog snapshot, and comparison report match the approved hashes
- WHEN the triage run starts
- THEN execution MAY proceed

#### Scenario: Artifact gate fails
- GIVEN a required artifact is missing or hash-mismatched
- WHEN the triage run starts
- THEN the system MUST stop before classification

## MODIFIED Requirements

### Requirement: Output boundaries and first-slice order

The system MUST write artifacts only under `audit/triage/issue-<approved-issue>/vea/category-pagination/`, MUST start with Vea, and MUST keep later source expansion deferred until a separate approved change.
(Previously: outputs were constrained to catalog-comparison evidence-loop paths and expansion order across all sources.)

#### Scenario: Vea triage path enforced
- GIVEN a triage output file is created
- WHEN it is written
- THEN it MUST stay under the approved triage boundary path

#### Scenario: Later sources deferred
- GIVEN a request includes Disco/Jumbo/Carrefour, MAS, or DIA
- WHEN the Vea slice is planned
- THEN those sources MUST remain out of scope
