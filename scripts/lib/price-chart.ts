// Real-data price chart for the README (#548).
//
// The published chart must show real catalog observations only: the committed
// snapshot's per-offer history. The synthetic series under `analytics/sample/`
// is a test fixture, so the source guard fails closed on it and the selection
// never invents, forward-fills or placeholder-fills a price.

export type BasketWeight = {
  gtin14: string;
  weight: number;
  label: string;
  category: string;
};

export type PriceObservation = {
  gtin14: string;
  observedAt: string;
  price: number | null;
};

export type ChartSource = {
  kind: "snapshot";
  path: string;
};

export type ChartPoint = {
  date: string;
  price: number;
};

export type ProductSeries = {
  gtin14: string;
  label: string;
  weight: number;
  points: ChartPoint[];
};

export type BasketSeries = {
  /** Basket products with at least one real point, sorted by label. */
  products: ProductSeries[];
  /** First real observation day (YYYY-MM-DD). */
  startDate: string;
  /** Last real observation day (YYYY-MM-DD). */
  endDate: string;
  /** Distinct UTC days with at least one selected observation. */
  dayCount: number;
  /** Selected observations that fed the chart. */
  observationCount: number;
  /** Basket labels with no real observation at all. */
  missingProducts: string[];
};

export class ChartSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChartSourceError";
  }
}

export const CHART_TITLE = "Evolución de precios de la canasta";
export const CHART_IMAGE_PATH = "analytics/assets/price-evolution.png";
export const README_BLOCK_START = "<!-- price-chart:start -->";
export const README_BLOCK_END = "<!-- price-chart:end -->";

/** Fewer days than this and the series cannot show a trend yet. */
export const MIN_TREND_DAYS = 7;

const SAMPLE_PATH = /(^|\/)analytics\/sample\//;
const FONT = "DejaVu Sans, Helvetica, Arial, sans-serif";
const Y_TICK_COUNT = 5;

// One colour per basket product (12 products), stable across renders.
const PALETTE = [
  "#1f77b4",
  "#ff7f0e",
  "#2ca02c",
  "#d62728",
  "#9467bd",
  "#8c564b",
  "#e377c2",
  "#7f7f7f",
  "#bcbd22",
  "#17becf",
  "#393b79",
  "#8c6d31",
];

export function assertRealChartSource(source: ChartSource): void {
  if (source.kind !== "snapshot") {
    throw new ChartSourceError(`chart source ${source.kind} is not the committed snapshot`);
  }
  if (SAMPLE_PATH.test(source.path) || source.path.endsWith(".parquet")) {
    throw new ChartSourceError(
      `chart source ${source.path} is the synthetic sample fixture; the chart must be generated from the committed snapshot (data/catalog-snapshot.json)`,
    );
  }
}

export function sourceLabel(source: ChartSource): string {
  return `snapshot real \`${source.path}\``;
}

export function parseBasketWeights(csv: string): BasketWeight[] {
  const weights: BasketWeight[] = [];
  for (const rawLine of csv.split("\n")) {
    const line = rawLine.trim();
    if (line === "") continue;
    const fields = line.split(",");
    if (fields[0] === "gtin14") continue;
    if (fields.length < 4) {
      throw new ChartSourceError(`malformed basket weight row: ${line}`);
    }
    const [gtin14, weight, label, category] = fields;
    const parsed = Number(weight);
    if (!gtin14 || !label || !Number.isFinite(parsed)) {
      throw new ChartSourceError(`malformed basket weight row: ${line}`);
    }
    weights.push({ gtin14, weight: parsed, label, category });
  }
  return weights;
}

type DayBucket = { sum: number; count: number };
type DailyTotals = Map<string, Map<string, DayBucket>>;

function isRealPrice(price: number | null): price is number {
  return price !== null && Number.isFinite(price) && price > 0;
}

function addObservation(totals: DailyTotals, label: string, date: string, price: number): void {
  const days = totals.get(label) ?? new Map<string, DayBucket>();
  totals.set(label, days);
  const bucket = days.get(date) ?? { sum: 0, count: 0 };
  bucket.sum += price;
  bucket.count += 1;
  days.set(date, bucket);
}

function collectDailyTotals(
  observations: PriceObservation[],
  byGtin: Map<string, BasketWeight>,
): { totals: DailyTotals; observationCount: number } {
  const totals: DailyTotals = new Map();
  let observationCount = 0;
  for (const observation of observations) {
    const weight = byGtin.get(observation.gtin14);
    const date = observation.observedAt.slice(0, 10);
    if (!weight || !isRealPrice(observation.price) || date.length !== 10) continue;
    addObservation(totals, weight.label, date, observation.price);
    observationCount += 1;
  }
  return { totals, observationCount };
}

