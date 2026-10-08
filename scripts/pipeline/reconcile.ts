import { Prisma } from "@prisma/client";

import { db } from "../../src/lib/db";
import { normalizeGtin } from "../../src/lib/identity/gtin";
import type { EvaluatedStageCandidate } from "./validate";
import type { SimplePromotion } from "../../src/lib/promotions/simple-promos";

type ReconcileWriteMode = "standard" | "refresh-existing";

type ReconcileStageProductsOptions = {
  batchId?: string;
  runId?: number;
  batchSize?: number;
  candidates?: EvaluatedStageCandidate[];
  dryRun?: boolean;
  writeMode?: ReconcileWriteMode;
};

type AdvisoryLockClient = {
  $queryRaw<T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

type CandidateLoaderClient = {
  stagingProduct: Prisma.TransactionClient["stagingProduct"];
};

export const RECONCILE_ADVISORY_LOCK_KEY = 2026051901;

// The instant a source observation is recorded against: when the acquisition
// run started reading the source, never when the pipeline got around to
// processing the staging row. A row acquired on the 18th and processed on the
// 21st keeps the 18th, otherwise freshness would measure pipeline runs rather
// than source observations.
//
// `processedAt` is only a fallback for candidates built outside the staging
// loader, which carry no acquisition time.
export function observationInstantFor(
  candidate: Pick<EvaluatedStageCandidate, "acquiredAt">,
  processedAt: Date,
): Date {
  return candidate.acquiredAt ?? processedAt;
}

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

function preferMissingValue<T>(
  existingValue: T | null | undefined,
  candidateValue: T | null | undefined,
  hasValue: (value: T | null | undefined) => boolean,
): T | null {
  return !hasValue(existingValue) && hasValue(candidateValue)
    ? (candidateValue ?? null)
    : null;
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
  return {
    brand: preferMissingValue(
      existingProduct.brand,
      candidate.brand,
      hasText,
    ),
    description: preferMissingValue(
      existingProduct.description,
      candidate.description,
      hasText,
    ),
    image_url: preferMissingValue(
      existingProduct.image_url,
      candidate.imageUrl,
      hasText,
    ),
    images: preferMissingValue(
      existingProduct.images,
      candidate.images,
      hasImages,
    ),
    // Categories come from the store's own path now (one of the app's
    // categories or nothing), so a fresh one replaces an outdated guess
    // instead of only filling a blank one.
    category: hasText(candidate.category) && candidate.category !== existingProduct.category
      ? candidate.category
      : null,
  };
}

function supermarketProductKey(ean: string, supermarketId: number) {
  return `${ean}:${supermarketId}`;
}

export type RefreshExistingPreflightViolations = {
  missingProductEans: string[];
  missingSupermarketProducts: Array<{ ean: string; sourceSlug: string }>;
};

export function findRefreshExistingPreflightViolations({
  candidates,
  supermarketIdBySlug,
  existingProductEans,
  existingSupermarketProductKeys,
}: {
  candidates: EvaluatedStageCandidate[];
  supermarketIdBySlug: Map<string, number>;
  existingProductEans: Iterable<string>;
  existingSupermarketProductKeys: Iterable<string>;
}): RefreshExistingPreflightViolations {
  const productEans = new Set(existingProductEans);
  const supermarketProductKeys = new Set(existingSupermarketProductKeys);
  const missingProductEans = new Set<string>();
  const missingSupermarketProducts: RefreshExistingPreflightViolations["missingSupermarketProducts"] = [];

  for (const candidate of candidates) {
    if (!productEans.has(candidate.ean)) {
      missingProductEans.add(candidate.ean);
    }

    const supermarketId = supermarketIdBySlug.get(candidate.sourceSlug);

    if (!supermarketId) {
      missingSupermarketProducts.push({ ean: candidate.ean, sourceSlug: candidate.sourceSlug });
      continue;
    }

    if (!supermarketProductKeys.has(supermarketProductKey(candidate.ean, supermarketId))) {
      missingSupermarketProducts.push({ ean: candidate.ean, sourceSlug: candidate.sourceSlug });
    }
  }

  return {
    missingProductEans: Array.from(missingProductEans).sort(),
    missingSupermarketProducts: missingSupermarketProducts.toSorted(
      (left, right) => left.ean.localeCompare(right.ean) || left.sourceSlug.localeCompare(right.sourceSlug),
    ),
  };
}

function formatMissingSupermarketProducts(
  values: RefreshExistingPreflightViolations["missingSupermarketProducts"],
) {
  return values.length > 0
    ? values.map((value) => `${value.sourceSlug}:${value.ean}`).join(",")
    : "none";
}

function assertNoRefreshExistingViolations(violations: RefreshExistingPreflightViolations) {
  if (violations.missingProductEans.length > 0 || violations.missingSupermarketProducts.length > 0) {
    throw new Error(
      `refresh-existing mode refuses to create rows: missingProducts=${violations.missingProductEans.join(",") || "none"} missingSupermarketProducts=${formatMissingSupermarketProducts(violations.missingSupermarketProducts)}`,
    );
  }
}

async function assertRefreshExistingPreflight(
  tx: Prisma.TransactionClient,
  candidates: EvaluatedStageCandidate[],
  supermarketIdBySlug: Map<string, number>,
) {
  if (candidates.length === 0) {
    return;
  }

  const eans = Array.from(new Set(candidates.map((candidate) => candidate.ean)));
  const supermarketIds = Array.from(
    new Set(
      candidates
        .map((candidate) => supermarketIdBySlug.get(candidate.sourceSlug))
        .filter((value): value is number => typeof value === "number"),
    ),
  );
  const [products, supermarketProducts] = await Promise.all([
    tx.product.findMany({
      where: { ean: { in: eans } },
      select: { ean: true },
    }),
    tx.supermarketProduct.findMany({
      where: {
        product_ean: { in: eans },
        supermarket_id: { in: supermarketIds },
      },
      select: { product_ean: true, supermarket_id: true },
    }),
  ]);

  assertNoRefreshExistingViolations(
    findRefreshExistingPreflightViolations({
      candidates,
      supermarketIdBySlug,
      existingProductEans: products.map((product) => product.ean),
      existingSupermarketProductKeys: supermarketProducts.map((product) =>
        supermarketProductKey(product.product_ean, product.supermarket_id),
      ),
    }),
  );
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

// Staged rows written before GTIN-14 canonicalization still carry their source
// form; every reconcile write keys on the canonical GTIN-14.
export async function loadCandidates(
  batchId: string,
  runId: number | undefined,
  client: CandidateLoaderClient,
): Promise<EvaluatedStageCandidate[]> {
  const products = await client.stagingProduct.findMany({
    where: {
      run: {
        batch_id: batchId,
        ...(runId !== undefined ? { id: runId } : {}),
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
      promo: true,
      run: { select: { started_at: true } },
    },
  });

  return products.map((product) => ({
    id: product.id,
    runId: product.run_id,
    acquiredAt: product.run?.started_at ?? null,
    sourceSlug: product.source_slug,
    ean: normalizeGtin(product.ean) ?? product.ean,
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
    promo: (product.promo as SimplePromotion | null) ?? null,
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
  const persisted = await persistReconcileChunk({
    tx,
    candidates,
    supermarketIdBySlug,
    eans,
    allSupermarketIds,
    existingSupermarketProductByKey,
    dryRun,
    timestamp,
  });

  return {
    newProducts: newProductRows.length,
    mergedProducts: eans.length - newProductRows.length,
    ...persisted,
  };
}

type ChunkPersistResult = {
  supermarketProductsCreated: number;
  supermarketProductsUpdated: number;
  priceHistoryInserted: number;
  promoted: number;
  promotedByRunId: Record<string, number>;
  promotedBySource: Record<string, number>;
};

type SkuOwnerRow = { product_ean: string; supermarket_id: number; sku_id: string | null };

// A store SKU identifies at most one offer per supermarket, but stores move a
// SKU to a new EAN (Coto re-barcoded sku00570228). The SKU follows its newest
// EAN: within the chunk only the last row keeps it, and any other offer of the
// same supermarket still holding it gives it up before the upsert.
async function releaseReassignedSkus(tx: Prisma.TransactionClient, rows: SkuOwnerRow[]) {
  const ownerBySku = new Map<string, SkuOwnerRow>();
  for (const row of rows) {
    if (row.sku_id === null) continue;
    const key = `${row.supermarket_id}:${row.sku_id}`;
    const previous = ownerBySku.get(key);
    if (previous) previous.sku_id = null;
    ownerBySku.set(key, row);
  }
  const owners = Array.from(ownerBySku.values());
  if (owners.length === 0) return;
  const values = owners.map((row) => Prisma.sql`(${row.product_ean}, ${row.supermarket_id}::int, ${row.sku_id})`);
  await tx.$executeRaw`
    UPDATE supermarket_products AS sp
    SET sku_id = NULL
    FROM (VALUES ${Prisma.join(values)}) AS owner(product_ean, supermarket_id, sku_id)
    WHERE sp.supermarket_id = owner.supermarket_id
      AND sp.sku_id = owner.sku_id
      AND sp.product_ean <> owner.product_ean
  `;
}

async function persistReconcileChunk(args: {
  tx: Prisma.TransactionClient;
  candidates: EvaluatedStageCandidate[];
  supermarketIdBySlug: Map<string, number>;
  eans: string[];
  allSupermarketIds: number[];
  existingSupermarketProductByKey: Map<
    string,
    { id: number; product_ean: string; supermarket_id: number }
  >;
  dryRun: boolean;
  timestamp: Date;
}): Promise<ChunkPersistResult> {
  const {
    tx,
    candidates,
    supermarketIdBySlug,
    eans,
    allSupermarketIds,
    existingSupermarketProductByKey,
    dryRun,
    timestamp,
  } = args;

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
      promo: candidate.promo ?? null,
      last_checked_at: observationInstantFor(candidate, timestamp),
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
    await releaseReassignedSkus(tx, upsertRows);
    const upsertValues = upsertRows.map((row) =>
      Prisma.sql`(${row.product_ean}, ${row.supermarket_id}, ${row.price}, ${row.list_price}, ${row.reference_price}, ${row.reference_unit}, ${row.is_available}, ${row.sku_id}, ${row.seller_id}, ${row.product_url}, ${row.promo === null ? Prisma.sql`NULL` : Prisma.sql`${JSON.stringify(row.promo)}::jsonb`}, ${row.last_checked_at})`,
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
        promo,
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
        promo = EXCLUDED.promo,
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
  const priceHistoryInserted = await insertReconcileHistory({
    tx,
    candidates,
    supermarketIdBySlug,
    refreshedSupermarketProductByKey,
    latestHistoryBySupermarketProductId,
    dryRun,
    timestamp,
  });

  const promoted = await promoteReconcileCandidates(tx, candidates, dryRun);

  return {
    supermarketProductsCreated: createSupermarketProductRows.length,
    supermarketProductsUpdated: updateSupermarketProducts.length,
    priceHistoryInserted,
    ...promoted,
  };
}

async function promoteReconcileCandidates(
  tx: Prisma.TransactionClient,
  candidates: EvaluatedStageCandidate[],
  dryRun: boolean,
): Promise<{
  promoted: number;
  promotedByRunId: Record<string, number>;
  promotedBySource: Record<string, number>;
}> {
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

  return { promoted: candidates.length, promotedByRunId, promotedBySource };
}

async function insertReconcileHistory(args: {
  tx: Prisma.TransactionClient;
  candidates: EvaluatedStageCandidate[];
  supermarketIdBySlug: Map<string, number>;
  refreshedSupermarketProductByKey: Map<
    string,
    { id: number; product_ean: string; supermarket_id: number }
  >;
  latestHistoryBySupermarketProductId: Map<
    number,
    { price: Prisma.Decimal | null; list_price: Prisma.Decimal | null } | undefined
  >;
  dryRun: boolean;
  timestamp: Date;
}): Promise<number> {
  const {
    tx,
    candidates,
    supermarketIdBySlug,
    refreshedSupermarketProductByKey,
    latestHistoryBySupermarketProductId,
    dryRun,
    timestamp,
  } = args;

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
        scraped_at: observationInstantFor(candidate, timestamp),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (!dryRun && historyRows.length > 0) {
    await tx.priceHistory.createMany({
      data: historyRows,
    });
  }
  return historyRows.length;
}


export async function reconcileStageProducts({
  batchId,
  runId,
  batchSize = 500,
  candidates,
  dryRun = false,
  writeMode = "standard",
}: ReconcileStageProductsOptions): Promise<ReconcileSummary> {
  const txMaxWaitMs = readPositiveIntEnv("RECONCILE_TX_MAX_WAIT_MS", DEFAULT_TX_MAX_WAIT_MS);
  const txTimeoutMs = readPositiveIntEnv("RECONCILE_TX_TIMEOUT_MS", DEFAULT_TX_TIMEOUT_MS);

  return db.$transaction(
    async (tx) => {
      await ensureReconcileAdvisoryLock(tx);

      const resolvedCandidates = candidates ?? (batchId ? await loadCandidates(batchId, runId, tx) : []);
      const pendingCandidates = resolvedCandidates.filter((candidate) => candidate.status === "PENDING");
      const supermarketRows = await tx.supermarket.findMany({
        select: {
          id: true,
          slug: true,
        },
      });
      const supermarketIdBySlug = new Map(supermarketRows.map((supermarket) => [supermarket.slug, supermarket.id]));

      if (writeMode === "refresh-existing") {
        await assertRefreshExistingPreflight(tx, pendingCandidates, supermarketIdBySlug);
      }

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
