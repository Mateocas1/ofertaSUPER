import "../load-env";

import { Prisma } from "@prisma/client";

import { resolveIngestionQueryTerms } from "../../src/lib/ingestion/query-terms";
import { db } from "../../src/lib/db";
import { getSupermarketBySlug } from "../../src/lib/supermarkets";
import { DEFAULT_SEARCH_TERMS } from "../../src/lib/vtex/categories";
import { fetchVtexProducts } from "../../src/lib/vtex/client";
import type { NormalizedProduct } from "../../src/lib/vtex/normalize";

type RunStoreScraperOptions = {
  slug: string;
  dryRun?: boolean;
  queryTerms?: string[];
  limit?: number;
};

type ScrapeResult = {
  slug: string;
  queries: number;
  fetched: number;
  persisted: number;
  skipped: number;
  sample: NormalizedProduct[];
};

async function resolveQueryTerms({ slug, queryTerms, limit }: Pick<RunStoreScraperOptions, "slug" | "queryTerms" | "limit">) {
  return resolveIngestionQueryTerms({
    slug,
    queryTerms,
    limit,
    strategy: "legacy",
  });
}

async function upsertMasterProduct(product: NormalizedProduct) {
  await db.product.upsert({
    where: { ean: product.ean },
    update: {
      name: product.name,
      brand: product.brand,
      description: product.description,
      image_url: product.imageUrl,
      images: product.images,
      category: product.category,
    },
    create: {
      ean: product.ean,
      name: product.name,
      brand: product.brand,
      description: product.description,
      image_url: product.imageUrl,
      images: product.images,
      category: product.category,
    },
  });
}

async function persistPricing(slug: string, products: NormalizedProduct[]) {
  const supermarket = await db.supermarket.findUnique({ where: { slug } });

  if (!supermarket) {
    throw new Error(`Supermarket ${slug} not seeded`);
  }

  let persisted = 0;
  let skipped = 0;

  for (const product of products) {
    if (supermarket.slug === "disco") {
      await upsertMasterProduct(product);
    } else {
      const existingProduct = await db.product.findUnique({ where: { ean: product.ean } });
      if (!existingProduct) {
        skipped += 1;
        continue;
      }
    }

    const supermarketProduct = await db.supermarketProduct.upsert({
      where: {
        product_ean_supermarket_id: {
          product_ean: product.ean,
          supermarket_id: supermarket.id,
        },
      },
      update: {
        price: product.price === null ? null : new Prisma.Decimal(product.price.toFixed(2)),
        list_price: product.listPrice === null ? null : new Prisma.Decimal(product.listPrice.toFixed(2)),
        reference_price:
          product.referencePrice === null ? null : new Prisma.Decimal(product.referencePrice.toFixed(2)),
        reference_unit: product.referenceUnit,
        is_available: product.isAvailable,
        sku_id: product.skuId,
        seller_id: product.sellerId,
        product_url: product.productUrl,
        last_checked_at: new Date(),
      },
      create: {
        product_ean: product.ean,
        supermarket_id: supermarket.id,
        price: product.price === null ? null : new Prisma.Decimal(product.price.toFixed(2)),
        list_price: product.listPrice === null ? null : new Prisma.Decimal(product.listPrice.toFixed(2)),
        reference_price:
          product.referencePrice === null ? null : new Prisma.Decimal(product.referencePrice.toFixed(2)),
        reference_unit: product.referenceUnit,
        is_available: product.isAvailable,
        sku_id: product.skuId,
        seller_id: product.sellerId,
        product_url: product.productUrl,
        last_checked_at: new Date(),
      },
    });

    await db.priceHistory.create({
      data: {
        supermarket_product_id: supermarketProduct.id,
        price: product.price === null ? null : new Prisma.Decimal(product.price.toFixed(2)),
        list_price: product.listPrice === null ? null : new Prisma.Decimal(product.listPrice.toFixed(2)),
      },
    });

    persisted += 1;
  }

  return { persisted, skipped };
}

export async function runStoreScraper({ slug, dryRun = false, queryTerms, limit }: RunStoreScraperOptions): Promise<ScrapeResult> {
  const supermarket = getSupermarketBySlug(slug);
  const terms = await resolveQueryTerms({ slug, queryTerms, limit });
  const aggregated = new Map<string, NormalizedProduct>();

  for (const term of terms) {
    const products = await fetchVtexProducts({
      baseUrl: supermarket.baseUrl,
      query: term,
      count: 50,
    });

    for (const product of products) {
      aggregated.set(product.ean, product);
    }
  }

  const uniqueProducts = Array.from(aggregated.values());

  if (dryRun) {
    return {
      slug,
      queries: terms.length,
      fetched: uniqueProducts.length,
      persisted: 0,
      skipped: 0,
      sample: uniqueProducts.slice(0, 10),
    };
  }

  const { persisted, skipped } = await persistPricing(slug, uniqueProducts);

  return {
    slug,
    queries: terms.length,
    fetched: uniqueProducts.length,
    persisted,
    skipped,
    sample: uniqueProducts.slice(0, 10),
  };
}

export function readDryRunFlag() {
  return process.argv.includes("--dry-run");
}

export function readLimitFlag(defaultLimit = DEFAULT_SEARCH_TERMS.length) {
  const raw = process.argv.find((value) => value.startsWith("--limit="));
  if (!raw) {
    return defaultLimit;
  }

  const parsed = Number(raw.split("=")[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultLimit;
}

export function printScrapeResult(result: ScrapeResult) {
  console.log(
    JSON.stringify(
      {
        ...result,
        sample: result.sample,
      },
      null,
      2,
    ),
  );
}