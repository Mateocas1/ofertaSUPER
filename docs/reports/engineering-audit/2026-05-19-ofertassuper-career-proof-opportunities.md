# ofertasSUPER career proof opportunities - 2026-05-19

Status: `RAW MATERIAL ONLY`

This file extracts public/interview material from the technical audit. It does not draft LinkedIn posts, does not apply to jobs, and does not inflate claims.

## Safe positioning

Safe claim:

> ofertasSUPER is a portfolio-grade full-stack supermarket price comparison project with a public Vercel demo, Prisma/Supabase catalog model, VTEX ingestion tooling, guarded admin surfaces, RLS hardening evidence, and documented engineering-readiness gates.

Unsafe claims to avoid:

- production-ready
- launch-ready
- complete E2E coverage
- active production ingestion
- fully validated production admin
- senior-level or formal IT work experience

## Opportunity 1 - Security posture: RLS and server-side data access boundary

Problem: Supabase exposed public schema tables through PostgREST-facing roles before remediation.

Decision: keep browser access out of Supabase tables, use server-side Prisma as the app data path, revoke broad `anon`/`authenticated` grants, and enable RLS without public policies.

Evidence:

- `docs/reports/production-readiness/2026-05-18-gate1-supabase-rls-posture.md`
- `src/lib/db.ts`
- `src/app/api/**/route.ts`

Learning: security posture is not just "turn RLS on". You need to know the app access model first.

Safe public claim:

> I audited and hardened the Supabase/Postgres access model by aligning RLS/grants with a server-side Prisma architecture and documenting the verification evidence.

Interview angle: explain why no public RLS policies were added: the current app should not expose direct table access from the browser.

## Opportunity 2 - Reliability: fail-open search and dependency-aware degradation

Problem: public demos break trust fast when DB/cache dependencies are paused or unavailable.

Decision: make the primary search path degrade to bounded demo data, and keep Redis/rate-limit failures from taking down search.

Evidence:

- `src/app/api/search/route.ts`
- `src/app/buscar/page.tsx`
- `src/lib/catalog-availability.ts`
- `src/lib/safe-data.ts`
- `npm test`: safe data fallback, catalog availability, demo data fallback

Learning: a portfolio app can still show production thinking when it handles dependency failure explicitly.

Safe public claim:

> I built fail-open behavior for the primary search path so the demo remains useful when external data dependencies are unavailable.

Interview angle: contrast where the project is strong (`/buscar`, `/api/search`) with where the audit still found gaps (`/api/products`, product/category/promotions routes).

## Opportunity 3 - Data pipeline: staged VTEX ingestion with shadow/dry-run evidence

Problem: scraping/ingesting supermarket data can easily become unsafe: bad data, duplicated writes, blocked sources, or accidental production mutations.

Decision: create safer VTEX probe and staged ingestion paths with health checks, quality gates, shadow/dry-run mode, reconciliation summaries and metrics.

Evidence:

- `scripts/probe-vtex.ts`
- `scripts/ingest.ts`
- `scripts/pipeline/stage.ts`
- `scripts/pipeline/validate.ts`
- `scripts/pipeline/reconcile.ts`
- `scripts/pipeline/metrics.ts`
- `docs/reports/production-readiness/2026-05-17-gate4-ingestion-controlled.md`

Learning: the hard part is not fetching products; the hard part is building an ingestion path that is observable, reversible and safe to operate.

Safe public claim:

> I designed a controlled ingestion workflow with dry-run/shadow modes, quality gates and reconciliation metrics before allowing active writes.

Interview angle: use the audit gap as a mature next step: add write guards and concurrency/idempotency before schedules return.

## Opportunity 4 - Operational discipline: readiness gates instead of fake production claims

Problem: a project can look finished while still missing production operations: secrets, schedules, smoke, admin positive path, backups, monitoring and restore drills.

Decision: document readiness as gates with evidence and explicit claim boundaries.

Evidence:

- `README.md`
- `docs/handoff.md`
- `docs/reports/production-readiness/2026-05-18-professional-readiness-final-audit.md`
- `docs/reports/engineering-audit/2026-05-19-ofertassuper-technical-audit.md`

Learning: professional maturity is not saying "it's production-ready". It is knowing exactly what has been verified and what has not.

Safe public claim:

> I used evidence-based readiness gates to separate portfolio-ready, deploy-smoke-verified and production-ready claims.

Interview angle: answer "how do you know it works?" with concrete commands, files and boundaries.

## Opportunity 5 - Performance thinking: identifying N+1 and query-scaling risks

Problem: current demo scale hides future bottlenecks: basket N+1 requests, broad product listing before pagination, and avoidable O(n^2) VTEX payload traversal.

Decision: keep the audit report-only first, then convert findings into small hardening slices with tests.

Evidence:

- `src/components/canasta-page.tsx:104-135`
- `src/lib/catalog.ts:381-465`
- `src/lib/vtex/client.ts:164-190`
- `docs/reports/production-readiness/2026-05-17-gate7-complexity-report.md`
- `docs/reports/engineering-audit/2026-05-19-ofertassuper-backlog.md`

Learning: performance engineering starts with complexity awareness and evidence, not premature refactors.

Safe public claim:

> I audited the app for N+1, repeated scans and scaling risks, then prioritized fixes by user impact and interview value.

Interview angle: explain why the basket batch endpoint is useful but not as urgent as write-safety or DB-down behavior.

## Opportunity 6 - Auth boundary: fail-closed admin before positive-path claims

Problem: admin surfaces must not leak data to unauthenticated users, but a production positive path also needs proof before claiming readiness.

Decision: protect admin routes with Clerk middleware, centralize email/metadata role checks, test the policy, and explicitly leave production positive path unclaimed until real credentials/session are verified.

Evidence:

- `src/middleware.ts`
- `src/lib/admin/access.ts`
- `src/lib/admin/access-policy.ts`
- `tests/admin-access.test.ts`
- `docs/reports/production-readiness/2026-05-17-gate6-admin-clerk-promotions.md`

Learning: fail-closed is the first half of auth readiness. Positive-path verification is a separate gate.

Safe public claim:

> I implemented and tested fail-closed admin access rules with Clerk, while keeping production admin readiness as an explicit pending gate.

Interview angle: use this to show authorization boundaries, not just login screens.

## Best 3 stories to use first

1. RLS/Supabase hardening because it shows security architecture judgment.
2. Controlled ingestion pipeline because it shows backend/data/ops depth.
3. Readiness gates with honest claim boundaries because it shows professional maturity beyond code.

## What not to publish yet

- Do not publish a "production-ready" post.
- Do not claim active ingestion is running safely.
- Do not claim production admin is fully validated.
- Do not present the audit backlog as already fixed.
