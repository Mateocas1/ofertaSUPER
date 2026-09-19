import { ZodError } from "zod";

import { PublicCatalogUnavailableError } from "@/lib/public-catalog-api";
import { resolveProductPageData } from "@/lib/portfolio-catalog";
import { productHistoryQuerySchema } from "@/lib/schemas/product";

const unavailableBody = { error: "Price history temporarily unavailable" } as const;

type ProductPageLoader = typeof resolveProductPageData;

export async function loadProductPageData(
  ean: string,
  days: number,
  loadData: ProductPageLoader = resolveProductPageData,
) {
  return loadData(ean, days);
}

export async function handleProductHistoryRequest(
  ean: string,
  query: Record<string, string>,
  loadData: ProductPageLoader = resolveProductPageData,
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
