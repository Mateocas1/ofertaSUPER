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
// the price is stored regardless.

const carrefourPayload = JSON.stringify([
	{
		productId: "719377",
		productName: "Leche chocolatada Cindor 1 lt",
		items: [],
		PromotionTeasers: [{ Name: "PROMO-2do al 50% Max 8 unidades Combinable LUCCHETTI-Reg-2-50-Gigante23 al 1.10" }],
	},
]);

function httpWith(body: string, status = 200): VtexPromoHttpClient {
	return { get: async () => ({ data: body, status, headers: { "content-type": "application/json" } }) };
}

describe("promotion capture", () => {
	it("extracts the first recognized promotion from a product payload", () => {
		const promo = extractSimplePromotionFromPayload(JSON.parse(carrefourPayload));
		assert.deepEqual(promo, {
			type: "nth-unit",
			nth: 2,
			percent: 50,
			maxUnits: 8,
			label: "2do al 50%",
		});
	});

	it("returns null for payloads with excluded or missing teasers", () => {
		assert.equal(
			extractSimplePromotionFromPayload([{ PromotionTeasers: [{ Name: "Tarjeta Carrefour 15%" }] }]),
			null,
			"card promotions stay out",
		);
		assert.equal(extractSimplePromotionFromPayload([{ PromotionTeasers: [] }]), null);
		assert.equal(extractSimplePromotionFromPayload([]), null);
		assert.equal(extractSimplePromotionFromPayload(null), null);
	});

	it("fetches by EAN from the public REST search", async () => {
		const promo = await fetchSimplePromotionByEan("https://www.carrefour.com.ar", "7791337007253", {
			http: httpWith(carrefourPayload),
		});
		assert.equal(promo?.type, "nth-unit");
		assert.equal(promo?.percent, 50);
	});

	it("lets read failures reach the caller so the run can count them", async () => {
		await assert.rejects(
			fetchSimplePromotionByEan("https://www.carrefour.com.ar", "7791337007253", {
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
