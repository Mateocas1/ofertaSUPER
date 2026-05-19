import "server-only";

import { type Prisma } from "@prisma/client";
import { cache } from "react";

import { db } from "@/lib/db";
import {
  comparePriceAgainstHistory,
  getBiggestPriceDropAlert,
  type PriceDropAlert,
} from "@/lib/promotions/alerts";
import { detectAutomaticDiscount, getBestPromotionPrice } from "@/lib/promotions/detect";
import { calculateProductCandidateReadLimit } from "@/lib/catalog-query-planning";
import { classifyPriceFreshness, type PriceFreshnessStatus } from "@/lib/price-freshness";
import { DETAILED_CATEGORIES } from "@/lib/vtex/categories";

type PriceEntryRecord = {
  supermarket: {
    id: number;
    name: string;
    slug: string;
    logo_url: string | null;
    freshness_sla_hours: number;
  };
  id: number;
  price: Prisma.Decimal | null;
  list_price: Prisma.Decimal | null;
  reference_price: Prisma.Decimal | null;
  reference_unit: string | null;
  is_available: boolean;
  product_url: string | null;
  last_checked_at: Date;
};

export type ProductPriceEntry = {
  supermarket: {
    id: number;
    name: string;
    slug: string;
    logoUrl: string | null;
  };
  supermarketProductId: number;
  price: number | null;
  listPrice: number | null;
  referencePrice: number | null;
  referenceUnit: string | null;
  isAvailable: boolean;
  productUrl: string | null;
  lastCheckedAt: string;
  freshnessSlaHours: number;
  freshnessStatus: PriceFreshnessStatus;
};

export type ProductSummary = {
  ean: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  category: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  priceCount: number;
  automaticDiscountPercent: number | null;
  latestCheckedAt: string | null;
  bestPriceCheckedAt: string | null;
  bestPriceFreshnessStatus: PriceFreshnessStatus;
  entries: ProductPriceEntry[];
};

export type ProductDetail = {
  ean: string;
  name: string;
  brand: string | null;
  description: string | null;
  imageUrl: string | null;
  images: string[];
  category: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  automaticDiscountPercent: number | null;
  bestFinalPrice: number | null;
  bestPriceDropAlert: PriceDropAlert | null;
  priceEntries: Array<
    ProductPriceEntry & {
      previousPrice: number | null;
      deltaPercent: number | null;
      priceDropAlert: PriceDropAlert | null;
      automaticDiscountPercent: number | null;
      bestPromotion: PromotionSummary | null;
      finalPrice: number | null;
    }
  >;
  promotions: PromotionSummary[];
};

export type HistorySeries = {
  slug: string;
  name: string;
  color: string;
};

export type ProductHistory = {
  ean: string;
  days: number;
  series: HistorySeries[];
  points: Array<Record<string, number | string | null>>;
};

export type CategorySummary = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  count: number;
  children: CategorySummary[];
};

export type PromotionSummary = {
  id: number;
  title: string;
  type: "2x1" | "2nd_50" | "wallet_discount" | "bank_discount" | "percentage";
  discountValue: number | null;
  walletProvider: string | null;
  bankName: string | null;
  conditions: string | null;
  startDate: string | null;
  endDate: string | null;
  supermarket: {
    id: number;
    name: string;
    slug: string;
    logoUrl: string | null;
  };
  productCount: number;
};

export type ProductListFilters = {
  query?: string;
  category?: string;
  supermarket?: string;
  sort?: "relevance" | "discount" | "price-asc" | "price-desc" | "updated";
  offersOnly?: boolean;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  limit?: number;
};

export type PromotionFilters = {
  supermarket?: string;
  wallet?: string;
  type?: PromotionSummary["type"];
};

const seriesColors = ["#d24726", "#2a6f58", "#4259d6", "#c77d00", "#7b3fe4", "#d13d7a"];

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function toNumber(value: Prisma.Decimal | null) {
  return value === null ? null : Number(value);
}

