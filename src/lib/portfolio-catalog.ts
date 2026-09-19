import "server-only";

import type { ProductDetail, ProductHistory, PromotionSummary } from "@/lib/catalog";
import { getBiggestPriceDropAlert, comparePriceAgainstHistory } from "@/lib/promotions/alerts";
import { detectAutomaticDiscount, getBestPromotionPrice } from "@/lib/promotions/detect";
import { classifyPriceFreshness } from "@/lib/price-freshness";
import type { PublicCatalogProjection } from "@/lib/public-catalog-read.server";
import { resolvePublicCatalogDataFromGuardedRead, type PublicCatalogGuardedReader } from "@/lib/public-catalog-api";
import { createPublicCatalogGuardedRead } from "@/lib/public-catalog-read.server";

type CatalogEnvironment = Record<string, string | undefined>;
type ProductProjection = Pick<PublicCatalogProjection, "servingProduct" | "servingOffer" | "servingSupermarket" | "servingHistory" | "servingPromotion" | "servingMembership">;

function normalizePromotionType(type: string): PromotionSummary["type"] {
  switch (type) {
    case "TWO_FOR_ONE": return "2x1";
    case "SECOND_HALF": return "2nd_50";
    case "WALLET_DISCOUNT": return "wallet_discount";
    case "BANK_DISCOUNT": return "bank_discount";
    default: return "percentage";
  }
}

const guardedRead = createPublicCatalogGuardedRead(process.env.PUBLIC_CATALOG_SERVING_IDENTITY_JSON);

export async function loadPublicProductDetail(ean: string, client: ProductProjection): Promise<ProductDetail | null> {
  const product = await client.servingProduct.findUnique({
    where: { ean },
    select: { ean: true, name: true, brand: true, description: true, image_url: true, images: true, category: true },
  });
  if (!product) return null;

  const now = new Date();
  const [offers, histories, rawPromotions] = await Promise.all([
    client.servingOffer.findMany({
      where: { product_ean: ean },
      select: { supermarket_id: true, sku_id: true, price: true, list_price: true, reference_price: true, reference_unit: true, is_available: true, product_url: true, last_checked_at: true },
    }),
    client.servingHistory.findMany({
      where: { product_ean: ean }, orderBy: { scraped_at: "desc" },
      select: { supermarket_id: true, price: true },
    }),
    client.servingPromotion.findMany({
      where: { is_active: true, AND: [{ OR: [{ start_date: null }, { start_date: { lte: now } }] }, { OR: [{ end_date: null }, { end_date: { gte: now } }] }] },
      select: { id: true, supermarket_id: true, type: true, title: true, discount_value: true, wallet_provider: true, bank_name: true, conditions: true, start_date: true, end_date: true },
    }),
  ]);
  const memberships = await client.servingMembership.findMany({
    where: { promotion_id: { in: rawPromotions.map((promotion) => promotion.id) } },
    select: { promotion_id: true, product_ean: true },
  });
  const membershipsByPromotion = new Map<bigint, string[]>();
  for (const membership of memberships) membershipsByPromotion.set(membership.promotion_id, [...(membershipsByPromotion.get(membership.promotion_id) ?? []), membership.product_ean]);
  const applicableRawPromotions = rawPromotions.filter((promotion) => {
    const productEans = membershipsByPromotion.get(promotion.id) ?? [];
    return productEans.length === 0 || productEans.includes(ean);
  });
  const supermarkets = await client.servingSupermarket.findMany({
    where: { id: { in: Array.from(new Set([...offers.map((offer) => offer.supermarket_id), ...applicableRawPromotions.map((promotion) => promotion.supermarket_id)])) } },
    select: { id: true, name: true, slug: true, logo_url: true, freshness_sla_hours: true },
  });
  const supermarketsById = new Map(supermarkets.map((supermarket) => [supermarket.id, supermarket]));
  const promotions: PromotionSummary[] = applicableRawPromotions.flatMap((promotion) => {
    const supermarket = supermarketsById.get(promotion.supermarket_id);
    if (!supermarket) return [];
    return [{ id: Number(promotion.id), title: promotion.title, type: normalizePromotionType(promotion.type), discountValue: promotion.discount_value === null ? null : Number(promotion.discount_value), walletProvider: promotion.wallet_provider, bankName: promotion.bank_name, conditions: promotion.conditions, startDate: promotion.start_date?.toISOString() ?? null, endDate: promotion.end_date?.toISOString() ?? null, supermarket: { id: supermarket.id, name: supermarket.name, slug: supermarket.slug, logoUrl: supermarket.logo_url }, productCount: (membershipsByPromotion.get(promotion.id) ?? []).length }];
  });
  const historyCountBySupermarket = new Map<number, number>();
  const previousBySupermarket = new Map<number, number | null>();
  for (const history of histories) {
    const count = (historyCountBySupermarket.get(history.supermarket_id) ?? 0) + 1;
    historyCountBySupermarket.set(history.supermarket_id, count);
    if (count === 2) previousBySupermarket.set(history.supermarket_id, history.price === null ? null : Number(history.price));
  }
  const priceEntries = offers.flatMap((offer) => {
    const supermarket = supermarketsById.get(offer.supermarket_id);
    if (!supermarket) return [];
    const price = offer.price === null ? null : Number(offer.price);
    const listPrice = offer.list_price === null ? null : Number(offer.list_price);
    const priceMovement = comparePriceAgainstHistory(price, previousBySupermarket.get(offer.supermarket_id) ?? null);
    const automaticDiscount = detectAutomaticDiscount(price, listPrice);
    const bestPromotionResult = getBestPromotionPrice(price, promotions.filter((promotion) => promotion.supermarket.id === offer.supermarket_id));
    const freshnessStatus = classifyPriceFreshness(offer.last_checked_at, { maxAgeHours: supermarket.freshness_sla_hours }).status;
    return [{
      supermarket: { id: supermarket.id, name: supermarket.name, slug: supermarket.slug, logoUrl: supermarket.logo_url },
      supermarketProductId: offer.sku_id as unknown as number, price, listPrice,
      referencePrice: offer.reference_price === null ? null : Number(offer.reference_price), referenceUnit: offer.reference_unit,
      isAvailable: offer.is_available, productUrl: offer.product_url, lastCheckedAt: offer.last_checked_at.toISOString(),
      freshnessSlaHours: supermarket.freshness_sla_hours, freshnessStatus, previousPrice: priceMovement.previousPrice,
      deltaPercent: priceMovement.deltaPercent, priceDropAlert: priceMovement.priceDropAlert,
      automaticDiscountPercent: automaticDiscount?.percentOff ?? null, bestPromotion: bestPromotionResult?.promotion ?? null, finalPrice: bestPromotionResult?.finalPrice ?? null,
    }];
  }).sort((left, right) => (left.price ?? Infinity) - (right.price ?? Infinity));
  const comparable = priceEntries.filter((entry) => entry.isAvailable && entry.price !== null);
  const fresh = comparable.filter((entry) => entry.freshnessStatus === "fresh");
  const prices = comparable.map((entry) => entry.price as number);
  const freshPrices = fresh.map((entry) => entry.price as number);
  const finalPrices = fresh.map((entry) => entry.finalPrice).filter((price): price is number => price !== null);
  const automaticDiscountPercent = fresh.reduce<number | null>((best, entry) => entry.automaticDiscountPercent === null ? best : best === null ? entry.automaticDiscountPercent : Math.max(best, entry.automaticDiscountPercent), null);

  return {
    ean: product.ean, name: product.name, brand: product.brand, description: product.description,
    imageUrl: product.image_url, images: product.images, category: product.category,
    minPrice: prices.length ? Math.min(...prices) : null, maxPrice: prices.length ? Math.max(...prices) : null,
    freshMinPrice: freshPrices.length ? Math.min(...freshPrices) : null, displayPrice: fresh[0]?.price ?? null,
    displayPriceCheckedAt: fresh[0]?.lastCheckedAt ?? null, displayPriceFreshnessStatus: fresh[0]?.freshnessStatus ?? "unknown",
    hasFreshPrice: fresh.length > 0, stalePriceCount: priceEntries.filter((entry) => entry.freshnessStatus === "stale").length,
    automaticDiscountPercent, bestFinalPrice: finalPrices.length ? Math.min(...finalPrices) : null,
    bestPriceDropAlert: getBiggestPriceDropAlert(fresh.map((entry) => entry.priceDropAlert)),
    priceEntries, promotions,
  };
}

