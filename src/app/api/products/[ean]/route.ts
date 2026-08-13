import { NextResponse, type NextRequest } from "next/server";

import { getProductDetail } from "@/lib/catalog";
import { buildProductDetailCacheKey } from "@/lib/cache-keys";
import { getCachedJson, setCachedJson } from "@/lib/redis";
import { rejectIfRateLimited, withRateLimitHeaders } from "@/lib/rate-limit";
import { resolveRouteProductDetail } from "@/lib/portfolio-catalog";

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
  const product = await resolveRouteProductDetail(ean, {
    loadDetail: getProductDetail,
    readCache: (candidate) => getCachedJson(buildProductDetailCacheKey(candidate)),
    writeCache: (candidate, detail) => setCachedJson(
      buildProductDetailCacheKey(candidate), detail, CACHE_TTL_SECONDS,
    ),
  });

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

  const response = NextResponse.json(product);
  void limiter.state.pending;
  return withRateLimitHeaders(response, limiter.state);
}
