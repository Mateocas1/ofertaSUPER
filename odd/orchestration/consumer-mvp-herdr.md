# Consumer MVP — ODD / Gentle Shell orchestration contract

This is the current project application of **Organic Driven Development (ODD)**. It uses the existing [feature ledger](../tasks/consumer-mvp-reset.md) and installed tools. It does not introduce another workflow engine. The parent coordinates bounded work, verification and integration toward the consumer outcome.

## Authority and sources

Read the ledger's current authority block first. That file owns objective, constraints, stable task IDs, acceptance, status, evidence and one next step. The [roadmap](../../docs/consumer-mvp-roadmap.md) owns product direction and coverage definitions; the [audit](../../docs/reports/engineering-audit/2026-09-21-consumer-mvp-audit.md) owns historical findings. GitHub issues, temporary todos and agent messages are projections, not competing task ledgers.

Official Gentleman Programming sources inspected at commit `b6188befaa4628a697a5020ea4e3c0ee087bb900`:

- [ODD technical reference](https://github.com/Gentleman-Programming/gentle-shell/blob/b6188befaa4628a697a5020ea4e3c0ee087bb900/docs/readme-reference.md#organic-driven-development).
- [Runtime orchestrator](https://github.com/Gentleman-Programming/gentle-shell/blob/b6188befaa4628a697a5020ea4e3c0ee087bb900/assets/orchestrator.md).
- [Delegation and ODD routing](https://github.com/Gentleman-Programming/gentle-shell/blob/b6188befaa4628a697a5020ea4e3c0ee087bb900/assets/orchestrator-delegation.md#organic-driven-development-odd).
- [Feature continuity and memory](https://github.com/Gentleman-Programming/gentle-shell/blob/b6188befaa4628a697a5020ea4e3c0ee087bb900/assets/orchestrator-memory.md#organic-feature-continuity).
- [Bounded worker contract](https://github.com/Gentleman-Programming/gentle-shell/blob/b6188befaa4628a697a5020ea4e3c0ee087bb900/assets/agents/gentle-ai-worker.md).
- [Delegated verification](https://github.com/Gentleman-Programming/gentle-shell/blob/b6188befaa4628a697a5020ea4e3c0ee087bb900/docs/delegated-verification.md).

The current technical reference and runtime assets guide this adaptation. At this upstream revision, the older static `skills/gentle-ai/SKILL.md` has routing/TDD wording that differs from them. Do not import automatic large-task-to-SDD or tests-present-to-TDD rules. Use the effective installed runtime contract; SDD is a separate explicit user choice. This document does not install or update Gentle Shell.

## Parent, workers and verification

Mateo selected **GPT 5.6 Sol** as parent orchestrator. This is a user preference, not a prescribed provider model ID. Generic child model and thinking settings inherit the installed runtime configuration. Do not modify model settings as part of this plan.

| Role | Responsibility | Boundary |
|---|---|---|
| Parent | Read intent and evidence, select eligible work, delegate, maintain the ledger, evaluate results and integrate. | Own actual user decisions and terminal Git actions within granted scope; do not infer success from agent state. |
| Explorer | Answer a bounded question with paths, facts and uncertainty. | Read-only; do not expand the implementation or build a second plan. |
| Worker | Implement one task or justified bounded part, run its agreed checks and return evidence. | Only allowed edit surfaces; no recursive delegation, terminal Git action, scope expansion or unrelated state changes. |
| Independent verifier | Inspect the candidate and test the task's observable acceptance. | Do not write the candidate or replace missing evidence with an approval. |

Use installed generic roles such as `gentle-ai-explore`, `gentle-ai-worker` and `gentle-ai-verify` when available. These are roles, not a requirement to create custom CMVP agents. Use the actual runtime's review/RDD contract when present; never fabricate review IDs, read receipts or a GitHub review from an internal result.

## Authorization and useful concurrency

Authorization persists for the scope the user granted. Preparing a reviewable result, routine reversible checks and already-authorized delivery steps do not each create another confirmation request. The parent asks only when a material action falls outside that scope or a real user decision remains. Pause that dependency and continue independent work. Never answer a genuine human approval prompt on the user's behalf.

The current request covers documentation, branch/commit/push/PR and a tracking issue. It does not execute application fixes, source acquisition, migrations, deployment or pilot outreach. A later implementation request can authorize routine CMVP-04 work without reopening historical per-command permissions. Determine the actual scope, target and risk of external writes before executing them.

Use concurrency only where it resolves independent questions or disjoint changes. T02 dependency remediation and T03 observation correctness become eligible after T01. T05 interface work and T06 basket work can proceed after T04 if the parent assigns ownership of shared policies/types and prevents overlap. T07 needs both outcomes. Do not add scouts to fill capacity.

One writer per worktree; no overlapping active edit paths, lockfiles, migration domains or generated outputs. The parent records the baseline and preserves unrelated or ambiguous work. Worktrees are an isolation tool when needed, not a mandatory new worktree for each read-only question. Child workers do not create/remove worktrees or perform commit/push/merge. The parent handles those actions under actual authorization; no automatic merge is implied by this plan.

## Delegation packet

Before dispatch, the parent resolves starting surfaces in the ledger into exact allowed paths, effective configuration and runnable verification commands. Do not send placeholders to a worker. Keep one concrete next action; expand the task only when evidence requires it.

Example packet structure (replace every placeholder before use):

```text
Task: CMVP-04-Txx
Objective: <one observable outcome>
Feature document: odd/tasks/consumer-mvp-reset.md
Baseline: <branch, commit, worktree and relevant local changes>
Dependencies: <accepted prerequisite proof>
Relevant context: <paths, evidence, known environment failures>
Effective TDD: <on/off, config source, scope and exact runner>
Acceptance: <task criteria and relevant audit IDs>
Do not: recurse, expand scope, edit unrelated state, commit, push or merge.
Return: changed files, behavior, commands/results, remaining blockers,
reviewable candidate identity and suggested next action.

## Skills to load before work
<actual applicable installed skill paths, or none>

## Verification
<exact focused RED/GREEN command when TDD applies>
<exact applicable static/full-suite/browser commands, in execution order>

## Known environmental failures
<observed failures and evidence, or none observed>

## Allowed edit surfaces
<repository-relative path or narrow glob>
<repository-relative path or narrow glob>
```

Preserve all four exact headings shown above; the upstream worker consumes them. The body of `## Allowed edit surfaces` contains only one repository-relative path or narrow glob per line; put explanations elsewhere. Parent retains ledger ownership unless an explicit non-overlapping assignment includes that file. Workers return proposed status updates for parent integration.

## Verification and review size

The existing `openspec/config.yaml` explicitly sets `strict_tdd: true`; prior CMVP execution also records the user's choice. Keep behavior-first RED → GREEN for behavior changes. Resolve the effective setting from explicit user intent and configuration on resume; the mere presence of tests is not a TDD trigger. Documentation-only work needs structural/content/link review and diff checks.

Each worker packet identifies the exact runtime and runner, its execution order and pre-existing failures. T01 repairs discovery of the complete test set. A small passing subset, generic `done`, skipped critical scenario or stale result cannot close a task. Independent verification checks behavior and adverse cases rather than mirroring implementation details. A verifier reports unavailable checks as pending, with their cause.

Forecast the configured 400-authored-line review budget before assigning changes. Prefer cohesive units with source, relevant tests and necessary documentation. If a unit exceeds the budget, explain a justified exception or split by observable outcome; do not create approval-only slices. A passive documentation PR may keep the historical audit, current task mapping and entrypoint corrections together with an explicit size rationale.

After a coherent implementation work unit passes its applicable checks and review, the parent creates its authorized work-unit commit and records SHA, task ID and PR boundary in the existing task evidence. Do not accumulate T01–T08 into an unreviewable final diff. Updating a todo or recording evidence alone does not trigger another review cycle.

## Continuity and blockers

After each meaningful transition, update the local feature file first: task status, exact evidence, blockers and one next step. If Engram is available, mirror the **complete feature document** to topic `odd/consumer-mvp-reset/tasks`, then read back both the local file and mirror. Reconcile conflicts using explicit intent and observed evidence, never timestamp precedence alone. If versions cannot be reconciled, preserve both and pause only the affected decision. If Engram is unavailable, mark the mirror pending and continue independent work. This documentation session did not synchronize Mateo's Engram.

Record genuine durable impediments in the [blocker registry](../blockers/consumer-mvp-blockers.md), reusing an existing ID where applicable. An unknown prerequisite pauses dependent work. Missing credentials for one operational task do not block unrelated local work. Retain historical evidence without treating old temporary restrictions as fresh commands.

On resume: read the current ledger, inspect actual Git/worktree state, reconcile memory if available, validate changed dependencies, then assign the next eligible bounded task. Close CMVP-04 only through G04 and its candidate-specific receipt. Intermediate PRs reference the tracking issue; they do not close the complete product outcome.

## Herdr compatibility and historical evidence

Herdr is optional coordination tooling. Inspect its installed version/help before using it. `idle`/`done` indicate agent state, not accepted product results; `blocked`, `unknown`, timeout and missing output require inspection. Do not automate answers to human prompts.

The existing [helper](../../scripts/orchestration/consumer-mvp-herdr.sh) was created for the CMVP-02 inventory/plan surface. Its supported commands must come from its actual help; it does not implement a new CMVP-04 executor, `/odd` command, scheduler or readiness engine. Do not invent a `plan CMVP-04` command.

CMVP-02 reconciliation and CMVP-03 acquisition are historically complete at the audited integrated base. Their dated receipts remain in the ledger and [delivery-line record](../../docs/consumer-mvp-delivery-line-reconciliation.md). The active next unit is **CMVP-04-T01**, not the former CMVP-03-T3 bootstrap.
