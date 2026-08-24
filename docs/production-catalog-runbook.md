# Production catalog shadow runbook

This unit is shadow-only and cannot write, schedule, or enable production.

## Quick path

1. The operator obtains required approvals and owns go/no-go during the support window.
2. Run `npm run production-catalog -- --stage shadow --source fixture --dry-run`.
3. Retain its redacted, content-bound receipt for later repository persistence; do not treat it as production acceptance.

## Controls

| Topic | Rule |
| --- | --- |
| Source and arguments | Fixed to `disco`, `shadow`, fixture, and dry-run; fixture data never supplies an executable command. |
| Authority | PR2 policy must validate it. Missing, malformed, or unapproved authority stays blocked. |
| Environment | Only approved variable names are recorded; values and secrets are never emitted. |
| Failure | One bounded failure gets one rollback disposition and receipt, with no retry loop. |
| Writes | Any future limited write needs validated authority, explicit non-dry-run stage/source constraints, and the existing direct-refresh health, kill-switch, prewrite, lock, reconciliation, and rollback invariants. |

## Pending external acceptance

The user/operator owns promotion approval, alert handling, external receipts, and production acceptance. Those actions remain pending and this workflow has no cron schedule.
