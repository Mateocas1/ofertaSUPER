import type { SupermarketDefinition } from "@/lib/supermarkets";
import { resolveIngestionQueryTerms } from "@/lib/ingestion/query-terms";
import type { SimplePromotion } from "@/lib/promotions/capture";
import {
	fetchVtexCatalogPages,
	fetchVtexDirectProducts,
	fetchVtexProducts,
	probeVtexHash,
	VTEX_CATALOG_PAGE_SIZE,
	type VtexCatalogSearch,
} from "@/lib/vtex/client";
import type { NormalizedProduct } from "@/lib/vtex/normalize";

import type {
	DirectLookup,
	FetchOptions,
	FetchProductsResult,
	HealthResult,
	SourceAdapter,
} from "./types";

export class VtexSourceAdapter implements SourceAdapter {
  readonly slug: string;
  readonly type = "vtex" as const;

  constructor(private readonly supermarket: SupermarketDefinition) {
    this.slug = supermarket.slug;
  }

  async healthCheck(): Promise<HealthResult> {
    const result = await probeVtexHash({
      baseUrl: this.supermarket.baseUrl,
    });

    return {
      slug: this.slug,
      isHealthy: result.isHealthy,
      hashValid: result.hashValid,
      responseTimeMs: result.responseTimeMs,
      productsReturned: result.productsReturned,
      errorType: result.errorType,
      vtexHash: result.hash,
    };
  }

	async fetchProducts(
		terms: string[],
		options: FetchOptions = {},
	): Promise<FetchProductsResult> {
    const count = options.count ?? 50;
    // A category path, or more results than one autocomplete page holds,
    // goes through the paged REST catalog search instead.
    if (options.categoryPath) {
      return this.fetchCatalogPages([{ kind: "category", path: options.categoryPath }], count, options.retries);
    }
    if (count > VTEX_CATALOG_PAGE_SIZE) {
      return this.fetchCatalogPages(terms.map((value) => ({ kind: "text", value })), count, options.retries);
    }

    const uniqueProducts = new Map<string, NormalizedProduct>();
    let fallbackUsed = false;

    for (const term of terms) {
      const products = await fetchVtexProducts({
        baseUrl: this.supermarket.baseUrl,
        query: term,
        count,
        retries: options.retries,
      });
      fallbackUsed ||= products.fallbackUsed === true;

      for (const product of products) {
        uniqueProducts.set(product.ean, product);
      }
    }

    const result = Array.from(uniqueProducts.values()) as FetchProductsResult;
    if (fallbackUsed) result.fallbackUsed = true;
    return result;
  }

  private async fetchCatalogPages(searches: VtexCatalogSearch[], count: number, retries?: number): Promise<FetchProductsResult> {
    const products = new Map<string, NormalizedProduct>();
    const promoByEan = new Map<string, SimplePromotion | null>();
    let pagesFailed = 0;
    for (const search of searches) {
      const page = await fetchVtexCatalogPages({ baseUrl: this.supermarket.baseUrl, search, limit: count, retries });
      pagesFailed += page.pagesFailed ?? 0;
      for (const product of page) {
        if (products.has(product.ean)) continue;
        products.set(product.ean, product);
        promoByEan.set(product.ean, page.promoByEan?.get(product.ean) ?? null);
      }
    }
    const result = Array.from(products.values()) as FetchProductsResult;
    result.promoByEan = promoByEan;
    result.pagesFailed = pagesFailed;
    return result;
  }

	async fetchDirectProducts(
		lookup: DirectLookup,
		options: FetchOptions = {},
	): Promise<FetchProductsResult> {
		return fetchVtexDirectProducts({
			baseUrl: this.supermarket.baseUrl,
			lookup,
			retries: options.retries,
		});
	}

  getDefaultTerms(limit?: number) {
    return resolveIngestionQueryTerms({ limit });
  }
}
