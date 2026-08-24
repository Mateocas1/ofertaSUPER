import assert from "node:assert/strict";
import test from "node:test";

import { createCatalogHealthChecker, createReadinessChecker } from "../src/lib/health";
import { GET as liveness } from "../src/app/api/health/live/route";

const valid = { DATABASE_URL: "postgresql://private:secret@db.internal/app" };

test("liveness is dependency-independent and non-sensitive", async () => {
	const response = liveness();
	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), { status: "live" });
});

test("readiness requires valid configuration and a successful database query", async () => {
	let calls = 0;
	const ready = createReadinessChecker(async () => { calls += 1; });
	assert.equal((await ready(valid)).status, "ready");
	assert.equal(calls, 1);

	const invalid = await ready({ DATABASE_URL: "not-postgres", CLERK_SECRET_KEY: "private" });
	assert.deepEqual(invalid, {
		status: "not_ready",
		components: { configuration: "error", database: "error", redis: "optional" },
	});
	assert.equal(calls, 1, "invalid configuration must not query the database");
	assert.doesNotMatch(JSON.stringify(invalid), /DATABASE_URL|private|not-postgres/);
});

test("database failures are generic and Redis never gates readiness", async () => {
	const ready = createReadinessChecker(async () => { throw new Error("postgres private failure"); });
	const result = await ready({ ...valid, REDIS_URL: "redis://unreachable-private" });
	assert.deepEqual(result, {
		status: "not_ready",
		components: { configuration: "ok", database: "error", redis: "optional" },
	});
	assert.doesNotMatch(JSON.stringify(result), /private|unreachable|failure/);
	const available = createReadinessChecker(async () => undefined);
	assert.equal((await available({ ...valid, UPSTASH_REDIS_REST_URL: "https://incomplete-private" })).status, "ready");
});

test("catalog health is current only for a fresh promoted publication", async () => {
	const now = new Date("2026-08-25T12:00:00.000Z");
	const current = createCatalogHealthChecker(async () => ({ verified_at: new Date("2026-08-25T11:00:00.000Z") }), { now: () => now });
	assert.deepEqual(await current(), { status: "current", publication: "current" });

	for (const loadPublication of [
		async () => ({ verified_at: new Date("2026-08-24T12:00:00.000Z") }),
		async () => null,
		async () => { throw new Error("database unavailable"); },
	]) {
		assert.deepEqual(await createCatalogHealthChecker(loadPublication, { now: () => now })(), {
			status: "degraded", publication: "unproven",
		});
	}
});

test("database checks use single-flight and short outcome-specific caches", async () => {
	let now = 0;
	let calls = 0;
	let release!: () => void;
	const gate = new Promise<void>((resolve) => { release = resolve; });
	const ready = createReadinessChecker(async () => { calls += 1; await gate; }, {
		now: () => now,
		successTtlMs: 50,
		failureTtlMs: 10,
	});
	const first = ready(valid);
	const second = ready(valid);
	assert.equal(calls, 1);
	release();
	await Promise.all([first, second]);
	await ready(valid);
	assert.equal(calls, 1);
	now = 51;
	await ready(valid);
	assert.equal(calls, 2);

	let failures = 0;
	const failing = createReadinessChecker(async () => { failures += 1; throw new Error("no"); }, {
		now: () => now,
		failureTtlMs: 10,
	});
	await failing(valid);
	await failing(valid);
	assert.equal(failures, 1);
	now += 11;
	await failing(valid);
	assert.equal(failures, 2);
});
