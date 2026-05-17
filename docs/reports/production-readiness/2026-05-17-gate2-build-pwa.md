# Gate 2 - Build / PWA blocker - 2026-05-17

Status: `GREEN`

This gate was executed from `goal.md` after the user explicitly approved deferring Gate 1/Supabase as `BLOCKED_APPROVED`. The normal build passed without disabling PWA.

## Commands run

| Check | Command | Result |
|---|---|---|
| Build/PWA | `npm run build` | Exit 0 |
| PWA fallback isolation | `DISABLE_PWA=true npm run build` | Not run; normal build passed, so no workaround was needed |

## Evidence

- Full build log: `docs/reports/production-readiness/2026-05-17-gate2-build-normal.log`.
- Build start: `2026-05-17T00:12:54.1247437-03:00`.
- Build end: `2026-05-17T00:13:11.2881174-03:00`.
- Exit code: `0`.

## Observed output

- Next.js version reported by build: `15.5.14`.
- PWA compiled for server and client.
- Service worker generated at `public/sw.js`.
- Service worker URL: `/sw.js`.
- Service worker scope: `/`.
- Offline fallback route: `/~offline`.
- Static page generation reached `21/21`.
- Build route table included public pages, admin pages, and API routes.

## Warnings that remain

| Warning | Impact | Follow-up |
|---|---|---|
| Next.js inferred workspace root from parent `C:\Users\picala\pnpm-lock.yaml` while this repo has `package-lock.json` | Non-blocking for this build, but can confuse tracing/root assumptions on Windows | Review `outputFileTracingRoot` or lockfile placement in a later focused config cleanup |
| Webpack cache warned about serializing a 194 KiB string | Non-blocking performance/cache warning | Defer unless it becomes a repeated build-time issue |

## Interpretation

The Build/PWA blocker is not reproduced in this run. `npm run build` passes with PWA enabled, so accepting `DISABLE_PWA=true` is unnecessary and was not used as a workaround. The phase is green, but the workspace-root warning should remain visible as a follow-up because it can affect future build/deploy environments.

## Claim boundary

This gate only closes local Build/PWA readiness for the current checkout. It does not close Supabase direct migration readiness, external secrets, deploy dashboard settings, production Clerk, active ingestion, or deep E2E.
