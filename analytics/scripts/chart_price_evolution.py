#!/usr/bin/env python
"""Render the SAMPLE price-evolution chart (test fixture only).

This script renders the synthetic series under `analytics/sample/` so the
sample pipeline stays reproducible in CI. It is NOT the README chart: the
README chart is generated from real dated observations by
`npx tsx scripts/chart-price-evolution.ts` at the repository root, which labels
the real range and the source. Writing this script's output over
`assets/price-evolution.png` is refused, so a synthetic chart can never be
published as the real one.

`dbt build` must have seeded `basket_weights` in the DuckDB database first.

Usage:
    uv run python scripts/chart_price_evolution.py
    uv run python scripts/chart_price_evolution.py --glob 'data/*/part.parquet' --out /tmp/real.png
"""

from __future__ import annotations

import argparse
from datetime import datetime
from pathlib import Path

import duckdb
import matplotlib

matplotlib.use("Agg")
import matplotlib.dates as mdates  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402

PROJECT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT = PROJECT_DIR / "assets" / "price-evolution.sample.png"
README_CHART = PROJECT_DIR / "assets" / "price-evolution.png"

QUERY = """
with priced as (
    select "date" as price_date, gtin14, price
    from read_parquet('{glob}', union_by_name = true)
    where reason != 'stale' and price is not null
),
per_product as (
    select b.label, p.price_date, avg(p.price) as price
    from priced p
    inner join main.basket_weights b using (gtin14)
    group by b.label, p.price_date
)
select label, price_date, price
from per_product
order by price_date, label
"""


def load_series(glob: str) -> dict[str, tuple[list[datetime], list[float]]]:
    connection = duckdb.connect(str(PROJECT_DIR / "analytics.duckdb"), read_only=True)
    try:
        rows = connection.execute(QUERY.format(glob=glob)).fetchall()
    finally:
        connection.close()

    series: dict[str, tuple[list[datetime], list[float]]] = {}
    for label, price_date, price in rows:
        dates, prices = series.setdefault(label, ([], []))
        dates.append(datetime.fromisoformat(str(price_date)))
        prices.append(float(price))
    return series


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--glob", default="sample/*.parquet")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--title", default="Evolución de precios de la canasta")
    args = parser.parse_args()

    if args.out.resolve() == README_CHART.resolve():
        print(
            "chart_price_evolution: this renders the synthetic sample fixture; "
            "the README chart comes from real data via "
            "`npx tsx scripts/chart-price-evolution.ts`"
        )
        return 1

    try:
        series = load_series(args.glob)
    except duckdb.Error as error:
        print(f"chart_price_evolution: run `dbt build` first ({error})")
        return 1
    if not series:
        print("chart_price_evolution: no rows found; run the exporter and dbt build first")
        return 1

    args.out.parent.mkdir(parents=True, exist_ok=True)

    figure, axes = plt.subplots(figsize=(12, 5.5), dpi=160)
    colors = plt.get_cmap("tab10").colors
    for index, (label, (dates, prices)) in enumerate(sorted(series.items())):
        axes.plot(dates, prices, label=label, linewidth=2, color=colors[index % len(colors)])

    axes.set_title(args.title, loc="left", fontsize=15, fontweight="bold")
    axes.set_ylabel("Precio relevado (ARS)")
    axes.grid(axis="y", alpha=0.25, linewidth=0.6)
    for spine in ("top", "right"):
        axes.spines[spine].set_visible(False)
    axes.xaxis.set_major_locator(mdates.MonthLocator())
    axes.xaxis.set_major_formatter(mdates.DateFormatter("%Y-%m"))
    axes.legend(fontsize=8, frameon=False, loc="center left", bbox_to_anchor=(1.01, 0.5))
    figure.tight_layout()
    figure.savefig(args.out, bbox_inches="tight")
    print(f"chart_price_evolution: {len(series)} series -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
