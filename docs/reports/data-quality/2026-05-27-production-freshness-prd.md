# Production freshness PRD — finish ofertasSUPER without fake freshness

Status: `PROPOSED / NO DATA WRITES`

This PRD defines the path from the current honest-but-stale product to a production-grade price platform. It intentionally separates what can be fixed with UI/data policy from what cannot be guaranteed by scraping.

## Executive decision

ofertasSUPER is now safer and more honest than before, but it is **not globally fresh**.

| Question | Decision |
|---|---|
| Why does production still show `Dato viejo`? | Because the catalog is mostly old. Phase 4.1 refreshed only a controlled `leche`, `count=5`, per-source slice. With the current 12h SLA, even that slice ages out quickly. |
| Is this a UI bug? | Not primarily. The UI is telling the truth. The deeper issue is missing broad refresh, freshness-aware ranking, and schedules. |
| Can we promise every supermarket price is always current? | No. Official catalogs move, VTEX endpoints can drift/block, and checkout prices can differ. The fix is a measured freshness SLA plus honest fallback behavior. |
| What is the best next move? | First stop stale prices from leading public first-impression surfaces. Then run a read-only baseline, implement chunked refresh modes, refresh existing rows broadly, and only then enable schedules. |
| What must stay forbidden? | No all-source active write, no schedule reactivation, no live/current/global freshness copy, and no legacy broad writer until it has the same safety gates. |

## Evidence snapshot

Read-only exploration found this current shape:

| Item | Current evidence |
|---|---|
| Products | 2,759 |
| Source-product rows | 4,955 |
| Price-history rows | 4,973 |
| Ingestion runs | 63 |
| Global active `RUNNING` runs | 0 |
| Global `PENDING` staging rows | 0 |
| Fresh rows under current 12h SLA | 0 / 4,955 at the explored snapshot |
| Phase 4.1 coverage | About 30 source-product rows: six sources × five `leche` candidates |

Interpretation: the previous rollout proved the **safe write path**, not broad freshness.

## What is already solved

| Area | Current state |
|---|---|
| Public honesty | Stale prices are labeled instead of being marketed as live/current. |
| Phase 4.1 write safety | Active ingestion requires exact source/term/count/expected-EAN gates, `--confirm-write`, and post-write audits. |
| Controlled canary evidence | Disco, Vea, DIA, MAS, Carrefour and Jumbo completed count=5 with DB/API/cache evidence. |
| Redis remediation | Production Redis was corrected and validated for cache purge/rate limiting during Phase 4.1. |
| CI/deploy hygiene | GitHub/Vercel checks were brought green for the merged work; production deploys from `master`. |
| Repo hygiene | Dead code/dependencies were cleaned and validated with tests/typecheck/lint/build/static audit. |

## What is not solved

- Global catalog freshness.
- Broad product coverage.
- Recurring safe ingestion schedules.
- Freshness-aware ranking and price computation.
- Search/listing/cache/PWA freshness verification after writes.
- Production monitoring/alerting that proves freshness does not silently rot.
- A safe policy for new products/source rows outside explicit allowlists.
- A hardened replacement for the legacy `update-prices` write path.

## Non-fix realities

Some gaps cannot be made mathematically perfect. They need honest product design.

| Reality | Product response |
|---|---|
| A scraped price may differ from checkout price. | Show official source link, timestamp, and freshness label; never claim checkout guarantee. |
| VTEX search is not a complete catalog dump. | Treat search/category crawling as discovery with coverage targets, not “all products forever”. |
| Source APIs/hash may change or block. | Probe before writes; alert and stop instead of guessing. |
| Some products lack universal EAN/source mapping. | Separate existing-row refresh from discovery; require allowlists or reviewed creation policy. |
| A 12h SLA plus manual jobs guarantees stale data after 12h. | Either run schedules more often than the SLA or explicitly adjust/publicly explain the SLA. |
| Redis can fail open in the app. | Treat Redis as optional for UX continuity but mandatory for production freshness operations. |

## Production-final definition

“100% finished” means no known blind spot remains unhandled by either a fix, a guard, or an explicit no-fix product boundary.

