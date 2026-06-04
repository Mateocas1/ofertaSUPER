# Direct-refresh final scheduler gate

This document is the final readiness gate before any scheduler proposal. It reviews the completed direct-refresh readiness evidence and defines what a future scheduler issue must prove.

This gate does not authorize scheduler implementation, scheduler execution, cron, workflow automation, automatic writes, all-source operation, repeated batches, DIA writes, cache purge, deploys, secrets changes, remote config, or notification delivery.

## Gate decision

Readiness evidence is sufficient to propose a separate, reviewable scheduler implementation issue, but it is not sufficient to run or deploy a scheduler.

Issue #136 implements only a disabled-by-default read-only scheduler planner/audit. It emits a source/count plan and guardrail report; it does not run a scheduler or invoke active writers. Issue #138 lets the operations report consume that supplied planner JSON as consolidated read-only evidence; it does not execute the planner or change scheduler/write authorization.

Any future scheduler issue must be approved separately and must implement a conservative scheduler that is disabled by default, source-specific, count-scoped, fail-closed, and human-reviewable. The first implementation must not execute production writes automatically.

## Evidence inventory

| Requirement | Status | Evidence |
|---|---|---|
| Writer-supported `count=50` pilots | Complete | `docs/direct-refresh-count50-complete-summary.md` |
| Operational runbook | Complete | `docs/direct-refresh-operational-readiness-runbook.md` |
| Readiness checklist | Complete through final gate | `docs/direct-refresh-readiness-checklist.md` |
| Source health checks | Complete | `scripts/pipeline/direct-refresh-source-health.ts`, `scripts/audit-direct-refresh-source-health.ts`, `tests/direct-refresh-source-health.test.ts` |
| Retry/alert policy | Complete | `docs/direct-refresh-retry-alert-policy.md` |
| Alert checks | Complete | `scripts/pipeline/direct-refresh-alerts.ts`, `scripts/audit-direct-refresh-alerts.ts`, `tests/direct-refresh-alerts.test.ts` |
| Kill switch | Complete | `scripts/pipeline/direct-refresh-kill-switch.ts`, `scripts/audit-direct-refresh-kill-switch.ts`, `tests/direct-refresh-kill-switch.test.ts` |
| Operations report | Complete | `scripts/pipeline/direct-refresh-operations-report.ts`, `scripts/audit-direct-refresh-operations-report.ts`, `tests/direct-refresh-operations-report.test.ts`; accepts optional supplied scheduler planner evidence. |
| Run ownership and drill | Complete | `docs/direct-refresh-run-ownership-drill.md` |
| DIA posture | Complete | `docs/direct-refresh-dia-posture.md` |
| Semi-automatic orchestrator design | Complete | `docs/direct-refresh-orchestrator-design.md` |
| Disabled scheduler planner/audit | Complete | `scripts/pipeline/direct-refresh-scheduler-planner.ts`, `scripts/audit-direct-refresh-scheduler-planner.ts`, `tests/direct-refresh-scheduler-planner.test.ts` |

## What may happen next

The current planner/audit may be used only to produce read-only guidance for one approved source/count work unit. A future issue may propose scheduler implementation only if it preserves these constraints:

1. scheduler is disabled by default;
2. scheduler cannot execute active writes in its first implementation;
3. scheduler can only evaluate one writer-supported source/count work unit at a time;
4. DIA is excluded from writer-supported scheduling;
5. scheduler must call the existing source health, alert, kill switch, manifest, prewrite, postwrite, baseline, and operations-report paths rather than duplicating relaxed logic;
6. scheduler must fail closed on missing, malformed, stale, WARN/FAIL where hard-stop policy applies, or non-PASS evidence;
7. scheduler must produce auditable artifacts and issue/report output for every attempted phase;
8. scheduler must not retry automatically after stopped or failed attempts;
9. production write execution must remain behind a separate explicit human confirmation mechanism unless a later approved design changes that boundary;
10. deploy, secrets, remote config, cache purge, public copy changes, and notification delivery remain separate scopes.

## Minimum future scheduler issue acceptance criteria

A future scheduler implementation issue must include acceptance criteria for:

- disabled-by-default configuration;
- source/count allowlist;
- DIA rejection;
- no active write execution by default;
- no all-source or repeated-batch mode;
- kill switch hard stop;
- alert hard stop;
- stale prewrite hard stop;
- no automatic retry;
- artifact preservation;
- operations report integration;
- tests for every hard stop and forbidden mode;
- fresh review before merge.

## Explicitly still blocked

The following remain blocked by this gate document:

- deploying or enabling a scheduler;
- running scheduled direct-refresh jobs;
- automatic production writes;
- all-source operation;
- repeated batches or cadence experiments;
- DIA writer support;
- notification delivery;
- remote config or secrets changes;
- cache purge or deploy operations;
- public freshness copy changes.

## Decision summary

The readiness program is complete enough to open a separate scheduler implementation proposal. It is not authorization to implement outside a new issue, and it is not authorization to run a scheduler. Direct-refresh remains controlled manual source-specific operation until a future scheduler PR is separately scoped, reviewed, merged, configured, and explicitly enabled by humans.