function toProductSeries(weight: BasketWeight, dateBuckets: Map<string, DayBucket> | undefined): ProductSeries | null {
  if (!dateBuckets || dateBuckets.size === 0) return null;
  const points = [...dateBuckets.entries()]
    .map(([date, bucket]) => ({ date, price: bucket.sum / bucket.count }))
    .sort((left, right) => left.date.localeCompare(right.date));
  return { gtin14: weight.gtin14, label: weight.label, weight: weight.weight, points };
}

export function selectBasketSeries(observations: PriceObservation[], weights: BasketWeight[]): BasketSeries {
  const byGtin = new Map(weights.map((weight) => [weight.gtin14, weight]));
  const { totals, observationCount } = collectDailyTotals(observations, byGtin);

  const products: ProductSeries[] = [];
  const missingProducts: string[] = [];
  for (const weight of weights) {
    const product = toProductSeries(weight, totals.get(weight.label));
    if (product) products.push(product);
    else missingProducts.push(weight.label);
  }
  products.sort((left, right) => left.label.localeCompare(right.label, "es"));
  missingProducts.sort((left, right) => left.localeCompare(right, "es"));

  const sortedDates = [...new Set(products.flatMap((product) => product.points.map((point) => point.date)))].sort();

  return {
    products,
    startDate: sortedDates[0] ?? "",
    endDate: sortedDates[sortedDates.length - 1] ?? "",
    dayCount: sortedDates.length,
    observationCount,
    missingProducts,
  };
}

function dayLabel(dayCount: number): string {
  return `${dayCount} día${dayCount === 1 ? "" : "s"} relevado${dayCount === 1 ? "" : "s"}`;
}

export function formatChartCaption(series: BasketSeries, source: ChartSource): string {
  const head = `Fuente: ${sourceLabel(source)}`;
  if (series.dayCount === 0) return `${head} · sin observaciones reales.`;
  const range = `Rango ${series.startDate} → ${series.endDate} · ${dayLabel(series.dayCount)}`;
  if (series.dayCount < MIN_TREND_DAYS) {
    return `${head} · ${range} — menos de ${MIN_TREND_DAYS} días relevados: todavía no alcanza para leer una tendencia.`;
  }
  return `${head} · ${range}.`;
}

export function formatChartSubtitle(series: BasketSeries, source: ChartSource): string {
  const base = `Snapshot real ${source.path} · ${series.startDate} → ${series.endDate} · ${dayLabel(series.dayCount)}`;
  return series.dayCount < MIN_TREND_DAYS ? `${base} · menos de ${MIN_TREND_DAYS} días` : base;
}

export function renderReadmeChartBlock(caption: string): string {
  return [
    README_BLOCK_START,
    `![${CHART_TITLE}](${CHART_IMAGE_PATH})`,
    "",
    caption,
    README_BLOCK_END,
  ].join("\n");
}

