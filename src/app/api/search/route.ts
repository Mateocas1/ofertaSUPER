import { NextResponse, type NextRequest } from "next/server";

import { badRequestResponse, searchParamsToObject } from "@/lib/api";
import { getSearchSuggestions } from "@/lib/catalog";
import { buildSearchCacheKey } from "@/lib/cache-keys";
import { getCachedJson, setCachedJson } from "@/lib/redis";
import { rejectIfRateLimited, withRateLimitHeaders } from "@/lib/rate-limit";
import {
  PublicCatalogUnavailableError,
  publicCatalogUnavailable,
  reclassifyCachedPublicCatalogData,
  resolvePublicCatalogData,
  type PublicCatalogData,
} from "@/lib/public-catalog-api";
import { searchQuerySchema } from "@/lib/schemas/search";

const CACHE_TTL_SECONDS = 300;

export async function GET(request: NextRequest) {
  const limiter = await rejectIfRateLimited(request, "search");

  if (limiter.response) {
    void limiter.state.pending;
    return limiter.response;
  }

  try {
    const parsed = searchQuerySchema.parse(searchParamsToObject(request.nextUrl));
    const cacheKey = buildSearchCacheKey(parsed.q, parsed.limit);
    const cached = reclassifyCachedPublicCatalogData(
      await getCachedJson<PublicCatalogData<{ items: Awaited<ReturnType<typeof getSearchSuggestions>> }>>(cacheKey),
    );

    if (cached) {
      const response = NextResponse.json(cached);
      void limiter.state.pending;
      return withRateLimitHeaders(response, limiter.state);
    }

    const data = await resolvePublicCatalogData(
      async () => ({ items: await getSearchSuggestions(parsed.q, parsed.limit) }),
    );

    if (!data.degraded) {
      await setCachedJson(cacheKey, data, CACHE_TTL_SECONDS);
    }

    const response = NextResponse.json(data);
    void limiter.state.pending;
    return withRateLimitHeaders(response, limiter.state);
  } catch (error) {
    const response = error instanceof PublicCatalogUnavailableError
      ? NextResponse.json(publicCatalogUnavailable(), { status: 503 })
      : badRequestResponse(error);
    void limiter.state.pending;
    return withRateLimitHeaders(response, limiter.state);
  }
}
