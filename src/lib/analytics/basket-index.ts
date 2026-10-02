import "server-only";

import basketIndexJson from "../../../data/analytics/basket-index.json";

export const BASKET_INDEX_SCHEMA_VERSION = 1;

export type BasketIndexDailyPoint = {
  date: string;
  index: number;
  productsCovered: number;
  weightCovered: number;
};

export type BasketIndexMonthlyPoint = {
  month: string;
  index: number;
  changePct: number | null;
  cpiIndex: number | null;
  cpiRebasedIndex: number | null;
  cpiChangePct: number | null;
  daysCovered: number;
  avgWeightCovered: number;
};

export type BasketIndexMover = {
  gtin14: string;
  store: string;
  product_name: string;
  brand: string | null;
  category: string | null;
  first_date: string;
  last_date: string;
  first_price: number;
  last_price: number;
  change_pct: number;
};

export type BasketIndexPayload = {
  schemaVersion: number;
  generatedAt: string;
  source: "sample" | "release" | string;
  method: string;
  currency: string;
  baseDate: string;
  coverage: {
    seriesStart: string | null;
    seriesEnd: string | null;
    days: number;
    stores: number;
    products: number;
    basketProducts: number;
    basketProductsCovered: number;
    totalWeight: number;
    avgWeightCovered: number;
    maxWeightCovered: number;
  };
  basketWeights: { gtin14: string; label: string; category: string | null; weight: number }[];
  basketDaily: BasketIndexDailyPoint[];
  basketMonthly: BasketIndexMonthlyPoint[];
  cpi: {
    source: string;
    sourceUrl: string | null;
    unit: string;
    firstMonth: string | null;
    latestMonth: string | null;
    rows: { month: string; index: number; changePct: number | null }[];
  };
  comparison: { baseMonth: string | null; overlapMonths: string[]; note: string };
  topRisers: BasketIndexMover[];
  topFallers: BasketIndexMover[];
};

export class BasketIndexUnavailableError extends Error {}

const REQUIRED_STRING_FIELDS = ["generatedAt", "baseDate", "source", "method", "currency"] as const;
const REQUIRED_ARRAY_FIELDS = ["basketDaily", "basketMonthly", "basketWeights", "topRisers", "topFallers"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBasketIndex(value: unknown): value is BasketIndexPayload {
  if (!isRecord(value)) return false;
  const stringsOk = REQUIRED_STRING_FIELDS.every((field) => typeof value[field] === "string");
  const arraysOk = REQUIRED_ARRAY_FIELDS.every((field) => Array.isArray(value[field]));
  const cpiOk = isRecord(value.cpi) && Array.isArray(value.cpi.rows);
  return typeof value.schemaVersion === "number" && stringsOk && arraysOk && cpiOk && isRecord(value.coverage);
}

export function loadBasketIndex(): BasketIndexPayload {
  if (!isBasketIndex(basketIndexJson) || basketIndexJson.schemaVersion !== BASKET_INDEX_SCHEMA_VERSION) {
    throw new BasketIndexUnavailableError("basket index payload is missing or malformed");
  }
  return basketIndexJson;
}

function monthKey(date: string): string {
  return date.slice(0, 7);
}

/** Daily basket index with the CPI rebased to the matching month (null when unpublished). */
export function buildChartPoints(payload: BasketIndexPayload): { date: string; basket: number | null; cpi: number | null }[] {
  const cpiByMonth = new Map(payload.basketMonthly.map((row) => [monthKey(row.month), row.cpiRebasedIndex]));
  return payload.basketDaily.map((point) => ({
    date: point.date,
    basket: point.index,
    cpi: cpiByMonth.get(monthKey(point.date)) ?? null,
  }));
}

export function latestMonthlyPoint(payload: BasketIndexPayload): BasketIndexMonthlyPoint | null {
  return payload.basketMonthly.at(-1) ?? null;
}

const monthFormatter = new Intl.DateTimeFormat("es-AR", { month: "short", year: "numeric", timeZone: "UTC" });

export function formatMonthLabel(month: string): string {
  return monthFormatter.format(new Date(`${month.slice(0, 7)}-01T00:00:00Z`));
}

export function formatNumber(value: number | null, options: Intl.NumberFormatOptions = {}): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2, ...options }).format(value);
}

export function formatPercent(value: number | null): string {
  if (value === null || value === undefined) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(value)}%`;
}

/** Honest one-liner about what the index actually covers. */
export function coverageSummary(payload: BasketIndexPayload): string {
  const { coverage } = payload;
  const start = coverage.seriesStart ?? "sin datos";
  const end = coverage.seriesEnd ?? "sin datos";
  return (
    `${coverage.basketProductsCovered} de ${coverage.basketProducts} productos de la canasta ` +
    `con precio fresco entre ${start} y ${end}, en ${coverage.stores} supermercados.`
  );
}

export type BasketIndexStat = { label: string; value: string; detail: string };

export type BasketIndexView = {
  payload: BasketIndexPayload;
  latest: BasketIndexMonthlyPoint | null;
  chartPoints: { date: string; basket: number | null; cpi: number | null }[];
  stats: BasketIndexStat[];
  isSample: boolean;
  summary: string;
  cpiMonthLabel: string;
  cpiSourceUrl: string | null;
};

/** Everything the page renders, computed once from the committed payload. */
export function buildBasketIndexView(payload: BasketIndexPayload): BasketIndexView {
  const latest = latestMonthlyPoint(payload);
  const cpiMonthLabel = payload.cpi.latestMonth ? formatMonthLabel(payload.cpi.latestMonth) : "Sin dato del INDEC";
  return {
    payload,
    latest,
    chartPoints: buildChartPoints(payload),
    isSample: payload.source !== "release",
    summary: coverageSummary(payload),
    cpiMonthLabel,
    cpiSourceUrl: payload.cpi.sourceUrl,
    stats: [
      {
        label: "Índice de canasta",
        value: formatNumber(latest?.index ?? null),
        detail: latest ? `Base ${payload.baseDate} = 100 · ${formatMonthLabel(latest.month)}` : "Sin meses publicados",
      },
      {
        label: "Variación mensual canasta",
        value: formatPercent(latest?.changePct ?? null),
        detail: "Contra el mes anterior publicado",
      },
      { label: "IPC último mes", value: formatPercent(latest?.cpiChangePct ?? null), detail: cpiMonthLabel },
      {
        label: "Cobertura de canasta",
        value: `${Math.round(payload.coverage.avgWeightCovered * 100)}%`,
        detail: `${payload.coverage.basketProductsCovered} de ${payload.coverage.basketProducts} productos`,
      },
    ],
  };
}
