# Catalog Comparison Evidence Loop Plan

Status: final handoff draft; execution remains blocked until every gate below is approved
Change: `catalog-comparison-evidence-loop`
Scope: planning and evidence gates only

## Purpose

Create a reviewable evidence loop for comparing bounded category-pagination candidates against an approved, source-scoped catalog identity snapshot. The real objective is not to prove full catalog coverage; it is to decide whether a future Vea-only comparison slice is safe, well-provenanced, and narrow enough to review.

This plan is the handoff-ready planning artifact for a future minimal Vea execution issue. It does not authorize comparison execution, issue creation, artifact generation, or any production/data write.

## Handoff readiness summary

The future Vea execution issue remains warranted because the evidence loop still needs one narrow, reviewable place to collect the approved inputs, run the bounded comparison only after gates pass, and store artifact-only output under a concrete issue-number boundary.

The issue is not executable from this change. A maintainer or orchestrator must create or approve the concrete execution issue later, then record the issue number and complete provenance before any comparison output is written.

Current blocking gates:

- The Vea #295 candidate artifact must be present or restored from approved evidence and validated.
- The Vea catalog identity snapshot path and approval record are still unknown in this plan.
- The future output path must use the concrete approved execution issue number, not the `<issue>` placeholder.
- `likely missing` remains an investigation candidate label only.

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

The first execution slice remains blocked until every required gate below has approved evidence.

| Gate | Required evidence | Stop condition |
|------|-------------------|----------------|
| Candidate artifact identity | `audit/coverage/issue-295/vea/category-pagination/category-pagination-audit.json` is present locally or restored from an approved source; provenance and validation are documented. | Missing path, missing approval reference, failed restore validation, or ambiguous source/issue identity. |
| Catalog snapshot identity | A reviewed repo-relative JSON fixture for Vea catalog identities, with source, issue/reference, approver, approval timestamp, generation/restoration method, and `sha256`. | Missing concrete path, missing approval record, missing hash when the file is available, mixed-source fixture, or unapproved generated evidence. |
| Interpretation discipline | Results keep `likely missing` as investigation-only and report conflicts/ambiguity separately. | Any wording that treats bounded evidence as confirmed absence or full coverage. |
| Output boundary | Future comparison outputs stay under `audit/catalog-comparison/issue-<issue>/vea/category-pagination/`, with `<issue>` replaced by the concrete approved issue number before any output is written. | Any output outside the approved boundary, any unresolved `<issue>` placeholder at output time, or any write-oriented action. |
| Audit loop | Audit #1 and audit #2 are complete, and concrete findings are resolved without adding scope. | Unresolved invented claims, missing provenance, unsafe actions, vague tasks, or overreach. |

## Vea #295 restore-first decision

The Vea #295 candidate artifact MUST be restored or reused before regeneration is considered.

Decision path:

1. Check for `audit/coverage/issue-295/vea/category-pagination/category-pagination-audit.json`.
2. If present, validate that it is source-scoped to `vea`, issue-scoped to `295`, and tied to the approved evidence record.
3. If absent, attempt to restore the previously approved artifact from review history, artifact storage, or another documented approved source.
4. Record the restoration source, timestamp, validation result, and hash when the file is available.
5. If restoration cannot locate or validate the prior approved artifact, stop.
6. Regeneration is allowed only after explicit reviewer approval for a new bounded read-only artifact.

Regenerated evidence, if ever approved later, MUST be labeled as regenerated evidence. It is not equivalent to the prior approved artifact.

## Vea catalog snapshot provenance gate

The catalog identity snapshot is not currently available as approved evidence in this plan. Future comparison execution remains blocked until this record can be completed from real evidence:

```yaml
source: vea
artifact_role: catalog_snapshot
artifact_path: <repo-relative reviewed JSON fixture path>
issue: <issue, PR, comment, or review reference>
origin: repo-reviewed | restored-approved | generated-read-only-approved
approved_by: <reviewer or approval reference>
approved_at: <approval timestamp or issue comment timestamp>
generated_at: <fixture generation timestamp, if applicable>
command_or_restore_method: <exact command or restore source>
sha256: <hash of the exact approved bytes>
notes: <freshness window and bounded caveats>
```

