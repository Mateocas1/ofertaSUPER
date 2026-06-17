# Design: Catalog Comparison Evidence Loop

## Technical Approach

Design a documentation-first operational loop around the existing source-scoped, fixture-backed comparison tooling. The loop does not change application code and does not authorize ingestion, apply, DB writes, production writes, live all-source audits, broad builds, or typechecks. It starts with Vea and converts approved artifacts into bounded comparison evidence under explicit provenance gates.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Vea #295 handling | Restore/reuse the previously approved Vea #295 candidate artifact first; regenerate only if restoration fails validation. | Always regenerate; assume local artifact exists. | Preserves review continuity and avoids unnecessary live re-execution while still allowing a controlled fallback. |
| Scope boundary | Evidence loop only: plan, provenance, audits, and artifact-only comparison outputs. | Fold into ingestion/discovery apply or broader catalog strategy. | The spec forbids writes and full-coverage claims; narrow scope keeps the first slice reviewable. |
| Audit discipline | Draft -> audit1 -> improvements -> audit2 -> final. | Single review pass or continuous edits. | Two fresh audits reduce invented claims, vague tasks, missing provenance, and overreach. |

## Current Chained Slice Boundary

Slice/PR 1 is limited to provenance gates and the Vea #295 restore-first decision foundation. It does not execute audits, regenerate artifacts, run comparison scripts, write comparison outputs, create final handoff issues, or expand beyond Vea. Later slices may proceed only after this slice leaves unresolved provenance as explicit gates rather than assumed evidence.

## Data Flow

```text
Approved/restored Vea #295 candidate ─┐
Approved catalog identity snapshot ───┼─> comparison CLI -> artifact report -> issue/task handoff
Provenance checklist ─────────────────┘          │
                                                  └─> audit1 -> fixes -> audit2 -> final plan
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `openspec/changes/catalog-comparison-evidence-loop/design.md` | Create | This technical design. |
| `docs/category-pagination-catalog-comparison-plan.md` | Modify later | Supersede/refine with the final evidence-loop PRD and Vea slice. |
| `audit/catalog-comparison/issue-<issue>/<source>/category-pagination/` | Create later | Artifact-only comparison output boundary. |

## Interfaces / Contracts

### Vea #295 restore-first decision tree

1. Check whether `audit/coverage/issue-295/vea/category-pagination/category-pagination-audit.json` is locally present.
2. If present, validate provenance against the approved issue/comment/source/timestamp before use.
3. If absent, attempt to restore the previously approved artifact from review history or artifact storage; record who/where/when.
4. If restore cannot locate or validate the artifact, stop for explicit approval before regenerating a bounded read-only snapshot.
5. Regenerated evidence must be labeled as regenerated, not equivalent to the prior approved artifact.

### Vea #295 artifact provenance gate

The candidate artifact is usable only when all of the following are true:

| Check | Required evidence |
|---|---|
| Path identity | `audit/coverage/issue-295/vea/category-pagination/category-pagination-audit.json` exists locally or has a documented restore source. |
| Source identity | Artifact content and path are source-scoped to `vea` and issue `295`. |
| Approval reference | The issue, PR, comment, or reviewer approval that accepted the artifact is linked or quoted. |
| Timestamp | The artifact timestamp and approval/restoration timestamp are recorded. |
| Integrity | `sha256` is captured when the file is available. |
| Interpretation | `likely missing` remains an investigation candidate label only. |

If any check is missing, the slice stops before comparison execution. Missing checks are recorded as gates; they are not filled with assumptions.

### Controlled read-only regeneration fallback

Regeneration is a fallback, not the default. It is available only when the restore attempt cannot locate or validate the prior approved artifact and the reviewer explicitly approves a new bounded read-only artifact. The fallback record must include the failed restore evidence, exact command, generated timestamp, hash, and a note that the result is regenerated evidence, not equivalent to the prior approved artifact.

### Vea catalog identity snapshot gate

The catalog identity snapshot remains blocked until its repo-relative fixture path and approval record are known. The first slice may document this gate, but it must not mark the snapshot usable without these fields:

- `artifact_path`: reviewed repo-relative JSON fixture path.
- `source`: `vea`.
- `artifact_role`: `catalog_snapshot`.
- `approved_by`: reviewer, issue, PR, or comment reference.
- `approved_at`: approval timestamp or issue comment timestamp.
- `sha256`: hash of the approved fixture when available.
- `notes`: freshness window and bounded caveats.

### Provenance record shape

```yaml
source: vea
issue: 295
artifact_path: audit/coverage/issue-295/vea/category-pagination/category-pagination-audit.json
artifact_role: candidate | catalog_snapshot | comparison_output
origin: restored-approved | local-approved | regenerated-read-only
approved_by: <reviewer-or-issue-reference>
approved_at: <ISO timestamp or issue comment timestamp>
generated_at: <artifact timestamp>
command_or_restore_method: <exact command or restoration source>
sha256: <hash when available>
notes: <bounded caveats>
```

Checklist: source matches path; issue matches scope; timestamp is documented; approver/reference exists; command/method is exact; `likely missing` is candidate-only; catalog snapshot is source-scoped; restored and regenerated artifacts are labeled distinctly.

### Command and path policy

Allowed after gates: file inspection, artifact restore, hashing, and source-scoped comparison via `scripts/audit-category-pagination-catalog-comparison.ts` with `--source`, `--issue-number`, `--candidate-artifact`, `--catalog-fixture`, `--output`, `--generated-at`. Controlled regeneration requires explicit approval and only bounded `scripts/audit-category-pagination.ts`; later MAS must keep `--exclude-category-path-pattern=-old-`, DIA must keep offset sampling.

Disallowed: `--apply`, `--write`, `--confirm`, `--execute`, `--delete`, scheduler/all-source runs, production writes, DB writes, migrations, deploys, cache purge, ingestion, broad builds/typechecks, and live audits during design/tasks.

Inputs: candidates only from `audit/coverage/issue-<issue>/<source>/category-pagination/*.json`; catalog fixtures only reviewed repo-relative JSON snapshots. Outputs: only `audit/catalog-comparison/issue-<issue>/<source>/category-pagination/*.json`.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Document review | Scope, gates, labels, caveats | Two fresh objective audits before final. |
| Unit | Existing comparison guardrails | Later targeted `tsx --test tests/category-pagination-catalog-comparison.test.ts` if implementation changes occur. |
| Integration | Vea artifact handoff | Verify provenance checklist and output path only; no live execution without approval. |

## Migration / Rollout

No migration required. Roll out as a reviewable Vea-first PRD/task slice, then expand in order: Vea, Disco/Jumbo/Carrefour, MAS, DIA. Stop on missing provenance, unsafe command, ambiguous artifact identity, stale snapshot window, conflicting matches, or any pressure to treat bounded evidence as exhaustive.

## Open Questions

- [ ] Approved Vea catalog identity snapshot path and provenance.
- [ ] Where the previously approved Vea #295 candidate artifact should be restored from if not local.
- [ ] Whether controlled read-only regeneration is approved if restore cannot locate or validate the prior artifact.
