import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { priceHomeBasket, type HomeBasketOfferInput } from "../src/lib/home-basket";

const NOW = new Date("2026-11-05T12:00:00.000Z");
const FRESH = "2026-11-05T02:00:00.000Z";
const STALE = "2026-11-03T02:00:00.000Z";

const STORES = [
	{ slug: "coto", name: "Coto" },
	{ slug: "disco", name: "Disco" },
	{ slug: "vea", name: "Vea" },
];

const ITEMS = [
	{ gtin14: "001", label: "Leche 1 L" },
	{ gtin14: "002", label: "Yerba 500 g" },
	{ gtin14: "003", label: "Arroz 1 kg" },
];

function offer(source: string, price: number | null, observedAt = FRESH, available = true): HomeBasketOfferInput {
	return { source, price, observedAt, available };
}

function price(offersByGtin: Record<string, HomeBasketOfferInput[]>) {
	let reads = 0;
	const basket = priceHomeBasket(ITEMS, (gtin) => {
		reads += 1;
		return offersByGtin[gtin] ?? [];
	}, STORES, NOW);
	return { basket, reads };
}

describe("priceHomeBasket", () => {
	it("ranks complete baskets first and marks only the cheapest complete one", () => {
		const { basket, reads } = price({
			"001": [offer("coto", 1000), offer("disco", 900), offer("vea", 800)],
			"002": [offer("coto", 2000), offer("disco", 2100), offer("vea", 500)],
			"003": [offer("coto", 1500), offer("disco", 1450)],
		});

		assert.equal(reads, ITEMS.length);
		assert.deepEqual(basket.stores.map((store) => [store.slug, store.standing, store.total, store.covered]), [
			["disco", "cheapest-complete", 4450, 3],
			["coto", "complete", 4500, 3],
			// Vea is cheaper on what it has but lacks a product: never ranked as the cheapest.
			["vea", "incomplete", 1300, 2],
		]);
		assert.equal(basket.cheapestComplete?.slug, "disco");
		assert.equal(basket.stores[2].missing, 1);
	});

	it("never names a cheapest basket when no supermarket is complete", () => {
		const { basket } = price({
			"001": [offer("coto", 1000), offer("vea", 800)],
			"002": [offer("coto", 2000)],
		});

		assert.equal(basket.cheapestComplete, null);
		assert.ok(basket.stores.every((store) => store.standing === "incomplete"));
		assert.deepEqual(basket.stores.map((store) => store.slug), ["coto", "vea", "disco"]);
		assert.equal(basket.stores[2].covered, 0);
	});

	it("does not sum stale, unavailable or unpriced offers", () => {
		const { basket } = price({
			"001": [offer("coto", 1000), offer("disco", 700, STALE), offer("vea", 600, FRESH, false)],
			"002": [offer("coto", 2000), offer("disco", null)],
			"003": [offer("coto", 1500), offer("disco", 1, "not a date")],
		});

		const disco = basket.stores.find((store) => store.slug === "disco");
		assert.equal(disco?.covered, 0);
		assert.equal(disco?.stale, 2);
		assert.equal(basket.stalePriceCount, 2);
		assert.equal(basket.freshPriceCount, 3);
		assert.equal(basket.cheapestComplete?.slug, "coto");
		assert.equal(basket.lines[0].cheapestPrice, 1000);
	});

	it("lists the lowest fresh price per product with every supermarket tied at it", () => {
		const { basket } = price({
			"001": [offer("vea", 800), offer("coto", 800), offer("disco", 900)],
			"003": [offer("disco", 1450.5)],
		});

		assert.deepEqual(basket.lines.map((line) => [line.label, line.cheapestPrice, line.cheapestStores]), [
			["Leche 1 L", 800, ["Coto", "Vea"]],
			["Yerba 500 g", null, []],
			["Arroz 1 kg", 1450.5, ["Disco"]],
		]);
		assert.equal(basket.latestObservedAt, FRESH);
	});

	it("reports an empty basket when every price is stale", () => {
		const { basket } = price({ "001": [offer("coto", 1000, STALE)] });

		assert.equal(basket.freshPriceCount, 0);
		assert.equal(basket.latestObservedAt, null);
		assert.equal(basket.cheapestComplete, null);
	});

	it("rounds totals to cents", () => {
		const { basket } = price({
			"001": [offer("coto", 0.1)],
			"002": [offer("coto", 0.2)],
			"003": [offer("coto", 3314.99)],
		});
		assert.equal(basket.stores[0].total, 3315.29);
	});
});
