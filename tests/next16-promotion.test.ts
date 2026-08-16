import assert from "node:assert/strict";
import test from "node:test";

import {
	createPromotionHandoff,
	evaluatePromotion,
	requiredPromotionGates,
	type PromotionGateReceipt,
} from "../src/lib/production-readiness/next16-promotion";

const snapshotId = "sha256:snapshot";
const releaseId = "sha256:release";
const now = new Date("2026-08-15T12:00:00.000Z");
const hash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function receipt(gate: string, overrides: Partial<PromotionGateReceipt> = {}): PromotionGateReceipt {
	return { gate, status: "passed", snapshotId, releaseId, observedAt: now.toISOString(), evidenceHash: hash, ...overrides };
}

function completeReceipts() {
	return requiredPromotionGates.map((gate) => receipt(gate));
}

function evaluate(receipts: unknown, intent: "promotion" | "rollback" = "promotion") {
	const persisted: unknown[] = [];
	const result = evaluatePromotion({ snapshotId, releaseId, receipts, intent }, (record) => persisted.push(record), now);
	return { persisted, result };
}

test("promotes only when every current release-bound gate is passed and persists first", () => {
	const { persisted, result } = evaluate(completeReceipts());

	assert.equal(result.state, "promoted");
	assert.deepEqual(result.failedGateIds, []);
	assert.deepEqual(result.missingGateIds, []);
	assert.equal(persisted.length, 1);
	assert.deepEqual(persisted[0], result);
});

test("blocks missing or failed required gates with their identities", () => {
	const missing = evaluate(completeReceipts().filter((value) => value.gate !== "authorized-access")).result;
	const failed = evaluate(completeReceipts().map((value) => value.gate === "build" ? { ...value, status: "failed" } : value)).result;

	assert.deepEqual(missing, { ...missing, state: "blocked", missingGateIds: ["authorized-access"] });
	assert.deepEqual(failed, { ...failed, state: "blocked", failedGateIds: ["build"] });
});

test("blocks stale, mixed snapshot/release, and duplicate gate receipts", () => {
	for (const receipts of [
		completeReceipts().map((value) => value.gate === "build" ? { ...value, observedAt: new Date(0).toISOString() } : value),
		completeReceipts().map((value) => value.gate === "build" ? { ...value, releaseId: "sha256:other" } : value),
		[...completeReceipts(), receipt("build")],
	]) {
		const result = evaluate(receipts).result;
		assert.equal(result.state, "blocked");
		assert.ok(result.failedGateIds.includes("build"));
	}
});

test("persists a blocked state before rejecting unknown, malformed, or secret-bearing receipts", () => {
	for (const receipts of [
		[...completeReceipts(), receipt("unknown-gate")],
		completeReceipts().map((value) => value.gate === "build" ? { gate: "build" } : value),
		completeReceipts().map((value) => value.gate === "build" ? { ...value, evidenceHash: ["sk", "test", "secret"].join("_") } : value),
	]) {
		const persisted: unknown[] = [];
		assert.throws(
			() => evaluatePromotion({ snapshotId, releaseId, receipts, intent: "promotion" }, (record) => persisted.push(record), now),
			/promotion gates rejected/,
		);
		assert.equal((persisted[0] as { state: string }).state, "blocked");
	}
});

test("records rollback without a traffic selector and names incomplete gates", () => {
	const { persisted, result } = evaluate([], "rollback");

	assert.equal(result.state, "rolled_back");
	assert.deepEqual(result.missingGateIds, [...requiredPromotionGates]);
	assert.deepEqual(persisted, [result]);
	assert.deepEqual(createPromotionHandoff(result).promotion, {
		state: "rolled_back",
		failedGateIds: [],
		missingGateIds: [...requiredPromotionGates],
		recordHash: result.recordHash,
	});
});

test("creates incomplete and successful handoffs that always leave task 1.3 pending", () => {
	const blocked = evaluate([]).result;
	const promoted = evaluate(completeReceipts()).result;

	assert.deepEqual(createPromotionHandoff(blocked), {
		productionReadiness: { task: "1.3", state: "pending" },
		promotion: { state: "blocked", failedGateIds: [], missingGateIds: [...requiredPromotionGates], recordHash: blocked.recordHash },
	});
	assert.deepEqual(createPromotionHandoff(promoted).productionReadiness, { task: "1.3", state: "pending" });
});
