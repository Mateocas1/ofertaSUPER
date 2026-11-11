// Pure data preparation for the price-history chart, tested without a DOM.

export type HistoryPoint = Record<string, number | string | null>;
export type TimePoint = { t: number } & Record<string, number | null>;

const DAY_MS = 86_400_000;

/**
 * A history point carries a calendar day ("2026-10-30"). It is placed at noon
 * UTC so that day reads the same in every time zone between UTC−12 and UTC+11,
 * Buenos Aires (UTC−3) included, and the axis spaces days by real elapsed time.
 */
export function dayToTimestamp(day: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const value = Date.parse(`${day}T12:00:00.000Z`);
  return Number.isNaN(value) ? null : value;
}

function priceOrNull(value: number | string | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/** One row per observed day on a numeric time axis, ordered by time; a missing price stays null. */
export function toTimePoints(points: readonly HistoryPoint[], slugs: readonly string[]): TimePoint[] {
  const rows: TimePoint[] = [];
  for (const point of points) {
    const t = typeof point.date === "string" ? dayToTimestamp(point.date) : null;
    if (t === null) continue;
    const row: TimePoint = { t };
    for (const slug of slugs) row[slug] = priceOrNull(point[slug]);
    rows.push(row);
  }
  return rows.sort((left, right) => left.t - right.t);
}

export function observedPrices(rows: readonly TimePoint[], slugs: readonly string[]): number[] {
  return rows.flatMap((row) => slugs.map((slug) => row[slug]).filter((value): value is number => value !== null));
}

function niceStep(rough: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

/**
 * Y-axis domain. Zero-baseline decision: the axis does NOT start at zero. A
 * line encodes position, not length, and grocery prices move a few percent:
 * on a zero-based axis a $2.750 → $2.900 change would be a flat line. To keep
 * the opposite distortion in check (a 1% wiggle filling the whole plot), the
 * domain always spans at least MIN_SPAN_SHARE of the highest price, so slopes
 * stay proportionate across products, and it never goes below zero.
 */
export const MIN_SPAN_SHARE = 0.2;

export type PriceAxis = { domain: [number, number]; ticks: number[] };

export function priceAxis(prices: readonly number[]): PriceAxis {
  if (prices.length === 0) return { domain: [0, 1], ticks: [0, 1] };
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = Math.max(max - min, max * MIN_SPAN_SHARE);
  const middle = (min + max) / 2;
  const step = niceStep(span / 4);
  const low = Math.max(0, Math.floor((middle - span * 0.6) / step) * step);
  const high = Math.ceil((middle + span * 0.6) / step) * step;
  const ticks: number[] = [];
  for (let tick = low; tick <= high + step / 2; tick += step) ticks.push(tick);
  return { domain: [low, high], ticks };
}

/** X-axis domain; a single observed day gets a day of room on each side. */
export function timeDomain(rows: readonly TimePoint[]): [number, number] {
  if (rows.length === 0) return [0, DAY_MS];
  const first = rows[0].t;
  const last = rows[rows.length - 1].t;
  return first === last ? [first - DAY_MS, last + DAY_MS] : [first, last];
}

/** Whole-day ticks between the domain ends, thinned to at most `maxTicks`. */
export function dayTicks([start, end]: [number, number], maxTicks: number): number[] {
  const days = Math.round((end - start) / DAY_MS);
  const every = Math.max(1, Math.ceil((days + 1) / Math.max(1, maxTicks)));
  const ticks: number[] = [];
  for (let day = 0; day <= days; day += every) ticks.push(start + day * DAY_MS);
  return ticks;
}

const axisDateFormatter = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: "UTC" });
const longDateFormatter = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** "30 oct" for ticks; "30 de octubre de 2026" for the tooltip and the table. */
export function formatAxisDay(timestamp: number): string {
  return axisDateFormatter.format(timestamp);
}

export function formatLongDay(timestamp: number): string {
  return longDateFormatter.format(timestamp);
}
