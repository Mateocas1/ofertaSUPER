# DIA direct-refresh posture

DIA is formally excluded from writer-supported direct-refresh. It may remain visible in read-only health, alert, kill switch, and operations reports as `audit-only-no-writer`, but it must not be counted as an active writer-supported source.

This decision does not authorize production writes, scheduler, all-source operation, repeated batches, DIA writes, cache purge, deploys, secrets changes, or notification delivery.

## Decision

| Area | Decision |
|---|---|
| Current posture | DIA is `audit-only-no-writer`. |
| Writer support | Excluded from direct-refresh active writes. |
| Coverage claims | Writer-supported coverage means Carrefour, Vea, Disco, Jumbo, and MAS only. |
| Scheduler readiness | DIA writer support is not a prerequisite because DIA is formally excluded. Scheduler remains blocked by separate final gates. |
| Future DIA work | Requires a separate approved hardening proposal and must not be bundled into scheduler/orchestrator work. |

## Why DIA is excluded now

DIA has not gone through the source-specific direct-refresh hardening sequence used for writer-supported sources:

1. read-only manifest and prewrite gate;
2. active writer contract;
3. postwrite audit;
4. controlled `count=10`, `count=25`, and `count=50` pilots;
5. incident recovery evidence for failed/stopped attempts.

Until that sequence exists for DIA, direct-refresh must not imply DIA can be actively refreshed by the writer path.

## Allowed DIA activity

| Activity | Allowed? | Notes |
|---|---:|---|
| Source health visibility | Yes | DIA may appear as `audit-only-no-writer`. |
| Alert report visibility | Yes | DIA health/stop conditions may appear in alert reports only; no notification delivery is authorized. |
| Kill switch reporting | Yes | A DIA stop control can be represented for audit clarity. |
| Operations report visibility | Yes | DIA can be listed as excluded/audit-only. |
| Active direct-refresh write | No | Requires separate hardening issue and full source-specific rollout. |
| Scheduler/all-source inclusion as writer | No | DIA must not be counted as writer-supported coverage. |

## Disallowed claims

Do not say:

- “all sources are writer-supported”; 
- “DIA is ready for active direct-refresh”; 
- “scheduler covers every supermarket source”; 
- “all-source direct-refresh is approved.”

Acceptable wording:

- “writer-supported direct-refresh covers Carrefour, Vea, Disco, Jumbo, and MAS”; 
- “DIA is formally excluded from writer-supported direct-refresh and remains audit-only/no-writer”; 
- “whole-system freshness still requires separate treatment for DIA if DIA is in scope.”

## Future hardening criteria

A future DIA hardening issue must be separate from scheduler work and must define:

- DIA-specific lookup/identity assumptions;
- read-only manifest and prewrite gates;
- active writer contract, if approved;
- postwrite audit support;
- count-scoped controlled pilots;
- no-create and rollback/no-partial verification;
- source-specific alert and kill switch behavior;
- fresh review before any production write.

Until that issue is approved and completed, DIA remains excluded.

## Readiness impact

This decision satisfies the DIA readiness slice by removing ambiguity from coverage claims. Scheduler, all-source operation, repeated batches, and automatic writes remain blocked until orchestrator design and the final scheduler gate are complete and reviewed.
