// One rule for "precio anterior", shared by /bajas (src/lib/price-drops.ts), the
// public API and every page (src/lib/catalog-snapshot-adapters.ts): the most
// recent observation strictly before the current one whose price differs from
// it, inside a window. The snapshot history ends with the current observation
// itself, so "the last history point" always equals the current price; that is
// why the product page once said 0% next to a drop /bajas had published.

/** How far back the previous different price may be. */
export const PREVIOUS_PRICE_WINDOW_DAYS = 14;

const MS_PER_DAY = 86_400_000;

export type PriceObservation = { price: number | null; observedAt: string };

// The observation time of a candidate reference: a positive price different
// from the current one, observed inside [cutoff, current). Null otherwise; a
// missing or non-positive price is not an observation of a price.
function candidateTime(point: PriceObservation, currentPrice: number, cutoff: number, currentObserved: number): number | null {
  if (point.price === null || !(point.price > 0) || point.price === currentPrice) return null;
  const observed = Date.parse(point.observedAt);
  return Number.isNaN(observed) || observed < cutoff || observed >= currentObserved ? null : observed;
}

/**
 * The reference observation for `currentPrice` observed at `currentObservedAt`,
 * or null when the price did not change inside the window. Returns the history
 * point itself, so callers keep any extra field it carries (e.g. unit price).
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

  const cutoff = currentObserved - windowDays * MS_PER_DAY;
  let reference: (Point & { price: number }) | null = null;
  let referenceObserved = Number.NEGATIVE_INFINITY;
  for (const point of history) {
    const observed = candidateTime(point, currentPrice, cutoff, currentObserved);
    if (observed !== null && observed > referenceObserved) {
      reference = point as Point & { price: number };
      referenceObserved = observed;
    }
  }
  return reference;
}
