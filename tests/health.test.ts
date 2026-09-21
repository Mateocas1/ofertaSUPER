import assert from "node:assert/strict";
import test from "node:test";

import { catalogHealthStatusCode, createCatalogHealthChecker, createReadinessChecker } from "../src/lib/health";
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

test("catalog health derives its claim only from the U15 guarded decision", async () => {
	const now = new Date("2026-08-25T12:00:00.000Z");
	const decision = (verifiedAt: string) => ({
		publicationId: "publication-1", promotionId: "promotion-1", target: "production" as const,
		deploymentId: "deployment-1", commitSha: "a".repeat(40), candidateDigest: `sha256:${"b".repeat(64)}`,
		verifiedAt, expiresAt: "2026-08-25T13:00:00.000Z", generation: "1", lineage: `sha256:${"c".repeat(64)}`,
		policyDigest: `sha256:${"d".repeat(64)}`, healthVersion: "2", buildDigest: `sha256:${"e".repeat(64)}`,
		readerExpiresAt: "2026-08-25T13:00:00.000Z", decisionDeadline: "2026-08-25T12:00:30.000Z",
	});
	const guarded = (verifiedAt: string) => async () => ({ available: true as const, decision: decision(verifiedAt), value: undefined });

	assert.deepEqual(await createCatalogHealthChecker(guarded("2026-08-25T11:00:00.000Z") as never, { now: () => now })(), {
		status: "current", publication: "current",
	});
	assert.deepEqual(await createCatalogHealthChecker(guarded("2026-08-24T12:00:00.000Z") as never, { now: () => now })(), {
		status: "degraded", publication: "unproven",
	});
	assert.deepEqual(await createCatalogHealthChecker((async () => ({ available: false as const })) as never, { now: () => now })(), {
		status: "unavailable", publication: "unproven",
	});
	assert.deepEqual(await createCatalogHealthChecker((async () => { throw new Error("guard unavailable"); }) as never, { now: () => now })(), {
		status: "unavailable", publication: "unproven",
	});
});

test("catalog health returns 503 for unavailable guarded authority and preserves eligible degraded status", () => {
	assert.equal(catalogHealthStatusCode({ status: "current", publication: "current" }), 200);
	assert.equal(catalogHealthStatusCode({ status: "degraded", publication: "unproven" }), 503);
	assert.equal(catalogHealthStatusCode({ status: "unavailable", publication: "unproven" }), 503);
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
