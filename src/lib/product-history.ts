import { ZodError } from "zod";

import { getProductDetail, getProductHistory, type ProductHistory } from "@/lib/catalog";
import { productHistoryQuerySchema } from "@/lib/schemas/product";

const unavailableBody = { error: "Price history temporarily unavailable" } as const;

type HistoryLoaders = {
  loadDetail: typeof getProductDetail;
  loadHistory: typeof getProductHistory;
};

const defaultLoaders: HistoryLoaders = {
  loadDetail: getProductDetail,
  loadHistory: getProductHistory,
};

export async function loadProductPageData(
  ean: string,
  days: number,
  loaders: HistoryLoaders = defaultLoaders,
) {
  const product = await loaders.loadDetail(ean);
  const history = await loaders.loadHistory(ean, days).catch((): ProductHistory => ({
    ean,
    days,
    series: [],
    points: [],
  }));

  return { product, history };
}

export async function handleProductHistoryRequest(
  ean: string,
  query: Record<string, string>,
  loaders: HistoryLoaders = defaultLoaders,
) {
  let parsed: { days: number };

  try {
    parsed = productHistoryQuerySchema.parse(query);
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        status: 400,
        body: { error: "Invalid query parameters", issues: error.flatten() },
      } as const;
    }
    throw error;
  }

  try {
    const product = await loaders.loadDetail(ean);
    if (!product) {
      return { status: 404, body: { error: "Product not found" } } as const;
    }

    return { status: 200, body: await loaders.loadHistory(ean, parsed.days) } as const;
  } catch {
    return { status: 503, body: unavailableBody } as const;
  }
}
