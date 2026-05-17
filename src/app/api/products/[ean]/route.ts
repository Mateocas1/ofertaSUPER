import { NextResponse, type NextRequest } from "next/server";

import { getProductDetail } from "@/lib/catalog";
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
  const cacheKey = `product:detail:${ean}`;
  const cached = await getCachedJson(cacheKey);

  if (cached) {
    const response = NextResponse.json(cached);
    void limiter.state.pending;
    return withRateLimitHeaders(response, limiter.state);
  }

  const product = await getProductDetail(ean);

  if (!product) {
    const response = NextResponse.json(
      {
        error: "Product not found",
      },
      { status: 404 },
    );
    void limiter.state.pending;
    return withRateLimitHeaders(response, limiter.state);
  }

  await setCachedJson(cacheKey, product, CACHE_TTL_SECONDS);
  const response = NextResponse.json(product);
  void limiter.state.pending;
  return withRateLimitHeaders(response, limiter.state);
}
