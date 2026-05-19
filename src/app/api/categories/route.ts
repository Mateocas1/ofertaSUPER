import { NextResponse, type NextRequest } from "next/server";

import { getCategories } from "@/lib/catalog";
import { resolvePublicCategories } from "@/lib/public-catalog-api";
import { rejectIfRateLimited, withRateLimitHeaders } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const limiter = await rejectIfRateLimited(request, "categories");

  if (limiter.response) {
    void limiter.state.pending;
    return limiter.response;
  }

  const result = await resolvePublicCategories(getCategories);
  const response = NextResponse.json(result.body, { status: result.status });
  void limiter.state.pending;
  return withRateLimitHeaders(response, limiter.state);
}
