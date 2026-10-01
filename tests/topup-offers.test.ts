import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { topUpObservationFor, readTopUpOffer } from "../src/lib/vtex/topup";
import type { VtexPromoHttpClient } from "../src/lib/promotions/capture";

function httpWith(body: unknown): VtexPromoHttpClient {
	return { get: async () => ({ data: JSON.stringify(body), status: 200, headers: { "content-type": "application/json" } }) };
}

// Gate 6 top-up: offers the daily searches missed are re-read by EAN through
// the public REST search of their supermarket. A product that is found yields
// a fresh offer with its observed price; one that is absent or out of stock
// is recorded as unavailable with no price (never invented); the caller
// handles read failures by leaving the offer untouched and counting them.

const carrefourPayload = [
	{
		productId: "719376",
		productName: "Leche chocolatada Cindor 200 ml",
		linkText: "leche-chocotalada-cindor-200-ml-719376",
		items: [
			{
				ean: "7791337007260",
				sellers: [
					{
						sellerId: "1",
						commertialOffer: {
							Price: 2870,
							ListPrice: 3590,
							AvailableQuantity: 10,
							PromotionTeasers: [],
						},
					},
				],
			},
		],
	},
];

const carrefourOutOfStock = [
	{
		productId: "719376",
		productName: "Leche chocolatada Cindor 200 ml",
		items: [
			{
				ean: "7791337007260",
				sellers: [
					{
						sellerId: "1",
						commertialOffer: { Price: 0, ListPrice: 0, AvailableQuantity: 0 },
					},
				],
			},
		],
	},
];

describe("offer top-up read", () => {	it("returns the observation for a successful read", async () => {
		const read = await readTopUpOffer("https://www.carrefour.com.ar", "7791337007260", {
			http: httpWith(carrefourPayload),
		});
		assert.equal(read.ok, true);
		assert.equal(read.observation?.found, true);
		assert.equal(read.observation?.price, 2870);
	});

	it("reads a stored canonical GTIN-14 offer against the source EAN-13 payload", async () => {
		const urls: string[] = [];
		const read = await readTopUpOffer("https://www.carrefour.com.ar", "07791337007260", {
			http: {
				get: async (url: string) => {
					urls.push(url);
					return { data: JSON.stringify(carrefourPayload), status: 200, headers: { "content-type": "application/json" } };
				},
			},
		});
		assert.equal(urls[0]?.endsWith("fq=alternateIds_Ean:7791337007260"), true);
		assert.equal(read.observation?.found, true);
		assert.equal(read.observation?.price, 2870);
	});

	it("returns ok:false for a failed read so the offer stays untouched", async () => {
		const read = await readTopUpOffer("https://www.carrefour.com.ar", "7791337007260", {
			http: {
				get: async () => {
					throw new Error("upstream blocked");
				},
			},
		});
		assert.deepEqual(read, { ok: false, observation: null, payload: null });
	});
});

describe("offer top-up observation", () => {
	it("reads a fresh offer with the observed price for a found EAN", () => {
		const observation = topUpObservationFor(carrefourPayload, "7791337007260", "https://www.carrefour.com.ar");
		assert.deepEqual(observation, {
			found: true,
			price: 2870,
			listPrice: 3590,
			isAvailable: true,
			productUrl: "https://www.carrefour.com.ar/leche-chocotalada-cindor-200-ml-719376/p",
		});
	});

	it("records an absent EAN as unavailable with no price", () => {
		const observation = topUpObservationFor([], "7791337007260", "https://www.carrefour.com.ar");
		assert.deepEqual(observation, { found: false, price: null, listPrice: null, isAvailable: false, productUrl: null });
	});

	it("records an out-of-stock product as unavailable without inventing a price", () => {
		const observation = topUpObservationFor(carrefourOutOfStock, "7791337007260", "https://www.carrefour.com.ar");
		assert.deepEqual(observation, { found: true, price: null, listPrice: null, isAvailable: false, productUrl: null });
	});
});
