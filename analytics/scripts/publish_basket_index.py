#!/usr/bin/env python
"""Build the analytics marts with dbt and publish the page payload.

Runs `dbt build` over the dense series Parquet files, then reads the basket
marts from the DuckDB database and writes `data/analytics/basket-index.json`:
the small, committed JSON the public `/inflacion` page renders, with no
database on the read path.

Usage:
    # Clean checkout: build from the committed sample.
    uv run python scripts/publish_basket_index.py

    # Real data: point dbt at the exported partitions.
    uv run python scripts/publish_basket_index.py \
        --glob 'data/*/part.parquet' --source release

    # CI: verify the committed JSON is reproducible from the sample.
    uv run python scripts/publish_basket_index.py --check
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import duckdb

PROJECT_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = PROJECT_DIR.parent
DEFAULT_OUTPUT = REPO_ROOT / "data" / "analytics" / "basket-index.json"
METHOD = "Laspeyres de canasta fija; precio promedio simple entre los supermercados relevados"

MOVERS_QUERY = """
with ranked as (
    select *,
           row_number() over (partition by gtin14 order by change_pct {direction}, store) as product_rank
    from main.mart_price_movers
)
select gtin14, store, product_name, brand, category,
       first_date, last_date, first_price, last_price, change_pct
from ranked
where product_rank = 1
  and change_pct {sign} 0
