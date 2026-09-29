import { NextResponse, type NextRequest } from "next/server";

import { loadPublicCategories } from "@/lib/catalog";
import { resolveGuardedPublicCategories } from "@/lib/public-catalog-api";
import { isSnapshotMode } from "@/lib/health";
import { handleCategories } from "@/lib/public-api";
import { rejectIfRateLimited, withRateLimitHeaders } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  // v1 production has no database: the catalog is the bundled snapshot.
  if (isSnapshotMode(process.env)) return handleCategories(request);

  const limiter = await rejectIfRateLimited(request, "categories");

  if (limiter.response) {
    void limiter.state.pending;
    return limiter.response;
  }

  const result = await resolveGuardedPublicCategories(loadPublicCategories);
  const response = NextResponse.json(result.body, { status: result.status });
  void limiter.state.pending;
  return withRateLimitHeaders(response, limiter.state);
}
