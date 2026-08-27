# Manual encrypted database backup

This manual-only workflow streams a PostgreSQL custom archive through rclone crypt to R2, validates its restore listing and SHA-256, then immutably publishes an archive/manifest pair. It never writes a plaintext dump to disk. It does not authorize a recurring trigger or live backup.

## Quick path

1. Set the repository secrets and variables below; `BACKUP_DATABASE_ROLE` must exactly equal the URL username.
2. An approved operator runs **Encrypted database backup** from Actions.
3. Treat success as a published pair. A failed pre-publication run is not a backup.

| Setting | Repository value |
| --- | --- |
| Secrets | `DATABASE_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `RCLONE_CRYPT_PASSWORD`, `RCLONE_CRYPT_PASSWORD2` |
| Variables | `BACKUP_DATABASE_ROLE`, `R2_ENDPOINT`, `R2_BUCKET`, `RCLONE_CRYPT_REMOTE` (`crypt:` path), `BACKUP_RETENTION` (2–90) |
| Pins | checkout v4 commit, rclone 1.75.0, PostgreSQL 17.6 Bookworm digest |

## Failure semantics and recovery

Before manifest publication, the job attempts to remove every owned temporary object and any archive it promoted; cleanup errors do not hide the original failure. It never removes a possibly pre-existing final manifest after an immutable-name collision. After complete manifest publication, retention failure fails the run but may leave the new valid pair intact. Retention considers only complete owned archive/manifest pairs, so incomplete newer objects never consume a retention slot.

For recovery, use the configured crypt remote, validate again with the pinned PostgreSQL image, and restore only into an isolated approved target. To roll back this delivery, disable or remove the manual workflow and retain existing encrypted pairs while investigating failures.

## Checklist

- [ ] The remote begins with `crypt:`; credentials remain secrets and the role value is non-secret.
- [ ] Retention is 2–90; recovery is rehearsed separately before relying on a backup.
