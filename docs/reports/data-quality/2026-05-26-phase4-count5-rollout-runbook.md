# Phase 4 Count=5 Rollout Runbook

This is the sealed strategy for the next price-refresh rollout step. It replaces the earlier loose `count=5` plan.

## Decision

**Do not run active `count=5` writes yet.**

Phase 4 now has two parts:

1. **Phase 4.0 — tooling first:** implement and validate the missing safety tooling with TDD.
2. **Phase 4.1 — count=5 rollout:** execute one source at a time only through the approved tooling.

Manual ad-hoc `count=5` active commands are not approved. The Round 3 review found that live VTEX results can drift between candidate audit and active write; without an expected-EAN gate, rollback may not have snapshots for unexpectedly touched rows.

## Amendment — Jumbo allowlisted source-row mini-phase

During Phase 4.1, Jumbo's top-5 `leche` candidates included EAN `7790742335500`, an existing global product and legitimate Jumbo VTEX result that had no Jumbo `supermarket_products` row. The original existing-row-only gate correctly blocked it.

The approved resolution was a separate, explicit mini-phase for Jumbo only:

- source: `jumbo`;
- EAN: `7790742335500`;
- `newProducts` must remain `0`;
- `supermarketProductsCreated` must be exactly `1`;
- `supermarketProductsUpdated` must be exactly `4`;
- default candidate audit behavior remains fail-closed for missing source rows;
- rollback requires removing the created source row and associated new history before snapshot equality can pass.

Evidence:

- `audit/phase4-count5/jumbo/diagnosis.md`
- `audit/phase4-count5/jumbo/mini-phase-runbook.md`
- `audit/phase4-jumbo-final-review.md`

All other Phase 4.1 source writes remain under the existing-row-only rule.

## Required Phase 4.0 tooling

Before any active `count=5` write, add tooling that makes the rollout mechanically enforceable.

### Tool A — candidate audit script

Add a read-only script, for example:

```bash
npm run audit:ingest-candidates -- --source=<source> --terms="leche" --count=5 --limit=1 --output=<path>
```

Required behavior:

- uses the same VTEX adapter/normalizer path as ingestion;
- requires exactly one source and exactly one term;
- returns exactly five distinct EAN candidates;
- rejects null/non-positive prices;
- verifies every candidate already has:
  - a `products` row;
  - a `supermarket_products` row for the source;
- snapshots full mutable fields for rollback:
  - `products`: `brand`, `description`, `image_url`, `images`, `category`;
  - `supermarket_products`: `price`, `list_price`, `reference_price`, `reference_unit`, `is_available`, `sku_id`, `seller_id`, `product_url`, `last_checked_at`;
  - latest `price_history` rows;
  - current `max(price_history.id)`;
- fails on mojibake in candidate metadata (`Ã`, `Â`, `�`) except explicit pre-existing DIA waiver;
- writes a JSON artifact containing `source`, `term`, `count`, `candidateEans`, candidate values, DB snapshots, and `createdAt`.

### Tool B — expected-EAN gate in ingestion

Add an ingestion guard, for example:

```bash
INGESTION_V2=active npm run ingest -- --source=<source> --terms="leche" --count=5 --limit=1 --batch-size=50 --expected-eans=<comma-separated-eans> --confirm-write
```

Required behavior:

- after staging/validation and **before reconciliation**, compare the validated candidate EAN set against `--expected-eans`;
- require exact set equality: no missing EANs, no extra EANs;
- require exactly five expected EANs for Phase 4;
- fail nonzero before reconciliation on mismatch;
- include mismatch details in stdout/stderr without leaking secrets.

This gate is mandatory because active write re-fetches live VTEX data. Candidate audit alone is not enough.

### Tool C — pre-reconcile candidate assertions

Before reconciliation in active mode, assert:

- every validated candidate has positive non-null `price`;
- exactly one source is being processed;
- exactly one query was sent;
- candidate count is exactly five;
- expected-EAN set matches actual validated EAN set.

If any assertion fails, stop before public DB mutation.

### Tool D — post-write audit script

Add or use a canonical read-only audit command, for example:

```bash
npm run audit:ingest-run -- --snapshot=<candidate-audit-json> --write-json=<active-write-json> --output=<path>
# Optional only if already known:
# npm run audit:ingest-run -- --run-id=<run-id> --snapshot=<candidate-audit-json> --write-json=<active-write-json> --output=<path>
```

Required behavior:

