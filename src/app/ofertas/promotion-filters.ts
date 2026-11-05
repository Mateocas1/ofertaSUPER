import type { PromotionSummary } from "@/lib/catalog";

export type PromotionFilters = {
  supermarket?: string;
  wallet?: string;
  type?: string;
};

function normalize(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
}

/**
 * Supermarket promotions narrowed by the /ofertas filters: supermarket slug,
 * wallet or bank name (accent- and case-insensitive substring) and type.
 */
export function filterPromotions(promotions: readonly PromotionSummary[], filters: PromotionFilters): PromotionSummary[] {
  const wallet = filters.wallet ? normalize(filters.wallet) : "";
  return promotions.filter((promotion) =>
    (!filters.supermarket || promotion.supermarket.slug === filters.supermarket)
    && (!filters.type || promotion.type === filters.type)
    && (!wallet || [promotion.walletProvider, promotion.bankName].some((name) => name !== null && normalize(name).includes(wallet))));
}

/** Wallet and bank names present in the promotions, for the filter's options. */
export function promotionPaymentNames(promotions: readonly PromotionSummary[]): string[] {
  const names = new Set<string>();
  for (const promotion of promotions) {
    for (const name of [promotion.walletProvider, promotion.bankName]) if (name) names.add(name);
  }
  return [...names].sort((left, right) => left.localeCompare(right, "es"));
}
