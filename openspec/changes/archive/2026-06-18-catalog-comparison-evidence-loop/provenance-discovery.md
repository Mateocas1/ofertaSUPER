# Read-only Provenance Discovery

Status: documentation-only provenance summary. This file records supplied and previously verified provenance facts for the completed bounded issue #334 Vea comparison evidence chain. It does not authorize further comparison execution, live audits, artifact generation, issue creation, ingestion, confirmed-missing classification, full-coverage claims, or writes.

## Decision summary

| Gate | Status | Effect |
|------|--------|--------|
| Vea #295 candidate artifact | Historical restore-first gate documented: the original #295 artifact could not be restored locally or from git history. | Issue #334 uses regenerated bounded read-only evidence as new evidence; it is not treated as the original #295 artifact. |
| Issue #334 candidate artifact | Verified: `audit/coverage/issue-334/vea/category-pagination/category-pagination-audit.json`, SHA-256 `7dee0acb4c151715c566e7ebaa15e358b5258ec9395e22fff2cedabb0ca9d359`. | Candidate gate is satisfied for the bounded issue #334 comparison only. |
| Vea catalog identity snapshot | Verified: `audit/catalog-snapshots/issue-334/vea/catalog-identities.json`, SHA-256 `ed9c7bee429cfbd5946aace64b10bd43916c0b8d395528f10408eeb4df0ef358`. | Snapshot gate is satisfied for the bounded issue #334 comparison only. |
| Comparison report | Verified: `audit/catalog-comparison/issue-334/vea/category-pagination/category-pagination-catalog-comparison.json`, SHA-256 `57f504581b7326516b020c3301bde69732b53a31ae959a55051b5ec8524e0396`. | Final output exists for the approved boundary; no further output is authorized. |
| Output issue | Issue #334 is closed after final bounded summary: `https://github.com/Mateocas1/ofertaSUPER/issues/334#issuecomment-4737311195`. | The evidence chain is complete for this bounded Vea slice; interpretation remains investigation-only. |

## Evidence vs inference

| Topic | Evidence | Inference / limit |
|-------|----------|-------------------|
| GitHub issue #295 | Issue #295 is closed and approved. A comment approves the bounded read-only artifact path `audit/coverage/issue-295/vea/category-pagination/category-pagination-audit.json`. | Approval covers a bounded read-only artifact summary; it does not prove full-catalog coverage. |
| #295 comment values | The approved summary records category offset `100`, skipped eligible `100`, selectable after offset `459`, audited categories `20`, requests `87/110`, fetched rows `832`, denominator candidates `732`, duplicates `100`, and errors `0`. | The confidence failure came from bounded category/page budgets, not runtime or source errors. |
| #295 local artifact | The artifact path was not found in `ofertasSUPER-catalog-plan`, `ofertasSUPER`, or `ofertasSUPER-phase2`. `git log --all --name-only -- audit/coverage/issue-295/vea/category-pagination/category-pagination-audit.json` found no tracked copy. | The artifact hash is unavailable. This is historical context; issue #334 used regenerated bounded evidence as new evidence. |
| Issue #334 candidate artifact | `audit/coverage/issue-334/vea/category-pagination/category-pagination-audit.json`; SHA-256 `7dee0acb4c151715c566e7ebaa15e358b5258ec9395e22fff2cedabb0ca9d359`. | Bounded regenerated issue #334 evidence only; not restored #295 evidence and not full coverage. |
| Vea catalog snapshot | `audit/catalog-snapshots/issue-334/vea/catalog-identities.json`; SHA-256 `ed9c7bee429cfbd5946aace64b10bd43916c0b8d395528f10408eeb4df0ef358`. | Valid for the bounded issue #334 Vea comparison only; not a reusable all-source/full-catalog fixture. |
| Comparison report | `audit/catalog-comparison/issue-334/vea/category-pagination/category-pagination-catalog-comparison.json`; SHA-256 `57f504581b7326516b020c3301bde69732b53a31ae959a55051b5ec8524e0396`. | Artifact-only report under the approved issue #334 boundary. |
| Comparison counts | total `732`, known `97`, likelyMissingCandidates `635`, duplicates `0`, conflicts `0`, insufficient identity `0`, confidence `PASS`. | `likelyMissingCandidates` remains investigation-only; no confirmed missing products and no full coverage. |
| Output issue #320 | Issue #320 is approved but closed and scoped to comparison tooling implementation. | Do not treat #320 as the concrete future Vea comparison execution/output issue. |
| Output issue #334 | Issue #334 is closed after final bounded summary comment `https://github.com/Mateocas1/ofertaSUPER/issues/334#issuecomment-4737311195`. | #334 supplies the concrete approved output boundary and final evidence-chain summary for this bounded Vea slice only. |

## Current stop conditions

- Do not execute any additional comparison from this remediation.
- Do not run live audits or network scripts.
- Do not create GitHub issues.
- Do not write or regenerate comparison output from this remediation.
- Do not use #320 as the output issue boundary.
- Do not use the issue #334 artifacts to claim full public catalog coverage, confirmed missing products, ingestion authorization, discovery apply authorization, or any production/data write authorization.
- Do not regenerate #295 evidence unless a reviewer explicitly approves controlled bounded read-only regeneration as new evidence.
