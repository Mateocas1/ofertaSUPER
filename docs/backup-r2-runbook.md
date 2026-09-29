# Off-site backup to Cloudflare R2 (optional)

`scripts/cron-refresh.sh` can copy the daily dump to R2, encrypted client-side with rclone crypt. It is off unless `~/.config/ofertasuper/r2.env` exists. Upload failures are logged and never block the refresh (300 s timeout, one upload per day).

## Setup

1. In Cloudflare, create the R2 bucket `ofertasuper-backups`.
2. Create an R2 API token: **Object Read & Write**, scoped to that bucket only. Note the access key, secret and account endpoint.
3. Install rclone. The cron PATH includes `/usr/local/bin`, `~/.local/bin` and `/snap/bin`.
4. Obscure two distinct passwords (store the plain ones in your password manager, losing them means losing the backups):
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
   Fill in the endpoint, key pair and the two obscured passwords. `R2_REMOTE=crypt` and `R2_RETENTION_DAYS=7` are the defaults.

## Test manually

```bash
set -a; . ~/.config/ofertasuper/r2.env; set +a
rclone copyto --dry-run ~/backups/ofertasuper-$(date +%F).dump "$R2_REMOTE:ofertasuper-$(date +%F).dump"
rclone lsf "$R2_REMOTE:"          # after a real copy, lists the decrypted names
```

Drop `--dry-run` for a real upload. Do not run `cron-refresh.sh` itself to test.

## What the cron does

After the local dump is ready: `rclone copyto` to `$R2_REMOTE:ofertasuper-YYYY-MM-DD.dump`, then `rclone delete --min-age ${R2_RETENTION_DAYS}d` on `ofertasuper-*.dump`. A marker `~/backups/ofertasuper-YYYY-MM-DD.dump.r2-uploaded` prevents a second upload the same day. Look for `r2 upload` lines in `~/.local/state/ofertasuper/refresh-YYYY-MM-DD.log`.

## Restore

```bash
set -a; . ~/.config/ofertasuper/r2.env; set +a
rclone lsf "$R2_REMOTE:"
rclone copyto "$R2_REMOTE:ofertasuper-YYYY-MM-DD.dump" /tmp/restore.dump
docker exec -i ofertasuper-cmvp-local-bootstrap-postgres-1 \
  pg_restore -U ofertasuper_owner -d ofertasuper --clean --if-exists < /tmp/restore.dump
```

`--clean` drops existing objects: restore into a scratch database when only inspecting.
