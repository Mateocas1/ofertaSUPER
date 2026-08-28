# Manual encrypted database backup

This manual-only workflow streams a PostgreSQL custom archive through rclone crypt to R2, validates its restore listing and SHA-256, then immutably publishes an archive/manifest pair. It never writes a plaintext dump to disk. It does not authorize a recurring trigger or live backup.

## Quick path

1. Set the repository secrets and variables below; `BACKUP_DATABASE_ROLE` must exactly equal the URL username.
2. An approved operator runs **Encrypted database backup** from Actions.
3. Treat success as a published pair. A failed pre-publication run is not a backup.
4. To rehearse recovery, dispatch **Encrypted database recovery** with exactly the logical manifest basename (for example, `postgres-r2-…manifest.json`); it has no Production authority.

| Setting | Repository value |
| --- | --- |
| Secrets | `BACKUP_DATABASE_URL` (dedicated direct backup role), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `RCLONE_CRYPT_PASSWORD`, `RCLONE_CRYPT_PASSWORD2` |
| Variables | `BACKUP_DATABASE_ROLE`, `R2_ENDPOINT`, `R2_BUCKET`, `RCLONE_CRYPT_REMOTE` (`crypt:` path), `BACKUP_RETENTION` (2–90) |
| Pins | checkout v4 commit, rclone 1.75.0, PostgreSQL 17.6 Bookworm digest |

## R2 least-privilege setup

Pre-provision the `R2_BUCKET` before running either workflow. Scope its R2 token to that bucket with **Object Read & Write** only; do not grant `CreateBucket` permission. Both workflows set `RCLONE_CONFIG_R2_NO_CHECK_BUCKET: "true"`, so rclone is configured not to check for or create the bucket.

## Crypt secret handling

Store `RCLONE_CRYPT_PASSWORD` and `RCLONE_CRYPT_PASSWORD2` as canonical non-empty single-line plaintext repository secrets; do not pre-obscure either value. The backup and recovery workflows derive rclone's reversible obscured values at runtime from step-local plaintext. Each derived value is masked before being passed to later steps through the job environment; derivation is ephemeral and plaintext is not persisted outside that step. Rotate both together so the two crypt passwords stay paired.

## Database boundary

The backup and recovery boundary is the application-owned `public` schema only. The custom archive includes `_prisma_migrations` and the core application catalog in `public`; it excludes Supabase-managed `auth` and `storage` schemas. Do not grant the dedicated backup role access to managed schemas.

## Failure semantics and recovery

Before manifest publication, the job attempts to remove every owned temporary object and any archive it promoted; cleanup errors do not hide the original failure. Manifest v2 additionally records the encrypted relative key and SHA-256 after immutable archive promotion. It never removes a possibly pre-existing final manifest after an immutable-name collision. After complete manifest publication, retention failure fails the run but may leave the new valid pair intact.

Recovery accepts only one strict logical manifest basename, reads its v2 metadata, downloads the raw ciphertext once into an owned workspace, hashes that exact file, and decrypts that same file while streaming to a unique PostgreSQL 17 container. No plaintext dump is written. It verifies completed migrations, core tables/indexes, app-role reads, and nonzero allowlisted counts for `products`, `supermarkets`, `supermarket_products`, and `price_history`. On every failure or signal it removes the container, network, volume, ciphertext workspace, and rclone credentials; cleanup errors are aggregated without masking the primary error. The workflow never accepts a destination, URL, or Production input: it has no-Production authority.

## Checklist

- [ ] The remote begins with `crypt:`; credentials remain secrets and the role value is non-secret.
- [ ] Retention is 2–90; recovery is rehearsed separately before relying on a backup.
