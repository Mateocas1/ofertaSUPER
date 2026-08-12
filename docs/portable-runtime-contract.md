# Operate the portable runtime contract

Use the role-scoped preflight before starting a real runtime operation. It validates names and PostgreSQL URL shape without connecting to any dependency or printing values.

## Commands

```bash
npm run runtime:check -- web
npm run runtime:check -- job
npm run runtime:check -- migration
```

## Dependency matrix

| Role or mode | Required names | Optional names and behavior |
|---|---|---|
| `web` | `DATABASE_URL` | `NEXT_PUBLIC_SITE_URL`; public paths degrade when cache is absent |
| `web` with `ADMIN_ENABLED=true` | `DATABASE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | `ADMIN_EMAILS` narrows access by allowlist; Clerk metadata roles remain supported |
| `job` | `DATABASE_URL`, `VTEX_SHA256_HASH` | `SCRAPER_ALERT_WEBHOOK_URL`; VTEX delay/user-agent tuning |
| `migration` | `DIRECT_URL` | None |

Both `postgresql://` and `postgres://` URLs are accepted. The preflight is an operator CLI, not a startup hook. Existing entrypoints are intentionally unchanged until they can consume the contract without broad initialization changes.

## Parity and deferred work

This contract does not make every external service portable: VTEX acquisition still calls VTEX and admin mode still uses Clerk. Compose, health routes, scheduling, images, database operation scripts, and auth migration remain deferred.
