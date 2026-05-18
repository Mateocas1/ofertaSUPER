# Gate 2 - GitHub Actions hygiene audit - 2026-05-18

Status: `GREEN`

GitHub Actions is not blocking the Vercel frontend deploy, but it is currently a public/reputational problem for the repository: scheduled workflows are still running and failing on `master`.

## Current evidence

Latest workflow runs from GitHub API show repeated scheduled failures:

- `Ingest Shadow #4` failed on `2026-05-18T02:21:34Z`: https://github.com/Mateocas1/ofertaSUPER/actions/runs/26010105501
- `Update Prices #4` failed on `2026-05-18T00:47:33Z`: https://github.com/Mateocas1/ofertaSUPER/actions/runs/26007662668
- Earlier `Ingest Shadow` and `Update Prices` scheduled runs also failed repeatedly on `2026-05-17`.

Evidence files:

- `docs/reports/production-readiness/2026-05-18-gate2-github-actions-runs.json`
- `docs/reports/production-readiness/2026-05-18-gate2-latest-ingest-jobs.json`
- `docs/reports/production-readiness/2026-05-18-gate2-latest-ingest-steps.json`

## Root cause from latest job log

The latest `Ingest Shadow` job reached dependency install and Prisma generate, then failed at `Run shadow ingestion`.

Relevant log evidence from job `76448954103`:

```text
env:
  DATABASE_URL:
  DIRECT_URL:
  VTEX_SHA256_HASH:
  UPSTASH_REDIS_REST_URL:
  UPSTASH_REDIS_REST_TOKEN:
  SCRAPER_ALERT_WEBHOOK_URL:
  INGESTION_V2: shadow
```

Then Prisma failed with:

```text
error: Error validating datasource `db`: You must provide a nonempty URL.
The environment variable `DATABASE_URL` resolved to an empty string.
```

So the failure is infrastructure/configuration: GitHub repository Actions secrets are not configured, not a runtime regression from the RLS remediation.

## Workflows with schedules

Scheduled workflows currently present:

- `.github/workflows/ingest.yml` - `Ingest Shadow`, every 6 hours.
- `.github/workflows/update-prices.yml` - `Update Prices`, every 6 hours.
- `.github/workflows/cleanup.yml` - monthly cleanup.

Manual-only or non-scheduled workflows:

- `.github/workflows/populate-db.yml` - manual only.
- `.github/workflows/lighthouse-ci.yml` - push to `main`, PR, manual. Current active branch is `master`, so this is not the visible scheduled failure source.

## Decision applied

The user explicitly approved the recommended portfolio-safe path (`autorizo`):
pause scheduled runs and keep manual `workflow_dispatch`.

Changed workflow triggers:

- `.github/workflows/ingest.yml` - removed `schedule`, kept `workflow_dispatch`.
- `.github/workflows/update-prices.yml` - removed `schedule`, kept `workflow_dispatch`.
- `.github/workflows/cleanup.yml` - removed `schedule`, kept `workflow_dispatch`.

This does not change ingestion, cleanup, Prisma, or scraper logic. It only stops
future automatic runs from failing publicly while GitHub Actions secrets remain
unconfigured.

## Post-change verification

Local verification:

- YAML parse via `js-yaml`: all three workflow files parse successfully.
- Trigger inspection: `schedule=false`, `workflow_dispatch=true` for all three
  changed workflow files.
- Grep inspection: no `schedule:` trigger remains under `.github/workflows/*.yml`.
- `npm test`: 21/21 passing.
- `npm run typecheck`: passing.
- `npm run lint`: passing.

Evidence files:

- `docs/reports/production-readiness/2026-05-18-gate2-workflow-trigger-verification.json`
- `docs/reports/production-readiness/2026-05-18-gate2-npm-test.log`
- `docs/reports/production-readiness/2026-05-18-gate2-typecheck.log`
- `docs/reports/production-readiness/2026-05-18-gate2-lint.log`

The public GitHub Actions page may still show historical failed runs. The gate
only claims that the recurring scheduled trigger source is removed after this
commit is pushed.

## Original decision point

The goal requires explicit approval before changing workflow strategy. There are two clean options:

### Recommended for portfolio now: pause schedules

Remove or comment the `schedule` triggers from ingestion/update/cleanup and keep `workflow_dispatch`. This stops recurring red public runs until secrets and operational cadence are intentionally configured.

Tradeoff: automation will not run on a timer. Manual runs remain possible.

### Alternative: configure GitHub Actions secrets

Add repository secrets:

- `DATABASE_URL`
- `DIRECT_URL`
- `VTEX_SHA256_HASH`
- optional alert/cache secrets: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `SCRAPER_ALERT_WEBHOOK_URL`

Then manually rerun a bounded workflow.

Tradeoff: keeps automation alive, but requires dashboard work and may perform real ingestion/cleanup operations depending workflow.

## Gate decision result

Current status: `GREEN`.

The chosen path was option 1: pause scheduled workflows in repo code.
