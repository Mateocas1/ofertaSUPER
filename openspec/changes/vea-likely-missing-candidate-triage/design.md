# Design: Vea Likely-Missing Candidate Triage

## Technical Approach

Add a read-only, artifact-only triage CLI that verifies the fixed issue #334 Vea manifest, recomputes the 635 `likelyMissingCandidates` from candidate audit plus catalog snapshot, selects a deterministic 50-item `categoryPath` sample, validates one reviewer classification per item, and writes only JSON/Markdown under `audit/triage/issue-<approved-issue>/vea/category-pagination/`. The comparison report is a gate/count cross-check, not the sample source, because its sample arrays are capped.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Input gate | Hard-code the expected #334 manifest below and fail closed on absent/mismatched artifacts. | Trust docs; regenerate evidence. | The spec allows only approved evidence; deterministic paths/hashes remove ambiguity. |
| Sampling | Stable SHA-256 ordering by seed, `categoryPath`, and candidate identity with deterministic allocation. | Global random; first 50. | Reproducible and category-diverse, with explicit edge-case behavior. |
| Classification | Human review with validated mutually exclusive taxonomy and precedence. | Automated weak-signal buckets. | Close cases need judgment; precedence prevents double-counting. |
| Output/review size | Keep one PR under 400 changed lines or split gate/sampler from renderer/CLI. | Single oversized PR. | Protects review focus and matches SDD workload guard. |

## Data Flow

```text
expected #334 manifest ── verify path/source/issue/SHA/counts
        ▼
candidate audit + catalog snapshot ── recompute likelyMissing=635
        ▼                         └── comparison report count cross-check
eligible categoryPath strata + seed ── deterministic 50-item sample
        ▼
review classifications ── precedence/schema/language validation
        ▼
report.json + summary.md under audit/triage/issue-X/vea/category-pagination/
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `openspec/changes/vea-likely-missing-candidate-triage/design.md` | Modify | Clarify manifest, taxonomy, sampling, and review-size rules. |
| `scripts/pipeline/vea-likely-missing-triage.ts` | Create | Hash gate, recomputation, sampling, taxonomy validation, rendering, path safety. |
| `scripts/audit-vea-likely-missing-triage.ts` | Create | CLI wrapper for local JSON inputs/review records and bounded outputs. |
| `package.json` | Modify | Add `audit:vea-likely-missing-triage`. |
| `tests/vea-likely-missing-triage.test.ts` | Create | Manifest, determinism, taxonomy, path, and wording tests. |

## Interfaces / Contracts

Expected input manifest is deterministic and mandatory:

| role | source | issue | path | sha256 | expected |
|---|---|---:|---|---|---|
| candidateAudit | `vea` | 334 | `audit/coverage/issue-334/vea/category-pagination/category-pagination-audit.json` | `7dee0acb4c151715c566e7ebaa15e358b5258ec9395e22fff2cedabb0ca9d359` | comparison input; 732 total candidates |
| catalogSnapshot | `vea` | 334 | `audit/catalog-snapshots/issue-334/vea/catalog-identities.json` | `ed9c7bee429cfbd5946aace64b10bd43916c0b8d395528f10408eeb4df0ef358` | comparison input |
| comparisonReport | `vea` | 334 | `audit/catalog-comparison/issue-334/vea/category-pagination/category-pagination-catalog-comparison.json` | `57f504581b7326516b020c3301bde69732b53a31ae959a55051b5ec8524e0396` | total 732, known 97, likelyMissing 635, duplicate/conflict/insufficient 0, confidence PASS |

If any manifest artifact is absent, path/source/issue differs, SHA-256 mismatches, or expected counts differ, the CLI MUST stop before sampling/classification and MUST NOT write triage outputs.

JSON report schema: `schemaVersion: 1`, `triage`, `source: "vea"`, `issue: 334`, `surface`, `calibrationOnly: true`, `decisionGrade: false`, `inputs` manifest, `sampling { seed, requestedSize: 50, selectedSize, strata[] }`, `items[] { sampleIndex, candidateIdentity, categoryPath, classification, followUpReason, evidenceRefs[] }`, `aggregateCounts`, `constraints[]`, and read-only posture.

Classification precedence, first match wins:
1. `source_or_candidate_artifact`: candidate/source evidence is malformed, stale, duplicated, non-product, or otherwise untrustworthy.
2. `already_present_alternate_identity`: exact same sellable item already exists in catalog under another SKU/URL/EAN/name. For close cases, exact same product beats variant/pack.
3. `equivalent_variant_or_pack`: related but non-identical size, flavor, presentation, bundle, or multipack explains the candidate.
4. `valid_investigation_candidate`: evidence is sufficient and no prior bucket explains it.
5. `insufficient_evidence`: reviewer cannot decide from #334 evidence.

`followUpReason` is optional explanatory text and never a bucket.

Sampling: exclude missing `categoryPath` and report constraints. Normalize strata by `categoryPath`; if strata <= 50, allocate at least one item per stratum, then fill proportionally by largest remainder with lexical tie-break. If strata > 50, select 50 strata by `sha256(seed:categoryPath)` and record omitted strata. Within a stratum, order by `sha256(seed:categoryPath:canonicalIdentity)`, then canonical identity lexical tie-break. If eligible items < 50, select all and record the shortfall.

Markdown summary includes disclaimer, manifest, sampling seed/method, taxonomy, aggregates, constraints, next decision, and explicit no full-catalog coverage, no confirmed missing, no ingestion/write authorization.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Manifest path/SHA/source/issue/count gate and fail-closed behavior. | `tsx --test tests/vea-likely-missing-triage.test.ts` fixtures. |
| Unit | Recomputed 635 set, deterministic sampling edge cases, taxonomy precedence, `followUpReason` separation. | Success/rejection fixtures. |
| Unit | Path safety, forbidden operations, output wording. | Reject traversal, later sources, live/write flags, overclaiming. |

## Migration / Rollout

No migration required. Task planning MUST forecast changed lines: if implementation may exceed 400 changed lines, split into PR 1 (manifest/recompute/sampling/tests) and PR 2 (CLI/rendering/package/output tests). Execution remains blocked until #334 artifacts are restored with matching hashes and a concrete output issue authorizes the triage path.

## Open Questions

- [ ] Which new approved issue number will own the triage output path?
