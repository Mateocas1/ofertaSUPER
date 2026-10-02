import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertRealChartSource,
  ChartSourceError,
  formatChartCaption,
  formatChartSubtitle,
  parseBasketWeights,
  patchReadmeChartBlock,
  README_BLOCK_END,
  README_BLOCK_START,
  renderPriceChartSvg,
  renderReadmeChartBlock,
  selectBasketSeries,
  type BasketWeight,
  type ChartSource,
  type PriceObservation,
} from "../scripts/lib/price-chart";

const root = new URL("../", import.meta.url);
const repoRoot = fileURLToPath(root);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

const SNAPSHOT = "data/catalog-snapshot.json";
const source: ChartSource = { kind: "snapshot", path: SNAPSHOT };

const WEIGHTS_CSV = [
  "gtin14,weight,label,category",
  "00000000000001,0.5,Producto A 1 L,Almacén",
  "00000000000002,0.5,Producto B 500 g,Almacén",
].join("\n");

const weights: BasketWeight[] = parseBasketWeights(WEIGHTS_CSV);

function observation(gtin14: string, date: string, price: number | null): PriceObservation {
  return { gtin14, observedAt: `${date}T10:00:00.000Z`, price };
}

/** Real observation days of the basket, read straight from the committed snapshot. */
function committedSeries() {
  const snapshot = JSON.parse(read(SNAPSHOT)) as {
    offers: { ean: string; price: number | null; observedAt?: string; history?: { price: number | null; observedAt: string }[] }[];
  };
  const observations: PriceObservation[] = [];
  for (const offer of snapshot.offers) {
    for (const entry of offer.history ?? []) {
      observations.push({ gtin14: offer.ean, observedAt: entry.observedAt, price: entry.price });
    }
    if (offer.observedAt) observations.push({ gtin14: offer.ean, observedAt: offer.observedAt, price: offer.price });
  }
  return selectBasketSeries(observations, parseBasketWeights(read("analytics/seeds/basket_weights.csv")));
}

function daysSeries(days: string[]) {
  return selectBasketSeries(
    days.map((date, index) => observation("00000000000001", date, 1000 + index)),
    weights,
  );
}

