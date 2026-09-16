import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createDiscoActiveWriteTransaction } from "../../scripts/direct-refresh-disco-write";

const capture = {
	operationKey: "source-capture/v1:sha256:disco",
	source: "disco" as const,
	observedAt: "2026-06-01T00:00:00.000Z",
	items: [{ entity: "offer" as const, key: "1", before: { price: 100 }, after: { price: 110 } }],
};

describe("Disco capture adapter", () => {
	it("captures the exact source-only facts and rejects another source policy", async () => {
		let capturedSource = "";
		const tx = createDiscoActiveWriteTransaction({
			$queryRaw: async (_strings: TemplateStringsArray, ...values: unknown[]) => {
				capturedSource = String(values[1]);
				return [{ operationId: "disco-operation", observedAt: new Date("2026-06-01T00:00:01.000Z") }];
			},
		} as never);
		assert.deepEqual(await tx.captureSourceDelta!(capture), {
			operationId: "disco-operation",
			observedAt: "2026-06-01T00:00:01.000Z",
		});
		assert.equal(capturedSource, "disco");
		await assert.rejects(
			() => tx.captureSourceDelta!({ ...capture, source: "mas" }),
			/source policy/,
		);
	});
});
