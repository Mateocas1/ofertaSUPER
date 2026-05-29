import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildOpsFreshnessReport } from "../scripts/pipeline/ops-checks";

describe("ops freshness checks", () => {
	it("flags stuck running runs and old pending staging rows", async () => {
		const report = await buildOpsFreshnessReport({
			now: new Date("2026-05-29T12:00:00.000Z"),
			repository: {
				findRunningRuns: async () => [
					{ id: 7, sourceSlug: "carrefour", startedAt: "2026-05-29T10:00:00.000Z" },
				],
				countOldPendingStagingRows: async () => 3,
			},
			redisProbe: async () => ({ status: "degraded", reason: "missing_redis_client", latencyMs: null }),
		});

		assert.equal(report.status, "WARN");
		assert.equal(report.checks.stuckRunningRuns.status, "WARN");
		assert.equal(report.checks.oldPendingStagingRows.count, 3);
		assert.equal(report.checks.redis.status, "degraded");
	});

	it("passes when operational checks are clean", async () => {
		const report = await buildOpsFreshnessReport({
			repository: {
				findRunningRuns: async () => [],
				countOldPendingStagingRows: async () => 0,
			},
			redisProbe: async () => ({ status: "pass", reason: null, latencyMs: 1 }),
		});

		assert.equal(report.status, "PASS");
	});
});
