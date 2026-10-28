# Architecture — ofertasSUPER

How a supermarket product becomes a page. The whole read path is a committed JSON
snapshot; the database never serves traffic.

## Flow

```
VTEX public catalog API (Carrefour, Disco, Jumbo)
        │  browser-like REST reads + persisted-query hash
        ▼
src/lib/vtex/client.ts · src/lib/ingestion/adapters/* · scripts/pipeline/cmvp-catalog-batch.ts
        │  normalize + capture Carrefour simple promos
        ▼
staging rows (staging_products)                 scripts/pipeline/stage.ts
        │  quality gates (valid GTIN, sane price, …)
        ▼
replace reconcile — one transaction, pg_advisory_xact_lock(2026051901)
scripts/pipeline/reconcile.ts
        │  writes products / supermarket_products / price_history / promotions
        │  observation instant = acquisition time, never pipeline time
        ▼
freshness gate (freshness_sla_hours per supermarket, default 12 h)
        │  EAN top-up re-reads offers the run did not observe
        ▼
snapshot export                                   scripts/pipeline/cmvp-catalog-snapshot.ts
        ▼
data/catalog-snapshot.json (committed, schemaVersion 2)
        │
        ├─► price drops export                    scripts/export-price-drops.ts
        │        │  current price vs last different observation (>=10% and >=ARS 100);
        │        │  unit-price evidence or >60% -> suspect, recorded but never published
        │        ▼
        │   data/price-drops.json (committed, schemaVersion 2)
        │        ▼
        │   /bajas · /bajas/feed.xml (Atom) · Telegram digest   src/lib/price-drops*.ts
        │
        ▼
Next.js app + public API (read-only)   src/lib/catalog-snapshot.ts · src/lib/public-api.ts · src/app/**
```

## Identity: GTIN-14

Product identity is the GTIN: `src/lib/identity/gtin.ts`. `normalizeGtin` accepts
EAN-8, UPC-12, EAN-13 and GTIN-14, validates the mod-10 check digit, and returns
the zero-left-padded **GTIN-14** as the single canonical key. Zero-padding never
changes the check digit, so every published form of the same item (a 13-digit
EAN from an old link, a 12-digit UPC) collapses to one product. New snapshot
keys are GTIN-14; lookups normalize the requested form before matching, and the
product page and sitemap always declare the GTIN-14 URL as canonical.

## Data model

`prisma/schema.prisma` holds the live catalog (12 models):

- `Supermarket` — source identity, `freshness_sla_hours`, active flag.
- `Product` — keyed by the canonical `ean`.
- `SupermarketProduct` — one offer per product + supermarket (price, list price,
  promo, availability, `last_checked_at`).
- `PriceHistory` — the observation series behind the price chart.
- `Promotion` / `PromotionProduct` — promotions and their product links.
- `Category` — navigation taxonomy.
- `IngestionRun`, `StagingProduct`, `SourceHealth`, `DirectRefreshRunLedger` —
  pipeline bookkeeping and observability.

## Key modules

| Path | Responsibility |
| --- | --- |
| `src/lib/identity/gtin.ts` | GTIN validation + canonical GTIN-14; lookup forms |
| `src/lib/vtex/client.ts` | VTEX REST client (query, persisted-query hash) |
| `src/lib/vtex/normalize.ts` | Raw VTEX payload → normalized product/offer |
| `src/lib/ingestion/adapters/*` | Per-supermarket acquisition adapters |
| `src/lib/ingestion/quality-gates.ts` | Block/warn staging candidate gates |
| `src/lib/promotions/capture.ts` | Simple promo capture by EAN (Carrefour) |
| `scripts/refresh-catalog.ts` | The single daily refresh command |
| `scripts/pipeline/cmvp-catalog-batch.ts` | Batch acquisition + reconcile orchestrator |
| `scripts/pipeline/stage.ts` | Write normalized products into staging |
| `scripts/pipeline/validate.ts` | Evaluate staging candidates |
| `scripts/pipeline/reconcile.ts` | Transactional reconcile under the advisory lock |
| `scripts/pipeline/topup.ts` | EAN re-read of unobserved offers |
| `scripts/pipeline/cmvp-catalog-snapshot.ts` | Export the committed snapshot |
| `data/catalog-snapshot.json` | The served catalog (products, offers, history) |
| `src/lib/price-drops.ts` | Drop rules + the committed `data/price-drops.json` read API |
| `src/lib/price-drops-feed.ts` | Atom feed over the price-drops payload |
| `scripts/export-price-drops.ts` | Export the day's drops from the snapshot |
| `scripts/post-price-drops.ts` | Optional Telegram channel digest (no-op unconfigured) |
| `src/app/bajas/**` | `/bajas` page and `/bajas/feed.xml` |
| `src/lib/catalog-snapshot.ts` | Read API over the snapshot (search, lookup, freshness) |
| `src/lib/public-pages.ts` | Page loaders over the snapshot |
| `src/lib/public-api.ts` | `/api/*` handlers |
| `src/lib/seo/metadata.ts` | Titles, canonical URLs, OpenGraph |
| `src/lib/seo/schema.ts` | JSON-LD product/offer schema |
| `src/app/**` | Next.js routes: `/producto/[ean]`, `/categoria`, `/buscar`, `/ofertas`, `/canasta`, `/api/*` |

## Read path guarantees

- The snapshot is the only data source for public pages and APIs. If it is
  missing or corrupt, the site fails closed (`Catalog temporarily unavailable`),
  never with demo data.
- Prices older than the supermarket SLA are not presented as current.
- Availability is an observation of the source at `observedAt`, not a promise.

## Request cost (Vercel Hobby)

The site runs on Vercel Hobby, which allows 4 hours of Active CPU a month; going
over pauses the project for 30 days. The read path is therefore kept linear:

- `src/lib/catalog-snapshot.ts` builds a per-EAN index (offers by EAN, product by
  GTIN, search fields) once per snapshot and process. No request scans every
  offer once per product; `tests/catalog-snapshot-index.test.ts` pins the output
  to the previous full scan and counts offer reads.
- List pages cut to the requested page before building offers, unless a price
  filter, offers-only or a sort needs every summary.
- `/sitemap.xml` is generated at build time (the snapshot ships with the deploy).
- `Vercel-CDN-Cache-Control: s-maxage=3600, stale-while-revalidate=86400`
  (`src/lib/http-cache.ts`) is sent by `next.config.ts` for `/ofertas`,
  `/buscar`, `/categoria/:slug` and `/producto/:ean`, and by the public API
  handlers on successful GET responses only (never on 4xx, 429 or 503), so each
  URL renders at most about once an hour.
- The image optimizer is off (`images.unoptimized`): `/_next/image` answers 404
  and cannot be used to transform arbitrary remote images.
- `src/app/robots.ts` keeps faceted filters (`super`, `sort`, `maxPrice`,
  `offers`, `wallet`, `type`) and internal search (`/buscar`) out of every
  crawler, and disallows bulk AI crawlers. `/buscar` is not in the sitemap.
- Not used on purpose: ISR for `/producto/[ean]`. A daily crawl of ~24.5k
  products would exceed Hobby's ISR write quota; the CDN cache has no write
  quota.

## Operations

The daily refresh, cron, Postgres backup/restore and the encrypted R2 path are
documented in [docs/RUNBOOK.md](docs/RUNBOOK.md). The retired governance design
lives in the git tag `archive/full-governance` (`664674d`).
