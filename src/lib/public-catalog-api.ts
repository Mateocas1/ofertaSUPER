import { ZodError } from "zod";

import { db } from "@/lib/db";
import { demoPromotions } from "@/lib/demo-data";
import { classifyPublicCatalogReadiness } from "@/lib/public-catalog-readiness";
import { productListQuerySchema } from "@/lib/schemas/product";
import { promotionListQuerySchema } from "@/lib/schemas/promotion";
import type { CategorySummary, ProductListFilters, PromotionFilters, PromotionSummary } from "@/lib/catalog";

type PublicApiError = { error: string; issues: ReturnType<ZodError["flatten"]> };
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
type ProductListLoader = (filters: ProductListFilters) => Promise<ProductPage>;
type CategoryLoader = () => Promise<CategorySummary[]>;
type PromotionLoader = (filters: PromotionFilters) => Promise<PromotionSummary[]>;

export type PublicCatalogProvenance = {
  dataSource: "database";
  degraded: boolean;
  verifiedAt: string;
  latestCheckedAt: string | null;
};
export type PublicCatalogData<T> = T & PublicCatalogProvenance;

export class PublicCatalogUnavailableError extends Error {}
export function publicCatalogUnavailable(): PublicCatalogUnavailable {
  return { error: "Catalog temporarily unavailable", dataSource: "unavailable", degraded: false, verifiedAt: null };
}

export const loadPublicCatalogPublication: PublicationLoader = async () =>
  db.productionReadinessPublication.findFirst({
    where: { target: "production", state: "PROMOTED", verified_at: { not: null }, promotion: { state: "PROMOTED" } },
    orderBy: { verified_at: "desc" }, select: { verified_at: true },
  });

export function getDemoPromotions(filters: PromotionFilters) {
  const wallet = filters.wallet?.toLowerCase();

  return demoPromotions.filter((promotion) => {
    if (filters.supermarket && promotion.supermarket.slug !== filters.supermarket) {
      return false;
    }

    if (filters.type && promotion.type !== filters.type) {
      return false;
    }

    if (wallet && !promotion.walletProvider?.toLowerCase().includes(wallet)) {
      return false;
    }

    return true;
  });
}

function validationErrorResult(error: ZodError): PublicApiResult<never> {
  return { status: 400, body: { error: "Invalid query parameters", issues: error.flatten() } };
}
function productFiltersFromSearchParams(searchParams: Record<string, string>): ProductListFilters {
  const parsed = productListQuerySchema.parse(searchParams);
  return { query: parsed.q, category: parsed.category, supermarket: parsed.super, sort: parsed.sort,
    offersOnly: parsed.offers, minPrice: parsed.minPrice, maxPrice: parsed.maxPrice, page: parsed.page, limit: parsed.limit };
}
function promotionFiltersFromSearchParams(searchParams: Record<string, string>): PromotionFilters {
  const parsed = promotionListQuerySchema.parse(searchParams);
  return { supermarket: parsed.super, wallet: parsed.wallet, type: parsed.type };
}
function getLatestCheckedAt(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("items" in value) || !Array.isArray(value.items)) return null;
  return value.items.map((item) => item && typeof item === "object" && "latestCheckedAt" in item && typeof item.latestCheckedAt === "string"
    ? item.latestCheckedAt : null).filter((checkedAt): checkedAt is string => checkedAt !== null).sort((a, b) => b.localeCompare(a))[0] ?? null;
}

export async function resolvePublicCatalogData<T extends object>(
  loadData: () => Promise<T>, publicationOrLegacy?: PublicationLoader | object,
): Promise<PublicCatalogData<T>> {
  try {
    const loadPublication = typeof publicationOrLegacy === "function" ? publicationOrLegacy : loadPublicCatalogPublication;
    const readiness = classifyPublicCatalogReadiness(await loadPublication());
    if (readiness.status === "unavailable") throw new PublicCatalogUnavailableError();
    const data = await loadData();
    return { ...data, dataSource: "database", degraded: readiness.status === "degraded",
      verifiedAt: readiness.verifiedAt!, latestCheckedAt: getLatestCheckedAt(data) };
  } catch (error) {
    if (error instanceof PublicCatalogUnavailableError) throw error;
    throw new PublicCatalogUnavailableError();
  }
}


async function catalogResult<T extends object>(loadData: () => Promise<T>, loadPublication?: PublicationLoader): Promise<PublicApiResult<PublicCatalogData<T>>> {
  try { return { status: 200, body: await resolvePublicCatalogData(loadData, loadPublication) }; }
  catch { return { status: 503, body: publicCatalogUnavailable() }; }
}

export async function resolvePublicProductList(searchParams: Record<string, string>, loadProducts: ProductListLoader,
  loadPublication?: PublicationLoader): Promise<PublicApiResult<PublicCatalogData<ProductPage>>> {
  try {
    const filters = productFiltersFromSearchParams(searchParams);
    return catalogResult(() => loadProducts(filters), loadPublication);
  } catch (error) { if (error instanceof ZodError) return validationErrorResult(error); throw error; }
}
export async function resolvePublicCategories(loadCategories: CategoryLoader, loadPublication?: PublicationLoader): Promise<PublicApiResult<PublicCatalogData<{ items: CategorySummary[] }>>> {
  return catalogResult(async () => ({ items: await loadCategories() }), loadPublication);
}
export async function resolvePublicPromotions(searchParams: Record<string, string>, loadPromotions: PromotionLoader,
  loadPublication?: PublicationLoader): Promise<PublicApiResult<PublicCatalogData<{ items: PromotionSummary[] }>>> {
  try {
    const filters = promotionFiltersFromSearchParams(searchParams);
    return catalogResult(async () => ({ items: await loadPromotions(filters) }), loadPublication);
  } catch (error) { if (error instanceof ZodError) return validationErrorResult(error); throw error; }
}