export function patchReadmeChartBlock(readme: string, block: string): string {
  const start = readme.indexOf(README_BLOCK_START);
  const end = readme.indexOf(README_BLOCK_END);
  if (start < 0 || end < start) {
    throw new ChartSourceError(
      `README.md has no ${README_BLOCK_START} / ${README_BLOCK_END} block to patch`,
    );
  }
  return `${readme.slice(0, start)}${block}${readme.slice(end + README_BLOCK_END.length)}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatArs(value: number): string {
  const rounded = Math.round(value);
  return String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function distinctDays(series: BasketSeries): string[] {
  const dates = new Set<string>();
  for (const product of series.products) for (const point of product.points) dates.add(point.date);
  return [...dates].sort();
}

type Bounds = { left: number; top: number; width: number; height: number };

type Projection = {
  days: string[];
  baseline: number;
  yTicks: number[];
  xFor: (date: string) => number;
  yFor: (price: number) => number;
};

function createProjection(series: BasketSeries, days: string[], bounds: Bounds): Projection {
  const prices = series.products.flatMap((product) => product.points.map((point) => point.price));
  const rawMin = prices.length > 0 ? Math.min(...prices) : 0;
  const rawMax = prices.length > 0 ? Math.max(...prices) : 1;
  const rawSpan = rawMax - rawMin;
  const span = rawSpan > 0 ? rawSpan : Math.max(rawMax * 0.1, 1);
  const yMin = rawMin - span * 0.02;
  const yMax = rawMax + span * 0.02;
  const yFor = (price: number) => bounds.top + bounds.height - ((price - yMin) / (yMax - yMin)) * bounds.height;
  const xFor = (date: string) => {
    if (days.length <= 1) return bounds.left + bounds.width / 2;
    return bounds.left + (days.indexOf(date) / (days.length - 1)) * bounds.width;
  };
  const yTicks = Array.from(
    { length: Y_TICK_COUNT + 1 },
    (_, index) => yMin + ((yMax - yMin) * index) / Y_TICK_COUNT,
  );
  return { days, baseline: bounds.top + bounds.height, yTicks, xFor, yFor };
}

function gridMarkup(projection: Projection, bounds: Bounds): string[] {
  const parts: string[] = [];
  for (const value of projection.yTicks) {
    const y = projection.yFor(value).toFixed(2);
    parts.push(
      `<line x1="${bounds.left}" y1="${y}" x2="${bounds.left + bounds.width}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`,
    );
    parts.push(
      `<text x="${bounds.left - 12}" y="${projection.yFor(value).toFixed(2)}" dy="4" text-anchor="end" font-family="${FONT}" font-size="12" fill="#6b7280">${escapeXml(formatArs(value))}</text>`,
    );
  }
  parts.push(
    `<line x1="${bounds.left}" y1="${projection.baseline}" x2="${bounds.left + bounds.width}" y2="${projection.baseline}" stroke="#9ca3af" stroke-width="1.5"/>`,
  );

  const rotate = projection.days.length > 4;
  for (const date of projection.days) {
    const x = projection.xFor(date).toFixed(2);
    const label = projection.days.length <= 2 ? date : date.slice(5);
    const transform = rotate ? ` transform="rotate(-35 ${x} ${projection.baseline + 22})"` : "";
    parts.push(
      `<line x1="${x}" y1="${projection.baseline}" x2="${x}" y2="${projection.baseline + 6}" stroke="#9ca3af" stroke-width="1"/>`,
    );
    parts.push(
      `<text x="${x}" y="${projection.baseline + 22}" text-anchor="${rotate ? "end" : "middle"}"${transform} font-family="${FONT}" font-size="12" fill="#6b7280">${escapeXml(label)}</text>`,
    );
  }
  return parts;
}

function seriesMarkup(series: BasketSeries, projection: Projection): string[] {
  const parts: string[] = [];
  for (const [index, product] of series.products.entries()) {
    const color = PALETTE[index % PALETTE.length];
    const coordinates = product.points.map(
      (point) => `${projection.xFor(point.date).toFixed(2)},${projection.yFor(point.price).toFixed(2)}`,
    );
    parts.push(
      `<polyline points="${coordinates.join(" ")}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
    for (const point of product.points) {
      parts.push(
        `<circle cx="${projection.xFor(point.date).toFixed(2)}" cy="${projection.yFor(point.price).toFixed(2)}" r="3.5" fill="${color}"/>`,
      );
    }
  }
  return parts;
}

function legendMarkup(series: BasketSeries, x: number, top: number): string[] {
  return series.products.flatMap((product, index) => {
    const color = PALETTE[index % PALETTE.length];
    const y = top + index * 22;
    return [
      `<line x1="${x}" y1="${y}" x2="${x + 20}" y2="${y}" stroke="${color}" stroke-width="3" stroke-linecap="round"/>`,
      `<text x="${x + 28}" y="${y + 4}" font-family="${FONT}" font-size="12.5" fill="#374151">${escapeXml(product.label)}</text>`,
    ];
  });
}

export function renderPriceChartSvg(
  series: BasketSeries,
  source: ChartSource,
  options: { width?: number; height?: number } = {},
): string {
  const width = options.width ?? 1200;
  const height = options.height ?? 640;
  const margin = { top: 96, right: 300, bottom: 72, left: 92 };
  const bounds: Bounds = {
    left: margin.left,
    top: margin.top,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };
  const projection = createProjection(series, distinctDays(series), bounds);
  const axisLabelY = margin.top + bounds.height / 2;

  return `${[
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`,
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    `<text x="24" y="46" font-family="${FONT}" font-size="26" font-weight="bold" fill="#111827">${escapeXml(CHART_TITLE)}</text>`,
    `<text x="24" y="74" font-family="${FONT}" font-size="14" fill="#4b5563">${escapeXml(formatChartSubtitle(series, source))}</text>`,
    `<text x="26" y="${axisLabelY}" transform="rotate(-90 26 ${axisLabelY})" text-anchor="middle" font-family="${FONT}" font-size="13" fill="#374151">Precio relevado (ARS)</text>`,
    ...gridMarkup(projection, bounds),
    ...seriesMarkup(series, projection),
    ...legendMarkup(series, bounds.left + bounds.width + 24, bounds.top),
    "</svg>",
  ].join("\n")}\n`;
}
