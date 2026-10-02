import { normalizeGtin } from "@/lib/identity/gtin";
import { comparePriceAgainstHistory, type PriceDropAlert } from "@/lib/promotions/alerts";
import { SUPERMARKETS } from "@/lib/supermarkets";

import priceDropsJson from "../../data/price-drops.json";

// Price drops are computed once per refresh, from the committed snapshot
// history, and published as data/price-drops.json. The public page, the Atom
// feed and the Telegram digest all render that one payload, so no reader ever
// recomputes a movement with its own rules.

export const PRICE_DROPS_SCHEMA_VERSION = 1;

export type PriceDropRules = {
  /** Minimum drop against the reference price, in percent. */
  minPercentDrop: number;
  /** Minimum drop against the reference price, in ARS. */
  minAmountDrop: number;
  /** How far back the reference (last different) observation may be. */
  windowDays: number;
  /** An offer observed longer ago than this is stale and never produces a drop. */
  maxAgeHours: number;
  /** How many drops the payload publishes after sorting. */
  limit: number;
};

export const DEFAULT_PRICE_DROP_RULES: PriceDropRules = {
  minPercentDrop: 10,
  minAmountDrop: 100,
  windowDays: 14,
  maxAgeHours: 24,
  limit: 100,
};

// Structural input types: the committed snapshot satisfies them, and a test or
// a script can build one without importing the server-only snapshot module.
export type PriceDropSnapshotProduct = {
  ean: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  category: string | null;
  categorySlug: string | null;
};

export type PriceDropHistoryPoint = {
  price: number | null;
  listPrice: number | null;
  observedAt: string;
};

export type PriceDropSnapshotOffer = {
  ean: string;
  source: string;
  price: number | null;
  listPrice: number | null;
  promo: { type: string; percent: number | null } | null;
  available: boolean;
  productUrl: string | null;
  observedAt: string;
  history: PriceDropHistoryPoint[];
};

export type PriceDropSnapshot = {
  generatedAt: string;
  products: PriceDropSnapshotProduct[];
  offers: PriceDropSnapshotOffer[];
};

export type PriceDrop = {
  ean: string;
  date: string;
  source: string;
  name: string;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
  previousPrice: number;
  currentPrice: number;
  amountDrop: number;
  percentDrop: number;
  previousObservedAt: string;
  observedAt: string;
  productUrl: string | null;
};

export type PriceDropsPayload = {
  schemaVersion: number;
  generatedAt: string;
  date: string;
  rules: PriceDropRules;
  totalDrops: number;
  drops: PriceDrop[];
};

export class PriceDropsUnavailableError extends Error {}

