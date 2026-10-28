# Postmortem: ofertasuper.com paused for Active CPU overuse (October 2026)

Status: fix merged (#581, #582); production returns when Vercel lifts the pause
on 14/11/2026 02:45 ART. All times are Argentina time (ART).

## Summary

On 15/10/2026 Vercel paused the `ofertas-super` project with
`FAIR_USE_LIMITS_EXCEEDED` (`fluidCpuDuration`): the team had used more than the
4 hours of Active CPU a month that the Hobby plan includes. Hobby has no billing
cycle, so the pause lasts 30 days. Every route returned HTTP 402 until 14/11.

The cause was in the read path. `/sitemap.xml`, `/ofertas`, `/categoria/[slug]`
and broad `/buscar` queries built results for the whole catalog on every
request, and each product scanned every offer. One pass cost products × offers
(24,547 × 48,419, about 1.2 billion comparisons) and 10.5-16.5 s of CPU. Nothing
was cached, so each crawler hit paid the full cost again.

## Impact

- ofertasuper.com and the public API were unavailable from 15/10 to 14/11
  (30 days). The two other projects on the same Vercel team were paused too.
- The daily data refresh kept running in GitHub Actions and committing
  snapshots; none were deployed during the pause.
- No data was lost.

## Timeline

| Date | Event |
|---|---|
| 27/09 | Public pages switch from the database to the committed snapshot (`9678fbb`, `ff00040`). The per-product offer scan ships with them. |
| 05/10 → 27/10 | The snapshot grows from 21.4 MB to 39.5 MB; products × offers grows from 6.4·10⁸ to 1.2·10⁹. The cost per pass grows with it. |
| 15/10 02:45 | Vercel pauses the team for `fluidCpuDuration`. |
| 28/10 | Diagnosis (below). Fix #581 merged: per-EAN index, build-time sitemap, CDN caching, robots rules for AI crawlers. |
| 28/10 | Follow-up #582 merged: open image optimizer closed, CDN caching for the public API, faceted filters and internal search kept out of the crawl. |
| 14/11 02:45 | Scheduled end of the pause. The first deploy includes both fixes. |

## How it was diagnosed

Vercel's per-route usage, observability queries and runtime logs older than an
hour are not available on Hobby, so there was no measurement of which route
used the CPU. The diagnosis came from the code and a local replica instead:

1. The build log of the last deployment showed which routes render on demand
   (`ƒ`): `/sitemap.xml` (`force-dynamic`), `/ofertas`, `/categoria/[slug]` and
   `/buscar`, which read `searchParams`, so their `revalidate` had no effect.
2. Reading the read path (`src/lib/catalog-snapshot.ts`,
   `src/lib/public-pages.ts`) showed `snapshot.offers.filter(o => o.ean === product.ean)`
   once per product, list pages computing every product before cutting to 24,
   and `resolveSnapshotCatalogPage` loading its data twice.
3. A local replica on the real snapshot measured 10.5-16.5 s of CPU per full
   pass, and 26-32 ms for the same pass with an index by EAN.
4. 14,400 s of monthly CPU ÷ 10.5-16 s ≈ 900-1,400 passes, about 30-45 a day.
   A single crawler reading the sitemap and the category pages reaches that.

Which share came from crawlers, product pages or the other two projects cannot
be measured on Hobby; the code path above is the confirmed cost, and the
timeline (code on 27/09, snapshot +56 % in ten days, pause on 15/10) fits it.

## Resolution

#581 (read path):

- Per-EAN index built once per snapshot and process: offers by EAN, product by
  GTIN, priced-offer counts and normalized search fields. Each product is
  ranked once instead of on every comparison.
- List pages cut to the requested page before building offers, unless a price
  filter, offers-only or a sort needs every summary. Page data loads once.
- `/sitemap.xml` is generated at build time; the snapshot ships with the deploy.
- `Vercel-CDN-Cache-Control: s-maxage=3600, stale-while-revalidate=86400` on
  catalog pages, so each URL renders at most about once an hour.
- robots.txt disallows bulk AI crawlers; Googlebot and `*` unchanged.

#582 (remaining quota leaks):

- `images.unoptimized: true`: `/_next/image` answered for any https host and
  could spend the image-transformation quota; it now returns 404.
- The same CDN header on successful public API GET responses only. A 429 or 503
  is never cached, so the CDN cannot replay a rate-limit or outage answer.
- robots.txt keeps filter variants and `/buscar` out of the crawl; those pages
  already declare their unfiltered URL as canonical.

Measured on the real 27/10 snapshot, local Node 24 (CPU ms per request):

| Path | Before | After |
|---|---|---|
| `/sitemap.xml` | 10,500-16,500 | 0 (static) |
| `/ofertas` | 2 × 10,500-16,500 | 128 |
| `/categoria/*` | up to 2 × 10,500-16,500 | 18-35 |
| `/buscar?q=a` (broadest query) | ~10,400 | 173 |
| 500 product lookups | 4,375 | 8 |

A cold instance now spends about 0.45 s of CPU before its first answer (JSON
parse ~260 ms, index ~120 ms, first ranking ~100 ms).

### How the fix was proven safe

- Tests pin the indexed path to a copy of the previous full-scan algorithm
  (`tests/helpers/naive-snapshot-oracle.ts`): same products, offers, ordering,
  totals and sitemap URLs on a fixture with duplicate EANs, padded GTIN twins,
  orphan offers and name ties.
- A read-counting `Proxy` over the offers proves a full set of hot-path calls
  reads each offer at most once (the old code read 44.8 million offers on the
  same calls).
- A differential run of the old and new code on the real snapshot compared 25
  cases (sitemap, `/ofertas`, four categories with two filter sets, five
  queries, API search, 500 lookups): all 25 outputs were identical.

## Decisions

| Option | Decision | Why |
|---|---|---|
| Upgrade to Vercel Pro | No | The cost was algorithmic; paying would have hidden it. |
| Migrate to Cloudflare Workers | No | Free Workers allow 10 ms of CPU per request and 128 MB of memory; the 39 MB snapshot alone takes ~160 ms to parse. The data layer would need a rewrite either way. |
| ISR for `/producto/[ean]` | No | A daily crawl of ~24.5k products is ~735k ISR writes a month against Hobby's 200k. The CDN cache has no write quota. |
| Shard the snapshot / trigram search index | Not now | Cold start is ~0.45 s; 1,000 cold starts a month is ~3 % of the quota. A trigram index would add CPU to every cold start and cannot serve one- or two-letter queries, the only slow ones. Revisit with real usage data. |
| CDN headers for the API in `next.config` | No, set in handlers | Config headers apply to every status, so a 429 or 503 would be cached for an hour. |

## What went well

- The fix kept the app on Hobby at USD 0 with no change to its output.
- Equivalence tests were written before the algorithm changed, so the change
  could be proven rather than argued.

## What went poorly

- A hot path that grew with products × offers shipped without a cost test, and
  the snapshot grew 56 % in ten days without anyone measuring request cost.
- No usage alert existed; Hobby does not expose per-route usage, so the cause
  had to be reconstructed from code after the pause.

## Action items

- [ ] After 14/11: check `x-vercel-cache` reaches `HIT` on `/ofertas`,
      `/producto/<ean>` and `/api/categories`; check `/_next/image` returns 404
      and robots.txt is the new one.
- [ ] A few days after 14/11: read the Active CPU percentage in the Vercel
      dashboard's Usage tab and decide on the deferred items above with data.
- [ ] Optional: a Vercel firewall rule for bots that ignore robots.txt or add
      random query strings to skip the cache.
- [x] Cost guard in the test suite: `tests/catalog-snapshot-index.test.ts`
      fails if a hot path reads offers more than once.
