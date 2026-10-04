import type { SimplePromotion } from "@/lib/promotions/capture";
import type { NormalizedProduct } from "@/lib/vtex/normalize";

type SourceAdapterType = "vtex" | "custom";

type HealthErrorType =
	| "hash_invalid"
	| "timeout"
	| "blocked"
	| "network"
	| "unknown";

export type HealthResult = {
  slug: string;
  isHealthy: boolean;
  hashValid: boolean;
  responseTimeMs: number;
  productsReturned: number;
  errorType: HealthErrorType | null;
  vtexHash: string | null;
};

export type FetchProductsResult = NormalizedProduct[] & {
  fallbackUsed?: boolean;
  /** Promotions read from the search payload itself (paged REST search). */
  promoByEan?: Map<string, SimplePromotion | null>;
  pagesFailed?: number;
};

export type FetchOptions = {
  count?: number;
  /** VTEX category path (`/<department>/<category>/`); searched instead of the terms. */
  categoryPath?: string;
  queryLimit?: number;
	retries?: number;
};

export type DirectLookup = {
	kind: "sku-id" | "ean";
	value: string;
};

export interface SourceAdapter {
  slug: string;
  type: SourceAdapterType;
  healthCheck(): Promise<HealthResult>;
	fetchProducts(
		terms: string[],
		options?: FetchOptions,
	): Promise<FetchProductsResult>;
	fetchDirectProducts(
		lookup: DirectLookup,
		options?: FetchOptions,
	): Promise<FetchProductsResult>;
  getDefaultTerms(limit?: number): Promise<string[]>;
}
