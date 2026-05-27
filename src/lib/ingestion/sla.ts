import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

const DEFAULT_FRESHNESS_TARGET_PERCENT = 95;
const DEFAULT_FRESHNESS_ALERT_PERCENT = 80;

type FreshnessMeasurementBasis = "production" | "shadow";
type FreshnessMeasurementMode = "production" | "shadow" | "mixed";

type FreshnessSourceMetric = {
  supermarketId: number;
  name: string;
  slug: string;
  slaHours: number;
  totalProducts: number;
  freshProducts: number;
  freshnessPercent: number;
  isBelowTarget: boolean;
  isBelowAlertThreshold: boolean;
  latestCheckAt: string | null;
  measurementBasis: FreshnessMeasurementBasis;
};

export type FreshnessSnapshot = {
  generatedAt: string;
  targetPercent: number;
  alertThresholdPercent: number;
  measurementMode: FreshnessMeasurementMode;
  totalProducts: number;
  freshProducts: number;
  overallFreshnessPercent: number;
  sourcesBelowTarget: number;
  sourcesBelowAlertThreshold: number;
  sources: FreshnessSourceMetric[];
};

type ProductionFreshnessMetricRow = {
  supermarket_id: number;
  name: string;
  slug: string;
  sla_hours: number;
  total_products: bigint | number;
  fresh_products: bigint | number;
  latest_check_at: Date | null;
};

type ShadowFreshnessMetricRow = {
  supermarket_id: number;
  total_products: bigint | number;
  fresh_products: bigint | number;
  latest_run_at: Date | null;
};

function toNumber(value: bigint | number) {
  return typeof value === "bigint" ? Number(value) : value;
}

function roundPercentage(value: number) {
  return Math.round(value * 10) / 10;
}

export async function getFreshnessSnapshot(
  options: {
    targetPercent?: number;
    alertThresholdPercent?: number;
  } = {},
): Promise<FreshnessSnapshot> {
  const targetPercent = options.targetPercent ?? DEFAULT_FRESHNESS_TARGET_PERCENT;
  const alertThresholdPercent = options.alertThresholdPercent ?? DEFAULT_FRESHNESS_ALERT_PERCENT;
  const [productionRows, shadowRows] = await Promise.all([
    db.$queryRaw<ProductionFreshnessMetricRow[]>(Prisma.sql`
      SELECT
        s.id AS supermarket_id,
        s.name,
        s.slug,
        s.freshness_sla_hours AS sla_hours,
        COUNT(sp.id) AS total_products,
        COUNT(sp.id) FILTER (
          WHERE sp.last_checked_at >= NOW() - (s.freshness_sla_hours * INTERVAL '1 hour')
        ) AS fresh_products,
        MAX(sp.last_checked_at) AS latest_check_at
      FROM supermarkets s
      LEFT JOIN supermarket_products sp ON sp.supermarket_id = s.id
      WHERE s.is_active = true
      GROUP BY s.id, s.name, s.slug, s.freshness_sla_hours
      ORDER BY s.name ASC
    `),
    db.$queryRaw<ShadowFreshnessMetricRow[]>(Prisma.sql`
      WITH latest_runs AS (
        SELECT DISTINCT ON (ir.source_slug)
          ir.id,
          ir.source_slug,
          COALESCE(ir.finished_at, ir.started_at) AS latest_run_at
        FROM ingestion_run ir
        WHERE ir.status IN ('SUCCESS', 'PARTIAL')
        ORDER BY ir.source_slug, COALESCE(ir.finished_at, ir.started_at) DESC
      )
      SELECT
        s.id AS supermarket_id,
        COUNT(DISTINCT sp.ean) FILTER (
          WHERE sp.status <> 'REJECTED'
        ) AS total_products,
        COUNT(DISTINCT sp.ean) FILTER (
          WHERE sp.status <> 'REJECTED'
            AND lr.latest_run_at >= NOW() - (s.freshness_sla_hours * INTERVAL '1 hour')
        ) AS fresh_products,
        lr.latest_run_at
      FROM supermarkets s
      LEFT JOIN latest_runs lr ON lr.source_slug = s.slug
      LEFT JOIN staging_product sp ON sp.run_id = lr.id
      WHERE s.is_active = true
      GROUP BY s.id, lr.latest_run_at, s.freshness_sla_hours
      ORDER BY s.id ASC
    `),
  ]);

  const shadowBySupermarketId = new Map(shadowRows.map((row) => [row.supermarket_id, row]));

  const sources = productionRows.map((row) => {
    const productionTotalProducts = toNumber(row.total_products);
    const productionFreshProducts = toNumber(row.fresh_products);
    const shadow = shadowBySupermarketId.get(row.supermarket_id);
    const shadowTotalProducts = toNumber(shadow?.total_products ?? 0);
    const shadowFreshProducts = toNumber(shadow?.fresh_products ?? 0);
    const productionLatestCheckAt = row.latest_check_at;
    const shadowLatestRunAt = shadow?.latest_run_at ?? null;
    const useShadowFallback =
      shadowTotalProducts > 0 &&
      (!productionLatestCheckAt || (shadowLatestRunAt !== null && shadowLatestRunAt > productionLatestCheckAt));
    const totalProducts = useShadowFallback ? shadowTotalProducts : productionTotalProducts;
    const freshProducts = useShadowFallback ? shadowFreshProducts : productionFreshProducts;
    const freshnessPercent = totalProducts > 0 ? roundPercentage((freshProducts / totalProducts) * 100) : 0;

    return {
      supermarketId: row.supermarket_id,
      name: row.name,
      slug: row.slug,
      slaHours: row.sla_hours,
      totalProducts,
      freshProducts,
      freshnessPercent,
      isBelowTarget: freshnessPercent < targetPercent,
      isBelowAlertThreshold: freshnessPercent < alertThresholdPercent,
      latestCheckAt: (useShadowFallback ? shadowLatestRunAt : productionLatestCheckAt)?.toISOString() ?? null,
      measurementBasis: useShadowFallback ? "shadow" : "production",
    } satisfies FreshnessSourceMetric;
  });

  const totalProducts = sources.reduce((total, source) => total + source.totalProducts, 0);
  const freshProducts = sources.reduce((total, source) => total + source.freshProducts, 0);
  const measurementBases = new Set(
    sources.filter((source) => source.totalProducts > 0).map((source) => source.measurementBasis),
  );
  const measurementMode =
    measurementBases.size === 0
      ? "production"
      : measurementBases.size === 1
        ? Array.from(measurementBases)[0]
        : "mixed";

  return {
    generatedAt: new Date().toISOString(),
    targetPercent,
    alertThresholdPercent,
    measurementMode,
    totalProducts,
    freshProducts,
    overallFreshnessPercent: totalProducts > 0 ? roundPercentage((freshProducts / totalProducts) * 100) : 0,
    sourcesBelowTarget: sources.filter((source) => source.isBelowTarget).length,
    sourcesBelowAlertThreshold: sources.filter((source) => source.isBelowAlertThreshold).length,
    sources,
  };
}