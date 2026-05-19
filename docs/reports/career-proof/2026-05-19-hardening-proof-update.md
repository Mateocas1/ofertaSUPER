# ofertasSUPER hardening proof update - 2026-05-19

Status: `SAFE CAREER PROOF / NOT A PRODUCTION-READY CLAIM`

This proof update turns the Goal 2 hardening sprint into a reviewable technical story: what was risky, how we noticed it, why each solution was chosen, what evidence proves it, and which claims are safe to use in README, portfolio, LinkedIn or interviews.

## Executive summary

The sprint did not add flashy features. It made the project more defensible:

| Area | Problem attacked | Outcome |
|---|---|---|
| Data safety | Legacy scraper/update scripts could write by default. | Legacy write paths now default to dry-run and require explicit confirmation. |
| Public reliability | Product/category/promotion APIs did not degrade consistently when runtime dependencies failed. | Public APIs preserve validation `400`s and return bounded demo fallbacks on runtime failures. |
| Performance | Product listing loaded broad relation-heavy result sets before pagination. | Product listing now caps candidate reads before relation loading. |
| Race conditions | Ingestion/update jobs and active reconciliation could overlap. | Workflows serialize data jobs and reconciliation uses a transaction advisory lock. |
| Operational honesty | A RED test exposed and triggered the old write footgun. | The accidental 50-row `price_history` residue was cleaned up after explicit approval and verified. |

## Why this matters for career positioning

This is the kind of work that separates "I built a demo" from "I understand engineering risk":

- safety before automation;
- bounded failure modes instead of happy-path-only code;
- tests for contracts that matter;
- operational cleanup with guardrails;
- honest claim boundaries instead of pretending the project is production-ready.

Safe high-level claim:

> I hardened a full-stack price comparison project by adding data-write guardrails, dependency-aware public API fallbacks, bounded catalog reads, ingestion concurrency controls, and evidence-backed documentation.

Unsafe claims:

- production-ready;
- complete E2E coverage;
- active ingestion running safely in production;
- full data rollback of every table;
- production admin positive path fully validated.

## Case 1 - Legacy write safety

### What problem did we attack?

The legacy scraper/update path could write to the database unless callers explicitly remembered to pass `--dry-run`.

That is backwards. Dangerous operations should require explicit approval; safe mode should be the default.

### How did we notice?

The Goal 1 audit identified legacy write scripts as a P1 data-safety risk. During the RED phase for the guard, the failing test exposed the exact bug: calling `runStoreScraper()` without `dryRun` reached the real Disco write path.

### Why this solution?

We did not remove the scripts or pretend ingestion was production-ready. The safer, smaller fix was:

- default direct scraper calls to dry-run;
- require `--confirm-write` or `INGESTION_WRITE_APPROVED=true` for real writes;
- let `--dry-run` win over confirmation flags;
- make the GitHub Actions manual workflow default to dry-run.

### Evidence

| Evidence | Location |
|---|---|
| Code | `scripts/scrapers/shared.ts` |
| Workflow guard | `.github/workflows/update-prices.yml` |
| Test | `tests/legacy-write-safety.test.ts` |
| Commit | `6d01b9f fix(ingestion): guard legacy write scripts` |
| Final verification | `npm test` -> 35/35 |

### Interview angle

> I found a write-safety issue where a legacy ingestion path defaulted to real writes. I reversed the default: safe dry-run first, explicit write approval only, and tests to prove the boundary.

## Case 2 - Public API fallback semantics

### What problem did we attack?

The public demo depends on external services and database availability. If those fail, users should not see random 500s or misleading validation errors.

### How did we notice?

Goal 1 found that `/api/search` had stronger fail-open behavior than other public catalog APIs. Product/category/promotion routes had inconsistent runtime-failure behavior.

### Why this solution?

The app needs two different behaviors:

- invalid input should stay a `400`;
- runtime dependency failures should degrade to bounded demo data.

That separation keeps the API honest while preserving a usable public demo.

### Evidence

