# 02: Fix `Lighthouse CI` failure and README price chart test

`Lighthouse CI` (`.github/workflows/lighthouse-ci.yml`) has failed on `master` across 4 consecutive runs on 2026-11-11 (`43107344320`, `43117075669`, `43117429616`, `43117559293`). Subsequent cloud catalog commits pushed by `github-actions[bot]` between 2026-11-12 and 2026-11-15 did not trigger `Lighthouse CI` because GitHub Actions suppresses `on: push` events for commits created with `GITHUB_TOKEN`, leaving `master` red and hiding any regressions from PR `#584` before the Lighthouse audit step even runs.

## Failure symptom

The `Run tests` step (`npm test`) fails in `tests/price-chart.test.ts:240` (`chart generator CLI > renders the committed real snapshot to a PNG`):

```text
AssertionError: The input did not match the regular expression /12 series · \d+ días \(/
```

Actual stdout produced by `scripts/chart-price-evolution.ts`:

```text
chart-price-evolution: 9 series · 20 días (2026-09-20 → 2026-11-11) -> ...
```

## Root cause

`analytics/seeds/basket_weights.csv` defines 12 fixed GTIN-14 items. Verified against `data/catalog-snapshot.json` (2026-11-15), 3 of those 12 GTINs have `0` products and `0` offers in the snapshot (last seen on 2026-11-01 in commit `eeb20fb`, dropped before 2026-11-11):

- `00763571680872` (Yerba mate 250 g, weight `0.07`)
- `00744430256209` (Yogur bebible 250 g, weight `0.07`)
- `00000077987839` (Alfajor de arroz, weight `0.06`)

The remaining 9 GTINs have active offers and 2 to 23 real observation points in the 2026-11-15 snapshot.

In `scripts/lib/price-chart.ts:163-187`, `selectBasketSeries` omits any basket product with zero real observations, placing its label in `missingProducts` so the chart never invents placeholder prices. `scripts/chart-price-evolution.ts:131` logs `series.products.length`, which is `9`.

`tests/price-chart.test.ts:240` hardcodes `/12 series · \d+ días \(/`, assuming all 12 GTINs in `basket_weights.csv` will stay present in every daily snapshot indefinitely.

## Investigation and decision point

Before editing code, verify why the 3 GTINs disappeared between 2026-11-01 (`eeb20fb`) and 2026-11-11: check whether they were discontinued across all 5 stores, re-barcoded, or dropped by freshness/GTIN normalization. In `data/catalog-snapshot.json` on 2026-11-15, the catalog still carries 245 yerba matches, 321 yogur matches, and 21 alfajor de arroz matches (for example `00000077987853`), so the product categories exist under other GTINs.

Pick one of the two options below.

### Option A: Decouple the test from a fixed count of 12 active GTINs (recommended)

Keep `analytics/seeds/basket_weights.csv` unchanged as the fixed Laspeyres basket and update `tests/price-chart.test.ts:240` so the real-snapshot CLI test checks against the actual series count derived from the snapshot (`series.products.length`) and stops hardcoding `12`.

Why Option A is the right default:

- A live supermarket catalog changes over time; a test reading `data/catalog-snapshot.json` should fail only if no series exist (`series.products.length === 0`) or if CLI output disagrees with `committedSeries()`, not when a store delists one SKU.
- Keeping `basket_weights.csv` untouched preserves continuity with historical Parquet partitions (`analytics-data`), dbt seeds and tests, `analytics/tests/fixtures/basket-index.sample.json`, and `/inflacion` basket metadata.
- If a 12-series SVG/PNG rendering test is still desired, add a deterministic unit test using a synthetic 12-item `BasketWeight[]` fixture in `tests/price-chart.test.ts` so the test does not depend on the live snapshot.

### Option B: Replace the 3 missing GTINs in `analytics/seeds/basket_weights.csv`

Swap `00763571680872`, `00744430256209`, and `00000077987839` for active GTIN-14s in `data/catalog-snapshot.json` (Yerba mate, Yogur bebible, Alfajor de arroz).

Consequences to account for if choosing Option B:

- Breaks historical continuity for those 3 products across existing Parquet partitions in `analytics-data` (and `2026-10-03` to `2026-11-15` series).
- Requires checking and potentially updating `analytics/sample/part.parquet`, `analytics/tests/fixtures/basket-index.sample.json`, dbt tests (`analytics/tests/assert_basket_base_is_100.sql`, `analytics/tests/assert_basket_weights_sum_to_one.sql`), `data/analytics/basket-index.json` (via `publish_basket_index.py`), and any tests referencing the old GTINs or labels.
- Does not protect `tests/price-chart.test.ts:240` from failing again the next time another basket GTIN goes out of stock or is delisted.

## Implementation steps (Option A)

### 1. Inspect the 3 missing GTINs in git history and snapshot

Confirm when the 3 GTINs last appeared and verify none are missing due to a bug in `selectBasketSeries`:

```bash
git show eeb20fb:data/catalog-snapshot.json | grep -E '00763571680872|00744430256209|00000077987839' | head
grep -E '00763571680872|00744430256209|00000077987839' data/catalog-snapshot.json || echo "not in current snapshot"
```

### 2. Update `tests/price-chart.test.ts`

In `tests/price-chart.test.ts` around lines 235-245 (`renders the committed real snapshot to a PNG`):

1. Read `const series = committedSeries();` before asserting stdout.
2. Assert `assert.ok(series.products.length > 0, "expected at least one basket series in the snapshot");` and `assert.ok(series.products.length <= 12);`.
3. Replace line 240:
   ```ts
   assert.match(result.stdout, /12 series · \d+ días \(/);
   ```
   with an assertion against the real count from `series`:
   ```ts
   assert.match(result.stdout, new RegExp(`${series.products.length} series · ${series.dayCount} días \\(`));
   ```
4. Keep lines 241-245 (`Rango ...`, PNG magic bytes) intact.
5. Add a separate unit test in `describe("chart rendering", ...)` using a synthetic 12-item `BasketWeight[]` input to confirm `renderPriceChartSvg` renders all 12 palette series cleanly without depending on `data/catalog-snapshot.json`.

### 3. Check `README.md` chart block consistency

Run the chart generator locally to inspect what it produces on the current `2026-11-15` snapshot:

```bash
npx tsx scripts/chart-price-evolution.ts --out /tmp/price-evolution.check.png --no-readme
```

Note: `tests/price-chart.test.ts:265-287` (`README uses the real chart`) checks that `README.md` has valid markers, matches `Fuente: snapshot real`, and has consistent day-count warning logic; it does not require the README range end date to match today's snapshot date. Refreshing `analytics/assets/price-evolution.png` and the `README.md` block happens automatically every Monday via `.github/workflows/daily-refresh.yml`, or you can run `npx tsx scripts/chart-price-evolution.ts` explicitly if you want the chart updated in the same PR.

### 4. Run the full `Lighthouse CI` pipeline locally

`tests/price-chart.test.ts` failing aborted `Lighthouse CI` before `typecheck`, `lint`, `build`, and the Lighthouse audit ran. Once the test passes, execute every step from `.github/workflows/lighthouse-ci.yml` locally so any regression from PR `#584` (or earlier commits) surfaces before opening the PR:

```bash
npm test
npm run typecheck
npm run lint
npm run audit:complexity
CATALOG_OFFLINE_MODE=true npm run build
```

Then start the production server and verify all 4 audited URLs from `.github/workflows/lighthouse-ci.yml:84-99`:

```bash
CATALOG_OFFLINE_MODE=true npm run start -- --hostname 127.0.0.1 --port 3000 &
SERVER_PID=$!
# Wait until http://127.0.0.1:3000 responds, then warm routes:
for url in \
  http://127.0.0.1:3000/ \
  http://127.0.0.1:3000/ofertas \
  'http://127.0.0.1:3000/buscar?q=yerba' \
  http://127.0.0.1:3000/canasta; do
  curl --silent --fail "$url" > /dev/null
done
npx lhci autorun --config=./lighthouserc.json \
  --collect.url=http://127.0.0.1:3000/ \
  --collect.url=http://127.0.0.1:3000/ofertas \
  --collect.url='http://127.0.0.1:3000/buscar?q=yerba' \
  --collect.url=http://127.0.0.1:3000/canasta
kill "$SERVER_PID"
```

Pay close attention to the hard-fail assertions in `lighthouserc.json`:

- `categories:accessibility >= 0.9` (error on all 4 routes)
- `categories:seo >= 0.9` (error on `/` and `/canasta`)
- `categories:performance >= 0.9` (warn)
- `categories:best-practices >= 0.9` (warn)

If `lhci` fails accessibility or SEO on any route locally, fix that regression in a separate PR or address it explicitly before expecting `Lighthouse CI` to turn green.

## Verification

1. `npm test` passes (all 778+ tests, including `tests/price-chart.test.ts`).
2. `npm run typecheck`, `npm run lint`, and `npm run audit:complexity` pass.
3. `CATALOG_OFFLINE_MODE=true npm run build` succeeds and local `lhci` passes all error-level assertions in `lighthouserc.json`.
4. After opening the PR and merging to `master`, verify the `Lighthouse CI` GitHub Actions workflow turns green on `master` (if the merge commit itself runs on `master`, confirm the `lighthouse` and `complexity` jobs both pass).

## Acceptance criteria

- `tests/price-chart.test.ts` no longer hardcodes `12 series` against `data/catalog-snapshot.json` while still verifying real series count consistency, valid PNG output, and 12-series rendering via a synthetic unit test.
- `npm test`, `npm run typecheck`, `npm run lint`, `npm run audit:complexity`, and `CATALOG_OFFLINE_MODE=true npm run build` pass locally.
- The `Lighthouse CI` workflow passes on the PR and on `master`.