- resolves exactly one `ingestion_run` from the write JSON evidence before auditing:
  - preferred: active write JSON exposes a single source `runId`;
  - fallback: Tool D derives exactly one run from `batchId`, source, and snapshot timestamp;
  - if zero or multiple candidate runs are found, stop;
- verifies run is `SUCCESS`;
- verifies `products_fetched = products_staged = products_promoted = 5`;
- verifies `products_rejected = 0` and `error_summary = null`;
- verifies all staging rows are `PROMOTED`;
- verifies touched EAN set exactly equals snapshot EAN set;
- verifies `reconciliation.newProducts === 0` and `reconciliation.supermarketProductsCreated === 0` from captured write JSON;
- verifies no global active-source `RUNNING` runs or `PENDING` staging rows remain;
- compares all mutable `supermarket_products` fields, not only price:
  - `price`, `list_price`, `reference_price`, `reference_unit`, `is_available`, `sku_id`, `seller_id`, `product_url`, `last_checked_at`;
- compares product metadata fields against snapshot and flags any unexpected/malformed merge;
- verifies latest `price_history` matches the new `price`/`list_price` for rows whose price/list price changed;
- verifies `priceHistoryInserted` equals the expected changed-row count from pre/post comparison;
- applies exact delta formula:

```text
absolute_delta_percent = abs(new_price - pre_write_price) / pre_write_price * 100
```

Delta gates:

- if `pre_write_price` is null or <= 0: stop;
- `<= 50%`: pass;
- `> 50% and <= 200%`: warning and source URL manual check before continuing;
- `> 200%`, new price `0`, or new price null: stop and prepare rollback.

### Tool E — rollback verification mode

Rollback verification is distinct from normal post-write verification.

If rollback is approved and executed, success means:

- restored `products` fields equal snapshot;
- restored `supermarket_products` fields equal snapshot;
- `price_history` rows created after the snapshot boundary for touched IDs are removed or explicitly retained by approval;
- product-detail API matches the restored DB value after cache handling, excluding freshness/SLA assertions.

Rollback verification must **not** require fresh SLA or `freshnessStatus === "fresh"`, because a correct rollback may restore stale `last_checked_at` values.

## Hard boundaries

- Shell: **Git Bash / Pi bash only**. Do not run inline-env commands from `cmd.exe` or PowerShell.
- No schedule.
- No all-source active ingestion.
- No deploy, push, or commit during this rollout.
- No global freshness or live-price claim.
- Active/write commands must use exactly one source. A comma in `--source` is a stop for every per-source command.
- Active/write commands must use exactly one query term. A comma in `--terms` is a stop for every per-source command.
- The only allowed query term in Phase 4.1 is `leche`.
- Alerts are disabled for canary writes with `SCRAPER_ALERT_WEBHOOK_URL=` to avoid noisy freshness alerts while global freshness is intentionally low.

## Phase 4.0 validation gates

The tooling phase is complete only when:

- RED tests prove the old behavior was unsafe:
  - no expected-EAN gate;
  - null/zero candidate price could reach reconciliation;
  - candidate audit command missing;
- GREEN tests pass for candidate audit, expected-EAN mismatch, exact count=5, pre-reconcile null/zero price stop, no-created-row predicates, Tool D run resolution from write JSON/batch evidence, post-write audit predicates, rollback verification mode;
- `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` pass;
- fresh review finds no blockers in the tooling diff.

Only after Phase 4.0 is green can Phase 4.1 begin.

## Phase 4.1 source order

1. `disco`
2. `jumbo`
3. `vea`
4. `dia`
5. `mas`
6. `carrefour`

## Phase 4.1 preflight

Run once before touching data.

| Gate | Command / check | Pass condition |
|---|---|---|
| Code freeze | `git status --short`, `git diff --name-only`, and current `git rev-parse HEAD` | Working tree contains only reviewed Phase 0-4 source/test/docs changes plus evidence files. Stop on any unexpected ingestion/runtime file change. |
| Validation | `npm test && npm run typecheck && npm run lint && npm run build` | All exit `0`. Existing Next workspace-root warning is non-blocking. |
| Supabase target | `supabase projects list --output json` plus env URL inspection | linked project is `gbpgqhasveytpptxsztw`; local DB URLs also point to `gbpgqhasveytpptxsztw`. |
| VTEX health | run six one-source probes: `npm run probe:vtex -- --source=<source> --query="leche" --count=1` | every source `isHealthy=true`, `hashValid=true`, `productsReturned>=1`. Multi-source probe is allowed only for read-only convenience; per-source rollout commands must never use comma-separated sources. |
| Global orphans | DB read-only check for all active-source `ingestion_run.status='RUNNING'` and all active-source `staging_product.status='PENDING'` | zero unresolved rows before starting Phase 4.1. If any exist, stop and resolve before continuing. |

