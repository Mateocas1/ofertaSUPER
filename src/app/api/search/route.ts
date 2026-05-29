import { NextResponse, type NextRequest } from "next/server";

import { badRequestResponse, searchParamsToObject } from "@/lib/api";
import { isCatalogRuntimeAvailable } from "@/lib/catalog-availability";
import { getSearchSuggestions } from "@/lib/catalog";
import { buildSearchCacheKey } from "@/lib/cache-keys";
import { getDemoSearchSuggestions } from "@/lib/demo-data";
import { getCachedJson, setCachedJson } from "@/lib/redis";
import { rejectIfRateLimited, withRateLimitHeaders } from "@/lib/rate-limit";
import { withFallback } from "@/lib/safe-data";
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
    const cached = await getCachedJson(cacheKey);

    if (cached) {
      const response = NextResponse.json({ items: cached });
      void limiter.state.pending;
      return withRateLimitHeaders(response, limiter.state);
    }

    const fallbackItems = getDemoSearchSuggestions(parsed.q, parsed.limit);
    const canUseCatalog = await isCatalogRuntimeAvailable();
    const items = canUseCatalog
      ? await withFallback(getSearchSuggestions(parsed.q, parsed.limit), fallbackItems)
      : fallbackItems;

    if (items !== fallbackItems) {
      await setCachedJson(cacheKey, items, CACHE_TTL_SECONDS);
    }

    const response = NextResponse.json({ items });
    void limiter.state.pending;
    return withRateLimitHeaders(response, limiter.state);
  } catch (error) {
    const response = badRequestResponse(error);
    void limiter.state.pending;
    return withRateLimitHeaders(response, limiter.state);
  }
}
