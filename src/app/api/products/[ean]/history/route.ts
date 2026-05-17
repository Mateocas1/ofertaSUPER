import { NextResponse, type NextRequest } from "next/server";

import { badRequestResponse, searchParamsToObject } from "@/lib/api";
import { getProductDetail, getProductHistory } from "@/lib/catalog";
import { rejectIfRateLimited, withRateLimitHeaders } from "@/lib/rate-limit";
import { productHistoryQuerySchema } from "@/lib/schemas/product";

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

  try {
    const { ean } = await context.params;
    const parsed = productHistoryQuerySchema.parse(searchParamsToObject(request.nextUrl));
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

    const history = await getProductHistory(ean, parsed.days);
    const response = NextResponse.json(history);
    void limiter.state.pending;
    return withRateLimitHeaders(response, limiter.state);
  } catch (error) {
    const response = badRequestResponse(error);
    void limiter.state.pending;
    return withRateLimitHeaders(response, limiter.state);
  }
}
