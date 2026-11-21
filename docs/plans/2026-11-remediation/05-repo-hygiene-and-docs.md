# Plan 05: Repository hygiene, documentation sync, and workspace cleanup

## Scope and sequencing

Execute this plan after Plans `01` through `04` land on `master`, so documentation updates reflect the working daily refresh, Lighthouse CI, basket index, and Vercel CPU status.

## Constraints to preserve

- `tests/price-chart.test.ts:240-258` requires `README.md` to retain the `<!-- price-chart:start -->` and `<!-- price-chart:end -->` block pointing to `analytics/assets/price-evolution.png` and `data/catalog-snapshot.json`, never `analytics/sample`.
- `tests/public-copy-claims.test.ts` checks copy rules across public documentation and UI; avoid placeholder terms such as `demo`, `mvp`, `prototype`, `wip`, or `v1` in user-facing descriptions.
- `tests/price-drops-poster.test.ts:19,212-215` pins `siteUrlFromEnv({})` to `DEFAULT_SITE_URL` in `scripts/post-price-drops.ts:16`. Update both files together if changing the default site URL.
- `tests/cloud-refresh-workflow.test.ts:75-92` asserts that `.github/workflows/daily-refresh.yml` contains the scheduled `post-price-drops.ts` step with `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHANNEL_ID`. Update that test if disabling or removing the workflow step.

## Step-by-step tasks

### 1. Update `README.md` status and catalog counts

Inspect `README.md:3-8`:

- Line 3 currently reads:
  `> - **Qué es:** comparador de precios y ofertas de 5 supermercados argentinos, con unos 24.500 productos y 47.500 ofertas.`
- Line 4 currently reads:
  `> - **Estado (11/11/2026):** sitio pausado por el hosting (Vercel) hasta el 14/11/2026, por pasarse de la CPU del plan gratuito. El refresh diario está verde desde el 27/10. No hay datos de uso.`

Update `README.md`:

1. Read the current `products.length` and `offers.length` from `data/catalog-snapshot.json` (on `2026-11-15`: `25,469` products and `50,872` offers) and update line 3 to rounded current figures (for example `unos 25.500 productos y 50.900 ofertas`).
2. Update line 4 to state the live operational state:
   - Note that Vercel lifted the pause on `14/11/2026` and production is online with the indexed read path and CDN caching in place.
   - Note the current daily refresh status after Plan `01` lands.
   - Keep the link to `docs/postmortem-2026-10-vercel-cpu-pause.md`.
3. Verify the `<!-- price-chart:start -->` ... `<!-- price-chart:end -->` block (`README.md:54-58`) remains untouched except when `scripts/chart-price-evolution.ts` regenerates it.

### 2. Sync `docs/RUNBOOK.md` with current workflows and releases

Inspect and fix stale statements in `docs/RUNBOOK.md` after Plans `01` and `03` merge:

1. `docs/RUNBOOK.md:217`: currently states `times out after 60 minutes`. Update it to match `.github/workflows/daily-refresh.yml:69,119`, which sets `timeout-minutes: 120` on the `refresh` job and `timeout-minutes: 100` on the `Refresh the catalog (gates enforced)` step.
2. `docs/RUNBOOK.md:356`: currently states `(the published analytics-data release does not exist yet)`. Remove that parenthetical and state that `analytics-data` holds the published `price-series-<date>.parquet` partitions (starting `2026-10-03`), while `chart-price-evolution.ts` still reads `data/catalog-snapshot.json` so the weekly chart includes pre-October `price_history` observations from `2026-09-20`.
3. `docs/RUNBOOK.md:323-348` ("Daily (cloud)" under "Analytics product"): update step 2/3 to match `scripts/export-analytics.sh` after Plan `03` (including `scripts/analytics-data.sh download analytics/data` before `publish_basket_index.py`, and accurate asset retention behavior since `prune` is not run at 60 days).
4. `docs/RUNBOOK.md:384-396` ("CPI seed" and "Known limitations"): update the latest INDEC CPI month and the current production status of `data/analytics/basket-index.json` once Plan `03` merges.

### 3. Triage open PR `#578` and the 10 open issues

Run read-only GitHub CLI inspections first:

```bash
gh pr view 578 --json title,state,baseRefName,headRefName,createdAt,files
gh pr diff 578
gh issue list --state open --limit 50 --json number,title,labels,createdAt,updatedAt
```

1. PR `#578` (`docs: README and ARCHITECTURE cover the five stores`, opened `2026-10-12`):
   - Compare its diff against current `master` (specifically commit `6d0eb7a` and later `README.md` / `ARCHITECTURE.md` edits).
   - If every valid change in `#578` is already on `master`, close `#578` with a comment naming the superseding commit(s). If any accurate lines remain missing from `ARCHITECTURE.md` or `README.md`, either apply them in a clean commit on `master` and close `#578`, or rebase `#578`.
2. Issue `#585` (`[cloud-refresh] daily refresh failing`):
   - Do not close `#585` manually. `scripts/cloud-refresh-report.ts resolve` closes it automatically on the first green `daily-refresh.yml` run after Plan `01` merges. Confirm it transitions to `CLOSED` after the next green run.
