import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
	createSourceCapture,
	sourceCaptureOperationKey,
} from "../../src/lib/production-readiness/operations";

describe("controlled source capture", () => {
	it("binds typed actual BEFORE/AFTER facts to one deterministic source operation", () => {
		const operationKey = sourceCaptureOperationKey({
			source: "vea",
			rowIds: ["offer-2", "offer-1"],
			prewriteReportHash: "sha256:prewrite",
		});
		const capture = createSourceCapture({
			operationKey,
			source: "vea",
			observedAt: "2026-06-01T00:01:00.000Z",
			items: [{
				entity: "offer",
				key: "offer-1",
				before: { price: 1000, lastCheckedAt: "2026-05-01T00:00:00.000Z" },
				after: { price: 1100, lastCheckedAt: "2026-06-01T00:01:00.000Z" },
			}],
		});

		assert.match(operationKey, /^source-capture\/v1:sha256:/);
		assert.equal(operationKey, sourceCaptureOperationKey({
			source: "vea", rowIds: ["offer-1", "offer-2"], prewriteReportHash: "sha256:prewrite",
		}));
		assert.deepEqual(capture.items[0], {
			entity: "offer", key: "offer-1",
			before: { lastCheckedAt: "2026-05-01T00:00:00.000Z", price: 1000 },
			after: { lastCheckedAt: "2026-06-01T00:01:00.000Z", price: 1100 },
		});
	});

	it("persists source and item bytes for exact idempotent recovery", async () => {
		const migration = await readFile(new URL("../../prisma/migrations/20260829_controlled_source_capture/migration.sql", import.meta.url), "utf8");
		assert.match(migration, /"items" JSONB NOT NULL/);
		assert.match(migration, /captured_source IS DISTINCT FROM p_source OR captured_items IS DISTINCT FROM p_items/);
		assert.match(migration, /source capture idempotency conflict/);
	});

	it("rejects report timestamps, unknown commits, and uncaptured mutations", () => {
		assert.throws(() => createSourceCapture({
			operationKey: "source-capture/v1:sha256:known", source: "vea",
			observedAt: "2026-06-01T00:00:00.000Z", reportedAt: "2026-06-01T00:00:00.000Z", items: [],
		}), /report timestamps/);
		assert.throws(() => createSourceCapture({
			operationKey: "source-capture/v1:sha256:known", source: "vea",
			observedAt: "", items: [],
		}), /durable observation/);
		assert.throws(() => createSourceCapture({
			operationKey: "source-capture/v1:sha256:known", source: "vea",
			observedAt: "2026-06-01T00:00:00.000Z", items: [{ entity: "offer", key: "offer-1", before: { price: 1000 }, after: { price: 1000 } }],
		}), /uncaptured mutation/);
	});
});
