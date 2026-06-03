# Direct-refresh Phase 3 count=25 summary

Phase 3 proved that every currently writer-supported direct-refresh source can run a controlled `count=25` refresh with source-specific gates, exact human confirmation, a successful active write, and a PASS post-write audit.

This is a scaled controlled-pilot milestone, not production scheduler approval. Scheduler, all-source writes, repeated batches, DIA writes, cache purge, deploys, and secrets work remain out of scope until the next decision gate is explicitly approved.

## Executive outcome

| Decision area | Outcome |
|---|---|
| Writer-supported `count=25` coverage | PASS for Carrefour, Vea, Disco, Jumbo, and MAS. |
| Post-write audit pass rate | 5/5 controlled pilots PASS. |
| No-create invariant | Preserved in all reported writes. |
| Freshness baseline | Still WARN after pilots: `135 / 4,955` rows fresh (`2.72%`). |
| Scheduler readiness | Not approved. Controlled pilots do not prove scheduler guardrails. |
| Next recommended gate | Plan `count=50` capacity/risk gate before any larger write. |

## Pilot evidence

| Source | Issue | Evidence directory | Write status | Product updates | SupermarketProduct updates | PriceHistory inserted | Postwrite status |
|---|---:|---|---:|---:|---:|---:|---:|
| Vea | #88 | `audit/vea-controlled-count25-retry1/` | PASS | 25 | 25 | 23 | PASS |
| Disco | #91 | `audit/disco-controlled-count25-retry2/` | PASS | 23 | 25 | 23 | PASS |
| Jumbo | #94 | `audit/jumbo-controlled-count25/` | PASS | 13 | 25 | 24 | PASS |
| Carrefour | #95 | `audit/carrefour-controlled-count25/` | PASS | 25 | 25 | 20 | PASS |
| MAS | #96 | `audit/mas-controlled-count25-retry1/` | PASS | 25 | 25 | 23 | PASS |

## Current freshness state

Latest baseline artifact: `audit/mas-controlled-count25-retry1/freshness-baseline.json`.

| Metric | Value |
|---|---:|
| Baseline status | WARN |
| Total rows | 4,955 |
| Fresh rows | 135 |
| Stale rows | 4,820 |
| Unknown rows | 0 |
| Unavailable rows | 24 |
| Overall freshness | 2.72% |

Fresh rows by source after Phase 3:

| Source | Fresh rows |
|---|---:|
| Carrefour | 25 |
| Vea | 25 |
| Disco | 25 |
| Jumbo | 25 |
| MAS | 35 |
| DIA | 0 |

MAS has `35` fresh rows because it already had `10` fresh rows from the earlier `count=10` operation and gained `25` more in retry1.

## Incidents and fixes

| Incident | Affected source | Resolution | Evidence |
|---|---|---|---|
| Transaction timeout during active write | Vea, then Disco recovery path | Increased direct-refresh transaction options to `{ maxWait: 20_000, timeout: 60_000 }`. | Issue #89, PR #90 |
| Empty product-change rows counted as product updates | Disco/Jumbo/MAS contract hardening | Skipped `updateProductByEan` when product-level expected changes are empty. | Issue #92, PR #93 |
| MAS prewrite candidate scan 45 selected only `24 / 25` viable rows | MAS | Increased read-only candidate scan to 80. | Issue #96 |
| MAS prewrite scan 80 exhausted Prisma pool | MAS | Serialized prewrite candidate evaluation and added regression coverage. | Issue #97, PR #98 |

No failed active write was retried without rollback/no-partial-write verification and a new exact confirmation.

## What Phase 3 proves

- Source-specific read-only gates can select viable rows for `count=25`.
- Active writers can update selected existing rows only.
- Post-write audit can validate variable count reports and exact PriceHistory inserts.
- MAS needs larger candidate windows than the initial capacity recommendation because blockers cluster in the oldest public-rankable rows.
- Operational incidents are fixable within the issue/PR/evidence workflow.

## What Phase 3 does not prove

- It does not prove scheduler safety.
- It does not prove all-source orchestration safety.
- It does not prove repeated-batch cadence or rate-limit safety.
- It does not prove DIA writer readiness.
- It does not prove 80% or 95% freshness coverage within SLA.
- It does not authorize running additional writes without fresh prewrite evidence and exact human confirmation.

## Decision gate before count=50

Before any `count=50` write, require a dedicated approved issue that answers:

1. Which source goes first and why?
2. What candidate scan size is required for that source?
3. What is the expected blocked-row rate?
4. What timeout/rate-limit risk is acceptable?
5. What is the rollback/no-partial-write verification path if the write fails?
6. What baseline delta would count as useful evidence?
7. Does the run remain a one-off controlled pilot, or is it part of a planned cadence experiment?

Recommended first `count=50` planning candidates:

| Candidate | Why | Risk |
|---|---|---|
| Carrefour | Large denominator, clean count=25 PASS. | Still low global freshness; must avoid assuming one bigger batch is enough. |
| Vea | Clean count=25 retry PASS after transaction hardening. | Prior timeout means timeout evidence should be watched. |
| Jumbo | Count=25 PASS without retry. | Fewer product-level changes; useful to verify no-op product update behavior at larger count. |
| MAS | Final count=25 PASS after prewrite hardening. | Needs larger scan windows and has clustered blockers. |

Disco is acceptable after the empty-product-update fix, but it already exercised more incident recovery than Jumbo/Carrefour.

## Recommended next step

Create a `count=50` planning issue, not a write issue yet. The planning issue should choose one first source, generate read-only evidence only, and forecast review/operational risk before asking for any future controlled-write confirmation.
