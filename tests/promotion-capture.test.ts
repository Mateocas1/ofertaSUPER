import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	extractSimplePromotionFromPayload,
	fetchSimplePromotionByEan,
	type VtexPromoHttpClient,
} from "../src/lib/promotions/capture";

// Gate 6: promotion capture for Carrefour. The capture reads the public REST
// catalog search by EAN and only keeps promotions the strict parser
// recognizes; a failing read surfaces as a rejection the caller counts, and
// the price is stored regardless. The fixture is a real slice of the
// Carrefour response: teasers live under items[].sellers[].commertialOffer,
// and the first teaser in the list is a card promotion that must be skipped.

const carrefourPayload = [
	{
		productId: "719376",
		productName: "Leche chocolatada ​Cindor 200 ml",
		items: [
			{
				ean: "7791337007260",
				sellers: [
					{
						sellerId: "1",
						commertialOffer: {
							PromotionTeasers: [
								{
									Name: "Tarjeta Carrefour 15%",
									GeneralValues: {},
									Conditions: { MinimumQuantity: 0, Parameters: [{ Name: "RestrictionsBins", Value: "507858,858110,858111,585274,538156,520225,539958,527061,898989" }] },
									Effects: { Parameters: [{ Name: "PercentualDiscount", Value: "15" }] },
								},
								{
									Name: "PROMO-2do al 70% Max 24 unidades Iguales-Reg-2-70-Gigante23 al 1.10",
									GeneralValues: {},
									Conditions: { MinimumQuantity: 2, Parameters: [] },
									Effects: { Parameters: [] },
								},
							],
						},
					},
				],
			},
		],
	},
	{
		productId: "676413",
		productName: "Leche La Serenísima Sachet 1 L",
		items: [
			{
				ean: "7798133500605",
				sellers: [
					{
						sellerId: "1",
						commertialOffer: { PromotionTeasers: [{ Name: "Tarjeta Carrefour 15%" }] },
					},
				],
			},
		],
	},
];

function httpWith(body: string, status = 200): VtexPromoHttpClient {
	return { get: async () => ({ data: body, status, headers: { "content-type": "application/json" } }) };
}

describe("promotion capture", () => {
	it("extracts the first recognized promotion from the matching item's commercial offer", () => {
		const promo = extractSimplePromotionFromPayload(carrefourPayload, "7791337007260");
		assert.deepEqual(promo, {
			type: "nth-unit",
			nth: 2,
			percent: 70,
			maxUnits: 24,
			label: "2do al 70%",
		});
	});

	it("skips products whose teasers are all excluded", () => {
		assert.equal(extractSimplePromotionFromPayload(carrefourPayload, "7798133500605"), null);
	});

	it("returns null for payloads with no matching item or no teasers", () => {
		assert.equal(extractSimplePromotionFromPayload(carrefourPayload, "0000000000000"), null);
		assert.equal(extractSimplePromotionFromPayload([], null), null);
		assert.equal(extractSimplePromotionFromPayload(null, null), null);
	});

	it("fetches by EAN from the public REST search", async () => {
		const promo = await fetchSimplePromotionByEan("https://www.carrefour.com.ar", "7791337007260", {
			http: httpWith(JSON.stringify(carrefourPayload)),
		});
		assert.equal(promo?.type, "nth-unit");
		assert.equal(promo?.percent, 70);
	});

	it("queries the source with its published EAN-13 form when given the canonical GTIN-14", async () => {
		const urls: string[] = [];
		const promo = await fetchSimplePromotionByEan("https://www.carrefour.com.ar", "07791337007260", {
			http: {
				get: async (url: string) => {
					urls.push(url);
					return { data: JSON.stringify(carrefourPayload), status: 200, headers: { "content-type": "application/json" } };
				},
			},
		});
		assert.deepEqual(urls, ["https://www.carrefour.com.ar/api/catalog_system/pub/products/search?fq=alternateIds_Ean:7791337007260"]);
		assert.equal(promo?.label, "2do al 70%");
	});

	it("falls back to the UPC-12 form when the source has no EAN-13 match", async () => {
		const urls: string[] = [];
		const upcPayload = [{ ...carrefourPayload[0], items: [{ ...carrefourPayload[0].items[0], ean: "036000291452" }] }];
		const promo = await fetchSimplePromotionByEan("https://www.carrefour.com.ar", "00036000291452", {
			http: {
				get: async (url: string) => {
					urls.push(url);
					const body = url.endsWith(":036000291452") ? upcPayload : [];
					return { data: JSON.stringify(body), status: 200, headers: { "content-type": "application/json" } };
				},
			},
		});
		assert.deepEqual(urls.map((url) => url.split(":").at(-1)), ["0036000291452", "036000291452"]);
		assert.equal(promo?.label, "2do al 70%");
	});

	it("matches payload items by canonical GTIN whatever form either side uses", () => {
		assert.equal(extractSimplePromotionFromPayload(carrefourPayload, "07791337007260")?.label, "2do al 70%");
	});

	it("lets read failures reach the caller so the run can count them", async () => {
		await assert.rejects(
			fetchSimplePromotionByEan("https://www.carrefour.com.ar", "7791337007260", {
				http: {
					get: async () => {
						throw new Error("upstream blocked");
					},
				},
			}),
			/upstream blocked/,
		);
	});
});
