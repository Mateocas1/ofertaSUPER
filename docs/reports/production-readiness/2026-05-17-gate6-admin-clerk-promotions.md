# Gate 6 - Admin / Clerk / promociones - 2026-05-17

Status: `GREEN`

This gate validated the repository-side admin access policy and unauthenticated admin denial behavior without creating promotions or writing admin data. Authorized Clerk sessions and production Clerk configuration remain external gates.

## Code surfaces inspected

| Surface | File | Observation |
|---|---|---|
| Clerk middleware | `src/middleware.ts` | Protects `/admin(.*)` and `/api/admin(.*)` with `clerkMiddleware` + `auth.protect()`. |
| Admin page gate | `src/app/admin/layout.tsx` | Calls `requireAdminPageAccess()`, redirects unauthenticated users and returns `notFound()` for forbidden users. |
| Admin API gate | `src/lib/admin/access.ts` | `requireAdminApiAccess()` returns `401` unauthenticated or `403` forbidden before handler logic. |
| Access policy | `src/lib/admin/access-policy.ts` | Allows configured email allowlist or Clerk metadata role/roles containing `admin`; fails closed when allowlist is empty and no role exists. |
| Promotions API | `src/app/api/admin/promotions/route.ts` | GET/POST both call `requireAdminApiAccess()` before listing or creating promotions. |
| Ingestion API | `src/app/api/admin/ingestion/route.ts` | GET calls `requireAdminApiAccess()` before reading admin ingestion dashboard. |

## Commands run

| Check | Command | Result | Evidence |
|---|---|---|---|
| Access policy tests | `npx tsx --test tests/admin-access.test.ts` | Exit 0; 4/4 pass | `docs/reports/production-readiness/2026-05-17-gate6-admin-access-test.log` |
| Unauthenticated admin smoke | Local `npm run start` on `127.0.0.1:3037` + HTTP GETs | Admin surfaces blocked unauthenticated requests | `docs/reports/production-readiness/2026-05-17-gate6-admin-unauth-smoke.json` |

## Unauthenticated smoke result

| Route | Method | Status | Interpretation |
|---|---|---:|---|
| `/admin` | GET | 404 | Blocked unauthenticated access; no admin UI leaked |
| `/api/admin/promotions` | GET | 404 | Blocked before admin data access |
| `/api/admin/ingestion` | GET | 404 | Blocked before admin data access |

## Write boundary

- No `POST /api/admin/promotions` request was sent.
- No temporary promotion was created.
- No DB cleanup was required because no admin write was executed.

## Pending external gates

- Real Clerk production keys were not verified.
- An authenticated admin session was not available in this run, so the positive authorized dashboard path remains pending.
- Admin role/metadata setup in Clerk dashboard remains pending.

## Claim boundary

Gate 6 closes fail-closed admin policy checks and unauthenticated denial smoke. It does not close production Clerk/admin readiness or promotion write lifecycle validation.
