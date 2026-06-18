# Read-only Provenance Discovery

Status: documentation-only discovery summary. This file records supplied and locally checked provenance facts for the future Vea comparison gate. It does not authorize comparison execution, live audits, artifact generation, issue creation, or writes.

## Decision summary

| Gate | Status | Effect |
|------|--------|--------|
| Vea #295 candidate artifact | Approved summary exists, but the local artifact and hash are unavailable. | Restore-first remains blocked until an approved artifact source is found; regeneration requires explicit approval as new bounded read-only evidence. |
| Vea catalog identity snapshot | No approved local fixture, path, timestamp, hash, or approval record found. | Hard block for comparison execution. |
| Future output issue | Issue #320 is not suitable for the concrete execution/output boundary. | A new approved Vea execution issue is required before output can be written. |

## Evidence vs inference

| Topic | Evidence | Inference / limit |
|-------|----------|-------------------|
| GitHub issue #295 | Issue #295 is closed and approved. A comment approves the bounded read-only artifact path `audit/coverage/issue-295/vea/category-pagination/category-pagination-audit.json`. | Approval covers a bounded read-only artifact summary; it does not prove full-catalog coverage. |
| #295 comment values | The approved summary records category offset `100`, skipped eligible `100`, selectable after offset `459`, audited categories `20`, requests `87/110`, fetched rows `832`, denominator candidates `732`, duplicates `100`, and errors `0`. | The confidence failure came from bounded category/page budgets, not runtime or source errors. |
| #295 local artifact | The artifact path was not found in `ofertasSUPER-catalog-plan`, `ofertasSUPER`, or `ofertasSUPER-phase2`. `git log --all --name-only -- audit/coverage/issue-295/vea/category-pagination/category-pagination-audit.json` found no tracked copy. | The artifact hash is unavailable. Restore-first cannot proceed unless another approved artifact source is identified. |
| Vea catalog snapshot | No approved local fixture/snapshot, path, hash, timestamp, or approval evidence was found. | The snapshot gate remains hard-blocked; no comparison can run against an inferred or newly invented snapshot. |
| Output issue | Issue #320 is approved but closed and scoped to comparison tooling implementation. | Do not treat #320 as the concrete future Vea comparison execution/output issue. A new approved execution issue is required later. |

## Current stop conditions

- Do not execute comparison.
- Do not run live audits or network scripts.
- Do not create GitHub issues.
- Do not write comparison output while the concrete approved execution issue is unknown.
- Do not use #320 as the output issue boundary.
- Do not regenerate #295 evidence unless a reviewer explicitly approves controlled bounded read-only regeneration as new evidence.
