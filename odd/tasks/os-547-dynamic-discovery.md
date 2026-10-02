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

- Cloud refresh runs in GitHub Actions; the job must stay well under 60 min (60
  discovered batches ≈ 20 min at today's ~20 s/batch, vs ~12 min for 36).
- Same gates as today: failed batches, freshness <90%, source reads >20% failed.
- Retention never touches `price_history`, `products`, `supermarket_products`.

## Tasks (all closed)

- [x] T1 — Discovery fixtures + pure category-plan module + unit tests
      `c11fa8d` (12 unit tests; sanitized Disco/Jumbo/Carrefour fixtures)
- [x] T3 — Relax the batch contract for discovered batches
      `5c62557` (refresh batches: ≤50 results, expected GTINs optional)
- [x] T2 — VTEX category-tree fetch + `resolveRefreshPlan` (discovered|fallback) + wiring
      `a3cc6f9` (17 discovery/resolver tests; `[refresh] plan: discovered|fallback`)
- [x] T4 — Staging retention module + Postgres throwaway-container test
      `bb2e3f2` (`os547d-*` container removed in `finally`)
- [x] T5 — `price_history` DELETE guard test
      `517b234` (verified red with a probe file)
- [x] T6 — Runbook documentation of discovery + retention
      `1ecfa77`
- [x] T7 — Lint/complexity refactor to keep the budget green
      `d45790a`
- [x] — Shared fallback fix found by the measurement: `+`-encoded spaces 400 on VTEX
      `9f87b06`
- [x] — `.gitignore` merged-line fix (`artifacts/refresh/` was never ignored)
      `f526f68`
- [x] T8 — Live coverage measurement vs the frozen plan (production GraphQL path)

## Evidence

- `npx tsc --noEmit` → 0 errors.
- `npm test` → 494 pass / 0 fail (75 suites).
- `npm run lint` → no issues.
- `npm run audit:complexity` → PASS, 0 over-threshold.
- `npx next build --webpack` → exit 0, 24/24 static pages (19 prisma `DATABASE_URL`
  errors during prerender are the expected fail-closed logs without a database).
- Live measurement (2026-10-02, 60 requests, production GraphQL path, 0 failures):
  discovered 2034 unique GTINs vs 618 frozen; 334 categories considered, 42
  departments matched across Disco/Jumbo/Carrefour; per store 861/873/904.

## Open questions

- Sampled categories: breadth-first round-robin reaches each department's first
  child, so with a 20-batch/store quota some staple children (e.g. "leches",
  "arroz y legumbres") are not searched. Rotation across days or a larger cap
  would close the gap; the EAN top-up keeps already-known offers fresh meanwhile.
- Same-day plan change: a rerun that flips discovered↔fallback reuses the day's
  checkpoint ordinals and the contract digest rejects them, so the rerun fails
  closed instead of publishing.