function toIsoDate(value: Date | null) {
  return value ? value.toISOString() : null;
}

function normalizePromotionType(type: string): PromotionSummary["type"] {
  switch (type) {
    case "TWO_FOR_ONE":
      return "2x1";
    case "SECOND_HALF":
      return "2nd_50";
    case "WALLET_DISCOUNT":
      return "wallet_discount";
    case "BANK_DISCOUNT":
      return "bank_discount";
    default:
      return "percentage";
  }
}

function mapPromotionSummary(promotion: {
  id: number;
  title: string;
  type: string;
  discount_value: Prisma.Decimal | null;
  wallet_provider: string | null;
  bank_name: string | null;
  conditions: string | null;
  start_date: Date | null;
  end_date: Date | null;
  supermarket: {
    id: number;
    name: string;
    slug: string;
    logo_url: string | null;
  };
  promotion_products: Array<{ product_ean: string }>;
}): PromotionSummary {
  return {
    id: promotion.id,
    title: promotion.title,
    type: normalizePromotionType(promotion.type),
    discountValue: toNumber(promotion.discount_value),
    walletProvider: promotion.wallet_provider,
    bankName: promotion.bank_name,
    conditions: promotion.conditions,
    startDate: toIsoDate(promotion.start_date),
    endDate: toIsoDate(promotion.end_date),
    supermarket: {
      id: promotion.supermarket.id,
      name: promotion.supermarket.name,
      slug: promotion.supermarket.slug,
      logoUrl: promotion.supermarket.logo_url,
    },
    productCount: promotion.promotion_products.length,
  };
}

function mapPriceEntries(entries: PriceEntryRecord[], supermarketFilter?: string) {
  const filtered = supermarketFilter
    ? entries.filter((entry) => entry.supermarket.slug === supermarketFilter)
    : entries;

  return filtered
    .map((entry) => ({
      supermarket: {
        id: entry.supermarket.id,
        name: entry.supermarket.name,
        slug: entry.supermarket.slug,
        logoUrl: entry.supermarket.logo_url,
      },
      supermarketProductId: entry.id,
      price: toNumber(entry.price),
      listPrice: toNumber(entry.list_price),
      referencePrice: toNumber(entry.reference_price),
      referenceUnit: entry.reference_unit,
      isAvailable: entry.is_available,
      productUrl: entry.product_url,
      lastCheckedAt: entry.last_checked_at.toISOString(),
      freshnessSlaHours: entry.supermarket.freshness_sla_hours,
      freshnessStatus: classifyPriceFreshness(entry.last_checked_at, {
        maxAgeHours: entry.supermarket.freshness_sla_hours,
      }).status,
    }))
    .filter((entry) => entry.price !== null)
    .sort((left, right) => (left.price ?? Number.MAX_SAFE_INTEGER) - (right.price ?? Number.MAX_SAFE_INTEGER));
}

function mapProductSummary(
  product: {
    ean: string;
    name: string;
    brand: string | null;
    image_url: string | null;
    category: string | null;
    supermarket_products: PriceEntryRecord[];
  },
  filters: ProductListFilters,
): ProductSummary | null {
  const entries = mapPriceEntries(product.supermarket_products, filters.supermarket);

  if (entries.length === 0) {
    return null;
  }

  const numericPrices = entries.map((entry) => entry.price).filter((entry): entry is number => entry !== null);
  const minPrice = numericPrices.length > 0 ? Math.min(...numericPrices) : null;
  const maxPrice = numericPrices.length > 0 ? Math.max(...numericPrices) : null;
  const bestPriceEntry = minPrice === null ? null : entries.find((entry) => entry.price === minPrice) ?? null;
  const automaticDiscountPercent = entries.reduce<number | null>((best, entry) => {
    const discount = detectAutomaticDiscount(entry.price, entry.listPrice);

    if (discount === null) {
      return best;
    }

    return best === null ? discount.percentOff : Math.max(best, discount.percentOff);
  }, null);

  const latestCheckedAt = entries
    .map((entry) => entry.lastCheckedAt)
    .sort((left, right) => right.localeCompare(left))[0] ?? null;

  return {
    ean: product.ean,
    name: product.name,
    brand: product.brand,
    imageUrl: product.image_url,
    category: product.category,
    minPrice,
    maxPrice,
    priceCount: entries.length,
    automaticDiscountPercent,
    latestCheckedAt,
    bestPriceCheckedAt: bestPriceEntry?.lastCheckedAt ?? null,
    bestPriceFreshnessStatus: bestPriceEntry?.freshnessStatus ?? "unknown",
    entries,
  };
}

