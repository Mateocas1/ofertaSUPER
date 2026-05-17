import "server-only";

import { db } from "@/lib/db";

type AdminScraperOverview = {
  historyRecords24h: number;
  updatedProducts24h: number;
  activeSupermarkets24h: number;
  staleProducts: number;
  latestRunAt: string | null;
};

type AdminScraperSupermarketStat = {
  id: number;
  name: string;
  slug: string;
  updatedProducts24h: number;
  staleProducts: number;
  latestCheckAt: string | null;
};

export type AdminScraperStats = {
  overview: AdminScraperOverview;
  supermarkets: AdminScraperSupermarketStat[];
};

export async function getAdminScraperStats(hours = 24): Promise<AdminScraperStats> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const [supermarkets, recentGroups, staleGroups, latestAggregate, historyRecords24h] = await Promise.all([
    db.supermarket.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    }),
    db.supermarketProduct.groupBy({
      by: ["supermarket_id"],
      where: {
        last_checked_at: {
          gte: since,
        },
      },
      _count: {
        _all: true,
      },
      _max: {
        last_checked_at: true,
      },
    }),
    db.supermarketProduct.groupBy({
      by: ["supermarket_id"],
      where: {
        last_checked_at: {
          lt: since,
        },
      },
      _count: {
        _all: true,
      },
    }),
    db.supermarketProduct.aggregate({
      _max: {
        last_checked_at: true,
      },
    }),
    db.priceHistory.count({
      where: {
        scraped_at: {
          gte: since,
        },
      },
    }),
  ]);

  const recentBySupermarket = new Map(
    recentGroups.map((entry) => [
      entry.supermarket_id,
      {
        updatedProducts24h: entry._count._all,
        latestCheckAt: entry._max.last_checked_at?.toISOString() ?? null,
      },
    ]),
  );
  const staleBySupermarket = new Map(staleGroups.map((entry) => [entry.supermarket_id, entry._count._all]));

  const supermarketStats = supermarkets
    .map((supermarket) => {
      const recent = recentBySupermarket.get(supermarket.id);

      return {
        id: supermarket.id,
        name: supermarket.name,
        slug: supermarket.slug,
        updatedProducts24h: recent?.updatedProducts24h ?? 0,
        staleProducts: staleBySupermarket.get(supermarket.id) ?? 0,
        latestCheckAt: recent?.latestCheckAt ?? null,
      };
    })
    .sort((left, right) => {
      if (right.updatedProducts24h !== left.updatedProducts24h) {
        return right.updatedProducts24h - left.updatedProducts24h;
      }

      return left.name.localeCompare(right.name, "es");
    });

  return {
    overview: {
      historyRecords24h,
      updatedProducts24h: supermarketStats.reduce((total, item) => total + item.updatedProducts24h, 0),
      activeSupermarkets24h: supermarketStats.filter((item) => item.updatedProducts24h > 0).length,
      staleProducts: supermarketStats.reduce((total, item) => total + item.staleProducts, 0),
      latestRunAt: latestAggregate._max.last_checked_at?.toISOString() ?? null,
    },
    supermarkets: supermarketStats,
  };
}