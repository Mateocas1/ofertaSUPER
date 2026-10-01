import { ZodError } from "zod";

import type { ProductDetail, ProductHistory } from "@/lib/catalog";
import { PublicCatalogUnavailableError, type PublicCatalogData } from "@/lib/public-catalog-api";
import { productHistoryQuerySchema } from "@/lib/schemas/product";

const unavailableBody = { error: "Price history temporarily unavailable" } as const;

export type ProductPageLoader = (
  ean: string,
  days: number,
) => Promise<PublicCatalogData<{ product: ProductDetail | null; history: ProductHistory }>>;

export async function loadProductPageData(
  ean: string,
  days: number,
  loadData: ProductPageLoader,
) {
  return loadData(ean, days);
}

export async function handleProductHistoryRequest(
  ean: string,
  query: Record<string, string>,
  loadData: ProductPageLoader,
) {
  let parsed: { days: number };
  try {
    parsed = productHistoryQuerySchema.parse(query);
  } catch (error) {
    if (error instanceof ZodError) {
      return { status: 400, body: { error: "Invalid query parameters", issues: error.flatten() } } as const;
    }
    throw error;
  }

  try {
    const data = await loadData(ean, parsed.days);
    if (!data.product) return { status: 404, body: { error: "Product not found" } } as const;
    return { status: 200, body: data.history } as const;
  } catch (error) {
    if (error instanceof PublicCatalogUnavailableError || error instanceof Error) {
      return { status: 503, body: unavailableBody } as const;
    }
    throw error;
  }
}