| Evidence | Location |
|---|---|
| Shared helper | `src/lib/public-catalog-api.ts` |
| Routes | `src/app/api/products/route.ts`, `src/app/api/categories/route.ts`, `src/app/api/promotions/route.ts` |
| Test | `tests/public-catalog-api.test.ts` |
| Commit | `9d1a9bd fix(api): normalize public catalog fallbacks` |
| Public API smoke | products/categories/promotions checks recorded in `docs/reports/hardening/2026-05-19-ofertassuper-hardening-sprint.md` |

### Interview angle

> I separated validation failures from runtime dependency failures. Bad input still returns 400, but DB/runtime failures degrade to bounded demo data so the public demo remains useful.

## Case 3 - Bounded catalog reads

### What problem did we attack?

Product listing was loading broad result sets with relations before in-memory filtering/sorting and pagination. That can look fine at demo scale but becomes expensive as ingestion grows.

### How did we notice?

The complexity/audit pass flagged broad catalog reads as a scaling risk. The sprint prioritized a small bounded-read improvement before larger search/index work.

### Why this solution?

The full long-term solution is DB-native search/sort/index design. That would be bigger. For this sprint, the correct work unit was a pragmatic cap:

- deterministic min/max candidate read limit;
- normalize unsafe pagination inputs;
- reduce relation-heavy reads before deeper optimization.

### Evidence

| Evidence | Location |
|---|---|
| Query planning helper | `src/lib/catalog-query-planning.ts` |
| Catalog integration | `src/lib/catalog.ts` |
| Test | `tests/catalog-query-planning.test.ts` |
| Commit | `930f37e perf(catalog): bound product listing candidate reads` |
| Smoke | `/api/products?q=leche&limit=1` -> 200; invalid `limit=999` -> 400 |

### Interview angle

> I avoided a premature full search rewrite, but still reduced risk by bounding relation-heavy candidate reads and documenting the remaining DB-native search work.

## Case 4 - Ingestion workflow concurrency

### What problem did we attack?

Manual ingestion/update workflows could overlap. For data pipelines, overlapping jobs can produce duplicate writes, stale reads or hard-to-debug state.

### How did we notice?

Goal 1 flagged ingestion concurrency/idempotency as a P1 risk before re-enabling schedules or active ingestion.

### Why this solution?

The first layer of protection belongs at the workflow level:

- `ingest.yml` and `update-prices.yml` share a data-job concurrency group;
- `cancel-in-progress: false` serializes jobs instead of killing a running data operation;
- schedules remain paused until secrets/cadence/guards are intentionally configured.

### Evidence

| Evidence | Location |
|---|---|
| Workflows | `.github/workflows/ingest.yml`, `.github/workflows/update-prices.yml` |
| Test | `tests/ingestion-concurrency.test.ts` |
| Commit | `66bca0d fix(ingestion): serialize data workflows` |

### Interview angle

> I treated ingestion as an operational workflow, not just a script. Before enabling schedules, I added serialization so manual data jobs do not overlap.

## Case 5 - Reconciliation advisory lock

### What problem did we attack?

Even with workflow concurrency, application-level overlap can still happen. Active reconciliation could load pending staging candidates before any cross-run lock.

### How did we notice?

The audit identified race-condition risk in the ingestion pipeline. We traced the critical point: loading pending candidates before acquiring an exclusive reconciliation boundary.

### Why this solution?

The chosen guard is a transaction-scoped PostgreSQL advisory lock:

- acquire `pg_try_advisory_xact_lock(2026051901)` before loading candidates;
- fail fast with `ReconcileLockUnavailableError` if another reconciliation owns the lock;
- reconcile chunks inside the locked transaction.

Tradeoff: safer overlap prevention, but larger future volumes may need a staging-claim design to avoid one full-window transaction.

### Evidence

| Evidence | Location |
|---|---|
| Code | `scripts/pipeline/reconcile.ts` |
| Test | `tests/reconcile-lock.test.ts` |
| Commit | `2760b6b fix(ingestion): guard active reconciliation lock` |

