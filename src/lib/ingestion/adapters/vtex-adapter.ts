import type { SupermarketDefinition } from "@/lib/supermarkets";
import { resolveIngestionQueryTerms } from "@/lib/ingestion/query-terms";
import {
	fetchVtexDirectProducts,
	fetchVtexProducts,
	probeVtexHash,
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
    return resolveIngestionQueryTerms({
      slug: this.slug,
      limit,
      strategy: "peer",
    });
  }
}
