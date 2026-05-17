import { Prisma } from "@prisma/client";
import { cache } from "react";

import { db } from "@/lib/db";
import { getFreshnessSnapshot, type FreshnessSnapshot } from "@/lib/ingestion/sla";

export type IngestionRunStatus = "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED" | "NO_DATA";
export type IngestionHealthState = "healthy" | "blocked" | "hash_invalid" | "timeout" | "network" | "unknown" | "no_data";

export type AdminIngestionOverview = {
  latestRunAt: string | null;
  healthySources: number;
  blockedSources: number;
  failedSources: number;
  overallFreshnessPercent: number;
  sourcesBelowSla: number;
  promotedProducts30d: number;
  rejectedProducts30d: number;
  averageQualityScore30d: number;
};

export type AdminIngestionRunStat = {
  supermarketId: number;
  name: string;
  slug: string;
  batchId: string | null;
  status: IngestionRunStatus;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  queriesSent: number;
  productsFetched: number;
  productsStaged: number;
  productsPromoted: number;
  productsRejected: number;
  rejectionRate: number;
  errorSummary: string | null;
};

export type AdminIngestionHealthStat = {
  supermarketId: number;
  name: string;
  slug: string;
  state: IngestionHealthState;
  isHealthy: boolean;
  hashValid: boolean;
  checkedAt: string | null;
  responseTimeMs: number | null;
  productsReturned: number;
  errorType: string | null;
};

export type QualityDistributionBucket = {
  id: string;
  label: string;
  min: number;
  max: number;
  count: number;
};

export type IngestionTrendPoint = {
  date: string;
  detectedProducts: number;
  stagedProducts: number;
  promotedProducts: number;
  rejectedProducts: number;
};

export type AdminIngestionDashboard = {
  overview: AdminIngestionOverview;
  freshness: FreshnessSnapshot;
  runs: AdminIngestionRunStat[];
  health: AdminIngestionHealthStat[];
  qualityDistribution: QualityDistributionBucket[];
  trend: IngestionTrendPoint[];
};

type LatestRunRecord = {
  batch_id: string;
  source_slug: string;
  status: "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED";
  started_at: Date;
  finished_at: Date | null;
  duration_ms: number | null;
  queries_sent: number;
  products_fetched: number;
  products_staged: number;
  products_promoted: number;
  products_rejected: number;
  error_summary: string | null;
};

type LatestHealthRecord = {
  source_slug: string;
  checked_at: Date;
  is_healthy: boolean;
  hash_valid: boolean;
  response_time_ms: number;
  products_returned: number;
  error_type: string | null;
};

type QualityDistributionRow = {
  bucket_0_24: bigint | number;
  bucket_25_49: bigint | number;
  bucket_50_74: bigint | number;
  bucket_75_89: bigint | number;
  bucket_90_100: bigint | number;
};

type TrendStageRow = {
  day: Date;
  detected_products: bigint | number;
};

type TrendRunRow = {
  day: Date;
  staged_products: bigint | number;
  promoted_products: bigint | number;
  rejected_products: bigint | number;
};

function toNumber(value: bigint | number) {
  return typeof value === "bigint" ? Number(value) : value;
}

function roundPercentage(value: number) {
  return Math.round(value * 10) / 10;
}

function getHealthState(record: LatestHealthRecord | undefined): IngestionHealthState {
  if (!record) {
    return "no_data";
  }

  if (record.is_healthy) {
    return "healthy";
  }

  switch (record.error_type) {
    case "blocked":
      return "blocked";
    case "hash_invalid":
      return "hash_invalid";
    case "timeout":
      return "timeout";
    case "network":
      return "network";
    default:
      return "unknown";
  }
}

function formatTrendDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function enumerateDays(days: number) {
  const points: string[] = [];
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  startDate.setDate(startDate.getDate() - (days - 1));

  for (let offset = 0; offset < days; offset += 1) {
    const day = new Date(startDate);
    day.setDate(startDate.getDate() + offset);
    points.push(day.toISOString().slice(0, 10));
  }

  return points;
}

