# Functional portfolio MVP closure — 2026-08-13

> **Verdict: GREEN.** The functional portfolio MVP is complete at merged functional baseline `45d014f` (`45d014fc65d8903e4af6b585cf69f6459615caaf`). This is portfolio evidence, not production launch sign-off.

The closure shipped through [PR #375](https://github.com/Mateocas1/ofertaSUPER/pull/375) for [issue #374](https://github.com/Mateocas1/ofertaSUPER/issues/374). The final PR head was `304805f`.

## Evidence summary

| Gate | Current evidence |
|---|---|
| Tests | `583/583` passed. |
| Type safety | `npm run typecheck` passed. |
| Lint | Passed with `0` errors and `4` unchanged warnings. |
| Local build resilience | The build at pre-candidate base `82c594d` passed and generated `24` static pages. The configured database DNS lookup failed; the intended fallback allowed the build to finish. No local build was run on final candidate `304805f` or merged baseline `45d014f`; this proves build resilience only, **not** final-candidate build status or database connectivity. |
| CI | Final exact head `304805f` passed Lighthouse in `4m39s`, Vercel, and preview checks before merge as `45d014f`. |

## Functional journey

Bounded local E2E acceptance passed at desktop (`1440x900`) and mobile (`390x844`):

1. Home loaded and search for `yerba` returned the portfolio fixture.
2. Detail EAN `7790002000022` showed comparison prices: Jumbo `$3,100`, Disco `$3,490`, and Carrefour `$3,890`.
3. Missing price history rendered the honest empty-history boundary without losing product detail.
4. Basket identity resolved and showed explicitly labeled historical demo estimates and disclaimers, including complete supermarket estimates.
5. Offers rendered the bounded fallback.
6. Unknown EAN `0000000000000` returned `404` from both the route and product API.
7. No unexpected `5xx`, uncaught browser errors, or unexpected console errors occurred. Expected caught dependency errors accompanied fallback behavior.

## Scope boundary

| Functional portfolio MVP — complete | Production operations — pending |
|---|---|
| Credential-free search, detail, comparison, basket, and offers journey | Real PostgreSQL and cache connectivity/configuration |
| Honest empty-history, fallback, and unknown-EAN behavior | Shadow ingestion using managed secrets and real data |
| Desktop/mobile local E2E acceptance | Clerk-authenticated admin positive-path validation |
| Final-candidate static gates and E2E, plus final-head CI | Alerts and monitoring ownership |
| Portfolio-safe historical estimates and disclaimers | Backup/restore execution and ownership |
| Repository runtime harnesses and operational contracts | Approved cadence, SLOs, on-call, and launch go/no-go |

Fresh `smoke:compose`, `smoke:job-image`, and `smoke:postgres-recovery` runs were unavailable because the Docker executable was absent in the verification runtime. Historical smoke results are therefore not fresh functional-baseline proof. The maintained harnesses remain prior repository evidence; see the [portable runtime contract](../../portable-runtime-contract.md).

## Reproduce the passive checks

Run these independently; they were not re-executed by this documentation-only unit:

```bash
npm test
npm run typecheck
npm run lint
npm run build
git diff --check
```

For the credential-free portfolio journey:

```bash
npm ci
CATALOG_OFFLINE_MODE=true npm run dev
```

Open `http://localhost:3000`, search for `yerba`, open EAN `7790002000022`, add it to the basket, and visit `/ofertas`. Use real service configuration only for separate production/live-data verification.
