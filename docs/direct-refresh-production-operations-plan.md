# Direct-refresh production operations plan v2

This plan defines the production path for direct-refresh real freshness in `ofertasSUPER` after the source-specific `count=50` rollout. The goal is not an MVP or throwaway scheduler. The goal is a scalable, auditable production cadence that can sustain freshness without relaxing safety controls.

This document does not authorize scheduler execution, automatic writes, all-source operation, repeated batches, DIA writes, manifest/prewrite generation, production writes, notifications, deploys, secrets changes, remote config changes, or cache purge.

## Executive decision

Direct-refresh has proved source-specific write contracts, but it has not proved sustained freshness.

The next production step is a read-only, evidence-only **freshness debt and cadence planner**. It must model how much work is needed to recover freshness before any cadence runner, scheduler, or repeated write path is implemented.

Confirmed strategy for the next phase:

| Area | Decision |
| --- | --- |
| Freshness roadmap | Recovery target: `80%` of writer-supported public-rankable rows within `24h`; final target: `95%` within `12h`. |
| Coverage target | Writer-supported sources first: Carrefour, Vea, Disco, Jumbo, MAS. |
| DIA posture | DIA remains `audit-only-no-writer`; it must not block writer-supported freshness recovery claims. |
| Freshness WARN | Freshness debt does not authorize writes, but it may trigger recovery planning when safety is PASS. |
| Capacity WARN | Capacity WARN may reduce batch size, require larger evidence, or require manual review; capacity FAIL blocks. |
| First planner | Evidence-only/read-only. It uses DB/audit artifacts only; no VTEX read scans, no manifest/prewrite, no writes, no scheduler execution. |

## Current verified state

| Evidence | Status | Notes |
| --- | --- | --- |
| Controlled `count=50` writer pilots | Complete | 5/5 writer-supported sources completed write PASS and postwrite PASS. See `docs/direct-refresh-count50-complete-summary.md`. |
| Minimal dry-run evidence chain | Complete | Planner -> operations report -> dry-run orchestrator PASS for Vea, MAS, Carrefour, Disco, Jumbo. See `docs/direct-refresh-dry-run-count50-coverage.md`. |
| Gated dry-run fail-closed behavior | Proved | Vea source-health WARN produced operations WARN and dry-run orchestrator FAIL as expected. |
| Writer-supported source-health snapshot | WARN | All five writer-supported sources are currently freshness WARN. See `audit/direct-refresh-source-health/writer-supported-snapshot/20260605T032242Z/source-health-report.json`. |
| DIA writer support | Excluded | DIA is formally `audit-only-no-writer`. See `docs/direct-refresh-dia-posture.md`. |
| Scheduler readiness | Not authorized | Readiness is enough to design/propose guarded implementation, not enough to run/deploy scheduler. See `docs/direct-refresh-scheduler-gate.md`. |

## Freshness debt snapshot

Latest writer-supported snapshot: `audit/direct-refresh-source-health/writer-supported-snapshot/20260605T032242Z/source-health-report.json`.

The snapshot shows `0%` fresh rows for all writer-supported sources. This is freshness debt, not by itself proof that the source is unsafe to refresh.

| Source | Public-rankable rows | Fresh rows | Rows needed for 80% | Rows needed for 95% | Capacity status | Current blockers |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Carrefour | 990 | 0 | 792 | 941 | WARN | freshness debt; mixed capacity; 6 blocked rows |
| Vea | 666 | 0 | 533 | 633 | PASS | freshness debt |
| Disco | 777 | 0 | 622 | 739 | WARN | freshness debt; mixed capacity; 2 blocked rows |
| Jumbo | 778 | 0 | 623 | 740 | WARN | freshness debt; mixed capacity; 6 blocked rows |
| MAS | 831 | 0 | 665 | 790 | WARN | freshness debt; mixed capacity; 5 blocked rows |

Best-case lower bounds with `count=50` batches:

| Target | Minimum selected rows | Minimum source-scoped `count=50` batches | Caveat |
| --- | ---: | ---: | --- |
| 80%/24h recovery | 3,235 | 67 | Sum of per-source batch ceilings; excludes skips, aging during recovery, VTEX limits, confirmation latency, and source-specific scan density. |
| 95%/12h final | 3,843 | 78 | Sum of per-source batch ceilings; not credible without a production cadence controller and guardrails. |

## Source-health taxonomy