| Gate | Target |
|---|---|
| Public first impression | Home and prominent listing/search surfaces do not lead with stale badges or stale cheap prices. |
| Ranking trust | Default ranking, best-price selection and offers avoid stale-first behavior. |
| Detail honesty | Product detail keeps row-level stale warnings, timestamps and source links. |
| Coverage | 5,000–10,000 source-product rows, with at least 500 high-demand EANs covered across 3+ sources where available. |
| Freshness SLA | ≥95% of publicly rankable source-product rows refreshed within the approved SLA, or automatically hidden/demoted. |
| Refresh safety | Existing-row refresh and discovery are separate modes with separate gates. |
| Schedules | Recurring jobs are enabled only after manual broad refresh evidence is GREEN. |
| Operations | Redis, DB, source health, cache purge, stuck-run detection, staging cleanup, deploy and alerts are verified. |
| Claims | Public copy never says live/current/global freshness unless the continuous gates above pass. |

## Product policy

### Freshness statuses

Use source-product `last_checked_at` plus source SLA.

| Status | Meaning | Public treatment |
|---|---|---|
| `fresh` | Checked within the approved SLA. | Eligible for best-price, offers, home/listing prominence and structured data. |
| `stale` | Checked outside the SLA. | Demote from default ranking and best-price hero; show warning on cards/detail. |
| `unknown` | Timestamp missing or unavailable. | Treat like stale for ranking; explain as limited coverage. |
| `unavailable` | Source/product not currently found or blocked. | Do not show as comparable price; keep audit trail. |

### Recommended rankability policy

Default policy for the next implementation PR:

1. Fresh rows win default ranking over stale rows.
2. Stale cheap prices do **not** determine the public “best price” unless no fresh price exists.
3. If all rows are stale, show a compact page-level snapshot warning instead of repeating loud card warnings everywhere.
4. Product detail remains fully honest: stale rows stay visible with timestamps and source links.
5. `price-asc` sorts by price **inside freshness buckets** by default: fresh cheap prices first, then stale cheap prices.
6. Promo/offers surfaces use fresh entries only unless explicitly labeled as historical/snapshot.

### Public copy policy

Allowed:

- `precio registrado`
- `último registro disponible`
- `lecturas del catálogo`
- `dato viejo`
- `puede estar desactualizado`
- `ver en el supermercado`

Forbidden until continuous gates pass:

- `precio actual`
- `precio en vivo`
- `tiempo real`
- `todos los precios actualizados`
- `mejor total actual`
- global “fresh/current” claims.

## Data policy

### Existing-row refresh mode

Purpose: make current catalog rows fresh without expanding the catalog.

Rules:

- No new `products` rows.
- No new `supermarket_products` rows.
- Every candidate must match an existing product + source row before write.
- Missing/unavailable rows are recorded in audit output, not silently ignored.
- Candidate/write EAN equality remains mandatory.
- Rollback plan is generated per chunk.

### Discovery mode

Purpose: add coverage after existing rows are safely fresh.

Rules:

- Separate command/mode from refresh.
- Explicit caps per source/term/category.
- New product/source-row creation requires quality gates:
  - valid EAN;
  - source URL;
  - sane positive price;
  - duplicate detection;
  - mojibake/encoding checks;
  - brand/name/category normalization;
  - rollback delete plan;
  - sampled manual review for each new category/source group.

### Legacy writer policy

The legacy `update-prices` path must not be used for production freshness until one of these happens:

1. it is hardened with the same snapshot/expected-EAN/post-write/rollback gates; or
2. it is deprecated and replaced by the generalized ingestion v2 refresh path.

Reason: it can write many rows based on oldest product names without the Phase 4.1 candidate equality model.

## Data discovery strategy

VTEX search is not a guaranteed full catalog export. Use layered discovery.

| Layer | Purpose | When allowed |
|---|---|---|
| Existing DB refresh | Make current public catalog trustworthy. | First. |
| High-demand query terms | Add user-relevant staples and repeat purchases. | After existing-row refresh tooling is green. |
| Category crawl/pagination | Broaden catalog by supermarket category. | Only after per-source endpoint behavior is researched. |
| Long-tail crawl | Maximize coverage. | Last; lower priority than stable freshness. |

Recommended seed groups:

