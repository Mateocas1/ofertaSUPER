# Direct-refresh count=50 planning gate

This planning gate evaluates the first `count=50` direct-refresh pilot without executing any production write. The result is read-only evidence and a recommendation for the next issue, not approval to write.

## Executive decision

| Area | Decision |
|---|---|
| First candidate source | Vea |
| Why Vea | Cleanest Phase 2 readiness signal: `PASS` / `viable`, `25 / 25` viable in capacity sample, `0` blocked, and count=25 postwrite PASS. |
| Planning evidence | Read-only manifest PASS and prewrite PASS for `count=50`. |
| Write authorization | Not authorized by this document. |
| Next step | Open a separate controlled-write issue only if the team accepts the risk forecast. |

## Read-only evidence

| Artifact | Status | Path |
|---|---:|---|
| Manifest | PASS | `audit/vea-controlled-count50-planning/manifest.json` |
| Prewrite gate | PASS | `audit/vea-controlled-count50-planning/prewrite-gate.json` |

Evidence parameters:

| Field | Value |
|---|---:|
| Source | `vea` |
| Requested sample size | 50 |
| Candidate scan size | 60 |
| Candidate rows | 60 |
| Selected rows | 50 |
| Skipped blocked rows | 0 |
| Prewrite hash | `342e569063be7bb812078f8a6e41d3bc0816117673c1139478194353b6c7285b` |

Expected write forecast from the read-only prewrite gate:

| Forecast | Value |
|---|---:|
| Product updates | 40 |
| SupermarketProduct updates | 50 |
| PriceHistory inserts | 47 |
| Fail rows | 0 |
| Fail-closed reasons | 0 |

## Why Vea is the right first count=50 candidate

Vea is the lowest-risk first `count=50` candidate because the readiness and planning evidence agree:

- capacity audit classified Vea as `PASS` and `viable`;
- Phase 2 readiness saw no blocked rows in the Vea sample;
- Phase 3 `count=25` finished with write PASS and postwrite PASS;
- current `count=50` read-only planning evidence selected all 50 rows with no skipped blockers.

This makes Vea a better first larger-batch test than mixed sources such as Carrefour, Jumbo, Disco, or MAS, where blocked rows cluster and candidate scan sizing is more source-sensitive.

## Risks before any write issue

| Risk | Why it matters | Required control |
|---|---|---|
| Transaction duration | Vea previously exposed transaction timeout behavior during Phase 3. | Keep PR #90 transaction options active and treat timeout as a stop condition. |
| Larger rollback surface | `count=50` touches twice as many rows as Phase 3 pilots. | Future write issue must include exact rollback/no-partial-write verification steps. |
| Fresh prewrite drift | Evidence hash is timestamped and can become stale. | Future write issue must regenerate prewrite evidence before asking confirmation. |
| Review workload creep | Count=50 may tempt scheduler/repeated-batch scope. | Keep the next issue source-specific and one-write only. |
| Baseline overinterpretation | One `count=50` write will not make the catalog operationally fresh. | Treat baseline delta as evidence, not as production readiness. |

## Stop rules for a future Vea count=50 write issue

Stop immediately if any of these occur:

- prewrite status is not PASS;
- selected row count differs from 50;
- fresh rerun hash drifts from the confirmed evidence;
- row IDs, EANs, SKUs, or output path differ from confirmation;
- active writer reports anything other than PASS;
- postwrite audit reports any failed row;
- Product or SupermarketProduct no-create invariant is violated;
- transaction timeout or connection/pool incident occurs;
- baseline evidence is missing after the write.

A failed write attempt must follow the existing incident protocol: stop, verify rollback/no-partial-write state read-only, file a bugfix issue/PR if needed, regenerate fresh prewrite evidence, and request new exact confirmation before any retry.

## Recommendation

Proceed to a separate issue for a single Vea `count=50` controlled write only if the team accepts these constraints:

1. one source: Vea;
2. one batch: `count=50`;
3. no scheduler, all-source orchestration, repeated batches, DIA work, cache purge, deploy, or secrets changes;
4. fresh prewrite must be regenerated in the write issue;
5. exact human confirmation must include the fresh hash, row IDs, EANs, SKUs, and output path;
6. postwrite audit and baseline are mandatory before closing the issue.

If the team wants more confidence before a write, the safer alternative is to run a second read-only `count=50` planning gate for Jumbo or Carrefour and compare blocker/scan behavior.
