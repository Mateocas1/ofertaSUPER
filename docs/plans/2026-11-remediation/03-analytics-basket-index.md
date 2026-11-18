# Plan 03: Analytics basket index and multi-day series

## Problem statement

The GitHub Release `analytics-data` already stores 40 daily Parquet files (`price-series-2026-10-03.parquet` through `price-series-2026-11-15.parquet`), yet `data/analytics/basket-index.json` on `master` and `/inflacion` in production on `2026-11-18` report a 1-day series:

```json
"seriesStart": "2026-11-15",
"seriesEnd": "2026-11-15",
"days": 1,
"basketProductsCovered": 0
```

Recent daily commits (`da357e2`, `dd62a62`, `48d6114`, `fbea69e`, `2d29685`) each overwrote `data/analytics/basket-index.json` with `days: 1` for that single UTC date.

Three issues cause this state and prevent `/inflacion` from computing a multi-month index:

1. `scripts/export-analytics.sh` exports and uploads today's partition, then immediately runs dbt over `analytics/data/*/part.parquet` without downloading earlier partitions from the `analytics-data` release. On a fresh GitHub Actions runner, `analytics/data` contains only today's directory.
2. `analytics/seeds/indec_cpi.csv` stops at `2026-08-01` (18 rows from `2025-03-01`). Once the 40 historical partitions are downloaded (`2026-10-03` through `2026-11-15`), `mart_basket_index_monthly` covers October and November 2026, which clears `minimumBasketMonths: 2` (`analytics/scripts/publish_basket_index.py:45`) and shifts the gate from `insufficient_series` to `insufficient_cpi_overlap` unless October 2026 CPI is present.
3. `analytics/scripts/publish_basket_index.py:304-307` zeroes out `basketProductsCovered`, `avgWeightCovered`, and `maxWeightCovered` whenever `status` is `"insufficient"`, hiding real catalog coverage. In addition, 3 of the 12 fixed basket GTINs are absent from the `2026-11-15` snapshot (cross-reference `02-lighthouse-ci-and-price-chart.md`).

## Constraints to preserve

- `tests/export-analytics.test.ts:12-45` enforces the ordered stages and non-fatal error handling of `scripts/export-analytics.sh`. Update that test alongside the script.
- `tests/analytics-data.test.ts` covers `scripts/analytics-data.sh` (`download`, `upload-dir`, `prune`). Do not break its CLI interface or failure exit codes.
- `tests/inflacion-page.test.ts` asserts that production `data/analytics/basket-index.json` matches schema v2 and remains honest: while `status === "insufficient"`, `baseDate` must be `null` and `basketDaily`, `basketMonthly`, `topRisers`, `topFallers`, and `comparison.overlapMonths` must be empty.
- `.github/workflows/analytics.yml` runs `uv run dbt build --profiles-dir .`, verifies `analytics/tests/fixtures/basket-index.sample.json` with `--check`, and runs `publish_basket_index.py --verify-production`. All three must pass.
- Never invent or interpolate INDEC CPI rows. Only commit months returned by the official INDEC API (`https://apis.datos.gob.ar/series/api/series/?ids=145.3_INGNACNAL_DICI_M_15`).

## Step-by-step implementation

### 1. Download existing Parquet partitions before running dbt

Inspect `scripts/export-analytics.sh:74-84` and `scripts/analytics-data.sh:102-158`:

- `scripts/analytics-data.sh` already implements `cmd_download` (lines 102-133), which lists every `price-series-YYYY-MM-DD.parquet` asset on `analytics-data` and writes `date=<date>/part.parquet` into the target directory.
- In `scripts/export-analytics.sh`, `main()` currently executes `export`, `upload`, `analytics`, and `commit`.

Update `scripts/export-analytics.sh`:

1. Add a `download` stage after `upload` and before `analytics`:
   ```bash
   run_stage upload scripts/analytics-data.sh upload-dir "$DATA_DIR" || true
   run_stage download scripts/analytics-data.sh download "$DATA_DIR" || true
   run_stage analytics analytics_pipeline || true
   run_stage commit commit_basket_index || true
   ```
   Order matters here. Running `download` after `upload` prevents `upload-dir` from re-uploading all 40 historical partitions on every daily run, and ensures today's partition plus all historical partitions from the release are present in `analytics/data/` before `analytics_pipeline` runs.
2. Keep `|| true` on `download` so a transient GitHub Release download failure logs `stage failed: download (the catalog refresh is not blocked)` and falls back gracefully without failing the catalog refresh job.
3. Update `tests/export-analytics.test.ts:31-45` to assert that `scripts/analytics-data.sh download "$DATA_DIR"` appears in `scripts/export-analytics.sh` between `upload` and `analytics`, and uses `|| true` like the other non-fatal stages.

Decision point on pruning and retention:

- `scripts/analytics-data.sh:17` sets `KEEP_ASSETS="${ANALYTICS_DATA_KEEP:-60}"`, and `cmd_prune` (lines 135-158) is not currently invoked anywhere.
- Do not enable `prune` with a 60-day default. A 60-day rolling window covers barely two calendar months, so deleting day 61 risks dropping part of the earliest basket month before INDEC publishes its CPI or before a month-over-month comparison runs.
- Keep `prune` uncalled for now (40 Parquet files is well below GitHub Release asset limits of 1,000 assets), or raise `ANALYTICS_DATA_KEEP` default in `scripts/analytics-data.sh:17` to at least `365` and document the retention window in `docs/RUNBOOK.md` before wiring `prune`.

### 2. Refresh `analytics/seeds/indec_cpi.csv` from the official INDEC API

Inspect `analytics/seeds/indec_cpi.csv` and `analytics/scripts/fetch_indec_cpi.py`. Currently the CSV ends at `2026-08-01` (`12276.7660`).

1. Run the official fetcher from `analytics/`:
   ```bash
   cd analytics && uv run python scripts/fetch_indec_cpi.py --months 24
   ```
   Using `--months 24` preserves the 2025 history already committed in `analytics/seeds/indec_cpi.csv` instead of truncating early 2025 rows when newer months arrive (the script default is `--months 18`).
2. Check the printed range and inspect `git diff analytics/seeds/indec_cpi.csv`. Confirm whether INDEC has published September 2026 (`2026-09-01`) and October 2026 (`2026-10-01`).
   - If October 2026 is present, `mart_basket_index_vs_cpi` will have an overlapping month with the October 2026 basket data (`2026-10-03` onward), allowing `status` to transition from `"insufficient"` to `"ready"`.
   - If INDEC has not yet published October 2026 at execution time, commit only the published months returned by the API (such as September 2026) and do not fabricate October 2026. In that case `publish_basket_index.py` will rightly emit `statusReason: "insufficient_cpi_overlap"` once 2 months of Parquet data are loaded, and `docs/RUNBOOK.md` should note that `/inflacion` unlocks as soon as INDEC publishes October 2026.
   - Note for `tests/inflacion-page.test.ts:55-61`: line 60 hardcodes `assert.equal(payload.cpi.latestMonth, "2026-08-01");`. Update that assertion in `tests/inflacion-page.test.ts` (and in the `"production payload (committed JSON)"` block if `status` becomes `"ready"`) to match the updated `indec_cpi.csv` and resulting `data/analytics/basket-index.json`.

### 3. Verify basket coverage across the 40 Parquet partitions and check dbt SQL

1. Download the release partitions locally into a temporary check directory or `analytics/data` (remembering `analytics/data` is gitignored or untracked; verify `.gitignore` before running):
   ```bash
   GH_TOKEN=$(gh auth token) scripts/analytics-data.sh download analytics/data
   ```
2. Run dbt over the real partitions:
   ```bash
   cd analytics && uv run dbt build --profiles-dir . --vars '{"price_series_glob": "data/*/part.parquet"}'
   ```
3. Inspect `mart_basket_index_daily` and `mart_basket_index_monthly` in `analytics/analytics.duckdb` using DuckDB (`uv run python -c ...`):
   - Check `min(price_date)`, `max(price_date)`, `count(*)` from `mart_basket_index_daily`.
   - Confirm how many days have `index_reason is not null` (`low_coverage` or `no_basket_price`) and check `products_covered` and `weight_covered` on every date from `2026-10-03` through `2026-11-15`.
   - On `2026-11-15`, 3 of 12 basket GTINs (`00763571680872`, `00744430256209`, `00000077987839`) are missing from `data/catalog-snapshot.json`, leaving 9 of 12 products with total weight `0.80` against `basket_min_coverage: 0.6` (`analytics/dbt_project.yml:22`). Verify that every October and November partition clears `0.6`. If any date falls below `0.6`, inspect which GTINs lacked fresh prices on that date and report it before changing thresholds.
4. Harden `analytics/models/marts/mart_basket_index_daily.sql:14,22`:
   - Currently lines 14 and 22 use `where value_reason != 'stale'`.
   - `scripts/lib/price-series.ts:19` always emits `"observed" | "carried_forward" | "stale"`, and `analytics/models/staging/stg_price_series.yml:17-22` enforces `not_null`.
   - Replace `where value_reason != 'stale'` with `where value_reason is distinct from 'stale'` so null values in future Parquet exports cannot silently drop rows instead of failing or passing predictably.

### 4. Surface real coverage in `publish_basket_index.py` when `status` is `"insufficient"`

Inspect `analytics/scripts/publish_basket_index.py:304-307`:

```python
"basketProductsCovered": 0 if reason else covered_products,
"totalWeight": round(float(basket_summary["total_weight"] or 0), 4),
"avgWeightCovered": 0.0 if reason else avg_weight,
"maxWeightCovered": 0.0 if reason else round(weight_covered, 4),
```

Decision point:

- Zeroing out `basketProductsCovered`, `avgWeightCovered`, and `maxWeightCovered` while `status` is `"insufficient"` hides whether the basket products are actually being tracked (`0` vs `9`).
- Check `verify_production()` (`analytics/scripts/publish_basket_index.py:359-378`) and `src/lib/analytics/basket-index.ts:199-203` (`buildStats`):
  - `verify_production` only forbids non-null `baseDate` and non-empty `basketDaily`, `basketMonthly`, `topRisers`, and `topFallers` when `status == "insufficient"`.
  - `buildStats` in `src/lib/analytics/basket-index.ts:199-203` displays `value: "—"` when not ready and `detail: "${payload.coverage.basketProductsCovered} de ${payload.coverage.basketProducts} productos"`, so surfacing real `covered_products` works with the UI without exposing index numbers.
- Update `analytics/scripts/publish_basket_index.py:304-307` to report the real `covered_products`, `avg_weight`, and `round(weight_covered, 4)` even when `reason` is set (keeping `empty_coverage` at zero only in `build_placeholder`). Keep `baseDate`, `basketDaily`, `basketMonthly`, `topRisers`, and `topFallers` gated on `if reason`.
- Regenerate `data/analytics/basket-index.json` from the downloaded release partitions:
  ```bash
  cd analytics && uv run python scripts/publish_basket_index.py --glob 'data/*/part.parquet' --source release
  ```

### 5. Update `tests/inflacion-page.test.ts` if `data/analytics/basket-index.json` changes state

- Inspect `tests/inflacion-page.test.ts:25-76`. Those tests currently assert `payload.status === "insufficient"` and `payload.cpi.latestMonth === "2026-08-01"` against the committed `data/analytics/basket-index.json`.
- If October 2026 INDEC CPI is published and `data/analytics/basket-index.json` flips to `status: "ready"`, update the `"production payload (committed JSON)"` suite in `tests/inflacion-page.test.ts` so it verifies the `ready` production contract (non-empty `basketDaily`, `basketMonthly.length >= 2`, `comparison.overlapMonths.length >= 1`, `baseDate` matching `basketDaily[0].date`, `cpi.latestMonth >= "2026-10-01"`).
- If October 2026 INDEC CPI is not yet published, `status` stays `"insufficient"` (`statusReason: "insufficient_cpi_overlap"`), and `coverage.days`, `coverage.seriesStart`, `coverage.seriesEnd`, and `cpi.latestMonth` update to reflect the 40+ days and September 2026 CPI. Note that `tests/inflacion-page.test.ts:43-50` expects `statusNote` to contain `coverage.seriesStart` and `"2 meses de canasta"` / `"IPC del INDEC"`: verify `insufficient_note()` in `analytics/scripts/publish_basket_index.py:141-150` matches those test assertions when `reason == "insufficient_cpi_overlap"`. Notice line 142-144 currently returns:
  `"Hay {monthly_count} mes(es) de canasta, pero ninguno coincide todavía con un mes publicado del IPC del INDEC."`
  That string does not include `series_start` or `"2 meses de canasta"`, which fails `tests/inflacion-page.test.ts:47-48` (`assert.ok(note.includes(payload.coverage.seriesStart!)); assert.match(note, /2 meses de canasta/i);`). If `status` lands on `insufficient_cpi_overlap`, either update `insufficient_note()` in `publish_basket_index.py` to include the series start and requirement text or align `tests/inflacion-page.test.ts` with `statusReason === "insufficient_cpi_overlap"`.

## Verification commands

Run from the repository root (`ofertaSUPER-remediation/`):

```bash
node --import tsx --conditions=react-server --test tests/export-analytics.test.ts
node --import tsx --conditions=react-server --test tests/analytics-data.test.ts
node --import tsx --conditions=react-server --test tests/price-series.test.ts
node --import tsx --conditions=react-server --test tests/inflacion-page.test.ts
```

Run the exact `Analytics (dbt)` CI checks from `analytics/`:

```bash
cd analytics
uv sync --locked
uv run dbt build --profiles-dir .
uv run python scripts/publish_basket_index.py --skip-build --out tests/fixtures/basket-index.sample.json --check
uv run python scripts/publish_basket_index.py --verify-production
uv run python scripts/chart_price_evolution.py --out /tmp/price-evolution.sample.png
```

Clean up any temporary downloaded files in `analytics/data/` if `git status` shows untracked files before handing off (check `.gitignore` first).

## Acceptance criteria

- `scripts/export-analytics.sh` downloads all existing `price-series-*.parquet` assets from `analytics-data` into `analytics/data/` after uploading today's partition and before invoking `publish_basket_index.py`, and degrades cleanly on failure.
- `data/analytics/basket-index.json` reports `seriesStart: "2026-10-03"`, `seriesEnd: "2026-11-15"` (or latest downloaded date), `days >= 40`, and non-zero `basketProductsCovered` matching actual basket coverage.
- `analytics/seeds/indec_cpi.csv` includes every published month returned by `apis.datos.gob.ar/series/api/series/?ids=145.3_INGNACNAL_DICI_M_15` without invented values.
- If October 2026 INDEC CPI is published, `data/analytics/basket-index.json` has `status: "ready"`, `basketMonthly` with October and November 2026, and non-empty `comparison.overlapMonths`; otherwise it honestly reports `status: "insufficient"` with `statusReason: "insufficient_cpi_overlap"` and passing tests.
- All four Node test files and all `Analytics (dbt)` CI checks pass with zero regressions.
