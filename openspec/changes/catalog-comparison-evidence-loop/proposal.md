# Proposal: Catalog Comparison Evidence Loop

## Outcome

Create a reviewable PRD/plan for safer public catalog freshness evidence using the merged fixture-backed comparison tooling. This change defines an evidence loop only; it does not authorize ingestion, apply, DB writes, production writes, live audits, or full coverage claims.

## Approach: Phases and Gates

1. **Draft plan**: document source order, paths, matching policy, labels, non-goals, and stop conditions.
2. **Fresh audit 1**: objective reviewer checks for invented claims, vague tasks, unsafe writes, missing provenance, and overreach.
3. **Improvement pass**: apply only concrete audit findings.
4. **Fresh audit 2**: repeat from a clean reviewer perspective.
5. **Final Vea slice**: open only the minimal execution issue/tasks needed for Vea.

Gate: continue only when provenance is documented and approved, outputs stay artifact-only, `likely missing` means investigation candidate only, and bounded evidence is never framed as exhaustive coverage.

## Scope

### In Scope
- PRD/plan for the evidence loop and first Vea slice.
- Read-only catalog snapshots with approved provenance.
- Output boundary: `audit/catalog-comparison/issue-<issue>/<source>/category-pagination/`.
- Source expansion order: Vea, then Disco/Jumbo/Carrefour, then MAS, then DIA.

### Out of Scope
- DB writes, production writes, discovery apply, ingestion, scheduler/all-source runs.
- Future source issues before the Vea plan is validated.
- Permanent exclusion of any registered source.

## Capabilities

### New Capabilities
- `catalog-comparison-evidence-loop`: read-only, source-scoped planning loop for comparing category-pagination candidates against approved catalog snapshots.

### Modified Capabilities
- None.

## First Vea Slice

- Candidate: `audit/coverage/issue-295/vea/category-pagination/category-pagination-audit.json`; restore/reuse the previously approved artifact first, and verify availability/provenance before use.
- Fallback: controlled read-only regeneration is allowed only after the approved artifact cannot be located or validated, the restoration attempt is documented, and a reviewer explicitly accepts regenerated evidence as new evidence rather than as a substitute for the prior approved artifact.
- Catalog identity snapshot: the Vea snapshot fixture/path remains gated until its source, issue/reference, approver, approval timestamp, and hash are documented.
- Matching: `source + skuId`, then normalized `source + productUrl`, then `source + ean`; conflicts/ambiguity are reported separately.
- Minimal tasks: approve snapshot provenance, run plan audits, produce final Vea comparison issue/task list, and define stop conditions for interpreting results.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `docs/category-pagination-catalog-comparison-plan.md` | Modified | Supersede/refine with evidence-loop PRD. |
| `audit/catalog-comparison/issue-<issue>/<source>/category-pagination/` | New | Planned artifact-only output boundary. |
| `openspec/changes/catalog-comparison-evidence-loop/` | New | SDD artifacts for proposal/spec/design/tasks. |

## Unknowns

- Approved Vea catalog identity snapshot path and provenance.
- Where the issue #295 Vea artifact can be restored from, if it is not locally available.
- Whether regeneration is explicitly approved if restoration cannot locate or validate the prior artifact.

## Risks

| Risk | Likelihood | Mitigation |
|---|---:|---|
| Treating `likely missing` as confirmed absence | Med | Label as investigation-only in plan and outputs. |
| Snapshot provenance gap | Med | Stop until reviewer approves source and timestamp. |
| MAS/DIA caveats generalized away | Low | Preserve MAS `--exclude-category-path-pattern=-old-` and DIA offset sampling as later phases. |

## Rollback Plan

Revert this OpenSpec change and any follow-up PRD doc edits. Delete only generated comparison artifacts under the planned `audit/catalog-comparison/issue-<issue>/...` boundary; no data rollback is needed because writes are forbidden.

## Dependencies

- PR #321 / issue #320 merged comparison tooling.
- Approved read-only Vea catalog snapshot.

## Success Criteria

- [ ] Final plan passes two fresh objective audits after an improvement pass.
- [ ] Vea slice has explicit paths, provenance, stop conditions, non-goals, and bounded claims.
- [ ] No live audit, broad build/typecheck, DB write, or production write is performed.
