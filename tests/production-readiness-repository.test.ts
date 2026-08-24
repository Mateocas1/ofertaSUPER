import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
	createProductionReadinessRepository,
	ProductionReadinessInputError,
} from "../src/lib/production-readiness/repository";

const candidate = `sha256:${"a".repeat(64)}`;
const expiresAt = new Date("2030-01-01T00:00:00.000Z");

test("records only pending production-readiness state and rejects malformed boundaries", async () => {
	const calls: Array<{ model: string; data: Record<string, unknown> }> = [];
	const repository = createProductionReadinessRepository({
		productionReadinessPromotion: { create: async ({ data }) => (calls.push({ model: "promotion", data }), data) },
		productionReadinessReceipt: { create: async ({ data }) => (calls.push({ model: "receipt", data }), data) },
		productionReadinessPublication: { create: async ({ data }) => (calls.push({ model: "publication", data }), data) },
	});
	await repository.createPendingPromotion({ candidateDigest: candidate, deploymentId: "deploy-1", commitSha: "b".repeat(40), owner: "release-owner", rollbackAuthority: "incident-commander", expiresAt });
	await repository.recordPendingReceipt({ promotionId: "promotion-1", kind: "PROVENANCE", payloadDigest: candidate, signer: "release-owner", scope: "production", expiresAt });
	await repository.recordPendingPublication({ promotionId: "promotion-1", target: "production" });
	assert.deepEqual(calls.map(({ model, data }) => [model, data.state ?? null]), [["promotion", "PENDING"], ["receipt", "PENDING"], ["publication", "PENDING"]]);
	await assert.rejects(() => repository.createPendingPromotion({ candidateDigest: "bad", deploymentId: "deploy-1", commitSha: "b".repeat(40), owner: "release-owner", rollbackAuthority: "incident-commander", expiresAt }), ProductionReadinessInputError);
});

test("schema, migration, and disposable smoke preserve unverified pending records", () => {
	const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
	const migration = readFileSync(new URL("../prisma/migrations/20260823_production_readiness_state/migration.sql", import.meta.url), "utf8");
	const smoke = readFileSync(new URL("../scripts/production-repository-smoke.ts", import.meta.url), "utf8");
	assert.match(schema, /model ProductionReadinessPromotion/);
	assert.match(schema, /model ProductionReadinessReceipt/);
	assert.match(schema, /model ProductionReadinessPublication/);
	assert.match(migration, /DEFAULT 'PENDING'/);
	assert.doesNotMatch(migration, /INSERT INTO|UPDATE .*verified/i);
	assert.match(smoke, /ROLLBACK/);
	assert.match(smoke, /docker/);
});
