# OS03 U16 — Guarded APIs and Shared Catalog Loaders

## Goal

Route every protected commercial API and shared server loader through the frozen U15 guarded read boundary, while preserving legitimate absence, empty collections, zero counts, batch ordering, and independently static taxonomy.

OpenSpec artifacts are historical input only. This ODD checklist is the execution record.

## Scope

- Search, product list/detail/batch, promotions, categories, catalog health, basket hydration, history, portfolio, and freshness server reads.
- Authority denial is unavailable, never a false 404, empty history, zero count, or empty commercial collection.
- Filtering, ranking, discount, freshness, and category-derived commercial claims operate only on guarded DTOs.
- Static taxonomy may remain available independently but cannot carry protected derived values.

## Non-goals

- U17 pages, metadata, JSON-LD, sitemap, and browser navigation.
- U18 payload envelope, external cache, client persistence, and PWA enforcement.
- U19 acceptance harness and operational runbook.

## Tasks

- [x] **U16-T1 — Map and prove unguarded consumer failures**
  - Inventory every protected API/shared loader and add focused RED coverage for authority denial versus legitimate absence.
- [x] **U16-T2 — Migrate APIs and shared loaders**
  - Route commercial reads through U15 guarded DTOs; preserve stable API semantics, batch order, and static taxonomy boundaries.
- [x] **U16-T3 — Triangulate real built-server/PostgreSQL behavior**
  - Prove eligible and denied authority for search/list/detail/batch/history/promotions/categories/health without mocked-resolver-only evidence.
- [ ] **U16-T4 — Refactor, verify, review, and commit**
  - Consolidate route error/DTO handling, run focused and full gates, complete independent/native review, and record the work-unit commit.

## Current state

U15 is frozen at `ffc8070`. U16-T1 through U16-T3 are complete. Independent verification passed the focused 30-test suite, typecheck, diff-check, and the full built-server/disposable-PostgreSQL-and-Redis eligible/denied route matrix. U16-T4 awaits native review and the final work-unit commit.

## Bounded-pass outcomes