const EPSILON = 1e-9;

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function utcDate(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

// An offer only produces a drop while its observation is current: a stale price
// is not today's price.
function isUsableOffer(offer: PriceDropSnapshotOffer, now: Date, rules: PriceDropRules): boolean {
  if (!offer.available || offer.price === null || !(offer.price > 0)) return false;
  const observed = Date.parse(offer.observedAt);
  if (Number.isNaN(observed)) return false;
  return (now.getTime() - observed) / 3_600_000 <= rules.maxAgeHours;
}

type ReferencePrice = { price: number; observedAt: string };

// The reference is the most recent observation strictly before the current one
// whose price differs from it, inside the configured window.
function lastDifferentPrice(
  offer: PriceDropSnapshotOffer,
  currentPrice: number,
  currentObserved: number,
  windowDays: number,
): ReferencePrice | null {
  const cutoff = currentObserved - windowDays * 86_400_000;
  let reference: ReferencePrice | null = null;
  for (const point of offer.history) {
    if (point.price === null || point.price === currentPrice) continue;
    const observed = Date.parse(point.observedAt);
    if (Number.isNaN(observed) || observed < cutoff || observed >= currentObserved) continue;
    if (reference === null || observed > Date.parse(reference.observedAt)) {
      reference = { price: point.price, observedAt: point.observedAt };
    }
  }
  return reference;
}

// A captured percentage promotion that by itself reproduces the current price
// is a promo artifact, not a price cut, so it never becomes a public drop.
function isPromoOnlyArtifact(offer: PriceDropSnapshotOffer, previousPrice: number, currentPrice: number): boolean {
  const promo = offer.promo;
  if (!promo || promo.type !== "percent-off") return false;
  const percent = promo.percent;
  if (percent === null || !(percent > 0) || percent > 100) return false;
  const promoPrice = roundCurrency(previousPrice * (1 - percent / 100));
  return Math.abs(promoPrice - currentPrice) <= Math.max(1, previousPrice * 0.01);
}

function toDrop(
  offer: PriceDropSnapshotOffer,
  product: PriceDropSnapshotProduct,
  reference: ReferencePrice,
  alert: PriceDropAlert,
  date: string,
): PriceDrop {
  return {
    ean: normalizeGtin(offer.ean) ?? offer.ean,
    date,
    source: offer.source,
    name: product.name,
    brand: product.brand,
    category: product.category,
    imageUrl: product.imageUrl,
    previousPrice: alert.previousPrice,
    currentPrice: alert.currentPrice,
    amountDrop: alert.amountDrop,
    percentDrop: alert.percentDrop,
    previousObservedAt: reference.observedAt,
    observedAt: offer.observedAt,
    productUrl: offer.productUrl,
  };
}

function compareDrops(left: PriceDrop, right: PriceDrop): number {
  return (
    right.percentDrop - left.percentDrop ||
    right.amountDrop - left.amountDrop ||
    left.ean.localeCompare(right.ean) ||
    left.source.localeCompare(right.source)
  );
}

function dropForOffer(
  offer: PriceDropSnapshotOffer,
  product: PriceDropSnapshotProduct,
  rules: PriceDropRules,
  now: Date,
  date: string,
): PriceDrop | null {
  const currentPrice = offer.price;
  if (currentPrice === null || !isUsableOffer(offer, now, rules)) return null;

  const currentObserved = Date.parse(offer.observedAt);
  const reference = lastDifferentPrice(offer, currentPrice, currentObserved, rules.windowDays);
  if (!reference || !(reference.price > 0)) return null;

  // The shared movement helper owns the rounding and the "is it a drop" rule.
  const alert = comparePriceAgainstHistory(currentPrice, reference.price).priceDropAlert;
  if (alert === null) return null;
  if (alert.percentDrop + EPSILON < rules.minPercentDrop) return null;
  if (alert.amountDrop + EPSILON < rules.minAmountDrop) return null;
  if (isPromoOnlyArtifact(offer, reference.price, currentPrice)) return null;

  return toDrop(offer, product, reference, alert, date);
}

/** Every drop the rules accept, in deterministic order (the limit is not applied here). */
export function detectPriceDrops(
  snapshot: PriceDropSnapshot,
  rules: PriceDropRules = DEFAULT_PRICE_DROP_RULES,
  now: Date = new Date(),
): PriceDrop[] {
  const products = new Map(snapshot.products.map((product) => [product.ean, product]));
  const date = utcDate(now);
  const drops: PriceDrop[] = [];

  for (const offer of snapshot.offers) {
    const product = products.get(offer.ean);
    if (!product) continue;
    const drop = dropForOffer(offer, product, rules, now, date);
    if (drop !== null) drops.push(drop);
  }

  return drops.sort(compareDrops);
}

export function buildPriceDropsPayload(
  snapshot: PriceDropSnapshot,
  rules: PriceDropRules = DEFAULT_PRICE_DROP_RULES,
  now: Date = new Date(),
): PriceDropsPayload {
  const detected = detectPriceDrops(snapshot, rules, now);
  return {
    schemaVersion: PRICE_DROPS_SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    date: utcDate(now),
    rules: { ...rules },
    totalDrops: detected.length,
    drops: detected.slice(0, rules.limit),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

const STRING_DROP_FIELDS = ["ean", "date", "source", "name", "previousObservedAt", "observedAt"] as const;
const NULLABLE_STRING_DROP_FIELDS = ["brand", "category", "imageUrl", "productUrl"] as const;
const NUMBER_DROP_FIELDS = ["previousPrice", "currentPrice", "amountDrop", "percentDrop"] as const;

function isDrop(value: unknown): value is PriceDrop {
  if (!isRecord(value)) return false;
  return (
    STRING_DROP_FIELDS.every((field) => typeof value[field] === "string") &&
    NULLABLE_STRING_DROP_FIELDS.every((field) => value[field] === null || typeof value[field] === "string") &&
    NUMBER_DROP_FIELDS.every((field) => isFiniteNumber(value[field]))
  );
}

const RULE_FIELDS = ["minPercentDrop", "minAmountDrop", "windowDays", "maxAgeHours", "limit"] as const;

function isRules(value: unknown): value is PriceDropRules {
  return isRecord(value) && RULE_FIELDS.every((field) => isFiniteNumber(value[field]));
}

function isPayload(value: unknown): value is PriceDropsPayload {
  if (!isRecord(value)) return false;
  return (
    value.schemaVersion === PRICE_DROPS_SCHEMA_VERSION &&
    typeof value.generatedAt === "string" &&
    typeof value.date === "string" &&
    isRules(value.rules) &&
    isFiniteNumber(value.totalDrops) &&
    Array.isArray(value.drops) &&
    value.drops.every(isDrop)
  );
}

export function parsePriceDrops(value: unknown): PriceDropsPayload {
  if (!isPayload(value)) {
    throw new PriceDropsUnavailableError("price drops payload is missing or malformed");
  }
  return value;
}

export function loadPriceDrops(): PriceDropsPayload {
  return parsePriceDrops(priceDropsJson);
}

const percentFormatter = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

export function formatDropPercent(percentDrop: number): string {
  return `${percentFormatter.format(percentDrop)}%`;
}

export function formatDropAmount(amountDrop: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(amountDrop);
}

/** Display name of the store that observed the price; the slug is the fallback. */
export function storeLabel(slug: string): string {
  return SUPERMARKETS.find((entry) => entry.slug === slug)?.name ?? slug;
}

export type PriceDropsView = {
  payload: PriceDropsPayload | null;
  /** The committed payload is missing or malformed: nothing may be shown as data. */
  unavailable: boolean;
  drops: PriceDrop[];
  isEmpty: boolean;
  summary: string;
  thresholdsNote: string;
};

function thresholdsNote(rules: PriceDropRules): string {
  return `Umbrales publicados: caída de al menos ${percentFormatter.format(rules.minPercentDrop)}% y ${formatDropAmount(rules.minAmountDrop)}, contra la última observación distinta dentro de ${rules.windowDays} días.`;
}

/** Everything the page renders, computed once from the committed payload. */
export function buildPriceDropsView(payload: PriceDropsPayload | null): PriceDropsView {
  if (payload === null) {
    return {
      payload: null,
      unavailable: true,
      drops: [],
      isEmpty: true,
      summary:
        "El archivo de bajas falta o está corrupto, así que no se muestra ningún movimiento. Las páginas de producto siguen disponibles.",
      thresholdsNote: "Los umbrales y la ventana se publican junto con cada archivo de bajas.",
    };
  }

  const published = payload.drops.length;
  const summary =
    published === 0
      ? `El refresh del catálogo del ${payload.date} no registró bajas por encima de los umbrales publicados.`
      : `El refresh del catálogo del ${payload.date} registró ${payload.totalDrops} ${payload.totalDrops === 1 ? "baja" : "bajas"}; se publican las ${published} mayores por variación porcentual.`;

  return {
    payload,
    unavailable: false,
    drops: payload.drops,
    isEmpty: published === 0,
    summary,
    thresholdsNote: thresholdsNote(payload.rules),
  };
}
