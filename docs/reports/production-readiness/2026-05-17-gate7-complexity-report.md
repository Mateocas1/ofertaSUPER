# Gate 7 - Performance / complexity report-only scan - 2026-05-17

Status: `GREEN`

This gate is report-only. No code optimization was applied. The scan focused on repeated scans, O(n*m) loops, N+1 fetch/DB patterns, and ingestion pipeline hotspots.

## Scope scanned

- `src/lib/catalog.ts`
- `src/app/api/search/route.ts`
- `src/app/canasta/page.tsx`
- `src/components/canasta-page.tsx`
- `scripts/ingest.ts`
- `scripts/pipeline/*.ts`
- `src/lib/ingestion/**/*.ts`
- `src/lib/vtex/**/*.ts`

## Findings

| Risk | Finding | File/lines | Current complexity | Suggested direction | Tests needed | Do now? |
|---|---|---|---|---|---|---|
| Medium | Basket page does one `/api/products/[ean]` fetch per distinct basket EAN. This is bounded by user basket size, but it is an N+1 HTTP/API pattern and can fan out browser/backend work for larger baskets. | `src/components/canasta-page.tsx:104-132` | O(k) network calls, each with backend product lookup; summary build then roughly O(items * supermarkets). | Add a batch product endpoint or basket quote endpoint that accepts EANs and returns products in one request; optionally cap or debounce basket refresh. | Component test with multiple EANs asserting one batch request, plus API route test for missing/partial EANs. | Defer; make it its own slice because it changes API/UI contract. |
| Medium | VTEX payload traversal uses `queue.shift()` while walking arbitrary nested JSON. `Array.shift()` is O(n), so traversal can degrade toward O(n^2) on large payload trees. | `src/lib/vtex/client.ts:164-187` | O(nodes^2) worst-case due repeated shifting. | Replace with index cursor (`for (let i = 0; i < queue.length; i++)`) or stack `pop()` traversal. | Unit test for nested arrays/objects preserving extracted product records. | Safe small optimization later; not required for readiness closure. |
| Low | Product detail maps price entries and filters promotions for each entry. With many promotions per supermarket, this becomes repeated scan work. | `src/lib/catalog.ts:601-616` | O(priceEntries * promotions). | Pre-group promotions by `supermarket.id` before mapping price entries. | Unit/fixture test for promotion applicability and best promo calculation. | Defer; current supermarket/promotion counts are small. |
| Low | Category/product mapping performs multiple in-memory map/filter/sort passes after Prisma pagination. | `src/lib/catalog.ts:448-466`, `src/lib/catalog.ts:733-832` | Mostly O(n log n) for small category/product result sets. | Keep DB pagination; only optimize if production data shows slow render. | Catalog integration tests with seeded categories/products. | Defer. |
| Low | Reconcile pipeline uses large `VALUES` raw SQL for merge/upsert operations inside chunks. Current default chunking is protective, but raising batch size could hit DB parameter/statement-size limits. | `scripts/pipeline/reconcile.ts:285-535` | O(n) per chunk with multiple DB round trips; bounded by chunk size. | Keep batch size conservative; document max if active ingestion volume grows. | Dry-run and active-mode integration tests with chunk boundary sizes. | Defer; no issue at current default. |
| Low | Ingestion source execution is parallelized but capped with `pLimit(2)`, which avoids unbounded fan-out. | `scripts/ingest.ts:159-163` | O(sources), concurrency 2. | Keep limit configurable only if ops evidence needs it. | Existing dry-run/probe evidence plus future multi-source smoke. | No change. |

## Areas that look intentionally bounded

- `/api/search` checks Redis and catalog availability, then uses Prisma only when runtime DB connectivity is available. No repeated in-route scan was found.
- `scripts/pipeline/validate.ts` chunks validation updates and computes historical averages in grouped SQL, avoiding per-candidate DB lookups.
- `scripts/pipeline/stage.ts` uses `createMany` for staging rows instead of per-row inserts.
- `scripts/ingest.ts` caps source concurrency with `pLimit(2)`.

## Before/after estimates for safe optimizations

| Candidate | Before | After if optimized | Expected impact |
|---|---:|---:|---|
| Basket product loading | O(k) HTTP requests | O(1) batch HTTP request + O(k) server lookup | Better UX/network behavior for larger baskets. |
| VTEX payload traversal | O(nodes^2) worst-case | O(nodes) | Safer for large VTEX payloads. |
| Product-detail promotion matching | O(priceEntries * promotions) | O(priceEntries + promotions) | Mostly cleanup unless promotion counts grow. |

## Recommendation

No high-risk optimization should be done inside this readiness goal. The only candidate worth prioritizing as a future slice is the basket batch endpoint because it improves product UX and reduces N+1 API behavior without changing the visual direction.

## Claim boundary

This report identifies complexity risks; it does not prove production performance under load and does not replace profiling, query plans, or real traffic telemetry.
