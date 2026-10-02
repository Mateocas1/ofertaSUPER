#!/usr/bin/env node
// Export the catalog to the dense daily price series (#548 slice 1).
//
// `--mode=daily` exports one partition for the given UTC day from the live
// offer state; `--mode=backfill` rebuilds every past day from `price_history`
// plus the offer's last observation. The rows land as SNAPPY Parquet under
// `date=YYYY-MM-DD/part.parquet`, ready for DuckDB + dbt.
//
// Reads PostgreSQL with SELECT-only statements: through Prisma when
// DATABASE_URL reaches the database, or through `docker exec psql` otherwise.

import "./load-env";

import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildDenseSeries,
  utcDateRange,
  writeSeriesPartitions,
  type PairChange,
  type PairState,
  type SeriesPair,
} from "./lib/price-series";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT_DIR = resolve(repoRoot, "analytics", "data");
const DEFAULT_CONTAINER = "ofertasuper-cmvp-local-bootstrap-postgres-1";

const PAIRS_SQL = `select sp.id::text,
       sp.product_ean,
       s.slug,
       s.name,
       p.name,
       coalesce(p.brand, ''),
       coalesce(p.category, ''),
       sp.price::text,
       sp.list_price::text,
       sp.is_available::text,
       (sp.promo is not null)::text,
       to_char(sp.last_checked_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
from supermarket_products sp
join supermarkets s on s.id = sp.supermarket_id
join products p on p.ean = sp.product_ean
order by sp.id`;

const CHANGES_SQL = `select ph.supermarket_product_id::text,
       ph.price::text,
       ph.list_price::text,
       to_char(ph.scraped_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
from price_history ph
order by ph.supermarket_product_id, ph.scraped_at`;

function readFlag(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseNullableNumber(value: string): number | null {
  if (value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBoolean(value: string): boolean {
  return value === "t" || value === "true";
}

function rowFields(row: Record<string, unknown>): string[] {
  return Object.values(row).map((value) => {
    if (value === null || value === undefined) return "";
    if (typeof value === "boolean") return value ? "t" : "f";
    return String(value);
  });
}

function psqlRows(sql: string): string[][] {
  const stdout = execFileSync(
    "docker",
    ["exec", DEFAULT_CONTAINER, "psql", "-U", "ofertasuper_owner", "-d", "ofertasuper", "-At", "-F", "\u0001", "-c", sql],
    { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 },
  );
  return stdout
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => line.split("\u0001"));
}

async function readRows(sql: string): Promise<string[][]> {
  if (process.env.DATABASE_URL) {
    const { db } = await import("../src/lib/db");
    const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(sql);
    return rows.map(rowFields);
  }
  return psqlRows(sql);
}

function toPair(row: string[]): SeriesPair {
  return {
    gtin14: row[1],
    store: row[2],
    storeName: row[3],
    productName: row[4],
    brand: row[5] === "" ? null : row[5],
    category: row[6] === "" ? null : row[6],
  };
}

async function loadStates(): Promise<PairState[]> {
  if (!process.env.DATABASE_URL) {
    console.error("export-price-series: DATABASE_URL is not set; reading through docker exec psql");
  }
  const [pairs, changes] = await Promise.all([readRows(PAIRS_SQL), readRows(CHANGES_SQL)]);

  const states = new Map<string, PairState>();
  for (const row of pairs) {
    states.set(row[0], {
      pair: toPair(row),
      changes: [],
      current: {
        price: parseNullableNumber(row[7]),
        listPrice: parseNullableNumber(row[8]),
        available: parseBoolean(row[9]),
        promo: parseBoolean(row[10]),
        observedAt: row[11],
      },
    });
  }

  let orphanChanges = 0;
  for (const row of changes) {
    const state = states.get(row[0]);
    if (!state) {
      orphanChanges += 1;
      continue;
    }
    const change: PairChange = {
      price: parseNullableNumber(row[1]),
      listPrice: parseNullableNumber(row[2]),
      // Availability and promotion are not recorded per change; they are taken
      // from the current offer state when it is the fresh observation.
      available: state.current.available,
      promo: state.current.promo,
      observedAt: row[3],
    };
    state.changes.push(change);
  }

  if (orphanChanges > 0) {
    console.error(`export-price-series: skipped ${orphanChanges} price_history rows without an offer`);
  }
  return [...states.values()];
}

function earliestObservedDate(states: PairState[]): string {
  let earliest: string | null = null;
  for (const state of states) {
    for (const observation of [...state.changes, state.current]) {
      const date = observation.observedAt.slice(0, 10);
      if (earliest === null || date < earliest) earliest = date;
    }
  }
  return earliest ?? todayUtc();
}

async function main() {
  const mode = resolveMode();
  const outDir = resolve(repoRoot, readFlag("out") ?? DEFAULT_OUT_DIR);
  const freshnessHours = Number(readFlag("freshness-hours") ?? "24");
  const now = new Date();
  const states = await loadStates();
  const dates = resolveDates(mode, states, now);

  const rows = buildDenseSeries(states, { dates, now, freshnessHours });
  const written = writeSeriesPartitions(outDir, rows);
  report(mode, { written, rows, states, freshnessHours, outDir });
}

function resolveMode(): "daily" | "backfill" {
  const mode = readFlag("mode") ?? "daily";
  if (mode !== "daily" && mode !== "backfill") {
    throw new Error(`unknown --mode=${mode} (expected daily or backfill)`);
  }
  return mode;
}

function resolveDates(mode: "daily" | "backfill", states: PairState[], now: Date): string[] {
  const today = now.toISOString().slice(0, 10);
  if (mode === "daily") return [readFlag("date") ?? today];
  return utcDateRange(readFlag("from") ?? earliestObservedDate(states), readFlag("to") ?? today);
}

function report(
  mode: string,
  summary: { written: ReturnType<typeof writeSeriesPartitions>; rows: ReturnType<typeof buildDenseSeries>; states: PairState[]; freshnessHours: number; outDir: string },
) {
  const stale = summary.rows.filter((row) => row.reason === "stale").length;
  console.log(
    `export-price-series: ${mode} -> ${summary.written.length} partition(s), ${summary.rows.length} rows ` +
      `(${summary.states.length} offers, ${stale} stale rows, freshness ${summary.freshnessHours}h) in ${summary.outDir}`,
  );
  for (const partition of summary.written) {
    console.log(`export-price-series: ${partition.date} ${partition.rows} rows -> ${partition.path}`);
  }
  if (summary.written.length === 0) {
    console.error("export-price-series: no rows exported; nothing to write");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
