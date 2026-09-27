import "server-only";

import type { PriceDropAlert } from "@/lib/promotions/alerts";
import { comparePriceAgainstHistory } from "@/lib/promotions/alerts";
import { detectAutomaticDiscount } from "@/lib/promotions/detect";
import { classifyPriceFreshness, type PriceFreshnessStatus } from "@/lib/price-freshness";
import type { ProductDetail, ProductSummary } from "@/lib/catalog";

import {
  getSnapshotProduct,
  searchSnapshotProducts,
  type OfferWithFreshness,
  type SnapshotProduct,
} from "@/lib/catalog-snapshot";

const FRESHNESS_SLA_HOURS = 24;

function toNumberOrNull(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// A stable per-offer identifier derived from the snapshot ordering, since the
// snapshot stores no database ids.
function stableOfferId(ean: string, source: string): number {
  const key = `${ean}:${source}`;
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) | 0;
  }
  return 1_000_000 + Math.abs(hash);
}

function buildEntry(offer: OfferWithFreshness, now: Date) {
  const previousPrice = offer.history.length > 0
    ? toNumberOrNull(offer.history[offer.history.length - 1].price)
    : null;
  const movement = comparePriceAgainstHistory(toNumberOrNull(offer.price), previousPrice);
  const price = toNumberOrNull(offer.price);
  const priceDropAlert = movement.priceDropAlert;

  return {
    supermarket: {
      id: stableOfferId(offer.ean, offer.source),
      name: SUPERMARKET_NAMES[offer.source] ?? offer.source,
      slug: offer.source,
      logoUrl: SUPERMARKET_LOGOS[offer.source] ?? null,
    },
    supermarketProductId: stableOfferId(offer.ean, offer.source),
    price,
    listPrice: toNumberOrNull(offer.listPrice),
    referencePrice: null,
    referenceUnit: null,
    isAvailable: offer.available,
    productUrl: offer.productUrl,
    lastCheckedAt: offer.observedAt,
    freshnessSlaHours: FRESHNESS_SLA_HOURS,
    freshnessStatus: classifyPriceFreshness(offer.observedAt, {
      maxAgeHours: FRESHNESS_SLA_HOURS,
      now,
    }).status as PriceFreshnessStatus,
    previousPrice: movement.previousPrice,
    deltaPercent: movement.deltaPercent,
    priceDropAlert,
    automaticDiscountPercent: detectAutomaticDiscount(price, toNumberOrNull(offer.listPrice))?.percentOff ?? null,
    bestPromotion: null,
    finalPrice: price,
  };
}

function buildEntries(offers: OfferWithFreshness[], now: Date) {
  const entries = offers.map((offer) => buildEntry(offer, now));
  // Same offer ordering as the snapshot: stable by source.
  return entries.sort((left, right) => left.supermarket.slug.localeCompare(right.supermarket.slug));
}

function summaryFields(entries: ReturnType<typeof buildEntries>) {
  const eligible = entries.filter((entry) => entry.isAvailable && entry.price !== null);
  const prices = eligible.map((entry) => entry.price!);
  const freshEligible = eligible.filter((entry) => entry.freshnessStatus === "fresh");

  return {
    minPrice: prices.length > 0 ? Math.min(...prices) : null,
    maxPrice: prices.length > 0 ? Math.max(...prices) : null,
    freshMinPrice: freshEligible.length > 0 ? Math.min(...freshEligible.map((entry) => entry.price!)) : null,
    priceCount: eligible.length,
    stalePriceCount: eligible.filter((entry) => entry.freshnessStatus !== "fresh").length,
  };
}

function displayFields(entries: ReturnType<typeof buildEntries>, summary: ReturnType<typeof summaryFields>) {
  const eligible = entries.filter((entry) => entry.isAvailable && entry.price !== null);
  const fresh = eligible.filter((entry) => entry.freshnessStatus === "fresh");
  const chosen = fresh.length > 0 ? fresh : eligible;
  const display = chosen.length > 0
    ? chosen.reduce((best, entry) => (entry.price! < best.price! ? entry : best))
    : null;

  return {
    displayPrice: display?.price ?? null,
    displayPriceCheckedAt: display?.lastCheckedAt ?? null,
    displayPriceFreshnessStatus: (display?.freshnessStatus ?? "unknown") as PriceFreshnessStatus,
    hasFreshPrice: summary.priceCount > 0 && summary.stalePriceCount < summary.priceCount,
  };
}