## Phase 4.1 per-source sequence

Repeat the full sequence for one source. Do not start the next source until every gate below is green.

### 1. Candidate audit

Run Tool A and save JSON evidence.

Pass conditions:

- exactly one source slug;
- exactly one term: `leche`;
- exactly 5 distinct candidate EANs;
- every candidate has positive non-null `price`;
- every candidate has existing `products` and source `supermarket_products` rows;
- no new mojibake except explicit DIA waiver;
- evidence includes rollback snapshot and exact `candidateEans`.

### 2. Active dry-run rehearsal

Run active dry-run with `--expected-eans` from the candidate audit.

```bash
INGESTION_V2=active npm run ingest -- --dry-run --source=<source> --terms="leche" --count=5 --limit=1 --batch-size=50 --expected-eans=<candidate-eans>
```

Parse stdout JSON. Pass conditions:

- `mode === "active"`;
- `dryRun === true`;
- `sourceCount === 1`;
- `sources[0].slug === <source>`;
- `sources[0].queriesSent === 1`;
- `totals.fetched === 5`;
- `totals.staged === 5`;
- `totals.rejected === 0`;
- `totals.failedSources === 0`;
- `requestedSourceHealthFailed === false`;
- `reconciliation !== null`;
- `reconciliation.totalCandidates === 5`;
- `reconciliation.distinctEans === 5`;
- `reconciliation.newProducts === 0`;
- `reconciliation.supermarketProductsCreated === 0`;
- `reconciliation.promoted === 5`.

If active dry-run does not show reconciliation, stop. Shadow dry-run alone is not enough for Phase 4.

### 3. Active write

Run the write with the same expected EAN set.

```bash
SCRAPER_ALERT_WEBHOOK_URL= INGESTION_V2=active npm run ingest -- --source=<source> --terms="leche" --count=5 --limit=1 --batch-size=50 --expected-eans=<candidate-eans> --confirm-write
```

Pass conditions:

- command exits `0`;
- `mode === "active"`;
- `dryRun === false`;
- `sourceCount === 1`;
- `sources[0].slug === <source>`;
- `sources[0].queriesSent === 1`;
- `totals.fetched === 5`;
- `totals.staged === 5`;
- `totals.promoted === 5`;
- `totals.rejected === 0`;
- `totals.failedSources === 0`;
- `requestedSourceHealthFailed === false`;
- `reconciliation.totalCandidates === 5`;
- `reconciliation.distinctEans === 5`;
- `reconciliation.newProducts === 0`;
- `reconciliation.supermarketProductsCreated === 0` for standard existing-row sources;
- for the approved Jumbo mini-phase only, `reconciliation.supermarketProductsCreated === 1` and `reconciliation.supermarketProductsUpdated === 4` for allowlisted EAN `7790742335500`;
- `reconciliation.promoted === 5`;
- `metrics.sentAlerts` is empty.

If the process exits non-zero, times out, or prints no parseable JSON, stop. Query the newest run and staging rows for that source before doing anything else.

### 4. Immediate DB audit

Run Tool D.

Pass conditions:

- run is `SUCCESS`;
- `products_fetched = products_staged = products_promoted = 5`;
- `products_rejected = 0`;
- `error_summary = null`;
- all staging rows for the run are `PROMOTED`;
- no active-source `RUNNING` run remains globally;
- no active-source `PENDING` staging row remains globally;
- touched EAN set exactly equals candidate snapshot EAN set;
- no product row was created;
- no supermarket product row was created for standard existing-row sources;
- for the approved Jumbo mini-phase only, exactly one allowlisted Jumbo `supermarket_products` row for `7790742335500` was created;
- every mutable `supermarket_products` field is audited;
- product metadata changes pass audit;
- every touched price is positive and non-null;
- latest `price_history` matches changed rows;
- `priceHistoryInserted` equals expected changed-row count;
- delta gates pass.

### 5. Cache/product-detail API audit

Product detail API uses a 300s cache. Search API and static pages have separate caches/revalidation. Phase 4 validates DB and product-detail API correctness only; it does **not** claim search/page freshness.

Preferred path:

1. delete exact Redis keys `product:detail:<ean>` for touched EANs, if Redis credentials are available;
2. fetch `https://ofertas-super.vercel.app/api/products/<ean>`;
3. compare expected source entry against DB.

Fallback path if cache cannot be purged:

