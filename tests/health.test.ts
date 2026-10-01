import assert from "node:assert/strict";
import test from "node:test";

import { catalogHealthStatusCode, createReadinessChecker, createSnapshotCatalogHealthChecker } from "../src/lib/health";
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

test("catalog health returns 503 unless the snapshot is current", () => {
	assert.equal(catalogHealthStatusCode({ status: "current", publication: "not_applicable" }), 200);
	assert.equal(catalogHealthStatusCode({ status: "degraded", publication: "not_applicable" }), 503);
	assert.equal(catalogHealthStatusCode({ status: "unavailable", publication: "not_applicable" }), 503);
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

const snapshotEnv = { VERCEL: "1" };
const snapshotNow = () => new Date("2026-09-29T09:00:00.000Z");
const probe = (generatedAt: string) => () => ({ generatedAt });

test("snapshot mode is ready from a valid fresh snapshot without touching the database", async () => {
	let calls = 0;
	const ready = createReadinessChecker(async () => { calls += 1; throw new Error("tenant not found"); }, {
		snapshotProbe: probe("2026-09-28T10:09:44.217Z"), clock: snapshotNow,
	});
	// DATABASE_URL absent or pointing at a dead database is irrelevant in snapshot mode.
	for (const env of [snapshotEnv, { ...snapshotEnv, DATABASE_URL: "postgresql://dead/db" }]) {
		assert.deepEqual(await ready(env), {
			status: "ready",
			components: { configuration: "ok", database: "not_required", redis: "optional" },
			snapshot: { status: "ok", generatedAt: "2026-09-28T10:09:44.217Z", ageHours: 22.8 },
		});
	}
	assert.equal(calls, 0);
});

test("snapshot mode is not ready when the snapshot is stale, unreadable or from the future", async () => {
	const stale = createReadinessChecker(async () => undefined, { snapshotProbe: probe("2026-09-27T08:00:00.000Z"), clock: snapshotNow });
	const staleResult = await stale(snapshotEnv);
	assert.equal(staleResult.status, "not_ready");
	assert.equal(staleResult.snapshot?.status, "stale");
	const broken = createReadinessChecker(async () => undefined, {
		snapshotProbe: () => { throw new Error("corrupt /private/path"); }, clock: snapshotNow,
	});
	const brokenResult = await broken(snapshotEnv);
	assert.deepEqual(brokenResult.snapshot, { status: "error" });
	assert.equal(brokenResult.status, "not_ready");
	assert.doesNotMatch(JSON.stringify(brokenResult), /private|corrupt/);
	const future = createReadinessChecker(async () => undefined, { snapshotProbe: probe("2026-10-01T00:00:00.000Z"), clock: snapshotNow });
	assert.equal((await future(snapshotEnv)).status, "not_ready");
});

test("enabling admin on Vercel keeps the database check", async () => {
	const ready = createReadinessChecker(async () => { throw new Error("down"); }, { snapshotProbe: probe("2026-09-29T08:00:00.000Z"), clock: snapshotNow });
	const result = await ready({ ...snapshotEnv, ADMIN_ENABLED: "true", DATABASE_URL: "postgresql://x/y", CLERK_SECRET_KEY: "k", NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "p" });
	assert.equal(result.status, "not_ready");
	assert.equal(result.components.database, "error");
});

test("snapshot catalog health proves freshness from the snapshot and never claims a DB publication", () => {
	const check = (generatedAt: string | Error) => createSnapshotCatalogHealthChecker(
		() => { if (generatedAt instanceof Error) throw generatedAt; return { generatedAt }; }, { now: snapshotNow },
	)();
	assert.deepEqual(check("2026-09-28T10:09:44.217Z"), {
		status: "current", publication: "not_applicable", source: "snapshot", generatedAt: "2026-09-28T10:09:44.217Z",
	});
	assert.deepEqual(check("2026-09-27T08:00:00.000Z"), {
		status: "degraded", publication: "not_applicable", source: "snapshot", generatedAt: "2026-09-27T08:00:00.000Z",
	});
	assert.deepEqual(check(new Error("corrupt")), { status: "unavailable", publication: "not_applicable", source: "snapshot" });
});
