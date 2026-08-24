import { NextResponse, type NextRequest } from "next/server";

import { getProductDetail } from "@/lib/catalog";
import { buildProductDetailCacheKey } from "@/lib/cache-keys";
import {
  PublicCatalogUnavailableError,
  publicCatalogUnavailable,
  reclassifyCachedPublicCatalogData,
  resolvePublicCatalogData,
  type PublicCatalogData,
} from "@/lib/public-catalog-api";
import { getCachedJson, setCachedJson } from "@/lib/redis";
import { rejectIfRateLimited, withRateLimitHeaders } from "@/lib/rate-limit";

const CACHE_TTL_SECONDS = 300;

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{ ean: string }>;
  },
) {
  const limiter = await rejectIfRateLimited(request, "product-detail");

  if (limiter.response) {
    void limiter.state.pending;
    return limiter.response;
  }

  const { ean } = await context.params;

  try {
    const cacheKey = buildProductDetailCacheKey(ean);
    const cached = reclassifyCachedPublicCatalogData(
      await getCachedJson<PublicCatalogData<{ item: Awaited<ReturnType<typeof getProductDetail>> }>>(cacheKey),
    );
    if (cached) {
      const response = NextResponse.json(cached);
      void limiter.state.pending;
      return withRateLimitHeaders(response, limiter.state);
    }

    const data = await resolvePublicCatalogData(async () => ({ item: await getProductDetail(ean) }));
    if (!data.item) {
      const response = NextResponse.json({ error: "Product not found" }, { status: 404 });
      void limiter.state.pending;
      return withRateLimitHeaders(response, limiter.state);
    }

    if (!data.degraded) {
      await setCachedJson(cacheKey, data, CACHE_TTL_SECONDS);
    }

    const response = NextResponse.json(data);
    void limiter.state.pending;
    return withRateLimitHeaders(response, limiter.state);
  } catch (error) {
    const response = error instanceof PublicCatalogUnavailableError
      ? NextResponse.json(publicCatalogUnavailable(), { status: 503 })
      : NextResponse.json({ error: "Catalog temporarily unavailable" }, { status: 503 });
    void limiter.state.pending;
    return withRateLimitHeaders(response, limiter.state);
  }
}
