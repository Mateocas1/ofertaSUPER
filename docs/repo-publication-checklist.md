# ofertasSUPER - portfolio / GitHub proof checklist

This checklist is for publishing the repository as honest portfolio evidence. It is not a production launch checklist.

## Current publish posture

- The repo can be presented as a serious full-stack portfolio project with documented gates, evidence, and a smoke-verified public demo.
- It must not be described as production-ready or launch-ready.
- The exact state lives in `docs/handoff.md` and `docs/reports/production-readiness/`.

## Required proof pack

| Item | Status | Evidence |
|---|---|---|
| Clean, honest README | Done | `README.md` |
| Stage-gated readiness evidence | Done | `docs/reports/production-readiness/` |
| Fresh screenshots | Done | `docs/screenshots/vercel-public-*-2026-05-18.png` |
| Safe `.env.example` without real secrets | Done | `.env.example` |
| Build/PWA checked | Done | Gate 2 report |
| Public smoke checked | Done | Gate 3 Vercel report plus prior Gate 5 local production smoke |
| Admin fail-closed checked | Done | Gate 6 report |
| Complexity risks documented | Done | Gate 7 report |
| Vercel public deploy smoke | Done | `docs/reports/production-readiness/2026-05-18-gate3-vercel-deploy-context.md` |
| Production admin positive path | Pending | `ADMIN_EMAILS` was not present locally and was not invented |
| Scheduled ingestion ops | Pending | GitHub Actions schedules are paused until secrets/cadence are configured |

## Claims allowed

- Full-stack supermarket price comparison project.
- Search-first UX, product comparison, local basket, offers/category/product surfaces.
- Prisma/Supabase catalog model and VTEX ingestion tooling.
- Readiness gates with real logs/screenshots.
- Smoke-verified public Vercel demo.
- Admin access policy fails closed by allowlist or Clerk admin role.

## Claims forbidden

- Production-ready or launch-ready.
- Complete E2E coverage.
- Active ingestion approved or running in production.
- Production Clerk/admin fully validated.
- Scheduled ingestion automation configured/running.

## Reviewer path

1. Read `README.md`.
2. Open `docs/handoff.md` for latest status.
3. Open the public demo: https://ofertas-super.vercel.app.
4. Check `docs/reports/production-readiness/2026-05-18-gate3-vercel-deploy-context.md` for deploy and public smoke evidence.
5. Check `docs/screenshots/vercel-public-home-2026-05-18.png` and search/canasta screenshots.
6. Check pending items before making any launch claim.
