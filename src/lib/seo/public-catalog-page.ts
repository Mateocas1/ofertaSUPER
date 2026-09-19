import { cache } from "react";

import type { ProductDetail, ProductHistory } from "@/lib/catalog";
import { loadProductPageData } from "@/lib/product-history";
import {
  PublicCatalogUnavailableError,
  type PublicCatalogData,
  type PublicCatalogUnavailable,
} from "@/lib/public-catalog-api";

export type ProductPageCatalog = {
  product: ProductDetail | null;
  history: ProductHistory;
};

export type ProductCatalogPageResult = PublicCatalogPageResult<ProductPageCatalog, { ean: string }>;

type ProductPageDataLoader = (ean: string, days: number) => ReturnType<typeof loadProductPageData>;
type ProductPageResultLoader = (ean: string, days: number) => Promise<ProductCatalogPageResult>;
type ProductPageResultMemoizer = (loader: ProductPageResultLoader) => ProductPageResultLoader;

export type PublicCatalogPageResult<T extends object, Shell> =
  | {
    availability: "eligible";
    shell: Shell;
    catalog: PublicCatalogData<T>;
  }
  | {
    availability: "unavailable";
    shell: Shell;
  };

/**
 * Keeps static page chrome independent from guarded catalog data. An unavailable
 * result intentionally has no catalog property, preventing commercial fields
 * from crossing the guarded boundary into a page render.
 */
export function createPublicCatalogPageResult<T extends object, Shell>(
  shell: Shell,
  result: PublicCatalogData<T> | PublicCatalogUnavailable,
): PublicCatalogPageResult<T, Shell> {
  if (result.dataSource === "unavailable") {
    return { availability: "unavailable", shell };
  }

  return { availability: "eligible", shell, catalog: result };
}

export function createProductPageResult(
  ean: string,
  result: PublicCatalogData<ProductPageCatalog> | PublicCatalogUnavailable,
): ProductCatalogPageResult {
  return createPublicCatalogPageResult({ ean }, result);
}

/**
 * React cache deduplicates this non-fetch guarded load within one server render.
 * It does not create a durable or cross-request cache entry.
 */
export function createGuardedProductPageLoader(
  loadData: ProductPageDataLoader = loadProductPageData,
  memoize: ProductPageResultMemoizer = cache,
): ProductPageResultLoader {
  return memoize(async (ean, days) => {
    try {
      return createProductPageResult(ean, await loadData(ean, days));
    } catch (error) {
      if (error instanceof PublicCatalogUnavailableError) {
        return createProductPageResult(ean, {
          error: "Catalog temporarily unavailable",
          dataSource: "unavailable",
          degraded: false,
          verifiedAt: null,
        });
      }

      throw error;
    }
  });
}