The previous wording “source degraded = no write” is too broad for recovery operations. It creates a circular blocker: stale sources cannot be refreshed because they are stale.

Going forward, source health must be evaluated as separate dimensions.

| Dimension | Meaning | Effect |
| --- | --- | --- |
| `safetyStatus` | Can we safely consider this source/work unit? | BLOCKED stops planning beyond read-only diagnosis and stops all writes. |
| `freshnessStatus` | How much freshness debt exists? | Debt triggers recovery planning; it is not write authorization. |
| `capacityStatus` | How reliable is the source for filling planned batches? | PASS supports normal planning; WARN reduces scope or requires review; FAIL blocks. |
| `runEligibility` | Combined result for the requested phase. | Determines whether diagnosis, recovery planning, manifest/prewrite, or active write may proceed. |

Hard-stop safety blockers include:

- active source/global kill switch;
- source inactive or non-VTEX when VTEX is required;
- host drift or invalid source URL;
- DIA selected as writer-supported source;
- malformed, missing, stale, or source/count/issue-mismatched evidence;
- conflicting active run or unknown staging/ingestion state;
- prewrite stale or prewrite rerun drift;
- EAN/SKU mismatch;
- direct lookup ambiguity;
- no-create invariant risk;
- price delta outside policy;
- capacity FAIL;
- alert policy hard stop, including critical/high alert conditions once alert evidence is part of the phase;
- postwrite FAIL or unresolved no-partial verification;
- database lock/advisory lock unavailable once locks exist;
- attempts to run scheduler, all-source, repeated batches, notifications, deploys, secrets, remote config, or cache purge outside an approved issue.

Freshness debt examples:

- freshness below 80% recovery target;
- freshness below 95% final target;
- all public-rankable rows stale;
- source aging after successful one-off pilots.

Freshness debt may trigger an evidence-only recovery plan when safety is PASS. It must not bypass manifest/prewrite, human confirmation, postwrite audit, or baseline requirements.

## Required artifact lineage

Every future planner or orchestrator artifact must be lineage-safe:

- same issue number, issue URL, source, count, attempt, and output directory across linked artifacts;
- parent artifact paths and hashes recorded;
- `generatedAt` recorded for every artifact;
- TTL policy recorded for source-health, capacity, alerts, kill switch, manifest, prewrite, operations report, and baseline evidence;
- stale evidence fails closed for phases that depend on freshness;
- one artifact cannot silently substitute evidence from another source/count/attempt;
- every report states `dryRun`, write boundary, blocked modes, and unsupported DIA writer posture.

## Race conditions to design against

| Race condition | Required mitigation |
| --- | --- |
| Kill switch changes after planning | Re-check kill switch immediately before manifest/prewrite and before any write. |
| Source-health changes after planning | Treat planning as advisory; rerun phase-specific gates before writes. |
| Two runs select overlapping rows | Use source-scoped run ledger/advisory lock before repeated or scheduled execution exists. |
| Baseline is computed during a write | Baseline must run after postwrite PASS or be marked observational only. |
| Human confirmation arrives after prewrite TTL | Stop; rerun prewrite; require new exact confirmation. |
| MAS confirmation exceeds 15-minute window | Use rapid-confirmation protocol or approved process adjustment; no slow-loop write. |
| Artifact from a different attempt is supplied | Fail closed on issue/source/count/attempt/path/hash mismatch. |
| Denominator changes during recovery | Planner must record denominator timestamp and confidence; baselines decide final freshness. |
| VTEX anti-bot/rate-limit appears mid-cadence | Stop source, lower budget/backoff, and require incident/hardening issue before continuing. |
| Prisma pool or transaction timeout recurs | Stop and fix read/write concurrency before retrying cadence. |

## Blind spots still needing explicit handling

- Public UI copy must not imply “fresh today” unless evidence supports it.
- DIA exclusion is safe for writer-supported operations, but whole-system product claims need separate wording.
- Capacity reports are sample-based and can be stale; planner output must include confidence and TTL.
- `count=50` contracts do not imply `count=100` or repeated-run safety.
- PriceHistory growth, index pressure, and query performance need monitoring before sustained cadence.
- Source-specific VTEX behavior may degrade under sustained load even if one-off pilots pass.
- Freshness can age faster than manual operations can recover; the planner must model time windows, not only row counts.
- Alert delivery and ownership must be production-ready before unattended cadence.

## Next implementation slice

