# Plan 04: Vercel Active CPU, cold starts, and cache verification

## Problem statement

Vercel Hobby allows 4 hours (14,400 s) of Active CPU per month. The `ofertas-super` project was paused for 30 days (`2026-10-15` to `2026-11-14`) after exceeding `fluidCpuDuration`. Since the October incident, `data/catalog-snapshot.json` grew from `39.5 MB` (`24,547` products, `48,419` offers on `2026-10-27`) to `51.1 MB` (`51,119,092` bytes; `25,469` products, `50,872` offers on `2026-11-15`), an increase of `11.6 MB` (+29.4%).

Live probe measurements against production on `2026-11-18` showed:

- `https://ofertasuper.com/api/categories`: `4.60s` to `10.10s` on cold `MISS`, then `0.13s` on `HIT`.
- `https://ofertasuper.com/ofertas`: `0.76s` on `MISS`, then `0.20s` on `HIT`.
- `https://ofertasuper.com/producto/00000040084107`: `0.39s` on `MISS`, then `0.12s` on `HIT`.
- `https://ofertasuper.com/_next/image?url=...`: returned `HTTP 400 INVALID_IMAGE_OPTIMIZE_REQUEST` (image optimization is disabled via `images: { unoptimized: true }` in `next.config.ts:36-38`, though `docs/postmortem-2026-10-vercel-cpu-pause.md:148` expected `404`).
- `https://ofertasuper.com/api/health`: returned `404` because the health routes are `/api/health/live`, `/api/health/catalog`, and `/api/health/ready`.

Every daily catalog commit triggers a Vercel deployment and resets the CDN cache. Because `/api/categories` and every catalog route bundle `data/catalog-snapshot.json` (`src/lib/catalog-snapshot.ts:7`), cold serverless invocations pay to load and parse `51.1 MB` of JSON.

## Constraints to preserve

- `tests/catalog-snapshot-index.test.ts` pins indexed snapshot reads to `tests/helpers/naive-snapshot-oracle.ts` and asserts that full catalog passes read each offer at most once (`reads.count <= offerCount`).
- `tests/public-api-cdn-cache.test.ts` asserts that successful public API `GET` responses carry `Vercel-CDN-Cache-Control: s-maxage=3600, stale-while-revalidate=86400`, while `4xx`, `5xx`, `POST`, and health endpoints never carry it.
- `tests/crawl-cost-guards.test.ts` enforces build-time `/sitemap.xml`, `nextConfig.headers()` for `/ofertas`, `/buscar`, `/categoria/:slug`, `/producto/:ean`, `images.unoptimized: true`, and `robots.txt` rules.
- `tests/catalog-snapshot-schema.test.ts` and `scripts/export-catalog-snapshot.ts` define the snapshot JSON schema v2 contract.
- Keep `/api/health/live`, `/api/health/catalog`, and `/api/health/ready` unchanged.

## Step-by-step tasks

### 1. Check Vercel dashboard Active CPU and cache metrics (operator step)

Before changing application code, read production telemetry in the Vercel dashboard for project `ofertas-super`:

1. Open **Usage** -> **Active CPU (`fluidCpuDuration`)** for the window starting `2026-11-14 02:45 ART` through the current date.
2. Record daily Active CPU seconds, total monthly percentage used, Edge Requests, and Edge Cache Hit Ratio.
3. Evaluate against the Hobby budget (`14,400 s / 30 days = 480 s/day` average ceiling):
   - If daily Active CPU is comfortably below ~150 s/day (<30% of monthly pace), cold starts are acceptable and only monitoring plus snapshot hygiene are needed.
   - If daily Active CPU exceeds ~200 s/day (>40% of monthly pace), prioritize steps 2 and 3 below immediately.

### 2. Profile and reduce cold-start snapshot load and index cost

Inspect what executes on a cold function start:

- `src/app/api/categories/route.ts` calls `handleCategories` (`src/lib/public-api.ts:271-298`), which calls `getSnapshotCategoryCounts()` (`src/lib/catalog-snapshot.ts:277-284`).
- `getSnapshotCategoryCounts()` only loops `readSnapshot().products` and runs `slugify(product.category)`. It does not call `snapshotIndex()`. The `4.60s-10.10s` cold `MISS` on `/api/categories` therefore comes from serverless cold boot plus loading and parsing the `51.1 MB` `data/catalog-snapshot.json` module imported at `src/lib/catalog-snapshot.ts:7`.
- On search, catalog list, and product routes (`/ofertas`, `/producto/[ean]`, `/api/products`, `/api/search`), the first request also invokes `snapshotIndex()` (`src/lib/catalog-snapshot.ts:175-202`), which builds `offersByEan`, `pricedOfferCount`, `productByGtin`, `gtinKeys`, and `searchFields` (`src/lib/catalog-snapshot.ts:195-196`, running `normalizeQuery` 3 times per product across 25,469 products even when no text search is executed).

