# Runbook — ofertasSUPER

Operational runbook for the daily catalog refresh, the local Postgres, and the
encrypted off-site backups. The retired long-form plans and governance docs live
in the git tag `archive/full-governance` (`664674d`); this file keeps only the
knowledge needed to operate the service.

## Daily catalog refresh

The site serves the committed snapshot `data/catalog-snapshot.json`. The refresh
reads every source, stages offers, reconciles them with a transactional advisory
lock, applies the freshness gate, and regenerates the snapshot.

1. **Previous backup** (guardrail: never write before the dump exists):

   ```bash
   mkdir -p ~/backups && docker exec ofertasuper-cmvp-local-bootstrap-postgres-1 \
     pg_dump -U ofertasuper_owner -d ofertasuper -Fc \
     > ~/backups/ofertasuper-$(date +%F).dump && ls -la ~/backups
   ```

   The file must weigh more than 0 bytes.

2. **Refresh + snapshot** (one command; the local base runs in Docker and the
   command runs from the worktree with `DATABASE_URL` pointing at it):

   ```bash
   npm run refresh:catalog
   ```

   - Refreshes the stores in `src/lib/refresh-sources.ts` (Carrefour, Disco,
     Jumbo and, since 2026-10-04, Vea and Coto). Coto is not VTEX: its site
     (www.coto.com.ar) searches through Constructor.io with the public client
     key it sends from every browser, and `src/lib/coto/client.ts` reads the
     same API: the category tree (its departments and their subgroups, whose
     `catv<8 digits>` ids become the plan's numeric category paths), a
     category browse or text search in pages of 200 filtered to branch 200
     (the branch the site prices for; `COTO_STORE_ID` overrides it), and a
     search by EAN for the top-up. The shelf price ("Precio Contado") is the
     branch's `listPrice`, `formatPrice` is the price per unit
     (`product_format`), and `discounts[].discountText` ("25%Dto") becomes a
     percent-off promotion. Weighable products and invalid EANs are skipped.
     Its request delay is `COTO_REQUEST_MIN_DELAY_MS`/`COTO_REQUEST_MAX_DELAY_MS`
     (400–900 ms). Adding a VTEX store is that list, its
     departments in `config/catalog-discovery.json` and an active row in
     `supermarkets` (Vea's comes from the
     `20261004000000_vea_refresh_source` migration). Only a batch that
     searches through the persisted query (a text search of at most 50
     results) resolves the store's VTEX hash; the paged searches need none, so
     a store whose hash cannot be resolved does not stop the run.
   - Builds the plan at run time: reads `config/catalog-discovery.json` (the
     allowlisted grocery departments per store, `maxBatchesPerRun` and
     `resultsPerBatch`) and reads each store's public VTEX category tree, then
     turns the departments' child categories into search batches. The sampled
     children rotate deterministically by UTC date, so every child of every
     allowlisted department is searched within the logged rotation window
     (`[refresh] plan rotation: utcDay=<n> windowDays=<n>`); a smaller
     department roster keeps the quota from starving any one department. The
     log says `[refresh] plan: discovered` with the batch/category counts. When
     anything in that path fails (config, tree read, no allowlisted category),
     it logs `[refresh] plan: fallback`, names the discovery error and walks the
     frozen plan `artifacts/cmvp/catalog/expansion-20260920-discovery-25/acquisition-plan-cycle2.json`
     instead, so one bad category read never blocks the day. The plan takes
     up to `maxBatchesPerRun` batches (90; ceiling 150) split across the
     stores. The searches have a time budget (`REFRESH_SEARCH_BUDGET_MINUTES`,
     25 by default, at most 45): once it is spent, the remaining batches are
     skipped, not failed (`[refresh] search budget of <n>m spent: skipped the
     last <n> batches`, and `skipped=<n>` in the summary), so the top-up and
     the snapshot always fit in the job's 60 minutes. The rotation reaches the
     skipped categories on another day.
   - Walks the batches with a per-day `batchId` that also carries the plan mode
     (`v1-refresh-<YYYYMMDD>-d-<ordinal>` for a discovered plan,
     `v1-refresh-<YYYYMMDD>-f-<ordinal>` for the fallback); a completed batch
     replays from its checkpoint and does not query again. The mode keeps a
     same-day discovered/fallback flip from colliding with the other plan's
     checkpoints. A discovered batch searches up to 200 results
     (`resultsPerBatch`) and carries no expected GTINs; a frozen-plan batch
     keeps its 25-result contract. Each discovered batch carries the VTEX
     path of its category (`/<department>/<category>/`, from the tree ids)
     and searches the category itself first (`fq=C:<path>`), which is exact
     and does not depend on how the category is named. Up to 50 results a
     text search uses the
     persisted-query search (the storefront autocomplete, one page); above 50
     it pages through the public REST catalog search
     (`/api/catalog_system/pub/products/search`, 50 per `_from/_to` page) until
     the limit or a short page. That payload already carries the Carrefour
     promotion teasers, so those products need no extra promo read. A later
     page that fails keeps the pages already read and logs `[refresh]
     <batchId>: <n> search page(s) failed`. A category name is a label, not a query
     ("Bañaderas, Cambiadores y Pelelas" as one phrase can match nothing), so a
     discovered batch whose category search returns no product retries with
     the category name as text and then with up to 3 of the name's
     meaningful words, one at a time, and keeps the first that returns
     products (`[refresh] <batchId>: "<term>" returned nothing;
     retried [...] -> "<word>" fetched <n>`).
   - Captures simple Carrefour promos (PromotionTeasers by EAN, public REST
     read) during staging; a failed promo read leaves the promo null, counts in
     the summary, and does not abort the batch.
   - Regenerates `data/catalog-snapshot.json` and prints the summary: batches
     ok/failed, promos captured/failed reads, `[refresh] rejected: <n> products
     [...]` with the quality flags of every dropped product, and the % of offers
     <24 h per supermarket. A batch counts as failed only when its rejected
     products exceed `max(1, 10% of the fetched)` or it admits nothing; an
     isolated rejected product is tolerated and does not block the publish.
     A discovered category whose search (fallback words included) returns no
     product at all (`acquisition_no_results`) is not a failure: the summary
     counts it as `empty=<n>` and lists it under `[refresh] empty categories`.
     Up to `max(2, 10% of the planned batches)` empty categories are
     tolerated; above that the gate fails with `emptyBatches=<n>><limit>`,
     because that many empty searches mean the search itself broke. A
     frozen-plan term that returns nothing still fails its batch.
     Exits with an error if a batch failed or the worst supermarket falls below
     90%.
   - Only when the run is publishable (no failed batch, freshness ≥90%), prunes
     `staging_product`: deletes the rows older than `STAGING_RETENTION_DAYS`
     (default 14; `STAGING_RETENTION_BATCH_SIZE` default 2000) in id-ordered
     batches, and prints `[refresh] staging retention: deleted=...`. It never
     touches `price_history`, `products` or `supermarket_products`; a retention
     failure is logged and does not undo the refresh. **Price history is never
     deleted** (see "History retention" below).
   - It reads the VTEX persisted-query hash from `ingestion_run.vtex_hash`
     (the acquisition stores it); it is never asked for or printed.

3. **Publish:** commit the new snapshot in a `chore(catalog): refresh <date>` PR
   and merge with green CI.

4. **Repeat the next day.** The price history must show at least two points.

**Local execution note.** The bootstrap database does not publish host ports.
Two valid ways to run step 2: from a container on the bootstrap network with the
repo mounted, or from the host when `DATABASE_URL` can reach the base (for
example by publishing the port).

### Top-up by EAN

At the end of the refresh, every offer the run did not observe is re-read by EAN
with the public REST endpoint of its supermarket (the same one used for promo
capture). It is stored with the same observation instant and the same staging
format; in Carrefour the promo too. Product absent or out of stock →
`available=false` and price null (a price is never invented). Failed reads count
in the summary (`top-up reads ok/failed`) without aborting the run. With the
top-up, the first day reached 100% <24 h in the three supermarkets (327 reads,
0 failures).

The supermarkets are read at the same time (each is its own host and
keeps its own sequential pace and delay, so no store sees more traffic than
before); the staging and reconcile writes still run one supermarket after
another, because Disco and Jumbo share EANs. Each source logs
`[refresh] top-up <slug>: reads ok=<n> failed=<n> in <s>s`. The top-up grows
with the catalog (2026-10-04: 3925 sequential reads took ~26 min of the 60-min
job), so it is the first limit on catalog growth (#568).

The summary also prints `[refresh] timings: searches=<m> topup=<m>
snapshot=<m>` and `[refresh] catalog: products=<n> (+<new>, -<gone>);
offers=<n> (+<new>, -<gone>)` against the previous snapshot, to measure every
catalog-size change on a real run.

### Freshness coverage (known limitation)

A batch searches by term and takes at most its configured results
(25 for a frozen-plan batch, up to 200 for a discovered one). With each
supermarket's ranking rotation, some offers can fall outside the day's
coverage. The first refresh (2026-09-28) landed at 79.6% / 85.5% / 84.1% per
supermarket, below the 90% target: it was reported and the options were widening
the coverage by EAN or accepting partial coverage in v1. Runtime category
discovery replaces the frozen 12 broad terms with the allowlisted departments'
child categories, which widens the day's coverage; the EAN top-up still re-reads
every offer the run did not observe.

## History retention

Price history is the product and is never deleted. `cleanup-history.ts` (90-day
pruning) was removed and `cleanup:staging` no longer exists; no script or app
module issues a DELETE against `price_history`, and `tests/write-safety-guards.test.ts`
fails if one appears. If the history ever needs to shrink, it is archived (for
example to Parquet), never dropped.

## Cloud refresh (GitHub Actions)

`.github/workflows/daily-refresh.yml` runs the same refresh on GitHub, so the
catalog updates without the owner's PC. Budget is USD 0 and the repository is
public: the state travels as a Postgres custom-format dump attached to the
GitHub Release `db-state`, managed only with the workflow's built-in
`GITHUB_TOKEN`. No new accounts or repository secrets are needed.

The workflow is triggered by two off-peak crons (`23 10 * * *` and
`41 14 * * *`, i.e. 10:23 and 14:41 UTC) plus `workflow_dispatch` with a
`dry_run` input that restores and refreshes but never uploads or commits.
GitHub delays or drops top-of-hour crons under load: the original
`0 10 * * *` never fired a single scheduled run, so the first window is the day
and the second is the backup. A `guard` job runs before the refresh job; on a
scheduled run it greps `origin/master` with `git log --fixed-strings` for
today's `chore(catalog): refresh <UTC date> [cloud]` commit and skips the whole
refresh when it is already there, so the backup window can never refresh twice
in the same UTC day. A manual `workflow_dispatch` always refreshes (its
schedule-only check leaves the guard outputs empty and the refresh job runs).

Each run:

1. Starts an ephemeral `postgres:16-bookworm` service container.
2. `scripts/db-state.sh download` fetches the newest `ofertasuper-<date>.dump`
   asset of the `db-state` release and `scripts/db-state.sh restore` loads it
   with `pg_restore --no-owner --no-acl`. A missing release or asset fails the
   run with `db-state: NO_STATE_ASSET`; the first asset is seeded from the local
   database (below).
3. `npx prisma migrate deploy`, then `npm run refresh:catalog` with exactly the
   same gates as the local run (failed batches, freshness <90%, a source with
   >20% failed reads, too many empty discovered categories,
   `VTEX_HASH_UNAVAILABLE`). A batch is only failed when its
   rejected products exceed `max(1, 10% of the fetched)` or it admits nothing;
   an isolated rejected product is tolerated, recorded in the batch artifact and
   printed as `[refresh] rejected: <n> products [...]` with its quality flags. A
   tripped gate publishes nothing.
4. On success: `scripts/db-state.sh dump` writes the new state, `upload` stores
   it as `ofertasuper-<UTC date>.dump`, and `prune` keeps the newest 14 assets.
   Only then the workflow commits `data/catalog-snapshot.json` to `master` as
   `github-actions[bot]` (`chore(catalog): refresh <date> [cloud]`). The dump is
   uploaded before the push, so database state and snapshot never diverge.
5. On failure: the job fails (GitHub emails the owner for scheduled runs) and a
   step opens, or comments on, the single open issue labelled
   `refresh-failure`, with the run URL and the greppable reason (`vtex-hash-unavailable`,
   `refresh-rejections-exceeded` when a batch crossed the rejection rule,
   `refresh-no-admitted-products` when a batch admitted nothing, and so on); the
   next successful run closes it.

The workflow serializes runs with `concurrency: daily-refresh`, requests only
`contents: write` and `issues: write`, times out after 60 minutes, pins every
action by commit SHA and takes Node from `.nvmrc`. It never prints the database
URL or any credential.

The price drops travel with the snapshot: right after the refresh,
`npx tsx scripts/export-price-drops.ts` reads the snapshot it just wrote,
regenerates `data/price-drops.json` (top 100 published, schema v2, suspects
recorded but withheld) and the commit step adds both files, so the published
drops can never disagree with the served catalog. The step is
`continue-on-error`: a drop export failure leaves the previous payload in place
(the page and the feed always state the day they cover) and never undoes a
healthy snapshot. After the commit, a second best-effort step posts the day's
digest to the Telegram channel (see "Price drop alerts" below); it runs only on
the scheduled run, so a manual re-run never double-posts.

**Only one writer may be active.** Once the cloud job is green, the owner
removes the local crontab line (`crontab -e`) so the PC and the cloud never race
for the same snapshot; `scripts/cron-refresh.sh` stays available for manual
runs. The `db-state` release holds the one writer's state and must never be
written from two places at once.

### Seeding the first `db-state` asset

One-time, from the local machine with the local Postgres running:

```bash
mkdir -p ~/backups && docker exec ofertasuper-cmvp-local-bootstrap-postgres-1 \
  pg_dump -U ofertasuper_owner -d ofertasuper -Fc --no-owner --no-acl \
  > ~/backups/ofertasuper-$(date +%F).dump
gh release create db-state --title "Catalog database state" \
  --notes "Rolling Postgres state for the cloud refresh."
gh release upload db-state ~/backups/ofertasuper-$(date +%F).dump
```

If the release already exists, `scripts/db-state.sh upload <dump>` does the same
with `--clobber` and creates the release when it is missing.

### Inspecting the cloud state

```bash
GH_TOKEN=$(gh auth token) scripts/db-state.sh download /tmp/db-state
pg_restore --list /tmp/db-state/ofertasuper-*.dump | head
```

The dump contains only the public catalog data: no roles, no ACLs, no secrets.

## Price drop alerts (bajas)

The catalog tells its own story: `/bajas` lists the price drops of the day,
`/bajas/feed.xml` is the same list as an Atom feed, and the Telegram channel
posts a short digest. All three render `data/price-drops.json`, which the cloud
job regenerates from the committed snapshot (see "Cloud refresh" above); no
surface recomputes a movement on its own and no per-user storage is involved, so
there are no accounts and nothing to subscribe to server-side.

### What counts as a drop

The export compares each offer's current price against its **last different
observation inside the window** (14 days by default) and publishes the drop only
when it clears **both** thresholds: at least 10% and at least ARS 100. Offers
whose observation is older than 24 h (stale) never produce a drop, and a drop a
captured percentage promotion fully explains is treated as a promo artifact, not
as a price cut.

A suspicious movement is never published:

- **Unit price evidence wins.** When the snapshot carries a unit price for both
the current offer and the reference observation (`unitPrice`, the price per the
offer's reference unit), the fall must survive the comparison per unit: a smaller
pack at a lower absolute price is not a price cut, and a fall per unit proves
even a very large drop.
- **Without that evidence**, any fall above `--max-percent` (60% by default) is
withheld: a jump that big is better explained by a pack-size change or a loading
error than by a real cut.

Withheld movements are recorded in the payload's `suspect` array with their
reason (`unit_price_did_not_fall`, `drop_above_max_percent`) for the audit trail,
and they are never rendered on `/bajas`, never emitted in the feed and never
posted to Telegram. `totalDrops` counts the published ones and `suspectDrops` the
withheld ones, so the file always says how much it left out.

Rules are deterministic and configurable:

```bash
npx tsx scripts/export-price-drops.ts --min-percent=15 --min-amount=250 --window-days=7 --max-percent=50
# or through the environment: PRICE_DROP_MIN_PERCENT, PRICE_DROP_MIN_AMOUNT,
# PRICE_DROP_WINDOW_DAYS, PRICE_DROP_MAX_AGE_HOURS, PRICE_DROP_MAX_PERCENT,
# PRICE_DROP_LIMIT
```

The file keeps the top 100 by percentage, records the rules it was produced with
and states its own date, so the page can always say which refresh it covers.

**Known limitation.** The snapshot does not export a unit price yet
(`supermarket_products.reference_price` / the VTEX `measurementUnit` exist in the
database but not in `data/catalog-snapshot.json`), so today the unit-price branch
is inert and the 60% rule governs. Wiring it is one change in
`scripts/export-catalog-snapshot.ts`: select those two columns per offer, add
them to the offer and to each history point as `unitPrice`, and the branch starts
working without touching the drop rules.

### Telegram channel setup (one time)

1. In Telegram, talk to **@BotFather**: `/newbot`, give it a name and a username,
   and copy the **bot token** (`123456:ABC-...`).
2. Create the public channel (or reuse one) and add the bot as an **admin with
   "Post messages"** permission. Without that permission Telegram answers
   `403`/`400` and the run logs `telegram responded <status>`.
3. Get the **channel id**: post any message in the channel, then open
   `https://api.telegram.org/bot<token>/getUpdates` and read `result[].channel_post.chat.id`
   (channels use the `-100...` form). Forwarding a channel message to
   `@userinfobot` also shows the id.
4. In the GitHub repository, add the secrets **`TELEGRAM_BOT_TOKEN`** and
   **`TELEGRAM_CHANNEL_ID`** (Settings → Secrets and variables → Actions). No
   other account or paid tier is required.

Until both secrets exist the workflow step runs
`npx tsx scripts/post-price-drops.ts`, which logs
`post-price-drops: skipped: not configured` and exits 0 (`continue-on-error`
on top). The step also runs **only on the scheduled run**
(`github.event_name == 'schedule'`), so dispatching the workflow by hand never
posts the digest a second time. The channel is never posted twice for the same
day either: the digest is built from the committed payload, and a day with no
published drops is skipped instead of posting a noise message. Test the poster
by hand with the token in the environment (never commit it):

```bash
TELEGRAM_BOT_TOKEN=... TELEGRAM_CHANNEL_ID=-100... npx tsx scripts/post-price-drops.ts
```

## Analytics product (dense series and basket index)

The public `/inflacion` page renders `data/analytics/basket-index.json`, a small
precomputed JSON committed like the snapshot, so there is no database on the
read path. It is produced by the uv + DuckDB + dbt project in `analytics/`
(see `analytics/README.md` for the models and the fixed basket).

### Daily (cloud)

The daily-refresh workflow runs one best-effort step after "Dump, upload and
prune the state": `scripts/export-analytics.sh` with `continue-on-error: true`.
It never blocks the catalog refresh, and each stage logs what it did:

1. `scripts/export-price-series.ts --mode daily --out analytics/data` writes
today's dense partition (`date=YYYY-MM-DD/part.parquet`): one row per
`(date, gtin14, store)` with price, list price, promo flag, availability and a
`reason`. The value is carried forward only while the last observation is within
24 h of the export instant; older rows are null with `reason = stale`, and a
pair that was never observed has no row. Availability and promotion are only
known for the current offer state, so older rows carry nulls for them.
2. `scripts/analytics-data.sh upload-dir analytics/data` uploads one
`price-series-<date>.parquet` asset per day to the GitHub Release
`analytics-data` (same `GITHUB_TOKEN` pattern as `db-state`; keeps the newest
60 assets).
3. `cd analytics && uv run --locked --no-dev python scripts/publish_basket_index.py \
   --glob 'data/*/part.parquet' --source release` runs `dbt build` and rewrites
`data/analytics/basket-index.json`; the script then commits and pushes it as
`chore(analytics): refresh basket index <date> [cloud]`. The payload is only
`status = "ready"` with at least two basket months and one overlapping INDEC
month; otherwise it is `status = "insufficient"` with no index values, so the
page can never show a one-point or sample "index". The file is left untouched
when the only difference is `generatedAt`. Regenerate the committed production
placeholder without dbt with:

```bash
cd analytics && uv run python scripts/publish_basket_index.py --placeholder --source release
```

A failed export skips
the rest; a failed dbt build leaves the previous JSON in place. `uv` is
installed with `pip` when the runner does not have it.

### README price chart (weekly)

The README chart (`analytics/assets/price-evolution.png`) is a real artifact:
`npx tsx scripts/chart-price-evolution.ts` reads the committed snapshot's dated
observations for the 12 fixed basket products, averages them per product and
day, and draws them with `sharp`. The source is `data/catalog-snapshot.json`
(the published `analytics-data` release does not exist yet), and the guard
refuses `analytics/sample/*.parquet`, so a synthetic series can never be
published as the real chart.

The chart subtitle and the README caption (patched between the
`price-chart:start` / `price-chart:end` markers) name the real range and the
source, and say so plainly while fewer than seven days exist. The snapshot's
offer history still carries the 2026-09-20 bootstrap observations, while the
dense Parquet export (and therefore `basket-index.json`) starts on 2026-09-28,
when the daily export began; the chart labels whatever range its real source
actually has.

The daily-refresh workflow runs it as a best-effort step (`continue-on-error`,
`date -u +%u` = 1) after the snapshot commit, and pushes one
`chore(analytics): refresh the price chart <date> [cloud]` commit only when the
PNG or the README block changed. Locally it is just the command above.
`analytics/scripts/chart_price_evolution.py` still renders the synthetic sample
as a CI fixture (`--out /tmp/price-evolution.sample.png`) and refuses to write
the README path.

### Backfill and local runs

The backfill rebuilds every past day from `price_history`. From a host that can
reach the local Postgres (or with the docker `psql` fallback when
`DATABASE_URL` is unset):

```bash
npx tsx scripts/export-price-series.ts --mode backfill --out analytics/data
scripts/analytics-data.sh upload-dir analytics/data   # GH_TOKEN required
cd analytics && uv run python scripts/publish_basket_index.py \
  --glob 'data/*/part.parquet' --source release
```

`dbt build` alone is reproducible from a clean checkout with the tiny committed
sample (`analytics/sample/part.parquet`); the sample **page payload** lives at
`analytics/tests/fixtures/basket-index.sample.json` and the CI job in
`.github/workflows/analytics.yml` builds from the sample, checks both payloads
(`--check` against the fixture and `--placeholder --check` against production)
and regenerates the sample chart fixture. The README chart is not built here:
it comes from real data via `npx tsx scripts/chart-price-evolution.ts` (see
"README price chart" above). No sample artifact is ever served in production.

### CPI seed

`analytics/seeds/indec_cpi.csv` is the official INDEC IPC Nivel General
Nacional (base December 2016), monthly, with the exact source URL per row.
Refresh it only with `cd analytics && uv run python scripts/fetch_indec_cpi.py`;
the script fails loudly instead of inventing values. The loader rejects an
unparseable seed before writing anything.

### Known limitations

- Real catalog data starts on 2026-09-28 while the INDEC series available here
  ends on 2026-08-01, so the production payload is an honest
  `status = "insufficient"` with no index values until two basket months and one
  overlapping CPI month exist; the page states that instead of drawing a false
  comparison.
- Backfill freshness can only use `price_history` changes plus each offer's
  `last_checked_at`, which is a single instant: days before the latest refresh
  may read `stale` even if the offer was checked then. The daily cloud export is
  always measured against its own observation instant.
- The `analytics-data` release is replaceable state: it can be rebuilt with a
  backfill at any time; only `data/analytics/basket-index.json` is served.

## Daily cron

1. **Script:** `scripts/cron-refresh.sh`. It works in a dedicated worktree
   `~/code/ofertaSUPER-refresh` (approved exception to the single-worktree
   guardrail) that returns to `origin/master` before each run (fetch + detach
   checkout; it never touches other worktrees). It uses `flock` to avoid
   overlapping runs.

   **Retired once the cloud job is green.** The cloud workflow is the only
   writer; the local crontab line is removed (see "Cloud refresh" above) and
   this section becomes the manual fallback.
2. **Backup:** the script runs the day's `pg_dump` before writing.
3. **Publication:** it creates branch `chore/catalog-refresh-<YYYYMMDD>`,
   commits only `data/catalog-snapshot.json`, opens a PR and runs
   `gh pr merge --auto --merge --delete-branch`; if the repo does not allow
   auto-merge, it waits with `gh pr checks --watch` and merges only when green.
4. **Brakes:** if the refresh fails (failed batches, freshness <90%, or a source
   with >20% failed reads), it does NOT open the PR: it writes the reason to the
   log and exits with code ≠0.
5. **Log:** `~/.local/state/ofertasuper/refresh-<date>.log`.
6. **crontab** (from 07:00 Argentina time = 10:00 UTC; the machine runs UTC). It
   runs every hour until 23:00 UTC to recover the day if the PC was off or
   Docker was down; the script does nothing if there was already an attempt that
   day (marker `~/.local/state/ofertasuper/attempted-<date>`, written just
   before the refresh, so a freshness brake is not retried):

   ```
   0 10-23 * * * $HOME/.local/bin/ofertasuper-refresh
   ```

   Check with `crontab -l`; pause by commenting the line (`crontab -e`); each
   run's log stays at the path in item 5. To force another run the same day,
   delete the `attempted-<date>` marker.
7. **Postgres:** container `ofertasuper-cmvp-local-bootstrap-postgres-1` has
   `restart: unless-stopped` (`docker update --restart unless-stopped ...`) and
   the script starts it if it finds it stopped.

## Local Postgres restore

- The password lives in `~/.config/ofertasuper/postgres.env` (600, never
  commit) together with `APP_PASSWORD`, which compose interpolates even when
  only postgres is started.
- Start only the base:
  `docker compose --env-file ~/.config/ofertasuper/postgres.env up -d postgres`
  (from the repo; it does not run migrate or seed).
- On an already-initialized volume that env is inert: if the role password does
  not match the env one, sync it over the local socket
  (`docker exec ... psql -c "ALTER USER ..."`) and take a fresh backup under a
  different name (for example `ofertasuper-<date>-post-restore.dump`).

## Encrypted off-site backup (optional)

`scripts/cron-refresh.sh` can copy the daily dump to Cloudflare R2, encrypted
client-side with rclone crypt. It is off unless `~/.config/ofertasuper/r2.env`
exists. Upload failures are logged and never block the refresh (300 s timeout,
one upload per day).

### Setup

1. In Cloudflare, create the R2 bucket `ofertasuper-backups`.
2. Create an R2 API token: **Object Read & Write**, scoped to that bucket only;
   do not grant `CreateBucket`. Note the access key, secret and account
   endpoint.
3. Install rclone. The cron PATH includes `/usr/local/bin`, `~/.local/bin` and
   `/snap/bin`.
4. Obscure two distinct passwords (store the plain ones in your password
   manager; losing them means losing the backups):

   ```bash
   rclone obscure 'password-one'
   rclone obscure 'password-two-salt'
   ```

5. Create the env file from the template (no real secrets in the repo):

   ```bash
   mkdir -p ~/.config/ofertasuper
   cp scripts/r2.env.example ~/.config/ofertasuper/r2.env
   chmod 600 ~/.config/ofertasuper/r2.env
   ```

   Fill in the endpoint, key pair and the two obscured passwords.
   `R2_REMOTE=crypt` and `R2_RETENTION_DAYS=7` are the defaults.

6. The `R2_BUCKET` must be pre-provisioned. Both tools set
   `RCLONE_CONFIG_R2_NO_CHECK_BUCKET: "true"`, so rclone is configured not to
   check for or create the bucket.

### Test manually

```bash
set -a; . ~/.config/ofertasuper/r2.env; set +a
rclone copyto --dry-run ~/backups/ofertasuper-$(date +%F).dump "$R2_REMOTE:ofertasuper-$(date +%F).dump"
rclone lsf "$R2_REMOTE:"          # after a real copy, lists the decrypted names
```

Drop `--dry-run` for a real upload. Do not run `cron-refresh.sh` itself to test.

### What the cron does

After the local dump is ready: `rclone copyto` to
`$R2_REMOTE:ofertasuper-YYYY-MM-DD.dump`, then
`rclone delete --min-age ${R2_RETENTION_DAYS}d` on `ofertasuper-*.dump`. A
marker `~/backups/ofertasuper-YYYY-MM-DD.dump.r2-uploaded` prevents a second
upload the same day. Look for `r2 upload` lines in
`~/.local/state/ofertasuper/refresh-YYYY-MM-DD.log`.

### Restore

```bash
set -a; . ~/.config/ofertasuper/r2.env; set +a
rclone lsf "$R2_REMOTE:"
rclone copyto "$R2_REMOTE:ofertasuper-YYYY-MM-DD.dump" /tmp/restore.dump
docker exec -i ofertasuper-cmvp-local-bootstrap-postgres-1 \
  pg_restore -U ofertasuper_owner -d ofertasuper --clean --if-exists < /tmp/restore.dump
```

`--clean` drops existing objects: restore into a scratch database when only
inspecting.

## Manual encrypted backup and recovery

The scripts `scripts/postgres-backup-r2.mjs` (`npm run backup:postgres-r2`) and
`scripts/postgres-recovery-r2.mjs` (`npm run recovery:postgres-r2`) are the
manual, operator-run path. There is no recurring trigger and no Production
authority.

### Configuration

| Setting | Value |
| --- | --- |
| `BACKUP_DATABASE_URL` | direct PostgreSQL URL for the dedicated backup role; its username must exactly equal `BACKUP_DATABASE_ROLE` |
| `BACKUP_DATABASE_ROLE` | role name; must exactly match the URL username |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | bucket-scoped R2 token (Object Read & Write only) |
| `RCLONE_CRYPT_PASSWORD`, `RCLONE_CRYPT_PASSWORD2` | the two paired crypt passwords |
| `R2_ENDPOINT`, `R2_BUCKET` | R2 endpoint and pre-provisioned bucket |
| `BACKUP_CRYPT_REMOTE` | the logical application target (for example `crypt:ofertasuper-r2`) used for backup and recovery paths; set it as a variable before dispatching |
| `BACKUP_RETENTION` | retention window, 2–90 days |
| `RECOVERY_MANIFEST_KEY` | exactly one logical manifest basename (for example `postgres-r2-…manifest.json`) |
| `RCLONE_CONFIG_CRYPT_REMOTE` | the underlying raw target `r2:${R2_BUCKET}`; must remain set |

Do not use `RCLONE_CRYPT_REMOTE`: it is a reserved rclone backend option for
`--crypt-remote`, and exporting it collides with `RCLONE_CONFIG_CRYPT_REMOTE`.
Migrate any existing `RCLONE_CRYPT_REMOTE` variable to `BACKUP_CRYPT_REMOTE` and
remove the old one; never add the reserved name to the environment.

Each operational backup and recovery child process owns an empty rclone
configuration by forcing `RCLONE_CONFIG=/dev/null`; any ambient or
caller-supplied rclone config is ignored. Backup stream diagnostics identify only
the safe phase (upload or validation) and side (source or destination), never
provider output, arguments, paths, hosts, or secrets.

Store `RCLONE_CRYPT_PASSWORD` and `RCLONE_CRYPT_PASSWORD2` as canonical
non-empty single-line plaintext values; do not pre-obscure either plaintext
password. Derive rclone's reversible obscured values at runtime from step-local
plaintext; derivation is ephemeral and plaintext is not persisted. Rotate both
together so the two crypt passwords stay paired.

### Database boundary

The backup and recovery boundary is the application-owned `public` schema only.
The custom archive includes `_prisma_migrations` and the core catalog
(`products`, `supermarkets`, `supermarket_products`, `price_history`); it
excludes managed `auth` and `storage` schemas. `pg_dump` uses its default
consistent snapshot and bounds table-lock acquisition to
`--lock-wait-timeout=30s`; it does not use serializable-deferrable mode. If the
lock timeout expires, the backup fails closed before publication.

### Failure semantics

`pg_restore --list` validation runs in-container and the remaining stream is
drained to EOF only after it succeeds.
It never writes a plaintext dump to disk.
Before manifest publication, the job attempts to remove every
owned temporary object and any archive it promoted; cleanup errors do not hide
the original failure. Manifest v2 records the encrypted relative key and SHA-256
after immutable archive promotion, and never removes a possibly pre-existing
final manifest after an immutable-name collision. After complete manifest
publication, retention failure fails the run but may leave the new valid pair
intact.

Recovery accepts only one strict logical manifest basename, reads its v2
metadata, downloads the raw ciphertext once into an owned workspace, hashes that
exact file, and decrypts that same file while streaming to a unique PostgreSQL
17 container. It verifies completed migrations, core tables/indexes, app-role
reads, and nonzero allowlisted counts for the four core tables. On every failure
or signal it removes the container, network, volume, ciphertext workspace, and
rclone credentials; cleanup errors are aggregated without masking the primary
error. The recovery path never accepts a destination, URL, or Production input:
it has no-Production authority.

## Checklist

- [ ] The remote begins with `crypt:`; credentials remain secrets and the role
      value is non-secret.
- [ ] Retention is 2–90; recovery is rehearsed separately before relying on a
      backup.
- [ ] The daily cron log shows a published snapshot or an explicit brake.
