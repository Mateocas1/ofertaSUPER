# OS03 U17 — Guarded Pages, Metadata, JSON-LD, and Sitemap

## Goal

Route every protected page and derived SEO output through the frozen U15/U16 guarded catalog boundary, so authority denial preserves static shell/navigation without emitting commercial facts or false absence.

OpenSpec artifacts are historical input only. This ODD checklist is the execution record.

## Scope

- `/buscar`, `/ofertas`, `/categoria/[slug]`, `/producto/[ean]`, `/canasta`, and `/sitemap.xml`.
- HTML, RSC/prefetch, metadata, JSON-LD, sitemap, and browser navigation.
- Eligible outputs use guarded serving projections only.
- Denied outputs keep independently static UI/taxonomy/navigation, expose an unavailable state, suppress protected facts, and use non-commercial `noindex, follow` metadata where applicable.

## Non-goals

- U18 cache envelopes, external response-cache policy, client persistence deadlines, and PWA purge enforcement.
- U19 operational acceptance/runbook evidence.
- Production deployment, credentials, migrations, or authentic production evidence.

## Installed Next.js 16.3.1 constraints

- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`: page routes are public; `params` and `searchParams` are promises; request search parameters imply dynamic rendering.
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md`: metadata is server-rendered/streamed and nested metadata objects replace parent values shallowly.
- `node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md`: rendered shell/RSC/prefetch can retain output, so guarded request-time facts require explicit boundaries.
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/sitemap.md`: sitemap is cached by default unless made request-time/dynamic.
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`: metadata routes share segment configuration constraints.

## Tasks

- [x] **U17-T1 — Establish common guarded page/SEO contracts**
  - Added behavior-first tests and shared helpers for eligible versus unavailable page data and non-commercial denial metadata.
- [x] **U17-T2 — Guard product HTML, metadata, and JSON-LD**
  - Removed the raw `getProductDetail` metadata path; guarded detail/history data now controls HTML, metadata, and JSON-LD, with denial rendered as a non-commercial accessible alert.
- [x] **U17-T3 — Guard search, offers, and category pages**
  - Replaced legacy/raw catalog loaders with guarded serving-projection loaders, preserved static taxonomy and shell, and suppress commercial results/SEO claims on denial.
- [x] **U17-T4 — Guard sitemap and basket denial UX**
  - Sitemap uses request-time U15/U16 guarded serving-product projection data, while static taxonomy remains available on denial. Basket batch 503 now produces a catalog-unavailable state that removes product and price facts. Browser navigation/prefetch/RSC matrix remains for U17-T5.
- [x] **U17-T5 — Built-server/browser triangulation, review, and commits**
  - Added `test:u17-built-server-browser`: a narrow built-server browser matrix that sources the U16 disposable PostgreSQL authority fixture, owns a loopback Redis/container/browser/server lifecycle, and covers eligible then denied HTML/head, RSC, sitemap, client navigation/prefetch, and basket hydration for the governed snapshot product.
  - RED: the real built-server run previously returned 500 for eligible `/sitemap.xml` with `TypeError: (intermediate value).map is not a function`, proving the guarded callback's bare Prisma array was decorated as an object and then treated as an array. Fix: the sitemap guarded callback now returns `{ products }`, and the loader maps `catalog.products`, preserving the request-time guard and unavailable fallback.
  - Browser basket correction: persistence now seeds `ofertas-super:canasta` with `{ version: 1, value: [{ ean, qty: 1 }] }`; it registers the POST `/api/products/batch` waiter before navigation, requires 200 only for the eligible request, and waits for the product heading before inspecting eligible HTML. The denied path waits for its unavailable alert before inspecting HTML. Focused assertion coverage verifies the serialized version-1 envelope.
  - Initial validation: `./node_modules/.bin/tsx --conditions=react-server --test tests/u17-built-server-browser-smoke.test.ts` passed (3 tests); `npm run typecheck` and `git diff --check` passed. The first full matrix passed its inherited U15 fixture and completed the eligible browser phase, then found the denied product EAN in serialized Next Flight.
  - Flight authority correction: Next.js 16.3.1 serializes the requested dynamic product route only as `c: ["", "producto", ean]` and `["ean", ean, "d", []]` Flight route-state tuples. The harness removes only those exact raw or JSON-escaped tuples from denied RSC/inline `self.__next_f.push(...)` payloads before EAN absence checks. All other governed facts remain absolute; EAN occurrences in visible HTML, canonical/OG/Twitter markup, product links, JSON-LD, commercial script objects, DTOs, and any non-tuple RSC payload remain rejected. Focused fixtures accept the exact route state and reject a truncated tuple, product DTO, canonical, product link, JSON-LD, visible text, and script-object leaks.
  - Browser correction: denied basket batch now requires 503 and waits for its actual role-alert unavailable copy (rather than the page-shell alert wording).
  - Final validation: `./node_modules/.bin/tsx --conditions=react-server --test tests/u17-built-server-browser-smoke.test.ts` passed (4 tests); `npm run typecheck` and `git diff --check` passed; `npm run test:u17-built-server-browser` passed the inherited U11b4/U15 fixture and the complete eligible/denied Next server/browser matrix. Native review `review-4d8f48b2af12b119` was approved and acknowledged; final work-unit commit: `c7709ab`.

