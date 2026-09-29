import { NextResponse, type NextRequest } from "next/server";

import { searchParamsToObject } from "@/lib/api";
import { loadPublicPromotions } from "@/lib/catalog";
import { resolveGuardedPublicPromotions } from "@/lib/public-catalog-api";
import { isSnapshotMode } from "@/lib/health";
import { handlePromotions } from "@/lib/public-api";
import { rejectIfRateLimited, withRateLimitHeaders } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  // v1 production has no database: the catalog is the bundled snapshot.
  if (isSnapshotMode(process.env)) return handlePromotions(request);

  const limiter = await rejectIfRateLimited(request, "promotions");

  if (limiter.response) {
    void limiter.state.pending;
    return limiter.response;
  }

  const result = await resolveGuardedPublicPromotions(searchParamsToObject(request.nextUrl), loadPublicPromotions);
  const response = NextResponse.json(result.body, { status: result.status });
  void limiter.state.pending;
  return withRateLimitHeaders(response, limiter.state);
}
