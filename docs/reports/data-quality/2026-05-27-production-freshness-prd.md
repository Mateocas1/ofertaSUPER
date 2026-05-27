# Production freshness PRD — from honest stale data to a finished price platform

Status: `PROPOSED / NO DATA WRITES`

This PRD defines the next production-hardening goal: stop leading with stale prices in public first-impression surfaces, then build a measured rollout that gives ofertasSUPER a genuinely fresh, broad catalog without reintroducing unsafe ingestion.

## Executive decision

The current app is safer and more honest than before, but it is **not globally fresh yet**.

| Question | Answer |
|---|---|
| Why does production still show `Dato viejo`? | Because Phase 4.1 refreshed only a controlled `leche`, `count=5`, per-source slice. Most catalog rows are still older than the freshness SLA. |
| Was the previous work wasted? | No. It removed misleading live/current claims, added freshness labels, fixed CI/deploy/env/cache issues, and created fail-closed ingestion safety gates. |
| What is still missing for “100% finished”? | A product policy for stale items, a scalable catalog coverage plan, a controlled bulk refresh rollout, schedules with monitoring, and acceptance gates proving freshness at scale. |
| Recommended next move | First clean public first-impression surfaces; then run a reviewed freshness rollout with measurable coverage targets. |

## What we actually solved so far

| Area | Current state |
|---|---|
| Public honesty | Stale prices are labeled as stale instead of being presented as current/live. |
| Active write safety | Active ingestion now needs exact source/term/count/expected-EAN gates plus post-write audits. |
| Count=5 rollout | `leche`, five candidates per source, all six sources completed with DB/API/cache audits. |
| Redis/cache | Production Redis was fixed and validated for cache purge/rate limiting. |
| CI/deploy | GitHub/Vercel checks pass; production deploys from `master`. |
| Code hygiene | Confirmed dead code was removed; `ruff`, `vulture`, `knip`, tests, typecheck, lint and build are clean. |

What we did **not** solve yet:

- global catalog freshness;
- broad product coverage;
- recurring safe ingestion schedules;
- guarantee that “best price” rankings exclude stale values;
- production-grade monitoring and alerting for freshness drift.

## Product goal

A normal user should be able to open `https://ofertas-super.vercel.app/`, search common supermarket products, and trust that:

1. prominent prices are recent enough to compare;
2. stale prices do not lead rankings without warning;
3. every price has an official supermarket source link when available;
4. the product explains coverage gaps instead of hiding them;
5. ingestion freshness is monitored and recoverable.

## Definition of “production final”

“100% finished” cannot mean literally every SKU from every supermarket forever. Retail catalogs are dynamic, search APIs drift, products disappear, and some EANs are source-specific.

For this project, production final should mean:

| Gate | Target |
|---|---|
| Public first impression | Home and featured sections show no stale badges. |
| Search trust | Search results either show fresh prices or clearly degrade stale rows below fresh ones. |
| Core staples coverage | At least 500–1,000 high-demand EANs have coverage across 3+ sources where available. |
| Broad catalog coverage | At least 5,000–10,000 source-product rows across the six configured sources. |
| Freshness SLA | ≥95% of publicly rankable source-product rows refreshed within their source SLA or hidden/demoted. |
| Source health | Six sources probe healthy before scheduled refresh runs. |
| Rollback | Every active rollout has snapshot, post-write audit, and rollback verification. |
| Monitoring | Freshness, failures, promoted count, rejection rate, Redis health and API latency are visible. |
| Claims | Public copy never says live/current/global freshness unless the gates above pass continuously. |

## Two-track strategy

### Track A — immediate public trust cleanup

Goal: the portfolio first impression should not start with `Dato viejo`.

| Requirement | Acceptance criteria |
|---|---|
| Hide stale badges from home preview surfaces. | Home/product preview sections use only curated non-stale rows or neutral copy like `Último registro disponible`; no `Dato viejo` above the fold. |
| Demote stale rows in listing/search ranking. | When `sort=relevance` or default listing is used, fresh rows rank ahead of stale rows. |
| Preserve honesty on detail pages. | Product detail still labels stale source rows; no stale information is hidden where a user makes a precise decision. |
| Methodology remains explicit. | `/metodologia` explains stored records, source freshness and coverage. |

Non-goal: this track does not pretend data is fresh. It prevents stale records from dominating the public first impression.

### Track B — real freshness rollout

Goal: create and maintain a large, fresh catalog under controlled ingestion.

