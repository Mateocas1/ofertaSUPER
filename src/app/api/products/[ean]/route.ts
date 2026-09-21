import { NextResponse, type NextRequest } from "next/server";

import { buildDatabaseCatalogResponse } from "@/lib/basket-products-contract";
import { PublicCatalogUnavailableError, publicCatalogUnavailable } from "@/lib/public-catalog-api";
import { resolveRouteProductDetail } from "@/lib/portfolio-catalog";
import { admitStrictPublicRoute, withRateLimitHeaders } from "@/lib/rate-limit";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ ean: string }> },
) {
  const { ean } = await context.params;
  const admission = await admitStrictPublicRoute(request, "products");
  if (admission.status === "exhausted") {
    return withRateLimitHeaders(NextResponse.json({ error: "Rate limit exceeded", message: "Too many requests. Try again in a moment." }, { status: 429 }), admission.state);
  }
  if (admission.status === "unavailable") {
    return NextResponse.json(buildDatabaseCatalogResponse(null, publicCatalogUnavailable()).body, { status: 503 });
  }
  void admission.global.pending;
  void admission.client.pending;

  try {
    const data = await resolveRouteProductDetail(ean);
    if (!data.item) return withRateLimitHeaders(NextResponse.json({ error: "Product not found" }, { status: 404 }), admission.client);
    return withRateLimitHeaders(NextResponse.json(data), admission.client);
  } catch (error) {
    const response = error instanceof PublicCatalogUnavailableError
      ? NextResponse.json(buildDatabaseCatalogResponse(null, publicCatalogUnavailable()).body, { status: 503 })
      : NextResponse.json({ error: "Catalog temporarily unavailable" }, { status: 503 });
    return withRateLimitHeaders(response, admission.client);
  }
}
