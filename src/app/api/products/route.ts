import { NextResponse, type NextRequest } from "next/server";

import { badRequestResponse, searchParamsToObject } from "@/lib/api";
import { listProducts } from "@/lib/catalog";
import { rejectIfRateLimited, withRateLimitHeaders } from "@/lib/rate-limit";
import { productListQuerySchema } from "@/lib/schemas/product";

export async function GET(request: NextRequest) {
  const limiter = await rejectIfRateLimited(request, "products-list");

  if (limiter.response) {
    void limiter.state.pending;
    return limiter.response;
  }

  try {
    const parsed = productListQuerySchema.parse(searchParamsToObject(request.nextUrl));
    const result = await listProducts({
      query: parsed.q,
      category: parsed.category,
      supermarket: parsed.super,
      sort: parsed.sort,
      offersOnly: parsed.offers,
      minPrice: parsed.minPrice,
      maxPrice: parsed.maxPrice,
      page: parsed.page,
      limit: parsed.limit,
    });

    const response = NextResponse.json(result);
    void limiter.state.pending;
    return withRateLimitHeaders(response, limiter.state);
  } catch (error) {
    const response = badRequestResponse(error);
    void limiter.state.pending;
    return withRateLimitHeaders(response, limiter.state);
  }
}
