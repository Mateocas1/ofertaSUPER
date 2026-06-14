# Category-pagination budget expansion strategy

Status: proposed for review  
Issue: [#290](https://github.com/Mateocas1/ofertaSUPER/issues/290)  
Scope: documentation only

## Decision

Expand category-pagination evidence in source-scoped, read-only slices. The next goal is not full catalog coverage; it is to measure whether larger category/page budgets keep producing useful denominator candidates while staying within explicit request, error, and reviewer budgets.

## Current evidence baseline

The category-pagination evidence matrix shows productive bounded samples for every registered VTEX source:

| Source group | Baseline behavior | Expansion implication |
| --- | --- | --- |
| Vea, Disco, Jumbo, Carrefour | Productive from the first eligible category slice. | Increase category/page budgets conservatively from the same sampling shape. |
| MAS | Productive only after excluding legacy `-old-` paths. | Keep the `-old-` exclusion unless a separate lineage-only audit is needed. |
| DIA | Productive only after offset sampling. | Continue with explicit offsets; do not treat the first slice as representative. |

## Expansion ladder

Use this ladder per source. Do not advance a source to the next rung unless the previous rung has reviewed evidence and no blocking safety findings.

| Rung | Purpose | Suggested bounds | Exit criteria |
| --- | --- | --- | --- |
| 1. Baseline repeat | Prove reproducibility after the first matrix run. | Existing source-specific sampling shape, same request cap class. | Candidate yield is non-zero and artifacts are internally consistent. |
| 2. Wider categories | Measure yield beyond the initial slice. | Increase category budget before page depth. | Unique candidates continue increasing without excessive duplicate or error rate. |
| 3. Deeper pages | Measure depth value inside productive categories. | Increase page depth for selected high-yield categories. | Additional pages add useful candidates and do not mostly repeat prior rows. |
| 4. Mixed sample | Reduce first-slice/offset bias. | Combine early, middle, and later category offsets. | Candidate distribution is useful across offsets, with documented gaps. |
| 5. Policy proposal | Decide whether broader repeated audits are worth the cost. | No scheduler or writes. Documentation/reporting only. | Reviewers can compare yield, cost, errors, and remaining unknowns per source. |

## Stop rules

Every expansion run should remain fail-closed and stop on:

- 403, 429, captcha, host drift, or unexpected HTML responses.
- Repeated malformed product rows or identity conflicts.
- Error rate high enough to make the denominator misleading.
- Request, timeout, retry, or artifact boundary budget exhaustion.
- Any pressure to compensate for low yield by switching to unbounded or all-source execution.

## Source-specific policy

| Source | Default next move | Notes |
| --- | --- | --- |
| Vea | Wider categories. | Strong first-slice yield; good candidate for reproducibility check. |
| Disco | Wider categories. | Similar to Vea; keep duplicate rate visible. |
| Jumbo | Wider categories. | Similar to Vea/Disco; watch overlap with shared category structure. |
| Carrefour | Wider categories. | Prior run had zero summarized errors; still bounded only. |
| MAS | Wider active categories with `-old-` excluded. | Legacy paths are lineage context, not the default productive sample. |
| DIA | Mixed offset samples. | First slice was low-utility; offsets must be explicit in issue and artifact metadata. |

## What expansion still does not prove

- Full public catalog exhaustion or complete internal supermarket catalog coverage.
- Scheduler readiness, all-source execution, discovery apply, or production write safety.
- Stable freshness cadence or product update throughput.
- That one surface is sufficient; category pagination still needs overlap analysis with other public surfaces.

## Recommended next slice

Run one approved, bounded, read-only baseline repeat for a high-yield source such as Vea. If it stays productive, use that evidence to justify a wider-category rung for the same source before broadening the pattern to all sources.
