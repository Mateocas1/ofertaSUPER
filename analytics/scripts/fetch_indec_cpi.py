#!/usr/bin/env python
"""Refresh seeds/indec_cpi.csv from the official INDEC series.

The IPC Nivel General Nacional (base December 2016) is published monthly by
INDEC and mirrored by the datos.gob.ar time-series API. This script is the
auditable source of the seed: it never invents values and fails loudly when the
API is unreachable, so a stale seed is always visibly stale.

Usage:
    uv run python scripts/fetch_indec_cpi.py [--months 18]
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

SERIES_ID = "145.3_INGNACNAL_DICI_M_15"
SOURCE_URL = f"https://apis.datos.gob.ar/series/api/series/?ids={SERIES_ID}"
SEED_PATH = Path(__file__).resolve().parent.parent / "seeds" / "indec_cpi.csv"


def fetch_series(months: int) -> list[tuple[str, float]]:
    url = f"{SOURCE_URL}&format=json&limit={months}&sort=desc"
    request = urllib.request.Request(url, headers={"User-Agent": "ofertasuper-analytics/0.1"})
    with urllib.request.urlopen(request, timeout=60) as response:  # noqa: S310 - fixed official host
        payload = json.load(response)
    rows = [(row[0][:7] + "-01", float(row[1])) for row in payload["data"]]
    return sorted(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--months", type=int, default=18, help="trailing months to keep")
    args = parser.parse_args()

    try:
        rows = fetch_series(args.months)
    except (urllib.error.URLError, KeyError, ValueError) as error:
        print(f"fetch_indec_cpi: could not read {SOURCE_URL}: {error}", file=sys.stderr)
        return 1

    SEED_PATH.parent.mkdir(parents=True, exist_ok=True)
    with SEED_PATH.open("w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["month", "cpi_index", "source_url"])
        for month, value in rows:
            writer.writerow([month, f"{value:.4f}", SOURCE_URL])
    print(f"fetch_indec_cpi: wrote {len(rows)} months ({rows[0][0]}..{rows[-1][0]}) to {SEED_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
