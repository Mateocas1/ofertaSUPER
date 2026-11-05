// Price-history series colors. Color follows the supermarket, never its rank,
// so Coto is the same hue on every product page whichever offers exist.
//
// Five categorical hues validated as a set (dataviz palette validator, adjacent
// pairs, in this order) against the card surface of each theme:
// light #fefdf8: worst adjacent CVD ΔE 16.3, normal-vision ΔE 19.6;
// dark  #131c18: worst adjacent CVD ΔE 13.2, normal-vision ΔE 19.3, all >= 3:1.
// Green, orange and red are left out on purpose: in this UI green means
// "cheapest / dropped", orange means "promo" and red means "went up".
// Three light steps sit below 3:1 on the card, so the chart always ships a
// legend with names, a tooltip and a data table (the relief rule).
export type SeriesColor = { light: string; dark: string };

export const SUPERMARKET_SERIES_COLORS: Readonly<Record<string, SeriesColor>> = {
  carrefour: { light: "#2a78d6", dark: "#3987e5" },
  coto: { light: "#1baf7a", dark: "#199e70" },
  disco: { light: "#6250d6", dark: "#9085e9" },
  jumbo: { light: "#eda100", dark: "#c98500" },
  vea: { light: "#e87ba4", dark: "#d55181" },
};

/** A source outside the validated set is drawn in neutral gray, never a generated hue. */
export const UNKNOWN_SERIES_COLOR: SeriesColor = { light: "#898781", dark: "#898781" };

export function seriesColorFor(slug: string): SeriesColor {
  return SUPERMARKET_SERIES_COLORS[slug] ?? UNKNOWN_SERIES_COLOR;
}
