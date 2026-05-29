import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { probeRedisWithClient } from "../src/lib/redis";

describe("Redis ops probe", () => {
	it("reports missing Redis client as degraded without throwing", async () => {
		assert.deepEqual(await probeRedisWithClient(null), {
			status: "degraded",
			reason: "missing_redis_client",
			latencyMs: null,
		});
	});

	it("reports ping success and failure without exposing secrets", async () => {
		const ok = await probeRedisWithClient({ ping: async () => "PONG" });
		assert.equal(ok.status, "pass");
		assert.equal(ok.reason, null);
		assert.equal(typeof ok.latencyMs, "number");

		const failed = await probeRedisWithClient({ ping: async () => { throw new Error("secret token bad"); } });
		assert.equal(failed.status, "degraded");
		assert.equal(failed.reason, "redis_ping_failed");
	});
});
