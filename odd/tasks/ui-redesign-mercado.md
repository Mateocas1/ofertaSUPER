# UI redesign — "Mercado" visual identity

Branch: `feat/ui-redesign` · Route: delegated writer (Sonnet, medium) · Delivery: `ask-on-risk`

## Objective
Visual redesign only. Product is finished; no behavior, data, API, copy or routing changes.
Make it beautiful and "rich" while staying fast and legible for dense price data.

## Design direction (decided by orchestrator)
**Concept: "Mercado" — a price tag / receipt meets a modern editorial grocery flyer (Argentine super context).**
Rejected: glassmorphism (hurts legibility on dense tables, GPU cost on low-end phones, no domain meaning); pure minimalism (product is data-rich, needs character).

First principles applied:
- Users scan and compare numbers → **prices are the hero**: tabular-nums, large, mono/receipt style, best price always the loudest thing on screen.
- Hierarchy through **size + weight + tone layering**, not borders everywhere (today: border+shadow on every box). Fewer borders, more surface tone steps.
- One brand color (market green, keep hue ~148) + one **deal accent** (warm tomato/amber, ~oklch(0.65 0.19 35)) used ONLY for offers/savings. Semantic colors stay semantic.
- Warm paper neutrals (background ~oklch(0.975 0.012 95)), ink foreground with slight green-blue tint. Never pure white/black.
- Motifs: dashed "tear-off" dividers, perforated/notched edges on the basket/ranking card (CSS mask/radial-gradient), price-tag chips, subtle paper grain via inline SVG noise at ≤4% opacity (no image files).
- Typography: keep `next/font` local/Google usage minimal — pair a characterful display face for h1/h2 (e.g. Bricolage Grotesque or Fraunces via `next/font/google`, pick ONE) with Geist for UI and Geist Mono for prices. Tight tracking on display, `text-wrap: balance`.
- Spacing on a 4/8 scale, radius scale consistent (tokens, not ad-hoc `rounded-[0.9rem]`), one elevation system (3 levels) as CSS variables.
- **Dark mode**: currently the default shadcn gray one (primary is white, sidebar blue). Replace with a proper warm dark ("night market": oklch ~0.17 bg, green primary lifted for contrast). Verify WCAG AA on text and price colors in both themes.

## Motion (Emil Kowalski principles — no skill installed, apply manually)
- UI animations 150–300ms; custom ease-out `cubic-bezier(0.23, 1, 0.32, 1)` as `--ease-out` token; never `ease-in`, never `transition: all`.
- Only animate `transform` and `opacity`. Never from `scale(0)` (start ≥0.95). Buttons `:active { scale(0.97) }`.
- Stagger list/table row entrances 30–50ms, capped (max ~8 items). Hover effects gated behind `@media (hover:hover)`.
- Numbers: tabular-nums; ranking best row may "settle" in on load. Basket total may tick via CSS only unless a tiny client component is clearly worth it.
- Respect `prefers-reduced-motion` (existing global rule stays). CSS-first, **no new animation dependency** (tw-animate-css already present). Add `motion` only if a single interaction is impossible in CSS, and justify in the commit.
- 21st.dev: NOT used by default (token cost, style drift). Allowed only as reference for one component if the writer gets stuck.

## Constraints
- Do not change text copy (Spanish stays), data logic, routes, props contracts, a11y semantics (landmarks, labels, aria-current, skip-link). Keep focus rings visible.
- Respect AGENTS.md: this Next.js (16.3) differs from training data; read `node_modules/next/dist/docs/` before touching layout/font/metadata code.
- Mobile-first; verify 375px and 1440px. No horizontal scroll. Touch targets ≥44px.
- Performance: no new heavy images; fonts via next/font with `display: swap`; LCP element must not depend on JS.
- Planning heuristic ~400 authored changed lines per task (advisory only, never cut tests/comments to fit).
- Commits: conventional (`style(ui): ...`/`feat(ui): ...`), NO Co-Authored-By or AI attribution. Stage only files you changed (working tree has unrelated untracked/modified files: `.gitignore`, `README.md`, `docs/`, `odd/`, `scripts/orchestration/`, `.playwright-cli/`).
- Tests: existing `npm test` (tsx node tests), `npm run typecheck`, `npm run lint`. Presentational change → no new RED test expected (exception: passive visual work); run all three at each task close. Docker/Prisma recipe for tests: search Engram (`mem_search "CMVP04 container test/typecheck runner"`) if the local runner fails.
- Verify visually with Playwright CLI (installed: `.playwright-cli/`) screenshots at 375 and 1440, light and dark. Keep screenshots out of git.

## Tasks
- [x] R1 [f8f62bd] Foundations: tokens in `src/app/globals.css` (palette light+dark, radius, elevation, ease, grain, `.surface*` utilities), fonts in `src/app/layout.tsx`, body/background. Commit.
- [x] R2 [20701b2] Shell + Home: `site-header.tsx`, `page.tsx` (hero, SmartBasketPanel ranking with ticket motif and deal accent, product rows, market pulse), entrance motion. Commit.
- [x] R3 [76a4d99] Catalog components: `product-card`, `search-bar`, `price-comparison`, `supermarket-badge`, `promotion-badge`, `favorite-button`, `basket-controls`, `stale-results-notice`, `catalog-provenance-notice`, `ui/button-variants`. Commit.
- [x] R4 [845938b] Pages: `buscar`, `ofertas`, `categoria/[slug]`, `producto/[ean]` (price chart colors from tokens), `canasta`/`canasta-page`, `metodologia`, `~offline`. Skip `admin/*` except inheriting tokens. Commit.
- [x] R5 [24a6e0e] QA pass: contrast AA both themes, keyboard focus, reduced motion, 375/1440 screenshots, full test/typecheck/lint/build. Fix and commit; report summary with before/after evidence.

## Acceptance
All checks green; no copy/behavior diffs; both themes coherent; best price and savings are the visually dominant element in every list; motion tasteful and disable-able.

## Progress / evidence
Route: delegated writer (writer trigger, 2+ non-trivial files) for all tasks.
Commits: R1 f8f62bd, R2 20701b2, R3 76a4d99, R4 845938b, R5 24a6e0e.
Checks at each task close: typecheck OK, lint 0 errors (190 pre-existing warnings), npm test 751/751 pass. R5: `npm run build` OK.
Contrast (computed WCAG, both themes): all text/price/deal/warning pairs >= 4.5:1 (min 4.98 light, 6.10 dark).
Visual: Playwright screenshots (light/dark, 375/1440) in /tmp/os-ui-shots (outside git), using a throwaway Postgres container with seeded data (removed).
Notes: dark theme is prefers-color-scheme + .dark class (no toggle existed). Fonts: Bricolage Grotesque (display), Geist, Geist Mono via next/font/google. Chart series colors remain data-driven (serie.color).

## Next step
Review branch; no push/PR done.
