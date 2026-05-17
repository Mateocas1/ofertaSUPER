import { Prisma } from "@prisma/client";

import { getSourceAdapter } from "../../src/lib/ingestion/adapters/registry";
import type { NormalizedProduct } from "../../src/lib/vtex/normalize";
import { db } from "../../src/lib/db";

type StageSourceProductsOptions = {
  runId?: number;
  slug: string;
  dryRun?: boolean;
  queryTerms?: string[];
  queryLimit?: number;
  count?: number;
};

export type StageSourceProductsResult = {
  slug: string;
  terms: string[];
  queriesSent: number;
  productsFetched: number;
  productsStaged: number;
  products: NormalizedProduct[];
};

function toDecimal(value: number | null) {
  return value === null ? null : new Prisma.Decimal(value.toFixed(2));
}

export async function stageSourceProducts({
  runId,
  slug,
  dryRun = false,
  queryTerms,
  queryLimit,
  count = 50,
}: StageSourceProductsOptions): Promise<StageSourceProductsResult> {
  const adapter = getSourceAdapter(slug);
  const terms = queryTerms?.length ? queryTerms : await adapter.getDefaultTerms(queryLimit);
  const products = await adapter.fetchProducts(terms, {
    count,
    queryLimit,
  });

  if (!dryRun) {
    if (!runId) {
      throw new Error(`A persisted stage run requires a runId for source ${slug}`);
    }

    if (products.length > 0) {
      await db.stagingProduct.createMany({
        data: products.map((product) => ({
          run_id: runId,
          source_slug: slug,
          ean: product.ean,
          name: product.name,
          brand: product.brand,
          description: product.description,
          image_url: product.imageUrl,
          images: product.images,
          category: product.category,
          sku_id: product.skuId,
          seller_id: product.sellerId,
          product_url: product.productUrl,
          price: toDecimal(product.price),
          list_price: toDecimal(product.listPrice),
          reference_price: toDecimal(product.referencePrice),
          reference_unit: product.referenceUnit,
          is_available: product.isAvailable,
          quality_score: 0,
          quality_flags: [],
          status: "PENDING",
        })),
      });
    }
  }

  return {
    slug,
    terms,
    queriesSent: terms.length,
    productsFetched: products.length,
    productsStaged: products.length,
    products,
  };
}