### Interview angle

> I added a DB-level single-flight guard around active reconciliation. The important part was placing the lock before loading pending candidates, not after.

## Case 6 - Operational cleanup after RED write

### What problem did we attack?

The RED test did its job too well: it exposed the old write footgun and created 50 append-only `price_history` rows.

### How did we notice?

Read-only DB verification found exactly:

- table: `public.price_history`;
- count: `50`;
- id range: `4945`-`4994`;
- supermarket: `disco`;
- timestamp range around `2026-05-19T01:19:53.951Z` to `2026-05-19T01:19:59.212Z`.

### Why this solution?

We cleaned only the safe append-only residue:

- delete only the bounded `price_history` rows;
- do not touch `products` or `supermarket_products` because the legacy path used upserts and no before snapshot existed;
- run a fresh read-only preflight;
- execute a guarded transaction;
- require exactly 50 deleted rows;
- post-check `remaining_candidate_rows = 0`.

### Evidence

| Evidence | Location |
|---|---|
| Cleanup report | `docs/reports/hardening/2026-05-19-price-history-cleanup-proposal.md` |
| Final docs commit | `c59ae1c docs(hardening): record price history cleanup` |
| Post-check | `remaining_candidate_rows = 0` |

### Interview angle

> I did not hide the incident. I documented the root cause, fixed the code path, performed a bounded cleanup after approval, and kept the claim boundary honest.

## Verification snapshot

Latest verified sprint evidence:

| Check | Result |
|---|---|
| `npm test` | 35/35 passing |
| `npm run typecheck` | OK |
| `npm run lint` | OK |
| Public Vercel smoke after push | `/`, `/buscar?q=leche`, `/api/search?q=yerba&limit=1`, `/canasta` returned 200 |
| Build | Not run in this workflow by contract |

Pushed commit range includes:

- `6d01b9f fix(ingestion): guard legacy write scripts`
- `66bca0d fix(ingestion): serialize data workflows`
- `9d1a9bd fix(api): normalize public catalog fallbacks`
- `2760b6b fix(ingestion): guard active reconciliation lock`
- `930f37e perf(catalog): bound product listing candidate reads`
- `c59ae1c docs(hardening): record price history cleanup`

## LinkedIn seed copy - Spanish

Draft:

> Estos días estuve usando ofertasSUPER como algo más que una demo visual: lo llevé por un proceso de auditoría y hardening técnico.
>
> Algunas mejoras que implementé:
>
> - scripts de ingesta que ahora arrancan en dry-run y requieren confirmación explícita para escribir;
> - APIs públicas que diferencian errores de validación de fallos reales de dependencia;
> - límites para evitar lecturas amplias innecesarias en el catálogo;
> - guardas de concurrencia para workflows de datos e ingesta;
> - un advisory lock en Postgres para evitar reconciliaciones activas solapadas.
>
> Lo más valioso no fue "agregar features", sino aprender a mirar el proyecto como sistema: qué puede fallar, qué evidencia tengo, qué claim puedo defender y qué todavía NO debería vender como listo para producción.
>
> Repo: https://github.com/Mateocas1/ofertaSUPER
> Demo: https://ofertas-super.vercel.app

Safe because it does not claim production readiness, users, revenue, active ingestion, or seniority.

## Resume / interview bullets

- Hardened a Next.js/Prisma/Supabase catalog app by adding explicit data-write guards, public API fallback contracts, bounded catalog reads and ingestion concurrency controls.
- Designed tests around operational risk: dry-run enforcement, runtime fallback behavior, workflow serialization and PostgreSQL advisory-lock ordering.
- Documented evidence-based readiness boundaries, including what is verified, what remains pending, and why the project is portfolio-ready but not claimed production-ready.

## Next use

Use this proof update as source material for Goal 3:

- first LinkedIn post;
- project case-study refresh;
- recruiter-safe GitHub/portfolio summary;
- interview answers around reliability, data safety, performance and operational maturity.
