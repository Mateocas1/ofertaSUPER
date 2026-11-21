# Remediation plan (November 2026)

Audit baseline observed on 2026-11-18 across production, GitHub Actions, and `master`. This folder breaks the remaining issues into focused, single-PR workstreams so fixes land cleanly without mixing unrelated changes.

## Audit baseline (2026-11-18)

### Production and Vercel recovery

Vercel lifted the 30-day Hobby `fluidCpuDuration` pause (`FAIR_USE_LIMITS_EXCEEDED`, started 2026-10-15 02:45 ART) on 2026-11-14. Deployments resumed on 2026-11-14 and 2026-11-15, with the latest production deploy (`7807911230` on `29f7a5c`) at `2026-11-15T18:29:11Z`.

Live HTTP checks on 2026-11-18:

- `https://ofertasuper.com`, `https://www.ofertasuper.com`, and `https://ofertas-super.vercel.app` all return `HTTP 200` and serve the `2026-11-15` snapshot (`25,469` products, `50,872` offers, `51,119,092` bytes).
- `https://ofertasuper.vercel.app` (without the hyphen) returns `404 DEPLOYMENT_NOT_FOUND`.
- Postmortem verification (`#581`, `#582`): `x-vercel-cache` reaches `HIT` on `/ofertas` (`0.76s MISS` down to `0.20s HIT`), `/producto/00000040084107` (`0.39s MISS` down to `0.12s HIT`), `/api/categories` (`4.60s-10.10s MISS` down to `0.13s HIT`), `/inflacion`, and `/canasta`.
- `/robots.txt` blocks bulk AI crawlers, `/buscar`, `/api/`, `/admin/`, and faceted query parameters.
- `/_next/image` returns `HTTP 400 INVALID_IMAGE_OPTIMIZE_REQUEST` (optimizer disabled; the postmortem action item wrote `404`).
- `/api/health` returns `404` because health probes live under `/api/health/live`, `/api/health/catalog`, and `/api/health/ready`.

Remaining CPU risk: `data/catalog-snapshot.json` grew from `39.5 MB` (2026-10-27) to `51.1 MB` (2026-11-15), and a cold `MISS` on `/api/categories` took `4.6s-10.1s`.

### Daily catalog refresh (`daily-refresh.yml`)

The last green run was `43740208068` on 2026-11-15, followed by duplicate-guard skip `43755174119`. Since 2026-11-16, the workflow has failed 4 consecutive times (`43951113692`, `43979719647`, `44156435000`, `44191861511`), tracked in issue `#585`. Production data is stuck on 2026-11-15.

Two secondary observations from the logs:

- The `23 10 * * *` and `41 14 * * *` crons are firing 8 to 9 hours late on GitHub runners.
- `scripts/post-price-drops.ts` skips (`skipped: not configured`) because `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHANNEL_ID` are unset.

### Other `master` issues

- `Lighthouse CI` has failed on `master` since 2026-11-11 (`43107344320`, `43117075669`, `43117429616`, `43117559293`) because `tests/price-chart.test.ts:240` expects `12 series` while the snapshot only contains `9 series`. Bot commits pushed with `GITHUB_TOKEN` between 2026-11-12 and 2026-11-15 did not trigger CI.
- `scripts/export-analytics.sh` exports only 1 day (`--mode daily`) and never downloads the 40 historical Parquet partitions from the `analytics-data` release (`2026-10-03` to `2026-11-15`), overwriting `data/analytics/basket-index.json` with `days: 1`, `seriesStart: "2026-11-15"`, and `basketProductsCovered: 0`. `analytics/seeds/indec_cpi.csv` also stops at `2026-08-01`.
- `README.md` on `master` still states the site is paused until `14/11/2026`, and `docs/RUNBOOK.md` still mentions the old `60 minutes` timeout and outdated `analytics-data` release notes.
- PR `#578` and 9 older issues remain open, and the local workspace in `/home/picala/code/ofertaSUPER` is checked out on the old branch `docs/comparaya-planning-hygiene`.

## Workstreams and execution order

| Order | Workstream | Scope | Document |
|---|---|---|---|
| 1 | Daily refresh `pg_restore` failure (`#585`) | Unblock `.github/workflows/daily-refresh.yml` after the `ubuntu-26.04` runner rotation | [01-daily-refresh-pg-restore.md](01-daily-refresh-pg-restore.md) |
| 2 | `Lighthouse CI` and README price chart | Fix `tests/price-chart.test.ts:240` (`9 series` vs `12 series`) and verify the full Lighthouse run | [02-lighthouse-ci-and-price-chart.md](02-lighthouse-ci-and-price-chart.md) |
| 3 | Analytics and inflation pipeline | Download historical `analytics-data` partitions in `scripts/export-analytics.sh`, refresh `indec_cpi.csv` | [03-analytics-basket-index.md](03-analytics-basket-index.md) |
| 4 | Vercel CPU profiling and cold start | Profile `/api/categories` (`4.6s-10.1s` cold `MISS`) and `51.1 MB` snapshot growth using Usage tab data | [04-vercel-cpu-and-cold-start.md](04-vercel-cpu-and-cold-start.md) |
| 5 | Repo hygiene and stale docs | Update `README.md` status and `docs/RUNBOOK.md`, triage PR `#578` and old issues, clean local branch state | [05-repo-hygiene-and-docs.md](05-repo-hygiene-and-docs.md) |

Recommended sequence:

1. Run workstream `01` first to restore daily catalog refreshes and unfreeze the 2026-11-15 snapshot.
2. Run workstream `02` next so `master` CI turns green and Lighthouse audits run again (catching any regressions from PR `#584`).
3. Move the `README.md` status update from workstream `05` up right after `01` or `02` if visitors are reading the paused notice on GitHub.
4. Run `03` to restore multi-day coverage in `data/analytics/basket-index.json`, `04` once Vercel Usage tab data accumulates after the pause, and `05` for remaining backlog cleanup.

## Shared guardrails

- Open one PR per workstream. Do not bundle workflow fixes, test fixes, analytics changes, or documentation cleanups into a single PR.
- Before pushing any PR, run all four local gates and verify they pass:
  - `npm test`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run audit:complexity`
- Never fabricate fallback prices, placeholder chart series, or sample production payloads when real data is missing.