Issue [#156](https://github.com/Mateocas1/ofertaSUPER/issues/156) implements the evidence-only freshness debt and cadence planner as:

```bash
npm run audit:direct-refresh-freshness-debt-planner -- \
  --source=carrefour,vea,disco,jumbo,mas \
  --source-health=<source-health-report.json> \
  --issue-url=<approved-issue-url> \
  --issue-number=<approved-issue-number> \
  --issue-title="<approved issue title>" \
  --issue-type-label=<exactly-one-type-label> \
  --issue-approval-label=status:approved \
  --attempt-id=<attempt> \
  --output-dir=<attempt-output-dir> \
  --output=<attempt-output-dir>/freshness-debt-plan.json
```

The planner must:

1. read existing DB/audit evidence only;
2. reject DIA as writer-supported source;
3. compute per-source freshness debt for 80%/24h and 95%/12h;
4. estimate minimum batches by count and by source;
5. apply capacity status to recommend normal, reduced, manual-review, or blocked planning;
6. model max rows per run and max runs per window;
7. surface MAS rapid-confirmation risk;
8. require artifact lineage and TTL inputs;
9. produce JSON plus a human-readable issue summary;
10. never run VTEX scans, manifest, prewrite, active writer, scheduler, all-source mode, notifications, deploys, secrets, remote config, or cache purge.

## Run ledger and source lock foundation

Issue [#158](https://github.com/Mateocas1/ofertaSUPER/issues/158) adds the control-plane foundation that must exist before any repeated-batch or cadence execution:

- direct-refresh run ledger schema for source/count/attempt/issue/status/artifact lineage;
- source-scoped advisory lock key generation;
- active run conflict detection for `PLANNED` and `RUNNING` states;
- terminal state protection for `STOPPED`, `FAILED`, and `COMPLETED`;
- DIA rejection for writer-supported run scopes.

This foundation does not execute production writes, manifest/prewrite generation, scheduler jobs, all-source runs, repeated batches, VTEX scans, notifications, deploys, secrets changes, remote config changes, or cache purge. It only prepares the control plane needed to make future cadence work safe and auditable.

## Future production cadence controller

A production cadence controller may be designed later, but only after the evidence-only planner and run ledger/source lock foundation are reviewed.

It must be production-shaped from the start:

- disabled by default;
- source-scoped;
- count/budget scoped;
- explicit max rows per run;
- explicit max runs per window;
- source/global kill switch;
- advisory lock/run ledger;
- evidence TTL enforcement;
- artifact lineage enforcement;
- postwrite and baseline required;
- alert hooks;
- no automatic retry after stopped/failed attempts;
- DIA excluded from writer-supported execution;
- no active writes without a separately approved confirmation boundary.

## What remains blocked

- scheduler execution/deploy;
- cron/workflow automation;
- automatic production writes;
- all-source execution;
- repeated-batch execution;
- DIA writer support;
- VTEX read-scan cadence experiments;
- notification delivery;
- deploy, secrets, remote config, or cache purge;
- public freshness copy changes.

## Recommended next issues

| Order | Issue | Type | Scope |
| ---: | --- | --- | --- |
| 1 | `feat(data): add direct-refresh freshness debt planner` | implementation | Evidence-only/read-only planner; no VTEX scans or writes. |
| 2 | `docs(data): define direct-refresh cadence controller design` | docs | Production controller architecture, locks, ledger, budgets, TTL, alert ownership. |
| 3 | `feat(data): add direct-refresh run ledger and advisory lock` | implementation | No writes; state and concurrency guard foundations. |
| 4 | `feat(data): add source-scoped cadence planner dry run` | implementation | Still read-only; may sequence proposed windows, not execute writes. |
| 5 | `ops(data): run controlled recovery batch <source> count50` | operation | Only after planner evidence and normal write gates; one source/count/run. |

## Launch posture

Current honest statement:

> Direct-refresh writer contracts are proven for Carrefour, Vea, Disco, Jumbo, and MAS at `count=50`; read-only planning evidence is repeatable; sustained freshness is not yet achieved and requires a production cadence strategy with safety, capacity, lineage, and ownership controls.

Target final statement:

> ofertasSUPER sustains freshness for writer-supported VTEX sources through an auditable, source-scoped cadence controller with safety gates, freshness-debt planning, capacity-aware budgets, postwrite verification, alerting, and kill-switch controls.
