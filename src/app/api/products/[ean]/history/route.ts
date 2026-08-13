import { NextResponse, type NextRequest } from "next/server";

import { searchParamsToObject } from "@/lib/api";
import { handleProductHistoryRequest } from "@/lib/product-history";
import { rejectIfRateLimited, withRateLimitHeaders } from "@/lib/rate-limit";

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{ ean: string }>;
  },
) {
  const limiter = await rejectIfRateLimited(request, "product-history");

  if (limiter.response) {
    void limiter.state.pending;
    return limiter.response;
  }

  const { ean } = await context.params;
  const result = await handleProductHistoryRequest(ean, searchParamsToObject(request.nextUrl));
  const response = NextResponse.json(result.body, { status: result.status });

  void limiter.state.pending;
  return withRateLimitHeaders(response, limiter.state);
}
