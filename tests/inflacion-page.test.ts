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
  parseBasketIndex,
  type BasketIndexPayload,
} from "../src/lib/analytics/basket-index";

const PAGE_PATH = join(process.cwd(), "src", "app", "inflacion", "page.tsx");
const SAMPLE_FIXTURE_PATH = join(process.cwd(), "analytics", "tests", "fixtures", "basket-index.sample.json");
const CPI_SEED_PATH = join(process.cwd(), "analytics", "seeds", "indec_cpi.csv");
const PUBLIC_RED_FLAG_PATTERN =
  /\b(demo|mvp|prototype|prototipo|wip|not production-ready|blocked|pending|pendiente|v1|development|desarrollo)\b/i;

function loadSampleFixture(): BasketIndexPayload {
  return parseBasketIndex(JSON.parse(readFileSync(SAMPLE_FIXTURE_PATH, "utf8")));
}

function latestSeedCpiMonth(): string {
  const months = readFileSync(CPI_SEED_PATH, "utf8")
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => line.split(",")[0]);
  return months.sort().at(-1)!;
}

// The daily refresh republishes this payload, so it may be either state; each
// state is held to its own contract.
describe("production payload (committed JSON)", () => {
  it("publishes the multi-day series from the release history, not a single day", () => {
    const { coverage } = loadBasketIndex();

    assert.ok(coverage.days > 1, `expected a multi-day series, got ${coverage.days} day(s)`);
    assert.ok(coverage.seriesStart && coverage.seriesEnd && coverage.seriesStart < coverage.seriesEnd);
    // Coverage describes the latest basket day, which can honestly be 0 after
    // a partial scrape; the series average proves the basket is tracked.
    assert.ok(coverage.avgWeightCovered > 0, "the basket coverage is reported, not zeroed");
    assert.ok(coverage.basketProductsCovered >= 0 && coverage.basketProductsCovered <= coverage.basketProducts);
    assert.ok(coverage.weightCovered >= 0 && coverage.weightCovered <= coverage.totalWeight);
    assert.ok(coverage.coverageDate && coverage.coverageDate <= coverage.seriesEnd!, "coverage names its latest basket day");
  });

  it("is an honest payload for its status", () => {
    const payload = loadBasketIndex();

    assert.equal(payload.schemaVersion, 2);
    assert.equal(payload.source, "release");
    if (payload.status === "insufficient") {
      assert.equal(payload.baseDate, null);
      assert.deepEqual(payload.basketDaily, []);
      assert.deepEqual(payload.basketMonthly, []);
      assert.deepEqual(payload.topRisers, []);
      assert.deepEqual(payload.topFallers, []);
      assert.deepEqual(payload.comparison.overlapMonths, []);
      return;
    }
    assert.equal(payload.status, "ready");
    assert.equal(payload.statusReason, null);
    assert.ok(payload.basketDaily.length > 1);
    assert.ok(payload.basketMonthly.length >= payload.requirements.minimumBasketMonths);
    assert.ok(payload.comparison.overlapMonths.length >= payload.requirements.minimumOverlappingCpiMonths);
    assert.equal(payload.baseDate, payload.basketDaily[0].date);
    assert.equal(payload.basketDaily[0].index, 100);
    assert.equal(payload.basketDaily.at(-1)?.date, payload.coverage.seriesEnd);
  });

  it("explains the required window and the catalog start while insufficient", (t) => {
    const payload = loadBasketIndex();
    if (payload.status !== "insufficient") return t.skip("the published payload is ready");
    const note = payload.statusNote ?? "";

    // The catalog start moves with the published data (the daily refresh
    // re-exports it), so the note must name whatever the payload says.
    assert.ok(payload.coverage.seriesStart, "the payload names its catalog start");
    assert.ok(note.includes(payload.coverage.seriesStart!));
    assert.match(note, /2 meses de canasta/i);
    assert.match(note, /IPC del INDEC/i);
    assert.equal(payload.requirements.minimumBasketMonths, 2);
    assert.equal(payload.requirements.minimumOverlappingCpiMonths, 1);
  });

  it("still carries the real reference data (basket seed and published CPI)", () => {
    const payload = loadBasketIndex();

    assert.equal(payload.basketWeights.length, 12);
    assert.ok(payload.cpi.rows.length > 0);
    assert.equal(payload.cpi.latestMonth, latestSeedCpiMonth(), "the payload carries the committed INDEC seed");
  });

  it("renders the view model that matches its status", () => {
    const payload = loadBasketIndex();
    const view = buildBasketIndexView(payload);

    assert.equal(view.isSample, false);
    if (payload.status === "insufficient") {
      assert.equal(view.isEmpty, true);
      assert.equal(view.chartPoints.length, 0);
      assert.equal(view.latest, null);
      assert.match(view.summary, /canasta fija/);
      assert.ok(view.summary.includes(payload.coverage.seriesStart!));
      return;
    }
    assert.equal(view.isEmpty, false);
    assert.equal(view.chartPoints.length, payload.basketDaily.length);
    assert.equal(view.latest?.month, payload.basketMonthly.at(-1)?.month);
    const { basketProductsCovered, basketProducts, coverageDate } = payload.coverage;
    assert.ok(view.summary.includes(`${basketProductsCovered} de ${basketProducts} productos`));
    assert.ok(view.summary.includes(`el ${coverageDate}`), "the count is the latest basket day's");
  });
});

