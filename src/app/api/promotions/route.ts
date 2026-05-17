import { NextResponse, type NextRequest } from "next/server";

import { badRequestResponse, searchParamsToObject } from "@/lib/api";
import { getPromotions } from "@/lib/catalog";
import { rejectIfRateLimited, withRateLimitHeaders } from "@/lib/rate-limit";
import { promotionListQuerySchema } from "@/lib/schemas/promotion";

export async function GET(request: NextRequest) {
  const limiter = await rejectIfRateLimited(request, "promotions");

  if (limiter.response) {
    void limiter.state.pending;
    return limiter.response;
  }

  try {
    const parsed = promotionListQuerySchema.parse(searchParamsToObject(request.nextUrl));
    const items = await getPromotions({
      supermarket: parsed.super,
      wallet: parsed.wallet,
      type: parsed.type,
    });
    const response = NextResponse.json({ items });
    void limiter.state.pending;
    return withRateLimitHeaders(response, limiter.state);
  } catch (error) {
    const response = badRequestResponse(error);
    void limiter.state.pending;
    return withRateLimitHeaders(response, limiter.state);
  }
}