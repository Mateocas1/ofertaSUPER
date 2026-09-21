import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMasActiveWriteTransaction } from "../../scripts/direct-refresh-mas-write";

const capture = {
	operationKey: "source-capture/v1:sha256:mas",
	source: "mas" as const,
	observedAt: "2026-06-01T00:00:00.000Z",
	items: [{ entity: "history" as const, key: "101", before: { price: 100 }, after: { price: 110 } }],
};

describe("Más capture adapter", () => {
	it("returns durable capture facts without assuming a report response", async () => {
		const tx = createMasActiveWriteTransaction({
			$queryRaw: async () => [{ operationId: "mas-operation", observedAt: new Date("2026-06-01T00:00:02.000Z") }],
		} as never);
		assert.deepEqual(await tx.captureSourceDelta!(capture), {
			operationId: "mas-operation",
			observedAt: "2026-06-01T00:00:02.000Z",
		});
		await assert.rejects(
			() => tx.captureSourceDelta!({ ...capture, source: "disco" }),
			/source policy/,
		);
	});
});
