import "server-only";

import {
  getSnapshotGeneratedAt,
  getSnapshotProduct,
  normalizeQuery,
  searchSnapshotProducts,
  SnapshotUnavailableError,
} from "@/lib/catalog-snapshot";
import { toProductDetail, toProductSummary } from "@/lib/catalog-snapshot-adapters";
import type { ProductDetail, ProductHistory, ProductSummary } from "@/lib/catalog";
import {
  getPublicLatestCheckedAt,
  PublicCatalogUnavailableError,
  publicCatalogUnavailable,
  type PublicCatalogData,
} from "@/lib/public-catalog-api";
import { createPublicCatalogPageResult, type PublicCatalogPageResult } from "@/lib/seo/public-catalog-page";

// Server-side page loaders backed by the committed snapshot. They return the
// same shapes the guarded database loaders returned, so pages render identical
// envelopes with real data and no database coupling.

export type SnapshotProductListFilters = {
  query?: string;
  category?: string;
  supermarket?: string;
  sort?: string;
  offersOnly?: boolean;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  limit?: number;
};

export type SnapshotProductListPage = {
  items: ProductSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

const SORTERS: Record<string, (left: ProductSummary, right: ProductSummary) => number> = {
  discount: (left, right) => (right.automaticDiscountPercent ?? -1) - (left.automaticDiscountPercent ?? -1),
  "price-asc": (left, right) => (left.minPrice ?? Number.POSITIVE_INFINITY) - (right.minPrice ?? Number.POSITIVE_INFINITY),
  "price-desc": (left, right) => (right.minPrice ?? Number.NEGATIVE_INFINITY) - (left.minPrice ?? Number.NEGATIVE_INFINITY),
  updated: (left, right) => (right.latestCheckedAt ?? "").localeCompare(left.latestCheckedAt ?? ""),
};

function matchesCategory(product: ProductSummary, category: string) {
  return product.category !== null && normalizeQuery(product.category) === normalizeQuery(category);
}

export function loadSnapshotProductList(filters: SnapshotProductListFilters, now: Date = new Date()): SnapshotProductListPage {
  const limit = filters.limit ?? 24;
  const page = Math.max(1, filters.page ?? 1);
  const result = searchSnapshotProducts({
    query: filters.query,
    supermarket: filters.supermarket,
    page: 1,
    pageSize: Number.MAX_SAFE_INTEGER,
    now,
  });
  const sorter = filters.sort ? SORTERS[filters.sort] : undefined;
  const items = result.products
    .map((entry) => toProductSummary(entry.product, entry.offers, now))
    .filter((product) => !filters.category || matchesCategory(product, filters.category))
    .filter((product) => !filters.offersOnly || product.automaticDiscountPercent !== null)
    .filter((product) => filters.minPrice === undefined || (product.minPrice !== null && product.minPrice >= filters.minPrice))
    .filter((product) => filters.maxPrice === undefined || (product.minPrice !== null && product.minPrice <= filters.maxPrice))
    .sort(sorter);

  const start = (page - 1) * limit;
  return {
    items: items.slice(start, start + limit),
    total: items.length,
    page,
    limit,
    totalPages: Math.ceil(items.length / limit) || 1,
  };
}

export type SnapshotProductPageCatalog = {
  product: ProductDetail | null;
  history: ProductHistory;
};

export async function loadSnapshotProductPage(
  ean: string,
  days: number,
  now: Date = new Date(),
): Promise<PublicCatalogData<SnapshotProductPageCatalog>> {
  try {
    const entry = getSnapshotProduct(ean, now);
    return {
      product: entry ? toProductDetail(entry.product, entry.offers, now) : null,
      history: buildSnapshotHistory(ean, days, entry, now),
      dataSource: "database",
      degraded: false,
      verifiedAt: getSnapshotGeneratedAt(),
      latestCheckedAt: null,
    };
  } catch (error) {
    if (error instanceof SnapshotUnavailableError) {
      throw new PublicCatalogUnavailableError();
    }
    throw error;
  }
}

// Same series palette the guarded history loader used.
const SERIES_COLORS = ["#d24726", "#2a6f58", "#4259d6"];

function buildSnapshotHistory(ean: string, days: number, entry: ReturnType<typeof getSnapshotProduct>, now: Date): ProductHistory {
  if (!entry) return { ean, days, series: [], points: [] };

  const cutoff = now.getTime() - days * 86_400_000;
  const namesBySlug = new Map(toProductDetail(entry.product, entry.offers, now).priceEntries
    .map((priceEntry) => [priceEntry.supermarket.slug, priceEntry.supermarket.name] as const));
  const observations = entry.offers
    .flatMap((offer) => offer.history.map((point) => ({ source: offer.source, price: point.price, observedAt: point.observedAt })))
    .filter((observation) => {
      const observed = Date.parse(observation.observedAt);
      return !Number.isNaN(observed) && observed >= cutoff;
    })
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt));

  const series = new Map<string, ProductHistory["series"][number]>();
  const pointsByDate = new Map<string, Record<string, number | string | null>>();
  for (const observation of observations) {
    if (!series.has(observation.source)) {
      series.set(observation.source, {
        slug: observation.source,
        name: namesBySlug.get(observation.source) ?? observation.source,
        color: SERIES_COLORS[series.size % SERIES_COLORS.length],
      });
    }
    const date = observation.observedAt.slice(0, 10);
    const point = pointsByDate.get(date) ?? { date };
    point[observation.source] = observation.price;
    pointsByDate.set(date, point);
  }

  return { ean, days, series: Array.from(series.values()), points: Array.from(pointsByDate.values()) };
}

/**
 * Snapshot-backed twin of the guarded catalog page resolver: keeps the shell
 * independent from catalog data and converts a missing or corrupt snapshot
 * into the unavailable page result.
 */
export async function resolveSnapshotCatalogPage<T extends object, Shell>(
  shell: Shell,
  loadData: () => T,
): Promise<PublicCatalogPageResult<T, Shell>> {
  try {
    const data: PublicCatalogData<T> = {
      ...loadData(),
      dataSource: "database",
      degraded: false,
      verifiedAt: getSnapshotGeneratedAt(),
      latestCheckedAt: getPublicLatestCheckedAt(loadData()),
    };
    return createPublicCatalogPageResult(shell, data);
  } catch (error) {
    if (error instanceof SnapshotUnavailableError) {
      return createPublicCatalogPageResult(shell, publicCatalogUnavailable());
    }
    throw error;
  }
}

export async function loadSnapshotSitemapCatalog(): Promise<{ products: Array<{ ean: string }> }> {
  try {
    const result = searchSnapshotProducts({ page: 1, pageSize: Number.MAX_SAFE_INTEGER });
    return { products: result.products.map(({ product }) => ({ ean: product.ean })) };
  } catch (error) {
    if (error instanceof SnapshotUnavailableError) {
      throw new PublicCatalogUnavailableError();
    }
    throw error;
  }
}