3. Remaining 9 open issues (`#568`, `#559`, `#547`, `#498`, `#465`, `#460`, `#459`, `#395`, `#337`):
   - Inspect each issue (`gh issue view <number> --comments`) and search `git log origin/master --grep="#<number>"` or matching paths.
   - For issues already resolved by merged PRs or retired architectures (such as pre-snapshot DB runtime issues), close with a concise comment linking the PR or commit SHA that resolved or superseded the item.
   - Leave genuinely open backlog items (for example `#568` on top-up scaling if still relevant) open with updated context.

### 4. Resolve Telegram price-drops configuration (`scripts/post-price-drops.ts`)

Every scheduled `daily-refresh.yml` run logs `post-price-drops: skipped: not configured` because `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHANNEL_ID` secrets are unset. In addition, `scripts/post-price-drops.ts:16` hardcodes `DEFAULT_SITE_URL = "https://ofertas-super.vercel.app"` instead of `https://ofertasuper.com`.

Choose one of two paths with the repository owner:

Option A (configure and enable the Telegram channel):

1. Create the bot and channel per `docs/RUNBOOK.md` ("Telegram channel setup (one time)") and add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHANNEL_ID` secrets in GitHub repository settings.
2. Update `DEFAULT_SITE_URL` in `scripts/post-price-drops.ts:16` to `"https://ofertasuper.com"` (and set `NEXT_PUBLIC_SITE_URL: https://ofertasuper.com` in the workflow step if needed), and update `tests/price-drops-poster.test.ts:19,213` to match `"https://ofertasuper.com"`.
3. Trigger or observe the next scheduled `daily-refresh.yml` run to verify `post-price-drops: posted the <date> digest`.

Option B (retire the Telegram poster if not wanted):

1. Update `DEFAULT_SITE_URL` in `scripts/post-price-drops.ts:16` and `tests/price-drops-poster.test.ts:19,213` to `"https://ofertasuper.com"` so the script default is accurate if run manually.
2. Either leave the step in `.github/workflows/daily-refresh.yml:194-203` as a silent no-op (zero test churn) or remove the workflow step and update `tests/cloud-refresh-workflow.test.ts:75-92` together with `docs/RUNBOOK.md`.

### 5. Clean up local workspaces (`/home/picala/code/ofertaSUPER` and `/home/picala/code/ofertaSUPER-refresh`)

`/home/picala/code/ofertaSUPER` is currently checked out on `docs/comparaya-planning-hygiene` (Sep 2026) with a stale `origin/master` (`e3c7346`, Oct 28) and around 90 local branches. Perform cleanup cautiously without discarding unmerged work:

1. Inspect `/home/picala/code/ofertaSUPER`:
   ```bash
   cd /home/picala/code/ofertaSUPER
   git status --short
   git worktree list
   ```
   Stop and inspect any modified or untracked files before switching branches.
2. Fetch and update `master` safely:
   ```bash
   git fetch origin --prune
   git checkout master
   git pull --ff-only origin master
   ```
3. Review merged local branches before deleting:
   ```bash
   git branch --merged master
   ```
   Delete only branches confirmed merged into `master` (`git branch -d <branch>`, never `git branch -D`).
4. List remaining unmerged branches with their last commit date and subject so the owner can decide which to keep or archive:
   ```bash
   git for-each-ref --sort=-committerdate --format='%(refname:short) %(committerdate:short) %(subject)' refs/heads/
   ```
5. Inspect `/home/picala/code/ofertaSUPER-refresh/artifacts/` (Sep/Oct 2026 local checkpoint dumps):
   ```bash
   ls -la /home/picala/code/ofertaSUPER-refresh/artifacts/
   du -sh /home/picala/code/ofertaSUPER-refresh/artifacts/
   ```
   Only after confirming `daily-refresh.yml` and the `db-state` release on GitHub have produced consecutive green runs, archive or remove obsolete Sep/Oct 2026 local checkpoint dumps. Keep `crontab -l` free of the retired local refresh cron job so only the cloud workflow writes to `db-state` and `master`.

## Verification commands

Run from `ofertaSUPER-remediation/` after documentation and script edits:

```bash
node --import tsx --conditions=react-server --test tests/price-chart.test.ts
node --import tsx --conditions=react-server --test tests/public-copy-claims.test.ts
node --import tsx --conditions=react-server --test tests/price-drops-poster.test.ts
node --import tsx --conditions=react-server --test tests/cloud-refresh-workflow.test.ts
npm run lint
```

Verify GitHub state after triage:

```bash
gh pr view 578 --json state
gh issue list --state open --json number,title
```

## Acceptance criteria

- `README.md` reflects the active unpaused site, current product/offer counts, and passes `tests/price-chart.test.ts` and `tests/public-copy-claims.test.ts`.
- `docs/RUNBOOK.md` matches `.github/workflows/daily-refresh.yml` (`120`/`100` minute timeouts), the live `analytics-data` release state, and the updated analytics pipeline.
- PR `#578` is resolved and closed/merged, `#585` is auto-closed by a green `daily-refresh.yml` run, and the remaining open issues are triaged with commit/PR links on closed items.
- Telegram digest configuration (`scripts/post-price-drops.ts` and GitHub Actions secrets or workflow step) is decided and passing `tests/price-drops-poster.test.ts` and `tests/cloud-refresh-workflow.test.ts`.
- `/home/picala/code/ofertaSUPER` sits cleanly on up-to-date `master` with merged local branches pruned, and `/home/picala/code/ofertaSUPER-refresh/artifacts/` has been reviewed.
