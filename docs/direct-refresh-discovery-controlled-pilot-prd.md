# Direct-refresh Discovery Controlled Pilot PRD

This PRD defines the next production-safe step after the direct-refresh discovery audit and create gate. The goal is one source-scoped discovery pilot that proves catalog row creation, postwrite verification, rollback boundaries, and operator workflow before any controlled batch or cadence expansion.

## Executive decision

Start with **Discovery Controlled Pilot 1**: one writer-supported source, one selected discovery key, one fresh prewrite, one exact confirmation boundary, one apply, one postwrite audit, and one follow-up freshness/baseline observation.

This pilot is not a freshness recovery mechanism. Discovery improves catalog coverage. Freshness recovery remains `refresh-existing` / cadence work.

## Current verified state

| Area | State | Evidence |
| --- | --- | --- |
| Read-only discovery audit | Implemented | PR #180 / issue #21 |
| Discovery create prewrite/apply gate | Implemented | PR #182 / issue #181 |
| First live candidate | Available as planning evidence | Vea key `discovery:vea:7791058000731:191290` classified as `source-row-discovery` in the previous prewrite |
| Production apply | Not run | Correct: write execution still needs postwrite acceptance scope |
| Freshness baseline | Still failing | 2026-06-06 read-only baseline: `0%` fresh across 4,042 writer-supported public-rankable rows |
| Repo state | Clean tracked state on `master` | Only old temp/untracked files remain |

## Problem

The create gate can now write missing discovery rows, but a production-grade team does not run it merely because the CLI exists. The missing acceptance layer is operational:

1. what exact artifact chain authorizes the first write;
2. what postwrite audit proves after the write;
3. what rollback evidence is required;
4. what metrics allow moving from `count=1` to `count<=5`;
5. what stops the process if freshness, capacity, source health, staging, or duplicate state changes.

Without this PRD, the next step risks becoming a one-off mutation rather than a reproducible production operation.

## Goals

- Prove the first discovery create pilot with the smallest meaningful write: `count=1`.
- Keep the operation source-scoped and issue-scoped.
- Preserve the non-negotiable separation from `refresh-existing`.
- Produce postwrite evidence that proves exact created rows and no extra rows.
- Produce rollback evidence that can reverse only the created discovery rows.
- Define the promotion gates for future controlled discovery batches.

## Non-goals

- No scheduler execution.
- No all-source discovery.
- No repeated batches.
- No DIA writes.
- No freshness recovery claim.
- No cache purge, deploy, remote config, secrets, or notifications.
- No automatic retry after a failed or stale gate.
- No broad standard reconciliation path.

## Recommended first pilot

| Field | Decision |
| --- | --- |
| Source | `vea` |
| Count | `1` |
| Candidate type | Prefer `source-row-discovery` for the first pilot because it avoids global `products` creation. |
| Candidate key | Use a fresh audit/prewrite-selected key; previous planning key was `discovery:vea:7791058000731:191290`, but it must be regenerated before apply. |
| Write shape | Create one `supermarket_products` row and one `price_history` row; do not create `products` if the candidate is still source-row-only. |
| Confirmation | Use only the exact confirmation emitted by the fresh prewrite. |
| Acceptance | Postwrite audit must PASS before any next discovery operation. |

## Artifact chain

The pilot must produce and preserve these artifacts under one attempt directory:

```text
audit/direct-refresh-discovery-controlled-pilot/issue<issue-number>/<timestamp>/
  discovery-audit.json
  discovery-create-prewrite.json
  discovery-create-apply.json
  discovery-create-postwrite.json
  freshness-baseline-observation.json
  issue-comment.md
```

Every artifact must carry the same:

- issue number;
- issue URL;
- source;
- count;
- selected discovery key;
- attempt directory;
- parent artifact path/hash where applicable;
- generated timestamp;
- explicit status.

## Required workflow

### 1. Fresh read-only discovery audit

Run a new discovery audit. The prior audit is useful context only; it is not write authorization.

Success requirements:

- status `PASS`;
- exactly one selected discovery for pilot 1;
- candidate has EAN, SKU, valid source host, positive price, availability, and non-mojibake metadata;
- classification is preferably `source-row-discovery`;
- blockers are empty for the selected candidate;
- rollback preview is present.

Stop if:

- audit status is not `PASS`;
- selected candidate is `product-and-source-discovery` and product-level quality review has not explicitly accepted global product creation;
- duplicate SKU, staging conflict, unavailable live product, bad price, host drift, or mojibake appears.

### 2. Fresh create prewrite

Run `direct-refresh:discovery-create prewrite` using the selected key from the fresh audit.

Success requirements:

- status `PASS`;
- selected key count equals `1`;
- exact confirmation is emitted;
- planned creates match the discovery classification;
- for `source-row-discovery`, `productCreatesPlanned = 0`;
- stale-prewrite TTL is recorded and enforced.

Stop if:

- prewrite status is not `PASS`;
- selected key changed;
- classification changed unexpectedly;
- planned creates exceed the pilot scope;
- exact confirmation does not match the intended source/count/key.

### 3. Apply with exact confirmation

Run apply only with the exact confirmation string from the fresh prewrite.

Success requirements:

- apply status `PASS`;
- source advisory lock acquired;
- transaction rechecked product/source/staging/SKU state;
- created row counts equal the prewrite plan;
- no additional rows are created.

Stop if:

- exact confirmation mismatch;
- prewrite is stale;
- source row already exists;
- staging conflict appears;
- duplicate SKU appears;
- advisory lock unavailable;
- transaction fails or partially applies.

### 4. Postwrite audit

A dedicated postwrite audit is required before the pilot can be called successful. Run it with the fresh prewrite and apply artifacts from the same attempt directory:

```bash
npm run direct-refresh:discovery-create -- postwrite \
  --prewrite=audit/direct-refresh-discovery-controlled-pilot/issue183/<timestamp>/discovery-create-prewrite.json \
  --apply=audit/direct-refresh-discovery-controlled-pilot/issue183/<timestamp>/discovery-create-apply.json \
  --output=audit/direct-refresh-discovery-controlled-pilot/issue183/<timestamp>/discovery-create-postwrite.json
```

This command is read-only: it loads the artifacts, reads current `products`, `supermarket_products`, and `price_history` rows, emits `discovery-create-postwrite.json`, and exits non-zero on `FAIL`.

The postwrite report must prove:

- exact `supermarket_products.id` created;
- exact `price_history.id` created;
- created row values match the apply report and prewrite plan;
- no extra `products` rows were created when classification was `source-row-discovery`;
- no extra source rows for the selected EAN/source;
- no extra price history rows beyond the created one;
- rollback plan references created IDs, not broad EAN deletes.

Postwrite status must be `PASS`. Stop immediately on `FAIL`, missing output, malformed JSON, artifact mismatch, unproven created IDs, extra selected source/history rows, or rollback without exact created IDs. Anything else is an incident, not a partial success.

### 5. Freshness/baseline observation

Run a baseline after postwrite, but treat it as observation only.

Discovery count=1 should not be presented as freshness recovery. The expected impact is catalog coverage, not 90/95 freshness.

## Rollback contract

Rollback must be artifact-bound:

| Created shape | Rollback action |
| --- | --- |
| `source-row-discovery` | Delete created `price_history`, then created `supermarket_products`; do not delete `products`. |
| `product-and-source-discovery` | Delete created `price_history`, created `supermarket_products`, and created `products` only if no other source/promo references the product. |

Rollback must not use broad deletes by EAN alone. It must reference created row IDs from the apply/postwrite artifacts.

## Performance and scalability constraints

| Stage | Maximum scope | Exit criteria |
| --- | ---: | --- |
| Pilot 1 | 1 selected discovery | Postwrite PASS and rollback evidence reviewed. |
| Controlled batch candidate | Up to 5 source-scoped discoveries | No postwrite failures, no duplicate/staging conflicts, no operator ambiguity. |
| Cadence candidate | Source-scoped only | Requires owner, alerting, ledger integration, TTL policy, throughput model, and no automatic retry after failure. |

