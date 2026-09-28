import { Prisma } from "@prisma/client";

import { getSupermarketBySlug } from "../../src/lib/supermarkets";
import { fetchSimplePromotionByEan } from "../../src/lib/promotions/capture";
import type { SimplePromotion } from "../../src/lib/promotions/simple-promos";
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
  filterEans?: string[];
};

export type StageSourceProductsResult = {
  slug: string;
  terms: string[];
  queriesSent: number;
  productsFetched: number;
  productsStaged: number;
  products: NormalizedProduct[];
  promoReadsFailed: number;
  promosCaptured: number;
};

function toDecimal(value: number | null) {
  return value === null ? null : new Prisma.Decimal(value.toFixed(2));
}

export // Gate 6: simple-promotion capture. Only Carrefour exposes teasers through
// the public REST read; a failed read stores null and counts as a failure
// without aborting the batch — the price is staged regardless.
async function captureSimplePromotions(slug: string, products: NormalizedProduct[]) {
  const promoByEan = new Map<string, SimplePromotion | null>();
  let promoReadsFailed = 0;
  if (slug !== "carrefour") {
    return { promoByEan, promoReadsFailed };
  }

  for (const product of products) {
    try {
      promoByEan.set(product.ean, await fetchSimplePromotionByEan(getSupermarketBySlug(slug).baseUrl, product.ean));
    } catch {
      promoReadsFailed += 1;
      promoByEan.set(product.ean, null);
    }
  }
  return { promoByEan, promoReadsFailed };
}

export async function persistStagedProducts(
  dryRun: boolean,
  runId: number | undefined,
  slug: string,
  products: NormalizedProduct[],
  promoByEan: Map<string, SimplePromotion | null>,
) {
  if (dryRun) return;
  if (!runId) {
    throw new Error(`A persisted stage run requires a runId for source ${slug}`);
  }
  if (products.length === 0) return;

  await db.stagingProduct.createMany({
    data: products.map((product) => {
      const promo = promoByEan.get(product.ean);
      return {
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
        ...(promo ? { promo } : {}),
      };
    }),
  });
}

export async function stageSourceProducts({
  runId,
  slug,
  dryRun = false,
  queryTerms,
  queryLimit,
  count = 50,
  filterEans,
}: StageSourceProductsOptions): Promise<StageSourceProductsResult> {
  const adapter = getSourceAdapter(slug);
  const terms = queryTerms?.length ? queryTerms : await adapter.getDefaultTerms(queryLimit);
  const fetchedProducts = await adapter.fetchProducts(terms, {
    count,
    queryLimit,
  });
  const filterSet = filterEans?.length ? new Set(filterEans) : null;
  const products = filterSet
    ? fetchedProducts.filter((product) => filterSet.has(product.ean))
    : fetchedProducts;

  // Gate 6: simple-promotion capture. Only Carrefour exposes teasers through
  // the public REST read; a failed read stores null and counts as a failure
  // without aborting the batch — the price is staged regardless.
  // Sources list out-of-stock SKUs with a zero price; the honest value for
  // them is "no price observed", which also keeps the quality gate honest.
  const staged = products.map((product) =>
    !product.isAvailable && product.price === 0 ? { ...product, price: null } : product,
  );

  const { promoByEan, promoReadsFailed } = await captureSimplePromotions(slug, staged);

  await persistStagedProducts(dryRun, runId, slug, staged, promoByEan);

  return {
    slug,
    terms,
    queriesSent: terms.length,
    productsFetched: fetchedProducts.length,
    productsStaged: staged.length,
    products: staged,
    promoReadsFailed,
    promosCaptured: Array.from(promoByEan.values()).filter((promo) => promo !== null && promo !== undefined).length,
  };
}