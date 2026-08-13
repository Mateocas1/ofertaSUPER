import { NextResponse, type NextRequest } from "next/server";
import { handleBasketProductsRequest } from "@/lib/basket-products";
import { rejectIfRateLimited, withRateLimitHeaders } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const limiter = await rejectIfRateLimited(request, "products-batch");

  if (limiter.response) {
    void limiter.state.pending;
    return limiter.response;
  }

  const result = await handleBasketProductsRequest(() => request.json());
  const response = NextResponse.json(result.body, { status: result.status });

  void limiter.state.pending;
  return withRateLimitHeaders(response, limiter.state);
}
