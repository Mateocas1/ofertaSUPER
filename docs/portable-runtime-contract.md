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

Run the disposable local proof with Docker Engine and Compose v2:

```bash
npm run smoke:compose
```

The command uses only explicit local credentials, publishes only the web service on `127.0.0.1:${COMPOSE_WEB_PORT:-3300}`, and automatically runs `down --volumes --remove-orphans`, including after assertion failures. If interrupted before cleanup, recover with `docker compose --project-name ofertasuper-compose-smoke --file compose.yml down --volumes --remove-orphans`.

This proves fresh-database migrations as owner, generated app grants, fixture insertion through the least-privileged role, database provenance and freshness from `/api/search`, and conventional Redis cache/rate-limit writes. It does not prove production security, durability, backup/restore, external services, admin auth, ingestion, or orchestration readiness.

The default Dockerfile packages only the Next.js web server. During development, its contract and build passed, and the non-root container served `/` in an isolated no-network, read-only smoke test without configured dependencies. This proves packaging and dependency-free degraded startup—not DB/Redis-backed behavior, durable storage, backup/restore, or production operations.

Supply the `web` names below at runtime; no environment file or secret is copied into the image. `NEXT_PUBLIC_*` values referenced by client code are build-time inputs. The PWA plugin mutates only the isolated builder stage. The runner starts with `node server.js`, owns `.next` for runtime cache, and is not a job or migration image because standalone output omits repository scripts and development tooling.

`GET /api/health/live` reports process liveness without probing dependencies; the image HEALTHCHECK uses it so a database outage does not restart a healthy process. `GET /api/health/ready` validates the generic web runtime contract and executes a PostgreSQL query; it returns `503` when traffic must stop. Redis is reported as optional and never gates readiness. Responses contain only generic status/component data. Compose uses readiness because its web service should accept traffic only after PostgreSQL is usable; container liveness and orchestrator readiness are deliberately distinct.

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

Run the disposable local recovery rehearsal with Docker Engine and Compose v2:

```bash
npm run smoke:postgres-recovery
```

The command creates unique source and restore Compose projects and volumes. It migrates and fixtures the source under the existing owner/application role model, writes a custom-format logical archive to a harness-owned operating-system temporary directory, restores it into fresh target state, reapplies application grants, and verifies migration state, the deterministic catalog fixture, and application-role reads. A row inserted only after the dump must remain visible in the source and absent from the restore, proving the checks address distinct database state.

Both projects, their networks and volumes, and the temporary archive are removed after success, failure, `SIGINT`, or `SIGTERM` where the process can handle the signal. If the process is forcibly killed, use the project prefixes printed by Docker to identify and remove residual disposable resources.

For manual operator reference, the core archive commands are:

```bash
pg_dump --format=custom --no-owner --no-acl --file backup.dump "$DIRECT_URL"
pg_restore --list backup.dump
pg_restore --exit-on-error --no-owner --no-acl --dbname "$DISPOSABLE_URL" backup.dump
```

Inspect an archive first, restore only into a disposable empty database, then run application integrity checks. This rehearsal proves local PostgreSQL logical dump/restore mechanics only. It does not prove production automation, scheduling, retention, encryption, remote storage, RPO/RTO, production-scale duration, or platform-specific recovery procedures.

## Parity and deferred work

This contract does not make every external service portable: VTEX acquisition still calls VTEX and admin mode still uses Clerk. Production orchestration policy, scheduling, job packaging, auth migration, durable production operations, and Upstash-coupled alert deduplication remain deferred.
