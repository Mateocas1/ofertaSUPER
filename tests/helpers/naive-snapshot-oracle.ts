import { normalizeGtin } from "../../src/lib/identity/gtin";
import {
  normalizeQuery,
  offerFreshness,
  snapshotMatchRank,
  type CatalogSnapshot,
  type SnapshotListResult,
  type SnapshotProduct,
  type SnapshotProductResult,
} from "../../src/lib/catalog-snapshot";
import { toProductSummary } from "../../src/lib/catalog-snapshot-adapters";
import type { SnapshotProductListFilters, SnapshotProductListPage } from "../../src/lib/public-pages";

// Reference copy of the snapshot read path as it was before the per-EAN index
// (origin/master e0195c9): every product scans every offer. It is slow on
// purpose and exists only so equivalence tests can prove the indexed read path
// returns exactly the same products, offers, ordering and totals.

function gtinKey(value: string): string {
  return normalizeGtin(value) ?? value;
}

function buildProductResult(snapshot: CatalogSnapshot, product: SnapshotProduct, now: Date): SnapshotProductResult {
  const offers = snapshot.offers
    .filter((offer) => offer.ean === product.ean)
    .map((offer) => ({ ...offer, freshness: offerFreshness(offer, now) }));
  const eligible = offers.filter((offer) => offer.available && offer.price !== null);
  return {
    product,
    offers,
    minPrice: eligible.length > 0 ? Math.min(...eligible.map((offer) => offer.price!)) : null,
    maxPrice: eligible.length > 0 ? Math.max(...eligible.map((offer) => offer.price!)) : null,
    freshCount: offers.filter((offer) => offer.freshness.fresh).length,
  };
}

function matchesQuery(product: SnapshotProduct, haystack: string): boolean {
  return [product.name, product.brand ?? "", product.ean]
    .map(normalizeQuery)
    .some((field) => field.includes(haystack));
}

function filterAndRankProducts(snapshot: CatalogSnapshot, query: string | null, supermarket: string | null): SnapshotProduct[] {
  const matching = snapshot.products
    .filter((product) => query === null || matchesQuery(product, query))
    .filter((product) => supermarket === null
      || snapshot.offers.some((offer) => offer.ean === product.ean && offer.source === supermarket));
  const offersWithPrice = new Map<string, number>();
  for (const offer of snapshot.offers) {
    if (offer.available && offer.price !== null) {
      offersWithPrice.set(offer.ean, (offersWithPrice.get(offer.ean) ?? 0) + 1);
    }
  }
  matching.sort((left, right) =>
    snapshotMatchRank(left, query ?? "") - snapshotMatchRank(right, query ?? "")
    || (offersWithPrice.get(right.ean) ?? 0) - (offersWithPrice.get(left.ean) ?? 0)
    || left.name.localeCompare(right.name));
  return matching;
}

export function naiveSearch(
  snapshot: CatalogSnapshot,
  options: { query?: string; supermarket?: string; page?: number; pageSize?: number; now: Date },
): SnapshotListResult {
  const pageSize = options.pageSize ?? 24;
  const query = options.query !== undefined ? normalizeQuery(options.query) : null;
  const page = Math.max(1, options.page ?? 1);
  const matching = filterAndRankProducts(snapshot, query, options.supermarket ?? null);
  const start = (page - 1) * pageSize;
  return {
    total: matching.length,
    page,
    pageSize,
    totalPages: Math.ceil(matching.length / pageSize) || 1,
    products: matching.slice(start, start + pageSize).map((product) => buildProductResult(snapshot, product, options.now)),
  };
}

export function naiveGetProduct(snapshot: CatalogSnapshot, ean: string, now: Date): SnapshotProductResult | null {
  const key = gtinKey(ean);
  const product = snapshot.products.find((entry) => gtinKey(entry.ean) === key);
  return product ? buildProductResult(snapshot, product, now) : null;
}

const SORTERS: Record<string, (left: ReturnType<typeof toProductSummary>, right: ReturnType<typeof toProductSummary>) => number> = {
  discount: (left, right) => (right.automaticDiscountPercent ?? -1) - (left.automaticDiscountPercent ?? -1),
  "price-asc": (left, right) => (left.minPrice ?? Number.POSITIVE_INFINITY) - (right.minPrice ?? Number.POSITIVE_INFINITY),
  "price-desc": (left, right) => (right.minPrice ?? Number.NEGATIVE_INFINITY) - (left.minPrice ?? Number.NEGATIVE_INFINITY),
  updated: (left, right) => (right.latestCheckedAt ?? "").localeCompare(left.latestCheckedAt ?? ""),
};

export function naiveProductList(snapshot: CatalogSnapshot, filters: SnapshotProductListFilters, now: Date): SnapshotProductListPage {
  const limit = filters.limit ?? 24;
  const page = Math.max(1, filters.page ?? 1);
  const result = naiveSearch(snapshot, { query: filters.query, supermarket: filters.supermarket, page: 1, pageSize: Number.MAX_SAFE_INTEGER, now });
  const sorter = filters.sort ? SORTERS[filters.sort] : undefined;
  const items = result.products
    .map((entry) => toProductSummary(entry.product, entry.offers, now))
    .filter((product) => !filters.category
      || (product.category !== null && normalizeQuery(product.category) === normalizeQuery(filters.category)))
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

export function naiveSitemapEans(snapshot: CatalogSnapshot): Array<{ ean: string }> {
  return filterAndRankProducts(snapshot, null, null).map((product) => ({ ean: product.ean }));
}