| Group | Example terms | Notes |
|---|---|---|
| Staples | leche, yerba, arroz, aceite, azúcar, fideos, harina, huevos | First production scope. |
| Dairy | yogur, queso, manteca, crema | Good EAN overlap. |
| Cleaning | detergente, jabón, lavandina, suavizante | Useful basket comparisons. |
| Beverages | agua, gaseosa, jugo, cerveza | High search value. |
| Pantry | conservas, salsa, café, galletitas | Broad expansion. |
| Fresh/perishable | carne, pollo, fruta, verdura | Later; more source-specific and volatile. |

## Engineering requirements

### P0 — public first-impression cleanup

Goal: stale data no longer dominates public UX while the catalog is being repaired.

Requirements:

- Add freshness-aware product summary fields, preferably additive:
  - `hasFreshPrice`;
  - `freshMinPrice`;
  - `freshBestPriceEntry`;
  - `stalePriceCount`;
  - `rankFreshnessStatus`;
  - `displayPriceKind`.
- Default list/search ranking demotes stale products.
- `minPrice`, discount and best-price display stop being silently stale-first.
- Product cards use compact stale treatment in dense grids.
- All-stale result pages show one page-level snapshot warning.
- Product detail keeps row-level stale labels and source links.
- Search suggestions include freshness metadata and do not imply current price.
- Basket/canasta language removes `actual` unless computed from fresh rows.
- JSON-LD does not advertise stale prices as current `Offer` data without freshness constraints.

Tests:

- fresh result outranks stale cheap result in default search/listing;
- explicit `price-asc` respects freshness buckets;
- all-stale search page shows snapshot warning;
- product detail still renders stale row warnings;
- canasta copy has no `actual` overclaim;
- public copy guard includes home/search/ofertas/canasta/schema copy.

### P1 — read-only freshness baseline

Add a reusable read-only baseline script/report.

Example:

```bash
npm run audit:freshness-baseline -- --output=docs/reports/data-quality/<date>-freshness-baseline.json
```

Report:

- rows per source;
- fresh/stale/unknown/unavailable counts;
- oldest/newest `last_checked_at`;
- current SLA per source;
- EAN overlap matrix;
- stale examples currently winning public rankings;
- products with stale cheap price but fresher expensive price;
- source health/hash probe status;
- Redis ping and public API latency sanity;
- search/product cache-key coverage notes;
- global `RUNNING` runs and `PENDING` staging rows.

### P2 — read-only live drift audit

Add or extend a reusable drift script.

Example:

```bash
npm run audit:price-drift -- --source=carrefour --terms="leche,yerba,arroz" --count=25 --output=...
```

Report:

- fetched live candidates;
- matched DB rows;
- unmatched products/source rows;
- price/list-price drift buckets;
- suspicious deltas;
- duplicate EANs;
- zero/null/negative prices;
- mojibake/metadata issues;
- source URL validity;
- no secrets printed.

### P3 — generalized chunked refresh tooling

Generalize the Phase 4.1 safety model without weakening it.

Required gates:

- exactly one source per active write;
- explicit term group or existing-row chunk;
- explicit chunk size/count;
- expected EAN set or signed candidate snapshot;
- active dry-run exercising the same candidate set before write;
- same-run candidate/write equality;
- positive price and sane delta thresholds;
- no new product/source rows in refresh mode;
- post-write DB audit per chunk;
- API/cache audit sample per chunk;
- rollback artifact per chunk;
- aggregate report per source/term group.

Batch ladder:

| Batch | Suggested size | Expansion rule |
|---|---:|---|
| Canary | 5/source | Already proven for `leche`; keep for new source/category behavior. |
| Small | 25/source/term group | Requires candidate/write equality + post-write audit GREEN. |
| Medium | 100/source/window | Requires chunked transactions and aggregate audit GREEN. |
| Broad | 500–1,000/source/day | Only after repeated medium GREEN evidence. |

Do not jump directly from count=5 to all-source/all-catalog.

### P4 — rollback and incident recovery

Broad refresh needs executable recovery, not only review notes.

Requirements:

