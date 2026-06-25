# Tasks: Vea Likely-Missing Candidate Triage

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 450-650 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 gate+sampling+tests → PR 2 renderer+CLI+output tests |
| Delivery strategy | ask-always; PR 1 slice only in this apply run |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Restore issue #334 gate, deterministic sampling, schema checks | PR 1 | Base = tracker branch; includes fail-closed tests |
| 2 | Render JSON/Markdown outputs with safety wording and path guard | PR 2 | Base = PR 1 branch; includes no-overclaiming tests |

## Phase 1: Foundation / Gates

- [x] 1.1 Add approved-output-issue validation and fail if no concrete issue number authorizes `audit/triage/issue-<approved-issue>/vea/category-pagination/`.
- [x] 1.2 Verify issue #334 artifact paths and exact SHA-256s for candidate audit, catalog snapshot, and comparison report before any sampling/classification.
- [x] 1.3 Define read-only/path-safety helpers that reject writes, traversal, live evidence, ingestion, scheduler, deploy, migrations, and cache-purge flags.

## Phase 2: Core Implementation

- [x] 2.1 Implement deterministic `categoryPath`-stratified 50-candidate sampling with seed recording, omission handling, and shortfall reporting.
- [x] 2.2 Implement classification validation with precedence: `already_present_alternate_identity`, `equivalent_variant_or_pack`, `source_or_candidate_artifact`, `valid_investigation_candidate`, `insufficient_evidence`.
- [ ] 2.3 Keep `followUpReason` as a separate field and normalize item records for JSON + Markdown summary generation.
- [x] 2.4 Add calibration-only wording guards so no output can claim confirmed missing products or full-catalog coverage.

## Phase 3: Testing / Verification

- [x] 3.1 Add determinism tests for identical seed/input producing the same 50-item sample and stable stratum allocation.
- [ ] 3.2 Add schema tests for JSON/Markdown contracts, aggregate counts, constraints, and `followUpReason` placement.
- [x] 3.3 Add artifact-hash gate tests for exact issue #334 paths/SHA-256s and fail-closed behavior on mismatch/missing files.
- [x] 3.4 Add path-safety and no-overclaiming tests covering forbidden writes, traversal, live-write flags, and banned claims.

## Phase 4: Cleanup / Integration

- [ ] 4.1 Wire the approved output path into the CLI wrapper and document the required issue-number handoff.
- [ ] 4.2 Review final wording for calibration-only, Vea-only, and read-only constraints before implementation starts.