function runChart(args: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", "scripts/chart-price-evolution.ts", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

let workdir: string;
before(() => {
  workdir = mkdtempSync(join(tmpdir(), "os548-price-chart-"));
});
after(() => {
  rmSync(workdir, { recursive: true, force: true });
});

describe("basket weight parsing", () => {
  it("reads the fixed basket and skips the header", () => {
    assert.deepEqual(weights, [
      { gtin14: "00000000000001", weight: 0.5, label: "Producto A 1 L", category: "Almacén" },
      { gtin14: "00000000000002", weight: 0.5, label: "Producto B 500 g", category: "Almacén" },
    ]);
  });

  it("fails closed on a malformed row instead of guessing", () => {
    assert.throws(() => parseBasketWeights("gtin14,weight,label,category\n00000000000001,0.5"), ChartSourceError);
  });
});

describe("real-only chart source", () => {
  it("accepts the committed snapshot", () => {
    assert.doesNotThrow(() => assertRealChartSource(source));
  });

  it("refuses the synthetic sample parquet", () => {
    assert.throws(() => assertRealChartSource({ kind: "snapshot", path: "analytics/sample/part.parquet" }), ChartSourceError);
    assert.throws(() => assertRealChartSource({ kind: "snapshot", path: "analytics/data/date=2026-10-02/part.parquet" }), ChartSourceError);
  });
});

describe("basket series selection", () => {
  it("keeps only basket products and never invents a price", () => {
    const series = selectBasketSeries(
      [
        observation("00000000000001", "2026-09-28", 1000),
        observation("00000000000001", "2026-09-28", null),
        observation("00000000000001", "2026-09-28", 0),
        observation("99999999999999", "2026-09-28", 5000),
      ],
      weights,
    );

    assert.equal(series.products.length, 1);
    assert.deepEqual(series.products[0].points, [{ date: "2026-09-28", price: 1000 }]);
    assert.equal(series.observationCount, 1);
    assert.deepEqual(series.missingProducts, ["Producto B 500 g"]);
  });

  it("averages every observation of the same product and day", () => {
    const series = selectBasketSeries(
      [
        observation("00000000000001", "2026-09-28", 1000),
        observation("00000000000001", "2026-09-28", 1200),
        observation("00000000000001", "2026-10-02", 1500),
      ],
      weights,
    );

    assert.deepEqual(series.products[0].points, [
      { date: "2026-09-28", price: 1100 },
      { date: "2026-10-02", price: 1500 },
    ]);
    assert.equal(series.observationCount, 3);
    assert.equal(series.startDate, "2026-09-28");
    assert.equal(series.endDate, "2026-10-02");
    assert.equal(series.dayCount, 2);
  });

  it("never gives a missing product a placeholder series", () => {
    const series = selectBasketSeries([observation("00000000000002", "2026-10-02", 900)], weights);

    assert.deepEqual(series.products.map((product) => product.label), ["Producto B 500 g"]);
    assert.deepEqual(series.missingProducts, ["Producto A 1 L"]);
    assert.equal(series.dayCount, 1);
  });

  it("sorts the products by label and the points by date", () => {
    const series = selectBasketSeries(
      [
        observation("00000000000002", "2026-10-02", 900),
        observation("00000000000001", "2026-10-02", 1000),
        observation("00000000000001", "2026-09-28", 950),
      ],
      weights,
    );

    assert.deepEqual(series.products.map((product) => product.label), ["Producto A 1 L", "Producto B 500 g"]);
    assert.deepEqual(series.products[0].points.map((point) => point.date), ["2026-09-28", "2026-10-02"]);
  });
});

describe("chart labels", () => {
  it("names the real source and the real range", () => {
    const series = daysSeries(["2026-09-20", "2026-09-28", "2026-10-02"]);
    const caption = formatChartCaption(series, source);

    assert.match(caption, /Fuente: snapshot real `data\/catalog-snapshot\.json`/);
    assert.match(caption, /Rango 2026-09-20 → 2026-10-02 · 3 días relevados/);
    assert.match(caption, /menos de 7 días relevados/);
    assert.match(formatChartSubtitle(series, source), /Snapshot real data\/catalog-snapshot\.json · 2026-09-20 → 2026-10-02 · 3 días relevados · menos de 7 días/);
  });

  it("drops the short-series warning once a full week exists", () => {
    const series = daysSeries([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
    const caption = formatChartCaption(series, source);

    assert.equal(series.dayCount, 7);
    assert.doesNotMatch(caption, /menos de 7 días/);
    assert.match(caption, /7 días relevados\.$/);
    assert.doesNotMatch(formatChartSubtitle(series, source), /menos de 7 días/);
  });

  it("says so instead of drawing an empty range", () => {
    const empty = selectBasketSeries([], weights);
    assert.match(formatChartCaption(empty, source), /sin observaciones reales/);
  });
});

describe("chart rendering", () => {
  it("draws the title, the real subtitle, the axis label and every real series", () => {
    const series = daysSeries(["2026-09-28", "2026-10-02"]);
    const svg = renderPriceChartSvg(series, source);

    assert.match(svg, /Evolución de precios de la canasta/);
    assert.match(svg, /Precio relevado \(ARS\)/);
    assert.match(svg, /2026-09-28 → 2026-10-02/);
    assert.match(svg, /Producto A 1 L/);
    assert.match(svg, /2026-09-28/);
    assert.match(svg, /2026-10-02/);
    assert.equal(svg, renderPriceChartSvg(series, source), "the SVG must be deterministic");
  });
});

describe("README chart block", () => {
  it("replaces only the marker block and is idempotent", () => {
    const block = renderReadmeChartBlock("Fuente: snapshot real `data/catalog-snapshot.json` · Rango 2026-09-28 → 2026-10-02 · 2 días relevados.");
    const readme = `# Title\n\n${README_BLOCK_START}\nold\n${README_BLOCK_END}\n\n## After\n`;
    const patched = patchReadmeChartBlock(readme, block);

    assert.match(patched, /^# Title\n\n<!-- price-chart:start -->/);
    assert.match(patched, /<!-- price-chart:end -->\n\n## After\n$/);
    assert.equal(patchReadmeChartBlock(patched, block), patched);
  });

  it("fails closed when the markers are gone", () => {
    assert.throws(() => patchReadmeChartBlock("# Title\n", renderReadmeChartBlock("x")), ChartSourceError);
  });
});

describe("chart generator CLI", () => {
  it("renders the committed real snapshot to a PNG", () => {
    const out = join(workdir, "real.png");
    const result = runChart(["--out", out, "--no-readme"]);

    assert.equal(result.status, 0, result.stderr);
    const series = committedSeries();
    assert.match(result.stdout, /12 series · \d+ días \(/);
    assert.match(
      result.stdout,
      new RegExp(`Rango ${series.startDate} → ${series.endDate} · ${series.dayCount} días relevados`),
    );
    assert.deepEqual([...readFileSync(out).subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it("is byte-identical across runs", () => {
    const first = join(workdir, "a.png");
    const second = join(workdir, "b.png");
    assert.equal(runChart(["--out", first, "--no-readme"]).status, 0);
    assert.equal(runChart(["--out", second, "--no-readme"]).status, 0);

    assert.ok(readFileSync(first).equals(readFileSync(second)), "two runs must produce the same PNG");
  });

  it("refuses the synthetic sample source", () => {
    const result = runChart(["--snapshot", "analytics/sample/part.parquet", "--out", join(workdir, "sample.png")]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /sample fixture/);
  });
});

describe("README uses the real chart", () => {
  const readme = read("README.md");

  it("carries the generated block with the real source and a real range", () => {
    const block = readme.slice(readme.indexOf(README_BLOCK_START), readme.indexOf(README_BLOCK_END));
    const match = block.match(/Rango (\d{4}-\d{2}-\d{2}) → (\d{4}-\d{2}-\d{2}) · (\d+) día/);

    assert.ok(readme.includes(README_BLOCK_START) && readme.includes(README_BLOCK_END));
    assert.match(block, /analytics\/assets\/price-evolution\.png/);
    assert.match(block, /Fuente: snapshot real `data\/catalog-snapshot\.json`/);
    assert.ok(match, "the caption must label the real date range");
    assert.equal(
      block.includes("menos de 7 días"),
      Number(match[3]) < 7,
      "the short-series warning must match the stated day count",
    );
  });

  it("never points the README at a sample artifact", () => {
    assert.doesNotMatch(readme, /analytics\/sample/);
  });
});

describe("sample chart stays a fixture", () => {
  const script = read("analytics/scripts/chart_price_evolution.py");

  it("defaults to a fixture path and refuses the README chart", () => {
    assert.match(script, /DEFAULT_OUTPUT = PROJECT_DIR \/ "assets" \/ "price-evolution\.sample\.png"/);
    assert.match(script, /chart-price-evolution\.ts/);
    assert.match(script, /"assets" \/ "price-evolution\.png"/);
  });
});
