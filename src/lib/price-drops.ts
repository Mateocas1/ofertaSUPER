import { normalizeGtin } from "@/lib/identity/gtin";
import { comparePriceAgainstHistory, type PriceDropAlert } from "@/lib/promotions/alerts";
import { SUPERMARKETS } from "@/lib/supermarkets";

import priceDropsJson from "../../data/price-drops.json";

// Price drops are computed once per refresh, from the committed snapshot
// history, and published as data/price-drops.json. The public page, the Atom
// feed and the Telegram digest all render that one payload, so no reader ever
// recomputes a movement with its own rules.

export const PRICE_DROPS_SCHEMA_VERSION = 2;

export type PriceDropRules = {
  /** Minimum drop against the reference price, in percent. */
  minPercentDrop: number;
  /** Minimum drop against the reference price, in ARS. */
  minAmountDrop: number;
  /** How far back the reference (last different) observation may be. */
  windowDays: number;
  /** An offer observed longer ago than this is stale and never produces a drop. */
  maxAgeHours: number;
  /** A drop above this percentage is suspicious on its own and is never published. */
  maxPercentDrop: number;
  /** How many drops the payload publishes after sorting. */
  limit: number;
};

export const DEFAULT_PRICE_DROP_RULES: PriceDropRules = {
  minPercentDrop: 10,
  minAmountDrop: 100,
  windowDays: 14,
  maxAgeHours: 24,
  maxPercentDrop: 60,
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
  /** Price per the offer's reference unit, when the source publishes one. */
  unitPrice?: number | null;
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
  /** Price per the offer's reference unit, when the source publishes one. */
  unitPrice?: number | null;
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

/** Why a movement was withheld instead of published. */
export type SuspectReason = "drop_above_max_percent" | "unit_price_did_not_fall";

/** Recorded for the audit trail, never rendered, parsed or posted publicly. */
export type SuspectPriceDrop = PriceDrop & { reason: SuspectReason };

export type PriceDropsPayload = {
  schemaVersion: number;
  generatedAt: string;
  date: string;
  rules: PriceDropRules;
  /** Published drops detected before the limit. */
  totalDrops: number;
  drops: PriceDrop[];
  /** Suspect drops detected before the limit (0 keeps older payloads parseable). */
  suspectDrops: number;
  suspect: SuspectPriceDrop[];
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

type ReferencePrice = { price: number; observedAt: string; unitPrice: number | null };

function unitPriceOf(point: { unitPrice?: number | null }): number | null {
  const value = point.unitPrice;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

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
      reference = { price: point.price, observedAt: point.observedAt, unitPrice: unitPriceOf(point) };
    }
  }
  return reference;
}