1. run immediate API check and record whether it matches DB;
2. if stale, wait 310 seconds once and retry;
3. if still stale after retry, stop.

API pass conditions:

- HTTP `200`;
- expected source entry exists;
- API mutable source fields match DB for the fields exposed by the API;
- API `lastCheckedAt` equals DB `last_checked_at` or is not older than the DB value;
- `freshnessStatus === "fresh"`;
- response time does not exceed 20s.

Latency handling:

- `<= 5s`: pass;
- `> 5s and <= 20s`: pass with performance warning;
- `> 20s` or timeout: stop and create performance blocker before more writes.

## Rollback / remediation plan

Rollback is considered after any failed post-write DB/API gate **or any failed/uncertain active write that may have mutated public rows**. Do not continue to another source while rollback is pending.

Prepared rollback must restore public product/price rows from the candidate audit snapshot:

1. restore each touched `products` row to its pre-write values for `brand`, `description`, `image_url`, `images`, and `category`;
2. restore each existing `supermarket_products` row to its pre-write values;
3. delete `price_history` rows for touched supermarket product IDs where `id > pre_write_max_price_history_id` or `scraped_at >= pre_write_started_at`;
4. if a created `product` or `supermarket_product` appears despite gates, stop and request a separate cleanup plan; do not silently delete it;
5. leave `ingestion_run` and `staging_product` evidence intact unless a separate cleanup is explicitly approved;
6. run Tool E rollback verification;
7. run rollback-specific cache/product-detail API verification against restored DB values, excluding `freshnessStatus === "fresh"` and SLA/freshness requirements.

Because rollback is destructive, request explicit human approval before executing it unless the user pre-authorizes rollback for this exact phase.

## Interruption / orphan recovery

If any command times out, is interrupted, exits nonzero, or prints no parseable JSON:

1. stop the rollout;
2. identify the newest `ingestion_run` for the source and any run started after the candidate snapshot timestamp;
3. query all staging rows for those run IDs;
4. if any run is `RUNNING` or any staging row is `PENDING`, do not continue;
5. if public mutation may have occurred, treat rollback as eligible even without a completed DB/API gate, then decide with the user whether to mark failed, rerun, rollback public rows, or leave evidence intact;
6. rerun the global orphan gate before any next source.

## Stop rules

Stop immediately if any of these happen:

- Phase 4.0 tooling is not implemented, tested, and reviewed;
- unexpected dirty working-tree change;
- Supabase ref mismatch;
- source health failure;
- source count is not exactly 1 for per-source commands;
- query count is not exactly 1 for per-source commands;
- candidate set is not exactly 5 distinct existing source/EAN rows, except the approved Jumbo mini-phase where exactly one missing source row must be allowlisted as `7790742335500`;
- written/touched EAN set differs from the candidate snapshot;
- `fetched !== 5`, `staged !== 5`, or `promoted !== 5`;
- any rejection or `PARTIAL` run;
- nonzero exit without understood failure;
- unparseable command output;
- active dry-run does not exercise reconciliation;
- `reconciliation.newProducts !== 0`;
- `reconciliation.supermarketProductsCreated !== 0` for standard existing-row sources;
- Jumbo mini-phase `reconciliation.supermarketProductsCreated !== 1` or `reconciliation.supermarketProductsUpdated !== 4`;
- any touched price is null or non-positive;
- unapproved new product/supermarket product creation would occur;
- new mojibake appears;
- product metadata changes fail audit;
- expected price history is missing or mismatched;
- product-detail API is stale after cache handling;
- search/page surfaces are required for a claim in this phase;
- product-detail API response exceeds 20s or times out;
- rollback is needed.

## Evidence to save

For each source, save:

- candidate audit JSON;
- active dry-run JSON;
- active write JSON;
- DB audit JSON;
- API audit JSON;
- final source verdict.

The final Phase 4 report must include one row per source and a terminal recommendation:

- `GO next source`;
- `STOP and rollback/recover`;
- `STOP performance`;
- `STOP data-quality`;
- `PHASE 4 COMPLETE`.

## Confidence statement

The original Phase 4 strategy was not safe enough. Round 1, Round 2, and Round 3 blind reviews found loopholes. This corrected strategy stops the rollout until missing safety tooling exists, then requires candidate/write EAN equality before reconciliation, exact count=5 gates, zero-created-row gates, positive price assertions, product metadata snapshots, complete mutable-field audits, price-history validation, rollback verification semantics, global orphan recovery, cache-aware product-detail API checks, explicit product-detail scope, numeric latency/delta thresholds, encoding gates, alert handling, and per-source audit before continuing.
