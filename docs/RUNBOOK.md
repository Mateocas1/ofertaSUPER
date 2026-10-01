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

   - Walks the 36 batches of `acquisition-plan-cycle2.json` with a per-day
     `batchId` (`v1-refresh-<YYYYMMDD>-<ordinal>`); a completed batch replays
     from its checkpoint and does not query again.
   - Captures simple Carrefour promos (PromotionTeasers by EAN, public REST
     read) during staging; a failed promo read leaves the promo null, counts in
     the summary, and does not abort the batch.
   - Regenerates `data/catalog-snapshot.json` and prints the summary: batches
     ok/failed, promos captured/failed reads, and the % of offers <24 h per
     supermarket. Exits with an error if a batch failed or the worst
     supermarket falls below 90%.
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

The 36 batches search by term and take the first 25 results per search. With
each supermarket's ranking rotation, roughly 15% of the catalog offers can fall
outside the day's coverage (products that today are not in the top-25 for their
term). The first refresh (2026-09-28) landed at 79.6% / 85.5% / 84.1% per
supermarket, below the 90% target: it was reported and the options were widening
the coverage by EAN or accepting partial coverage in v1.

## Daily cron

1. **Script:** `scripts/cron-refresh.sh`. It works in a dedicated worktree
   `~/code/ofertaSUPER-refresh` (approved exception to the single-worktree
   guardrail) that returns to `origin/master` before each run (fetch + detach
   checkout; it never touches other worktrees). It uses `flock` to avoid
   overlapping runs.
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
