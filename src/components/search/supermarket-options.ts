import { SUPERMARKETS } from "../../lib/supermarkets";

export type SupermarketOption = { value: string; label: string };

/**
 * Filter options for the supermarket select. Only chains present in the
 * published snapshot are offered: a chain with adapters but no data (DIA, MAS)
 * would only lead to an empty result page. With unknown sources (no snapshot)
 * every known chain stays, so the filter never disappears.
 */
export function supermarketOptions(sources: readonly string[] | null): SupermarketOption[] {
  const published = sources ? new Set(sources) : null;
  return [
    { value: "", label: "Todos" },
    ...SUPERMARKETS.filter((supermarket) => !published || published.has(supermarket.slug)).map((supermarket) => ({
      value: supermarket.slug,
      label: supermarket.name,
    })),
  ];
}
