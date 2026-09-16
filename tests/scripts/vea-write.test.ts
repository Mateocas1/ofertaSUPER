import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAdapterSourceCaptureItems } from "../../scripts/pipeline/direct-refresh-active-write";

describe("Vea capture adapter", () => {
	it("emits verifier-compatible typed capture identities", () => {
		assert.deepEqual(createAdapterSourceCaptureItems({
			source: "vea",
			before: { rowId: "1", productKey: "12345678", product: { ean: "12345678", name: "before" }, offer: { productEan: "12345678", supermarketId: 2, price: 100 }, history: { id: 101, price: 100 } },
			after: { rowId: "1", product: { ean: "12345678", name: "after" }, offer: { productEan: "12345678", supermarketId: 2, price: 110 }, history: { id: 102, price: 110 } },
			changes: { product: ["name"], offer: ["price"], historyId: 102 },
		}).map(({ entity, key }) => ({ entity, key })), [
			{ entity: "product", key: '{"ean":"12345678"}' },
			{ entity: "offer", key: '{"product_ean":"12345678","supermarket_id":"2"}' },
			{ entity: "history", key: '{"id":"102"}' },
		]);
	});

	it("rejects partial returned identities and preserves source-only verifier input", () => {
		assert.throws(
			() => createAdapterSourceCaptureItems({
				source: "vea",
				before: { rowId: "1", product: { name: "before" }, offer: { price: 100 } },
				after: { rowId: "2", product: { name: "after" }, offer: { price: 110 }, history: { id: 101, price: 110 } },
				changes: { product: ["name"], offer: ["price"], historyId: 101 },
			}),
			/returned identity/,
		);
	});
});
