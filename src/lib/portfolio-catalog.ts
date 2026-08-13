import "server-only";

import { isCatalogOfflineMode } from "@/lib/catalog-availability";
import type { ProductDetail, ProductSummary } from "@/lib/catalog";
import type { BasketProduct } from "@/lib/basket-products-contract";
import { getDemoProductsByEan } from "@/lib/demo-data";

type CatalogEnvironment = Record<string, string | undefined>;
type ProductDetailRouteDependencies = {
  loadDetail: (ean: string) => Promise<ProductDetail | null>;
  readCache: (ean: string) => Promise<ProductDetail | null>;
  writeCache: (ean: string, product: ProductDetail) => Promise<void>;
};

function toBasketProduct(product: ProductSummary): BasketProduct {
  return {
    ean: product.ean,
    name: product.name,
    brand: product.brand,
    imageUrl: product.imageUrl,
    minPrice: product.minPrice,
    freshMinPrice: product.freshMinPrice,
    hasFreshPrice: product.hasFreshPrice,
    priceEntries: product.entries.map((entry) => ({
      supermarket: { ...entry.supermarket },
      price: entry.price,
      isAvailable: entry.isAvailable,
      productUrl: entry.productUrl,
      freshnessStatus: entry.freshnessStatus,
    })),
  };
}

function toProductDetail(product: ProductSummary): ProductDetail {
  return {
    ean: product.ean,
    name: product.name,
    brand: product.brand,
    description: null,
    imageUrl: product.imageUrl,
    images: product.imageUrl ? [product.imageUrl] : [],
    category: product.category,
    minPrice: product.minPrice,
    maxPrice: product.maxPrice,
    freshMinPrice: product.freshMinPrice,
    displayPrice: product.displayPrice,
    displayPriceCheckedAt: product.displayPriceCheckedAt,
    displayPriceFreshnessStatus: product.displayPriceFreshnessStatus,
    hasFreshPrice: product.hasFreshPrice,
    stalePriceCount: product.stalePriceCount,
    automaticDiscountPercent: product.automaticDiscountPercent,
    bestFinalPrice: null,
    bestPriceDropAlert: null,
    priceEntries: product.entries.map((entry) => ({
      ...entry,
      supermarket: { ...entry.supermarket },
      previousPrice: null,
      deltaPercent: null,
      priceDropAlert: null,
      automaticDiscountPercent: null,
      bestPromotion: null,
      finalPrice: null,
    })),
    promotions: [],
  };
}

export async function resolveProductDetail(
  ean: string,
  loadDatabaseDetail: (ean: string) => Promise<ProductDetail | null>,
  env: CatalogEnvironment = process.env,
) {
  if (!isCatalogOfflineMode(env)) {
    return loadDatabaseDetail(ean);
  }

  const product = getDemoProductsByEan([ean])[0];
  return product ? toProductDetail(product) : null;
}

export async function resolveRouteProductDetail(
  ean: string,
  dependencies: ProductDetailRouteDependencies,
  env: CatalogEnvironment = process.env,
) {
  if (isCatalogOfflineMode(env)) {
    return resolveProductDetail(ean, dependencies.loadDetail, env);
  }

  const cached = await dependencies.readCache(ean);
  if (cached) return cached;
  const product = await dependencies.loadDetail(ean);
  if (product) await dependencies.writeCache(ean, product);
  return product;
}

export function resolveOfflineBasketProducts(eans: string[], env: CatalogEnvironment = process.env) {
  if (!isCatalogOfflineMode(env)) {
    return null;
  }

  const byEan = new Map(getDemoProductsByEan(eans).map((product) => [product.ean, toBasketProduct(product)]));
  return {
    items: eans.flatMap((ean) => byEan.get(ean) ?? []),
    missing: eans.filter((ean) => !byEan.has(ean)),
  };
}
