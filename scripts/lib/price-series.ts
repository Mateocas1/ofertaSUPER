// Dense daily price series (#548 slice 1).
//
// The catalog only records a price in `price_history` when it changes, plus
// the offer's current state and `last_checked_at`. To answer "what did this
// offer cost every day?" we build a dense series: one row per
// (date, gtin14, store) from the pair's first observation onward, carrying the
// last observed offer state forward only while it is still fresh (<= 24 h).
// Older values become null and carry an explicit reason.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { parquetWriteBuffer } from "hyparquet-writer";

export const DEFAULT_FRESHNESS_HOURS = 24;
const HOUR_MS = 3_600_000;

/** Why the row carries a value (or why it does not). */
export type SeriesReason = "observed" | "carried_forward" | "stale";

export type SeriesPair = {
  gtin14: string;
  store: string;
  storeName: string;
  productName: string;
  brand: string | null;
  category: string | null;
};

export type PairObservation = {
  price: number | null;
  listPrice: number | null;
  available: boolean;
  promo: boolean;
};

export type PairChange = PairObservation & { observedAt: string };

export type PairState = {
  pair: SeriesPair;
  /** Price/list changes, ascending by `observedAt`. */
  changes: PairChange[];
  /** The offer's current state and the instant it was last observed. */
  current: PairObservation & { observedAt: string };
};

export type SeriesRow = SeriesPair & {
  date: string;
  price: number | null;
  listPrice: number | null;
  promo: boolean | null;
  available: boolean | null;
  reason: SeriesReason;
  observedAt: string;
  ageHours: number;
};

export type DenseSeriesOptions = {
  dates: string[];
  now: Date;
  freshnessHours?: number;
};

export function endOfUtcDay(date: string): Date {
  return new Date(`${date}T23:59:59.999Z`);
}

export function utcDateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end)) {
    throw new Error(`invalid date range: ${from}..${to}`);
  }
  while (cursor.getTime() <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function latestAtOrBefore<T extends { observedAt: string }>(observations: T[], asOf: number): T | null {
  let latest: T | null = null;
  for (const observation of observations) {
    if (Date.parse(observation.observedAt) <= asOf) latest = observation;
  }
  return latest;
}

function roundHours(hours: number): number {
  return Math.round(hours * 100) / 100;
}

function firstObservedAt(state: PairState): number {
  const instants = [state.current.observedAt, ...state.changes.map((change) => change.observedAt)];
  return Math.min(...instants.map((instant) => Date.parse(instant)));
}

function reasonFor(isFresh: boolean, observedAt: string, date: string): SeriesReason {
  if (!isFresh) return "stale";
  return observedAt.slice(0, 10) === date ? "observed" : "carried_forward";
}

type ResolvedObservation = { observation: PairChange; fromCurrent: boolean };

function resolveObservation(state: PairState, asOf: number): ResolvedObservation | null {
  const lastChange = latestAtOrBefore(state.changes, asOf);
  const current = Date.parse(state.current.observedAt) <= asOf ? state.current : null;
  const usesCurrent =
    current !== null &&
    (lastChange === null || Date.parse(current.observedAt) >= Date.parse(lastChange.observedAt));
  if (usesCurrent) return { observation: current, fromCurrent: true };
  return lastChange ? { observation: lastChange, fromCurrent: false } : null;
}

function buildRow(state: PairState, date: string, asOf: number, freshnessHours: number): SeriesRow | null {
  if (firstObservedAt(state) > asOf) return null;
  const resolved = resolveObservation(state, asOf);
  if (!resolved) return null;

  const { observation, fromCurrent } = resolved;
  const ageHours = (asOf - Date.parse(observation.observedAt)) / HOUR_MS;
  const isFresh = ageHours <= freshnessHours;

  return {
    ...state.pair,
    date,
    // Availability and promotion are only recorded for the offer's current
    // state, so they are carried only when that state is the fresh observation.
    price: isFresh ? observation.price : null,
    listPrice: isFresh ? observation.listPrice : null,
    available: isFresh && fromCurrent ? observation.available : null,
    promo: isFresh && fromCurrent ? observation.promo : null,
    reason: reasonFor(isFresh, observation.observedAt, date),
    observedAt: observation.observedAt,
    ageHours: roundHours(ageHours),
  };
}

/** One dense row per (date, gtin14, store) whose pair already existed at `asOf`. */
export function buildDenseSeries(states: PairState[], options: DenseSeriesOptions): SeriesRow[] {
  const freshnessHours = options.freshnessHours ?? DEFAULT_FRESHNESS_HOURS;
  const rows: SeriesRow[] = [];
  for (const date of options.dates) {
    const asOf = Math.min(endOfUtcDay(date).getTime(), options.now.getTime());
    for (const state of states) {
      const row = buildRow(state, date, asOf, freshnessHours);
      if (row) rows.push(row);
    }
  }
  return rows;
}

export function partitionRelativePath(date: string): string {
  return join(`date=${date}`, "part.parquet");
}

/** Accepts both `--name=value` and `--name value`; a bare `--flag` maps to "". */
export function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const body = arg.slice(2);
    const equals = body.indexOf("=");
    if (equals >= 0) {
      flags[body.slice(0, equals)] = body.slice(equals + 1);
      continue;
    }
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[body] = next;
      index += 1;
    } else {
      flags[body] = "";
    }
  }
  return flags;
}

