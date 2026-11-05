# UI redesign: "boletín de precios"

## Goal

Make the public UI read like what the product is: an honest, dense price
bulletin built on real, dated observations. Every number on a public page comes
from the committed snapshot or the committed price-drops / basket payloads;
nothing illustrative, nothing decorative that competes with the numbers.

## Rationale

A design review (2026-11-05) found that the interface worked against the
product's strongest asset, real and honest data:

- ~70% of the home was illustrative data with disclaimers (including DIA, which
  the catalog does not carry), while 100 real drops with images and a real
  fixed basket sat unused.
- Content bugs eroded trust: "+46% OFF" (a discount with a plus sign), "1
  supers", a headline price that matched none of the supermarket chips shown
  under it, "0.0%" next to "59,9%", English strings, missing accents, mixed
  tú/vos.
- Generic / AI-slop patterns: triad headline with wavy underline, uppercase
  tracked eyebrows over everything, card-in-card-in-card, dashed "ticket"
  motif and paper grain everywhere, staggered entrance animations on data,
  fake sparklines whose "value" was a word.
- Typography without a system: three families, prices in a monospace face,
  arbitrary sizes (`text-[2.75rem]`, `text-[0.62rem]`…) and five tracking values.
- Density: a search result card was ~670px tall on desktop; on mobile the first
  result started at y≈740px.
- Brand split: header logo (green rings) ≠ favicon/manifest (orange receipt) ≠
  `themeColor` (green).

## Scope & constraints

In scope: every public route (`/`, `/buscar`, `/producto/[ean]`, `/ofertas`,
`/bajas`, `/canasta`, `/categoria/[slug]`, `/metodologia`, `/inflacion`), the
site shell (header, footer, icons) and shared components.

Out of scope: `/admin/**` visuals, the data pipeline, the snapshot schema.

Constraints (from `ARCHITECTURE.md` and the existing test contracts):

- Fail closed: if the snapshot is unavailable, show the unavailable state, never
  demo data.
- Never claim live prices. `tests/public-copy-claims.test.ts` bans "precio
  actual", "en vivo", "Actualizado hoy", etc. Say *registrado / relevado* and
  show the observation date.
- Vercel Hobby CPU budget: keep the read path linear; home stays ISR
  (`revalidate`), no per-request full scans.
- `images.unoptimized`: product `<Image>` keeps `unoptimized` (pinned by
  `tests/pwa-build-contract.test.ts`).
- Next 16: read `node_modules/next/dist/docs/` before using an API you are not
  sure about.

## Design system (the contract every change follows)

**Type**
- One UI family: Geist (`font-sans`). Prices and every number use
  `tabular-nums` (the `.price` utility). No monospace in public UI.
- Bricolage (`font-display`) only for the wordmark and the home H1.
- Scale: Tailwind steps only — `xs 12 / sm 14 / base 16 / lg 18 / xl 20 /
  2xl 24 / 3xl 30 / 4xl 36`, `5xl+` only for the home H1. No `text-[…]`.
- Labels are sentence case `text-xs text-muted-foreground`. Uppercase tracked
  eyebrows are not used; table headers are sentence case `text-xs font-medium`.
- Product names are retail strings with SKU codes: max `text-2xl md:text-3xl`
  on the product page, `text-sm`/`text-base` in lists.

**Color semantics**
- Prices are ink (`text-foreground`).
- Green (`text-primary`) means *the cheapest / you save / it dropped*, always
  paired with words ("Más barato", "Ahorrás", "Bajó"), never color alone.
- Orange (`deal`) is reserved for promotions and list-price discounts.
- Supermarkets are identified by name, not by colored initials.

**Space & surfaces**
- One container: `.container-page` (max-w-7xl, `px-4 sm:px-6 lg:px-8`), shared
  by header, footer and pages, so edges align.
- One surface level: `.surface` (hairline border, no heavy shadow). Inside a
  surface, separate with hairline dividers, not nested cards.
- Card padding `p-4 md:p-5`; page sections `gap-10 md:gap-14`.
- Radii: inputs/buttons `rounded-lg`, chips `rounded-full`, surfaces
  `rounded-xl`. Buttons are never `rounded-full`.
- The dashed / perforated "ticket" look is reserved for the basket receipt.
  No grain, no staggered entrance animations on data, no hover lift on cards.

**Copy**
- Rioplatense voseo everywhere (Buscá, Compará, Agregá…), full accents, no
  English (no "list price", "refresh", "hub", "delta", "link").
- Numbers via `src/lib/format.ts`: `formatCurrency`, `formatPercent` (es-AR),
  `formatDiscountPercent` ("−46%"), `formatSignedPercent`, `pluralize`.
- Methodology lives in `/metodologia`; pages link to it in one line instead of
  explaining themselves in paragraphs.

## Tasks

1. Foundations: formatters (+tests), tokens and utilities in `globals.css`,
   shell (header with basket count, footer with links, one brand mark across
   header / favicon / manifest), neutral supermarket badge, promo badge and
   struck list price.
2. Home: real data only — compact search hero, recent drops with images, the
   fixed basket priced per supermarket from the snapshot; remove illustrative
   content and update its tests to pin the new honest contract.
3. Product card + `/buscar` + `/categoria`: dense card, cheapest supermarket
   named, other prices sorted; compact search header, filters that apply on
   change; search relevance for generic queries.
4. Product page: image, sane H1, no "No calculable" hero, comparison table
   copy, price chart as steps on a time axis, consistent "precio anterior".
5. `/ofertas`, `/bajas`, `/canasta`, `/metodologia`, `/inflacion`: same system,
   copy sweep, no empty admin panels, drops with images and category filter.
6. Integration: lint, typecheck, tests, build, browser screenshots desktop /
   mobile / dark, independent review.

## Evidence

_Filled in at integration: commands run, results, screenshots._

## Progress

- [ ] 1 Foundations
- [ ] 2 Home
- [ ] 3 Product card + search
- [ ] 4 Product page
- [ ] 5 Secondary pages
- [ ] 6 Integration

## Next steps

_Filled in at integration._
