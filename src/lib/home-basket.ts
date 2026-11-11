import { classifyPriceFreshness } from "@/lib/price-freshness";

// The fixed basket of the inflation index, priced per supermarket from the
// snapshot. Only offers that are available, priced and fresh under the same SLA
// the product pages use count towards a total; a stale price is counted apart
// and never summed. A supermarket that lacks a price for some product has an
// incomplete basket: it is listed after every complete one and never takes the
// "cheapest" mark, because a total over fewer products is not comparable.
// Pure and linear: one pass over items x offers (12 x ~5).

export const BASKET_FRESHNESS_SLA_HOURS = 24;

export type HomeBasketItemInput = {
	gtin14: string;
	label: string;
};

export type HomeBasketOfferInput = {
	source: string;
	price: number | null;
	available: boolean;
	observedAt: string;
};

export type HomeBasketStoreInput = {
	slug: string;
	name: string;
};

export type HomeBasketLine = {
	gtin14: string;
	label: string;
	/** Lowest fresh price, or null when no supermarket has a fresh price for it. */
	cheapestPrice: number | null;
	/** Display names of the supermarkets at that lowest price, in store order. */
	cheapestStores: string[];
};

export type HomeBasketStanding = "cheapest-complete" | "complete" | "incomplete";

export type HomeBasketStore = {
	slug: string;
	name: string;
	/** Sum of the fresh prices this supermarket has, rounded to cents. */
	total: number;
	/** Basket products with a fresh price at this supermarket. */
	covered: number;
	/** Basket products whose only price here is older than the SLA. */
	stale: number;
	missing: number;
	standing: HomeBasketStanding;
};

export type HomeBasket = {
	itemCount: number;
	lines: HomeBasketLine[];
	/** Complete baskets first (cheapest first), then incomplete ones by coverage. */
	stores: HomeBasketStore[];
	cheapestComplete: HomeBasketStore | null;
	freshPriceCount: number;
	stalePriceCount: number;
	/** Latest observation among the prices summed, for the date shown with the table. */
	latestObservedAt: string | null;
};

type StoreTally = { total: number; covered: number; stale: number };

function isPriced(offer: HomeBasketOfferInput): offer is HomeBasketOfferInput & { price: number } {
	return offer.available && typeof offer.price === "number" && Number.isFinite(offer.price) && offer.price > 0;
}

function isFresh(offer: HomeBasketOfferInput, now: Date): boolean {
	return classifyPriceFreshness(offer.observedAt, { now, maxAgeHours: BASKET_FRESHNESS_SLA_HOURS }).status === "fresh";
}

function roundCents(value: number): number {
	return Math.round(value * 100) / 100;
}

type Accumulator = {
	tallies: Map<string, StoreTally>;
	freshPriceCount: number;
	stalePriceCount: number;
	latestObservedAt: string | null;
};

function freshPricesByStore(
	offers: readonly HomeBasketOfferInput[],
	acc: Accumulator,
	now: Date,
): Map<string, number> {
	const prices = new Map<string, number>();
	for (const offer of offers) {
		const tally = acc.tallies.get(offer.source);
		if (!tally || !isPriced(offer) || prices.has(offer.source)) continue;
		if (!isFresh(offer, now)) {
			tally.stale += 1;
			acc.stalePriceCount += 1;
			continue;
		}
		prices.set(offer.source, offer.price);
		tally.total += offer.price;
		tally.covered += 1;
		acc.freshPriceCount += 1;
		if (acc.latestObservedAt === null || offer.observedAt > acc.latestObservedAt) acc.latestObservedAt = offer.observedAt;
	}
	return prices;
}

function toLine(item: HomeBasketItemInput, prices: Map<string, number>, stores: readonly HomeBasketStoreInput[]): HomeBasketLine {
	const values = [...prices.values()];
	const cheapestPrice = values.length > 0 ? Math.min(...values) : null;
	return {
		gtin14: item.gtin14,
		label: item.label,
		cheapestPrice,
		cheapestStores: stores.filter((store) => prices.get(store.slug) === cheapestPrice).map((store) => store.name),
	};
}

function compareStores(left: HomeBasketStore, right: HomeBasketStore): number {
	const leftComplete = left.missing === 0 ? 0 : 1;
	const rightComplete = right.missing === 0 ? 0 : 1;
	return (
		leftComplete - rightComplete ||
		right.covered - left.covered ||
		left.total - right.total ||
		left.name.localeCompare(right.name, "es")
	);
}

function rankStores(stores: readonly HomeBasketStoreInput[], tallies: Map<string, StoreTally>, itemCount: number): HomeBasketStore[] {
	const ranked = stores
		.map((store): HomeBasketStore => {
			const tally = tallies.get(store.slug) ?? { total: 0, covered: 0, stale: 0 };
			const missing = itemCount - tally.covered;
			return { ...store, total: roundCents(tally.total), covered: tally.covered, stale: tally.stale, missing, standing: missing === 0 && itemCount > 0 ? "complete" : "incomplete" };
		})
		.sort(compareStores);
	if (ranked[0]?.standing === "complete") ranked[0] = { ...ranked[0], standing: "cheapest-complete" };
	return ranked;
}

/** Prices the fixed basket per supermarket. `offersFor` returns the snapshot offers of one GTIN. */
export function priceHomeBasket(
	items: readonly HomeBasketItemInput[],
	offersFor: (gtin14: string) => readonly HomeBasketOfferInput[],
	stores: readonly HomeBasketStoreInput[],
	now: Date,
): HomeBasket {
	const acc: Accumulator = {
		tallies: new Map(stores.map((store) => [store.slug, { total: 0, covered: 0, stale: 0 }])),
		freshPriceCount: 0,
		stalePriceCount: 0,
		latestObservedAt: null,
	};
	const lines = items.map((item) => toLine(item, freshPricesByStore(offersFor(item.gtin14), acc, now), stores));
	const ranked = rankStores(stores, acc.tallies, items.length);

	return {
		itemCount: items.length,
		lines,
		stores: ranked,
		cheapestComplete: ranked.find((store) => store.standing === "cheapest-complete") ?? null,
		freshPriceCount: acc.freshPriceCount,
		stalePriceCount: acc.stalePriceCount,
		latestObservedAt: acc.latestObservedAt,
	};
}
