import { ZodError } from "zod";

import {
  demoCategories,
  demoPromotions,
  getDemoProductPage,
} from "@/lib/demo-data";
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

type PublicApiResult<T> =
  | {
      status: 200;
      body: T;
    }
  | {
      status: 400;
      body: PublicApiError;
    };

type ProductPage = ReturnType<typeof getDemoProductPage>;
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

function getDemoPromotions(filters: PromotionFilters) {
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

export async function resolvePublicProductList(
  searchParams: Record<string, string>,
  loadProducts: ProductListLoader,
): Promise<PublicApiResult<ProductPage>> {
  try {
    const filters = productFiltersFromSearchParams(searchParams);

    try {
      return {
        status: 200,
        body: await loadProducts(filters),
      };
    } catch {
      return {
        status: 200,
        body: getDemoProductPage(filters),
      };
    }
  } catch (error) {
    if (error instanceof ZodError) {
      return validationErrorResult(error);
    }

    throw error;
  }
}

export async function resolvePublicCategories(
  loadCategories: CategoryLoader,
): Promise<PublicApiResult<{ items: CategorySummary[] }>> {
  try {
    return {
      status: 200,
      body: {
        items: await loadCategories(),
      },
    };
  } catch {
    return {
      status: 200,
      body: {
        items: demoCategories,
      },
    };
  }
}

export async function resolvePublicPromotions(
  searchParams: Record<string, string>,
  loadPromotions: PromotionLoader,
): Promise<PublicApiResult<{ items: PromotionSummary[] }>> {
  try {
    const filters = promotionFiltersFromSearchParams(searchParams);

    try {
      return {
        status: 200,
        body: {
          items: await loadPromotions(filters),
        },
      };
    } catch {
      return {
        status: 200,
        body: {
          items: getDemoPromotions(filters),
        },
      };
    }
  } catch (error) {
    if (error instanceof ZodError) {
      return validationErrorResult(error);
    }

    throw error;
  }
}
