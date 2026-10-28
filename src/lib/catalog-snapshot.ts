import "server-only";

import { normalizeGtin } from "@/lib/identity/gtin";
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

// Schema-only gate shared by the read path and the data-contract tests: a
// snapshot that does not parse is unavailable, never partially served.
export function parseCatalogSnapshot(value: unknown): CatalogSnapshot {
  if (!isCatalogSnapshot(value)) {
    throw new SnapshotUnavailableError("catalog snapshot is missing or malformed");
  }
  return value;
}

// Test-only seam. The public read path always serves the committed snapshot;
// a test injects a committed fixture so behavior tests keep their own
// expectations when the daily refresh rewrites the real data. Application
// code never calls this.
let snapshotOverrideForTests: CatalogSnapshot | null = null;

export function setSnapshotOverrideForTests(snapshot: CatalogSnapshot | null): void {
  snapshotOverrideForTests = snapshot;
}

function readSnapshot(): CatalogSnapshot {
  return parseCatalogSnapshot(snapshotOverrideForTests ?? catalogSnapshot);
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

// Snapshot keys are canonical GTIN-14 (older snapshots hold the source form);
// any GTIN form of a key, such as an EAN-13 from an old link, matches it.
function gtinKey(value: string): string {
  return normalizeGtin(value) ?? value;
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
  if (gtinKey(product.ean) === gtinKey(query.trim())) return 0;
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

// Everything the read path needs per EAN, built in one pass over the snapshot
// and kept for the life of the process. Without it every product scanned every
// offer, so a full catalog pass cost products x offers (about 10-16 s of CPU
// on the October 2026 snapshot) on each request to /sitemap.xml, /ofertas and
// /categoria. Keyed by snapshot object so a test override gets its own index.
type SnapshotIndex = {
  offersByEan: Map<string, SnapshotOffer[]>;
  pricedOfferCount: Map<string, number>;
  productByGtin: Map<string, SnapshotProduct>;
  gtinKeys: string[];
  searchFields: string[][];
  defaultOrder: SnapshotProduct[] | null;
};

const snapshotIndexes = new WeakMap<CatalogSnapshot, SnapshotIndex>();
// Same ordering as String.prototype.localeCompare with no arguments, without
// building a collator on each comparison.
const nameCollator = new Intl.Collator();

function snapshotIndex(snapshot: CatalogSnapshot): SnapshotIndex {
  const cached = snapshotIndexes.get(snapshot);
  if (cached) return cached;

  const offersByEan = new Map<string, SnapshotOffer[]>();
  const pricedOfferCount = new Map<string, number>();
  for (const offer of snapshot.offers) {
    const offers = offersByEan.get(offer.ean);
    if (offers) offers.push(offer);
    else offersByEan.set(offer.ean, [offer]);
    if (offer.available && offer.price !== null) {
      pricedOfferCount.set(offer.ean, (pricedOfferCount.get(offer.ean) ?? 0) + 1);
    }
  }

  const productByGtin = new Map<string, SnapshotProduct>();
  const gtinKeys = snapshot.products.map((product) => {
    const key = gtinKey(product.ean);
    if (!productByGtin.has(key)) productByGtin.set(key, product);
    return key;
  });
  const searchFields = snapshot.products.map((product) =>
    [product.name, product.brand ?? "", product.ean].map(normalizeQuery));

  const index = { offersByEan, pricedOfferCount, productByGtin, gtinKeys, searchFields, defaultOrder: null };
  snapshotIndexes.set(snapshot, index);
  return index;
}

function buildProductResult(
  index: SnapshotIndex,
  product: SnapshotProduct,
  now: Date,
): SnapshotProductResult {
  const offers = (index.offersByEan.get(product.ean) ?? []).map((offer) => withFreshness(offer, now));
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
  index: SnapshotIndex,
  query: string | null,
  supermarket: string | null,
): SnapshotProduct[] {
  const unfiltered = query === null && supermarket === null;
  if (unfiltered && index.defaultOrder) return index.defaultOrder;

  // Rank is computed once per product, not once per comparison. With no query
  // every name starts with the empty term, so only an EAN equal to the empty
  // query's key can rank above the rest.
  const emptyKey = gtinKey("");
  const ranked: { product: SnapshotProduct; rank: number }[] = [];
  snapshot.products.forEach((product, position) => {
    if (query !== null && !index.searchFields[position].some((field) => field.includes(query))) return;
    if (supermarket !== null
      && !(index.offersByEan.get(product.ean) ?? []).some((offer) => offer.source === supermarket)) return;
    const rank = query === null
      ? (index.gtinKeys[position] === emptyKey ? 0 : 1)
      : snapshotMatchRank(product, query);
    ranked.push({ product, rank });
  });

  ranked.sort((left, right) =>
    left.rank - right.rank
    || (index.pricedOfferCount.get(right.product.ean) ?? 0) - (index.pricedOfferCount.get(left.product.ean) ?? 0)
    || nameCollator.compare(left.product.name, right.product.name));
  const matching = ranked.map(({ product }) => product);
  if (unfiltered) index.defaultOrder = matching;
  return matching;
}

/**
 * Products matching a search, in search ranking order, without building their
 * offers, so callers can cut to a page before paying for offer results.
 * Treat the returned array as read-only: the unfiltered order is shared.
 */
export function rankSnapshotProducts(options: { query?: string; supermarket?: string }): readonly SnapshotProduct[] {
  const snapshot = readSnapshot();
  const query = options.query !== undefined ? normalizeQuery(options.query) : null;
  return filterAndRankProducts(snapshot, snapshotIndex(snapshot), query, options.supermarket ?? null);
}

/** Raw offers of one EAN in the current snapshot, in snapshot order. */
export function getSnapshotOffers(ean: string): readonly SnapshotOffer[] {
  return snapshotIndex(readSnapshot()).offersByEan.get(ean) ?? [];
}

/** Offers, price range and freshness for one product of the current snapshot. */
export function buildSnapshotProductResult(product: SnapshotProduct, now: Date): SnapshotProductResult {
  return buildProductResult(snapshotIndex(readSnapshot()), product, now);
}

export function searchSnapshotProducts(options: {
  query?: string;
  supermarket?: string;
  page?: number;
  pageSize?: number;
  now?: Date;
}): SnapshotListResult {
  const snapshot = readSnapshot();
  const index = snapshotIndex(snapshot);
  const now = options.now ?? new Date();
  const pageSize = options.pageSize ?? PAGE_SIZE;
  const query = options.query !== undefined ? normalizeQuery(options.query) : null;
  const supermarket = options.supermarket ?? null;
  const page = Math.max(1, options.page ?? 1);

  const matching = filterAndRankProducts(snapshot, index, query, supermarket);

  const start = (page - 1) * pageSize;
  const slice = matching.slice(start, start + pageSize);

  return {
    total: matching.length,
    page,
    pageSize,
    totalPages: Math.ceil(matching.length / pageSize) || 1,
    products: slice.map((product) => buildProductResult(index, product, now)),
  };
}

export function getSnapshotProduct(ean: string, now?: Date): SnapshotProductResult | null {
  const index = snapshotIndex(readSnapshot());
  const product = index.productByGtin.get(gtinKey(ean));
  if (!product) return null;
  return buildProductResult(index, product, now ?? new Date());
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
