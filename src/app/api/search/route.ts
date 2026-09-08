import { NextResponse, type NextRequest } from "next/server";

import { badRequestResponse, searchParamsToObject } from "@/lib/api";
import { buildDatabaseCatalogResponse } from "@/lib/basket-products-contract";
import { getSearchSuggestions } from "@/lib/catalog";
import { buildSearchCacheKey } from "@/lib/cache-keys";
import { getCachedJson, setCachedJson } from "@/lib/redis";
import { admitStrictPublicRoute, withRateLimitHeaders } from "@/lib/rate-limit";
import {
  createPublicCatalogCacheEnvelope,
  PublicCatalogUnavailableError,
  publicCatalogUnavailable,
  readPublicCatalogCacheEnvelope,
  resolvePublicCatalogDataFromAuthority,
} from "@/lib/public-catalog-api";
import { resolvePublicCatalogRuntimeAuthority } from "@/lib/public-catalog-runtime.server";
import { searchQuerySchema } from "@/lib/schemas/search";

const CACHE_TTL_SECONDS = 300;

export async function GET(request: NextRequest) {
  const admission = await admitStrictPublicRoute(request, "search");
  if (admission.status === "exhausted") {
    return withRateLimitHeaders(NextResponse.json({ error: "Rate limit exceeded", message: "Too many requests. Try again in a moment." }, { status: 429 }), admission.state);
  }
  if (admission.status === "unavailable") {
    return NextResponse.json(buildDatabaseCatalogResponse(null, publicCatalogUnavailable()).body, { status: 503 });
  }
  void admission.global.pending;
  void admission.client.pending;

  const authority = await resolvePublicCatalogRuntimeAuthority();
  if (!authority) {
    return NextResponse.json(buildDatabaseCatalogResponse(null, publicCatalogUnavailable()).body, { status: 503 });
  }

  try {
    const parsed = searchQuerySchema.parse(searchParamsToObject(request.nextUrl));
    const cacheKey = buildSearchCacheKey(parsed.q, parsed.limit);
    const cached = readPublicCatalogCacheEnvelope<{ items: Awaited<ReturnType<typeof getSearchSuggestions>> }>(
      await getCachedJson<unknown>(cacheKey),
      authority,
    );

    if (cached) {
      const response = NextResponse.json(cached);
      return withRateLimitHeaders(response, admission.client);
    }

    const data = await resolvePublicCatalogDataFromAuthority(
      async () => ({ items: await getSearchSuggestions(parsed.q, parsed.limit) }),
      authority,
    );

    if (!data.degraded) {
      const envelope = createPublicCatalogCacheEnvelope(authority, data);
      if (envelope) await setCachedJson(cacheKey, envelope, CACHE_TTL_SECONDS);
    }

    const result = buildDatabaseCatalogResponse(data, publicCatalogUnavailable());
    const response = NextResponse.json(result.body, { status: result.status });
    return withRateLimitHeaders(response, admission.client);
  } catch (error) {
    const response = error instanceof PublicCatalogUnavailableError
      ? NextResponse.json(buildDatabaseCatalogResponse(null, publicCatalogUnavailable()).body, { status: 503 })
      : badRequestResponse(error);
    return withRateLimitHeaders(response, admission.client);
  }
}
