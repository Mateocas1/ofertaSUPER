import assert from "node:assert/strict";
import test from "node:test";

import { formatRuntimeContractErrors, validateRuntimeContract } from "../src/lib/runtime-contract";

const postgres = "postgresql://app:private@db.internal:5432/ofertas";

test("reports only missing names for the selected role", () => {
	const result = validateRuntimeContract("job", {});

	assert.deepEqual(result, {
		role: "job",
		missing: ["DATABASE_URL", "VTEX_SHA256_HASH"],
		invalid: [],
	});
});

test("does not leak configured values in errors", () => {
	const secret = "do-not-print-this";
	const result = validateRuntimeContract("web", {
		DATABASE_URL: secret,
		ADMIN_ENABLED: "true",
	});
	const message = formatRuntimeContractErrors(result);

	assert.deepEqual(result.missing, ["CLERK_SECRET_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"]);
	assert.deepEqual(result.invalid, ["DATABASE_URL"]);
	assert.doesNotMatch(message, new RegExp(secret));
});

test("accepts web operation without optional SaaS dependencies", () => {
	assert.deepEqual(validateRuntimeContract("web", { DATABASE_URL: postgres }), {
		role: "web",
		missing: [],
		invalid: [],
	});
});

test("requires both Upstash settings only when the optional integration is selected", () => {
	const result = validateRuntimeContract("web", {
		DATABASE_URL: postgres,
		UPSTASH_REDIS_REST_URL: "https://redis.example",
	});

	assert.deepEqual(result.missing, ["UPSTASH_REDIS_REST_TOKEN"]);
});

test("accepts conventional Postgres URLs for runtime and migration roles", () => {
	assert.equal(validateRuntimeContract("job", {
		DATABASE_URL: postgres,
		VTEX_SHA256_HASH: "hash",
	}).invalid.length, 0);
	assert.deepEqual(validateRuntimeContract("migration", { DIRECT_URL: postgres }), {
		role: "migration",
		missing: [],
		invalid: [],
	});
});

test("accepts conventional Redis and rejects conflicting provider configuration by name only", () => {
	assert.equal(validateRuntimeContract("web", { DATABASE_URL: postgres, REDIS_URL: "redis://private" }).missing.length, 0);
	const result = validateRuntimeContract("web", {
		DATABASE_URL: postgres,
		REDIS_URL: "redis://private",
		UPSTASH_REDIS_REST_URL: "https://private",
		UPSTASH_REDIS_REST_TOKEN: "private-token",
	});
	assert.deepEqual(result.missing, ["configure_only_one_redis_provider"]);
	assert.doesNotMatch(formatRuntimeContractErrors(result), /private/);
});
