import type { BasketProduct } from "@/lib/basket-products-contract";

// Gate 5: pure basket rules shared by the cart UI. Every requested product
// counts in every listed supermarket's denominator; an unresolvable product
// is missing, never discarded, and no supermarket is ever labeled complete
// while something is missing.

export type BasketItemInput = { ean: string; qty: number };

export type BasketEntryLike = BasketProduct["priceEntries"][number];

export type BasketSuperSummary = {
  slug: string;
  name: string;
  logoUrl: string | null;
  total: number;
  coveredItems: number;
  missingItems: number;
  complete: boolean;
};

export type BasketPlanItemOption = { slug: string; name: string; price: number };

export type BasketPlanItem = {
  ean: string;
  qty: number;
  resolved: boolean;
  chosenSlug: string | null;
  chosenName: string | null;
  chosenPrice: number | null;
  lineTotal: number | null;
  options: BasketPlanItemOption[];
};

export type BasketPlan = {
  summaries: BasketSuperSummary[];
  items: BasketPlanItem[];
  mixedTotal: number;
  mixedMissing: number;
  bestSingle: BasketSuperSummary | null;
  savings: number | null;
};

export function isEligibleBasketEntry(entry: BasketEntryLike | undefined, acceptStale: boolean): entry is BasketEntryLike & { price: number } {
  if (!entry || !entry.isAvailable || entry.price === null) return false;
  return entry.freshnessStatus === "fresh" || (acceptStale && entry.freshnessStatus === "stale");
}

function entriesBySlug(product: BasketProduct) {
  return new Map(product.priceEntries.map((entry) => [entry.supermarket.slug, entry]));
}

export function buildBasketSummaries(
  items: BasketItemInput[],
  productsByEan: Record<string, BasketProduct>,
  acceptStale: boolean,
): BasketSuperSummary[] {
  const summaryMap = new Map<string, BasketSuperSummary>();

  function summaryFor(slug: string, name: string, logoUrl: string | null): BasketSuperSummary {
    const existing = summaryMap.get(slug);
    if (existing) return existing;
    const created = { slug, name, logoUrl, total: 0, coveredItems: 0, missingItems: 0, complete: false };
    summaryMap.set(slug, created);
    return created;
  }

  for (const item of items) {
    const product = productsByEan[item.ean];
    if (!product) continue;
    for (const entry of product.priceEntries) {
      summaryFor(entry.supermarket.slug, entry.supermarket.name, entry.supermarket.logoUrl);
    }
  }

  const summaries = Array.from(summaryMap.values());
  for (const summary of summaries) {
    countItemsForSummary(summary, items, productsByEan, acceptStale);
  }

  return summaries
    .filter((summary) => summary.coveredItems > 0)
    .toSorted((left, right) => left.missingItems - right.missingItems || left.total - right.total);
}

function countItemsForSummary(
  summary: BasketSuperSummary,
  items: BasketItemInput[],
  productsByEan: Record<string, BasketProduct>,
  acceptStale: boolean,
) {
  for (const item of items) {
    const product = productsByEan[item.ean];
    const entry = product ? entriesBySlug(product).get(summary.slug) : undefined;
    if (product && isEligibleBasketEntry(entry, acceptStale)) {
      summary.coveredItems += 1;
      summary.total += entry.price * item.qty;
    } else {
      summary.missingItems += 1;
    }
  }
  summary.complete = summary.missingItems === 0;
}

function eligibleOptions(product: BasketProduct | undefined, acceptStale: boolean): BasketPlanItemOption[] {
  return (product?.priceEntries ?? [])
    .filter((entry) => isEligibleBasketEntry(entry, acceptStale))
    .map((entry) => ({ slug: entry.supermarket.slug, name: entry.supermarket.name, price: entry.price }))
    .toSorted((left, right) => left.price - right.price || left.slug.localeCompare(right.slug));
}

function chooseOption(options: BasketPlanItemOption[], manualSlug: string | undefined): BasketPlanItemOption | null {
  return options.find((option) => option.slug === manualSlug) ?? options[0] ?? null;
}

function planItemFor(item: BasketItemInput, productsByEan: Record<string, BasketProduct>, selections: Record<string, string>, acceptStale: boolean): BasketPlanItem {
  const options = eligibleOptions(productsByEan[item.ean], acceptStale);
  const chosen = chooseOption(options, selections[item.ean]);
  return {
    ean: item.ean,
    qty: item.qty,
    resolved: chosen !== null,
    chosenSlug: chosen?.slug ?? null,
    chosenName: chosen?.name ?? null,
    chosenPrice: chosen?.price ?? null,
    lineTotal: chosen ? chosen.price * item.qty : null,
    options,
  };
}

export function computeBasketPlan(
  items: BasketItemInput[],
  productsByEan: Record<string, BasketProduct>,
  selections: Record<string, string>,
  acceptStale: boolean,
): BasketPlan {
  const summaries = buildBasketSummaries(items, productsByEan, acceptStale);
  const planItems = items.map((item) => planItemFor(item, productsByEan, selections, acceptStale));

  const resolvedItems = planItems.filter((item) => item.resolved);
  const mixedTotal = resolvedItems.reduce((total, item) => total + (item.lineTotal ?? 0), 0);
  const mixedMissing = planItems.length - resolvedItems.length;
  const bestSingle = summaries.filter((summary) => summary.complete).toSorted((left, right) => left.total - right.total)[0] ?? null;
  const savings = mixedMissing === 0 && bestSingle !== null ? Math.max(0, bestSingle.total - mixedTotal) : null;

  return { summaries, items: planItems, mixedTotal, mixedMissing, bestSingle, savings };
}
