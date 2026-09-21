import { NextResponse, type NextRequest } from "next/server";

import { searchParamsToObject } from "@/lib/api";
import { loadPublicProductList } from "@/lib/catalog";
import { resolveGuardedPublicProductList } from "@/lib/public-catalog-api";
import { rejectIfRateLimited, withRateLimitHeaders } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const limiter = await rejectIfRateLimited(request, "products-list");

  if (limiter.response) {
    void limiter.state.pending;
    return limiter.response;
  }

  const result = await resolveGuardedPublicProductList(searchParamsToObject(request.nextUrl), loadPublicProductList);
  const response = NextResponse.json(result.body, { status: result.status });
  void limiter.state.pending;
  return withRateLimitHeaders(response, limiter.state);
}
