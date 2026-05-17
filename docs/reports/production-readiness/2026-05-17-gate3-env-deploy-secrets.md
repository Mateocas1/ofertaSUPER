# Gate 3 - Env / deploy / secrets readiness - 2026-05-17

Status: `GREEN`

This gate audits the repository contract for environment variables, GitHub workflows, ignored env files, and tracked-secret risk. It does not claim external dashboard secrets are configured, because GitHub/Vercel/Supabase/Clerk/Upstash dashboards were not mutated or independently verified.

## Commands run

| Check | Command | Result |
|---|---|---|
| Tracked env files | `git ls-files .env .env.local .env.example` | Only `.env.example` is tracked |
| Ignore rules | `git check-ignore -v .env .env.local` | Both ignored by `.gitignore:41:.env*` |
| Workflows present | `Get-ChildItem .github\workflows` | `cleanup.yml`, `ingest.yml`, `lighthouse-ci.yml`, `populate-db.yml`, `update-prices.yml` |
| Env reference scan | Python scan over tracked text files | Process/GitHub env references mapped without printing values |
| Secret literal scan | Python scan over tracked text files | No real secret literals found; one safe placeholder DB URL in a test fixture |

## `.env.example` contract

| Area | Keys documented | Notes |
|---|---|---|
| Database | `DATABASE_URL`, `DIRECT_URL` | Runtime pooler and direct/admin connection are separated. Gate 1 direct Supabase remains `BLOCKED_APPROVED`. |
| VTEX | `VTEX_SHA256_HASH`, `VTEX_REQUEST_MIN_DELAY_MS`, `VTEX_REQUEST_MAX_DELAY_MS`, `VTEX_USER_AGENTS` | Server-side only; not `NEXT_PUBLIC_*`. |
| Public metadata | `NEXT_PUBLIC_SITE_URL` | Needed for canonical/metadata correctness in production. |
| Clerk/admin | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `ADMIN_EMAILS` | Production keys and admin allowlist/role must be verified in the real dashboard before launch claims. |
| Upstash | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Runtime cache/rate-limit fails open if unavailable, but production should configure them. |
| Ingestion/ops | `SCRAPER_ALERT_WEBHOOK_URL`, `SCRAPER_JOB_NAME`, `SCRAPER_JOB_STATUS`, `INGESTION_V2`, `DB_CONNECTION_LIMIT`, `DB_POOL_TIMEOUT`, `RECONCILE_TX_MAX_WAIT_MS`, `RECONCILE_TX_TIMEOUT_MS` | `INGESTION_V2=active` still requires explicit user approval before real writes. |
| PWA troubleshooting | `DISABLE_PWA` | Documented as local troubleshooting only; normal build passed with PWA enabled in Gate 2. |

## GitHub Actions secret contract

| Workflow | Required/used secrets | Risk note |
|---|---|---|
| `cleanup.yml` | `DATABASE_URL`, `DIRECT_URL` | Uses direct DB for `VACUUM ANALYZE`; blocked until direct Supabase is fixed. |
| `ingest.yml` | `DATABASE_URL`, `DIRECT_URL`, `VTEX_SHA256_HASH`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `SCRAPER_ALERT_WEBHOOK_URL` | Runs `INGESTION_V2=shadow`; still writes staging/run records when not dry-run. Needs real DB approval/ops review. |
| `lighthouse-ci.yml` | `DATABASE_URL`, `DIRECT_URL`, `VTEX_SHA256_HASH`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Builds and starts app; external secrets were not verified in this local audit. |
| `populate-db.yml` | `DATABASE_URL`, `DIRECT_URL`, `VTEX_SHA256_HASH` | Manual workflow can populate DB; must not run without explicit approval. |
| `update-prices.yml` | `DATABASE_URL`, `DIRECT_URL`, `VTEX_SHA256_HASH`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `SCRAPER_ALERT_WEBHOOK_URL` | Scheduled price writes; must stay disabled/untrusted until DB/direct URL and ops policy are closed. |

## Local verification vs external dashboard gates

| Item | Verified locally now | Still external/pending |
|---|---|---|
| Env file tracking | `.env` and `.env.local` ignored; only `.env.example` tracked | None |
| Secret values | No tracked real secret literals found by pattern scan | Actual GitHub/Vercel/Clerk/Upstash/Supabase secret presence not verified |
| Supabase | Runtime pooler was previously reachable; schema validates | Direct `DIRECT_URL` migration host remains unresolved from Gate 1 |
| Clerk | Env keys documented; admin allowlist key documented | Production Clerk keys/session/admin role not verified |
| GitHub Actions | Workflow secret names and write risks documented | Repository secrets and scheduled-workflow enablement not verified |
| Vercel/deploy | Env contract documented | Project/dashboard env, domain, deploy protection, and production build runtime not verified |

## Secret scan result

The safe tracked-file scan found no real secret literals. It reported one PostgreSQL URL pattern in `tests/catalog-availability.test.ts:8`, which is a hard-coded placeholder fixture: `postgresql://user:pass@example.supabase.com:6543/postgres`.

## Claim boundary

Gate 3 closes the repository-side env/deploy/secrets audit. It does not close production deploy readiness, because external dashboards and real secret presence were not verified or changed in this run.