function scoreProduct(summary: ProductSummary, query: string) {
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

function sortProducts(items: ProductSummary[], filters: ProductListFilters) {
  const query = filters.query?.trim();
  const sort = filters.sort ?? (query ? "relevance" : "discount");

  return items.toSorted((left, right) => {
    switch (sort) {
      case "price-asc":
        return (left.minPrice ?? Number.MAX_SAFE_INTEGER) - (right.minPrice ?? Number.MAX_SAFE_INTEGER);
      case "price-desc":
        return (right.minPrice ?? -1) - (left.minPrice ?? -1);
      case "updated":
        return (right.latestCheckedAt ?? "").localeCompare(left.latestCheckedAt ?? "");
      case "relevance": {
        const rightScore = query ? scoreProduct(right, query) : 0;
        const leftScore = query ? scoreProduct(left, query) : 0;

        if (rightScore !== leftScore) {
          return rightScore - leftScore;
        }

        return left.name.localeCompare(right.name, "es");
      }
      default: {
        const rightDiscount = right.automaticDiscountPercent ?? -1;
        const leftDiscount = left.automaticDiscountPercent ?? -1;

        if (rightDiscount !== leftDiscount) {
          return rightDiscount - leftDiscount;
        }

        return (left.minPrice ?? Number.MAX_SAFE_INTEGER) - (right.minPrice ?? Number.MAX_SAFE_INTEGER);
      }
    }
  });
}

function filterProducts(items: ProductSummary[], filters: ProductListFilters) {
  return items.filter((item) => {
    if (filters.offersOnly && !(item.automaticDiscountPercent && item.automaticDiscountPercent > 0)) {
      return false;
    }

    if (filters.minPrice !== undefined && (item.minPrice === null || item.minPrice < filters.minPrice)) {
      return false;
    }

    if (filters.maxPrice !== undefined && (item.minPrice === null || item.minPrice > filters.maxPrice)) {
      return false;
    }

    return true;
  });
}

async function findRawProducts(filters: ProductListFilters) {
  const where: Prisma.ProductWhereInput = {
    AND: [
      filters.query
        ? {
            OR: [
              { ean: { equals: filters.query } },
              { name: { contains: filters.query, mode: "insensitive" } },
              { brand: { contains: filters.query, mode: "insensitive" } },
            ],
          }
        : {},
      filters.category
        ? {
            category: { equals: filters.category, mode: "insensitive" },
          }
        : {},
      filters.supermarket
        ? {
            supermarket_products: {
              some: {
                supermarket: {
                  slug: filters.supermarket,
                },
                price: { not: null },
              },
            },
          }
        : {},
    ],
  };

  return db.product.findMany({
    where,
    take: calculateProductCandidateReadLimit(filters),
    select: {
      ean: true,
      name: true,
      brand: true,
      image_url: true,
      category: true,
      supermarket_products: {
        where: {
          price: { not: null },
        },
        select: {
          id: true,
          price: true,
          list_price: true,
          reference_price: true,
          reference_unit: true,
          is_available: true,
          product_url: true,
          last_checked_at: true,
          supermarket: {
            select: {
              id: true,
              name: true,
              slug: true,
              logo_url: true,
              freshness_sla_hours: true,
            },
          },
        },
      },
    },
  });
}

export async function listProducts(filters: ProductListFilters = {}) {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 24;
  const rawProducts = await findRawProducts(filters);
  const mapped = rawProducts
    .map((product) => mapProductSummary(product, filters))
    .filter((product): product is ProductSummary => product !== null);
  const filtered = filterProducts(mapped, filters);
  const sorted = sortProducts(filtered, filters);
  const offset = (page - 1) * limit;

  return {
    items: sorted.slice(offset, offset + limit),
    total: sorted.length,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(sorted.length / limit)),
  };
}