describe("sample fixture (CI only)", () => {
  it("is a ready payload with a real index series", () => {
    const payload = loadSampleFixture();

    assert.equal(payload.source, "sample");
    assert.equal(payload.status, "ready");
    assert.ok(payload.basketDaily.length > 1);
    assert.ok(payload.basketMonthly.length >= 2);
    assert.equal(payload.baseDate, payload.basketDaily[0].date);
    assert.equal(payload.basketDaily[0].index, 100);
    assert.equal(payload.coverage.basketProducts, payload.basketWeights.length);
    assert.ok(payload.comparison.overlapMonths.length >= 1);
  });

  it("maps the CPI onto every day of its month", () => {
    const payload = loadSampleFixture();
    const points = buildChartPoints(payload);
    const july = points.find((point) => point.date === "2026-07-15");

    assert.equal(points.length, payload.basketDaily.length);
    assert.ok(july);
    assert.equal(july?.cpi, payload.basketMonthly.find((row) => row.month === "2026-07-01")?.cpiRebasedIndex);
  });

  it("describes coverage from real counts instead of a promise", () => {
    const summary = coverageSummary(loadSampleFixture());

    assert.match(summary, /12 de 12 productos de la canasta/);
    assert.match(summary, /3 supermercados/);
  });

  it("builds the four page stat cards and the ready view model", () => {
    const view = buildBasketIndexView(loadSampleFixture());

    assert.equal(view.isEmpty, false);
    assert.equal(view.isSample, true);
    assert.equal(view.stats.length, 4);
    assert.equal(view.stats[0].value, "104,55");
    assert.match(view.stats[3].value, /%$/);
  });

  it("shows the CPI of the latest basket month the INDEC already published", () => {
    const sample = loadSampleFixture();
    const august = sample.basketMonthly.find((row) => row.month === "2026-08-01")!;
    const withUnpublishedMonth: BasketIndexPayload = {
      ...sample,
      basketMonthly: [
        ...sample.basketMonthly,
        { ...august, month: "2026-09-01", cpiIndex: null, cpiRebasedIndex: null, cpiChangePct: null },
      ],
    };

    const cpiStat = buildBasketIndexView(withUnpublishedMonth).stats[2];

    assert.equal(cpiStat.value, formatPercent(august.cpiChangePct));
    assert.equal(cpiStat.detail.replace(/\s/g, " "), "IPC de ago 2026");
  });

  it("says plainly when no basket month has a published CPI", () => {
    const sample = loadSampleFixture();
    const noCpi: BasketIndexPayload = {
      ...sample,
      basketMonthly: sample.basketMonthly.map((row) => ({ ...row, cpiIndex: null, cpiRebasedIndex: null, cpiChangePct: null })),
    };

    const cpiStat = buildBasketIndexView(noCpi).stats[2];

    assert.equal(cpiStat.value, "—");
    assert.match(cpiStat.detail, /Sin IPC publicado/);
  });

  it("describes the latest basket day's coverage, not the best day of the series", () => {
    const sample = loadSampleFixture();
    const payload: BasketIndexPayload = {
      ...sample,
      coverage: { ...sample.coverage, coverageDate: "2026-08-31", basketProductsCovered: 9, weightCovered: 0.8, avgWeightCovered: 0.95 },
    };

    const view = buildBasketIndexView(payload);
    const coverageStat = view.stats[3];

    assert.match(view.summary, /^9 de 12 productos de la canasta con precio fresco el 2026-08-31/);
    assert.doesNotMatch(view.summary, /12 de 12/);
    assert.equal(coverageStat.value, "80%");
    assert.match(coverageStat.detail, /^9 de 12 productos al /);
    assert.ok(!coverageStat.detail.includes("2026-08-31"), "the card shows a readable date");
  });

  it("exposes the latest published month", () => {
    const latest = latestMonthlyPoint(loadSampleFixture());

    assert.equal(latest?.month, "2026-08-01");
    assert.equal(typeof latest?.cpiRebasedIndex, "number");
  });
});