function rankFields(entries: ReturnType<typeof buildEntries>) {
  const eligible = entries.filter((entry) => entry.isAvailable && entry.price !== null);
  const fresh = eligible.filter((entry) => entry.freshnessStatus === "fresh");
  const best = fresh.length > 0
    ? fresh.reduce((best, entry) => (entry.price! < best.price! ? entry : best))
    : null;

  return {
    rankFreshnessStatus: (best?.freshnessStatus ?? "unknown") as PriceFreshnessStatus,
    bestPriceCheckedAt: best?.lastCheckedAt ?? null,
    bestPriceFreshnessStatus: (best?.freshnessStatus ?? "unknown") as PriceFreshnessStatus,
  };
}

function adaptProduct(product: SnapshotProduct, offers: OfferWithFreshness[], now: Date) {
  const entries = buildEntries(offers, now);
  const summary = summaryFields(entries);
  const automatic = entries
    .map((entry) => entry.automaticDiscountPercent)
    .reduce<number | null>((best, value) => {
      if (value === null) return best;
      return best === null || value > best ? value : best;
    }, null);
  const alerts = entries
    .map((entry) => entry.priceDropAlert)
    .filter((alert): alert is PriceDropAlert => alert !== null);
  const bestAlert = alerts.length > 0
    ? alerts.reduce((best, alert) => (alert.percentDrop > best.percentDrop ? alert : best))
    : null;

  return {
    entries,
    summary,
    display: displayFields(entries, summary),
    rank: rankFields(entries),
    automaticDiscountPercent: automatic,
    bestFinalPrice: entries
      .filter((entry) => entry.isAvailable && entry.finalPrice !== null)
      .reduce<number | null>((best, entry) => (best === null || entry.finalPrice! < best ? entry.finalPrice! : best), null),
    bestPriceDropAlert: bestAlert,
  };
}

export function toProductSummary(
  product: SnapshotProduct,
  offers: OfferWithFreshness[],
  now: Date,
): ProductSummary {
  const adapted = adaptProduct(product, offers, now);

  return {
    ean: product.ean,
    name: product.name,
    brand: product.brand,
    imageUrl: product.imageUrl,
    category: product.category,
    ...adapted.summary,
    ...adapted.display,
    rankFreshnessStatus: adapted.rank.rankFreshnessStatus,
    priceCount: adapted.summary.priceCount,
    automaticDiscountPercent: adapted.automaticDiscountPercent,
    latestCheckedAt: adapted.entries
      .map((entry) => entry.lastCheckedAt)
      .reduce<string | null>((latest, value) => (latest === null || value > latest ? value : latest), null),
    bestPriceCheckedAt: adapted.rank.bestPriceCheckedAt,
    bestPriceFreshnessStatus: adapted.rank.bestPriceFreshnessStatus,
    entries: adapted.entries,
  };
}

export function toProductDetail(
  product: SnapshotProduct,
  offers: OfferWithFreshness[],
  now: Date,
): ProductDetail {
  const adapted = adaptProduct(product, offers, now);

  return {
    ean: product.ean,
    name: product.name,
    brand: product.brand,
    description: null,
    imageUrl: product.imageUrl,
    images: product.imageUrl ? [product.imageUrl] : [],
    category: product.category,
    ...adapted.summary,
    ...adapted.display,
    automaticDiscountPercent: adapted.automaticDiscountPercent,
    bestFinalPrice: adapted.bestFinalPrice,
    bestPriceDropAlert: adapted.bestPriceDropAlert,
    priceEntries: adapted.entries,
    promotions: [],
  };
}

export function findSnapshotAdaptedProduct(ean: string, now: Date): ProductDetail | null {
  const entry = getSnapshotProduct(ean, now);
  if (!entry) return null;
  return toProductDetail(entry.product, entry.offers, now);
}

export function searchSnapshotSummaries(options: {
  query?: string;
  supermarket?: string;
  page?: number;
  now: Date;
}): { total: number; page: number; totalPages: number; pageSize: number; products: ProductSummary[] } {
  const result = searchSnapshotProducts(options);
  return {
    total: result.total,
    page: result.page,
    totalPages: result.totalPages,
    pageSize: result.pageSize,
    products: result.products.map((entry) => toProductSummary(entry.product, entry.offers, options.now)),
  };
}

const SUPERMARKET_NAMES: Record<string, string> = {
  carrefour: "Carrefour",
  disco: "Disco",
  jumbo: "Jumbo",
};

const SUPERMARKET_LOGOS: Record<string, string> = {
  carrefour: "https://logo.clearbit.com/carrefour.com.ar",
  disco: "https://logo.clearbit.com/disco.com.ar",
  jumbo: "https://logo.clearbit.com/jumbo.com.ar",
};
