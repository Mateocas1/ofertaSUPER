import { NextResponse, type NextRequest } from "next/server";

import { buildDatabaseCatalogResponse } from "@/lib/basket-products-contract";
import { getProductDetail } from "@/lib/catalog";
import { buildProductDetailCacheKey } from "@/lib/cache-keys";
import {
  createPublicCatalogCacheEnvelope,
  PublicCatalogUnavailableError,
  publicCatalogUnavailable,
  readPublicCatalogCacheEnvelope,
  resolvePublicCatalogDataFromAuthority,
} from "@/lib/public-catalog-api";
import { resolvePublicCatalogRuntimeAuthority } from "@/lib/public-catalog-runtime.server";
import { getCachedJson, setCachedJson } from "@/lib/redis";
import { admitStrictPublicRoute, withRateLimitHeaders } from "@/lib/rate-limit";

const CACHE_TTL_SECONDS = 300;

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

  const authority = await resolvePublicCatalogRuntimeAuthority();
  if (!authority) {
    return NextResponse.json(buildDatabaseCatalogResponse(null, publicCatalogUnavailable()).body, { status: 503 });
  }
  try {
    const cacheKey = buildProductDetailCacheKey(ean);
    const cached = readPublicCatalogCacheEnvelope<{ item: Awaited<ReturnType<typeof getProductDetail>> }>(
      await getCachedJson<unknown>(cacheKey),
      authority,
    );
    if (cached) return withRateLimitHeaders(NextResponse.json(cached), admission.client);

    const data = await resolvePublicCatalogDataFromAuthority(
      async () => ({ item: await getProductDetail(ean) }),
      authority,
    );
    if (!data.item) return withRateLimitHeaders(NextResponse.json({ error: "Product not found" }, { status: 404 }), admission.client);
    if (!data.degraded) {
      const envelope = createPublicCatalogCacheEnvelope(authority, data);
      if (envelope) await setCachedJson(cacheKey, envelope, CACHE_TTL_SECONDS);
    }
    const result = buildDatabaseCatalogResponse(data, publicCatalogUnavailable());
    return withRateLimitHeaders(NextResponse.json(result.body, { status: result.status }), admission.client);
  } catch (error) {
    const response = error instanceof PublicCatalogUnavailableError
      ? NextResponse.json(buildDatabaseCatalogResponse(null, publicCatalogUnavailable()).body, { status: 503 })
      : NextResponse.json({ error: "Catalog temporarily unavailable" }, { status: 503 });
    return withRateLimitHeaders(response, admission.client);
  }
}
