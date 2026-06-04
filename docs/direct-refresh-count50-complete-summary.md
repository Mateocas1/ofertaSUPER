# Direct-refresh count=50 complete summary

All currently writer-supported direct-refresh sources have completed a controlled `count=50` pilot with write PASS and postwrite PASS: Carrefour, Vea, Disco, Jumbo, and MAS.

This completes the `count=50` controlled-pilot slice. It does not approve scheduler, all-source writes, repeated batches, DIA writes, cache purge, deploys, or secrets changes.

## Executive outcome

| Decision area | Outcome |
|---|---|
| Writer-supported `count=50` coverage | 5/5 PASS |
| Postwrite audit pass rate | 5/5 PASS |
| Latest baseline | WARN: `300 / 4,955` fresh rows (`6.05%`) |
| Highest-risk source | MAS, due scan160, blocker density, and 15-minute prewrite freshness window |
| Scheduler readiness | Not approved |
| Next recommended gate | Operational readiness plan: runbook, alerts, source health, retry/backoff, kill switch, reporting |

## Pilot evidence

| Source | Issue | Evidence directory | Write status | Product updates | SupermarketProduct updates | PriceHistory inserted | Postwrite status |
|---|---:|---|---:|---:|---:|---:|---:|
| Vea | #103 | `audit/vea-controlled-count50/` | PASS | 40 | 50 | 47 | PASS |
| Jumbo | #104 | `audit/jumbo-controlled-count50/` | PASS | 33 | 50 | 42 | PASS |
| Carrefour | #105 | `audit/carrefour-controlled-count50-retry1/` | PASS | 50 | 50 | 47 | PASS |
| Disco | #108 | `audit/disco-controlled-count50-retry1/` | PASS | 27 | 50 | 31 | PASS |
| MAS | #109 | `audit/mas-controlled-count50-retry4/` | PASS | 50 | 50 | 48 | PASS |

## Latest freshness state

Latest baseline artifact: `audit/mas-controlled-count50-retry4/freshness-baseline.json`.

| Metric | Value |
|---|---:|
| Baseline status | WARN |
| Total rows | 4,955 |
| Fresh rows | 300 |
| Stale rows | 4,655 |
| Unknown rows | 0 |
| Unavailable rows | 57 |
| Overall freshness | 6.05% |

Fresh rows by source:

| Source | Fresh rows |
|---|---:|
| Carrefour | 75 |
| MAS | 75 |
| Vea | 50 |
| Disco | 50 |
| Jumbo | 50 |
| DIA | 0 |

The lower Vea/Disco/Jumbo fresh counts compared with earlier baselines are expected aging under the current SLA window, not failed postwrite evidence. This reinforces the core production lesson: one-off manual pilots prove contracts, not sustained freshness.

## Incident and hardening record

| Incident / hardening | Source | Result | Evidence |
|---|---|---|---|
| Transaction timeout risk | Vea/Disco earlier pilots | Fixed with explicit transaction `{ maxWait: 20_000, timeout: 60_000 }` | Issue #89, PR #90 |
| Empty product-change rows | Disco/Jumbo/MAS earlier pilots | Fixed by skipping product update when product changes are empty | Issue #92, PR #93 |
| Prewrite pool exhaustion | MAS count=25 | Fixed by serializing prewrite candidate evaluation | Issue #97, PR #98 |
| Manifest pool exhaustion | MAS count=50 | Fixed by serializing manifest candidate evaluation | Issue #110, PR #111 |
| Hash mismatch before write | Carrefour count=50 | Stopped before transaction; no-partial verification PASS; retry1 PASS | Issue #105 |
| Stale prewrite before write | Disco count=50 | Stopped before transaction; no-partial verification PASS; retry1 PASS | Issue #108 |
| Stale prewrite repeated | MAS count=50 | Retry1/retry2/retry3 stopped before transaction; no-partial verifications PASS; retry4 PASS in rapid-confirmation window | Issue #109 |

## MAS-specific lesson

MAS `count=50` is operationally different from the other writer-supported sources:

- required `candidate-scan-size=160`;
- manifest skipped `7` rows;
- prewrite skipped `52` rows;
- blocker reasons included EAN mismatch, zero live products, and non-positive live prices;
- normal confirmation latency repeatedly exceeded the active writer's 15-minute prewrite freshness window;
- successful execution required a coordinated rapid-confirmation window.

Future MAS batches should not use the ordinary manual cadence without either a rapid-confirmation protocol or an approved process adjustment.

## What count=50 proves

- Source-specific contracts work at `count=50` for all writer-supported sources.
- Selected-row-only writers preserved no-create behavior across larger batches.
- Postwrite audit validates exact row counts and PriceHistory inserts at larger batch size.
- Mixed sources can be operated with bounded viable scans and explicit skipped-row evidence.
- Incident protocol is effective when attempts stop before write.

## What count=50 does not prove

- It does not prove scheduler safety.
- It does not prove all-source orchestration safety.
- It does not authorize repeated batches.
- It does not prove DIA writer readiness.
- It does not achieve sustained freshness targets.
- It does not replace runbook, alerts, source health, retry/backoff, kill switch, or reporting.

## Next decision gate

The safe next step is not more manual count escalation by default. The next approved slice should be one of:

| Path | Purpose | Required boundary |
|---|---|---|
| Operational readiness docs | Define runbook, incident taxonomy, approval flow, and reporting before automation. | Documentation/read-only only. |
| Semi-automatic orchestrator planning | Design human-approved orchestration without scheduler. | No writes until separate approval. |
| Count=50 cadence experiment planning | Model repeated batches without running them yet. | Read-only planning first; no repeated writes. |
| DIA decision | Harden or formally exclude DIA. | Separate source-specific issue. |

Recommended next action: create an operational readiness/runbook issue before any scheduler or repeated-batch work. Count `50` pilots are complete; the bottleneck is now process and operations, not whether the source-specific writer contracts can execute one controlled batch.
