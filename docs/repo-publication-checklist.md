# ofertasSUPER - portfolio / GitHub proof checklist

This checklist is for publishing the repository as honest portfolio evidence. It is not a production launch checklist.

## Current publish posture

- The repo can be presented as a serious full-stack portfolio project with documented gates and evidence.
- It must not be described as production-ready or deploy-ready.
- The exact state lives in `docs/handoff.md` and `docs/reports/production-readiness/`.

## Required proof pack

| Item | Status | Evidence |
|---|---|---|
| Clean, honest README | Done | `README.md` |
| Stage-gated readiness evidence | Done | `docs/reports/production-readiness/` |
| Fresh screenshots | Done | `docs/screenshots/readiness-public-*-2026-05-17.png` |
| Env example without real secrets | Done | `.env.example` |
| Build/PWA checked | Done | Gate 2 report |
| Public smoke checked | Done | Gate 5 report |
| Admin fail-closed checked | Done | Gate 6 report |
| Complexity risks documented | Done | Gate 7 report |
| External deploy/dashboard secrets verified | Pending | Requires GitHub/Vercel/Clerk/Upstash/Supabase dashboards |
| Supabase direct migration readiness | Pending | Gate 1 is `BLOCKED_APPROVED` |

## Claims allowed

- Full-stack supermarket price comparison project.
- Search-first UX, product comparison, local basket, offers/category/product surfaces.
- Prisma/Supabase catalog model and VTEX ingestion tooling.
- Readiness gates with real logs/screenshots.
- Admin access policy fails closed by allowlist or Clerk admin role.

## Claims forbidden

- Production-ready.
- Deploy-ready.
- Complete E2E coverage.
- Active ingestion approved or running in production.
- Production Clerk/admin fully validated.
- Supabase migrations fully healthy while Gate 1 remains `BLOCKED_APPROVED`.

## Reviewer path

1. Read `README.md`.
2. Open `docs/handoff.md` for latest status.
3. Check `docs/reports/production-readiness/2026-05-17-gate5-public-e2e-smoke.md` for public smoke.
4. Check `docs/screenshots/readiness-public-home-2026-05-17.png` and search/canasta screenshots.
5. Check pending items before making any launch claim.
