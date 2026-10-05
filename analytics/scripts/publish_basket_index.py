#!/usr/bin/env python
"""Build the analytics marts with dbt and publish the page payload.

Runs `dbt build` over the dense series Parquet files, then reads the basket
marts from the DuckDB database and writes the small, committed JSON the public
`/inflacion` page renders (no database on the read path).

The payload is only ever `status = "ready"` when the series has at least two
basket months and at least one of them overlaps a published INDEC month.
Otherwise it is `status = "insufficient"` with no index values at all, so
production can never show a sample or a one-point "index".

Usage:
    # Real data: build from the exported partitions and publish.
    uv run python scripts/publish_basket_index.py \
        --glob 'data/*/part.parquet' --source release

    # Regenerate the canonical production placeholder (no dbt needed).
    uv run python scripts/publish_basket_index.py --placeholder --source release

    # CI: verify the committed fixture is reproducible and the published
    # payload is honest (the daily refresh keeps its coverage current).
    uv run python scripts/publish_basket_index.py --skip-build \
        --out tests/fixtures/basket-index.sample.json --check
    uv run python scripts/publish_basket_index.py --verify-production
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import subprocess
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import duckdb

PROJECT_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = PROJECT_DIR.parent
SEEDS_DIR = PROJECT_DIR / "seeds"
DEFAULT_OUTPUT = REPO_ROOT / "data" / "analytics" / "basket-index.json"

SCHEMA_VERSION = 2
METHOD = "Laspeyres de canasta fija; precio promedio simple entre los supermercados relevados"
CPI_SOURCE = "INDEC — IPC Nivel General Nacional, base diciembre 2016"
CPI_UNIT = "Índice base diciembre 2016 = 100"
REQUIREMENTS = {"minimumBasketMonths": 2, "minimumOverlappingCpiMonths": 1}

# The catalog's first observation (docs/RUNBOOK.md). Only used to explain the
# empty production state before the cloud job has published a real series.
DEFAULT_SERIES_START = "2026-09-28"

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


def generated_at() -> str:
    fallback = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    return os.environ.get("ANALYTICS_GENERATED_AT", fallback)


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


def read_seed_csv(name: str) -> list[dict[str, str]]:
    with (SEEDS_DIR / name).open(newline="") as handle:
        return list(csv.DictReader(handle))


def seed_basket_weights() -> list[dict]:
    rows = read_seed_csv("basket_weights.csv")
    ordered = sorted(rows, key=lambda row: (-float(row["weight"]), row["gtin14"]))
    return [
        {
            "gtin14": row["gtin14"],
            "label": row["label"],
            "category": row["category"] or None,
            "weight": float(row["weight"]),
        }
        for row in ordered
    ]


def seed_cpi_block() -> dict:
    rows = sorted(read_seed_csv("indec_cpi.csv"), key=lambda row: row["month"])
    entries: list[dict] = []
    previous: float | None = None
    for row in rows:
        value = float(row["cpi_index"])
        change = round((value - previous) / previous * 100, 4) if previous else None
        entries.append({"month": row["month"], "index": value, "changePct": change})
        previous = value
    return {
        "source": CPI_SOURCE,
        "sourceUrl": rows[0]["source_url"] if rows else None,
        "unit": CPI_UNIT,
        "firstMonth": entries[0]["month"] if entries else None,
        "latestMonth": entries[-1]["month"] if entries else None,
        "rows": entries,
    }


def insuffiency_reason(monthly: list[dict], overlap: list[str]) -> str | None:
    if len(monthly) < REQUIREMENTS["minimumBasketMonths"]:
        return "insufficient_series"
    if len(overlap) < REQUIREMENTS["minimumOverlappingCpiMonths"]:
        return "insufficient_cpi_overlap"
    return None


def insufficient_note(reason: str | None, series_start: object, monthly_count: int) -> str:
    if reason == "insufficient_cpi_overlap":
        return (
            f"Hay {monthly_count} mes(es) de canasta, pero ninguno coincide todavía con un mes publicado del IPC del INDEC."
        )
    return (
        f"La serie de precios del catálogo arranca el {optional(series_start) or 'sin fecha'}. "
        "El índice necesita al menos 2 meses de canasta y un mes de IPC del INDEC superpuesto."
    )


def empty_coverage(series_start: object, basket_products: int, total_weight: float) -> dict:
    return {
        "seriesStart": optional(series_start),
        "seriesEnd": None,
        "days": 0,
        "stores": 0,
        "products": 0,
        "basketProducts": basket_products,
        "basketProductsCovered": 0,
        "totalWeight": round(total_weight, 4),
        "avgWeightCovered": 0.0,
        "maxWeightCovered": 0.0,
    }


def build_placeholder(series_start: str, source: str) -> dict:
    weights = seed_basket_weights()
    total_weight = sum(row["weight"] for row in weights)
    return {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": generated_at(),
        "source": source,
        "status": "insufficient",
        "statusReason": "insufficient_series",
        "statusNote": insufficient_note("insufficient_series", series_start, 0),
        "requirements": REQUIREMENTS,
        "method": METHOD,
        "currency": "ARS",
        "baseDate": None,
        "coverage": empty_coverage(series_start, len(weights), total_weight),
        "basketWeights": weights,
        "basketDaily": [],
        "basketMonthly": [],
        "cpi": seed_cpi_block(),
        "comparison": {"baseMonth": None, "overlapMonths": [], "note": "Sin meses comparables todavía."},
        "topRisers": [],
        "topFallers": [],
    }


def build_payload(connection: duckdb.DuckDBPyConnection, source: str) -> dict:
    coverage = query(
        connection,
        """
        select min(price_date) as series_start,
               max(price_date) as series_end,
               count(distinct price_date) as days,
               count(distinct store) as store_count,
               count(distinct gtin14) as products
        from main.fct_price_daily
        """,
    )[0]
    basket_summary = query(
        connection,
        "select count(*) as basket_products, sum(weight) as total_weight from main.basket_weights",
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
    weights = [
        {
            "gtin14": row["gtin14"],
            "label": row["label"],
            "category": row["category"] or None,
            "weight": row["weight"],
        }
        for row in clean(
            query(connection, "select gtin14, label, category, weight from main.basket_weights order by weight desc, gtin14")
        )
    ]

    overlap = [row["month"] for row in monthly if row["month"] in {item["month"] for item in cpi_rows}]
    reason = insuffiency_reason(monthly, overlap)
    covered_products = max((row["products_covered"] for row in daily), default=0)
    weight_covered = max((row["weight_covered"] for row in daily), default=0.0)
    avg_weight = round(sum(row["weight_covered"] for row in daily) / len(daily), 4) if daily else 0.0

    payload = {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": generated_at(),
        "source": source,
        "status": "insufficient" if reason else "ready",
        "statusReason": reason,
        "statusNote": insufficient_note(reason, coverage["series_start"], len(monthly)) if reason else None,
        "requirements": REQUIREMENTS,
        "method": METHOD,
        "currency": "ARS",
        "baseDate": None if reason else (daily[0]["price_date"] if daily else None),
        "coverage": {
            "seriesStart": optional(coverage["series_start"]),
            "seriesEnd": optional(coverage["series_end"]),
            "days": coverage["days"],
            "stores": coverage["store_count"],
            "products": coverage["products"],
            "basketProducts": basket_summary["basket_products"],
            "basketProductsCovered": 0 if reason else covered_products,
            "totalWeight": round(float(basket_summary["total_weight"] or 0), 4),
            "avgWeightCovered": 0.0 if reason else avg_weight,
            "maxWeightCovered": 0.0 if reason else round(weight_covered, 4),
        },
        "basketWeights": weights,
        "basketDaily": [] if reason else [
            {
                "date": row["price_date"],
                "index": row["basket_index"],
                "productsCovered": row["products_covered"],
                "weightCovered": row["weight_covered"],
            }
            for row in daily
        ],
        "basketMonthly": [] if reason else [
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
            "source": CPI_SOURCE,
            "sourceUrl": cpi_rows[0]["source_url"] if cpi_rows else None,
            "unit": CPI_UNIT,
            "firstMonth": cpi_rows[0]["month"] if cpi_rows else None,
            "latestMonth": cpi_rows[-1]["month"] if cpi_rows else None,
            "rows": [
                {"month": row["month"], "index": row["cpi_index"], "changePct": row["change_pct"]}
                for row in cpi_rows
            ],
        },
        "comparison": {
            "baseMonth": None if reason else (monthly[0]["month"] if monthly else None),
            "overlapMonths": [] if reason else overlap,
            "note": insufficient_note(reason, coverage["series_start"], len(monthly)) if reason else (
                f"El IPC del INDEC está disponible para {len(overlap)} de los meses de la canasta."
            ),
        },
        "topRisers": [] if reason else clean(query(connection, MOVERS_QUERY.format(direction="desc", sign=">", limit=5))),
        "topFallers": [] if reason else clean(query(connection, MOVERS_QUERY.format(direction="asc", sign="<", limit=5))),
    }
    return payload


def normalize(payload: dict, *, drop_generated_at: bool) -> dict:
    comparable = json.loads(json.dumps(payload))
    if drop_generated_at:
        comparable.pop("generatedAt", None)
    return comparable


def write_or_check(out: Path, payload: dict, check: bool) -> int:
    if check:
        if not out.exists():
            print(f"publish_basket_index: {out} does not exist", file=sys.stderr)
            return 1
        if normalize(json.loads(out.read_text()), drop_generated_at=True) != normalize(payload, drop_generated_at=True):
            print(f"publish_basket_index: {out} is not reproducible from the current source", file=sys.stderr)
            return 1
        print(f"publish_basket_index: {out} matches the current source")
        return 0

    if out.exists() and normalize(json.loads(out.read_text()), drop_generated_at=True) == normalize(payload, drop_generated_at=True):
        print(f"publish_basket_index: {out} is unchanged")
        return 0

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    print(
        f"publish_basket_index: status={payload['status']}, {len(payload['basketDaily'])} daily points, "
        f"{len(payload['basketMonthly'])} months, base {payload['baseDate']} -> {out}"
    )
    return 0


# The daily refresh republishes the production payload with the live coverage
# (series start, offers seen), so it cannot equal a fixed placeholder. What CI
# can still hold it to is honesty: a release payload of the current schema that,
# while the series is insufficient, publishes no base date and no index points.
def verify_production(out: Path) -> int:
    if not out.exists():
        print(f"publish_basket_index: {out} does not exist", file=sys.stderr)
        return 1
    payload = json.loads(out.read_text())
    problems = []
    if payload.get("schemaVersion") != SCHEMA_VERSION:
        problems.append(f"schemaVersion {payload.get('schemaVersion')} != {SCHEMA_VERSION}")
    if payload.get("source") != "release":
        problems.append(f"source {payload.get('source')!r} != 'release'")
    if payload.get("status") == "insufficient":
        if payload.get("baseDate") is not None:
            problems.append("insufficient payload publishes a baseDate")
        for key in ("basketDaily", "basketMonthly", "topRisers", "topFallers"):
            if payload.get(key):
                problems.append(f"insufficient payload publishes {key}")
    if problems:
        print(f"publish_basket_index: {out} is not honest: " + "; ".join(problems), file=sys.stderr)
        return 1
    print(f"publish_basket_index: {out} is an honest {payload.get('status')} release payload")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--glob", default="sample/*.parquet", help="Parquet glob dbt reads")
    parser.add_argument("--source", choices=["sample", "release"], default="sample")
    parser.add_argument("--minimum-coverage", type=float, default=0.6)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--skip-build", action="store_true", help="reuse the existing DuckDB marts")
    parser.add_argument("--check", action="store_true", help="compare with the committed JSON instead of writing")
    parser.add_argument("--placeholder", action="store_true", help="write the canonical insufficient payload (no dbt)")
    parser.add_argument("--series-start", default=DEFAULT_SERIES_START)
    parser.add_argument("--verify-production", action="store_true", help="check the published payload is honest (no dbt)")
    args = parser.parse_args()

    if args.verify_production:
        return verify_production(args.out)

    if args.placeholder:
        return write_or_check(args.out, build_placeholder(args.series_start, args.source), args.check)

    if not args.skip_build:
        run_dbt(args.glob, args.minimum_coverage)

    connection = duckdb.connect(str(db_path()), read_only=True)
    try:
        payload = build_payload(connection, args.source)
    finally:
        connection.close()
    return write_or_check(args.out, payload, args.check)


if __name__ == "__main__":
    raise SystemExit(main())
