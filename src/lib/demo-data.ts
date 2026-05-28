import type { CategorySummary, ProductListFilters, ProductSummary, PromotionSummary } from "@/lib/catalog";
import {
  comparePublicProducts,
  getBestDisplayPriceEntry,
  getRankFreshnessStatus,
  isComparablePriceEntry,
  isFreshComparablePriceEntry,
} from "@/lib/catalog-freshness-policy";
import { classifyPriceFreshness } from "@/lib/price-freshness";

const checkedAt = "2026-05-14T00:00:00.000Z";
const freshnessSlaHours = 24;
const demoFreshnessStatus = classifyPriceFreshness(checkedAt, { maxAgeHours: freshnessSlaHours }).status;

const demoProducts: ProductSummary[] = [
  {
    ean: "7790001000011",
    name: "Leche entera larga vida 1L",
    brand: "La Serenisima",
    imageUrl: null,
    category: "Lacteos",
    minPrice: 1200,
    maxPrice: 1450,
    freshMinPrice: demoFreshnessStatus === "fresh" ? 1200 : null,
    displayPrice: 1200,
    displayPriceCheckedAt: checkedAt,
    displayPriceFreshnessStatus: demoFreshnessStatus,
    hasFreshPrice: demoFreshnessStatus === "fresh",
    stalePriceCount: demoFreshnessStatus === "stale" ? 3 : 0,
    rankFreshnessStatus: demoFreshnessStatus,
    priceCount: 3,
    automaticDiscountPercent: demoFreshnessStatus === "fresh" ? 17.2 : null,
    latestCheckedAt: checkedAt,
    bestPriceCheckedAt: checkedAt,
    bestPriceFreshnessStatus: demoFreshnessStatus,
    entries: [
      {
        supermarket: { id: 1, name: "Disco", slug: "disco", logoUrl: null },
        supermarketProductId: 1,
        price: 1200,
        listPrice: 1450,
        referencePrice: 1200,
        referenceUnit: "un",
        isAvailable: true,
        productUrl: "https://www.disco.com.ar/leche-entera-1l/p",
        lastCheckedAt: checkedAt,
        freshnessSlaHours,
        freshnessStatus: demoFreshnessStatus,
      },
      {
        supermarket: { id: 2, name: "Jumbo", slug: "jumbo", logoUrl: null },
        supermarketProductId: 2,
        price: 1320,
        listPrice: 1320,
        referencePrice: 1320,
        referenceUnit: "un",
        isAvailable: true,
        productUrl: "https://www.jumbo.com.ar/leche-entera-1l/p",
        lastCheckedAt: checkedAt,
        freshnessSlaHours,
        freshnessStatus: demoFreshnessStatus,
      },
      {
        supermarket: { id: 3, name: "Carrefour", slug: "carrefour", logoUrl: null },
        supermarketProductId: 3,
        price: 1450,
        listPrice: 1450,
        referencePrice: 1450,
        referenceUnit: "un",
        isAvailable: true,
        productUrl: "https://www.carrefour.com.ar/leche-entera-1l/p",
        lastCheckedAt: checkedAt,
        freshnessSlaHours,
        freshnessStatus: demoFreshnessStatus,
      },
    ],
  },
  {
    ean: "7790002000022",
    name: "Yerba mate suave 1kg",
    brand: "Playadito",
    imageUrl: null,
    category: "Almacen",
    minPrice: 3100,
    maxPrice: 3890,
    freshMinPrice: demoFreshnessStatus === "fresh" ? 3100 : null,
    displayPrice: 3100,
    displayPriceCheckedAt: checkedAt,
    displayPriceFreshnessStatus: demoFreshnessStatus,
    hasFreshPrice: demoFreshnessStatus === "fresh",
    stalePriceCount: demoFreshnessStatus === "stale" ? 3 : 0,
    rankFreshnessStatus: demoFreshnessStatus,
    priceCount: 3,
    automaticDiscountPercent: demoFreshnessStatus === "fresh" ? 20.3 : null,
    latestCheckedAt: checkedAt,
    bestPriceCheckedAt: checkedAt,
    bestPriceFreshnessStatus: demoFreshnessStatus,
    entries: [
      {
        supermarket: { id: 2, name: "Jumbo", slug: "jumbo", logoUrl: null },
        supermarketProductId: 4,
        price: 3100,
        listPrice: 3890,
        referencePrice: 3100,
        referenceUnit: "kg",
        isAvailable: true,
        productUrl: "https://www.jumbo.com.ar/yerba-mate-suave-1kg/p",
        lastCheckedAt: checkedAt,
        freshnessSlaHours,
        freshnessStatus: demoFreshnessStatus,
      },
      {
        supermarket: { id: 1, name: "Disco", slug: "disco", logoUrl: null },
        supermarketProductId: 5,
        price: 3490,
        listPrice: 3490,
        referencePrice: 3490,
        referenceUnit: "kg",
        isAvailable: true,
        productUrl: "https://www.disco.com.ar/yerba-mate-suave-1kg/p",
        lastCheckedAt: checkedAt,
        freshnessSlaHours,
        freshnessStatus: demoFreshnessStatus,
      },
      {
        supermarket: { id: 3, name: "Carrefour", slug: "carrefour", logoUrl: null },
        supermarketProductId: 6,
        price: 3890,
        listPrice: 3890,
        referencePrice: 3890,
        referenceUnit: "kg",
        isAvailable: true,
        productUrl: "https://www.carrefour.com.ar/yerba-mate-suave-1kg/p",
        lastCheckedAt: checkedAt,
        freshnessSlaHours,
        freshnessStatus: demoFreshnessStatus,
      },
    ],
  },
  {
    ean: "7790003000033",
    name: "Aceite de girasol 900ml",
    brand: "Natura",
    imageUrl: null,
    category: "Almacen",
    minPrice: 1750,
    maxPrice: 2100,
    freshMinPrice: demoFreshnessStatus === "fresh" ? 1750 : null,
    displayPrice: 1750,
    displayPriceCheckedAt: checkedAt,
    displayPriceFreshnessStatus: demoFreshnessStatus,
    hasFreshPrice: demoFreshnessStatus === "fresh",
    stalePriceCount: demoFreshnessStatus === "stale" ? 2 : 0,
    rankFreshnessStatus: demoFreshnessStatus,
    priceCount: 2,
    automaticDiscountPercent: demoFreshnessStatus === "fresh" ? 16.7 : null,
    latestCheckedAt: checkedAt,
    bestPriceCheckedAt: checkedAt,
    bestPriceFreshnessStatus: demoFreshnessStatus,
    entries: [
      {
        supermarket: { id: 3, name: "Carrefour", slug: "carrefour", logoUrl: null },
        supermarketProductId: 7,
        price: 1750,
        listPrice: 2100,
        referencePrice: 1944.44,
        referenceUnit: "lt",
        isAvailable: true,
        productUrl: "https://www.carrefour.com.ar/aceite-girasol-900ml/p",
        lastCheckedAt: checkedAt,
        freshnessSlaHours,
        freshnessStatus: demoFreshnessStatus,
      },
      {
        supermarket: { id: 1, name: "Disco", slug: "disco", logoUrl: null },
        supermarketProductId: 8,
        price: 2100,
        listPrice: 2100,
        referencePrice: 2333.33,
        referenceUnit: "lt",
        isAvailable: true,
        productUrl: "https://www.disco.com.ar/aceite-girasol-900ml/p",
        lastCheckedAt: checkedAt,
        freshnessSlaHours,
        freshnessStatus: demoFreshnessStatus,
      },
    ],
  },
  {
    ean: "7790004000044",
    name: "Arroz largo fino 1kg",
    brand: "Gallo",
    imageUrl: null,
    category: "Almacen",
    minPrice: 980,
    maxPrice: 1180,
    freshMinPrice: demoFreshnessStatus === "fresh" ? 980 : null,
    displayPrice: 980,
    displayPriceCheckedAt: checkedAt,
    displayPriceFreshnessStatus: demoFreshnessStatus,
    hasFreshPrice: demoFreshnessStatus === "fresh",
    stalePriceCount: demoFreshnessStatus === "stale" ? 2 : 0,
    rankFreshnessStatus: demoFreshnessStatus,
    priceCount: 2,
    automaticDiscountPercent: null,
    latestCheckedAt: checkedAt,
    bestPriceCheckedAt: checkedAt,
    bestPriceFreshnessStatus: demoFreshnessStatus,
    entries: [
      {
        supermarket: { id: 1, name: "Disco", slug: "disco", logoUrl: null },
        supermarketProductId: 9,
        price: 980,
        listPrice: 980,
        referencePrice: 980,
        referenceUnit: "kg",
        isAvailable: true,
        productUrl: "https://www.disco.com.ar/arroz-largo-fino-1kg/p",
        lastCheckedAt: checkedAt,
        freshnessSlaHours,
        freshnessStatus: demoFreshnessStatus,
      },
      {
        supermarket: { id: 2, name: "Jumbo", slug: "jumbo", logoUrl: null },
        supermarketProductId: 10,
        price: 1180,
        listPrice: 1180,
        referencePrice: 1180,
        referenceUnit: "kg",
        isAvailable: true,
        productUrl: "https://www.jumbo.com.ar/arroz-largo-fino-1kg/p",
        lastCheckedAt: checkedAt,
        freshnessSlaHours,
        freshnessStatus: demoFreshnessStatus,
      },
    ],
  },
];

