import { NextResponse, type NextRequest } from "next/server";

import { buildDatabaseCatalogResponse } from "@/lib/basket-products-contract";
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
  context: { params: Promise<{ ean: string }> },
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
    if (cached) return withRateLimitHeaders(NextResponse.json(cached), limiter.state);

    const data = await resolvePublicCatalogData(async () => ({ item: await getProductDetail(ean) }));
    if (!data.item) return withRateLimitHeaders(NextResponse.json({ error: "Product not found" }, { status: 404 }), limiter.state);
    if (!data.degraded) await setCachedJson(cacheKey, data, CACHE_TTL_SECONDS);
    const result = buildDatabaseCatalogResponse(data, publicCatalogUnavailable());
    return withRateLimitHeaders(NextResponse.json(result.body, { status: result.status }), limiter.state);
  } catch (error) {
    const response = error instanceof PublicCatalogUnavailableError
      ? NextResponse.json(buildDatabaseCatalogResponse(null, publicCatalogUnavailable()).body, { status: 503 })
      : NextResponse.json({ error: "Catalog temporarily unavailable" }, { status: 503 });
    void limiter.state.pending;
    return withRateLimitHeaders(response, limiter.state);
  }
}