## U17-T5 closure hardening evidence

- Selected policy: permit the requested EAN only in a structurally validated Next Flight root's exact `c: ["", "producto", EAN]` router path and its exact dynamic segment tuple (`["ean", EAN, "d", []]`). The parser reads Flight line records and JSON `self.__next_f.push(...)` payloads; it does not globally delete tuples. `node_modules/next/dist/client/flight-data-helpers.js` confirms that Next 16.3.1 constructs `c` from the canonical URL, while its router state represents dynamic segments as `[paramName, paramCacheKey, paramType, staticSiblings]`.
- Regression coverage accepts the real router `c` plus `ean` segment and rejects an otherwise identical tuple or `c` path under an application `payload`, an unbound `c` record, visible text, canonical markup, JSON-LD, DTOs, and product links.
- Stream-close correction: the browser matrix now waits for network-idle after prefetch hover and client navigation, consumes the batch response body, and waits for network-idle again before closing each page. Browser, server, database, and Redis then close in that order without swallowed close errors. The final live matrix completed without `destination stream closed early`.
- Final closure validation: `./node_modules/.bin/tsx --conditions=react-server --test tests/u17-built-server-browser-smoke.test.ts`, `npm run typecheck`, fixture-backed `npm run build`, `git diff --check`, and `npm run test:u17-built-server-browser` passed. The fixture-backed build sources U16 with `U16_FIXTURE_ONLY=1`, then supplies its disposable PostgreSQL `DATABASE_URL` and `DIRECT_URL`; it produced no missing-database diagnostics.

## Current state

U16 is frozen at `c8726c1` with closure ledger `5a2dbbf`. U17 is complete. The full fixture-backed build and eligible/denied HTML/head/RSC/sitemap/navigation/basket matrix passed with clean teardown. Native review `review-4d8f48b2af12b119` was approved and acknowledged; final work-unit commit: `c7709ab`.

## Initial bounded plan

1. Establish the common page/SEO contract before editing routes.
2. Complete product HTML/metadata/JSON-LD as the first high-risk slice.
3. Complete search/offers/category as a second reviewable slice.
4. Complete sitemap/basket/navigation and the built-server/browser matrix.
5. Keep each implementation slice under roughly 400 changed lines where practical and record RED/GREEN/triangulation evidence here.

## U17-T1 evidence

- Read the installed Next.js 16.3.1 page, `generateMetadata`, caching, sitemap, and route documentation cited above before editing.
- RED: `./node_modules/.bin/tsx --conditions=react-server --test tests/public-catalog-page.test.ts tests/seo-metadata.test.ts` failed because `public-catalog-page` and `createUnavailableCatalogMetadata` did not exist.
- GREEN: the same focused command passed after implementing the shared contracts.
- Triangulation: the page result test verifies unavailable results retain only the supplied static shell and have no `catalog` property; the metadata test verifies exact `robots: { index: false, follow: true }` plus empty canonical/OG/Twitter replacements.

## U17-T2 evidence

