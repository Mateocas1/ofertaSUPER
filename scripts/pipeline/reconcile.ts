import { Prisma } from "@prisma/client";

import { db } from "../../src/lib/db";
import type { EvaluatedStageCandidate } from "./validate";

type ReconcileStageProductsOptions = {
  batchId?: string;
  batchSize?: number;
  candidates?: EvaluatedStageCandidate[];
  dryRun?: boolean;
};

type AdvisoryLockClient = {
  $queryRaw<T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

type CandidateLoaderClient = {
  stagingProduct: Prisma.TransactionClient["stagingProduct"];
};

export const RECONCILE_ADVISORY_LOCK_KEY = 2026051901;

export class ReconcileLockUnavailableError extends Error {
  constructor() {
    super("Another ingestion reconciliation is already running.");
    this.name = "ReconcileLockUnavailableError";
  }
}

export type ReconcileSummary = {
  totalCandidates: number;
  totalPending: number;
  distinctEans: number;
  newProducts: number;
  mergedProducts: number;
  supermarketProductsCreated: number;
  supermarketProductsUpdated: number;
  priceHistoryInserted: number;
  promoted: number;
  promotedByRunId: Record<string, number>;
  promotedBySource: Record<string, number>;
  chunkTimings: Array<{ chunkIndex: number; chunkSize: number; durationMs: number }>;
};

type ChunkResult = {
  newProducts: number;
  mergedProducts: number;
  supermarketProductsCreated: number;
  supermarketProductsUpdated: number;
  priceHistoryInserted: number;
  promoted: number;
  promotedByRunId: Record<string, number>;
  promotedBySource: Record<string, number>;
};

type ExistingProductRecord = {
  ean: string;
  brand: string | null;
  description: string | null;
  image_url: string | null;
  images: string[];
  category: string | null;
};

const DEFAULT_TX_MAX_WAIT_MS = 15_000;
const DEFAULT_TX_TIMEOUT_MS = 120_000;

function readPositiveIntEnv(name: string, fallback: number) {
  const raw = process.env[name];

  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function toDecimal(value: number | null) {
  return value === null ? null : new Prisma.Decimal(value.toFixed(2));
}

function hasText(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasImages(value: string[] | null | undefined) {
  return Array.isArray(value) && value.length > 0;
}

function scoreCandidateCompleteness(candidate: EvaluatedStageCandidate) {
  let score = 0;

  if (hasText(candidate.brand)) {
    score += 1;
  }

  if (hasText(candidate.description)) {
    score += 1;
  }

  if (hasText(candidate.imageUrl)) {
    score += 1;
  }

  if (hasImages(candidate.images)) {
    score += 1;
  }

  if (hasText(candidate.category)) {
    score += 1;
  }

  if (candidate.price !== null) {
    score += 1;
  }

  return score;
}

function pickCanonicalCandidate(candidates: EvaluatedStageCandidate[]) {
  return candidates.toSorted((left, right) => {
    if (right.qualityScore !== left.qualityScore) {
      return right.qualityScore - left.qualityScore;
    }

    const completenessDiff = scoreCandidateCompleteness(right) - scoreCandidateCompleteness(left);

    if (completenessDiff !== 0) {
      return completenessDiff;
    }

    return left.sourceSlug.localeCompare(right.sourceSlug, "es");
  })[0];
}

function buildNewProduct(candidate: EvaluatedStageCandidate) {
  return {
    ean: candidate.ean,
    name: candidate.name,
    brand: candidate.brand,
    description: candidate.description,
    image_url: candidate.imageUrl,
    images: candidate.images,
    category: candidate.category,
  };
}

function buildProtectiveMerge(
  existingProduct: ExistingProductRecord,
  candidate: EvaluatedStageCandidate,
): {
  brand: string | null;
  description: string | null;
  image_url: string | null;
  images: string[] | null;
  category: string | null;
} {
  const data = {
    brand: null as string | null,
    description: null as string | null,
    image_url: null as string | null,
    images: null as string[] | null,
    category: null as string | null,
  };

  if (!hasText(existingProduct.brand) && hasText(candidate.brand)) {
    data.brand = candidate.brand;
  }

  if (!hasText(existingProduct.description) && hasText(candidate.description)) {
    data.description = candidate.description;
  }

  if (!hasText(existingProduct.image_url) && hasText(candidate.imageUrl)) {
    data.image_url = candidate.imageUrl;
  }

  if (!hasImages(existingProduct.images) && hasImages(candidate.images)) {
    data.images = candidate.images;
  }

  if (!hasText(existingProduct.category) && hasText(candidate.category)) {
    data.category = candidate.category;
  }

  return data;
}

function supermarketProductKey(ean: string, supermarketId: number) {
  return `${ean}:${supermarketId}`;
}

function normalizeComparablePrice(value: Prisma.Decimal | number | null) {
  return value === null ? null : Number(value).toFixed(2);
}

function shouldInsertHistory(
  latestHistory: { price: Prisma.Decimal | null; list_price: Prisma.Decimal | null } | undefined,
  candidate: EvaluatedStageCandidate,
) {
  if (!latestHistory) {
    return true;
  }

  return (
    normalizeComparablePrice(latestHistory.price) !== normalizeComparablePrice(candidate.price) ||
    normalizeComparablePrice(latestHistory.list_price) !== normalizeComparablePrice(candidate.listPrice)
  );
}

export async function ensureReconcileAdvisoryLock(tx: AdvisoryLockClient) {
  const rows = await tx.$queryRaw<Array<{ locked: boolean }>>`
    select pg_try_advisory_xact_lock(${RECONCILE_ADVISORY_LOCK_KEY}) as locked
  `;

  if (rows[0]?.locked !== true) {
    throw new ReconcileLockUnavailableError();
  }
}

async function loadCandidates(
  batchId: string,
  client: CandidateLoaderClient,
): Promise<EvaluatedStageCandidate[]> {
  const products = await client.stagingProduct.findMany({
    where: {
      run: {
        batch_id: batchId,
      },
    },
    select: {
      id: true,
      run_id: true,
      source_slug: true,
      ean: true,
      name: true,
      brand: true,
      description: true,
      image_url: true,
      images: true,
      category: true,
      sku_id: true,
      seller_id: true,
      product_url: true,
      price: true,
      list_price: true,
      reference_price: true,
      reference_unit: true,
      is_available: true,
      quality_score: true,
      quality_flags: true,
      status: true,
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
    imageUrl: product.image_url,
    images: product.images,
    category: product.category,
    skuId: product.sku_id,
    sellerId: product.seller_id,
    productUrl: product.product_url,
    price: product.price === null ? null : Number(product.price),
    listPrice: product.list_price === null ? null : Number(product.list_price),
    referencePrice: product.reference_price === null ? null : Number(product.reference_price),
    referenceUnit: product.reference_unit,
    isAvailable: product.is_available,
    qualityScore: product.quality_score,
    qualityFlags: Array.isArray(product.quality_flags)
      ? product.quality_flags.filter((flag): flag is string => typeof flag === "string")
      : [],
    status: product.status === "REJECTED" ? "REJECTED" : "PENDING",
  }));
}

async function reconcileChunk(
  tx: Prisma.TransactionClient,
  candidates: EvaluatedStageCandidate[],
  supermarketIdBySlug: Map<string, number>,
  dryRun: boolean,
): Promise<ChunkResult> {
  if (candidates.length === 0) {
    return {
      newProducts: 0,
      mergedProducts: 0,
      supermarketProductsCreated: 0,
      supermarketProductsUpdated: 0,
      priceHistoryInserted: 0,
      promoted: 0,
      promotedByRunId: {},
      promotedBySource: {},
    };
  }

  const groupedByEan = new Map<string, EvaluatedStageCandidate[]>();

  for (const candidate of candidates) {
    const bucket = groupedByEan.get(candidate.ean) ?? [];
    bucket.push(candidate);
    groupedByEan.set(candidate.ean, bucket);
  }

  const eans = Array.from(groupedByEan.keys());
  const canonicalCandidates = new Map(
    Array.from(groupedByEan.entries()).map(([ean, group]) => [ean, pickCanonicalCandidate(group)]),
  );
  const existingProducts = await tx.product.findMany({
    where: {
      ean: {
        in: eans,
      },
    },
    select: {
      ean: true,
      brand: true,
      description: true,
      image_url: true,
      images: true,
      category: true,
    },
  });
  const existingProductsByEan = new Map(existingProducts.map((product) => [product.ean, product]));
  const newProductRows = eans
    .filter((ean) => !existingProductsByEan.has(ean))
    .map((ean) => buildNewProduct(canonicalCandidates.get(ean)!));
  const mergeUpdates = eans
    .filter((ean) => existingProductsByEan.has(ean))
    .map((ean) => ({
      ean,
      data: buildProtectiveMerge(existingProductsByEan.get(ean)!, canonicalCandidates.get(ean)!),
    }))
    .filter(
      (entry) =>
        entry.data.brand !== null ||
        entry.data.description !== null ||
        entry.data.image_url !== null ||
        entry.data.images !== null ||
        entry.data.category !== null,
    );

  if (!dryRun && newProductRows.length > 0) {
    await tx.product.createMany({
      data: newProductRows,
      skipDuplicates: true,
    });
  }

  if (!dryRun && mergeUpdates.length > 0) {
    const mergeValues = mergeUpdates.map((entry) =>
      Prisma.sql`(${entry.ean}, ${entry.data.brand}, ${entry.data.description}, ${entry.data.image_url}, ${entry.data.images}, ${entry.data.category})`,
    );

    await tx.$executeRaw`
      UPDATE products AS p
      SET
        brand = COALESCE(v.brand, p.brand),
        description = COALESCE(v.description, p.description),
        image_url = COALESCE(v.image_url, p.image_url),
        images = COALESCE(v.images::text[], p.images),
        category = COALESCE(v.category, p.category)
      FROM (
        VALUES ${Prisma.join(mergeValues)}
      ) AS v(ean, brand, description, image_url, images, category)
      WHERE p.ean = v.ean
    `;
  }

  const allSupermarketIds = Array.from(
    new Set(
      candidates.map((candidate) => {
        const supermarketId = supermarketIdBySlug.get(candidate.sourceSlug);

        if (!supermarketId) {
          throw new Error(`Missing supermarket id for source ${candidate.sourceSlug}`);
        }

        return supermarketId;
      }),
    ),
  );
  const existingSupermarketProducts = await tx.supermarketProduct.findMany({
    where: {
      product_ean: {
        in: eans,
      },
      supermarket_id: {
        in: allSupermarketIds,
      },
    },
    select: {
      id: true,
      product_ean: true,
      supermarket_id: true,
    },
  });
  const existingSupermarketProductByKey = new Map(
    existingSupermarketProducts.map((product) => [supermarketProductKey(product.product_ean, product.supermarket_id), product]),
  );
  const timestamp = new Date();
  const latestCandidateBySupermarketKey = new Map<string, EvaluatedStageCandidate>();

  for (const candidate of candidates) {
    const supermarketId = supermarketIdBySlug.get(candidate.sourceSlug)!;
    latestCandidateBySupermarketKey.set(supermarketProductKey(candidate.ean, supermarketId), candidate);
  }

  const upsertRows = Array.from(latestCandidateBySupermarketKey.entries()).map(([key, candidate]) => {
    const supermarketId = supermarketIdBySlug.get(candidate.sourceSlug)!;

    return {
      key,
      product_ean: candidate.ean,
      supermarket_id: supermarketId,
      price: toDecimal(candidate.price),
      list_price: toDecimal(candidate.listPrice),
      reference_price: toDecimal(candidate.referencePrice),
      reference_unit: candidate.referenceUnit,
      is_available: candidate.isAvailable,
      sku_id: candidate.skuId,
      seller_id: candidate.sellerId,
      product_url: candidate.productUrl,
      last_checked_at: timestamp,
    };
  });

  const existingKeys = new Set(existingSupermarketProductByKey.keys());
  const createSupermarketProductRows = upsertRows.filter((row) => !existingKeys.has(row.key));
  const updateSupermarketProducts = upsertRows.filter((row) => existingKeys.has(row.key));

  type UpsertedSupermarketProductRow = {
    id: number;
    product_ean: string;
    supermarket_id: number;
  };

  let refreshedSupermarketProducts: UpsertedSupermarketProductRow[] = [];

  if (!dryRun && upsertRows.length > 0) {
    const upsertValues = upsertRows.map((row) =>
      Prisma.sql`(${row.product_ean}, ${row.supermarket_id}, ${row.price}, ${row.list_price}, ${row.reference_price}, ${row.reference_unit}, ${row.is_available}, ${row.sku_id}, ${row.seller_id}, ${row.product_url}, ${row.last_checked_at})`,
    );

    refreshedSupermarketProducts = await tx.$queryRaw<UpsertedSupermarketProductRow[]>`
      INSERT INTO supermarket_products (
        product_ean,
        supermarket_id,
        price,
        list_price,
        reference_price,
        reference_unit,
        is_available,
        sku_id,
        seller_id,
        product_url,
        last_checked_at
      )
      VALUES ${Prisma.join(upsertValues)}
      ON CONFLICT (product_ean, supermarket_id)
      DO UPDATE SET
        price = EXCLUDED.price,
        list_price = EXCLUDED.list_price,
        reference_price = EXCLUDED.reference_price,
        reference_unit = EXCLUDED.reference_unit,
        is_available = EXCLUDED.is_available,
        sku_id = EXCLUDED.sku_id,
        seller_id = EXCLUDED.seller_id,
        product_url = EXCLUDED.product_url,
        last_checked_at = EXCLUDED.last_checked_at
      RETURNING id, product_ean, supermarket_id
    `;
  }

  if (dryRun && upsertRows.length > 0) {
    refreshedSupermarketProducts = await tx.supermarketProduct.findMany({
      where: {
        product_ean: {
          in: eans,
        },
        supermarket_id: {
          in: allSupermarketIds,
        },
      },
      select: {
        id: true,
        product_ean: true,
        supermarket_id: true,
      },
    });
  }

  const refreshedSupermarketProductByKey = new Map(
    refreshedSupermarketProducts.map((product) => [supermarketProductKey(product.product_ean, product.supermarket_id), product]),
  );
  const latestHistoryRows = await tx.priceHistory.findMany({
    where: {
      supermarket_product_id: {
        in: refreshedSupermarketProducts.map((product) => product.id),
      },
    },
    orderBy: [{ supermarket_product_id: "asc" }, { scraped_at: "desc" }],
    distinct: ["supermarket_product_id"],
    select: {
      supermarket_product_id: true,
      price: true,
      list_price: true,
    },
  });
  const latestHistoryBySupermarketProductId = new Map(
    latestHistoryRows.map((row) => [row.supermarket_product_id, row]),
  );
  let syntheticSupermarketProductId = -1;
  const historyRows = candidates
    .map((candidate) => {
      const supermarketId = supermarketIdBySlug.get(candidate.sourceSlug)!;
      const existingSupermarketProduct = refreshedSupermarketProductByKey.get(
        supermarketProductKey(candidate.ean, supermarketId),
      );
      const supermarketProductId = existingSupermarketProduct?.id ?? syntheticSupermarketProductId--;

      if (!existingSupermarketProduct && !dryRun) {
        throw new Error(`Missing supermarket product for ${candidate.ean} in ${candidate.sourceSlug}`);
      }

      if (!shouldInsertHistory(latestHistoryBySupermarketProductId.get(supermarketProductId), candidate)) {
        return null;
      }

      return {
        supermarket_product_id: supermarketProductId,
        price: toDecimal(candidate.price),
        list_price: toDecimal(candidate.listPrice),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (!dryRun && historyRows.length > 0) {
    await tx.priceHistory.createMany({
      data: historyRows,
    });
  }

  if (!dryRun) {
    await tx.stagingProduct.updateMany({
      where: {
        id: {
          in: candidates.map((candidate) => candidate.id),
        },
      },
      data: {
        status: "PROMOTED",
      },
    });
  }

  const promotedByRunId: Record<string, number> = {};
  const promotedBySource: Record<string, number> = {};

  for (const candidate of candidates) {
    if (candidate.runId !== null) {
      promotedByRunId[String(candidate.runId)] = (promotedByRunId[String(candidate.runId)] ?? 0) + 1;
    }

    promotedBySource[candidate.sourceSlug] = (promotedBySource[candidate.sourceSlug] ?? 0) + 1;
  }

  return {
    newProducts: newProductRows.length,
    mergedProducts: eans.length - newProductRows.length,
    supermarketProductsCreated: createSupermarketProductRows.length,
    supermarketProductsUpdated: updateSupermarketProducts.length,
    priceHistoryInserted: historyRows.length,
    promoted: candidates.length,
    promotedByRunId,
    promotedBySource,
  };
}

export async function reconcileStageProducts({
  batchId,
  batchSize = 500,
  candidates,
  dryRun = false,
}: ReconcileStageProductsOptions): Promise<ReconcileSummary> {
  const txMaxWaitMs = readPositiveIntEnv("RECONCILE_TX_MAX_WAIT_MS", DEFAULT_TX_MAX_WAIT_MS);
  const txTimeoutMs = readPositiveIntEnv("RECONCILE_TX_TIMEOUT_MS", DEFAULT_TX_TIMEOUT_MS);

  return db.$transaction(
    async (tx) => {
      await ensureReconcileAdvisoryLock(tx);

      const resolvedCandidates = candidates ?? (batchId ? await loadCandidates(batchId, tx) : []);
      const pendingCandidates = resolvedCandidates.filter((candidate) => candidate.status === "PENDING");
      const supermarketRows = await tx.supermarket.findMany({
        select: {
          id: true,
          slug: true,
        },
      });
      const supermarketIdBySlug = new Map(supermarketRows.map((supermarket) => [supermarket.slug, supermarket.id]));
      const chunks = chunkArray(pendingCandidates, Math.max(batchSize, 1));
      const summary: ReconcileSummary = {
        totalCandidates: resolvedCandidates.length,
        totalPending: pendingCandidates.length,
        distinctEans: new Set(pendingCandidates.map((candidate) => candidate.ean)).size,
        newProducts: 0,
        mergedProducts: 0,
        supermarketProductsCreated: 0,
        supermarketProductsUpdated: 0,
        priceHistoryInserted: 0,
        promoted: 0,
        promotedByRunId: {},
        promotedBySource: {},
        chunkTimings: [],
      };

      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
        const chunk = chunks[chunkIndex];
        const chunkStart = Date.now();
        const chunkResult = await reconcileChunk(tx, chunk, supermarketIdBySlug, dryRun);
        const chunkDurationMs = Date.now() - chunkStart;

        summary.chunkTimings.push({
          chunkIndex,
          chunkSize: chunk.length,
          durationMs: chunkDurationMs,
        });

        summary.newProducts += chunkResult.newProducts;
        summary.mergedProducts += chunkResult.mergedProducts;
        summary.supermarketProductsCreated += chunkResult.supermarketProductsCreated;
        summary.supermarketProductsUpdated += chunkResult.supermarketProductsUpdated;
        summary.priceHistoryInserted += chunkResult.priceHistoryInserted;
        summary.promoted += chunkResult.promoted;

        for (const [runId, count] of Object.entries(chunkResult.promotedByRunId)) {
          summary.promotedByRunId[runId] = (summary.promotedByRunId[runId] ?? 0) + count;
        }

        for (const [sourceSlug, count] of Object.entries(chunkResult.promotedBySource)) {
          summary.promotedBySource[sourceSlug] = (summary.promotedBySource[sourceSlug] ?? 0) + count;
        }
      }

      return summary;
    },
    {
      maxWait: txMaxWaitMs,
      timeout: txTimeoutMs,
    },
  );
}