describe("basket index chart", () => {
  it("builds a line geometry for the basket and the CPI series", () => {
    const geometry = buildChartGeometry(buildChartPoints(loadSampleFixture()));

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

  it("draws the production series only once it is ready", () => {
    const payload = loadBasketIndex();
    const geometry = buildChartGeometry(buildChartPoints(payload));

    if (payload.status === "insufficient") assert.equal(geometry, null);
    else assert.ok(geometry, "a ready multi-day series must draw");
  });

  it("returns no geometry with fewer than two days", () => {
    assert.equal(buildChartGeometry([]), null);
    assert.equal(buildChartGeometry([{ date: "2026-06-01", basket: 100, cpi: null }]), null);
  });
});

describe("formatting", () => {
  it("formats months and signed percentages in Spanish", () => {
    assert.equal(formatMonthLabel("2026-06-01").replace(/\s/g, " "), "jun 2026");
    assert.equal(formatPercent(2.785), "+2,79%");
    assert.equal(formatPercent(-2.6442), "\u22122,64%");
    assert.equal(formatPercent(null), "—");
  });
});

describe("inflation route", () => {
  it("renders the precomputed JSON with both the ready and the empty state", () => {
    assert.equal(existsSync(PAGE_PATH), true);
    const source = readFileSync(PAGE_PATH, "utf8");

    assert.match(source, /export const metadata/);
    assert.match(source, /export default function/);
    assert.match(source, /loadBasketIndex/);
    assert.match(source, /BasketIndexChart/);
    assert.match(source, /InsufficientSeries/);
    assert.match(source, /view\.isEmpty/);
    assert.match(source, /IPC\s+Nivel General/);
    assert.doesNotMatch(source, PUBLIC_RED_FLAG_PATTERN);
  });
});

describe("inflacion page movers", () => {
  it("does not publish the movers ranking until prices are promo-aware", () => {
    // Endpoints that land on a deep promo (60-66% off) dominate the ranking
    // and at least one capture error survives every plausibility rule, so the
    // page keeps the payload's movers unpublished (see docs/RUNBOOK.md).
    const page = readFileSync(new URL("../src/app/inflacion/page.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(page, /<MoversList\b/);
    assert.doesNotMatch(page, /Mayores (subas|bajas)/);
  });
});