- RED: `./node_modules/.bin/tsx --conditions=react-server --test tests/product-page.test.ts tests/seo-schema.test.ts tests/product-history.test.ts` failed before implementation because guarded product page/schema helpers did not exist.
- GREEN: the same focused command passed after product HTML, metadata, and schema all used the guarded result contract.
- Triangulation: denial metadata uses the shared non-commercial `noindex, follow` contract; denied schema is `null`, while eligible guarded data emits Product/Offer JSON-LD.
- Coherence correction: Next.js 16.3.1 `generateMetadata` guidance requires React `cache` for this non-fetch load. `createGuardedProductPageLoader` now uses `cache` only to deduplicate one render's identical `(ean, days)` guarded result; it adds no durable or cross-request cache. Both metadata and HTML call that shared loader. RED: `./node_modules/.bin/tsx --conditions=react-server --test tests/product-history.test.ts` failed with `createGuardedProductPageLoader is not a function`. GREEN: `./node_modules/.bin/tsx --conditions=react-server --test tests/product-page.test.ts tests/seo-schema.test.ts tests/product-history.test.ts` passed (10 tests). The new regression test asserts that metadata and HTML consumers receive the same eligible guarded result after exactly one underlying guarded load.
- Native review escalation `review-c3e7eed8a3e33667` identified `R3-unhandled-authority-rejection`: the guarded page loader let `PublicCatalogUnavailableError` escape before producing its unavailable result. Correction RED: `./node_modules/.bin/tsx --conditions=react-server --test tests/product-page.test.ts` failed the unavailable-conversion regression because the error propagated. Correction GREEN: after catching only `PublicCatalogUnavailableError` and using `createProductPageResult` for the typed unavailable result, `./node_modules/.bin/tsx --conditions=react-server --test tests/product-page.test.ts tests/seo-schema.test.ts tests/product-history.test.ts` passed (12 tests), including unrelated-error propagation and the unchanged history 503 assertion. `npm run typecheck` and `git diff --check` passed.

## U17-T3 evidence

- Read the installed Next.js 16.3.1 page, `generateMetadata`, caching, and metadata guides before editing.
- RED: `./node_modules/.bin/tsx --conditions=react-server --test tests/portfolio-catalog.test.ts` failed because `resolveGuardedCatalogPage` did not exist.
- GREEN: the same focused command passed (5 tests) after the shared page helper converted authority denial into a shell-only unavailable result.
- Triangulation: `/buscar`, `/ofertas`, and `/categoria/[slug]` now load only `loadPublicProductList`/`loadPublicPromotions` through the U15/U16 projection; their metadata uses the same React-cached guarded loader and shared unavailable metadata. Category lookup is from `DETAILED_CATEGORIES`, not a catalog database read. `npm run typecheck` and `git diff --check` passed.
- Assertion correction: `tests/price-freshness-ui.test.ts` now requires the search provenance notice to receive `page.catalog` only under `page.availability === "eligible"`, and rejects the obsolete `result` spread. `tests/production-degradation-ui.test.ts` now requires offers to use `resolveGuardedCatalogPage` and rejects legacy `resolvePublicCatalogData`, preserving the unavailable-state assertion. The unchanged `cacheOnFrontEndNav: false` U18 assertion demonstrably fails at `HEAD` (the `HEAD:next.config.ts` source has none of its asserted cache configuration), so it was excluded from the U17-focused run without changing `next.config.ts` or the assertion. Focused pass: `node --import tsx --conditions=react-server --test --test-name-pattern='public price freshness UI contracts|public catalog pages never replace unavailable data with demos|historical catalog data is announced without demo claims|browser smoke contracts catalog health runtime transitions' tests/price-freshness-ui.test.ts tests/production-degradation-ui.test.ts` (8 tests).

## U17-T4 evidence

- Read installed Next.js 16.3.1 sitemap and caching documentation before editing: sitemap metadata routes are cached by default unless configured request-time/dynamic; cache components can retain rendered output.
- RED: `./node_modules/.bin/tsx --conditions=react-server --test tests/sitemap.test.ts tests/basket-products-client.test.ts` failed because denied sitemap output dropped static taxonomy and batch 503 was converted to a generic error.
- GREEN: the focused sitemap/basket/degradation test selection passed (9 tests): eligible sitemap includes only guarded serving EANs; denial retains static routes/taxonomy with no timestamps or EANs; `/sitemap.xml` is `force-dynamic`; batch 503 raises `BasketCatalogUnavailableError`; canasta clears loaded product facts and renders an unavailable alert.
- Triangulation: `npm run typecheck` passed; `npm run build` compiled and reports `/sitemap.xml` as dynamic. The existing PWA assertion remains a known U18-base failure and is excluded. Corrected the legacy multi-chunk client regression in `tests/basket-products.test.ts`: a 503 on the first batch now rejects with `BasketCatalogUnavailableError`, sends no later batch, and never converts the denied EANs into `missing`. The existing serving-projection partial-results regression continues to prove legitimate eligible missing EANs are preserved.
- Regression correction validation: `./node_modules/.bin/tsx --conditions=react-server --test tests/basket-products.test.ts tests/basket-products-client.test.ts` passed (19 tests); `./node_modules/.bin/tsx --conditions=react-server --test tests/sitemap.test.ts` passed (4 tests); the focused degradation selection excluding only the known U18 PWA assertion passed (9 tests); `npm run typecheck` and `git diff --check` passed.
