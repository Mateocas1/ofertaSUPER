"""Unit tests for the payload built by publish_basket_index.py (stdlib only).

Run from analytics/:
    uv run python -m unittest discover -s scripts -p 'test_*.py'

The marts are faked in an in-memory DuckDB, so no dbt build or Parquet is
needed. The tests pin what the public /inflacion page relies on while the
payload is still `insufficient`: real basket coverage, no index values.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import duckdb

sys.path.insert(0, str(Path(__file__).resolve().parent))

import publish_basket_index as publish  # noqa: E402

BASKET = [("A", 0.5), ("B", 0.3), ("C", 0.2)]


def build_marts(daily: list[tuple[str, float | None, int, float]], cpi_months: list[str]) -> duckdb.DuckDBPyConnection:
    connection = duckdb.connect(":memory:")
    connection.execute("create table basket_weights (gtin14 varchar, label varchar, category varchar, weight double)")
    connection.executemany("insert into basket_weights values (?, ?, 'Almacén', ?)", [(g, f"Producto {g}", w) for g, w in BASKET])
    connection.execute("create table fct_price_daily (price_date date, store varchar, gtin14 varchar)")
    connection.executemany(
        "insert into fct_price_daily values (?, 'store', ?)",
        [(row[0], gtin) for row in daily for gtin, _ in BASKET],
    )
    connection.execute(
        "create table mart_basket_index_daily (price_date date, basket_index double, products_covered integer, weight_covered double)"
    )
    connection.executemany("insert into mart_basket_index_daily values (?, ?, ?, ?)", daily)
    connection.execute(
        """
        create table mart_basket_index_monthly as
        select date_trunc('month', price_date) as month, avg(basket_index) as basket_index,
               cast(null as double) as basket_change_pct, count(*) as days_covered,
               avg(weight_covered) as avg_weight_covered
        from mart_basket_index_daily where basket_index is not null group by 1
        """
    )
    connection.execute("create table indec_cpi (month date, cpi_index double, source_url varchar)")
    connection.executemany("insert into indec_cpi values (?, 100.0, 'https://example.invalid')", [(m,) for m in cpi_months])
    connection.execute(
        """
        create table mart_basket_index_vs_cpi as
        select m.month, c.cpi_index, cast(null as double) as cpi_rebased_index, cast(null as double) as cpi_change_pct
        from mart_basket_index_monthly m left join indec_cpi c on c.month = m.month
        """
    )
    return connection


class InsufficientPayloadTest(unittest.TestCase):
    def test_cpi_overlap_gap_reports_real_coverage_without_index_values(self) -> None:
        daily = [
            ("2026-10-03", 100.0, 3, 1.0),
            ("2026-10-20", 101.0, 3, 1.0),
            ("2026-11-15", 102.0, 2, 0.8),
        ]
        payload = publish.build_payload(build_marts(daily, ["2026-08-01"]), "release")

        self.assertEqual(payload["status"], "insufficient")
        self.assertEqual(payload["statusReason"], "insufficient_cpi_overlap")
        coverage = payload["coverage"]
        self.assertEqual((coverage["seriesStart"], coverage["seriesEnd"], coverage["days"]), ("2026-10-03", "2026-11-15", 3))
        self.assertEqual(coverage["basketProductsCovered"], 3)
        self.assertEqual(coverage["maxWeightCovered"], 1.0)
        self.assertAlmostEqual(coverage["avgWeightCovered"], 0.9333, places=4)
        self.assertIsNone(payload["baseDate"])
        for key in ("basketDaily", "basketMonthly", "topRisers", "topFallers"):
            self.assertEqual(payload[key], [], key)
        self.assertEqual(payload["comparison"]["overlapMonths"], [])

    def test_cpi_overlap_note_names_the_series_start_and_requirements(self) -> None:
        daily = [("2026-10-03", 100.0, 3, 1.0), ("2026-11-15", 102.0, 3, 1.0)]
        note = publish.build_payload(build_marts(daily, ["2026-08-01"]), "release")["statusNote"]

        self.assertIn("2026-10-03", note)
        self.assertRegex(note, r"2 meses de canasta")
        self.assertRegex(note, r"IPC del INDEC")

    def test_short_series_counts_products_priced_below_the_coverage_threshold(self) -> None:
        daily = [("2026-11-15", None, 1, 0.3)]
        payload = publish.build_payload(build_marts(daily, ["2026-08-01"]), "release")

        self.assertEqual(payload["statusReason"], "insufficient_series")
        self.assertEqual(payload["coverage"]["basketProductsCovered"], 1)
        self.assertEqual(payload["coverage"]["maxWeightCovered"], 0.3)
        self.assertEqual(payload["basketDaily"], [])

    def test_null_coverage_day_counts_as_zero_over_one_consistent_day_set(self) -> None:
        daily = [
            ("2026-10-03", 100.0, 3, 1.0),
            ("2026-10-04", None, None, None),
            ("2026-10-05", None, 1, 0.3),
            ("2026-11-15", 102.0, 2, 0.8),
        ]
        coverage = publish.build_payload(build_marts(daily, ["2026-08-01"]), "release")["coverage"]

        self.assertEqual(coverage["days"], 4)
        self.assertEqual(coverage["basketProductsCovered"], 3)
        self.assertEqual(coverage["maxWeightCovered"], 1.0)
        # Every basket day counts, the null one as 0: (1.0 + 0 + 0.3 + 0.8) / 4.
        self.assertEqual(coverage["avgWeightCovered"], 0.525)

    def test_overlapping_cpi_month_turns_the_payload_ready(self) -> None:
        daily = [("2026-10-03", 100.0, 3, 1.0), ("2026-11-15", 102.0, 3, 1.0)]
        connection = build_marts(daily, ["2026-10-01"])
        connection.execute(
            """
            create table mart_price_movers (gtin14 varchar, store varchar, product_name varchar, brand varchar,
                category varchar, first_date date, last_date date, first_price double, last_price double,
                change_pct double)
            """
        )
        payload = publish.build_payload(connection, "release")

        self.assertEqual(payload["status"], "ready")
        self.assertEqual(payload["baseDate"], "2026-10-03")
        self.assertEqual(payload["comparison"]["overlapMonths"], ["2026-10-01"])
        self.assertEqual(payload["coverage"]["basketProductsCovered"], 3)


if __name__ == "__main__":
    unittest.main()
