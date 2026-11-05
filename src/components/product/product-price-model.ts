import { formatCurrency, formatDiscountPercent, formatSignedPercent, pluralize } from "@/lib/format";
import type { PriceFreshnessStatus } from "@/lib/price-freshness";
import type { SimplePromotion } from "@/lib/promotions/simple-promos";

// Pure view logic of the product page, kept out of the components so it can be
// tested without rendering: ordering, the cheapest offer, movement and copy.

// Observations are instants; they are shown on the Buenos Aires calendar and
// clock whatever time zone renders the page (the server runs on UTC).
const AR_TIME_ZONE = "America/Argentina/Buenos_Aires";
const shortDayFormatter = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: AR_TIME_ZONE });
const clockFormatter = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: AR_TIME_ZONE });

function validDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "30 oct". */
export function formatShortDay(value: string): string {
  const date = validDate(value);
  return date ? shortDayFormatter.format(date) : "fecha desconocida";
}

/** "4 nov a las 15:15". */
export function formatObservedAt(value: string): string {
  const date = validDate(value);
  return date ? `${shortDayFormatter.format(date)} a las ${clockFormatter.format(date)}` : "fecha desconocida";
}

export type ComparableEntry = {
  supermarket: { name: string; slug: string };
  price: number | null;
  isAvailable: boolean;
};

export type MovementEntry = {
  price: number | null;
  previousPrice: number | null;
  deltaPercent: number | null;
  previousObservedAt: string | null;
};

export function hasComparablePrice(entry: ComparableEntry): entry is ComparableEntry & { price: number } {
  return entry.isAvailable && entry.price !== null;
}

/** Cheapest first; offers without a usable price go last; ties by supermarket name. */
export function sortByPrice<T extends ComparableEntry>(entries: readonly T[]): T[] {
  const rank = (entry: T) => (hasComparablePrice(entry) ? entry.price : Number.POSITIVE_INFINITY);
  return [...entries].sort((left, right) =>
    rank(left) - rank(right) || left.supermarket.name.localeCompare(right.supermarket.name, "es"));
}

/**
 * Offers at the headline price. The headline is the cheapest fresh price (or the
 * cheapest overall when none is fresh), so "Más barato en" always names the
 * supermarkets whose price is the one printed above it, ties included.
 */
export function cheapestEntries<T extends ComparableEntry>(entries: readonly T[], headlinePrice: number | null): T[] {
  if (headlinePrice === null) return [];
  return sortByPrice(entries).filter((entry) => hasComparablePrice(entry) && entry.price === headlinePrice);
}

/** "Disco", "Disco y Jumbo", "Coto, Disco y Jumbo". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

export type CheapestCopy = { text: string; isCheapest: boolean };

/**
 * Words for the supermarkets at the headline price. "Más barato" is only said
 * when there is something cheaper than: one offer, or every offer tied, is
 * stated plainly instead.
 */
export function cheapestCopy(cheapest: readonly ComparableEntry[], comparableCount: number): CheapestCopy | null {
  if (cheapest.length === 0) return null;
  const names = joinNames(cheapest.map((entry) => entry.supermarket.name));
  if (comparableCount <= 1) return { text: `Precio relevado solo en ${names}`, isCheapest: false };
  if (cheapest.length === comparableCount) {
    return { text: `Mismo precio en los ${pluralize(comparableCount, "supermercado")}`, isCheapest: false };
  }
  return { text: `Más barato en ${names}`, isCheapest: true };
}

export type Movement = "up" | "down" | "flat";

export function movementOf(deltaPercent: number | null): Movement | null {
  if (deltaPercent === null) return null;
  if (deltaPercent > 0) return "up";
  if (deltaPercent < 0) return "down";
  return "flat";
}

/** "desde $37.399 (30 oct)" for a movement measured against the last different price. */
export function previousPriceCopy(entry: MovementEntry): string | null {
  if (entry.previousPrice === null) return null;
  const date = entry.previousObservedAt ? ` (${formatShortDay(entry.previousObservedAt)})` : "";
  return `${formatCurrency(entry.previousPrice)}${date}`;
}

/** "Bajó −59,9% desde $37.399 (30 oct)", only for a real drop. */
export function dropHeadline(entry: MovementEntry): string | null {
  if (movementOf(entry.deltaPercent) !== "down") return null;
  const previous = previousPriceCopy(entry);
  return previous ? `Bajó ${formatSignedPercent(entry.deltaPercent)} desde ${previous}` : null;
}

/** The biggest drop among the offers at the headline price, if any dropped. */
export function headlineDropEntry<T extends MovementEntry>(cheapest: readonly T[]): T | null {
  return cheapest
    .filter((entry) => movementOf(entry.deltaPercent) === "down")
    .reduce<T | null>((best, entry) => (best === null || entry.deltaPercent! < best.deltaPercent! ? entry : best), null);
}

/** Sentence-case promo label: "2do al 50%", "−15% en promo". No "OFF". */
export function promoLabel(promo: SimplePromotion): string {
  if (promo.type === "percent-off") return `${formatDiscountPercent(promo.percent)} en promo`;
  return promo.label;
}

export function promoBadgeType(promo: SimplePromotion): "2nd_50" | "percentage" {
  return promo.type === "nth-unit" ? "2nd_50" : "percentage";
}

/** A promo price is shown only when the data computes one below the price. */
export function promoPriceOf(entry: { price: number | null; finalPrice: number | null }): number | null {
  if (entry.price === null || entry.finalPrice === null) return null;
  return entry.finalPrice < entry.price ? entry.finalPrice : null;
}

export type ObservationCopy = { text: string; stale: boolean };

/** "Relevado el 4 nov a las 15:15"; a stale observation says so in words. */
export function observationCopy(
  checkedAt: string | null,
  status: PriceFreshnessStatus,
  formatWhen: (value: string) => string = formatObservedAt,
): ObservationCopy {
  if (!checkedAt) return { text: "Sin fecha de relevamiento", stale: true };
  const when = formatWhen(checkedAt);
  if (status === "stale") return { text: `Último precio registrado, relevado el ${when}. Puede haber cambiado.`, stale: true };
  return { text: `Relevado el ${when}`, stale: false };
}

/**
 * Brands arrive in whatever case the supermarket used ("LA SERENISIMA").
 * All-caps names longer than an acronym read as shouting next to the H1, so
 * they are shown capitalized; any name with lowercase letters is kept as is.
 */
export function displayBrand(brand: string): string {
  const letters = brand.replace(/[^\p{L}]/gu, "");
  if (letters.length <= 3 || letters !== letters.toLocaleUpperCase("es")) return brand;
  return brand
    .toLocaleLowerCase("es")
    .replace(/(^|[\s\-/])(\p{L})/gu, (_match, separator: string, letter: string) => `${separator}${letter.toLocaleUpperCase("es")}`);
}
