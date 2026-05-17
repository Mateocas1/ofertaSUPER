import { NextResponse, type NextRequest } from "next/server";

import { getCategories } from "@/lib/catalog";
import { rejectIfRateLimited, withRateLimitHeaders } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const limiter = await rejectIfRateLimited(request, "categories");

  if (limiter.response) {
    void limiter.state.pending;
    return limiter.response;
  }

  const categories = await getCategories();
  const response = NextResponse.json({ items: categories });
  void limiter.state.pending;
  return withRateLimitHeaders(response, limiter.state);
}