const getProductDetailCached = cache(async (ean: string): Promise<ProductDetail | null> => {
  const product = await db.product.findUnique({
    where: { ean },
    select: {
      ean: true,
      name: true,
      brand: true,
      description: true,
      image_url: true,
      images: true,
      category: true,
      supermarket_products: {
        where: {
          price: { not: null },
        },
        orderBy: {
          price: "asc",
        },
        select: {
          id: true,
          price: true,
          list_price: true,
          reference_price: true,
          reference_unit: true,
          is_available: true,
          product_url: true,
          last_checked_at: true,
          supermarket: {
            select: {
              id: true,
              name: true,
              slug: true,
              logo_url: true,
              freshness_sla_hours: true,
            },
          },
          price_history: {
            orderBy: {
              scraped_at: "desc",
            },
            take: 2,
            select: {
              price: true,
            },
          },
        },
      },
      promotion_products: {
        select: {
          promotion: {
            select: {
              id: true,
              title: true,
              type: true,
              discount_value: true,
              wallet_provider: true,
              bank_name: true,
              conditions: true,
              start_date: true,
              end_date: true,
              is_active: true,
              supermarket: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  logo_url: true,
                },
              },
              promotion_products: {
                select: {
                  product_ean: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!product) {
    return null;
  }

  const supermarketIds = product.supermarket_products.map((entry) => entry.supermarket.id);
  const rawPromotions =
    supermarketIds.length > 0
      ? await db.promotion.findMany({
          where: {
            is_active: true,
            supermarket_id: {
              in: supermarketIds,
            },
            AND: [
              {
                OR: [{ start_date: null }, { start_date: { lte: new Date() } }],
              },
              {
                OR: [{ end_date: null }, { end_date: { gte: new Date() } }],
              },
              {
                OR: [{ promotion_products: { some: { product_ean: ean } } }, { promotion_products: { none: {} } }],
              },
            ],
          },
          orderBy: [{ discount_value: "desc" }, { title: "asc" }],
          select: {
            id: true,
            title: true,
            type: true,
            discount_value: true,
            wallet_provider: true,
            bank_name: true,
            conditions: true,
            start_date: true,
            end_date: true,
            supermarket: {
              select: {
                id: true,
                name: true,
                slug: true,
                logo_url: true,
              },
            },
            promotion_products: {
              select: {
                product_ean: true,
              },
            },
          },
        })
      : [];

  const promotions = rawPromotions.map(mapPromotionSummary);

  const priceEntries = product.supermarket_products.map((entry) => {
    const currentPrice = toNumber(entry.price);
    const previousPrice = toNumber(entry.price_history[1]?.price ?? null);
    const priceMovement = comparePriceAgainstHistory(currentPrice, previousPrice);
    const automaticDiscount = detectAutomaticDiscount(currentPrice, toNumber(entry.list_price));
    const applicablePromotions = promotions.filter(
      (promotion) => promotion.supermarket.id === entry.supermarket.id,
    );
    const bestPromotionResult = getBestPromotionPrice(currentPrice, applicablePromotions);

    return {
      supermarket: {
        id: entry.supermarket.id,
        name: entry.supermarket.name,
        slug: entry.supermarket.slug,
        logoUrl: entry.supermarket.logo_url,
      },
      supermarketProductId: entry.id,
      price: currentPrice,
      listPrice: toNumber(entry.list_price),
      referencePrice: toNumber(entry.reference_price),
      referenceUnit: entry.reference_unit,
      isAvailable: entry.is_available,
      productUrl: entry.product_url,
      lastCheckedAt: entry.last_checked_at.toISOString(),
      freshnessSlaHours: entry.supermarket.freshness_sla_hours,
      freshnessStatus: classifyPriceFreshness(entry.last_checked_at, {
        maxAgeHours: entry.supermarket.freshness_sla_hours,
      }).status,
      previousPrice: priceMovement.previousPrice,
      deltaPercent: priceMovement.deltaPercent,
      priceDropAlert: priceMovement.priceDropAlert,
      automaticDiscountPercent: automaticDiscount?.percentOff ?? null,
      bestPromotion: bestPromotionResult?.promotion ?? null,
      finalPrice: bestPromotionResult?.finalPrice ?? null,
    };
  });

  const prices = priceEntries.map((entry) => entry.price).filter((entry): entry is number => entry !== null);
  const finalPrices = priceEntries
    .map((entry) => entry.finalPrice)
    .filter((entry): entry is number => entry !== null);
  const automaticDiscountPercent = priceEntries.reduce<number | null>((best, entry) => {
    if (entry.automaticDiscountPercent === null) {
      return best;
    }

    return best === null
      ? entry.automaticDiscountPercent
      : Math.max(best, entry.automaticDiscountPercent);
  }, null);

  return {
    ean: product.ean,
    name: product.name,
    brand: product.brand,
    description: product.description,
    imageUrl: product.image_url,
    images: product.images,
    category: product.category,
    minPrice: prices.length > 0 ? Math.min(...prices) : null,
    maxPrice: prices.length > 0 ? Math.max(...prices) : null,
    automaticDiscountPercent,
    bestFinalPrice: finalPrices.length > 0 ? Math.min(...finalPrices) : null,
    bestPriceDropAlert: getBiggestPriceDropAlert(priceEntries.map((entry) => entry.priceDropAlert)),
    priceEntries,
    promotions,
  };
});

export function getProductDetail(ean: string) {
  return getProductDetailCached(ean);
}

export async function getProductHistory(ean: string, days = 30): Promise<ProductHistory> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const history = await db.priceHistory.findMany({
    where: {
      scraped_at: { gte: cutoff },
      supermarket_product: {
        product_ean: ean,
      },
    },
    orderBy: {
      scraped_at: "asc",
    },
    select: {
      price: true,
      scraped_at: true,
      supermarket_product: {
        select: {
          supermarket: {
            select: {
              name: true,
              slug: true,
            },
          },
        },
      },
    },
  });

  const seriesMap = new Map<string, HistorySeries>();
  const pointsMap = new Map<string, Record<string, number | string | null>>();

  for (const entry of history) {
    const slug = entry.supermarket_product.supermarket.slug;
    const name = entry.supermarket_product.supermarket.name;
    const date = entry.scraped_at.toISOString().slice(0, 10);

    if (!seriesMap.has(slug)) {
      seriesMap.set(slug, {
        slug,
        name,
        color: seriesColors[seriesMap.size % seriesColors.length],
      });
    }

    const existing = pointsMap.get(date) ?? { date };
    existing[slug] = toNumber(entry.price);
    pointsMap.set(date, existing);
  }

  return {
    ean,
    days,
    series: Array.from(seriesMap.values()),
    points: Array.from(pointsMap.values()),
  };
}

const getCategoriesCached = cache(async () => {
  const categories = await db.category.findMany({
    orderBy: [{ parent_id: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      icon: true,
      parent_id: true,
    },
  });

  if (categories.length > 0) {
    const productCounts = await db.product.groupBy({
      by: ["category"],
      _count: true,
      where: {
        category: { not: null },
      },
    });

    const counts = new Map(productCounts.map((entry) => [slugify(entry.category ?? ""), entry._count]));
    const byParent = new Map<number | null, CategorySummary[]>();

    for (const entry of categories) {
      const node: CategorySummary = {
        id: String(entry.id),
        name: entry.name,
        slug: entry.slug,
        icon: entry.icon,
        count: counts.get(entry.slug) ?? 0,
        children: [],
      };

      const bucket = byParent.get(entry.parent_id) ?? [];
      bucket.push(node);
      byParent.set(entry.parent_id, bucket);
    }

    const attachChildren = (nodes: CategorySummary[]) => {
      for (const node of nodes) {
        node.children = byParent.get(Number(node.id)) ?? [];
        attachChildren(node.children);
      }
    };

    const roots = byParent.get(null) ?? [];
    attachChildren(roots);
    return roots;
  }

  const productCounts = await db.product.groupBy({
    by: ["category"],
    _count: true,
    where: {
      category: { not: null },
    },
    orderBy: {
      _count: {
        category: "desc",
      },
    },
  });

  const iconMap = new Map(DETAILED_CATEGORIES.map((entry) => [entry.name, entry.slug]));

  return productCounts
    .filter((entry) => entry.category)
    .map((entry) => ({
      id: slugify(entry.category ?? ""),
      name: entry.category ?? "Sin categoria",
      slug: slugify(entry.category ?? ""),
      icon: iconMap.get(entry.category ?? "") ?? null,
      count: entry._count,
      children: [],
    }));
});

export function getCategories() {
  return getCategoriesCached();
}

function findCategoryBySlug(items: CategorySummary[], slug: string): CategorySummary | null {
  for (const item of items) {
    if (item.slug === slug) {
      return item;
    }

    const childMatch = findCategoryBySlug(item.children, slug);

    if (childMatch) {
      return childMatch;
    }
  }

  return null;
}

export async function getCategoryBySlug(slug: string) {
  const categories = await getCategories();
  return findCategoryBySlug(categories, slug);
}

export async function getSearchSuggestions(query: string, limit = 8) {
  const result = await listProducts({
    query,
    limit,
    page: 1,
    sort: "relevance",
  });

  return result.items.slice(0, limit).map((item) => ({
    ean: item.ean,
    name: item.name,
    brand: item.brand,
    imageUrl: item.imageUrl,
    category: item.category,
    minPrice: item.minPrice,
    latestCheckedAt: item.latestCheckedAt,
    bestPriceCheckedAt: item.bestPriceCheckedAt,
    freshnessStatus: item.bestPriceFreshnessStatus,
  }));
}

export async function getPromotions(filters: PromotionFilters = {}) {
  const now = new Date();
  const promotions = await db.promotion.findMany({
    where: {
      is_active: true,
      supermarket: filters.supermarket
        ? {
            slug: filters.supermarket,
          }
        : undefined,
      wallet_provider: filters.wallet
        ? {
            contains: filters.wallet,
            mode: "insensitive",
          }
        : undefined,
      type: filters.type
        ? {
            equals:
              filters.type === "2x1"
                ? "TWO_FOR_ONE"
                : filters.type === "2nd_50"
                  ? "SECOND_HALF"
                  : filters.type === "wallet_discount"
                    ? "WALLET_DISCOUNT"
                    : filters.type === "bank_discount"
                      ? "BANK_DISCOUNT"
                      : "PERCENTAGE",
          }
        : undefined,
      AND: [
        {
          OR: [{ start_date: null }, { start_date: { lte: now } }],
        },
        {
          OR: [{ end_date: null }, { end_date: { gte: now } }],
        },
      ],
    },
    orderBy: [{ discount_value: "desc" }, { title: "asc" }],
    select: {
      id: true,
      title: true,
      type: true,
      discount_value: true,
      wallet_provider: true,
      bank_name: true,
      conditions: true,
      start_date: true,
      end_date: true,
      supermarket: {
        select: {
          id: true,
          name: true,
          slug: true,
          logo_url: true,
        },
      },
      promotion_products: {
        select: {
          product_ean: true,
        },
      },
    },
  });

  return promotions.map((promotion) => ({
    ...mapPromotionSummary(promotion),
  }));
}
