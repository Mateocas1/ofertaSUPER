# Catalog Comparison Evidence Loop Plan

Status: final evidence chain recorded; issue #334 is complete/closed with bounded verified artifacts
Change: `catalog-comparison-evidence-loop`
Scope: planning, evidence gates, and final bounded evidence-chain documentation only

## Purpose

Create a reviewable evidence loop for comparing bounded category-pagination candidates against an approved, source-scoped catalog identity snapshot. The real objective is not to prove full catalog coverage; it is to decide whether a future Vea-only comparison slice is safe, well-provenanced, and narrow enough to review.

This plan records the completed bounded Vea issue #334 evidence chain. It does not authorize any additional comparison execution, issue creation, artifact generation, ingestion, confirmed-missing classification, full-coverage claim, or production/data write.

## Handoff readiness summary

The future Vea execution issue described by earlier plan revisions has now been completed as issue #334. The evidence loop has one narrow, reviewable place where the approved/regenerated inputs, source-scoped snapshot, and artifact-only comparison output were recorded.

No further execution is authorized by this change. Issue #334 is closed after the final bounded summary comment: `https://github.com/Mateocas1/ofertaSUPER/issues/334#issuecomment-4737311195`.

Current gate state:

- Historical Vea #295 restore-first gate: satisfied for issue #334 by documenting that the original #295 artifact could not be restored locally or from git history, then using regenerated bounded read-only issue #334 evidence as new evidence rather than as the original #295 artifact.
- Candidate artifact gate: satisfied by `audit/coverage/issue-334/vea/category-pagination/category-pagination-audit.json` with SHA-256 `7dee0acb4c151715c566e7ebaa15e358b5258ec9395e22fff2cedabb0ca9d359`.
- Vea catalog identity snapshot gate: satisfied by `audit/catalog-snapshots/issue-334/vea/catalog-identities.json` with SHA-256 `ed9c7bee429cfbd5946aace64b10bd43916c0b8d395528f10408eeb4df0ef358`.
- Output issue gate: satisfied by closed issue #334 and final bounded summary comment `https://github.com/Mateocas1/ofertaSUPER/issues/334#issuecomment-4737311195`.
- Comparison output gate: satisfied by `audit/catalog-comparison/issue-334/vea/category-pagination/category-pagination-catalog-comparison.json` with SHA-256 `57f504581b7326516b020c3301bde69732b53a31ae959a55051b5ec8524e0396`.
- `likely missing` remains an investigation candidate label only.

See `provenance-discovery.md` for the read-only evidence-versus-inference summary. That summary does not authorize comparison execution, live audits, GitHub issue creation, or artifact output.

## Scope and non-goals

| Area | In scope | Out of scope |
|------|----------|--------------|
| Planning | Draft PRD/plan, provenance gates, path boundaries, stop conditions, audit loop mechanics | App code changes, CLI changes, schema changes |
| Evidence | Approved/restored Vea candidate artifact identity and approved Vea catalog snapshot identity | Invented artifact availability, unreviewed snapshots, all-source discovery |
| Execution | Future artifact-only Vea comparison only after gates and audits pass | Live audits in this slice, DB writes, production writes, ingestion, discovery apply |
| Expansion | Deferred order and caveats for later sources | Tasks or issues for Disco/Jumbo/Carrefour, MAS, or DIA in this change |

## Phase path

1. **Draft plan**: define the Vea-first scope, gates, paths, labels, and stop conditions.
2. **Fresh audit #1**: an objective reviewer checks for invented claims, vague tasks, unsafe writes, missing provenance, and overreach.
3. **Improvement pass**: apply only concrete findings from audit #1.
4. **Fresh audit #2**: a separate fresh review checks the revised plan for the same risks.
5. **Final Vea slice**: only if gates still pass, draft the minimal Vea issue/tasks for artifact-only comparison.

## First-slice Vea gates

The first execution slice was completed under issue #334. Historical gates are retained below so archive reviewers can see how each blocker was satisfied and what still remains out of scope.

