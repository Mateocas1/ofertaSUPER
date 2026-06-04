# Direct-refresh readiness implementation checklist

This checklist turns the operational readiness runbook into reviewable work slices. It is the bridge between completed `count=50` controlled pilots and any future semi-automatic orchestration or scheduler discussion.

This document does not authorize production writes, scheduler, all-source operation, repeated batches, DIA writes, cache purge, deploys, or secrets changes.

## Starting point

| Input | Status |
|---|---|
| `count=50` writer-supported pilots | Complete: 5/5 write PASS and 5/5 postwrite PASS. |
| Operational posture | Controlled manual source-specific operations only. |
| Runbook | `docs/direct-refresh-operational-readiness-runbook.md` |
| Final pilot summary | `docs/direct-refresh-count50-complete-summary.md` |
| Scheduler | Blocked. |

## Readiness slices

| Order | Slice | Type | Purpose | Done when |
|---:|---|---|---|---|
| 1 | Source health checks | Implementation | Verify each source before any planned run. | Per-source PASS/WARN/FAIL health report exists and writers require PASS or explicit approved override. |
| 2 | Alerting plan | Docs then implementation | Define actionable alerts before automation. | Failure, stale baseline, postwrite FAIL, timeout, and pool exhaustion alerts have owners and channels. |
| 3 | Retry/backoff policy | Docs | Prevent uncontrolled retries. | Retry limits, cooldowns, no-partial verification, and escalation paths are documented per incident class. |
| 4 | Kill switch | Implementation | Stop source/global operation quickly. | Per-source and global stop controls exist and are checked before active writes/orchestration. |
| 5 | Reporting | Implementation | Make freshness and incidents visible. | A repeatable report summarizes freshness, runs, incidents, and blocked sources. |
| 6 | Run ownership | Docs | Assign responsibility. | Operator/on-call ownership and handoff expectations are documented. |
| 7 | Runbook drill | Manual/read-only | Prove incident response. | At least one no-partial verification drill is recorded without production writes. |
| 8 | DIA decision | Docs or implementation | Avoid ambiguous coverage claims. | DIA is formally excluded or has a separate hardening plan. |
| 9 | Semi-automatic orchestrator design | Docs | Design human-approved sequencing. | Design is approved with no scheduler and no automatic writes. |
| 10 | Scheduler gate | Docs | Decide whether scheduler can be built. | All required readiness slices are complete and reviewed. |

## Dependency rules

- Source health checks must precede any orchestrator or scheduler work.
- Alerting, retry/backoff, kill switch, and reporting must exist before scheduler implementation.
- Run ownership must exist before any repeated cadence experiment.
- DIA must be formally excluded or separately hardened before claiming whole-system coverage.
- Semi-automatic orchestration may be planned before all implementation slices are complete, but it must not execute production writes automatically.
- Scheduler work cannot start from this checklist alone; it needs a separate approved issue after readiness evidence is complete.

## Non-goals for the readiness phase

- No active refresh writes.
- No all-source operation.
- No repeated batches or cadence experiments.
- No scheduler, cron, or workflow automation.
- No DIA writer implementation unless separately approved.
- No cache purge, deploy, or secrets changes.
- No changes to public freshness copy unless separately scoped.

## Recommended issue sequence

| Next issue | Suggested title | Scope |
|---|---|---|
| 1 | `feat(data): add direct-refresh source health checks` | Implement read-only per-source health report and tests. |
| 2 | `docs(data): define direct-refresh retry and alert policy` | Document alert conditions, owners, and retry/backoff rules. |
| 3 | `feat(data): implement direct-refresh alerts` | Implement alert checks/channels for approved conditions. |
| 4 | `feat(data): add direct-refresh kill switch` | Implement per-source/global stop checks. |
| 5 | `feat(data): add direct-refresh operations report` | Generate freshness/run/incident summary. |
| 6 | `docs(data): record direct-refresh run ownership and drill` | Record owner expectations and a no-partial verification drill. |
| 7 | `docs(data): decide DIA direct-refresh posture` | Exclude DIA formally or plan hardening. |

## Scheduler resume criteria

Scheduler discussion may resume only when all of these are true:

- source health checks exist and are used;
- alerting policy and implementation exist;
- retry/backoff policy is approved;
- kill switch exists;
- operations report exists;
- run ownership is documented;
- no-partial verification drill is recorded;
- DIA is excluded or hardened by separate decision;
- a fresh review confirms readiness evidence is complete.

Until then, direct-refresh remains controlled manual source-specific operation only.