async function getLatestRunsBySource() {
  const runs = await db.ingestionRun.findMany({
    orderBy: [{ started_at: "desc" }],
    select: {
      batch_id: true,
      source_slug: true,
      status: true,
      started_at: true,
      finished_at: true,
      duration_ms: true,
      queries_sent: true,
      products_fetched: true,
      products_staged: true,
      products_promoted: true,
      products_rejected: true,
      error_summary: true,
    },
    take: 120,
  });

  const latestBySource = new Map<string, LatestRunRecord>();

  for (const run of runs) {
    if (!latestBySource.has(run.source_slug)) {
      latestBySource.set(run.source_slug, run);
    }
  }

  return latestBySource;
}

async function getLatestHealthBySource() {
  const healthRecords = await db.sourceHealth.findMany({
    orderBy: [{ checked_at: "desc" }],
    select: {
      source_slug: true,
      checked_at: true,
      is_healthy: true,
      hash_valid: true,
      response_time_ms: true,
      products_returned: true,
      error_type: true,
    },
    take: 120,
  });

  const latestBySource = new Map<string, LatestHealthRecord>();

  for (const record of healthRecords) {
    if (!latestBySource.has(record.source_slug)) {
      latestBySource.set(record.source_slug, record);
    }
  }

  return latestBySource;
}

async function getQualityDistribution(days: number): Promise<QualityDistributionBucket[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const [row] = await db.$queryRaw<QualityDistributionRow[]>(Prisma.sql`
    SELECT
      COUNT(*) FILTER (WHERE quality_score < 0.25) AS bucket_0_24,
      COUNT(*) FILTER (WHERE quality_score >= 0.25 AND quality_score < 0.50) AS bucket_25_49,
      COUNT(*) FILTER (WHERE quality_score >= 0.50 AND quality_score < 0.75) AS bucket_50_74,
      COUNT(*) FILTER (WHERE quality_score >= 0.75 AND quality_score < 0.90) AS bucket_75_89,
      COUNT(*) FILTER (WHERE quality_score >= 0.90) AS bucket_90_100
    FROM staging_product
    WHERE created_at >= ${cutoff}
  `);

  return [
    { id: "0-24", label: "0.00-0.24", min: 0, max: 0.24, count: toNumber(row?.bucket_0_24 ?? 0) },
    { id: "25-49", label: "0.25-0.49", min: 0.25, max: 0.49, count: toNumber(row?.bucket_25_49 ?? 0) },
    { id: "50-74", label: "0.50-0.74", min: 0.5, max: 0.74, count: toNumber(row?.bucket_50_74 ?? 0) },
    { id: "75-89", label: "0.75-0.89", min: 0.75, max: 0.89, count: toNumber(row?.bucket_75_89 ?? 0) },
    { id: "90-100", label: "0.90-1.00", min: 0.9, max: 1, count: toNumber(row?.bucket_90_100 ?? 0) },
  ];
}

async function getTrend(days: number): Promise<IngestionTrendPoint[]> {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (days - 1));

  const [stageRows, runRows] = await Promise.all([
    db.$queryRaw<TrendStageRow[]>(Prisma.sql`
      SELECT
        DATE(created_at) AS day,
        COUNT(DISTINCT ean) AS detected_products
      FROM staging_product
      WHERE created_at >= ${cutoff}
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `),
    db.$queryRaw<TrendRunRow[]>(Prisma.sql`
      SELECT
        DATE(started_at) AS day,
        SUM(products_staged) AS staged_products,
        SUM(products_promoted) AS promoted_products,
        SUM(products_rejected) AS rejected_products
      FROM ingestion_run
      WHERE started_at >= ${cutoff}
      GROUP BY DATE(started_at)
      ORDER BY day ASC
    `),
  ]);

  const stageByDay = new Map(
    stageRows.map((row) => [formatTrendDate(row.day), toNumber(row.detected_products)]),
  );
  const runsByDay = new Map(
    runRows.map((row) => [
      formatTrendDate(row.day),
      {
        stagedProducts: toNumber(row.staged_products),
        promotedProducts: toNumber(row.promoted_products),
        rejectedProducts: toNumber(row.rejected_products),
      },
    ]),
  );

  return enumerateDays(days).map((date) => {
    const runData = runsByDay.get(date);

    return {
      date,
      detectedProducts: stageByDay.get(date) ?? 0,
      stagedProducts: runData?.stagedProducts ?? 0,
      promotedProducts: runData?.promotedProducts ?? 0,
      rejectedProducts: runData?.rejectedProducts ?? 0,
    } satisfies IngestionTrendPoint;
  });
}

