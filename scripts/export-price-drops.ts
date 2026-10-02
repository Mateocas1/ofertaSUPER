#!/usr/bin/env node
// Price drops export (#548 slice 2). Reads the committed snapshot the refresh
// just wrote and publishes the day's drops as data/price-drops.json: each drop
// is the current price against the last different observation inside the
// window, above both thresholds, excluding stale offers and promo-only
// artifacts.
//
// Thresholds and window are configurable with the flags below or with the
// matching PRICE_DROP_* environment variables:
//   --min-percent --min-amount --window-days --max-age-hours --limit
// Plus --snapshot --out --now for a different input, output or clock.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildPriceDropsPayload,
  DEFAULT_PRICE_DROP_RULES,
  type PriceDropsPayload,
  type PriceDropRules,
  type PriceDropSnapshot,
} from "../src/lib/price-drops";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SNAPSHOT_PATH = resolve(repoRoot, "data", "catalog-snapshot.json");
const DEFAULT_OUTPUT_PATH = resolve(repoRoot, "data", "price-drops.json");

export type ExportPriceDropsOptions = {
  snapshotPath?: string;
  outputPath?: string;
  rules?: PriceDropRules;
  now?: Date;
};

export function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [name, ...rest] = arg.slice(2).split("=");
    if (name) flags[name] = rest.join("=");
  }
  return flags;
}

function readNumber(raw: string | undefined, fallback: number, label: string): number {
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number, got: ${raw}`);
  }
  return value;
}

/** Flags win over the environment; both fall back to the published defaults. */
export function resolveRules(
  env: Record<string, string | undefined>,
  flags: Record<string, string>,
): PriceDropRules {
  const pick = (flag: string, envName: string, fallback: number) =>
    readNumber(flags[flag] ?? env[envName], fallback, `--${flag} (${envName})`);

  return {
    minPercentDrop: pick("min-percent", "PRICE_DROP_MIN_PERCENT", DEFAULT_PRICE_DROP_RULES.minPercentDrop),
    minAmountDrop: pick("min-amount", "PRICE_DROP_MIN_AMOUNT", DEFAULT_PRICE_DROP_RULES.minAmountDrop),
    windowDays: pick("window-days", "PRICE_DROP_WINDOW_DAYS", DEFAULT_PRICE_DROP_RULES.windowDays),
    maxAgeHours: pick("max-age-hours", "PRICE_DROP_MAX_AGE_HOURS", DEFAULT_PRICE_DROP_RULES.maxAgeHours),
    maxPercentDrop: pick("max-percent", "PRICE_DROP_MAX_PERCENT", DEFAULT_PRICE_DROP_RULES.maxPercentDrop),
    limit: pick("limit", "PRICE_DROP_LIMIT", DEFAULT_PRICE_DROP_RULES.limit),
  };
}

function readSnapshot(path: string): PriceDropSnapshot {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<PriceDropSnapshot>;
  if (!parsed || !Array.isArray(parsed.products) || !Array.isArray(parsed.offers)) {
    throw new Error(`${path} is not a catalog snapshot (products/offers missing)`);
  }
  return { generatedAt: String(parsed.generatedAt), products: parsed.products, offers: parsed.offers };
}

export function runExport(options: ExportPriceDropsOptions = {}): { payload: PriceDropsPayload; outputPath: string } {
  const snapshotPath = options.snapshotPath ?? DEFAULT_SNAPSHOT_PATH;
  const outputPath = options.outputPath ?? DEFAULT_OUTPUT_PATH;
  const rules = options.rules ?? DEFAULT_PRICE_DROP_RULES;
  const payload = buildPriceDropsPayload(readSnapshot(snapshotPath), rules, options.now ?? new Date());
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  return { payload, outputPath };
}

function formatRules(rules: PriceDropRules): string {
  return `>=${rules.minPercentDrop}% and >=ARS ${rules.minAmountDrop} within ${rules.windowDays}d, freshness ${rules.maxAgeHours}h, suspect >${rules.maxPercentDrop}%, top ${rules.limit}`;
}

function main(): void {
  const flags = parseFlags(process.argv.slice(2));
  const rules = resolveRules(process.env, flags);
  const now = flags.now ? new Date(flags.now) : new Date();
  const { payload, outputPath } = runExport({
    snapshotPath: flags.snapshot,
    outputPath: flags.out,
    rules,
    now,
  });
  console.log(
    `export-price-drops: ${payload.totalDrops} drops published, ${payload.suspectDrops} suspect withheld ` +
      `(${formatRules(rules)}) -> ${outputPath.replace(repoRoot, ".")}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
