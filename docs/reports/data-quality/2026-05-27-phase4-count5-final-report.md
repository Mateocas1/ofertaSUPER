# Phase 4.1 count=5 final report

## Terminal recommendation

**PHASE 4 COMPLETE** for the controlled count=5 per-source rollout.

This does **not** authorize schedules, all-source ingestion, or public/global freshness claims.

## Scope

- Query term: `leche`
- Count per source: `5`
- Execution model: one source at a time
- Production DB target: existing linked Supabase project
- Cache validation: product-detail API with Redis purge

## Final global checks

| Check | Result |
|---|---:|
| Active `RUNNING` ingestion runs | 0 |
| Active `PENDING` staging rows | 0 |
| Phase 4.1 runs successful | 6/6 |
| DB audits passed | 6/6 |
| API/cache audits passed | 6/6 |
| API purge errors | 0 |
| New `products` rows | 0 |
| New `supermarket_products` rows | 1 allowlisted Jumbo row |

## Source matrix

| Source | Status | Run | New products | Source rows created | Promoted | DB audit | API/cache | Notes |
|---|---:|---:|---:|---:|---:|---|---|---|
| Disco | GREEN | 58 | 0 | 0 | 5 | PASS | PASS | Standard existing-row rollout |
| Vea | GREEN | 59 | 0 | 0 | 5 | PASS | PASS | Standard existing-row rollout |
| DIA | GREEN | 60 | 0 | 0 | 5 | PASS | PASS | Standard existing-row rollout |
| MAS | GREEN | 61 | 0 | 0 | 5 | PASS | PASS | Standard existing-row rollout |
| Carrefour | GREEN | 62 | 0 | 0 | 5 | PASS | PASS | Standard existing-row rollout |
| Jumbo | GREEN | 63 | 0 | 1 | 5 | PASS | PASS | Explicit allowlisted mini-phase for `7790742335500` |

## Jumbo exception summary

Jumbo originally blocked because current VTEX top-5 for `leche` included EAN `7790742335500`, which was an existing global product and legitimate Jumbo result but had no Jumbo `supermarket_products` row.

Resolution:

- default tooling remains fail-closed for missing source rows;
- one explicit allowlist was added for Jumbo EAN `7790742335500`;
- active write created exactly one Jumbo source row;
- `newProducts` remained `0`;
- DB/API audits passed after the write;
- rollback semantics require deleting the created source row if rollback is ever needed.

## Redis/cache remediation summary

During the rollout, Redis was found to be unavailable. Production Redis credentials were updated from corrected local values and production was redeployed. After remediation:

- Redis ping succeeded;
- product-detail cache purge succeeded for all final source audits;
- rate-limit headers decremented, confirming Redis-backed rate limiting was active;
- final source API checks stayed under the 5s warning threshold.

## Validation evidence

Final validation completed after the rollout and report updates:

- `npm test` — 71/71 passing;
- `npm run typecheck` — passing;
- `npm run lint` — passing;
- `npm run build` — passing with only the known Next workspace-root warning.

## Caveats / non-goals

This phase does not claim or enable:

- scheduled ingestion;
- all-source ingestion;
- global freshness completion;
- public copy claiming prices are live/current globally.

## Recommended next work

1. Prepare reviewable commits by work unit.
2. Keep schedules disabled until a separately reviewed rollout plan exists.
3. Consolidate repeated per-source API audit runners into a reusable script in a later cleanup work unit.
4. Continue avoiding public overclaims about live/current prices until global freshness is actually achieved.
