import "server-only";

import { slugify } from "@/lib/slugify";
import type { SimplePromotion } from "@/lib/promotions/simple-promos";

import catalogSnapshot from "../../data/catalog-snapshot.json";

export const SNAPSHOT_SCHEMA_VERSION = 2;

export type CatalogSnapshot = {
  schemaVersion: number;
  generatedAt: string;
  sources: string[];
  products: {
    ean: string;
    name: string;
    brand: string | null;
    imageUrl: string | null;
    category: string | null;
    categorySlug: string | null;
  }[];
  offers: {
    ean: string;
    source: string;
    price: number | null;
    listPrice: number | null;
    promo: SimplePromotion | null;
    available: boolean;
    productUrl: string | null;
    observedAt: string;
    history: { price: number | null; listPrice: number | null; observedAt: string }[];
  }[];
};

export class SnapshotUnavailableError extends Error {}

function isCatalogSnapshot(value: unknown): value is CatalogSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<CatalogSnapshot>;
  return (
    typeof candidate.schemaVersion === "number" &&
    typeof candidate.generatedAt === "string" &&
    Array.isArray(candidate.products) &&
    Array.isArray(candidate.offers)
  );
}

function readSnapshot(): CatalogSnapshot {
  if (!isCatalogSnapshot(catalogSnapshot)) {
    throw new SnapshotUnavailableError("catalog snapshot is missing or malformed");
  }
  return catalogSnapshot;
}

// Health probe: proves the bundled snapshot loads and is structurally usable.
export function probeCatalogSnapshot(): { generatedAt: string } {
  const snapshot = readSnapshot();
  if (snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION || snapshot.products.length === 0) {
    throw new SnapshotUnavailableError("catalog snapshot has an unexpected schema or no products");
  }
  return { generatedAt: snapshot.generatedAt };
}

// Search matches against name, brand and EAN, case-insensitively and without
// accents, so "Leche", "leche" and "lácteo"-style queries behave the same.
export function normalizeQuery(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

const PAGE_SIZE = 24;

export type SnapshotOffer = CatalogSnapshot["offers"][number];
export type SnapshotProduct = CatalogSnapshot["products"][number];

export type OfferWithFreshness = SnapshotOffer & {
  freshness: { fresh: boolean; ageHours: number | null; observedAt: string };
};

// Freshness is computed per request against an injected clock, never stored:
// a page that renders this at build time would freeze the verdict.
export function offerFreshness(
  offer: SnapshotOffer,
  now: Date,
  maxAgeHours = 24,
): OfferWithFreshness["freshness"] {
  const observed = new Date(offer.observedAt);
  if (Number.isNaN(observed.getTime())) {
    return { fresh: false, ageHours: null, observedAt: offer.observedAt };
  }
  const ageHours = (now.getTime() - observed.getTime()) / 3_600_000;
  return { fresh: ageHours >= 0 && ageHours <= maxAgeHours, ageHours, observedAt: offer.observedAt };
}

function withFreshness(offer: SnapshotOffer, now: Date): OfferWithFreshness {
  return { ...offer, freshness: offerFreshness(offer, now) };
}

function matchesQuery(product: SnapshotProduct, haystack: string): boolean {
  return [product.name, product.brand ?? "", product.ean]
    .map(normalizeQuery)
    .some((field) => field.includes(haystack));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Search ranking, shared by /api/search, /api/products and /buscar:
// 0) exact EAN match; 1) name starts with the term; 2) term as a whole word
// in the name without a preceding "de" (so "dulce de leche" is not leche);
// 3) any other name or brand match. Ties break by supermarkets with an
// offer, then by name.
export function snapshotMatchRank(
  product: { ean: string; name: string },
  query: string,
): 0 | 1 | 2 | 3 {
  if (product.ean === query.trim()) return 0;
  const term = normalizeQuery(query);
  const name = normalizeQuery(product.name);
  if (name.startsWith(term)) return 1;
  const wholeWord = new RegExp(
    `(?<![\\p{L}\\p{N}])(?<!de )${escapeRegExp(term)}(?![\\p{L}\\p{N}])`,
    "u",
  );
  if (term.length > 0 && wholeWord.test(name)) return 2;
  return 3;
}

export type SnapshotProductResult = {
  product: SnapshotProduct;
  offers: OfferWithFreshness[];
  minPrice: number | null;
  maxPrice: number | null;
  freshCount: number;
};

function buildProductResult(
  snapshot: CatalogSnapshot,
  product: SnapshotProduct,
  now: Date,
): SnapshotProductResult {
  const offers = snapshot.offers
    .filter((offer) => offer.ean === product.ean)
    .map((offer) => withFreshness(offer, now));
  const eligible = offers.filter((offer) => offer.available && offer.price !== null);

  return {
    product,
    offers,
    minPrice: eligible.length > 0 ? Math.min(...eligible.map((offer) => offer.price!)) : null,
    maxPrice: eligible.length > 0 ? Math.max(...eligible.map((offer) => offer.price!)) : null,
    freshCount: offers.filter((offer) => offer.freshness.fresh).length,
  };
}

export type SnapshotListResult = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  products: SnapshotProductResult[];
};

function filterAndRankProducts(
  snapshot: CatalogSnapshot,
  query: string | null,
  supermarket: string | null,
): SnapshotProduct[] {
  const matching = snapshot.products
    .filter((product) => query === null || matchesQuery(product, query))
    .filter((product) => {
      if (supermarket === null) return true;
      return snapshot.offers.some(
        (offer) => offer.ean === product.ean && offer.source === supermarket,
      );
    });

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

export function searchSnapshotProducts(options: {
  query?: string;
  supermarket?: string;
  page?: number;
  pageSize?: number;
  now?: Date;
}): SnapshotListResult {
  const snapshot = readSnapshot();
  const now = options.now ?? new Date();
  const pageSize = options.pageSize ?? PAGE_SIZE;
  const query = options.query !== undefined ? normalizeQuery(options.query) : null;
  const supermarket = options.supermarket ?? null;
  const page = Math.max(1, options.page ?? 1);

  const matching = filterAndRankProducts(snapshot, query, supermarket);

  const start = (page - 1) * pageSize;
  const slice = matching.slice(start, start + pageSize);

  return {
    total: matching.length,
    page,
    pageSize,
    totalPages: Math.ceil(matching.length / pageSize) || 1,
    products: slice.map((product) => buildProductResult(snapshot, product, now)),
  };
}

export function getSnapshotProduct(ean: string, now?: Date): SnapshotProductResult | null {
  const snapshot = readSnapshot();
  const product = snapshot.products.find((entry) => entry.ean === ean);
  if (!product) return null;
  return buildProductResult(snapshot, product, now ?? new Date());
}

export function getSnapshotSources(): string[] {
  return readSnapshot().sources;
}

export function getSnapshotGeneratedAt(): string {
  return readSnapshot().generatedAt;
}

// Product counts keyed by category slug, the snapshot twin of the guarded
// groupBy over the serving projection.
export function getSnapshotCategoryCounts(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const product of readSnapshot().products) {
    if (product.category === null) continue;
    const slug = slugify(product.category);
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  return counts;
}