export async function loadPublicProductHistory(ean: string, days: number, client: Pick<PublicCatalogProjection, "servingHistory" | "servingSupermarket">): Promise<ProductHistory> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const history = await client.servingHistory.findMany({
    where: { product_ean: ean, scraped_at: { gte: cutoff } }, orderBy: { scraped_at: "asc" },
    select: { price: true, scraped_at: true, supermarket_id: true },
  });
  const supermarkets = await client.servingSupermarket.findMany({
    where: { id: { in: Array.from(new Set(history.map((entry) => entry.supermarket_id))) } },
    select: { id: true, name: true, slug: true },
  });
  const byId = new Map(supermarkets.map((supermarket) => [supermarket.id, supermarket]));
  const series = new Map<string, { slug: string; name: string; color: string }>();
  const points = new Map<string, Record<string, number | string | null>>();
  for (const entry of history) {
    const supermarket = byId.get(entry.supermarket_id);
    if (!supermarket) continue;
    if (!series.has(supermarket.slug)) series.set(supermarket.slug, { slug: supermarket.slug, name: supermarket.name, color: ["#d24726", "#2a6f58", "#4259d6"][series.size % 3] });
    const date = entry.scraped_at.toISOString().slice(0, 10);
    const point = points.get(date) ?? { date };
    point[supermarket.slug] = entry.price === null ? null : Number(entry.price);
    points.set(date, point);
  }
  return { ean, days, series: Array.from(series.values()), points: Array.from(points.values()) };
}

export async function resolveProductDetail(
  ean: string,
  loadDatabaseDetail: (ean: string) => Promise<ProductDetail | null>,
  env: CatalogEnvironment = process.env,
) {
  void env;
  return loadDatabaseDetail(ean);
}

export async function resolveRouteProductDetail(
  ean: string,
  reader: PublicCatalogGuardedReader = guardedRead,
) {
  return resolvePublicCatalogDataFromGuardedRead<{ item: ProductDetail | null }>(
    async (projection) => ({ item: await loadPublicProductDetail(ean, projection) }),
    reader,
  );
}

export async function resolveProductHistory(ean: string, days: number, reader: PublicCatalogGuardedReader = guardedRead) {
  return resolvePublicCatalogDataFromGuardedRead((projection) => loadPublicProductHistory(ean, days, projection), reader);
}

export async function resolveProductPageData(ean: string, days: number, reader: PublicCatalogGuardedReader = guardedRead) {
  return resolvePublicCatalogDataFromGuardedRead(async (projection) => ({
    product: await loadPublicProductDetail(ean, projection),
    history: await loadPublicProductHistory(ean, days, projection),
  }), reader);
}

export function resolveOfflineBasketProducts(eans: string[], env: CatalogEnvironment = process.env) {
  void eans;
  void env;
  return null;
}