// When both points carry a unit price, it decides: a smaller pack at a lower
// absolute price is not a price cut, and a fall per unit proves a large drop.
// "unknown" means the snapshot exposes no unit price for one of the points.
function unitPriceVerdict(
  offer: PriceDropSnapshotOffer,
  reference: ReferencePrice,
): "unknown" | "fell" | "did_not_fall" {
  const current = unitPriceOf(offer);
  if (current === null || reference.unitPrice === null) return "unknown";
  return current < reference.unitPrice ? "fell" : "did_not_fall";
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

type Candidate = { kind: "published"; drop: PriceDrop } | { kind: "suspect"; drop: SuspectPriceDrop };

function meetsThresholds(alert: { percentDrop: number; amountDrop: number }, rules: PriceDropRules): boolean {
  return (
    alert.percentDrop + EPSILON >= rules.minPercentDrop &&
    alert.amountDrop + EPSILON >= rules.minAmountDrop
  );
}

function classify(offer: PriceDropSnapshotOffer, reference: ReferencePrice, drop: PriceDrop, rules: PriceDropRules): Candidate {
  const verdict = unitPriceVerdict(offer, reference);
  if (verdict === "did_not_fall") {
    return { kind: "suspect", drop: { ...drop, reason: "unit_price_did_not_fall" } };
  }
  const untrusted = verdict === "unknown" && drop.percentDrop > rules.maxPercentDrop;
  return untrusted
    ? { kind: "suspect", drop: { ...drop, reason: "drop_above_max_percent" } }
    : { kind: "published", drop };
}

function candidateForOffer(
  offer: PriceDropSnapshotOffer,
  product: PriceDropSnapshotProduct,
  rules: PriceDropRules,
  now: Date,
  date: string,
): Candidate | null {
  const currentPrice = offer.price;
  if (currentPrice === null || !isUsableOffer(offer, now, rules)) return null;

  const currentObserved = Date.parse(offer.observedAt);
  const reference = lastDifferentPrice(offer, currentPrice, currentObserved, rules.windowDays);
  if (!reference || !(reference.price > 0)) return null;

  // The shared movement helper owns the rounding and the "is it a drop" rule.
  const alert = comparePriceAgainstHistory(currentPrice, reference.price).priceDropAlert;
  if (alert === null || !meetsThresholds(alert, rules)) return null;
  if (isPromoOnlyArtifact(offer, reference.price, currentPrice)) return null;

  return classify(offer, reference, toDrop(offer, product, reference, alert, date), rules);
}

export type PriceDropDetection = {
  /** Public drops, in deterministic order (the limit is not applied here). */
  published: PriceDrop[];
  /** Suspected movements: recorded for the audit trail, never published. */
  suspect: SuspectPriceDrop[];
};

export function detectPriceDrops(
  snapshot: PriceDropSnapshot,
  rules: PriceDropRules = DEFAULT_PRICE_DROP_RULES,
  now: Date = new Date(),
): PriceDropDetection {
  const products = new Map(snapshot.products.map((product) => [product.ean, product]));
  const date = utcDate(now);
  const published: PriceDrop[] = [];
  const suspect: SuspectPriceDrop[] = [];

  for (const offer of snapshot.offers) {
    const product = products.get(offer.ean);
    if (!product) continue;
    const candidate = candidateForOffer(offer, product, rules, now, date);
    if (candidate === null) continue;
    if (candidate.kind === "published") {
      published.push(candidate.drop);
    } else {
      suspect.push(candidate.drop);
    }
  }

  return { published: published.sort(compareDrops), suspect: suspect.sort(compareDrops) };
}

export function buildPriceDropsPayload(
  snapshot: PriceDropSnapshot,
  rules: PriceDropRules = DEFAULT_PRICE_DROP_RULES,
  now: Date = new Date(),
): PriceDropsPayload {
  const detection = detectPriceDrops(snapshot, rules, now);
  return {
    schemaVersion: PRICE_DROPS_SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    date: utcDate(now),
    rules: { ...rules },
    totalDrops: detection.published.length,
    drops: detection.published.slice(0, rules.limit),
    suspectDrops: detection.suspect.length,
    suspect: detection.suspect.slice(0, rules.limit),
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

const RULE_FIELDS = ["minPercentDrop", "minAmountDrop", "windowDays", "maxAgeHours", "maxPercentDrop", "limit"] as const;

function isRules(value: unknown): value is PriceDropRules {
  return isRecord(value) && RULE_FIELDS.every((field) => isFiniteNumber(value[field]));
}

export const SUSPECT_REASONS: readonly SuspectReason[] = ["drop_above_max_percent", "unit_price_did_not_fall"];

function isSuspectDrop(value: unknown): value is SuspectPriceDrop {
  if (!isRecord(value)) return false;
  const reason = value.reason;
  return isDrop(value) && typeof reason === "string" && (SUSPECT_REASONS as readonly string[]).includes(reason);
}

function isDropList(value: unknown): value is PriceDrop[] {
  return Array.isArray(value) && value.every(isDrop);
}

function isSuspectList(value: unknown): value is SuspectPriceDrop[] {
  return Array.isArray(value) && value.every(isSuspectDrop);
}

const PAYLOAD_STRUCTURE_CHECKS: ((value: Record<string, unknown>) => boolean)[] = [
  (value) => value.schemaVersion === PRICE_DROPS_SCHEMA_VERSION,
  (value) => typeof value.generatedAt === "string",
  (value) => typeof value.date === "string",
  (value) => isRules(value.rules),
  (value) => isFiniteNumber(value.totalDrops),
  (value) => isFiniteNumber(value.suspectDrops),
  (value) => isDropList(value.drops),
  (value) => isSuspectList(value.suspect),
];

function isPayload(value: unknown): value is PriceDropsPayload {
  return isRecord(value) && PAYLOAD_STRUCTURE_CHECKS.every((check) => check(value));
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
  return (
    `Umbrales publicados: caída de al menos ${percentFormatter.format(rules.minPercentDrop)}% y ` +
    `${formatDropAmount(rules.minAmountDrop)}, contra la última observación distinta dentro de ${rules.windowDays} días. ` +
    "Los movimientos sospechosos (por ejemplo, caídas que un cambio de presentación o un error de carga explican mejor) no se publican."
  );
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
