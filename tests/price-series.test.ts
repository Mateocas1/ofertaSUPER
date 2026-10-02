import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { parquetReadObjects } from "hyparquet";

import {
  buildDenseSeries,
  endOfUtcDay,
  parseFlags,
  partitionRelativePath,
  utcDateRange,
  writeSeriesPartitions,
  type PairState,
} from "../scripts/lib/price-series";
import { CHANGE_COLUMNS, CHANGES_SQL, PAIR_COLUMNS, PAIRS_SQL } from "../scripts/lib/price-series-sql";

const NOW = new Date("2026-10-02T10:00:00.000Z");

function state(overrides: {
  gtin14: string;
  price?: number | null;
  changes?: PairState["changes"];
  observedAt?: string;
  available?: boolean;
  promo?: boolean;
}): PairState {
  const available = overrides.available ?? true;
  const promo = overrides.promo ?? false;
  const price = overrides.price === undefined ? 100 : overrides.price;
  return {
    pair: {
      gtin14: overrides.gtin14,
      store: "carrefour",
      storeName: "Carrefour",
      productName: `Producto ${overrides.gtin14}`,
      brand: "Marca",
      category: "Almacén",
    },
    changes: overrides.changes ?? [],
    current: {
      price,
      listPrice: price,
      available,
      promo,
      observedAt: overrides.observedAt ?? NOW.toISOString(),
    },
  };
}

describe("buildDenseSeries freshness rules", () => {
  it("marks a same-day observation as observed and keeps its values", () => {
    const rows = buildDenseSeries([state({ gtin14: "A", observedAt: "2026-10-02T09:00:00.000Z" })], {
      dates: ["2026-10-02"],
      now: NOW,
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].reason, "observed");
    assert.equal(rows[0].price, 100);
    assert.equal(rows[0].available, true);
    assert.equal(rows[0].ageHours, 1);
  });

  it("carries a <= 24 h value forward as carried_forward", () => {
    const rows = buildDenseSeries([state({ gtin14: "A", observedAt: "2026-10-01T10:00:00.000Z" })], {
      dates: ["2026-10-02"],
      now: NOW,
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].reason, "carried_forward");
    assert.equal(rows[0].price, 100);
    assert.equal(rows[0].ageHours, 24);
  });

  it("nulls a stale value (> 24 h) and reports the age", () => {
    const rows = buildDenseSeries([state({ gtin14: "A", observedAt: "2026-09-30T10:00:00.000Z" })], {
      dates: ["2026-10-02"],
      now: NOW,
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].reason, "stale");
    assert.equal(rows[0].price, null);
    assert.equal(rows[0].listPrice, null);
    assert.equal(rows[0].available, null);
    assert.equal(rows[0].promo, null);
    assert.equal(rows[0].ageHours, 48);
    assert.equal(rows[0].observedAt, "2026-09-30T10:00:00.000Z");
  });

  it("keeps an out-of-stock observation as observed with a null price", () => {
    const rows = buildDenseSeries(
      [state({ gtin14: "A", price: null, available: false, observedAt: "2026-10-02T09:30:00.000Z" })],
      { dates: ["2026-10-02"], now: NOW },
    );

    assert.equal(rows[0].reason, "observed");
    assert.equal(rows[0].price, null);
    assert.equal(rows[0].available, false);
  });

  it("emits no row before the pair's first observation and carries forward after it", () => {
    const rows = buildDenseSeries([state({ gtin14: "A", observedAt: "2026-10-01T10:00:00.000Z" })], {
      dates: ["2026-09-30", "2026-10-01", "2026-10-02"],
      now: NOW,
    });

    assert.deepEqual(
      rows.map((row) => [row.date, row.reason]),
      [
        ["2026-10-01", "observed"],
        ["2026-10-02", "carried_forward"],
      ],
    );
  });

  it("uses the latest price change when the current state was observed later", () => {
    const rows = buildDenseSeries(
      [
        state({
          gtin14: "A",
          price: 150,
          observedAt: "2026-10-02T09:00:00.000Z",
          changes: [{ price: 120, listPrice: 120, available: true, promo: false, observedAt: "2026-10-01T09:00:00.000Z" }],
        }),
      ],
      { dates: ["2026-10-01", "2026-10-02"], now: NOW },
    );

    assert.deepEqual(
      rows.map((row) => [row.date, row.price, row.reason]),
      [
        ["2026-10-01", 120, "observed"],
        ["2026-10-02", 150, "observed"],
      ],
    );
  });

  it("never uses an observation from the future of the requested day", () => {
    const rows = buildDenseSeries([state({ gtin14: "A", observedAt: "2026-10-02T09:00:00.000Z" })], {
      // The backfilled day ends before the current observation instant.
      dates: ["2026-10-01"],
      now: new Date("2026-11-01T00:00:00.000Z"),
    });

    assert.equal(rows.length, 0);
  });
});

