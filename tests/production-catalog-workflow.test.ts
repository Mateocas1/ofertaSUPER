import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { signGateReceipt, type GateInput, type GateReceipt } from "../src/lib/production-readiness/policy";
import { FIXED_CATALOG_ARGS, runBoundedCatalogAction, runProductionCatalog } from "../src/lib/production-readiness/runner";
import { canWriteProductionCatalog } from "../src/lib/production-readiness/writer-guard";

const limitedAuthority = (): GateInput => {
	const commitSha = "a".repeat(40), candidateHash = `sha256:${"b".repeat(64)}`, deploymentId = "fixture-only";
	const make = (kind: GateReceipt["kind"], stage: GateReceipt["stage"] = "shadow", extra: Partial<GateReceipt> = {}) => {
		const value = { kind, stage, source: "disco", commitSha, deploymentId, hash: candidateHash, signedBy: "operator", issuedAt: "2026-08-25T11:00:00.000Z", expiresAt: "2026-08-25T13:00:00.000Z", result: "success" as const, ...extra };
		return { ...value, signature: signGateReceipt(value) } as GateReceipt;
	};
	return { event: { action: "limited-writes", source: "disco", sources: ["disco"], result: "success" }, promotion: { stage: "shadow", commitSha, candidateHash, deploymentId }, receipts: ["security", "alert", "restore", "candidate"].map((kind) => make(kind as GateReceipt["kind"])).concat([make("shadow", "shadow", { cycle: 1, real: true }), make("shadow", "shadow", { cycle: 2, real: true }), make("rollback", "limited-writes"), make("go", "limited-writes")]), expiryPolicy: { approvedBy: "operator", durationsMs: { security: 7_200_000, alert: 7_200_000, restore: 7_200_000, candidate: 7_200_000, shadow: 7_200_000, rollback: 7_200_000, reconcile: 7_200_000, go: 7_200_000, "final-go": 7_200_000, cycle: 7_200_000 } }, killSwitch: false, now: "2026-08-25T12:00:00.000Z", commitSha, supportWindow: { user: "operator", startsAt: "2026-08-25T10:00:00.000Z", endsAt: "2026-08-25T14:00:00.000Z", available: true } };
};

test("production catalog fixes its fixture argv, stays dry-run, and redacts environment values", () => {
	assert.deepEqual(FIXED_CATALOG_ARGS, ["--stage", "shadow", "--source", "fixture", "--dry-run"]);
	const result = runProductionCatalog({ argv: FIXED_CATALOG_ARGS, environment: { CI: "true", SECRET_CANARY: "SECRET_CANARY_SHOULD_NOT_LEAK", PRODUCTION_CATALOG_AUTHORITY: "forged" } });
	assert.deepEqual({ allowed: result.allowed, stage: result.stage, writes: result.writes, schedule: result.schedule }, { allowed: false, stage: "idle", writes: false, schedule: false });
	assert.equal(result.receipt.environment.includes("CI"), true);
	assert.equal(result.receipt.environment.includes("SECRET_CANARY"), false);
	assert.doesNotMatch(JSON.stringify(result), /SECRET_CANARY_SHOULD_NOT_LEAK|forged/);
	assert.deepEqual(runProductionCatalog({ argv: FIXED_CATALOG_ARGS, environment: {} }).receipt, runProductionCatalog({ argv: FIXED_CATALOG_ARGS, environment: {} }).receipt);
	for (const value of [["--stage", "shadow", "--source", "other", "--dry-run"], ["--stage", "shadow", "--source", "fixture", "--dry-run", "$(touch never-runs)"]]) assert.throws(() => runProductionCatalog({ argv: value }), /fixed/);
	assert.equal(runProductionCatalog({ argv: FIXED_CATALOG_ARGS, environment: {}, authority: {} as never }).allowed, false);
});

test("workflow is manual and defaults to fixed shadow dry-run arguments", () => {
	const workflow = readFileSync(new URL("../.github/workflows/production-catalog.yml", import.meta.url), "utf8");
	assert.match(workflow, /workflow_dispatch/);
	assert.doesNotMatch(workflow, /schedule:|cron:/);
	assert.match(workflow, /npm run production-catalog -- --stage shadow --source fixture --dry-run/);
});

test("writer guard requires validated limited-write authority and explicit non-dry-run constraints", () => {
	const authority = limitedAuthority();
	assert.equal(canWriteProductionCatalog({ authority, stage: "limited-writes", dryRun: false, source: "disco" }), true);
	for (const value of [
		{ authority: undefined, stage: "limited-writes", dryRun: false, source: "disco" },
		{ authority, stage: "shadow", dryRun: false, source: "disco" },
		{ authority: { ...authority, killSwitch: true }, stage: "limited-writes", dryRun: false, source: "disco" },
		{ authority, stage: "limited-writes", dryRun: true, source: "disco" },
		{ authority, stage: "limited-writes", dryRun: false, source: "fixture" },
	]) assert.equal(canWriteProductionCatalog(value), false);
});

test("bounded action hashes deterministic redacted receipts and rolls back exactly once without retry", async () => {
	let actions = 0;
	let rollbacks = 0;
	const run = await runBoundedCatalogAction({ now: "2026-08-25T12:00:00.000Z", execute: async () => { actions += 1; throw new Error("SECRET_CANARY_SHOULD_NOT_LEAK"); }, rollback: async () => { rollbacks += 1; } });
	assert.deepEqual({ actions, rollbacks, status: run.status }, { actions: 1, rollbacks: 1, status: "rolled-back" });
	assert.match(run.receipt.hash, /^sha256:[a-f0-9]{64}$/);
	assert.doesNotMatch(JSON.stringify(run), /SECRET_CANARY_SHOULD_NOT_LEAK/);
});
