import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";

import { badRequestResponse, searchParamsToObject } from "@/lib/api";
import { buildDatabaseCatalogResponse } from "@/lib/basket-products-contract";
import { searchSnapshotSummaries } from "@/lib/catalog-snapshot-adapters";
import { getSnapshotGeneratedAt, SnapshotUnavailableError } from "@/lib/catalog-snapshot";
import type { ProductSummary } from "@/lib/catalog";
import { publicCatalogUnavailable } from "@/lib/public-catalog-api";
import {
  admitStrictPublicRoute,
  defaultRateLimiter,
  rejectIfRateLimited,
  withRateLimitHeaders,
  type RateLimiter,
  type StrictAdmissionResult,
} from "@/lib/rate-limit";
import { productListQuerySchema } from "@/lib/schemas/product";
import { searchQuerySchema } from "@/lib/schemas/search";

// Public catalog handlers backed by the committed snapshot. Every handler
// takes its collaborators through `deps` so tests can stub the rate limiter
// and the clock; the route files only wire the real defaults in.

export type PublicApiDeps = {
  limiter: Pick<RateLimiter, "limit"> | null;
  now: () => Date;
};

const defaultDeps = (): PublicApiDeps => ({
  limiter: defaultRateLimiter,
  now: () => new Date(),
});

const rateLimitedBody = { error: "Rate limit exceeded", message: "Too many requests. Try again in a moment." } as const;

function admitOrBlock(admission: StrictAdmissionResult, unavailableBody: object) {
  if (admission.status === "exhausted") {
    return { response: withRateLimitHeaders(NextResponse.json(rateLimitedBody, { status: 429 }), admission.state), admitted: null };
  }
  if (admission.status === "unavailable") {
    return { response: NextResponse.json(unavailableBody, { status: 503 }), admitted: null };
  }
  return { response: null, admitted: { global: admission.global, client: admission.client } };
}

function latestCheckedAtOf(items: ProductSummary[]): string | null {
  return items
    .map((item) => item.latestCheckedAt)
    .reduce<string | null>((latest, value) => (latest === null || (value !== null && value > latest) ? value : latest), null);
}

export async function handleSearch(request: NextRequest, deps: PublicApiDeps = defaultDeps()) {
  const admission = await admitStrictPublicRoute(request, "search", deps.limiter);
  const { response: blocked, admitted } = admitOrBlock(admission, publicCatalogUnavailable());
  if (blocked || !admitted) return blocked;
  void admitted.global.pending;

  try {
    const parsed = searchQuerySchema.parse(searchParamsToObject(request.nextUrl));
    const summaries = searchSnapshotSummaries({ query: parsed.q, pageSize: parsed.limit, now: deps.now() });
    const data = {
      items: summaries.products.map((item) => ({
        ean: item.ean,
        name: item.name,
        brand: item.brand,
        imageUrl: item.imageUrl,
        category: item.category,
        minPrice: item.displayPrice,
        displayPrice: item.displayPrice,
        latestCheckedAt: item.latestCheckedAt,
        bestPriceCheckedAt: item.displayPriceCheckedAt,
        freshnessStatus: item.displayPriceFreshnessStatus,
      })),
      dataSource: "database" as const,
      degraded: false,
      verifiedAt: getSnapshotGeneratedAt(),
      latestCheckedAt: latestCheckedAtOf(summaries.products),
    };
    const result = buildDatabaseCatalogResponse(data, publicCatalogUnavailable());
    return withRateLimitHeaders(NextResponse.json(result.body, { status: result.status }), admitted.client);
  } catch (error) {
    const response = error instanceof SnapshotUnavailableError
      ? NextResponse.json(publicCatalogUnavailable(), { status: 503 })
      : badRequestResponse(error);
    return withRateLimitHeaders(response, admitted.client);
  }
}

export async function handleProducts(request: NextRequest, deps: PublicApiDeps = defaultDeps()) {
  const limiter = await rejectIfRateLimited(request, "products-list", deps.limiter);

  if (limiter.response) {
    void limiter.state.pending;
    return limiter.response;
  }

  let body: object;
  let status = 200;
  try {
    const parsed = productListQuerySchema.parse(searchParamsToObject(request.nextUrl));
    const summaries = searchSnapshotSummaries({
      query: parsed.q,
      supermarket: parsed.super,
      page: parsed.page,
      pageSize: parsed.limit,
      now: deps.now(),
    });
    body = {
      items: summaries.products,
      total: summaries.total,
      page: summaries.page,
      limit: parsed.limit,
      totalPages: summaries.totalPages,
      dataSource: "database",
      degraded: false,
      verifiedAt: getSnapshotGeneratedAt(),
      latestCheckedAt: latestCheckedAtOf(summaries.products),
    };
  } catch (error) {
    if (error instanceof ZodError) {
      body = { error: "Invalid query parameters", issues: error.flatten() };
      status = 400;
    } else {
      body = publicCatalogUnavailable();
      status = 503;
    }
  }
  const response = NextResponse.json(body, { status });
  void limiter.state.pending;
  return withRateLimitHeaders(response, limiter.state);
}
