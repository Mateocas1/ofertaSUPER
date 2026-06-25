# Proposal: Vea Likely-Missing Candidate Triage

## Intent

Calibrate the 635 Vea `likelyMissingCandidates` from issue #334 without converting them into confirmed missing products. The slice should estimate signal quality, expose duplicate/variant/artifact patterns, and inform whether a later decision-grade review is worth funding.

## Scope

### In Scope
- Vea-only calibration over a 50-item sample, stratified by `categoryPath` with a deterministic seed recorded.
- Use only issue #334 evidence: comparison report, candidate audit, and catalog identity snapshot.
- Produce JSON report and Markdown summary under `audit/triage/issue-<approved-issue>/vea/category-pagination/`.

### Out of Scope
- Full-catalog coverage, confirmed-missing claims, ingestion/apply/write work, migrations, cache purge, deploy, or scheduler-all-source.
- Live evidence collection or new read-only evidence unless a new approved issue explicitly authorizes it.
- Decision-grade conclusions from the calibration sample.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `catalog-comparison-evidence-loop`: add a calibration-only triage slice for Vea investigation candidates while preserving read-only, artifact-only interpretation.

## Approach

Read the issue #334 artifacts, derive eligible Vea likely-missing candidates, sample 50 deterministically by `categoryPath`, and classify each item as `already_present_alternate_identity`, `equivalent_variant_or_pack`, `source_or_candidate_artifact`, `valid_investigation_candidate`, or `insufficient_evidence`. Keep `followUpReason` as a separate field.

## Acceptance and Outputs

- [ ] JSON report includes seed, strata, source artifact paths/hashes, item classifications, `followUpReason`, and aggregate counts.
- [ ] Markdown summary explains calibration-only meaning, sample method, taxonomy, top patterns, and recommended next decision.
- [ ] Wording preserves `likelyMissingCandidates` as investigation-only and rejects full coverage/confirmed-missing claims.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `openspec/changes/vea-likely-missing-candidate-triage/` | New | SDD artifacts. |
| `audit/triage/issue-<approved-issue>/vea/category-pagination/` | New | Future generated triage outputs only. |
| Issue #334 artifacts | Read | Existing evidence inputs only. |

## Risks

| Risk | Likelihood | Mitigation |
|---|---:|---|
| Overclaiming sample findings | Med | Label calibration-only in every output. |
| Biased sample | Med | Stratify by `categoryPath`; record seed. |
| Artifact absence locally | Med | Stop until approved #334 artifacts are present/restored; do not regenerate without approval. |

## Rollback Plan

Revert this OpenSpec change and delete only generated files under the future approved `audit/triage/issue-<approved-issue>/...` path. No data rollback is required because writes are forbidden.

## Dependencies

- Issue #334 bounded evidence and artifact hashes.
- A future approved issue number for generated triage output paths.

## Next Decisions

- Whether the calibrated signal justifies a decision-grade review, taxonomy refinement, or stopping the Vea likely-missing track.

## Proposal Question Round

Assumptions needing review: calibration is enough for this slice; category-stratified sampling is acceptable; and only future approval may authorize new evidence or outputs.
