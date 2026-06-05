# Vea-first direct-refresh recovery plan

Vea was the first candidate for a future controlled recovery operation because the issue #162 read-only cadence controller showed Vea as `PASS` / `ready-for-human-confirmation` at `count=50`. Fresh issue #165 and #166 evidence supersedes that as the current posture: Vea is now `WARN` / `manual-review` because fresh capacity evidence is `WARN` / `mixed`. This document is a plan only: it does not authorize writes, generate fresh gates, execute manifest/prewrite, run VTEX scans or direct lookups, schedule work, or start repeated batches.

## Decision

| Decision | Value |
| --- | --- |
| First recovery candidate | Vea |
| Planned batch size | `count=50` |
| Historical posture | `PASS` / `ready-for-human-confirmation` in issue #162 cadence controller evidence. |
| Current posture | `WARN` / `manual-review` after issue #165 and #166 evidence. |
| Why Vea first | Vea still has the best source-specific evidence among writer-supported sources, and scan70 found enough viable rows for `count=50`, but the current mixed capacity evidence is not normal readiness. |
| What remains required | A separate approved policy/operation decision, fresh capacity/source/cadence evidence, fresh gate evidence, exact human confirmation, one writer run, postwrite audit, and freshness baseline. |

Non-Vea sources remain out of the first recovery operation because Carrefour, Disco, Jumbo, and MAS are `WARN` / `manual-review` due capacity `WARN` and `planning-reduced` eligibility.

## Evidence basis

