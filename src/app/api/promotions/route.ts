import { NextResponse, type NextRequest } from "next/server";

import { searchParamsToObject } from "@/lib/api";
import { getPromotions } from "@/lib/catalog";
import { resolvePublicPromotions } from "@/lib/public-catalog-api";
import { rejectIfRateLimited, withRateLimitHeaders } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const limiter = await rejectIfRateLimited(request, "promotions");

  if (limiter.response) {
    void limiter.state.pending;
    return limiter.response;
  }

  const result = await resolvePublicPromotions(searchParamsToObject(request.nextUrl), getPromotions);
  const response = NextResponse.json(result.body, { status: result.status });
  void limiter.state.pending;
  return withRateLimitHeaders(response, limiter.state);
}
