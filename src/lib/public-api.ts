import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";

import { badRequestResponse, searchParamsToObject } from "@/lib/api";
import {
  basketProductsBodySchema,
  buildDatabaseCatalogResponse,
  type BasketProduct,
} from "@/lib/basket-products-contract";
import {
  findSnapshotAdaptedProduct,
  searchSnapshotSummaries,
  toProductDetail,
} from "@/lib/catalog-snapshot-adapters";
import {
  getSnapshotGeneratedAt,
  getSnapshotProduct,
  SnapshotUnavailableError,
  type SnapshotProductResult,
} from "@/lib/catalog-snapshot";
import type { ProductDetail, ProductHistory, ProductSummary } from "@/lib/catalog";
import { handleProductHistoryRequest } from "@/lib/product-history";
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

// Same series palette the guarded history loader used.
const SERIES_COLORS = ["#d24726", "#2a6f58", "#4259d6"];

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

export async function handleProductDetail(request: NextRequest, ean: string, deps: PublicApiDeps = defaultDeps()) {
  const admission = await admitStrictPublicRoute(request, "products", deps.limiter);
  const { response: blocked, admitted } = admitOrBlock(admission, publicCatalogUnavailable());
  if (blocked || !admitted) return blocked;
  void admitted.global.pending;
  void admitted.client.pending;

  try {
    const detail = findSnapshotAdaptedProduct(ean, deps.now());
    if (!detail) {
      return withRateLimitHeaders(NextResponse.json({ error: "Product not found" }, { status: 404 }), admitted.client);
    }
    const body = {
      item: detail,
      dataSource: "database",
      degraded: false,
      verifiedAt: getSnapshotGeneratedAt(),
      latestCheckedAt: null,
    };
    return withRateLimitHeaders(NextResponse.json(body), admitted.client);
  } catch (error) {
    const response = error instanceof SnapshotUnavailableError
      ? NextResponse.json(publicCatalogUnavailable(), { status: 503 })
      : NextResponse.json({ error: "Catalog temporarily unavailable" }, { status: 503 });
    return withRateLimitHeaders(response, admitted.client);
  }
}

// Same page shape the guarded loader returned, including the provenance
// fields, so handleProductHistoryRequest keeps working unchanged; only the
// history body reaches the route.
function snapshotProductPageLoader(deps: PublicApiDeps) {
  return async (ean: string, days: number) => {
    const now = deps.now();
    const entry = getSnapshotProduct(ean, now);
    return {
      product: entry ? toProductDetail(entry.product, entry.offers, now) : null,
      history: buildSnapshotHistory(ean, days, entry, now),
      dataSource: "database" as const,
      degraded: false,
      verifiedAt: getSnapshotGeneratedAt(),
      latestCheckedAt: null,
    };
  };
}

function buildSnapshotHistory(ean: string, days: number, entry: SnapshotProductResult | null, now: Date): ProductHistory {
  if (!entry) return { ean, days, series: [], points: [] };

  const cutoff = now.getTime() - days * 86_400_000;
  const namesBySlug = new Map(entry.offers.map((offer) => [offer.source, offer.source]));
  const detail = toProductDetail(entry.product, entry.offers, now);
  for (const priceEntry of detail.priceEntries) {
    namesBySlug.set(priceEntry.supermarket.slug, priceEntry.supermarket.name);
  }

  const observations = entry.offers
    .flatMap((offer) => offer.history.map((point) => ({ source: offer.source, price: point.price, observedAt: point.observedAt })))
    .filter((observation) => {
      const observed = Date.parse(observation.observedAt);
      return !Number.isNaN(observed) && observed >= cutoff;
    })
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt));

  const series = new Map<string, ProductHistory["series"][number]>();
  const pointsByDate = new Map<string, Record<string, number | string | null>>();
  for (const observation of observations) {
    if (!series.has(observation.source)) {
      series.set(observation.source, {
        slug: observation.source,
        name: namesBySlug.get(observation.source) ?? observation.source,
        color: SERIES_COLORS[series.size % SERIES_COLORS.length],
      });
    }
    const date = observation.observedAt.slice(0, 10);
    const point = pointsByDate.get(date) ?? { date };
    point[observation.source] = observation.price;
    pointsByDate.set(date, point);
  }

  return { ean, days, series: Array.from(series.values()), points: Array.from(pointsByDate.values()) };
}

export async function handleProductHistory(request: NextRequest, ean: string, deps: PublicApiDeps = defaultDeps()) {
  const limiter = await rejectIfRateLimited(request, "product-history", deps.limiter);

  if (limiter.response) {
    void limiter.state.pending;
    return limiter.response;
  }

  const result = await handleProductHistoryRequest(ean, searchParamsToObject(request.nextUrl), snapshotProductPageLoader(deps));
  const response = NextResponse.json(result.body, { status: result.status });

  void limiter.state.pending;
  return withRateLimitHeaders(response, limiter.state);
}

function toBasketProduct(detail: ProductDetail): BasketProduct {
  const minimumPrice = (entries: Array<{ price: number | null }>) => {
    const prices = entries.flatMap((entry) => entry.price === null ? [] : [entry.price]);
    return prices.length > 0 ? Math.min(...prices) : null;
  };
  return {
    ean: detail.ean,
    name: detail.name,
    brand: detail.brand,
    imageUrl: detail.imageUrl,
    minPrice: minimumPrice(detail.priceEntries.filter((entry) => entry.isAvailable)),
    freshMinPrice: minimumPrice(detail.priceEntries.filter((entry) => entry.isAvailable && entry.freshnessStatus === "fresh")),
    hasFreshPrice: detail.priceEntries.some((entry) => entry.isAvailable && entry.freshnessStatus === "fresh" && entry.price !== null),
    priceEntries: detail.priceEntries.map((entry) => ({
      supermarket: {
        id: entry.supermarket.id,
        name: entry.supermarket.name,
        slug: entry.supermarket.slug,
        logoUrl: entry.supermarket.logoUrl,
      },
      price: entry.price,
      isAvailable: entry.isAvailable,
      productUrl: entry.productUrl,
      freshnessStatus: entry.freshnessStatus,
    })),
  };
}

export async function handleProductsBatch(request: NextRequest, deps: PublicApiDeps = defaultDeps()) {
  const limiter = await rejectIfRateLimited(request, "products-batch", deps.limiter);

  if (limiter.response) {
    void limiter.state.pending;
    return limiter.response;
  }

  let body: object;
  let status = 200;
  try {
    const { eans } = basketProductsBodySchema.parse(await request.json());
    const now = deps.now();
    const items = eans.flatMap((ean) => {
      const detail = findSnapshotAdaptedProduct(ean, now);
      return detail ? [toBasketProduct(detail)] : [];
    });
    body = {
      items,
      missing: eans.filter((ean) => !items.some((item) => item.ean === ean)),
      dataSource: "database",
      degraded: items.some((item) => item.priceEntries.some((entry) => entry.price !== null && entry.freshnessStatus !== "fresh")),
      verifiedAt: getSnapshotGeneratedAt(),
      latestCheckedAt: null,
    };
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      body = { error: "Invalid request body" };
      status = 400;
    } else {
      body = { error: "Catalog temporarily unavailable" };
      status = 503;
    }
  }
  const response = NextResponse.json(body, { status });
  void limiter.state.pending;
  return withRateLimitHeaders(response, limiter.state);
}
