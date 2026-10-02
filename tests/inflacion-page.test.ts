import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { buildChartGeometry } from "../src/components/basket-index-chart";
import {
  buildBasketIndexView,
  buildChartPoints,
  coverageSummary,
  formatMonthLabel,
  formatPercent,
  latestMonthlyPoint,
  loadBasketIndex,
} from "../src/lib/analytics/basket-index";

const PAGE_PATH = join(process.cwd(), "src", "app", "inflacion", "page.tsx");
const PUBLIC_RED_FLAG_PATTERN =
  /\b(demo|mvp|prototype|prototipo|wip|not production-ready|blocked|pending|pendiente|v1|development|desarrollo)\b/i;

describe("basket index payload", () => {
  it("loads the committed JSON with the expected shape", () => {
    const payload = loadBasketIndex();

    assert.equal(payload.schemaVersion, 1);
    assert.ok(payload.basketDaily.length > 1);
    assert.ok(payload.basketMonthly.length >= 1);
    assert.equal(payload.baseDate, payload.basketDaily[0].date);
    assert.equal(payload.basketDaily[0].index, 100);
    assert.equal(payload.coverage.basketProducts, payload.basketWeights.length);
  });

  it("maps the CPI onto every day of its month", () => {
    const payload = loadBasketIndex();
    const points = buildChartPoints(payload);
    const july = points.find((point) => point.date === "2026-07-15");

    assert.equal(points.length, payload.basketDaily.length);
    assert.ok(july);
    assert.equal(july?.cpi, payload.basketMonthly.find((row) => row.month === "2026-07-01")?.cpiRebasedIndex);
  });

  it("describes coverage from real counts instead of a promise", () => {
    const summary = coverageSummary(loadBasketIndex());

    assert.match(summary, /12 de 12 productos de la canasta/);
    assert.match(summary, /3 supermercados/);
  });

  it("formats months and signed percentages in Spanish", () => {
    assert.equal(formatMonthLabel("2026-06-01").replace(/\s/g, " "), "jun 2026");
    assert.equal(formatPercent(2.785), "+2,79%");
    assert.equal(formatPercent(-2.6442), "-2,64%");
    assert.equal(formatPercent(null), "—");
  });

  it("exposes the latest published month", () => {
    const latest = latestMonthlyPoint(loadBasketIndex());

    assert.equal(latest?.month, "2026-08-01");
    assert.equal(typeof latest?.cpiRebasedIndex, "number");
  });

  it("builds the four page stat cards from the payload", () => {
    const view = buildBasketIndexView(loadBasketIndex());

    assert.equal(view.stats.length, 4);
    assert.equal(view.isSample, true);
    assert.equal(view.stats[0].value, "104,55");
    assert.match(view.stats[3].value, /%$/);
    assert.match(view.summary, /3 supermercados/);
  });
});

describe("basket index chart", () => {
  it("builds a line geometry for the basket and the CPI series", () => {
    const geometry = buildChartGeometry(buildChartPoints(loadBasketIndex()));

    assert.ok(geometry);
    assert.match(geometry.basketPath, /^M[\d.]+ [\d.]+ L/);
    assert.match(geometry.cpiPath, /^M[\d.]+ [\d.]+ L/);
    assert.equal(geometry.valueTicks.length, 5);
    assert.equal(geometry.dateTicks.length, 4);
    assert.ok(geometry.width > 0 && geometry.height > 0);
  });

  it("breaks the line where a value is missing instead of drawing through it", () => {
    const geometry = buildChartGeometry([
      { date: "2026-06-01", basket: 100, cpi: 100 },
      { date: "2026-06-02", basket: null, cpi: 101 },
      { date: "2026-06-03", basket: 102, cpi: 102 },
    ]);

    assert.ok(geometry);
    assert.equal(geometry.basketPath.split("M").length - 1, 2);
    assert.equal(geometry.cpiPath.split("M").length - 1, 1);
  });

  it("returns no geometry with fewer than two days", () => {
    assert.equal(buildChartGeometry([]), null);
    assert.equal(buildChartGeometry([{ date: "2026-06-01", basket: 100, cpi: null }]), null);
  });
});

describe("inflation route", () => {
  it("renders the precomputed JSON with honest method and coverage copy", () => {
    assert.equal(existsSync(PAGE_PATH), true);
    const source = readFileSync(PAGE_PATH, "utf8");

    assert.match(source, /export const metadata/);
    assert.match(source, /export default function/);
    assert.match(source, /loadBasketIndex/);
    assert.match(source, /BasketIndexChart/);
    assert.match(source, /buildBasketIndexView/);
    assert.match(source, /IPC\s+Nivel General/);
    assert.doesNotMatch(source, PUBLIC_RED_FLAG_PATTERN);
  });
});