| Evidence | Path / link | Meaning |
| --- | --- | --- |
| Cadence coverage issue | [#162](https://github.com/Mateocas1/ofertaSUPER/issues/162) | Read-only count50 coverage snapshot across writer-supported sources. |
| Vea cadence artifact | `audit/direct-refresh-cadence-controller/issue162-count50-coverage/20260605T060514Z/vea/cadence-controller-plan.json` | Vea returned `PASS` / `ready-for-human-confirmation`. |
| Freshness debt planner | `audit/direct-refresh-freshness-debt-planner/20260605T044028Z/freshness-debt-plan.json` | Planning input only; shows Vea recovery debt of 533 rows and final debt of 633 rows. |
| Empty ledger input | `.pi-tmp-direct-refresh-cadence-ledger-empty.json` | Snapshot input proving no active ledger conflict for this planning run. |
| Pre-operation refresh | [#165](https://github.com/Mateocas1/ofertaSUPER/issues/165) / `audit/direct-refresh-vea-pre-operation-evidence/issue165/20260605T062934Z/cadence-controller-plan.json` | Vea downgraded to `WARN` / `manual-review` because fresh capacity evidence was missing. |
| Capacity refresh | [#166](https://github.com/Mateocas1/ofertaSUPER/issues/166) / `audit/direct-refresh-vea-capacity-evidence/issue166/20260605T063427Z/capacity-report-scan70.json` | scan70 found 51 viable rows but capacity stayed `WARN` / `mixed` because 19 live products were unavailable. |
| Cadence after capacity refresh | `audit/direct-refresh-vea-capacity-evidence/issue166/20260605T063427Z/cadence-controller-plan-scan70.json` | Cadence remained `WARN` / `manual-review`, not `ready-for-human-confirmation`. |

These artifacts are planning evidence. The issue #162 PASS is historical only until fresh evidence restores it. Issue #165 and #166 are the current control-plane basis and block normal operation readiness.

## Non-goals

This plan does not allow:

- scheduler execution or deploy;
- production writes in this docs task;
- manifest/prewrite generation in this docs task;
- VTEX scans in this docs task;
- repeated-batch execution;
- all-source execution;
- automatic writes or retries;
- notifications;
- deploy, secrets, cache, or remote-config changes;
- DIA writer support.

## Prerequisites for a future Vea operation issue

A future Vea operation issue can be proposed only when all prerequisites are true:

| Requirement | Required value |
| --- | --- |
| Issue | Dedicated approved operation issue with exactly one `type:*` label. |
| Source | `vea` only. |
| Count | `50` only unless a separate issue changes the batch contract. |
| Ledger | No active `PLANNED` or `RUNNING` direct-refresh run for Vea. |
| Kill switch | Fresh PASS / no active Vea or global stop. |
| Source health | Fresh source-health evidence suitable for the operation phase. |
| Capacity | Default normal-readiness policy requires capacity `PASS`. Capacity `WARN` / `mixed` is manual-review, not operation readiness. |
| Cadence controller | Default normal-readiness policy requires fresh source-scoped PASS / `ready-for-human-confirmation` for Vea count50. |
| Operator | A human operator is available to run gates, request confirmation, and stop on drift. |
| Reviewer/approver | A human approver is available to check exact confirmation within the prewrite TTL. |

## Manual-review capacity policy

Default policy: do not generate manifest/prewrite when Vea capacity is `WARN` / `mixed`; require capacity `PASS` and cadence `PASS` / `ready-for-human-confirmation` for normal operation readiness.

A future manual-review operation may be proposed only in a separate approved issue that explicitly accepts the mixed-capacity risk. That issue must still stop before manifest/prewrite unless it defines all of these stricter constraints:

- one source: `vea`;
- one count: `50` or lower if the issue chooses risk reduction;
- selected rows must come only from rows that passed fresh capacity evidence;
- fresh kill-switch, source-health, capacity, planner, cadence, ledger, manifest, and prewrite lineage must match the same issue/source/count/attempt;
- unavailable live products from capacity evidence must not be selected silently;
- exact human confirmation must mention the manual-review capacity posture;
- postwrite audit and no-partial verification rules remain unchanged;
- any drift, stale evidence, mismatch, timeout, or failed audit stops without retry.

This manual-review policy is a planning rule only. It does not authorize manifest, prewrite, production writes, scheduler execution, repeated/all-source execution, VTEX/direct lookups, notifications, deploy/secrets/cache/remote-config changes, or DIA writer work.

## Future operation sequence

The future operation must stay one source, one count, one attempt.

| Step | Action | Stop if |
| ---: | --- | --- |
| 1 | Create a dedicated approved Vea operation issue. | Missing approval, wrong label count, broad scope, or mixed source/count. |
| 2 | Refresh read-only planning evidence: source health, capacity, kill switch, cadence controller, and ledger check. | Any FAIL, stale evidence, source/count mismatch, active ledger conflict, or capacity downgrade to WARN/FAIL unless a separate approved manual-review issue explicitly accepts the mixed-capacity policy. |
| 3 | Generate manifest for Vea count50 under the operation issue. | Manifest is not PASS, selects wrong count/source, or shows identity/host/direct lookup violations. |
| 4 | Generate prewrite gate for the exact manifest. | Prewrite is not PASS, hash mismatch, selected rows mismatch, no-create risk, stale evidence, or drift. |
| 5 | Request exact human confirmation. | Confirmation omits or changes hash, row IDs, EANs, SKUs, count, source, or output path. |
| 6 | Run the active Vea writer once. | Writer fails, lock unavailable, selected rows drift, no-create assertion fails, transaction timeout, or stale prewrite. |
| 7 | Run postwrite audit. | Any selected row mismatch, missing PriceHistory, extra inserted rows, source/count mismatch, or postwrite FAIL. |
| 8 | Run freshness baseline. | Missing baseline, failed baseline command, or denominator evidence cannot be interpreted. |
| 9 | Close the operation issue with evidence. | Any artifact missing or unresolved incident remains open. |

## Exact confirmation boundary

The future writer confirmation must be exact and count-specific.

Required confirmation token:

```text
vea-direct-refresh-count50
```

The operation comment requesting approval must include:

- source: `vea`;
- count: `50`;
- prewrite report path;
- prewrite report hash;
- selected row IDs;
- selected EANs;
- selected SKUs;
- expected write report path;
- prewrite freshness deadline;
- explicit statement that the writer will run once and stop on any mismatch.

If the confirmation arrives after the prewrite freshness window, stop. Do not write. Regenerate prewrite and request a new exact confirmation.

## Stop rules

Stop immediately and do not retry in the same attempt when any of these happen:

| Stop condition | Required response |
| --- | --- |
| Cadence controller is WARN/FAIL | Do not generate manifest/prewrite; diagnose or create a new planning issue. The only exception is a separate approved manual-review operation issue that explicitly accepts mixed-capacity risk and defines the stricter constraints from this document. |
| Active ledger conflict | Stop and identify the owning run. Do not overlap source work. |
| Kill switch active | Stop until the stop control is removed by an approved process. |
| Source health or capacity downgrade | Stop and re-plan. Capacity WARN is manual-review, not readiness. |
| Manifest FAIL | Stop before prewrite. Preserve artifact. |
| Prewrite FAIL or stale prewrite | Stop before writer. Preserve artifact. |
| Confirmation mismatch | Stop. Do not infer intent. |
| Writer timeout or transaction error | Stop. Run no-partial verification before any retry. |
| Postwrite FAIL | Stop. Preserve artifacts and open a bugfix/incident issue. |
| Baseline missing | Do not claim recovery progress. |

## No-partial verification after stopped write attempts

If a writer command starts and fails, times out, or becomes ambiguous, the next action is read-only no-partial verification.

Minimum verification evidence:

- failed command and error string;
- expected write report path and whether it exists;
- product count;
- supermarket product count;
- current `PriceHistory` max id;
- expected max id from rollback/prewrite snapshot;
- conclusion: PASS or FAIL;
- next required action.

No retry is allowed unless no-partial verification is PASS, fresh evidence is regenerated, and a new exact confirmation is given.

## Review checklist for the future operation issue

Before anyone runs gates for the future operation, reviewers should confirm:

- [ ] Issue is dedicated to Vea count50 only.
- [ ] Issue has `status:approved` and exactly one `type:*` label.
- [ ] Out-of-scope list blocks scheduler, repeated batches, all-source execution, DIA writes, deploy/secrets/cache/remote-config, and notifications.
- [ ] Cadence controller evidence is fresh and source-scoped to Vea count50.
- [ ] No active ledger conflict exists for Vea.
- [ ] Kill switch/source health/capacity evidence is fresh enough for the phase.
- [ ] Manifest and prewrite commands, if run later, write to a unique operation attempt directory.
- [ ] Confirmation request includes hash, row IDs, EANs, SKUs, source, count, and output path.
- [ ] Postwrite audit and freshness baseline are mandatory closeout artifacts.

## Next step

The next safe action after this documentation lands is not a write operation. Choose one of these separately approved paths:

1. obtain fresh capacity `PASS` and cadence `PASS` / `ready-for-human-confirmation` before proposing a normal Vea operation; or
2. create a separate manual-review operation issue that explicitly accepts mixed-capacity risk and uses the stricter constraints above.

This document alone does not authorize production writes, manifest/prewrite generation, scheduler execution, VTEX/direct lookups, repeated/all-source execution, notifications, deploy/secrets/cache/remote-config changes, or DIA writer work.
