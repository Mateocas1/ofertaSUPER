# ofertasSUPER technical engineering audit - 2026-05-19

Status: `REPORT-ONLY COMPLETE`

This audit evaluates ofertasSUPER as a portfolio/laboral-readiness project, not as a production-ready launch. No product code, ingestion job, SQL change, deploy, dashboard, or external career asset was modified.

## Executive summary

ofertasSUPER is solid and defendible as a full-stack portfolio project: public Vercel demo, search-first UI, Prisma/Supabase catalog model, VTEX ingestion tooling, guarded admin surfaces, RLS hardening evidence, rate-limited APIs, fail-open search behavior, and a documented readiness trail.

It is still not production-ready. Main remaining risks: legacy write scripts can still perform real writes by default, public DB-dependent routes do not all degrade consistently, product listing still does broad in-memory work after Prisma reads, ingestion lacks an explicit cross-job concurrency/idempotency guard, and the authenticated production admin positive path remains unverified.

## Gate 0 - identity and baseline

| Check | Result |
|---|---|
| Repo root | `C:/Users/picala/Documents/ofertasSUPER` |
| Remote | `git@github.com:Mateocas1/ofertaSUPER.git` |
| Branch | `master` |
| Local vs remote | `HEAD == origin/master` at `e688cb04b7432d8d584decafc049789a3cbcaa01` |
| Working tree before audit writes | clean |
| Goal prompts | local-only under `docs/goals/`, excluded by `.git/info/exclude`, not tracked |
| Build | not run by contract |

## Gate 1 - system map

| Layer | Main surfaces |
|---|---|
| Public routes | `/`, `/buscar`, `/producto/[ean]`, `/canasta`, `/ofertas`, `/categoria/[slug]`, `/~offline`, `/robots.txt`, `/sitemap.xml` |
| Public APIs | `/api/search`, `/api/products`, `/api/products/[ean]`, `/api/products/[ean]/history`, `/api/categories`, `/api/promotions` |
| Admin APIs | `/api/admin/promotions`, `/api/admin/promotions/[id]`, `/api/admin/ingestion` |
| Domain/catalog | `src/lib/catalog.ts`, `src/lib/demo-data.ts`, `src/lib/safe-data.ts`, `src/lib/promotions/*` |
| Prisma models | `Supermarket`, `Product`, `SupermarketProduct`, `PriceHistory`, `Promotion`, `PromotionProduct`, `Category`, `IngestionRun`, `StagingProduct`, `SourceHealth` |
| Ingestion | `scripts/ingest.ts`, `scripts/updatePrices.ts`, `scripts/scrapers/*`, `scripts/pipeline/*`, `src/lib/vtex/*` |
| Auth/security | `src/middleware.ts`, `src/lib/admin/access.ts`, `src/lib/admin/access-policy.ts`, `src/lib/rate-limit.ts`, `next.config.ts` |
| CI/ops | `.github/workflows/*.yml`, Vercel/readiness reports, `package.json` scripts |

Migrations present:

- `20260320_init`
- `20260322_ingestion_sprint1`
- `20260322_price_history_avg_idx`
- `20260322_staging_unlogged`

## Mandatory area coverage

| Required area | Coverage in this audit |
|---|---|
| Clean code | Large/mixed-responsibility modules were identified: `src/lib/catalog.ts` 836 lines, `scripts/pipeline/reconcile.ts` 634 lines, `src/components/admin-promotions-manager.tsx` 447 lines. No large refactor is recommended before safety gates because payoff is lower than write-safety and runtime resilience. |
| TypeScript | `strict: true` is enabled and `npm run typecheck` exits 0. Static marker grep found no project `: any` / `as any` usage in source; the notable cast is `globalThis as unknown as { prisma?: PrismaClient }` in `src/lib/db.ts`, a common Prisma singleton pattern. |
| Imports/exports | Simple static import graph found likely unused UI shells (`category-nav.tsx`, `header-quick-actions.tsx`, `ui/button.tsx`), with a caveat to confirm using a type-aware tool before deletion. |
| Generated noise / trash files | Tracked-file check found no tracked `.next`, `node_modules`, `.env`, `.env.local`, `.vercel`, `tsconfig.tsbuildinfo`, `public/*.js`, or `docs/goals` files. These are ignored/excluded. |
| Tests | `npm test` is green, but coverage is narrow for production claims; P1-06 maps the missing high-risk test surfaces. |
| Edge cases | DB-down behavior is explicitly covered in P1-02; current search fallback is strong, but products/categories/promotions/product-detail are inconsistent. |
| Race conditions | Ingestion concurrency/idempotency is covered in P1-04. |
| Performance | Product listing scale, basket N+1, VTEX traversal, and product-detail promotion scans are covered in P1-03 and P2 findings. |
| Security | RLS posture, admin fail-closed, rate-limit, API validation, broad image host, and admin positive-path gap are covered. |
| Production ops | Secrets/schedules/admin/monitoring/backups remain claim blockers; this audit intentionally keeps `not production-ready` as the boundary. |

