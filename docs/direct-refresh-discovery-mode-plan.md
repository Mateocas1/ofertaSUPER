# Direct-refresh discovery-mode plan

Discovery mode is the future path for live VTEX products that are valid catalog discoveries but cannot be handled by `refresh-existing` because they would create `products` or `supermarket_products` rows. This is a product-grade plan, not an MVP shortcut.

This document does not authorize implementation, staging writes, production writes, scheduler execution, all-source operation, repeated batches, DIA writes, deploys, secrets changes, remote config changes, or cache purge.

## Current trigger

| Input | Decision |
| --- | --- |
| Planning issue | [#178](https://github.com/Mateocas1/ofertaSUPER/issues/178) |
| Issue | [#21](https://github.com/Mateocas1/ofertaSUPER/issues/21) |
| Example | Vea EAN `7798095171363` exists live in VTEX but is absent from `products`, Vea `supermarket_products`, price history, and staging rows. |
| Current guard | `refresh-existing` must keep rejecting it. That is correct. Discovery must be a separate mode with separate caps and rollback. |

## Discovery contract

Discovery may create rows only when all gates pass:

1. one approved issue with exactly one `type:*` label;
2. one source, one term/query family, one bounded discovery batch;
3. live candidate identity is stable across repeated read-only probes;
4. candidate has EAN, SKU, product URL host, positive price, availability, and non-mojibake metadata;
5. no existing conflicting `products` row, `supermarket_products` row, staging row, or source/SKU duplicate;
6. explicit quality review approves category, name, brand, image, price, and source mapping;
7. rollback plan can delete created `price_history`, `supermarket_products`, and only newly-created `products` without touching pre-existing data;
8. post-create audit proves exact created IDs and no extra rows.

## Non-negotiable separation

| Mode | Can update existing rows | Can create product/source rows | Selection policy |
| --- | --- | --- | --- |
| `refresh-existing` | Yes | No | Existing `products` and source rows only. Missing rows are skipped or fail closed. |
| `discovery` | No during planning; yes only after approved create gate | Yes, but capped and rollback-bound | Missing rows only; never mixed with refresh-existing chunks. |

## Edge cases to design before implementation

| Edge case | Required behavior |
| --- | --- |
| Live EAN already exists globally but not for source | Treat as source-row discovery; no `products` create. |
| Live EAN absent globally | Treat as product + source-row discovery; require stronger quality review. |
| SKU maps to multiple DB rows or live products | Fail closed; no create. |
| Product URL host drift | Fail closed; no create. |
| EAN mismatch between search result and direct SKU lookup | Fail closed; no create. |
| Candidate disappears between probes | Fail closed or mark stale discovery evidence. |
| Price is null, zero, negative, or extreme delta | Fail closed unless a separate reviewed pricing policy accepts it. |
| Mojibake or unsafe HTML in metadata | Fail closed; no silent cleanup without evidence. |
| Duplicate discovery attempts for same EAN/source | Idempotency key must collapse to one pending review, not duplicate rows. |
| Existing product metadata is richer than live metadata | Protective merge only; never overwrite richer data blindly. |
| Rollback would delete a product now referenced by another source/promo | Do not delete product; rollback only source/history rows and record orphan decision. |

## Race conditions

| Race | Mitigation |
| --- | --- |
| Another run creates the EAN between audit and create | Recheck inside the transaction; switch to source-row-only or stop. |
| Another run creates the same source/EAN | Unique constraint handles conflict; transaction must report idempotent conflict, not insert history twice. |
| Staging rows appear after read-only audit | Recheck staging before create; existing pending staging blocks discovery. |
| Live VTEX data changes after review | Discovery evidence has TTL; stale evidence requires new review. |
| Rollback runs after later legitimate updates | Rollback must be artifact-bound to created IDs and timestamps, not broad EAN deletes. |
| Two sources discover same global EAN simultaneously | Product create is global/idempotent; source rows remain source-scoped. |

## Scalability plan

Discovery starts with tiny caps because row creation changes catalog shape:

| Stage | Cap | Exit gate |
| --- | ---: | --- |
| Read-only discovery audit | scan up to 50, select up to 5 | Report missing/existing split, blockers, idempotency keys, rollback plan. |
| First create pilot | max 1 product/source row | Exact post-create audit and rollback drill pass. |
| Controlled batch | max 5 source-scoped discoveries | No duplicate/staging conflicts, no post-create failures, review latency acceptable. |
| Production cadence candidate | still source-scoped; no all-source | Requires run ledger integration, alerting, owner, TTL, and throughput model. |

Discovery must not be used to chase the 90%/95% freshness target. Freshness recovery is refresh-existing first; discovery improves catalog coverage only after safety and ownership are proven.

## Create-gate rollout

Issue [#181](https://github.com/Mateocas1/ofertaSUPER/issues/181) promotes discovery from read-only planning to a create-capable gate without weakening `refresh-existing`.

| Gate | Contract |
| --- | --- |
| Read-only audit | `npm run audit:direct-refresh-discovery -- --source=<source> --terms=<term> --count=<1-5> --scan-count=<count-50> --issue-number=<issue>` emits discovery idempotency keys and rollback previews only. |
| Create prewrite | `npm run direct-refresh:discovery-create -- prewrite ... --selected-keys=<keys>` reruns live candidate selection and DB checks before emitting exact confirmation text. |
| Create apply | `npm run direct-refresh:discovery-create -- apply --prewrite=<report> --confirm="<exactConfirmation>"` writes only the prewrite-selected missing rows. |

The apply gate rechecks product/source/staging/SKU state inside the transaction, acquires a source-scoped discovery advisory lock, and inserts only the missing `products` row when classification is `product-and-source-discovery`, one `supermarket_products` row, and one `price_history` row. Wrong confirmation, stale prewrite, existing source rows, staging conflicts, duplicate source SKU, unsupported source, or unavailable lock fail closed before writes.

## Success gates for implementation planning

- [x] Add a read-only discovery audit that emits candidate identity, missing-row classification, quality flags, idempotency key, and rollback preview.
- [x] Add tests for missing global product, missing source row, duplicate SKU, host drift, stale evidence, staging conflict, and rollback-bound deletes.
- [x] Add a create-mode design that uses a transaction, advisory/source lock, final preflight, and exact created-row report.
- [ ] Keep `refresh-existing` no-create tests green; discovery must not weaken existing guards.
- [x] Produce a reviewer-friendly issue summary before any write-capable discovery PR.

## Next step

Run the create prewrite against a fresh PASS discovery audit, then stop unless the exact confirmation string and postwrite audit scope are reviewed. Do not use scheduler/all-source/repeated batches or DIA for discovery.
