# Direct-refresh retry and alert policy

Direct-refresh remains a controlled, manual, source-specific operation. This policy defines what must alert a human and when retries are allowed; it does not authorize scheduler, all-source, repeated-batch, or automatic write work.

## Quick path

1. Run source health and operation gates read-only.
2. If any alert condition fires, stop at the first unsafe boundary.
3. Assign the alert to the current operator and record the channel used.
4. For failed or stopped write attempts, verify no partial write before any retry.
5. Retry only when the incident class below allows it and fresh evidence exists.

## Current operating boundary

| Boundary | Decision |
|---|---|
| Supported writer sources | Carrefour, Vea, Disco, Jumbo, MAS. |
| DIA | Audit-only/no-writer until a separate exclusion or hardening decision is approved. |
| Scheduler | Blocked. This policy is prerequisite documentation, not scheduler approval. |
| All-source / repeated batches | Blocked. Every operation remains source-specific and issue-approved. |
| Alert implementation | Not included here. This document defines conditions for a later implementation slice. |
| Owner/channel values | Example placeholders until run ownership and notification implementation are approved; concrete channels remain TBD. |

## Alert severity model

| Severity | Meaning | Operator action |
|---|---|---|
| `CRITICAL` | A write may be unsafe, partially applied, or unverified. | Stop immediately, preserve artifacts, verify no partial write, escalate to owner. |
| `HIGH` | A gate or audit failed before writes, or a write stopped before transaction. | Stop, preserve artifacts, diagnose, retry only under the allowed policy. |
| `MEDIUM` | Source is degraded but controlled manual operation may still be possible after explicit review. | Record warning, require explicit issue comment before proceeding. |
| `LOW` | Informational readiness gap. | Track before scheduler/readiness sign-off. |

## Alert conditions

| Condition | Severity | Owner placeholder | Channel placeholder | Required response |
|---|---:|---|---|---|
| Source health `FAIL` | `HIGH` | Direct-refresh operator | `#direct-refresh-alerts` | Do not run controlled operation for that source. Open/fix readiness issue. |
| Source health `WARN` | `MEDIUM` | Direct-refresh operator | Issue comment + `#direct-refresh-alerts` | Require explicit operator acknowledgement before manual operation. Scheduler remains blocked. |
| Freshness baseline `FAIL` | `HIGH` | Direct-refresh operator | `#direct-refresh-alerts` | Stop cadence discussion. Diagnose denominator/freshness regression. |
| Freshness baseline `WARN` | `MEDIUM` | Direct-refresh operator | Issue comment | Record baseline warning and continue only if operation-specific gates passed. |
| Manifest or prewrite `FAIL` | `HIGH` | Direct-refresh operator | Issue comment | Do not write. Diagnose blockers or scan size separately. |
| Prewrite stale | `HIGH` | Direct-refresh operator | Issue comment | Stop before transaction, verify no partial write/no write report, regenerate evidence. |
| Confirmation hash/list mismatch | `HIGH` | Direct-refresh operator | Issue comment | Stop before transaction, preserve evidence, request fresh confirmation only after regeneration. |
| Active writer timeout | `CRITICAL` | Direct-refresh operator + maintainer | `#direct-refresh-alerts` | Stop, verify rollback/no-partial state, file bugfix issue if root cause is code/tooling. |
| Prisma pool exhaustion | `HIGH` | Direct-refresh operator + maintainer | `#direct-refresh-alerts` | Stop. If in read-only gate, fix concurrency/read model before retrying evidence. |
| Prisma transaction not found | `CRITICAL` | Direct-refresh operator + maintainer | `#direct-refresh-alerts` | Stop, verify no partial write, require bugfix/review before retry. |
| Postwrite audit `FAIL` | `CRITICAL` | Direct-refresh operator + maintainer | `#direct-refresh-alerts` | Stop, preserve artifacts, verify rollback plan, open bugfix issue. |
| No-create invariant violation | `CRITICAL` | Maintainer | `#direct-refresh-alerts` | Stop all direct-refresh writes until bugfix and fresh review. |
| No-partial verification `FAIL` | `CRITICAL` | Maintainer | `#direct-refresh-alerts` | Do not regenerate prewrite or retry. Escalate to incident fix. |
| Missing postwrite or baseline artifact | `HIGH` | Direct-refresh operator | Issue comment | Operation is incomplete; do not close issue or start another write. |

