# ofertasSUPER

ofertasSUPER is a supermarket price and offer comparison app for Argentina. It is built around a search-first home, product comparison by EAN, a local smart basket, public catalog APIs, VTEX ingestion tooling, and guarded admin surfaces.

> Status: portfolio/readiness project in progress. The repo has strong verified slices, but it is not production-ready or deploy-ready yet. See `docs/handoff.md` and `docs/reports/production-readiness/` for the exact gate evidence.

## What is implemented

- Search-first home aligned with `docs/design/canasta-inteligente-ui-spec.md`.
- Public search page `/buscar` and API `/api/search` with fail-open behavior when cache/DB dependencies are unavailable.
- Product detail route `/producto/[ean]`, category route `/categoria/[slug]`, offers hub `/ofertas`, and local basket route `/canasta`.
- Prisma catalog schema for products, supermarket prices, price history, promotions, categories, ingestion runs, staging products, and source health.
- VTEX probe and ingestion pipeline with shadow/dry-run mode, quality validation, reconciliation code, and operational metrics.
- Admin access policy that fails closed unless a Clerk user matches `ADMIN_EMAILS` or has an explicit admin role in metadata.
- PWA assets/offline fallback; current local build passes with PWA enabled.

## Current readiness evidence

| Gate | Status | Evidence |
|---|---|---|
| Supabase / Prisma direct migrations | `BLOCKED_APPROVED` | `docs/reports/production-readiness/2026-05-17-gate1-supabase-prisma.md` |
| Build / PWA | `GREEN` | `docs/reports/production-readiness/2026-05-17-gate2-build-pwa.md` |
| Env / deploy / secrets audit | `GREEN` | `docs/reports/production-readiness/2026-05-17-gate3-env-deploy-secrets.md` |
| Controlled ingestion dry-run | `GREEN` | `docs/reports/production-readiness/2026-05-17-gate4-ingestion-controlled.md` |
| Public smoke | `GREEN` | `docs/reports/production-readiness/2026-05-17-gate5-public-e2e-smoke.md` |
| Admin / Clerk fail-closed checks | `GREEN` | `docs/reports/production-readiness/2026-05-17-gate6-admin-clerk-promotions.md` |
| Complexity scan | `GREEN` | `docs/reports/production-readiness/2026-05-17-gate7-complexity-report.md` |

## Screenshots

Fresh bounded smoke screenshots are stored in:

- `docs/screenshots/readiness-public-home-2026-05-17.png`
- `docs/screenshots/readiness-public-search-2026-05-17.png`
- `docs/screenshots/readiness-public-canasta-2026-05-17.png`

Older screenshots may exist as historical evidence. Treat the filenames and report dates as the source of truth.

## Stack

- Next.js 15 App Router + React 19
- TypeScript
- Tailwind CSS v4
- Prisma + Supabase Postgres
- Upstash Redis for cache/rate-limit when configured
- Clerk for admin auth
- VTEX ingestion/probe scripts
- Node test runner via `tsx --test`

## Local setup

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`.

Copy `.env.example` to `.env.local` and fill only local/development values. Do not commit `.env` or `.env.local`; both are ignored.

Minimum keys for real-data work:

```env
DATABASE_URL=
DIRECT_URL=
VTEX_SHA256_HASH=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
ADMIN_EMAILS=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

## Verification commands

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Safe ingestion checks:

```bash
npm run probe:vtex -- --source=disco --query=leche --count=1
INGESTION_V2=shadow npm run ingest -- --dry-run --source=disco --limit=1
```

Do not run active/non-dry-run ingestion without an explicit approval and a rollback/cleanup plan.

## Architecture map

| Area | Paths |
|---|---|
| Public app routes | `src/app/page.tsx`, `src/app/buscar`, `src/app/producto/[ean]`, `src/app/canasta`, `src/app/ofertas`, `src/app/categoria/[slug]` |
| Public APIs | `src/app/api/search`, `src/app/api/products`, `src/app/api/categories`, `src/app/api/promotions` |
| Catalog/domain logic | `src/lib/catalog.ts`, `src/lib/demo-data.ts`, `src/lib/safe-data.ts` |
| DB schema | `prisma/schema.prisma`, `prisma/migrations/`, `prisma/seed.ts` |
| VTEX and ingestion | `src/lib/vtex/`, `src/lib/ingestion/`, `scripts/ingest.ts`, `scripts/pipeline/` |
| Admin | `src/middleware.ts`, `src/lib/admin/`, `src/app/admin`, `src/app/api/admin` |
| Readiness evidence | `docs/reports/production-readiness/`, `docs/screenshots/`, `docs/handoff.md` |

## Honest claim boundary

Defensible: this repo demonstrates a full-stack price comparison product with search, catalog APIs, basket UX, VTEX ingestion tooling, Prisma/Supabase modeling, admin guardrails, and documented readiness gates.

Not defensible yet: production-ready, deploy-ready, complete E2E coverage, active ingestion approved, production Clerk configured, or Supabase direct migration readiness closed.

## Main pending items

- Fix Supabase `DIRECT_URL` / direct migration connectivity.
- Verify GitHub/Vercel/Clerk/Upstash dashboard secrets externally.
- Validate authenticated admin positive path with real Clerk production config.
- Decide and test any active ingestion writes with explicit approval.
- Consider a future basket batch endpoint to remove the N+1 product-fetch pattern documented in Gate 7.
