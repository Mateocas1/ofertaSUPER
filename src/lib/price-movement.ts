// One rule for "precio anterior", shared by /bajas (src/lib/price-drops.ts), the
// public API and every page (src/lib/catalog-snapshot-adapters.ts).
//
// The snapshot history is a change log: a point is written when the price
// changes, so a price that held for weeks has a single old point. The previous
// price is therefore the most recent positive price, before the current
// observation, that differs from the current one; and the movement counts when
// the CHANGE happened inside the window, i.e. when the current price was first
// observed after that reference. Windowing on the reference's own date missed
// every drop from a price that had held longer than the window.

/** How far back the previous different price may be. */
export const PREVIOUS_PRICE_WINDOW_DAYS = 14;

const MS_PER_DAY = 86_400_000;

export type PriceObservation = { price: number | null; observedAt: string };

type Timed<Point> = { point: Point; observed: number };

// The latest positive price that differs from the current one, observed
// strictly before the current observation.
function latestDifferent<Point extends PriceObservation>(
  history: readonly Point[],
  currentPrice: number,
  currentObserved: number,
): Timed<Point & { price: number }> | null {
  let latest: Timed<Point & { price: number }> | null = null;
  for (const point of history) {
    // A missing or non-positive price is not an observation of a price.
    if (point.price === null || !(point.price > 0) || point.price === currentPrice) continue;
    const observed = Date.parse(point.observedAt);
    if (Number.isNaN(observed) || observed >= currentObserved) continue;
    if (latest === null || observed > latest.observed) latest = { point: point as Point & { price: number }, observed };
  }
  return latest;
}

// When the price changed: the first observation of the current price after the
// reference. When the history does not show the current price (a log that
// stops before the current observation), the change happened at some point
// after the reference, so the reference's own time is the conservative bound:
// a change is only claimed inside the window when it certainly was.
function changedAt(history: readonly PriceObservation[], currentPrice: number, after: number, currentObserved: number): number {
  let first: number | null = null;
  for (const point of history) {
    if (point.price !== currentPrice) continue;
    const observed = Date.parse(point.observedAt);
    if (Number.isNaN(observed) || observed <= after || observed > currentObserved) continue;
    if (first === null || observed < first) first = observed;
  }
  return first ?? after;
}

/**
 * The previous different price for `currentPrice` observed at
 * `currentObservedAt`, or null when the price did not change inside the
 * window. Returns the history point itself (when that price was first
 * recorded), so callers keep any extra field it carries (e.g. unit price).
 * Linear in the history length.
 */
export function findLastDifferentPrice<Point extends PriceObservation>(
  history: readonly Point[],
  currentPrice: number | null,
  currentObservedAt: string,
  windowDays: number = PREVIOUS_PRICE_WINDOW_DAYS,
): (Point & { price: number }) | null {
  const currentObserved = Date.parse(currentObservedAt);
  if (currentPrice === null || Number.isNaN(currentObserved)) return null;

  const reference = latestDifferent(history, currentPrice, currentObserved);
  if (!reference) return null;

  const cutoff = currentObserved - windowDays * MS_PER_DAY;
  return changedAt(history, currentPrice, reference.observed, currentObserved) >= cutoff ? reference.point : null;
}
