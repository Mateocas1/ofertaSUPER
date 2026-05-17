# Gate 5 - E2E publico acotado - 2026-05-17

Status: `GREEN`

This gate ran a bounded public smoke against the production build served locally with `npm run start` on `127.0.0.1:3036`. It avoided broad Playwright/E2E fan-out and used serial HTTP checks plus three local headless Edge screenshots.

## Environment

| Item | Value |
|---|---|
| Base URL | `http://127.0.0.1:3036` |
| Server command | `npm run start -- --hostname 127.0.0.1 --port 3036` |
| Browser fallback | Browser plugin runtime tool was not exposed; used local Microsoft Edge headless |
| Browser executable | `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` |
| Server cleanup | Listener on port `3036` was stopped after the run |

## Route checks

| Route | Result | Notes |
|---|---|---|
| `/` | 200 OK | No obvious framework/Prisma error text |
| `/buscar?q=leche` | 200 OK | No obvious framework/Prisma error text |
| `/api/search?q=yerba&limit=1` | 200 OK | `items=1`, discovered EAN `7790710334757` |
| `/producto/7790710334757` | 200 OK | Product detail route discovered from API |
| `/canasta` | 200 OK | No obvious framework/Prisma error text |
| `/ofertas` | 200 OK | No obvious framework/Prisma error text |
| `/api/categories` | 200 OK | Discovered slug `desayuno-y-merienda` |
| `/categoria/desayuno-y-merienda` | 200 OK | Category route discovered from API |

## Screenshot evidence

| Route | File | PNG size | Bytes |
|---|---|---:|---:|
| `/` | `docs/screenshots/readiness-public-home-2026-05-17.png` | `1365x900` | `203142` |
| `/buscar?q=leche` | `docs/screenshots/readiness-public-search-2026-05-17.png` | `1365x900` | `173930` |
| `/canasta` | `docs/screenshots/readiness-public-canasta-2026-05-17.png` | `390x900` | `38795` |

## Evidence files

- Smoke JSON: `docs/reports/production-readiness/2026-05-17-gate5-public-smoke.json`.
- Server stdout: `docs/reports/production-readiness/2026-05-17-gate5-next-start-stdout.log`.
- Server stderr: `docs/reports/production-readiness/2026-05-17-gate5-next-start-stderr.log`.

## Warnings / limits

- `next start` repeated the same Next.js workspace-root warning from Gate 2 because the parent `C:\Users\picala\pnpm-lock.yaml` still exists.
- This is not a full browser interaction suite, not cross-browser coverage, and not a deep cart/product regression suite.
- The product and category routes were discovered from live API responses in this run; no hard-coded fake product/category route was used for closure.

## Claim boundary

Gate 5 closes only the bounded public smoke and screenshot evidence for the listed routes. It does not close admin auth, production deploy behavior, active ingestion, or broad E2E coverage.