- pre-write snapshot per touched source-product row;
- price-history mutation summary;
- generated rollback plan;
- rollback command requiring explicit confirmation;
- rollback verification excluding normal freshness-SLA expectations;
- created-row cleanup only for discovery mode and only with explicit approval;
- stop-on-first-failed-predicate rule preserved.

### P5 — schedules and monitoring

Schedules remain off until manual broad refresh passes.

Minimum schedule design:

| Workflow | Cadence | Behavior |
|---|---|---|
| Source health probe | hourly or every 6h | Read-only, alerts on hash/block/source/Redis failure. |
| Existing-row refresh | daily or twice daily depending on SLA | Source-serialized, chunked, no new products. |
| Discovery crawl | weekly/manual | Separate reviewed policy; capped new rows. |
| Cleanup/history retention | monthly/manual until proven | Dry-run first; preserve incident evidence. |

Monitoring requirements:

- stuck `RUNNING` ingestion-run alert;
- old `PENDING` staging-row alert;
- source health/hash/block alert;
- high rejection-rate alert;
- stale % by source alert;
- Redis ping/latency alert;
- cache purge failure alert;
- public API latency alert after writes;
- alert delivery test to the chosen human channel;
- thresholds that do not spam during intentional rollout phases.

### P6 — Redis/cache/PWA correctness

Current app behavior fails open when Redis is absent. That is acceptable for public browsing but not enough for operational freshness.

Requirements:

- Verify Vercel and GitHub Upstash envs without printing secrets.
- Verify Redis `PING` before any scheduled write.
- Verify rate-limit decrement before schedule enablement.
- Fix or document `metrics --dry-run` Redis dedupe side effect.
- Purge and verify product detail cache keys.
- Purge/expire and verify search/listing cache keys.
- Validate PWA/browser stale content behavior after a write.
- If purge fails: retry once, wait TTL, recheck, then stop if stale content remains.

### P7 — CI/deploy/ops hardening

Operational gaps to close before “final”:

- Align Lighthouse push trigger with repo default branch `master` or require PR/manual Lighthouse for release gates.
- Keep accessibility/SEO hard-gated; performance can remain advisory unless the user chooses otherwise.
- Confirm production envs point to the approved Supabase/Vercel/Upstash/Clerk targets without printing secrets.
- Run `npx prisma migrate status --schema prisma/schema.prisma` before active broad writes.
- Preserve Supabase RLS/server-side Prisma posture.
- Treat `Ingest Shadow` as ops-mutating, not read-only.
- Do not schedule cleanup until retention/evidence policy is approved.

## Active rollout runbook

Use this only after P0–P3 are implemented and reviewed.

1. Confirm branch, commit, PR, approved issue and clean working tree.
2. Confirm no global active `RUNNING` runs and no old active-source `PENDING` staging rows.
3. Confirm Supabase project/ref and DB URLs point to the approved environment.
4. Run baseline audit.
5. Run source health probes.
6. Run one source + one chunk/term group in active dry-run.
7. Review candidate snapshot and expected EAN/value equality.
8. Run the active write with explicit confirmation.
9. Run post-write DB audit.
10. Run API/cache/PWA sample audit.
11. Generate rollback artifact and verify rollback feasibility.
12. Commit sanitized report.
13. Fresh reviewer audits evidence.
14. Expand only one dimension at a time: source, term group, or chunk size.

Stop immediately on any failed predicate.

## Acceptance criteria

### UX and copy

- [ ] Home first viewport has no stale badge.
- [ ] Default search/listing demotes stale cheap prices.
- [ ] Product cards do not repeat noisy stale helper copy in dense grids.
- [ ] All-stale result pages show one clear snapshot warning.
- [ ] Product detail keeps stale row warnings and official source links.
- [ ] Canasta copy avoids `actual` unless all computed prices are fresh.
- [ ] JSON-LD does not overclaim stale offers.
- [ ] `/metodologia` explains freshness, stale data, coverage and source links.
- [ ] Public copy has no live/current/global freshness overclaim.

### Data freshness and coverage

- [ ] Existing rows for all six sources are refreshed or explicitly marked unavailable.
- [ ] ≥95% of publicly rankable rows are within the approved SLA.
- [ ] At least 5,000 source-product rows are refreshed in the current SLA window or intentionally hidden/demoted.
- [ ] At least 500 high-demand EANs have multi-source coverage where market data supports it.
- [ ] Missing source rows are documented as not found/unavailable, not silently ignored.

