import { NextResponse, type NextRequest } from "next/server";

import { requireAdminApiAccess } from "@/lib/admin/access";
import { getAdminIngestionDashboard } from "@/lib/admin/ingestion";
import { rejectIfRateLimited, withRateLimitHeaders } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApiAccess();

  if (unauthorized) {
    return unauthorized;
  }

  const limiter = await rejectIfRateLimited(request, "admin-ingestion");

  if (limiter.response) {
    void limiter.state.pending;
    return limiter.response;
  }

  try {
    const item = await getAdminIngestionDashboard();
    const response = NextResponse.json({ item });
    void limiter.state.pending;
    return withRateLimitHeaders(response, limiter.state);
  } catch {
    const response = NextResponse.json(
      {
        error: "Internal server error",
      },
      { status: 500 },
    );
    void limiter.state.pending;
    return withRateLimitHeaders(response, limiter.state);
  }
}