| Phase | Purpose | Output |
|---|---|---|
| B0 — read-only baseline | Measure current freshness, coverage and drift. | Baseline report: rows/source, EAN overlap, stale %, drift sample, top categories. |
| B1 — catalog seed taxonomy | Define how we discover products beyond one query. | Terms/category plan, expected volume, rate limits, exclusions. |
| B2 — tooling expansion | Generalize count=5 gates to larger batches. | Candidate audit and post-write audit support batch windows/chunks. |
| B3 — controlled bulk refresh | Refresh source by source, chunk by chunk. | Fresh rows for approved terms/categories with audit artifacts. |
| B4 — ranking policy | Prevent stale data from winning rankings. | Freshness-aware sorting, filters and tests. |
| B5 — schedules | Re-enable recurring jobs only after gates pass. | Scheduled workflows with concurrency, alerts, dry-run fallback and rollback policy. |

## What we need to scrape “all” or a very large catalog

### 1. Product discovery strategy

VTEX search is not a full database dump. We need a controlled discovery method.

| Method | Pros | Cons | Recommendation |
|---|---|---|---|
| Query-term crawl | Easy to control; works with current adapter. | Can miss products not covered by terms. | Use first for staples and portfolio completeness. |
| Category crawl | Better breadth by department. | More pagination/API behavior to validate per source. | Add after query-term crawl is safe. |
| Existing DB refresh | Fastest way to make current catalog fresh. | Does not discover missing products. | Mandatory first bulk refresh. |
| Official sitemap/category pages | Potential breadth. | Scraping/rate-limit/legal variability. | Research per source before use. |

Recommended seed order:

1. refresh existing DB rows;
2. expand with high-demand search terms;
3. expand with category crawl if VTEX endpoint supports stable pagination;
4. only then consider long-tail discovery.

### 2. Taxonomy for high-demand terms

Start with controlled term groups instead of “all at once”.

| Group | Example terms | Why first |
|---|---|---|
| Staples | leche, yerba, arroz, aceite, azúcar, fideos, harina, huevos | High user value and easy sanity checks. |
| Dairy | leche, yogur, queso, manteca, crema | Strong EAN overlap and recurring purchases. |
| Cleaning | detergente, jabón, lavandina, suavizante | Useful basket comparisons. |
| Beverages | agua, gaseosa, jugo, cerveza | Common price comparison behavior. |
| Pantry | conservas, salsa, café, galletitas | Large catalog expansion. |
| Fresh/perishable | carne, pollo, fruta, verdura | More source-specific EANs; run later with stricter review. |

### 3. Batch model

The current count=5 tooling is safe but too small. For production freshness we need chunked batches.

| Batch | Suggested size | Gate |
|---|---:|---|
| Canary | 5/source | Existing Phase 4.1 gate. |
| Small batch | 25/source/term group | Exact candidate/write equality, no high drift without manual review. |
| Medium batch | 100/source/window | Snapshot chunking, audit summary, API/cache sample. |
| Broad refresh | 500–1,000/source/day | Only after small/medium batches are green. |

Never jump from count=5 to all-source/all-catalog in one run.

### 4. Data model and API policy

Current schema can support a broader rollout, but production final needs clearer policy.

| Area | Needed policy |
|---|---|
| Freshness status | Stored per source-product from `last_checked_at` and source SLA. |
| Ranking | Fresh entries first; stale entries excluded or demoted depending on threshold. |
| Missing source rows | Default fail-closed for controlled refresh; explicit allowlists only when audited. |
| Product creation | Allow new global products only in a separate discovery phase, not a refresh phase. |
| Price history | Insert only when price/list price changes or freshness policy requires traceability. |
| Cache | Purge product-detail/search/listing keys after active writes. |

## Required engineering work

### P0 — first-impression stale cleanup

- Add freshness-aware home/listing selection.
- Do not show `Dato viejo` in home hero/product preview.
- Keep detail-page stale warnings.
- Tests:
  - home copy has no `Dato viejo`;
  - stale rows are demoted in default search/listing;
  - methodology still explains stale records.

### P1 — reusable freshness baseline audit

Add a read-only script, for example:

```bash
npm run audit:freshness-baseline -- --output=docs/reports/data-quality/<date>-freshness-baseline.json
```

Report:

- rows per source;
- stale/fresh/unknown counts;
- newest/oldest `last_checked_at`;
- EAN overlap matrix;
- top stale public-ranking examples;
- source API probe status;
- Redis/API latency sanity.

### P2 — reusable live drift audit

Add a read-only script, for example:

```bash
npm run audit:price-drift -- --source=carrefour --terms="leche,yerba,arroz" --count=25 --output=...
```

Report:

- fetched live candidates;
- matched existing DB rows;
- price/list-price drift;
- missing source rows;
- candidate EAN duplicates;
- suspicious deltas;
- mojibake/metadata quality.

### P3 — chunked refresh tooling

Generalize existing Phase 4 tooling:

- candidate snapshots per chunk;
- expected EAN gates per chunk;
- allow partial source progress without hiding failures;
- post-write audit per chunk and aggregate;
- rollback verification per chunk;
- structured artifacts that can be committed as sanitized summaries.

### P4 — active rollout runbook

Run sequence:

1. freeze code and confirm branch/commit;
2. run baseline audit;
3. run source health probes;
4. run one source, one term group, one chunk;
5. post-write DB/API/cache audit;
6. repeat only after GREEN;
7. commit sanitized report;
8. fresh reviewer audit;
9. expand chunk size only after evidence.

### P5 — schedules and monitoring

Schedules are allowed only after broad refresh gates pass.

Minimum schedule design:

| Workflow | Cadence | Behavior |
|---|---|---|
| Source health probe | hourly or every 6h | read-only; alerts on source/hash/Redis failure. |
| Existing-row refresh | daily or twice daily | chunked, source-serialized, no new products. |
| Discovery crawl | weekly/manual | expands catalog; separate review policy. |
| Cleanup/history retention | monthly | only after tested retention policy. |

Monitoring gates:

- active job concurrency lock;
- max runtime;
- promoted/rejected ratio;
- stale % by source;
- API latency after cache purge;
- Redis availability;
- alert on `RUNNING` jobs stuck or `PENDING` staging rows.

## Acceptance criteria for “finished”

### Public UX

- [ ] Home first viewport has no stale badge.
- [ ] Search/listing default ranking demotes stale prices.
- [ ] Product detail keeps stale warning and official source links.
- [ ] Methodology explains freshness and coverage clearly.
- [ ] Public copy has no live/current/global freshness overclaim.

### Data coverage

- [ ] Existing DB rows refreshed for all six sources or explicitly marked unavailable.
- [ ] At least 5,000 source-product rows refreshed in the last SLA window.
- [ ] At least 500 high-demand EANs have multi-source coverage where the market supports it.
- [ ] Missing source rows are documented as not found, not silently ignored.

### Safety

- [ ] No active write can run without source, term group, chunk size, expected EANs and `--confirm-write`.
- [ ] Every active chunk has pre-write snapshot and post-write audit.
- [ ] Rollback verification works for a sampled chunk.
- [ ] No all-source concurrent writes.

### Operations

- [ ] Production Redis is healthy.
- [ ] Scheduled jobs are enabled only after a successful manual broad refresh.
- [ ] Alerts exist for failed source probes, high rejection rate, stale % regression and stuck jobs.
- [ ] Production deploy, CI and smoke checks are green after changes.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| VTEX API/hash changes | Keep source health probes and hash-specific failure classification. |
| Product drift between audit and write | Expected-EAN gate and same-run candidate equality. |
| Too many new products from discovery | Separate refresh vs discovery modes; discovery requires new-product policy. |
| Stale data still affects best-price ordering | Freshness-aware ranking before schedules. |
| Rate limiting/source blocking | Source-serialized chunks, backoff, max requests per run. |
| Reviewer overload | Chunked PRs and sanitized aggregate reports. |

## Recommended next implementation plan

### PR 1 — public stale first-impression cleanup

Small product/code PR.

- Home/listing selection avoids stale-leading items.
- Default ranking demotes stale rows.
- Tests prove no `Dato viejo` appears on home first-impression surfaces.
- No DB writes.

### PR 2 — read-only freshness/drift audits

Tooling PR.

- Add `audit:freshness-baseline`.
- Add or extend `audit:price-drift`.
- Produce local/sanitized example report.
- No DB writes.

### PR 3 — chunked refresh rollout design

Runbook + tooling hardening PR.

- Generalize count=5 to chunked windows.
- Add aggregate post-write audit.
- Fresh reviewer before any active write.

### PR 4+ — controlled active refresh

Operational rollout PRs/reports.

- One source/term group at a time.
- Increase chunk size only after GREEN evidence.
- Schedules remain off until broad refresh is proven.

## Open decisions before active refresh

1. What is the public rankability threshold: hide stale after 72h, 7d, or source SLA?
2. Should unavailable/missing products remain visible with `Sin cobertura`, or be hidden from default results?
3. What is the first production coverage target: 1,000, 5,000, or 10,000 source-product rows?
4. Are fresh/perishable categories in scope for the first broad rollout, or delayed until packaged staples are stable?
5. What alert channel should production schedules use?

## Bottom line

To finish ofertasSUPER “for real”, we need both:

1. **a clean public UX policy** so stale records do not dominate the first impression; and
2. **a measured ingestion program** that refreshes existing rows, expands coverage deliberately, and only then re-enables schedules.

The app is now safe enough to build this next phase. It is not yet fresh enough to claim production-final price accuracy.
