import type { NormalizedProduct } from "@/lib/vtex/normalize";

export type SourceAdapterType = "vtex" | "custom";

export type HealthErrorType = "hash_invalid" | "timeout" | "blocked" | "network" | "unknown";

export type HealthResult = {
  slug: string;
  isHealthy: boolean;
  hashValid: boolean;
  responseTimeMs: number;
  productsReturned: number;
  errorType: HealthErrorType | null;
  vtexHash: string | null;
};

export type FetchOptions = {
  count?: number;
  queryLimit?: number;
};

export interface SourceAdapter {
  slug: string;
  type: SourceAdapterType;
  healthCheck(): Promise<HealthResult>;
  fetchProducts(terms: string[], options?: FetchOptions): Promise<NormalizedProduct[]>;
  getDefaultTerms(limit?: number): Promise<string[]>;
}