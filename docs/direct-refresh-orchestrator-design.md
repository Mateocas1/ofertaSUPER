# Semi-automatic direct-refresh orchestrator design

This document designs a future semi-automatic direct-refresh orchestrator. The orchestrator may sequence read-only gates and prepare a single source/count operation, but it must not execute production writes without fresh human confirmation.

This design does not authorize implementation, production writes, scheduler, cron, all-source operation, repeated batches, DIA writes, cache purge, deploys, secrets changes, remote config, or notification delivery.

## Decision

The future orchestrator must be an assisted operator workflow, not an autonomous scheduler.

| Dimension | Decision |
|---|---|
| Unit of work | Exactly one writer-supported source and one allowlisted count. |
| Source set | Carrefour, Vea, Disco, Jumbo, and MAS only. DIA is excluded and remains audit-only/no-writer. |
| Write authority | Human approver only; exact confirmation is still mandatory. |
| Execution style | Stepwise command sequencing with persisted artifacts. |
| Scheduler status | Blocked; scheduler needs a later final gate and separate approved issue. |
| Retry behavior | No automatic retry after any stopped or failed attempt. |

## Non-goals

The orchestrator must not:

- run on a timer, cron, queue, or background scheduler;
- choose sources automatically;
- run all writer-supported sources in one command;
- run repeated batches or cadence experiments;
- execute active writes without exact human confirmation;
- bypass source health, alerts, kill switch, manifest, prewrite, postwrite, or baseline evidence;
- treat DIA as writer-supported;
- deliver notifications or mutate remote config/secrets;
- deploy, purge cache, or change public freshness copy.

## Inputs

A future orchestrator invocation requires:

| Input | Required rule |
|---|---|
| Approved issue | Must exist and match the source/count scope with exactly one `type:*` label. |
| Source | Must be a writer-supported source: `carrefour`, `vea`, `disco`, `jumbo`, or `mas`. |
| Count | Must be allowlisted by the active writer contract, currently `10`, `25`, or `50`. |
| Output directory | Must be source/count/attempt-specific and preserve all artifacts. |
| Kill switch control | Required when the current operations policy says kill switch is active. |
| Operator identity | Required for evidence comments and handoffs. |
| Approver identity | Required before writer execution. |

## Phase flow

| Phase | Action | Artifact | Stop condition |
|---:|---|---|---|
| 1 | Validate issue scope and source/count eligibility. | Issue URL/metadata in run summary. | Missing approval, wrong label, unsupported source/count, DIA selected. |
| 2 | Run source health. | `source-health.json` or linked report. | FAIL or hard stop unless a separate approved override is allowed by policy. |
| 3 | Evaluate alerts. | `alerts-report.json` or linked report. | Any hard-stop alert. |
| 4 | Evaluate kill switch. | `kill-switch-report.json`. | Global or source stop active, invalid control, expired control. |
| 5 | Generate manifest. | `manifest.json`. | Manifest not PASS. |
| 6 | Generate prewrite gate. | `prewrite-gate.json`. | Prewrite not PASS, stale, count mismatch, hash/list problem. |
| 7 | Present confirmation packet. | Human-readable packet with hash, row IDs, EANs, SKUs, source, count, and output path. | Approver absent or confirmation mismatch. |
| 8 | Optional writer execution. | `write-report.json`. | Only after exact confirmation; any writer failure stops the flow. |
| 9 | Run postwrite audit. | `postwrite-audit.json`. | Any failed row or invariant mismatch. |
| 10 | Run freshness baseline. | `freshness-baseline.json`. | Missing baseline evidence. |
| 11 | Produce operations summary. | `operations-report.json` and issue comment. | Missing required artifact or unresolved incident. |

Phases 1 through 7 are read-only. Phase 8 is the only active-write phase and remains human-gated. Phases 9 through 11 are read-only verification/reporting after a successful write.

## Confirmation boundary

The orchestrator may prepare a confirmation packet, but it must pause before the writer phase. The packet must include:

- approved issue URL;
- source and count;
- prewrite report path;
- confirmation hash;
- row IDs;
- EANs;
- SKUs;
- output directory;
- prewrite age and expiry deadline;
- kill switch status;
- any source-specific note, including MAS rapid-confirmation timing.

The writer command must reject missing, partial, stale, or mismatched confirmation exactly as the current active writer does.

## Stop and retry behavior

| Event | Required behavior |
|---|---|
| Source health FAIL | Stop. Do not generate prewrite for an active operation unless a separate approved override policy applies. |
| Alert hard stop | Stop. Preserve report and escalate. |
| Kill switch active or invalid | Stop. Do not continue to manifest/prewrite for an active operation. |
| Manifest/prewrite FAIL | Stop. Preserve artifacts. Do not ask for confirmation. |
| Stale prewrite | Stop. Verify no write report/no partial state if writer was attempted. Regenerate evidence before any retry. |
| Confirmation mismatch | Stop. Verify no write report/no partial state if writer was attempted. Require new confirmation after fresh evidence. |
| Writer failure | Stop. Run no-partial verification before any retry. Open bugfix issue when tooling or invariant failure is suspected. |
| Postwrite FAIL | Stop. Preserve artifacts. Escalate before retry or repair. |
| Baseline WARN | Record in evidence and operations report; do not hide it. |

No event may trigger automatic retry. Every retry requires fresh evidence and a new exact confirmation.

## Output summary

Every orchestrator run should produce a compact summary with:

- issue URL;
- source/count/attempt;
- phase statuses;
- artifact paths;
- stop condition, if any;
- whether a write was executed;
- postwrite and baseline conclusions, if applicable;
- next required action.

## Implementation guardrails for a future issue

A future implementation issue must preserve these constraints:

1. Default mode is dry-run/read-only through the confirmation packet.
2. Active writer execution requires an explicit flag plus exact human confirmation.
3. The orchestrator must call existing gate modules rather than reimplementing validation rules loosely.
4. DIA must be rejected as an active writer source.
5. The orchestrator must fail closed on missing, malformed, stale, or non-PASS artifacts.
6. It must never run multiple sources or repeated batches in one invocation.
7. It must never schedule itself.
8. Tests must cover blocked sources, stale prewrite, kill switch stop, alert stop, confirmation mismatch, and no automatic retry.

## Readiness impact

This design satisfies the semi-automatic orchestrator design slice only. Scheduler, cron, all-source operation, repeated batches, and automatic writes remain blocked until the final scheduler gate is documented, reviewed, and separately approved.
