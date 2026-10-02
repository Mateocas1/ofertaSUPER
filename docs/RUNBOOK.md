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
     instead, so one bad category read never blocks the day.
   - Walks the batches with a per-day `batchId` that also carries the plan mode
     (`v1-refresh-<YYYYMMDD>-d-<ordinal>` for a discovered plan,
     `v1-refresh-<YYYYMMDD>-f-<ordinal>` for the fallback); a completed batch
     replays from its checkpoint and does not query again. The mode keeps a
     same-day discovered/fallback flip from colliding with the other plan's
     checkpoints. A discovered batch searches up to 50 results
     (`resultsPerBatch`) and carries no expected GTINs; a frozen-plan batch
     keeps its 25-result contract.
   - Captures simple Carrefour promos (PromotionTeasers by EAN, public REST
     read) during staging; a failed promo read leaves the promo null, counts in
     the summary, and does not abort the batch.
   - Regenerates `data/catalog-snapshot.json` and prints the summary: batches
     ok/failed, promos captured/failed reads, `[refresh] rejected: <n> products
     [...]` with the quality flags of every dropped product, and the % of offers
     <24 h per supermarket. A batch counts as failed only when its rejected
     products exceed `max(1, 10% of the fetched)` or it admits nothing; an
     isolated rejected product is tolerated and does not block the publish.
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

### Freshness coverage (known limitation)

A batch searches by term and takes at most its configured results
(25 for a frozen-plan batch, up to 50 for a discovered one). With each
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

Each run (10:00 UTC daily, plus `workflow_dispatch` with a `dry_run` input that
restores and refreshes but never uploads or commits):

1. Starts an ephemeral `postgres:16-bookworm` service container.
2. `scripts/db-state.sh download` fetches the newest `ofertasuper-<date>.dump`
   asset of the `db-state` release and `scripts/db-state.sh restore` loads it
   with `pg_restore --no-owner --no-acl`. A missing release or asset fails the
   run with `db-state: NO_STATE_ASSET`; the first asset is seeded from the local
   database (below).
3. `npx prisma migrate deploy`, then `npm run refresh:catalog` with exactly the
   same gates as the local run (failed batches, freshness <90%, a source with
   >20% failed reads, `VTEX_HASH_UNAVAILABLE`). A batch is only failed when its
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
and regenerates the README chart. No sample artifact is ever served in
production.

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