## What is solid and defendible

| Area | Evidence | Why it matters |
|---|---|---|
| Public demo | Fresh smoke against `https://ofertas-super.vercel.app` returned 200 for 8 bounded routes. | Recruiter-facing demo is alive within bounded smoke scope. |
| Honest README boundary | `README.md` says portfolio/readiness and explicitly rejects production-ready claims. | Professional positioning is honest. |
| RLS posture | `docs/reports/production-readiness/2026-05-18-gate1-supabase-rls-posture.md`. | Strong security story with evidence. |
| Admin fail-closed policy | `src/middleware.ts`, `src/lib/admin/access.ts`, `tests/admin-access.test.ts`, Gate 6 report. | Admin handlers are guarded before business logic. |
| Input validation | `src/lib/schemas/search.ts`, `src/lib/schemas/product.ts`, `src/lib/schemas/promotion.ts`. | Zod bounds public queries and admin payloads. |
| Rate limiting | `src/lib/rate-limit.ts` plus API route imports. | Shared public/admin rate-limit wrapper. |
| Search fail-open | `src/app/api/search/route.ts`, `src/app/buscar/page.tsx`, `src/lib/safe-data.ts`. | Primary search path survives DB/cache dependency problems. |
| Verification baseline | `npm test`, `typecheck`, `lint`, Prisma validate/status. | Current repo is green for portfolio-readiness checks. |

## Gate 2 - findings

### P0

No P0 issue was found in this report-only audit. Current public smoke is green.

### P1-01 - Legacy write scripts remain an accidental production-write footgun

Evidence:

- `package.json:16-24` exposes `scrape:*` and `update:prices`.
- `.github/workflows/update-prices.yml:30-36` runs `npm run update:prices` without `--dry-run` when manually dispatched.
- `scripts/updatePrices.ts:6-45` reads `dryRun` only from CLI flags, then calls `runStoreScraper`.
- `scripts/scrapers/shared.ts:130-160` defaults `dryRun = false`; when false it calls `persistPricing`.
- `scripts/scrapers/shared.ts:60-124` upserts products/prices and inserts `priceHistory`.

Impact: a manual workflow dispatch or local script run can perform real writes without an explicit confirmation flag. Schedules are paused, so this is not currently firing, but it is still a data-safety and reputation risk once secrets are configured.

Recommendation: default legacy scripts to dry-run/no-write or require explicit `--confirm-write` / `INGESTION_WRITE_APPROVED=true`. Prefer staged ingestion for writes.

Tests needed: CLI flag tests, mocked persistence tests, workflow/static trigger assertion.

Laboral value: strong operational-safety story.

### P1-02 - DB-down degradation is inconsistent outside search

Evidence:

- `/buscar` and `/api/search` use DB availability preflight and fallback.
- `/api/products` calls `listProducts()` directly and catches all errors as bad request (`src/app/api/products/route.ts:16-36`).
- `/api/promotions` calls `getPromotions()` directly and catches all errors as bad request (`src/app/api/promotions/route.ts:16-30`).
- `/api/products/[ean]` calls `getProductDetail()` without a route-level try/catch (`src/app/api/products/[ean]/route.ts:22-48`).
- Product/category/offers pages call catalog functions directly.

Impact: primary search is resilient, but secondary public routes can fail or misclassify runtime DB errors. This blocks stronger production-readiness claims.

Recommendation: add a shared public-data boundary that distinguishes validation errors from runtime dependency failures and defines safe fallback/empty states per route.

Tests needed: route tests with mocked DB/catalog failure, validation tests proving malformed query still returns 400, public smoke for fallback states.

### P1-03 - Product listing reads broad result sets before pagination

Evidence:

- `src/lib/catalog.ts:381-445` builds a Prisma `findMany()` with nested `supermarket_products` and `contains` filters.
- `src/lib/catalog.ts:448-465` maps, filters, sorts and slices in memory after fetching raw products.
- Prisma schema has category/brand indexes, but no full-text/trigram/lowercase index for `contains` search.

Impact: works for demo data, but grows poorly with larger ingestion volume. Pagination happens after broad app-side work.

Recommendation: decide search strategy first, then move more filtering/sorting/pagination into DB and add query/performance fixtures.

Tests needed: seeded catalog tests for search, category, supermarket, price filters, offers-only, pagination and sort.

### P1-04 - Ingestion lacks explicit cross-job concurrency/idempotency guard

Evidence:

- `.github/workflows/*.yml` has no `concurrency:` key.
- Static search found no advisory lock, `FOR UPDATE SKIP LOCKED`, mutex, or workflow-level cancel-in-progress guard.
- `scripts/pipeline/reconcile.ts:566-608` loads pending candidates, chunks them, then processes each chunk in a transaction.
- `scripts/pipeline/reconcile.ts:524-540` inserts `priceHistory` and then marks staging rows as `PROMOTED`.

Impact: if manual/automated runs overlap later, duplicate promotion attempts and duplicate price-history rows are plausible. Product upsert protects one table, but the job is not clearly single-flight.

Recommendation: add workflow `concurrency` plus application/DB-level guard before active ingestion.

Tests needed: reconcile idempotency test, simulated concurrent claim test, workflow assertion.

### P1-05 - Admin production positive path remains unverified

Evidence:

- Gate 6 verified fail-closed unauthenticated behavior and policy unit tests.
- `docs/reports/production-readiness/2026-05-17-gate6-admin-clerk-promotions.md` says authenticated admin session, production Clerk keys and role/metadata setup remain external pending gates.
- `docs/reports/production-readiness/2026-05-18-gate3-vercel-deploy-context.md` says `ADMIN_EMAILS` was missing locally and was not invented.

Impact: defensive admin boundary is good, but production admin functionality cannot be claimed.

Recommendation: verify one authenticated production admin positive path with user-approved credentials/session, without destructive writes.

Tests needed: bounded authenticated smoke; if a promotion write is tested, create temporary record and clean it with evidence.

### P1-06 - Tests are green but still narrow for production claims

Evidence:

- `npm test` passes 21 tests across 5 files.
- No E2E suite is present under `tests/`.
- No route integration tests cover `/api/products`, `/api/products/[ean]`, `/api/categories`, `/api/promotions`, admin API writes, or ingestion concurrency.

Impact: current tests support portfolio-readiness, not production-readiness.

Recommendation: add focused tests around hardening slices only; avoid vanity coverage.

## P2 findings

| Finding | Evidence | Recommendation |
|---|---|---|
| Basket N+1 API calls | `src/components/canasta-page.tsx:104-135` fetches one `/api/products/${ean}` per EAN. | Add batch product/basket quote endpoint. |
| VTEX traversal O(n^2) worst case | `src/lib/vtex/client.ts:164-190` uses `queue.shift()`. | Use cursor or stack traversal and preserve behavior with tests. |
| Broad remote image host | `next.config.ts:39-45` allows `hostname: "**"`. | Restrict to known supermarket/CDN hosts when source list stabilizes. |
| Historical PWA docs are noisy | `docs/release-followup-runbook.md:1-3` says historical, while `:46-64` still describes active failure. | Archive/collapse historical blocker content. |
| Likely unused UI shells | Static scan found no inbound imports for `category-nav.tsx`, `header-quick-actions.tsx`, `ui/button.tsx`. | Confirm with type-aware tool before deletion. |
| Prisma 7 config warning | Prisma commands exit 0 but warn `package.json#prisma` is deprecated. | Track future `prisma.config.ts` migration. |

## Gate 3 - prioritization

| Priority | Items |
|---|---|
| P0 | None. |
| P1 | Legacy write-script guard, public DB-down/API error semantics, product-list scalability, ingestion concurrency/idempotency, admin positive path, focused integration tests. |
| P2 | Basket batch endpoint, VTEX traversal optimization, remote image host restriction, historical docs cleanup, possible unused component cleanup, Prisma config migration. |

## Verification run

No build was run.

| Check | Result |
|---|---|
| `npm test` | exit 0; 21 tests, 21 pass, 0 fail |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npx prisma validate --schema prisma/schema.prisma` | exit 0; schema valid; Prisma 7 config warning printed |
| `npx prisma migrate status --schema prisma/schema.prisma` | exit 0; 4 migrations; schema up to date; Prisma 7 update/config warning printed |
| Public smoke | 8/8 bounded routes returned 200 with no Prisma/framework crash text detected |

Public smoke base URL: `https://ofertas-super.vercel.app`.

| Route | Status |
|---|---:|
| `/` | 200 |
| `/buscar?q=leche` | 200 |
| `/api/search?q=yerba&limit=1` | 200 |
| `/api/products?q=leche&limit=2` | 200 |
| `/api/categories` | 200 |
| `/api/promotions` | 200 |
| `/producto/7790710334757` | 200 |
| `/canasta` | 200 |

## Not done

- No `npm run build`.
- No active ingestion, non-dry-run scraper, or write job.
- No SQL change.
- No deploy.
- No Vercel/Supabase/GitHub dashboard mutation.
- No LinkedIn, portfolio, CV, or job-application work.
- No product feature implementation.

## Conclusion

The best next move is not new features. It is a focused hardening sprint around write safety, public-route resilience, ingestion idempotency, and proof-grade tests. That creates stronger career evidence than superficial expansion.