### Ingestion safety

- [ ] No active write can run without source, scope/chunk, expected candidates and `--confirm-write`.
- [ ] Refresh mode cannot create new products or source rows.
- [ ] Discovery mode has caps, review and rollback delete plan.
- [ ] Every active chunk has pre-write snapshot and post-write audit.
- [ ] Rollback command/verification exists and is sampled before broad rollout.
- [ ] No all-source concurrent writes.
- [ ] Legacy `update-prices` is hardened or kept out of production freshness scheduling.

### Operations

- [ ] Redis ping, cache purge and rate-limit behavior are verified.
- [ ] Product-detail, search/listing and PWA cache behavior are verified after writes.
- [ ] Source health probes are GREEN before writes.
- [ ] Alerts exist for stuck runs, old staging rows, source failure, high rejection rate, stale % regression, Redis failure and cache purge failure.
- [ ] Alert delivery has been tested.
- [ ] GitHub Actions/Vercel branch/deploy gates are aligned with `master`.
- [ ] Production deploy, smoke checks and public API checks are green after changes.

## Recommended PR sequence

### PR 1 — public stale first-impression cleanup

No DB writes.

- Freshness-aware ranking/display fields.
- Stale demotion for default search/listing/offers.
- Compact card stale treatment and all-stale page warning.
- Canasta/schema copy guard.
- Tests for stale cheap price not winning default UX.

### PR 2 — read-only baseline/drift audits

No DB writes.

- Add `audit:freshness-baseline`.
- Add/extend `audit:price-drift`.
- Produce sanitized sample report.
- Include current DB freshness snapshot and public stale-ranking examples.

### PR 3 — refresh-existing mode and chunked gates

Tooling only; no broad active write in the PR itself.

- Generalize count=5 gates.
- Add refresh-existing mode that cannot create rows.
- Add candidate snapshot/hash/equality model.
- Add aggregate post-write audit.
- Add rollback plan output.

### PR 4 — operations hardening

No broad active write until reviewed.

- CI branch trigger alignment.
- Redis/cache/search/PWA verification tooling.
- Stuck-run and staging alert checks.
- Legacy update-prices deprecation/hardening decision.

### PR 5+ — controlled active refresh reports

Operational rollout PRs/reports.

- One source, one term group/chunk at a time.
- Increase chunk size only after GREEN evidence.
- Commit sanitized reports.
- Fresh reviewer before expansion.
- Schedules remain off until broad refresh is proven.

### PR N — schedules

Only after manual broad refresh is GREEN.

- Source health schedule first.
- Existing-row refresh schedule second.
- Discovery schedule later, if needed.
- Cleanup schedule last, after retention policy is approved.

## Open decisions with recommended defaults

| Decision | Recommended default |
|---|---|
| Public stale threshold | Use source SLA; if 12h is too strict operationally, change SLA deliberately and update copy. |
| Stale display in default results | Demote, do not hide globally. Hide only from hero/offers/best-price prominence. |
| `price-asc` behavior | Sort within freshness buckets: fresh cheap first, stale cheap second. |
| First coverage target | 5,000 source-product rows refreshed, then expand toward 10,000. |
| First data scope | Existing DB rows first, then staples/dairy/cleaning/beverages. |
| Fresh/perishable scope | Delay until packaged staples are stable. |
| Discovery product creation | Disabled by default; enable only under capped discovery mode. |
| Alert channel | Pick one human-monitored channel before schedules; prove delivery. |
| Cleanup retention | Keep manual until rollback/incident evidence needs are settled. |

## Done means

This phase is complete only when every known blind spot has one of these statuses:

1. **fixed** — code/tooling/docs changed and verified;
2. **guarded** — cannot run unsafely because a gate stops it;
3. **monitored** — production drift/failure alerts a human;
4. **explicit no-fix** — the project documents the limitation and does not overclaim.

Until then, the correct public stance is:

> ofertasSUPER shows stored supermarket catalog readings with freshness labels. Some records may be stale. The product is being hardened toward broader monitored freshness, but it does not promise live checkout prices.
