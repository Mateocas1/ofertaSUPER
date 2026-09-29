# v1 runtime architecture

Production has no database. It serves `data/catalog-snapshot.json`.

## Where data lives

| Place | Data source | Database |
| --- | --- | --- |
| Production (Vercel) | `data/catalog-snapshot.json` bundled in the deploy | none (`DATABASE_URL` / `DIRECT_URL` removed) |
| Daily cron (owner's PC, 10:00 UTC) | local Docker Postgres | `ofertasuper-cmvp-local-bootstrap-postgres-1` |

The cron runs `scripts/cron-refresh.sh`: it refreshes the local Postgres, exports the snapshot, and opens an auto-merged PR. Merging redeploys production. See the [runbook](v1-plan.md#runbook) for the cron install.

## Backups

- Before the first write of the day, the cron writes `pg_dump -Fc` to `~/backups/ofertasuper-YYYY-MM-DD.dump` (one per day, reused if present).
- The local dump is the only backup by default. Restore with `pg_restore` into the Docker Postgres.

## Retired

The old Supabase database no longer exists. These manual-only GitHub workflows could only run against it and were deleted: `ingest`, `update-prices`, `populate-db`, `cleanup`, `database-backup`, `database-recovery`.

Kept: `production-catalog.yml`, `lighthouse-ci.yml`.

Historical docs (`docs/handoff.md`, `PLANIFICACION.md`, `goal.md`, `docs/supabase-connection-runbook.md`) still describe the Supabase era and are not maintained.
`scripts/postgres-backup-r2.mjs`, `scripts/postgres-recovery-r2.mjs` and `docs/database-backup-recovery-runbook.md` remain as tooling for a Postgres reachable through a connection string, but no workflow runs them anymore.