order by change_pct {direction}, store
limit {limit}
"""


def db_path() -> Path:
    configured = os.environ.get("ANALYTICS_DUCKDB_PATH")
    return Path(configured) if configured else PROJECT_DIR / "analytics.duckdb"


def run_dbt(glob: str, minimum_coverage: float) -> None:
    command = [
        "dbt",
        "build",
        "--profiles-dir",
        ".",
        "--vars",
        json.dumps({"price_series_glob": glob, "basket_min_coverage": minimum_coverage}),
    ]
    subprocess.run(command, cwd=PROJECT_DIR, check=True)


def query(connection: duckdb.DuckDBPyConnection, sql: str) -> list[dict]:
    cursor = connection.execute(sql)
    columns = [description[0] for description in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def iso(value: object) -> object:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def clean(rows: list[dict]) -> list[dict]:
    return [{key: iso(value) for key, value in row.items()} for row in rows]


def optional(value: object) -> object:
    return iso(value) if value is not None else None


def build_payload(connection: duckdb.DuckDBPyConnection, source: str) -> dict:
    coverage_rows = query(
        connection,
        """
        select min(price_date) as series_start,
               max(price_date) as series_end,
               count(distinct price_date) as days,
               count(distinct store) as store_count,
               count(distinct gtin14) as products
        from main.fct_price_daily
        """,
    )
    coverage = coverage_rows[0]

    basket_summary = query(
        connection,
        """
        select count(*) as basket_products,
               sum(weight) as total_weight
        from main.basket_weights
        """,
    )[0]

    daily = clean(
        query(
            connection,
            """
            select price_date, basket_index, products_covered, weight_covered
            from main.mart_basket_index_daily
            where basket_index is not null
            order by price_date
            """,
        )
    )

    monthly = clean(
        query(
            connection,
            """
            select cast(m.month as date) as month,
                   m.basket_index,
                   m.basket_change_pct,
                   v.cpi_index,
                   v.cpi_rebased_index,
                   v.cpi_change_pct,
                   m.days_covered,
                   m.avg_weight_covered
            from main.mart_basket_index_monthly m
            left join main.mart_basket_index_vs_cpi v using (month)
            order by m.month
            """,
        )
    )

    cpi_rows = clean(
        query(
            connection,
            """
            select cast(month as date) as month, cpi_index, source_url,
                   round((cpi_index - lag(cpi_index) over (order by month))
                         / lag(cpi_index) over (order by month) * 100, 4) as change_pct
            from main.indec_cpi
            order by month
            """,
        )
    )

    base_date = daily[0]["price_date"] if daily else None
    covered = max((row["weight_covered"] for row in daily), default=0.0)
    covered_products = max((row["products_covered"] for row in daily), default=0)
    avg_weight = round(sum(row["weight_covered"] for row in daily) / len(daily), 4) if daily else 0.0
    cpi_months = {row["month"] for row in cpi_rows}
    overlap = [row["month"] for row in monthly if row["month"] in cpi_months]

    payload = {
        "schemaVersion": 1,
        "generatedAt": os.environ.get("ANALYTICS_GENERATED_AT", datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")),
        "source": source,
        "method": METHOD,
        "currency": "ARS",
        "baseDate": base_date,
        "coverage": {
            "seriesStart": optional(coverage["series_start"]),
            "seriesEnd": optional(coverage["series_end"]),
            "days": coverage["days"],
            "stores": coverage["store_count"],
            "products": coverage["products"],
            "basketProducts": basket_summary["basket_products"],
            "basketProductsCovered": covered_products,
            "totalWeight": round(float(basket_summary["total_weight"] or 0), 4),
            "avgWeightCovered": avg_weight,
            "maxWeightCovered": round(covered, 4),
        },
        "basketWeights": clean(
            query(
                connection,
                "select gtin14, label, category, weight from main.basket_weights order by weight desc, gtin14",
            )
        ),
        "basketDaily": [
            {
                "date": row["price_date"],
                "index": row["basket_index"],
                "productsCovered": row["products_covered"],
                "weightCovered": row["weight_covered"],
            }
            for row in daily
        ],
        "basketMonthly": [
            {
                "month": row["month"],
                "index": row["basket_index"],
                "changePct": row["basket_change_pct"],
                "cpiIndex": row["cpi_index"],
                "cpiRebasedIndex": row["cpi_rebased_index"],
                "cpiChangePct": row["cpi_change_pct"],
                "daysCovered": row["days_covered"],
                "avgWeightCovered": row["avg_weight_covered"],
            }
            for row in monthly
        ],
        "cpi": {
            "source": "INDEC — IPC Nivel General Nacional, base diciembre 2016",
            "sourceUrl": cpi_rows[0]["source_url"] if cpi_rows else None,
            "unit": "Índice base diciembre 2016 = 100",
            "firstMonth": cpi_rows[0]["month"] if cpi_rows else None,
            "latestMonth": cpi_rows[-1]["month"] if cpi_rows else None,
            "rows": [
                {"month": row["month"], "index": row["cpi_index"], "changePct": row["change_pct"]}
                for row in cpi_rows
            ],
        },
        "comparison": {
            "baseMonth": monthly[0]["month"] if monthly else None,
            "overlapMonths": overlap,
            "note": (
                f"El IPC del INDEC está disponible para {len(overlap)} de los meses de la canasta."
                if overlap
                else "El IPC del INDEC todavía no comparte ningún mes con la serie de canasta."
            ),
        },
        "topRisers": clean(query(connection, MOVERS_QUERY.format(direction="desc", sign=">", limit=5))),
        "topFallers": clean(query(connection, MOVERS_QUERY.format(direction="asc", sign="<", limit=5))),
    }

    return payload


def normalize(payload: dict, *, drop_generated_at: bool) -> dict:
    comparable = json.loads(json.dumps(payload))
    if drop_generated_at:
        comparable.pop("generatedAt", None)
    return comparable


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--glob", default="sample/*.parquet", help="Parquet glob dbt reads")
    parser.add_argument("--source", choices=["sample", "release"], default="sample")
    parser.add_argument("--minimum-coverage", type=float, default=0.6)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--skip-build", action="store_true", help="reuse the existing DuckDB marts")
    parser.add_argument("--check", action="store_true", help="compare with the committed JSON instead of writing")
    args = parser.parse_args()

    if not args.skip_build:
        run_dbt(args.glob, args.minimum_coverage)

    connection = duckdb.connect(str(db_path()), read_only=True)
    try:
        payload = build_payload(connection, args.source)
    finally:
        connection.close()

    rendered = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"

    if args.check:
        if not args.out.exists():
            print(f"publish_basket_index: {args.out} does not exist", file=sys.stderr)
            return 1
        committed = normalize(json.loads(args.out.read_text()), drop_generated_at=True)
        generated = normalize(payload, drop_generated_at=True)
        if committed != generated:
            print(f"publish_basket_index: {args.out} is not reproducible from the current build", file=sys.stderr)
            return 1
        print(f"publish_basket_index: {args.out} matches the current build")
        return 0

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(rendered)
    print(
        f"publish_basket_index: {len(payload['basketDaily'])} daily points, "
        f"{len(payload['basketMonthly'])} months, base {payload['baseDate']} -> {args.out}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
