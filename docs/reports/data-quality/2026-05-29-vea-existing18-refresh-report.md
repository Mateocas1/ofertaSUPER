# Controlled refresh-existing report — Vea leche existing-only x18

## Status

**GREEN.** One explicitly approved `refresh-existing` write refreshed 18 existing Vea `leche` rows. No new product rows or source rows were created.

## Scope

- Issue: #23 — `chore(data): controlled Vea existing-only x18 refresh`
- Source: `vea`
- Term: `leche`
- Write mode: `refresh-existing`
- Candidate selection: `existing-only`
- Count: `18`
- Scan count: `50`
- Candidate hash: `418c52230cea2bd88cfbd9a219ace20204bc97339a02bac74406dc5407384a5b`
- Ingestion run: `64`

## Expected EANs

```text
7790742192103,7790742333605,7790742335609,7790742348005,7790742358608,7790742363008,7790742363107,7791337007253,7791337007260,7791337007802,7792052098069,7792052175609,7792052999137,7798338290028,7798338290035,7798338290110,8445290702234,8445290900654
```

## Predicate and audit results

| Check | Result | Evidence |
|---|---:|---|
| Pre-write ops | PASS | 0 stuck `RUNNING` runs, 0 old `PENDING` staging rows, Redis PASS. |
| Pre-write baseline | WARN | Vea was mostly stale before write; this is expected rollout context, not approval to broaden scope. |
| Candidate audit | PASS | Exact existing-only x18 selected from scan window 50; hash matched expected scope. |
| Active dry-run | PASS | fetched 50, staged 18, promoted 18, rejected 0; new products 0, source rows created 0. |
| Explicit write approval | PASS | User approved the exact command before execution. |
| Active write | PASS | run `64`; fetched 50, staged 18, promoted 18, rejected 0. |
| Post-write DB audit | PASS | 18 touched EANs; new products 0; source rows created 0; warnings 0. |
| Aggregate audit | PASS | 18 touched EANs; warnings 0. |
| Post-write ops | PASS | 0 stuck `RUNNING` runs, 0 old `PENDING` staging rows, Redis PASS. |
| Post-write Vea baseline | WARN | Vea improved from 0 fresh rows to 18 fresh rows: 18/679 = 2.65%. |
| Local validation | PASS | `npm test` 114/114, typecheck, lint, knip, build, `git diff --check`. |

## Active write command

```bash
SCRAPER_ALERT_WEBHOOK_URL= INGESTION_V2=active npm run ingest -- \
  --write-mode=refresh-existing \
  --candidate-selection=existing-only \
  --source=vea \
  --terms=leche \
  --count=18 \
  --scan-count=50 \
  --limit=1 \
  --batch-size=18 \
  --expected-eans=7790742192103,7790742333605,7790742335609,7790742348005,7790742358608,7790742363008,7790742363107,7791337007253,7791337007260,7791337007802,7792052098069,7792052175609,7792052999137,7798338290028,7798338290035,7798338290110,8445290702234,8445290900654 \
  --candidate-hash=418c52230cea2bd88cfbd9a219ace20204bc97339a02bac74406dc5407384a5b \
  --confirm-write
```

`SCRAPER_ALERT_WEBHOOK_URL=` intentionally disabled webhook/alert side effects for this manual controlled write.

## Tooling note

The first post-write DB audit exposed a narrow audit-tooling gap: existing-only writes fetch a larger scan window (`50`) but stage/promote only the selected chunk (`18`). The audit expected `totals.fetched === selected count`; it now accepts `totals.fetched === selection.scanCount` for `existing-only` snapshots while keeping staged/promoted/reconciliation checks tied to the selected EAN set. This changed only audit validation logic and added tests; it did not run another write.

## Actions not taken

- No broad refresh.
- No unfiltered top18 write.
- No discovery/new-row creation.
- No cache purge.
- No schedule.
- No deploy.
- No public freshness overclaim.
- Issue #21 remains the parked, unapproved discovery follow-up for missing Vea EANs.

## Decision

This is a valid controlled refresh proof for a bounded existing-only chunk. It does not prove Vea/global freshness and does not authorize schedules or broader writes. Next expansion should again change only one dimension and use read-only evidence first.

## Raw local evidence

Raw JSON evidence is stored under ignored local path `audit/vea-existing18-refresh/` and is intentionally not committed. This report contains sanitized values needed for review.