| Gate | Final state | Evidence | Still disallowed |
|------|-------------|----------|------------------|
| Candidate artifact identity | Satisfied as regenerated bounded issue #334 evidence after #295 restore could not be completed. | `audit/coverage/issue-334/vea/category-pagination/category-pagination-audit.json`; SHA-256 `7dee0acb4c151715c566e7ebaa15e358b5258ec9395e22fff2cedabb0ca9d359`. | Treating regenerated #334 evidence as the original #295 artifact or as exhaustive coverage. |
| Catalog snapshot identity | Satisfied for the bounded #334 comparison. | `audit/catalog-snapshots/issue-334/vea/catalog-identities.json`; SHA-256 `ed9c7bee429cfbd5946aace64b10bd43916c0b8d395528f10408eeb4df0ef358`. | Reusing the snapshot for broader sources/windows without new approval. |
| Interpretation discipline | Satisfied and still active. | Final issue #334 summary states no full public catalog coverage, no confirmed missing products, no ingestion/write authorization, and `likelyMissingCandidates` means investigation candidates only. | Any wording that treats bounded evidence as confirmed absence or full coverage. |
| Output boundary | Satisfied. | `audit/catalog-comparison/issue-334/vea/category-pagination/category-pagination-catalog-comparison.json`; SHA-256 `57f504581b7326516b020c3301bde69732b53a31ae959a55051b5ec8524e0396`. | Any output outside the approved boundary or any use of #320 as the output boundary. |
| Audit loop | Satisfied for the planning chain. | Prior tasks record audit #1 improvements and audit #2 from PR #329 (`3528b92`); the refreshed verify report records `PASS` after stale planning docs were remediated. | Adding new scope, sources, or execution from this remediation. |

## Vea #295 restore-first decision

The Vea #295 candidate artifact was treated as restore-first historical evidence before issue #334 regeneration was accepted as new bounded evidence.

Historical discovery status: issue #295 is closed and approved, and the approved comment summarizes a bounded read-only artifact at `audit/coverage/issue-295/vea/category-pagination/category-pagination-audit.json`. The local artifact was not found in the checked worktrees, no tracked copy was found in git history for that path, and no hash was available. Issue #334 records the bounded regenerated replacement evidence path and hash instead of pretending the #295 artifact was restored.

Decision path:

1. Check for `audit/coverage/issue-295/vea/category-pagination/category-pagination-audit.json`.
2. If present, validate that it is source-scoped to `vea`, issue-scoped to `295`, and tied to the approved evidence record.
3. If absent, attempt to restore the previously approved artifact from review history, artifact storage, or another documented approved source.
4. Record the restoration source, timestamp, validation result, and hash when the file is available.
5. If restoration cannot locate or validate the prior approved artifact, stop using #295 as the artifact identity.
6. Regeneration is allowed only after explicit reviewer approval for a new bounded read-only artifact; issue #334 followed this branch.

Regenerated evidence MUST be labeled as regenerated evidence. It is not equivalent to the prior approved artifact. Issue #334 evidence is bounded regenerated evidence, not a restored #295 artifact.

The approved #295 summary values are category offset `100`, skipped eligible `100`, selectable after offset `459`, audited categories `20`, requests `87/110`, fetched rows `832`, denominator candidates `732`, duplicates `100`, and errors `0`. The confidence failure was due bounded category/page budgets, not runtime or source errors; no full-catalog coverage is claimed.

## Vea catalog snapshot provenance gate

The catalog identity snapshot gate was satisfied for the bounded issue #334 comparison by the reviewed local snapshot artifact:

```text
audit/catalog-snapshots/issue-334/vea/catalog-identities.json
```

SHA-256:

```text
ed9c7bee429cfbd5946aace64b10bd43916c0b8d395528f10408eeb4df0ef358
```

Historical versions of this plan recorded the snapshot gate as missing and hard-blocking. That was correct at the time; it is now historical context, not the current state for issue #334.

```yaml
source: vea
artifact_role: catalog_snapshot
artifact_path: audit/catalog-snapshots/issue-334/vea/catalog-identities.json
issue: "334"
origin: generated-read-only-approved
approved_by: issue #334 review chain
approved_at: final bounded summary comment https://github.com/Mateocas1/ofertaSUPER/issues/334#issuecomment-4737311195
sha256: ed9c7bee429cfbd5946aace64b10bd43916c0b8d395528f10408eeb4df0ef358
notes: bounded Vea-only identity snapshot for issue #334 comparison evidence; not full public catalog coverage.
```

Do not infer, backfill, or invent any field for future reuse. If a future comparison lacks equivalent approved evidence, that future comparison remains blocked.

## Final issue #334 comparison evidence

