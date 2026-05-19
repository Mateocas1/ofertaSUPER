# Price freshness and accuracy PRD - 2026-05-19

Status: `P0 SLICES IMPLEMENTED / P1+ PENDING`

This PRD starts from a real user-visible mismatch: `Uva rosada x kg.` (`EAN 2320039000009`) shows `$ 2.499` in ofertasSUPER while Carrefour currently exposes `$ 4.299` for the same official product URL.

## Executive diagnosis

The current evidence points to a freshness/data-sync problem, not a frontend formatting bug.

| Layer | Evidence | Current conclusion |
|---|---|---|
| Frontend | Public `/api/search?q=uva%20rosada&limit=5` returns `minPrice: 2499`; product page contains `2499` and March freshness text. | Frontend is displaying the API/DB value it receives. |
| Database | `supermarket_products` has Carrefour price `2499`, `list_price = 11999`, `last_checked_at = 2026-03-23T02:38:39.230Z`. | DB value is stale. |
| Price history | Only one Carrefour history row for this EAN: `2499` at `2026-03-23T02:38:39.426Z`. | No later production price update exists. |
| Official Carrefour page | Official page contains EAN `2320039000009` and current selling price `4299`. | Official product changed since the stored snapshot. |
| Current scraper path | Read-only VTEX fetch for `uva rosada` returns price `4299`, `listPrice = 5999`, same product URL. | Current parser can extract the new price. |
| Ingestion freshness | Carrefour has `1008/1008` products older than 30 days; newest Carrefour `last_checked_at` is still `2026-03-23T02:38:39.230Z`. | Active catalog refresh is not updating production data. |

Root-cause hypothesis:

> Production catalog prices are stale because active ingestion/promote is not running for Carrefour. The scraper can read the current price, but the DB has not been refreshed since March 23 for Carrefour.

## Seed case

| Field | Value |
|---|---|
| Product | `Uva rosada x kg.` |
| EAN | `2320039000009` |
| App price | `$ 2.499` |
| Official Carrefour price observed | `$ 4.299` |
| DB price | `2499` |
| Current VTEX fetch price | `4299` |
| Difference | `+1800` / `+72.03%` |
| Stored source | Carrefour only |
| Official URL | `https://www.carrefour.com.ar/uva-rosada-x-kg/p` |
| DB last checked | `2026-03-23T02:38:39.230Z` |

Why "only Carrefour" is not itself an error:

- this EAN appears only in Carrefour in the current DB;
- produce/random-weight supermarket EANs can be retailer-specific;
- the concern is not "only one supermarket" by itself, but that the single available price is stale and presented as current enough to trust.

## Scope check: is this isolated?

No. It is not proven that every stale product has a wrong price, but the risk is broad.

### Freshness by supermarket

Read-only DB snapshot:

| Supermarket | Products | Older than 30d | Newest production check |
|---|---:|---:|---|
| Carrefour | 1008 | 1008 | `2026-03-23T02:38:39.230Z` |
| Dia | 856 | 856 | `2026-03-23T02:38:38.499Z` |
| Disco | 789 | 739 | `2026-05-19T01:19:59.174Z` |
| Jumbo | 791 | 791 | `2026-03-23T02:38:40.785Z` |
| Mas | 831 | 831 | `2026-03-23T02:38:42.384Z` |
| Vea | 679 | 679 | `2026-03-23T02:38:43.145Z` |

Important nuance:

- Disco has 50 recent `last_checked_at` values because of the previously documented accidental RED-write path.
- After cleanup, latest `price_history` rows for all supermarkets are still March 23.

### Live Carrefour drift sample

Read-only sample against live VTEX results:

| Metric | Result |
|---|---:|
| Terms sampled | `uva rosada`, `leche`, `yerba`, `arroz`, `aceite`, `azucar`, `pollo`, `fideos` |
| Unique live Carrefour products fetched | 84 |
| Products also present in DB | 56 |
| Price changed vs DB | 33 |
| Changed by at least 10% | 11 |
| Seed product drift | `2499 -> 4299` (`+72.03%`) |

This sample is not a full audit. It is enough to prove the issue is broader than one product.

## Why we noticed it

The user followed a product suggestion to a real product and compared it with the official supermarket page. This exposed a mismatch that the app did not make sufficiently obvious:

- search result/product card surfaces a price without freshness context;
- product detail has an `Actualizado` column, but the stale date is easy to miss;
- the home UI contains static freshness-like copy such as `Datos actualizados hoy 08:30`, which is unsafe when production catalog data is stale.

## What this PRD must solve

The product must stop presenting stale prices as trustworthy current prices.

This does not require pretending the project has production-grade ingestion today. It requires explicit, user-visible data freshness semantics.

## Goals

1. Detect stale catalog data at product, supermarket and global levels.
2. Show freshness context where users make price decisions.
3. Prevent stale data from powering misleading "best price" or "updated today" claims.
4. Add a repeatable read-only drift audit to estimate price mismatch risk before active writes.
5. Keep active ingestion writes behind explicit approval, guards and rollback plans.