Execute in this order:

1. Measure cold-start CPU and wall time locally on the real `data/catalog-snapshot.json` before editing code. Run a short Node benchmark (not committed) with `performance.now()` and `--cpu-prof` that measures:
   - `import("./data/catalog-snapshot.json", { with: { type: "json" } })` or `JSON.parse(readFileSync(...))`
   - `getSnapshotCategoryCounts()`
   - `snapshotIndex` via first `getSnapshotProduct(...)`
   - first `searchSnapshotProducts({ query: "leche" })`
   Save the exact baseline millisecond numbers in the PR description.
2. Audit why `data/catalog-snapshot.json` grew by `11.6 MB` (+29.4%) between `2026-10-27` and `2026-11-15` while products grew only +3.8% and offers +5.1%. Run a one-line Node inspection over `data/catalog-snapshot.json` to sum byte sizes of `products`, `offers` without `history`, `history` arrays, and JSON pretty-printing whitespace (`JSON.stringify(snapshot, null, 2)` at `scripts/export-catalog-snapshot.ts:118`).
   - Decision point on indentation: `scripts/export-catalog-snapshot.ts:118` pretty-prints the 51.1 MB file with `JSON.stringify(snapshot, null, 2)`. Check whether compacting (`JSON.stringify(snapshot)`) or keeping 2-space formatting affects bundle parse time, git diff readability (note `git diff` on a 51 MB single-line JSON is unusable for human inspection), or any test (`tests/catalog-snapshot.test.ts`, `tests/catalog-snapshot-schema.test.ts`). Do not switch to single-line JSON without checking git pack size and diff behavior first.
   - Decision point on `offer.history[]`: `scripts/export-catalog-snapshot.ts:16,84-90` already limits history to `90 days` and `limit 200` per offer. Between `2026-10-27` and `2026-11-15`, 19 more daily runs accumulated price-change rows inside `history[]`. Keep at least 30 days of `history` if shrinking the window, because `/bajas` (`scripts/export-price-drops.ts`) uses 14 days, `/producto/[ean]` renders a 30-day history chart (`src/lib/public-pages.ts:127`), and `scripts/chart-price-evolution.ts` reads `offer.history` from the snapshot for the README chart.
3. Make `searchFields` in `SnapshotIndex` (`src/lib/catalog-snapshot.ts:164-202`) lazy:
   - Change `searchFields: string[][] | null` inside `SnapshotIndex`, initialize it to `null` inside `snapshotIndex()`, and populate it only inside `filterAndRankProducts()` when `query !== null` (`src/lib/catalog-snapshot.ts:224-243`).
   - This avoids 76,407 `normalize("NFD")` + regex allocations on cold starts of `/producto/[ean]`, `/ofertas`, and `/categoria/[slug]` when no query string is searched.
   - Run `tests/catalog-snapshot-index.test.ts` to verify exact equivalence with `naive-snapshot-oracle.ts` and bounded offer reads.
4. Separate `/api/categories` from the `51.1 MB` snapshot import if cold-start measurements show `/api/categories` still exceeds ~500 ms CPU:
   - Read `scripts/export-catalog-snapshot.ts` and `src/lib/public-api.ts:271-298`. Category counts (`15` slugs + `generatedAt`) are ~1 KB of JSON. If needed, either precompute `data/catalog-categories.json` during `scripts/export-catalog-snapshot.ts` or compute category counts during Next.js build, keeping `getSnapshotCategoryCounts()` as fallback or test seam (`setSnapshotOverrideForTests`). Check `tests/public-snapshot-categories-promotions.test.ts` and `tests/public-api-cdn-cache.test.ts` before changing the data source of `handleCategories`.

### 3. Verify CDN caching headers and crawler protections

1. Explain and verify the two cache headers observed on `/ofertas` and `/producto/[ean]`:
   - `curl -sI https://ofertasuper.com/ofertas` shows `cache-control: private, no-cache, no-store, max-age=0, must-revalidate` alongside `x-vercel-cache: HIT`.
   - That is expected: Next.js emits `private, no-cache` in `Cache-Control` for App Router pages that read `searchParams` (`next.config.ts:26-30`), while `next.config.ts:44` injects `Vercel-CDN-Cache-Control: s-maxage=3600, stale-while-revalidate=86400`. Vercel's edge caches the response (`x-vercel-cache: HIT`) and strips `Vercel-CDN-Cache-Control` before forwarding to the client (`src/lib/http-cache.ts:1-6`).