| Field | Value |
|-------|-------|
| Candidate artifact | `audit/coverage/issue-334/vea/category-pagination/category-pagination-audit.json` |
| Candidate SHA-256 | `7dee0acb4c151715c566e7ebaa15e358b5258ec9395e22fff2cedabb0ca9d359` |
| Catalog identity snapshot | `audit/catalog-snapshots/issue-334/vea/catalog-identities.json` |
| Snapshot SHA-256 | `ed9c7bee429cfbd5946aace64b10bd43916c0b8d395528f10408eeb4df0ef358` |
| Comparison report | `audit/catalog-comparison/issue-334/vea/category-pagination/category-pagination-catalog-comparison.json` |
| Comparison SHA-256 | `57f504581b7326516b020c3301bde69732b53a31ae959a55051b5ec8524e0396` |
| Counts | total `732`, known `97`, likelyMissingCandidates `635`, duplicates `0`, conflicts `0`, insufficient identity `0` |
| Confidence | `PASS` |
| Final summary | `https://github.com/Mateocas1/ofertaSUPER/issues/334#issuecomment-4737311195` |
| Issue state | Closed after final bounded summary |

The final summary preserves the bounded interpretation: no full coverage, no confirmed missing products, no ingestion authorization, and no write authorization.

## Allowed and disallowed actions

| Allowed in this draft/audit loop | Disallowed in this draft/audit loop |
|----------------------------------|-------------------------------------|
| Edit OpenSpec planning artifacts. | Run live audits or actual Vea comparison. |
| Inspect already-approved artifact metadata if provided by the orchestrator/reviewer. | Regenerate evidence without explicit approval and provenance. |
| Record missing provenance as a gate. | Read or write production data. |
| Run whitespace/artifact consistency checks such as `git diff --check`. | Run DB writes, migrations, deploys, cache purges, ingestion, discovery apply, scheduler/all-source runs, broad builds, or broad typechecks. |
| Prepare a gated future issue/task stub without opening issues. | Create future-source tasks or issues before the Vea plan passes audits. |

## Interpretation rules

- `likely missing` means investigation candidate only.
- It does not mean confirmed missing product, catalog defect, or write/apply input.
- Bounded comparison evidence applies only to the approved candidate artifact and approved catalog snapshot window.
- Conflicts, duplicate candidates, insufficient identity rows, stale inputs, and ambiguous matches must be reported separately.
- Matching must remain source-scoped and conservative: `source + skuId`, then normalized `source + productUrl`, then `source + ean`.

## Exact input and output boundaries

### Candidate input

```text
audit/coverage/issue-334/vea/category-pagination/category-pagination-audit.json
```

This is the verified regenerated bounded issue #334 candidate artifact. Historical issue #295 remains a restore-first decision record; it was not restored as the final artifact.

### Catalog snapshot input

```text
audit/catalog-snapshots/issue-334/vea/catalog-identities.json
```

This is the verified bounded Vea catalog identity snapshot for issue #334 only.

### Future comparison output

```text
audit/catalog-comparison/issue-334/vea/category-pagination/
```

Outputs under this directory include only artifact reports for the approved Vea issue #334 slice. No files outside this boundary are approved by this plan.

Issue #334 is closed after the final bounded summary. It satisfied the concrete output issue-number gate, and the verified issue #334 candidate/snapshot/comparison artifacts satisfy the bounded evidence chain for this slice.

Issue #320 MUST NOT be used for this boundary: it is approved but closed and scoped to comparison tooling implementation, not the actual future Vea comparison execution/output.

## Success conditions

- Fresh audit #1 finds no blocking invented claims, unsafe writes, missing path boundaries, vague tasks, or overreach; or it reports concrete findings that can be fixed without expanding scope.
- Fresh audit #2 passes after the improvement pass.
- The issue #334 candidate artifact, catalog snapshot, and comparison report have complete recorded paths, hashes, and bounded approval evidence.
- The completed Vea slice remains artifact-only, source-scoped, and bounded to the exact approved inputs and output path.
- The plan never claims full coverage or confirmed absence from bounded evidence.

## Stop conditions

Stop before any future comparison execution if any of these are true:

- The candidate artifact cannot be located, restored, regenerated with approval, or validated from approved evidence.
- The Vea catalog identity snapshot path, approval reference, approver, approval timestamp, or hash is missing.
- The future output path differs from `audit/catalog-comparison/issue-334/vea/category-pagination/` or uses an unresolved `<issue>` placeholder.
- A requested action includes DB writes, production writes, ingestion, discovery apply, live all-source runs, migrations, deploys, cache purges, broad builds/typechecks, or actual comparison during this planning slice.
- Audit #1 or audit #2 reports unresolved invented claims, unsafe actions, vague tasks, missing provenance, or overreach.
- A result interpretation treats `likely missing` as confirmed absence or implies full public catalog coverage.

## Future expansion order and caveats

Expansion is deferred. Do not create broad future-source tasks from this draft.

If the Vea slice passes the full audit loop and a later maintainer approves expansion, the order is:

1. Vea.
2. Disco/Jumbo/Carrefour.
3. MAS, preserving the `--exclude-category-path-pattern=-old-` caveat.
4. DIA, preserving offset-sampling caveats.

