import { ZodError } from "zod";

import { classifyPublicCatalogReadiness } from "@/lib/public-catalog-readiness";
import { productListQuerySchema } from "@/lib/schemas/product";
import { promotionListQuerySchema } from "@/lib/schemas/promotion";
import type {
  CategorySummary,
  ProductListFilters,
  PromotionFilters,
  PromotionSummary,
} from "@/lib/catalog";

type PublicApiError = {
  error: string;
  issues: ReturnType<ZodError["flatten"]>;
};

export type PublicCatalogUnavailable = {
  error: "Catalog temporarily unavailable";
  dataSource: "unavailable";
  degraded: false;
  verifiedAt: null;
};

type PublicApiResult<T> =
  | { status: 200; body: T }
  | { status: 400; body: PublicApiError }
  | { status: 503; body: PublicCatalogUnavailable };

type ProductPage = { items: object[]; total: number; page: number; limit: number; totalPages: number };
type Publication = { verified_at: Date | null } | null;
type PublicationLoader = () => Promise<Publication>;
export type PublicCatalogProvenance = {
  dataSource: "database";
  degraded: boolean;
  verifiedAt: string;
  latestCheckedAt: string | null;
};

export type PublicCatalogData<T> = T & PublicCatalogProvenance;

export class PublicCatalogUnavailableError extends Error {}

export function publicCatalogUnavailable(): PublicCatalogUnavailable {
  return {
    error: "Catalog temporarily unavailable",
    dataSource: "unavailable",
    degraded: false,
    verifiedAt: null,
  };
}

export const loadPublicCatalogPublication: PublicationLoader = async () => {
  const { db } = await import("@/lib/db");

  return db.productionReadinessPublication.findFirst({
    where: {
      target: "production",
      state: "PROMOTED",
      verified_at: { not: null },
      promotion: { state: "PROMOTED" },
    },
    orderBy: { verified_at: "desc" },
    select: { verified_at: true },
  });
};

type ProductListLoader = (filters: ProductListFilters) => Promise<ProductPage>;
type CategoryLoader = () => Promise<CategorySummary[]>;
type PromotionLoader = (filters: PromotionFilters) => Promise<PromotionSummary[]>;

function validationErrorResult(error: ZodError): PublicApiResult<never> {
  return {
    status: 400,
    body: {
      error: "Invalid query parameters",
      issues: error.flatten(),
    },
  };
}

function productFiltersFromSearchParams(searchParams: Record<string, string>): ProductListFilters {
  const parsed = productListQuerySchema.parse(searchParams);

  return {
    query: parsed.q,
    category: parsed.category,
    supermarket: parsed.super,
    sort: parsed.sort,
    offersOnly: parsed.offers,
    minPrice: parsed.minPrice,
    maxPrice: parsed.maxPrice,
    page: parsed.page,
    limit: parsed.limit,
  };
}

function promotionFiltersFromSearchParams(searchParams: Record<string, string>): PromotionFilters {
  const parsed = promotionListQuerySchema.parse(searchParams);

  return {
    supermarket: parsed.super,
    wallet: parsed.wallet,
    type: parsed.type,
  };
}

function getPublicLatestCheckedAt(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("items" in value) || !Array.isArray(value.items)) {
    return null;
  }

  return value.items
    .map((item) =>
      item && typeof item === "object" && "latestCheckedAt" in item && typeof item.latestCheckedAt === "string"
        ? item.latestCheckedAt
        : null,
    )
    .filter((checkedAt): checkedAt is string => checkedAt !== null)
    .sort((left, right) => right.localeCompare(left))[0] ?? null;
}

export async function resolvePublicCatalogData<T extends object>(
  loadData: () => Promise<T>,
  loadPublication: PublicationLoader = loadPublicCatalogPublication,
): Promise<PublicCatalogData<T>> {
  try {
    const readiness = classifyPublicCatalogReadiness(await loadPublication());
    if (readiness.status === "unavailable") {
      throw new PublicCatalogUnavailableError();
    }

    const data = await loadData();
    return {
      ...data,
      dataSource: "database",
      degraded: readiness.status === "degraded",
      verifiedAt: readiness.verifiedAt!,
      latestCheckedAt: getPublicLatestCheckedAt(data),
    };
  } catch (error) {
    if (error instanceof PublicCatalogUnavailableError) {
      throw error;
    }

    throw new PublicCatalogUnavailableError();
  }
}

export function reclassifyCachedPublicCatalogData<T extends object>(
  cached: PublicCatalogData<T> | null,
  now?: Date,
): PublicCatalogData<T> | null {
  if (
    !cached
    || typeof cached !== "object"
    || cached.dataSource !== "database"
    || typeof cached.verifiedAt !== "string"
  ) {
    return null;
  }

  const readiness = classifyPublicCatalogReadiness(
    { verified_at: new Date(cached.verifiedAt) },
    { now },
  );
  if (readiness.status === "unavailable") {
    return null;
  }

  return { ...cached, degraded: readiness.status === "degraded" };
}

async function catalogResult<T extends object>(
  loadData: () => Promise<T>,
  loadPublication?: PublicationLoader,
): Promise<PublicApiResult<PublicCatalogData<T>>> {
  try {
    return {
      status: 200,
      body: await resolvePublicCatalogData(loadData, loadPublication),
    };
  } catch {
    return { status: 503, body: publicCatalogUnavailable() };
  }
}

export async function resolvePublicProductList(
  searchParams: Record<string, string>,
  loadProducts: ProductListLoader,
  loadPublication?: PublicationLoader,
): Promise<PublicApiResult<PublicCatalogData<ProductPage>>> {
  try {
    const filters = productFiltersFromSearchParams(searchParams);
    return catalogResult(() => loadProducts(filters), loadPublication);
  } catch (error) {
    if (error instanceof ZodError) {
      return validationErrorResult(error);
    }

    throw error;
  }
}

export async function resolvePublicCategories(
  loadCategories: CategoryLoader,
  loadPublication?: PublicationLoader,
): Promise<PublicApiResult<PublicCatalogData<{ items: CategorySummary[] }>>> {
  return catalogResult(async () => ({ items: await loadCategories() }), loadPublication);
}

export async function resolvePublicPromotions(
  searchParams: Record<string, string>,
  loadPromotions: PromotionLoader,
  loadPublication?: PublicationLoader,
): Promise<PublicApiResult<PublicCatalogData<{ items: PromotionSummary[] }>>> {
  try {
    const filters = promotionFiltersFromSearchParams(searchParams);
    return catalogResult(async () => ({ items: await loadPromotions(filters) }), loadPublication);
  } catch (error) {
    if (error instanceof ZodError) {
      return validationErrorResult(error);
    }

    throw error;
  }
}
