import { Prisma } from "@prisma/client";

import { db } from "../../src/lib/db";
import { evaluateStageCandidate } from "../../src/lib/ingestion/quality-gates";
import type { NormalizedProduct } from "../../src/lib/vtex/normalize";

type ValidateStageProductsOptions = {
  runId?: number;
  slug?: string;
  products?: NormalizedProduct[];
  dryRun?: boolean;
};

export type EvaluatedStageCandidate = {
  id: number;
  runId: number | null;
  sourceSlug: string;
  ean: string;
  name: string;
  brand: string | null;
  description: string | null;
  imageUrl: string | null;
  images: string[];
  category: string | null;
  skuId: string | null;
  sellerId: string | null;
  productUrl: string | null;
  price: number | null;
  listPrice: number | null;
  referencePrice: number | null;
  referenceUnit: string | null;
  isAvailable: boolean;
  qualityScore: number;
  qualityFlags: string[];
  status: "PENDING" | "REJECTED";
};

export type ValidationSummary = {
  validated: number;
  rejected: number;
  pending: number;
  candidates: EvaluatedStageCandidate[];
};

type StagingCandidate = {
  id: number;
  runId: number | null;
  sourceSlug: string;
  ean: string;
  name: string;
  brand: string | null;
  description: string | null;
  category: string | null;
  imageUrl: string | null;
  images: string[];
  skuId: string | null;
  sellerId: string | null;
  productUrl: string | null;
  price: number | null;
  listPrice: number | null;
  referencePrice: number | null;
  referenceUnit: string | null;
  isAvailable: boolean;
};

const VALIDATION_UPDATE_CHUNK_SIZE = 100;

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function decimalToNumber(value: Prisma.Decimal | null) {
  return value === null ? null : Number(value);
}

async function getHistoricalAverages(eans: string[]) {
  if (eans.length === 0) {
    return new Map<string, number | null>();
  }

  const rows = await db.$queryRaw<Array<{ ean: string; avg_price: Prisma.Decimal | null }>>`
    SELECT sp.product_ean AS ean, AVG(ph.price) AS avg_price
    FROM price_history ph
    INNER JOIN supermarket_products sp ON sp.id = ph.supermarket_product_id
    WHERE sp.product_ean IN (${Prisma.join(eans)})
      AND ph.price IS NOT NULL
    GROUP BY sp.product_ean
  `;

  return new Map(rows.map((row) => [row.ean, row.avg_price === null ? null : Number(row.avg_price)]));
}

function normalizeProducts(products: NormalizedProduct[], slug: string): StagingCandidate[] {
  return products.map((product, index) => ({
    id: index,
    runId: null,
    sourceSlug: slug,
    ean: product.ean,
    name: product.name,
    brand: product.brand,
    description: product.description,
    category: product.category,
    imageUrl: product.imageUrl,
    images: product.images,
    skuId: product.skuId,
    sellerId: product.sellerId,
    productUrl: product.productUrl,
    price: product.price,
    listPrice: product.listPrice,
    referencePrice: product.referencePrice,
    referenceUnit: product.referenceUnit,
    isAvailable: product.isAvailable,
  }));
}

async function loadPersistedCandidates(runId: number): Promise<StagingCandidate[]> {
  const products = await db.stagingProduct.findMany({
    where: { run_id: runId },
    select: {
      id: true,
      run_id: true,
      source_slug: true,
      ean: true,
      name: true,
      brand: true,
      description: true,
      category: true,
      image_url: true,
      images: true,
      sku_id: true,
      seller_id: true,
      product_url: true,
      price: true,
      list_price: true,
      reference_price: true,
      reference_unit: true,
      is_available: true,
    },
  });

  return products.map((product) => ({
    id: product.id,
    runId: product.run_id,
    sourceSlug: product.source_slug,
    ean: product.ean,
    name: product.name,
    brand: product.brand,
    description: product.description,
    category: product.category,
    imageUrl: product.image_url,
    images: product.images,
    skuId: product.sku_id,
    sellerId: product.seller_id,
    productUrl: product.product_url,
    price: decimalToNumber(product.price),
    listPrice: decimalToNumber(product.list_price),
    referencePrice: decimalToNumber(product.reference_price),
    referenceUnit: product.reference_unit,
    isAvailable: product.is_available,
  }));
}

async function persistValidationResults(candidates: EvaluatedStageCandidate[]) {
  for (const chunk of chunkArray(candidates, VALIDATION_UPDATE_CHUNK_SIZE)) {
    const values = chunk.map((candidate) =>
      Prisma.sql`(${candidate.id}, ${candidate.qualityScore}, ${JSON.stringify(candidate.qualityFlags)}, ${candidate.status})`,
    );

    await db.$executeRaw`
      UPDATE staging_product AS sp
      SET
        quality_score = v.quality_score,
        quality_flags = v.quality_flags::jsonb,
        status = v.status::"StagingStatus"
      FROM (
        VALUES ${Prisma.join(values)}
      ) AS v(id, quality_score, quality_flags, status)
      WHERE sp.id = v.id
    `;
  }
}

export async function validateStageProducts({
  runId,
  slug,
  products,
  dryRun = false,
}: ValidateStageProductsOptions): Promise<ValidationSummary> {
  const candidates = products ? normalizeProducts(products, slug ?? "unknown") : runId ? await loadPersistedCandidates(runId) : [];
  const historicalAverages = await getHistoricalAverages(Array.from(new Set(candidates.map((candidate) => candidate.ean))));

  let rejected = 0;
  let pending = 0;
  const evaluatedCandidates: EvaluatedStageCandidate[] = [];

  for (const candidate of candidates) {
    const evaluation = evaluateStageCandidate(candidate, {
      historicalAverage: historicalAverages.get(candidate.ean) ?? null,
    });

    evaluatedCandidates.push({
      id: candidate.id,
      runId: candidate.runId,
      sourceSlug: candidate.sourceSlug,
      ean: candidate.ean,
      name: candidate.name,
      brand: candidate.brand,
      description: candidate.description,
      imageUrl: candidate.imageUrl,
      images: candidate.images,
      category: candidate.category,
      skuId: candidate.skuId,
      sellerId: candidate.sellerId,
      productUrl: candidate.productUrl,
      price: candidate.price,
      listPrice: candidate.listPrice,
      referencePrice: candidate.referencePrice,
      referenceUnit: candidate.referenceUnit,
      isAvailable: candidate.isAvailable,
      qualityScore: evaluation.qualityScore,
      qualityFlags: evaluation.qualityFlags,
      status: evaluation.status,
    });

    if (evaluation.status === "REJECTED") {
      rejected += 1;
    } else {
      pending += 1;
    }

  }

  if (!dryRun && runId && evaluatedCandidates.length > 0) {
    await persistValidationResults(evaluatedCandidates);
  }

  return {
    validated: candidates.length,
    rejected,
    pending,
    candidates: evaluatedCandidates,
  };
}