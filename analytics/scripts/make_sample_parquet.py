#!/usr/bin/env python
"""Generate the tiny committed sample the dbt CI job builds from.

The sample is not real catalog data: it is a deterministic, 3-month dense
series for the fixed basket products plus a few extras, so `dbt build` can run
from a clean checkout and the committed basket-index JSON stays reproducible.
Real runs point the dbt var at the Parquet partitions exported from Postgres.

Usage:
    uv run python scripts/make_sample_parquet.py
"""

from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path

import duckdb

OUTPUT = Path(__file__).resolve().parent.parent / "sample" / "part.parquet"

# gtin14, name, brand, category, June price, July change, August change.
PRODUCTS: list[tuple[str, str, str, str, float, float, float]] = [
    ("07790742348302", "Leche Entera 3% Sachet 1 Lts La Serenísima", "La Serenísima", "Lácteos", 1250.0, 0.031, 0.038),
    ("07790060023684", "Aceite de Girasol 1.5 Lts Cocinero", "Cocinero", "Almacén", 3200.0, 0.024, 0.029),
    ("02900002002058", "Fideos mostacholes al huevo 500 g.", "Genérico", "Almacén", 980.0, 0.042, 0.031),
    ("00763571680872", "Yerba Mate Original 250 Grs Fronteras", "Frontera", "Desayuno y Merienda", 2100.0, 0.020, 0.026),
    ("07790150150276", "Café tostado La Virginia doy pack 150 grs", "La Virginia", "Café molido y en grano", 4300.0, 0.036, 0.044),
    ("07790639003437", "Gaseosa Cola 2.25 Lts Cunnington", "Cunnington", "Bebidas", 1900.0, 0.018, 0.022),
    ("07790315000149", "Agua mineral sin gas Villa del Sur 1,65 lts", "Villa del Sur", "Bebidas", 1400.0, 0.015, 0.019),
    ("00744430256209", "Yogur Bebible Yogurade Sabor Frutilla 250g", "Yogurade", "Lácteos", 1150.0, 0.033, 0.030),
    ("07798079230284", "Harina De Arroz 1 Kg Santa Maria", "Santa María", "Almacén", 2600.0, 0.027, 0.035),
    ("00000077987839", "Alfajor de arroz Lulemuu blanco 22 g.", "Lulemuu", "Almacén", 620.0, 0.051, 0.048),
    ("07790990002261", "Detergente Polvo Zorro Clásico X 800g", "Zorro", "Limpieza", 2450.0, -0.025, 0.010),
    ("07790310985458", "Papas fritas Lays clásicas 85 g.", "Lays", "Frutas y Verduras", 1850.0, 0.064, -0.085),
    ("07792170042241", "Bebida Isotónica Sabor Uva 500 Ml Gatorade", "Gatorade", "Isotónicas", 1600.0, 0.022, 0.028),
    ("00000077969354", "Tableta chocolatín leche Georgalos 8 g.", "Georgalos", "Lácteos", 480.0, 0.039, 0.041),
    ("00000077976109", "Tableta dulce de leche Vauquita 25 g.", "Vauquita", "Lácteos", 950.0, 0.011, 0.014),
    ("07790150006306", "Café molido torrado La Virginia 125 g.", "La Virginia", "Café molido y en grano", 3900.0, 0.030, 0.033),
]

STORES = [("carrefour", "Carrefour", 1.000), ("disco", "Disco", 1.035), ("jumbo", "Jumbo", 0.975)]

START = date(2026, 6, 1)
END = date(2026, 8, 31)

# A couple of promo days so the promo flag is exercised end to end.
PROMO_DAYS = {("07790310985458", date(2026, 7, 15)), ("07790639003437", date(2026, 8, 10))}


def month_index(day: date) -> int:
    return (day.year - START.year) * 12 + day.month - START.month


def price_for(product: tuple[str, str, str, str, float, float, float], day: date, store_multiplier: float) -> float:
    _, _, _, _, june_price, july_change, august_change = product
    index = month_index(day)
    multiplier = 1.0
    if index >= 1:
        multiplier *= 1 + july_change
    if index >= 2:
        multiplier *= 1 + august_change
    return round(june_price * multiplier * store_multiplier, 2)


def build_rows() -> list[tuple]:
    rows: list[tuple] = []
    day = START
    while day <= END:
        for product in PRODUCTS:
            gtin14 = product[0]
            for store, store_name, store_multiplier in STORES:
                price = price_for(product, day, store_multiplier)
                rows.append(
                    (
                        day.isoformat(),
                        gtin14,
                        store,
                        store_name,
                        product[1],
                        product[2],
                        product[3],
                        price,
                        price,
                        (gtin14, day) in PROMO_DAYS,
                        True,
                        "observed",
                        f"{day.isoformat()}T10:05:00.000Z",
                        0.0,
                    )
                )
        day += timedelta(days=1)
    return rows


def main() -> int:
    rows = build_rows()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    connection = duckdb.connect()
    connection.execute(
        """
        create table sample (
            "date" varchar,
            gtin14 varchar,
            store varchar,
            store_name varchar,
            product_name varchar,
            brand varchar,
            category varchar,
            price double,
            list_price double,
            promo boolean,
            available boolean,
            reason varchar,
            observed_at varchar,
            age_hours double
        )
        """
    )
    connection.executemany("insert into sample values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", rows)
    connection.execute(f"copy sample to '{OUTPUT}' (format parquet, compression snappy)")

    print(f"make_sample_parquet: {len(rows)} rows, {len(PRODUCTS)} products x {len(STORES)} stores -> {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
