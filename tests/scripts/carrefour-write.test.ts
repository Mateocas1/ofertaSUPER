import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAdapterSourceCaptureItems } from "../../scripts/pipeline/direct-refresh-active-write";

describe("Carrefour capture adapter", () => {
	it("rejects a missing returned history identity and an overbroad field mask", () => {
		assert.throws(
			() => createAdapterSourceCaptureItems({
				source: "carrefour",
				before: { rowId: "1", product: { name: "before" }, offer: { price: 100 } },
				after: { rowId: "1", product: { name: "after" }, offer: { price: 110 }, history: null },
				changes: { product: ["name", "category"], offer: ["price"], historyId: 101 },
			}),
			/missing returned history identity|field mask/,
		);
	});
});
