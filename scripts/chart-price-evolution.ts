#!/usr/bin/env node
// Render the README price chart from REAL catalog observations (#548).
//
// The source is the committed snapshot (`data/catalog-snapshot.json`): every
// dated observation of the fixed basket products, nothing else. The synthetic
// sample under `analytics/sample/` is a test fixture and is refused here, so a
// production artifact can never show sample numbers as real. The caption and
// the chart subtitle state the real date range, the source and, when fewer
// than seven days exist, that the series is still too short to read a trend.
//
// Usage:
//   npx tsx scripts/chart-price-evolution.ts
//   npx tsx scripts/chart-price-evolution.ts --out /tmp/chart.png --no-readme

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import {
  assertRealChartSource,
  ChartSourceError,
  formatChartCaption,
  parseBasketWeights,
  patchReadmeChartBlock,
  renderPriceChartSvg,
  renderReadmeChartBlock,
  selectBasketSeries,
  type ChartSource,
  type PriceObservation,
} from "./lib/price-chart";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULTS = {
  snapshot: "data/catalog-snapshot.json",
  weights: "analytics/seeds/basket_weights.csv",
  out: "analytics/assets/price-evolution.png",
  readme: "README.md",
};

type SnapshotOffer = {
  ean?: string;
  price?: number | null;
  observedAt?: string;
  history?: { price?: number | null; observedAt?: string }[];
};

function fail(message: string): never {
  console.error(`chart-price-evolution: ${message}`);
  process.exit(1);
}

function parseFlags(argv: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) fail(`unexpected argument ${arg}`);
    const [name, inlineValue] = arg.slice(2).split("=", 2);
    if (name === "no-readme") {
      flags.readme = false;
      continue;
    }
    const value = inlineValue ?? argv[index + 1];
    if (value === undefined || value.startsWith("--")) fail(`--${name} needs a value`);
    flags[name] = value;
    if (inlineValue === undefined) index += 1;
  }
  return flags;
}

function readObservations(snapshotPath: string): PriceObservation[] {
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as { offers?: SnapshotOffer[] };
  if (!Array.isArray(snapshot.offers)) {
    fail(`${snapshotPath} has no offers[] array`);
  }

  // The current offer state is a real observation too, and it is the same
  // instant the history carries for the last change: dedupe on identity so the
  // count stays honest.
  const seen = new Set<string>();
  const observations: PriceObservation[] = [];
  const push = (ean: string, observedAt: string | undefined, price: number | null | undefined) => {
    if (!observedAt) return;
    const key = `${ean}|${observedAt}|${price ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    observations.push({ gtin14: ean, observedAt, price: price ?? null });
  };

  for (const offer of snapshot.offers) {
    if (!offer?.ean) continue;
    for (const entry of offer.history ?? []) push(offer.ean, entry.observedAt, entry.price);
    push(offer.ean, offer.observedAt, offer.price);
  }
  return observations;
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const snapshotRel = typeof flags.snapshot === "string" ? flags.snapshot : DEFAULTS.snapshot;
  const weightsRel = typeof flags.weights === "string" ? flags.weights : DEFAULTS.weights;
  const outRel = typeof flags.out === "string" ? flags.out : DEFAULTS.out;
  const readmeRel = typeof flags.readme === "string" ? flags.readme : flags.readme === false ? null : DEFAULTS.readme;

  const snapshotAbs = resolve(repoRoot, snapshotRel);
  const source: ChartSource = { kind: "snapshot", path: snapshotRel };
  assertRealChartSource(source);

  const weights = parseBasketWeights(readFileSync(resolve(repoRoot, weightsRel), "utf8"));
  const series = selectBasketSeries(readObservations(snapshotAbs), weights);
  if (series.products.length === 0) {
    fail(`no real observations for the fixed basket in ${snapshotRel}`);
  }

  const caption = formatChartCaption(series, source);
  const svg = renderPriceChartSvg(series, source);
  const png = await sharp(Buffer.from(svg, "utf8")).png({ compressionLevel: 9 }).toBuffer();
  const outAbs = resolve(repoRoot, outRel);
  writeFileSync(outAbs, png);

  if (readmeRel) {
    const readmeAbs = resolve(repoRoot, readmeRel);
    const patched = patchReadmeChartBlock(readFileSync(readmeAbs, "utf8"), renderReadmeChartBlock(caption));
    writeFileSync(readmeAbs, patched);
  }

  console.log(caption);
  console.log(
    `chart-price-evolution: ${series.products.length} series · ${series.dayCount} días (${series.startDate} → ${series.endDate}) -> ${relative(repoRoot, outAbs)}`,
  );
}

main().catch((error: unknown) => {
  if (error instanceof ChartSourceError) fail(error.message);
  fail(error instanceof Error ? error.message : String(error));
});
