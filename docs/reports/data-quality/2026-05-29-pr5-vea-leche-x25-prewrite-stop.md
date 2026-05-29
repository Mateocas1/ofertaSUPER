# PR5 controlled refresh evidence — Vea leche x25 pre-write stop

## Status

**STOPPED before dry-run/write.** The refresh-existing rollout gate worked as intended: the candidate audit failed before any active ingestion, database write, cache purge, schedule, or deploy.

## Scope

- Issue: #18 — `chore(data): controlled Vea refresh-existing evidence`
- Source: `vea`
- Term: `leche`
- Requested candidate size: `25`
- Write mode: `refresh-existing`
- Rollout rule: expand one dimension only from the previous count=5 canary evidence.

## Predicate results

| Predicate | Result | Evidence |
|---|---:|---|
| Repo/issue preflight | PASS | Branch `chore/pr5-vea-refresh-evidence`; issue #18 is approved and labeled `type:chore`. |
| Ops freshness | PASS | `0` stuck `RUNNING` runs, `0` old `PENDING` staging rows, Redis ping PASS at `323ms`. |
| Vea freshness baseline | WARN | Vea has `679` source rows, `0` fresh, `679` stale; this matches the known global-stale state and does not authorize writes. |
| Vea VTEX health probe | PASS | Hash valid, healthy response, `1` product returned for `leche`, response time `2639ms`. |
| Candidate audit | **FAIL** | `candidate audit missing existing products: 7798095171363`. |

## Commands run

```bash
npm run audit:ops-freshness -- --check-redis --output=audit/pr5-vea-leche-x25/ops.json
npm run audit:freshness-baseline -- --source=vea --sample-size=10 --output=audit/pr5-vea-leche-x25/baseline-vea.json
npm run probe:vtex -- --source=vea --query=leche --count=1 > audit/pr5-vea-leche-x25/probe-vtex-vea-leche.json
npm run audit:ingest-candidates -- --write-mode=refresh-existing --source=vea --terms=leche --count=25 --limit=1 --output=audit/pr5-vea-leche-x25/candidate.json
```

The final command failed before writing `candidate.json`.

## Stop reason

`refresh-existing` evidence requires every candidate to already exist as an internal product and source row. The Vea `leche` top-25 candidate set includes EAN `7798095171363`, which is not present as an existing product in the database. Creating it would be discovery/new-row behavior, which is explicitly out of scope for this PR5 slice.

## Actions not taken

- No active dry-run was run after the failed predicate.
- No active write was run.
- No `--confirm-write` command was run.
- No cache purge was run.
- No schedule, deploy, or legacy `update-prices` path was used.
- No source/term/count fallback was attempted under the same approval.

## Decision

Do not proceed with `vea/leche/count=25` under issue #18 without a new explicit scope decision. Safe next options are:

1. Re-scope a new approved PR5 slice to a different source/term/count after read-only candidate discovery.
2. Add separate tooling to select an existing-only bounded chunk while documenting skipped live results as unavailable/not in catalog.
3. Treat this PR as the evidence report proving the gate blocks discovery/new-row drift.

## Raw local evidence

Raw JSON evidence was written under ignored local path `audit/pr5-vea-leche-x25/` and is intentionally not committed. This report contains only the sanitized fields needed for review.
