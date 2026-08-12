# Operate the portable runtime contract

Use the role-scoped preflight before starting a real runtime operation. It validates names and PostgreSQL URL shape without connecting to any dependency or printing values.

## Commands

```bash
npm run runtime:check -- web
npm run runtime:check -- job
npm run runtime:check -- migration
npm run db:bootstrap:render -- ofertasuper ofertasuper_owner ofertasuper_app > bootstrap.sql
npm run db:migrate:deploy
```

## Standalone web image

The default Dockerfile packages only the Next.js web server. During development, its contract and build passed, and the non-root container served `/` in an isolated no-network, read-only smoke test without configured dependencies. This proves packaging and dependency-free degraded startup—not DB/Redis-backed behavior, durable storage, backup/restore, or production operations.

Supply the `web` names below at runtime; no environment file or secret is copied into the image. `NEXT_PUBLIC_*` values referenced by client code are build-time inputs. The PWA plugin mutates only the isolated builder stage. The runner starts with `node server.js`, owns `.next` for runtime cache, and is not a job or migration image because standalone output omits repository scripts and development tooling.

No healthcheck is declared because the app has no dedicated liveness route. Operators must define platform readiness and writable cache/storage policy before production use.

## Dependency matrix

| Role or mode | Required names | Optional names and behavior |
|---|---|---|
| `web` | `DATABASE_URL` | `NEXT_PUBLIC_SITE_URL`; `REDIS_URL` or Upstash pair; public paths degrade when cache is absent |
| `web` with `ADMIN_ENABLED=true` | `DATABASE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | `ADMIN_EMAILS` narrows access by allowlist; Clerk metadata roles remain supported |
| `job` | `DATABASE_URL`, `VTEX_SHA256_HASH` | `REDIS_URL` or Upstash pair; `SCRAPER_ALERT_WEBHOOK_URL`; VTEX delay/user-agent tuning |
| `migration` | `DIRECT_URL` | None |

Configure exactly one Redis provider: conventional Redis through `REDIS_URL`, or Upstash through both Upstash names. `REDIS_URL` wins deterministically at runtime, while preflight rejects conflicts. Without a complete provider, cache misses and rate limiting fail open. The conventional limiter uses an atomic Lua fixed window (60 requests/60 seconds), connects lazily with a one-second bound, and does not reconnect automatically; it does not claim sliding-window parity. Errors and probes expose names or reason codes, never values.

## Conventional PostgreSQL

Both `postgresql://` and `postgres://` URLs are accepted. `DATABASE_URL` is the application connection and may use a server or pooler. `DIRECT_URL` is reserved for migration/admin operations; production migrations should avoid transaction poolers. The preflight is an operator CLI, not a startup hook.

`db:migrate:deploy` runs `prisma migrate deploy`: it never creates migrations. Its wrapper requires `DIRECT_URL`, substitutes it as the child process's `DATABASE_URL`, and keeps the URL out of argv and output.

## Bootstrap and recovery

Create the database, an owner/migration login, and a separate application login outside this repository; credential creation is excluded. Render and inspect `bootstrap.sql`, then apply it as owner:

```bash
psql -X -v ON_ERROR_STOP=1 --file bootstrap.sql "$DIRECT_URL"
```

Run migrations first on a fresh database. The SQL grants runtime table/sequence access, configures owner-scoped default privileges, and revokes schema `CREATE` from the app role. Reapply it after ownership changes. It grants no superuser, role/database administration, or RLS bypass. Historical Supabase RLS remediation is not in Prisma migrations; owners normally bypass RLS unless `FORCE ROW LEVEL SECURITY` is set, so these grants do **not** reproduce or prove that posture.

Backup and restore are operator procedures, not automated or rehearsed here:

```bash
pg_dump --format=custom --no-owner --no-acl --file backup.dump "$DIRECT_URL"
pg_restore --list backup.dump
pg_restore --exit-on-error --no-owner --no-acl --dbname "$DISPOSABLE_URL" backup.dump
```

Inspect the archive first, restore only into a disposable empty database, then run application integrity checks. No recovery objective or production parity is claimed.

## Parity and deferred work

This contract does not make every external service portable: VTEX acquisition still calls VTEX and admin mode still uses Clerk. Compose, health routes, scheduling, job packaging, auth migration, DB/Redis-backed runtime validation, durable production operations, and Upstash-coupled alert deduplication remain deferred.