export function seriesRowsToParquet(rows: SeriesRow[]): Uint8Array {
  const buffer = parquetWriteBuffer({
    codec: "SNAPPY",
    columnData: [
      { name: "date", data: rows.map((row) => row.date), type: "STRING" },
      { name: "gtin14", data: rows.map((row) => row.gtin14), type: "STRING" },
      { name: "store", data: rows.map((row) => row.store), type: "STRING" },
      { name: "store_name", data: rows.map((row) => row.storeName), type: "STRING" },
      { name: "product_name", data: rows.map((row) => row.productName), type: "STRING" },
      { name: "brand", data: rows.map((row) => row.brand), type: "STRING" },
      { name: "category", data: rows.map((row) => row.category), type: "STRING" },
      { name: "price", data: rows.map((row) => row.price), type: "DOUBLE" },
      { name: "list_price", data: rows.map((row) => row.listPrice), type: "DOUBLE" },
      { name: "promo", data: rows.map((row) => row.promo), type: "BOOLEAN" },
      { name: "available", data: rows.map((row) => row.available), type: "BOOLEAN" },
      { name: "reason", data: rows.map((row) => row.reason), type: "STRING" },
      { name: "observed_at", data: rows.map((row) => row.observedAt), type: "STRING" },
      { name: "age_hours", data: rows.map((row) => row.ageHours), type: "DOUBLE" },
    ],
  });
  return new Uint8Array(buffer);
}

export type WrittenPartition = { date: string; path: string; rows: number };

/** Writes `date=YYYY-MM-DD/part.parquet` under `outDir`; overwriting is idempotent. */
export function writeSeriesPartitions(outDir: string, rows: SeriesRow[]): WrittenPartition[] {
  const byDate = new Map<string, SeriesRow[]>();
  for (const row of rows) {
    const bucket = byDate.get(row.date);
    if (bucket) bucket.push(row);
    else byDate.set(row.date, [row]);
  }

  const written: WrittenPartition[] = [];
  for (const date of [...byDate.keys()].sort()) {
    const partition = join(outDir, partitionRelativePath(date));
    mkdirSync(dirname(partition), { recursive: true });
    const partitionRows = byDate.get(date)!;
    writeFileSync(partition, seriesRowsToParquet(partitionRows));
    written.push({ date, path: partition, rows: partitionRows.length });
  }
  return written;
}