Do not infer, backfill, or invent any field. If a field is missing, the comparison remains blocked.

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
audit/coverage/issue-295/vea/category-pagination/category-pagination-audit.json
```

This path is a candidate artifact boundary only. The artifact must still be present or restored and validated before use.

### Catalog snapshot input

```text
<repo-relative approved Vea catalog identity JSON fixture>
```

The concrete path is intentionally unknown in this draft. It must be supplied by approved provenance before execution.

### Future comparison output

```text
audit/catalog-comparison/issue-<issue>/vea/category-pagination/
```

Future outputs under this directory may include only artifact reports for the approved Vea slice. No files outside this boundary are approved by this plan.

Before any comparison output is written, `<issue>` MUST be replaced with the concrete approved issue number for the Vea execution slice. If the issue number has not been approved and recorded, output writing remains blocked.

## Success conditions

- Fresh audit #1 finds no blocking invented claims, unsafe writes, missing path boundaries, vague tasks, or overreach; or it reports concrete findings that can be fixed without expanding scope.
- Fresh audit #2 passes after the improvement pass.
- The Vea candidate artifact and catalog snapshot have complete approved provenance before any comparison execution.
- Future Vea tasks remain artifact-only, source-scoped, and bounded to the exact approved inputs and output path.
- The plan never claims full coverage or confirmed absence from bounded evidence.

## Stop conditions

Stop before comparison execution if any of these are true:

- The Vea #295 candidate artifact cannot be located, restored, or validated from approved evidence.
- The Vea catalog identity snapshot path, approval reference, approver, approval timestamp, or hash is missing.
- The future output path still contains the `<issue>` placeholder instead of the concrete approved issue number.
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
- Is the Vea #295 restore-first decision preserved?
- Is the catalog snapshot provenance gate still blocking execution until real evidence exists?

Audit outputs should contain only concrete findings. The improvement pass may apply only those findings and must not add new scope.

## Minimal future Vea execution issue/task stub

Do not open an issue from this stub in this change. This is a non-actionable gated draft for reviewer visibility only. It becomes eligible only after the concrete execution issue is approved and every prerequisite gate has real provenance evidence.

```markdown
Title: Run bounded Vea category-pagination catalog comparison

Purpose:
- Produce one bounded, artifact-only Vea comparison report that helps reviewers investigate category-pagination candidates against an approved Vea catalog identity snapshot.
- Do not treat the result as full coverage, confirmed absence, ingestion input, or production action.

Prerequisites / gates:
- Vea #295 candidate artifact is present locally or restored from an approved source.
- Candidate artifact provenance is documented: path, source, issue/reference, approval reference, restoration source if restored, validation timestamp, and `sha256` when available.
- Vea catalog identity snapshot provenance is complete: repo-relative fixture path, source `vea`, issue/PR/comment/reference, artifact role `catalog_snapshot`, origin, approver, approval timestamp, generation/restoration method, freshness notes, and `sha256`.
- The concrete approved execution issue number is recorded before any output path is used.
- Reviewers explicitly accept any regenerated read-only evidence as new bounded evidence; regenerated evidence is not equivalent to restored approved evidence.

Required inputs and provenance:
- Candidate input: `audit/coverage/issue-295/vea/category-pagination/category-pagination-audit.json`.
- Catalog snapshot input: the approved repo-relative Vea catalog identity JSON fixture path, supplied by the provenance record.
- Provenance record must include exact approved bytes via `sha256` when files are available.
- Missing, ambiguous, stale, mixed-source, or unapproved inputs block execution.

Allowed actions:
- Inspect approved local/restored artifact metadata.
- Compute hashes for approved local/restored files.
- Run only the source-scoped comparison after all gates pass.
- Write only artifact comparison output under the approved output boundary.

Disallowed actions:
- Do not run live audits, all-source discovery, ingestion, discovery apply, DB writes, production writes, migrations, deploys, cache purges, broad builds/typechecks, or broad source expansion.
- Do not generate or regenerate inputs unless a reviewer explicitly approves bounded read-only regenerated evidence.
- Do not create outputs with the unresolved `<issue>` placeholder.
- Do not convert `likely missing` candidates into confirmed missing-product claims.

Output path gate:
- Output boundary: `audit/catalog-comparison/issue-<approved-issue-number>/vea/category-pagination/`.
- Replace `<approved-issue-number>` with the concrete approved execution issue number before any output is written.
- Any output outside this boundary is out of scope.

Acceptance criteria:
- Candidate artifact provenance is documented and validated against the approved/restored Vea #295 artifact.
- Catalog snapshot provenance record is complete, including path, source, issue/reference, approver, approval timestamp, origin, generation/restoration method, and `sha256`.
- Comparison output uses the concrete approved issue-number path and remains artifact-only.
- Comparison output preserves `likely missing` as investigation candidate only.
- Conflicts, duplicates, ambiguous matches, and insufficient identity rows are reported separately.
- No DB writes, production writes, ingestion, discovery apply, live audits, all-source runs, broad builds/typechecks, deploys, migrations, or cache purges occur.

Stop conditions:
- Any provenance field is missing or ambiguous.
- Inputs are stale outside the approved freshness window.
- The requested command attempts writes or output outside the approved boundary.
- The output path still contains the `<issue>` placeholder.
- Reviewers cannot distinguish restored approved evidence from regenerated evidence.
- The comparison would require broad source expansion or any action beyond the minimal Vea slice.
```
