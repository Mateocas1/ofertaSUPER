# Direct-refresh operational readiness runbook

Direct-refresh is currently approved for controlled, manual, source-specific operations only. The `count=50` pilots proved writer contracts for Carrefour, Vea, Disco, Jumbo, and MAS, but they did not prove scheduler readiness or sustained operational freshness.

This runbook defines the next production posture before any semi-automatic orchestration, scheduler, all-source run, or repeated-batch cadence.

## Current posture

| Area | Status |
|---|---|
| Source-specific manual writes | Allowed only with approved issue, fresh prewrite PASS, exact confirmation, postwrite PASS, and baseline. |
| `count=50` controlled pilot coverage | Complete for all writer-supported sources. |
| Scheduler / cron | Gate complete; read-only scheduler planner/audit and dry-run orchestrator report are available; operations report can include supplied planner evidence. Running or deploying a scheduler remains blocked. Gate: `docs/direct-refresh-scheduler-gate.md`. Planner: `audit:direct-refresh-scheduler-planner`. Dry-run orchestrator: `audit:direct-refresh-dry-run-orchestrator`. |
| Semi-automatic orchestrator | Design-only; no implementation authorized. Design: `docs/direct-refresh-orchestrator-design.md`. |
| All-source writes | Blocked. |
| Repeated batches / cadence | Blocked until explicitly planned and approved. |
| DIA writer support | Formally excluded from writer-supported direct-refresh; DIA remains audit-only/no-writer. Decision: `docs/direct-refresh-dia-posture.md`. |
| Latest evidence summary | `docs/direct-refresh-count50-complete-summary.md` |

## Non-negotiable operating rules

1. Every production write needs a dedicated approved issue.
2. The issue must have exactly one `type:*` label.
3. The operation must be one source and one batch unless a separate approved plan says otherwise.
4. Prewrite evidence must be fresh and PASS.
5. Human confirmation must exactly include hash, row IDs, EANs, SKUs, and output path.
6. The active writer runs once.
7. Postwrite audit is mandatory.
8. Freshness baseline is mandatory.
9. Any failed or stopped attempt requires no-partial-write verification before retry.
10. Scheduler planner/audit output, operations-report planner evidence, and dry-run orchestrator output are read-only guidance only; scheduler execution, manifest/prewrite generation, active writes, all-source operation, and repeated batches remain blocked until separately scoped, approved, reviewed, merged/configured, and explicitly enabled by humans where applicable.

## Controlled-write workflow

| Step | Evidence | Stop condition |
|---|---|---|
| Create approved issue | GitHub issue with scope, source, count, out-of-scope list | Missing issue or wrong scope |
| Generate manifest | `audit/<source>-controlled-count<N>/manifest.json` | Manifest not PASS |
| Generate prewrite | `prewrite-gate.json` | Prewrite not PASS, stale, or mismatched count |
| Request confirmation | Exact hash, row IDs, EANs, SKUs, output path | Confirmation mismatch |
| Execute writer | `write-report.json` | Writer FAIL, timeout, no-create violation |
| Run postwrite | `postwrite-audit.json` | Any failed row or PriceHistory mismatch |
| Run baseline | `freshness-baseline.json` | Missing baseline evidence |
| Close issue | Evidence comment | Incomplete evidence |

## Incident taxonomy

| Incident | Required response |
|---|---|
| Prewrite FAIL | Stop. Do not write. Diagnose blockers or scan size separately. |
| Stale prewrite | Stop. Verify no write report/no partial state, regenerate evidence, request new confirmation. |
| Hash/list confirmation mismatch | Stop. Verify no write report/no partial state, regenerate evidence if retrying. |
| Transaction timeout | Stop. Verify rollback/no-partial state. File bugfix issue if needed before retry. |
| Postwrite FAIL | Stop. Preserve artifacts. Verify rollback plan and open bugfix issue. |
| No-create invariant violation | Critical stop. Do not retry until bugfix/review. |
| Pool exhaustion in read-only gate | Stop. Fix gate concurrency/read model before retrying evidence. |

## No-partial-write verification

After any stopped attempt, record a read-only verification artifact before retrying. Minimum fields:

- failed command/error;
- expected write report path and whether it exists;
- `Product` count;
- `SupermarketProduct` count;
- current `PriceHistory` max id;
- expected max id from the prewrite rollback snapshot;
- conclusion: PASS/FAIL;
- next required action.

If verification is not PASS, do not regenerate prewrite or request confirmation.

## MAS-specific protocol

MAS `count=50` proved the source can pass, but it exposed a timing constraint:

- `candidate-scan-size=160`;
- prewrite skipped `52` rows;
- scan/prewrite generation takes several minutes;
- active writer rejects evidence older than 15 minutes;
- retry4 succeeded only with a rapid-confirmation window.

Future MAS large batches require one of:

1. rapid-confirmation window: operator and approver stay active while evidence is generated;
2. separate approved process-adjustment issue before changing timing or confirmation behavior.

Do not run MAS large batches with the ordinary slow confirmation loop.

## Scheduler prerequisites

Scheduler remains blocked until all prerequisites are documented and implemented:

| Prerequisite | Required before scheduler |
|---|---|
| Source health checks | Per-source health/readiness before each run. |
| Alerts | Actionable alerts for write failure, postwrite failure, stale baseline, pool exhaustion, and timeout. |
| Retry/backoff policy | Explicit retry limits, cooldowns, and escalation path. |
| Kill switch | Per-source and global stop mechanism. |
| Run ownership | Named operator/on-call responsibility. |
| Reporting | Daily/periodic freshness and incident report. |
| Runbook drills | At least one documented failure drill/no-partial verification. |
| DIA decision | Formal exclusion or separate hardening plan. |

## Next approved gates

Recommended order:

1. Operational readiness checklist issue: convert this runbook into concrete implementation tasks. Complete: `docs/direct-refresh-readiness-checklist.md`.
2. Semi-automatic orchestrator design: human-approved sequencing, no scheduler. Complete: `docs/direct-refresh-orchestrator-design.md`.
3. Final scheduler gate: decide whether readiness evidence is complete enough to approve a separate scheduler implementation issue. Complete: `docs/direct-refresh-scheduler-gate.md`.

Until a future scheduler issue and PR are separately approved, merged, configured, and explicitly enabled by humans, direct-refresh stays in controlled manual operation mode.
