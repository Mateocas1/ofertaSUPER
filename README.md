# ofertasSUPER

ofertasSUPER is a supermarket price and offer comparison app for Argentina. It is built around a search-first home, product comparison by EAN, a local smart basket, public catalog APIs, VTEX ingestion tooling, and guarded admin surfaces.

> Status: the functional portfolio MVP is complete and green at merged functional baseline `45d014f`. This is **not** production launch or live-operations sign-off. See the [current evidence report](docs/reports/portfolio-readiness/2026-08-13-functional-mvp-closure.md).

## Demo

- Public demo: https://ofertas-super.vercel.app
- Latest production smoke evidence: `docs/reports/production-readiness/2026-05-18-gate3-vercel-deploy-context.md`

## What is implemented

- Search-first home aligned with `docs/design/canasta-inteligente-ui-spec.md`.
- Public search page `/buscar` and API `/api/search` with fail-open behavior when cache/DB dependencies are unavailable.
- Product detail route `/producto/[ean]`, category route `/categoria/[slug]`, offers hub `/ofertas`, and local basket route `/canasta`.
- Prisma catalog schema for products, supermarket prices, price history, promotions, categories, ingestion runs, staging products, and source health.
- VTEX probe and ingestion pipeline with shadow/dry-run mode, quality validation, reconciliation code, and operational metrics.
- Admin access policy that fails closed unless a Clerk user matches `ADMIN_EMAILS` or has an explicit admin role in metadata.
- PWA assets/offline fallback; the local build at pre-candidate base `82c594d` passed with PWA enabled.

## Current readiness evidence

Portfolio closure: [`docs/reports/portfolio-readiness/2026-08-13-functional-mvp-closure.md`](docs/reports/portfolio-readiness/2026-08-13-functional-mvp-closure.md).

| Gate | Status | Evidence |
|---|---|---|
| Supabase / RLS hardening | `GREEN` | `docs/reports/production-readiness/2026-05-18-gate1-supabase-rls-posture.md` |
| GitHub Actions hygiene | `GREEN` | `docs/reports/production-readiness/2026-05-18-gate2-github-actions-hygiene.md` |
| Vercel deploy + public smoke | `GREEN` | `docs/reports/production-readiness/2026-05-18-gate3-vercel-deploy-context.md` |
| Build / PWA | `GREEN` | `docs/reports/production-readiness/2026-05-17-gate2-build-pwa.md` |
| Controlled ingestion dry-run | `GREEN` | `docs/reports/production-readiness/2026-05-17-gate4-ingestion-controlled.md` |
| Admin / Clerk fail-closed checks | `GREEN` | `docs/reports/production-readiness/2026-05-17-gate6-admin-clerk-promotions.md` |
| Complexity scan | `GREEN` | `docs/reports/production-readiness/2026-05-17-gate7-complexity-report.md` |
| Hardening proof update | `GREEN` | `docs/reports/career-proof/2026-05-19-hardening-proof-update.md` |

## Recent hardening highlights

The latest hardening sprint focused on engineering risk instead of new features:

- legacy scraper/update writes now default to dry-run and require explicit confirmation;
- public product/category/promotion APIs keep validation errors as `400` while degrading runtime dependency failures to bounded demo fallbacks;
- product listing applies a tested candidate-read cap before loading relation-heavy catalog data;
- ingestion/update workflows share a concurrency group and active reconciliation uses a PostgreSQL advisory lock before loading pending candidates;
- an accidental RED-test `price_history` write was documented, cleaned up with approval, and verified with a post-check.

Career/interview proof: `docs/reports/career-proof/2026-05-19-hardening-proof-update.md`.

## Screenshots

Latest public Vercel smoke screenshots are stored in:

- `docs/screenshots/vercel-public-home-2026-05-18.png`
- `docs/screenshots/vercel-public-search-2026-05-18.png`
- `docs/screenshots/vercel-public-canasta-2026-05-18.png`

Older screenshots may exist as historical evidence. Treat the filenames and report dates as the source of truth.

## Stack

- Next.js 15 App Router + React 19
- TypeScript
- Tailwind CSS v4
- Prisma + Supabase Postgres
- Conventional Redis or Upstash for cache/rate-limit when configured
- Clerk for admin auth
- VTEX ingestion/probe scripts
- Node test runner via `tsx --test`

## Credential-free portfolio quick path

```bash
npm ci
CATALOG_OFFLINE_MODE=true npm run dev
```

Open `http://localhost:3000`, search for `yerba`, open EAN `7790002000022`, add it to the basket, and visit `/ofertas`. Exact `CATALOG_OFFLINE_MODE=true` enables bounded historical demo data; no credentials or secrets are required.

## Production and live-data setup

Copy `.env.example` to `.env.local` and fill only local/development values. Do not commit `.env` or `.env.local`; both are ignored.

For role-scoped environment requirements and conventional PostgreSQL operation, see [`docs/portable-runtime-contract.md`](docs/portable-runtime-contract.md).

To run the disposable PostgreSQL/Redis runtime proof (Docker Compose v2 required):

```bash
npm run smoke:compose
```

It builds locally, verifies database-backed search plus Redis cache/rate limiting, and removes its containers and volumes automatically. See the portable runtime contract for scope and recovery.

Minimum keys for real-data work:

```env
DATABASE_URL=
DIRECT_URL=
REDIS_URL=
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

Legacy scraper/update scripts (`scrape:*`, `update:prices`) default to dry-run. Real legacy writes require an explicit `--confirm-write` flag or `INGESTION_WRITE_APPROVED=true`, plus an approval and rollback/cleanup plan.

Do not run active/non-dry-run ingestion without an explicit approval and a rollback/cleanup plan. Do not run local production builds in this repo workflow unless explicitly authorized; Vercel build logs are the current deploy evidence.

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

Defensible: the functional portfolio MVP is complete. This repo demonstrates a full-stack price comparison product with a credential-free search/detail/basket/offers journey, catalog APIs, VTEX ingestion tooling, Prisma/Supabase modeling, admin guardrails, documented readiness gates, and a smoke-verified public Vercel demo.

Not defensible yet: production launch sign-off, live database/cache connectivity, active ingestion with managed secrets, the production Clerk admin positive path, or closed operational ownership for alerts, backups/restore, cadence, SLOs, on-call, and go/no-go.

## Main pending items

- Connect and verify production PostgreSQL and cache services.
- Run approved shadow ingestion with managed secrets before any active writes.
- Validate the authenticated Clerk admin positive path in production.
- Assign alerts, backups/restore, cadence, SLO, on-call, and launch go/no-go ownership.