## Retry and backoff rules

Retries are not automatic. A retry is a new controlled attempt inside the same approved operation issue only when the incident class allows it.

| Incident class | Retry allowed? | Cooldown | Max attempts | Required before retry |
|---|---:|---|---:|---|
| Manifest/prewrite `FAIL` from data blockers | Yes | None, after diagnosis | 2 evidence regenerations | Adjust scan/source-specific input, regenerate manifest and prewrite PASS. |
| Stale prewrite | Yes | None, but evidence must be fresh | 3 stale retries | No-partial verification PASS, fresh manifest/prewrite, new exact confirmation. |
| Confirmation mismatch | Yes | None | 2 confirmation retries | Regenerate or re-issue exact confirmation text; no writer execution until match. |
| Read-only pool exhaustion | Yes | After code/config fix or lower scan | 1 retry before bugfix issue | Fresh read-only evidence after fix; do not write from partial evidence. |
| Active writer timeout | Conditional | Minimum 15 minutes after verification | 1 retry after review | No-partial verification PASS and bugfix/review if timeout root cause is code/tooling. |
| Transaction not found | Conditional | After bugfix merge only | 0 before bugfix | Bugfix issue/PR, fresh review, new prewrite and confirmation. |
| Postwrite `FAIL` | No immediate retry | N/A | 0 | Bugfix issue and rollback/repair decision first. |
| No-create invariant violation | No | N/A | 0 | Stop all related writes until bugfix and fresh review. |
| No-partial verification `FAIL` | No | N/A | 0 | Incident handling only; do not retry. |
| Baseline `WARN` after successful write | Not a write retry trigger | N/A | N/A | Record warning and include in summary/reporting. |
| Baseline `FAIL` after successful write | No new writes | Until diagnosed | 0 | Diagnose freshness/denominator regression before any further operation. |

## Hard stop conditions

Stop the operation and do not request confirmation when any of these is true:

- approved issue is missing or has the wrong scope;
- source health is `FAIL`;
- manifest or prewrite is not `PASS`;
- prewrite evidence is older than the active writer freshness window;
- confirmation hash, row IDs, EANs, SKUs, or output path do not match;
- source/count/token does not match the writer command;
- a failed/stopped attempt lacks no-partial verification PASS;
- postwrite audit is missing or `FAIL`;
- kill switch support is later implemented and returns stop for the source or globally.

## No-partial verification requirement

Every failed or stopped write attempt must produce a read-only verification artifact before retry. The artifact must include:

- failed command and error;
- whether a write report exists;
- expected source/count/output path;
- `Product`, `SupermarketProduct`, and `PriceHistory` evidence relevant to the rollback snapshot;
- conclusion `PASS` or `FAIL`;
- next required action.

If the conclusion is not `PASS`, the next action is incident handling, not retry.

## Source-specific notes

| Source | Policy note |
|---|---|
| Carrefour | Standard writer-supported policy applies. |
| Vea | Standard writer-supported policy applies. |
| Disco | Standard writer-supported policy applies. |
| Jumbo | Standard writer-supported policy applies. |
| MAS | Large batches require rapid-confirmation window or a separately approved process adjustment because prewrite evidence can age past the 15-minute freshness limit. |
| DIA | Audit-only/no-writer. Alerts may track health, but no active direct-refresh writer is approved. |

## Evidence comment template

Use this shape in the operation issue when an alert fires:

```md
## Direct-refresh alert

- Source:
- Severity:
- Condition:
- Artifact path(s):
- Owner:
- Channel used:
- Stopped before write? yes/no
- No-partial verification path, if applicable:
- Retry allowed by policy? yes/no
- Next action:
```

## Scheduler guardrail

This policy is necessary but not sufficient for scheduler readiness. Scheduler discussion remains blocked until alert implementation, kill switch, reporting, run ownership, runbook drill, DIA decision, orchestrator design, and final scheduler gate are complete and reviewed.
