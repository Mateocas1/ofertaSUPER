# Direct-refresh run ownership and drill

Direct-refresh remains controlled manual source-specific only. This document assigns operational roles and records a read-only no-partial verification drill so future operators know who owns each step and how incident response is expected to work.

This document does not authorize production writes, scheduler, all-source operation, repeated batches, DIA writes, cache purge, deploys, secrets changes, or notification delivery.

## Ownership model

| Role | Responsibility | Required handoff |
|---|---|---|
| Operator | Runs read-only gates, requests confirmation, executes the single approved writer command when authorized, and posts evidence. | Must identify the approved issue, source, count, artifact paths, and current stop conditions before asking for confirmation. |
| Approver | Reviews fresh prewrite evidence and provides the exact confirmation text. | Must confirm hash, row IDs, EANs, SKUs, count token, source, and output path exactly. |
| Maintainer | Owns bugfixes, invariant failures, tooling failures, and merge/review decisions. | Must open/approve bugfix issues before any retry after code/tooling failure. |
| Escalation owner | Stops the operation when alerts, kill switch, no-partial failure, or postwrite failure appears. | Must preserve artifacts and decide whether the next action is retry, bugfix, rollback/repair, or no further action. |

## Handoff checklist

Before a controlled manual operation:

- [ ] Approved issue exists with exactly one `type:*` label.
- [ ] Scope is one source and one count.
- [ ] Source health, alerts, kill switch, and operations report are available when required by the current readiness process.
- [ ] Manifest and prewrite are PASS.
- [ ] Prewrite is fresh enough for the active writer window.
- [ ] Kill switch does not block the source.
- [ ] Operator and approver are both present for MAS large-batch rapid confirmation when needed.

During the operation:

- [ ] Operator runs exactly one active writer command after exact confirmation.
- [ ] Operator stops immediately on stale prewrite, confirmation mismatch, timeout, pool exhaustion, transaction failure, or kill-switch stop.
- [ ] Operator does not retry from stale or failed evidence.

After the operation or failed/stopped attempt:

- [ ] Postwrite audit is recorded for successful writes.
- [ ] Freshness baseline is recorded for successful writes.
- [ ] No-partial verification is recorded for failed or stopped attempts before retry.
- [ ] Evidence comment includes artifact paths, conclusion, and next action.

## Read-only no-partial verification drill

| Field | Value |
|---|---|
| Drill type | Read-only incident-response drill using existing stopped-attempt artifacts. |
| Source | MAS |
| Scenario | `count=50` retry3 stopped before transaction because prewrite evidence was stale. |
| Evidence artifact | `audit/mas-controlled-count50-retry3/failed-attempt-no-partial-verification.json` |
| Related failed command output | `prewrite report is stale; maximum age is 15 minutes` |
| Write report path checked | `audit/mas-controlled-count50-retry3/write-report.json` |
| Write report existed? | `false` |
| Product count | `2759` |
| SupermarketProduct count | `4955` |
| PriceHistory max id | `5396` |
| Expected rollback snapshot PriceHistory max id | `5396` |
| Conclusion | PASS: no write report was produced and PriceHistory max id remained equal to the prewrite rollback snapshot max id. |
| Required next action | Retry only with fresh evidence and a very fast exact confirmation/execution window, or a separately approved process adjustment. |

### Drill result

The drill confirms the documented incident response path:

1. The active writer stopped before transaction.
2. The operator preserved the failed-attempt artifact.
3. Read-only verification checked that no write report existed.
4. Read-only verification compared current `PriceHistory` max id against the prewrite rollback snapshot max id.
5. The conclusion was PASS, so a future retry would require new prewrite evidence and new exact confirmation.

No production write was executed for this drill.

## Evidence comment template

```md
## Direct-refresh ownership / drill evidence

- Operator:
- Approver:
- Maintainer / escalation owner:
- Source:
- Issue:
- Artifact paths:
- Stop condition, if any:
- No-partial verification path, if applicable:
- Conclusion:
- Next action:
```

## Readiness impact

Run ownership and a no-partial verification drill are now documented. Scheduler, all-source operation, repeated batches, and DIA writer support remain blocked until the DIA decision, orchestrator design, and final scheduler gate are complete and reviewed.
