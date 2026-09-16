import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createJumboActiveWriteTransaction } from "../../scripts/direct-refresh-jumbo-write";

const capture = {
	operationKey: "source-capture/v1:sha256:jumbo",
	source: "jumbo" as const,
	observedAt: "2026-06-01T00:00:00.000Z",
	items: [{ entity: "offer" as const, key: "1", before: { price: 100 }, after: { price: 110 } }],
};

describe("Jumbo capture adapter", () => {
	it("requires one durable capture result and rejects partial capture facts", async () => {
		const tx = createJumboActiveWriteTransaction({
			$queryRaw: async () => [],
		} as never);
		await assert.rejects(() => tx.captureSourceDelta!(capture), /capture result/);
		await assert.rejects(
			() => tx.captureSourceDelta!({ ...capture, items: [] }),
			/source capture items are required/,
		);
	});
});
