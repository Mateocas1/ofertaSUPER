import { ZodError } from "zod";

import type { ProductDetail, ProductHistory } from "@/lib/catalog";
import { DEFAULT_PRICE_DROP_RULES } from "@/lib/price-drops";
import { comparePriceAgainstHistory, getBiggestPriceDropAlert } from "@/lib/promotions/alerts";
import { PublicCatalogUnavailableError, type PublicCatalogData } from "@/lib/public-catalog-api";
import { productHistoryQuerySchema } from "@/lib/schemas/product";

const unavailableBody = { error: "Price history temporarily unavailable" } as const;

export type ProductPageLoader = (
  ean: string,
  days: number,
) => Promise<PublicCatalogData<{ product: ProductDetail | null; history: ProductHistory }>>;

export async function loadProductPageData(
  ean: string,
  days: number,
  loadData: ProductPageLoader,
) {
  return loadData(ean, days);
}

export async function handleProductHistoryRequest(
  ean: string,
  query: Record<string, string>,
  loadData: ProductPageLoader,
) {
  let parsed: { days: number };
  try {
    parsed = productHistoryQuerySchema.parse(query);
  } catch (error) {
    if (error instanceof ZodError) {
      return { status: 400, body: { error: "Invalid query parameters", issues: error.flatten() } } as const;
    }
    throw error;
  }

  try {
    const data = await loadData(ean, parsed.days);
    if (!data.product) return { status: 404, body: { error: "Product not found" } } as const;
    return { status: 200, body: data.history } as const;
  } catch (error) {
    if (error instanceof PublicCatalogUnavailableError || error instanceof Error) {
      return { status: 503, body: unavailableBody } as const;
    }
    throw error;
  }
}

// "Precio anterior" on the product page follows the same rule as /bajas
// (src/lib/price-drops.ts): the most recent observation strictly before the
// current one whose price differs from it, inside the same window. The snapshot
// history ends with the current observation itself, so "the last history
// point" always equals the current price and reported a 0% movement next to a
// drop /bajas published.
export const PREVIOUS_PRICE_WINDOW_DAYS = DEFAULT_PRICE_DROP_RULES.windowDays;

export type PriceObservation = { price: number | null; observedAt: string };
export type PreviousPrice = { price: number; observedAt: string };

// A candidate reference: a different, positive price observed inside
// [cutoff, current). Returns its time, or null when it does not qualify.
function referenceTime(point: PriceObservation, currentPrice: number, cutoff: number, currentObserved: number): number | null {
  if (point.price === null || !(point.price > 0) || point.price === currentPrice) return null;
  const observed = Date.parse(point.observedAt);
  return Number.isNaN(observed) || observed < cutoff || observed >= currentObserved ? null : observed;
}

export function findLastDifferentPrice(
  history: readonly PriceObservation[],
  currentPrice: number | null,
  currentObservedAt: string,
  windowDays: number = PREVIOUS_PRICE_WINDOW_DAYS,
): PreviousPrice | null {
  const currentObserved = Date.parse(currentObservedAt);
  if (currentPrice === null || Number.isNaN(currentObserved)) return null;
  const cutoff = currentObserved - windowDays * 86_400_000;
  let reference: PreviousPrice | null = null;
  let referenceObserved = Number.NEGATIVE_INFINITY;
  for (const point of history) {
    const observed = referenceTime(point, currentPrice, cutoff, currentObserved);
    if (observed !== null && observed > referenceObserved) {
      reference = { price: point.price!, observedAt: point.observedAt };
      referenceObserved = observed;
    }
  }
  return reference;
}

type MovementOffer = { source: string; observedAt: string; history: readonly PriceObservation[] };
type MovementEntry = ProductDetail["priceEntries"][number];

/** A price entry whose movement is measured against the last different price. */
export type ProductPagePriceEntry = MovementEntry & { previousObservedAt: string | null };
export type ProductPageDetail = Omit<ProductDetail, "priceEntries"> & { priceEntries: ProductPagePriceEntry[] };

function entryAgainstLastDifferentPrice(entry: MovementEntry, offer: MovementOffer | undefined): ProductPagePriceEntry {
  const reference = offer ? findLastDifferentPrice(offer.history, entry.price, offer.observedAt) : null;
  const movement = comparePriceAgainstHistory(entry.price, reference?.price ?? null);
  return {
    ...entry,
    previousPrice: reference?.price ?? null,
    previousObservedAt: reference?.observedAt ?? null,
    deltaPercent: movement.deltaPercent,
    priceDropAlert: movement.priceDropAlert,
  };
}

/** Recomputes every entry's movement (and the product's biggest drop) with the /bajas rule. */
export function withLastDifferentPrices(detail: ProductDetail, offers: readonly MovementOffer[]): ProductPageDetail {
  const offersBySource = new Map(offers.map((offer) => [offer.source, offer]));
  const priceEntries = detail.priceEntries.map((entry) =>
    entryAgainstLastDifferentPrice(entry, offersBySource.get(entry.supermarket.slug)));
  return {
    ...detail,
    priceEntries,
    bestPriceDropAlert: getBiggestPriceDropAlert(priceEntries.map((entry) => entry.priceDropAlert)),
  };
}

/** Reads the previous observation date the product page loader adds to each entry. */
export function previousObservedAtOf(entry: object): string | null {
  const value = (entry as { previousObservedAt?: unknown }).previousObservedAt;
  return typeof value === "string" ? value : null;
}
