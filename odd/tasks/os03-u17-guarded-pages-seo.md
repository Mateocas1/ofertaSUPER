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
- [ ] **U17-T2 — Guard product HTML, metadata, and JSON-LD**
  - Remove the raw `getProductDetail` metadata path; use guarded detail/history data and emit no commercial schema on denial.
- [ ] **U17-T3 — Guard search, offers, and category pages**
  - Replace legacy/raw catalog loaders, preserve static taxonomy and shell, and suppress commercial results/SEO claims on denial.
- [ ] **U17-T4 — Guard sitemap, basket denial UX, and navigation**
  - Omit governed product sitemap values when unavailable and prove browser navigation/prefetch/RSC cannot leak facts.
- [ ] **U17-T5 — Built-server/browser triangulation, review, and commits**
  - Run eligible/denied built Next evidence for HTML, head, JSON-LD, RSC/prefetch, sitemap, shell, and navigation; independently verify and complete native review.

## Current state

U16 is frozen at `c8726c1` with closure ledger `5a2dbbf`. U17 exploration identified raw page/metadata/sitemap bypasses. U17-T1 is complete; routes remain unmigrated.

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