Each later source needs its own approved candidate artifact, approved catalog snapshot, source-specific caveats, output boundary, and review gate.

## Fresh audit loop mechanics

Fresh audit reviewers should treat this document as untrusted draft input and check it against `proposal.md`, `spec.md`, `design.md`, and `tasks.md`.

Audit checklist:

- Are any artifact paths, approvals, timestamps, hashes, or availability claims invented?
- Are any write-capable actions allowed or implied?
- Are `likely missing` results framed only as investigation candidates?
- Are output paths exact and source-scoped?
- Are future sources deferred without creating broad tasks?
- Are stop conditions explicit enough to block unsafe execution?
- Is the Vea #295 restore-first decision preserved as history, without pretending #334 restored the original artifact?
- Is the catalog snapshot provenance gate recorded with real issue #334 evidence and bounded reuse caveats?

Audit outputs should contain only concrete findings. The improvement pass may apply only those findings and must not add new scope.

## Historical minimal Vea execution issue/task stub

This stub was the historical planning shape for the minimal Vea execution issue. It has been resolved by issue #334 and is retained only as review history. Do not open another issue or execute additional work from this stub.

```markdown
Title: Run bounded Vea category-pagination catalog comparison

Purpose:
- Produce one bounded, artifact-only Vea comparison report that helps reviewers investigate category-pagination candidates against an approved Vea catalog identity snapshot.
- Do not treat the result as full coverage, confirmed absence, ingestion input, or production action.

Prerequisites / gates satisfied by issue #334:
- Vea #295 restore-first was attempted/documented and the original artifact was not restored locally or from git history.
- Regenerated bounded candidate evidence was recorded at `audit/coverage/issue-334/vea/category-pagination/category-pagination-audit.json` with SHA-256 `7dee0acb4c151715c566e7ebaa15e358b5258ec9395e22fff2cedabb0ca9d359`.
- Vea catalog identity snapshot provenance was recorded at `audit/catalog-snapshots/issue-334/vea/catalog-identities.json` with SHA-256 `ed9c7bee429cfbd5946aace64b10bd43916c0b8d395528f10408eeb4df0ef358`.
- The concrete approved execution issue was #334 and is now closed after the final bounded summary.
- Regenerated read-only evidence is new bounded evidence; it is not equivalent to restored #295 evidence.

Final inputs and provenance:
- Candidate input: `audit/coverage/issue-334/vea/category-pagination/category-pagination-audit.json`.
- Catalog snapshot input: `audit/catalog-snapshots/issue-334/vea/catalog-identities.json`.
- Comparison output: `audit/catalog-comparison/issue-334/vea/category-pagination/category-pagination-catalog-comparison.json`.
- Final summary: `https://github.com/Mateocas1/ofertaSUPER/issues/334#issuecomment-4737311195`.

Allowed actions in this remediation:
- Inspect and document already-verified artifact metadata supplied by the orchestrator/reviewer.
- Run whitespace checks on changed documentation.

Disallowed actions:
- Do not run live audits, all-source discovery, ingestion, discovery apply, DB writes, production writes, migrations, deploys, cache purges, broad builds/typechecks, or broad source expansion.
- Do not generate or regenerate inputs unless a reviewer explicitly approves bounded read-only regenerated evidence.
- Do not create outputs with the unresolved `<issue>` placeholder.
- Do not convert `likely missing` candidates into confirmed missing-product claims.

Output path gate:
- Output boundary: `audit/catalog-comparison/issue-334/vea/category-pagination/`.
- Issue #334 satisfies the output issue-number gate and the bounded candidate/snapshot/comparison evidence chain for this Vea slice.
- Any output outside this boundary is out of scope.

Acceptance criteria met by issue #334:
- Candidate artifact, catalog snapshot, and comparison report paths and hashes are recorded.
- Comparison output uses the concrete approved issue-number path and remains artifact-only.
- Comparison counts are total `732`, known `97`, likelyMissingCandidates `635`, duplicates `0`, conflicts `0`, insufficient identity `0`, confidence `PASS`.
- `likelyMissingCandidates` remains investigation-only.
- No full coverage, confirmed missing-product, ingestion, or write authorization is granted.

Stop conditions:
- Any provenance field is missing or ambiguous.
- Inputs are stale outside the approved freshness window.
- The requested command attempts writes or output outside the approved boundary.
- The output path still contains the `<issue>` placeholder.
- Reviewers cannot distinguish restored approved evidence from regenerated evidence.
- The comparison would require broad source expansion or any action beyond the minimal Vea slice.
```