export const demoCategories: CategorySummary[] = [
  { id: "1", name: "Almacen", slug: "almacen", icon: null, count: 3, children: [] },
  { id: "2", name: "Lacteos", slug: "lacteos", icon: null, count: 1, children: [] },
  { id: "3", name: "Bebidas", slug: "bebidas", icon: null, count: 0, children: [] },
];

export const demoPromotions: PromotionSummary[] = [
  {
    id: 1,
    title: "20% con billetera virtual",
    type: "wallet_discount",
    discountValue: 20,
    walletProvider: "Mercado Pago",
    bankName: null,
    conditions: "Tope sujeto a la promo informada por el comercio.",
    startDate: null,
    endDate: null,
    supermarket: {
      id: 1,
      name: "Disco",
      slug: "disco",
      logoUrl: null,
    },
    productCount: 4,
  },
  {
    id: 2,
    title: "2da unidad al 50%",
    type: "2nd_50",
    discountValue: null,
    walletProvider: null,
    bankName: null,
    conditions: "Aplica a productos seleccionados.",
    startDate: null,
    endDate: null,
    supermarket: {
      id: 2,
      name: "Jumbo",
      slug: "jumbo",
      logoUrl: null,
    },
    productCount: 2,
  },
];

function normalizeSearchText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function matchesQuery(product: ProductSummary, query: string) {
  if (!query) {
    return true;
  }

  const haystack = [
    product.ean,
    product.name,
    product.brand,
    product.category,
    ...product.entries.map((entry) => entry.supermarket.name),
  ]
    .map(normalizeSearchText)
    .join(" ");

  return haystack.includes(query);
}