The pilot must not optimize for throughput. It must optimize for proof. Throughput comes only after correctness, rollback, and postwrite are boring.

## Acceptance criteria

The pilot is accepted only when all of these are true:

- [ ] An approved issue exists with exactly one `type:*` label.
- [ ] Fresh discovery audit is `PASS`.
- [ ] Fresh create prewrite is `PASS` and emits exact confirmation.
- [ ] Apply is run once with the exact confirmation.
- [ ] Apply report is `PASS`.
- [ ] Postwrite report is `PASS`.
- [ ] Rollback artifact references exact created IDs.
- [ ] Issue comment summarizes artifact paths, statuses, created IDs, and stop-rule result.
- [ ] No scheduler/all-source/repeated/DIA/deploy/cache/secrets/remote-config action occurred.

## Required implementation before apply

The discovery-specific postwrite command is required before any pilot can be accepted:

```bash
npm run direct-refresh:discovery-create -- postwrite \
  --prewrite=audit/direct-refresh-discovery-controlled-pilot/issue183/<timestamp>/discovery-create-prewrite.json \
  --apply=audit/direct-refresh-discovery-controlled-pilot/issue183/<timestamp>/discovery-create-apply.json \
  --output=audit/direct-refresh-discovery-controlled-pilot/issue183/<timestamp>/discovery-create-postwrite.json
```

The command is read-only and `PASS` is mandatory before accepting the pilot or starting another discovery operation.

Expected shape:

```json
{
  "schemaVersion": 1,
  "audit": "direct-refresh-discovery-create-postwrite",
  "status": "PASS",
  "issue": 184,
  "source": "vea",
  "count": 1,
  "selectedKeys": ["discovery:vea:<ean>:<sku>"],
  "createdRows": {
    "products": [],
    "supermarketProducts": [{ "id": 123, "productEan": "<ean>", "supermarketId": 3 }],
    "priceHistory": [{ "id": 456, "supermarketProductId": 123 }]
  },
  "noExtraRows": {
    "products": true,
    "supermarketProducts": true,
    "priceHistory": true
  },
  "rollbackPlan": {
    "deletePriceHistoryIds": [456],
    "deleteSupermarketProductIds": [123],
    "deleteProductEans": []
  }
}
```

The exact issue number and IDs must come from the real pilot artifacts, not this example.

## Documentation cleanup required

Before or with the pilot PR, update docs so they do not mislead future operators:

- `docs/direct-refresh-discovery-mode-plan.md`: mark `refresh-existing` no-create verification as satisfied when verified in the current run, and link this PRD.
- `docs/direct-refresh-production-operations-plan.md`: move closed recommended issues to a completed/history section and leave only actual pending work as next steps.
- Add the first pilot issue number and artifact directory once created.

## Recommended next work units

| Order | Work unit | Type | Reason |
| ---: | --- | --- | --- |
| 1 | Docs state cleanup and PRD review | Docs | Removes ambiguity before writes. |
| 2 | Discovery create postwrite audit | Feature | Required before production apply if existing tooling cannot prove discovery-created rows. |
| 3 | First Vea source-row discovery controlled pilot | Ops | Smallest meaningful create proof. |
| 4 | Controlled discovery batch design | Docs/feature | Only after pilot 1 passes. |
| 5 | Freshness cadence executor design | Docs/feature | Separate track; discovery is not freshness recovery. |

## Stop rules

Stop immediately if any of these happen:

- any artifact is missing, stale, malformed, or source/count/issue/key mismatched;
- selected candidate classification changes unexpectedly;
- source health or capacity evidence introduces a safety blocker;
- a staging row appears for the selected EAN/source;
- another row already exists for the selected source/EAN;
- postwrite cannot prove exact created IDs;
- rollback cannot be expressed with created IDs;
- operator cannot explain what will be created before confirmation.

This is the standard. Anything looser is not production discipline; it is hoping.
