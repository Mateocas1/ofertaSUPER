import { formatDiscountPercent, pluralize } from "@/lib/format";
import type { SimplePromotion } from "@/lib/promotions/simple-promos";

// Pure logic behind the product card's price comparison: which supermarkets
// hold the headline price, how the rest compare, and the sentence that names
// the cheapest one. Kept out of the component so it is tested directly.

export type CardOfferEntry = {
  supermarket: { name: string; slug: string };
  price: number | null;
  /** Missing means available: older loaders only send priced, listed offers. */
  isAvailable?: boolean;
};

export type CardOfferRow<T extends CardOfferEntry> = {
  entry: T;
  /** Price minus the headline, in pesos: always >= 0 unless `olderCheaper`. */
  difference: number;
  /**
   * The headline prefers recent prices, so an older reading can sit below it.
   * It is listed, but never as the cheapest.
   */
  olderCheaper: boolean;
};

export type CardVerdict =
  | { kind: "none" }
  | { kind: "only"; names: string[] }
  | { kind: "cheapest"; names: string[] }
  | { kind: "tie"; names: string[] }
  | { kind: "recent-cheapest"; names: string[] };

export type CardOfferSummary<T extends CardOfferEntry> = {
  /** Entries priced at the headline, by supermarket name. */
  cheapest: T[];
  /**
   * Cheapest entries the verdict sentence does not name (a tie among three or
   * more reads "Mismo precio en 3 supermercados"), so the list names them.
   */
  unnamedCheapest: T[];
  /** Every other priced entry, cheapest first, then by supermarket name. */
  others: CardOfferRow<T>[];
  /** Supermarkets with a registered price. */
  coverage: number;
  verdict: CardVerdict;
};

/** Ties up to this size are named in the sentence; larger ones are counted. */
const MAX_NAMED_TIE = 2;

const byName = (left: CardOfferEntry, right: CardOfferEntry) => left.supermarket.name.localeCompare(right.supermarket.name, "es");

function pricedEntries<T extends CardOfferEntry>(entries: readonly T[]): Array<T & { price: number }> {
  return entries.filter((entry): entry is T & { price: number } =>
    entry.isAvailable !== false && typeof entry.price === "number" && Number.isFinite(entry.price));
}

function verdictFor(cheapest: CardOfferEntry[], others: CardOfferRow<CardOfferEntry>[], coverage: number): CardVerdict {
  const names = cheapest.map((entry) => entry.supermarket.name);
  if (names.length === 0) return { kind: "none" };
  if (coverage === 1) return { kind: "only", names };
  if (others.some((row) => row.olderCheaper)) return { kind: "recent-cheapest", names };
  return names.length > 1 ? { kind: "tie", names } : { kind: "cheapest", names };
}

export function summarizeCardOffers<T extends CardOfferEntry>(
  entries: readonly T[],
  headline: number | null,
): CardOfferSummary<T> {
  const priced = pricedEntries(entries);
  const cheapest = headline === null ? [] : priced.filter((entry) => entry.price === headline).sort(byName);
  const others = priced
    .filter((entry) => entry.price !== headline)
    .sort((left, right) => left.price - right.price || byName(left, right))
    .map((entry) => {
      const difference = headline === null ? 0 : entry.price - headline;
      return { entry: entry as T, difference, olderCheaper: difference < 0 };
    });

  const verdict = verdictFor(cheapest, others, priced.length);
  return {
    cheapest: cheapest as T[],
    unnamedCheapest: verdict.kind === "tie" && verdict.names.length > MAX_NAMED_TIE ? (cheapest as T[]) : [],
    others,
    coverage: priced.length,
    verdict,
  };
}

const listFormatter = new Intl.ListFormat("es", { style: "long", type: "conjunction" });

/** The sentence under the headline price. Green in the UI, so it always carries words. */
export function cardVerdictLabel(verdict: CardVerdict): string | null {
  switch (verdict.kind) {
    case "none":
      return null;
    case "only":
      return `Solo en ${verdict.names[0]}`;
    case "cheapest":
      return `Más barato en ${verdict.names[0]}`;
    case "tie":
      return verdict.names.length <= MAX_NAMED_TIE
        ? `Mismo precio en ${listFormatter.format(verdict.names)}`
        : `Mismo precio en ${pluralize(verdict.names.length, "supermercado")}`;
    case "recent-cheapest":
      return `Menor precio reciente en ${listFormatter.format(verdict.names)}`;
  }
}

/** "en 3 supermercados", "en 1 supermercado". */
export function cardCoverageLabel(coverage: number): string | null {
  return coverage > 0 ? `en ${pluralize(coverage, "supermercado")}` : null;
}

/**
 * Supermarket promotions in Spanish. The snapshot keeps the source label,
 * which reads "25% OFF" for percentage promotions; "2do al 70%" is kept.
 */
export function promotionLabel(promo: Pick<SimplePromotion, "type" | "percent" | "label">): string {
  return promo.type === "percent-off" ? `Promo ${formatDiscountPercent(promo.percent)}` : promo.label;
}

const observedDayFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  timeZone: "America/Argentina/Buenos_Aires",
});

/** "4 nov": the day a price was observed, in Argentine time. */
export function formatObservedDay(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return observedDayFormatter.format(date).replace(/\.$/, "");
}
