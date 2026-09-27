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
  /** ISO instant captured when the HTTP response was received. */
  observedAt?: string;
};

/**
 * Result of a direct (sku-id) lookup. The observation instant sidecar is
 * required here: direct refresh writes must be justified by a real source
 * observation instant, never by the processing clock.
 */
export type ObservedFetchProductsResult = FetchProductsResult & {
  observedAt: string;
};

export type FetchOptions = {
  count?: number;
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
	): Promise<ObservedFetchProductsResult>;
  getDefaultTerms(limit?: number): Promise<string[]>;
}