- RED observed with `npx tsx --conditions=react-server --test tests/public-catalog-api.test.ts`: the new guarded-denial contract failed because `resolvePublicCatalogDataFromGuardedRead` was not exported (`TypeError: ... is not a function`).
- GREEN: added the shared guarded-read DTO boundary in `src/lib/public-catalog-api.ts`; the same focused command passed 16 tests, including denial-before-loader and legitimate-empty-collection cases.
- `npm run typecheck` passed and `git diff --check` passed.
- T1 remains open: current product list, categories, promotions, basket, history, search, detail, and catalog health consumers still need migration from source/legacy publication reads to U15 serving projections. This bounded work unit deliberately stops before that multi-surface migration.
- T3 prerequisite: a built Next server configured with a valid `PUBLIC_CATALOG_SERVING_IDENTITY_JSON` and a disposable PostgreSQL database populated with eligible and denied serving authority/projection fixtures. The existing `tests/public-catalog-read-postgres.test.ts` only runs when `PUBLIC_CATALOG_GUARDED_READ_POSTGRES_URL` and the serving identity are supplied; no such proof environment was available in this pass.
- Bounded U16-T2 slice: migrated basket hydration and `/api/products/batch` indirectly through `handleBasketProductsRequest` to the guarded serving projections. Authority denial now returns 503 before the batch loader runs; eligible empty/missing order and zero prices are preserved. Focused basket tests and typecheck pass.
- Completed bounded U16-T2 collection slice: `/api/products`, `/api/categories`, and `/api/promotions` now use the committed guarded collection resolvers with projection-only loaders. Product and promotion facts come from serving projections; categories retain the static `DETAILED_CATEGORIES` taxonomy while guarded serving-product counts preserve eligible zero behavior. Focused route and public-catalog API tests pass, along with typecheck and diff-check.
- Completed bounded U16-T2 search slice: `/api/search` validates the query, then loads its suggestions only through `resolvePublicCatalogDataFromGuardedRead` and the U15 serving-product/offer/supermarket projection. Cache reads and writes were removed rather than serving commercial payloads outside that decision boundary. Focused search projection and denial tests, typecheck, and diff-check pass.
- Remaining U16-T2 slice: catalog health; and the `product-history`, `portfolio-catalog`, and `price-freshness` shared consumers.
- Guarded basket consumer correction: `handleBasketProductsRequest` now accepts only `PublicCatalogGuardedReader`; the legacy publication-loader compatibility union and cast were removed. Basket tests inject only guarded readers, and the production catalog HTTP smoke injects guarded fresh, historical, and unavailable results. Focused basket and HTTP smoke checks passed.
- Corrected guarded collection resolver provenance: `resolveGuardedPublicProductList`, `resolveGuardedPublicCategories`, and `resolveGuardedPublicPromotions` no longer accept caller-supplied guarded readers. Each loader now receives the `PublicCatalogProjection` from the production `createPublicCatalogGuardedRead` transaction. Low-level `resolvePublicCatalogDataFromGuardedRead` retains guarded-reader injection only for dedicated unit coverage, which proves projection forwarding. Validation coverage remains focused; no high-level denial claim is supported by forged authority injection.
- Completed bounded U16-T2 product detail/history/shared portfolio slice: product detail and price history now read serving product/offer/history/supermarket projections inside one guarded transaction. Detail caches were removed because a cached protected fact cannot establish current authority. History no longer turns authorization failure into an empty chart; 404 is emitted only after an eligible guarded projection confirms the product is absent. Focused behavior coverage exercises guarded denial, confirmed absence, and serving-history mapping.
- U16 correction: serving detail mapping now uses `sku_id` as the actual serving-offer identity (never `supermarket_id`), takes `previousPrice` from the second-newest observation, and retains governed promotion, price-drop, automatic-discount, and final-price derivations. Route and revocation checks now assert guarded no-Redis-cache behavior, including authority-denial 503 and eligible success.
- U17 follow-up: `src/app/producto/[ean]/page.tsx` still bypasses the guarded page-data boundary through metadata/page behavior. It is explicitly out of U16 scope and must be corrected in U17; this pass did not modify it.
- Completed bounded U16-T2 catalog-health slice: `/api/health/catalog` now derives current/degraded/unavailable only from `createPublicCatalogGuardedRead`'s U15 repeatable-read decision. Guarded denial or execution unavailability claims `unavailable` and returns 503; an eligible historical decision remains `degraded` (also 503), while only a fresh eligible decision is current (200). No publication lookup, cache, or fallback authority path remains. RED was observed with `npx tsx --conditions=react-server --test tests/health.test.ts` before implementation: guarded eligible authority incorrectly produced degraded and the status-code helper was absent. GREEN and focused regression coverage passed: `npx tsx --conditions=react-server --test tests/health.test.ts tests/api-routes.test.ts tests/public-catalog-revocation.test.ts` (32 tests); `npm run typecheck` passed. U16 remains open.
- U16-T3 built-server proof harness added: `npm run test:u16-built-server-postgres` reuses the U15 disposable PostgreSQL adoption fixture, seeds serving category/promotion membership projection facts, launches `next start`, and checks eligible then denied search, list, detail, batch, history, promotions, categories, and catalog-health responses. Focused assertion coverage passed with `npx tsx --conditions=react-server --test tests/u16-built-server-postgres-smoke.test.ts` (2 tests), and `npm run typecheck` plus `git diff --check` passed. The real harness was attempted but stopped before Docker execution because `.next/BUILD_ID` is absent; U16-T3 and U16 remain open until a built server proof passes.
- Route-export build correction: `loadPublicSearchSuggestions` now resides in `src/lib/public-catalog-api.ts`, keeping `/api/search` limited to route-handler exports while retaining direct helper coverage. `npx tsx --conditions=react-server --test tests/search-route.test.ts tests/api-routes.test.ts tests/public-catalog-revocation.test.ts` passed (26 tests); `npm run typecheck`, `npm run build`, and `git diff --check` passed. The build emitted expected missing-`DATABASE_URL` Prisma messages during static-page data collection but exited successfully and included `/api/search` in the route manifest.
- U16-T3 live harness correction: the first eligible `/api/search` request returned 503 because strict public-route admission correctly requires both a configured rate-limit backend and a trusted deployment-bound client IP; the disposable PostgreSQL fixture supplied neither. The harness now launches a disposable loopback Redis rate-limit backend, runs the server with `REDIS_URL` and `VERCEL=1`, and sends a single trusted `x-forwarded-for` address on every matrix request. This preserves production fail-closed behavior and exercises the existing U15 trusted-clock, authority, adoption, and serving-identity fixture unchanged. `npx tsx --conditions=react-server --test tests/u16-built-server-postgres-smoke.test.ts` passed (2 tests), `npm run typecheck` and `git diff --check` passed, and `npm run test:u16-built-server-postgres` passed the eligible and denied search/list/detail/batch/history/promotions/categories/health matrix against built Next and disposable PostgreSQL.