## Non-goals

- Do not re-enable scheduled ingestion automatically.
- Do not run mass scraping or active writes as part of this PRD.
- Do not claim live price accuracy until freshness gates pass.
- Do not delete product/supermarket records just because they are stale.
- Do not solve full search relevance or full production monitoring in this slice.

## Product requirements

### P0 - Remove misleading freshness claims

| Requirement | Acceptance criteria |
|---|---|
| Replace static `Datos actualizados hoy 08:30`-style copy. | No public UI says data was updated today unless the value comes from real freshness data. |
| Add stale warning when latest catalog data exceeds SLA. | Search and product detail communicate when prices may be outdated. |
| Avoid "current price" language for stale entries. | Stale entries use wording like "último precio registrado" or equivalent. |

### P0 - Make freshness visible in decision surfaces

| Requirement | Acceptance criteria |
|---|---|
| Search/product cards expose `latestCheckedAt` or a freshness label. | A user can see whether the best price is recent before clicking. |
| Product detail highlights stale rows. | Carrefour seed product clearly indicates March 23 freshness, not just price. |
| API responses include enough freshness metadata for clients. | `/api/search` or the relevant product-list surface can return freshness state without extra DB calls. |

### P1 - Read-only drift audit

| Requirement | Acceptance criteria |
|---|---|
| Add a controlled read-only script for source drift sampling. | Given source + terms + count, it compares live VTEX prices against DB without writes. |
| Report mismatch counts and examples. | Output includes fetched, matched, changed, changed >10%, and sample rows. |
| No secrets printed. | URLs and prices are OK; credentials are never logged. |

### P1 - Ingestion/promote readiness gate

| Requirement | Acceptance criteria |
|---|---|
| Explain why latest Carrefour run fetched/staged products but promoted 0. | Report distinguishes dry-run/shadow/no-op from failed active promotion. |
| Define safe active-refresh path. | Any real write needs explicit approval, source limit, preflight, post-check and rollback/cleanup plan. |
| Keep schedules paused until gates pass. | No workflow schedule is re-enabled by this PRD. |

### P2 - Public trust polish

| Requirement | Acceptance criteria |
|---|---|
| Add copy explaining data source limitations. | Public pages distinguish official supermarket links from stored price snapshots. |
| Link freshness methodology from product/detail pages. | Users can understand how prices are collected and when they may be stale. |

## Engineering requirements

| Area | Requirement |
|---|---|
| Tests | Unit tests for freshness classification and stale copy; route/component tests where practical. |
| TDD | New logic should start with tests for stale/fresh thresholds and display contracts. |
| Safety | No active ingestion write in tests. Use mocks or read-only scripts. |
| Performance | Freshness metadata should reuse existing catalog query data where possible. |
| Documentation | Update README/handoff/proof only after behavior is implemented and verified. |

## Proposed implementation slices

### Slice 1 - Freshness model and public copy guard

- Add a small freshness helper:
  - `fresh`, `stale`, `unknown`;
  - source SLA-aware if available;
  - deterministic thresholds for tests.
- Replace hardcoded public freshness copy.
- Add tests around helper and visible copy.

### Slice 2 - Search/card freshness visibility

- Extend product list/search data shape with `latestCheckedAt` / freshness status.
- Show "último precio registrado" when stale.
- Add focused tests for card copy.

### Slice 3 - Product detail stale emphasis

- Highlight stale supermarket rows in `PriceComparison`.
- Keep official link visible.
- Add copy that the official page is the source of truth for checkout.

### Slice 4 - Read-only drift audit script

- Add a script such as:

```bash
npm run audit:price-drift -- --source=carrefour --terms="uva rosada,leche,yerba" --count=12
```

- Output JSON/Markdown under `docs/reports/data-quality/`.
- No writes.

### Slice 5 - Controlled refresh plan, not automatic writes

- Investigate why latest Carrefour run promoted `0`.
- Prepare a separate approval-gated active-refresh runbook if needed.
- Do not re-enable schedules yet.

## Open questions before implementation

1. Should stale products remain searchable with warnings, or should very stale prices be hidden from "best price" rankings?
2. What SLA should public pages use: existing supermarket `freshness_sla_hours`, a softer portfolio threshold, or both?
3. Should the public demo default to "snapshot mode" language until active ingestion is intentionally restored?

## Recommended next step

Implement Slice 1 and Slice 2 first.

Reason: they reduce user trust risk immediately without mutating production data. The app can be honest about stale data before we decide whether to run any active refresh.

## Implementation record - P0 slices

Implemented scope:

| Slice | Status | Evidence |
|---|---|---|
| Slice 1 - Freshness model and public copy guard | Implemented | `src/lib/price-freshness.ts`, `tests/price-freshness.test.ts`, `tests/price-freshness-ui.test.ts` |
| Slice 2 - Search/card freshness visibility | Implemented | `src/lib/catalog.ts`, `src/lib/demo-data.ts`, `src/components/product-card.tsx`, `src/components/search-bar.tsx` |
| Slice 3 - Product detail stale emphasis | Implemented | `src/components/price-comparison.tsx` |
| Slice 4 - Read-only drift audit script | Pending | Use the ad-hoc evidence in this PRD until a repeatable script exists. |
| Slice 5 - Controlled refresh plan | Pending | No active writes or schedule changes were made. |

### Decisions made during implementation

| Decision | Why | Tradeoff |
|---|---|---|
| Keep stale products searchable, but label them as stale. | Hiding them would make the catalog look incomplete while the root issue is freshness. | Stale prices can still influence sorting/ranking until a later ranking policy is implemented. |
| Base DB entry freshness on each supermarket's `freshness_sla_hours`. | The schema already models source-level freshness expectations. | Demo/fallback data uses a simple default because it is not tied to a real source row. |
| Add freshness metadata to suggestions and product summaries. | Search suggestions and product cards are price-decision surfaces. | API consumers now receive extra fields; existing clients should tolerate additive JSON. |
| Label stale values as `Ultimo precio registrado`. | This avoids presenting stale values as current prices. | It is more cautious copy, less salesy. That's intentional. |
| Do not run active ingestion or refresh. | The PRD explicitly says freshness visibility comes before writes. | Prices remain stale until a controlled refresh gate is approved. |
| Align local Supabase runtime URL instead of masking the route error in code. | Local product smoke exposed Prisma `42P05 prepared statement already exists` because `DATABASE_URL` used the Supabase transaction pooler without `pgbouncer=true`. | This is an environment/deploy gate, not a product-code workaround; Vercel must mirror the same runtime URL shape. |

### Edge cases analyzed

- missing/invalid `last_checked_at` -> `unknown`, not `fresh`;
- future timestamps -> age is clamped to zero hours instead of showing negative staleness;
- missing/invalid SLA -> default freshness window;
- multiple supermarket prices -> card freshness follows the cheapest/best-price entry, not merely the latest checked entry;
- product detail rows can be mixed: fresh and stale supermarkets are labeled independently;
- official supermarket link remains visible because checkout price must be verified at the source.
- Supabase transaction pooler runtime must use `pgbouncer=true`; `DIRECT_URL` stays separate for non-runtime direct/session access.

### Blind spots intentionally left open

- Stale prices are still used for `price-asc` and best-price ordering. A later policy must decide whether very stale entries should be excluded from rankings.
- The read-only drift audit is not yet a reusable script.
- The root cause of latest Carrefour runs promoting `0` has not been debugged yet.
- Public Vercel will only reflect these UI changes after push/deploy.
- Public Vercel also needs the corrected `DATABASE_URL` parameters; local ignored env files were aligned, but Vercel env vars must be checked manually.
- No production active ingestion, schedule reactivation, or mass scraping was performed.

## Evidence collected

Commands were read-only except temporary local probe scripts that were removed after execution.

### Implementation verification - P0 freshness slice

| Evidence | Result |
|---|---|
| TDD red check | New freshness/UI tests failed first on missing helper/metadata/copy and `Maximo actual` product-page copy. |
| Focused freshness tests | `npx tsx --test tests/price-freshness.test.ts tests/price-freshness-ui.test.ts` passed after implementation. |
| Full automated tests | `npm test` passed `40/40`. |
| TypeScript | `npm run typecheck` passed. |
| Lint | `npm run lint` passed. |
| Local HTTP smoke | Home, `/api/search?q=uva%20rosada&limit=5`, `/producto/2320039000009`, and `/api/products/2320039000009` returned 200 after local `DATABASE_URL` was aligned with `pgbouncer=true&connection_limit=3`. |
| Build | Not run by explicit project rule. |

### Original diagnosis evidence

| Evidence | Result |
|---|---|
| DB seed product query | Carrefour DB price `2499`, `last_checked_at = 2026-03-23T02:38:39.230Z` |
| Official page fetch | Official page contains EAN `2320039000009` and price `4299` |
| Current VTEX fetch | Normalized current product price `4299`, `listPrice = 5999` |
| Public API smoke | `/api/search?q=uva%20rosada&limit=5` returns `minPrice: 2499` |
| Public product page smoke | `/producto/2320039000009` returns 200 and contains stale March date |
| Freshness aggregate | Carrefour `1008/1008` products older than 30d |
| Live drift sample | 33/56 matched sampled Carrefour products changed vs DB; 11/56 changed by >=10% |

## Safe claim boundary

Safe:

> We found that displayed prices can be stale because production catalog refresh is not currently updating the DB. The current scraper can fetch the updated Carrefour price for the seed product, so the immediate product risk is freshness visibility and controlled refresh, not frontend formatting.

Not safe:

- claiming the scraper is always correct;
- claiming all stale products are wrong;
- claiming active ingestion is safe to re-enable now;
- claiming the public demo has live prices.
