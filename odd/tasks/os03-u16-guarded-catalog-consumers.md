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

- [ ] **U16-T1 — Map and prove unguarded consumer failures**
  - Inventory every protected API/shared loader and add focused RED coverage for authority denial versus legitimate absence.
- [ ] **U16-T2 — Migrate APIs and shared loaders**
  - Route commercial reads through U15 guarded DTOs; preserve stable API semantics, batch order, and static taxonomy boundaries.
- [ ] **U16-T3 — Triangulate real built-server/PostgreSQL behavior**
  - Prove eligible and denied authority for search/list/detail/batch/history/promotions/categories/health without mocked-resolver-only evidence.
- [ ] **U16-T4 — Refactor, verify, review, and commit**
  - Consolidate route error/DTO handling, run focused and full gates, complete independent/native review, and record the work-unit commit.

## Current state

U15 is frozen at `ffc8070`. U16 exploration and implementation are in progress.

## Bounded-pass outcomes

- RED observed with `npx tsx --conditions=react-server --test tests/public-catalog-api.test.ts`: the new guarded-denial contract failed because `resolvePublicCatalogDataFromGuardedRead` was not exported (`TypeError: ... is not a function`).
- GREEN: added the shared guarded-read DTO boundary in `src/lib/public-catalog-api.ts`; the same focused command passed 16 tests, including denial-before-loader and legitimate-empty-collection cases.
- `npm run typecheck` passed and `git diff --check` passed.
- T1 remains open: current product list, categories, promotions, basket, history, search, detail, and catalog health consumers still need migration from source/legacy publication reads to U15 serving projections. This bounded work unit deliberately stops before that multi-surface migration.
- T3 prerequisite: a built Next server configured with a valid `PUBLIC_CATALOG_SERVING_IDENTITY_JSON` and a disposable PostgreSQL database populated with eligible and denied serving authority/projection fixtures. The existing `tests/public-catalog-read-postgres.test.ts` only runs when `PUBLIC_CATALOG_GUARDED_READ_POSTGRES_URL` and the serving identity are supplied; no such proof environment was available in this pass.
- Bounded U16-T2 slice: migrated basket hydration and `/api/products/batch` indirectly through `handleBasketProductsRequest` to the guarded serving projections. Authority denial now returns 503 before the batch loader runs; eligible empty/missing order and zero prices are preserved. Focused basket tests and typecheck pass.
- Completed bounded U16-T2 collection slice: `/api/products`, `/api/categories`, and `/api/promotions` now use the committed guarded collection resolvers with projection-only loaders. Product and promotion facts come from serving projections; categories retain the static `DETAILED_CATEGORIES` taxonomy while guarded serving-product counts preserve eligible zero behavior. Focused route and public-catalog API tests pass, along with typecheck and diff-check.
- Completed bounded U16-T2 search slice: `/api/search` validates the query, then loads its suggestions only through `resolvePublicCatalogDataFromGuardedRead` and the U15 serving-product/offer/supermarket projection. Cache reads and writes were removed rather than serving commercial payloads outside that decision boundary. Focused search projection and denial tests, typecheck, and diff-check pass.
- Remaining U16-T2 slice: product detail/history; catalog health; and the `product-history`, `portfolio-catalog`, and `price-freshness` shared consumers.
- Guarded basket consumer correction: `handleBasketProductsRequest` now accepts only `PublicCatalogGuardedReader`; the legacy publication-loader compatibility union and cast were removed. Basket tests inject only guarded readers, and the production catalog HTTP smoke injects guarded fresh, historical, and unavailable results. Focused basket and HTTP smoke checks passed.
- Corrected guarded collection resolver provenance: `resolveGuardedPublicProductList`, `resolveGuardedPublicCategories`, and `resolveGuardedPublicPromotions` no longer accept caller-supplied guarded readers. Each loader now receives the `PublicCatalogProjection` from the production `createPublicCatalogGuardedRead` transaction. Low-level `resolvePublicCatalogDataFromGuardedRead` retains guarded-reader injection only for dedicated unit coverage, which proves projection forwarding. Validation coverage remains focused; no high-level denial claim is supported by forged authority injection.
- Completed bounded U16-T2 product detail/history/shared portfolio slice: product detail and price history now read serving product/offer/history/supermarket projections inside one guarded transaction. Detail caches were removed because a cached protected fact cannot establish current authority. History no longer turns authorization failure into an empty chart; 404 is emitted only after an eligible guarded projection confirms the product is absent. Focused behavior coverage exercises guarded denial, confirmed absence, and serving-history mapping.
- U16 correction: serving detail mapping now uses `sku_id` as the actual serving-offer identity (never `supermarket_id`), takes `previousPrice` from the second-newest observation, and retains governed promotion, price-drop, automatic-discount, and final-price derivations. Route and revocation checks now assert guarded no-Redis-cache behavior, including authority-denial 503 and eligible success.
- U17 follow-up: `src/app/producto/[ean]/page.tsx` still bypasses the guarded page-data boundary through metadata/page behavior. It is explicitly out of U16 scope and must be corrected in U17; this pass did not modify it.