function scopeToSupermarket(product: ProductSummary, supermarket?: string) {
  if (!supermarket) {
    return product;
  }

  const entries = product.entries.filter((entry) => entry.supermarket.slug === supermarket);

  if (entries.length === 0) {
    return null;
  }

  const comparableEntries = entries.filter(isComparablePriceEntry);
  const freshEntries = comparableEntries.filter(isFreshComparablePriceEntry);
  const prices = comparableEntries.map((entry) => entry.price).filter((price): price is number => price !== null);
  const freshPrices = freshEntries.map((entry) => entry.price).filter((price): price is number => price !== null);
  const displayEntry = getBestDisplayPriceEntry(entries);

  return {
    ...product,
    entries,
    minPrice: prices.length > 0 ? Math.min(...prices) : null,
    maxPrice: prices.length > 0 ? Math.max(...prices) : null,
    freshMinPrice: freshPrices.length > 0 ? Math.min(...freshPrices) : null,
    displayPrice: displayEntry?.price ?? null,
    displayPriceCheckedAt: displayEntry?.lastCheckedAt ?? null,
    displayPriceFreshnessStatus: displayEntry?.freshnessStatus ?? "unknown",
    hasFreshPrice: freshEntries.length > 0,
    stalePriceCount: entries.filter((entry) => entry.freshnessStatus === "stale").length,
    rankFreshnessStatus: getRankFreshnessStatus(entries),
    priceCount: entries.length,
    automaticDiscountPercent: freshEntries.reduce<number | null>((best, entry) => {
      const price = entry.price;
      const listPrice = entry.listPrice;

      if (price === null || listPrice === null || listPrice <= price) {
        return best;
      }

      const percentOff = ((listPrice - price) / listPrice) * 100;
      return best === null ? percentOff : Math.max(best, percentOff);
    }, null),
    latestCheckedAt: entries.map((entry) => entry.lastCheckedAt).sort((left, right) => right.localeCompare(left))[0] ?? null,
    bestPriceCheckedAt: displayEntry?.lastCheckedAt ?? null,
    bestPriceFreshnessStatus: displayEntry?.freshnessStatus ?? "unknown",
  };
}

function sortDemoProducts(products: ProductSummary[], filters: ProductListFilters) {
  return products.toSorted((left, right) =>
    comparePublicProducts(left, right, {
      query: filters.query,
      sort: filters.sort,
    }),
  );
}

export function getDemoProductPage(filters: ProductListFilters = {}) {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? demoProducts.length;
  const query = normalizeSearchText(filters.query).trim();
  const scopedProducts = demoProducts
    .filter((product) => matchesQuery(product, query))
    .map((product) => scopeToSupermarket(product, filters.supermarket))
    .filter((product): product is ProductSummary => product !== null);
  const sorted = sortDemoProducts(scopedProducts, filters);
  const offset = (page - 1) * limit;
  const items = sorted.slice(offset, offset + limit);

  return {
    items,
    total: sorted.length,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(sorted.length / limit)),
  };
}

export function getDemoSearchSuggestions(query: string, limit = 8) {
  return getDemoProductPage({ query, limit, page: 1 }).items.map((product) => ({
    ean: product.ean,
    name: product.name,
    brand: product.brand,
    imageUrl: product.imageUrl,
    category: product.category,
    minPrice: product.displayPrice,
    displayPrice: product.displayPrice,
    latestCheckedAt: product.latestCheckedAt,
    bestPriceCheckedAt: product.displayPriceCheckedAt,
    freshnessStatus: product.displayPriceFreshnessStatus,
  }));
}
