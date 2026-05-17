# Gate 4 - Ingesta controlada - 2026-05-17

Status: `GREEN`

This gate executed only the approved safe ingestion path: a single-source VTEX probe and a shadow dry-run for `disco`. No active ingestion, multi-source ingestion, or real DB write run was executed.

## Commands run

| Step | Command | Result | Evidence |
|---|---|---|---|
| VTEX probe | `npm run probe:vtex -- --source=disco --query=leche --count=1` | Exit 0 | `docs/reports/production-readiness/2026-05-17-gate4-probe-vtex-disco.log` |
| Shadow dry-run | `INGESTION_V2=shadow npm run ingest -- --dry-run --source=disco --limit=1` | Exit 0 | `docs/reports/production-readiness/2026-05-17-gate4-ingest-shadow-dry-run-disco.log` |

## Probe result

| Field | Value |
|---|---|
| Source | `disco` |
| Query | `leche` |
| Count | `1` |
| `isHealthy` | `true` |
| `hashValid` | `true` |
| `errorType` | `null` |
| `productsReturned` | `1` |
| `responseTimeMs` | `1184` |
| Hash output | Masked by script (`3eca26a4...4b0fb67d`) |

## Shadow dry-run result

| Field | Value |
|---|---|
| Mode | `shadow` |
| Dry run | `true` |
| Source count | `1` |
| Fetched | `6` |
| Staged metric | `6` |
| Promoted | `0` |
| Rejected | `0` |
| Failed sources | `0` |
| Reconciliation | `null` |
| Metrics | `null` |

## Write boundary

- No `INGESTION_V2=active` command was run.
- No non-dry-run ingestion command was run.
- The `staged=6`/`productsStaged=6` values are dry-run pipeline metrics from the command output, not authorization to assume persistent DB writes.
- A minimum real write run still requires explicit approval before executing.

## Claim boundary

Gate 4 closes the safe, controlled dry-run ingestion check for one source. It does not close active ingestion, scheduled ingestion, multi-source ingestion, rollback/cleanup for real writes, or production ops readiness.