2. Audit all public routes to ensure none leak uncached dynamic renders:
   - Run `npm run build` locally and inspect the route table (`○` Static, `●` SSG, `ƒ` Dynamic).
   - Confirm coverage across every `ƒ` public route:
     - `/ofertas`, `/buscar`, `/categoria/:slug`, `/producto/:ean`: covered in `next.config.ts:29,44`.
     - `/api/search`, `/api/products`, `/api/products/[ean]`, `/api/products/[ean]/history`, `/api/categories`, `/api/promotions`: covered by `withCatalogCdnCache` in `src/lib/public-api.ts`.
     - `/` (`src/app/page.tsx:14`) and `/bajas` (`src/app/bajas/page.tsx:21`): both declare `export const revalidate = 21600`.
     - `/inflacion`, `/canasta`, `/metodologia`: confirm in `npm run build` output that they render as `○` (Static) and do not invoke dynamic per-request functions.
     - `/bajas/feed.xml` (`src/app/bajas/feed.xml/route.ts:8` and `src/lib/price-drops-feed.ts:56-68`): uses `force-dynamic` and `cache-control: public, max-age=0, must-revalidate` without `Vercel-CDN-Cache-Control`. Check `tests/price-drops-feed.test.ts` and decide whether adding `withCatalogCdnCache` on 200 responses in `priceDropsFeedResponse()` is safe and compatible with Atom readers.
3. Check Vercel Edge / Firewall logs and Upstash rate-limit metrics (`@upstash/ratelimit`) for crawlers ignoring `robots.txt` or appending unknown query strings (for example `?utm_*` or random tokens) to bypass cache keys:
   - `src/app/robots.ts` disallows `/*?*super=`, `/*?*sort=`, `/*?*maxPrice=`, `/*?*offers=`, `/*?*wallet=`, `/*?*type=`.
   - If telemetry shows bots hitting random query strings on `/ofertas`, `/categoria/*`, or `/producto/*`, add a Vercel Firewall rule to block or challenge requests with unexpected query parameters on `/producto/*`, or strip/canonicalize query parameters in `src/proxy.ts` / Vercel rules.

### 4. Update `docs/postmortem-2026-10-vercel-cpu-pause.md`

Update the checklist in `docs/postmortem-2026-10-vercel-cpu-pause.md:146-154`:

- Mark the first action item checked (`[x]`), recording the `2026-11-18` verification:
  - `x-vercel-cache: HIT` confirmed on `/ofertas`, `/producto/00000040084107`, and `/api/categories`.
  - `/_next/image` returns `HTTP 400 INVALID_IMAGE_OPTIMIZE_REQUEST` (Next 16.3.6 behavior when `images.unoptimized: true` disables the optimizer, rather than `404`), confirming remote image optimization cannot be triggered.
  - `robots.txt` verified live.
- Mark the second action item checked (`[x]`) once the Vercel Usage Active CPU check in Step 1 is complete, recording the measured daily CPU figure and decision on `/api/categories` and snapshot size.

## Verification commands

Run from the repository root (`ofertaSUPER-remediation/`):

```bash
node --import tsx --conditions=react-server --test tests/catalog-snapshot-index.test.ts
node --import tsx --conditions=react-server --test tests/public-api-cdn-cache.test.ts
node --import tsx --conditions=react-server --test tests/crawl-cost-guards.test.ts
node --import tsx --conditions=react-server --test tests/public-snapshot-categories-promotions.test.ts
node --import tsx --conditions=react-server --test tests/public-snapshot-routes.test.ts
node --import tsx --conditions=react-server --test tests/price-drops-feed.test.ts
npm run typecheck
npm run build
```

Verify live headers after deploy:

```bash
curl -sI https://ofertasuper.com/api/categories | grep -iE '^(http|x-vercel-cache|cache-control)'
curl -sI https://ofertasuper.com/ofertas | grep -iE '^(http|x-vercel-cache|cache-control)'
curl -sI https://ofertasuper.com/producto/00000040084107 | grep -iE '^(http|x-vercel-cache|cache-control)'
curl -sI "https://ofertasuper.com/_next/image?url=https%3A%2F%2Fexample.com%2Fa.jpg&w=256&q=75" | head -n 5
curl -s https://ofertasuper.com/api/health/ready
```

## Acceptance criteria

- Vercel Active CPU usage since `2026-11-14` is recorded in `docs/postmortem-2026-10-vercel-cpu-pause.md`, with an explicit threshold check against the 14,400 s monthly Hobby quota.
- Local cold-start benchmark numbers on the `51.1 MB` snapshot are recorded, `searchFields` in `src/lib/catalog-snapshot.ts` builds lazily on query searches only (or equivalent cold-start optimization is verified), and `/api/categories` cold-start strategy is decided from data.
- Every public route in `npm run build` is accounted for as static, ISR, or CDN-cached via `Vercel-CDN-Cache-Control`.
- `docs/postmortem-2026-10-vercel-cpu-pause.md` checklist items are updated accurately, including `HTTP 400 INVALID_IMAGE_OPTIMIZE_REQUEST` on `/_next/image`.
- All listed tests, `npm run typecheck`, and `npm run build` pass.
