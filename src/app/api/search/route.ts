import { NextResponse, type NextRequest } from "next/server";

import { badRequestResponse, searchParamsToObject } from "@/lib/api";
import { buildDatabaseCatalogResponse } from "@/lib/basket-products-contract";
import { admitStrictPublicRoute, withRateLimitHeaders } from "@/lib/rate-limit";
import {
  loadPublicSearchSuggestions,
  PublicCatalogUnavailableError,
  publicCatalogUnavailable,
  resolvePublicCatalogDataFromGuardedRead,
} from "@/lib/public-catalog-api";
import { searchQuerySchema } from "@/lib/schemas/search";

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

  try {
    const parsed = searchQuerySchema.parse(searchParamsToObject(request.nextUrl));
    const data = await resolvePublicCatalogDataFromGuardedRead(async (projection) => ({
      items: await loadPublicSearchSuggestions(projection, parsed.q, parsed.limit),
    }));
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