export const getAdminIngestionDashboard = cache(
  async (options: { trendDays?: number; qualityWindowDays?: number } = {}): Promise<AdminIngestionDashboard> => {
    const trendDays = options.trendDays ?? 30;
    const qualityWindowDays = options.qualityWindowDays ?? 30;
    const [supermarkets, freshness, latestRunsBySource, latestHealthBySource, qualityDistribution, trend, qualityAverage] = await Promise.all([
      db.supermarket.findMany({
        where: { is_active: true },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          slug: true,
        },
      }),
      getFreshnessSnapshot(),
      getLatestRunsBySource(),
      getLatestHealthBySource(),
      getQualityDistribution(qualityWindowDays),
      getTrend(trendDays),
      db.stagingProduct.aggregate({
        where: {
          created_at: {
            gte: new Date(Date.now() - qualityWindowDays * 24 * 60 * 60 * 1000),
          },
        },
        _avg: {
          quality_score: true,
        },
      }),
    ]);

    const runs = supermarkets.map((supermarket) => {
      const run = latestRunsBySource.get(supermarket.slug);
      const rejectionRate = run && run.products_staged > 0 ? roundPercentage((run.products_rejected / run.products_staged) * 100) : 0;

      return {
        supermarketId: supermarket.id,
        name: supermarket.name,
        slug: supermarket.slug,
        batchId: run?.batch_id ?? null,
        status: run?.status ?? "NO_DATA",
        startedAt: run?.started_at.toISOString() ?? null,
        finishedAt: run?.finished_at?.toISOString() ?? null,
        durationMs: run?.duration_ms ?? null,
        queriesSent: run?.queries_sent ?? 0,
        productsFetched: run?.products_fetched ?? 0,
        productsStaged: run?.products_staged ?? 0,
        productsPromoted: run?.products_promoted ?? 0,
        productsRejected: run?.products_rejected ?? 0,
        rejectionRate,
        errorSummary: run?.error_summary ?? null,
      } satisfies AdminIngestionRunStat;
    });

    const health = supermarkets.map((supermarket) => {
      const record = latestHealthBySource.get(supermarket.slug);

      return {
        supermarketId: supermarket.id,
        name: supermarket.name,
        slug: supermarket.slug,
        state: getHealthState(record),
        isHealthy: record?.is_healthy ?? false,
        hashValid: record?.hash_valid ?? false,
        checkedAt: record?.checked_at.toISOString() ?? null,
        responseTimeMs: record?.response_time_ms ?? null,
        productsReturned: record?.products_returned ?? 0,
        errorType: record?.error_type ?? null,
      } satisfies AdminIngestionHealthStat;
    });

    const overview = {
      latestRunAt: runs.map((run) => run.startedAt).filter((value): value is string => Boolean(value)).sort((left, right) => right.localeCompare(left))[0] ?? null,
      healthySources: health.filter((item) => item.state === "healthy").length,
      blockedSources: health.filter((item) => item.state === "blocked").length,
      failedSources: runs.filter((item) => item.status === "FAILED").length,
      overallFreshnessPercent: freshness.overallFreshnessPercent,
      sourcesBelowSla: freshness.sourcesBelowAlertThreshold,
      promotedProducts30d: trend.reduce((total, point) => total + point.promotedProducts, 0),
      rejectedProducts30d: trend.reduce((total, point) => total + point.rejectedProducts, 0),
      averageQualityScore30d: roundPercentage((qualityAverage._avg.quality_score ?? 0) * 100),
    } satisfies AdminIngestionOverview;

    return {
      overview,
      freshness,
      runs,
      health,
      qualityDistribution,
      trend,
    };
  },
);