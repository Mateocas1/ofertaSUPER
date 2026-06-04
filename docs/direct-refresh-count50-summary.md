# Direct-refresh count=50 pilot summary

The first three `count=50` controlled direct-refresh pilots passed for Vea, Jumbo, and Carrefour. This is a larger-batch controlled-pilot milestone, not scheduler readiness.

Per the production operations plan, this document pauses the rollout to consolidate evidence before deciding whether to continue with Disco/MAS `count=50`, run more read-only planning, or address scheduler prerequisites.

## Executive outcome

| Decision area | Outcome |
|---|---|
| Completed `count=50` pilots | Vea, Jumbo, Carrefour |
| Write status | 3/3 PASS |
| Postwrite audit status | 3/3 PASS |
| Mixed-source evidence | Jumbo PASS; Carrefour PASS after retry1 |
| Latest baseline | WARN: `275 / 4,955` fresh rows (`5.55%`) |
| Scheduler readiness | Not approved |
| Next recommended gate | Choose between Disco `count=50`, MAS `count=50`, or a pause for operational readiness work |

## Pilot evidence

| Source | Issue | Evidence directory | Write status | Product updates | SupermarketProduct updates | PriceHistory inserted | Postwrite status |
|---|---:|---|---:|---:|---:|---:|---:|
| Vea | #103 | `audit/vea-controlled-count50/` | PASS | 40 | 50 | 47 | PASS |
| Jumbo | #104 | `audit/jumbo-controlled-count50/` | PASS | 33 | 50 | 42 | PASS |
| Carrefour | #105 | `audit/carrefour-controlled-count50-retry1/` | PASS | 50 | 50 | 47 | PASS |

## Latest freshness state

Latest baseline artifact: `audit/carrefour-controlled-count50-retry1/freshness-baseline.json`.

| Metric | Value |
|---|---:|
| Baseline status | WARN |
| Total rows | 4,955 |
| Fresh rows | 275 |
| Stale rows | 4,680 |
| Unknown rows | 0 |
| Unavailable rows | 46 |
| Overall freshness | 5.55% |

Fresh rows by source:

| Source | Fresh rows |
|---|---:|
| Carrefour | 75 |
| Vea | 75 |
| Jumbo | 75 |
| Disco | 25 |
| MAS | 25 |
| DIA | 0 |

The baseline still shows the gap between successful controlled pilots and sustained operational freshness. Larger batches improve the metric, but one-off batches do not establish cadence, alerting, retry policy, or scheduler safety.

## Incident evidence

| Incident | Source | Result | Evidence |
|---|---|---|---|
| Prewrite report hash mismatch before write | Carrefour | Stopped before transaction; no write report produced | Issue #105 |
| No-partial-write verification | Carrefour | PASS; `PriceHistory` max id remained `5318`, matching rollback snapshot | `audit/carrefour-controlled-count50/failed-attempt-no-partial-verification.json` |
| Retry after fresh prewrite and new confirmation | Carrefour | PASS | `audit/carrefour-controlled-count50-retry1/` |

The Carrefour incident followed the required protocol: stop, verify no partial write, regenerate fresh prewrite evidence, request new exact confirmation, then retry once.

## What count=50 proves

- The variable-count contracts can safely handle larger chunks than `25` for multiple sources.
- Vea can run `count=50` without recurring transaction timeout under the current transaction options.
- Mixed sources can run `count=50` when bounded viable selection skips blocked rows.
- Postwrite audit can validate larger batches and exact PriceHistory inserts.
- The incident protocol works when an attempt stops before write.

## What count=50 does not prove

- It does not authorize scheduler or cron execution.
- It does not authorize all-source writes.
- It does not authorize repeated batches without new approved issues and exact confirmations.
- It does not prove DIA writer readiness.
- It does not prove freshness SLA coverage at 80%, 95%, or 100%.
- It does not replace alerting, runbook, retry/backoff policy, source health checks, or kill switch requirements.

## Next decision gate

There are three safe next paths:

| Path | Why choose it | Required controls |
|---|---|---|
| Disco `count=50` controlled pilot | Completes another writer-supported source at larger batch size; previous count=25 passed after incident recovery. | New approved issue, fresh prewrite, exact confirmation, postwrite, baseline. |
| MAS `count=50` controlled pilot | Exercises the source with the most scan/blocker complexity after PR #98 prewrite hardening. | Larger candidate scan forecast, new approved issue, fresh prewrite, exact confirmation, postwrite, baseline. |
| Pause for operational readiness | Avoids accumulating manual batches without scheduler prerequisites. | Document remaining guardrails: runbook, alerts, source health, retry/backoff, kill switch, reporting. |

Recommended next action: run Disco `count=50` only if the team wants to complete more controlled-pilot coverage before readiness work. Otherwise pause and plan the scheduler prerequisites explicitly. In either case, do not run scheduler/all-source/repeated batches from this summary.
