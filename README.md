# ofertasSUPER

ofertasSUPER is a supermarket price and offer comparison app for Argentina. It has a search-first illustrative home, catalog routes, product comparison by EAN, a local smart basket, VTEX tooling, and guarded admin surfaces.

> Current public-catalog boundary: fresh published data is served normally, older valid publications are explicitly labelled historical, and no valid publication means unavailable—never demo rows. The home is illustrative UI, not catalog evidence. See [issue #460](https://github.com/Mateocas1/ofertaSUPER/issues/460).

## Demo

- Public endpoint: https://ofertas-super.vercel.app (not a live-data, production, or operations acceptance claim).
- Historical smoke evidence: `docs/reports/production-readiness/2026-05-18-gate3-vercel-deploy-context.md`

## What is implemented

- Search-first illustrative home aligned with `docs/design/canasta-inteligente-ui-spec.md`; it is not a real-catalog view.
- Public `/buscar`, `/ofertas`, and catalog APIs are publication-gated: unavailable dependencies or publication return no demo catalog data.
- Product detail route `/producto/[ean]`, category route `/categoria/[slug]`, offers hub `/ofertas`, and local basket route `/canasta`.
- Prisma catalog schema for products, supermarket prices, price history, promotions, categories, ingestion runs, staging products, and source health.
- Permissioned VTEX probe and ingestion tooling with shadow/dry-run modes, validation, reconciliation code, and metrics; these modes are not operational acceptance.
- Admin access policy that fails closed unless the signed Clerk session contains the exact `metadata.role` admin claim.
- PWA assets/offline fallback; the local build at pre-candidate base `82c594d` is historical evidence only.

## Historical evidence and current acceptance boundary

This section reconciles evidence on 2026-09-07 against base `b999298b755288d47c645185e00e154f62b9aca1`. The following is dated historical evidence, not new execution or a global operational acceptance claim. The [2026-08-13 portfolio closure](docs/reports/portfolio-readiness/2026-08-13-functional-mvp-closure.md) remains valuable historical evidence, including its former credential-free fixture journey; that journey is not the current catalog contract. Older [production-readiness reports](docs/reports/production-readiness/) and [career proof](docs/reports/career-proof/2026-05-19-hardening-proof-update.md) are historical, too. [#461](https://github.com/Mateocas1/ofertaSUPER/pull/461) is a proposed roadmap draft, not an integrated change.

- [#423](https://github.com/Mateocas1/ofertaSUPER/pull/423), merged 2026-08-24 at `980eea1c0de88f4311e255acca639c1fa06b7f28`, reported 669 tests and credential-free standalone `/buscar` query and `/ofertas` `200` unavailable/no-demo behavior; strict APIs returned unavailable `503`.
- [#424](https://github.com/Mateocas1/ofertaSUPER/pull/424), merged the same day at `cf001128ea35ab21434c34ec7e1acb2720ac5b2c`, reported 672 tests plus disposable DB/Chromium proof of fresh, historical, and unavailable catalog states. This is isolated historical proof.
- Recovery is an achieved historical unit: the [#405 recovery record](https://github.com/Mateocas1/ofertaSUPER/issues/405#issuecomment-5460245965) dated 2026-08-29 records encrypted Production backup, disposable PostgreSQL 17 restore, eight migrations, and corrected drift. The linked workflow runs [33233008475](https://github.com/Mateocas1/ofertaSUPER/actions/runs/33233008475) and [33233070243](https://github.com/Mateocas1/ofertaSUPER/actions/runs/33233070243) report success at `988aeeba076a55e734e1720cc1aad128b6fd5be9`; a future candidate/window still needs freshness validation.
- [#415](https://github.com/Mateocas1/ofertaSUPER/pull/415) is fixture-shadow, manual, default-off, and has no cron; it is not live or scheduler acceptance. The #405 external-support window, reviewed deployment/SHA and least privilege, two real Disco shadows plus one limited write/reconciliation, seven real 24-hour cycles, and signed go/no-go remain pending.
- [#395](https://github.com/Mateocas1/ofertaSUPER/issues/395) remains open and unapproved. #398/#402 integrated primitives do not close its exact v2 admission; #402's 19 unit tests did not execute runtime, and #378's closure conflicts with stale #395 wording. Keep the #395 gate; do not broaden the allowlist.

The implementation and historical proof above describe behavior, not operational acceptance. Operational acceptance remains governed by [#405](https://github.com/Mateocas1/ofertaSUPER/issues/405), and candidate admission remains governed by [#395](https://github.com/Mateocas1/ofertaSUPER/issues/395). Warm-cache revocation is an unconfirmed risk tracked in [#460](https://github.com/Mateocas1/ofertaSUPER/issues/460)/OS-03; no-demo or PWA-navigation tests do not already prove it.

## Screenshots

Historical public Vercel smoke screenshots (2026-05-18) are stored in:

- `docs/screenshots/vercel-public-home-2026-05-18.png`
- `docs/screenshots/vercel-public-search-2026-05-18.png`
- `docs/screenshots/vercel-public-canasta-2026-05-18.png`

Older screenshots may exist as historical evidence. Treat the filenames and report dates as the source of truth.

## Stack

- Next.js 16.3.1 App Router + React 19
- TypeScript
- Tailwind CSS v4
- Prisma + Supabase Postgres
- Conventional Redis or Upstash for cache/rate-limit when configured
- Clerk for admin auth
- VTEX ingestion/probe scripts
- Node test runner via `tsx --test`

## Credential-free catalog behavior

There is no `CATALOG_OFFLINE_MODE` public-catalog fallback. Without configured dependencies and a valid publication, `/buscar` queries and `/ofertas` truthfully show unavailable and do not fabricate rows. Do not infer a working sample EAN, product detail, or basket journey from a credential-free visit.

For local prerequisites and operator commands, see [`docs/portable-runtime-contract.md`](docs/portable-runtime-contract.md). Each command needs appropriate runtime and Clerk configuration where applicable plus separate execution permission; prior runtime observations are historical evidence, not a clean-checkout startup guarantee.

## Permissioned production and live-data operations

Copy `.env.example` to `.env.local` and fill only local/development values. Do not commit `.env` or `.env.local`; both are ignored.

For role-scoped environment requirements and conventional PostgreSQL operation, see [`docs/portable-runtime-contract.md`](docs/portable-runtime-contract.md). Docker Compose proof is permissioned: it builds and writes disposable resources and requires Docker Compose v2, configured prerequisites, and explicit build/runtime authorization; it is not a default-safe operation.

Minimum keys for real-data work:

```env
DATABASE_URL=
DIRECT_URL=
REDIS_URL=
VTEX_SHA256_HASH=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Admin authorization requires a Clerk session-token template and a backend-managed role assignment. Follow the signed-claim setup and rotation procedure in [`docs/portable-runtime-contract.md`](docs/portable-runtime-contract.md); the application does not authorize from email addresses or live user metadata.

## Reference verification and ingestion boundaries

The following are reference commands for separately authorized execution, not commands executed here. Historical test, typecheck, lint, build, Docker, and deploy records remain dated evidence rather than current acceptance; `npm run build` requires separate permission.

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

VTEX probes and ingestion are permissioned network operations; dry-run or shadow mode does not grant network or write authorization. Legacy scraper/update scripts default to dry-run, but real writes still require explicit approval plus a rollback/cleanup plan. Do not run active ingestion or local production builds without explicit authorization.

## Architecture map

| Area | Paths |
|---|---|
| Public app routes | `src/app/page.tsx`, `src/app/buscar`, `src/app/producto/[ean]`, `src/app/canasta`, `src/app/ofertas`, `src/app/categoria/[slug]` |
| Public APIs | `src/app/api/search`, `src/app/api/products`, `src/app/api/categories`, `src/app/api/promotions` |
| Catalog/domain logic | `src/lib/catalog.ts`, `src/lib/public-catalog-api.ts`, `src/lib/public-catalog-readiness.ts`, `src/lib/portfolio-catalog.ts` (legacy `src/lib/demo-data.ts` has test-only consumers, not a public fallback) |
| DB schema | `prisma/schema.prisma`, `prisma/migrations/`, `prisma/seed.ts` |
| VTEX and ingestion | `src/lib/vtex/`, `src/lib/ingestion/`, `scripts/ingest.ts`, `scripts/pipeline/` |
| Admin | `src/proxy.ts`, `src/lib/admin/`, `src/app/admin`, `src/app/api/admin` |
| Readiness evidence | `docs/reports/production-readiness/`, `docs/screenshots/`, `docs/handoff.md` |

## Honest claim boundary

Defensible now: the repository has strict public-catalog states, catalog/domain primitives, an illustrative home, guarded admin surfaces, and dated evidence linked above. A valid current publication determines whether public catalog data is fresh, historical, or unavailable.

Not defensible yet: a credential-free functional catalog journey, production launch sign-off, live database/cache connectivity, active ingestion with managed secrets, the production Clerk admin positive path, or global operational acceptance.

## Main pending items

- Validate freshness for every future recovery candidate/window; recovery itself is not absent.
- Keep #395's exact v2 admission gate until its criteria have accepted candidate-bound evidence; issue approval alone does not satisfy admission, and #398/#402 do not establish closure.
- Run only explicitly approved network/shadow/write operations with their required prerequisites and rollback plans.
- Complete the #405 external-support, deployment, least-privilege, real-cycle, and signed go/no-go conditions.
- Assign remaining alerts, cadence, SLO, on-call, and launch ownership.
