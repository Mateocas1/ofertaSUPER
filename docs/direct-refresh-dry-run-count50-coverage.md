# Direct-refresh count50 dry-run coverage

The minimal direct-refresh dry-run evidence chain has PASS coverage for every writer-supported source at `count=50`. This proves the read-only planner → operations report → dry-run orchestrator sequence can produce source/count-scoped operator evidence without invoking scheduler execution, manifest/prewrite generation, active writers, or production writes.

## Coverage summary

| Source | Issue | Attempt | Scheduler planner | Operations report | Dry-run orchestrator | Result |
| --- | --- | --- | --- | --- | --- | --- |
| Vea | [#144](https://github.com/Mateocas1/ofertaSUPER/issues/144) | `20260605T024840Z` | `audit/vea-direct-refresh-dry-run-count50/20260605T024840Z/scheduler-plan.json` | `audit/vea-direct-refresh-dry-run-count50/20260605T024840Z/operations-report.json` | `audit/vea-direct-refresh-dry-run-count50/20260605T024840Z/dry-run-orchestrator.json` | PASS |
| MAS | [#146](https://github.com/Mateocas1/ofertaSUPER/issues/146) | `20260605T025732Z` | `audit/mas-direct-refresh-dry-run-count50/20260605T025732Z/scheduler-plan.json` | `audit/mas-direct-refresh-dry-run-count50/20260605T025732Z/operations-report.json` | `audit/mas-direct-refresh-dry-run-count50/20260605T025732Z/dry-run-orchestrator.json` | PASS |
| Carrefour | [#147](https://github.com/Mateocas1/ofertaSUPER/issues/147) | `20260605T025948Z` | `audit/carrefour-direct-refresh-dry-run-count50/20260605T025948Z/scheduler-plan.json` | `audit/carrefour-direct-refresh-dry-run-count50/20260605T025948Z/operations-report.json` | `audit/carrefour-direct-refresh-dry-run-count50/20260605T025948Z/dry-run-orchestrator.json` | PASS |
| Disco | [#148](https://github.com/Mateocas1/ofertaSUPER/issues/148) | `20260605T030220Z` | `audit/disco-direct-refresh-dry-run-count50/20260605T030220Z/scheduler-plan.json` | `audit/disco-direct-refresh-dry-run-count50/20260605T030220Z/operations-report.json` | `audit/disco-direct-refresh-dry-run-count50/20260605T030220Z/dry-run-orchestrator.json` | PASS |
| Jumbo | [#149](https://github.com/Mateocas1/ofertaSUPER/issues/149) | `20260605T030613Z` | `audit/jumbo-direct-refresh-dry-run-count50/20260605T030613Z/scheduler-plan.json` | `audit/jumbo-direct-refresh-dry-run-count50/20260605T030613Z/operations-report.json` | `audit/jumbo-direct-refresh-dry-run-count50/20260605T030613Z/dry-run-orchestrator.json` | PASS |

## Fail-closed evidence

The Vea gated pilot intentionally supplied optional gate evidence with source-health `WARN` and proved fail-closed behavior:

| Source | Issue | Attempt | Supplied gate result | Operations report | Dry-run orchestrator | Result |
| --- | --- | --- | --- | --- | --- | --- |
| Vea | [#145](https://github.com/Mateocas1/ofertaSUPER/issues/145) | `20260605T025218Z` | `audit/direct-refresh-source-health/manual/source-health-report.json` — WARN | `audit/vea-direct-refresh-dry-run-count50/20260605T025218Z/operations-report.json` — WARN | `audit/vea-direct-refresh-dry-run-count50/20260605T025218Z/dry-run-orchestrator.json` — FAIL | Expected fail-closed |

This is a safe result. A supplied non-PASS optional gate must stop the dry-run orchestrator instead of producing a PASS summary.

## What this evidence authorizes

This evidence authorizes operators to treat the documented dry-run chain as a read-only readiness signal for one source and one count.

It does not authorize:

- scheduler execution or deploy;
- cron or workflow automation;
- manifest generation;
- prewrite generation;
- active writer invocation;
- production writes;
- all-source operation;
- repeated batches;
- DIA writer support;
- notifications;
- remote config changes;
- secrets changes;
- deploys;
- cache purge.

## Operator path

Use [`docs/direct-refresh-dry-run-evidence-guide.md`](./direct-refresh-dry-run-evidence-guide.md) for the command sequence and artifact shape.

For any future manual write, restart from the controlled write gates instead of reusing dry-run evidence:

1. approved source/count-specific issue;
2. fresh manifest/prewrite gates;
3. exact human confirmation token;
4. one source and one count only;
5. postwrite audit and baseline evidence.

## Latest source-health reality

A later writer-supported-only source-health snapshot shows that every writer-supported source is currently freshness WARN:

- `audit/direct-refresh-source-health/writer-supported-snapshot/20260605T032242Z/source-health-report.json`

This means minimal dry-run PASS coverage should not be confused with fully gated freshness readiness. The current production strategy is documented in [`docs/direct-refresh-production-operations-plan.md`](./direct-refresh-production-operations-plan.md), and the source-health gating decision is documented in [`docs/direct-refresh-source-health-cadence-decision.md`](./direct-refresh-source-health-cadence-decision.md).

## Next safe slices

- Do not chase fully gated PASS until freshness debt is understood and planned.
- Build an evidence-only freshness debt/cadence planner before any repeated-batch or scheduler work.
- Keep DIA as `audit-only-no-writer` unless a separate approved design changes that posture.
