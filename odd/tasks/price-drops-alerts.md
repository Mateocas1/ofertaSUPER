# Feature: price drops — data-agnostic snapshot tests, /bajas page, Atom feed, Telegram digest

Source: `odd/briefs/os-548-drops.md` (ofertaSUPER#548 slice 2). Branch `feat/548-price-drops`.

## Problem

The daily refresh runs in GitHub Actions (`.github/workflows/daily-refresh.yml`), publishes
`data/catalog-snapshot.json` to master as a bot commit without running the test suite, and several
tests pin real values from that snapshot (EANs, counts, prices, dates). Any cloud refresh can turn
master red. On top of that, price drops are only detectable by eye: there is no public surface that
tells a visitor (or a subscriber) that a price fell.

## Decisions already made (from the brief, not re-opened)

- No per-user storage: no subscriptions table, no accounts. Delivery is a public page, an Atom feed
  and a public Telegram channel post.
- Reuse `src/lib/promotions/alerts.ts` (`comparePriceAgainstHistory`) and `detect.ts` where they fit.
- Drops are computed at export time from the committed snapshot history and written as
  `data/price-drops.json` (schema-versioned, top 100, same commit as the snapshot).
- The Telegram poster is disabled until the owner creates the bot: unset config logs
  `skipped: not configured` and exits 0. No new secrets are required now.
- Test seam for the read path: `setSnapshotOverrideForTests` injects a committed fixture snapshot so
  behavior tests never depend on real catalog data; a schema-only test still proves the committed
  snapshot loads.

## Non-goals

- No email, no per-user alerts, no database writes.
- No change to the refresh pipeline (`scripts/refresh-catalog.ts`) or `scripts/cron-refresh.sh`
  beyond what the brief asks; the common brief requires that path to keep working untouched.
- No new runtime dependency (the feed is built by hand; no XML library).

## Plan

- [x] T1 — Snapshot tests derive from data (or a fixture), never from real values.
  - Add `setSnapshotOverrideForTests` seam + exported `parseCatalogSnapshot` validator in
    `src/lib/catalog-snapshot.ts` (production still serves the committed JSON only).
  - Add a committed, deterministic fixture built in `tests/helpers/snapshot-fixture.ts` (30 products,
    55 offers, valid EAN-13 check digits, three-point history).
  - Rewrite the real-value tests to use the fixture; keep one schema-only test over the committed
    snapshot (structure + referential integrity, no pinned values).
  - Acceptance: `npm test` green; regenerating the real snapshot cannot change any expectation in
    those files; the schema-only test still fails if the committed snapshot is malformed.
- [x] T2 — Drop detection and `data/price-drops.json`.
  - `src/lib/price-drops.ts`: pure `detectPriceDrops` from snapshot history (last different observed
    price within N days; >= 10 % and >= ARS 100; stale offers and promo-only artifacts excluded;
    deterministic order, top 100), payload schema v1, `parsePriceDrops`, `loadPriceDrops`.
  - `scripts/export-price-drops.ts` writes the committed JSON from `data/catalog-snapshot.json`.
  - Acceptance: `npm test` green; the script regenerates the file deterministically (only
    `generatedAt`/`date` move with the clock); the committed file matches the current snapshot.
- [x] T3 — `/bajas` page, `/bajas/feed.xml`, home link, sitemap.
  - Server-rendered page with an honest empty state and an unavailable state; Atom feed with stable
    per-offer+date ids and product links; `<link rel="alternate">`; home link; both routes in the
    sitemap.
  - Acceptance: XML well-formedness/idempotence tests, page view-model tests, sitemap test green.
- [x] T4 — Telegram poster + cloud wiring + RUNBOOK.
  - `scripts/post-price-drops.ts` (top 10 digest; unset config -> exit 0), `continue-on-error` steps
    in the workflow after the commit, RUNBOOK setup (@BotFather, channel admin, channel id).
  - Acceptance: poster no-op test + payload test with a fake fetch; workflow contract test green.

## Checks (all tasks)

`npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run audit:complexity`, `npx next build --webpack`.

## Evidence log

- T1 — `78bfa5e` test(snapshot): keep the read-path tests independent from the daily refresh
  (`437763b` chore(odd): track the price-drops feature tasks). Evidence: `npm test` 549 pass / 91 suites; `npx tsc --noEmit` clean.
- T2 — `8e93a87` feat(price-drops): detect the day's drops from the snapshot history. Evidence: `tests/price-drops.test.ts` 24 pass; committed payload holds 24 drops from the current snapshot.
- T3 — `5c2372f` feat(bajas): publish the price drops as a page and an Atom feed. Evidence: `tests/price-drops-feed.test.ts` + `tests/price-drops-page.test.ts`; `next build` registers `/bajas` (static, 6h) and `/bajas/feed.xml` and the prerendered page shows the 24 committed drops.
- T4 — `56ac6ea` feat(ci): export the price drops and post them to the Telegram channel. Evidence: `tests/price-drops-poster.test.ts` + the extended `tests/cloud-refresh-workflow.test.ts`; `python3 -c yaml.safe_load` reads the 14-step workflow.
- Checks — `npx tsc --noEmit` clean; `npm test` 602 pass / 101 suites; `npm run lint` 0 errors / 0 warnings; `npm run audit:complexity` PASS (0 over threshold); `npx next build --webpack` exit 0 (pre-existing Prisma DATABASE_URL noise only).
- Refactor — the lint pass forced smaller functions in `src/lib/price-drops.ts`, `scripts/lib/price-drops-poster.ts` and `tests/helpers/xml.ts` (no behavior change), and the JSON fixture turned into the built fixture for a readable diff.
