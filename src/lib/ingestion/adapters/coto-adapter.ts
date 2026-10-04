import { fetchCotoProducts, cotoGroupIdFromNumber, lookupCotoByEan, type CotoSearch } from "@/lib/coto/client";
import { resolveIngestionQueryTerms } from "@/lib/ingestion/query-terms";
import type { SimplePromotion } from "@/lib/promotions/capture";
import type { NormalizedProduct } from "@/lib/vtex/normalize";

import type { DirectLookup, FetchOptions, FetchProductsResult, HealthResult, SourceAdapter } from "./types";

// Coto through its Constructor.io search (see src/lib/coto/client.ts). A
// discovered batch browses its category (the plan's numeric path ends in the
// Coto group number); a text batch searches each term. The promotions come in
// the same payload, like the paged VTEX search.

function groupIdFromPath(categoryPath: string) {
  const last = Number(categoryPath.split("/").filter(Boolean).at(-1));
  return Number.isInteger(last) ? cotoGroupIdFromNumber(last) : null;
}

function searchesFor(terms: string[], categoryPath?: string): CotoSearch[] {
  const groupId = categoryPath ? groupIdFromPath(categoryPath) : null;
  return groupId ? [{ kind: "group", groupId }] : terms.map((value) => ({ kind: "text", value }));
}

export class CotoSourceAdapter implements SourceAdapter {
  readonly slug = "coto";
  readonly type = "custom" as const;

  async healthCheck(): Promise<HealthResult> {
    const startedAt = Date.now();
    try {
      const products = await fetchCotoProducts({ search: { kind: "text", value: "leche" }, limit: 5 });
      return { slug: this.slug, isHealthy: products.length > 0, hashValid: true, responseTimeMs: Date.now() - startedAt, productsReturned: products.length, errorType: null, vtexHash: null };
    } catch {
      return { slug: this.slug, isHealthy: false, hashValid: true, responseTimeMs: Date.now() - startedAt, productsReturned: 0, errorType: "network", vtexHash: null };
    }
  }

  async fetchProducts(terms: string[], options: FetchOptions = {}): Promise<FetchProductsResult> {
    const searches = searchesFor(terms, options.categoryPath);
    const products = new Map<string, NormalizedProduct>();
    const promoByEan = new Map<string, SimplePromotion | null>();
    let pagesFailed = 0;
    for (const search of searches) {
      const page = await fetchCotoProducts({ search, limit: options.count ?? 50, retries: options.retries });
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

  async fetchDirectProducts(lookup: DirectLookup): Promise<FetchProductsResult> {
    if (lookup.kind !== "ean") return [] as FetchProductsResult;
    const found = await lookupCotoByEan(lookup.value);
    return (found ? [found.product] : []) as FetchProductsResult;
  }

  getDefaultTerms(limit?: number) {
    return resolveIngestionQueryTerms({ limit });
  }
}