describe("export CLI flags and SQL mapping", () => {
  it("accepts both --name=value and --name value", () => {
    assert.deepEqual(parseFlags(["--mode", "backfill", "--out=/tmp/x", "--from", "2026-09-01"]), {
      mode: "backfill",
      out: "/tmp/x",
      from: "2026-09-01",
    });
  });

  it("keeps a bare flag empty and never swallows the next flag", () => {
    assert.deepEqual(parseFlags(["--dry-run", "--mode=daily"]), { "dry-run": "", mode: "daily" });
  });

  it("aliases every exported column uniquely and in the positional order", () => {
    const aliases = (sql: string) => [...sql.matchAll(/\bas\s+([a-z0-9_]+)/g)].map((match) => match[1]);

    assert.deepEqual(aliases(PAIRS_SQL), [...PAIR_COLUMNS]);
    assert.deepEqual(aliases(CHANGES_SQL), [...CHANGE_COLUMNS]);
    // Prisma collapses duplicate keys, so a repeated alias would shift the mapping.
    assert.equal(new Set(aliases(PAIRS_SQL)).size, PAIR_COLUMNS.length);
  });
});

describe("date helpers", () => {
  it("builds an inclusive UTC date range", () => {
    assert.deepEqual(utcDateRange("2026-09-28", "2026-10-02"), [
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
  });

  it("ends the UTC day at 23:59:59.999Z", () => {
    assert.equal(endOfUtcDay("2026-10-02").toISOString(), "2026-10-02T23:59:59.999Z");
  });

  it("keeps the date=YYYY-MM-DD partition layout", () => {
    assert.equal(partitionRelativePath("2026-10-02"), "date=2026-10-02/part.parquet");
  });
});

describe("writeSeriesPartitions", () => {
  let outDir: string;
  let outDir2: string;

  before(() => {
    outDir = mkdtempSync(join(tmpdir(), "os548-series-"));
    outDir2 = mkdtempSync(join(tmpdir(), "os548-series2-"));
  });

  after(() => {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(outDir2, { recursive: true, force: true });
  });

  const rows = buildDenseSeries(
    [state({ gtin14: "A", observedAt: "2026-10-02T09:00:00.000Z" }), state({ gtin14: "B", observedAt: "2026-09-30T09:00:00.000Z" })],
    { dates: ["2026-10-01", "2026-10-02"], now: NOW },
  );

  it("writes one Parquet file per date partition", () => {
    const written = writeSeriesPartitions(outDir, rows);

    assert.deepEqual(
      written.map((partition) => partition.date),
      ["2026-10-01", "2026-10-02"],
    );
    assert.equal(existsSync(join(outDir, "date=2026-10-01", "part.parquet")), true);
    assert.equal(existsSync(join(outDir, "date=2026-10-02", "part.parquet")), true);
    // Only B had been observed by 2026-10-01; both pairs exist on 2026-10-02.
    assert.equal(written[0].rows, 1);
    assert.equal(written[1].rows, 2);
  });

  it("round-trips the Parquet columns DuckDB and dbt depend on", async () => {
    writeSeriesPartitions(outDir, rows);
    const file = readFileSync(join(outDir, "date=2026-10-02", "part.parquet"));
    const read = await parquetReadObjects({
      file: file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
    });
    const byGtin = new Map(read.map((row) => [row.gtin14, row]));

    assert.equal(read.length, 2);
    assert.deepEqual(Object.keys(read[0]).sort(), [
      "age_hours",
      "available",
      "brand",
      "category",
      "date",
      "gtin14",
      "list_price",
      "observed_at",
      "price",
      "product_name",
      "promo",
      "reason",
      "store",
      "store_name",
    ]);
    assert.equal(byGtin.get("A")?.price, 100);
    assert.equal(byGtin.get("A")?.reason, "observed");
    assert.equal(byGtin.get("B")?.price, null);
    assert.equal(byGtin.get("B")?.reason, "stale");
    assert.equal(byGtin.get("B")?.store_name, "Carrefour");
  });

  it("re-running the export is idempotent", () => {
    writeSeriesPartitions(outDir, rows);
    writeSeriesPartitions(outDir2, rows);

    for (const partition of ["2026-10-01", "2026-10-02"]) {
      assert.deepEqual(
        readFileSync(join(outDir, partitionRelativePath(partition))),
        readFileSync(join(outDir2, partitionRelativePath(partition))),
      );
    }
  });
});
