import "server-only";

import { BasketIndexUnavailableError, loadBasketIndex } from "@/lib/analytics/basket-index";
import { isCatalogOfflineMode } from "@/lib/catalog-availability";
import {
	getSnapshotGeneratedAt,
	getSnapshotOffers,
	getSnapshotSources,
	rankSnapshotProducts,
	SnapshotUnavailableError,
} from "@/lib/catalog-snapshot";
import { priceHomeBasket, type HomeBasket } from "@/lib/home-basket";
import { selectHomeDrops } from "@/lib/home-drops";
import { normalizeGtin } from "@/lib/identity/gtin";
import { buildPriceDropsView, loadPriceDrops, type PriceDrop } from "@/lib/price-drops";
import { SUPERMARKETS } from "@/lib/supermarkets";

// Everything the home renders that comes from data, read once per ISR render.
// The snapshot-backed parts (provenance line, basket) fail closed together:
// offline mode, a missing or corrupt snapshot or basket payload yields
// "unavailable", never a fallback. The drops read their own committed payload.

export type HomeProvenance = {
	generatedAt: string;
	/** Display names of the supermarkets in the snapshot, alphabetical. */
	supermarkets: string[];
	productCount: number;
};

export type HomeSnapshotData =
	| { status: "ready"; provenance: HomeProvenance; basket: HomeBasket }
	| { status: "unavailable" };

export type HomeDropsData =
	| { status: "ready"; drops: PriceDrop[]; publishedCount: number; date: string }
	| { status: "empty"; date: string }
	| { status: "unavailable" };

function storeName(slug: string): string {
	return SUPERMARKETS.find((entry) => entry.slug === slug)?.name ?? slug;
}

function snapshotStores() {
	return getSnapshotSources()
		.map((slug) => ({ slug, name: storeName(slug) }))
		.sort((left, right) => left.name.localeCompare(right.name, "es"));
}

function loadReadySnapshot(now: Date): HomeSnapshotData {
	const stores = snapshotStores();
	const items = loadBasketIndex().basketWeights;
	const basket = priceHomeBasket(items, (gtin14) => getSnapshotOffers(normalizeGtin(gtin14) ?? gtin14), stores, now);
	return {
		status: "ready",
		provenance: {
			generatedAt: getSnapshotGeneratedAt(),
			supermarkets: stores.map((store) => store.name),
			// The unfiltered order is computed once per process and shared with the sitemap.
			productCount: rankSnapshotProducts({}).length,
		},
		basket,
	};
}

export function loadHomeSnapshotData(now: Date = new Date()): HomeSnapshotData {
	if (isCatalogOfflineMode()) return { status: "unavailable" };
	try {
		return loadReadySnapshot(now);
	} catch (error) {
		if (error instanceof SnapshotUnavailableError || error instanceof BasketIndexUnavailableError) {
			return { status: "unavailable" };
		}
		throw error;
	}
}

export function loadHomeDrops(limit?: number): HomeDropsData {
	let view;
	try {
		view = buildPriceDropsView(loadPriceDrops());
	} catch {
		view = buildPriceDropsView(null);
	}
	if (view.unavailable || view.payload === null) return { status: "unavailable" };
	if (view.isEmpty) return { status: "empty", date: view.payload.date };
	return {
		status: "ready",
		drops: selectHomeDrops(view.drops, limit),
		publishedCount: view.drops.length,
		date: view.payload.date,
	};
}
