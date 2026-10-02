# Feature — ofertaSUPER#547 slice 3: dynamic category discovery, staging retention, history archive

Branch: `feat/547-discovery` · Worktree: `/home/picala/code/roadmap-work/os-547-discovery`

## Objective

Replace the frozen 36-batch acquisition plan with a plan built at run time from each
VTEX store's public category tree, for a configured allowlist of grocery departments,
under a hard per-run cap; keep the frozen plan as a logged fallback. Add a staging
retention step to the daily refresh. Prove that nothing deletes `price_history`.

## Non-goals

- No change to the VTEX hash recovery path (owned by `feat/547-vtex-hash`).
- No change to the reconcile writers or gates beyond the batch contract relaxation.
- No `analytics/` or DuckDB work (owned by `feat/548-data-product`).
- No push, PR, or branch switch.

## Constraints

- Cloud refresh runs in GitHub Actions; the GitHub Actions job must stay well under
  the 60-min timeout (today ~12 min for 36 batches; discovered plan is ≤60 batches).
- Same gates as today: failed batches, freshness <90%, source reads >20% failed.
- Retention never touches `price_history`, `products`, `supermarket_products`.

## Tasks

- [ ] T1 — Discovery fixtures + pure category-plan module + unit tests
- [ ] T2 — VTEX category-tree fetch + `resolveRefreshPlan` (discovered|fallback) + wire into `refresh-catalog.ts`
- [ ] T3 — Relax the batch contract for discovered refresh batches (≤50 results, expected GTINs optional) + tests
- [ ] T4 — Staging retention module + Postgres throwaway-container test (`os547d-*`)
- [ ] T5 — `price_history` DELETE guard test
- [ ] T6 — Document discovery + retention in `docs/RUNBOOK.md`
- [ ] T7 — Full checks: tsc, tests, lint, audit:complexity, next build
- [ ] T8 — Live coverage measurement vs the frozen plan

## Evidence

(commit identities and check numbers are recorded as tasks close)
