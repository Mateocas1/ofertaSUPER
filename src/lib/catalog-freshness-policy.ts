import type { PriceFreshnessStatus } from "@/lib/price-freshness";

type PublicProductSort = "relevance" | "discount" | "price-asc" | "price-desc" | "updated";

export type ComparablePriceEntry = {
  price: number | null;
  isAvailable?: boolean;
  freshnessStatus: PriceFreshnessStatus;
  lastCheckedAt?: string | null;
};

export type RankableProduct = {
  ean: string;
  name: string;
  brand: string | null;
  minPrice: number | null;
  displayPrice?: number | null;
  automaticDiscountPercent: number | null;
  latestCheckedAt: string | null;
  rankFreshnessStatus?: PriceFreshnessStatus;
};

export type PublicProductSortOptions = {
  query?: string;
  sort?: PublicProductSort;
};

export function isComparablePriceEntry(entry: ComparablePriceEntry) {
  return entry.price !== null && entry.isAvailable !== false;
}

export function isFreshComparablePriceEntry(entry: ComparablePriceEntry) {
  return isComparablePriceEntry(entry) && entry.freshnessStatus === "fresh";
}

function getFreshnessRankValue(status: PriceFreshnessStatus | undefined) {
  switch (status) {
    case "fresh":
      return 0;
    case "stale":
      return 1;
    default:
      return 2;
  }
}

export function getRankFreshnessStatus(entries: ComparablePriceEntry[]): PriceFreshnessStatus {
  const comparable = entries.filter(isComparablePriceEntry);

  if (comparable.some((entry) => entry.freshnessStatus === "fresh")) {
    return "fresh";
  }

  if (comparable.some((entry) => entry.freshnessStatus === "stale")) {
    return "stale";
  }

  return "unknown";
}

export function getBestDisplayPriceEntry<TEntry extends ComparablePriceEntry>(entries: TEntry[]) {
  const comparable = entries.filter(isComparablePriceEntry);
  const fresh = comparable.filter(isFreshComparablePriceEntry);
  const pool = fresh.length > 0 ? fresh : comparable;

  return pool.toSorted(comparePriceEntriesForDisplay)[0] ?? null;
}

export function comparePriceEntriesForDisplay(left: ComparablePriceEntry, right: ComparablePriceEntry) {
  const freshnessDiff = getFreshnessRankValue(left.freshnessStatus) - getFreshnessRankValue(right.freshnessStatus);

  if (freshnessDiff !== 0) {
    return freshnessDiff;
  }

  const priceDiff = (left.price ?? Number.MAX_SAFE_INTEGER) - (right.price ?? Number.MAX_SAFE_INTEGER);

  if (priceDiff !== 0) {
    return priceDiff;
  }

  return (right.lastCheckedAt ?? "").localeCompare(left.lastCheckedAt ?? "");
}

function scoreProduct(summary: RankableProduct, query: string) {
  const normalized = query.toLowerCase();
  const name = summary.name.toLowerCase();
  const brand = summary.brand?.toLowerCase() ?? "";

  if (summary.ean === query) {
    return 100;
  }

  if (name === normalized) {
    return 95;
  }

  if (name.startsWith(normalized)) {
    return 80;
  }

  if (brand.startsWith(normalized)) {
    return 70;
  }

  if (name.includes(normalized)) {
    return 50;
  }

  if (brand.includes(normalized)) {
    return 35;
  }

  return 0;
}

function getPublicPrice(product: RankableProduct) {
  return product.displayPrice ?? product.minPrice;
}

function compareFreshness(left: RankableProduct, right: RankableProduct) {
  return getFreshnessRankValue(left.rankFreshnessStatus) - getFreshnessRankValue(right.rankFreshnessStatus);
}

function compareDisplayPriceAsc(left: RankableProduct, right: RankableProduct) {
  return (getPublicPrice(left) ?? Number.MAX_SAFE_INTEGER) - (getPublicPrice(right) ?? Number.MAX_SAFE_INTEGER);
}

function compareDisplayPriceDesc(left: RankableProduct, right: RankableProduct) {
  return (getPublicPrice(right) ?? Number.NEGATIVE_INFINITY) - (getPublicPrice(left) ?? Number.NEGATIVE_INFINITY);
}

export function comparePublicProducts(
  left: RankableProduct,
  right: RankableProduct,
  options: PublicProductSortOptions = {},
) {
  const query = options.query?.trim();
  const sort = options.sort ?? (query ? "relevance" : "discount");

  switch (sort) {
    case "price-asc":
      return compareFreshness(left, right) || compareDisplayPriceAsc(left, right) || left.name.localeCompare(right.name, "es");
    case "price-desc":
      return compareFreshness(left, right) || compareDisplayPriceDesc(left, right) || left.name.localeCompare(right.name, "es");
    case "updated":
      return compareFreshness(left, right) || (right.latestCheckedAt ?? "").localeCompare(left.latestCheckedAt ?? "") || left.name.localeCompare(right.name, "es");
    case "relevance": {
      const freshnessDiff = compareFreshness(left, right);

      if (freshnessDiff !== 0) {
        return freshnessDiff;
      }

      const rightScore = query ? scoreProduct(right, query) : 0;
      const leftScore = query ? scoreProduct(left, query) : 0;

      return (rightScore - leftScore) || compareDisplayPriceAsc(left, right) || left.name.localeCompare(right.name, "es");
    }
    default: {
      const freshnessDiff = compareFreshness(left, right);

      if (freshnessDiff !== 0) {
        return freshnessDiff;
      }

      const rightDiscount = right.automaticDiscountPercent ?? -1;
      const leftDiscount = left.automaticDiscountPercent ?? -1;

      return (rightDiscount - leftDiscount) || compareDisplayPriceAsc(left, right) || left.name.localeCompare(right.name, "es");
    }
  }
}
